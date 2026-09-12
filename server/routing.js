export const MODELS = [
  { id: 'demo-small', inputRate: 0.15, outputRate: 0.6, context: 16000, modalities: ['text'] },
  { id: 'demo-large', inputRate: 2.5, outputRate: 10, context: 128000, modalities: ['text', 'image'] },
];

export const SYSTEM_PROMPT = 'Answer the current question using the supplied evidence. Preserve constraints. State uncertainty when evidence is insufficient.';

export function estimateTextTokens(text) {
  return text ? Math.ceil(text.length / 4) : 0;
}

export function estimateCost(model, input, output) {
  return (input * model.inputRate + output * model.outputRate) / 1_000_000;
}

export function route(payload, request) {
  const complex = /\b(prove|diagnos\w*|legal|medical|security audit|comprehensive)\b/i.test(request.prompt);
  const candidates = MODELS.filter((model) =>
    payload.modalities.every((modality) => model.modalities.includes(modality)) &&
    payload.inputTokens + 1024 <= model.context &&
    (!complex || model.id === 'demo-large'));
  if (!candidates.length) throw new Error('No demo model fits this payload. Reduce the input size.');
  const model = candidates.sort((first, second) =>
    estimateCost(first, payload.inputTokens, 1024) - estimateCost(second, payload.inputTokens, 1024))[0];
  return { model, reason: complex ? 'Complexity/risk rule requires the larger model.' : payload.modalities.includes('image') ? 'Image payload requires a vision-capable model.' : 'Text payload fits the lower-cost model.' };
}