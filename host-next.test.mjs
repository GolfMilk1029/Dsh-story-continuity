import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {apply,Config} from './index.mjs';
function host(api){const events=new Map(),contexts=[],effects=[];let reads=0;
 const ctx={agents:{create:()=>assert.fail('No model calls expected')},tools:{},systemPrompt:{context:c=>contexts.push(c)},
 on:(n,f)=>events.set(n,f),effect:f=>effects.push(f()),get:n=>{assert.equal(n,'eleckoiConversationsApi');reads++;return api},logger:{warn:()=>{}}};
 return {ctx,events,contexts,get reads(){return reads}};
}
test('new host is dormant with empty configuration; no service reads or writes',async()=>{
 const h=host();apply(h.ctx,Config({}));let called=0;
 await h.events.get('agent/pre-step')({agent:{session:{id:'not-bound'}}},async()=>{called++;return {sentinel:true}});
 assert.equal(called,1);assert.equal(h.reads,0);assert.equal(h.contexts[0].text({}), '');
});
test('public identity resolves before assembly and survives a restart-style first request',async()=>{
 const root=mkdtempSync(join(tmpdir(),'story-next-host-'));
 const row={id:'synthetic-chat',runtimeSessionId:'synthetic-runtime',metadata:{characterId:'synthetic-character',characterName:'Synthetic'}};
 const h=host({list:async()=>[row]});apply(h.ctx,Config({enabled:true,conversationId:row.id,dataRoot:root}));
 const agent={session:{id:row.runtimeSessionId,deriveMessages:()=>[]},options:{provider:'synthetic',model:'synthetic'}};
 const result=await h.events.get('agent/pre-step')({agent,signal:new AbortController().signal},async()=>({marker:123}));
 assert.deepEqual(result,{marker:123});assert.match(h.contexts[0].text({agent}),/小说连续性/);
 assert.equal(h.contexts[0].text({agent:{session:{id:'other'}}}),'');
});
