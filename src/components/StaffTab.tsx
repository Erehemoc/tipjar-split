import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
  useSwitchChain,
} from 'wagmi'
import type { Log } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { Loader2, ExternalLink, Wallet } from 'lucide-react'
import { useState, useEffect } from 'react'
import { TIPJAR_SPLIT, ZERO_ADDRESS } from '../contract'
import { ACTIVE_CHAIN_ID, ACTIVE_NETWORK_NAME } from '../network'
import { glass, spectral } from './glass'
import { formatUsdc, formatAddress, parseOnchainError } from '../lib/utils'
import { buildTxExplorerUrl } from '../onchain-facts'

interface TipEvent {
  jarId: bigint
  tipper: string
  amount: bigint
  note: string
  txHash: string
}

export default function StaffTab() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID
  const [recentTips, setRecentTips] = useState<TipEvent[]>([])
  // withdrawTxHash is derived from wdHash so we don't need separate state
  const [shownTxHash, setShownTxHash] = useState<`0x${string}` | undefined>()

  // Read withdrawable balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: TIPJAR_SPLIT.address,
    abi: TIPJAR_SPLIT.abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 6000 },
  })

  // Watch Tipped events
  useWatchContractEvent({
    address: TIPJAR_SPLIT.address,
    abi: TIPJAR_SPLIT.abi,
    eventName: 'Tipped',
    chainId: ACTIVE_CHAIN_ID,
    onLogs(logs: Log[]) {
      const newTips: TipEvent[] = logs.map((log) => {
        const args = (log as Log & { args?: { jarId?: bigint; tipper?: string; amount?: bigint; note?: string } }).args
        return {
          jarId: args?.jarId ?? 0n,
          tipper: args?.tipper ?? '',
          amount: args?.amount ?? 0n,
          note: args?.note ?? '',
          txHash: log.transactionHash ?? '',
        }
      })
      setRecentTips((prev) => [...newTips, ...prev].slice(0, 20))
    },
  })

  // Withdraw
  const {
    writeContract: withdrawWrite,
    data: wdHash,
    isPending: wdPending,
    reset: resetWd,
    error: wdError,
  } = useWriteContract()
  const { isLoading: wdConfirming, isSuccess: wdSuccess } =
    useWaitForTransactionReceipt({ hash: wdHash })

  // When the tx hash arrives, capture it for the explorer link
  // (wdHash disappears after reset, so we keep a shown copy)
  if (wdHash !== undefined && wdHash !== shownTxHash) {
    setShownTxHash(wdHash)
  }

  // Refetch balance after withdrawal
  useEffect(() => {
    if (wdSuccess) {
      void refetchBalance()
    }
  }, [wdSuccess, refetchBalance])

  const handleWithdraw = () => {
    if (TIPJAR_SPLIT.address === ZERO_ADDRESS) return
    withdrawWrite({
      address: TIPJAR_SPLIT.address,
      abi: TIPJAR_SPLIT.abi,
      functionName: 'withdraw',
      chainId: ACTIVE_CHAIN_ID,
    })
  }

  const handleReset = () => {
    resetWd()
    setShownTxHash(undefined)
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to see your share.</p>
        <ConnectKitButton />
      </div>
    )
  }

  const bal = (balance as bigint | undefined) ?? 0n
  const hasBalance = bal > 0n
  const isBusy = wdPending || wdConfirming

  return (
    <div className="space-y-4">
      {wrongChain && (
        <div className="rounded-2xl p-3 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
          Wrong network.{' '}
          <button onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })} className="underline font-semibold">
            Switch to {ACTIVE_NETWORK_NAME}
          </button>
        </div>
      )}

      {/* Balance hero */}
      <div className="rounded-3xl p-5" style={glass.card}>
        {hasBalance && <div className="h-1 rounded-full mb-4" style={{ background: spectral }} />}
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex size-5 items-center justify-center rounded-md" style={{ background: 'rgba(26,128,71,0.12)' }}>
            <Wallet className="size-3" style={{ color: 'var(--success)' }} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Your tip share</span>
        </div>
        <div className="flex items-baseline gap-1 mb-1">
          <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            ${formatUsdc(bal)}
          </span>
          <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {formatAddress(address!)} · {ACTIVE_NETWORK_NAME}
        </p>
      </div>

      {/* Withdraw success */}
      {wdSuccess && shownTxHash && (
        <div className="rounded-2xl p-4" style={glass.inner}>
          <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Withdrawal confirmed!</p>
          <a
            href={buildTxExplorerUrl(ACTIVE_CHAIN_ID, shownTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs"
            style={{ color: 'var(--accent-hover)' }}
          >
            View on explorer <ExternalLink className="size-3" />
          </a>
          <button
            onClick={handleReset}
            className="ml-4 text-xs underline"
            style={{ color: 'var(--subtle)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {wdError && (
        <p className="text-sm px-1" style={{ color: 'var(--danger)' }}>{parseOnchainError(wdError)}</p>
      )}

      {/* Withdraw button */}
      <button
        disabled={!hasBalance || wrongChain || isBusy}
        onClick={handleWithdraw}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        {wdPending
          ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirm in wallet…</span>
          : wdConfirming
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Withdrawing…</span>
            : wrongChain
              ? `Switch to ${ACTIVE_NETWORK_NAME}`
              : !hasBalance
                ? 'Nothing to withdraw yet'
                : `Withdraw $${formatUsdc(bal)} USDC`}
      </button>

      {/* Recent tips (live) */}
      <div className="rounded-3xl p-5" style={glass.card}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Recent tips (live)
        </p>
        {recentTips.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--subtle)' }}>
            Tips sent to any jar will appear here in real-time.
          </p>
        ) : (
          <div className="space-y-2">
            {recentTips.map((t, i) => (
              <div key={i} className="rounded-2xl p-3 flex items-center justify-between" style={glass.inner}>
                <div>
                  <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                    ${formatUsdc(t.amount)} USDC
                  </p>
                  <p className="mono text-xs" style={{ color: 'var(--subtle)' }}>
                    {formatAddress(t.tipper)} · Jar #{t.jarId.toString()}
                  </p>
                  {t.note && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>&ldquo;{t.note}&rdquo;</p>
                  )}
                </div>
                {t.txHash && (
                  <a
                    href={buildTxExplorerUrl(ACTIVE_CHAIN_ID, t.txHash as `0x${string}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--subtle)' }}
                  >
                    <ExternalLink className="size-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
