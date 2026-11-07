import {createHash} from 'node:crypto';
export const timelineRevision=timeline=>createHash('sha256').update(JSON.stringify(timeline.map(x=>x.token))).digest('hex');
// runLogged must be a host-owned, durable/logged agent request, never raw llm.fetch.
// This module intentionally knows no model credentials or transport.
export class ExtractionController {
  constructor({readTimeline,runLogged,submit,isProcessed,onError=()=>{}}){
    Object.assign(this,{readTimeline,runLogged,submit,isProcessed,onError});
    this.running=new Map();this.completed=new Map();this.closed=false;
  }
  schedule(binding){
    if(this.closed)return Promise.reject(Error('Extractor disposed'));
    const key=binding.storyId;
    if(this.running.has(key))return this.running.get(key).promise;
    const controller=new AbortController();
    const promise=Promise.resolve().then(()=>this.drain(binding,controller.signal))
      .catch(error=>{if(!controller.signal.aborted)this.onError(error,binding);throw error;})
      .finally(()=>{if(this.running.get(key)?.controller===controller)this.running.delete(key);});
    this.running.set(key,{controller,promise});return promise;
  }
  async drain(binding,signal){
    // Bounded retries; a continuously edited chat must not cause endless model calls.
    for(let attempt=0;attempt<2;attempt++){
      signal.throwIfAborted();
      const timeline=structuredClone(await this.readTimeline(binding,signal));
      const revision=timelineRevision(timeline);
      if(this.completed.get(binding.storyId)===revision)return {status:'unchanged'};
      // Durable check: the ledger is the record of what was already extracted, so a
      // restart or a fresh controller must not pay for the same turn twice.
      if(this.isProcessed?.(binding,timeline)){this.completed.set(binding.storyId,revision);return {status:'unchanged'};}
      if(!timeline.length||timeline.at(-1).role!=='assistant')return {status:'not-complete'};
      const proposal=await this.runLogged({binding,timeline,revision,signal});
      signal.throwIfAborted();
      const current=await this.readTimeline(binding,signal);
      if(timelineRevision(current)!==revision)continue;
      if(!Array.isArray(proposal))throw Error('Extractor must return a records array');
      if(proposal.length>40)throw Error('Extractor proposal exceeds transaction limit');
      // submit must synchronously revalidate the revision and commit atomically.
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
