/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { Dbo } from 'sqlite3-queries'

const dbPath = path.join(app.getPath('documents'), 'electron-app/db/database.db')

export const createDB = async () => {
  await fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const dbo = new Dbo(dbPath)
  await dbo.open()
}
