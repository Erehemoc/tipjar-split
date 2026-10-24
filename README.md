# TipJar Split

**Demo video (2 min):** https://github.com/Erehemoc/tipjar-split/blob/main/docs/tipjar-split-demo.mp4 · **Live app:** https://erehemoc.github.io/tipjar-split/

A USDC tip jar for small cafes and bars. Staff on each shift are registered as payees with a percentage share. Customers tip any amount from a QR code on the counter; the contract splits the tip instantly between all payees with exact arithmetic (rounding remainder always goes to the first payee, so the sum of credits always equals the tip exactly). Staff withdraw their accumulated balance at any time in a single pull-payment transaction.

Built with [Arc Studio](https://studio.arc.io) — designed and deployed end-to-end using AI agents.

---

## Live deployment (Arc mainnet)

**Live app:** https://erehemoc.github.io/tipjar-split/ (demo jar: https://erehemoc.github.io/tipjar-split/#/tip/0)

**Arc Studio project:** https://studio.arc.io/app/49c1f77c-a77f-4835-bcc6-d1937201a4c1

| Item | Value |
|---|---|
| Contract | [`0x075c5892ae96f21fe498783b67f9b3fe79fc94f2`](https://explorer.arc.io/address/0x075c5892ae96f21fe498783b67f9b3fe79fc94f2) |
| Chain | Arc mainnet (chain ID 5042) |
| USDC | `0x3600000000000000000000000000000000000000` |

### Verified on-chain transactions

| Step | Tx hash |
|---|---|
| Deploy TipjarSplit | [`0x88019875f54831c7dc1b943831cfb885adbe5ec677eb2e0ad1846258db36f778`](https://explorer.arc.io/tx/0x88019875f54831c7dc1b943831cfb885adbe5ec677eb2e0ad1846258db36f778) |
| createJar "Demo Cafe - Mainnet" | [`0x775eae9c3563e66083e0e4c619cdea97950ef2d0e3b5e31c74e4c88700357d3a`](https://explorer.arc.io/tx/0x775eae9c3563e66083e0e4c619cdea97950ef2d0e3b5e31c74e4c88700357d3a) |
| approve (exact 1 USDC) | [`0x6a294affbff26d670b93f916f59e5e7f90fee06fb4bd96c418e708c9818f6d32`](https://explorer.arc.io/tx/0x6a294affbff26d670b93f916f59e5e7f90fee06fb4bd96c418e708c9818f6d32) |
| tip | [`0x9fa4f88b41b17109e980d562d40f5d36bd21ccfd6e82ff58eb80b6603dd5b793`](https://explorer.arc.io/tx/0x9fa4f88b41b17109e980d562d40f5d36bd21ccfd6e82ff58eb80b6603dd5b793) |
| withdraw | [`0x9235aafe82d95bbfe3602613ed718ff71db59ed17152a091709f7d363b977cec`](https://explorer.arc.io/tx/0x9235aafe82d95bbfe3602613ed718ff71db59ed17152a091709f7d363b977cec) |

---

## How it works

The contract (`contracts/TipjarSplit.sol`) has four operations:

- **createJar** — the owner registers a jar name, a list of payee addresses, and their shares in basis points (must sum to 10000). Returns a jar ID.
- **updatePayees** — the jar owner can update the payee list and shares at any time; only future tips are affected.
- **tip** — a customer calls `tip(jarId, amount, note)`. The contract pulls USDC from the caller via `transferFrom`, splits the amount across payees according to their shares (integer division, remainder to the first payee), and credits each payee's internal balance. Rejects zero amounts and notes over 80 bytes.
- **withdraw** — a payee calls `withdraw()` to receive their entire accumulated balance across all jars in a single transfer. Uses pull-payment and reentrancy guard.

The frontend is a Vite + React app. The Owner tab creates jars and generates a shareable QR code link. The tip page (opened from the QR code) shows preset amounts, takes an optional note, and runs the approve + tip two-step flow entirely from the user's browser wallet. The Staff tab shows each connected wallet's withdrawable balance and a one-click withdraw button.

---

## Tech stack

- **Contract**: Solidity 0.8.28, OpenZeppelin 5 (SafeERC20, ReentrancyGuard), Foundry
- **Frontend**: Vite, React, TypeScript, Tailwind CSS, wagmi v2, viem, ConnectKit
- **Chain**: Arc mainnet (USDC as native gas — no ETH needed)

---

## Development

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Foundry](https://book.getfoundry.sh) (forge, cast)
- Node.js (for Foundry's forge-std scripts)

### Install

```bash
bun install
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_NETWORK` | No | Set to `mainnet` to point the app at Arc mainnet. Omit or set to anything else for Arc Testnet (default). |
| `VITE_MAINNET_CONTRACT_ADDRESS` | When `VITE_NETWORK=mainnet` | The deployed TipjarSplit address on Arc mainnet. |
| `CIRCLE_API_KEY` | Setup scripts only | Circle Standard Developer API key. Never needed at runtime. Store in `.private-secrets/.env`, not in `.env`. |
| `CIRCLE_ENTITY_SECRET` | Setup scripts only | Circle entity secret for developer-controlled wallets. Never needed at runtime. Store in `.private-secrets/.env`, not in `.env`. |

The public build on GitHub Pages is produced by `.github/workflows/pages.yml` with only the two `VITE_` variables above.

`RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, and `RPC_PROXY_CHAINS` are optional — provided automatically by Arc Studio for RPC access inside the sandbox.

### Run

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Lint and typecheck

```bash
bun run check
```

### Smart contract tests

```bash
forge install foundry-rs/forge-std --no-git   # lib/ is not committed
forge test
```

Runs 29 unit tests and 5 fuzz tests (256 runs each). Covers split math with odd amounts, remainder handling, access control, multi-jar accumulation, and withdrawal.

---

## Mainnet deployment (browser wallet path)

1. Add Arc mainnet to your wallet: chain ID `5042`, RPC `https://rpc.mainnet.arc.io`, currency `USDC`, explorer `https://explorer.arc.io`.
2. Fund the wallet with USDC on Arc mainnet (USDC at `0x3600000000000000000000000000000000000000` is also the gas token — no ETH needed). ~$1–2 USDC covers all operations comfortably.
3. Set `VITE_NETWORK=mainnet` in `.env`. Leave `VITE_MAINNET_CONTRACT_ADDRESS` unset.
4. Open the app — connect your wallet on Arc mainnet. The Deploy screen appears automatically.
5. Click Deploy. Your wallet signs one transaction. The contract address is saved to localStorage.
6. Set `VITE_MAINNET_CONTRACT_ADDRESS=<address>` in your hosting platform's environment and redeploy for a permanent build.

---

## Safety notes

- **Exact-amount approvals only.** The tip flow approves the contract for exactly the tip amount — never unlimited. There are no `MaxUint256` approvals anywhere in the codebase.
- **No admin keys.** Once deployed, no address has special privileges over the contract itself. Each jar has an owner who can update its payees; that is the only privileged role and it is scoped per jar.
- **No upgradeability.** The contract is not upgradeable. The deployed bytecode is final.
- **Pull payments.** Tips are credited to payee balances; payees withdraw themselves. The contract never loops over payees to push funds.
- **ReentrancyGuard + CEI.** The withdraw function clears the balance before transferring (checks-effects-interactions) and is protected by OpenZeppelin's ReentrancyGuard.
- **No server.** The deployed frontend is purely static. No backend holds credentials or private keys.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Repository notes

- `src/abi/TipjarSplit.json` holds the ABI and creation bytecode produced by `forge build` from `contracts/TipjarSplit.sol` (solc 0.8.28, optimizer 200 runs), so the frontend builds without Foundry. Regenerate it after changing the contract.
- Arc Studio's own sandbox deploy helpers are not included; the mainnet contract was deployed from the browser wallet path described above.
- `lib/forge-std` is not committed; install it with `forge install foundry-rs/forge-std --no-git` before running `forge test`.
