import test from 'node:test';import assert from 'node:assert/strict';
import {validateSimulation,statePrompt,renderState,describeMinutes} from './state-sim.mjs';
const timeline=[{id:'m1',role:'user',text:'三天后，雨停了。'},{id:'m2',role:'assistant',text:'她把伞放在木箱上。'}];
test('story time must be quoted literally from the active narrative',()=>{
 const ok=validateSimulation({storyTime:{elapsedMinutes:4320,label:'雨停',evidence:'三天后',sourceId:'m1'}},{timeline});
 assert.deepEqual(ok.storyTime,{elapsedMinutes:4320,label:'雨停',sourceId:'m1',evidence:'三天后'});
 assert.throws(()=>validateSimulation({storyTime:{elapsedMinutes:10,evidence:'三天后',sourceId:'m2'}},{timeline}),/not literal/);
 assert.throws(()=>validateSimulation({storyTime:{elapsedMinutes:10,evidence:'三天后',sourceId:'gone'}},{timeline}),/not active/);
 assert.throws(()=>validateSimulation({storyTime:{elapsedMinutes:10}},{timeline}),/needs source/);
});
test('a production answer must be a complete snapshot, never a partial patch',()=>{
 // A quiet partial answer would otherwise erase a fever and open conditions.
 const partial={storyTime:{elapsedMinutes:0}};
 assert.throws(()=>validateSimulation(partial,{timeline,requireComplete:true}),/Incomplete state snapshot/);
 const full={storyTime:{elapsedMinutes:0,label:null},affect:{description:null,intensity:null},
  vitality:{level:null,description:null},bodily:{hunger:null,health:'低烧',sleepiness:null},
  attention:{busy:null},concerns:[],conditions:[]};
 const ok=validateSimulation(full,{timeline,requireComplete:true});
 assert.equal(ok.bodily.health,'低烧');
 // Nested omissions are rejected too, not just the top level.
 const shallow={...full,vitality:{level:null}};
 assert.throws(()=>validateSimulation(shallow,{timeline,requireComplete:true}),/vitality\.description/);
 // Legacy/offline callers keep the permissive behaviour explicitly.
 assert.doesNotThrow(()=>validateSimulation(partial,{timeline}));
});
test('a persona digest change is carried as a hint, not as an invalidation',()=>{
 const prompt=statePrompt({character:'琉璃',persona:{digest:'new',text:'护林人'},timeline,revision:'r',
  previous:{storyTime:{minutes:120},elapsedMinutes:120,state:{},personaDigest:'old'}});
 assert.match(prompt,/人设变动只作提示/);
 const payload=JSON.parse(prompt.slice(prompt.indexOf('\n{')+1));
 assert.equal(payload.personaDigest,'new');
 assert.equal(payload.previous.personaDigest,'old');
});
test('input character metadata is forbidden in state output',()=>{
 assert.throws(()=>validateSimulation({character:'琉璃',storyTime:{elapsedMinutes:0}},{timeline}),/Unsupported state field: character/);
 const prompt=statePrompt({character:'琉璃',persona:{text:'静态人设'},timeline,revision:'r'});
 assert.match(prompt,/character 不是输出字段/);
 assert.match(prompt,/七个字段/);
});
test('no wall-clock or device-time fields survive validation',()=>{
 assert.throws(()=>validateSimulation({conditions:[{kind:'mood',text:'低落',expires_at:'2026-11-03T00:00:00Z'}]},{timeline}),/Unsupported condition field/);
 assert.throws(()=>validateSimulation({updatedAt:'2026-11-03'},{timeline}),/Unsupported state field/);
 assert.throws(()=>validateSimulation({storyTime:{elapsedMinutes:5,label:'现在',at:'2026-11-03'}},{timeline}),/Unsupported storyTime field/);
});
test('unknown is allowed and a quiet turn needs no change',()=>{
 const quiet=validateSimulation({storyTime:{elapsedMinutes:null,label:null},affect:{description:null,intensity:null,axes:null},
  vitality:{level:null,description:null},bodily:{hunger:null,health:null,sleepiness:null},attention:{busy:null},concerns:[],conditions:[]},{timeline});
 assert.deepEqual(quiet.concerns,[]);assert.equal(quiet.vitality.level,null);assert.equal(quiet.storyTime.elapsedMinutes,null);
});
test('ranges and shapes fail closed instead of being coerced',()=>{
 const bad=[{vitality:{level:140}},{vitality:{level:41.5}},{affect:{axes:{joy:0}}},{affect:{axes:{trust:5}}},
  {affect:{intensity:'huge'}},{concerns:['a','b','c','d','e']},{conditions:[{kind:'sad',text:'x'}]},{conditions:new Array(7).fill({kind:'mood',text:'x'})}];
 for(const value of bad)assert.throws(()=>validateSimulation(value,{timeline}));
});
test('prompt carries persona, prior simulation and story-time rules, never a clock',()=>{
 const prompt=statePrompt({character:'琉璃',persona:{digest:'d1',text:'护林人，寡言。'},timeline,revision:'r1',
  facts:[{id:'f1',text:'她收了伞'}],previous:{storyTime:{minutes:120,label:'白天'},elapsedMinutes:120,state:{},personaDigest:'d0'}});
 assert.match(prompt,/故事时间只来自/);assert.match(prompt,/护林人/);assert.match(prompt,/不得用现实时间/);
 assert.doesNotMatch(prompt,/20\d\d-\d\d-\d\d/);
 assert.throws(()=>statePrompt({character:'琉璃',persona:{digest:'d',text:'x'.repeat(4000)},timeline,revision:'r',maxInputChars:2000}),/exceeds budget/);
 });
test('injected state is compact, framed as simulation and bounded',()=>{
 const state=validateSimulation({affect:{description:'心里发涩',intensity:'mild',axes:{sorrow:6}},vitality:{level:44,description:'像没睡透'},
  bodily:{sleepiness:'有点困'},concerns:['还没还伞'],conditions:[{kind:'sleep',text:'昨夜被打断',reviewWhen:'睡过一觉后'}]},{timeline});
 const text=renderState({storyTime:{minutes:4320,label:'雨停'},elapsedMinutes:4320,state},{maxChars:600});
 assert.match(text,/模拟，不是已发生的事实/);assert.match(text,/3天/);assert.match(text,/44\/100/);assert.match(text,/还没还伞/);
 assert.equal(renderState({state,storyTime:{minutes:null}},{maxChars:200}).length<=200,true);
 assert.equal(renderState(null),'');
 assert.equal(describeMinutes(45),'45分钟');assert.equal(describeMinutes(2880),'2天');
});
