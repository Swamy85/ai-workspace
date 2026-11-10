const express = require('express');
const { wrap, HttpError, slugify } = require('../utils');
const { estimateTokens } = require('../services/tokens');
const { defaultModelId } = require('../providers');
const streamHandler = require('./stream');

const summarize = (c) => ({
  id: c.id,
  title: c.title,
  modelId: c.modelId,
  pinned: !!c.pinned,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  messageCount: (c.messages || []).length,
});

const fileMeta = (f) => ({
  id: f.id,
  name: f.name,
  mimeType: f.mimeType,
  size: f.size,
  chars: (f.text || '').length,
  tokens: estimateTokens(f.text || ''),
});

function toMarkdown(chat) {
  const lines = [`# ${chat.title || 'Chat'}`, '', `_Exported ${new Date().toISOString()} · Model: ${chat.modelId || 'n/a'}_`, ''];
  if ((chat.systemPrompt || '').trim()) {
    lines.push(`> **System instructions:** ${chat.systemPrompt.trim().replace(/\n/g, '\n> ')}`, '');
  }
  for (const m of chat.messages || []) {
    lines.push(`## ${m.role === 'user' ? 'You' : 'Assistant'}`, '');
    if (m.attachments?.length) lines.push(`_Attachments: ${m.attachments.map((a) => a.name).join(', ')}_`, '');
    lines.push(m.content, '');
  }
  return lines.join('\n');
}

function sendDownload(res, { filename, mime, body }) {
  res.setHeader('Content-Type', `${mime}; charset=utf-8`);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

module.exports = (store) => {
  const router = express.Router();

  // List / search
  router.get(
    '/',
    wrap(async (req, res) => {
      const q = String(req.query.q || '').trim();
      const chats = q ? await store.chats.search(q) : await store.chats.list();
      res.json(chats.map(summarize));
    })
  );

  // Create
  router.post(
    '/',
    wrap(async (req, res) => {
      const { title, systemPrompt, modelId } = req.body || {};
      const chat = await store.chats.create({
        title: String(title || 'New chat').slice(0, 120),
        systemPrompt: String(systemPrompt || ''),
        modelId: modelId || (await defaultModelId()),
        pinned: false,
        fileIds: [],
        messages: [],
      });
      res.status(201).json({ ...chat, files: [] });
    })
  );

  // Clear everything
  router.delete(
    '/',
    wrap(async (req, res) => {
      await store.chats.clear();
      await store.files.clear();
      res.json({ ok: true });
    })
  );

  // Export all (must be declared before /:id)
  router.get(
    '/export',
    wrap(async (req, res) => {
      const format = req.query.format === 'md' ? 'md' : 'json';
      const chats = await store.chats.list();
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'json') {
        return sendDownload(res, {
          filename: `ai-workspace-chats-${stamp}.json`,
          mime: 'application/json',
          body: JSON.stringify({ exportedAt: new Date().toISOString(), chats }, null, 2),
        });
      }
      sendDownload(res, {
        filename: `ai-workspace-chats-${stamp}.md`,
        mime: 'text/markdown',
        body: chats.map(toMarkdown).join('\n\n---\n\n'),
      });
    })
  );

  // Read one
  router.get(
    '/:id',
    wrap(async (req, res) => {
      const chat = await store.chats.get(req.params.id);
      if (!chat) throw new HttpError(404, 'Chat not found');
      const files = (await Promise.all((chat.fileIds || []).map((id) => store.files.get(id)))).filter(Boolean);
      res.json({ ...chat, files: files.map(fileMeta) });
    })
  );

  // Update settings
  router.patch(
    '/:id',
    wrap(async (req, res) => {
      const { title, systemPrompt, modelId, pinned } = req.body || {};
      const patch = {};
      if (typeof title === 'string') patch.title = title.trim().slice(0, 120) || 'New chat';
      if (typeof systemPrompt === 'string') patch.systemPrompt = systemPrompt.slice(0, 20000);
      if (typeof modelId === 'string') patch.modelId = modelId;
      if (typeof pinned === 'boolean') patch.pinned = pinned;
      const chat = await store.chats.update(req.params.id, patch);
      if (!chat) throw new HttpError(404, 'Chat not found');
      res.json(summarize(chat));
    })
  );

  // Delete (and its attached files)
  router.delete(
    '/:id',
    wrap(async (req, res) => {
      const chat = await store.chats.get(req.params.id);
      if (!chat) throw new HttpError(404, 'Chat not found');
      await Promise.all((chat.fileIds || []).map((id) => store.files.remove(id)));
      await store.chats.remove(chat.id);
      res.json({ ok: true });
    })
  );

  // Detach + delete a file
  router.delete(
    '/:id/files/:fileId',
    wrap(async (req, res) => {
      const chat = await store.chats.get(req.params.id);
      if (!chat) throw new HttpError(404, 'Chat not found');
      await store.chats.update(chat.id, { fileIds: (chat.fileIds || []).filter((f) => f !== req.params.fileId) });
      await store.files.remove(req.params.fileId);
      res.json({ ok: true });
    })
  );

  // Export one
  router.get(
    '/:id/export',
    wrap(async (req, res) => {
      const chat = await store.chats.get(req.params.id);
      if (!chat) throw new HttpError(404, 'Chat not found');
      const base = slugify(chat.title);
      if (req.query.format === 'md') {
        return sendDownload(res, { filename: `${base}.md`, mime: 'text/markdown', body: toMarkdown(chat) });
      }
      const { fileIds, ...rest } = chat;
      sendDownload(res, {
        filename: `${base}.json`,
        mime: 'application/json',
        body: JSON.stringify({ exportedAt: new Date().toISOString(), ...rest }, null, 2),
      });
    })
  );

  // Stream a completion (SSE)
  router.post('/:id/stream', wrap(streamHandler(store)));

  return router;
};
