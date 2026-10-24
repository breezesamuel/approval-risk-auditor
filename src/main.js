/**
 * Apify Actor 入口 —— Approval Risk Auditor
 *
 * 输入: { wallet, chains?, mode?, stale_after_days?, lookback_blocks?, top_tokens? }
 * 输出: 审计结果（approvals / risk_flags / revoke_tx_data / summary）
 * 计费: Pay per event —— 每次成功产出一份审计结果算 1 个事件（PPE $0.40/次）
 */
import { Actor, log } from "apify";
import { audit } from "./auditor.js";

const actor = new Actor();

await actor.init();

const input = (await actor.getInput()) || {};
const wallet = String(input.wallet || "").trim();

if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
  await actor.fail(`invalid wallet address: ${wallet || "(empty)"}`);
}

log.info(`auditing ${wallet} …`);
const started = Date.now();

try {
  const result = await audit({
    wallet,
    chains: input.chains,
    mode: input.mode,
    stale_after_days: input.stale_after_days,
    lookback_blocks: input.lookback_blocks,
    top_tokens: input.top_tokens,
    rpc_urls: input.rpc_urls,
  });

  // 每次成功审计 = 1 个计费事件（Pay per event 模型）
  await actor.call("charge", { event: "audit_completed" });

  await actor.setOutput(result);
  await actor.setState({
    lastWallet: wallet,
    lastAt: new Date().toISOString(),
    lastSummary: result.summary,
    durationMs: Date.now() - started,
  });
  log.info(`done in ${Date.now() - started}ms`, result.summary);
} catch (e) {
  log.error(`audit failed: ${e?.message || e}`);
  await actor.fail(`audit failed: ${e?.message || e}`);
}
