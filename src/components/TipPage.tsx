import { useState, useEffect, useCallback } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { erc20Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { Loader2, ExternalLink, ArrowLeft } from 'lucide-react'
import { TIPJAR_SPLIT, ZERO_ADDRESS } from '../contract'
import { ACTIVE_CHAIN_ID, ACTIVE_NETWORK_NAME } from '../network'
import { glass, spectral } from './glass'
import { formatUsdc, formatAddress, parseOnchainError } from '../lib/utils'
import { getUsdc, buildTxExplorerUrl } from '../onchain-facts'
import { parseAmount } from '../onchain-money'

const USDC = getUsdc(ACTIVE_CHAIN_ID)!
const PRESETS = [1, 2, 5]

interface TipPageProps {
  jarId: string
  onBack: () => void
}

type FlowPhase = 'idle' | 'approving' | 'tipping'

export default function TipPage({ jarId, onBack }: TipPageProps) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [phase, setPhase] = useState<FlowPhase>('idle')
  const [fieldError, setFieldError] = useState('')

  // Read jar info
  const { data: jarData, isLoading: jarLoading } = useReadContract({
    address: TIPJAR_SPLIT.address,
    abi: TIPJAR_SPLIT.abi,
    functionName: 'getJar',
    args: [BigInt(jarId)],
    chainId: ACTIVE_CHAIN_ID,
  })

  // Read USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, TIPJAR_SPLIT.address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address },
  })

  // Approve
  const {
    writeContract: approveWrite,
    data: approveTxHash,
    isPending: approvePending,
    reset: resetApprove,
    error: approveError,
  } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash })

  // Tip
  const {
    writeContract: tipWrite,
    data: tipHash,
    isPending: tipPending,
    reset: resetTip,
    error: tipError,
  } = useWriteContract()
  const { isLoading: tipConfirming, isSuccess: tipSuccess } =
    useWaitForTransactionReceipt({ hash: tipHash })

  const parsedAmount = useCallback((): bigint | null => {
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) return null
    try {
      return parseAmount(ACTIVE_CHAIN_ID, amount).raw
    } catch {
      return null
    }
  }, [amount])

  const doTip = useCallback((raw: bigint) => {
    setPhase('tipping')
    tipWrite({
      address: TIPJAR_SPLIT.address,
      abi: TIPJAR_SPLIT.abi,
      functionName: 'tip',
      args: [BigInt(jarId), raw, note],
      chainId: ACTIVE_CHAIN_ID,
    })
  }, [jarId, note, tipWrite])

  // After approve confirmed -> refetch allowance then tip
  useEffect(() => {
    if (!approveSuccess) return
    const raw = parsedAmount()
    if (!raw) return
    void refetchAllowance().then(() => doTip(raw))
  // doTip and parsedAmount are stable callbacks; refetchAllowance is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess])

  const handleTip = () => {
    setFieldError('')
    if (TIPJAR_SPLIT.address === ZERO_ADDRESS) {
      setFieldError('Contract address is not set. Deploy the contract first.')
      return
    }
    const raw = parsedAmount()
    if (!raw || raw === 0n) { setFieldError('Enter a valid amount.'); return }
    if (note.length > 80) { setFieldError('Note must be 80 characters or less.'); return }

    if ((allowance ?? 0n) >= raw) {
      doTip(raw)
    } else {
      setPhase('approving')
      approveWrite({
        address: USDC.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [TIPJAR_SPLIT.address, raw],
        chainId: ACTIVE_CHAIN_ID,
      })
    }
  }

  const handleReset = () => {
    setPhase('idle')
    setAmount('')
    setNote('')
    setFieldError('')
    resetApprove()
    resetTip()
  }

  const jar = jarData as [string, string, string[], number[], bigint] | undefined
  const jarName = jar?.[0] ?? ''
  const jarPayees = jar?.[2] ?? []
  const jarShares = jar?.[3] ?? []

  if (jarLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <Loader2 className="size-5 animate-spin" style={{ color: 'var(--muted)' }} />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading tip jar…</p>
      </div>
    )
  }

  if (!jar || !jar[1] || jar[1] === '0x0000000000000000000000000000000000000000') {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-4" /> Back
        </button>
        <div className="rounded-3xl p-5" style={glass.card}>
          <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Tip jar not found.</p>
        </div>
      </div>
    )
  }

  // Success state — derived from hooks, no separate state
  if (tipSuccess && tipHash) {
    const tipAmountRaw = parsedAmount() ?? 0n
    return (
      <div className="space-y-4">
        <div className="rounded-3xl p-5" style={glass.card}>
          <div className="h-1 rounded-full mb-4" style={{ background: spectral }} />
          <div
            className="size-12 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'rgba(26,128,71,0.12)' }}
          >
            <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--success)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="display text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>
            Tip sent!
          </p>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            ${formatUsdc(tipAmountRaw)} USDC to <strong>{jarName}</strong>
          </p>
          <a
            href={buildTxExplorerUrl(ACTIVE_CHAIN_ID, tipHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: 'var(--accent-hover)' }}
          >
            View on explorer <ExternalLink className="size-3" />
          </a>
        </div>
        <button
          onClick={handleReset}
          className="w-full rounded-2xl py-3 text-sm font-semibold transition-all hover:scale-[1.01]"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          Send another tip
        </button>
      </div>
    )
  }

  const txError = approveError ?? tipError
  const isBusy = phase !== 'idle'

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Back
      </button>

      {/* Jar header */}
      <div className="rounded-3xl p-5" style={glass.card}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Leave a tip for</p>
        <p className="display text-2xl font-bold mb-3" style={{ color: 'var(--ink)' }}>{jarName}</p>
        <div className="space-y-1">
          {jarPayees.map((p, i) => (
            <div key={p} className="flex items-center justify-between">
              <span className="mono text-xs" style={{ color: 'var(--ink-2)' }}>{formatAddress(p)}</span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--muted)' }}>
                {(jarShares[i] / 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {wrongChain && (
        <div className="rounded-2xl p-3 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
          Wrong network.{' '}
          <button onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })} className="underline font-semibold">
            Switch to {ACTIVE_NETWORK_NAME}
          </button>
        </div>
      )}

      {/* Amount */}
      <div className="rounded-3xl p-5" style={glass.card}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Amount (USDC)</p>
        <div className="flex gap-2 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p.toString())}
              className="flex-1 rounded-2xl py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={
                amount === p.toString()
                  ? { background: 'var(--accent)', color: 'white' }
                  : glass.pill
              }
            >
              ${p}
            </button>
          ))}
        </div>
        <div className="rounded-2xl p-4" style={glass.inner}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
            }}
            placeholder="0.00"
            className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
            style={{ color: 'var(--ink)' }}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>USDC on {ACTIVE_NETWORK_NAME}</p>
        </div>

        <div className="mt-3 rounded-2xl p-3" style={glass.inner}>
          <label className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>
            Note (optional, max 80 chars)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 80))}
            placeholder="Great service!"
            className="w-full bg-transparent text-sm mt-1 outline-none placeholder:opacity-40"
            style={{ color: 'var(--ink)' }}
          />
          <p className="text-right text-xs mt-1 tabular-nums" style={{ color: note.length > 70 ? 'var(--danger)' : 'var(--subtle)' }}>
            {note.length}/80
          </p>
        </div>
      </div>

      {fieldError && (
        <p className="text-sm px-1" style={{ color: 'var(--danger)' }}>{fieldError}</p>
      )}
      {txError && (
        <p className="text-sm px-1" style={{ color: 'var(--danger)' }}>{parseOnchainError(txError)}</p>
      )}

      {/* Progress feedback */}
      {isBusy && (
        <div className="rounded-2xl p-3 text-sm" style={glass.inner}>
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" style={{ color: 'var(--muted)' }} />
            <span style={{ color: 'var(--ink-2)' }}>
              {phase === 'approving' && (approvePending ? 'Confirm approval in wallet…' : approveConfirming ? 'Approving USDC…' : 'Approving…')}
              {phase === 'tipping' && (tipPending ? 'Confirm tip in wallet…' : tipConfirming ? 'Sending tip…' : 'Processing…')}
            </span>
          </div>
          {phase === 'approving' && (
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Step 1/2: Allow the contract to use your USDC</p>
          )}
          {phase === 'tipping' && (
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Step 2/2: Sending the tip</p>
          )}
        </div>
      )}

      {!isConnected ? (
        <div className="flex justify-center">
          <ConnectKitButton label="Connect to tip" />
        </div>
      ) : (
        <button
          disabled={wrongChain || isBusy || !amount}
          onClick={handleTip}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {wrongChain
            ? `Switch to ${ACTIVE_NETWORK_NAME}`
            : isBusy
              ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Processing…</span>
              : `Tip $${amount || '0.00'} USDC`}
        </button>
      )}

      <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
        Tips split instantly between {jarPayees.length} staff member{jarPayees.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
