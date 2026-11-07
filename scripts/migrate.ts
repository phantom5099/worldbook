import { runMigrations } from '@worldbook/db'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('缺少环境变量 DATABASE_URL。')
  process.exitCode = 1
} else {
  runMigrations(url)
    .then((applied) => {
      console.log(
        applied.length > 0
          ? `已应用迁移：${applied.join(', ')}`
          : '无待应用迁移，数据库结构已是最新。',
      )
    })
    .catch((err: unknown) => {
      console.error(err)
      process.exitCode = 1
    })
}
