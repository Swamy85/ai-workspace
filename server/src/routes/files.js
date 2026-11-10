const express = require('express');
const multer = require('multer');
const config = require('../config');
const { wrap, HttpError } = require('../utils');
const { extractText } = require('../services/fileParser');
const { estimateTokens } = require('../services/tokens');

module.exports = (store) => {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.limits.maxFileBytes } });

  // POST /api/files?chatId=...  (multipart field "file")
  router.post(
    '/',
    upload.single('file'),
    wrap(async (req, res) => {
      if (!req.file) throw new HttpError(400, 'No file uploaded (expected multipart field "file")');
      const chatId = req.query.chatId || req.body?.chatId;
      const chat = chatId ? await store.chats.get(chatId) : null;
      if (chatId && !chat) throw new HttpError(404, 'Chat not found');

      // multer decodes filenames as latin1; recover UTF-8 names.
      const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      const text = (await extractText({ ...req.file, originalname: name })).replace(/\u0000/g, '');
      if (!text.trim()) throw new HttpError(422, 'No extractable text found in this file (scanned PDFs need OCR first).');

      const file = await store.files.create({ name, mimeType: req.file.mimetype, size: req.file.size, text });
      if (chat) await store.chats.update(chat.id, { fileIds: [...(chat.fileIds || []), file.id] });

      res.status(201).json({
        id: file.id,
        name,
        mimeType: file.mimeType,
        size: file.size,
        chars: text.length,
        tokens: estimateTokens(text),
      });
    })
  );

  router.get(
    '/:id',
    wrap(async (req, res) => {
      const f = await store.files.get(req.params.id);
      if (!f) throw new HttpError(404, 'File not found');
      res.json({ id: f.id, name: f.name, size: f.size, chars: f.text.length, preview: f.text.slice(0, 800) });
    })
  );

  router.delete(
    '/:id',
    wrap(async (req, res) => {
      if (!(await store.files.remove(req.params.id))) throw new HttpError(404, 'File not found');
      res.json({ ok: true });
    })
  );

  return router;
};
