#!/usr/bin/env node

/**
 * Database Reset Script
 *
 * The event-driven EIL refactor replaced the entire migration history with a
 * fresh 0000 migration. A database created under the old schema still has the
 * old tables and old drizzle journal entries, so `drizzle-kit migrate` cannot
 * run against it. This script wipes the slate:
 *
 *   1. Drops every table in the `public` schema (CASCADE)
 *   2. Drops the `drizzle` bookkeeping schema (migration journal)
 *
 * Then `pnpm db:migrate` applies the new schema cleanly.
 *
 * Usage:
 *   pnpm db:reset            # dry run — lists what would be dropped
 *   pnpm db:reset --yes      # actually drop everything
 *
 * Refuses to run when VERCEL_ENV=production.
 */

import { config as loadEnv } from 'dotenv'
import postgres from 'postgres'

loadEnv({ path: '.env.local' })
loadEnv()

async function main() {
  if (process.env.VERCEL_ENV === 'production') {
    console.error('✗ Refusing to reset a production database')
    process.exit(1)
  }

  const url = process.env.POSTGRES_URL
  if (!url) {
    console.error('✗ POSTGRES_URL environment variable is required')
    process.exit(1)
  }

  const confirmed = process.argv.includes('--yes')
  const sql = postgres(url, { max: 1 })

  try {
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `
    const journal = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'drizzle'
    `

    if (tables.length === 0 && journal.length === 0) {
      console.log('✓ Database is already empty — run `pnpm db:migrate`')
      return
    }

    console.log(`Tables in public schema (${tables.length}):`)
    for (const t of tables) {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(t.table_name)}`
      console.log(`  - ${t.table_name} (${n} rows)`)
    }
    console.log(`Drizzle journal tables: ${journal.length}`)

    if (!confirmed) {
      console.log('\nDry run — nothing dropped. Re-run with --yes to drop everything, then run `pnpm db:migrate`.')
      return
    }

    for (const t of tables) {
      await sql`drop table if exists ${sql(t.table_name)} cascade`
    }
    await sql`drop schema if exists drizzle cascade`

    console.log('\n✓ Dropped all public tables and the drizzle migration journal')
    console.log('  Next: pnpm db:migrate')
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error('✗ Reset failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
