const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const COLLECTIONS = ['chats', 'files', 'prompts', 'memories'];

module.exports = function createMemoryStore(file) {
  let data = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));

  try {
    if (file && fs.existsSync(file)) {
      data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
  } catch (err) {
    console.warn('[db] Could not read data file, starting empty:', err.message);
  }

  let timer = null;
  const persist = () => {
    if (!file) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFile(file, JSON.stringify(data), () => {});
      } catch (err) {
        console.warn('[db] Persist failed:', err.message);
      }
    }, 250);
  };

  const clone = (x) => JSON.parse(JSON.stringify(x));

  function collection(name) {
    return {
      async list() {
        return clone(data[name]).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      },
      async get(id) {
        const d = data[name].find((x) => x.id === id);
        return d ? clone(d) : null;
      },
      async create(doc) {
        const now = new Date().toISOString();
        const d = { id: randomUUID(), createdAt: now, updatedAt: now, ...doc };
        data[name].push(d);
        persist();
        return clone(d);
      },
      async update(id, patch) {
        const d = data[name].find((x) => x.id === id);
        if (!d) return null;
        Object.assign(d, clone(patch), { updatedAt: new Date().toISOString() });
        persist();
        return clone(d);
      },
      async remove(id) {
        const i = data[name].findIndex((x) => x.id === id);
        if (i < 0) return false;
        data[name].splice(i, 1);
        persist();
        return true;
      },
      async clear() {
        data[name] = [];
        persist();
      },
    };
  }

  const chats = collection('chats');
  chats.search = async (q) => {
    const needle = String(q).toLowerCase();
    return (await chats.list()).filter(
      (c) =>
        (c.title || '').toLowerCase().includes(needle) ||
        (c.messages || []).some((m) => (m.content || '').toLowerCase().includes(needle))
    );
  };

  return {
    kind: 'file',
    chats,
    files: collection('files'),
    prompts: collection('prompts'),
    memories: collection('memories'),
    async close() {
      clearTimeout(timer);
      if (file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data));
      }
    },
  };
};
