import {createHash} from 'node:crypto';
// Conservative persona source: only always-injected, static, enabled entries.
// Dynamic templates need a renderer and keyword entries need a selector; assuming
// either would inject text the character never actually runs with.
export function selectPersona(library,{maxChars=6000,maxEntries=40}={}){
  if(!Number.isInteger(maxChars)||maxChars<256)throw Error('Invalid persona budget');
  if(!library||!Array.isArray(library.entries))return {status:'missing-library',entries:[],text:'',digest:null};
  const chosen=[];
  for(const entry of library.entries){
    if(!entry||entry.enabled!==true)continue;
    if(entry.kind!=='normal')continue;
    if(entry.agentReadStrategy!=='required')continue;
    if(entry.contentMode!=='plain_text'||entry.dynamicMode!=='standard')continue;
    if(entry.triggerMode&&entry.triggerMode!=='always')continue;
    const content=typeof entry.content==='string'?entry.content.trim():'';
    if(!content)continue;
    chosen.push({id:String(entry.id),title:String(entry.title??'').trim(),content,order:Number(entry.order??0)});
  }
  chosen.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  if(!chosen.length)return {status:'no-required-entries',entries:[],text:'',digest:null};
  const parts=[],kept=[];let truncated=false;
  for(const entry of chosen){
    if(kept.length>=maxEntries){truncated=true;break;}
    const block=(entry.title?'## '+entry.title+'\n':'')+entry.content;
    const candidate=[...parts,block].join('\n\n');
    if(candidate.length>maxChars){truncated=true;break;}
    parts.push(block);kept.push({id:entry.id,title:entry.title});
  }
  if(!parts.length)return {status:'over-budget',entries:[],text:'',digest:null};
  const text=parts.join('\n\n');
  return {status:'ok',entries:kept,text,truncated,digest:createHash('sha256').update(text).digest('hex')};
}
