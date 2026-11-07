import Schema from '@deepseek-ai/schemastery';
import {isAbsolute} from 'node:path';
// Separate until integration tests cover both rc.3 and rc.5 live references.
export const Config=Schema.object({
  diagnosticPath:Schema.string().default('').description('可选诊断 JSON 绝对文件路径；空值不写；仅阶段与计数，不包含正文或错误原文').volatile(),
  enabled:Schema.boolean().default(false).description('启用连续性处理；初始关闭，不发起模型调用').volatile(),
  conversationId:Schema.string().default('').description('聊天 ID，或 title:唯一聊天标题；仅精确匹配，重名拒绝；空值不处理任何聊天').volatile(),
  dataRoot:Schema.string().default('').description('宿主可写的绝对私有目录；空值不创建文件').volatile(),
  automaticExtraction:Schema.boolean().default(false).description('启用有日志的辅助代理提取，可能产生模型费用').volatile(),
  maxChars:Schema.number().step(1).min(256).max(24000).default(6000).volatile(),
  maxRecords:Schema.number().step(1).min(1).max(100).default(24).volatile(),
  auxiliaryReasoningEffort:Schema.union(['inherit','low','medium','high']).default('inherit').description('辅助提取与状态模拟的推理强度；不改变主聊天；inherit 沿用主聊天').volatile(),
  extractionMaxTokens:Schema.number().step(1).min(256).max(65536).default(16384).description('提取总输出预算。这是上限而非计费：模型提前停止不会花满；推理 token 也计入该上限。真机证据：同一条 17 条消息的时间线，deepseek-flash 在高推理下 8192 会截断 JSON（关掉思考时已用 6366），16384 成功').volatile(),
  extractionMaxInputChars:Schema.number().step(1).min(2000).max(200000).default(48000).description('提取输入字符上限；超限拒绝调用，不静默截断来源').volatile(),
  stateSimulation:Schema.boolean().default(false).description('按故事时间模拟角色内部状态；需要可读人设，额外一次模型调用').volatile(),
  personaMaxChars:Schema.number().step(1).min(500).max(24000).default(6000).description('自动读取人设的字符上限；超限跳过而非截断').volatile(),
  stateMaxTokens:Schema.number().step(1).min(256).max(65536).default(8192).description('状态模拟总输出预算。同样是上限而非计费；推理 token 计入，过低会截断 JSON 并被安全拒绝').volatile(),
  stateMaxInputChars:Schema.number().step(1).min(4000).max(200000).default(32000).description('状态模拟输入字符上限；超限拒绝调用').volatile(),
  stateInjectMaxChars:Schema.number().step(1).min(200).max(4000).default(1200).description('注入本次请求的状态摘要字符上限').volatile(),
  storyMemory:Schema.boolean().default(false).description('启用角色自述记忆：日记、反思、长期目标、生活作息。不新增模型调用，由现有提取回合顺带产出；默认关闭；这些内容永不进入事实通道').volatile(),
  memoryInjectMaxChars:Schema.number().step(1).min(120).max(4000).default(1000).description('自述记忆注入的字符上限').volatile(),
  memoryMaxDiary:Schema.number().step(1).min(0).max(20).default(3).description('注入最近几条日记/反思').volatile(),
  memoryMaxGoals:Schema.number().step(1).min(0).max(20).default(4).description('注入几条进行中的长期目标').volatile(),
  memoryMaxRoutines:Schema.number().step(1).min(0).max(20).default(4).description('注入几条生活作息').volatile()
});
export function snapshot(config){
 const value=Object.fromEntries(Object.keys(Config.dict).map(k=>[k,config[k].get()]));
 if(value.enabled){
   if(!value.conversationId.trim())throw Error('Choose an explicit conversation before enabling');
   if(!isAbsolute(value.dataRoot)||value.dataRoot.includes('PLACEHOLDER'))throw Error('Choose an absolute private data directory before enabling');
 }
 return Object.freeze(value);
}
