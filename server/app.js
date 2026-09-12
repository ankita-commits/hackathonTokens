import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createGateway, fingerprint } from './gateway.js';
import { createOptimizer } from './optimizer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = z.object({
  sessionId: z.string().uuid(),
  prompt: z.string().min(1).max(12000).refine((value) => value.trim().length > 0),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(16000) })).max(40).default([]),
  scenario: z.enum(['normal', 'recovery']).default('normal'),
  preserveDetail: z.boolean().default(false),
  video: z.object({ name: z.string().max(250), duration: z.number().positive().max(120), hash: z.string().regex(/^[a-f0-9]{64}$/), originalBytes: z.number().int().positive().max(52428800), timestamps: z.array(z.number().nonnegative()).min(1).max(6) }).nullable().default(null),
});

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  const gateway = createGateway({ optimize: createOptimizer() });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 6, fields: 1, fieldSize: 700000 } });
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
    if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: 'demo', liveProvider: false }));
  app.post('/api/chat', upload.array('files', 6), async (req, res, next) => {
    try {
      let parsed;
      try { parsed = JSON.parse(req.body.request); } catch { return res.status(400).json({ error: 'Invalid request JSON.' }); }
      const validation = schema.safeParse(parsed);
      if (!validation.success) return res.status(400).json({ error: 'Invalid request. Check prompt, session, history, and media limits.' });
      const request = validation.data;
      const files = (req.files ?? []).map((file) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const kind = ['.txt', '.md'].includes(extension) ? 'text' : 'image';
        if (kind === 'text' && (file.size > 200000 || file.buffer.includes(0))) throw new Error('Text attachments must be UTF-8 files below 200 KB.');
        if (kind === 'image' && !['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('Supported uploads: TXT, MD, JPEG, PNG, and WebP. Video is sampled locally in the browser.');
        return { name: file.originalname, kind, hash: fingerprint(file.buffer), buffer: file.buffer };
      });
      if (files.reduce((total, file) => total + file.buffer.length, 0) > 24 * 1024 * 1024) throw new Error('Total uploaded attachments must be below 24 MB.');
      if (request.video && (request.video.timestamps.length !== files.length || files.some((file) => file.kind !== 'image') || request.video.timestamps.some((time) => time > request.video.duration))) throw new Error('Video frame metadata does not match the sampled images.');
      const result = await gateway.run({ ...request, files });
      res.json({ ...result, video: request.video, costScope: 'Illustrative inference cost only. Local processing and storage are not priced.', baselineScope: request.video ? 'Original submitted frames on Demo Large, not the full video.' : 'Original submitted payload on Demo Large with the same scripted output length.' });
    } catch (error) { next(error); }
  });
  app.delete('/api/cache/:sessionId', (req, res) => {
    if (!z.string().uuid().safeParse(req.params.sessionId).success) return res.status(400).json({ error: 'Invalid session.' });
    gateway.clear(req.params.sessionId);
    res.json({ cleared: true });
  });
  app.get('/vendor/lucide.js', (_req, res) => res.sendFile(path.join(root, 'node_modules/lucide/dist/umd/lucide.js')));
  app.use('/fonts/plex', express.static(path.join(root, 'node_modules/@fontsource/ibm-plex-sans/files')));
  app.use('/fonts/space', express.static(path.join(root, 'node_modules/@fontsource/space-grotesk/files')));
  app.use(express.static(path.join(root, 'public')));
  app.use((error, _req, res, _next) => {
    res.status(error instanceof multer.MulterError || error instanceof Error ? 400 : 500).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Each uploaded frame or image must be under 8 MB.' : error.message || 'Unable to process this request.' });
  });
  return app;
}