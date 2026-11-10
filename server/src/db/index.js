/**
 * Store factory. Uses MongoDB when MONGODB_URI is set and reachable,
 * otherwise falls back to a JSON-file backed in-memory store so the app
 * runs with zero setup. Both stores expose the same async interface:
 *
 *   store.{chats,files,prompts,memories}.{list,get,create,update,remove}
 *   store.chats.search(q)
 */
async function connect(config) {
  if (config.mongoUri) {
    try {
      const store = await require('./mongoStore')(config.mongoUri);
      console.log('[db] Connected to MongoDB');
      return store;
    } catch (err) {
      console.warn(`[db] MongoDB unavailable (${err.message}). Falling back to file store.`);
    }
  }
  const store = require('./memoryStore')(config.dataFile);
  console.log(`[db] Using file store${config.dataFile ? ` (${config.dataFile})` : ''}`);
  return store;
}

module.exports = { connect };
