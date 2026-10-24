/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * The active chain (first in the array, so ConnectKit's default) is determined
 * by VITE_NETWORK at build/dev-server start time:
 *   VITE_NETWORK=mainnet  → arcMainnetConfig  (chains: [arcMainnet, ethereum])
 *   anything else          → arcTestnetConfig  (chains: [arcTestnet, ethereum])
 *
 * Arc Testnet and Arc mainnet are NEVER both present at the same time — that
 * was the cause of ConnectKit prompting to switch to the wrong network.
 *
 * Ethereum mainnet is always included (last) for ENS resolution only; it is
 * never shown as the active network in this app.
 */

import { http, createConfig, type Config } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { IS_MAINNET } from './network'
import { registerChain } from './tracing'

// ─── Arc mainnet chain definition ────────────────────────────────────────────
// Source: Arc Studio onchain-facts registry — chain ID 5042
// Native currency: USDC (18-decimal gas view)
// ERC-20 USDC: 0x3600000000000000000000000000000000000000
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://explorer.arc.io' },
  },
})

// Two static configs — one per network. Only ONE is exported as `config`.
// Keeping both static satisfies TypeScript's discriminated union on chain IDs.
const arcMainnetConfig = createConfig({
  chains: [arcMainnet, mainnet],
  connectors: [injected()],
  transports: {
    [arcMainnet.id]: http(),
    [mainnet.id]: http(),
  },
})

const arcTestnetConfig = createConfig({
  chains: [arcTestnet, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
    [mainnet.id]: http(),
  },
})

// Pre-register chain RPC URLs so trace events show correct chain names
if (IS_MAINNET) {
  registerChain(arcMainnet.id, arcMainnet.rpcUrls.default.http[0])
} else {
  registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
}

// Export a single `config` — wagmi's WagmiProvider expects one config object.
// Both static configs are valid Config instances; we widen to the base Config
// type so wagmi's JSX props accept it without knowing the exact chain union.
export const config: Config = (IS_MAINNET ? arcMainnetConfig : arcTestnetConfig) as Config
