/**
 * Network selector — controls whether the app points at Arc Testnet or Arc mainnet.
 *
 * HOW TO SWITCH TO MAINNET (after completing the mainnet deployment checklist in README):
 *   1. Set  VITE_NETWORK=mainnet  in your .env (or hosting platform env vars).
 *   2. Set  VITE_MAINNET_CONTRACT_ADDRESS=<deployed TipjarSplit address>  in the same file.
 *   3. Restart the dev server (or redeploy). The app switches automatically.
 *
 * DEFAULT: testnet. Any value other than "mainnet" is treated as testnet.
 *
 * ⚠️  NOT-YET-ACTIVE: mainnet is not deployed yet. Do not set VITE_NETWORK=mainnet
 *     until you have completed an independent audit, the deployment steps in README,
 *     and confirmed the contract address below is correct.
 */

const raw = import.meta.env.VITE_NETWORK as string | undefined

/** True only when VITE_NETWORK is exactly "mainnet". Testnet is the default. */
export const IS_MAINNET = raw === 'mainnet'

// ─── Arc Testnet ────────────────────────────────────────────────────────────
// Source: @/onchain-facts registry, chain ID 5042002
export const ARC_TESTNET_CHAIN_ID = 5042002
export const ARC_TESTNET_RPC = 'https://rpc.testnet.arc.io'
export const ARC_TESTNET_EXPLORER = 'https://explorer.testnet.arc.io'
export const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000' as const

// ─── Arc Mainnet ─────────────────────────────────────────────────────────────
// Source: @/onchain-facts registry, chain ID 5042
// ⚠️  NOT-YET-ACTIVE — verified from Arc Studio's onchain-facts registry
export const ARC_MAINNET_CHAIN_ID = 5042
export const ARC_MAINNET_RPC = 'https://rpc.mainnet.arc.io'
export const ARC_MAINNET_EXPLORER = 'https://explorer.arc.io'
export const ARC_MAINNET_USDC = '0x3600000000000000000000000000000000000000' as const

// ─── Active network (reads env var) ─────────────────────────────────────────
export const ACTIVE_CHAIN_ID = IS_MAINNET ? ARC_MAINNET_CHAIN_ID : ARC_TESTNET_CHAIN_ID
export const ACTIVE_RPC = IS_MAINNET ? ARC_MAINNET_RPC : ARC_TESTNET_RPC
export const ACTIVE_EXPLORER = IS_MAINNET ? ARC_MAINNET_EXPLORER : ARC_TESTNET_EXPLORER
export const ACTIVE_USDC = IS_MAINNET ? ARC_MAINNET_USDC : ARC_TESTNET_USDC
export const ACTIVE_NETWORK_NAME = IS_MAINNET ? 'Arc' : 'Arc Testnet'
