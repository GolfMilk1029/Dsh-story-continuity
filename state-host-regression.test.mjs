import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import fs from 'node:fs';
import {apply,Config,createDiagnostic} from './index.mjs';
test('diagnostic is opt-in, bounded metadata, and refuses unrelated files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'story-diagnostic-')),target=join(dir,'story-continuity-diagnostic.json');
 createDiagnostic(Config({}))('plugin-ready');assert.equal(fs.existsSync(target),false);
 const report=createDiagnostic(Config({diagnosticPath:target}));report('plugin-ready');report('binding-matched');report('PRIVATE BODY SECRET');
 const value=JSON.parse(fs.readFileSync(target,'utf8'));assert.equal(value.sequence,2);assert.equal(value.counts['binding-matched'],1);assert.doesNotMatch(JSON.stringify(value),/SECRET/);
 const other=join(mkdtempSync(join(tmpdir(),'story-diagnostic-other-')),'story-continuity-diagnostic.json');fs.writeFileSync(other,'private file');createDiagnostic(Config({diagnosticPath:other}))('plugin-ready');assert.equal(fs.readFileSync(other,'utf8'),'private file');
 assert.doesNotThrow(()=>createDiagnostic(Config({diagnosticPath:'/missing-parent/story-continuity-diagnostic.json'}))('plugin-ready'));
});
test('missing binding never blocks an unrelated main conversation',async()=>{
 const events=new Map(),warnings=[];let continued=0;
 const ctx={agents:{create:()=>assert.fail('No binding: no model call')},tools:{},systemPrompt:{context:()=>{}},on:(n,f)=>events.set(n,f),effect:f=>f(),get:()=>({list:async()=>[]}),logger:{warn:(...a)=>warnings.push(a)}};
 apply(ctx,Config({enabled:true,automaticExtraction:true,stateSimulation:true,conversationId:'title:Missing',dataRoot:mkdtempSync(join(tmpdir(),'binding-host-'))}));
 const payload={agent:{session:{id:'unrelated',deriveMessages:()=>[]},options:{}},signal:new AbortController().signal};
 await events.get('agent/pre-step')(payload,()=>{continued++;return 'continued'});
 await events.get('agent/turn-stopping')(payload);
 assert.equal(continued,1);assert.equal(warnings.length,2);
});
test('state-only toggle reads persona and fails closed without generic fallback',async()=>{
 const events=new Map(),warnings=[];let reads=0;
 const row={id:'chat',runtimeSessionId:'runtime',metadata:{characterId:'c',characterName:'Synthetic'}};
 const api={list:async()=>[row],authorState:async id=>{assert.equal(id,'chat');reads++;return {settingLibrary:null}}};
 const ctx={agents:{create:()=>assert.fail('No persona: no model call')},tools:{},systemPrompt:{context:()=>{}},on:(n,f)=>events.set(n,f),effect:f=>f(),get:()=>api,logger:{warn:(...a)=>warnings.push(a)}};
 apply(ctx,Config({enabled:true,automaticExtraction:false,stateSimulation:true,conversationId:'chat',dataRoot:mkdtempSync(join(tmpdir(),'state-host-'))}));
 await events.get('agent/turn-stopping')({agent:{session:{id:'runtime',deriveMessages:()=>[]},options:{provider:'fake',model:'fake'}},signal:new AbortController().signal});
 assert.equal(reads,1);assert.equal(warnings.length,1);assert.match(warnings[0].join(' '),/persona material unavailable/);
});
