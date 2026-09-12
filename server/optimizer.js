import sharp from 'sharp';
import { fingerprint, prepareText } from './gateway.js';
import { estimateTextTokens } from './routing.js';

export function estimateImageUnits(width, height) {
  return 85 + 170 * Math.ceil(width / 512) * Math.ceil(height / 512);
}

export function createOptimizer({ maxArtifacts = 32 } = {}) {
  const artifacts = new Map();
  return async function optimize(request) {
    const base = prepareText(request);
    const evidence = [];
    const assets = [];
    const seen = new Set();
    const preserve = request.preserveDetail || /\b(read|transcribe|exact|chart|document|serial|invoice|ocr|small text)\b/i.test(request.prompt);
    let originalMedia = 0;
    let optimizedMedia = 0;
    let originalText = 0;
    let optimizedText = 0;
    let attachmentText = '';

    for (const file of request.files) {
      if (file.kind === 'text') {
        const content = file.buffer.toString('utf8');
        const text = `\n\nAttachment ${file.name}:\n${content}`;
        const units = estimateTextTokens(text);
        originalText += units;
        optimizedText += units;
        attachmentText += text;
        evidence.push({ name: file.name, type: 'text', originalBytes: file.buffer.length, optimizedBytes: file.buffer.length, originalUnits: units, optimizedUnits: units, action: 'Preserved verbatim', originalHash: file.hash, retained: 'Entire text file', omitted: 'Nothing' });
        continue;
      }
      const key = fingerprint({ session: request.sessionId, hash: file.hash, preserve, version: 1 });
      let artifact = artifacts.get(key);
      const artifactHit = Boolean(artifact && artifact.expires > Date.now());
      if (!artifactHit) {
        const image = sharp(file.buffer, { limitInputPixels: 24000000, animated: false });
        const metadata = await image.metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.pages > 1) throw new Error('Only still JPEG, PNG, and WebP images are supported.');
        const oriented = await image.rotate().toBuffer({ resolveWithObject: true });
        const derivative = preserve
          ? oriented
          : await sharp(oriented.data).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
        const thumbnail = await sharp(derivative.data).resize({ width: 200, height: 140, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
        artifact = {
          originalWidth: oriented.info.width, originalHeight: oriented.info.height,
          width: derivative.info.width, height: derivative.info.height, buffer: derivative.data,
          preview: `data:image/jpeg;base64,${thumbnail.toString('base64')}`, expires: Date.now() + 600000,
        };
        if (artifacts.size >= maxArtifacts) artifacts.delete(artifacts.keys().next().value);
        artifacts.set(key, artifact);
      }
      const duplicate = seen.has(file.hash);
      seen.add(file.hash);
      const originalUnits = estimateImageUnits(artifact.originalWidth, artifact.originalHeight);
      const optimizedUnits = duplicate ? 0 : estimateImageUnits(artifact.width, artifact.height);
      originalMedia += originalUnits;
      optimizedMedia += optimizedUnits;
      if (!duplicate) assets.push({ hash: file.hash, buffer: artifact.buffer, width: artifact.width, height: artifact.height });
      evidence.push({
        name: file.name, type: 'image', originalHash: file.hash, preview: artifact.preview,
        originalBytes: file.buffer.length, optimizedBytes: duplicate ? 0 : artifact.buffer.length,
        originalWidth: artifact.originalWidth, originalHeight: artifact.originalHeight,
        width: artifact.width, height: artifact.height, originalUnits, optimizedUnits, artifactHit,
        action: duplicate ? 'Identical image reused' : preserve ? 'Full detail preserved' : 'Summary-resolution image',
        retained: 'Full image area; original retained for this request',
        omitted: preserve ? 'Nothing' : 'Fine detail may be lost; not quality-validated',
      });
    }
    return {
      ...base, text: base.text + attachmentText,
      inputTokens: base.inputTokens + optimizedText + optimizedMedia,
      originalInputTokens: base.inputTokens + originalText + originalMedia,
      breakdown: { ...base.breakdown, attachments: optimizedText, media: optimizedMedia },
      modalities: assets.length ? ['text', 'image'] : ['text'], evidence, assets,
      restore: preserve ? null : () => optimize({ ...request, preserveDetail: true }),
    };
  };
}