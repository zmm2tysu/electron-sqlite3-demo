/* eslint-disable @typescript-eslint/explicit-function-return-type */
import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const dbPath = path.join(app.getPath('documents'), 'electron-app/db/database.db')

export const createDB = async () => {
  await fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  //创建user表
  // db.exec(`
  //   CREATE TABLE IF NOT EXISTS user (
  //     id INTEGER PRIMARY KEY AUTOINCREMENT,
  //     name TEXT NOT NULL,
  //     age INTEGER NOT NULL
  //   )
  // `)
}
