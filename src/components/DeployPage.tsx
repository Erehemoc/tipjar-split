/**
 * DeployPage — browser-wallet contract deployment for TipjarSplit.
 *
 * Visible only when VITE_NETWORK=mainnet AND no contract address is stored yet.
 * Uses the connected browser wallet (Rabby / MetaMask / any EIP-1193 injected
 * provider) to broadcast the deployment transaction. No private key is ever
 * handled here — the wallet signs everything.
 *
 * After a successful deploy the new address is written to localStorage under
 * MAINNET_CONTRACT_ADDRESS so the rest of the app can use it without an env-var
 * rebuild. The owner can also copy the address to set VITE_MAINNET_CONTRACT_ADDRESS
 * permanently for production deploys.
 *
 * All approvals elsewhere in the app remain exact-amount. Nothing unlimited is
 * introduced here.
 */
import { useState, useCallback } from 'react'
import {
  useAccount,
  useSwitchChain,
  usePublicClient,
} from 'wagmi'
import { createWalletClient, custom } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { Loader2, ExternalLink, Copy, CheckCircle } from 'lucide-react'
import artifact from '../../contracts/out/TipjarSplit.sol/TipjarSplit.json'
import { ACTIVE_CHAIN_ID, ACTIVE_NETWORK_NAME, ARC_MAINNET_USDC } from '../network'
import { MAINNET_CONTRACT_LS_KEY } from '../contract'
import { glass, spectral } from './glass'
import { buildTxExplorerUrl, buildAddressExplorerUrl } from '../onchain-facts'

// The USDC address on Arc mainnet — injected as constructor arg.
const USDC_MAINNET = ARC_MAINNET_USDC

// Re-export so legacy imports from DeployPage still compile.
export { MAINNET_CONTRACT_LS_KEY }

type Phase =
  | 'idle'
  | 'waiting_signature'  // wallet signature pending
  | 'broadcasting'       // tx submitted, waiting for receipt
  | 'success'
  | 'error'

interface GasRow {
  label: string
  estimate: string
  note: string
}

const GAS_TABLE: GasRow[] = [
  { label: 'Deploy TipjarSplit', estimate: '~$0.10–$0.30', note: 'One-time' },
  { label: 'createJar (3 payees)', estimate: '~$0.02–$0.05', note: 'Per shift change' },
  { label: 'approve USDC (exact amount)', estimate: '~$0.01–$0.02', note: 'Per tip session' },
  { label: 'tip (1 USDC, 3 payees)', estimate: '~$0.03–$0.07', note: 'Per tip' },
  { label: 'withdraw', estimate: '~$0.01–$0.02', note: 'Per payee payout' },
  { label: 'Total buffer (safe)', estimate: '~$1–$2 USDC', note: 'Covers many operations' },
]

interface DeployPageProps {
  onDeployed: (address: `0x${string}`) => void
}

export default function DeployPage({ onDeployed }: DeployPageProps) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: ACTIVE_CHAIN_ID })

  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID

  const [phase, setPhase] = useState<Phase>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [deployedAddress, setDeployedAddress] = useState<`0x${string}` | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)

  const handleDeploy = useCallback(async () => {
    // Hard guard: refuse to run if the wallet is on the wrong chain,
    // even if somehow called programmatically while the button is disabled.
    if (chainId !== ACTIVE_CHAIN_ID) {
      setErrorMsg(`Wrong chain: wallet is on ${chainId}, must be ${ACTIVE_CHAIN_ID} (${ACTIVE_NETWORK_NAME}).`)
      return
    }
    if (!publicClient || !address) return
    // Build a fresh viem WalletClient from the injected provider each time —
    // avoids the wagmi generic that resolves to `never` through hook narrowing.
    const provider = (window as { ethereum?: unknown }).ethereum
    if (!provider) { setErrorMsg('No injected wallet found. Install Rabby or MetaMask.'); return }
    const walletClient = createWalletClient({
      account: address,
      transport: custom(provider as Parameters<typeof custom>[0]),
    })
    setErrorMsg('')
    setPhase('waiting_signature')
    try {
      // Encode constructor args: address _usdc
      const { encodeAbiParameters, parseAbiParameters } = await import('viem')
      const constructorArgs = encodeAbiParameters(
        parseAbiParameters('address'),
        [USDC_MAINNET],
      )
      const bytecode = (artifact.bytecode.object as `0x${string}`)
      const deployData = (bytecode + constructorArgs.slice(2)) as `0x${string}`

      const hash = await walletClient.sendTransaction({
        to: null,
        data: deployData,
        gas: 3_000_000n,
        chainId: ACTIVE_CHAIN_ID,
        chain: null, // required by viem when chainId is specified without a chain object
      })
      setTxHash(hash)
      setPhase('broadcasting')

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (!receipt.contractAddress) throw new Error('No contract address in receipt')

      const deployed = receipt.contractAddress
      // Persist to localStorage so the app can use it without an env rebuild
      localStorage.setItem(MAINNET_CONTRACT_LS_KEY, deployed)
      setDeployedAddress(deployed)
      setPhase('success')
      onDeployed(deployed)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // User rejection: show friendly message
      if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('4001')) {
        setErrorMsg('Transaction rejected in wallet.')
      } else {
        setErrorMsg(msg.slice(0, 200))
      }
      setPhase('error')
    }
  }, [address, chainId, publicClient, onDeployed])

  const copyAddress = () => {
    if (!deployedAddress) return
    void navigator.clipboard.writeText(deployedAddress).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isBusy = phase === 'waiting_signature' || phase === 'broadcasting'

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="rounded-3xl p-5" style={glass.card}>
        <div className="h-1 rounded-full mb-4" style={{ background: spectral }} />
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
          Mainnet setup
        </p>
        <p className="display text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>
          Deploy TipJar Split
        </p>
        <p className="text-sm text-pretty" style={{ color: 'var(--ink-2)' }}>
          Deploy the TipjarSplit contract to {ACTIVE_NETWORK_NAME} from your connected wallet.
          Your wallet signs the deployment — no private key is ever stored here.
          The contract address is saved locally so the app works immediately.
        </p>
      </div>

      {/* Gas cost table */}
      <div className="rounded-3xl p-5" style={glass.card}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Expected gas costs (USDC)
        </p>
        <div className="space-y-2">
          {GAS_TABLE.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-2">
              <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{row.label}</span>
              <span className="text-sm font-semibold tabular-nums text-right shrink-0" style={{ color: 'var(--ink)' }}>
                {row.estimate}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          Arc uses USDC as its native gas token. Your wallet needs only USDC — no ETH, no other token.
          Fund at <span className="mono">0x3600…0000</span> (same address on testnet and mainnet).
        </p>
      </div>

      {/* Arc mainnet network params */}
      <div className="rounded-3xl p-5" style={glass.card}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Add Arc mainnet to your wallet
        </p>
        <div className="space-y-2">
          {[
            { label: 'Network name', value: 'Arc' },
            { label: 'Chain ID', value: '5042' },
            { label: 'RPC URL', value: 'https://rpc.mainnet.arc.io' },
            { label: 'Currency symbol', value: 'USDC' },
            { label: 'Currency decimals', value: '18 (gas view) / 6 (ERC-20 view)' },
            { label: 'Block explorer', value: 'https://explorer.arc.io' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-2">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{label}</span>
              <span className="mono text-xs text-right shrink-0" style={{ color: 'var(--ink-2)' }}>{value}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          In Rabby: Settings → Networks → Add Custom Network. In MetaMask: Settings → Networks → Add a network manually.
        </p>
      </div>

      {/* Connected wallet status — shows address and live chain ID so the owner
          can verify before signing. Intentionally always visible when connected. */}
      {isConnected && address && (
        <div className="rounded-2xl p-3" style={glass.inner}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
            Connected wallet
          </p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>Address</span>
              <span className="mono text-xs" style={{ color: 'var(--ink-2)' }}>
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>Chain ID</span>
              <span
                className="mono text-xs font-semibold"
                style={{ color: chainId === ACTIVE_CHAIN_ID ? 'var(--success)' : 'var(--danger)' }}
              >
                {chainId ?? '—'}{chainId === ACTIVE_CHAIN_ID ? ' ✓ Arc mainnet' : ' ✗ wrong chain'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Wrong chain warning + switch button */}
      {wrongChain && (
        <div className="rounded-2xl p-3 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
          Wrong network — wallet is on chain {chainId}, but this app requires chain {ACTIVE_CHAIN_ID} ({ACTIVE_NETWORK_NAME}).{' '}
          <button onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })} className="underline font-semibold">
            Switch to {ACTIVE_NETWORK_NAME}
          </button>
        </div>
      )}

      {/* Progress / success / error states */}
      {isBusy && (
        <div className="rounded-2xl p-3" style={glass.inner}>
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" style={{ color: 'var(--muted)' }} />
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
              {phase === 'waiting_signature' && 'Confirm the deployment in your wallet…'}
              {phase === 'broadcasting' && 'Deployment submitted — waiting for confirmation…'}
            </span>
          </div>
          {txHash && (
            <a
              href={buildTxExplorerUrl(ACTIVE_CHAIN_ID, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--accent-hover)' }}
            >
              View transaction <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {phase === 'success' && deployedAddress && (
        <div className="rounded-3xl p-5 space-y-3" style={glass.card}>
          <div className="h-1 rounded-full" style={{ background: spectral }} />
          <div className="flex items-center gap-2">
            <CheckCircle className="size-5" style={{ color: 'var(--success)' }} />
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>Contract deployed!</p>
          </div>
          <div className="rounded-2xl p-3" style={glass.inner}>
            <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Contract address</p>
            <div className="flex items-center gap-2">
              <p className="mono text-xs flex-1 break-all" style={{ color: 'var(--ink)' }}>{deployedAddress}</p>
              <button onClick={copyAddress} className="shrink-0">
                {copied
                  ? <CheckCircle className="size-4" style={{ color: 'var(--success)' }} />
                  : <Copy className="size-4" style={{ color: 'var(--muted)' }} />
                }
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            {txHash && (
              <a
                href={buildTxExplorerUrl(ACTIVE_CHAIN_ID, txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--accent-hover)' }}
              >
                Tx <ExternalLink className="size-3" />
              </a>
            )}
            <a
              href={buildAddressExplorerUrl(ACTIVE_CHAIN_ID, deployedAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--accent-hover)' }}
            >
              Contract <ExternalLink className="size-3" />
            </a>
          </div>
          <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
            Address saved locally. To make it permanent, set{' '}
            <span className="mono">VITE_MAINNET_CONTRACT_ADDRESS={deployedAddress}</span>{' '}
            in your hosting platform's environment variables.
          </p>
        </div>
      )}

      {phase === 'error' && errorMsg && (
        <p className="text-sm px-1" style={{ color: 'var(--danger)' }}>{errorMsg}</p>
      )}

      {/* CTA */}
      {phase !== 'success' && (
        !isConnected ? (
          <div className="flex justify-center">
            <ConnectKitButton label="Connect wallet to deploy" />
          </div>
        ) : (
          <button
            disabled={wrongChain || isBusy}
            onClick={() => { void handleDeploy() }}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {isBusy
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Deploying…</span>
              : wrongChain
                ? `Switch to ${ACTIVE_NETWORK_NAME}`
                : 'Deploy to Arc mainnet'}
          </button>
        )
      )}

      <p className="text-center text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
        Deploying commits ~$0.10–$0.30 USDC in gas from your connected wallet. No private key is stored here.
        All tip approvals are exact-amount — no unlimited approvals anywhere in this app.
      </p>
    </div>
  )
}
