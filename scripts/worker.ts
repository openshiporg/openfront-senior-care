/**
 * The background worker as its own process: `npm run worker` (loop) or `npm run worker -- --once`.
 * Use it for a separate Railway worker service, with WORKER_IN_PROCESS=0 on the web service.
 */
import { PrismaClient } from '@prisma/client'
import { defaultWorkerId, mailerFromEnv, runWorkerLoop, workerTick } from '../features/keystone/lib/worker'

async function main() {
  const prisma = new PrismaClient()
  try {
    if (process.argv.includes('--once')) {
      const result = await workerTick(prisma, { workerId: defaultWorkerId('cli'), sendMail: await mailerFromEnv(), portalAcceptUrl: process.env.PORTAL_ACCEPT_URL || null })
      console.log(JSON.stringify(result))
      return
    }
    await runWorkerLoop(prisma, { workerId: defaultWorkerId('worker'), handleSignals: true })
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
