import { get, has } from 'lodash';
import Logging from '../scripts/logging_render';
import { doShutdown, ipcInvoke } from './channels';

import type { ClientInterface, ServerInterface } from './types';

const log = Logging().getLogger();

const channels: ServerInterface = new Proxy({} as ServerInterface, {
  get(_target, name) {
    return async (...args: ReadonlyArray<unknown>) =>
      ipcInvoke(String(name), args);
  },
});

const dataInterface: ClientInterface = new Proxy(
  {
    shutdown,
  } as ClientInterface,
  {
    get(target, name) {
      return async (...args: ReadonlyArray<unknown>) => {
        if (has(target, name)) {
          return get(target, name)(...args);
        }

        return get(channels, name)(...args);
      };
    },
  }
);

export default dataInterface;

// Top-level calls

async function shutdown(): Promise<void> {
  log.info('Client.shutdown');

  // Stop accepting new SQL jobs, flush outstanding queue
  await doShutdown();

  // Close database
  await channels.close();
}
