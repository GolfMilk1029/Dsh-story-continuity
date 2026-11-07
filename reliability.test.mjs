import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {apply,Config,configStillApplies,failureCategory} from './index.mjs';
import {FileStore,digest,timelineOf} from './store.mjs';
import {observedPrefix} from './core.mjs';
import {ExtractionController} from './extraction-controller.mjs';
import {StateController} from './state-controller.mjs';
import {StateStore,activeSnapshot} from './state-store.mjs';
import {validateSimulation} from './state-sim.mjs';

// ---- reliability item: authorState must not break the roleplay turn -------------
test('an authorState failure is an unavailable persona, not a broken RP turn', async () => {
  const events = new Map(), warnings = [];
  const row = {id: 'chat', runtimeSessionId: 'runtime', metadata: {characterId: 'c', characterName: 'Synthetic'}};
  const api = {list: async () => [row], authorState: async () => { throw Error('product API exploded'); }};
  const ctx = {
    agents: {create: () => assert.fail('No persona: no model call')},
    tools: {}, systemPrompt: {context: () => {}},
    on: (n, f) => events.set(n, f), effect: f => f(), get: () => api,
    logger: {warn: (...a) => warnings.push(a)},
  };
  apply(ctx, Config({enabled: true, automaticExtraction: false, stateSimulation: true,
    conversationId: 'chat', dataRoot: mkdtempSync(join(tmpdir(), 'authorstate-host-'))}));
  await events.get('agent/turn-stopping')({
    agent: {session: {id: 'runtime', deriveMessages: () => []}, options: {provider: 'p', model: 'm'}},
    signal: new AbortController().signal});
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].join(' '), /persona read failed/);
});

// ---- reliability item: a transient catalog failure must not drop the binding ----
test('a failed catalog read on another step keeps the bound chat disclosed', async () => {
  const events = new Map(), contexts = [];
  const row = {id: 'chat', runtimeSessionId: 'runtime', metadata: {characterId: 'c', characterName: 'Synthetic'}};
  let api = {list: async () => [row]};
  const ctx = {
    agents: {create: () => assert.fail('no model expected')},
    tools: {}, systemPrompt: {context: c => contexts.push(c)},
    on: (n, f) => events.set(n, f), effect: f => f(), get: () => api,
    logger: {warn: () => {}},
  };
  const root = mkdtempSync(join(tmpdir(), 'binding-retain-'));
  apply(ctx, Config({enabled: true, conversationId: 'chat', dataRoot: root}));
  // A persisted fact is what makes the retained binding observable: with an empty
  // ledger the plugin deliberately contributes nothing at all.
  const messages = [
    {id: 'm1', role: 'user', source: {kind: 'user'}, content: [{type: 'text', text: '她把伞放下了。'}]},
    {id: 'm2', role: 'assistant', content: [{type: 'text', text: '雨停了。'}]}];
  new FileStore(root).submit('eleckoi:chat', timelineOf(messages), [{id: 'f1', kind: 'state', key: 'umbrella',
    text: '她把伞放下了', sourceId: 'm2', evidence: '雨停了。', origin: 'narrative',
    certainty: 'certain', knownBy: ['Synthetic']}]);
  const agent = {session: {id: 'runtime', deriveMessages: () => messages}, options: {provider: 'p', model: 'm'}};
  await events.get('agent/pre-step')({agent, signal: new AbortController().signal}, () => 'next');
  assert.match(contexts[0].text({agent}), /小说连续性/);

  // The product catalog goes down for one step of some other conversation.
  api = {list: async () => { throw Error('catalog down'); }};
  const other = {session: {id: 'unrelated', deriveMessages: () => []}, options: {}};
  const continued = await events.get('agent/pre-step')({agent: other, signal: new AbortController().signal}, () => 'next');
  assert.equal(continued, 'next', 'a catalog failure must still let the turn proceed');
  // The bound chat keeps its ledger context instead of silently losing it.
  assert.match(contexts[0].text({agent}), /小说连续性/);
  assert.match(contexts[0].text({agent}), /umbrella/);
  assert.equal(contexts[0].text({agent: other}), '');
});

// ---- reliability item: a restart must not extract the same turn again -----------
const turn = [
  {id: '1', role: 'user', text: '她接过伞。', token: 't1'},
  {id: '2', role: 'assistant', text: '她撑开伞。', token: 't2'},
];
const record = {id: 'r1', kind: 'state', key: 'umbrella', text: '她接过了伞', sourceId: '2',
  evidence: '她撑开伞', origin: 'narrative', certainty: 'certain', knownBy: ['琉璃']};

test('a restarted extractor reuses the durable ledger instead of calling the model again', async () => {
  const root = mkdtempSync(join(tmpdir(), 'restart-extract-'));
  const store = new FileStore(root);
  let timeline = turn, calls = 0;
  // A fresh controller per schedule is exactly a process restart.
  const fresh = () => new ExtractionController({
    readTimeline: async () => structuredClone(timeline),
    runLogged: async () => { calls++; return [{...record, id: 'r' + calls}]; },
    submit: (b, _revision, records) => store.submit(b.storyId, timeline, records),
    isProcessed: (b, tl) => observedPrefix(store.read(b.storyId), tl),
  });
  const binding = {storyId: 'story', dataRoot: root, character: '琉璃'};

  assert.equal((await fresh().schedule(binding)).status, 'committed');
  assert.equal(calls, 1);
  assert.equal((await fresh().schedule(binding)).status, 'unchanged');
  assert.equal(calls, 1, 'the restart must not pay for a second extraction');

  // A genuinely extended story must still be extracted.
  timeline = [...turn, {id: '3', role: 'user', text: '雨更大了。', token: 't3'}];
  assert.equal((await fresh().schedule(binding)).status, 'not-complete');
  timeline = [...timeline, {id: '4', role: 'assistant', text: '她加快了脚步。', token: 't4'}];
  assert.equal((await fresh().schedule(binding)).status, 'committed');
  assert.equal(calls, 2);
});

test('a turn with no facts still records that it was observed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'empty-extract-'));
  const store = new FileStore(root);
  let calls = 0;
  const fresh = () => new ExtractionController({
    readTimeline: async () => structuredClone(turn),
    runLogged: async () => { calls++; return []; },
    submit: (b, _revision, records) => store.submit(b.storyId, turn, records),
    isProcessed: (b, tl) => observedPrefix(store.read(b.storyId), tl),
  });
  const binding = {storyId: 'story', dataRoot: root, character: '琉璃'};
  assert.equal((await fresh().schedule(binding)).status, 'committed');
  assert.equal((await fresh().schedule(binding)).status, 'unchanged');
  assert.equal(calls, 1);
  assert.equal(store.read('story').batches.length, 1);
});

// ---- reliability item: a restart must not pay for another state simulation ------
test('a restarted state controller skips a turn its snapshot already covers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'restart-state-'));
  const stateStore = new StateStore(root);
  const timeline = [{id: 'm1', role: 'user', text: '三天后，雨停了。', token: 'u1'},
    {id: 'm2', role: 'assistant', text: '她把伞放下。', token: 'a1'}];
  let calls = 0;
  const fresh = () => new StateController({
    readTimeline: async () => structuredClone(timeline),
    runLogged: async () => { calls++; return validateSimulation({affect: {description: '心里发涩'}}, {timeline}); },
    submit: (b, _revision, sim) => stateStore.commit(b.storyId, timeline, b.character, sim),
    isCurrent: (b, tl) => activeSnapshot(stateStore.read(b.storyId), tl, b.character)?.prefix.length === tl.length,
  });
  const binding = {storyId: 'eleckoi:chat', dataRoot: root, character: '琉璃'};
  assert.equal((await fresh().schedule(binding)).status, 'committed');
  assert.equal(calls, 1);
  assert.equal((await fresh().schedule(binding)).status, 'unchanged');
  assert.equal(calls, 1);
  assert.equal(stateStore.read(binding.storyId).snapshots.length, 1);
});

test('the durable marker is scope-scoped and never leaks between stories', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scope-extract-'));
  const store = new FileStore(root);
  const timeline = [{id: '1', role: 'user', text: '门开了', token: digest('a')}];
  store.submit('eleckoi:one', timeline, []);
  assert.equal(observedPrefix(store.read('eleckoi:one'), timeline), true);
  assert.equal(observedPrefix(store.read('eleckoi:two'), timeline), false);
});

// ---- reliability item: a disposed runtime session is a named failure ------------
test('a vanished runtime session fails closed with a named error, not a TypeError', async () => {
  const reported = [];
  let calls = 0, commits = 0;
  const control = new ExtractionController({
    // Mirrors index.mjs timelineFor(), which throws this instead of reading undefined.
    readTimeline: async () => { throw Error('Runtime session is no longer available; maintenance skipped'); },
    runLogged: async () => { calls++; return []; },
    submit: () => { commits++; return {ok: true}; },
    onError: error => reported.push(error.message),
  });
  await assert.rejects(control.schedule({storyId: 'gone', dataRoot: '/tmp/unused', character: 'A'}),
    /Runtime session is no longer available/);
  assert.equal(calls, 0, 'no model call when the timeline cannot be read');
  assert.equal(commits, 0);
  assert.equal(reported.length, 1);
  assert.doesNotMatch(reported[0], /undefined|Cannot read/);
});


// ---- reliability item: the binding may change while an auxiliary call runs ------
// A commit is only allowed against the chat the plugin still owns. The observable
// contract is the throw, so it is asserted for every field that can change.
const bound = {conversationId: 'chat', dataRoot: 'C:/ledger'};
const live = {enabled: true, automaticExtraction: true, stateSimulation: true, conversationId: 'chat', dataRoot: 'C:/ledger'};

test('an unchanged configuration commits', () => {
  assert.equal(configStillApplies(live, bound, {automatic: 'automaticExtraction',
    failure: 'Configuration changed during extraction'}), true);
});

test('a rebind, a moved data root or a switched-off plugin refuses the commit', () => {
  const cases = [
    [{...live, conversationId: 'other-chat'}, 'extraction'],
    [{...live, dataRoot: 'C:/elsewhere'}, 'extraction'],
    [{...live, enabled: false}, 'extraction'],
    [{...live, automaticExtraction: false}, 'extraction'],
    [{...live, conversationId: 'other-chat'}, 'state'],
    [{...live, dataRoot: 'C:/elsewhere'}, 'state'],
    [{...live, enabled: false}, 'state'],
    [{...live, stateSimulation: false}, 'state'],
  ];
  for (const [current, mode] of cases) {
    const failure = mode === 'extraction'
      ? 'Configuration changed during extraction'
      : 'Configuration changed during state maintenance';
    assert.throws(() => configStillApplies(current, bound,
      {automatic: mode === 'extraction' ? 'automaticExtraction' : 'stateSimulation', failure}),
      (error) => error.message === failure && failureCategory(error) === 'race',
      `${mode} should refuse and classify as race: ${JSON.stringify(current)}`);
  }
});

test('the state guard does not treat an unrelated extraction switch as a rebind', () => {
  // Turning automatic extraction off must not invalidate a state commit: the two
  // switches guard different transactions.
  assert.equal(configStillApplies({...live, automaticExtraction: false}, bound,
    {automatic: 'stateSimulation', failure: 'Configuration changed during state maintenance'}), true);
});
