/** 打印链上真实的 Approval topic0，与本地常量比对。 */
const URL = "https://ethereum-rpc.publicnode.com";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const MINE = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0324c0c7950dd87cf6b444eea79573";

const hj = await (await fetch(URL, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) })).json();
const h = parseInt(hj.result, 16);
const j = await (await fetch(URL, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{
    address: USDC, fromBlock: "0x" + (h - 30).toString(16), toBlock: "0x" + h.toString(16) }] }) })).json();

const topics = new Map();
for (const l of j.result) topics.set(l.topics[0], (topics.get(l.topics[0]) || 0) + 1);
console.log("链上 topic0:");
for (const [t, n] of topics) console.log(`  ${t}  x${n}`);
console.log("\n本地常量:", MINE);
const real = [...topics.keys()].find(t => t.startsWith("0x8c5be1e5eb"));
console.log("链上实际:", real);
console.log("是否相同:", real === MINE);
if (real && real !== MINE) {
  for (let i = 0; i < Math.max(real.length, MINE.length); i++) {
    if (real[i] !== MINE[i]) console.log(`  首个差异位 ${i}: 链上='${real[i]}' 本地='${MINE[i]}'`);
  }
}
