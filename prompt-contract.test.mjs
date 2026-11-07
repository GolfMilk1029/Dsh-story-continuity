import test from 'node:test';
import assert from 'node:assert/strict';
import {extractionPrompt} from './logged-extractor.mjs';

const binding = {character: '未命名角色'};
const timeline = [{id: 'a', token: 't1', text: '她把伞靠在门后。'}];

// Observed on the real machine (2026-11-07 06:15): the extractor emitted a `thread`
// record with no `status`, the transaction was rejected as `Explicit status required`,
// and the whole turn produced no ledger entry. Rejecting is correct; the prompt must
// therefore state the required fields as a pre-flight checklist.
test('the extraction prompt spell-checks required per-kind fields before output', () => {
  const prompt = extractionPrompt({binding, timeline, revision: 'r1', maxTokens: 8192});
  assert.match(prompt, /逐条自查/);
  assert.match(prompt, /thread\/plan\/promise\/conflict\/goal[^。]*必须写 status/);
  assert.match(prompt, /kind=routine[^。]*必须写 status 和 cadence/);
  assert.match(prompt, /origin 必须是 diary 或 summary/);
  // The checklist must survive the storyMemory switch, which only adds memory kinds.
  const memoryPrompt = extractionPrompt({binding, timeline, revision: 'r1', maxTokens: 8192, storyMemory: true});
  assert.match(memoryPrompt, /逐条自查/);
});

test('the extraction prompt only allows an empty result when the turn brought nothing new', () => {
  // Observed on the real machine: a turn that plainly added a new place and action
  // ("她在面摊前坐下，要了一碗面。") still came back as []. Returning [] is legal, but
  // it must be reserved for turns that truly add nothing observable.
  const prompt = extractionPrompt({binding, timeline, revision: 'r1', maxTokens: 8192});
  assert.match(prompt, /只有确认本轮没有任何此前账本未记录的地点、动作或可观察变化时才返回\[\]/);
  assert.match(prompt, /否则至少给出一条最关键的 state 或 event/);
});

test('the extraction prompt still refuses oversized input before any model call', () => {
  assert.throws(
    () => extractionPrompt({binding, timeline, revision: 'r1', maxChars: 1, maxInputChars: 8}),
    /exceeds budget/
  );
});
