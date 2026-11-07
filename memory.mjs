// Character-authored memory: diary entries, reflections, long-term goals and the
// recurring shape of ordinary life. None of it is an established plot fact, so it is
// rendered in its own framed block instead of the fact ledger block.
import {TERMINAL_STATUS} from './core.mjs';
export const MEMORY_FRAME='【角色自述记忆：她自己写的日记与反思，可能主观、片面甚至记错；不是已发生的事实，不要当作剧情证据。长期目标与作息是她此刻的意向与习惯，尚未发生，也不要替她执行】';
const CLOSED=new Set([...TERMINAL_STATUS]);
function text(value,max){return typeof value==='string'?value.trim().slice(0,max):'';}
function latestByKey(records,kind){
  const map=new Map();
  for(const r of records)if(r.kind===kind)map.set(r.key,r);
  return [...map.values()];
}
export function characterMemory(records,character){
  if(typeof character!=='string'||!character)return {goals:[],routines:[],entries:[]};
  const mine=records.filter(r=>Array.isArray(r.knownBy)&&r.knownBy.includes(character));
  return {
    // A closed goal is history, not a live intention; it still exists in the ledger.
    goals:latestByKey(mine,'goal').filter(r=>!CLOSED.has(r.status)),
    routines:latestByKey(mine,'routine').filter(r=>r.status==='active'),
    entries:mine.filter(r=>r.kind==='diary'||r.kind==='reflection'),
  };
}
export function renderMemory(records,{character,maxChars=1000,maxDiary=3,maxGoals=4,maxRoutines=4}={}){
  if(!Number.isInteger(maxChars)||maxChars<120)throw Error('Invalid memory injection budget');
  for(const [name,value] of [['maxDiary',maxDiary],['maxGoals',maxGoals],['maxRoutines',maxRoutines]])
    if(!Number.isInteger(value)||value<0||value>20)throw Error('Invalid '+name);
  const {goals,routines,entries}=characterMemory(records,character);
  if(!goals.length&&!routines.length&&!entries.length)return '';
  const lines=[MEMORY_FRAME];
  if(goals.length)lines.push('长期目标：'+goals.slice(-maxGoals).map(r=>text(r.text,80)).filter(Boolean).join('；'));
  if(routines.length)lines.push('生活作息：'+routines.slice(-maxRoutines).map(r=>{
    const body=text(r.text,80);const cadence=text(r.cadence,30);
    return body&&cadence?body+'（'+cadence+'）':body;
  }).filter(Boolean).join('；'));
  // Diary and reflection are kept in commit order; the most recent ones matter most.
  const recent=entries.slice(-maxDiary);
  if(recent.length){
    lines.push('最近的日记与反思（第一人称，她自己的口吻）：');
    for(const entry of recent){
      const label=entry.kind==='reflection'?'反思':'日记';
      const body=text(entry.text,160);
      if(body)lines.push('- ['+label+'] '+body);
    }
  }
  const rendered=lines.join('\n');
  return rendered.length>maxChars?rendered.slice(0,maxChars):rendered;
}
// The state simulator may ground a mood in a live goal or routine, but never in
// diary prose: that would let the character's own narration become an observation.
export function memoryContext(records,character){
  const {goals,routines}=characterMemory(records,character);
  return {goals:goals.map(r=>text(r.text,80)).filter(Boolean),
    routines:routines.map(r=>text(r.text,80)).filter(Boolean)};
}
