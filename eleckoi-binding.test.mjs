import test from 'node:test';import assert from 'node:assert/strict';
import {resolveElecKoiBinding as resolve} from './eleckoi-binding.mjs';
const row={id:'conversation-test',runtimeSessionId:'runtime-test',metadata:{characterId:'character-test',characterName:'Test'}};
test('public catalog maps conversation ID to distinct runtime identity',async()=>{
 const control=new AbortController();
 const api={list:async signal=>{assert.equal(signal,control.signal);return [row]}};
 assert.deepEqual(await resolve(api,row.id,control.signal),{sessionId:'runtime-test',character:'Test',characterId:'character-test',storyId:'eleckoi:conversation-test'});
 await assert.rejects(resolve(api,row.runtimeSessionId,control.signal),/missing/);
});
test('catalog failures and ambiguous identity fail closed',async()=>{
 await assert.rejects(resolve(null,row.id),/unavailable/);
 await assert.rejects(resolve({list:async()=>[row,row]},row.id),/ambiguous/);
 await assert.rejects(resolve({list:async()=>[{...row,metadata:{}}]},row.id),/Incomplete/);
});
test('explicit unique title resolves to stable ID, duplicates fail closed',async()=>{
 const titled={...row,title:'Synthetic acceptance'};
 const b=await resolve({list:async()=>[titled]},'title:Synthetic acceptance');
 assert.equal(b.storyId,'eleckoi:'+row.id);
 await assert.rejects(resolve({list:async()=>[titled,{...titled,id:'sibling'}]},'title:Synthetic acceptance'),/ambiguous/);
});
test('binding resolution observes cancellation',async()=>{
 const c=new AbortController();c.abort();
 await assert.rejects(resolve({list:async()=>assert.fail()},row.id,c.signal));
});
