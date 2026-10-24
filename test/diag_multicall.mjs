/** 定位 Multicall3 批量失败原因：对每个 RPC 分别发同一条 eth_call，打印各自错误。 */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const OWNER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SPENDER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

const enc = (a) => a.replace(/^0x/, "").toLowerCase().padStart(40, "0");
const uint = (v) => BigInt(v).toString(16).padStart(64, "0");
const allowanceCd = (o, s) => "0xdd62ed3e" + enc(o) + enc(s);

const calls = [USDC, DAI].map((t) => ({
  target: t, allowFailure: true, callData: allowanceCd(OWNER, SPENDER),
}));
// 正确的 aggregate3 编码: 数组偏移 + 每元组内 bytes 偏移
const data = "0x82ad56cb" + uint(0x20) + uint(calls.length) + calls.map((c) => {
  const cd = c.callData.replace(/^0x/, "");
  const len = cd.length / 2;
  return enc(c.target) + uint(c.allowFailure ? 1 : 0) + uint(0x60) + uint(len) +
    cd.padEnd(Math.ceil(len / 32) * 64, "0");
}).join("");

console.log("calldata len:", data.length);
console.log("calldata head:", data.slice(0, 140));

const RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth-mainnet.public.blastapi.io",
  "https://rpc.ankr.com/eth",
];

for (const url of RPCS) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: MULTICALL3, data }, "latest"] }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const j = await res.json();
    console.log(`\n${url}\n  -> ${JSON.stringify(j).slice(0, 400)}`);
    if (j.result) {
      const raw = j.result.slice(2);
      console.log("  返回长度:", raw.length, "→ 期望:", 64 + 2 * (64 + 64 + 64));
      console.log("  第一个 success:", parseInt(raw.slice(64, 128), 16));
      console.log("  第一个 retLen:", parseInt(raw.slice(128, 192), 16));
      console.log("  第一个 value:", BigInt("0x" + raw.slice(192, 192 + 64)).toString());
    }
  } catch (e) {
    console.log(`\n${url}\n  -> ERR ${String(e).slice(0, 140)}`);
  }
}
