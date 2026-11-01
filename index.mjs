import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { FileStore, timelineOf } from './store.mjs';
import { activeRecords, project, recall, POLICY } from './core.mjs';
export const name='dsh-story-continuity';
export const inject=['systemPrompt','tools'];
export const Config=Schema.object({
  dataRoot:Schema.string().required(),
  bindings:Schema.array(Schema.object({sessionId:Schema.string().required(),character:Schema.string().required(),storyId:Schema.string().required()})).default([]),
  maxChars:Schema.number().step(1).min(256).max(24000).default(6000),
  maxRecords:Schema.number().step(1).min(1).max(100).default(24)
});
export function apply(ctx,config){
  const files=new FileStore(config.dataRoot),bindings=new Map();
  for(const b of config.bindings){if(bindings.has(b.sessionId))throw Error('Duplicate session binding');bindings.set(b.sessionId,b);}
  const resolve=agent=>{
    const b=agent&&bindings.get(String(agent.session.id));
    if(!b)throw Error('This session is not explicitly bound to a story/character');
    return {b,timeline:timelineOf(agent.session.deriveMessages())};
  };
  ctx.systemPrompt.context({name:'story-continuity',order:850,required:true,interpolate:false,text:({agent})=>{
    if(!agent||!bindings.has(String(agent.session.id)))return '';
    const {b,timeline}=resolve(agent),records=activeRecords(files.read(b.storyId),timeline);
    return POLICY+'\n来源版本：'+(timeline.at(-1)?.token??'empty')+'\n角色：'+JSON.stringify(b.character)+'\n'+recall(records,{character:b.character,query:timeline.at(-1)?.text??'',maxChars:config.maxChars,maxRecords:config.maxRecords})+
      '\n如需更新连续性，先用 story_inspect 查看稳定来源编号；只对已经完成的正文调用 story_commit，逐项提供原文证据、明确的 knownBy。不能为了填账改变正文或代替用户决定。无事实变更时不要提交。工具输出不属于剧情。';
  }});
  const register=(toolName,description,parameters,execute)=>ctx.tools.register(defineTool({name:toolName,description,parameters,
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    execute:(args,exec)=>{exec.signal?.throwIfAborted();return JSON.stringify(execute(args,resolve(exec.agent)));}}));
  register('story_inspect','查看当前有效正文稳定编号、状态和事件。仅适用于显式绑定的角色会话。',{},(_args,{b,timeline})=>({
    storyId:b.storyId,character:b.character,
    sources:timeline.slice(-4).map(m=>({id:m.id,role:m.role,text:m.text.slice(0,2000)})),
    records:JSON.parse(recall(activeRecords(files.read(b.storyId),timeline),{character:b.character,maxChars:config.maxChars,maxRecords:config.maxRecords}))
  }));
  register('story_commit','提交已完成正文的带证据记录。recordsJson 是数组，字段 id,kind,key,text,sourceId,evidence,origin,certainty,knownBy；state 可带 value；knowledge 必须 character,mode,acquiredBy；plan/promise/conflict/thread 必须 status。证据必须逐字出自活跃正文。失败原子回滚。',
    {recordsJson:{type:'string',required:true}},({recordsJson},{b,timeline})=>{
      if(recordsJson.length>100000)throw Error('Proposal too large');
      const r=files.submit(b.storyId,timeline,JSON.parse(recordsJson));
      return {saved:!r.duplicate,duplicate:r.duplicate,activeCount:activeRecords(r.store,timeline).length};
    });
  // Read/export/correct/delete are provided by the offline management CLI, not model tools.
}
