const express = require('express');
const { wrap, HttpError } = require('../utils');

/** Long-term workspace memory: short notes injected into every chat's system context. */
module.exports = (store) => {
  const router = express.Router();

  router.get(
    '/',
    wrap(async (req, res) => {
      const notes = await store.memories.list();
      res.json(notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    })
  );

  router.post(
    '/',
    wrap(async (req, res) => {
      const text = String(req.body?.text || '').trim().slice(0, 1000);
      if (!text) throw new HttpError(400, 'Note text is required');
      res.status(201).json(await store.memories.create({ text, enabled: true }));
    })
  );

  router.patch(
    '/:id',
    wrap(async (req, res) => {
      const patch = {};
      if (typeof req.body?.text === 'string') patch.text = req.body.text.trim().slice(0, 1000);
      if (typeof req.body?.enabled === 'boolean') patch.enabled = req.body.enabled;
      const note = await store.memories.update(req.params.id, patch);
      if (!note) throw new HttpError(404, 'Note not found');
      res.json(note);
    })
  );

  router.delete(
    '/:id',
    wrap(async (req, res) => {
      if (!(await store.memories.remove(req.params.id))) throw new HttpError(404, 'Note not found');
      res.json({ ok: true });
    })
  );

  return router;
};
