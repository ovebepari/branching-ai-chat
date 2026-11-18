/**
 * Normalize display-math delimiters so remark-math parses them correctly.
 *
 * LLMs often glue `$$` directly onto the math content:
 *
 *   $$\begin{aligned}
 *   2x + 3y &= 8 \\
 *   \end{aligned}$$
 *
 * remark-math treats `$$` followed by text as an opening fence whose trailing
 * text is "meta" (silently discarded, like a code fence's language tag), and
 * only accepts a bare `$$` line as the closing fence. So `\begin{aligned}` is
 * dropped, KaTeX errors on the stray `&`, and the unclosed block swallows the
 * rest of the message.
 *
 * This rewrites such blocks — and standalone single-line `$$...$$` — into the
 * fenced form remark-math expects:
 *
 *   $$
 *   \begin{aligned}
 *   ...
 *   \end{aligned}
 *   $$
 *
 * Fenced code blocks are left untouched. Unclosed blocks (e.g. mid-stream) are
 * left as-is.
 */

const CODE_FENCE_RE = /^\s*(`{3,}|~{3,})/;
const DISPLAY_OPEN_RE = /^(\s*)\$\$(.*)$/;

export function normalizeMath(markdown: string): string {
  if (!markdown.includes('$$')) return markdown;

  const lines = markdown.split('\n');
  const out: string[] = [];
  let codeFence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pass fenced code blocks through verbatim.
    const fenceMatch = line.match(CODE_FENCE_RE);
    if (codeFence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === codeFence[0] &&
        fenceMatch[1].length >= codeFence.length &&
        line.trim() === fenceMatch[1]
      ) {
        codeFence = null;
      }
      out.push(line);
      continue;
    }
    if (fenceMatch) {
      codeFence = fenceMatch[1];
      out.push(line);
      continue;
    }

    const open = line.match(DISPLAY_OPEN_RE);
    if (!open) {
      out.push(line);
      continue;
    }
    const [, indent, rest] = open;

    // Single line: `$$ ... $$` on its own line → display block.
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
