// solve.js — fast drop-in for makefun-site 1.0.0.
// Written from the makefun-site README spec alone (baseline/makefun-site/vendor/makefun-site/README.md).
// Dependency-free ES module. run(input) returns the output tree {path: text} for one case.
// Nothing is cached from one case to the next: every cache is created inside run().

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FM_KEYS = new Set(['title', 'summary', 'date', 'tags', 'draft', 'layout', 'slug']);
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);

// HTML escaping: & < > " ' only, nothing else.
function esc(s) {
  if (s.indexOf('&') === -1 && s.indexOf('<') === -1 && s.indexOf('>') === -1 && s.indexOf('"') === -1 && s.indexOf("'") === -1) return s;
  let out = '';
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let rep = null;
    if (c === 38) rep = '&amp;';
    else if (c === 60) rep = '&lt;';
    else if (c === 62) rep = '&gt;';
    else if (c === 34) rep = '&quot;';
    else if (c === 39) rep = '&#39;';
    if (rep !== null) { out += s.slice(last, i) + rep; last = i + 1; }
  }
  return out + s.slice(last);
}

// A slug: NFKD, combining marks dropped, A-Z lowered, each run of non [a-z0-9] one '-', none at
// either end, cut to 64 chars with a '-' left at the cut dropped, 'untitled' when nothing is left.
function slugOf(text, cache) {
  if (cache) {
    const hit = cache.get(text);
    if (hit !== undefined) return hit;
  }
  const n = text.normalize('NFKD').replace(/\p{M}/gu, '');
  let out = '';
  let dash = false;
  for (let i = 0; i < n.length && out.length < 64; i++) {
    const c = n.charCodeAt(i);
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) { out += n[i]; dash = false; }
    else if (c >= 65 && c <= 90) { out += String.fromCharCode(c + 32); dash = false; }
    else if (out.length > 0 && !dash) { out += '-'; dash = true; }
  }
  if (out.charCodeAt(out.length - 1) === 45) out = out.slice(0, -1);
  if (out === '') out = 'untitled';
  if (cache) cache.set(text, out);
  return out;
}

// date_long: the date in words from the string alone: 2026-11-09 -> 9 November 2026.
function dateLong(d) {
  const y = d.slice(0, 4);
  const m = MONTHS[parseInt(d.slice(5, 7), 10) - 1];
  const day = parseInt(d.slice(8, 10), 10);
  return `${day} ${m} ${y}`;
}

function daysInMonth(y, m) {
  if (m === 2) return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28;
  if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
  return 31;
}

function isRealDate(y, m, d) {
  return y >= 1970 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

// ---- Front matter ----
// A source opens on the line `---`, front matter runs to the next line exactly `---`.
// Every line between is blank, a comment (opening on `#`), or `key: value`.
// Returns {fm, body} or {refusal}.

// Parse a title/summary value: quoted ("...", only \" and \\ escapes) or bare (never opens on " or [).
// Returns the string, or a refusal detail (without the `key "k": ` prefix).
function parseStringValue(value) {
  if (value.charCodeAt(0) === 34) {
    let out = '';
    let j = 1;
    while (j < value.length) {
      const c = value[j];
      if (c === '\\' && (value[j + 1] === '"' || value[j + 1] === '\\')) { out += value[j + 1]; j += 2; }
      else if (c === '"') {
        const rest = value.slice(j + 1);
        if (rest.trim() !== '') return { refusal: 'a quoted string is not closed' };
        return { value: out };
      } else { out += c; j++; }
    }
    return { refusal: 'a quoted string is not closed' };
  }
  if (value.charCodeAt(0) === 91) return { refusal: 'a bare string opens on [' };
  return { value };
}

function parseKeyValue(key, value) {
  switch (key) {
    case 'title':
    case 'summary': {
      const r = parseStringValue(value);
      if (r.refusal) return { refusal: r.refusal };
      return { value: r.value };
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!m || !isRealDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))) {
        return { refusal: 'not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      }
      return { value };
    }
    case 'tags': {
      if (value.charCodeAt(0) !== 91 || value.charCodeAt(value.length - 1) !== 93) {
        return { refusal: 'not a list [a, b]' };
      }
      const inner = value.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const parts = inner.split(',');
      const tags = [];
      for (let p of parts) {
        p = p.trim();
        if (p === '' || p.indexOf('"') !== -1 || p.indexOf('[') !== -1 || p.indexOf(']') !== -1) {
          return { refusal: 'an empty tag, or one holding " [ or ]' };
        }
        tags.push(p);
      }
      return { value: tags };
    }
    case 'draft': {
      if (value === 'true') return { value: true };
      if (value === 'false') return { value: false };
      return { refusal: 'true or false' };
    }
    case 'layout': {
      if (!/^[a-z0-9-]+$/.test(value)) return { refusal: 'not a layout name' };
      return { value };
    }
    case 'slug': {
      if (value.length > 64 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) return { refusal: 'not a slug' };
      return { value };
    }
    default:
      return { value };
  }
}

function parseFrontMatter(content) {
  const lines = content.split('\n');
  if (lines.length === 0 || lines[0] !== '---') return { refusal: 'no front matter' };
  // The closing `---` is found first: without it the front matter is not closed,
  // whatever the lines between hold.
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { close = i; break; }
  }
  if (close === -1) return { refusal: 'the front matter is not closed' };
  const fm = {};
  const seen = new Set();
  for (let i = 1; i < close; i++) {
    const raw = lines[i];
    const line = raw.replace(/[ \t]+$/, '');
    if (line === '' || line.charCodeAt(0) === 35) continue;
    const m = /^([a-z_]+): (.*)$/.exec(line);
    if (!m) {
      if (/^([a-z_]+):$/.exec(line)) {
        const key = /^([a-z_]+):$/.exec(line)[1];
        if (!FM_KEYS.has(key)) return { refusal: `unknown key "${key}"` };
        if (seen.has(key)) return { refusal: `key "${key}" is given twice` };
        return { refusal: `key "${key}" has no value` };
      }
      return { refusal: `line ${i + 1} is not "key: value"` };
    }
    const key = m[1];
    const value = m[2];
    if (!FM_KEYS.has(key)) return { refusal: `unknown key "${key}"` };
    if (seen.has(key)) return { refusal: `key "${key}" is given twice` };
    if (value === '') return { refusal: `key "${key}" has no value` };
    const parsed = parseKeyValue(key, value);
    if (parsed.refusal) return { refusal: `key "${key}": ${parsed.refusal}` };
    seen.add(key);
    fm[key] = parsed.value;
  }
  const body = lines.slice(close + 1).join('\n');
  if (!fm.title) return { refusal: 'no title' };
  return { fm, body };
}

// ---- Markdown ----
// Inline rendering, left to right. linkRes(target) resolves a link target to its href
// and records broken links; it returns the href to write.

// Find the closing delimiter for an inline span starting at `from`, skipping `\x` escapes
// as single literal units. closeCh is a single char ('`', ']' or '*'); for '*' a `**` pair
// is a strong delimiter, not an emphasis closer, so both of its stars are skipped.
function findCloser(s, from, closeCh) {
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === closeCh) {
      if (closeCh === '*' && s[i + 1] === '*') { i++; continue; }
      return i;
    }
  }
  return -1;
}

// Find the next '**' not escaped, from `from`.
function findStrongCloser(s, from) {
  for (let i = from; i + 1 < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '*' && s[i + 1] === '*') return i;
  }
  return -1;
}

function renderInline(s, linkRes, out) {
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '\\' && i + 1 < n && ESCAPABLE.has(s[i + 1])) {
      out.push(esc(s[i + 1]));
      i += 2;
      continue;
    }
    if (c === '`') {
      const j = findCloser(s, i + 1, '`');
      if (j !== -1 && j > i + 1) {
        out.push('<code>', esc(s.slice(i + 1, j)), '</code>');
        i = j + 1;
        continue;
      }
      out.push('`');
      i++;
      continue;
    }
    if (c === '*' && s[i + 1] === '*') {
      const j = findStrongCloser(s, i + 2);
      if (j !== -1 && j > i + 2) {
        out.push('<strong>');
        renderInline(s.slice(i + 2, j), linkRes, out);
        out.push('</strong>');
        i = j + 2;
        continue;
      }
      out.push('**');
      i += 2;
      continue;
    }
    if (c === '*') {
      const j = findCloser(s, i + 1, '*');
      if (j !== -1 && j > i + 1) {
        out.push('<em>');
        renderInline(s.slice(i + 1, j), linkRes, out);
        out.push('</em>');
        i = j + 1;
        continue;
      }
      out.push('*');
      i++;
      continue;
    }
    if (c === '[') {
      const j = findCloser(s, i + 1, ']');
      if (j !== -1 && j > i && s[j + 1] === '(') {
        const k = s.indexOf(')', j + 2);
        if (k !== -1) {
          const target = s.slice(j + 2, k);
          if (target !== '' && !/[\s]/.test(target)) {
            out.push('<a href="', esc(linkRes(target)), '">');
            renderInline(s.slice(i + 1, j), linkRes, out);
            out.push('</a>');
            i = k + 1;
            continue;
          }
        }
      }
      out.push('[');
      i++;
      continue;
    }
    // Every other character is written escaped.
    const code = s.charCodeAt(i);
    if (code === 38) out.push('&amp;');
    else if (code === 60) out.push('&lt;');
    else if (code === 62) out.push('&gt;');
    else if (code === 34) out.push('&quot;');
    else if (code === 39) out.push('&#39;');
    else out.push(c);
    i++;
  }
}

function inlineToString(s, linkRes) {
  const out = [];
  renderInline(s, linkRes, out);
  return out.join('');
}

const FENCE_OPEN = /^```([A-Za-z0-9_+\-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;
const HR = /^(---|\*\*\*)[ \t]*$/;
const LIST_MARK = /^(- |\* |(\d+)\. )/;
const BLANK = /^[ \t]*$/;

// A real heading: 1-6 #, whitespace, then non-empty text (trailing ws dropped).
// Returns {level, text} or null (7+ #, no text, or no space after the #s).
function headingOf(line) {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  const text = m[2].replace(/[ \t]+$/, '');
  if (text === '') return null;
  return { level: m[1].length, text };
}

function isBlank(line) {
  return line === '' || BLANK.test(line);
}

// Render one source body. Returns {html, toc, excerpt, words}.
// toc: level 2-3 headings {level, id, html}. excerpt: inner HTML of the first paragraph block, or ''.
function renderMarkdown(body, linkRes, slugCache) {
  const lines = body.split('\n');
  const out = [];
  const toc = [];
  let excerpt = null;
  const headingIds = new Set();
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    // Fence
    let m = FENCE_OPEN.exec(line);
    if (m) {
      const lang = m[1];
      const parts = [];
      i++;
      while (i < n && !FENCE_CLOSE.test(lines[i])) {
        parts.push(esc(lines[i]));
        i++;
      }
      if (i < n) i++; // consume closing fence
      out.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${parts.join('\n')}${parts.length ? '\n' : ''}</code></pre>`);
      continue;
    }
    // Heading
    const hd = headingOf(line);
    if (hd) {
      const { level, text } = hd;
      const base = slugOf(text, slugCache);
      let id = base;
      let n = 2;
      while (headingIds.has(id)) { id = `${base}-${n}`; n++; }
      headingIds.add(id);
      const html = inlineToString(text, linkRes);
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      if (level === 2 || level === 3) toc.push({ level, id, html });
      i++;
      continue;
    }
    // Thematic break
    if (HR.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    // Blockquote
    if (line.charCodeAt(0) === 62) {
      const qlines = [];
      while (i < n && lines[i].charCodeAt(0) === 62) {
        let l = lines[i].slice(1);
        if (l.charCodeAt(0) === 32) l = l.slice(1);
        l = l.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
        if (l !== '') qlines.push(l);
        i++;
      }
      if (qlines.length === 0) out.push('<blockquote>\n</blockquote>');
      else out.push(`<blockquote>\n<p>${inlineToString(qlines.join('\n'), linkRes)}</p>\n</blockquote>`);
      continue;
    }
    // List
    m = LIST_MARK.exec(line);
    if (m) {
      const ordered = m[2] !== undefined;
      const startNum = ordered ? parseInt(m[2], 10) : 0;
      const items = [];
      let cur = line.slice(m[0].length);
      i++;
      while (i < n) {
        const l2 = lines[i];
        const m2 = LIST_MARK.exec(l2);
        if (m2 && (m2[2] !== undefined) === ordered) {
          items.push(cur);
          cur = l2.slice(m2[0].length);
          i++;
          continue;
        }
        if (/^[ \t]{2,}\S/.test(l2)) {
          cur += '\n' + l2.trim();
          i++;
          continue;
        }
        break;
      }
      items.push(cur);
      const tag = ordered ? (startNum !== 1 ? `<ol start="${startNum}">` : '<ol>') : '<ul>';
      const lis = items.map((it) => `<li>${inlineToString(it, linkRes)}</li>`);
      out.push(`${tag}\n${lis.join('\n')}\n${ordered ? '</ol>' : '</ul>'}`);
      continue;
    }
    // Paragraph: lines up to a blank line, fence, heading or thematic break.
    const plines = [];
    while (i < n) {
      const l = lines[i];
      if (isBlank(l)) break;
      if (FENCE_OPEN.test(l)) break;
      if (headingOf(l)) break;
      if (HR.test(l)) break;
      plines.push(l.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''));
      i++;
    }
    const inner = inlineToString(plines.join('\n'), linkRes);
    if (excerpt === null) excerpt = inner;
    out.push(`<p>${inner}</p>`);
  }
  // Words: runs of characters other than whitespace in the body.
  const words = body.match(/\S+/g);
  return { html: out.length ? out.map((b) => b + '\n').join('') : '', toc, excerpt: excerpt === null ? '' : excerpt, words: words ? words.length : 0 };
}

// ---- Templates ----
// {{ path }} escaped, {{{ path }}} raw, {% for x in path %}, {% if [not] path %},
// {% else %}, {% include "name" %}. A {% %} tag alone on its line takes the whole line.
// Paths: names joined by '.', first name from the innermost loop binding it (`loop` first),
// else from the context; each next name an own property, or undefined.

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function parsePath(s) {
  const t = s.trim();
  if (!PATH_RE.test(t)) return null;
  return t.split('.');
}

function parseTemplate(src) {
  const root = { t: 'root', body: [] };
  const stack = [root];
  const cur = () => {
    const top = stack[stack.length - 1];
    if (top.t === 'if' && top.elseBody !== null) return top.elseBody;
    return top.body;
  };
  let text = '';
  const flushText = () => {
    if (text !== '') { cur().push({ t: 'text', s: text }); text = ''; }
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    // Find the next tag opener.
    let next = -1;
    let kind = '';
    for (let j = i; j < n; j++) {
      if (src[j] === '{' && (src[j + 1] === '{' || src[j + 1] === '%')) {
        next = j;
        kind = src[j + 1] === '{' ? (src[j + 2] === '{' ? 'raw' : 'var') : 'tag';
        break;
      }
    }
    if (next === -1) {
      text += src.slice(i);
      break;
    }
    if (kind === 'tag') {
      const close = src.indexOf('%}', next + 2);
      if (close === -1) return { error: 'a {% is not closed' };
      const inner = src.slice(next + 2, close).trim();
      // Standalone line? Only spaces/tabs between the last '\n' and the tag, and only
      // spaces/tabs (then '\n' or end) after it: the whole line goes with the tag.
      const ls = src.lastIndexOf('\n', next - 1);
      const before = src.slice(ls + 1, next);
      let after = close + 2;
      while (after < n && (src[after] === ' ' || src[after] === '\t')) after++;
      const standalone = /^[ \t]*$/.test(before) && (after >= n || src[after] === '\n');
      if (standalone) {
        text += src.slice(i, next);
        text = text.slice(0, text.length - before.length);
        if (after < n) after++; // consume the '\n'
        i = after;
      } else {
        text += src.slice(i, next);
        i = close + 2;
      }
      flushText();
      const node = parseTag(inner);
      if (node.error) return node;
      if (node.t === 'for' || node.t === 'if') {
        cur().push(node);
        stack.push(node);
      } else if (node.t === 'else') {
        if (stack.length < 2 || stack[stack.length - 1].t !== 'if' || stack[stack.length - 1].elseBody !== null) {
          return { error: 'an else outside an if' };
        }
        stack[stack.length - 1].elseBody = [];
      } else if (node.t === 'endfor') {
        if (stack.length < 2 || stack[stack.length - 1].t !== 'for') return { error: 'an endfor with no open for' };
        stack.pop();
      } else if (node.t === 'endif') {
        if (stack.length < 2 || stack[stack.length - 1].t !== 'if') return { error: 'an endif with no open if' };
        stack.pop();
      } else {
        cur().push(node);
      }
      continue;
    }
    // {{ }} or {{{ }}}
    const openLen = kind === 'raw' ? 3 : 2;
    const closeStr = kind === 'raw' ? '}}}' : '}}';
    const close = src.indexOf(closeStr, next + openLen);
    if (close === -1) return { error: kind === 'raw' ? 'a {{{ is not closed' : 'a {{ is not closed' };
    const rawPath = src.slice(next + openLen, close);
    const path = parsePath(rawPath);
    if (!path) return { error: `"${rawPath.trim()}" is not a path` };
    text += src.slice(i, next);
    i = close + closeStr.length;
    flushText();
    cur().push({ t: 'var', path, raw: kind === 'raw' });
  }
  flushText();
  if (stack.length !== 1) {
    const open = stack[stack.length - 1];
    return { error: open.t === 'for' ? 'a for is not closed' : 'a if is not closed' };
  }
  return { ast: root.body };
}

function parseTag(inner) {
  let m = /^for ([A-Za-z_][A-Za-z0-9_]*) in (.+)$/.exec(inner);
  if (m) {
    const path = parsePath(m[2]);
    if (!path) return { error: `"${m[2].trim()}" is not a path` };
    return { t: 'for', varName: m[1], path, body: [] };
  }
  m = /^if not (.+)$/.exec(inner);
  if (m) {
    const path = parsePath(m[1]);
    if (!path) return { error: `"${m[1].trim()}" is not a path` };
    return { t: 'if', path, neg: true, body: [], elseBody: null };
  }
  m = /^if (.+)$/.exec(inner);
  if (m) {
    const path = parsePath(m[1]);
    if (!path) return { error: `"${m[1].trim()}" is not a path` };
    return { t: 'if', path, neg: false, body: [], elseBody: null };
  }
  if (inner === 'else') return { t: 'else' };
  if (inner === 'endfor') return { t: 'endfor' };
  if (inner === 'endif') return { t: 'endif' };
  m = /^include "([^"]*)"$/.exec(inner);
  if (m) return { t: 'include', name: m[1] };
  return { error: `{% ${inner} %} is not a tag` };
}

// ---- Template runtime helpers ----
function resolvePath(L, C, names) {
  const first = names[0];
  let v;
  let found = false;
  for (let i = L.length - 1; i >= 0; i--) {
    const f = L[i];
    if (first === 'loop') { v = f.loop; found = true; break; }
    if (first === f.n) { v = f.v; found = true; break; }
  }
  if (!found) {
    if (C === null || C === undefined || !Object.hasOwn(C, first)) return undefined;
    v = C[first];
  }
  for (let k = 1; k < names.length; k++) {
    if (v === null || v === undefined) return undefined;
    if (!Object.hasOwn(v, names[k])) return undefined;
    v = v[names[k]];
  }
  return v;
}

function writeVal(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    let s = '';
    for (let i = 0; i < v.length; i++) {
      if (i > 0) s += ', ';
      s += writeVal(v[i]);
    }
    return s;
  }
  return '';
}

function truthy(v) {
  return !(v === undefined || v === null || v === false || v === '' || v === 0 || (Array.isArray(v) && v.length === 0));
}

// Tree-walking interpreter (fallback when `new Function` is unavailable).
function renderNodes(nodes, O, C, L, H, D, T) {
  for (const node of nodes) {
    if (node.t === 'text') { O.push(node.s); continue; }
    if (node.t === 'var') {
      const v = writeVal(resolvePath(L, C, node.path));
      O.push(node.raw ? v : esc(v));
      continue;
    }
    if (node.t === 'for') {
      const arr = resolvePath(L, C, node.path);
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        L.push({ n: node.varName, v: arr[i], loop: { index: i + 1, first: i === 0, last: i === arr.length - 1, length: arr.length } });
        renderNodes(node.body, O, C, L, H, D, T);
        L.pop();
      }
      continue;
    }
    if (node.t === 'if') {
      let cond = truthy(resolvePath(L, C, node.path));
      if (node.neg) cond = !cond;
      renderNodes(cond ? node.body : (node.elseBody || []), O, C, L, H, D, T);
      continue;
    }
    if (node.t === 'include') {
      if (D >= 8) continue;
      const fn = T.get(node.name);
      if (fn) fn(O, C, L, H, D + 1, T);
      continue;
    }
  }
}

// Compile a template AST to a render function. Falls back to the interpreter.
function compileTemplate(ast) {
  const parts = ['"use strict";'];
  const gen = (nodes) => {
    for (const node of nodes) {
      if (node.t === 'text') {
        parts.push('O.push(' + JSON.stringify(node.s) + ');');
      } else if (node.t === 'var') {
        const p = JSON.stringify(node.path);
        if (node.raw) parts.push(`O.push(H.w(H.r(L,C,${p})));`);
        else parts.push(`O.push(H.e(H.w(H.r(L,C,${p}))));`);
      } else if (node.t === 'for') {
        const p = JSON.stringify(node.path);
        const vn = JSON.stringify(node.varName);
        parts.push(`{const _a=H.r(L,C,${p});if(Array.isArray(_a)){for(let _i=0;_i<_a.length;_i++){L.push({n:${vn},v:_a[_i],loop:{index:_i+1,first:_i===0,last:_i===_a.length-1,length:_a.length}});`);
        gen(node.body);
        parts.push('L.pop();}}}');
      } else if (node.t === 'if') {
        const p = JSON.stringify(node.path);
        parts.push(`if(${node.neg ? '!' : ''}H.t(H.r(L,C,${p}))){`);
        gen(node.body);
        parts.push('}');
        if (node.elseBody !== null) {
          parts.push('else{');
          gen(node.elseBody);
          parts.push('}');
        }
      } else if (node.t === 'include') {
        parts.push(`if(D<8){const _f=T.get(${JSON.stringify(node.name)});if(_f)_f(O,C,L,H,D+1,T);}`);
      }
    }
  };
  gen(ast);
  const src = parts.join('\n');
  try {
    return new Function('O', 'C', 'L', 'H', 'D', 'T', src);
  } catch {
    return (O, C, L, H, D, T) => renderNodes(ast, O, C, L, H, D, T);
  }
}

// ---- Link resolution ----
// A target with a scheme, opening on `/` or on `#` is kept as written. Any other is a path
// from the source's directory (`.` and `..` steps, never above the root), with an optional `#`
// fragment: the url of the page built from that source, or <base>/<path> of a static file.
// A target naming neither is a broken link, kept as written.
const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

function resolveLinkTarget(target, fromDir, pageBySource, staticSet, base) {
  if (SCHEME_RE.test(target) || target.charCodeAt(0) === 47 || target.charCodeAt(0) === 35) {
    return { href: target, broken: false };
  }
  const hashAt = target.indexOf('#');
  const frag = hashAt === -1 ? '' : target.slice(hashAt);
  const rawPath = hashAt === -1 ? target : target.slice(0, hashAt);
  const parts = (fromDir === '' ? [] : fromDir.split('/')).slice();
  for (const seg of rawPath.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (parts.length > 0) parts.pop(); continue; }
    parts.push(seg);
  }
  const resolved = parts.join('/');
  const page = pageBySource.get(resolved);
  if (page) return { href: page.url + frag, broken: false };
  if (staticSet.has(resolved)) return { href: base + '/' + resolved + frag, broken: false };
  return { href: target, broken: true };
}

// ---- Build ----
export function run(input) {
  const site = input.site;
  const templates = input.templates;
  const files = input.files;
  const base = site.base_url.replace(/\/+$/, '');
  const reports = [];
  const slugCache = new Map();

  const sorted = files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // Templates, parsed in code-unit order of name. One that does not parse is reported and left out.
  const tplNames = Object.keys(templates).sort();
  const compiled = new Map();
  for (const name of tplNames) {
    const parsed = parseTemplate(templates[name]);
    if (parsed.error) { reports.push(`template "${name}": ${parsed.error}`); continue; }
    compiled.set(name, compileTemplate(parsed.ast));
  }

  const sources = [];
  const statics = [];
  for (const f of sorted) {
    if (f.path.endsWith('.md')) sources.push(f);
    else statics.push(f);
  }

  // Sources: front matter and the checks, in order.
  const pages = [];
  for (const f of sources) {
    const content = f.content.replace(/\r\n?/g, '\n');
    const parsed = parseFrontMatter(content);
    if (parsed.refusal) { reports.push(`refused ${f.path}: ${parsed.refusal}`); continue; }
    const fm = parsed.fm;
    const slash = f.path.lastIndexOf('/');
    const dir = slash === -1 ? '' : f.path.slice(0, slash);
    const top = dir === '' ? '' : dir.split('/')[0];
    if (top === 'tags' || top === 'page') { reports.push(`refused ${f.path}: ${top}/ is the generator's own`); continue; }
    const isPost = top === 'posts';
    if (isPost && fm.date === undefined) { reports.push(`refused ${f.path}: a post needs a date`); continue; }
    const layout = fm.layout !== undefined ? fm.layout : (isPost ? 'post' : 'page');
    if (!compiled.has(layout)) { reports.push(`refused ${f.path}: layout "${layout}" is no template that parses`); continue; }
    if (fm.draft === true) { reports.push(`draft ${f.path}`); continue; }
    const baseSlug = fm.slug !== undefined ? fm.slug : slugOf(fm.title, slugCache);
    // A post's directory is `posts/`; a page's is its source's directory.
    const outDir = isPost ? 'posts' : dir;
    pages.push({
      srcPath: f.path, dir, outDir, isPost, layout, body: parsed.body,
      title: fm.title, summary: fm.summary, date: fm.date,
      tags: fm.tags || [], baseSlug,
    });
  }

  // Permalinks: slug unique in its (output) directory in source order.
  const takenByDir = new Map();
  for (const p of pages) {
    let taken = takenByDir.get(p.outDir);
    if (!taken) {
      taken = new Set();
      if (p.outDir === '') { taken.add('posts'); taken.add('tags'); taken.add('page'); }
      takenByDir.set(p.outDir, taken);
    }
    let s = p.baseSlug;
    let n = 2;
    while (taken.has(s)) { s = `${p.baseSlug}-${n}`; n++; }
    taken.add(s);
    p.slug = s;
    p.url = base + (p.outDir === '' ? '' : '/' + p.outDir) + '/' + s + '/';
  }

  const pageBySource = new Map();
  for (const p of pages) pageBySource.set(p.srcPath, p);
  const staticSet = new Set();
  for (const f of statics) staticSet.add(f.path);

  // Markdown, each source's body rendered, its links resolved.
  const broken = new Set();
  for (const p of pages) {
    const linkRes = (target) => {
      const r = resolveLinkTarget(target, p.dir, pageBySource, staticSet, base);
      if (r.broken) broken.add(`broken-link ${p.srcPath} -> ${target}`);
      return r.href;
    };
    const md = renderMarkdown(p.body, linkRes, slugCache);
    p.content = md.html;
    p.toc = md.toc;
    p.excerpt = md.excerpt;
    p.words = md.words;
  }

  // Collections: posts newest date first, equal dates by slug in code-unit order.
  const posts = pages.filter((p) => p.isPost).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  for (let i = 0; i < posts.length; i++) {
    posts[i].newer = i > 0 ? posts[i - 1] : null;
    posts[i].older = i < posts.length - 1 ? posts[i + 1] : null;
  }

  // Tags: each post's tags, each slug once (first spelling kept), in its own order.
  const tagBySlug = new Map();
  for (const p of posts) {
    const seen = new Set();
    for (const tname of p.tags) {
      const slug = slugOf(tname, slugCache);
      if (seen.has(slug)) continue;
      seen.add(slug);
      let t = tagBySlug.get(slug);
      if (!t) {
        t = { name: tname, slug, url: `${base}/tags/${slug}/`, posts: [] };
        tagBySlug.set(slug, t);
      }
      t.posts.push(p);
    }
  }
  const tags = [...tagBySlug.values()].sort((a, b) => (b.posts.length - a.posts.length) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  // A page's tags link to the tag of the same slug, or have the url "" where no post has it.
  // The name is the tag's own (first spelling kept); only where no post has it is the
  // page's own spelling used.
  for (const p of pages) {
    const seen = new Set();
    const ptags = [];
    for (const tname of p.tags) {
      const slug = slugOf(tname, slugCache);
      if (seen.has(slug)) continue;
      seen.add(slug);
      const t = tagBySlug.get(slug);
      ptags.push({ name: t ? t.name : tname, slug, url: t ? t.url : '' });
    }
    p.pageTags = ptags;
  }

  const cardOf = (p) => ({
    title: p.title,
    url: p.url,
    date: p.date === undefined ? '' : p.date,
    date_long: p.date === undefined ? '' : dateLong(p.date),
    summary: p.summary === undefined ? '' : p.summary,
    excerpt: p.excerpt,
    reading_minutes: Math.max(1, Math.ceil(p.words / 200)),
    tags: p.pageTags,
  });
  for (const p of pages) p.card = cardOf(p);
  const recent = posts.slice(0, site.recent).map((p) => p.card);
  const tagCtx = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const siteCtx = { title: site.title, base_url: base };

  const H = {
    e: esc,
    w: writeVal,
    r: resolvePath,
    t: truthy,
  };

  const render = (name, ctx) => {
    const fn = compiled.get(name);
    const O = [];
    fn(O, ctx, [], H, 0, compiled);
    return O.join('');
  };

  const out = {};
  let builtPages = 0;
  let builtPosts = 0;
  for (const p of pages) {
    const pageCtx = {
      ...p.card,
      slug: p.slug,
      content: p.content,
      toc: p.toc,
      newer: null,
      older: null,
      is_post: p.isPost,
    };
    if (p.isPost) {
      if (p.newer) {
        pageCtx.newer = { title: p.newer.title, url: p.newer.url, date: p.newer.date, date_long: dateLong(p.newer.date) };
      }
      if (p.older) {
        pageCtx.older = { title: p.older.title, url: p.older.url, date: p.older.date, date_long: dateLong(p.older.date) };
      }
    }
    const ctx = { site: siteCtx, tags: tagCtx, recent, page: pageCtx };
    out[(p.outDir === '' ? '' : p.outDir + '/') + p.slug + '/index.html'] = render(p.layout, ctx);
    if (p.isPost) builtPosts++;
    else builtPages++;
  }

  // Index, per_page posts a page: index.html, then page/2/index.html and on.
  const perPage = site.per_page > 0 ? site.per_page : 1;
  const totalPages = Math.max(1, Math.ceil(posts.length / perPage));
  if (compiled.has('index')) {
    for (let n = 1; n <= totalPages; n++) {
      const slice = posts.slice((n - 1) * perPage, n * perPage);
      const pager = {
        number: n,
        total: totalPages,
        url: n === 1 ? `${base}/` : `${base}/page/${n}/`,
        newer_url: n === 1 ? '' : (n === 2 ? `${base}/` : `${base}/page/${n - 1}/`),
        older_url: n === totalPages ? '' : `${base}/page/${n + 1}/`,
      };
      const ctx = { site: siteCtx, tags: tagCtx, recent, posts: slice.map((p) => p.card), pager };
      out[n === 1 ? 'index.html' : `page/${n}/index.html`] = render('index', ctx);
    }
  }

  // Each tag through `tag`, and tags/index.html through `tags`.
  if (compiled.has('tag')) {
    for (const t of tags) {
      const ctx = {
        site: siteCtx, tags: tagCtx, recent,
        tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => p.card) },
      };
      out[`tags/${t.slug}/index.html`] = render('tag', ctx);
    }
  }
  if (compiled.has('tags')) {
    out['tags/index.html'] = render('tags', { site: siteCtx, tags: tagCtx, recent });
  }

  // Static files at their own path, unless a built page has that path. A shadowed static
  // is reported and its content is not written, but it still counts in the report's
  // static-files number.
  for (const f of statics) {
    if (Object.hasOwn(out, f.path)) { reports.push(`shadowed ${f.path}: a built page has its path`); continue; }
    out[f.path] = f.content;
  }
  const builtStatic = statics.length;

  for (const b of broken) reports.push(b);
  reports.sort();
  reports.push(`built ${builtPages} pages, ${builtPosts} posts, ${tags.length} tags and ${builtStatic} static files`);
  out['build-report.txt'] = reports.map((l) => l + '\n').join('');
  return out;
}
