import {boundedText} from './security.js';
const SESSION_SECONDS=7*24*60*60;
const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));
async function digest(s){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));}
export async function passwordHash(password,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const derived=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:unhex(salt)},key,256);
 return `pbkdf2-sha256$100000$${salt}$${hex(derived)}`;
}
function validHash(s){return typeof s==='string'&&/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(s);}
function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function cookieName(request,env){return env.LOCAL_DEV==='1'&&['localhost','127.0.0.1'].includes(new URL(request.url).hostname)?'hemart_seller_local':'__Host-hemart_seller';}
function readSession(request,env){const name=cookieName(request,env);return (request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);}
function sessionCookie(request,env,value,maxAge){const name=cookieName(request,env);return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${name.startsWith('__Host-')?'; Secure':''}`;}
export function authConfigured(env){return !!env.SELLER_USERNAME&&validHash(env.SELLER_PASSWORD_HASH);}
async function credentialVersion(env){return digest(env.SELLER_USERNAME+'\n'+env.SELLER_PASSWORD_HASH);}
export async function sellerSession(request,env){
 if(!env.DB||!authConfigured(env))return false;
 const value=readSession(request,env);if(!value||!/^[-_a-zA-Z0-9]{43}$/.test(value))return false;
 const row=await env.DB.prepare('SELECT credential_version,expires_at FROM seller_sessions WHERE token_hash=?').bind(await digest(value)).first();
 return !!row&&row.expires_at>Date.now()&&equal(row.credential_version,await credentialVersion(env));
}
function authJSON(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});}
export async function authEndpoint(request,env,path){
 if(request.method!=='POST')return authJSON({error:'Metode tidak didukung.'},405);
 if(!env.DB)return authJSON({error:'Penyimpanan belum siap.'},503);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return authJSON({error:'Asal permintaan tidak diizinkan.'},403);
 if(!request.headers.get('Content-Type')?.includes('application/json'))return authJSON({error:'Gunakan JSON.'},415);
 if(path==='/api/auth/logout'){const value=readSession(request,env);if(value)await env.DB.prepare('DELETE FROM seller_sessions WHERE token_hash=?').bind(await digest(value)).run();return authJSON({ok:true},200,{'Set-Cookie':sessionCookie(request,env,'',0)});}
 if(!authConfigured(env))return authJSON({error:'Akun penjual belum disiapkan. Pemilik perlu menjalankan pengaturan akun terlebih dahulu.'},503);
 // Increment before password verification to limit guessing and expensive derivation.
 const now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const limitKey='login:'+await digest(ip+':'+Math.floor(now/900000));
 const limit=await env.DB.prepare('INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(limitKey,now+900000).first();
 if(limit.hits>10)return authJSON({error:'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.'},429,{'Retry-After':'900'});
 const raw=await boundedText(request,2048);
 let input;try{input=JSON.parse(raw);}catch{return authJSON({error:'Format permintaan tidak valid.'},400);}
 if(!input||typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>80||input.password.length>256)return authJSON({error:'Nama pengguna atau kata sandi salah.'},401);
 const candidate=await passwordHash(input.password,env.SELLER_PASSWORD_HASH.split('$')[2]);
 if(!equal(candidate,env.SELLER_PASSWORD_HASH)||!equal(input.username.trim(),env.SELLER_USERNAME))return authJSON({error:'Nama pengguna atau kata sandi salah.'},401);
 const value=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const old=readSession(request,env);if(old)await env.DB.prepare('DELETE FROM seller_sessions WHERE token_hash=?').bind(await digest(old)).run();
 await env.DB.prepare('DELETE FROM seller_sessions WHERE expires_at<=?').bind(now).run();
 await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<=?').bind(now).run();
 await env.DB.prepare('INSERT INTO seller_sessions(token_hash,credential_version,expires_at) VALUES(?,?,?)').bind(await digest(value),await credentialVersion(env),now+SESSION_SECONDS*1000).run();
 return authJSON({ok:true},200,{'Set-Cookie':sessionCookie(request,env,value,SESSION_SECONDS)});
}
