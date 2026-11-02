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
