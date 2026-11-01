import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {apply,Config} from './index.mjs';
test('rc.5 real defineTool compilation; request-local binding and ledger cycle',async()=>{
 const tools=new Map();let provider;
 const ctx={systemPrompt:{context:p=>{provider=p;return ()=>{};}},tools:{register:t=>{tools.set(t.name,t);return ()=>{};}}};
 const config=Config({dataRoot:mkdtempSync(join(tmpdir(),'story-host-')),bindings:[{sessionId:'session-a',character:'A',storyId:'story'}]});apply(ctx,config);
 assert.equal(tools.size,2);assert.equal(provider.text({}), '');
 const agent={session:{id:'session-a',deriveMessages:()=>[{id:'m1',role:'assistant',content:[{type:'text',text:'门开了'}]}]}};
 assert.match(provider.text({agent}),/小说连续性/);
 const r={id:'r1',kind:'state',key:'door',text:'门开了',sourceId:'m1',evidence:'门开了',origin:'narrative',certainty:'certain',knownBy:['A']};
 const tool=tools.get('story_commit');assert.ok(tool);
 const result=await tool.execute({recordsJson:JSON.stringify([r])},{agent});assert.equal(JSON.parse(result).saved,true);assert.match(provider.text({agent}),/门开了/);
 agent.session.deriveMessages=()=>[];assert.ok(!provider.text({agent}).includes('门开了'));
 assert.equal(provider.text({agent:{session:{id:'other'}}}),'');
});
