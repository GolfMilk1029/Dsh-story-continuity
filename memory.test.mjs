import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {emptyStore,commit,activeRecords,recall,project,ROUTINE_STATUS} from './core.mjs';
import {FileStore,digest,timelineOf} from './store.mjs';
import {renderMemory,characterMemory,MEMORY_FRAME} from './memory.mjs';
import {extractionPrompt} from './logged-extractor.mjs';
import {statePrompt} from './state-sim.mjs';
import {apply,Config} from './index.mjs';
const msg=(id,text)=>({id,text,role:'assistant',token:digest(id+text)});
const save=(s,t,r)=>commit(s,t,r,digest).store;
const base=(id,kind,key,text,source,extra={})=>({id,kind,key,text,
 sourceId:source.id,evidence:source.text,origin:'narrative',certainty:'certain',knownBy:['A'],...extra});

// ---- self-narration must never become an established fact ----------------------
test('a diary entry cannot establish a fact and never enters fact recall', () => {
  const t=[msg('1','她把伞落在木箱上。')];
  const diary=base('d1','diary','diary-1','今天我把伞忘了',t[0],{origin:'diary'});
  const s=save(emptyStore(),t,[diary]);
  assert.equal(recall(activeRecords(s,t),{character:'A'}),'[]');
  assert.deepEqual(Object.keys(project(activeRecords(s,t)).state),[]);
  // Derived prose still may not masquerade as an objective record.
  assert.throws(()=>save(emptyStore(),t,[base('x','event','e','她说伞忘了一起找',t[0],{origin:'diary'})]),
    /Derived prose cannot establish objective facts/);
});

test('a reflection is derived prose and needs a derived origin', () => {
  const t=[msg('1','他把伞留下了。')];
  assert.throws(()=>save(emptyStore(),t,[base('r1','reflection','self','也许我不该赶他走',t[0])]),/Derived origin required/);
  const reflection=base('r2','reflection','self','也许我不该赶他走',t[0],{origin:'diary'});
  const s=save(emptyStore(),t,[reflection]);
  assert.equal(recall(activeRecords(s,t),{character:'A'}),'[]');
  assert.equal(characterMemory(activeRecords(s,t),'A').entries.length,1);
});

// ---- goals and routines are intent / structure, not facts ---------------------
test('goals and routines stay out of the fact channel', () => {
  const t=[msg('1','她说要去找妹妹。')];
  const s=save(emptyStore(),t,[
    base('g1','goal','sister','找到妹妹',t[0],{status:'open'}),
    base('l1','routine','tea','午后去茶铺帮工',t[0],{status:'active',cadence:'每天午后'})]);
  assert.equal(recall(activeRecords(s,t),{character:'A'}),'[]');
  const p=project(activeRecords(s,t));
  assert.equal(p.threads.sister.status,'open');
  assert.equal(p.memory.tea.status,'active');
  assert.equal(p.memory.tea.cadence,'每天午后');
});

test('a goal obeys the same reopen guard as a plan', () => {
  const t=[msg('1','她找到了妹妹。')];
  let s=save(emptyStore(),t,[base('g1','goal','sister','找到妹妹',t[0],{status:'open'})]);
  s=save(s,t,[base('g2','goal','sister','她找到了妹妹',t[0],{status:'fulfilled'})]);
  assert.throws(()=>save(s,t,[base('g3','goal','sister','她又开始找',t[0],{status:'open'})]),
    /explicit changed record/);
});

test('a routine uses its own lifecycle vocabulary', () => {
  assert.ok(ROUTINE_STATUS.has('active')&&ROUTINE_STATUS.has('suspended')&&ROUTINE_STATUS.has('ended'));
  const t=[msg('1','她每天清晨喂鸡。')];
  const ok=base('l1','routine','chicken','清晨喂鸡',t[0],{status:'active',cadence:'每天清晨'});
  assert.doesNotThrow(()=>save(emptyStore(),t,[ok]));
  assert.throws(()=>save(emptyStore(),t,[base('l2','routine','chicken','清晨喂鸡',t[0],{status:'open'})]),
    /Routine status required/);
  assert.throws(()=>save(emptyStore(),t,[base('l3','routine','chicken','清晨喂鸡',t[0],{status:'active',cadence:'x'.repeat(61)})]),
    /Invalid cadence/);
});

// ---- rendering ---------------------------------------------------------------
test('memory renders in its own framed block with character scoping', () => {
  const t=[msg('1','她答应了。')];
  const mine=[
    base('g1','goal','sister','找到妹妹',t[0],{status:'open'}),
    base('l1','routine','tea','午后去茶铺帮工',t[0],{status:'active',cadence:'每天午后'}),
    base('d1','diary','diary-1','今天我又没敢问',t[0],{origin:'diary'}),
    base('r1','reflection','self','也许我一直在等',t[0],{origin:'diary'})];
  const active=activeRecords(save(emptyStore(),t,mine),t);
  const text=renderMemory(active,{character:'A'});
  assert.ok(text.includes(MEMORY_FRAME),'the memory frame must be present');
  assert.match(text,/长期目标：找到妹妹/);
  assert.match(text,/生活作息：午后去茶铺帮工（每天午后）/);
  assert.match(text,/\[日记\] 今天我又没敢问/);
  assert.match(text,/\[反思\] 也许我一直在等/);
  // Another character inherits nothing.
  assert.equal(renderMemory(active,{character:'B'}),'');
  assert.equal(renderMemory(active,{character:''}),'');
});

test('closed goals and stopped routines are not injected as live intent', () => {
  const t=[msg('1','她找到了妹妹。'),msg('2','她不再去茶铺了。')];
  let s=save(emptyStore(),t,[base('g1','goal','sister','找到妹妹',t[0],{status:'open'})]);
  s=save(s,t,[base('g2','goal','sister','她找到了妹妹',t[1],{status:'fulfilled'})]);
  s=save(s,t,[base('l1','routine','tea','午后去茶铺帮工',t[1],{status:'ended'})]);
  assert.equal(renderMemory(activeRecords(s,t),{character:'A'}),'');
});

test('memory injection is bounded and rejects bad budgets', () => {
  const t=[msg('1','她答应了。')];
  const many=Array.from({length:6},(_,i)=>base('d'+i,'diary','diary-'+i,'第'+i+'天的记录'.repeat(20),t[0],{origin:'diary'}));
  const active=activeRecords(save(emptyStore(),t,many),t);
  const text=renderMemory(active,{character:'A',maxChars:200,maxDiary:2});
  assert.ok(text.length<=200);
  assert.equal((text.match(/\[日记\]/g)||[]).length,2);
  assert.throws(()=>renderMemory(active,{character:'A',maxChars:50}),/Invalid memory injection budget/);
  assert.throws(()=>renderMemory(active,{character:'A',maxDiary:99}),/Invalid maxDiary/);
});

// ---- prompts carry the rules only when the feature is on ---------------------
test('the extractor asks for memory kinds only when storyMemory is on', () => {
  const input={binding:{character:'A'},timeline:[],revision:'r'};
  const off=extractionPrompt(input);
  assert.equal(/kind=goal/.test(off),false);
  assert.equal(JSON.parse(off.slice(off.indexOf('\n{')+1)).storyMemory,false);
  const on=extractionPrompt({...input,storyMemory:true});
  assert.match(on,/kind=goal/);
  assert.match(on,/kind=routine/);
  assert.match(on,/kind=diary/);
  assert.match(on,/kind=reflection/);
  assert.match(on,/不得直接改任何 goal\/plan 的 status/);
});

test('the state prompt may see goals but never diary prose', () => {
  const timeline=[{id:'m1',role:'user',text:'她把伞放下。'}];
  const prompt=statePrompt({character:'琉璃',persona:{digest:'d',text:'护林人'},timeline,revision:'r',
    facts:[],memory:{goals:['找到妹妹'],routines:['清晨喂鸡'],entries:['今天我很想你']}});
  const payload=JSON.parse(prompt.slice(prompt.indexOf('\n{')+1));
  assert.deepEqual(payload.memory,{goals:['找到妹妹'],routines:['清晨喂鸡']});
  assert.equal(/今天我很想你/.test(prompt),false);
});

// ---- host wiring -------------------------------------------------------------
function hostContext({storyMemory}){
  const root=mkdtempSync(join(tmpdir(),'memory-host-'));
  const messages=[
    {id:'m1',role:'user',source:{kind:'user'},content:[{type:'text',text:'她把伞放下了。'}]},
    {id:'m2',role:'assistant',content:[{type:'text',text:'雨停了她才走。'}]}];
  const timeline=timelineOf(messages);
  new FileStore(root).submit('eleckoi:chat',timeline,[
    {id:'g1',kind:'goal',key:'sister',text:'找到妹妹',sourceId:'m2',evidence:'雨停了她才走。',
     origin:'narrative',certainty:'certain',knownBy:['Synthetic'],status:'open'},
    {id:'d1',kind:'diary',key:'diary-1',text:'今天雨停了。',sourceId:'m2',evidence:'雨停了她才走。',
     origin:'diary',certainty:'certain',knownBy:['Synthetic']}]);
  const row={id:'chat',runtimeSessionId:'runtime',metadata:{characterId:'c',characterName:'Synthetic'}};
  const events=new Map(),contexts=[];
  const ctx={agents:{create:()=>assert.fail('no model call expected')},tools:{},
    systemPrompt:{context:c=>contexts.push(c)},on:(n,f)=>events.set(n,f),effect:f=>f(),
    get:()=>({list:async()=>[row]}),logger:{warn:()=>{}}};
  apply(ctx,Config({enabled:true,conversationId:'chat',dataRoot:root,storyMemory}));
  return {events,contexts,agent:{session:{id:'runtime',deriveMessages:()=>messages},options:{provider:'p',model:'m'}}};
}
test('the host injects the memory block only when storyMemory is enabled', async () => {
  for(const enabled of [false,true]){
    const h=hostContext({storyMemory:enabled});
    await h.events.get('agent/pre-step')({agent:h.agent,signal:new AbortController().signal},()=>'next');
    const text=h.contexts[0].text({agent:h.agent});
    if(enabled){
      // Nothing in this ledger is an objective fact, so the memory block is the only
      // contribution and it must carry the policy header with it.
      assert.match(text,/小说连续性/);
      assert.ok(text.includes(MEMORY_FRAME),'the memory frame must be present');
      assert.match(text,/长期目标：找到妹妹/);
      assert.match(text,/\[日记\] 今天雨停了/);
    }else{
      // With the feature off nothing of this ledger may leak, and an empty
      // contribution must not invent a policy header either.
      assert.equal(text,'');
    }
  }
});
