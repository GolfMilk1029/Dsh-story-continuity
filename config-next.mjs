import Schema from '@deepseek-ai/schemastery';
// Separate until integration tests cover both rc.3 and rc.5 live references.
export const Config=Schema.object({
  enabled:Schema.boolean().default(false).description('启用连续性处理；初始关闭，不发起模型调用').volatile(),
  conversationId:Schema.string().default('').description('聊天 ID，或 title:唯一聊天标题；仅精确匹配，重名拒绝；空值不处理任何聊天').volatile(),
  dataRoot:Schema.string().default('').description('宿主可写的绝对私有目录；空值不创建文件').volatile(),
  automaticExtraction:Schema.boolean().default(false).description('启用有日志的辅助代理提取，可能产生模型费用').volatile(),
  maxChars:Schema.number().step(1).min(256).max(24000).default(6000).volatile(),
  maxRecords:Schema.number().step(1).min(1).max(100).default(24).volatile(),
  extractionMaxTokens:Schema.number().step(1).min(256).max(8192).default(2048).volatile(),
  extractionMaxInputChars:Schema.number().step(1).min(2000).max(200000).default(48000).description('提取输入字符上限；超限拒绝调用，不静默截断来源').volatile()
});
export function snapshot(config){
 const value=Object.fromEntries(Object.keys(Config.dict).map(k=>[k,config[k].get()]));
 if(value.enabled){
   if(!value.conversationId.trim())throw Error('Choose an explicit conversation before enabling');
   if(!value.dataRoot.startsWith('/')||value.dataRoot.includes('PLACEHOLDER'))throw Error('Choose an absolute private data directory before enabling');
 }
 return Object.freeze(value);
}
