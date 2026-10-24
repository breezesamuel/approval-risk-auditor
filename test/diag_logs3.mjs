/** 验证: 带正确 topic0 的 eth_getLogs 能否命中（对比无过滤的原始日志）。 */
const URL = "https://ethereum-rpc.publicnode.com";
const TOPIC0 = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

async function rpc(method, params) {
  const r = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { parse_error: t.slice(0, 80) }; }
}

const h = parseInt((await rpc("eth_blockNumber", [])).result, 16);
console.log("head:", h);

async function t(label, params) {
  const j = await rpc("eth_getLogs", [params]);
  console.log(`${label} -> ${j.error ? "ERR " + JSON.stringify(j.error).slice(0, 130) : "logs=" + j.result.length}`);
  return j;
}

await t("USDC 无过滤 span30", { address: USDC, fromBlock: "0x" + (h - 30).toString(16), toBlock: "0x" + h.toString(16) });
await t("USDC topic0 单元素 span30", { address: USDC, topics: [TOPIC0], fromBlock: "0x" + (h - 30).toString(16), toBlock: "0x" + h.toString(16) });
await t("USDC topic0+null+null span30", { address: USDC, topics: [TOPIC0, null, null], fromBlock: "0x" + (h - 30).toString(16), toBlock: "0x" + h.toString(16) });
await t("USDC topic0 单元素 span2000", { address: USDC, topics: [TOPIC0], fromBlock: "0x" + (h - 2000).toString(16), toBlock: "0x" + h.toString(16) });
await t("DAI topic0 单元素 span2000", { address: DAI, topics: [TOPIC0], fromBlock: "0x" + (h - 2000).toString(16), toBlock: "0x" + h.toString(16) });
await t("USDC blockHash 形式", { address: USDC, topics: [TOPIC0], blockHash: (await rpc("eth_getBlockByNumber", ["0x" + h.toString(16), false])).result.hash });
