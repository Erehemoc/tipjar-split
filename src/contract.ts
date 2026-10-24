import artifact from './abi/TipjarSplit.json'
import { IS_MAINNET, ACTIVE_CHAIN_ID } from './network'

// ─── Testnet deployment ───────────────────────────────────────────────────────
const TESTNET_ADDRESS = '0xde17db790bdb43335a11ef374a32cebc3c69a5b0' as `0x${string}`

// ─── Zero address sentinel ────────────────────────────────────────────────────
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

// ─── localStorage key (must match DeployPage) ────────────────────────────────
// Duplicated here (not imported from DeployPage) to avoid a circular import
// and to let this module stand alone without importing React components.
export const MAINNET_CONTRACT_LS_KEY = 'TIPJARSPLIT_MAINNET_ADDRESS'

// ─── Mainnet address resolution ───────────────────────────────────────────────
// Priority:
//   1. VITE_MAINNET_CONTRACT_ADDRESS env var — baked in by Vite at build time.
//      This is the canonical, permanent path. Set it after every mainnet deploy.
//   2. localStorage[MAINNET_CONTRACT_LS_KEY] — written by DeployPage after a
//      browser-wallet deploy. Read lazily (at call time, not at module load)
//      so a fresh deploy within the same page session is picked up immediately.
//   3. Zero-address placeholder — means the contract has not been deployed yet.
const ENV_MAINNET = import.meta.env.VITE_MAINNET_CONTRACT_ADDRESS as string | undefined

/**
 * Resolves the active mainnet contract address at call time.
 * Always call this function rather than caching the result, so localStorage
 * writes from DeployPage are visible to the next caller without a page reload.
 */
export function resolveMainnetAddress(): `0x${string}` {
  if (ENV_MAINNET && ENV_MAINNET !== ZERO_ADDRESS) {
    return ENV_MAINNET as `0x${string}`
  }
  if (typeof window !== 'undefined') {
    const ls = localStorage.getItem(MAINNET_CONTRACT_LS_KEY)
    if (ls && ls !== ZERO_ADDRESS) return ls as `0x${string}`
  }
  return ZERO_ADDRESS
}

// ─── TIPJAR_SPLIT ─────────────────────────────────────────────────────────────
// `address` is a getter so every read picks up the latest resolved value.
// This means a DeployPage write to localStorage is immediately visible to
// OwnerTab / TipPage / StaffTab without a page reload.
export const TIPJAR_SPLIT = {
  get address(): `0x${string}` {
    return IS_MAINNET ? resolveMainnetAddress() : TESTNET_ADDRESS
  },
  abi: artifact.abi,
} as const

/** True when running on mainnet AND a non-zero contract address is available. */
export function isMainnetDeployed(): boolean {
  return IS_MAINNET && resolveMainnetAddress() !== ZERO_ADDRESS
}

/**
 * Guard: throws if the resolved address is the zero address.
 * Call this at the top of any function that sends a transaction through TIPJAR_SPLIT.
 */
export function assertContractDeployed(): void {
  const addr = TIPJAR_SPLIT.address
  if (addr === ZERO_ADDRESS) {
    throw new Error(
      'Contract address is not set. Deploy the contract first, or set VITE_MAINNET_CONTRACT_ADDRESS.',
    )
  }
}

/** The chain ID the active contract is deployed on. */
export const ACTIVE_CHAIN_ID_CONTRACT = ACTIVE_CHAIN_ID

// Preserve the old export names so existing imports don't break
export const ARC_TESTNET_CHAIN_ID = 5042002
/** @deprecated use isMainnetDeployed() — this was a module-load-time snapshot */
export const IS_MAINNET_DEPLOYED = IS_MAINNET && (ENV_MAINNET ?? '') !== '' && ENV_MAINNET !== ZERO_ADDRESS
