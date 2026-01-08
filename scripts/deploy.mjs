import { Client } from 'basic-ftp'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

const FTP_HOST = process.env.FTP_HOST
const FTP_USER = process.env.FTP_USER
const FTP_PASSWORD = process.env.FTP_PASSWORD
const FTP_PORT = parseInt(process.env.FTP_PORT || '21', 10)
const FTP_REMOTE_PATH = process.env.FTP_REMOTE_PATH || '/'
const FTP_SECURE = process.env.FTP_SECURE === 'true'

if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
  console.error('Missing FTP credentials in .env file')
  console.error('Required: FTP_HOST, FTP_USER, FTP_PASSWORD')
  console.error('Optional: FTP_PORT (default: 21), FTP_REMOTE_PATH (default: /), FTP_SECURE (default: false)')
  process.exit(1)
}

async function deploy() {
  const client = new Client()
  client.ftp.verbose = true

  try {
    console.log(`\n📡 Connecting to ${FTP_HOST}:${FTP_PORT}...`)
    
    await client.access({
      host: FTP_HOST,
      port: FTP_PORT,
      user: FTP_USER,
      password: FTP_PASSWORD,
      secure: FTP_SECURE
    })

    console.log(`✅ Connected successfully\n`)
    
    const localDir = resolve(__dirname, '../packages/web/dist')
    console.log(`📂 Uploading from: ${localDir}`)
    console.log(`📂 Uploading to: ${FTP_REMOTE_PATH}\n`)

    await client.ensureDir(FTP_REMOTE_PATH)
    await client.clearWorkingDir()
    await client.uploadFromDir(localDir)

    console.log(`\n🎉 Deployment complete!`)
  } catch (err) {
    console.error(`\n❌ Deployment failed:`, err.message)
    process.exit(1)
  } finally {
    client.close()
  }
}

deploy()
