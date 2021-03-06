import { existsSync, promises as fs } from 'fs';
import { resolve, join } from 'path';
import fetch from 'node-fetch';

import { windowsManager } from '..';
import { ElectronBlocker, Request } from '@cliqz/adblocker-electron';
import { getPath } from '~/utils';
import { ipcMain } from 'electron';

export let engine: ElectronBlocker;

const PRELOAD_PATH = join(__dirname, './preload.js');

const loadFilters = async () => {
  const path = resolve(getPath('adblock/cache.dat'));

  const downloadFilters = async () => {
    // Load lists to perform ads and tracking blocking:
    //
    //  - https://easylist.to/easylist/easylist.txt
    //  - https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext
    //  - https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt
    //  - https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt
    //  - https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt
    //  - https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt
    //
    //  - https://easylist.to/easylist/easyprivacy.txt
    //  - https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt
    engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);

    try {
      await fs.writeFile(path, engine.serialize());
    } catch (err) {
      if (err) return console.error(err);
    }
  };

  if (existsSync(path)) {
    try {
      const buffer = await fs.readFile(resolve(path));

      try {
        engine = ElectronBlocker.deserialize(buffer);
      } catch (e) {
        return downloadFilters();
      }
    } catch (err) {
      return console.error(err);
    }
  } else {
    return downloadFilters();
  }
};

const emitBlockedEvent = (request: Request) => {
  for (const window of windowsManager.list) {
    window.webContents.send(`blocked-ad-${request.tabId}`);
  }
};

let adblockRunning = false;

export const runAdblockService = async (ses: any) => {
  if (!ses.webRequest.addListener) return;

  if (!engine) {
    await loadFilters();
  }

  if (!ses.headersReceivedId) {
    ses.headersReceivedId = ses.webRequest.addListener(
      'onHeadersReceived',
      { urls: ['<all_urls>'] },
      (engine as any).onHeadersReceived,
    ).id;
  }

  if (!ses.beforeRequestId) {
    ses.beforeRequestId = ses.webRequest.addListener(
      'onBeforeRequest',
      { urls: ['<all_urls>'] },
      (engine as any).onBeforeRequest,
    ).id;
  }

  if (!adblockRunning) {
    ipcMain.on('get-cosmetic-filters', (engine as any).onGetCosmeticFilters);
    ipcMain.on(
      'is-mutation-observer-enabled',
      (engine as any).onIsMutationObserverEnabled,
    );
    ses.setPreloads(ses.getPreloads().concat([PRELOAD_PATH]));

    engine.on('request-blocked', emitBlockedEvent);
    engine.on('request-redirected', emitBlockedEvent);

    adblockRunning = true;
  }
};

export const stopAdblockService = (ses: any) => {
  if (!ses.webRequest.removeListener) return;

  if (ses.beforeRequestId) {
    ses.webRequest.removeListener('onBeforeRequest', ses.beforeRequestId);
    ses.beforeRequestId = null;
  }

  if (ses.headersReceivedId) {
    ses.webRequest.removeListener('onHeadersReceived', ses.headersReceivedId);
    ses.headersReceivedId = null;
  }

  ses.setPreloads(ses.getPreloads().filter((p: string) => p !== PRELOAD_PATH));

  adblockRunning = false;
};
