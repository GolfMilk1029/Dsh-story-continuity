import {timelineRevision} from './extraction-controller.mjs';
// Same coalescing contract as fact extraction, so one turn cannot stack model calls.
export class StateController {
  constructor({readTimeline,runLogged,submit,onError=()=>{}}){
    Object.assign(this,{readTimeline,runLogged,submit,onError});
    this.running=new Map();this.completed=new Map();this.closed=false;
  }
  schedule(binding){
    if(this.closed)return Promise.reject(Error('State simulator disposed'));
    const key=binding.storyId;
    if(this.running.has(key))return this.running.get(key).promise;
    const controller=new AbortController();
    const promise=Promise.resolve().then(()=>this.drain(binding,controller.signal))
      .catch(error=>{if(!controller.signal.aborted)this.onError(error,binding);throw error;})
      .finally(()=>{if(this.running.get(key)?.controller===controller)this.running.delete(key);});
    this.running.set(key,{controller,promise});return promise;
  }
  async drain(binding,signal){
    for(let attempt=0;attempt<2;attempt++){
      signal.throwIfAborted();
      const timeline=structuredClone(await this.readTimeline(binding,signal));
      const revision=timelineRevision(timeline);
      if(this.completed.get(binding.storyId)===revision)return {status:'unchanged'};
      if(!timeline.length||timeline.at(-1).role!=='assistant')return {status:'not-complete'};
      const proposal=await this.runLogged({binding,timeline,revision,signal});
      signal.throwIfAborted();
      const current=await this.readTimeline(binding,signal);
      if(timelineRevision(current)!==revision)continue;
      const result=this.submit(binding,revision,proposal);
      if(result&&typeof result.then==='function')throw Error('Submit must be synchronous');
      this.completed.set(binding.storyId,revision);
      return {status:'committed',result};
    }
    return {status:'stale'};
  }
  cancel(storyId){this.running.get(storyId)?.controller.abort();}
  dispose(){this.closed=true;for(const item of this.running.values())item.controller.abort();}
}
