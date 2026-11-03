import Schema from '@deepseek-ai/schemastery';
// Separate until integration tests cover both rc.3 and rc.5 live references.
export const Config=Schema.object({
  diagnosticPath:Schema.string().default('').description('可选诊断 JSON 绝对文件路径；空值不写；仅阶段与计数，不包含正文或错误原文').volatile(),
  enabled:Schema.boolean().default(false).description('启用连续性处理；初始关闭，不发起模型调用').volatile(),
  conversationId:Schema.string().default('').description('聊天 ID，或 title:唯一聊天标题；仅精确匹配，重名拒绝；空值不处理任何聊天').volatile(),
  dataRoot:Schema.string().default('').description('宿主可写的绝对私有目录；空值不创建文件').volatile(),
  automaticExtraction:Schema.boolean().default(false).description('启用有日志的辅助代理提取，可能产生模型费用').volatile(),
  maxChars:Schema.number().step(1).min(256).max(24000).default(6000).volatile(),
  maxRecords:Schema.number().step(1).min(1).max(100).default(24).volatile(),
  extractionMaxTokens:Schema.number().step(1).min(256).max(8192).default(2048).volatile(),
  extractionMaxInputChars:Schema.number().step(1).min(2000).max(200000).default(48000).description('提取输入字符上限；超限拒绝调用，不静默截断来源').volatile(),
  stateSimulation:Schema.boolean().default(false).description('按故事时间模拟角色内部状态；需要可读人设，额外一次模型调用').volatile(),
  personaMaxChars:Schema.number().step(1).min(500).max(24000).default(6000).description('自动读取人设的字符上限；超限跳过而非截断').volatile(),
  stateMaxTokens:Schema.number().step(1).min(256).max(8192).default(1024).description('状态模拟输出上限；不足时由提示词收紧输出').volatile(),
  stateMaxInputChars:Schema.number().step(1).min(4000).max(200000).default(32000).description('状态模拟输入字符上限；超限拒绝调用').volatile(),
  stateInjectMaxChars:Schema.number().step(1).min(200).max(4000).default(1200).description('注入本次请求的状态摘要字符上限').volatile()
});
export function snapshot(config){
 const value=Object.fromEntries(Object.keys(Config.dict).map(k=>[k,config[k].get()]));
 if(value.enabled){
   if(!value.conversationId.trim())throw Error('Choose an explicit conversation before enabling');
   if(!value.dataRoot.startsWith('/')||value.dataRoot.includes('PLACEHOLDER'))throw Error('Choose an absolute private data directory before enabling');
 }
 return Object.freeze(value);
}
