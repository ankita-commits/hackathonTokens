import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { MODELS, SYSTEM_PROMPT, estimateTextTokens, estimateCost, route } from './routing.js';
import { demoProvider } from './provider.js';

export function fingerprint(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
}

export function prepareText(request) {
  const history = request.history.map((message) => `${message.role}: ${message.content}`).join('\n');
  const text = [SYSTEM_PROMPT, history, request.prompt].filter(Boolean).join('\n\n');
  const breakdown = {
    system: estimateTextTokens(SYSTEM_PROMPT),
    history: estimateTextTokens(history),
    prompt: estimateTextTokens(request.prompt),
    media: 0,
  };
  const inputTokens = Object.values(breakdown).reduce((total, tokens) => total + tokens, 0);
  return { text, inputTokens, originalInputTokens: inputTokens, breakdown, modalities: ['text'], evidence: [], assets: [], restore: null };
}

export function createGateway({ optimize = async (request) => prepareText(request), provider = demoProvider, ttlMs = 600000, maxEntries = 100 } = {}) {
  const cache = new Map();
  return {
    clear(sessionId) {
      for (const [key, entry] of cache) if (entry.sessionId === sessionId) cache.delete(key);
    },
    async run(request) {
      const started = performance.now();
      const events = [];
      const emit = (stage, detail) => events.push({ stage, detail });
      emit('Analyze', `${request.files.length} attachment(s); privacy scope: local demo session.`);
      const key = fingerprint({ version: 1, session: request.sessionId, prompt: request.prompt, history: request.history, files: request.files.map((file) => ({ hash: file.hash, name: file.name, kind: file.kind })), video: request.video, scenario: request.scenario, preserveDetail: request.preserveDetail });
      const cached = cache.get(key);
      if (cached && cached.expires > Date.now()) {
        emit('Exact cache', 'Hit: identical request, history, files, and settings. No inference.');
        return { ...cached.result, id: randomUUID(), cache: 'hit', attempts: [], inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, savings: cached.result.baselineCost, events, latencyMs: Math.round(performance.now() - started) };
      }
      cache.delete(key);
      emit('Exact cache', 'Miss');
      let payload = await optimize(request);
      emit('Optimize files', request.files.length ? `${payload.evidence.length} evidence record(s) prepared before routing.` : 'Bypassed: text-only request.');
      emit('Optimize context', 'Prompt, system instructions, and history preserved without lossy compression.');
      emit('Semantic cache', 'Disabled: exact evidence matching only in this MVP.');
      emit('Estimate', `${payload.inputTokens} estimated input units; reserve 1,024 output units.`);
      let decision = route(payload, request);
      emit('Route', `${decision.model.id}: ${decision.reason}`);
      const attempts = [];
      const originalInputTokens = payload.originalInputTokens;
      let result;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        result = await provider({ model: decision.model, request, payload });
        const outputTokens = estimateTextTokens(result.answer);
        attempts.push({ model: decision.model.id, inputTokens: payload.inputTokens, outputTokens, cost: estimateCost(decision.model, payload.inputTokens, outputTokens), valid: result.valid });
        emit('Validate', result.note);
        if (result.valid) break;
        if (attempt === 1) break;
        if (payload.restore) payload = await payload.restore();
        emit('Restore evidence', 'Original evidence restored before retry eligibility is checked.');
        const large = MODELS.find((model) => model.id === 'demo-large');
        if (payload.inputTokens + 1024 > large.context || !payload.modalities.every((modality) => large.modalities.includes(modality))) throw new Error('Restored input exceeds retry model limits.');
        decision = { model: large, reason: 'Retry after failed demo completeness check.' };
        emit('Re-route', decision.reason);
      }
      const cost = attempts.reduce((total, attempt) => total + attempt.cost, 0);
      const inputTokens = attempts.reduce((total, attempt) => total + attempt.inputTokens, 0);
      const outputTokens = attempts.reduce((total, attempt) => total + attempt.outputTokens, 0);
      const baselineCost = estimateCost(MODELS[1], originalInputTokens, attempts.at(-1).outputTokens);
      const response = {
        id: randomUUID(), answer: result.valid ? result.answer : 'The demo quality checks failed after two attempts. No validated answer is available.',
        model: decision.model.id, cache: 'miss', measurement: 'simulated', quality: 'Not evaluated (demo)',
        inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, cost, baselineCost, savings: baselineCost - cost,
        originalInputTokens, optimizedInputTokens: payload.inputTokens, breakdown: payload.breakdown,
        evidence: payload.evidence, attempts, events, latencyMs: Math.round(performance.now() - started),
      };
      if (result.valid) {
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
        cache.set(key, { sessionId: request.sessionId, expires: Date.now() + ttlMs, result: response });
      }
      return response;
    },
  };
}