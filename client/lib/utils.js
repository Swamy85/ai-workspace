export const cn = (...a) => a.filter(Boolean).join(' ');

export const estimateTokens = (t = '') => Math.ceil(String(t).length / 4);

export const fmtNum = (n) => new Intl.NumberFormat().format(n ?? 0);

export function fmtBytes(n = 0) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Unique {{variable}} names in a prompt template, in order of appearance. */
export function extractVars(template = '') {
  const seen = new Set();
  for (const m of template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) seen.add(m[1]);
  return [...seen];
}

export function fillTemplate(template, values) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (values[k]?.trim() ? values[k] : `{{${k}}}`));
}

/** Group chats into Pinned / Today / Yesterday / Previous 7 days / Previous 30 days / Older. */
export function groupChats(chats) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 86400000;
  const groups = [
    { label: 'Pinned', items: [] },
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Previous 30 days', items: [] },
    { label: 'Older', items: [] },
  ];
  for (const c of chats) {
    const age = startOfToday.getTime() - new Date(c.updatedAt).getTime();
    let i;
    if (c.pinned) i = 0;
    else if (age < 0) i = 1;
    else if (age < day) i = 2;
    else if (age < 7 * day) i = 3;
    else if (age < 30 * day) i = 4;
    else i = 5;
    groups[i].items.push(c);
  }
  return groups.filter((g) => g.items.length);
}

/** Recursively flatten React/hast children to plain text (used for copy-to-clipboard). */
export function nodeText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (node.props) return nodeText(node.props.children);
  return '';
}

/**
 * LLMs often emit \( \) and \[ \] math delimiters; remark-math wants $ and $$.
 * Only rewrites outside fenced / inline code.
 */
export function normalizeMath(text) {
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`)
    )
    .join('');
}
