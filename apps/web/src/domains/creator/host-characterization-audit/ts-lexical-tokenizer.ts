/**
 * 정규식 백트래킹이 전혀 없는 단일 패스 O(N) TS/TSX/MTS 어휘 토크나이저 및 정적·동적 import 추출기.
 */

import type {
  ExtractedImportRecord,
  ImportCategory,
  SourceFileRole,
} from "./monolith-audit-types";

export interface LexToken {
  readonly kind: "ident" | "string" | "punct" | "regex";
  readonly value: string;
  readonly line: number;
  readonly braceDepth: number;
  readonly parenDepth: number;
}

const REGEX_PREFIX_TOKENS = new Set([
  "(", "[", "{", ",", ";", ":", "=", "?", "!", "&", "|", "^", "~", "+", "-", "*", "%", "=>",
  "return", "throw", "case", "in", "of", "typeof", "instanceof", "void", "delete", "await", "yield",
]);

function isIdentStart(code: number): boolean {
  return (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || code === 95
    || code === 36
    || code > 127;
}

function isIdentPart(code: number): boolean {
  return isIdentStart(code) || (code >= 48 && code <= 57);
}

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

export function countSourceLines(text: string): number {
  if (text.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) lines += 1;
  }
  return lines;
}

export function tokenizeSource(source: string): readonly LexToken[] {
  const tokens: LexToken[] = [];
  const templateStack: number[] = [];
  let i = 0;
  let line = 1;
  let braceDepth = 0;
  let parenDepth = 0;
  let prevValue = ";";
  let failedRegexLine = -1;
  let failedSingleQuoteLine = -1;
  let failedDoubleQuoteLine = -1;

  const scanTemplateChunk = (isHead: boolean): void => {
    const start = i;
    while (i < source.length) {
      const ch = source.charCodeAt(i);
      if (ch === 92) {
        if (i + 1 < source.length && source.charCodeAt(i + 1) === 10) line += 1;
        i += 2;
        continue;
      }
      if (ch === 10) line += 1;
      if (ch === 96) {
        const raw = isHead ? source.slice(start, i) : "<template-tail>";
        tokens.push({ kind: "string", value: raw, line, braceDepth, parenDepth });
        prevValue = "<str>";
        i += 1;
        return;
      }
      if (ch === 36 && source.charCodeAt(i + 1) === 123) {
        tokens.push({ kind: "string", value: "<template-expr>", line, braceDepth, parenDepth });
        templateStack.push(braceDepth);
        prevValue = "${";
        i += 2;
        return;
      }
      i += 1;
    }
  };

  while (i < source.length) {
    const c = source.charCodeAt(i);
    if (c === 10) {
      line += 1;
      i += 1;
      continue;
    }
    if (c <= 32) {
      i += 1;
      continue;
    }
    const next = source.charCodeAt(i + 1);
    if (c === 47 && next === 47) {
      i += 2;
      while (i < source.length && source.charCodeAt(i) !== 10) i += 1;
      continue;
    }
    if (c === 47 && next === 42) {
      i += 2;
      while (i < source.length) {
        if (source.charCodeAt(i) === 10) line += 1;
        if (source.charCodeAt(i) === 42 && source.charCodeAt(i + 1) === 47) {
          i += 2;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (c === 47 && line !== failedRegexLine && REGEX_PREFIX_TOKENS.has(prevValue)) {
      let j = i + 1;
      let inCharClass = false;
      let closed = false;
      while (j < source.length) {
        const rc = source.charCodeAt(j);
        if (rc === 10 || rc === 13) break;
        if (rc === 92) {
          j += 2;
          continue;
        }
        if (rc === 91) inCharClass = true;
        else if (rc === 93) inCharClass = false;
        else if (rc === 47 && !inCharClass) {
          closed = true;
          j += 1;
          while (j < source.length && isAsciiLetter(source.charCodeAt(j))) j += 1;
          break;
        }
        j += 1;
      }
      if (closed) {
        tokens.push({ kind: "regex", value: "<regex>", line, braceDepth, parenDepth });
        prevValue = "<regex>";
        i = j;
        continue;
      }
      failedRegexLine = line;
    }
    if ((c === 39 && line !== failedSingleQuoteLine) || (c === 34 && line !== failedDoubleQuoteLine)) {
      let j = i + 1;
      let extraLines = 0;
      let closed = false;
      while (j < source.length) {
        const sc = source.charCodeAt(j);
        if (sc === 10 || sc === 13) break;
        if (sc === 92) {
          if (source.charCodeAt(j + 1) === 10) extraLines += 1;
          else if (source.charCodeAt(j + 1) === 13 && source.charCodeAt(j + 2) === 10) {
            extraLines += 1;
            j += 1;
          }
          j += 2;
          continue;
        }
        if (sc === c) {
          closed = true;
          break;
        }
        j += 1;
      }
      if (closed) {
        tokens.push({ kind: "string", value: source.slice(i + 1, j), line, braceDepth, parenDepth });
        line += extraLines;
        prevValue = "<str>";
        i = j + 1;
        continue;
      }
      if (c === 39) failedSingleQuoteLine = line;
      else failedDoubleQuoteLine = line;
    }
    if (c === 96) {
      i += 1;
      scanTemplateChunk(true);
      continue;
    }
    if (c === 123) {
      tokens.push({ kind: "punct", value: "{", line, braceDepth, parenDepth });
      braceDepth += 1;
      prevValue = "{";
      i += 1;
      continue;
    }
    if (c === 125) {
      if (templateStack.length > 0 && braceDepth === templateStack[templateStack.length - 1]) {
        templateStack.pop();
        i += 1;
        scanTemplateChunk(false);
        continue;
      }
      braceDepth = Math.max(0, braceDepth - 1);
      tokens.push({ kind: "punct", value: "}", line, braceDepth, parenDepth });
      prevValue = "}";
      i += 1;
      continue;
    }
    if (c === 40) {
      tokens.push({ kind: "punct", value: "(", line, braceDepth, parenDepth });
      parenDepth += 1;
      prevValue = "(";
      i += 1;
      continue;
    }
    if (c === 41) {
      parenDepth = Math.max(0, parenDepth - 1);
      tokens.push({ kind: "punct", value: ")", line, braceDepth, parenDepth });
      prevValue = ")";
      i += 1;
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      i += 1;
      while (i < source.length && isIdentPart(source.charCodeAt(i))) i += 1;
      const ident = source.slice(start, i);
      tokens.push({ kind: "ident", value: ident, line, braceDepth, parenDepth });
      prevValue = ident;
      continue;
    }
    if (c >= 48 && c <= 57) {
      i += 1;
      while (i < source.length) {
        const nc = source.charCodeAt(i);
        if ((nc >= 48 && nc <= 57) || isAsciiLetter(nc) || nc === 95 || nc === 46) i += 1;
        else break;
      }
      prevValue = "<num>";
      continue;
    }
    if (c === 61 && next === 62) {
      tokens.push({ kind: "punct", value: "=>", line, braceDepth, parenDepth });
      prevValue = "=>";
      i += 2;
      continue;
    }
    if ((c === 43 && next === 43) || (c === 45 && next === 45) || (next === 61 && (c === 43 || c === 45))) {
      const two = source.slice(i, i + 2);
      tokens.push({ kind: "punct", value: two, line, braceDepth, parenDepth });
      prevValue = two;
      i += 2;
      continue;
    }
    const one = source.slice(i, i + 1);
    tokens.push({ kind: "punct", value: one, line, braceDepth, parenDepth });
    prevValue = one;
    i += 1;
  }
  return tokens;
}

export function classifySourceFileRole(filePath: string): SourceFileRole {
  const normalized = filePath.split(String.fromCharCode(92)).join("/");
  if (normalized.endsWith(".d.ts")) return "ambient-dts";
  const segments = normalized.split("/");
  const baseName = segments[segments.length - 1] ?? normalized;
  for (const seg of segments) {
    if (seg === "__tests__" || seg === "__fixtures__" || seg === "fixtures" || seg === "testing") {
      return "test";
    }
  }
  if (baseName.includes(".test.") || baseName.includes(".spec.") || baseName.includes(".stories.")) {
    return "test";
  }
  return "production";
}

export function normalizeBarePackageName(specifier: string): string | null {
  if (
    specifier.length === 0
    || specifier.startsWith(".")
    || specifier.startsWith("/")
    || specifier.startsWith("@/")
    || specifier.startsWith("node:")
    || specifier.startsWith("cloudflare:")
  ) {
    return null;
  }
  const clean = specifier.split("?")[0] ?? specifier;
  const parts = clean.split("/");
  if (clean.startsWith("@")) {
    const scope = parts[0];
    const pkg = parts[1];
    return scope && pkg ? `${scope}/${pkg}` : null;
  }
  return parts[0] || null;
}

export function classifyImportCategory(specifier: string): ImportCategory {
  if (specifier.startsWith(".")) return "relative";
  if (specifier.startsWith("@/") || specifier.startsWith("@toonstudio/")) return "workspace-alias";
  if (specifier.startsWith("node:")) return "node-builtin";
  return "external-package";
}

export function extractImportsFromTokens(tokens: readonly LexToken[]): readonly ExtractedImportRecord[] {
  const records: ExtractedImportRecord[] = [];
  let idx = 0;
  while (idx < tokens.length) {
    const tok = tokens[idx];
    if (tok === undefined) break;
    if (tok.kind === "ident" && tok.value === "import") {
      const next = tokens[idx + 1];
      if (next?.kind === "punct" && next.value === "(") {
        const arg = tokens[idx + 2];
        if (arg?.kind === "string" && !arg.value.startsWith("<template")) {
          records.push({ specifier: arg.value, importKind: "dynamic-import", valueBindings: [], typeBindings: [], line: tok.line });
        }
        idx += 1;
        continue;
      }
      if (tok.braceDepth === 0 && tok.parenDepth === 0 && next !== undefined) {
        if (next.kind === "string") {
          records.push({ specifier: next.value, importKind: "side-effect-import", valueBindings: [], typeBindings: [], line: tok.line });
          idx += 2;
          continue;
        }
        let cursor = idx + 1;
        let topLevelTypeOnly = false;
        if (next.kind === "ident" && next.value === "type" && !(tokens[idx + 2]?.kind === "ident" && tokens[idx + 2]?.value === "from")) {
          topLevelTypeOnly = true;
          cursor += 1;
        }
        const valueBindings: string[] = [];
        const typeBindings: string[] = [];
        let insideNamedList = false;
        let itemTypeOnly = false;
        let itemIdents: string[] = [];
        const flushNamedItem = (): void => {
          const local = itemIdents[itemIdents.length - 1];
          if (local !== undefined) {
            if (topLevelTypeOnly || itemTypeOnly) typeBindings.push(local);
            else valueBindings.push(local);
          }
          itemTypeOnly = false;
          itemIdents = [];
        };

        while (cursor < tokens.length) {
          const cur = tokens[cursor];
          if (cur === undefined) break;
          if (!insideNamedList && cur.kind === "punct" && cur.value === ";") break;
          if (!insideNamedList && cur.kind === "ident" && cur.value === "from" && tokens[cursor + 1]?.kind === "string") {
            const specTok = tokens[cursor + 1];
            if (specTok !== undefined) {
              records.push({
                specifier: specTok.value,
                importKind: topLevelTypeOnly ? "static-type-import" : "static-import",
                valueBindings,
                typeBindings,
                line: tok.line,
              });
              cursor += 2;
            }
            break;
          }
          if (cur.kind === "punct" && cur.value === "{") {
            insideNamedList = true;
            itemTypeOnly = false;
            itemIdents = [];
          } else if (cur.kind === "punct" && cur.value === "}") {
            flushNamedItem();
            insideNamedList = false;
          } else if (insideNamedList) {
            if (cur.kind === "punct" && cur.value === ",") flushNamedItem();
            else if (
              cur.kind === "ident"
              && cur.value === "type"
              && itemIdents.length === 0
              && tokens[cursor + 1]?.kind === "ident"
              && tokens[cursor + 1]?.value !== "as"
            ) {
              itemTypeOnly = true;
            } else if (cur.kind === "ident" && cur.value !== "as") {
              itemIdents.push(cur.value);
            }
          } else if (cur.kind === "ident" && cur.value !== "as") {
            if (tokens[cursor - 1]?.value === "as" || tokens[cursor + 1]?.value !== "as") {
              if (topLevelTypeOnly) typeBindings.push(cur.value);
              else valueBindings.push(cur.value);
            }
          }
          cursor += 1;
        }
        idx = cursor;
        continue;
      }
    }
    if (tok.kind === "ident" && tok.value === "export" && tok.braceDepth === 0 && tok.parenDepth === 0) {
      let cursor = idx + 1;
      let innerBraces = 0;
      while (cursor < tokens.length) {
        const cur = tokens[cursor];
        if (cur === undefined) break;
        if (cur.kind === "punct" && cur.value === "{") innerBraces += 1;
        else if (cur.kind === "punct" && cur.value === "}") {
          innerBraces = Math.max(0, innerBraces - 1);
          if (innerBraces === 0 && tokens[cursor + 1]?.value !== "from") break;
        } else if (innerBraces === 0 && cur.kind === "punct" && cur.value === ";") {
          break;
        } else if (innerBraces === 0 && cur.kind === "ident" && cur.value === "from" && tokens[cursor + 1]?.kind === "string") {
          const specTok = tokens[cursor + 1];
          if (specTok !== undefined) {
            records.push({ specifier: specTok.value, importKind: "re-export", valueBindings: [], typeBindings: [], line: tok.line });
          }
          break;
        } else if (
          innerBraces === 0
          && cur.kind === "ident"
          && (cur.value === "function" || cur.value === "const" || cur.value === "class" || cur.value === "interface")
        ) {
          break;
        }
        cursor += 1;
      }
    }
    if (
      tok.kind === "ident"
      && tok.value === "require"
      && tokens[idx - 1]?.value !== "."
      && tokens[idx + 1]?.value === "("
      && tokens[idx + 2]?.kind === "string"
    ) {
      const arg = tokens[idx + 2];
      if (arg !== undefined && !arg.value.startsWith("<template")) {
        records.push({ specifier: arg.value, importKind: "commonjs-require", valueBindings: [], typeBindings: [], line: tok.line });
      }
    }
    idx += 1;
  }
  return records;
}

export function extractModuleImportRecords(sourceText: string): readonly ExtractedImportRecord[] {
  return extractImportsFromTokens(tokenizeSource(sourceText));
}
