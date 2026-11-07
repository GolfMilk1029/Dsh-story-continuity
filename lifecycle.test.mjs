import test from 'node:test';import assert from 'node:assert/strict';
import {emptyStore,commit,activeRecords,project,checkThreadTransition,previousThreadStatus,THREAD_KINDS} from './core.mjs';
import {digest} from './store.mjs';
const msg=(id,text)=>({id,text,role:'assistant',token:digest(id+text)});
// evidence must be a literal substring of the cited source, exactly as commit() requires.
const thread=(id,key,text,source,status,extra={})=>({id,kind:'plan',key,text,sourceId:source.id,
 evidence:source.text,origin:'narrative',certainty:'certain',knownBy:['A'],status,...extra});
const save=(s,t,r)=>commit(s,t,r,digest).store;

// The lifecycle rules are deliberately limited to what the data model can prove.
// These tests pin that behaviour so a later change cannot quietly invent progress.
test('a plan stays open until the narrative states the outcome', () => {
  const t=[msg('1','她说明天去集市。')];
  let s=save(emptyStore(),t,[thread('p1','market','她打算明天去集市',t[0],'open')]);
  assert.equal(project(activeRecords(s,t)).threads.market.status,'open');
  // A later turn with no outcome must not promote the plan to done.
  const t2=[...t,msg('2','第二天，她还在屋里。')];
  s=save(s,t2,[]);
  assert.equal(project(activeRecords(s,t2)).threads.market.status,'open');
});

test('a closed thread cannot silently reopen', () => {
  const t=[msg('1','她打算把信寄出。'),msg('2','她把信寄出了。')];
  let s=save(emptyStore(),t,[thread('p1','letter','她打算把信寄出',t[0],'open')]);
  s=save(s,t,[thread('p2','letter','她把信寄出了',t[1],'fulfilled')]);
  assert.equal(project(activeRecords(s,t)).threads.letter.status,'fulfilled');
  // Reusing the key as open without an explicit revision is rejected, not merged.
  assert.throws(()=>save(s,t,[thread('p3','letter','她还没寄',t[1],'open')]),/explicit changed record/);
});

test('reopening needs a changed record first, and the ledger shows it', () => {
  const t=[msg('1','她打算把信寄出。'),msg('2','她把信寄出了。'),msg('3','信件被退回，需要重写。')];
  let s=save(emptyStore(),t,[thread('p1','letter','她打算把信寄出',t[0],'open')]);
  s=save(s,t,[thread('p2','letter','她把信寄出了',t[1],'fulfilled')]);
  s=save(s,t,[thread('p3','letter','信件被退回，需要重写',t[2],'changed')]);
  assert.equal(project(activeRecords(s,t)).threads.letter.status,'changed');
  s=save(s,t,[thread('p4','letter','她决定重写一封',t[2],'open')]);
  assert.equal(project(activeRecords(s,t)).threads.letter.status,'open');
  assert.equal(activeRecords(s,t).filter(r=>r.key==='letter').length,4);
});

test('a missed plan requires literal narrative evidence, never elapsed time', () => {
  const t=[msg('1','集市已经散了。')];
  // miss is allowed by the transition table...
  assert.doesNotThrow(()=>checkThreadTransition('open','missed'));
  // ...but committing it still needs evidence that is literally in the source.
  assert.throws(()=>save(emptyStore(),t,[thread('p1','market','集市已经散了',t[0],'missed',{evidence:'没有这句'})]),
    /Evidence not present/);
  // There is no wall-clock expiry path: no record, no status change.
  assert.equal(project(activeRecords(save(emptyStore(),t,[]),t)).threads.market,undefined);
});

test('conflicting plans keep separate keys and a conflict record', () => {
  const t=[msg('1','她既想留下，又想离开。')];
  const s=save(emptyStore(),t,[
    thread('p1','stay','她想留下',t[0],'open'),
    thread('p2','leave','她想离开',t[0],'open'),
    thread('c1','stay-or-leave','两个打算互相矛盾',t[0],'open',{kind:'conflict'})]);
  const threads=project(activeRecords(s,t)).threads;
  assert.equal(threads.stay.status,'open');
  assert.equal(threads.leave.status,'open');
  assert.equal(threads['stay-or-leave'].status,'open');
});

test('the transition table is explicitly bounded', () => {
  for(const next of ['open','fulfilled','cancelled','missed','resolved','changed'])
    assert.doesNotThrow(()=>checkThreadTransition(undefined,next),'first observation may be '+next);
  for(const next of ['open','fulfilled','cancelled','missed','changed'])
    assert.doesNotThrow(()=>checkThreadTransition('open',next));
  for(const terminal of ['fulfilled','cancelled','missed','resolved'])
    assert.throws(()=>checkThreadTransition(terminal,'open'),/explicit changed record/);
  for(const terminal of ['fulfilled','cancelled','missed','resolved'])
    assert.doesNotThrow(()=>checkThreadTransition(terminal,'changed'));
  assert.equal(checkThreadTransition('open','open'),undefined);
  assert.ok(THREAD_KINDS.has('plan')&&THREAD_KINDS.has('promise')&&THREAD_KINDS.has('thread')&&THREAD_KINDS.has('conflict'));
});

test('the latest active thread record wins, and suppression drops the key', () => {
  const t=[msg('1','她答应过要写回信。')];
  const records=[thread('p1','letter','她答应写回信',t[0],'open'),thread('p2','letter','她写好了回信',t[0],'fulfilled')];
  assert.equal(previousThreadStatus(records,'letter'),'fulfilled');
  assert.equal(previousThreadStatus(records,'absent'),undefined);
  // A suppressed terminal record must not keep blocking a new plan.
  const s={...save(emptyStore(),t,records),suppressed:['p2']};
  assert.equal(previousThreadStatus(activeRecords(s,t),'letter'),'open');
  assert.doesNotThrow(()=>save(s,t,[thread('p3','letter','她又开始写',t[0],'open')]));
});
