/**
 * 本地自测：不依赖 Apify 平台，直接跑核心审计逻辑。
 *   node test/local.js
 */
import { audit } from "../src/auditor.js";

const wallet = process.argv[2] || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const t0 = Date.now();
const r = await audit({ wallet, top_tokens: 6 });
console.log(`wallet=${r.wallet} 用时 ${Date.now() - t0}ms`);
console.log("summary:", JSON.stringify(r.summary));
console.log("approvals:");
for (const a of r.approvals) {
  console.log(`  - ${a.token_symbol} → ${a.spender}  unlimited=${a.unlimited}  src=${a.source}`);
}
console.log("risk flags:");
for (const f of r.risk_flags) {
  console.log(`  ! [${f.severity}] ${f.risk}: ${f.detail}`);
}
console.log("revoke calldata:");
for (const t of r.revoke_tx_data) {
  console.log(`  → ${t.token} spender=${t.spender}`);
  console.log(`    ${t.data}`);
}
if (r.notes.length) console.log("notes:", r.notes);
