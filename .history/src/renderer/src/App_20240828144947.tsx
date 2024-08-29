import dayjs from 'dayjs'
import electronLogo from './assets/electron.svg'
import Versions from './components/Versions'

function App(): JSX.Element {
  const ipcHandle = (): void => {
    console.log(window)
    window.sqlClient.setUsers([
      {
        nickname: '修改测试昵称',
        awemeNo: '测试抖音号',
        avatar: '测试头像',
        createTime: dayjs().millisecond(),
        cookies: '测试cookie',
        isDeleted: 0,
        isMcn: 0,
        id: 1,
        updateTime: dayjs().millisecond()
      },
      {
        nickname: 'ceui测试昵称',
        awemeNo: '测试抖音号',
        avatar: '测试头像',
        createTime: dayjs().millisecond(),
        cookies: '测试cookie',
        isDeleted: 0,
        isMcn: 0,
        id: undefined
      }
    ])
  }

  return (
    <>
      <img alt="logo" className="logo" src={electronLogo} />
      <div className="creator">Powered by electron-vite</div>
      <div className="text">
        Build an Electron app with <span className="react">React</span>
        &nbsp;and <span className="ts">TypeScript</span>
      </div>
      <p className="tip">
        Please try pressing <code>F12</code> to open the devTool
      </p>
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
