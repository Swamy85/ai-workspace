const serverless = require('serverless-http');
const config = require('../../server/src/config');
const { connect } = require('../../server/src/db');
const { createApp } = require('../../server/src/app');

let handlerPromise = null;

/** Reuse the Express app + database connection across warm invocations. */
async function getHandler() {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const store = await connect(config);
      const app = await createApp(store);
      return serverless(app);
    })().catch((err) => {
      handlerPromise = null;
      throw err;
    });
  }
  return handlerPromise;
}

exports.handler = async (event, context) => {
  // /api/* is redirected to /.netlify/functions/api/:splat. Restore the
  // original /api prefix so the existing Express routes match.
  const marker = '/.netlify/functions/api';
  const path = event.path || '';
  if (path.startsWith(marker)) event.path = '/api' + path.slice(marker.length);

  if (typeof event.rawUrl === 'string') {
    try {
      const url = new URL(event.rawUrl);
      if (url.pathname.startsWith(marker)) {
        url.pathname = '/api' + url.pathname.slice(marker.length);
        event.rawUrl = url.toString();
      }
    } catch {
      /* ignore malformed rawUrl */
    }
  }

  const handler = await getHandler();
  return handler(event, context);
};
