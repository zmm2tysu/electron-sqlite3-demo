import dayjs from 'dayjs'
import { ipcMain } from 'electron'
import log, { FileTransport, Logger } from 'electron-log'

class Logging {
  private static instance: Logging

  private log: Logger

  constructor() {
    this.log = log
    ;(this.log!.transports!.file as FileTransport).resolvePathFn = (variables) => {
      return variables.libraryDefaultDir + `/${dayjs().format('YYYY-MM-DD')}.log`
    }

    this.registeForRender()
  }

  public static getInstance() {
    if (!Logging.instance) Logging.instance = new Logging()
    return Logging.instance
  }

  public getLogger = () => {
    return this.log
  }

  private registeForRender = () => {
    ipcMain.on('app-log-event', (_evt, name: keyof Logger['functions'], ...args) => {
      this.log[name](args)
    })
  }
}

export default function () {
  return Logging.getInstance()
}
