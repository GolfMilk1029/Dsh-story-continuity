import fs from 'node:fs';
import path from 'node:path';
export function bindingFailureStage(error){
 return ({'ElecKoi public Conversations API unavailable':'binding-service-unavailable','Invalid ElecKoi conversation catalog':'binding-catalog-invalid','Conversation binding is missing or ambiguous':'binding-missing-or-ambiguous','Incomplete ElecKoi runtime identity':'binding-identity-incomplete'})[error?.message]??'binding-unavailable';
}
// Auxiliary failures are recorded as a category code, never the message itself:
// the diagnostic file must stay free of chat content, persona text and credentials.
export function failureCategory(error){
 const message=String(error?.message??'');
 if(/exceeds budget/.test(message))return 'budget';
 if(/provider\/model|No resolved RP/.test(message))return 'model';
 // A dropped or refused request is a model-side failure. Without this, an empty reply
 // surfaced as a JSON/output problem and sent diagnosis down the wrong path.
 if(/no final message|transport|connection error|timed out|socket hang up|ECONNRESET|ENOTFOUND/i.test(message))return 'model';
 if(/already (committed|observed)/.test(message))return 'duplicate';
 if(/changed during|Timeline changed|Runtime session is no longer/.test(message))return 'race';
 if(/JSON|Unexpected token|not an object|not an array|must return|must produce|exceeds transaction limit/.test(message))return 'output';
 if(/Unsupported .* field|Invalid |Too long|not literal|not active|needs source|Needs source|Corrupt|Derived |Explicit status|Routine status|Unsafe key|Character required|Evidence not present|Closed thread requires/.test(message))return 'validation';
 return 'other';
}
export function createDiagnostic(config,io=fs){
 const report={owner:'dsh-story-continuity-diagnostic',schema:1,sequence:0,counts:{}};
 return stage=>{
  // Only caller-owned static stage codes enter this file, never error messages or chat data.
  if(!/^[a-z-]{1,64}$/.test(stage))return;
  report.sequence++;report.lastStage=stage;report.counts[stage]=(report.counts[stage]??0)+1;
  try{
   const target=config.diagnosticPath?.get?.()??'';
   if(!target)return;
   if(!path.isAbsolute(target)||path.basename(target)!=='story-continuity-diagnostic.json')return;
   let fd;
   try{fd=io.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);}
   catch(error){
    if(error.code!=='EEXIST')return;
    if(!io.lstatSync(target).isFile()||JSON.parse(io.readFileSync(target,'utf8')).owner!==report.owner)return;
    fd=io.openSync(target,fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW);
   }
   try{io.ftruncateSync(fd,0);io.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');io.fsyncSync(fd);}finally{io.closeSync(fd);}
  }catch{/* Diagnostics must never prevent roleplay or maintenance. */}
 };
}
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {SessionId} from '@deepseek-ai/dsh-session';
import {Config,snapshot} from './config-next.mjs';
import {FileStore,timelineOf} from './store.mjs';
import {activeRecords,committedIds,recall,POLICY,observedPrefix} from './core.mjs';
import {resolveElecKoiBinding} from './eleckoi-binding.mjs';
import {ExtractionController,timelineRevision} from './extraction-controller.mjs';
import {createLoggedExtractor} from './logged-extractor.mjs';
import {selectPersona} from './persona.mjs';
import {statePrompt,validateSimulation,renderState} from './state-sim.mjs';
import {StateStore,activeSnapshot} from './state-store.mjs';
import {createLoggedSimulator} from './logged-simulator.mjs';
import {StateController} from './state-controller.mjs';
import {extractionModelSelection} from './model-selection.mjs';
import {renderMemory,memoryContext} from './memory.mjs';
// Re-exported from its single implementation so hosts and tests share one route rule.
export {extractionModelSelection};
export {Config};export const name='dsh-story-continuity';
export const inject=['systemPrompt','tools','agents'];
// Auxiliary agents are ordinary logged sessions: they must never bind themselves.
export const isAuxiliary=sessionId=>typeof sessionId==='string'&&(sessionId.startsWith('story-extract-')||sessionId.startsWith('story-state-'));
// A user can change the binding while an auxiliary call is in flight. Commit must
// then fail closed: the result was produced for a chat the plugin no longer owns.
export function configStillApplies(current,binding,{automatic,failure}){
 if(!current.enabled||!current[automatic]||current.conversationId!==binding.conversationId||current.dataRoot!==binding.dataRoot)
  throw Error(failure);
 return true;
}
export function apply(ctx,config){
 const diagnose=createDiagnostic(config);diagnose('plugin-ready');
 let binding;const stores=new Map(),agents=new Map(),stateStores=new Map();
 const files=root=>{if(!stores.has(root))stores.set(root,new FileStore(root));return stores.get(root)};
 const stateFiles=root=>{if(!stateStores.has(root))stateStores.set(root,new StateStore(root));return stateStores.get(root)};
 // A disposed runtime session has no timeline. Report that explicitly instead of
 // letting a TypeError surface as an unexplained undefined-property crash.
 const timelineFor=b=>{
  const agent=agents.get(b.sessionId);
  if(!agent)throw Error('Runtime session is no longer available; maintenance skipped');
  return timelineOf(agent.session.deriveMessages());
 };
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
  readTimeline:timelineFor,
  runLogged:input=>logged({...input,maxTokens:snapshot(config).extractionMaxTokens,maxInputChars:snapshot(config).extractionMaxInputChars,
   storyMemory:snapshot(config).storyMemory,
   reservedRecordIds:[...committedIds(files(input.binding.dataRoot).read(input.binding.storyId))],
   existingRecords:JSON.parse(recall(activeRecords(files(input.binding.dataRoot).read(input.binding.storyId),input.timeline),{character:input.binding.character,maxChars:12000,maxRecords:100}))}),
  isProcessed:(b,timeline)=>observedPrefix(files(b.dataRoot).read(b.storyId),timeline),
  submit:(b,revision,records)=>{
   const current=snapshot(config);
   configStillApplies(current,b,{automatic:'automaticExtraction',failure:'Configuration changed during extraction'});
   const timeline=timelineFor(b);
   if(timelineRevision(timeline)!==revision)throw Error('Timeline changed before commit');
   const result=files(b.dataRoot).submit(b.storyId,timeline,records);diagnose('extraction-committed');return result;
  },onError:error=>{diagnose('extraction-failed-'+failureCategory(error));ctx.logger.warn('Continuity extraction failed; no transaction committed: %s',error.message);}
 });
 const states=new StateController({
  readTimeline:timelineFor,
  runLogged:input=>{
   const current=snapshot(config);
   const previous=activeSnapshot(stateFiles(input.binding.dataRoot).read(input.binding.storyId),input.timeline,input.binding.character);
   const records=activeRecords(files(input.binding.dataRoot).read(input.binding.storyId),input.timeline);
   const facts=JSON.parse(recall(records,{character:input.binding.character,maxChars:6000,maxRecords:40}));
   // Goals and routines may colour a mood; diary prose may not, or her own narration
   // would become an observation the simulator reasons from.
   const memory=current.storyMemory?memoryContext(records,input.binding.character):null;
   return simulated({...input,maxTokens:current.stateMaxTokens,
    prompt:statePrompt({character:input.binding.character,persona:input.binding.persona,timeline:input.timeline,
     revision:input.revision,facts,memory,previous,maxInputChars:current.stateMaxInputChars})});
  },
  isCurrent:(b,timeline)=>activeSnapshot(stateFiles(b.dataRoot).read(b.storyId),timeline,b.character)?.prefix.length===timeline.length,
  submit:(b,revision,proposal)=>{
   const current=snapshot(config);
   configStillApplies(current,b,{automatic:'stateSimulation',failure:'Configuration changed during state maintenance'});
   const timeline=timelineFor(b);
   if(timelineRevision(timeline)!==revision)throw Error('Timeline changed before state commit');
   // A production answer replaces the stored state, so a partial answer would
   // silently erase unchanged fields (a fever vanishing on a quiet turn).
   const simulation=validateSimulation(proposal,{timeline,requireComplete:true});
   const result=stateFiles(b.dataRoot).commit(b.storyId,timeline,b.character,simulation,{personaDigest:b.persona?.digest??null});diagnose('state-committed');return result;
  },onError:error=>{diagnose('state-failed-'+failureCategory(error));ctx.logger.warn('Story state maintenance failed; no snapshot committed: %s',error.message);}
 });
 ctx.effect(()=>()=>{extractor.dispose();states.dispose();});
 ctx.on('loader/volatile-update',()=>{binding=undefined;diagnose('configuration-updated');});
 ctx.on('agent/disposed',({agent})=>{agents.delete(String(agent.session.id))});
  // A transient catalog failure (another agent's step, or a flaky product API) must not
  // erase the binding of the chat this plugin owns: only an explicit configuration
  // change invalidates it. Clearing it here silently dropped next-turn continuity.
 ctx.on('agent/pre-step',async({agent,signal},next)=>{
  const c=snapshot(config);
  if(c.enabled&&!isAuxiliary(String(agent.session.id))){
   let b;
   try{b=await resolveElecKoiBinding(ctx.get('eleckoiConversationsApi'),c.conversationId,signal);}
   catch(error){diagnose(bindingFailureStage(error));ctx.logger.warn('Story continuity skipped; binding unavailable: %s',error.message);return next();}
   if(b.sessionId===String(agent.session.id)){
     diagnose('binding-matched');
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
  let b;
  try{b=await resolveElecKoiBinding(ctx.get('eleckoiConversationsApi'),c.conversationId,signal);}
  catch(error){diagnose(bindingFailureStage(error));ctx.logger.warn('Story maintenance skipped; binding unavailable: %s',error.message);return;}
  if(b.sessionId!==String(agent.session.id)){diagnose('runtime-session-mismatch');return;}
   diagnose('maintenance-entered');
  binding={...b,conversationId:c.conversationId,dataRoot:c.dataRoot,modelSelection:extractionModelSelection(agent,c.auxiliaryReasoningEffort)};
  agents.set(b.sessionId,agent);
  const abort=()=>{extractor.cancel(b.storyId);states.cancel(b.storyId);};signal.addEventListener('abort',abort,{once:true});
  try{
   if(c.automaticExtraction){diagnose('extraction-scheduled');try{await extractor.schedule(binding);}catch(error){if(signal.aborted){diagnose('extraction-interrupted');throw error;}}}
   if(!snapshot(config).stateSimulation)return;
   // Persona is a precondition: without it the simulation would invent a different character.
   // An authorState failure is an unavailable persona, not a reason to break the RP turn.
   let persona;
   try{persona=await readPersona(ctx.get('eleckoiConversationsApi'),binding.productId,snapshot(config).personaMaxChars);}
   catch(error){diagnose('persona-unavailable');ctx.logger.warn('Story state maintenance skipped; persona read failed: %s',error.message);return;}
   if(persona.status!=='ok'){
     diagnose('persona-unavailable');
      if(['missing-conversation','unavailable','missing-library','no-required-entries','over-budget'].includes(persona.status))diagnose('persona-'+persona.status);
    ctx.logger.warn('Story state maintenance skipped; persona material unavailable: %s',persona.status);
    return;
   }
   diagnose('state-scheduled');try{await states.schedule({...binding,persona});}catch(error){if(signal.aborted){diagnose('state-interrupted');throw error;}}
  }finally{signal.removeEventListener('abort',abort);}
 });
 ctx.systemPrompt.context({name:'story-continuity',order:850,required:true,interpolate:false,text:({agent})=>{
  const c=snapshot(config);if(!c.enabled||!binding||binding.conversationId!==c.conversationId||String(agent?.session.id)!==binding.sessionId)return '';
  const timeline=timelineOf(agent.session.deriveMessages());
  const records=activeRecords(files(c.dataRoot).read(binding.storyId),timeline);
  const facts=recall(records,{character:binding.character,query:timeline.at(-1)?.text??'',maxChars:c.maxChars,maxRecords:c.maxRecords});
  const factBlock=facts==='[]'?'':facts;
  // Self-narration and intent ride in their own framed block, never in the fact block.
  let memoryBlock='';
  if(c.storyMemory){
   try{
    memoryBlock=renderMemory(records,{character:binding.character,maxChars:c.memoryInjectMaxChars,
     maxDiary:c.memoryMaxDiary,maxGoals:c.memoryMaxGoals,maxRoutines:c.memoryMaxRoutines});
   }catch(error){ctx.logger.warn('Story memory unavailable for this request: %s',error.message);}
  }
  let stateBlock='';
  if(c.stateSimulation){
   try{
    const snapshotState=activeSnapshot(stateFiles(c.dataRoot).read(binding.storyId),timeline,binding.character);
    stateBlock=snapshotState?renderState(snapshotState,{maxChars:c.stateInjectMaxChars}):'';
   }catch(error){ctx.logger.warn('Story state unavailable for this request: %s',error.message);}
  }
  // Nothing to contribute yet: a source hash plus an empty array is pure prompt noise.
  if(!factBlock&&!memoryBlock&&!stateBlock)return '';
  diagnose(stateBlock?'state-context-rendered':'ledger-context-rendered');
  const blocks=[POLICY+'\n来源版本：'+timelineRevision(timeline)];
  if(factBlock)blocks.push(factBlock);
  if(memoryBlock)blocks.push(memoryBlock);
  if(stateBlock)blocks.push(stateBlock);
  return blocks.join('\n\n');
 }});
}
// Public Conversations API only. Missing persona fails visibly instead of defaulting.
export async function readPersona(api,productConversationId,maxChars=6000){
 if(typeof productConversationId!=='string'||!productConversationId)return {status:'missing-conversation'};
 if(typeof api?.authorState!=='function')return {status:'unavailable'};
 const authorState=await api.authorState(productConversationId);
 return selectPersona(authorState?.settingLibrary??null,{maxChars});
}
