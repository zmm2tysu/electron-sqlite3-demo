import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge } from 'electron'

import sqlClient from '../main/db/client'

// Custom APIs for renderer
const api = {}

const { setUsers, getUsers } = sqlClient

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('sqlClient', {
      setUsers,
      getUsers
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.sqlClient = {
    setUsers,
    getUsers
  }
}
