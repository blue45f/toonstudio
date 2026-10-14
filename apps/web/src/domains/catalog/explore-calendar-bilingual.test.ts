import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * /explore · /calendar 이중언어 편입 고정 테스트.
 *
 * 두 페이지의 UI 라벨은 catalog 표면의 기존 관습(useBilingual의 bt(ko, en),
 * [ko, en] 튜플, formatI18nTemplate)만으로 표시돼야 한다. 이 테스트는 소스를
 * 스캔해 다음을 고정한다.
 *  1. 한글을 포함한 문자열 리터럴은 전부 bt(...)의 첫 인자이거나, bt(...pair)로
 *     펼쳐지는 [ko, en] 튜플의 첫 원소이거나, 그런 튜플을 값으로 갖는 데이터
 *     키(WEEK_DAY_LABEL의 요일 키)뿐이다 — 감싸지지 않은 하드코딩 한글 0건.
 *  2. 문자열 리터럴을 모두 걷어낸 자리(JSX 텍스트 등)에는 한글이 남지 않는다.
 *  3. bt(...) 호출은 인자가 정확히 2개이거나 튜플 스프레드 1개뿐이다.
 * 주석은 표시 라벨이 아니므로 스캔에서 제외한다(기존 이주 표면들과 동일).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANGUL = /[가-힣]/u;

interface Literal {
  start: number;
  end: number;
  raw: string;
}

/** 주석을 공백으로 지우고(인덱스 보존) 문자열/템플릿 리터럴 목록을 돌려준다. */
function scan(source: string): { stripped: string; literals: Literal[] } {
  const chars = source.split("");
  const literals: Literal[] = [];
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k += 1) if (chars[k] !== "\n") chars[k] = " ";
  };
  while (i < source.length) {
    const ch = source[i] ?? "";
    const next = source[i + 1] ?? "";
    if (ch === "/" && next === "/") {
      const start = i;
      while (i < source.length && source[i] !== "\n") i += 1;
      blank(start, i);
      continue;
    }
    if (ch === "/" && next === "*") {
      const start = i;
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      blank(start, i);
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      const start = i;
      i += 1;
      let depth = 0;
      while (i < source.length) {
        const c = source[i] ?? "";
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (quote === "`" && c === "$" && source[i + 1] === "{") {
          depth += 1;
          i += 2;
          continue;
        }
        if (quote === "`" && depth > 0) {
          if (c === "{") depth += 1;
          if (c === "}") depth -= 1;
          i += 1;
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      literals.push({ start, end: i, raw: source.slice(start, i) });
      continue;
    }
    i += 1;
  }
  return { stripped: chars.join(""), literals };
}

function isCovered(stripped: string, literals: Literal[], lit: Literal): boolean {
  const before = stripped.slice(0, lit.start).trimEnd();
  // bt("한글", "English") — bt의 첫 인자.
  if (before.endsWith("bt(")) return true;
  // ["한글", "English"] 튜플의 첫 원소 (SORTS/TYPES/WEEK_DAY_LABEL 값).
  if (before.endsWith("[")) {
    const after = stripped.slice(lit.end).trimStart();
    if (after.startsWith(",")) return true;
  }
  // "수": ["수요일", "Wednesday"] — 튜플을 값으로 갖는 데이터 키.
  const after = stripped.slice(lit.end).trimStart();
  if (after.startsWith(": [")) return true;
  return false;
}

function uncoveredHangul(source: string): string[] {
  const { stripped, literals } = scan(source);
  const findings: string[] = [];
  for (const lit of literals) {
    if (!HANGUL.test(lit.raw)) continue;
    if (!isCovered(stripped, literals, lit)) {
      const line = source.slice(0, lit.start).split("\n").length;
      findings.push(`line ${line}: ${lit.raw.slice(0, 60)}`);
    }
  }
  // 리터럴을 걷어낸 뒤 남는 한글 = JSX 텍스트 등 리터럴 밖 하드코딩.
  const chars = stripped.split("");
  for (const lit of literals) {
    for (let k = lit.start; k < lit.end; k += 1) if (chars[k] !== "\n") chars[k] = " ";
  }
  const rest = chars.join("");
  rest.split("\n").forEach((lineText, index) => {
    if (HANGUL.test(lineText)) findings.push(`line ${index + 1} (JSX/code): ${lineText.trim().slice(0, 60)}`);
  });
  return findings;
}

/** bt(...) 호출의 최상위 인자 개수 목록. 스프레드는 ".spread" 로 표시한다. */
function btCallArities(source: string): (number | ".spread")[] {
  const { stripped, literals } = scan(source);
  const literalEnd = new Map(literals.map((lit) => [lit.start, lit.end]));
  const arities: (number | ".spread")[] = [];
  const re = /\bbt\(/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stripped)) !== null) {
    let i = match.index + match[0].length;
    const bodyStart = i;
    let depth = 1;
    const commas: number[] = [];
    let close = -1;
    while (i < stripped.length && depth > 0) {
      const litEnd = literalEnd.get(i);
      if (litEnd !== undefined) {
        i = litEnd;
        continue;
      }
      const c = stripped[i] ?? "";
      if (c === "(" || c === "[" || c === "{") depth += 1;
      if (c === ")" || c === "]" || c === "}") {
        depth -= 1;
        if (depth === 0) close = i;
      }
      if (depth === 1 && c === ",") commas.push(i);
      i += 1;
    }
    const body = stripped.slice(bodyStart, close === -1 ? i : close);
    if (body.trimStart().startsWith("...")) {
      arities.push(".spread");
      continue;
    }
    // 마지막 쉼표 뒤에 리터럴도 코드도 없으면 trailing comma — 인자로 세지 않는다.
    let separators = commas.length;
    if (separators > 0 && close !== -1) {
      const lastComma = commas[separators - 1] ?? bodyStart;
      const tail = stripped.slice(lastComma + 1, close);
      const hasLiteral = literals.some((lit) => lit.start > lastComma && lit.end <= close);
      if (!hasLiteral && tail.trim() === "") separators -= 1;
    }
    arities.push(separators + 1);
  }
  return arities;
}

const PAGES = ["ExplorePage.tsx", "CalendarPage.tsx"] as const;

describe("/explore · /calendar 이중언어 편입", () => {
  for (const page of PAGES) {
    const source = readFileSync(path.join(HERE, page), "utf8");

    it(`${page}: 감싸지지 않은 하드코딩 한글 리터럴이 0건이다`, () => {
      expect(uncoveredHangul(source)).toEqual([]);
    });

    it(`${page}: catalog 관습(useBilingual)을 쓰고 bt 인자는 (ko, en) 쌍 또는 튜플 스프레드뿐이다`, () => {
      expect(source).toContain('from "@/shared/lib/i18n-bilingual-copy"');
      expect(source).toContain("useBilingual(");
      const arities = btCallArities(source);
      expect(arities.length).toBeGreaterThanOrEqual(20);
      for (const arity of arities) {
        expect(arity === 2 || arity === ".spread").toBe(true);
      }
    });
  }

  it("두 페이지 모두 영문 라벨을 함께 등록한다 (en 로케일 표시 가능)", () => {
    for (const page of PAGES) {
      const source = readFileSync(path.join(HERE, page), "utf8");
      const { literals } = scan(source);
      const pairs = literals.filter((lit) => HANGUL.test(lit.raw)).length;
      expect(pairs).toBeGreaterThanOrEqual(20);
    }
  });
});
