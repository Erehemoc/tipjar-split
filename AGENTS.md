# TipJar Split

> Built with Arc Studio - money-powered apps in minutes

## What This App Does

A USDC tip jar for small cafes and bars where tips are split between the staff on a shift. Owners create jars and share a QR tip link; customers tip in USDC; staff withdraw their share at any time.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/`. Build with `bun run contracts:build`, test with `bun run contracts:test`.
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC (6 decimals, ERC-20 `0x3600000000000000000000000000000000000000` on Arc Testnet)
- QR: qrcode npm package
- Toasts: Sonner

## Deployed Contracts

| Contract     | Network      | Address                                      | Explorer |
|---|---|---|---|
| TipjarSplit  | Arc Testnet  | 0xde17db790bdb43335a11ef374a32cebc3c69a5b0   | https://explorer.testnet.arc.io/address/0xde17db790bdb43335a11ef374a32cebc3c69a5b0 |

## Key Files

- `src/App.tsx` — tab routing (Owner / Staff) + hash-based tip page routing
- `src/contract.ts` — contract address + ABI import
- `src/components/OwnerTab.tsx` — create jar, show QR + shareable link
- `src/components/TipPage.tsx` — tip flow for customers (opened via link/QR)
- `src/components/StaffTab.tsx` — staff balance + withdraw
- `src/lib/share.ts` — getShareBase / buildShareLink for share-safe URLs
- `contracts/TipjarSplit.sol` — the split tip jar contract
- `contracts/test/TipjarSplit.Core.t.sol` — unit tests (34 tests, all pass)
- `contracts/test/TipjarSplit.Fuzz.t.sol` — fuzz tests

## Tip Page URL Pattern

Tip pages are hash-routed: `#/tip/<jarId>`. The owner tab builds a shareable link via `buildShareLink('/tip/<jarId>')`.

## Notes

- The contract splits tips in-line during `tip()` — no payee loop in `withdraw()`, pure pull-payments.
- Remainder from integer division always goes to `payees[0]`, so credited total always equals amount exactly.
- Slither: 0 findings after explicit `= 0` initialization.
- Security review: no Critical or High findings.
