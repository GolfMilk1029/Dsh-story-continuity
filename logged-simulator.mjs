import {randomUUID} from 'node:crypto';
// The auxiliary agent is host-owned and logged, exactly like the extractor; the only
// difference is that a state maintenance request returns one JSON object, not an array.
export function createLoggedSimulator({agents,createUserMessage,SessionId,setup,maxTokens=1024}){
 if(!agents?.create||!createUserMessage||!SessionId||!setup)throw Error('Logged agent dependencies unavailable');
 return async input=>{
  const {signal,binding,prompt}=input;
  if(typeof prompt!=='string'||!prompt.trim())throw Error('Explicit state prompt required');
  signal.throwIfAborted();
  const options=binding.modelSelection;
  if(!options?.provider||!options?.model)throw Error('Explicit state provider/model required');
  const budget=input.maxTokens??maxTokens;
  const handle=await agents.create({sessionId:SessionId('story-state-'+randomUUID()),
   agentOptions:{...options,maxTokens:budget},signal,setup});
  const abort=()=>handle.agent.cancel({kind:'user'});
  signal.addEventListener('abort',abort,{once:true});
  try{
   signal.throwIfAborted();
   handle.agent.followup(createUserMessage({content:[{type:'text',text:prompt}],source:{kind:'user'}}));
   await handle.agent.whenIdle();signal.throwIfAborted();
   const replies=handle.agent.session.deriveMessages().filter(m=>m.role==='assistant'&&!m.toolCalls?.length);
   // Distinguish "the request never produced an answer" from "the model answered twice":
   // the first is a model/transport failure and must not be reported as a JSON problem.
   if(replies.length===0)throw Error('Auxiliary state request returned no final message; transport or model failure');
   if(replies.length>1)throw Error('State simulator must produce exactly one final assistant message');
   const text=(replies[0].content??[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
   if(text.length>60000)throw Error('State output too large');
   const value=JSON.parse(text);
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('State output is not an object');
   return value;
  }finally{signal.removeEventListener('abort',abort);await handle.dispose();}
 };
}
