import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {apply,Config} from './index.mjs';
test('state-only toggle reads persona and fails closed without generic fallback',async()=>{
 const events=new Map(),warnings=[];let reads=0;
 const row={id:'chat',runtimeSessionId:'runtime',metadata:{characterId:'c',characterName:'Synthetic'}};
 const api={list:async()=>[row],authorState:async id=>{assert.equal(id,'chat');reads++;return {settingLibrary:null}}};
 const ctx={agents:{create:()=>assert.fail('No persona: no model call')},tools:{},systemPrompt:{context:()=>{}},on:(n,f)=>events.set(n,f),effect:f=>f(),get:()=>api,logger:{warn:(...a)=>warnings.push(a)}};
 apply(ctx,Config({enabled:true,automaticExtraction:false,stateSimulation:true,conversationId:'chat',dataRoot:mkdtempSync(join(tmpdir(),'state-host-'))}));
 await events.get('agent/turn-stopping')({agent:{session:{id:'runtime',deriveMessages:()=>[]},options:{provider:'fake',model:'fake'}},signal:new AbortController().signal});
 assert.equal(reads,1);assert.equal(warnings.length,1);assert.match(warnings[0].join(' '),/persona material unavailable/);
});
