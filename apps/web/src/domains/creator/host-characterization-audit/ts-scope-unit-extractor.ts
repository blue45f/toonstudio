/**
 * 토큰 스트림 기반 스코프 선언(함수·화살표 클로저·훅·상태 바인딩) 경계 추출기.
 */

import { scoreDomainByText, type MonolithDomainId } from "./monolith-audit-types";
import type { LexToken } from "./ts-lexical-tokenizer";

export interface ExtractedUnit {
  readonly id: string;
  readonly name: string;
  readonly kind: "function" | "arrow-fn" | "hook-call" | "state-binding" | "const-expr";
  readonly scopeDepth: 0 | 1;
  readonly startLine: number;
  readonly endLine: number;
  readonly lineCount: number;
  readonly bodyStartTokenIdx: number;
  readonly bodyEndTokenIdx: number;
  readonly isAsync: boolean;
  readonly paramNames: ReadonlySet<string>;
  readonly localDeclaredNames: ReadonlySet<string>;
  readonly referencedIdents: ReadonlySet<string>;
  readonly invokedHooks: readonly string[];
  readonly mutatedRefs: readonly string[];
  readonly touchesAmbientGlobal: boolean;
  domainId: MonolithDomainId;
}

const IMPURE_AMBIENT_GLOBALS = new Set([
  "window", "document", "navigator", "history", "fetch", "XMLHttpRequest",
  "WebSocket", "Worker", "SharedWorker", "BroadcastChannel", "chromium", "process",
]);

const JS_KEYWORDS = new Set([
  "const", "let", "var", "function", "async", "await", "return", "if", "else", "for", "while",
  "do", "switch", "case", "default", "break", "continue", "try", "catch", "finally", "throw",
  "new", "typeof", "instanceof", "in", "of", "void", "delete", "true", "false", "null",
  "undefined", "this", "super", "class", "extends", "import", "export", "from", "as", "type",
  "interface", "readonly", "satisfies", "keyof", "Number", "String", "Boolean", "Object",
  "Array", "Map", "Set", "Math", "JSON", "Promise", "Error", "URL", "RegExp", "Symbol",
]);

function isHookName(name: string): boolean {
  return name.length >= 4 && name.startsWith("use") && name.charCodeAt(3) >= 65 && name.charCodeAt(3) <= 90;
}

export function findMatchingBraceEnd(tokens: readonly LexToken[], openBraceIdx: number): number {
  const openTok = tokens[openBraceIdx];
  if (openTok === undefined) return openBraceIdx;
  const targetDepth = openTok.braceDepth;
  for (let k = openBraceIdx + 1; k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t !== undefined && t.kind === "punct" && t.value === "}" && t.braceDepth === targetDepth) return k;
  }
  return tokens.length - 1;
}

function findMatchingParenEnd(tokens: readonly LexToken[], openParenIdx: number): number {
  const openTok = tokens[openParenIdx];
  if (openTok === undefined) return openParenIdx;
  const targetDepth = openTok.parenDepth;
  for (let k = openParenIdx + 1; k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t !== undefined && t.kind === "punct" && t.value === ")" && t.parenDepth === targetDepth) return k;
  }
  return tokens.length - 1;
}

function findFunctionBodyBrace(tokens: readonly LexToken[], closeParenIdx: number): number {
  const baseTok = tokens[closeParenIdx];
  if (baseTok === undefined) return -1;
  const baseBrace = baseTok.braceDepth;
  const baseParen = baseTok.parenDepth;
  let k = closeParenIdx + 1;
  while (k < tokens.length) {
    const t = tokens[k];
    if (t === undefined) break;
    if (t.braceDepth < baseBrace || (t.braceDepth === baseBrace && t.parenDepth === baseParen && t.value === ";")) return -1;
    if (t.braceDepth === baseBrace && t.parenDepth === baseParen && t.kind === "punct" && t.value === "{") {
      const prev = tokens[k - 1]?.value ?? "";
      if (prev === ":" || prev === "|" || prev === "&" || prev === "=>" || prev === "readonly") {
        k = findMatchingBraceEnd(tokens, k) + 1;
        continue;
      }
      return k;
    }
    k += 1;
  }
  return -1;
}

function collectParamNames(tokens: readonly LexToken[], openParenIdx: number, closeParenIdx: number): Set<string> {
  const params = new Set<string>();
  const baseParen = (tokens[openParenIdx]?.parenDepth ?? 0) + 1;
  let inTypeAnnotation = false;
  for (let k = openParenIdx + 1; k < closeParenIdx; k += 1) {
    const t = tokens[k];
    if (t === undefined) continue;
    if (t.parenDepth === baseParen && t.value === ",") {
      inTypeAnnotation = false;
      continue;
    }
    if (t.parenDepth === baseParen && (t.value === ":" || t.value === "=")) {
      inTypeAnnotation = true;
      continue;
    }
    if (!inTypeAnnotation && t.kind === "ident" && !JS_KEYWORDS.has(t.value)) params.add(t.value);
  }
  return params;
}

function inspectTokenSlice(tokens: readonly LexToken[], startIdx: number, endIdx: number, bodyBraceDepth: number) {
  const localDeclaredNames = new Set<string>();
  const referencedIdents = new Set<string>();
  const invokedHooks: string[] = [];
  const mutatedRefs = new Set<string>();
  let touchesAmbientGlobal = false;

  for (let k = startIdx; k <= endIdx && k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t === undefined || t.kind !== "ident") continue;
    const prev = tokens[k - 1];
    const next = tokens[k + 1];
    if (prev?.kind === "punct" && prev.value === ".") continue;
    if (
      t.braceDepth >= bodyBraceDepth
      && prev?.kind === "ident"
      && (prev.value === "const" || prev.value === "let" || prev.value === "var" || prev.value === "function")
    ) {
      localDeclaredNames.add(t.value);
      continue;
    }
    if (IMPURE_AMBIENT_GLOBALS.has(t.value) || (t.value === "page" && next?.value === ".")) {
      touchesAmbientGlobal = true;
    }
    if (!JS_KEYWORDS.has(t.value)) referencedIdents.add(t.value);
    if (isHookName(t.value)) {
      let look = k + 1;
      if (tokens[look]?.value === "<") {
        let angle = 1;
        look += 1;
        while (look <= endIdx && angle > 0) {
          if (tokens[look]?.value === "<") angle += 1;
          else if (tokens[look]?.value === ">") angle -= 1;
          look += 1;
        }
      }
      if (tokens[look]?.value === "(") invokedHooks.push(t.value);
    }
    const op = tokens[k + 3]?.value;
    if (next?.value === "." && tokens[k + 2]?.value === "current" && (op === "=" || op === "+=" || op === "-=" || op === "++" || op === "--")) {
      mutatedRefs.add(t.value);
    }
  }
  return { localDeclaredNames, referencedIdents, invokedHooks, mutatedRefs: [...mutatedRefs].sort(), touchesAmbientGlobal };
}

export function extractScopeUnits(
  tokens: readonly LexToken[],
  rangeStart: number,
  rangeEnd: number,
  targetBraceDepth: 0 | 1,
  statePairs: Map<string, string>,
  refNames: Set<string>,
  scopeBindings: Set<string>,
): ExtractedUnit[] {
  const units: ExtractedUnit[] = [];
  let idx = rangeStart;
  while (idx <= rangeEnd && idx < tokens.length) {
    const tok = tokens[idx];
    if (tok === undefined) break;
    if (tok.braceDepth !== targetBraceDepth || tok.parenDepth !== 0) {
      idx += 1;
      continue;
    }
    let fnIdx = idx;
    let isAsync = false;
    if (tok.kind === "ident" && tok.value === "export") fnIdx += 1;
    if (tokens[fnIdx]?.kind === "ident" && tokens[fnIdx]?.value === "default") fnIdx += 1;
    if (tokens[fnIdx]?.kind === "ident" && tokens[fnIdx]?.value === "async") {
      isAsync = true;
      fnIdx += 1;
    }
    if (tokens[fnIdx]?.kind === "ident" && tokens[fnIdx]?.value === "function") {
      const nameTok = tokens[fnIdx + 1];
      if (nameTok?.kind === "ident") {
        let parenOpen = fnIdx + 2;
        while (parenOpen <= rangeEnd && tokens[parenOpen]?.braceDepth === targetBraceDepth && tokens[parenOpen]?.value !== "(") parenOpen += 1;
        if (tokens[parenOpen]?.value === "(") {
          const parenClose = findMatchingParenEnd(tokens, parenOpen);
          const bodyBrace = findFunctionBodyBrace(tokens, parenClose);
          if (bodyBrace !== -1) {
            const bodyEnd = findMatchingBraceEnd(tokens, bodyBrace);
            const slice = inspectTokenSlice(tokens, bodyBrace + 1, bodyEnd - 1, targetBraceDepth + 1);
            const startLine = tok.line;
            const endLine = tokens[bodyEnd]?.line ?? startLine;
            scopeBindings.add(nameTok.value);
            units.push({
              id: `${targetBraceDepth}:${nameTok.value}@${startLine}`,
              name: nameTok.value,
              kind: "function",
              scopeDepth: targetBraceDepth,
              startLine,
              endLine,
              lineCount: Math.max(1, endLine - startLine + 1),
              bodyStartTokenIdx: bodyBrace + 1,
              bodyEndTokenIdx: bodyEnd - 1,
              isAsync,
              paramNames: collectParamNames(tokens, parenOpen, parenClose),
              localDeclaredNames: slice.localDeclaredNames,
              referencedIdents: slice.referencedIdents,
              invokedHooks: slice.invokedHooks,
              mutatedRefs: slice.mutatedRefs,
              touchesAmbientGlobal: slice.touchesAmbientGlobal,
              domainId: scoreDomainByText(nameTok.value),
            });
            idx = bodyEnd + 1;
            continue;
          }
        }
      }
    }
    let declIdx = idx;
    if (tok.kind === "ident" && tok.value === "export") declIdx += 1;
    const kwTok = tokens[declIdx];
    if (kwTok?.kind === "ident" && (kwTok.value === "const" || kwTok.value === "let")) {
      let eqIdx = declIdx + 1;
      while (eqIdx <= rangeEnd && !(tokens[eqIdx]?.braceDepth === targetBraceDepth && tokens[eqIdx]?.parenDepth === 0 && tokens[eqIdx]?.value === "=")) {
        if (tokens[eqIdx]?.braceDepth === targetBraceDepth && tokens[eqIdx]?.parenDepth === 0 && tokens[eqIdx]?.value === ";") break;
        eqIdx += 1;
      }
      if (tokens[eqIdx]?.value === "=") {
        let stmtEnd = eqIdx + 1;
        while (stmtEnd <= rangeEnd) {
          const st = tokens[stmtEnd];
          if (st === undefined || st.braceDepth < targetBraceDepth) break;
          if (st.braceDepth === targetBraceDepth && st.parenDepth === 0) {
            if (st.value === ";") break;
            const prevTok = tokens[stmtEnd - 1];
            if (
              stmtEnd > eqIdx + 1
              && prevTok !== undefined
              && st.line > prevTok.line
              && st.kind === "ident"
              && (st.value === "const" || st.value === "let" || st.value === "function" || st.value === "async" || st.value === "return" || isHookName(st.value))
              && prevTok.value !== "="
              && prevTok.value !== "?"
              && prevTok.value !== ":"
              && prevTok.value !== "&&"
              && prevTok.value !== "||"
            ) {
              stmtEnd -= 1;
              break;
            }
          }
          stmtEnd += 1;
        }
        const boundNames: string[] = [];
        for (let b = declIdx + 1; b < eqIdx; b += 1) {
          const bt = tokens[b];
          if (bt?.kind === "ident" && !JS_KEYWORDS.has(bt.value) && tokens[b + 1]?.value !== ":") {
            boundNames.push(bt.value);
            scopeBindings.add(bt.value);
          }
        }
        const rhsFirst = tokens[eqIdx + 1];
        if (tokens[declIdx + 1]?.value === "[" && boundNames.length >= 2 && rhsFirst?.kind === "ident" && (rhsFirst.value === "useState" || rhsFirst.value === "useReducer")) {
          const vName = boundNames[0];
          const sName = boundNames[1];
          if (vName !== undefined && sName !== undefined) statePairs.set(sName, vName);
        }
        for (const bn of boundNames) {
          if (bn.endsWith("Ref")) refNames.add(bn);
          else if (bn.length >= 4 && bn.startsWith("set") && bn.charCodeAt(3) >= 65 && bn.charCodeAt(3) <= 90 && !statePairs.has(bn)) {
            statePairs.set(bn, bn.slice(3, 4).toLowerCase() + bn.slice(4));
          }
        }
        let arrowIdx = -1;
        let arrowParams = new Set<string>();
        let rhsAsync = false;
        let checkIdx = eqIdx + 1;
        if (tokens[checkIdx]?.value === "async") {
          rhsAsync = true;
          checkIdx += 1;
        }
        if (tokens[checkIdx]?.value === "<") {
          let angle = 1;
          checkIdx += 1;
          while (checkIdx < stmtEnd && angle > 0) {
            if (tokens[checkIdx]?.value === "<") angle += 1;
            else if (tokens[checkIdx]?.value === ">") angle -= 1;
            checkIdx += 1;
          }
        }
        if (tokens[checkIdx]?.value === "(") {
          const closeP = findMatchingParenEnd(tokens, checkIdx);
          let afterP = closeP + 1;
          while (afterP < stmtEnd && tokens[afterP]?.value !== "=>" && tokens[afterP]?.braceDepth === targetBraceDepth) afterP += 1;
          if (tokens[afterP]?.value === "=>") {
            arrowIdx = afterP;
            arrowParams = collectParamNames(tokens, checkIdx, closeP);
          }
        }
        const primaryName = boundNames[0] ?? `binding_L${tok.line}`;
        const slice = inspectTokenSlice(tokens, eqIdx + 1, Math.min(stmtEnd, rangeEnd), targetBraceDepth + 1);
        const startLine = tok.line;
        const endLine = tokens[Math.min(stmtEnd, rangeEnd)]?.line ?? startLine;
        const kind: ExtractedUnit["kind"] = arrowIdx !== -1
          ? "arrow-fn"
          : slice.invokedHooks.some((h) => h === "useState" || h === "useReducer" || h === "useRef")
            ? "state-binding"
            : slice.invokedHooks.length > 0 ? "hook-call" : "const-expr";
        units.push({
          id: `${targetBraceDepth}:${primaryName}@${startLine}`,
          name: primaryName,
          kind,
          scopeDepth: targetBraceDepth,
          startLine,
          endLine,
          lineCount: Math.max(1, endLine - startLine + 1),
          bodyStartTokenIdx: eqIdx + 1,
          bodyEndTokenIdx: Math.min(stmtEnd, rangeEnd),
          isAsync: rhsAsync,
          paramNames: arrowParams,
          localDeclaredNames: slice.localDeclaredNames,
          referencedIdents: slice.referencedIdents,
          invokedHooks: slice.invokedHooks,
          mutatedRefs: slice.mutatedRefs,
          touchesAmbientGlobal: slice.touchesAmbientGlobal,
          domainId: scoreDomainByText(boundNames.join("_")),
        });
        idx = stmtEnd + 1;
        continue;
      }
    }
    if (tok.kind === "ident" && isHookName(tok.value) && tokens[idx + 1]?.value === "(") {
      const closeParen = findMatchingParenEnd(tokens, idx + 1);
      const slice = inspectTokenSlice(tokens, idx, closeParen, targetBraceDepth + 1);
      const startLine = tok.line;
      const endLine = tokens[closeParen]?.line ?? startLine;
      const syntheticName = `${tok.value}_L${startLine}`;
      units.push({
        id: `${targetBraceDepth}:${syntheticName}@${startLine}`,
        name: syntheticName,
        kind: "hook-call",
        scopeDepth: targetBraceDepth,
        startLine,
        endLine,
        lineCount: Math.max(1, endLine - startLine + 1),
        bodyStartTokenIdx: idx,
        bodyEndTokenIdx: closeParen,
        isAsync: false,
        paramNames: new Set(),
        localDeclaredNames: slice.localDeclaredNames,
        referencedIdents: slice.referencedIdents,
        invokedHooks: slice.invokedHooks.length > 0 ? slice.invokedHooks : [tok.value],
        mutatedRefs: slice.mutatedRefs,
        touchesAmbientGlobal: slice.touchesAmbientGlobal,
        domainId: scoreDomainByText(`${tok.value}_${[...slice.referencedIdents].slice(0, 8).join("_")}`),
      });
      idx = closeParen + 1;
      continue;
    }
    idx += 1;
  }
  return units;
}
