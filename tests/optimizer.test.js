import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createOptimizer } from '../server/optimizer.js';
import { fingerprint } from '../server/gateway.js';

async function fixture() {
  const buffer = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#22886c' } }).png().toBuffer();
  return { sessionId: 'test', prompt: 'Summarize the image', history: [], preserveDetail: false, files: [{ name: 'image.png', kind: 'image', hash: fingerprint(buffer), buffer }] };
}

test('image optimization reduces dimensions and restores original evidence', async () => {
  const optimize = createOptimizer();
  const input = await fixture();
  const result = await optimize(input);
  assert.equal(result.evidence[0].width, 1024);
  assert.ok(result.inputTokens < result.originalInputTokens);
  const restored = await result.restore();
  assert.equal(restored.evidence[0].width, 2400);
  assert.equal(restored.inputTokens, restored.originalInputTokens);
  assert.equal((await optimize(input)).evidence[0].artifactHit, true);
});

test('detail-sensitive questions retain original resolution', async () => {
  const input = await fixture();
  const result = await createOptimizer()({ ...input, prompt: 'Read the exact text' });
  assert.equal(result.evidence[0].width, 2400);
  assert.equal(result.restore, null);
});

test('text attachments retain all content', async () => {
  const buffer = Buffer.from('Do not remove this.\nDo not remove this.');
  const result = await createOptimizer()({ sessionId: 'test', prompt: 'Summarize', history: [], files: [{ name: 'notes.txt', kind: 'text', hash: fingerprint(buffer), buffer }] });
  assert.ok(result.text.includes(buffer.toString()));
  assert.deepEqual(result.modalities, ['text']);
});