/*
 * 拾图正则引擎 · Stage 3 core module. v0.9.15 rewrite.
 *
 * Pure, dependency-free. Exposes window.SHITU_REGEX in the browser and
 * module.exports under Node so the check scripts can test it directly.
 *
 * Dialects:
 *   'js'    - full feature set using lookahead (preview/tools).
 *   'plain' - lookahead-free subset.
 *   'poe2'  - in-game search dialect: quoted blocks, space=AND, | inside
 *             a quoted block = regex OR, ! = exclude. No lookahead/lookbehind,
 *             no {n} quantifiers.
 *
 * Key invariants (v0.9.15):
 *   - affixPattern keeps the post-roll effect-identifying text (e.g. the
 *     "of the extra fire damage" tail), never truncates to the roll alone.
 *   - Roll number is followed by an optional "(min-max)" parenthetical that
 *     tolerates both CN "15 (15-19)" and TW "15(15-19)" spacing.
 *   - Number ranges use a width-preserving recursive generator, exhaustively
 *     verified against 0-999.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SHITU_REGEX = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const VERSION = '0.3.1';
  const LOCKED_REASON = '词缀原文尚未游戏核验，正则复制未开放';
  const ESC = /[.*+?^${}()|[\]\\]/g;
  const RANGE = /\((\d{1,3})—(\d{1,3})\)|\(X—Y\)/g;
  const POE2_RE = /\((\d{1,3})—(\d{1,3})\)|\(X—Y\)/g;

  const clamp = n => Math.max(0, Math.min(999, Math.trunc(Number(n) || 0)));

  function escapeLiteral(text) {
    return String(text).replace(ESC, '\\$&');
  }

  /*
   * Match every integer in [loStr, hiStr] where loStr/hiStr are zero-padded
   * to the same string width. Width-preserving recursion: the remaining
   * digits always keep their width (no Number() coercion that drops zeros).
   */
  function rangeSameWidth(loStr, hiStr) {
    const w = loStr.length;
    if (loStr === '0'.repeat(w) && hiStr === '9'.repeat(w)) return '[0-9]'.repeat(w);
    if (w === 1) {
      return loStr === hiStr ? loStr : '[' + loStr + '-' + hiStr + ']';
    }
    const a = loStr[0], b = hiStr[0];
    if (loStr.slice(1) === '0'.repeat(w-1) && hiStr.slice(1) === '9'.repeat(w-1)) {
      return (a===b?a:'['+a+'-'+b+']')+'[0-9]'.repeat(w-1);
    }
    if (a === b) {
      return a + rangeSameWidth(loStr.slice(1), hiStr.slice(1));
    }
    const parts = [];
    // a-prefix branch: loStr[1:] up to all 9s
    parts.push(a + rangeSameWidth(loStr.slice(1), '9'.repeat(w - 1)));
    // (a+1)..(b-1) prefix branches: any remaining digits
    if (+b > +a+1) parts.push((+b===+a+2?String(+a+1):'['+(+a+1)+'-'+(+b-1)+']')+'[0-9]'.repeat(w-1));
    // b-prefix branch: all 0s up to hiStr[1:]
    parts.push(b + rangeSameWidth('0'.repeat(w - 1), hiStr.slice(1)));
    return parts.length === 1 ? parts[0] : '(' + parts.join('|') + ')';
  }

  // Match every integer in [min, max], 0-999. null when empty.
  function numberInRange(min, max) {
    min = clamp(min); max = clamp(max);
    if (min > max) return null;
    if (min === max) return String(min);
    const parts = [];
    const minW = String(min).length, maxW = String(max).length;
    for (let w = minW; w <= maxW; w++) {
      const lo = w === minW ? min : Math.pow(10, w - 1);
      const hi = w === maxW ? max : Math.pow(10, w) - 1;
      parts.push(rangeSameWidth(String(lo), String(hi)));
    }
    return parts.length === 1 ? parts[0] : '(' + parts.join('|') + ')';
  }

  function numberAtLeast(n) { return numberInRange(n, 999); }
  function numberAtMost(n) { return numberInRange(0, n); }

  // poe2 dialect wrappers (kept for API compat; loose arg ignored in v0.9.15
  // because post-roll text now always provides a hard numeric boundary).
  function poe2AtLeast(n) { return numberInRange(clamp(n), 999); }
  function poe2AtMost(n) { return numberInRange(0, clamp(n)); }

  /*
   * Turn one display template line into a matching fragment.
   *
   * Client text format (verified from CN+TW samples):
   *   CN: "prefix 15 (15-19)% suffix"   (roll, space, parenthetical)
   *   TW: "prefix15(15-19)%suffix"        (no spaces)
   *   No-range roll: "prefix 15% suffix" / "prefix15%suffix"
   *
   * We emit: escape(prefix) + rollPattern + optional-parenthetical + escape(suffix)
   * so the suffix (e.g. "of the extra fire damage") survives to disambiguate
   * affixes that share the same prefix.
   */
  function affixPattern(text, options) {
    const opt = options || {};
    if (opt.dialect === 'poe2') {
      const lines = String(text).split('\n');
      const hasRange = l => /\((\d{1,3})—(\d{1,3})\)|\(X—Y\)/.test(l);
      const line = lines.find(hasRange) || lines[0];
      const parts = [];
      let last = 0, m;
      POE2_RE.lastIndex = 0;
      while ((m = POE2_RE.exec(line)) !== null) {
        parts.push(escapeLiteral(line.slice(last, m.index)));
        // Range placeholder at line start (e.g. "(5—10)% increased …"):
        // anchor to line start so a bare \d+ doesn't match anywhere.
        if (m.index === 0) parts.push('^');
        let lo = 0, hi = 999;
        if (m[1] !== undefined) { lo = +m[1]; hi = +m[2]; }
        if (opt.atLeast !== undefined && opt.atLeast !== '') lo = Math.max(lo, clamp(opt.atLeast));
        if (opt.atMost !== undefined && opt.atMost !== '') hi = Math.min(hi, clamp(opt.atMost));
        if (lo > hi) return null;
        let num;
        if ((opt.atLeast !== undefined && opt.atLeast !== '') || (opt.atMost !== undefined && opt.atMost !== '')) num = numberInRange(lo, hi);
        else num = '\\d+';
        parts.push(num);
        // Optional "(min-max)" parenthetical after the roll. Tolerates both
        // CN "15 (15-19)" and TW "15(15-19)", and no-parenthetical rolls.
        parts.push('(\\s*\\([0-9]+[-–—][0-9]+\\))?');
        last = m.index + m[0].length;
      }
      parts.push(escapeLiteral(line.slice(last)));
      return parts.join('');
    }
    // JS dialect (unchanged from v0.9.14): keep full template, accept rolled
    // value followed by optional parenthetical range.
    const parts = [];
    let last = 0, m;
    RANGE.lastIndex = 0;
    while ((m = RANGE.exec(text)) !== null) {
      parts.push(escapeLiteral(text.slice(last, m.index)));
      let lo, hi;
      if (m[1] !== undefined) { lo = +m[1]; hi = +m[2]; }
      else { lo = 0; hi = 999; }
      let min = lo, max = hi;
      if (opt.atLeast !== undefined && opt.atLeast !== '') min = Math.max(min, clamp(opt.atLeast));
      if (opt.atMost !== undefined && opt.atMost !== '') max = Math.min(max, clamp(opt.atMost));
      if (min > max) return null;
      const num = numberInRange(min, max);
      parts.push('(?:' + num + ')(?:\\s*\\([^)]*\\))?');
      last = m.index + m[0].length;
    }
    parts.push(escapeLiteral(text.slice(last)));
    return parts.join('');
  }

  /*
   * Build the final search string.
   *   always  - blocks that must ALWAYS AND (item type, rarity, tier, uses,
   *             metric thresholds). These never enter the all/any OR group.
   *   includes - user-selected "include" affixes. match='all' => AND each;
   *              match='any' => OR inside one quoted block.
   *   excludes - "!" blocks.
   */
  function compactAlternation(patterns) {
  const distinct = [...new Set(patterns)], literals = [], complex = [];
  for (const pattern of distinct) {
    let literal = '', simple = true;
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '\\') {
        const next = pattern[++i];
        if (!next || /\w/.test(next)) { simple = false; break; }
        literal += next;
      } else if (/[.*+?^${}()|[\]\\]/.test(c)) { simple = false; break; }
      else literal += c;
    }
    (simple ? literals : complex).push(simple ? literal : pattern);
  }
  const words = literals.filter(word => !literals.some(other => word !== other && word.includes(other)));
  const tree = reverse => {
    const emit = (entries, depth) => {
      const branches = new Map();
      for (const entry of entries) {
        const first = entry[0] || '';
        if (!branches.has(first)) branches.set(first, []);
        branches.get(first).push(entry.slice(1));
      }
      const parts = [...branches].map(([first, rest]) => {
        if (!first) return '';
        const tail = rest.some(word => word.length) ? emit(rest, depth + 1) : '';
        return reverse ? tail + escapeLiteral(first) : escapeLiteral(first) + tail;
      });
      return parts.length === 1 ? parts[0] : depth ? '(' + parts.join('|') + ')' : parts.join('|');
    };
    return emit(words.map(word => reverse ? [...word].reverse() : [...word]), 0);
  };
  const raw = distinct.join('|');
  if (!words.length) return raw;
  const candidates = [raw, ...[false, true].map(reverse => [tree(reverse), ...complex].filter(Boolean).join('|'))];
  return candidates.reduce((best, candidate) => candidate.length < best.length ? candidate : best, raw);
}
  function buildRegex({ includes = [], excludes = [], always = [], match = 'all', dialect = 'poe2', maxLength = Infinity, tabletSides = null } = {}) {
  const minimum = match === 'any' ? 1 : /^atleast[2-4]$/.test(match) ? Number(match.slice(-1)) : 0;
  if (minimum > includes.length && minimum > 1) return {ok:false, reason:'insufficient-includes', minimum, count:includes.length, source:'', flags:''};
  if (minimum > 1 && dialect !== 'poe2') return {ok:false, reason:'threshold-unsupported-dialect', source:'', flags:''};
  if (dialect === 'poe2') {
    const quote = pattern => '"' + pattern + '"';
    if ([...always,...includes,...excludes].some(pattern => !pattern || /["\r\n]/.test(pattern))) return {ok:false,reason:'invalid-fragment',source:'',flags:''};
    const tablet = Array.isArray(tabletSides) && tabletSides.length === includes.length && tabletSides.every(side => side === 'prefix' || side === 'suffix');
    const alternate = tablet ? compactAlternation : patterns => patterns.join('|');
    const blocks = [...new Set(always)].map(quote);
    if (includes.length) {
      if (minimum > 1 && tablet) {
        const indices = includes.map((_, index) => index);
        const prefixes = indices.filter(index => tabletSides[index] === 'prefix'), suffixes = indices.filter(index => tabletSides[index] === 'suffix');
        if (Math.min(2, prefixes.length) + Math.min(2, suffixes.length) < minimum) return {ok:false, reason:'impossible-tablet-count', minimum, source:'', flags:''};
        const clauses = [];
        if (minimum === 2) {
          for (const omitted of indices) clauses.push(indices.filter(index => index !== omitted));
        } else if (minimum === 3) {
          clauses.push(prefixes, suffixes);
          for (const prefix of prefixes) for (const suffix of suffixes) clauses.push(indices.filter(index => index !== prefix && index !== suffix));
        } else {
          for (const side of [prefixes, suffixes]) for (const omitted of side) clauses.push(side.filter(index => index !== omitted));
        }
        const essential = [];
        for (const clause of clauses.sort((a,b) => a.length - b.length)) if (!essential.some(other => other.every(index => clause.includes(index)))) essential.push(clause);
        blocks.push(...essential.map(clause => quote(alternate(clause.map(index => includes[index])))));
      } else if (minimum > 1) {
        const n = includes.length, width = n - minimum + 1;
        const choose = (total, count) => { let result = 1; for (let i = 1; i <= count; i++) result = result * (total - i + 1) / i; return Math.round(result); };
        const groups = choose(n, minimum - 1), repetitions = choose(n - 1, minimum - 1);
        const other = [...blocks, ...(excludes.length ? [quote('!' + excludes.join('|'))] : [])];
        const length = repetitions * includes.reduce((sum, pattern) => sum + pattern.length, 0) + groups * (width + 2) - 1 + other.reduce((sum, pattern) => sum + pattern.length + 1, 0);
        if (length > maxLength) return {ok:false, reason:'too-long', length, source:'', flags:''};
        const omitted = new Set();
        const emit = (start, remaining) => {
          if (!remaining) { blocks.push(quote(includes.filter((_, index) => !omitted.has(index)).join('|'))); return; }
          for (let i = start; i <= n - remaining; i++) { omitted.add(i); emit(i + 1, remaining - 1); omitted.delete(i); }
        };
        emit(0, minimum - 1);
      } else if (!minimum) includes.forEach(pattern => blocks.push(quote(pattern)));
      else blocks.push(quote(alternate(includes)));
    }
    if (excludes.length) blocks.push(quote('!' + alternate(excludes)));
    if (!blocks.length) return {ok:false, reason:'no-conditions', source:'', flags:''};
    const source = blocks.join(' ');
    if (source.length > maxLength) return {ok:false, reason:'too-long', length:source.length, source:'', flags:''};
    return {ok:true, reason:'ok', source, flags:''};
  }
    const flags = 'ims';
    if (dialect === 'plain') {
      if (excludes.length) return { ok: false, reason: 'exclude-unsupported-without-lookaround', source: '', flags };
      const all = [...always, ...includes];
      if (all.length > 1 && match === 'all') return { ok: false, reason: 'and-unsupported-without-lookaround', source: '', flags: flags.replace('i', '').replace('s', '') };
      return { ok: true, reason: 'ok', source: all.length === 1 ? all[0] : '(?:' + all.join('|') + ')', flags: flags.replace('i', '').replace('s', '') };
    }
    const neg = excludes.length ? '(?!' + excludes.map(p => '[\\s\\S]*' + p).join('|') + ')' : '';
    const allInc = [...always, ...(match === 'all' ? includes.map(p => '(?=[\\s\\S]*' + p + ')') : ['(?:' + includes.join('|') + ')'])];
    const pos = allInc.length ? allInc.join('') : '';
    return { ok: true, reason: 'ok', source: neg + pos, flags };
  }

  return { VERSION, LOCKED_REASON, escapeLiteral, numberInRange, numberAtLeast, numberAtMost, poe2AtLeast, poe2AtMost, affixPattern, buildRegex };
});
