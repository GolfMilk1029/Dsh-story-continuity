import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import LlmRuntime,{LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm';
import {SessionStore,SessionId} from '@deepseek-ai/dsh-session';
import {SessionProjectionRegistry} from '@deepseek-ai/dsh-session-projection';
import {SystemPrompt} from '@deepseek-ai/dsh-system-prompt';
import {ToolRuntime} from '@deepseek-ai/dsh-tools';
import {AgentRegistry} from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import * as Persistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import * as Plugin from './index.mjs';
import {FileStore,timelineOf} from './store.mjs';import {activeRecords} from './core.mjs';
test('rc.5 real loop: automatic logged extraction commits and next RP request sees ledger',{timeout:20000,skip:process.platform==='android'&&!process.env.DSH_NATIVE_DIR&&!process.env.STORY_TEST_MEMORY_ONLY?'Android flock native library directory not provided; durable session test not verified':false},async()=>{
 const root=mkdtempSync(join(tmpdir(),'story-real-loop-'));const ctx=new Context();let handle;
 try{
  for(const p of [LlmRuntime,SessionStore,SessionProjectionRegistry,SystemPrompt,ToolRuntime,AgentRegistry])await ctx.plugin(p);
  if(!process.env.STORY_TEST_MEMORY_ONLY)await ctx.plugin(Persistence,{root:join(root,'sessions'),compression:'none'});
  await ctx.plugin(AgentLoop,{agents:[]});
  const row={id:'synthetic-chat',runtimeSessionId:'synthetic-rp',metadata:{characterId:'synthetic-character',characterName:'Synthetic'}};
  ctx.provide('eleckoiConversationsApi',{list:async()=>[row]});
  const requests=[];
  class Adapter extends LlmAdapter{
   async resolveModel(provider,id){return {provider,id,name:id}}
   async *stream(options){
    requests.push(options);const extract=JSON.stringify(options.messages).includes('你是剧情连续性账本提取器');
    let text='Synthetic takes the blue umbrella.';
    if(extract){
     const raw=options.messages.flatMap(m=>m.content??[]).filter(b=>b.type==='text').map(b=>b.text).find(t=>t.includes('"sources":'));
     const data=JSON.parse(raw.slice(raw.indexOf('{"character"')));const source=data.sources.at(-1);
     text=JSON.stringify([{id:'umbrella-'+requests.length,kind:'state',key:'umbrella-holder',text:'Synthetic holds the blue umbrella',sourceId:source.id,evidence:source.text,origin:'narrative',certainty:'certain',knownBy:['Synthetic']}]);
    }
    yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text};yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'finish',reason:{kind:'stop'}};
   }
  }
  ctx.llm.registerAdapter(['synthetic'],new Adapter());
  await ctx.plugin(Plugin,{enabled:true,automaticExtraction:true,conversationId:row.id,dataRoot:join(root,'ledger')});
  handle=await ctx.agents.create({sessionId:SessionId(row.runtimeSessionId),agentOptions:{},setup(agentCtx,agent){
    const dispose=agentCtx.on('agent/request',async(_payload,next)=>({...await next(),provider:'synthetic',model:'synthetic'}));
    ctx.effect(()=>dispose);
   }});
  handle.agent.followup(createUserMessage({content:[{type:'text',text:'Borrow this umbrella.'}],source:{kind:'user'}}));await handle.agent.whenIdle();
  const records=activeRecords(new FileStore(join(root,'ledger')).read('eleckoi:'+row.id),timelineOf(handle.agent.session.deriveMessages()));
  assert.equal(records.length,1);assert.equal(requests.length,2);
  handle.agent.followup(createUserMessage({content:[{type:'text',text:'Who holds the umbrella?'}],source:{kind:'user'}}));await handle.agent.whenIdle();
  assert.match(JSON.stringify(requests[2].messages),/umbrella-holder/);
 }finally{if(handle)await handle.dispose();await ctx.fiber.dispose();}
});
