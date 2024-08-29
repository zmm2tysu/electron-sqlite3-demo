import type { Database } from 'better-sqlite3'
import type { LogFunctions } from 'electron-log'
import { getSchemaVersion, getSQLCipherVersion, getSQLiteVersion, getUserVersion } from '../utils'

function updateToSchemaVersion1(
  currentVersion: number,
  db: Database,
  logger: Omit<LogFunctions, 'log'>
) {
  if (currentVersion >= 1) return

  logger.info('updateToSchemaVersion1: starting...')

  db.transaction(() => {
    // table users
    db.exec(`
      CREATE TABLE tt_users (
        awemeNo VARCHAR(30) NOT NULL PRIMARY KEY,
        nickname VARCHAR(128) NULL,
        avatar TEXT NULL,
        mcnId VARCHAR(30) NULL,
        cookies TEXT NULL
      );
    `)

    db.pragma('user_version = 1')
  })()

  logger.info('updateToSchemaVersion1: success!')
}

function updateToSchemaVersion2(
  currentVersion: number,
  db: Database,
  logger: Omit<LogFunctions, 'log'>
) {
  if (currentVersion >= 2) return

  logger.info('updateToSchemaVersion2: starting...')

  db.transaction(() => {
    db.exec(`
      ALTER TABLE tt_users ADD COLUMN
      isMcn INTEGER NULL DEFAULT 0
    `)
    db.exec(`
      ALTER TABLE tt_users ADD COLUMN
      createTime INTEGER NULL
    `)
    db.exec(`
      ALTER TABLE tt_users ADD COLUMN
      updateTime INTEGER NULL
    `)
    db.exec(`
      ALTER TABLE tt_users ADD COLUMN
      isDeleted INTEGER NULL DEFAULT 0
    `)

    db.pragma('user_version = 2')
  })()

  logger.info('updateToSchemaVersion2: success!')
}

export const SCHEMA_VERSIONS = [updateToSchemaVersion1, updateToSchemaVersion2]

export function updateSchema(db: Database, logger: Omit<LogFunctions, 'log'>): void {
  const sqliteVersion = getSQLiteVersion(db)
  const sqlcipherVersion = getSQLCipherVersion(db)
  const userVersion = getUserVersion(db)
  const maxUserVersion = SCHEMA_VERSIONS.length
  const schemaVersion = getSchemaVersion(db)

  logger.info(
    'updateSchema:\n',
    ` Current user_version: ${userVersion};\n`,
    ` Most recent db schema: ${maxUserVersion};\n`,
    ` SQLite version: ${sqliteVersion};\n`,
    ` SQLCipher version: ${sqlcipherVersion};\n`,
    ` (deprecated) schema_version: ${schemaVersion};\n`
  )

  if (userVersion > maxUserVersion) {
    throw new Error(
      `SQL: User version is ${userVersion} but the expected maximum version ` +
        `is ${maxUserVersion}. Did you try to start an old version of App?`
    )
  }

  for (let index = 0; index < maxUserVersion; index += 1) {
    const runSchemaUpdate = SCHEMA_VERSIONS[index]

    runSchemaUpdate(userVersion, db, logger)
  }
}
