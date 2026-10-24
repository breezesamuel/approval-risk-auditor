/** 从链上找一个"确实有巨额授权"的钱包，作为审计器的验收样本。 */
import { Rpc, TOP_TOKENS, APPROVAL_TOPIC0 } from "../src/auditor.js";
const rpc = new Rpc();
const head = await rpc.blockNumber();
console.log("head block:", head);

const found = [];
for (const t of TOP_TOKENS.slice(0, 6)) {
  for (const span of [200, 2000]) {
    try {
      const logs = await rpc.getLogs(t.address, [APPROVAL_TOPIC0, null, null],
        Math.max(head - span, 0), head);
      for (const log of logs) {
        const raw = "0x" + String(log.data || "0x").replace(/^0x/, "").slice(0, 64).padStart(64, "0");
        const v = BigInt(raw);
        const owner = "0x" + String(log.topics?.[1] || "").replace(/^0x/, "").slice(-40);
        const spender = "0x" + String(log.topics?.[2] || "").replace(/^0x/, "").slice(-40);
        if (v > 0n) {
          found.push({ token: t.symbol, owner, spender, value: v.toString(), span });
          break;
        }
      }
      if (found.length) break;
    } catch (e) {
      console.log(`  ${t.symbol} span=${span} 失败: ${String(e).slice(0, 70)}`);
    }
  }
  if (found.length >= 3) break;
}

console.log("\n找到的授权样本:");
for (const f of found.slice(0, 6)) console.log(" ", JSON.stringify(f));
if (found.length) {
  console.log("\n建议测试钱包:", found[0].owner);
  console.log("建议测试命令: node test/local.js " + found[0].owner);
}
