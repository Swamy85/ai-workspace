const config = require('./config');
const { connect } = require('./db');
const { createApp } = require('./app');

async function main() {
  const store = await connect(config);
  const app = await createApp(store);
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
