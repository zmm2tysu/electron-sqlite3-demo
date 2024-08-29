// import { Theme } from 'App/types'
// import SQL from 'better-sqlite3-multiple-ciphers';
import type { Logger } from 'electron-log'

export type DataInterface = {
  close: () => Promise<void>
  removeDB: () => Promise<void>

  // user
  setUsers: (users: DB.UserInfo[]) => Promise<void>
  getUsers: (onlyMcn?: boolean) => Promise<DB.UserInfo[]>
  removeUsersByMcnId: (mcnId: string) => Promise<void>
}

export type ClientInterface = DataInterface & {
  // Client-side only
  shutdown: () => Promise<void>
}

export type ServerInterface = DataInterface & {
  // Server-side only
  initialize: (options: {
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
  }) => Promise<void>
}
