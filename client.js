window.__ModuleLoader__.load({id:'dsh-story-continuity',factory:(require)=>{
 const React=require('react'),h=React.createElement;
 const fields=[['enabled','启用连续性处理','checkbox'],['conversationId','聊天 ID 或 title:唯一标题','text'],['dataRoot','宿主私有存储绝对路径','text'],['automaticExtraction','自动提取（会产生模型费用）','checkbox'],['maxChars','注入字符上限','number'],['maxRecords','注入记录上限','number'],['extractionMaxTokens','提取输出 token 上限','number'],['extractionMaxInputChars','提取输入字符上限','number'],['stateSimulation','角色状态模拟（故事时间，额外一次调用）','checkbox'],['personaMaxChars','人设读取字符上限','number'],['stateMaxTokens','状态输出 token 上限','number'],['stateMaxInputChars','状态输入字符上限','number'],['stateInjectMaxChars','状态注入字符上限','number']];
 function Page({form,view}){
  const state=form?.state;
  const [draft,setDraft]=React.useState(null),[revision,setRevision]=React.useState(null),[notice,setNotice]=React.useState(''),[busy,setBusy]=React.useState(false);
  if(view==='summary')return h('span',null,'仅处理明确绑定的聊天；默认关闭。');
  if(!state||state.status!=='ready')return h('p',null,'配置尚未就绪；请先打开组件开关。');
  const values=draft??state.value??{};
  async function save(){
   if(values.enabled&&(!String(values.conversationId??'').trim()||!String(values.dataRoot??'').startsWith('/'))){setNotice('启用前请填写唯一聊天及私有绝对目录。');return;}
   setBusy(true);setNotice('');
   try{await form.mutate(fields.map(([key])=>({op:'set',path:[key],value:values[key]})),revision??state.revision);setDraft(null);setRevision(null);setNotice('保存请求已完成，请核对当前值。');}catch(error){setNotice(String(error?.message??error));}finally{setBusy(false);}
  }
  return h('section',{style:{color:'var(--dsw-alias-label-primary)',display:'grid',gap:12}},h('p',null,'默认不读取任何聊天。先填写独立测试聊天及存储目录，再启用处理；自动提取与状态模拟另有费用；状态模拟需要能自动读到人设。'),...fields.map(([key,label,type])=>h('label',{key,style:{display:'grid',gap:6}},label,h('input',{type,checked:type==='checkbox'?Boolean(values[key]):undefined,value:type==='checkbox'?undefined:(values[key]??''),disabled:busy||!state.writable,onChange:event=>{if(draft===null)setRevision(state.revision);setDraft({...values,[key]:type==='checkbox'?event.target.checked:type==='number'?Number(event.target.value):event.target.value});},style:{color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-bg-layer-1)'}}))),h('button',{disabled:busy||!state.writable||draft===null,onClick:save},busy?'保存中…':'保存配置'),h('p',{role:'status'},notice));
 }
 return {name:'dsh-story-continuity-client',inject:['slots'],apply(ctx){ctx.slots.inject('plugins.row.config',()=>ctx.slots.register({name:'plugins.row.config',key:'dsh-story-continuity#dsh-story-continuity'},Page));}};
}});
