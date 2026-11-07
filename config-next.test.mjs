import test from 'node:test';import assert from 'node:assert/strict';
import {Config,snapshot} from './config-next.mjs';
test('real Volatile defaults are dormant and allow empty setup fields',()=>{
 const v=snapshot(Config({}));assert.equal(v.enabled,false);assert.equal(v.automaticExtraction,false);assert.equal(v.dataRoot,'');
});
test('activation snapshot requires explicit conversation and path',()=>{
 assert.throws(()=>snapshot(Config({enabled:true})),/explicit conversation/);
 assert.throws(()=>snapshot(Config({enabled:true,conversationId:'synthetic'})),/absolute private/);
 assert.equal(snapshot(Config({enabled:true,conversationId:'synthetic',dataRoot:'/private/synthetic'})).enabled,true);
});
// A high-reasoning model truncated JSON at 2048 and again at 8192 on a 17-message
// timeline. The budget is a cap, not a charge, so the default must fit reasoning
// tokens and the ceiling must leave headroom.
test('auxiliary output budgets default to a reasoning-safe cap',()=>{
 const v=snapshot(Config({}));
 assert.equal(v.extractionMaxTokens,16384);
 assert.equal(v.stateMaxTokens,8192);
 assert.equal(v.auxiliaryReasoningEffort,'inherit');
 assert.equal(Config({extractionMaxTokens:65536}).extractionMaxTokens.get(),65536);
 assert.throws(()=>Config({extractionMaxTokens:65537}).extractionMaxTokens.get());
 assert.throws(()=>Config({stateMaxTokens:65537}).stateMaxTokens.get());
 assert.throws(()=>Config({extractionMaxTokens:128}).extractionMaxTokens.get());
});
test('a Windows absolute data directory is accepted like a POSIX one',()=>{
 const absolute=process.platform==='win32'?'C:\\\\private\\\\synthetic':'/private/synthetic';
 assert.equal(snapshot(Config({enabled:true,conversationId:'synthetic',dataRoot:absolute})).enabled,true);
 assert.throws(()=>snapshot(Config({enabled:true,conversationId:'synthetic',dataRoot:'relative/dir'})),/absolute private/);
});
