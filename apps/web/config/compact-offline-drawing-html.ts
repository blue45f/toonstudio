import { createHash } from "node:crypto";

import { transformWithEsbuild } from "vite";

const scriptHash = (source: string): string => createHash("sha256").update(source).digest("base64");

interface ScriptBlock {
  readonly openTag: string;
  readonly code: string;
  readonly closeTag: string;
  readonly start: number;
  readonly end: number;
}

const SCRIPT_STRUCTURE_ERROR =
  "긴급 복구 HTML은 CSP 하나와 외부 의존성이 없는 모듈 하나를 포함해야 합니다.";

function isHtmlTagDelimiter(ch: string | undefined): boolean {
  return (
    ch === ">" ||
    ch === "/" ||
    ch === " " ||
    ch === "\t" ||
    ch === "\n" ||
    ch === "\r" ||
    ch === "\f"
  );
}

function isInlineModuleOpenTag(openTag: string): boolean {
  const lower = openTag.toLowerCase();
  if (!lower.startsWith("<script") || !lower.endsWith(">")) return false;
  const inner = openTag.slice("<script".length, -1);
  if (inner.length === 0 || !isHtmlTagDelimiter(inner[0]) || inner[0] === ">" || inner[0] === "/") {
    return false;
  }
  const attr = inner.trim().toLowerCase();
  return attr === 'type="module"' || attr === "type='module'";
}

function isCleanScriptCloseTag(closeTag: string): boolean {
  const lower = closeTag.toLowerCase();
  if (!lower.startsWith("</script") || !lower.endsWith(">")) return false;
  return lower.slice("</script".length, -1).trim().length === 0;
}

function containsScriptEndTagSequence(text: string): boolean {
  const lower = text.toLowerCase();
  let cursor = 0;
  while (cursor < lower.length) {
    const idx = lower.indexOf("</script", cursor);
    if (idx < 0) return false;
    if (isHtmlTagDelimiter(lower[idx + 8])) return true;
    cursor = idx + 8;
  }
  return false;
}

/**
 * HTML5 종료 태그 변형(`</script\t\n bar>` 등)까지 모두 인식하는 선형 스캐너로
 * 스크립트 블록 경계를 추출해 정규식 기반 HTML 태그 필터링 우회를 차단한다.
 */
function findScriptBlocks(source: string): ScriptBlock[] {
  const lower = source.toLowerCase();
  const blocks: ScriptBlock[] = [];
  let cursor = 0;

  while (cursor < lower.length) {
    const openStart = lower.indexOf("<script", cursor);
    if (openStart < 0) break;
    if (!isHtmlTagDelimiter(lower[openStart + 7])) {
      cursor = openStart + 7;
      continue;
    }
    const openEnd = source.indexOf(">", openStart + 7);
    if (openEnd < 0) throw new Error(SCRIPT_STRUCTURE_ERROR);

    let searchFrom = openEnd + 1;
    let closeStart = -1;
    while (searchFrom < lower.length) {
      const candidate = lower.indexOf("</script", searchFrom);
      if (candidate < 0) break;
      if (isHtmlTagDelimiter(lower[candidate + 8])) {
        closeStart = candidate;
        break;
      }
      searchFrom = candidate + 8;
    }
    if (closeStart < 0) throw new Error(SCRIPT_STRUCTURE_ERROR);

    const closeEnd = source.indexOf(">", closeStart + 8);
    if (closeEnd < 0) throw new Error(SCRIPT_STRUCTURE_ERROR);

    blocks.push({
      openTag: source.slice(openStart, openEnd + 1),
      code: source.slice(openEnd + 1, closeStart),
      closeTag: source.slice(closeStart, closeEnd + 1),
      start: openStart,
      end: closeEnd + 1,
    });
    cursor = closeEnd + 1;
  }

  return blocks;
}

/** 독립 복구 HTML의 모듈만 압축하고, 동일 코드만 허용하도록 기존 CSP 해시를 교체한다. */
export async function compactOfflineDrawingHtml(source: string): Promise<string> {
  const scripts = findScriptBlocks(source);
  const policies = [...source.matchAll(/(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/giu)];
  const script = scripts[0];
  const policy = policies[0];
  if (
    scripts.length !== 1 ||
    !script ||
    !isInlineModuleOpenTag(script.openTag) ||
    !isCleanScriptCloseTag(script.closeTag) ||
    policies.length !== 1 ||
    !policy
  ) {
    throw new Error(SCRIPT_STRUCTURE_ERROR);
  }
  const originalCode = script.code;
  const originalPolicy = policy[2] ?? "";
  const originalHash = scriptHash(originalCode);
  const scriptDirectives = originalPolicy.split(";").map((entry) => entry.trim()).filter((entry) => /^script-src(?:\s|$)/u.test(entry));
  if (scriptDirectives.length !== 1 || scriptDirectives[0] !== `script-src 'sha256-${originalHash}'`) {
    throw new Error("긴급 복구 HTML의 기존 CSP 해시가 실행 코드와 일치하지 않습니다.");
  }
  const { code } = await transformWithEsbuild(originalCode, "offline-draw/portable.js", {
    loader: "js",
    format: "esm",
    target: "es2020",
    minify: true,
    legalComments: "inline",
    sourcemap: false,
  });
  if (containsScriptEndTagSequence(code)) {
    throw new Error(SCRIPT_STRUCTURE_ERROR);
  }
  const compactPolicy = originalPolicy.replace(`'sha256-${originalHash}'`, `'sha256-${scriptHash(code)}'`);
  const policyStart = policy.index ?? -1;
  const policyEnd = policyStart + policy[0].length;
  if (policyStart < 0 || (policyStart < script.end && script.start < policyEnd)) {
    throw new Error(SCRIPT_STRUCTURE_ERROR);
  }
  const replacements = [
    { start: script.start, end: script.end, text: `${script.openTag}${code}${script.closeTag}` },
    { start: policyStart, end: policyEnd, text: `${policy[1]}${compactPolicy}${policy[3]}` },
  ].sort((a, b) => b.start - a.start);
  let compacted = source;
  for (const replacement of replacements) {
    compacted = `${compacted.slice(0, replacement.start)}${replacement.text}${compacted.slice(replacement.end)}`;
  }
  return compacted;
}
