import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {SessionId} from '@deepseek-ai/dsh-session';
import {Config,snapshot} from './config-next.mjs';
import {FileStore,timelineOf} from './store.mjs';
import {activeRecords,recall,POLICY} from './core.mjs';
import {resolveElecKoiBinding} from './eleckoi-binding.mjs';
import {ExtractionController,timelineRevision} from './extraction-controller.mjs';
import {createLoggedExtractor} from './logged-extractor.mjs';
export function extractionModelSelection(agent){
 const selected={...(agent.options??{}),...(agent.session.requestHeader?.()?.config??{})};
 if(!selected.provider||!selected.model)throw Error('No resolved RP provider/model available');
 return selected;
}
export {Config};export const name='dsh-story-continuity';
export const inject=['systemPrompt','tools','agents'];
export function apply(ctx,config){
 let binding;const stores=new Map(),agents=new Map();
 const files=root=>{if(!stores.has(root))stores.set(root,new FileStore(root));return stores.get(root)};
 const logged=createLoggedExtractor({agents:ctx.agents,createUserMessage,SessionId,
  setup:(scope)=>{
   const tools=ctx.effect(()=>scope.tools.restrict({allow:[]}));
   const prompt=ctx.effect(()=>scope.systemPrompt.section({name:'story-extractor',order:900,text:'Extract evidence-linked continuity only. Return a JSON array. Do not roleplay. Do not call tools.'}));
   scope.effect(()=>()=>Promise.all([tools(),prompt()]));
  }});
 const extractor=new ExtractionController({
  readTimeline:b=>timelineOf(agents.get(b.sessionId).session.deriveMessages()),
  runLogged:input=>logged({...input,maxTokens:snapshot(config).extractionMaxTokens,maxInputChars:snapshot(config).extractionMaxInputChars,
   existingRecords:JSON.parse(recall(activeRecords(files(input.binding.dataRoot).read(input.binding.storyId),input.timeline),{character:input.binding.character,maxChars:12000,maxRecords:100}))}),
  submit:(b,revision,records)=>{
   const current=snapshot(config);
   if(!current.enabled||!current.automaticExtraction||current.conversationId!==b.conversationId||current.dataRoot!==b.dataRoot)throw Error('Configuration changed during extraction');
   const timeline=timelineOf(agents.get(b.sessionId).session.deriveMessages());
   if(timelineRevision(timeline)!==revision)throw Error('Timeline changed before commit');
   return files(b.dataRoot).submit(b.storyId,timeline,records);
  },onError:error=>ctx.logger.warn('Continuity extraction failed; no transaction committed: %s',error.message)
 });
 ctx.effect(()=>()=>extractor.dispose());
 ctx.on('loader/volatile-update',()=>{binding=undefined});
 ctx.on('agent/disposed',({agent})=>{agents.delete(String(agent.session.id))});
 ctx.on('agent/pre-step',async({agent,signal},next)=>{
  const c=snapshot(config);
  if(c.enabled&&!String(agent.session.id).startsWith('story-extract-')){
   const b=await resolveElecKoiBinding(ctx.get('eleckoiConversationsApi'),c.conversationId,signal);
   if(b.sessionId===String(agent.session.id)){
    binding={...b,conversationId:c.conversationId,dataRoot:c.dataRoot,modelSelection:{...agent.options}};
    agents.set(b.sessionId,agent);
   }
  }
  return next();
 });
 ctx.on('agent/turn-stopping',async({agent,signal})=>{
  const c=snapshot(config);if(!c.enabled||!c.automaticExtraction)return;
  if(String(agent.session.id).startsWith('story-extract-'))return;
  const b=await resolveElecKoiBinding(ctx.get('eleckoiConversationsApi'),c.conversationId,signal);
  if(b.sessionId!==String(agent.session.id))return;
  binding={...b,conversationId:c.conversationId,dataRoot:c.dataRoot,modelSelection:extractionModelSelection(agent)};
  agents.set(b.sessionId,agent);
  const abort=()=>extractor.cancel(b.storyId);signal.addEventListener('abort',abort,{once:true});
  try{await extractor.schedule(binding);}catch(error){if(signal.aborted)throw error;}
  finally{signal.removeEventListener('abort',abort);}
 });
 ctx.systemPrompt.context({name:'story-continuity',order:850,required:true,interpolate:false,text:({agent})=>{
  const c=snapshot(config);if(!c.enabled||!binding||binding.conversationId!==c.conversationId||String(agent?.session.id)!==binding.sessionId)return '';
  const timeline=timelineOf(agent.session.deriveMessages());
  return POLICY+'\n来源版本：'+timelineRevision(timeline)+'\n'+recall(activeRecords(files(c.dataRoot).read(binding.storyId),timeline),{character:binding.character,query:timeline.at(-1)?.text??'',maxChars:c.maxChars,maxRecords:c.maxRecords});
 }});
}
