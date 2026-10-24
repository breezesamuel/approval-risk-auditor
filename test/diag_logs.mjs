/** 诊断 eth_getLogs 为什么返回空。 */
const URL = "https://ethereum-rpc.publicnode.com";
const TOPIC0 = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0324c0c7950dd87cf6b444eea79573";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

async function head() {
  const r = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) });
  const j = await r.json();
  return parseInt(j.result, 16);
}

async function logs(params) {
  const r = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [params] }) });
  const j = await r.json();
  return j;
}

const h = await head();
console.log("head:", h);

for (const span of [50, 200, 1000, 5000]) {
  const j = await logs({
    address: USDC, topics: [TOPIC0],
    fromBlock: "0x" + (h - span).toString(16), toBlock: "0x" + h.toString(16),
  });
  console.log(`USDC span=${span} ->`, j.error ? `ERR ${JSON.stringify(j.error)}` : `logs=${j.result.length}`);
}
for (const span of [200, 2000]) {
  const j = await logs({
    address: DAI, topics: [TOPIC0, null, null],
    fromBlock: "0x" + (h - span).toString(16), toBlock: "0x" + h.toString(16),
  });
  console.log(`DAI topics[null,null] span=${span} ->`, j.error ? `ERR ${JSON.stringify(j.error)}` : `logs=${j.result.length}`);
}
