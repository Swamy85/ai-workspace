/**
 * Answers should read like a person wrote them, not like a search results page.
 * Some models still append a "Sources" block or raw links no matter what the
 * prompt says, so we strip those from the final text as a safety net.
 */

const SOURCE_SECTION =
  /\n+[ \t]*(?:#{1,6}[ \t]*)?\*{0,2}(?:sources?|references?|citations?|further reading|links)\*{0,2}[ \t]*:?[ \t]*\n[\s\S]*$/i;

const SOURCE_LINE =
  /\n+[ \t]*(?:[-*]\s*)?(?:sources?|references?|citations?)[ \t]*:[^\n]*\s*$/i;

const MD_LINK = /\[([^\]]*)\]\((?:https?:\/\/|www\.)[^)\s]+\)/gi;
const ANGLE_URL = /<(?:https?:\/\/|www\.)[^>\s]+>/gi;
const BARE_URL = /(?:https?:\/\/|www\.)[^\s<>()[\]]+/gi;

/** Apply a transform outside code spans and fenced blocks so code samples stay intact. */
function outsideCode(text, fn) {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]+`)/g)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join('');
}

function cleanPart(part) {
  let out = part;

  // Drop trailing source/reference sections, even if the model repeats them.
  for (let i = 0; i < 3; i++) {
    const next = out.replace(SOURCE_SECTION, '');
    if (next === out) break;
    out = next;
  }

  // Turn links into their label, then remove any remaining URLs.
  out = out.replace(MD_LINK, '$1').replace(ANGLE_URL, '').replace(BARE_URL, '');

  // Drop explicit "Source: …" / "References: …" lines at the end.
  for (let i = 0; i < 3; i++) {
    const next = out.replace(SOURCE_LINE, '');
    if (next === out) break;
    out = next;
  }

  return out
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

function sanitizeAnswer(text, { keepSources = false } = {}) {
  if (!text) return text;
  if (keepSources) return String(text).trim();
  return outsideCode(String(text), cleanPart).replace(/\s+$/, '');
}

module.exports = { sanitizeAnswer };
