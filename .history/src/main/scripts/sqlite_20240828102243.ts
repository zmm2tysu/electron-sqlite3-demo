/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { app } from 'electron'
import path from 'path'
import { Dbo } from 'sqlite3-queries'

export const createDB = async () => {
  const dbo = new Dbo(path.join(app.getPath('documents'), 'electron-app/db.sqlite'))
  await dbo.open()
}
