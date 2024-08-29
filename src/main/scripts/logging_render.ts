import { ipcRenderer } from 'electron'
import type { Logger } from 'electron-log'

type Log = Logger['functions']

class Logging {
  private static instance: Logging

  private logger: Log

  constructor() {
    this.logger = {
      error: this.error,
      warn: this.warn,
      info: this.info,
      verbose: this.verbose,
      debug: this.debug,
      silly: this.silly,
      log: this.log
    }
  }

  public static getInstance() {
    if (!Logging.instance) Logging.instance = new Logging()
    return Logging.instance
  }

  public getLogger = () => {
    return this.logger
  }

  private send = (name: keyof Log, ...args: unknown[]) => {
    ipcRenderer.send('app-log-event', name, args)
  }

  private error: Logger['functions']['error'] = (...params) => {
    this.send('error', params)
  }
  private warn: Logger['functions']['warn'] = (...params) => {
    this.send('warn', params)
  }
  private info: Logger['functions']['info'] = (...params) => {
    this.send('info', params)
  }
  private verbose: Logger['functions']['verbose'] = (...params) => {
    this.send('verbose', params)
  }
  private debug: Logger['functions']['debug'] = (...params) => {
    this.send('debug', params)
  }
  private silly: Logger['functions']['silly'] = (...params) => {
    this.send('silly', params)
  }
  private log: Logger['functions']['log'] = (...params) => {
    this.send('log', params)
  }
}

export default function () {
  return Logging.getInstance()
}
