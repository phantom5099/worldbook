import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import type { Sql } from './db.js'

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url))

export interface Migration {
  version: string
  file: string
}

export const MIGRATIONS: readonly Migration[] = [{ version: '001_init', file: '001_init.sql' }]

export async function ensureSchema(sql: Sql): Promise<void> {
  await sql.file(`${MIGRATIONS_DIR}001_init.sql`)
}

export async function runMigrations(url: string): Promise<string[]> {
  const sql = postgres(url)
  try {
    await sql`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `
    const applied = await sql`select version from schema_migrations`
    const done = new Set(applied.map((row) => row.version))
    const appliedNow: string[] = []
    for (const migration of MIGRATIONS) {
      if (done.has(migration.version)) continue
      await sql.begin(async (tx) => {
        await tx.file(`${MIGRATIONS_DIR}${migration.file}`)
        await tx`insert into schema_migrations (version) values (${migration.version})`
      })
      appliedNow.push(migration.version)
    }
    return appliedNow
  } finally {
    await sql.end({ timeout: 5 })
  }
}
