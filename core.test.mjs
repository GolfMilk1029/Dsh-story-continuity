import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyStore,commit,activeRecords,committedIds,project,recall} from './core.mjs';
import {FileStore,digest,timelineOf} from './store.mjs';
const msg=(id,text)=>({id,text,role:'assistant',token:digest(id+text)});
const base=(id,key,text,sourceId,extra={})=>({id,kind:'state',key,text,sourceId,evidence:text,origin:'narrative',certainty:'certain',knownBy:['A'],...extra});
const save=(s,t,r)=>commit(s,t,r,digest).store;
test('1 wall clock never changes narrative time',()=>{
 const t=[msg('1','晚八点')],s=save(emptyStore(),t,[base('a','time','晚八点','1')]);
 assert.equal(project(activeRecords(s,t)).state.time,'晚八点');assert.deepEqual(project(activeRecords(s,t)),project(activeRecords(s,t)));
});
test('2 offscene secrets cannot enter character recall; belief is not truth',()=>{
 const t=[msg('1','秘密在地下室')],r=base('a','secret',t[0].text,'1',{knownBy:['B']});
 assert.equal(recall([r],{character:'A'}),'[]');assert.equal(recall([r]),'[]');
 const k={...r,id:'k',kind:'knowledge',character:'A',mode:'believes',acquiredBy:'猜测',text:'以为秘密在阁楼'};
 assert.deepEqual(Object.keys(project([k]).state),[]);assert.equal(JSON.parse(recall([k],{character:'A'}))[0].mode,'believes');
});
test('3 deletion and earlier edit invalidate ownership and all descendants',()=>{
 const t=[msg('1','钥匙交给A'),msg('2','A用钥匙开门')];let s=save(emptyStore(),t,[base('a','key','钥匙交给A','1')]);
 s=save(s,t,[base('b','door','A用钥匙开门','2')]);assert.equal(activeRecords(s,t).length,2);
 assert.equal(activeRecords(s,[]).length,0);assert.equal(activeRecords(s,[msg('1','没有交钥匙'),t[1]]).length,0);
});
test('4 regeneration retires previous assistant revision',()=>{
 const t=[msg('1','钥匙给A')],s=save(emptyStore(),t,[base('a','key','钥匙给A','1')]);assert.equal(activeRecords(s,[msg('1','钥匙给B')]).length,0);
});
test('5 siblings share prefix only, never divergent branch facts',()=>{
 const common=msg('1','在门口'),left=[common,msg('2','去了花园')],right=[common,msg('3','去了厨房')];
 let s=save(emptyStore(),[common],[base('a','location','在门口','1')]);s=save(s,left,[base('b','location','去了花园','2')]);
 assert.equal(project(activeRecords(s,right)).state.location,'在门口');
});
test('6 gift does not implicitly resolve conflict or fulfill promise',()=>{
 const t=[msg('1','争吵未解决'),msg('2','送了花')];let s=save(emptyStore(),t,[base('a','argument',t[0].text,'1',{kind:'conflict',status:'open'})]);
 s=save(s,t,[base('b','gift',t[1].text,'2',{kind:'event'})]);assert.equal(project(activeRecords(s,t)).threads.argument.status,'open');
});
test('7 explicit next morning changes narrative time',()=>{
 const t=[msg('1','晚上'),msg('2','第二天清晨')];let s=save(emptyStore(),t,[base('a','time','晚上','1')]);s=save(s,t,[base('b','time','第二天清晨','2')]);assert.equal(project(activeRecords(s,t)).state.time,'第二天清晨');
});
test('8 diary hallucination cannot establish objective fact',()=>{
 const t=[msg('1','我猜他偷了钥匙')];assert.throws(()=>save(emptyStore(),t,[base('a','key',t[0].text,'1',{origin:'diary'})]),/Derived/);
 const r=base('b','key',t[0].text,'1',{origin:'diary',kind:'diary'});assert.equal(recall([r],{character:'A'}),'[]');assert.equal(Object.keys(project([r]).state).length,0);
});
test('9 bad extraction atomic, duplicate idempotent, missing evidence rejected',()=>{
 const t=[msg('1','门打开了')],s=emptyStore(),r=base('a','door',t[0].text,'1'),first=commit(s,t,[r],digest);
 assert.equal(commit(first.store,t,[r],digest).duplicate,true);assert.equal(s.batches.length,0);
 assert.throws(()=>save(first.store,t,[{...r,id:'b',evidence:'不存在'}]));assert.equal(first.store.batches.length,1);
});
test('10 recall respects complete JSON character and count budget',()=>{
 const records=Array.from({length:100},(_,i)=>base('r'+i,'k'+i,'事实'.repeat(30),'1'));
 const out=recall(records,{character:'A',maxChars:700,maxRecords:2});assert.ok(out.length<=700);assert.ok(JSON.parse(out).length<=2);assert.equal(recall(records,{character:'A',maxChars:2}),'[]');
});
test('filesystem atomic persistence, corrupt input fails closed, suppression',()=>{
 const root=mkdtempSync(join(tmpdir(),'continuity-test-')),f=new FileStore(root),t=[msg('1','门开了')];
 f.submit('story',t,[base('a','door',t[0].text,'1')]);const before=readFileSync(f.path('story'),'utf8');
 assert.throws(()=>f.submit('story',t,[base('b','door','不存在','1')]));assert.equal(readFileSync(f.path('story'),'utf8'),before);
 f.suppress('story',['a']);assert.equal(activeRecords(f.read('story'),t).length,0);
 writeFileSync(f.path('story'),'bad');assert.throws(()=>f.read('story'));assert.equal(f.read('other').batches.length,0);
});
test('timeline ignores reasoning, tool-only assistant, plugin context',()=>{
 const t=timelineOf([{id:'1',role:'user',source:{kind:'user'},content:[{type:'text',text:'hello'}]},
 {id:'2',role:'user',source:{kind:'plugin:runtime-context'},content:[{type:'text',text:'not plot'}]},
 {id:'3',role:'assistant',toolCalls:[{}],content:[{type:'text',text:'tool plan'}]},
 {id:'4',role:'assistant',content:[{type:'reasoning',text:'secret'},{type:'text',text:'reply'}]}]);assert.deepEqual(t.map(x=>x.text),['hello','reply']);
});
test('identity survives the branch that introduced it',()=>{
 // Every batch is bound to the full observed timeline, so trimming one message
 // retires both earlier batches. Their ids must still stay reserved.
 const t=[msg('1','钥匙交给A'),msg('2','A用钥匙开门')];
 let s=save(emptyStore(),t,[base('a','key','钥匙交给A','1')]);
 s=save(s,t,[base('b','door','A用钥匙开门','2')]);
 const retired=[t[0]];
 assert.equal(activeRecords(s,t).length,2);
 assert.equal(activeRecords(s,retired).length,0);
 assert.deepEqual([...committedIds(s)].sort(),['a','b']);
 // `a` and `b` are no longer active, yet neither identity may be recycled.
 assert.throws(()=>save(s,retired,[base('b','other','钥匙交给A','1')]),/Record id already committed/);
 assert.throws(()=>save(s,retired,[base('a','other','钥匙交给A','1')]),/Record id already committed/);
 // A brand-new id on the surviving branch is still accepted.
 const fresh=save(s,retired,[base('c','other','钥匙交给A','1')]);
 assert.equal(activeRecords(fresh,retired).length,1);
 assert.deepEqual([...committedIds(fresh)].sort(),['a','b','c']);
});
