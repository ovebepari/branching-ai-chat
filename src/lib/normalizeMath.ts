/**
 * Normalize LLM math markup so remark-math + KaTeX render it correctly.
 *
 * Responses are stored in the DB exactly as the model produced them; all
 * cleanup happens here, at render time. Two kinds of fixes are applied to
 * prose (fenced code blocks and inline code spans are never touched):
 *
 * 1. LaTeX delimiters → dollar delimiters. remark-math only understands `$`
 *    and `$$`; `\[ … \]` and `\( … \)` otherwise render as literal brackets.
 *
 * 2. Glued display-math fences. Models often write:
 *
 *      $$\begin{aligned}
 *      2x + 3y &= 8 \\
 *      \end{aligned}$$
 *
 *    remark-math treats text after an opening `$$` as discarded "meta" (like
 *    a code fence's language tag) and only closes on a bare `$$` line — so
 *    `\begin{aligned}` is dropped, KaTeX errors on the stray `&`, and the
 *    unclosed block swallows the rest of the message. These blocks, and
 *    standalone single-line `$$…$$`, are rewritten to the fenced form:
 *
 *      $$
 *      \begin{aligned}
 *      …
 *      \end{aligned}
 *      $$
 *
 * Unclosed constructs (e.g. mid-stream) are left as-is.
 */

const CODE_FENCE_RE = /^\s*(`{3,}|~{3,})/;
const DISPLAY_OPEN_RE = /^(\s*)\$\$(.*)$/;
// A code span: a run of N backticks up to the next run of exactly N.
const INLINE_CODE_RE = /(`+)[\s\S]*?(?<!`)\1(?!`)/g;
// `(?<!\\)` skips `\\[4pt]` (LaTeX line break with spacing) and `\\(`.
const LATEX_DISPLAY_RE = /(?<!\\)\\\[([\s\S]+?)(?<!\\)\\\]/g;
const LATEX_INLINE_RE = /(?<!\\)\\\(([\s\S]+?)(?<!\\)\\\)/g;

export function normalizeMath(markdown: string): string {
  if (!markdown.includes('$$') && !markdown.includes('\\[') && !markdown.includes('\\(')) {
    return markdown;
  }

  return splitByCodeFences(markdown)
    .map((seg) => (seg.code ? seg.text : fenceDisplayMath(convertLatexDelimiters(seg.text))))
    .join('\n');
}

/** Split into alternating prose / fenced-code segments (joined back with '\n'). */
function splitByCodeFences(markdown: string): { code: boolean; text: string }[] {
  const segments: { code: boolean; text: string }[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  const flush = (code: boolean) => {
    if (current.length) segments.push({ code, text: current.join('\n') });
    current = [];
  };

  for (const line of markdown.split('\n')) {
    const m = line.match(CODE_FENCE_RE);
    if (!fence) {
      if (m) {
        flush(false);
        fence = m[1];
      }
      current.push(line);
    } else {
      current.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) {
        flush(true);
        fence = null;
      }
    }
  }
  flush(fence !== null); // an unclosed fence runs to the end (as in markdown)
  return segments;
}

/** `\[…\]` → `$$…$$`, `\(…\)` → `$…$`, skipping inline code spans. */
function convertLatexDelimiters(text: string): string {
  if (!text.includes('\\[') && !text.includes('\\(')) return text;

  const convert = (s: string) =>
    s
      .replace(LATEX_DISPLAY_RE, (_, inner: string) => `$$${inner}$$`)
      .replace(LATEX_INLINE_RE, (_, inner: string) => `$${inner.trim()}$`);

  let out = '';
  let last = 0;
  for (const m of text.matchAll(INLINE_CODE_RE)) {
    out += convert(text.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + convert(text.slice(last));
}

/** Rewrite glued / single-line `$$` display math into the fenced form. */
function fenceDisplayMath(text: string): string {
  if (!text.includes('$$')) return text;

  const lines = text.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = line.match(DISPLAY_OPEN_RE);
    if (!open) {
      out.push(line);
      continue;
    }
    const [, indent, rest] = open;

    // Single line: `$$ … $$` on its own line → display block.
    const sameLineClose = rest.indexOf('$$');
    if (sameLineClose !== -1) {
      const inner = rest.slice(0, sameLineClose).trim();
      const after = rest.slice(sameLineClose + 2).trim();
      if (inner && !after) {
        out.push(`${indent}$$`, `${indent}${inner}`, `${indent}$$`);
      } else {
        // `$$x$$ followed by prose` is intentional inline math — leave it.
        out.push(line);
      }
      continue;
    }

    // Multi-line: find the line carrying the closing `$$`.
    let j = i + 1;
    while (j < lines.length && !lines[j].includes('$$')) j++;
    if (j >= lines.length) {
      out.push(line);
      continue;
    }

    const closing = lines[j];
    const closeIdx = closing.indexOf('$$');
    const beforeClose = closing.slice(0, closeIdx);
    const afterClose = closing.slice(closeIdx + 2).trim();

    if (!rest.trim() && !beforeClose.trim() && !afterClose) {
      // Already well-formed — copy through unchanged.
      out.push(...lines.slice(i, j + 1));
    } else {
      out.push(`${indent}$$`);
      if (rest.trim()) out.push(`${indent}${rest.trim()}`);
      out.push(...lines.slice(i + 1, j));
      if (beforeClose.trim()) out.push(beforeClose.trimEnd());
      out.push(`${indent}$$`);
      if (afterClose) out.push(`${indent}${afterClose}`);
    }
    i = j;
  }

  return out.join('\n');
}
