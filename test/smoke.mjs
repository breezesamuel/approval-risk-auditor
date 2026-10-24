/** Actor 冒烟测试：跑一次真实审计，打印关键指标（用于回归对比）。 */
import { audit } from "../src/auditor.js";

const wallet = process.argv[2] || "0x9008d19f58aabd9ed0d60971565aa8510560ab41";
const t0 = Date.now();
const r = await audit({ wallet });
const ms = Date.now() - t0;

console.log("wallet        :", r.wallet);
console.log("elapsed_ms    :", ms);
console.log("mode          :", r.mode);
console.log("summary       :", JSON.stringify(r.summary));
console.log("scanned       :", JSON.stringify(r.scanned));
console.log("notes         :", JSON.stringify(r.notes));
console.log("unlimited     :", JSON.stringify(
  r.approvals.filter((a) => a.unlimited).map((a) => `${a.token_symbol}->${a.spender}`)));
console.log("stale         :", JSON.stringify(
  r.risk_flags.filter((f) => f.risk === "stale").map((f) => `${f.token_symbol}->${f.spender}`)));
console.log("revoke_count  :", r.revoke_tx_data.length);
console.log("sample_revoke :", r.revoke_tx_data[0]?.data ?? "(none)");
const bad = r.revoke_tx_data.filter((t) => !/^0x095ea7b3[0-9a-f]{128}$/.test(t.data));
console.log("revoke_fmt_ok :", bad.length === 0 ? "yes" : `NO (${bad.length} bad)`);
console.log("notes_empty   :", r.notes.length === 0 ? "yes" : "no -> " + JSON.stringify(r.notes));
