/**
 * Approval Risk Auditor —— 核心审计逻辑（Node ESM，无构建步骤）
 *
 * 与站内 agent_auditor 同一套判定口径:
 *   unlimited : allowance >= 95% of 2^256-1
 *   stale     : 上次 Approval 事件距今 > stale_after_days（默认 90）
 *   revoke    : 输出 approve(spender,0) 的 calldata（selector 0x095ea7b3）
 *
 * 数据来源:
 *   1) eth_getLogs  抓 Approval 事件（topic0=0x8c5be1e5…, topic1=owner）
 *   2) Multicall3(0xcA11bde0…) 批量读 allowance(owner, spender) —— 覆盖 Permit2/Router 等大户
 *   3) eth_getBlockByNumber 取时间戳（stale 判定所需）
 */
import { createHash } from "node:crypto";
import { encodeFunctionData, decodeFunctionResult, getAddress } from "viem";

/** Multicall3 的 aggregate3 ABI（直接用 viem 编码/解码，避免手写 ABI 出错） */
const AGGREGATE3_ABI = [{
  name: "aggregate3", type: "function", stateMutability: "view",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target", type: "address" },
    { name: "allowFailure", type: "bool" },
    { name: "callData", type: "bytes" },
  ] }],
  outputs: [{ name: "returnData", type: "tuple[]", components: [
    { name: "success", type: "bool" },
    { name: "returnData", type: "bytes" },
  ] }],
}] ;

const MAX_UINT256 = 2n ** 256n;
const UNLIMITED_PCT = 95n;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
/**
 * Approval(address,address,uint256) 的事件 topic0。
 * ⚠️ 这个常量必须与链上完全一致，否则 eth_getLogs 静默返回 0 条（不报错，最难查）。
 *    值来源：实盘 eth_getLogs 拉 USDC 全量日志后取出的真实 topic0（见 test/diag_topic.mjs）。
 */
const APPROVAL_TOPIC0 = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
export { APPROVAL_TOPIC0 };
const APPROVE_SELECTOR = "0x095ea7b3";

export const DEFAULT_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://1rpc.io/eth",
  "https://cloudflare-eth.com",
];

// 主流 ERC20（Uniswap 规范列表）
export const TOP_TOKENS = [
  { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { symbol: "CRV", address: "0xD533a949740bb3306d119CC777fa900bA034cd52", decimals: 18 },
  { symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
  { symbol: "MKR", address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", decimals: 18 },
  { symbol: "COMP", address: "0xc00e94Cb662C3520282E6f5717214004A7f26888", decimals: 18 },
  { symbol: "ZRX", address: "0xE41d2489571d322189246DaFA5ebDe1F4699F498", decimals: 18 },
  { symbol: "AAVE", address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", decimals: 18 },
  { symbol: "LDO", address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", decimals: 18 },
];

// 常见被授权的大户 spender（链上验证过：eth_getCode 有 code）
export const KNOWN_SPENDERS = [
  { name: "Uniswap V3 SwapRouter02", address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" },
  { name: "Uniswap V2 Router", address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" },
  { name: "Uniswap Universal Router v1.02", address: "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B" },
  { name: "Uniswap Universal Router v2", address: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af" },
  { name: "Permit2 (Uniswap)", address: "0x000000000022D473030F116dDEE9F6B43aC78BA3" },
  { name: "1inch V6 Aggregation Router", address: "0x111111125421cA6dc452d289314280a0f8842A65" },
  { name: "0x Exchange Proxy", address: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF" },
  { name: "ParaSwap Augustus v6", address: "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57" },
  { name: "CoW Protocol GPv2 Settlement", address: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41" },
  { name: "Aave V3 Pool", address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" },
  { name: "Lido stETH", address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" },
];

const lower = (s) => String(s).toLowerCase();
const pad = (a) => "0x" + lower(a).replace(/^0x/, "").padStart(64, "0");

function hexToBig(h) {
  const s = String(h || "0x0").replace(/^0x/, "");
  if (!s) return 0n;
  return BigInt("0x" + s);
}

/**
 * ABI 地址编码：32 字节 = 64 个 hex 字符（左侧补 0）。
 * ⚠️ 必须补到 64，不是 40 —— 补 40 会让 calldata 字段错位，
 *    生成的撤销交易会打错地址（甚至被节点拒绝）。
 */
function encodeAddress(a) {
  return lower(a).replace(/^0x/, "").padStart(64, "0");
}

function encodeUint(v) {
  return BigInt(v).toString(16).padStart(64, "0");
}

/** allowance(owner, spender) 的 calldata */
function allowanceCalldata(owner, spender) {
  return "0xdd62ed3e" + encodeAddress(owner) + encodeAddress(spender);
}

/** approve(spender, 0) 的 calldata —— 撤销用 */
export function approveZeroCalldata(spender) {
  return "0x095ea7b3" + encodeAddress(spender) + encodeUint(0n);
}

export class Rpc {
  constructor(urls = DEFAULT_RPCS, timeoutMs = 20000) {
    this.urls = urls;
    this.timeoutMs = timeoutMs;
    this.i = 0;
  }
  async call(method, params) {
    let lastErr;
    for (let k = 0; k < this.urls.length; k++) {
      const url = this.urls[(this.i + k) % this.urls.length];
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) throw new Error(`http ${res.status}`);
        const j = await res.json();
        if (j.error) throw new Error(`${j.error.code}: ${j.error.message}`);
        this.i = (this.i + k) % this.urls.length;
        return j.result;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("rpc failed");
  }
  async blockNumber() { return parseInt(await this.call("eth_blockNumber", []), 16); }
  async getLogs(address, topics, fromBlock, toBlock) {
    return (await this.call("eth_getLogs", [{
      address, topics, fromBlock: "0x" + fromBlock.toString(16), toBlock: "0x" + toBlock.toString(16),
    }])) ?? [];
  }
  async getBlockTs(n) {
    const b = await this.call("eth_getBlockByNumber", ["0x" + n.toString(16), false]);
    return b?.timestamp ? parseInt(b.timestamp, 16) : null;
  }
  async callContract(to, data) {
    return await this.call("eth_call", [{ to, data }, "latest"]);
  }

  /**
   * JSON-RPC 批量请求：一次 HTTP 往返取多个结果。
   * 审计里最耗时的就是"每个 Approval 事件查一次区块时间戳"（30+ 次往返），
   * 批量后 1 次往返搞定。
   */
  async batch(calls) {
    if (!calls.length) return [];
    let lastErr;
    for (let k = 0; k < this.urls.length; k++) {
      const url = this.urls[(this.i + k) % this.urls.length];
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(calls.map((c, idx) => ({
            jsonrpc: "2.0", id: idx, method: c.method, params: c.params,
          }))),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) throw new Error(`http ${res.status}`);
        const j = await res.json();
        if (!Array.isArray(j)) throw new Error("batch response not array");
        // 按 id 归位
        const byId = new Map(j.map((r) => [r.id, r]));
        return calls.map((c, idx) => {
          const r = byId.get(idx);
          if (!r) return { error: "missing in batch response" };
          if (r.error) return { error: `${r.error.code}: ${r.error.message}` };
          return { result: r.result };
        });
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("batch failed");
  }
}

/**
 * Etherscan 全历史授权拉取（mode=etherscan）。
 *
 * 为什么需要：公共 RPC 的 eth_getLogs 只覆盖最近几百块（≈2 小时），
 * 几个月前授予的"无限授权"根本不在窗口里 → 审计会漏报最该报的那类风险。
 * Etherscan 的 tokenapproval 接口能给出**全历史**授权事件（免费 key 5 calls/s）。
 *
 * 无 key 时返回 null → 调用方回落到 logs 模式。
 */
async function fetchEtherscanApprovals(wallet, etherscanKey) {
  const base = "https://api.etherscan.io/v2/api";
  const url = new URL(base);
  url.searchParams.set("chainid", "1");
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "tokenapproval");
  url.searchParams.set("address", wallet);
  url.searchParams.set("startblock", "0");
  url.searchParams.set("endblock", "99999999");
  url.searchParams.set("sort", "desc");
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", "1000");
  url.searchParams.set("apikey", etherscanKey);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  const res = await fetch(url, { signal: ctrl.signal });
  clearTimeout(t);
  if (!res.ok) throw new Error(`etherscan http ${res.status}`);
  const j = await res.json();
  if (j.status !== "1") throw new Error(`etherscan: ${j.message || j.result}`);
  const rows = Array.isArray(j.result) ? j.result : [];
  return rows.map((r) => ({
    token: String(r.tokenContract || "").toLowerCase(),
    token_symbol: String(r.tokenSymbol || ""),
    owner: String(r.owner || "").toLowerCase(),
    spender: String(r.spender || "").toLowerCase(),
    value: String(r.value ?? "0"),
    raw_value: "0x" + BigInt(r.value ?? "0").toString(16).padStart(64, "0"),
    block: parseInt(r.blockNumber ?? "0", 10),
    tx: String(r.txHash || ""),
  }));
}

function isUnlimited(v) {
  return v >= (MAX_UINT256 * UNLIMITED_PCT) / 100n;
}

/**
 * 链上自检：确认 APPROVAL_TOPIC0 与真实链上一致。
 *
 * 为什么必须有：topic0 写错时 eth_getLogs **不报错**，只是静默返回 0 条 →
 * 审计结果看起来"干净无风险"，实则全漏。（本项目就踩过这个坑。）
 * 做法：拉 USDC 最近若干块的**无过滤**日志，断言 Approval 的 topic0 出现在里面。
 * 结果做模块级缓存，只查一次。
 */
let topicCheckPromise = null;

export async function verifyApprovalTopic(rpc) {
  if (!topicCheckPromise) {
    topicCheckPromise = (async () => {
      const probeToken = TOP_TOKENS.find((t) => t.symbol === "USDC") || TOP_TOKENS[0];
      try {
        const head = await rpc.blockNumber();
        const logs = await rpc.call("eth_getLogs", [{
          address: probeToken.address,
          fromBlock: "0x" + Math.max(head - 20, 0).toString(16),
          toBlock: "0x" + head.toString(16),
        }]);
        const seen = new Set((logs || []).map((l) => String(l.topics?.[0] || "").toLowerCase()));
        if (seen.has(APPROVAL_TOPIC0)) {
          return { ok: true, checked_token: probeToken.symbol, blocks_scanned: 20 };
        }
        return {
          ok: false, checked_token: probeToken.symbol,
          error: `Approval topic0 与链上不一致（链上未见 ${APPROVAL_TOPIC0}）`,
          seen_topics: [...seen].slice(0, 8),
        };
      } catch (e) {
        return { ok: false, error: `自检失败: ${String(e).slice(0, 120)}` };
      }
    })();
  }
  return topicCheckPromise;
}

/**
 * 审计一个钱包。
 * @param {{wallet:string, chains?:number[], mode?:string, stale_after_days?:number,
 *          lookback_blocks?:number, top_tokens?:number, rpc_urls?:string[]}} input
 */
export async function audit(input) {
  const wallet = String(input?.wallet || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) throw new Error("invalid wallet address");
  const staleDays = Number(input?.stale_after_days ?? 90);
  const lookback = Math.min(Number(input?.lookback_blocks ?? 599), 599);
  const tokenLimit = Math.max(1, Math.min(Number(input?.top_tokens ?? 12), TOP_TOKENS.length));
  const rpc = new Rpc(input?.rpc_urls?.length ? input.rpc_urls : DEFAULT_RPCS);
  const notes = [];
  const etherscanKey = input?.etherscan_api_key || process.env.ETHERSCAN_API_KEY || "";
  const wantEtherscan = input?.mode === "etherscan" && !!etherscanKey;

  const head = await rpc.blockNumber();
  const fromBlock = Math.max(head - lookback, 0);
  const ownerTopic = pad(wallet);
  const tokens = TOP_TOKENS.slice(0, tokenLimit);
  const approvals = new Map(); // token:spender -> record
  let modeUsed = "logs";
  let etherscanRows = null;

  // 0) 链上常量自检（topic0 写错会静默漏数据 → 必须先验）
  const topicCheck = await verifyApprovalTopic(rpc);
  if (!topicCheck.ok) {
    notes.push(`⚠️ 链上自检未通过: ${topicCheck.error}`);
  }

  // 0.5) Etherscan 全历史（能看见窗口外的老授权 → stale/unlimited 才判得准）
  if (wantEtherscan) {
    try {
      etherscanRows = await fetchEtherscanApprovals(wallet, etherscanKey);
      modeUsed = "etherscan";
      notes.push(`Etherscan 全历史: ${etherscanRows.length} 条授权事件`);
    } catch (e) {
      notes.push(`Etherscan 拉取失败（${String(e).slice(0, 90)}），回落 logs 模式`);
    }
  } else if (input?.mode === "etherscan") {
    notes.push("mode=etherscan 但缺少 ETHERSCAN_API_KEY → 使用 logs 模式（仅覆盖最近窗口）");
  }

  // 1) Approval 事件 —— 一次请求扫全部 token（address 传数组），时间戳再批量取
  const tokenByAddr = new Map(tokens.map((t) => [lower(t.address), t]));
  let rawLogs = [];
  try {
    // 分块多地址扫描（公共 RPC 对 address 数组长度有限制，12 个会 Internal error）
    const CHUNK = 4;
    const chunks = [];
    for (let i = 0; i < tokens.length; i += CHUNK) {
      chunks.push(tokens.slice(i, i + CHUNK).map((t) => t.address));
    }
    for (const addrs of chunks) {
      try {
        const l = await rpc.call("eth_getLogs", [{
          address: addrs,
          topics: [APPROVAL_TOPIC0, ownerTopic],
          fromBlock: "0x" + fromBlock.toString(16),
          toBlock: "0x" + head.toString(16),
        }]) ?? [];
        rawLogs.push(...l);
      } catch (e2) {
        // 该块退回逐 token
        for (const a of addrs) {
          try {
            const l2 = await rpc.getLogs(a, [APPROVAL_TOPIC0, ownerTopic], fromBlock, head);
            rawLogs.push(...(l2 || []));
          } catch (e3) {
            notes.push(`getLogs ${a.slice(0, 10)} 失败: ${String(e3).slice(0, 60)}`);
          }
        }
      }
    }
  } catch (e) {
    notes.push(`getLogs 失败: ${String(e).slice(0, 100)}`);
  }

  // 批量取区块时间戳（去重后一次往返）
  const blockNums = [...new Set(rawLogs.map((l) => parseInt(l.blockNumber, 16)))];
  const tsByBlock = new Map();
  if (blockNums.length) {
    const res = await rpc.batch(blockNums.map((bn) => ({
      method: "eth_getBlockByNumber", params: ["0x" + bn.toString(16), false],
    })));
    res.forEach((r, i) => {
      const ts = r.result?.timestamp ? parseInt(r.result.timestamp, 16) : null;
      tsByBlock.set(blockNums[i], ts);
    });
  }

  for (const log of rawLogs) {
    const t = tokenByAddr.get(lower(log.address));
    if (!t) continue;
    const raw = "0x" + String(log.data || "0x").replace(/^0x/, "").slice(0, 64).padStart(64, "0");
    const spender = "0x" + String(log.topics?.[2] || "").replace(/^0x/, "").slice(-40);
    const bn = parseInt(log.blockNumber, 16);
    const ts = tsByBlock.get(bn) ?? null;
    const key = `${lower(t.address)}:${spender}`;
    const rec = approvals.get(key);
    if (!rec || (rec.last_approved_block ?? 0) < bn) {
      approvals.set(key, {
        token: lower(t.address), token_symbol: t.symbol, token_decimals: t.decimals,
        owner: lower(wallet), spender,
        raw_value: raw, value: hexToBig(raw).toString(),
        unlimited: isUnlimited(hexToBig(raw)),
        last_approved_at: ts, last_approved_block: bn,
        source: "logs",
      });
    }
  }

  // 1.5) 合并 Etherscan 全历史记录（同一 token:spender 取块高者 → 最新状态）
  if (etherscanRows && etherscanRows.length) {
    const needTs = etherscanRows.map((r) => r.block).filter((b) => b && !tsByBlock.has(b));
    if (needTs.length) {
      try {
        const res = await rpc.batch(needTs.map((bn) => ({
          method: "eth_getBlockByNumber", params: ["0x" + bn.toString(16), false],
        })));
        res.forEach((r, i) => {
          const ts = r.result?.timestamp ? parseInt(r.result.timestamp, 16) : null;
          tsByBlock.set(needTs[i], ts);
        });
      } catch (e) {
        notes.push(`etherscan 记录的时间戳批量查询失败: ${String(e).slice(0, 80)}`);
      }
    }
    const symByToken = new Map(tokens.map((t) => [lower(t.address), t]));
    for (const r of etherscanRows) {
      if (!r.token || !r.spender) continue;
      const v = BigInt(r.value || "0");
      const key = `${r.token}:${r.spender}`;
      const prev = approvals.get(key);
      if (prev && (prev.last_approved_block ?? 0) >= r.block) continue;
      const tk = symByToken.get(r.token);
      approvals.set(key, {
        token: r.token,
        token_symbol: r.token_symbol || tk?.symbol || "?",
        token_decimals: tk?.decimals ?? 18,
        owner: r.owner || lower(wallet),
        spender: r.spender,
        raw_value: r.raw_value,
        value: v.toString(),
        unlimited: isUnlimited(v),
        last_approved_at: tsByBlock.get(r.block) ?? null,
        last_approved_block: r.block,
        source: "etherscan",
        tx: r.tx,
      });
    }
  }

  // 2) Multicall3 批量 allowance（覆盖 Permit2/Router 等）
  try {
    const calls = [];
    const meta = [];
    for (const t of tokens) {
      for (const sp of KNOWN_SPENDERS) {
        calls.push({
          target: t.address,
          allowFailure: true,
          callData: allowanceCalldata(wallet, sp.address),
        });
        meta.push({ t, sp });
      }
    }
    // 用 viem 编码/解码（手写 ABI 编码会 execution reverted —— 已踩过坑）
    const data = encodeFunctionData({
      abi: AGGREGATE3_ABI,
      functionName: "aggregate3",
      args: [calls],
    });
    const res = await rpc.callContract(MULTICALL3, data);
    const decoded = decodeFunctionResult({
      abi: AGGREGATE3_ABI,
      functionName: "aggregate3",
      data: res,
    });
    for (let i = 0; i < meta.length; i++) {
      const { t, sp } = meta[i];
      const item = decoded[i];
      const key = `${lower(t.address)}:${lower(sp.address)}`;
      if (!item || !item.success || item.returnData === undefined || item.returnData === "0x") {
        continue; // 读失败（不是 0），保持原记录
      }
      const v = hexToBig(item.returnData);
      const prev = approvals.get(key);
      if (v === 0n) {
        // 当前额度为 0 → 已撤销：不该再报风险
        if (prev) prev.revoked = true;
        approvals.delete(key);
        continue;
      }
      // 当前链上额度是权威值 → 覆盖历史事件里的额度
      approvals.set(key, {
        token: lower(t.address), token_symbol: t.symbol, token_decimals: t.decimals,
        owner: lower(wallet), spender: lower(sp.address),
        spender_note: `known spender: ${sp.name}`,
        raw_value: "0x" + v.toString(16).padStart(64, "0"), value: v.toString(),
        unlimited: isUnlimited(v),
        last_approved_at: prev?.last_approved_at ?? null,
        last_approved_block: prev?.last_approved_block ?? null,
        source: "allowance",
      });
    }
  } catch (e) {
    notes.push(`Multicall3 allowance 批量查询失败: ${String(e).slice(0, 100)}`);
  }

  // 3) 风险判定 + 撤销 calldata
  const list = [...approvals.values()];
  const riskFlags = [];
  const nowS = Math.floor(Date.now() / 1000);
  list.forEach((a, i) => {
    if (a.unlimited) {
      riskFlags.push({
        approval_index: i, token: a.token, token_symbol: a.token_symbol, spender: a.spender,
        risk: "unlimited", severity: "high",
        detail: "allowance ≥ 95% of 2^256-1，spender 可无限消费该资产",
      });
    } else if (a.last_approved_at) {
      const ageDays = Math.round((nowS - a.last_approved_at) / 86400);
      if (ageDays > staleDays) {
        riskFlags.push({
          approval_index: i, token: a.token, token_symbol: a.token_symbol, spender: a.spender,
          risk: "stale", severity: "medium",
          detail: `上次授权发生在 ${ageDays} 天前（>${staleDays} 天阈值），授权仍生效`,
        });
        return;
      }
    }
    if (!a.unlimited) {
      riskFlags.push({
        approval_index: i, token: a.token, token_symbol: a.token_symbol, spender: a.spender,
        risk: "direct", severity: "info",
        detail: a.last_approved_at ? "额度有效且时间较新" : "额度 >0（无授权时间，未做 stale 判定）",
      });
    }
  });

  const revokeTxData = list
    .filter((a) => a.raw_value !== "0x" + "0".repeat(64))
    .map((a) => ({
      token: a.token, spender: a.spender, to: a.token,
      data: approveZeroCalldata(a.spender),
      human_readable: "approve(spender, 0)",
    }));

  return {
    chain_id: 1,
    wallet: lower(wallet),
    mode: modeUsed,
    scanned: {
      from_block: fromBlock,
      to_block: head,
      tokens: tokenLimit,
      spenders: KNOWN_SPENDERS.length,
      etherscan_events: etherscanRows ? etherscanRows.length : 0,
      coverage_note: modeUsed === "etherscan"
        ? "全历史授权事件（Etherscan）+ 当前链上额度（Multicall3）"
        : "仅最近 " + lookback + " 块的授权事件 + 已知 spender 的当前额度；窗口外的老授权需 mode=etherscan",
    },
    approvals: list,
    risk_flags: riskFlags,
    revoke_tx_data: revokeTxData,
    summary: {
      total_approvals: list.length,
      unlimited_count: riskFlags.filter((f) => f.risk === "unlimited").length,
      stale_count: riskFlags.filter((f) => f.risk === "stale").length,
      high_severity_count: riskFlags.filter((f) => f.severity === "high").length,
    },
    notes,
  };
}
