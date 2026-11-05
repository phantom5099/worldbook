# db

postgres.js 连接池封装。源码 `src/db.ts`（DbService）、`src/migrate.ts`（ensureSchema + runMigrations）、`../migrations/001_init.sql`（DDL 唯一来源）、`index.ts`（仅 re-export），测试在 `../session/test/pg-store.test.ts`（需要 `DATABASE_URL`，缺失时跳过）。

## 职责与边界

- `DbService` 是全工程唯一的数据库出口：其他模块不得直接 import `postgres`。
- `ensureSchema(sql)` 幂等执行 `migrations/001_init.sql`（sessions / session_events DDL），启动引导与集成测试使用。
- `runMigrations(url)`：版本化迁移入口，`schema_migrations` 表记录已应用版本，事务内逐版本应用；正式环境经根目录 `pnpm migrate`（scripts/migrate.ts）执行，新迁移加 SQL 文件并在 `MIGRATIONS` 数组登记。
- 本模块不理解业务：事件类型、seq 语义都在 `session` 模块。

## 注意

- postgres 是 v4 主版本：模板标签查询的行类型泛型必须传数组（`sql<Array<{...}>>`）。
- 无本地 PG 时所有集成测试 skip；需要实库时设 `DATABASE_URL` 后运行。
