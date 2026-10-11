import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
const mime={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml',png:'image/png',webmanifest:'application/manifest+json'};
const assets={};
for(const name of await readdir('public')){assets['/'+name]={type:mime[name.split('.').pop()]||'application/octet-stream',data:(await readFile('public/'+name)).toString('base64')};}
assets['/']=assets['/index.html'];
const catalog=await readFile('worker/catalog.js','utf8');
const api=(await readFile('worker/api.js','utf8')).replace("import {initialProducts} from './catalog.js';",'');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',catalog+'\n'+api+'\nconst ASSETS='+JSON.stringify(assets)+';\nexport default {async fetch(request,env){return handle(request,env,ASSETS);}};\n');
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Built Worker with '+Object.keys(assets).length+' embedded assets.');
