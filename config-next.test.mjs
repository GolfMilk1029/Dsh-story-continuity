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
