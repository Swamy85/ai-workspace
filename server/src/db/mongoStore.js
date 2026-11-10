const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = async function createMongoStore(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });

  const schemaOpts = { versionKey: false, strict: false };
  const base = { id: { type: String, unique: true, index: true }, createdAt: String, updatedAt: String };
  const Mixed = mongoose.Schema.Types.Mixed;

  const Chat = mongoose.model(
    'Chat',
    new mongoose.Schema(
      {
        ...base,
        title: String,
        systemPrompt: String,
        modelId: String,
        pinned: Boolean,
        fileIds: [String],
        messages: [Mixed],
      },
      schemaOpts
    )
  );
  const File = mongoose.model(
    'File',
    new mongoose.Schema({ ...base, name: String, mimeType: String, size: Number, text: String }, schemaOpts)
  );
  const Prompt = mongoose.model(
    'Prompt',
    new mongoose.Schema({ ...base, title: String, category: String, content: String, builtin: Boolean }, schemaOpts)
  );
  const Memory = mongoose.model(
    'Memory',
    new mongoose.Schema({ ...base, text: String, enabled: Boolean }, schemaOpts)
  );

  const clean = (d) => {
    if (!d) return null;
    const { _id, ...rest } = d;
    return rest;
  };

  function collection(Model) {
    return {
      async list() {
        return (await Model.find().sort({ updatedAt: -1 }).lean()).map(clean);
      },
      async get(id) {
        return clean(await Model.findOne({ id }).lean());
      },
      async create(doc) {
        const now = new Date().toISOString();
        const d = { id: randomUUID(), createdAt: now, updatedAt: now, ...doc };
        await Model.create(d);
        return d;
      },
      async update(id, patch) {
        const { id: _ignore, ...rest } = patch;
        return clean(
          await Model.findOneAndUpdate({ id }, { ...rest, updatedAt: new Date().toISOString() }, { new: true }).lean()
        );
      },
      async remove(id) {
        return (await Model.deleteOne({ id })).deletedCount > 0;
      },
      async clear() {
        await Model.deleteMany({});
      },
    };
  }

  const chats = collection(Chat);
  chats.search = async (q) => {
    const rx = new RegExp(escapeRegex(q), 'i');
    const found = await Chat.find({ $or: [{ title: rx }, { 'messages.content': rx }] })
      .sort({ updatedAt: -1 })
      .lean();
    return found.map(clean);
  };

  return {
    kind: 'mongo',
    chats,
    files: collection(File),
    prompts: collection(Prompt),
    memories: collection(Memory),
    async close() {
      await mongoose.disconnect();
    },
  };
};
