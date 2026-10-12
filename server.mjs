import {localRateLimits} from './scripts/local-rate-limits.mjs';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createDB} from './scripts/local-db.mjs';
import {handle} from './worker/api.js';
await mkdir('.local',{recursive:true});
const db=createDB('.local/hemart.sqlite');
try{process.loadEnvFile('.dev.vars');}catch(e){if(e.code!=='ENOENT')throw e;}
const env={...localRateLimits(),DB:db,LOCAL_DEV:'1',SELLER_USERNAME:process.env.SELLER_USERNAME,SELLER_PASSWORD_HASH:process.env.SELLER_PASSWORD_HASH};
const mime={html:'text/html; charset=utf-8',css:'text/css',js:'text/javascript',svg:'image/svg+xml',png:'image/png',webmanifest:'application/manifest+json'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost:3000');const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(!key.startsWith('oai-')&&value)headers.set(key,Array.isArray(value)?value.join(','):value);headers.set('CF-Connecting-IP',req.socket.remoteAddress||'local');let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000){res.writeHead(413).end();return;}}let assets={};if(!url.pathname.startsWith('/api/')){const filename=url.pathname==='/seller/login'?'seller-login.html':['/','/seller','/seller/'].includes(url.pathname)?'index.html':url.pathname.slice(1);if(!/^[a-zA-Z0-9.-]+$/.test(filename)){res.writeHead(404).end();return;}try{assets[url.pathname==='/seller/login'?'/seller-login.html':['/seller','/seller/'].includes(url.pathname)?'/':url.pathname]={type:mime[filename.split('.').pop()],data:(await readFile('public/'+filename)).toString('base64')};}catch{res.writeHead(404).end();return;}}const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:raw}:{})});const response=await handle(request,env,assets);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){console.error(error.message);res.writeHead(500).end('Server error');}}).listen(3000,'127.0.0.1',()=>console.log('Local: http://localhost:3000 · '+'Independent seller login'));
