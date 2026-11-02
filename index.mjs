import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {SessionId} from '@deepseek-ai/dsh-session';
import {Config,snapshot} from './config-next.mjs';
import {FileStore,timelineOf} from './store.mjs';
import {activeRecords,recall,POLICY} from './core.mjs';
import {resolveElecKoiBinding} from './eleckoi-binding.mjs';
import {ExtractionController,timelineRevision} from './extraction-controller.mjs';
import {createLoggedExtractor} from './logged-extractor.mjs';
import {selectPersona} from './persona.mjs';
import {statePrompt,validateSimulation,renderState} from './state-sim.mjs';
import {StateStore,activeSnapshot} from './state-store.mjs';
import {createLoggedSimulator} from './logged-simulator.mjs';
import {StateController} from './state-controller.mjs';
export function extractionModelSelection(agent){
 const selected={...(agent.options??{}),...(agent.session.requestHeader?.()?.config??{})};
 if(!selected.provider||!selected.model)throw Error('No resolved RP provider/model available');
 return selected;
}
export {Config};export const name='dsh-story-continuity';
export const inject=['systemPrompt','tools','agents'];
// Auxiliary agents are ordinary logged sessions: they must never bind themselves.
export const isAuxiliary=sessionId=>typeof sessionId==='string'&&(sessionId.startsWith('story-extract-')||sessionId.startsWith('story-state-'));
export function apply(ctx,config){
 let binding;const stores=new Map(),agents=new Map(),stateStores=new Map();
 const files=root=>{if(!stores.has(root))stores.set(root,new FileStore(root));return stores.get(root)};
 const stateFiles=root=>{if(!stateStores.has(root))stateStores.set(root,new StateStore(root));return stateStores.get(root)};
 const logged=createLoggedExtractor({agents:ctx.agents,createUserMessage,SessionId,
  setup:(scope)=>{
   // Both the auxiliary agent and plugin owner retain the registrations.
   const tools=ctx.effect(()=>scope.tools.restrict({allow:[]}));
   const prompt=ctx.effect(()=>scope.systemPrompt.section({name:'story-extractor',order:900,text:'Extract evidence-linked continuity only. Return a JSON array. Do not roleplay. Do not call tools.'}));
   scope.effect(()=>()=>Promise.all([tools(),prompt()]));
  }});
 const simulated=createLoggedSimulator({agents:ctx.agents,createUserMessage,SessionId,
  setup:(scope)=>{
   const tools=ctx.effect(()=>scope.tools.restrict({allow:[]}));
   const prompt=ctx.effect(()=>scope.systemPrompt.section({name:'story-state',order:901,text:'Simulate one character inner state only. Return one JSON object. Do not roleplay, do not answer the user, do not call tools.'}));
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
 const states=new StateController({
  readTimeline:b=>timelineOf(agents.get(b.sessionId).session.deriveMessages()),
  runLogged:input=>{
   const current=snapshot(config);
   const previous=activeSnapshot(stateFiles(input.binding.dataRoot).read(input.binding.storyId),input.timeline,input.binding.character);
   const facts=JSON.parse(recall(activeRecords(files(input.binding.dataRoot).read(input.binding.storyId),input.timeline),{character:input.binding.character,maxChars:6000,maxRecords:40}));
   return simulated({...input,maxTokens:current.stateMaxTokens,
    prompt:statePrompt({character:input.binding.character,persona:input.binding.persona,timeline:input.timeline,
     revision:input.revision,facts,previous,maxInputChars:current.stateMaxInputChars})});
  },
  submit:(b,revision,proposal)=>{
   const current=snapshot(config);
   if(!current.enabled||!current.stateSimulation||current.conversationId!==b.conversationId||current.dataRoot!==b.dataRoot)throw Error('Configuration changed during state maintenance');
   const timeline=timelineOf(agents.get(b.sessionId).session.deriveMessages());
   if(timelineRevision(timeline)!==revision)throw Error('Timeline changed before state commit');
   const simulation=validateSimulation(proposal,{timeline});
   return stateFiles(b.dataRoot).commit(b.storyId,timeline,b.character,simulation,{personaDigest:b.persona?.digest??null});
  },onError:error=>ctx.logger.warn('Story state maintenance failed; no snapshot committed: %s',error.message)
 });
 ctx.effect(()=>()=>{extractor.dispose();states.dispose();});
 ctx.on('loader/volatile-update',()=>{binding=undefined});
 ctx.on('agent/disposed',({agent})=>{agents.delete(String(agent.session.id))});
 ctx.on('agent/pre-step',async({agent,signal},next)=>{
  const c=snapshot(config);
  if(c.enabled&&!isAuxiliary(String(agent.session.id))){
   const b=await resolveElecKoiBinding(ctx.get('eleckoiConversationsApi'),c.conversationId,signal);
   if(b.sessionId===String(agent.session.id)){
    binding={...b,conversationId:c.conversationId,dataRoot:c.dataRoot,modelSelection:{...agent.options}};
    agents.set(b.sessionId,agent);
   }
  }
  return next();
 });
 // Resolve public product identity before the RP turn closes; no lifecycle internals.
 ctx.on('agent/turn-stopping',async({agent,signal})=>{
  const c=snapshot(config);if(!c.enabled||(!c.automaticExtraction&&!c.stateSimulation))return;
  if(isAuxiliary(String(agent.session.id)))return;
  const b=await resolveElecKoiBinding(ctx.get('eleckoiConversationsApi'),c.conversationId,signal);
  if(b.sessionId!==String(agent.session.id))return;
  binding={...b,conversationId:c.conversationId,dataRoot:c.dataRoot,modelSelection:extractionModelSelection(agent)};
  agents.set(b.sessionId,agent);
  const abort=()=>{extractor.cancel(b.storyId);states.cancel(b.storyId);};signal.addEventListener('abort',abort,{once:true});
  try{
   if(c.automaticExtraction){try{await extractor.schedule(binding);}catch(error){if(signal.aborted)throw error;}}
   if(!snapshot(config).stateSimulation)return;
   // Persona is a precondition: without it the simulation would invent a different character.
   const persona=await readPersona(ctx.get('eleckoiConversationsApi'),binding.productId,snapshot(config).personaMaxChars);
   if(persona.status!=='ok'){
    ctx.logger.warn('Story state maintenance skipped; persona material unavailable: %s',persona.status);
    return;
   }
   try{await states.schedule({...binding,persona});}catch(error){if(signal.aborted)throw error;}
  }finally{signal.removeEventListener('abort',abort);}
 });
 ctx.systemPrompt.context({name:'story-continuity',order:850,required:true,interpolate:false,text:({agent})=>{
  const c=snapshot(config);if(!c.enabled||!binding||binding.conversationId!==c.conversationId||String(agent?.session.id)!==binding.sessionId)return '';
  const timeline=timelineOf(agent.session.deriveMessages());
  const base=POLICY+'\n来源版本：'+timelineRevision(timeline)+'\n'+recall(activeRecords(files(c.dataRoot).read(binding.storyId),timeline),{character:binding.character,query:timeline.at(-1)?.text??'',maxChars:c.maxChars,maxRecords:c.maxRecords});
  if(!c.stateSimulation)return base;
  try{
   const snapshotState=activeSnapshot(stateFiles(c.dataRoot).read(binding.storyId),timeline,binding.character);
   const rendered=snapshotState?renderState(snapshotState,{maxChars:c.stateInjectMaxChars}):'';
   return rendered?base+'\n\n'+rendered:base;
  }catch(error){ctx.logger.warn('Story state unavailable for this request: %s',error.message);return base;}
 }});
}
// Public Conversations API only. Missing persona fails visibly instead of defaulting.
export async function readPersona(api,productConversationId,maxChars=6000){
 if(typeof productConversationId!=='string'||!productConversationId)return {status:'missing-conversation'};
 if(typeof api?.authorState!=='function')return {status:'unavailable'};
 const authorState=await api.authorState(productConversationId);
 return selectPersona(authorState?.settingLibrary??null,{maxChars});
}
