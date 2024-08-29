namespace DB {
  interface UserInfo {
    id?: number
    nickname: string
    awemeNo: string
    avatar?: string
    cookies?: string // 抖音cookie， 机构号才有
    mcnId?: string //机构号抖音号
    updateTime?: number
    createTime?: number
    isDeleted?: 0 | 1 //是否删除
    isMcn?: 0 | 1 //是否是机构号主号
  }
}
