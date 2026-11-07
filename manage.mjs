import {FileStore} from './store.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {activeRecords,project} from './core.mjs';
const [cmd,root,scope,arg,confirm]=process.argv.slice(2);
if(!root||!scope)throw Error('Usage: node manage.mjs inspect|export|suppress|clear|project <absolute dataRoot> <storyId> [argument] [--confirm]');
const files=new FileStore(root);
if(cmd==='inspect')console.log(JSON.stringify(files.read(scope),null,2));
else if(cmd==='export'){
 if(!arg)throw Error('Export path required');writeFileSync(arg,JSON.stringify(files.read(scope),null,2),{flag:'wx',mode:0o600});
}else if(cmd==='suppress'){
 if(confirm!=='--confirm')throw Error('Pass record IDs joined by commas followed by --confirm');files.suppress(scope,arg.split(','));
}else if(cmd==='clear'){
 if(arg!=='--confirm')throw Error('Clears only this story scope. Pass --confirm');
 files.save(scope,{version:1,batches:[],suppressed:[]});
}else if(cmd==='project'){
 const timeline=JSON.parse(readFileSync(arg,'utf8'));console.log(JSON.stringify(project(activeRecords(files.read(scope),timeline)),null,2));
}else throw Error('Unknown command');
