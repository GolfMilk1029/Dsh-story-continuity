import test from 'node:test';import assert from 'node:assert/strict';
import {createLoggedExtractor} from './logged-extractor.mjs';
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
test('missing model is rejected before creation',async()=>{
 const f=fixture();const i=input();delete i.binding.modelSelection;
 await assert.rejects(f.run(i),/provider\/model/);assert.equal(f.disposed,0);
});
