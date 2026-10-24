import { useState, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import OwnerTab from './components/OwnerTab'
import StaffTab from './components/StaffTab'
import TipPage from './components/TipPage'
import DeployPage from './components/DeployPage'
import { ACTIVE_NETWORK_NAME, IS_MAINNET } from './network'
import { isMainnetDeployed } from './contract'

type Tab = 'owner' | 'staff'

function parseJarIdFromHash(): string | null {
  const hash = window.location.hash
  const match = hash.match(/^#\/tip\/(\d+)$/)
  return match ? match[1] : null
}

export default function App() {
  const [tab, setTab] = useState<Tab>('owner')
  const [tipJarId, setTipJarId] = useState<string | null>(parseJarIdFromHash)
  // On mainnet, show DeployPage until a contract address is available.
  const [mainnetDeployed, setMainnetDeployed] = useState(isMainnetDeployed)
  const showDeployPage = IS_MAINNET && !mainnetDeployed

  // Support navigating to /tip/:id via URL hash
  useEffect(() => {
    const handleHashChange = () => {
      setTipJarId(parseJarIdFromHash())
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const goBack = () => {
    window.location.hash = ''
    setTipJarId(null)
  }

  // Update hash when navigating away
  useEffect(() => {
    if (!tipJarId) {
      // Only clear hash if it was a tip hash
      if (window.location.hash.startsWith('#/tip/')) {
        history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
  }, [tipJarId])

  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)' }}
    >
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: '5%',
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '8%',
            right: '8%',
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)',
            filter: 'blur(58px)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-10 pt-6">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TokenUSDC variant="branded" size={28} />
            <span className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
              TipJar Split
            </span>
          </div>
          <ConnectKitButton />
        </header>

        {/* Tip page or tabbed UI */}
        {showDeployPage ? (
          <DeployPage onDeployed={() => setMainnetDeployed(true)} />
        ) : tipJarId !== null ? (
          <TipPage jarId={tipJarId} onBack={goBack} />
        ) : (
          <>
            {/* Tab bar */}
            <div
              className="mb-5 flex rounded-2xl p-1"
              style={{
                background: 'rgba(255,255,255,0.46)',
                border: '1px solid rgba(255,255,255,0.56)',
              }}
            >
              {(['owner', 'staff'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all"
                  style={
                    tab === t
                      ? { background: 'var(--accent)', color: 'white' }
                      : { color: 'var(--muted)' }
                  }
                >
                  {t === 'owner' ? 'Owner' : 'Staff'}
                </button>
              ))}
            </div>

            {tab === 'owner'
              ? <OwnerTab onOpenTipPage={(id) => { window.location.hash = `#/tip/${id}` }} />
              : <StaffTab />}
          </>
        )}

        {/* Footer */}
        <p className="mt-8 text-center text-xs" style={{ color: 'var(--subtle)' }}>
          Tips split on-chain · {ACTIVE_NETWORK_NAME} · USDC
        </p>
      </div>
    </div>
  )
}
