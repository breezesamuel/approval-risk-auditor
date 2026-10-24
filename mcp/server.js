#!/usr/bin/env node
/**
 * Approval Risk Auditor —— MCP Server
 *
 * 暴露一个工具给 LLM:
 *   audit_approvals(wallet, {stale_after_days?, lookback_blocks?, top_tokens?})
 *     → { summary, approvals, risk_flags, revoke_tx_data }
 *
 * 与 Apify Actor 共用同一套审计逻辑（../src/auditor.js）—— 口径完全一致。
 * 走 stdio transport（Claude Desktop / Claude Code / 任何 MCP client 都能直接挂）。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { audit } from "../src/auditor.js";

const server = new Server(
  { name: "approval-risk-auditor", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "audit_approvals",
      description:
        "审计一个 EVM 钱包的代币授权风险：找出 unlimited（额度≥95% 2^256-1）与 stale（超过阈值的旧授权）授权，"
        + "并返回可直接签名发送的 approve(spender,0) 撤销 calldata。只读链上数据，不碰私钥、不动资金。",
      inputSchema: {
        type: "object",
        properties: {
          wallet: {
            type: "string",
            description: "要审计的钱包地址（0x…）",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          stale_after_days: {
            type: "integer",
            description: "超过多少天未再使用的授权算 stale（默认 90）",
            default: 90,
          },
          lookback_blocks: {
            type: "integer",
            description: "扫描 Approval 事件的区块回溯窗口（默认 599）",
            default: 599,
          },
          top_tokens: {
            type: "integer",
            description: "扫描前 N 个主流 ERC-20（默认 12）",
            default: 12,
          },
        },
        required: ["wallet"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  if (name !== "audit_approvals") {
    return { isError: true, content: [{ type: "text", text: `unknown tool: ${name}` }] };
  }
  const a = req.params.arguments || {};
  try {
    const result = await audit({
      wallet: a.wallet,
      stale_after_days: a.stale_after_days,
      lookback_blocks: a.lookback_blocks,
      top_tokens: a.top_tokens,
    });
    const text = JSON.stringify(result, null, 2);
    return { content: [{ type: "text", text }] };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: "text", text: `audit failed: ${e?.message || e}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("approval-risk-auditor MCP server ready (stdio)");
