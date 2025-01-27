import SQL from 'better-sqlite3'
import { ensureDirSync, removeSync } from 'fs-extra'
import { isString } from 'lodash'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { consoleLogger } from '../utils/consoleLogger'
import { updateSchema } from './migrations'
import { getSchemaVersion, getUserVersion, setUserVersion } from './util'

import type { Database, Statement } from 'better-sqlite3'
import type { LogFunctions } from 'electron-log'
import type { ServerInterface } from './types'

const user_id_key = 1

const dataInterface: ServerInterface = {
  close,
  removeDB,

  // // user
  // updateOrCreateUser,
  // getUserInfo,
  // setUserTheme,

  // // friends
  // setFriends,
  // // setFriendsSync,
  // getFriend,
  // // getFriendSync,
  // getFriends,
  // // getFriendsSync,
  // updateFriendInfo,
  // // updateFriendInfoSync,
  // removeFriends,
  // // removeFriendsSync,

  // // groups
  // setGroups,
  // setGroupsIncludeMembers,
  // setGroup,
  // setGroupIncludeMembers,
  // getGroup,
  // // getGroupSync,
  // getGroupWithMembers,
  // getMembersByGroupId,
  // getGroups,
  // getGroupsIncludeMembers,

  // // messages
  // setMessage,
  // setMessages,
  // getMessagesBySender,
  // removeMessageByMsgIds,
  // removeMessagesBySender,
  // removeMessages,

  // // conversations
  // getLastConversationMessage,
  // // getLastConversationMessageSync,
  // createConversation,
  // updateConvActiveAtWithValue,
  // updateConversationActiveAt,
  // // updateConversationActiveAtSync,
  // updateConversationLastRead,
  // // updateConversationLastReadSync,
  // removeConversationById,
  // removeConversations,
  // // removeConversationsSync,
  // getConversations,
  // getConversationsWithAll,
  // // getConversationsWithAllSync,
  // getTotalUnreadForConversation,
  // // getTotalUnreadForConversationSync,
  // getTotalUnreadCount,

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

async function initialize({
  configDir,
  key,
  logger: suppliedLogger
}: {
  configDir: string
  key: string
  logger: Omit<LogFunctions, 'log'>
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
  } catch (error) {
    logger.error('Database startup error:', error.stack)

    if (db) db.close()

    throw error
  }
}

async function close(): Promise<void> {
  // SQLLite documentation suggests that we run `PRAGMA optimize` right
  // before closing the database connection.
  globalInstance?.pragma('optimize')

  globalInstance?.close()

  globalInstance = undefined
}

async function removeDB(): Promise<void> {
  if (globalInstance) {
    try {
      globalInstance.close()
    } catch (error) {
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
async function updateOrCreateUser(user: DB.UserAttributes) {
  const db = getInstance()
  const columns = { id: user_id_key, ...user }
  const keys = Object.keys(columns)

  db.prepare(
    `
    INSERT OR REPLACE INTO users (
      ${keys.join(',')}
    ) VALUES (
      ${keys.map((key) => `$${key}`).join(',')}
    );
    `
  ).run(columns)
}

async function getUserInfo() {
  const db = getInstance()

  const user = prepare(
    db,
    `
      SELECT * FROM users WHERE id = $id;
      `
  ).get({ id: user_id_key })

  return user as DB.UserAttributes
}

async function setUserTheme(theme: Theme): Promise<void> {
  const db = getInstance()
  db.prepare(`UPDATE users SET theme = $theme WHERE id = $id;`).run({
    id: user_id_key,
    theme
  })
}

/**
 * @description: Cache user friends info to db (async).
 * @param owner number
 * @param friends DB.UserWithFriendSetting[]
 * @return Promise<void>
 */
async function setFriends(owner: number, friends: DB.UserWithFriendSetting[]): Promise<void> {
  setFriendsSync(owner, friends)
}

/**
 * @description: Cache user friends info to db (sync).
 * @param owner number
 * @param friends DB.UserWithFriendSetting[]
 * @return void
 */
function setFriendsSync(owner: number, friends: DB.UserWithFriendSetting[]): void {
  const db = getInstance()
  console.log(owner)
  console.log(friends)
  db.transaction(() => {
    for (const friend of friends) {
      const {
        id,
        remark,
        astrolabe,
        block,
        createdAt,
        updatedAt,
        account,
        avatar,
        email,
        regisTime,
        updateTime
      } = friend
      db.prepare(
        `
        INSERT INTO friends (
          owner, id, remark, astrolabe, block, createdAt, updatedAt
        ) VALUES (
          $owner, $id, $remark, $astrolabe, $block, $createdAt, $updatedAt
        );
        `
      ).run({
        owner,
        id,
        remark,
        astrolabe: astrolabe ? 1 : 0,
        block: block ? 1 : 0,
        createdAt,
        updatedAt
      })

      db.prepare(
        `
        INSERT OR REPLACE INTO userInfos (
          id, account, avatar, email, regisTime, updateTime
        ) VALUES (
          $id, $account, $avatar, $email, $regisTime, $updateTime
        );
        `
      ).run({
        id,
        account,
        avatar,
        email,
        regisTime,
        updateTime
      })
    }
  })()
}

/**
 * @description: Get friend info by friend' id (async).
 * @param owner number
 * @param id number
 * @return Promise<DB.UserWithFriendSetting>
 */
async function getFriend(owner: number, id: number): Promise<DB.UserWithFriendSetting> {
  return getFriendSync(owner, id)
}

/**
 * @description: Get friend info by friend' id (sync).
 * @param owner number
 * @param id number
 * @return DB.UserWithFriendSetting
 */
function getFriendSync(owner: number, id: number): DB.UserWithFriendSetting {
  const db = getInstance()

  const friend = db
    .prepare(
      `
      SELECT
        Info.id,
        Info.account,
        Info.avatar,
        Info.email,
        Info.regisTime,
        Info.updateTime,
        Friend.remark,
        Friend.astrolabe,
        Friend.block,
        Friend.createdAt,
        Friend.updatedAt
      FROM friends AS Friend
      LEFT OUTER JOIN userInfos AS Info ON Friend.id = Info.id
      WHERE Friend.owner = $owner AND Friend.id = $id
      `
    )
    .get({ owner, id }) as DB.UserWithFriendSetting

  return friend
}

/**
 * @description: Get user friends info (async).
 * @param owner number
 * @return Promise<DB.UserWithFriendSetting[]>
 */
async function getFriends(owner: number): Promise<DB.UserWithFriendSetting[]> {
  return getFriendsSync(owner)
}

/**
 * @description: Get user friends info (sync).
 * @param owner number
 * @return DB.UserWithFriendSetting[]
 */
function getFriendsSync(owner: number): DB.UserWithFriendSetting[] {
  const db = getInstance()

  const friends = db
    .prepare(
      `
      SELECT
        Info.id,
        Info.account,
        Info.avatar,
        Info.email,
        Info.regisTime,
        Info.updateTime,
        Friend.remark,
        Friend.astrolabe,
        Friend.block,
        Friend.createdAt,
        Friend.updatedAt
      FROM friends AS Friend
      LEFT OUTER JOIN userInfos AS Info ON Friend.id = Info.id
      WHERE Friend.owner = $owner
      `
    )
    .all({ owner }) as DB.UserWithFriendSetting[]

  return friends
}

/**
 * @description: Update user friend info by id (async).
 * @param owner number
 * @param info DB.FriendSetting & { id: number }
 * @return Promise<void>
 */
async function updateFriendInfo(
  owner: number,
  info: DB.FriendSetting & { id: number }
): Promise<void> {
  updateFriendInfoSync(owner, info)
}

/**
 * @description: Update user friend info by id (sync).
 * @param owner number
 * @param info DB.FriendSetting & { id: number }
 * @return void
 */
function updateFriendInfoSync(owner: number, info: DB.FriendSetting & { id: number }): void {
  const db = getInstance()

  const { id, remark, astrolabe, block, createdAt, updatedAt } = info

  db.prepare(
    `
    UPDATE friends SET
      remark = $remark,
      astrolabe = $astrolabe,
      block = $remark,
      createdAt = $createdAt,
      updatedAt = $updatedAt,
    WHERE owner = $owner AND id = $id
    `
  ).run({ owner, id, remark, astrolabe, block, createdAt, updatedAt })
}

/**
 * @description: Remove user friends (async).
 * @param owner number
 * @param id number | number[]
 * @return Promise<void>
 */
async function removeFriends(owner: number, id: number | number[]): Promise<void> {
  removeFriendsSync(owner, id)
}

/**
 * @description: Remove user friends (sync).
 * @param owner number
 * @param id number | number[]
 * @return void
 */
function removeFriendsSync(owner: number, id: number | number[]): void {
  const db = getInstance()

  if (!Array.isArray(id)) {
    db.prepare(
      `
      DELETE FROM friends WHERE owner = $owner AND id = $id;
      `
    ).run({ owner, id })

    return
  }

  if (!id.length) return

  db.prepare(
    `
    DELETE FROM friends
    WHERE owner = $owner AND id IN ( ${id.map(() => '?').join(', ')} );
    `
  ).run(id, { owner })
}

/**
 * @description: Cache groups info to db (not include members).
 * @param groups ModuleIM.Core.GroupBasic[]
 * @return Promise<void>
 */
async function setGroups(groups: ModuleIM.Core.GroupBasic[]): Promise<void> {
  const db = getInstance()
  const insert = db.prepare(
    `INSERT OR REPLACE INTO groups (
      id, name, avatar, type, creator, count, createdAt, updatedAt
    ) VALUES (
      $id, $name, $avatar, $type, $creator, $count, $createdAt, $updatedAt
    );`
  )

  db.transaction((groups: ModuleIM.Core.GroupBasic[]) => {
    for (const group of groups) insert.run(group)
  })(groups)
}

/**
 * @description:  Cache groups info to db (include members).
 * @param groups Array<ModuleIM.Core.GroupBasic & { members: DB.UserInfo[] }>
 * @return Promise<void>
 */
async function setGroupsIncludeMembers(
  groups: Array<ModuleIM.Core.GroupBasic & { members: DB.UserInfo[] }>
): Promise<void> {
  const db = getInstance()

  db.transaction((groups: Array<ModuleIM.Core.GroupBasic & { members: DB.UserInfo[] }>) => {
    for (const group of groups) {
      const { members } = group

      db.prepare(
        `INSERT OR REPLACE INTO groups (
            id, name, avatar, type, creator, count, members, createdAt, updatedAt
          ) VALUES (
            $id, $name, $avatar, $type, $creator, $count, $members, $createdAt, $updatedAt
          );`
      ).run({
        ...group,
        members: members.map((member) => member.id).join(' ')
      })

      for (const member of members) {
        db.prepare(
          `
            INSERT OR REPLACE INTO userInfos (
              id,
              account,
              avatar,
              email,
              regisTime,
              updateTime
            ) VALUES (
              $id,
              $account,
              $avatar,
              $email,
              $regisTime,
              $updateTime
            )
            `
        ).run(member)
      }
    }
  })(groups)
}

/**
 * @description: Insert or update a group info (not include members).
 * @param group ModuleIM.Core.GroupBasic
 * @return Promise<void>
 */
async function setGroup(group: ModuleIM.Core.GroupBasic): Promise<void> {
  const db = getInstance()
  db.prepare(
    `INSERT OR REPLACE INTO groups (
      id, name, avatar, type, creator, count, createdAt, updatedAt
    ) VALUES (
      $id, $name, $avatar, $type, $creator, $count, $createdAt, $updatedAt
    );`
  ).run(group)
}

/**
 * @description: Insert or update a group info (include members).
 * @param group ModuleIM.Core.GroupBasic & { members: DB.UserInfo[] }
 * @return Promise<void>
 */
async function setGroupIncludeMembers(
  group: ModuleIM.Core.GroupBasic & { members: DB.UserInfo[] }
): Promise<void> {
  const db = getInstance()
  db.transaction((group: ModuleIM.Core.GroupBasic & { members: DB.UserInfo[] }) => {
    const { members } = group

    db.prepare(
      `
        INSERT OR REPLACE INTO groups (
          id, name, avatar, type, creator, count, members, createdAt, updatedAt
        ) VALUES (
          $id, $name, $avatar, $type, $creator, $count, $members, $createdAt, $updatedAt
        );
        `
    ).run({
      ...group,
      members: members.map((member) => member.id).join(' ')
    })

    for (const member of members) {
      db.prepare(
        `
            INSERT OR REPLACE INTO userInfos (
              id,
              account,
              avatar,
              email,
              regisTime,
              updateTime
            ) VALUES (
              $id,
              $account,
              $avatar,
              $email,
              $regisTime,
              $updateTime
            )
            `
      ).run(member)
    }
  })(group)
}

/**
 * @description: Get group info not include members.
 * @param groupId number
 * @return ModuleIM.Core.GroupBasic
 */
async function getGroup(groupId: number): Promise<ModuleIM.Core.GroupBasic> {
  return getGroupSync(groupId)
}

/**
 * @description: Get group info not include members (sync).
 * @param groupId number
 * @return ModuleIM.Core.GroupBasic
 */
function getGroupSync(groupId: number): ModuleIM.Core.GroupBasic {
  const db = getInstance()

  const group = db
    .prepare(
      `
        SELECT id, name, avatar, type, creator, count, members, createAt, updateAt
        FROM groups WHERE id = $groupId;
      `
    )
    .get({ groupId }) as ModuleIM.Core.GroupBasic

  return group
}

/**
 * @description: Get group info include members.
 * @param owner number
 * @param groupId number
 * @return ModuleIM.Core.GroupBasic & { members: DB.UserWithFriendSetting[] }
 */
async function getGroupWithMembers(
  owner: number,
  groupId: number
): Promise<(ModuleIM.Core.GroupBasic & { members: DB.UserWithFriendSetting[] }) | undefined> {
  const db = getInstance()

  const row = db
    .prepare(
      `
      SELECT id, name, avatar, type, creator, count, members, createAt, updateAt
      FROM groups WHERE id = $groupId;
      `
    )
    .get({ groupId }) as ModuleIM.Core.GroupBasic & { members: string }

  if (!row) return undefined

  const ids = row.members.split(' ').map((id) => parseInt(id))

  const members = db
    .prepare(
      `
      SELECT
        Info.id,
        Info.account,
        Info.avatar,
        Info.email,
        Info.regisTime,
        Info.updateTime,
        Friend.remark,
        Friend.astrolabe,
        Friend.block,
        Friend.createdAt,
        Friend.updatedAt
      FROM userInfos AS Info
      LEFT OUTER JOIN friends AS Friend ON Friend.owner = $owner AND Friend.id = Info.id
      WHERE Info.id IN (
        ${ids.map(() => '?').join(', ')}
      )
      `
    )
    .all({
      owner
    }) as DB.UserWithFriendSetting[]

  return { ...row, members }
}

/**
 * @description: Get group members by groupId.
 * @param owner number
 * @param groupId number
 * @return Promise<DB.UserWithFriendSetting[]>
 */
async function getMembersByGroupId(
  owner: number,
  groupId: number
): Promise<DB.UserWithFriendSetting[]> {
  const db = getInstance()
  const row = db
    .prepare(
      `
      SELECT members
      FROM groups WHERE id = $groupId;
      `
    )
    .get({ groupId }) as { members: string }

  if (!row) return []

  const ids = row.members.split(' ').map((id) => parseInt(id))

  const members = db
    .prepare(
      `
      SELECT
        Info.id,
        Info.account,
        Info.avatar,
        Info.email,
        Info.regisTime,
        Info.updateTime,
        Friend.remark,
        Friend.astrolabe,
        Friend.block,
        Friend.createdAt,
        Friend.updatedAt
      FROM userInfos AS Info
      LEFT OUTER JOIN friends AS Friend ON Friend.owner = $owner AND Friend.id = Info.id
      WHERE Info.id IN (
        ${ids.map(() => '?').join(', ')}
      )
      `
    )
    .all({ owner }) as DB.UserWithFriendSetting[]

  return members
}

/**
 * @description: Get user all groups (not include members).
 * @param userId number
 * @return Promise<Array<ModuleIM.Core.GroupBasic>>
 */
async function getGroups(userId: number): Promise<Array<ModuleIM.Core.GroupBasic>> {
  const db = getInstance()
  const groups = db
    .prepare(
      `
      SELECT id, name, avatar, type, creator, count, createdAt, updatedAt
      FROM groups
      WHERE members LIKE $userId
      ORDER BY name ASC;
      `
    )
    .all({
      userId: `%${userId}%`
    }) as Array<ModuleIM.Core.GroupBasic>

  return groups
}

/**
 * @description: Get user all groups (include members).
 * @param userId number
 * @return Promise<Array<ModuleIM.Core.GroupBasic & { members: DB.UserInfo[] }>>
 */
async function getGroupsIncludeMembers(
  userId: number
): Promise<Array<ModuleIM.Core.GroupBasic & { members: DB.UserWithFriendSetting[] }>> {
  const db = getInstance()
  const groups = db
    .prepare(
      `
      SELECT id, name, avatar, type, creator, count, members, createdAt, updatedAt
      FROM groups
      WHERE members LIKE $userId
      ORDER BY name ASC;
      `
    )
    .all({
      userId: `%${userId}%`
    }) as Array<ModuleIM.Core.GroupBasic & { members: string }>

  if (!groups || !groups.length) return []

  return db.transaction((groups: Array<ModuleIM.Core.GroupBasic & { members: string }>) => {
    const result: Array<ModuleIM.Core.GroupBasic & { members: DB.UserWithFriendSetting[] }> = []

    for (const group of groups) {
      const ids = group.members.split(' ').map((id) => parseInt(id))

      const members = db
        .prepare(
          `
            SELECT
              Info.id,
              Info.account,
              Info.avatar,
              Info.email,
              Info.regisTime,
              Info.updateTime,
              Friend.remark,
              Friend.astrolabe,
              Friend.block,
              Friend.createdAt,
              Friend.updatedAt
            FROM userInfos AS Info
            LEFT OUTER JOIN friends AS Friend ON Friend.owner = $owner AND Friend.id = Info.id
            WHERE Info.id IN (
              ${ids.map(() => '?').join(', ')}
            )
            `
        )
        .all({ owner: userId }) as DB.UserWithFriendSetting[]

      result.push({ ...group, members })
    }

    return result
  })(groups)
}

/**
 * @description: Set a message into db.
 * @param owner number
 * @param message ModuleIM.Core.MessageBasic
 * @return Promise<void>
 */
async function setMessage(owner: number, message: ModuleIM.Core.MessageBasic): Promise<void> {
  const db = getInstance()
  const columns = Object.keys(message)

  db.prepare(
    `
    INSERT INTO messages (
      owner, ${columns.join(',')}
    ) VALUES (
      owner, ${columns.map((column) => `$${column}`).join(',')}
    );
    `
  ).run({ ...message, owner })
}

/**
 * @description: Set messages into db.
 * @param owner number
 * @param message ModuleIM.Core.MessageBasic[]
 * @return Promise<void>
 */
async function setMessages(owner: number, messages: ModuleIM.Core.MessageBasic[]): Promise<void> {
  const db = getInstance()

  db.transaction((messages: ModuleIM.Core.MessageBasic[]) => {
    for (const message of messages)
      db.prepare(
        `
        INSERT INTO messages (
          msgId,
          id,
          owner,
          type,
          groupId,
          sender,
          receiver,
          content,
          timer,
          ext
        ) VALUES (
          $msgId,
          $id,
          $owner,
          $type,
          $groupId,
          $sender,
          $receiver,
          $content,
          $timer,
          $ext
        )
        `
      ).run({
        ...message,
        owner
      })
  })(messages)
}

/**
 * @description: Get messages by userId or groupId.
 * @param sender number
 * @param pageNum string
 * @param pageSize number
 * @return Promise<ModuleIM.Core.MessageBasic[]>
 */
async function getMessagesBySender({
  userId,
  receiver,
  pageNum = 1,
  pageSize = 20
}: {
  userId: number
  receiver: number
  pageNum: number
  pageSize: number
}): Promise<ModuleIM.Core.MessageBasic[]> {
  const db = getInstance()
  const messages = db
    .prepare(
      `
      SELECT
        Message.id,
        Message.msgId,
        Message.type,
        Message.groupId,
        Message.sender,
        Message.receiver,
        Message.content,
        Message.timer,
        Message.ext,
        Info.id AS 'senderInfo.id',
        Info.account AS 'senderInfo.account',
        Info.avatar AS 'senderInfo.avatar',
        Info.email AS 'senderInfo.email',
        Info.regisTime AS 'senderInfo.regisTime',
        Info.updateTime AS 'senderInfo.updateTime'
      FROM messages AS Message LEFT OUTER JOIN userInfos AS Info ON Message.sender = Info.id
      WHERE Message.owner = $userId AND
        ((Message.sender = $userId AND Message.receiver = $receiver) OR (Message.sender = $receiver AND Message.receiver = $userId))
      ORDER BY Message.timer DESC
      LIMIT $limit OFFSET $offset;
      `
    )
    .all({
      userId,
      receiver,
      limit: pageSize,
      offset: (pageNum - 1) * pageSize
    })

  return messages as Array<ModuleIM.Core.MessageBasic>
}

/**
 * @description: Remove messages by msgIds.
 * @param msgIds string[]
 * @return Promise<void>
 */
async function removeMessageByMsgIds(msgIds: string[]): Promise<void> {
  const db = getInstance()
  db.prepare(
    `
        DELETE FROM messages WHERE msgId IN (
          ${msgIds.map(() => '?').join(', ')}
        );
      `
  ).run(msgIds)
}

/**
 * @description: Remove messages by sender.
 * @param owner number
 * @param sender number
 * @return Promise<void>
 */
async function removeMessagesBySender(owner: number, sender: number): Promise<void> {
  const db = getInstance()
  db.prepare(`DELETE FROM messages WHERE owner = $owner AND sender = $sender;`).run({
    owner,
    sender
  })
}

/**
 * @description: Remove all messages.
 * @param owner number
 * @return Promise<void>
 */
async function removeMessages(owner: number): Promise<void> {
  const db = getInstance()
  db.prepare(`DELETE FROM messages WHERE owner = $owner;`).run({ owner })
}

/**
 * @description: Get the last message for conversation (async).
 * @param owner number
 * @param sender number
 * @return Promise<ModuleIM.Core.MessageBasic>
 */
async function getLastConversationMessage(
  owner: number,
  sender: number
): Promise<ModuleIM.Core.MessageBasic> {
  return getLastConversationMessageSync(owner, sender)
}

/**
 * @description: Get the last message for conversation (sync).
 * @param owner number
 * @param sender number
 * @return ModuleIM.Core.MessageBasic
 */
function getLastConversationMessageSync(owner: number, sender: number): ModuleIM.Core.MessageBasic {
  const db = getInstance()
  const message = db
    .prepare(
      `
      SELECT * FROM messages WHERE
        owner = $owner AND sender = $sender
      ORDER BY timer DESC
      LIMIT 1;
      `
    )
    .get({ owner, sender }) as ModuleIM.Core.MessageBasic

  return message
}

/**
 * @description: Create a room into table rooms.
 * @param room ModuleIM.Core.ConversationType
 * @return Promise<void>
 */
async function createConversation(
  conversation: Omit<ModuleIM.Core.ConversationType, 'id' | 'lastReadAck' | 'active_at'> & {
    id?: string
    lastReadAck?: bigint
    active_at?: number
  }
): Promise<void> {
  const db = getInstance()

  if (!conversation['id']) {
    conversation['id'] = uuidv4()
  }

  if (!conversation['active_at']) {
    conversation['active_at'] = Date.now()
  }

  const columns = Object.keys(conversation)

  db.prepare(
    `INSERT INTO conversations (
    ${columns.join(',')}
  ) VALUES (
    ${columns.map((column) => `$${column}`).join(',')}
  );`
  ).run(conversation)
}

/**
 * @description: Update conversation active_at with default value (async).
 * @param id string
 * @param active_at number
 * @return Promise<void>
 */
async function updateConvActiveAtWithValue(id: string, active_at: number) {
  updateConversationActiveAtSync(id, active_at)
}

/**
 * @description: Update conversation active_at (async).
 * @param id string
 * @return Promise<void>
 */
async function updateConversationActiveAt(id: string): Promise<void> {
  updateConversationActiveAtSync(id, Date.now())
}

/**
 * @description: Update conversation active_at (sync).
 * @param id string
 * @return void
 */
function updateConversationActiveAtSync(id: string, active_at: number): void {
  const db = getInstance()

  db.prepare(
    `
    UPDATE conversations SET
      active_at = $active_at
    WHERE id = $id;
    `
  ).run({
    id,
    active_at
  })
}

/**
 * @description: Update lastReadAck for conversation (async).
 * @param id string
 * @param lastReadAck bigint
 * @return Promise<void>
 */
async function updateConversationLastRead(id: string, lastReadAck: bigint): Promise<void> {
  updateConversationLastReadSync(id, lastReadAck)
}

/**
 * @description: Update lastReadAck for conversation (sync).
 * @param id string
 * @param lastReadAck bigint
 * @return Promise<void>
 */
function updateConversationLastReadSync(id: string, lastReadAck: bigint) {
  const db = getInstance()

  db.prepare(
    `
    UPDATE conversations SET
      lastReadAck = $lastReadAck
    WHERE id = $id;
    `
  ).run({ id, lastReadAck })
}

/**
 * @description: Remove all conversations by owner.
 * @param owner number (userId)
 * @return Promise<void>
 */
async function removeConversationById(id: string): Promise<void> {
  const db = getInstance()
  db.prepare(`DELETE FROM conversations WHERE id = $id;`).run({ id })
}

/**
 * @description: Remove conversations by owner (async).
 * @param owner number
 * @return Promise<void>
 */
async function removeConversations(owner: number): Promise<void> {
  removeConversationsSync(owner)
}

/**
 * @description: Remove conversations by owner (sync).
 * @param owner number
 * @return void
 */
function removeConversationsSync(owner: number): void {
  const db = getInstance()

  db.prepare(
    `
    DELETE FROM conversations WHERE owner = $owner
    `
  ).run({ owner })
}

/**
 * @description: Get all conversations.
 * @param owner number (owner userId)
 * @return Promise<ModuleIM.Core.ConversationType[]>
 */
async function getConversations(owner: number): Promise<ModuleIM.Core.ConversationType[]> {
  const db = getInstance()
  const conversations = db
    .prepare(`SELECT * FROM conversations WHERE owner = $owner ORDER BY active_at DESC;`)
    .all({ owner })

  return conversations as Array<ModuleIM.Core.ConversationType>
}

/**
 * @description: Get all conversations with detail (async).
 * @param owner number
 * @return Promise<>
 */
async function getConversationsWithAll(
  owner: number
): Promise<Array<ModuleIM.Core.ConversationWithAllType>> {
  return getConversationsWithAllSync(owner)
}

/**
 * @description: Get all conversations with detail (sync).
 * @param owner number
 * @return <>
 */
function getConversationsWithAllSync(owner: number): Array<ModuleIM.Core.ConversationWithAllType> {
  const db = getInstance()

  return db.transaction(() => {
    const conversations = db
      .prepare(
        `
        SELECT * FROM conversations WHERE owner = $owner ORDER BY active_at DESC;
        `
      )
      .all({ owner }) as ModuleIM.Core.ConversationType[]

    const result = conversations.map((conversation) => {
      // get last message & sender info(user or group)
      const { groupId, sender, lastReadAck } = conversation
      const lastMessage = db
        .prepare(
          `
          SELECT * FROM messages WHERE
            owner = $owner AND (sender = $sender OR (sender = $owner AND receiver = $sender))
          ORDER BY timer DESC
          LIMIT 1;
          `
        )
        .get({
          owner,
          sender
        }) as ModuleIM.Core.MessageBasic

      const count = db
        .prepare(
          `
          SELECT count(1)
          FROM messages
          WHERE owner = $owner AND sender = $sender AND id != NULL AND id > $lastReadAck
          `
        )
        .pluck()
        .get({ owner, sender, lastReadAck }) as number

      const info = groupId
        ? (db
            .prepare(
              `
              SELECT id, name, avatar, type, creator, count, members, createAt, updateAt
              FROM groups WHERE id = $groupId;
              `
            )
            .get({ groupId }) as ModuleIM.Core.GroupBasic)
        : (db
            .prepare(
              `
              SELECT
                Info.id,
                Info.account,
                Info.avatar,
                Info.email,
                Info.regisTime,
                Info.updateTime,
                Friend.remark,
                Friend.astrolabe,
                Friend.block,
                Friend.createdAt,
                Friend.updatedAt
              FROM userInfos AS Info
              LEFT OUTER JOIN friends AS Friend ON Friend.owner = $owner AND Friend.id = Info.id
              WHERE Info.id = $sender
              `
            )
            .get({
              owner,
              sender
            }) as DB.UserWithFriendSetting)

      return { ...conversation, count, lastMessage, info }
    })

    return result
  })()
}

/**
 * @description: Get total unread messages count for conversation (async).
 * @param owner number
 * @param options <{ sender: number; lastReadAck: bigint; }>
 * @return Promise<void>
 */
async function getTotalUnreadForConversation(
  owner: number,
  options: {
    sender: number
    lastReadAck: bigint
  }
): Promise<number> {
  return getTotalUnreadForConversationSync(owner, options)
}

/**
 * @description: Get total unread messages count for conversation (sync).
 * @param owner number
 * @param options <{ sender: number; lastReadAck: bigint; }>
 * @return number
 */
function getTotalUnreadForConversationSync(
  owner: number,
  {
    sender,
    lastReadAck
  }: {
    sender: number
    lastReadAck: bigint
  }
): number {
  const db = getInstance()
  const count = db
    .prepare(
      `
      SELECT count(1)
      FROM messages
      WHERE owner = $owner AND sender = $sender AND id != NULL AND id > $lastReadAck
      `
    )
    .pluck()
    .get({ owner, sender, lastReadAck }) as number

  return count
}

/**
 * @description: Get user total unread messages's count.
 * @param options <{ owner: number; lastReadAck: bigint; }>
 * @return Promise<number>
 */
async function getTotalUnreadCount({ owner, lastReadAck }: { owner: number; lastReadAck: bigint }) {
  const db = getInstance()
  const count = db
    .prepare(
      `
      SELECT count(1)
      FROM messages
      WHERE owner = $owner AND id != NULL AND id > $lastReadAck
      `
    )
    .pluck()
    .get({ owner, lastReadAck }) as number

  return count
}
