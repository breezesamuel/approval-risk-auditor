/** 对比同一 (token, spender) 在 logs 与 allowance 两条路径上的取值，定位判定分歧。 */
import { audit } from "../src/auditor.js";

const wallet = process.argv[2] || "0x9008d19f58aabd9ed0d60971565aa8510560ab41";
const r = await audit({ wallet });

console.log("summary:", JSON.stringify(r.summary));
console.log("notes:", JSON.stringify(r.notes));
console.log("\n全部授权（含 raw 值前 20 位十六进制）:");
for (const a of r.approvals) {
  const MAX = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  const head = a.raw_value.replace(/^0x/, "").slice(0, 16);
  console.log(
    `  ${a.token_symbol.padEnd(5)} ${a.spender}  src=${String(a.source).padEnd(9)}` +
    ` raw=${head}…  unlimited=${a.unlimited}  block=${a.last_approved_block ?? "-"} ts=${a.last_approved_at ?? "-"}`
  );
}
console.log("\nrisk flags:");
for (const f of r.risk_flags) {
  console.log(`  [${f.severity}] ${f.risk} ${f.token_symbol} → ${f.spender}`);
}
