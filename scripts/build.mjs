import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
const mime={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml',png:'image/png',webmanifest:'application/manifest+json'};
const assets={};
for(const name of await readdir('public')){assets['/'+name]={type:mime[name.split('.').pop()]||'application/octet-stream',data:(await readFile('public/'+name)).toString('base64')};}
assets['/']=assets['/index.html'];
const catalog=await readFile('worker/catalog.js','utf8');
const security=await readFile('worker/security.js','utf8');
const auth=(await readFile('worker/auth.js','utf8')).replace("import {boundedText} from './security.js';",'');
const api=(await readFile('worker/api.js','utf8')).replace("import {protectRequest,boundedText} from './security.js';",'').replace("import {initialProducts} from './catalog.js';",'').replace("import {sellerSession,authEndpoint} from './auth.js';",'');
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js',catalog+'\n'+security+'\n'+auth+'\n'+api+'\nconst ASSETS='+JSON.stringify(assets)+';\nexport default {async fetch(request,env){return handle(request,env,ASSETS);}};\n');
console.log('Built Worker with '+Object.keys(assets).length+' embedded assets.');
