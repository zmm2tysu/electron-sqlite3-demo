import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import Versions from './components/Versions'

function App(): JSX.Element {
  const [users, setUsers] = useState<DB.UserInfo[]>([])

  useEffect(() => {
    window.sqlClient.getUsers(true).then(setUsers)
  }, [])
  const ipcHandle = (): void => {
    const updateTime = dayjs().valueOf()

    window.sqlClient.setUsers([
      {
        id: '1',
        nickname: '1昵称',
        avatar: '1头像',
        cookies: '1cookies',
        isDeleted: 0,
        isMcn: 1,
        mcnId: undefined,
        updateTime
      },
      {
        id: '2',
        nickname: '2昵称',
        avatar: '2头像',
        cookies: '2cookies',
        isDeleted: 0,
        isMcn: 1,
        mcnId: undefined,
        updateTime
      },
      {
        id: '3',
        nickname: '2昵称',
        avatar: '3头像',
        cookies: undefined,
        isDeleted: 0,
        isMcn: 0,
        mcnId: '2',
        updateTime
      },
      {
        id: '4',
        nickname: '4',
        avatar: '4头像',
        cookies: undefined,
        isDeleted: 0,
        isMcn: 0,
        mcnId: '2',
        updateTime
      }
    ])
  }

  return (
    <>
      {users.map((u) => {
        return (
          <p
            onClick={() =>
              window.sqlClient
                .removeUsersByMcnId(u.id)
                .then(() => setUsers((old) => old.filter((o) => o.id !== u.id)))
            }
            key={u.id}
            style={{ color: 'white' }}
          >
            {u.nickname} - {u.id}
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
