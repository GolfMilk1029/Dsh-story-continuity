import test from 'node:test';import assert from 'node:assert/strict';
import {ExtractionController,timelineRevision} from './extraction-controller.mjs';
const binding={storyId:'synthetic'};
const turn=token=>[{role:'user',token:'user'},{role:'assistant',token}];
test('coalesces concurrent extraction and skips already completed revision',async()=>{
 let calls=0,writes=0;const t=turn('a');
 const c=new ExtractionController({readTimeline:async()=>t,runLogged:async()=>{calls++;return []},submit:()=>{writes++}});
 await Promise.all([c.schedule(binding),c.schedule(binding)]);await c.schedule(binding);
 assert.equal(calls,1);assert.equal(writes,1);c.dispose();
});
test('edited source discards old proposal and retries current timeline',async()=>{
 let t=turn('old'),calls=0;const saved=[];
 const c=new ExtractionController({readTimeline:async()=>t,runLogged:async()=>{calls++;if(calls===1)t=turn('new');return [{text:calls===1?'stale':'fresh'}]},submit:(_b,r,p)=>{assert.equal(r,timelineRevision(t));saved.push(p)}});
 await c.schedule(binding);assert.equal(calls,2);assert.deepEqual(saved,[[{text:'fresh'}]]);
});
test('failed extraction never writes or marks revision complete',async()=>{
 let calls=0,writes=0;const c=new ExtractionController({readTimeline:async()=>turn('a'),runLogged:async()=>{calls++;throw Error('offline')},submit:()=>writes++});
 await assert.rejects(c.schedule(binding),/offline/);await assert.rejects(c.schedule(binding),/offline/);
 assert.equal(calls,2);assert.equal(writes,0);
});
test('incomplete user tail does not start model request',async()=>{
 const c=new ExtractionController({readTimeline:async()=>[{role:'user',token:'u'}],runLogged:()=>assert.fail(),submit:()=>assert.fail()});
 assert.equal((await c.schedule(binding)).status,'not-complete');
});
test('disposal aborts extraction without committing',async()=>{
 let release;const gate=new Promise(r=>release=r);let writes=0;
 const c=new ExtractionController({readTimeline:async()=>turn('a'),runLogged:async()=>{await gate;return []},submit:()=>writes++});
 const p=c.schedule(binding);await new Promise(r=>setTimeout(r,0));c.dispose();release();
 await assert.rejects(p);assert.equal(writes,0);await assert.rejects(c.schedule(binding),/disposed/);
});
