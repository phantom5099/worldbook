import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import type { Sql } from './db.js'

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url))

interface Migration {
  version: string
  file: string
}

const MIGRATIONS: readonly Migration[] = [{ version: '001_init', file: '001_init.sql' }]

/** 应用所有未登记的迁移，返回本次新应用的版本；启动引导与 `pnpm migrate` 共用这一条路径。 */
export async function ensureSchema(sql: Sql): Promise<string[]> {
  await sql`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `
  const applied = await sql<Array<{ version: string }>>`select version from schema_migrations`
  const done = new Set(applied.map((row) => row.version))
  const appliedNow: string[] = []
  for (const migration of MIGRATIONS) {
    if (done.has(migration.version)) continue
    await sql.begin(async (tx) => {
      await tx.file(`${MIGRATIONS_DIR}${migration.file}`)
      await tx`insert into schema_migrations (version) values (${migration.version}) on conflict do nothing`
    })
    appliedNow.push(migration.version)
  }
  return appliedNow
}

export async function runMigrations(url: string): Promise<string[]> {
  const sql = postgres(url)
  try {
    return await ensureSchema(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}
