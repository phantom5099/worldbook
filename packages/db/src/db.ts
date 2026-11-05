import postgres from 'postgres'

export type Sql = postgres.Sql

export class DbService {
  readonly sql: postgres.Sql

  constructor(url: string) {
    this.sql = postgres(url)
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 })
  }
}
