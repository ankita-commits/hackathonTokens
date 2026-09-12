import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway, prepareText } from '../server/gateway.js';

const request = (overrides = {}) => ({ sessionId: 'test-session', prompt: 'Explain tokens', history: [], files: [], scenario: 'normal', preserveDetail: false, ...overrides });

test('exact cache avoids inference and isolates history, files, and sessions', async () => {
  const gateway = createGateway();
  const first = await gateway.run(request());
  const hit = await gateway.run(request());
  assert.equal(first.cache, 'miss');
  assert.equal(hit.cache, 'hit');
  assert.equal(hit.totalTokens, 0);
  assert.equal(hit.cost, 0);
  assert.deepEqual(hit.attempts, []);
  assert.equal((await gateway.run(request({ sessionId: 'other' }))).cache, 'miss');
  assert.equal((await gateway.run(request({ history: [{ role: 'user', content: 'earlier' }] }))).cache, 'miss');
  assert.equal((await gateway.run(request({ files: [{ hash: 'new-file' }] }))).cache, 'miss');
  assert.equal((await gateway.run(request({ prompt: 'Different question' }))).cache, 'miss');
});

test('routing uses optimized size and modality', async () => {
  const gateway = createGateway({ optimize: async (input) => ({ ...prepareText(input), inputTokens: 100, originalInputTokens: 30000, modalities: ['image'] }) });
  const response = await gateway.run(request());
  assert.equal(response.model, 'demo-large');
  assert.equal(response.attempts[0].inputTokens, 100);
  assert.ok(response.events.findIndex((event) => event.stage === 'Optimize files') < response.events.findIndex((event) => event.stage === 'Route'));
});

test('recovery restores evidence and accounts for both attempts', async () => {
  let restored = false;
  const gateway = createGateway({ optimize: async (input) => ({ ...prepareText(input), inputTokens: 10, restore: async () => { restored = true; return prepareText(input); } }) });
  const response = await gateway.run(request({ scenario: 'recovery' }));
  assert.equal(restored, true);
  assert.equal(response.attempts.length, 2);
  assert.equal(response.model, 'demo-large');
  assert.equal(response.cost, response.attempts.reduce((total, attempt) => total + attempt.cost, 0));
});

test('no eligible model produces an explicit error', async () => {
  const gateway = createGateway({ optimize: async (input) => ({ ...prepareText(input), inputTokens: 130000 }) });
  await assert.rejects(gateway.run(request()), /No demo model/);
});

test('failed responses are not cached and attempts are bounded', async () => {
  const gateway = createGateway({ provider: async () => ({ answer: '', valid: false, note: 'Failure' }) });
  assert.equal((await gateway.run(request())).attempts.length, 2);
  assert.equal((await gateway.run(request())).cache, 'miss');
});