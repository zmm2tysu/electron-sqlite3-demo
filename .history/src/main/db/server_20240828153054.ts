import SQL from 'better-sqlite3'
import { ensureDirSync, removeSync } from 'fs-extra'
import { isString } from 'lodash'
import { join } from 'path'
// import { updateSchema } from './migrations';
import { consoleLogger, getSchemaVersion, getUserVersion, setUserVersion } from '../utils'

import type { Database, Statement } from 'better-sqlite3'
import type { Logger } from 'electron-log'
import { updateSchema } from './migration'
import type { ServerInterface } from './types'

const user_id_key = 1

// 预定义的一些方法
const dataInterface: ServerInterface = {
  close,
  removeDB,

  //user
  setUsers,
  getUsers,

  // Server-only

  initialize
}

export default dataInterface

type DatabaseQueryCache = Map<string, Statement<Array<unknown>>>

const statementCache = new WeakMap<Database, DatabaseQueryCache>()

function prepare<T extends unknown[] | {}>(db: Database, query: string): Statement<T> {
  let dbCache = statementCache.get(db)
  if (!dbCache) {
    dbCache = new Map()
    statementCache.set(db, dbCache)
  }

  let result = dbCache.get(query) as Statement<T>
  if (!result) {
    result = db.prepare<T>(query)
    dbCache.set(query, result)
  }

  return result
}

// 开启加密套件相关
function keyDatabase(db: Database, key: string): void {
  // https://github.com/m4heshd/better-sqlite3-multiple-ciphers/issues/14
  db.pragma(`cipher='sqlcipher'`)
  db.pragma(`legacy=4`)
  // https://www.zetetic.net/sqlcipher/sqlcipher-api/#key
  db.pragma(`key = '${key}'`)
}

function switchToWAL(db: Database): void {
  // https://sqlite.org/wal.html
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = FULL')
  db.pragma('fullfsync = ON')
}

// 数据库迭代升级的执行的迁移文件 后面要提到的
function migrateSchemaVersion(db: Database) {
  const userVersion = getUserVersion(db)

  if (userVersion > 0) return

  const schemaVersion = getSchemaVersion(db)
  const newUserVersion = schemaVersion
  logger.info(
    'migrateSchemaVersion: Migrating from schema_version ' +
      `${schemaVersion} to user_version ${newUserVersion}`
  )

  setUserVersion(db, newUserVersion)
}

// 初始化
function openAndMigrateDatabase(filePath: string, key: string) {
  let db: Database | undefined

  try {
    db = new SQL(filePath)
    keyDatabase(db, key)
    switchToWAL(db)
    migrateSchemaVersion(db)

    return db
  } catch (error) {
    logger.error(error)
    if (db) db.close()

    logger.info('migrateDatabase: Migration without cipher change failed')
    throw new Error('migrateDatabase: Migration without cipher change failed')
  }
}

const INVALID_KEY = /[^0-9A-Za-z]/
function openAndSetUpSQLCipher(filePath: string, { key }: { key: string }) {
  if (INVALID_KEY.exec(key)) throw new Error(`setupSQLCipher: key '${key}' is not valid`)

  const db = openAndMigrateDatabase(filePath, key)

  // Because foreign key support is not enabled by default!
  db.pragma('foreign_keys = ON')

  return db
}

let globalInstance: Database | undefined
let logger = consoleLogger
let databaseFilePath: string | undefined

// 主进程通知子线程要调用的初始化方法其实就是这个
async function initialize({
  configDir,
  key,
  logger: suppliedLogger
}: {
  configDir: string
  key: string
  logger: Omit<
    Logger,
    | 'log'
    | 'levels'
    | 'errorHandler'
    | 'hooks'
    | 'functions'
    | 'logId'
    | 'scope'
    | 'transports'
    | 'variables'
    | 'addLevel'
    | 'catchErrors'
    | 'create'
    | 'processMessage'
  >
}): Promise<void> {
  if (globalInstance) throw new Error('Cannot initialize more than once!')

  if (!isString(configDir)) throw new Error('initialize: configDir is required!')

  if (!isString(key)) throw new Error('initialize: key is required!')

  logger = suppliedLogger

  const dbDir = join(configDir, 'db')
  // https://github.com/isaacs/node-mkdirp#methods
  ensureDirSync(dbDir, { mode: 0o777 })

  databaseFilePath = join(dbDir, 'db.sqlite')

  logger.info(databaseFilePath)

  let db: Database | undefined

  try {
    db = openAndSetUpSQLCipher(databaseFilePath, { key })
    updateSchema(db, logger)
    globalInstance = db
  } catch (error: any) {
    logger.error('Database startup error:', error.stack)

    if (db) db.close()

    throw error
  }
}

// 下面是具体方法的实现
async function close(): Promise<void> {
  for (const dbRef of [globalInstance]) {
    // SQLLite documentation suggests that we run `PRAGMA optimize` right
    // before closing the database connection.
    dbRef?.pragma('optimize')

    dbRef?.close()
  }

  globalInstance = undefined
}

async function removeDB(): Promise<void> {
  if (globalInstance) {
    try {
      globalInstance.close()
    } catch (error: any) {
      logger.error('removeDB: Failed to close database:', error.stack)
    }
    globalInstance = undefined
  }

  if (!databaseFilePath)
    throw new Error('removeDB: Cannot erase database without a databaseFilePath!')

  logger.warn('removeDB: Removing all database files')
  removeSync(databaseFilePath)
  removeSync(`${databaseFilePath}-shm`)
  removeSync(`${databaseFilePath}-wal`)
}

function getInstance(): Database {
  if (!globalInstance) {
    throw new Error('getInstance: globalInstance not set!')
  }

  return globalInstance
}

/********************************* user ************************************/
async function setUsers(users: DB.UserInfo[]) {
  const db = getInstance()
  db.transaction((users) => {
    for (const user of users) {
      const keys = Object.keys(users[0])

      db.prepare(
        `
        INSERT OR REPLACE INTO tt_users (
          ${keys.join(',')}
        ) VALUES (
          ${keys.map((key) => `$${key}`).join(',')}
        );
      `
      ).run(user)
    }
  })(users)
}

async function getUsers(isMcn?: boolean) {
  const db = getInstance()
  let arr: number[] = []
  if (isMcn === void 0) {
    arr = []
  } else if (isMcn) {
    arr = [1]
  } else {
    arr = [0]
  }

  return db
    .prepare(
      `SELECT * FROM tt_users WHERE isDeleted = $isDeleted AND isMcn in ( ${arr.map(() => '?').join(', ')} )`
    )
    .all({ isDeleted: 0, isMcn: isMcn ? 1 : 0 }) as DB.UserInfo[]
}

// async function updateOrCreateUser(user: DB.UserAttributes) {
//   const db = getInstance();
//   const columns = { id: user_id_key, ...user };
//   const keys = Object.keys(columns);

//   const insertUser = db.prepare(
//     `
//     INSERT OR REPLACE INTO users (
//       ${keys.join(',')}
//     ) VALUES (
//       ${keys.map((key) => `$${key}`).join(',')}
//     );
//     `
//   );

//   return insertUser.run(columns);
// }

// async function getUserInfo() {
//   const db = getInstance();

//   const user = prepare(
//     db,
//     `
//       SELECT * FROM users WHERE id = $id;
//       `
//   ).get({ id: user_id_key });

//   return user as DB.UserAttributes;
// }

// async function setUserTheme(theme: Theme) {
//   const db = getInstance();
//   const update = db.prepare(`UPDATE users SET theme = $theme WHERE id = $id`);

//   return update.run({ id: user_id_key, theme });
// }
