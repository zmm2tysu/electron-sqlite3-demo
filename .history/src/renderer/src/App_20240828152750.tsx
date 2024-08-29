import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import Versions from './components/Versions'

function App(): JSX.Element {
  const [users, setUsers] = useState<DB.UserInfo[]>([])

  useEffect(() => {
    window.sqlClient.getUsers().then(setUsers)
  }, [])
  const ipcHandle = (): void => {
    console.log(window)
    window.sqlClient.setUsers([
      {
        awemeNo: '测试抖音号',
        nickname: '修改测试昵称',
        avatar: '测试头像',
        cookies: '测试cookie',
        isDeleted: 0,
        isMcn: 1,
        mcnId: '机构号抖音号',
        updateTime: dayjs().valueOf()
      },
      {
        awemeNo: '2',
        nickname: '2昵称',
        avatar: '2头像',
        mcnId: '机构号抖音号',
        isMcn: 0,
        isDeleted: 0,
        cookies: undefined,
        updateTime: dayjs().valueOf()
      }
    ])
  }

  return (
    <>
      {users.map((u) => {
        return (
          <p style={{ color: 'white' }}>
            {u.nickname} - {u.awemeNo}
          </p>
        )
      })}
      <div className="actions">
        <div className="action">
          <a href="https://electron-vite.org/" target="_blank" rel="noreferrer">
            Documentation
          </a>
        </div>
        <div className="action">
          <a target="_blank" rel="noreferrer" onClick={ipcHandle}>
            Send IPC
          </a>
        </div>
      </div>
      <Versions></Versions>
    </>
  )
}

export default App
