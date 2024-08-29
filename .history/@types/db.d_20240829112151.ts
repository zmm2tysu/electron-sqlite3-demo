namespace DB {
  interface UserInfo {
    id: string
    nickname: string
    avatar: string
    isMcn: 0 | 1
    mcnId?: string
    cookies?: string
    updateTime?: number
    isDeleted?: 0 | 1
  }
}
