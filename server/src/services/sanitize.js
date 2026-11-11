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

/** Link labels that add nothing once the URL is stripped. */
const GENERIC_LABEL = /^(?:available here|here|link|click here|this link|scorecard|full scorecard|source|read more)$/i;

/** "Check the official website" boilerplate that small models add after a live lookup. */
const DEFLECT =
  /\b(for the most accurate|most up-to-date|check (?:the )?(?:official|latest|recent)|refer to (?:the )?(?:recent|latest)|you should (?:check|visit|refer)|i (?:don't|do not) have (?:access|real-time)|consult (?:the )?(?:official|latest))\b/i;

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

  // Turn links into their label (dropping empty labels), then remove any
  // remaining URLs. This kills invented "Available here" links.
  out = out
    .replace(MD_LINK, (_m, label) => (GENERIC_LABEL.test(String(label).trim()) ? '' : label))
    .replace(ANGLE_URL, '')
    .replace(BARE_URL, '');

  // Drop explicit "Source: …" / "References: …" lines at the end.
  for (let i = 0; i < 3; i++) {
    const next = out.replace(SOURCE_LINE, '');
    if (next === out) break;
    out = next;
  }

  return out
    // Drop label-only lines left behind after a generic link was removed.
    .replace(/^[ \t]*(?:[-*]\s*)?\*{0,2}(?:scorecard|full scorecard|link|source|report)\*{0,2}[ \t]*:?[ \t]*\*{0,2}[ \t]*$/gim, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

/** Drop trailing "check another website" paragraphs when live data was supplied. */
function stripDeflection(text) {
  const parts = String(text).split(/\n{2,}/);
  while (parts.length > 1 && DEFLECT.test(parts[parts.length - 1])) parts.pop();
  return parts.join('\n\n');
}

function sanitizeAnswer(text, { keepSources = false, hasLive = false } = {}) {
  if (!text) return text;
  if (keepSources) return String(text).trim();
  let out = outsideCode(String(text), cleanPart);
  if (hasLive) out = stripDeflection(out);
  return out.replace(/\s+$/, '');
}

module.exports = { sanitizeAnswer };
