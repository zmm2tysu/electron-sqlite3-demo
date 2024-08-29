namespace DB {
  interface UserInfo {
    awemeNo: string
    nickname: string
    avatar: string
    isMcn: 0 | 1 //是否是机构号主号
    mcnId?: string //机构号抖音号
    cookies?: string // 抖音cookie， 机构号才有
    updateTime?: number
    isDeleted?: 0 | 1 //是否删除
  }
}
