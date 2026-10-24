/**
 * One-time entity secret registration script.
 * Run with: bun run scripts/register-entity-secret.ts
 *
 * Requires CIRCLE_API_KEY. Reads from .private-secrets/.env (preferred) then
 * falls back to the standard .env loaded by Bun at startup.
 * Writes CIRCLE_ENTITY_SECRET to .private-secrets/.env and the recovery file
 * to .private-secrets/.circle/recovery_file.dat — never inside the app tree.
 *
 * NEVER run this more than once — it is non-idempotent and will invalidate any
 * previously registered secret and recovery file.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { registerEntitySecretCiphertext } from '@circle-fin/developer-controlled-wallets'

// Load private env vars (Circle credentials live here, not in app/.env).
// Bun loads app/.env at startup; this supplements it with the private file.
const privateEnvPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.private-secrets/.env')
if (fs.existsSync(privateEnvPath)) {
  for (const line of fs.readFileSync(privateEnvPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const apiKey = process.env.CIRCLE_API_KEY
if (!apiKey) {
  console.error('ERROR: CIRCLE_API_KEY is not set in environment.')
  process.exit(1)
}

// Generate 32-byte secret — captured in memory, never printed to stdout
const entitySecret = crypto.randomBytes(32).toString('hex')

const recoveryDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.private-secrets/.circle')
fs.mkdirSync(recoveryDir, { recursive: true })

console.log('Registering entity secret ciphertext with Circle...')

const response = await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: recoveryDir,
})

if (!response.data) {
  console.error('ERROR: Registration failed — no data in response.')
  console.error(JSON.stringify(response, null, 2))
  process.exit(1)
}

// Write recovery file
const recoveryPath = path.join(recoveryDir, 'recovery_file.dat')
if (response.data.recoveryFile) {
  fs.writeFileSync(recoveryPath, response.data.recoveryFile, 'utf-8')
}

// Append secret to .private-secrets/.env — never to the public app/.env
const privateEnvWritePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.private-secrets/.env')
fs.appendFileSync(privateEnvWritePath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, 'utf-8')

console.log('Registration successful.')
console.log(`Recovery file written to: ${recoveryPath}`)
console.log('CIRCLE_ENTITY_SECRET appended to .private-secrets/.env')

// Verify by calling a read-only endpoint with the new credentials
const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets')
const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
const verify = await client.listWalletSets({ pageSize: 1 })
if (verify.data) {
  console.log('Verification OK — entity secret is registered and working.')
} else {
  console.error('WARNING: Verification call returned unexpected result.')
}
