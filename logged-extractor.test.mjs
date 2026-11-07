import test from 'node:test';import assert from 'node:assert/strict';
import {createLoggedExtractor,extractionPrompt} from './logged-extractor.mjs';
test('host identity and reserved IDs remain distinct from narrative aliases',()=>{
 const p=extractionPrompt({binding:{character:'Test role'},timeline:[],revision:'r',existingRecords:[],reservedRecordIds:['existing-id']});
 assert.match(p,/不得用正文姓名替代/);assert.match(p,/只有证据支持当前角色知情/);
 const j=JSON.parse(p.slice(p.indexOf('\n{')+1));assert.equal(j.character,'Test role');assert.deepEqual(j.reservedRecordIds,['existing-id']);assert.deepEqual(j.existingRecords,[]);
 assert.throws(()=>extractionPrompt({binding:{character:'Test role'},timeline:[],revision:'r',reservedRecordIds:['x'.repeat(500)],maxInputChars:100}),/budget/);
});
const input=()=>({binding:{character:'Synthetic',modelSelection:{provider:'fake',model:'fake'}},timeline:[],revision:'rev',signal:new AbortController().signal});
function fixture(text='[]'){
 let disposed=0,sent,options;
 const agent={followup:m=>sent=m,whenIdle:async()=>{},session:{deriveMessages:()=>[{role:'assistant',content:[{type:'text',text}]}]}};
 const run=createLoggedExtractor({agents:{create:async o=>{options=o;return {agent,dispose:async()=>disposed++}}},SessionId:x=>x,createUserMessage:x=>x,setup:()=>{}});
 return {run,get disposed(){return disposed},get sent(){return sent},get options(){return options}};
}
test('extraction is a normal logged user message in separate host agent',async()=>{
 const f=fixture();assert.deepEqual(await f.run(input()),[]);assert.equal(f.disposed,1);
 assert.match(f.options.sessionId,/^story-extract-/);assert.equal(f.options.agentOptions.provider,'fake');
 assert.equal(f.sent.source.kind,'user');assert.match(f.sent.content[0].text,/"revision":"rev"/);
});
test('invalid model output still disposes auxiliary agent',async()=>{
 const f=fixture('not json');await assert.rejects(f.run(input()));assert.equal(f.disposed,1);
});
test('oversized source budget rejects before creating a host agent',async()=>{
 const f=fixture();const i=input();i.maxInputChars=10;
 await assert.rejects(f.run(i),/exceeds budget/);assert.equal(f.options,undefined);
});
test('record count is bounded by output budget',()=>{
 assert.match(extractionPrompt(input()),/最多3条/);
 assert.match(extractionPrompt({...input(),maxTokens:600}),/最多1条/);
 assert.match(extractionPrompt({...input(),maxTokens:16000}),/最多8条/);
});
test('runtime output budget also controls the logged prompt',async()=>{
 const f=fixture();await f.run({...input(),maxTokens:1200});
 assert.equal(f.options.agentOptions.maxTokens,1200);
 assert.match(f.sent.content[0].text,/最多2条/);
});
test('truncated JSON fails closed and disposes agent',async()=>{
 const f=fixture('[{"id":"partial"');await assert.rejects(f.run(input()),SyntaxError);assert.equal(f.disposed,1);
});
test('missing model is rejected before creation',async()=>{
 const f=fixture();const i=input();delete i.binding.modelSelection;
 await assert.rejects(f.run(i),/provider\/model/);assert.equal(f.disposed,0);
});
