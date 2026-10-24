import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Loader2, Plus, Trash2, ExternalLink, Copy, Check, ArrowRight } from 'lucide-react'
import QRCode from 'qrcode'
import { TIPJAR_SPLIT, ZERO_ADDRESS } from '../contract'
import { ACTIVE_CHAIN_ID, ACTIVE_NETWORK_NAME } from '../network'
import { glass, spectral } from './glass'
import { parseOnchainError, formatAddress } from '../lib/utils'
import { buildShareLink } from '../lib/share'

interface PayeeRow {
  address: string
  percent: string
}

interface OwnerTabProps {
  /** Called with the jar ID string to navigate in-app to the tip page. */
  onOpenTipPage?: (jarId: string) => void
}

export default function OwnerTab({ onOpenTipPage }: OwnerTabProps) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID

  const [jarName, setJarName] = useState('')
  const [payees, setPayees] = useState<PayeeRow[]>([
    { address: '', percent: '' },
    { address: '', percent: '' },
  ])
  const [error, setError] = useState('')
  const [tipLink, setTipLink] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  // Derive jarId from receipt logs — no setState in effects below,
  // derive createdJarId as a computed value from receipt.
  const createdJarId: bigint | null = (() => {
    if (!isSuccess || !receipt) return null
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === TIPJAR_SPLIT.address.toLowerCase() &&
        log.topics.length >= 2 &&
        log.topics[1] !== undefined
      ) {
        return BigInt(log.topics[1])
      }
    }
    return null
  })()

  // Build share link after success
  useEffect(() => {
    if (createdJarId === null) return
    void buildShareLink(`/tip/${createdJarId.toString()}`).then((link) => {
      setTipLink(link)
      void QRCode.toDataURL(link, { width: 200, margin: 2 }).then(setQrDataUrl).catch(() => {})
    })
  }, [createdJarId])

  const addPayeeRow = () => setPayees((p) => [...p, { address: '', percent: '' }])
  const removePayeeRow = (i: number) => setPayees((p) => p.filter((_, idx) => idx !== i))
  const updatePayee = (i: number, field: keyof PayeeRow, val: string) =>
    setPayees((p) => p.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)))

  const totalPercent = payees.reduce((sum, r) => sum + (parseFloat(r.percent) || 0), 0)

  const handleCreate = useCallback(() => {
    setError('')
    if (!jarName.trim()) { setError('Jar name is required.'); return }
    if (payees.length < 1) { setError('Add at least one staff member.'); return }

    const addrs: `0x${string}`[] = []
    const shares: number[] = []
    for (const row of payees) {
      if (!row.address.startsWith('0x') || row.address.length !== 42) {
        setError('All addresses must be valid 0x… addresses.'); return
      }
      const pct = parseFloat(row.percent)
      if (isNaN(pct) || pct <= 0) { setError('All shares must be greater than 0.'); return }
      addrs.push(row.address as `0x${string}`)
      shares.push(Math.round(pct * 100))
    }
    const sumBps = shares.reduce((a, b) => a + b, 0)
    if (sumBps !== 10000) {
      setError(`Shares must total 100% (currently ${(sumBps / 100).toFixed(2)}%).`)
      return
    }
    if (new Set(addrs.map((a) => a.toLowerCase())).size !== addrs.length) {
      setError('Duplicate addresses are not allowed.')
      return
    }

    if (TIPJAR_SPLIT.address === ZERO_ADDRESS) {
      setError('Contract address is not set. Deploy the contract first.')
      return
    }
    writeContract({
      address: TIPJAR_SPLIT.address,
      abi: TIPJAR_SPLIT.abi,
      functionName: 'createJar',
      args: [jarName.trim(), addrs, shares.map((s) => s as unknown as bigint)],
      chainId: ACTIVE_CHAIN_ID,
    })
  }, [jarName, payees, writeContract])

  const handleCopy = () => {
    void navigator.clipboard.writeText(tipLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const handleReset = () => {
    reset()
    setTipLink('')
    setQrDataUrl('')
    setJarName('')
    setPayees([{ address: '', percent: '' }, { address: '', percent: '' }])
    setError('')
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to create a tip jar.</p>
        <ConnectKitButton />
      </div>
    )
  }

  if (isSuccess && createdJarId !== null && tipLink) {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl p-5" style={glass.card}>
          <div className="h-1 rounded-full mb-4" style={{ background: spectral }} />
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Jar created</p>
          <p className="display text-2xl font-bold mb-4" style={{ color: 'var(--ink)' }}>{jarName}</p>
          {qrDataUrl && (
            <div className="flex justify-center mb-4">
              <img src={qrDataUrl} alt="QR code for tip link" className="rounded-2xl" style={{ border: '1px solid var(--border)' }} />
            </div>
          )}
          <div className="rounded-2xl p-3 flex items-center gap-2" style={glass.inner}>
            <p className="mono text-xs flex-1 truncate" style={{ color: 'var(--ink-2)' }}>{tipLink}</p>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 rounded-xl p-2 transition-colors"
              style={{ background: copied ? 'var(--success)' : 'var(--accent)', color: 'white' }}
              aria-label="Copy link"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
          </div>
          {txHash && (
            <a
              href={`https://explorer${ACTIVE_CHAIN_ID === 5042002 ? '.testnet' : ''}.arc.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--accent-hover)' }}
            >
              View on explorer <ExternalLink className="size-3" />
            </a>
          )}
        </div>

        {/* Primary CTA: open tip page inside the preview */}
        {onOpenTipPage && createdJarId !== null && (
          <button
            onClick={() => onOpenTipPage(createdJarId.toString())}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'var(--accent)' }}
          >
            Open tip page <ArrowRight className="size-4" />
          </button>
        )}

        <button
          onClick={handleReset}
          className="w-full rounded-2xl py-3 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          Create another jar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {wrongChain && (
        <div className="rounded-2xl p-3 text-sm font-medium" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
          Wrong network. Switch to {ACTIVE_NETWORK_NAME} to continue.
          <button
            onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
            className="ml-2 underline font-semibold"
          >
            Switch
          </button>
        </div>
      )}

      <div className="rounded-3xl p-5" style={glass.card}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>New tip jar</p>

        <div className="space-y-3">
          <div className="rounded-2xl p-3" style={glass.inner}>
            <label className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>Jar name</label>
            <input
              type="text"
              value={jarName}
              onChange={(e) => setJarName(e.target.value)}
              placeholder="Morning Shift — Oct 23"
              className="w-full bg-transparent text-sm font-medium mt-1 outline-none placeholder:opacity-40"
              style={{ color: 'var(--ink)' }}
              maxLength={60}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>Staff shares</p>
              <span
                className="text-xs font-semibold tabular-nums"
                style={{ color: Math.abs(totalPercent - 100) < 0.01 ? 'var(--success)' : 'var(--danger)' }}
              >
                {totalPercent.toFixed(2)}% / 100%
              </span>
            </div>
            <div className="space-y-2">
              {payees.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <div className="flex-1 rounded-2xl p-3" style={glass.inner}>
                    <input
                      type="text"
                      value={row.address}
                      onChange={(e) => updatePayee(i, 'address', e.target.value)}
                      placeholder="0x…"
                      className="mono w-full bg-transparent text-xs outline-none placeholder:opacity-40"
                      style={{ color: 'var(--ink)' }}
                    />
                  </div>
                  <div className="w-20 rounded-2xl p-3" style={glass.inner}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.percent}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, '')
                        if (v === '' || /^\d*\.?\d*$/.test(v)) updatePayee(i, 'percent', v)
                      }}
                      placeholder="%"
                      className="w-full bg-transparent text-sm font-semibold tabular-nums text-center outline-none placeholder:opacity-40"
                      style={{ color: 'var(--ink)' }}
                    />
                  </div>
                  {payees.length > 1 && (
                    <button
                      onClick={() => removePayeeRow(i)}
                      className="p-2 rounded-xl"
                      style={{ color: 'var(--subtle)' }}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {payees.length < 20 && (
              <button
                onClick={addPayeeRow}
                className="mt-2 flex items-center gap-1 text-xs font-semibold"
                style={{ color: 'var(--accent-hover)' }}
              >
                <Plus className="size-3" /> Add staff member
              </button>
            )}
          </div>

          <div className="rounded-2xl p-3 text-xs" style={glass.inner}>
            <p style={{ color: 'var(--subtle)' }}>
              Connected as <span className="mono font-semibold" style={{ color: 'var(--ink-2)' }}>{address ? formatAddress(address) : '…'}</span> — you&apos;ll be the jar owner.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm px-1" style={{ color: 'var(--danger)' }}>{error}</p>
      )}

      {writeError && !error && (
        <p className="text-sm px-1" style={{ color: 'var(--danger)' }}>
          {parseOnchainError(writeError)}
        </p>
      )}

      <button
        disabled={!isConnected || wrongChain || isPending || isConfirming}
        onClick={handleCreate}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        {isPending
          ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</span>
          : isConfirming
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Creating jar…</span>
            : wrongChain
              ? `Switch to ${ACTIVE_NETWORK_NAME}`
              : 'Create tip jar'}
      </button>
    </div>
  )
}
