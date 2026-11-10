/**
 * Minimal in-process RAG: paragraph-aware chunking + BM25 ranking.
 * No embeddings or vector DB required; the `retrieve` signature is the seam
 * where you'd plug in a vector store (pgvector, Atlas Vector Search, ...).
 */
const { estimateTokens } = require('./tokens');

const STOP = new Set(
  'the and for with this that are was were been from your you but not have has had can could should would will just about into over than also our their its what which when where who how why please'.split(
    ' '
  )
);

function chunkText(text, size = 1200, overlap = 150) {
  const clean = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  if (!clean) return [];
  const chunks = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = '';
  };
  for (const para of clean.split(/\n{2,}/)) {
    if (para.length > size) {
      flush();
      for (let i = 0; i < para.length; i += size - overlap) chunks.push(para.slice(i, i + size));
      continue;
    }
    if (cur && (cur + '\n\n' + para).length > size) flush();
    cur += (cur ? '\n\n' : '') + para;
  }
  flush();
  return chunks;
}

const tokenize = (s) => ((String(s).toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []).filter((t) => !STOP.has(t)));

function bm25(docs, queryTerms) {
  const N = docs.length;
  const avgdl = docs.reduce((n, d) => n + d.length, 0) / (N || 1) || 1;
  const df = new Map();
  docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  const k1 = 1.5;
  const b = 0.75;
  const uniq = [...new Set(queryTerms)];
  return docs.map((d) => {
    const tf = new Map();
    d.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    let score = 0;
    for (const t of uniq) {
      const f = tf.get(t);
      if (!f) continue;
      const n = df.get(t) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.length) / avgdl));
    }
    return score;
  });
}

/**
 * @param {{files: Array<{id,name,text}>, query: string, budgetTokens: number, topK?: number}} opts
 * @returns {{chunks: Array<{file,fileId,idx,text,tokens}>, mode: 'none'|'full'|'retrieved'|'head'}}
 */
function retrieve({ files, query, budgetTokens, topK = 12 }) {
  const all = [];
  for (const f of files) {
    chunkText(f.text).forEach((text, idx) =>
      all.push({ file: f.name, fileId: f.id, idx, text, tokens: estimateTokens(text), order: all.length })
    );
  }
  if (!all.length || budgetTokens <= 0) return { chunks: [], mode: 'none' };

  const total = all.reduce((n, c) => n + c.tokens, 0);
  if (total <= budgetTokens) return { chunks: all, mode: 'full' };

  const queryTerms = tokenize(query);
  const scores = bm25(all.map((c) => tokenize(c.text)), queryTerms);
  const ranked = all.map((c, i) => ({ c, s: scores[i] })).sort((a, b) => b.s - a.s || a.c.order - b.c.order);
  const hasSignal = ranked[0].s > 0;

  const picked = [];
  let used = 0;
  const pool = hasSignal ? ranked.filter((r) => r.s > 0) : all.map((c) => ({ c, s: 0 }));
  for (const { c } of pool) {
    if (picked.length >= topK) break;
    if (used + c.tokens > budgetTokens) continue;
    picked.push(c);
    used += c.tokens;
  }
  picked.sort((a, b) => a.order - b.order);
  return { chunks: picked, mode: hasSignal ? 'retrieved' : 'head' };
}

module.exports = { chunkText, retrieve, tokenize };
