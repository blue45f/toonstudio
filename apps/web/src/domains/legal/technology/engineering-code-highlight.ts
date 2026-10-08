import type { EngineeringCodeLanguage } from "./engineering-atlas-types";

/**
 * 외부 의존성 없는 경량 구문 강조 토크나이저.
 *
 * - 발표 화면에서 키워드·문자열·주석을 구분해 읽기 쉽게 하는 것이 목적이다(완전한 파서가 아니다).
 * - 무손실이다: 토큰 텍스트를 이어 붙이면 입력과 정확히 같다(테스트로 보장). 그래서 복사 결과도 원본과 같다.
 */

export type CodeTokenKind = "comment" | "string" | "number" | "keyword" | "type" | "function" | "property" | "punct" | "plain";

export interface CodeToken {
  readonly kind: CodeTokenKind;
  readonly text: string;
}

export type CodeLine = readonly CodeToken[];

interface LanguageSpec {
  readonly line: readonly string[];
  readonly block?: readonly [string, string];
  readonly keywords: ReadonlySet<string>;
  readonly quotes: string;
  readonly ignoreCase?: boolean;
  /** `"key": value`, `key = value` 형태의 키를 property 로 칠한다. */
  readonly keyValue?: boolean;
  readonly atRules?: boolean;
  readonly tags?: boolean;
  readonly variables?: boolean;
}

const words = (list: string): ReadonlySet<string> => new Set(list.split(/\s+/u).filter(Boolean));

const JS_KEYWORDS = words(
  "const let var function return if else for while do switch case break continue new class extends implements interface type enum import export from as default async await try catch finally throw typeof instanceof in of void delete yield static readonly public private protected abstract declare namespace satisfies keyof infer is this super null undefined true false get set",
);

const SPECS: Record<EngineeringCodeLanguage, LanguageSpec> = {
  ts: { line: ["//"], block: ["/*", "*/"], keywords: JS_KEYWORDS, quotes: "\"'`" },
  tsx: { line: ["//"], block: ["/*", "*/"], keywords: JS_KEYWORDS, quotes: "\"'`" },
  js: { line: ["//"], block: ["/*", "*/"], keywords: JS_KEYWORDS, quotes: "\"'`" },
  json: { line: [], keywords: words("true false null"), quotes: "\"", keyValue: true },
  bash: {
    line: ["#"],
    keywords: words("if then else elif fi for in do done while until case esac function export local return set unset"),
    quotes: "\"'",
    variables: true,
  },
  python: {
    line: ["#"],
    keywords: words(
      "def class return if elif else for while in not and or is import from as with try except finally raise lambda yield pass break continue None True False async await global nonlocal",
    ),
    quotes: "\"'",
  },
  rust: {
    line: ["//"],
    block: ["/*", "*/"],
    keywords: words(
      "fn let mut pub use mod struct enum impl trait for in if else match return loop while as const static ref self Self crate super where type unsafe async await move dyn true false",
    ),
    quotes: "\"",
  },
  css: { line: [], block: ["/*", "*/"], keywords: words(""), quotes: "\"'", keyValue: true, atRules: true },
  html: { line: [], block: ["<!--", "-->"], keywords: words(""), quotes: "\"'", tags: true },
  sql: {
    line: ["--"],
    block: ["/*", "*/"],
    keywords: words(
      "select from where insert into values update set delete create table index primary key not null default references join left right inner outer on group by order limit offset and or as unique constraint begin commit rollback with returning alter add drop cascade if exists using",
    ),
    quotes: "'\"",
    ignoreCase: true,
  },
  toml: { line: ["#"], keywords: words("true false"), quotes: "\"'", keyValue: true },
  yaml: { line: ["#"], keywords: words("true false null"), quotes: "\"'", keyValue: true },
  text: { line: [], keywords: words(""), quotes: "" },
};

const PUNCT = new Set([..."{}[]()<>=+-*/%&|!?:;,.~^@"]);
const isIdentStart = (char: string): boolean => /[A-Za-z_$]/u.test(char);
/** 하이픈이 이름의 일부인 언어(CSS 속성, HTML 태그, YAML/TOML 키, 셸 옵션). */
const HYPHEN_IN_NAMES = new Set<EngineeringCodeLanguage>(["css", "html", "yaml", "toml", "bash"]);
const isIdentPart = (char: string, allowHyphen: boolean): boolean => (allowHyphen ? /[A-Za-z0-9_$-]/u : /[A-Za-z0-9_$]/u).test(char);

function readString(code: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < code.length) {
    const char = code[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    if (char === "\n" && quote !== "`") return index;
    index += 1;
  }
  return code.length;
}

function nextSignificant(code: string, from: number): string {
  for (let index = from; index < code.length; index += 1) {
    const char = code[index] as string;
    if (char !== " " && char !== "\t") return char;
  }
  return "";
}

function scan(code: string, spec: LanguageSpec, language: EngineeringCodeLanguage): CodeToken[] {
  const tokens: CodeToken[] = [];
  const push = (kind: CodeTokenKind, text: string): void => {
    if (text) tokens.push({ kind, text });
  };
  let previousSignificant = "";
  let index = 0;
  while (index < code.length) {
    const char = code[index] as string;

    if (/\s/u.test(char)) {
      let end = index + 1;
      while (end < code.length && /\s/u.test(code[end] as string)) end += 1;
      push("plain", code.slice(index, end));
      index = end;
      continue;
    }

    if (spec.block && code.startsWith(spec.block[0], index)) {
      const close = code.indexOf(spec.block[1], index + spec.block[0].length);
      const end = close === -1 ? code.length : close + spec.block[1].length;
      push("comment", code.slice(index, end));
      index = end;
      previousSignificant = "";
      continue;
    }

    const lineStarter = spec.line.find((starter) => code.startsWith(starter, index));
    if (lineStarter && !(language === "bash" && code[index - 1] === "$")) {
      const newline = code.indexOf("\n", index);
      const end = newline === -1 ? code.length : newline;
      push("comment", code.slice(index, end));
      index = end;
      continue;
    }

    if (spec.quotes.includes(char)) {
      const end = readString(code, index, char);
      const kind: CodeTokenKind = spec.keyValue && nextSignificant(code, end) === ":" ? "property" : "string";
      push(kind, code.slice(index, end));
      previousSignificant = char;
      index = end;
      continue;
    }

    if (spec.tags && char === "<") {
      const match = /^<\/?[A-Za-z][\w-]*/u.exec(code.slice(index));
      if (match) {
        push("keyword", match[0]);
        index += match[0].length;
        previousSignificant = "<";
        continue;
      }
    }

    if (spec.variables && char === "$") {
      const match = /^\$(?:\{[^}\n]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@#?$!*-])/u.exec(code.slice(index));
      if (match) {
        push("type", match[0]);
        index += match[0].length;
        previousSignificant = "x";
        continue;
      }
    }

    if (spec.atRules && char === "@") {
      const match = /^@[A-Za-z-]+/u.exec(code.slice(index));
      if (match) {
        push("keyword", match[0]);
        index += match[0].length;
        previousSignificant = "x";
        continue;
      }
    }

    if (/[0-9]/u.test(char) || (char === "." && /[0-9]/u.test(code[index + 1] ?? ""))) {
      const match = /^(?:0[xX][0-9a-fA-F_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)(?:[a-zA-Z%]{0,3})/u.exec(code.slice(index));
      if (match && match[0]) {
        push("number", match[0]);
        index += match[0].length;
        previousSignificant = "0";
        continue;
      }
    }

    if (isIdentStart(char) || (language === "css" && char === "-" && code[index + 1] === "-")) {
      const allowHyphen = HYPHEN_IN_NAMES.has(language);
      let end = index + 1;
      while (end < code.length && isIdentPart(code[end] as string, allowHyphen)) end += 1;
      const word = code.slice(index, end);
      const lookup = spec.ignoreCase ? word.toLowerCase() : word;
      const next = nextSignificant(code, end);
      let kind: CodeTokenKind = "plain";
      if (spec.keywords.has(lookup)) kind = "keyword";
      else if (spec.keyValue && (next === ":" || next === "=") && previousSignificant !== ".") kind = "property";
      else if (next === "(") kind = "function";
      else if (/^[A-Z][A-Za-z0-9]+$/u.test(word)) kind = "type";
      else if (previousSignificant === ".") kind = "property";
      push(kind, word);
      index = end;
      previousSignificant = "x";
      continue;
    }

    push(PUNCT.has(char) ? "punct" : "plain", char);
    previousSignificant = char;
    index += 1;
  }
  return tokens;
}

function mergeAdjacent(tokens: readonly CodeToken[]): CodeToken[] {
  const merged: CodeToken[] = [];
  for (const token of tokens) {
    const last = merged.at(-1);
    if (last && last.kind === token.kind && (token.kind === "plain" || token.kind === "punct")) {
      merged[merged.length - 1] = { kind: last.kind, text: last.text + token.text };
    } else merged.push(token);
  }
  return merged;
}

/** 코드를 줄 단위 토큰으로 나눈다. `lines.map(join).join("\n")` 은 입력(개행 정규화 후)과 같다. */
export function tokenizeCode(code: string, language: EngineeringCodeLanguage): readonly CodeLine[] {
  const normalized = code.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
  const spec = SPECS[language];
  const tokens = language === "text" ? [{ kind: "plain" as const, text: normalized }] : scan(normalized, spec, language);
  const lines: CodeToken[][] = [[]];
  for (const token of mergeAdjacent(tokens)) {
    const parts = token.text.split("\n");
    parts.forEach((part, partIndex) => {
      if (partIndex > 0) lines.push([]);
      if (part) (lines[lines.length - 1] as CodeToken[]).push({ kind: token.kind, text: part });
    });
  }
  return lines;
}

export function codeLineText(line: CodeLine): string {
  return line.map((token) => token.text).join("");
}

export const CODE_LANGUAGE_LABEL: Record<EngineeringCodeLanguage, string> = {
  ts: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  json: "JSON",
  bash: "Shell",
  css: "CSS",
  html: "HTML",
  python: "Python",
  rust: "Rust",
  sql: "SQL",
  toml: "TOML",
  yaml: "YAML",
  text: "Text",
};
