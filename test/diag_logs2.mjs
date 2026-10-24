/** 诊断2: 不带 topic 过滤，直接拉 USDC 全部日志。 */
const URL = "https://ethereum-rpc.publicnode.com";
const URL2 = "https://eth.llamarpc.com";
const URL3 = "https://rpc.flashbots.net";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

async function rpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return r.json();
}

for (const u of [URL, URL2, URL3]) {
  const hj = await rpc(u, "eth_blockNumber", []);
  if (!hj.result) { console.log(u, "head ERR", JSON.stringify(hj.error).slice(0, 120)); continue; }
  const h = parseInt(hj.result, 16);
  const j = await rpc(u, "eth_getLogs", [{
    address: USDC, fromBlock: "0x" + (h - 30).toString(16), toBlock: "0x" + h.toString(16),
  }]);
  console.log(`${u}\n  head=${h} -> ${j.error ? "ERR " + JSON.stringify(j.error).slice(0, 160) : "logs=" + j.result.length}`);
  if (j.result && j.result.length) {
    const topicsSeen = new Set(j.result.map(l => l.topics[0]));
    console.log("  topic0 集合:", [...topicsSeen].map(t => t.slice(0, 12)).join(", "));
  }
}
