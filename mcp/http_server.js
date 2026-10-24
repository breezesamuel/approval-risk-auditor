/**
 * MCP server over HTTP（streamable HTTP transport）
 *
 * 为什么要有 HTTP 版：stdio 版只能本地跑；公开的 MCP 端点才能被
 * Claude Desktop / Cursor / OpenCode / 各类 agent 网关直接连上 → 才有分发。
 *
 * 端点: POST /mcp   (JSON-RPC 2.0, MCP streamable HTTP)
 *       GET  /healthz
 *
 * 限流：按 IP 的简单滑动窗口（默认 30 次/10 分钟），防止被刷。
 * 计费：带 X-PAYMENT 头的请求走 x402 校验（可选，见 README）。
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { audit } from "../src/auditor.js";

const PORT = Number(process.env.PORT || 8792);
const HOST = process.env.HOST || "127.0.0.1";
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 30);
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 10 * 60 * 1000);

// ---------------- 限流 ----------------
const hits = new Map(); // ip -> [ts]
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();          // 简单防内存膨胀
  return arr.length > RATE_LIMIT;
}

// ---------------- MCP server ----------------
function buildMcpServer() {
  const server = new Server(
    { name: "approval-risk-auditor", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "audit_approvals",
        description:
          "审计 EVM 钱包的代币授权风险：找出 unlimited（额度≥95% 2^256-1）与 stale（超过阈值的旧授权）授权，"
          + "并返回可直接签名发送的 approve(spender,0) 撤销 calldata。只读链上数据，不碰私钥、不动资金。",
        inputSchema: {
          type: "object",
          properties: {
            wallet: { type: "string", description: "要审计的钱包地址（0x…）", pattern: "^0x[a-fA-F0-9]{40}$" },
            stale_after_days: { type: "integer", description: "超过多少天未再使用的授权算 stale（默认 90）", default: 90 },
            top_tokens: { type: "integer", description: "扫描前 N 个主流 ERC-20（默认 12）", default: 12 },
          },
          required: ["wallet"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const a = req.params.arguments || {};
    try {
      const result = await audit({
        wallet: a.wallet,
        stale_after_days: a.stale_after_days,
        top_tokens: a.top_tokens,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `audit failed: ${e?.message || e}` }] };
    }
  });
  return server;
}

// ---------------- HTTP ----------------
const sessions = new Map(); // sessionId -> transport

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, service: "approval-risk-auditor-mcp", sessions: sessions.size }));
  }

  if (url.pathname === "/mcp" && req.method === "POST") {
    if (rateLimited(ip)) {
      res.writeHead(429, { "content-type": "application/json" });
      return res.end(JSON.stringify({
        error: "rate_limited",
        message: `每 ${RATE_WINDOW_MS / 60000} 分钟最多 ${RATE_LIMIT} 次；需要更多请用付费 x402 端点`,
      }));
    }
    const sessionId = req.headers["mcp-session-id"];
    let transport = sessionId ? sessions.get(sessionId) : null;
    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => sessions.set(id, transport),
      });
      transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
      const mcp = buildMcpServer();
      await mcp.connect(transport);
    }
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found", paths: ["/mcp", "/healthz"] }));
});

server.listen(PORT, HOST, () => {
  console.error(`[mcp] approval-risk-auditor MCP (streamable HTTP) on http://${HOST}:${PORT}/mcp`);
});
