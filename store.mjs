import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { emptyStore, validateStore, commit } from './core.mjs';
export const digest=text=>createHash('sha256').update(text).digest('hex');
export function timelineOf(messages){
  return messages.filter(m=>m.role==='assistant'||(m.role==='user'&&m.source?.kind==='user'))
    .filter(m=>m.role!=='assistant'||!m.toolCalls?.length)
    .map(m=>({id:String(m.id),role:m.role,text:(m.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('\n')}))
    .filter(m=>m.text.trim())
    .map(m=>({...m,token:digest(JSON.stringify(m))}));
}
export class FileStore {
  constructor(root){if(!root||!root.startsWith('/'))throw Error('Absolute dataRoot required');this.root=resolve(root);mkdirSync(this.root,{recursive:true,mode:0o700});}
  path(scope){if(typeof scope!=='string'||!scope.trim())throw Error('Scope required');return join(this.root,digest(scope)+'.json');}
  read(scope){try{return validateStore(JSON.parse(readFileSync(this.path(scope),'utf8')));}catch(e){if(e.code==='ENOENT')return emptyStore();throw e;}}
  save(scope,state){
    validateStore(state);const path=this.path(scope),tmp=path+'.'+randomUUID()+'.tmp';
    try{
      writeFileSync(tmp,JSON.stringify(state),{mode:0o600,flag:'wx'});
      const fd=openSync(tmp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
      renameSync(tmp,path);
    }catch(e){try{unlinkSync(tmp);}catch{}throw e;}
  }
  // All transactions are synchronous in one host process: no await between read and rename.
  submit(scope,timeline,records){const result=commit(this.read(scope),timeline,records,digest);if(!result.duplicate)this.save(scope,result.store);return result;}
  suppress(scope,ids){const s=this.read(scope);if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw Error('Invalid ids');this.save(scope,{...s,suppressed:[...new Set([...s.suppressed,...ids])]});}
}
