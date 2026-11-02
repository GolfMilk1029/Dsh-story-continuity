import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StateStore} from './state-store.mjs';
import {validateSimulation} from './state-sim.mjs';
const tl=[{id:'u',role:'user',text:'三天后。',token:'u1'},{id:'a',role:'assistant',text:'雨停了。',token:'a1'}];
const jump=timeline=>validateSimulation({storyTime:{elapsedMinutes:4320,sourceId:'u',evidence:'三天后'}},{timeline});
test('restart and repeated turn cannot count a time jump twice',()=>{
 const root=mkdtempSync(join(tmpdir(),'clock-regression-'));
 new StateStore(root).commit('s',tl,'C',jump(tl));
 const restarted=new StateStore(root);
 const result=restarted.commit('s',tl,'C',jump(tl));
 assert.equal(result.duplicate,true);assert.equal(result.snapshot.storyTime.minutes,4320);
 assert.equal(restarted.read('s').snapshots.length,1);
});
test('later turn cannot reuse old evidence, even after retained snapshot trimming',()=>{
 const store=new StateStore(mkdtempSync(join(tmpdir(),'clock-regression-')));
 store.commit('s',tl,'C',jump(tl),{maxSnapshots:1});
 const next=[...tl,{id:'u2',role:'user',text:'你好',token:'u2'},{id:'a2',role:'assistant',text:'嗯',token:'a2'}];
 assert.throws(()=>store.commit('s',next,'C',jump(next)),/already observed/);
 const quiet=validateSimulation({},{timeline:next});
 const result=store.commit('s',next,'C',quiet,{maxSnapshots:1});
 assert.equal(result.snapshot.storyTime.minutes,4320);
 const later=[...next,{id:'a3',role:'assistant',text:'仍在原地',token:'a3'}];
 assert.throws(()=>store.commit('s',later,'C',jump(later)),/already observed/);
});
