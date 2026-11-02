import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {StateStore,recordSnapshot,activeSnapshot,emptyStateLog} from './state-store.mjs';
import {validateSimulation} from './state-sim.mjs';
const timeline=[{id:'m1',role:'user',text:'三天后，雨停了。',token:'t1'},{id:'m2',role:'assistant',text:'她把伞放下。',token:'t2'}];
// The host validates against the exact timeline it is about to bind.
const sim=(extra,tl=timeline)=>validateSimulation({affect:{description:'心里发涩'},vitality:{level:44},...extra},{timeline:tl});
test('snapshots are story-time accumulations, never wall-clock deltas',()=>{
 const first=recordSnapshot(emptyStateLog(),timeline.slice(0,1),'琉璃',sim({storyTime:{elapsedMinutes:4320,label:'雨停',evidence:'三天后',sourceId:'m1'}},timeline.slice(0,1)));
 assert.equal(first.snapshot.storyTime.minutes,4320);
 const later=[...timeline.slice(0,1),{id:'m3',role:'user',text:'又过了一小时。',token:'t3'}];
 const second=recordSnapshot(first.log,later,'琉璃',sim({storyTime:{elapsedMinutes:60,evidence:'一小时',sourceId:'m3'}},later));
 assert.equal(second.snapshot.storyTime.minutes,4380);
 assert.equal(recordSnapshot(second.log,later,'琉璃',sim({},later)).snapshot.storyTime.minutes,4380);
});
test('edited prefix invalidates the simulated state and its clock',()=>{
 const first=recordSnapshot(emptyStateLog(),timeline,'琉璃',sim({storyTime:{elapsedMinutes:4320,evidence:'三天后',sourceId:'m1'}}));
 const edited=[{...timeline[0],token:'t1b',text:'三年后，雨停了。'},timeline[1]];
 assert.equal(activeSnapshot(first.log,edited,'琉璃'),null);
 const rebuilt=recordSnapshot(first.log,edited,'琉璃',sim({},edited));
 assert.equal(rebuilt.snapshot.storyTime.minutes,0);
 assert.equal(activeSnapshot(rebuilt.log,edited,'琉璃').elapsedMinutes,0);
});
test('another character never inherits the state',()=>{
 const first=recordSnapshot(emptyStateLog(),timeline,'琉璃',sim({}));
 assert.equal(activeSnapshot(first.log,timeline,'别人'),null);
 assert.throws(()=>recordSnapshot(emptyStateLog(),timeline,'',sim({})),/Character required/);
});
test('store round-trips atomically and rejects corrupt state',()=>{
 const root=mkdtempSync(join(tmpdir(),'story-state-'));
 const store=new StateStore(root);
 store.commit('eleckoi:chat',timeline,'琉璃',sim({}));
 assert.equal(store.read('eleckoi:chat').snapshots.length,1);
 assert.equal(store.commit('eleckoi:chat',timeline,'琉璃',sim({})).duplicate,true);
 assert.match(store.path('eleckoi:chat'),/\.state\.json$/);
 assert.match(store.path('..'),/[0-9a-f]{64}\.state\.json$/);
 writeFileSync(store.path('eleckoi:chat'),'{"version":1,"snapshots":[{"id":1}]}');
 assert.throws(()=>store.read('eleckoi:chat'),/corrupt/i);
 assert.throws(()=>store.read(''),/Scope required/);
 assert.throws(()=>new StateStore('relative/path'),/Absolute/);
});
