import { allowRateLimits } from './rate-limit-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../worker/api.js';
import { passwordHash } from '../worker/auth.js';
import { createDB } from '../scripts/local-db.mjs';
const origin = 'https://hemart.test',
  password = 'test-only-long-passphrase-123',
  encoded = await passwordHash(password);
function setup() {
  return {
    ...allowRateLimits(),
    DB: createDB(),
    SELLER_USERNAME: 'bapak',
    SELLER_PASSWORD_HASH: encoded,
  };
}
function req(path, body = {}, cookie = '', headers = {}) {
  return new Request(origin + path, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie, ...headers },
    body: JSON.stringify(body),
  });
}
async function login(env) {
  const r = await handle(req('/api/auth/login', { username: 'bapak', password }), env);
  assert.equal(r.status, 200);
  return r.headers.get('Set-Cookie');
}
const assets = { '/': { type: 'text/html', data: btoa('<h1>Seller shell</h1>') } };
test('standalone sign-in issues secure cookie, authorizes dashboard, and logout revokes it', async () => {
  const env = setup();
  const cookie = await login(env);
  for (const flag of ['__Host-hemart_seller=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/'])
    assert.ok(cookie.includes(flag));
  const dashboard = await handle(
    new Request(origin + '/seller', { headers: { Cookie: cookie } }),
    env,
    assets,
  );
  assert.equal(dashboard.status, 200);
  const api = await handle(
    new Request(origin + '/api/seller/orders', { headers: { Cookie: cookie } }),
    env,
  );
  assert.equal(api.status, 200);
  const logout = await handle(req('/api/auth/logout', {}, cookie), env);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(
    (await handle(new Request(origin + '/api/seller/orders', { headers: { Cookie: cookie } }), env))
      .status,
    403,
  );
});
test('ChatGPT identity headers cannot grant independent seller access', async () => {
  const env = setup();
  const headers = {
    'oai-authenticated-user-id': 'owner',
    'oai-authenticated-user-email': 'owner@example.com',
  };
  assert.equal(
    (await handle(new Request(origin + '/api/seller/orders', { headers }), env)).status,
    403,
  );
  const r = await handle(new Request(origin + '/seller', { headers }), env, assets);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), '/seller/login');
});
test('expired sessions and credential changes invalidate access', async () => {
  const env = setup(),
    cookie = await login(env);
  await env.DB.prepare('UPDATE seller_sessions SET expires_at=0').run();
  assert.equal(
    (await handle(new Request(origin + '/api/seller/orders', { headers: { Cookie: cookie } }), env))
      .status,
    403,
  );
  const second = await login(env);
  env.SELLER_USERNAME = 'new-owner';
  assert.equal(
    (await handle(new Request(origin + '/api/seller/orders', { headers: { Cookie: second } }), env))
      .status,
    403,
  );
});
test('wrong password and cross-origin login are rejected; attempts are throttled', async () => {
  const env = setup();
  assert.equal(
    (
      await handle(
        req('/api/auth/login', { username: 'bapak', password }, '', {
          Origin: 'https://evil.test',
        }),
        env,
      )
    ).status,
    403,
  );
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await handle(req('/api/auth/login', { username: 'bapak', password: 'wrong' }), env)).status,
      401,
    );
  assert.equal(
    (await handle(req('/api/auth/login', { username: 'bapak', password }), env)).status,
    429,
  );
});
test('missing credentials fail closed and no credentials are exposed by bootstrap', async () => {
  const env = setup();
  const data = await (await handle(new Request(origin + '/api/bootstrap'), env)).json();
  assert.equal(data.seller, false);
  assert.ok(!JSON.stringify(data).includes(encoded));
  delete env.SELLER_PASSWORD_HASH;
  assert.equal(
    (await handle(req('/api/auth/login', { username: 'bapak', password }), env)).status,
    503,
  );
});
test('new login rotates old session and password hashes use distinct salts', async () => {
  const env = setup(),
    cookie = await login(env);
  const r = await handle(req('/api/auth/login', { username: 'bapak', password }, cookie), env);
  assert.equal(r.status, 200);
  assert.equal(
    (await handle(new Request(origin + '/api/seller/orders', { headers: { Cookie: cookie } }), env))
      .status,
    403,
  );
  assert.notEqual(await passwordHash(password), encoded);
});

test('seller login allows three active sessions and frees a slot on logout', async () => {
  const env = setup();
  const cookies = await Promise.all([login(env), login(env), login(env)]);
  const fourth = await handle(req('/api/auth/login', { username: 'bapak', password }), env);
  assert.equal(fourth.status, 409);
  assert.match((await fourth.json()).error, /Maksimal 3 perangkat/);
  for (const cookie of cookies) {
    const response = await handle(
      new Request(origin + '/api/seller/orders', { headers: { Cookie: cookie } }),
      env,
    );
    assert.equal(response.status, 200);
  }
  assert.equal((await handle(req('/api/auth/logout', {}, cookies[0]), env)).status, 200);
  assert.ok(await login(env));
  assert.equal(
    (await env.DB.prepare('SELECT COUNT(*) AS count FROM seller_sessions').first()).count,
    3,
  );
  env.DB.sqlite.close();
});

test('simultaneous seller logins cannot exceed three active sessions', async () => {
  const env = setup();
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () =>
      handle(req('/api/auth/login', { username: 'bapak', password }), env),
    ),
  );
  assert.deepEqual(attempts.map((response) => response.status).sort(), [200, 200, 200, 409]);
  assert.equal(
    (await env.DB.prepare('SELECT COUNT(*) AS count FROM seller_sessions').first()).count,
    3,
  );
  env.DB.sqlite.close();
});

test('seller pages advertise a separate app while toko retains its manifest', async () => {
  const { readFile } = await import('node:fs/promises');
  const env = setup();
  const cookie = await login(env);
  const pageAssets = {};
  for (const [path, file] of Object.entries({
    '/': 'index.html',
    '/seller-login.html': 'seller-login.html',
    '/seller.webmanifest': 'seller.webmanifest',
  })) {
    pageAssets[path] = {
      type: file.endsWith('webmanifest') ? 'application/manifest+json' : 'text/html',
      data: (await readFile('public/' + file)).toString('base64'),
    };
  }
  for (const path of ['/seller', '/seller/login', '/']) {
    const response = await handle(
      new Request(origin + path, { headers: { Cookie: cookie } }),
      env,
      pageAssets,
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(
      html.includes(path === '/' ? 'href="/manifest.webmanifest"' : 'href="/seller.webmanifest"'),
    );
    if (path === '/seller') assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const manifest = await (
    await handle(new Request(origin + '/seller.webmanifest'), env, pageAssets)
  ).json();
  assert.equal(manifest.id, '/seller');
  assert.equal(manifest.start_url, '/seller');
  assert.equal(manifest.scope, '/seller');
  assert.equal(manifest.display, 'standalone');
  const signedOut = await handle(new Request(origin + manifest.start_url), env, pageAssets);
  assert.equal(signedOut.headers.get('Location'), '/seller/login');
  env.DB.sqlite.close();
});
