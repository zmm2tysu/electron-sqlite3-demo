import dayjs from 'dayjs'
import electronLogo from './assets/electron.svg'
import Versions from './components/Versions'

function App(): JSX.Element {
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
        updateTime: dayjs().valueOf(),
      },
      {
        awemeNo: '2',
        nickname: '2昵称',
        avatar: '2头像',
        mcnId: '机构号抖音号',
        isMcn: 0,
        isDeleted: 0,
        cookies: undefined,
        isDeleted: undefined,
        updateTime: dayjs().valueOf(),
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
