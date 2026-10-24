/**
 * 链上校验所有硬编码地址：
 *   1. 用 viem getAddress(lower) 重算 EIP-55 checksum（我手写的 checksum 可能就是错的）
 *   2. eth_getCode 确认链上是真合约（不是空地址/EOA）
 *   3. 输出修正后的常量，直接贴回源码
 */
import { getAddress } from "viem";
import { Rpc, KNOWN_SPENDERS, TOP_TOKENS } from "../src/auditor.js";

const rpc = new Rpc();
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const items = [
  { label: "Multicall3", addr: MULTICALL3 },
  ...KNOWN_SPENDERS.map((s) => ({ label: `spender:${s.name}`, addr: s.address })),
  ...TOP_TOKENS.map((t) => ({ label: `token:${t.symbol}`, addr: t.address })),
];

console.log("label                          | 给定 checksum | 正确 checksum(viem) | 链上有 code | 结论");
console.log("-".repeat(120));

for (const it of items) {
  const lower = it.addr.toLowerCase();
  let correct;
  try {
    correct = getAddress(lower);
  } catch (e) {
    console.log(`${it.label.padEnd(30)} | ${it.addr} | 计算失败: ${String(e).slice(0, 40)}`);
    continue;
  }
  const checksumOk = correct === it.addr;
  let hasCode = false;
  try {
    const code = await rpc.call("eth_getCode", [it.addr, "latest"]);
    hasCode = !!code && code !== "0x" && code !== "0x0";
  } catch (e) {
    hasCode = false;
  }
  const verdict = !checksumOk ? "❌ checksum 错" : (hasCode ? "✅" : "⚠️ 链上无 code");
  console.log(
    `${it.label.padEnd(30)} | ${it.addr.slice(0, 12)}… | ${correct.slice(0, 12)}… | ${String(hasCode).padEnd(11)} | ${verdict}`
  );
  if (!checksumOk) {
    console.log(`    修正为: "${correct}",`);
  }
}
