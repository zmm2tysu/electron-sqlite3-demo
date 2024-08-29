import { ElectronAPI } from '@electron-toolkit/preload';
import type { ClientInterface } from '../main/db/types';


declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    sqlClient: ClientInterface
  }
}
