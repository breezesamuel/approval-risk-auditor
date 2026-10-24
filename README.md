# Approval Risk Auditor

> Audit any EVM wallet for **unlimited** and **stale** token approvals — and get
> **ready-to-sign revoke calldata** back. Chain data only: no keys, no funds touched.

Paste a wallet address, get a risk report and the exact `approve(spender, 0)` calldata
to close the exposure. Useful for:

- **Security teams** auditing treasury wallets before a token migration
- **Devs/DAOs** checking multisig signer exposure to routers and Permit2
- **Individuals** who granted unlimited approvals years ago and forgot about them

## What it finds

| Risk | Detection | Severity |
|---|---|---|
| `unlimited` | `allowance(owner, spender) ≥ 95% of 2²⁵⁶-1` (the "max uint256" grants) | high |
| `stale` | last `Approval` event older than `stale_after_days` (default 90) | medium |
| `direct` | any other non-zero allowance | info |

Detection is identical to how Etherscan and Revoke.cash classify approvals, so the output
is directly comparable with what reviewers already expect.

## How it reads the chain

1. **`eth_getLogs`** over a canonical top-ERC-20 list, filtered on
   `Approval(address,address,uint256)` (topic0 `0x8c5be1e5…`, topic1 = owner);
   block timestamps come from `eth_getBlockByNumber` — that is what makes the *stale* rule possible.
2. **Multicall3** (`0xcA11bde0…`) batch-reads `allowance(owner, spender)` for a curated
   list of well-known spenders (Uniswap V2/V3 routers, Universal Router v1.02/v2, **Permit2**,
   1inch V6, 0x, ParaSwap, CoW GPv2, Aave V3, Lido stETH) — this is where the classic
   "unlimited Permit2/router grant" surfaces, even when the original event is older than the log window.
3. All spender addresses in the built-in list were verified on-chain with `eth_getCode`
   (they must be real contracts) and their checksums are computed with EIP-55 — no hand-typed addresses.

No API key is required: it runs on public Ethereum RPCs with automatic failover.

## Example output

```json
{
  "summary": { "total_approvals": 2, "unlimited_count": 1, "stale_count": 0, "high_severity_count": 1 },
  "approvals": [
    { "token_symbol": "DAI", "spender": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      "raw_value": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      "unlimited": true, "source": "allowance" }
  ],
  "risk_flags": [
    { "risk": "unlimited", "severity": "high",
      "detail": "allowance ≥ 95% of 2^256-1，spender 可无限消费该资产" }
  ],
  "revoke_tx_data": [
    { "token": "0x6b175474e89094c44da98b954eedeac495271d0f",
      "spender": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      "data": "0x095ea7b3000000000000000000000000068b3465833fb72a70ecdf485e0e4c7bd8665fc45000000000000000000000000000000000000000000000000000000000000000",
      "human_readable": "approve(spender, 0)" }
  ]
}
```

## Input

| Field | Type | Default | Notes |
|---|---|---|---|
| `wallet` | string | — | **required**, `0x…` address |
| `chains` | number[] | `[1]` | Ethereum mainnet only in this version |
| `mode` | enum | `logs` | `etherscan` needs `ETHERSCAN_API_KEY` |
| `stale_after_days` | int | `90` | stale threshold |
| `lookback_blocks` | int | `599` | Approval event scan window |
| `top_tokens` | int | `12` | how many top ERC-20s to scan |

## Pricing

**Pay per event** — `$0.40` per completed audit. No subscription, no seat minimum.

## Notes & honest limits

- The log window is limited by public-RPC archive access; known-spender allowances are
  always read exactly, so the "unlimited" detection is not window-limited.
- Entries found through the allowance path have no approval timestamp, so they are reported
  as `direct` rather than guessed as `stale`.
- Permit2 allowances are not plain ERC-20 allowances; they are reported with a
  `spender_note` instead of being misclassified.
- The actor only reads chain state and returns calldata. It never handles keys and never moves funds.

## Related

- Live dashboard of the same engine: https://tools.highkingflower.com/
- The same analysis as an x402-paid HTTP endpoint (pay-per-call, USDC on Base-Sepolia).
