import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliveryDate,total,preparation} from '../public/domain.js';
test('Jakarta cutoff moves delivery one extra day at 21:00',()=>{assert.equal(deliveryDate(new Date('2026-10-11T13:59:00Z')).toISOString().slice(0,10),'2026-10-12');assert.equal(deliveryDate(new Date('2026-10-11T14:00:00Z')).toISOString().slice(0,10),'2026-10-13');});
test('cutoff handles year rollover',()=>{assert.equal(deliveryDate(new Date('2026-12-31T14:30:00Z')).toISOString().slice(0,10),'2027-01-02');});
test('totals use product prices',()=>assert.equal(total({a:2,b:3},[{id:'a',price:5000},{id:'b',price:8000}]),34000));
test('preparation combines portions and excludes delivered orders',()=>{const item={id:'carrot',name:'Carrot',unit:'500 g',qty:2};assert.deepEqual(preparation([{status:'Diterima',items:[item]},{status:'Dikemas',items:[{...item,qty:3}]},{status:'Selesai',items:[item]}]),[{name:'Carrot',unit:'500 g',qty:5}]);});
