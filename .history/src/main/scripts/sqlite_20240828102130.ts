import { Dbo } from 'sqlite3-queries'

export const createDB = async () => {
  const dbo = new Dbo()
  await dbo.open()
}
