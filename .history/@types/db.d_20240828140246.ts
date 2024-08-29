declare global {
  namespace DB {
    interface UserInfo {
      id: number
      account: string
      avatar?: string
      email?: string
      regisTime: string
      updateTime: string
    }

    interface UserWithFriendSetting extends Partial<FriendSetting>, SenderInfo {}
  }
}
