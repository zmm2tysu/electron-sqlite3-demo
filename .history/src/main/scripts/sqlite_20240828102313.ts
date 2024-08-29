/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Dbo } from 'sqlite3-queries'

export const createDB = async () => {
  const dbo = new Dbo()
  await dbo.open()
}
