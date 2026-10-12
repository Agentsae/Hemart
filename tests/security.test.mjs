import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../worker/api.js';
import {protectRequest,boundedText} from '../worker/security.js';
import {localRateLimits} from '../scripts/local-rate-limits.mjs';
import {allowRateLimits} from './rate-limit-fixture.mjs';
const request=(path='/',method='GET',ip='192.0.2.1',extra={})=>new Request('https://hemart.test'+path,{method,headers:{'CF-Connecting-IP':ip,...extra}});
test('every configured budget rejects bursts, resets, and separates clients',async()=>{
 for(const [path,method,count] of [['/','GET',300],['/api/bootstrap','GET',120],['/api/seller/settings','PUT',30],['/api/orders','POST',5],['/api/auth/login','POST',5]]){
  let now=0;const env=localRateLimits(()=>now);
  for(let i=0;i<count;i++)assert.equal(await protectRequest(request(path+'?q='+i,method),env),null);
  const denied=await protectRequest(request(path,method),env);assert.equal(denied.status,429);assert.equal(denied.headers.get('Retry-After'),'60');assert.equal(denied.headers.get('Cache-Control'),'no-store');
  assert.equal(await protectRequest(request(path,method,'192.0.2.2'),env),null);
  now=60000;assert.equal(await protectRequest(request(path,method),env),null);
 }
});
test('changing resource IDs, receipt tokens and forwarding headers cannot reset API budget',async()=>{
 const env=localRateLimits();
 for(let i=0;i<120;i++)assert.equal(await protectRequest(request('/api/orders/HM-'+i,'GET','192.0.2.1',{'X-Forwarded-For':String(i),'X-Receipt-Token':String(i)}),env),null);
 assert.equal((await protectRequest(request('/api/bootstrap'),env)).status,429);
});
test('rate denial or broken bindings never reaches database or reads body',async()=>{
 const DB={prepare(){assert.fail('Database must not be touched');}};
 for(const binding of [undefined,{limit:async()=>{throw new Error('offline');}},{limit:async()=>({})},{limit:async()=>({success:false})}]){
  const env={...allowRateLimits(),DB,REQUEST_LIMIT:binding};
  const r=await handle(request('/api/auth/login','POST'),env);
  assert.equal(r.status,binding?.limit&& (await binding.limit().catch(()=>null))?.success===false?429:503);
 }
 const env={...allowRateLimits(),DB,LOGIN_LIMIT:{limit:async()=>({success:false})}};
 assert.equal((await handle(request('/api/auth/login','POST'),env)).status,429);
});
test('oversized declared bodies and URLs are rejected before database',async()=>{
 const env={...allowRateLimits(),DB:{prepare(){assert.fail('No database access');}}};
 assert.equal((await handle(request('/api/auth/login','POST','192.0.2.1',{'Content-Length':'2049'}),env)).status,413);
 assert.equal((await handle(request('/api/orders','POST','192.0.2.1',{'Content-Length':'20001'}),env)).status,413);
 assert.equal((await handle(request('/'+ 'x'.repeat(4096)),env)).status,414);
 assert.equal((await handle(request('/api/bootstrap','DELETE'),env)).status,405);
});
test('stream size limits count bytes and cancel chunked uploads without buffering remainder',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({pull(controller){controller.enqueue(new TextEncoder().encode('é'.repeat(600)));},cancel(){cancelled=true;}});
 const req=new Request('https://hemart.test/api/orders',{method:'POST',body:stream,duplex:'half'});
 await assert.rejects(boundedText(req,2048),{status:413});assert.equal(cancelled,true);
 const normal=new Request('https://hemart.test',{method:'POST',body:'{"name":"Bapak"}'});
 assert.equal(await boundedText(normal,2048),'{"name":"Bapak"}');
});
