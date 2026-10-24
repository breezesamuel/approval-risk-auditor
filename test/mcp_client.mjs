/** MCP 端到端测试：initialize → tools/list → tools/call */
const BASE = process.argv[2] || "http://127.0.0.1:8792";
const WALLET = process.argv[3] || "0x9008d19f58aabd9ed0d60971565aa8510560ab41";

let sessionId = null;

async function rpc(method, params, id) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST", headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const text = await res.text();
  // streamable HTTP 可能返回 SSE 格式
  let payload = text;
  if (text.startsWith("event:") || text.includes("data:")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    payload = line ? line.slice(5).trim() : text;
  }
  try { return JSON.parse(payload); } catch { return { raw: text.slice(0, 300) }; }
}

const init = await rpc("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "mcp-smoke", version: "1.0.0" },
}, 1);
console.log("initialize   :", init.result?.serverInfo?.name ?? JSON.stringify(init).slice(0, 160));
console.log("session_id   :", sessionId ?? "(none)");

const notif = await fetch(`${BASE}/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream",
             ...(sessionId ? { "mcp-session-id": sessionId } : {}) },
  body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
});
console.log("initialized  :", notif.status);

const list = await rpc("tools/list", {}, 2);
const tools = list.result?.tools || [];
console.log("tools        :", tools.map((t) => t.name).join(", ") || JSON.stringify(list).slice(0, 200));

const call = await rpc("tools/call", {
  name: "audit_approvals",
  arguments: { wallet: WALLET, top_tokens: 4 },
}, 3);
const textOut = call.result?.content?.[0]?.text ?? "";
if (textOut.startsWith("{")) {
  const r = JSON.parse(textOut);
  console.log("audit summary:", JSON.stringify(r.summary));
  console.log("mode         :", r.mode, "| notes:", JSON.stringify(r.notes));
  console.log("unlimited    :", r.approvals.filter((a) => a.unlimited).map((a) => `${a.token_symbol}->${a.spender}`).join(", ") || "(none)");
  console.log("revoke sample:", r.revoke_tx_data[0]?.data ?? "(none)");
} else {
  console.log("call raw     :", textOut.slice(0, 220) || JSON.stringify(call).slice(0, 220));
}
