/**
 * Dependency-free live information layer.
 *
 * Queries DuckDuckGo (HTML + Instant Answer), Google News RSS, Wikipedia and
 * wttr.in — no API keys, no extra packages. Results are snippets, not full
 * pages: enough to ground answers about current events, and cheap enough to
 * run on every message. Every failure is swallowed: chat must keep working
 * when the network is down.
 */
const config = require('../config');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ACCEPT_LANG = 'en-US,en;q=0.9';

const GREETING =
  /^(hi|hii|hello|hey|yo|hiya|sup|thanks|thank you|thx|ok|okay|k|cool|great|nice|bye|goodbye|good (morning|afternoon|evening))[\s!.,?]*$/i;

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
};

function decodeEntities(input = '') {
  return String(input).replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

function stripTags(html = '') {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Decode first, then strip — RSS feeds often double-escape their HTML. */
function htmlToText(html = '') {
  return stripTags(decodeEntities(String(html)));
}

/** Turn DuckDuckGo's `/l/?uddg=...` redirect into the real destination. */
function unwrapUrl(href = '') {
  let url = decodeEntities(href.trim());
  if (url.startsWith('//')) url = 'https:' + url;
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    const parsed = new URL(url);
    if (/(^|\.)duckduckgo\.com$/i.test(parsed.hostname) && parsed.pathname.startsWith('/l/')) {
      const target = parsed.searchParams.get('uddg');
      if (target) return target;
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/** Parse result anchors + snippets out of a DuckDuckGo HTML or Lite page. */
function parseResults(html) {  const links = [
    ...String(html).matchAll(
      /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>|<a\b[^>]*class='[^']*(?:result-link|result__a)[^']*'[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>|<a\b[^>]*href="([^"]*)"[^>]*class='[^']*result-link[^']*'[^>]*>([\s\S]*?)<\/a>/gi
    ),
  ];

  const snippets = [
    ...String(html).matchAll(
      /<(a|td|div|span)\b[^>]*class="[^"]*(?:result__snippet|result-snippet)[^"]*"[^>]*>([\s\S]*?)<\/\1>|<(a|td|div|span)\b[^>]*class='[^']*(?:result__snippet|result-snippet)[^']*'[^>]*>([\s\S]*?)<\/\3>/gi
    ),
  ].map((m) => stripTags(m[2] ?? m[4] ?? ''));

  const out = [];
  const seen = new Set();

  links.forEach((m, i) => {
    const href = m[1] || m[3] || m[5] || '';
    const title = stripTags(m[2] || m[4] || m[6] || '');
    const url = unwrapUrl(href);
    if (!url || !title || seen.has(url)) return;
    seen.add(url);
    out.push({ title, url, domain: hostOf(url), snippet: snippets[i] || '' });
  });

  // Fallback: DuckDuckGo Lite sometimes only exposes plain result links.
  if (!out.length) {
    const plain = [...String(html).matchAll(/<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{4,160}?)<\/a>/gi)];
    for (const m of plain) {
      const url = unwrapUrl(m[1]);
      const title = stripTags(m[2]);
      if (!url || !title || seen.has(url) || /duckduckgo/i.test(url)) continue;
      seen.add(url);
      out.push({ title, url, domain: hostOf(url), snippet: '' });
    }
  }

  return out;
}

const stripCdata = (s = '') => String(s).replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');

function xmlTag(block, tag) {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return m ? stripCdata(m[1]).trim() : '';
}

/** Parse a Google News RSS feed into result objects with publication dates. */
function parseRss(xml) {
  const items = [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  const out = [];
  for (const m of items) {
    const block = m[1];
    const title = stripTags(xmlTag(block, 'title'));
    const url = decodeEntities(xmlTag(block, 'link'));
    if (!title || !/^https?:\/\//i.test(url)) continue;
    const published = xmlTag(block, 'pubDate');
    const source = htmlToText(xmlTag(block, 'source'));
    const description = htmlToText(xmlTag(block, 'description'))
      .replace(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const publishedAt = published ? new Date(published) : null;
    out.push({
      title,
      url,
      domain: source || hostOf(url),
      snippet: description.slice(0, 300),
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : undefined,
    });
  }
  return out;
}

async function fetchRss(query, signal, timeoutMs) {
  const fresh = /\b(today|latest|current|currently|breaking|now|this (week|month)|recent|yesterday)\b/i.test(query);
  const natural = query.replace(/[?"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  const kw = keywords(query);
  const attempts = [natural, kw, fresh && kw ? `${kw} when:2d` : null].filter(Boolean);
  const { signal: s, dispose } = mergedSignal(signal, timeoutMs);

  try {
    for (const q of [...new Set(attempts)]) {
      const url =
        'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-US&gl=US&ceid=US:en';
      const res = await fetch(url, {
        signal: s,
        headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml,text/xml' },
      });
      if (!res.ok) continue;
      const items = parseRss(await res.text());
      if (items.length) return items;
    }
    return [];
  } catch {
    return [];
  } finally {
    dispose();
  }
}

/** DuckDuckGo Instant Answer: direct factual abstracts ("capital of Japan"). */
async function fetchInstantAnswer(query, signal, timeoutMs) {
  const { signal: s, dispose } = mergedSignal(signal, timeoutMs);
  try {
    const url =
      'https://api.duckduckgo.com/?q=' +
      encodeURIComponent(query) +
      '&format=json&no_html=1&skip_disambig=1';
    const res = await fetch(url, { signal: s, headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const j = await res.json();
    const text = [j.Answer, j.AbstractText, j.Definition].filter(Boolean).join('\n').trim();
    if (!text) return null;
    return {
      title: stripTags(j.Heading || query),
      url: j.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      domain: j.AbstractSource || j.DefinitionSource || 'duckduckgo.com',
      snippet: stripTags(text).slice(0, 400),
    };
  } catch {
    return null;
  } finally {
    dispose();
  }
}

/** Wikipedia search fallback for encyclopedic questions (plain-text intros). */
async function fetchWikipedia(query, signal, timeoutMs) {
  const { signal: s, dispose } = mergedSignal(signal, timeoutMs);
  try {
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=' +
      encodeURIComponent(query) +
      '&gsrlimit=2&prop=extracts|description&exintro=1&explaintext=1&format=json&origin=*';
    const res = await fetch(url, {
      signal: s,
      headers: { 'User-Agent': 'AIWorkspace/1.0 (local demo)', Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const pages = Object.values(json?.query?.pages || {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    return pages
      .map((p) => ({
        title: p.title,
        url: `https://en.wikipedia.org/wiki/${String(p.title).replace(/ /g, '_')}`,
        domain: 'en.wikipedia.org',
        snippet: String(p.extract || p.description || '')
          .replace(/\s+/g, ' ')
          .slice(0, 500),
      }))
      .filter((r) => r.title && r.snippet);
  } catch {
    return [];
  } finally {
    dispose();
  }
}

/** Live weather for "weather in <place>" style questions (wttr.in, no key). */
function weatherLocation(query) {
  const cleaned = String(query).replace(/[?!]/g, ' ').replace(/\s+/g, ' ').trim();
  let m =
    /\b(?:weather|forecast|temperature|temp|humidity|rain|snow|climate)\b(?:\s+(?:be|is|like|today|tomorrow|this week|now))?\s*(?:in|at|for|of|around)\s+([A-Za-z][A-Za-z .'\-]{1,50})/i.exec(
      cleaned
    );
  if (!m) m = /^([A-Za-z][A-Za-z .'\-]{1,50})\s+(?:weather|forecast)\b/i.exec(cleaned);
  if (!m) return '';
  return m[1]
    .replace(/\b(today|tomorrow|tonight|now|currently|please|right now|this week|next week)\b/gi, '')
    .replace(/[,.].*$/, '')
    .trim();
}

async function fetchWeather(query, signal, timeoutMs) {
  const place = weatherLocation(query);
  if (!place) return null;
  const { signal: s, dispose } = mergedSignal(signal, timeoutMs);
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(place)}?format=j1`, {
      signal: s,
      headers: { 'User-Agent': 'curl/8.0', Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const j = await res.json();
    const now = j.current_condition?.[0];
    const area = j.nearest_area?.[0];
    if (!now) return null;
    const where = [area?.areaName?.[0]?.value, area?.country?.[0]?.value].filter(Boolean).join(', ') || place;
    const today = j.weather?.[0];
    const tomorrow = j.weather?.[1];
    const fc = (d) =>
      d ? `${d.date}: ${d.mintempC}–${d.maxtempC}°C, ${d.hourly?.[4]?.chanceofrain ?? 0}% chance of rain` : '';
    const parts = [
      `Now: ${now.temp_C}°C (feels like ${now.FeelsLikeC}°C), ${now.weatherDesc?.[0]?.value || ''}, humidity ${now.humidity}%, wind ${now.windspeedKmph} km/h.`,
      fc(today),
      fc(tomorrow),
    ].filter(Boolean);
    return {
      title: `Current weather — ${where}`,
      url: `https://wttr.in/${encodeURIComponent(place)}`,
      domain: 'wttr.in',
      snippet: parts.join(' ').replace(/\s+/g, ' ').trim(),
      live: true,
    };
  } catch {
    return null;
  } finally {
    dispose();
  }
}

const NEWSY =
  /\b(news|headlines?|latest|today|tonight|yesterday|current|currently|breaking|updates?|happened|recent|recently|this (week|month|year)|who won|score|scores|election|price|prices|stock|stocks|market|weather|forecast|release[ds]?|announce[ds]?|2025|2026)\b/i;

const WEATHER = /\b(weather|forecast|temperature|humidity|rain|raining|snow)\b/i;

const isNewsy = (q) => NEWSY.test(q);
const isWeather = (q) => WEATHER.test(q);

/** Merge sources, dropping duplicate titles/links, keeping the newest first. */
function mergeResults(primary, secondary, limit) {
  const seen = new Set();
  const out = [];
  for (const list of [primary, secondary]) {
    for (const r of list) {
      const keyTitle = String(r.title).toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 60);
      const keyUrl = r.url.replace(/[?#].*$/, '');
      if (!keyTitle || seen.has(keyTitle) || seen.has(keyUrl)) continue;
      seen.add(keyTitle);
      seen.add(keyUrl);
      out.push(r);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Extract content words for search engines that dislike natural questions. */
const STOPWORDS = new Set(
  `what whats who whom whose when where why how is are was were be been being the a an of in on at to for from with and or but do does did can could will would should i me my we our you your it its this that these those give tell show please top latest today now currently current short brief briefly summary summarize links link sources source cite points bullets bullet about any some there their they he she his her has have had won win wins`.split(
    /\s+/
  )
);

function keywords(query) {
  const words = String(query)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 8).join(' ');
}

/** Trim a chat message into a search query that behaves well on a search engine. */
function buildQuery(text) {
  let q = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Long prompts are usually "question + instructions". Search with the
  // question itself, not the formatting instructions.
  if (q.length > 60) {
    const sentences = q.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 1) q = sentences.find((s) => s.includes('?')) || sentences[0];
  }

  q = q
    .replace(/\b(please|kindly|for me)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return q.slice(0, 200).trim();
}

/** Skip pointless lookups ("hi", "thanks", …); everything else gets searched. */
function shouldSearch(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (GREETING.test(t)) return false;
  if (t.split(/\s+/).length < 2 && !t.includes('?')) return false;
  return true;
}

/** Combine the caller's abort signal with a timeout (Node 18 friendly). */
function mergedSignal(signal, ms) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  const timer = setTimeout(() => ctrl.abort(), ms);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function fetchResults(endpoint, query, signal, timeoutMs) {
  const { signal: s, dispose } = mergedSignal(signal, timeoutMs);
  try {
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal: s,
      headers: {
        'User-Agent': UA,
        'Accept-Language': ACCEPT_LANG,
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return [];
    return parseResults(await res.text());
  } catch {
    return [];
  } finally {
    dispose();
  }
}

async function searchWeb(query, { signal, maxResults = config.web.maxResults } = {}) {
  const q = buildQuery(query);
  const empty = { query: q, results: [], provider: null, ms: 0, skipped: true };
  if (!config.web.enabled || !q || !shouldSearch(query)) return empty;

  const started = Date.now();
  const endpoints = [config.web.endpoint, 'https://lite.duckduckgo.com/lite/'].filter(Boolean);
  const limit = Math.max(3, maxResults);
  const weather = isWeather(q);
  const newsy = !weather && isNewsy(q);

  // DuckDuckGo gives broad coverage, Google News RSS gives real dated
  // headlines, the Instant Answer API gives direct facts, Wikipedia is the
  // encyclopedic fallback and wttr.in gives live weather. Run in parallel.
  const [ddg, rss, instant, wiki, forecast] = await Promise.all([
    (async () => {
      for (const endpoint of endpoints) {
        const found = await fetchResults(endpoint, q, signal, config.web.timeoutMs);
        if (found.length) return { results: found, provider: /lite/.test(endpoint) ? 'duckduckgo-lite' : 'duckduckgo' };
        if (signal?.aborted) break;
      }
      return { results: [], provider: null };
    })(),
    newsy ? fetchRss(q, signal, config.web.timeoutMs) : Promise.resolve([]),
    fetchInstantAnswer(q, signal, config.web.timeoutMs),
    newsy ? Promise.resolve([]) : fetchWikipedia(q, signal, config.web.timeoutMs),
    weather ? fetchWeather(q, signal, config.web.timeoutMs) : Promise.resolve(null),
  ]);

  const instantList = instant ? [instant] : [];
  const liveList = forecast ? [forecast] : [];
  const primary = weather ? [...liveList, ...instantList, ...ddg.results] : newsy ? rss : [...instantList, ...ddg.results];
  const secondary = weather ? [] : newsy ? ddg.results : wiki;
  const results = mergeResults(primary, secondary, maxResults);
  const provider =
    [forecast && 'wttr.in', rss.length && 'google-news', instant && 'duckduckgo-instant', ddg.provider, wiki.length && 'wikipedia']
      .filter(Boolean)
      .join('+') || null;

  return {
    query: q,
    results: results.slice(0, limit),
    provider,
    ms: Date.now() - started,
    skipped: false,
  };
}

module.exports = { searchWeb, shouldSearch, buildQuery, parseResults };
