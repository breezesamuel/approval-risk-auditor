/** 直接从链上取该钱包的 Approval 原始日志，逐条打印，核对解析是否正确。 */
const URL = "https://ethereum-rpc.publicnode.com";
const TOPIC0 = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const OWNER = process.argv[2] || "0x9008d19f58aabd9ed0d60971565aa8510560ab41";
const ownerTopic = "0x" + OWNER.replace(/^0x/, "").toLowerCase().padStart(64, "0");

async function rpc(method, params) {
  const r = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return r.json();
}

const h = parseInt((await rpc("eth_blockNumber", [])).result, 16);
const j = await rpc("eth_getLogs", [{
  address: [
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  ],
  topics: [TOPIC0, ownerTopic],
  fromBlock: "0x" + (h - 599).toString(16), toBlock: "0x" + h.toString(16),
}]);

if (j.error) { console.log("ERR", JSON.stringify(j.error).slice(0, 200)); process.exit(1); }
console.log(`head=${h}  logs=${j.result.length}\n`);
const TARGET = "0xff9b7e1deb8345ef35f95c334490e0a1ad7f70c9";
let hit = 0;
for (const l of j.result) {
  const spender = "0x" + l.topics[2].slice(-40);
  const v = BigInt(l.data);
  const isTarget = spender === TARGET;
  if (isTarget) hit++;
  if (j.result.length <= 40 || isTarget) {
    console.log(`${l.address.slice(0, 10)}… blk=${parseInt(l.blockNumber, 16)} spender=${spender.slice(0, 12)}… value=${v} ${v > 2n**200n ? "<<UNLIMITED>>" : ""}`);
  }
}
console.log(`\n目标 spender ${TARGET} 命中 ${hit} 次`);
const nonZero = j.result.filter(l => BigInt(l.data) > 0n).length;
console.log(`非零授权 ${nonZero} / ${j.result.length}`);
