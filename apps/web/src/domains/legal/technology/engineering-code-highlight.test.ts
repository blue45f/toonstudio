import { describe, expect, it } from "vitest";

import type { EngineeringCodeLanguage } from "./engineering-atlas-types";
import { codeLineText, tokenizeCode, type CodeTokenKind } from "./engineering-code-highlight";

const kindsOf = (code: string, language: EngineeringCodeLanguage): Map<string, CodeTokenKind> => {
  const map = new Map<string, CodeTokenKind>();
  for (const line of tokenizeCode(code, language)) for (const token of line) if (token.kind !== "plain" && token.kind !== "punct") map.set(token.text, token.kind);
  return map;
};

const roundTrip = (code: string, language: EngineeringCodeLanguage): string =>
  tokenizeCode(code, language).map(codeLineText).join("\n");

const SAMPLES: readonly (readonly [EngineeringCodeLanguage, string])[] = [
  ["ts", "const root = await navigator.storage.getDirectory(); // OPFS\n/* 여러 줄\n주석 */\nconst tpl = `a ${1 + 2}\nb`;\nasync function run<T>(x: T): Promise<T> { return x; }"],
  ["tsx", "export function App() { return <div className=\"a\">{count}</div>; }"],
  ["json", "{\n  \"name\": \"toon\",\n  \"count\": 12,\n  \"ok\": true,\n  \"none\": null\n}"],
  ["bash", "# 설치\nexport PATH=\"$HOME/bin:$PATH\"\nif [ -f ./a ]; then echo \"${NAME}\"; fi\npnpm install --frozen-lockfile"],
  ["python", "def run(x):\n    # 주석\n    return [i for i in range(10) if i % 2 == 0]"],
  ["rust", "pub fn add(a: i32, b: i32) -> i32 {\n    a + b // 합\n}"],
  ["css", ".card { --gap: 12px; color: var(--color-fg); }\n@media (min-width: 40rem) { .card { gap: 1.5rem; } }"],
  ["sql", "SELECT id, name FROM works WHERE owner_id = 'a' -- 내 작품\nORDER BY created_at DESC LIMIT 10;"],
  ["yaml", "services:\n  - name: api\n    plan: free # 무료\n    autoDeployTrigger: \"off\""],
  ["toml", "[build]\ncommand = \"pnpm build\"\nretries = 3"],
  ["html", "<!-- 주석 -->\n<div class=\"a\">텍스트</div>"],
  ["text", "Pointer → smoothing → path/tip\n   ↘ document command"],
];

describe("경량 구문 강조", () => {
  it.each(SAMPLES)("%s 코드는 토큰을 이어 붙이면 원본과 같다(무손실)", (language, code) => {
    expect(roundTrip(code, language)).toBe(code);
  });

  it("줄 수가 원본과 같고 끝의 빈 줄은 무시한다", () => {
    expect(tokenizeCode("a\nb\nc\n\n", "text")).toHaveLength(3);
    expect(tokenizeCode("a\r\nb", "ts")).toHaveLength(2);
  });

  it("TypeScript: 키워드·문자열·주석·함수·타입·숫자를 구분한다", () => {
    const kinds = kindsOf("const total = add(10, 'x'); // 합계\ntype Foo = Bar;", "ts");
    expect(kinds.get("const")).toBe("keyword");
    expect(kinds.get("add")).toBe("function");
    expect(kinds.get("10")).toBe("number");
    expect(kinds.get("'x'")).toBe("string");
    expect(kinds.get("// 합계")).toBe("comment");
    expect(kinds.get("Bar")).toBe("type");
    expect(kinds.get("type")).toBe("keyword");
  });

  it("여러 줄 템플릿 문자열과 블록 주석은 줄마다 같은 종류로 이어진다", () => {
    const lines = tokenizeCode("const a = `x\ny`;\n/* 가\n나 */", "ts");
    expect(lines[0]?.some((token) => token.kind === "string")).toBe(true);
    expect(lines[1]?.some((token) => token.kind === "string")).toBe(true);
    expect(lines[3]?.[0]?.kind).toBe("comment");
  });

  it("JSON 키는 property, 값 문자열은 string 이다", () => {
    const kinds = kindsOf('{"name": "toon", "ok": true}', "json");
    expect(kinds.get('"name"')).toBe("property");
    expect(kinds.get('"toon"')).toBe("string");
    expect(kinds.get("true")).toBe("keyword");
  });

  it("셸 변수와 주석, SQL 대소문자 무시 키워드를 알아본다", () => {
    expect(kindsOf("echo $HOME # 홈", "bash").get("$HOME")).toBe("type");
    expect(kindsOf("echo $HOME # 홈", "bash").get("# 홈")).toBe("comment");
    expect(kindsOf("select a from b", "sql").get("select")).toBe("keyword");
    expect(kindsOf("SELECT a FROM b", "sql").get("FROM")).toBe("keyword");
  });

  it("text 언어는 강조하지 않는다", () => {
    expect(kindsOf("const a = 1", "text").size).toBe(0);
  });
});
