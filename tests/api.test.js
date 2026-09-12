import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';

test('HTTP API validates requests and serves cache hits', async (context) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = { sessionId: randomUUID(), prompt: 'Explain tokens' };
  const send = (input) => {
    const form = new FormData();
    form.append('request', JSON.stringify(input));
    return fetch(`${url}/api/chat`, { method: 'POST', body: form });
  };
  assert.equal((await send({})).status, 400);
  const first = await (await send(request)).json();
  assert.equal(first.cache, 'miss');
  assert.equal(first.measurement, 'simulated');
  assert.equal((await (await send(request)).json()).cache, 'hit');
  await fetch(`${url}/api/cache/${request.sessionId}`, { method: 'DELETE' });
  assert.equal((await (await send(request)).json()).cache, 'miss');
});