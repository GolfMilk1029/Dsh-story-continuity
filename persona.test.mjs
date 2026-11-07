import test from 'node:test';import assert from 'node:assert/strict';
import {selectPersona} from './persona.mjs';
// Field names mirror the real ElecKoi SettingLibraryEntry (verified against
// @eleckoi/dsh-product-api types and the product database payload).
const entry=(over={})=>({id:'e1',title:'设定',kind:'normal',enabled:true,
 agentReadStrategy:'normal',contentMode:'plain_text',dynamicMode:'standard',
 triggerMode:'always',content:'她习惯先听完再回应。',order:0,...over});
const library=(entries)=>({characterId:'c',name:'n',entries,groups:[],promptPositions:[]});

test('an always-injected entry qualifies even when the read strategy is normal', () => {
  const result=selectPersona(library([entry()]));
  assert.equal(result.status,'ok');
  assert.match(result.text,/她习惯先听完再回应/);
});

test('required-to-read is not proof of residency', () => {
  for(const triggerMode of [null,undefined,'agent_tool']){
    assert.equal(selectPersona(library([entry({triggerMode,agentReadStrategy:'required'})])).status,'no-required-entries');
  }
});
test('an over-budget selection is rejected in full, never partially used',()=>{
 const entries=[entry({id:'a',content:'x'.repeat(180)}),entry({id:'b',content:'y'.repeat(180)})];
 for(const options of [{maxChars:256},{maxEntries:1}]){
  const result=selectPersona(library(entries),options);
  assert.equal(result.status,'over-budget');
  assert.equal(result.text,'');assert.equal(result.digest,null);assert.deepEqual(result.entries,[]);
 }
});

test('agent-tool triggered entries are never treated as resident persona', () => {
  assert.equal(selectPersona(library([entry({triggerMode:'agent_tool',agentReadStrategy:'required'})])).status,'no-required-entries');
});

test('dynamic or keyword persona sources are still rejected', () => {
  for(const over of [{contentMode:'ejs'},{dynamicMode:'ejs_reference'},{enabled:false},{kind:'opening'},{content:'   '}]){
    assert.equal(selectPersona(library([entry(over)])).status,'no-required-entries','rejected: '+JSON.stringify(over));
  }
});

test('a missing or malformed library reports itself instead of defaulting', () => {
  assert.equal(selectPersona(null).status,'missing-library');
  assert.equal(selectPersona({}).status,'missing-library');
  assert.equal(selectPersona(library([])).status,'no-required-entries');
});

test('entries are ordered, budgeted and hashed deterministically', () => {
  const entries=[entry({id:'b',title:'B',content:'第二条',order:2}),entry({id:'a',title:'A',content:'第一条',order:1})];
  const result=selectPersona(library(entries));
  assert.equal(result.status,'ok');
  assert.ok(result.text.indexOf('第一条')<result.text.indexOf('第二条'));
  assert.match(result.text,/^## A\n第一条/);
  assert.notEqual(selectPersona(library(entries)).digest,selectPersona(library(entries.slice(0,1))).digest);
  const tight=selectPersona(library(entries),{maxChars:256});
  assert.equal(tight.status,'ok');
  assert.ok(tight.truncated||tight.text.length<=256);
  assert.throws(()=>selectPersona(library(entries),{maxChars:10}),/Invalid persona budget/);
});
