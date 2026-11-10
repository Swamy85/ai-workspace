const express = require('express');
const { wrap, HttpError } = require('../utils');

const DEFAULT_PROMPTS = [
  {
    title: 'Refactor code',
    category: 'Code',
    content:
      'Refactor the following {{language}} code for readability, performance and maintainability. Keep behavior identical. List each change with a one-line reason, then give the final code.\n\n```{{language}}\n{{code}}\n```',
  },
  {
    title: 'Code review',
    category: 'Code',
    content:
      'Review this {{language}} code as a senior engineer. Flag bugs, security issues, edge cases and style problems, ordered by severity, and suggest concrete fixes.\n\n```{{language}}\n{{code}}\n```',
  },
  {
    title: 'Explain code',
    category: 'Code',
    content:
      'Explain what this {{language}} code does step by step for a {{level}} developer, then note any pitfalls.\n\n```{{language}}\n{{code}}\n```',
  },
  {
    title: 'Summarize text',
    category: 'Summary',
    content:
      'Summarize the text below in {{count}} bullet points for {{audience}}. Lead with the single most important takeaway.\n\n{{text}}',
  },
  {
    title: 'Meeting notes → action items',
    category: 'Summary',
    content:
      'Turn these raw meeting notes into: (1) a 3-sentence summary, (2) decisions made, (3) action items as a table with owner and due date.\n\n{{notes}}',
  },
  {
    title: 'Draft a professional email',
    category: 'Email',
    content:
      'Draft a {{tone}} email to {{recipient}} about {{topic}}. Include a clear subject line, keep it under 150 words, and end with a specific call to action.',
  },
  {
    title: 'Reply to an email',
    category: 'Email',
    content:
      'Write a {{tone}} reply to the email below. My goal: {{goal}}.\n\n---\n{{email}}\n---',
  },
  {
    title: 'Research brief',
    category: 'Research',
    content:
      'Create a structured research brief on {{topic}}: background, key concepts, current state of the art, open questions, and recommended next steps. Be explicit about uncertainty and what should be verified.',
  },
  {
    title: 'Compare options',
    category: 'Research',
    content:
      'Compare {{optionA}} vs {{optionB}} for {{useCase}}. Give a table of the key criteria, then a clear recommendation with trade-offs.',
  },
  {
    title: 'Analyze attached document',
    category: 'Research',
    content:
      'Using the attached document(s), answer: {{question}}\n\nCite the filename for each claim and say so if the documents do not contain the answer.',
  },
];

module.exports = (store) => {
  const router = express.Router();

  const seed = async () => {
    if ((await store.prompts.list()).length) return;
    for (const p of DEFAULT_PROMPTS) await store.prompts.create({ ...p, builtin: true });
  };
  router.seed = seed;

  const clean = (b = {}) => ({
    title: String(b.title || '').trim().slice(0, 120),
    category: String(b.category || 'General').trim().slice(0, 40) || 'General',
    content: String(b.content || '').slice(0, 20000),
  });

  router.get(
    '/',
    wrap(async (req, res) => {
      const prompts = await store.prompts.list();
      res.json(prompts.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title)));
    })
  );

  router.post(
    '/',
    wrap(async (req, res) => {
      const data = clean(req.body);
      if (!data.title || !data.content.trim()) throw new HttpError(400, 'Title and content are required');
      res.status(201).json(await store.prompts.create({ ...data, builtin: false }));
    })
  );

  router.patch(
    '/:id',
    wrap(async (req, res) => {
      const data = clean(req.body);
      if (!data.title || !data.content.trim()) throw new HttpError(400, 'Title and content are required');
      const p = await store.prompts.update(req.params.id, data);
      if (!p) throw new HttpError(404, 'Prompt not found');
      res.json(p);
    })
  );

  router.delete(
    '/:id',
    wrap(async (req, res) => {
      if (!(await store.prompts.remove(req.params.id))) throw new HttpError(404, 'Prompt not found');
      res.json({ ok: true });
    })
  );

  return router;
};
