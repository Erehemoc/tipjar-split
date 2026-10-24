export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatUsdc(raw: bigint): string {
  const n = Number(raw) / 1_000_000
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || (error as { code?: number })?.code === 4001)
    return 'Transaction cancelled.'
  if (msg.includes('insufficient') || msg.includes('exceeds balance'))
    return 'Insufficient balance. Please add funds and try again.'
  if (msg.includes('nothingtow') || msg.includes('nothing to withdraw'))
    return 'Nothing to withdraw right now.'
  if (msg.includes('zeroamount')) return 'Amount must be greater than 0.'
  if (msg.includes('notetoolong')) return 'Note must be 80 characters or less.'
  if (msg.includes('jarnotfound')) return 'Tip jar not found.'
  if (msg.includes('reverted')) {
    const m = msg.match(/reason="([^"]+)"/)
    return m ? `Transaction failed: ${m[1]}` : 'Transaction failed. Please try again.'
  }
  if (msg.includes('network') || msg.includes('timeout'))
    return 'Network error. Check your connection and retry.'
  return 'Something went wrong. Please try again.'
}
