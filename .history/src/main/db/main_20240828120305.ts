import { format } from 'util'
import { Worker } from 'worker_threads'

import type { LogFunctions, LogLevel } from 'electron-log'
import { strictAssert } from '../utils/assert'
import type { ServerInterface } from './types'

const MIN_TRACE_DURATION = 40

export type InitializeOptions = Readonly<{
  configDir: string
  key: string
  logger: LogFunctions
}>

type Methods = keyof Omit<ServerInterface, 'close' | 'removeDB' | 'initialize'>

export type WorkerRequest = Readonly<
  | {
      type: 'init'
      options: Omit<InitializeOptions, 'logger'>
    }
  | {
      type: 'close'
    }
  | {
      type: 'removeDB'
    }
  | {
      type: 'sqlCall'
      method: Methods
      args: ReadonlyArray<unknown>
    }
>

export type WrappedWorkerRequest = Readonly<{
  seq: number
  request: WorkerRequest
}>

export type WrappedWorkerLogEntry = Readonly<{
  type: 'log'
  level: LogLevel
  args: ReadonlyArray<unknown>
}>

export type WrappedWorkerResponse =
  | Readonly<{
      type: 'response'
      seq: number
      error: string | undefined
      response: unknown
    }>
  | WrappedWorkerLogEntry

type PromisePair<T> = {
  resolve: (response: T) => void
  reject: (error: Error) => void
}

// 核心代码 因为项目是用的 ts 写的，可以直接忽略相关的类型代码
export class MainSQL {
  private readonly worker: Worker

  private isReady = false // 数据库是否初始化

  private onReady: Promise<void> | undefined

  private readonly onExit: Promise<void> // 结束数据库的方法

  private seq = 0

  private logger?: LogFunctions

  private onResponse = new Map<number, PromisePair<unknown>>()

  constructor() {
    // 这里的文件路径就是子线程要执行的代码的文件路径 因为整个项目都是 ts 编写，所以需要先编译成 js 代码
    // webpack 里面有相关配置 electron_client/.erb/configs 文件中
    // const scriptDir = app.isPackaged
    //   ? join(__dirname, 'mainWorker.ts')
    //   : join(__dirname, 'mainWorker.ts')
    this.worker = new Worker('./mainWorker.ts')

    // 监听子线程发出的消息的事件
    this.worker.on('message', (wrappedResponse: WrappedWorkerResponse) => {
      if (wrappedResponse.type === 'log') {
        const { level, args } = wrappedResponse
        strictAssert(this.logger !== undefined, 'Logger not initialized')
        this.logger[level](`MainSQL: ${format(...args)}`)
        return
      }

      const { seq, error, response } = wrappedResponse

      const pair = this.onResponse.get(seq)
      this.onResponse.delete(seq)
      if (!pair) throw new Error(`Unexpected worker response with seq: ${seq}`)

      if (error) {
        pair.reject(new Error(error))
      } else {
        pair.resolve(response)
      }
    })

    this.onExit = new Promise<void>((resolve) => {
      this.worker.once('exit', resolve)
    })
  }

  // 开始初始化
  public async initialize({ configDir, key, logger }: InitializeOptions) {
    if (this.isReady || this.onReady) {
      throw new Error('Already initialized')
    }

    this.logger = logger

    this.onReady = this.send({ type: 'init', options: { configDir, key } })

    await this.onReady

    this.onReady = undefined
    this.isReady = true
  }

  // 关闭数据库的方法
  public async close(): Promise<void> {
    if (!this.isReady) throw new Error('Not initialized')

    await this.send({ type: 'close' })
    await this.onExit
  }

  // 移除数据库
  public async removeDB() {
    await this.send({ type: 'removeDB' })
  }

  // 数据库的所有操作（增删改查）都会通过这个方法通知子线程来执行
  public async sqlCall(method: Methods, args: ReadonlyArray<unknown>): Promise<unknown> {
    if (this.onReady) await this.onReady

    if (!this.isReady) throw new Error('Not initialized')

    const { result, duration } = await this.send<{
      result: unknown
      duration: number
    }>({
      type: 'sqlCall',
      method,
      args
    })

    // 子线程中数据库执行 sql 的耗时
    if (duration > MIN_TRACE_DURATION) {
      strictAssert(this.logger !== undefined, 'Logger not initialized')
      this.logger.info(`MainSQL: slow query ${method} duration=${duration}ms`)
    }

    return result
  }

  // 通过一层 Promise 包装
  private async send<Response>(request: WorkerRequest): Promise<Response> {
    const { seq } = this
    this.seq += 1

    const result = new Promise((resolve, reject) => {
      this.onResponse.set(seq, { resolve, reject })
    }) as Response

    const wrappedRequest: WrappedWorkerRequest = {
      seq,
      request
    }
    this.worker.postMessage(wrappedRequest)

    return result
  }
}
