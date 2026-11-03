window.__ModuleLoader__.load({id:'dsh-story-continuity',factory:(require)=>{
 const React=require('react'),h=React.createElement;
 const fields=[['enabled','启用连续性处理','checkbox'],['conversationId','聊天 ID 或 title:唯一标题','text'],['dataRoot','宿主私有存储绝对路径','text'],['automaticExtraction','自动提取（会产生模型费用）','checkbox'],['maxChars','注入字符上限','number'],['maxRecords','注入记录上限','number'],['extractionMaxTokens','提取输出 token 上限','number'],['extractionMaxInputChars','提取输入字符上限','number'],['stateSimulation','角色状态模拟（故事时间，额外一次调用）','checkbox'],['personaMaxChars','人设读取字符上限','number'],['stateMaxTokens','状态输出 token 上限','number'],['stateMaxInputChars','状态输入字符上限','number'],['stateInjectMaxChars','状态注入字符上限','number']];
 let clientContext;
 function inspectCurrentConversation(){
  try{
   const service=clientContext?.get?.('eleckoiConversations');
   if(typeof service?.getDetailsSnapshot!=='function')return {status:'unavailable',reason:'宿主未提供会话身份读取服务。'};
   const row=service.getDetailsSnapshot();
   if(!row||typeof row.id!=='string'||!row.id)return {status:'missing',reason:'当前没有可读取的会话身份；请先打开隔离测试聊天，再回到此页。'};
   return {status:'ok',id:row.id,title:typeof row.title==='string'?row.title:'',runtimeSessionId:typeof row.runtimeSessionId==='string'?row.runtimeSessionId:''};
  }catch(error){return {status:'error',reason:String(error?.message??error)};}
 }
 function Page({form,view}){
  const state=form?.state;
  const [diagnostic,setDiagnostic]=React.useState(null);
  const [draft,setDraft]=React.useState(null),[revision,setRevision]=React.useState(null),[notice,setNotice]=React.useState(''),[busy,setBusy]=React.useState(false);
  if(view==='summary')return h('span',null,'仅处理明确绑定的聊天；默认关闭。');
  if(!state||state.status!=='ready')return h('p',null,'配置尚未就绪；请先打开组件开关。');
  const values=draft??state.value??{};
  async function save(){
   if(values.enabled&&(!String(values.conversationId??'').trim()||!String(values.dataRoot??'').startsWith('/'))){setNotice('启用前请填写唯一聊天及私有绝对目录。');return;}
   setBusy(true);setNotice('');
   try{await form.mutate(fields.map(([key])=>({op:'set',path:[key],value:values[key]})),revision??state.revision);setDraft(null);setRevision(null);setNotice('保存请求已完成，请核对当前值。');}catch(error){setNotice(String(error?.message??error));}finally{setBusy(false);}
  }
  return h('section',{style:{color:'var(--dsw-alias-label-primary)',display:'grid',gap:12}},h('p',null,'默认不读取任何聊天。先填写独立测试聊天及存储目录，再启用处理；自动提取与状态模拟另有费用；状态模拟需要能自动读到人设。'),h('button',{type:'button',onClick:()=>setDiagnostic(inspectCurrentConversation())},'读取当前会话身份（只读、无模型费用）'),diagnostic&&h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},JSON.stringify(diagnostic,null,2)),diagnostic?.status==='ok'&&h('p',null,'此处仅证明前端会话身份，不代表后端已绑定或状态已落盘。请确认这是隔离测试会话。'),diagnostic?.status==='ok'&&h('button',{type:'button',disabled:busy||!state.writable,onClick:()=>{if(draft===null)setRevision(state.revision);setDraft({...values,conversationId:diagnostic.id});setNotice('已填入真实聊天 ID，尚未保存；请核对后保存配置。');}},'填入此聊天 ID（仍需保存）'),...fields.map(([key,label,type])=>h('label',{key,style:{display:'grid',gap:6}},label,h('input',{type,checked:type==='checkbox'?Boolean(values[key]):undefined,value:type==='checkbox'?undefined:(values[key]??''),disabled:busy||!state.writable,onChange:event=>{if(draft===null)setRevision(state.revision);setDraft({...values,[key]:type==='checkbox'?event.target.checked:type==='number'?Number(event.target.value):event.target.value});},style:{color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-bg-layer-1)'}}))),h('button',{disabled:busy||!state.writable||draft===null,onClick:save},busy?'保存中…':'保存配置'),h('p',{role:'status'},notice));
 }
 return {name:'dsh-story-continuity-client',inject:['slots'],apply(ctx){clientContext=ctx;ctx.slots.inject('plugins.row.config',()=>ctx.slots.register({name:'plugins.row.config',key:'dsh-story-continuity#dsh-story-continuity'},Page));}};
}});
