import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
const mime = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  webmanifest: 'application/manifest+json',
};
const assets = {};
for (const name of await readdir('public')) {
  assets['/' + name] = {
    type: mime[name.split('.').pop()] || 'application/octet-stream',
    data: (await readFile('public/' + name)).toString('base64'),
  };
}
assets['/'] = assets['/index.html'];
const catalog = await readFile('worker/catalog.js', 'utf8');
const security = await readFile('worker/security.js', 'utf8');
// These modules are embedded above, so remove their imports regardless of formatting.
function removeEmbeddedImports(source) {
  return source.replace(
    /^import\s*\{[^}]*\}\s*from\s*['"]\.\/(?:security|catalog|auth|catalog-updates)\.js['"];?\s*/gm,
    '',
  );
}
const updates = await readFile('worker/catalog-updates.js', 'utf8');
const auth = removeEmbeddedImports(await readFile('worker/auth.js', 'utf8'));
const api = removeEmbeddedImports(await readFile('worker/api.js', 'utf8'));
await mkdir('dist/server', { recursive: true });
await writeFile(
  'dist/server/index.js',
  catalog +
    '\n' +
    security +
    '\n' +
    auth +
    '\n' +
    updates +
    '\n' +
    api +
    '\nconst ASSETS=' +
    JSON.stringify(assets) +
    ';\nexport default {async fetch(request,env){return handle(request,env,ASSETS);},async scheduled(event,env){if(!env.DB)throw new Error("DB binding missing");await deleteExpiredOrders(env.DB,new Date(event.scheduledTime));}};\n',
);
console.log('Built Worker with ' + Object.keys(assets).length + ' embedded assets.');
