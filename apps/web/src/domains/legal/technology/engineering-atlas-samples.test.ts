import { describe, expect, it } from "vitest";

import { FIXTURE_ATLAS_BUDGET, FIXTURE_ATLAS_OPFS } from "./engineering-atlas.fixtures";
import { ENGINEERING_ATLAS_ENTRIES } from "./engineering-atlas-content";
import { defaultVerifyMode, verifySample } from "./engineering-atlas-verify";
import type { EngineeringAtlasSample } from "./engineering-atlas-types";

const sample = (overrides: Partial<EngineeringAtlasSample>): EngineeringAtlasSample => ({
  kind: "teaching",
  title: { ko: "예제", en: "Sample" },
  language: "ts",
  code: "const a: number = 1;",
  explain: { ko: "설명", en: "Explain" },
  ...overrides,
});

describe("샘플 코드 검증기", () => {
  it("DOM 표준 API를 쓰는 예제는 타입 검사를 통과한다(최상위 await 포함)", () => {
    const result = verifySample("opfs-fixture", FIXTURE_ATLAS_OPFS.samples[0] as EngineeringAtlasSample);
    expect(result.messages).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("타입이 틀린 예제는 줄·열과 오류 코드를 알려준다", () => {
    const result = verifySample("bad-types", sample({ code: "const a: number = 'x';", verify: "types" }));
    expect(result.ok).toBe(false);
    expect(result.messages[0]).toMatch(/^1:\d+ TS2322/u);
  });

  it("구문이 틀린 예제는 구문 검사에서 걸린다", () => {
    expect(verifySample("bad-syntax", sample({ code: "const = ;" })).ok).toBe(false);
  });

  it("구문 검사(기본값)는 올바른 ts·js·tsx 예제를 통과시킨다", () => {
    expect(verifySample("syntax-ts", sample({ code: "const a: number = 1;\nconsole.log(a);" }))).toEqual({ ok: true, messages: [] });
    expect(verifySample("syntax-js", sample({ language: "js", code: "const a = 1;\nconsole.log(a);" }))).toEqual({ ok: true, messages: [] });
    expect(
      verifySample("syntax-tsx", sample({ language: "tsx", code: "const view = <div className=\"a\">hi</div>;\nconsole.log(view);" })),
    ).toEqual({ ok: true, messages: [] });
  });

  it("저장소에 설치된 패키지의 타입으로 검사한다", () => {
    const ok = verifySample(
      "yjs-fixture",
      sample({ verify: "types", code: "import * as Y from 'yjs';\nconst doc = new Y.Doc();\nconst layers = doc.getMap<string>('layers');\nlayers.set('a', 'b');" }),
    );
    expect(ok.messages).toEqual([]);
    const bad = verifySample("yjs-bad", sample({ verify: "types", code: "import * as Y from 'yjs';\nconst doc = new Y.Doc();\ndoc.noSuchMethod();" }));
    expect(bad.ok).toBe(false);
  });

  it("JSON 은 파싱하고, bash·python·rust 는 기본적으로 검증하지 않는다", () => {
    expect(verifySample("json-ok", sample({ language: "json", code: '{"a": 1}' })).ok).toBe(true);
    expect(verifySample("json-bad", sample({ language: "json", code: '{a: 1}' })).ok).toBe(false);
    expect(defaultVerifyMode({ language: "bash" })).toBe("none");
    expect(defaultVerifyMode({ language: "ts" })).toBe("syntax");
    expect(verifySample("py", sample({ language: "python", code: "def (:" })).ok).toBe(true);
    expect(verifySample("py-types", sample({ language: "python", verify: "types", code: "x = 1" })).ok).toBe(false);
  });

  it("두 번째 예제(예산 가드)도 타입 검사를 통과한다", () => {
    for (const [index, item] of FIXTURE_ATLAS_BUDGET.samples.entries()) {
      expect(verifySample(`budget-${index}`, item).messages).toEqual([]);
    }
  });
});

describe("게시된 도감 샘플 코드", () => {
  const targets = ENGINEERING_ATLAS_ENTRIES.flatMap((entry) =>
    entry.samples.flatMap((item, index) => [
      { id: `${entry.id}-${index + 1}`, sample: item, code: item.code },
      ...(item.codeEn ? [{ id: `${entry.id}-${index + 1}-en`, sample: item, code: item.codeEn }] : []),
    ]),
  );

  it("모든 샘플은 지정한 검증(types/syntax)을 통과한다", () => {
    const failures = targets.flatMap((target) => {
      const result = verifySample(target.id, target.sample, target.code);
      return result.ok ? [] : [`${target.id}: ${result.messages.join(" | ")}`];
    });
    expect(failures).toEqual([]);
  }, 180_000);

  it("가능한 한 타입 검증을 쓴다(웹 표준 API·설치 패키지만 쓰는 TypeScript 예제는 types)", () => {
    const loose = targets.filter((target) => ["ts", "tsx"].includes(target.sample.language) && defaultVerifyMode(target.sample) === "syntax");
    // 구문 검증만 하는 TS 예제는 전체의 절반을 넘지 않아야 한다(타입 오류를 놓치기 쉬운 예제를 줄인다).
    expect(loose.length).toBeLessThanOrEqual(Math.ceil(targets.length / 2));
  });
});
