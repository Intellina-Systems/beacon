import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type Db = ReturnType<typeof drizzle<typeof schema>>

// Reuse one postgres client across dev HMR reloads and serverless warm
// invocations — otherwise every module re-evaluation opens a fresh pool
// (10 conns each by default) and exhausts the pooler's client limit.
const globalForDb = globalThis as unknown as { __beaconSql?: ReturnType<typeof postgres> }

function createClient() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required')
  }
  return postgres(process.env.POSTGRES_URL, {
    max: 5, // small bounded pool; plenty for per-request bursts of parallel queries
    idle_timeout: 20, // release idle conns back to the pooler after 20s
    connect_timeout: 10,
    prepare: false, // compatible with transaction-mode poolers (PgBouncer/Supavisor)
  })
}

let _db: Db | null = null

export const db = new Proxy({} as Db, {
  get(target, prop) {
    if (!_db) {
      const client = globalForDb.__beaconSql ?? createClient()
      if (process.env.NODE_ENV !== 'production') globalForDb.__beaconSql = client
      _db = drizzle(client, { schema })
    }
    return Reflect.get(_db, prop)
  },
})
