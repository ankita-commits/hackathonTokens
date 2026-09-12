export async function demoProvider({ model, request, payload }) {
  if (request.scenario === 'recovery' && model.id === 'demo-small') {
    return { answer: '', valid: false, note: 'Deliberately failed demo completeness check.' };
  }
  let answer;
  if (payload.modalities.includes('image')) {
    answer = 'Your media was prepared before model routing. The optimized payload requires a vision-capable model, so this demo selected Demo Large.\n\nThis is a scripted response, not an interpretation of your image or video. File transformations and dimensions are real; inference usage and prices are simulated. A live vision provider is needed to answer questions about the content.';
  } else if (request.scenario === 'recovery') {
    answer = 'Exact response caching reuses an answer only when the request and relevant context match. Provider prompt caching reuses processing of an input prefix and may discount that input; it still generates a new answer.\n\nIn this scripted recovery example, the small-model completeness check failed. The gateway restored the original payload, rechecked eligibility, and retried with Demo Large. Both attempts appear in the ledger.';
  } else if (/cach/i.test(request.prompt)) {
    answer = 'An application response cache can return a previous answer without another model call. A safe key includes the exact prompt, relevant conversation history, attached content hashes, session scope, and configuration version.\n\nPrompt caching is different: a provider may discount repeated input prefixes, but output generation still costs money. Reusing file-processing artifacts can also avoid repeated OCR or image preparation.\n\nThis is a prepared demo answer; no model was called.';
  } else if (/token/i.test(request.prompt)) {
    answer = 'Tokens are the units a model processes, often words or parts of words. Input includes system instructions, your prompt, conversation history, and any media representation. Output tokens make up the generated response.\n\nCost depends on the model and its billing rules. A smaller model can lower cost without using fewer tokens; an exact response-cache hit can avoid a new inference call entirely.\n\nThis is a prepared demo answer; no model was called.';
  } else {
    answer = 'Demo mode has processed your request through the optimization and routing pipeline. No live language model is connected, so this is a placeholder rather than an answer to your question.\n\nTry the token, caching, and recovery examples to explore the pipeline. Your team can replace server/provider.js with a live provider while preserving the usage contract.';
  }
  return { answer, valid: true, note: 'Demo structural check only; factual accuracy was not evaluated.' };
}