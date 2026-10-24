/**
 * Creates a TipjarSplit deployer wallet on Arc mainnet (read-only report after creation).
 * Run once. Idempotent: if a wallet set named "TipjarSplit Deployer" already exists,
 * it lists the first wallet in it rather than creating a duplicate.
 * Never prints secrets. Never sends transactions.
 */
import fs from 'node:fs'
import path from 'node:path'
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

// Load Circle credentials from .private-secrets/.env (not committed with the app)
const privateEnvPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.private-secrets/.env')
if (fs.existsSync(privateEnvPath)) {
  for (const line of fs.readFileSync(privateEnvPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const WALLET_SET_NAME = 'TipjarSplit Deployer'
// Arc mainnet blockchain identifier used by Circle's API
const ARC_MAINNET_BLOCKCHAIN = 'ARC'

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET

  if (!apiKey || apiKey.length < 10) throw new Error('CIRCLE_API_KEY not set')
  if (!entitySecret || entitySecret.length !== 64) throw new Error('CIRCLE_ENTITY_SECRET not set or wrong length')

  const sdk = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

  // --- 1. Find or create a wallet set ---
  let walletSetId: string | undefined

  const existingSets = await sdk.listWalletSets({ pageSize: 20 })
  const match = existingSets.data?.walletSets?.find(
    // SDK type has walletSet as DeveloperWalletSet (no .name) at runtime; cast to read it
    (ws) => (ws as { name?: string }).name === WALLET_SET_NAME,
  )

  if (match) {
    walletSetId = match.id
    console.log(`Using existing wallet set: ${walletSetId} ("${WALLET_SET_NAME}")`)
  } else {
    const created = await sdk.createWalletSet({ name: WALLET_SET_NAME })
    walletSetId = created.data?.walletSet?.id
    console.log(`Created wallet set: ${walletSetId} ("${WALLET_SET_NAME}")`)
  }

  if (!walletSetId) throw new Error('Could not get walletSetId')

  // --- 2. Find or create a wallet on Arc mainnet ---
  let walletAddress: string | undefined
  let walletId: string | undefined
  let walletBlockchain: string | undefined

  const existingWallets = await sdk.listWallets({
    walletSetId,
    blockchain: ARC_MAINNET_BLOCKCHAIN,
    pageSize: 5,
  })
  const existingWallet = existingWallets.data?.wallets?.[0]

  if (existingWallet) {
    walletAddress = existingWallet.address
    walletId = existingWallet.id
    walletBlockchain = existingWallet.blockchain
    console.log('Using existing wallet on ARC mainnet.')
  } else {
    const newWallet = await sdk.createWallets({
      accountType: 'EOA',
      blockchains: [ARC_MAINNET_BLOCKCHAIN],
      count: 1,
      walletSetId,
    })
    const w = newWallet.data?.wallets?.[0]
    walletAddress = w?.address
    walletId = w?.id
    walletBlockchain = w?.blockchain
    console.log('Created new wallet on ARC mainnet.')
  }

  if (!walletAddress || !walletId) throw new Error('Could not get wallet address')

  // --- 3. Read USDC token balance (read-only, no tx) ---
  let usdcBalance = '0'
  try {
    const balRes = await sdk.getWalletTokenBalance({ id: walletId })
    const tokens = balRes.data?.tokenBalances ?? []
    // USDC on Arc: symbol USDC or address 0x3600...0000
    const usdcToken = tokens.find(
      (t) => {
        const tok = t.token as { symbol?: string; address?: string } | undefined
        return (
          tok?.symbol?.toUpperCase() === 'USDC' ||
          tok?.address?.toLowerCase() === '0x3600000000000000000000000000000000000000'
        )
      },
    )
    usdcBalance = usdcToken?.amount ?? '0'
  } catch {
    usdcBalance = '(not yet funded — 0)'
  }

  // --- 4. Report (no secrets, no private keys) ---
  console.log('\n========== ARC MAINNET DEPLOYER WALLET ==========')
  console.log(`Wallet ID:           ${walletId}`)
  console.log(`Address:             ${walletAddress}`)
  console.log(`Blockchain:          ${walletBlockchain}`)
  console.log(`Wallet Set:          ${WALLET_SET_NAME} (${walletSetId})`)
  console.log(`USDC balance:        ${usdcBalance}`)
  console.log('=================================================')
  console.log('\nFund this address with USDC on Arc mainnet before deploying.')
  console.log('Explorer: https://explorer.arc.io/address/' + walletAddress)
  console.log('\nNOTE: No deployment or transaction was submitted.')
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  console.error('Error:', msg)
  process.exit(1)
})
