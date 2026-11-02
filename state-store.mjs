import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,openSync,fsyncSync,closeSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {digest} from './store.mjs';
import {canonical} from './core.mjs';
export const emptyStateLog=()=>({version:1,snapshots:[]});
function assertLog(log){
  if(!log||log.version!==1||!Array.isArray(log.snapshots))throw Error('Unsupported/corrupt state log');
  for(const s of log.snapshots){
    if(!s||typeof s.id!=='string'||typeof s.character!=='string')throw Error('Corrupt state snapshot');
    if(!Array.isArray(s.prefix)||s.prefix.some(t=>typeof t!=='string'))throw Error('Corrupt state prefix');
    if(!s.state||typeof s.state!=='object'||Array.isArray(s.state))throw Error('Corrupt state body');
    if(!Number.isInteger(s.elapsedMinutes)||s.elapsedMinutes<0)throw Error('Corrupt story time');
    if(!s.storyTime||(!Number.isInteger(s.storyTime.minutes)&&s.storyTime.minutes!==null))throw Error('Corrupt story clock');
  }return log;
}
// A snapshot is only usable while its full observation prefix is still the live one,
// so editing, deleting or regenerating the story invalidates the simulated state.
export function activeSnapshot(log,timeline,character){
  const tokens=timeline.map(m=>m.token);let best=null;
  for(const s of log.snapshots){
    if(s.character!==character)continue;
    if(s.prefix.length>tokens.length||s.prefix.some((t,i)=>tokens[i]!==t))continue;
    if(!best||s.prefix.length>=best.prefix.length)best=s;
  }return best;
}
export function recordSnapshot(log,timeline,character,simulation,{personaDigest=null,maxSnapshots=500}={}){
  assertLog(log);
  if(!character)throw Error('Character required for a state snapshot');
  const tokens=timeline.map(m=>m.token),previous=activeSnapshot(log,timeline,character);
  if(previous?.prefix.length===tokens.length)return {log,duplicate:true,snapshot:previous};
  const elapsed=Number.isInteger(simulation.storyTime?.elapsedMinutes)?simulation.storyTime.elapsedMinutes:0;
  if(elapsed){
    const {sourceId,evidence}=simulation.storyTime;
    const index=timeline.findIndex(m=>m.id===sourceId);
    if(index<0||typeof evidence!=='string'||!evidence||!timeline[index].text.includes(evidence))throw Error('Story time requires active literal evidence');
    if(index<(previous?.prefix.length??0))throw Error('Story time evidence already observed; cannot advance again');
  }
  // Story minutes are absolute since the first observation, so trimming old snapshots stays safe.
  const minutes=(previous?.storyTime?.minutes??0)+elapsed;
  const storyTime={minutes,label:simulation.storyTime?.label??null};
  const {storyTime:ignored,...state}=simulation;
  const snapshot={id:digest(canonical({prefix:tokens,character,state,storyTime,elapsedMinutes:elapsed})),
    character,prefix:tokens,elapsedMinutes:elapsed,storyTime,state,personaDigest};
  if(log.snapshots.some(s=>s.id===snapshot.id))return {log,duplicate:true,snapshot};
  return {log:{version:1,snapshots:[...log.snapshots,snapshot].slice(-maxSnapshots)},duplicate:false,snapshot};
}
export class StateStore {
  constructor(root){if(!root||!root.startsWith('/'))throw Error('Absolute dataRoot required');this.root=resolve(root);mkdirSync(this.root,{recursive:true,mode:0o700});}
  path(scope){if(typeof scope!=='string'||!scope.trim())throw Error('Scope required');return join(this.root,digest(scope+'\u0000state')+'.state.json');}
  read(scope){
    let raw;try{raw=readFileSync(this.path(scope),'utf8');}catch(error){if(error.code==='ENOENT')return emptyStateLog();throw error;}
    // Corrupt state must fail closed; it never degrades into "no state" silently.
    return assertLog(JSON.parse(raw));
  }
  save(scope,log){
    assertLog(log);
    const path=this.path(scope),tmp=path+'.'+randomUUID()+'.tmp';
    try{
      writeFileSync(tmp,JSON.stringify(log),{mode:0o600,flag:'wx'});
      const fd=openSync(tmp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
      renameSync(tmp,path);
    }catch(error){try{unlinkSync(tmp);}catch{}throw error;}
  }
  commit(scope,timeline,character,simulation,options){
    const result=recordSnapshot(this.read(scope),timeline,character,simulation,options);
    if(!result.duplicate)this.save(scope,result.log);
    return result;
  }
}
