import test from 'node:test';import assert from 'node:assert/strict';
import {failureCategory} from './index.mjs';

// The diagnostic file may only carry category codes, never messages or content.
test('auxiliary failures are classified into stable codes', () => {
  const cases = [
    ['State input exceeds budget; no model request made', 'budget'],
    ['Extraction input exceeds budget; no model request made', 'budget'],
    ['No resolved RP provider/model available', 'model'],
    // A dropped request produced zero assistant messages; that is a model/transport
    // failure, not a malformed-output failure.
    ['Auxiliary state request returned no final message; transport or model failure', 'model'],
    ['Auxiliary extraction request returned no final message; transport or model failure', 'model'],
    ['Connection error.', 'model'],
    ['Record id already committed', 'duplicate'],
    ['Story time evidence already observed; cannot advance again', 'duplicate'],
    ['Timeline changed before commit', 'race'],
    ['Configuration changed during extraction', 'race'],
    ['Runtime session is no longer available; maintenance skipped', 'race'],
    ['Unexpected end of JSON input', 'output'],
    ['State output is not an object', 'output'],
    ['Extractor proposal exceeds transaction limit', 'output'],
    ['Unsupported state field: updatedAt', 'validation'],
    ['Invalid storyTime', 'validation'],
    ['Story time evidence is not literal', 'validation'],
    ['Evidence not present in active source', 'validation'],
    ['Closed thread requires an explicit changed record before reopening', 'validation'],
  ];
  for (const [message, expected] of cases){
    assert.equal(failureCategory(Error(message)), expected, message);
  }
});

test('an unknown failure degrades to a generic code rather than leaking text', () => {
  assert.equal(failureCategory(Error('something odd happened')), 'other');
  assert.equal(failureCategory(undefined), 'other');
  assert.doesNotMatch(failureCategory(Error('private chat text here')), /private/);
});
