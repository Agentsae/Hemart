import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { CatalogUpdates, notifyCatalogChange } from '../worker/catalog-updates.js';

test('customer refreshes on server notifications and reconnect without polling', async () => {
  const source = await readFile('public/app.js', 'utf8');
  const events = {},
    sockets = [];
  let calls = 0,
    retry;
  class Socket {
    constructor(url) {
      this.events = {};
      sockets.push(this);
      assert.equal(url.protocol, 'wss:');
    }
    addEventListener(name, fn) {
      this.events[name] = fn;
    }
    close() {
      this.events.close?.();
    }
  }
  runInNewContext(source.slice(source.indexOf('// Cross-device refresh;')), {
    sellerPage: false,
    document: { hidden: false, addEventListener: (name, fn) => (events[name] = fn) },
    navigator: { onLine: true },
    location: { href: 'https://hemart.test/', protocol: 'https:' },
    URL,
    window: { addEventListener: (name, fn) => (events[name] = fn) },
    WebSocket: Socket,
    setTimeout: (fn) => {
      retry = fn;
      return 1;
    },
    clearTimeout: () => {},
    bootstrap: async () => {
      calls++;
    },
  });
  assert.equal(sockets.length, 1);
  sockets[0].events.open();
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  sockets[0].events.message({ data: 'catalog-changed' });
  await new Promise(setImmediate);
  assert.equal(calls, 2);
  sockets[0].events.message({ data: 'untrusted-message' });
  assert.equal(calls, 2);
  sockets[0].close();
  retry();
  assert.equal(sockets.length, 2);
  sockets[1].events.open();
  await new Promise(setImmediate);
  assert.equal(calls, 3);
});

test('internal hub broadcasts only a public invalidation signal', async () => {
  const messages = [];
  const hub = new CatalogUpdates({
    getWebSockets: () => [{ send: (value) => messages.push(value) }],
  });
  const response = await hub.fetch(new Request('https://internal/notify', { method: 'POST' }));
  assert.equal(response.status, 204);
  assert.deepEqual(messages, ['catalog-changed']);
  assert.equal((await hub.fetch(new Request('https://internal/notify'))).status, 426);
  let closed;
  hub.webSocketMessage({ close: (code) => (closed = code) });
  assert.equal(closed, 1008);
  await notifyCatalogChange({
    CATALOG_UPDATES: {
      idFromName: (name) => name,
      get: () => ({ fetch: (url, options) => hub.fetch(new Request(url, options)) }),
    },
  });
  assert.equal(messages.length, 2);
});
