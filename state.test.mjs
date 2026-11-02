import test from 'node:test';import assert from 'node:assert/strict';
import {createLoggedSimulator} from './logged-simulator.mjs';
import {StateController} from './state-controller.mjs';
import {timelineRevision} from './extraction-controller.mjs';
const binding={character:'琉璃',storyId:'eleckoi:chat',modelSelection:{provider:'fake',model:'fake'}};
function fixture(text='{}'){
 let disposed=0,sent,options;
 const agent={followup:m=>sent=m,whenIdle:async()=>{},session:{deriveMessages:()=>[{role:'assistant',content:[{type:'text',text}]}]}};
 const run=createLoggedSimulator({agents:{create:async o=>{options=o;return {agent,dispose:async()=>disposed++}}},SessionId:x=>x,createUserMessage:x=>x,setup:()=>{}});
 return {run,get disposed(){return disposed},get sent(){return sent},get options(){return options}};
}
test('state maintenance runs as a separate logged host agent',async()=>{
 const f=fixture('{"storyTime":{"elapsedMinutes":0}}');
 const value=await f.run({binding,prompt:'STATE PROMPT',signal:new AbortController().signal,maxTokens:900});
 assert.deepEqual(value,{storyTime:{elapsedMinutes:0}});
 assert.match(f.options.sessionId,/^story-state-/);assert.equal(f.options.agentOptions.maxTokens,900);
 assert.equal(f.sent.content[0].text,'STATE PROMPT');assert.equal(f.disposed,1);
});
test('a state answer must be a single JSON object',async()=>{
 const f=fixture('[1,2]');await assert.rejects(f.run({binding,prompt:'x',signal:new AbortController().signal}),/not an object/);
 assert.equal(f.disposed,1);
 const g=fixture('{"affect":');await assert.rejects(g.run({binding,prompt:'x',signal:new AbortController().signal}),SyntaxError);
 assert.equal(g.disposed,1);
});
test('missing provider, prompt or model fails before any agent is created',async()=>{
 const f=fixture();const signal=new AbortController().signal;
 await assert.rejects(f.run({binding,prompt:'',signal}),/Explicit state prompt/);
 await assert.rejects(f.run({binding:{...binding,modelSelection:{}},prompt:'x',signal}),/provider\/model/);
 assert.equal(f.options,undefined);
});
const story=[{id:'a',role:'user',text:'你好',token:'t1'},{id:'b',role:'assistant',text:'嗯。',token:'t2'}];
function controller(overrides={}){
 let timeline=overrides.timeline??story,calls=0,commits=[];
 const control=new StateController({
  readTimeline:async()=>structuredClone(timeline),
  runLogged:async({revision})=>{calls++;if(overrides.edit)timeline=[timeline[0],{...timeline[1],token:'t2-edited',text:'嗯。她改了口。'}];return {storyTime:{elapsedMinutes:0},revision};},
  submit:(b,revision,proposal)=>{commits.push({revision,proposal});return {ok:true};},
  onError:overrides.onError??(()=>{})});
 return {control,get calls(){return calls},get commits(){return commits},set timeline(v){timeline=v}};
}
test('controller commits once, coalesces concurrent turns and skips unchanged revisions',async()=>{
 const c=controller();
 const [a,b]=await Promise.all([c.control.schedule(binding),c.control.schedule(binding)]);
 assert.equal(a.status,'committed');assert.equal(b.status,'committed');assert.equal(c.calls,1);assert.equal(c.commits.length,1);
 assert.equal((await c.control.schedule(binding)).status,'unchanged');assert.equal(c.calls,1);
});
test('an incomplete turn and a mid-flight edit never commit stale state',async()=>{
 const pending=controller({timeline:[story[0]]});
 assert.equal((await pending.control.schedule(binding)).status,'not-complete');assert.equal(pending.calls,0);
 const racing=controller({edit:true});racing.timeline=story;
 const result=await racing.control.schedule(binding);
 // The edit re-runs the request; the commit must bind the edited story, never the first read.
 assert.equal(result.status,'committed');
 const finalTimeline=[story[0],{...story[1],token:'t2-edited',text:'嗯。她改了口。'}];
 assert.equal(racing.commits.length,1);
 assert.equal(racing.commits[0].revision,timelineRevision(finalTimeline));
});
test('aborted maintenance reports no commit and disposal stops further work',async()=>{
 let release;const gate=new Promise(r=>{release=r});let commits=0;
 const control=new StateController({readTimeline:async()=>structuredClone(story),
  runLogged:async()=>{await gate;return {storyTime:{elapsedMinutes:0}};},
  submit:()=>{commits++;return {ok:true};},onError:()=>{}});
 const pending=control.schedule(binding);
 control.cancel(binding.storyId);
 release();
 await assert.rejects(pending,/abort/i);
 assert.equal(commits,0);
 control.dispose();
 await assert.rejects(control.schedule(binding),/disposed/);
});
test('revision helper ignores nothing and detects text edits',()=>{
 assert.equal(timelineRevision(story),timelineRevision(structuredClone(story)));
 assert.notEqual(timelineRevision(story),timelineRevision([{...story[0],token:'changed'},story[1]]));
});
