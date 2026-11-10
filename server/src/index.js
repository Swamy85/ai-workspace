const express = require('express');
const cors = require('cors');
const config = require('./config');
const { connect } = require('./db');
const { listModels, defaultModelId } = require('./providers');
const { wrap } = require('./utils');

async function main() {
  const store = await connect(config);
  const app = express();

  app.use(cors({ origin: config.clientOrigins.includes('*') ? true : config.clientOrigins, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, store: store.kind, time: new Date().toISOString() }));

  app.get(
    '/api/models',
    wrap(async (req, res) => {
      res.json({ models: await listModels(), defaultModelId: await defaultModelId() });
    })
  );

  const prompts = require('./routes/prompts')(store);
  await prompts.seed();

  app.use('/api/chats', require('./routes/chats')(store));
  app.use('/api/files', require('./routes/files')(store));
  app.use('/api/prompts', prompts);
  app.use('/api/memory', require('./routes/memory')(store));

  app.use('/api', (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error(err);
    if (res.headersSent) return res.end();
    const message = err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${config.limits.maxFileBytes / 1048576} MB)` : err.message;
    res.status(status).json({ error: message || 'Server error' });
  });

  const server = app.listen(config.port, () => {
    console.log(`[api] AI Workspace API listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    server.close();
    await store.close?.();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
