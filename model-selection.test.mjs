import test from "node:test";
import assert from "node:assert/strict";
import {extractionModelSelection} from "./model-selection.mjs";
test("uses recorded host route instead of stale agent options",()=>{
 const agent={options:{provider:"old",model:"old"},session:{requestHeader:()=>({config:{provider:"actual",model:"rp",reasoningEffort:"high"}})}};
 assert.deepEqual(extractionModelSelection(agent),{provider:"actual",model:"rp",reasoningEffort:"high"});
});
test("empty agent options use admitted request route",()=>{
 assert.equal(extractionModelSelection({options:{},session:{requestHeader:()=>({config:{provider:"fake",model:"rp"}})}}).model,"rp");
});
test("no configured or admitted route fails closed",()=>{
 assert.throws(()=>extractionModelSelection({options:{},session:{}}),/No resolved/);
});
test("inherit keeps the main chat reasoning effort untouched",()=>{
 const agent={options:{provider:"p",model:"m",reasoningEffort:"high"},session:{}};
 assert.equal(extractionModelSelection(agent).reasoningEffort,"high");
 assert.equal(extractionModelSelection(agent,"inherit").reasoningEffort,"high");
});
test("an auxiliary override only changes the copy it returns",()=>{
 const agent={options:{provider:"p",model:"m",reasoningEffort:"high"},session:{}};
 assert.equal(extractionModelSelection(agent,"low").reasoningEffort,"low");
 assert.equal(extractionModelSelection(agent,"medium").reasoningEffort,"medium");
 assert.equal(agent.options.reasoningEffort,"high","the main chat must not be mutated");
});
test("an unsupported or unknown effort fails instead of silently degrading",()=>{
 const agent={options:{provider:"p",model:"m"},session:{}};
 assert.throws(()=>extractionModelSelection(agent,"invalid"),/Invalid auxiliary reasoning effort/);
 assert.throws(()=>extractionModelSelection(agent,""),/Invalid auxiliary reasoning effort/);
});
