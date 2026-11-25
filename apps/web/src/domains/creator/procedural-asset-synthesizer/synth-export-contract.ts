import type { ProceduralAssetSynthInput, ProceduralAssetSynthResult } from "./procedural-asset-synth-engine";

/** 외부 결과의 자원 예산과 원문을 검사한 뒤 같은 입력의 생성 결과와 비교한다. */
export function assertSynthesizedResult(result: ProceduralAssetSynthResult, build: (input: ProceduralAssetSynthInput) => ProceduralAssetSynthResult): void {
  let budget = 30_000;
  const ancestors = new WeakSet<object>();
  function visit(value: unknown, depth: number): void {
    if (--budget < 0 || depth > 20) throw new RangeError("합성 결과가 너무 큽니다.");
    if (value === undefined || value === null || typeof value === "boolean") return;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new RangeError("합성 결과의 수치 범위를 벗어났습니다.");
      return;
    }
    if (typeof value === "string") {
      if (value.length > 4096) throw new RangeError("합성 결과의 원문이 너무 깁니다.");
      for (const char of value) {
        const code = char.codePointAt(0) ?? 0;
        if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || (code >= 0xd800 && code <= 0xdfff)) throw new RangeError("XML에서 표현할 수 없는 문자입니다.");
      }
      return;
    }
    if (typeof value !== "object" || ancestors.has(value)) throw new RangeError("지원하지 않거나 순환하는 합성 결과입니다.");
    ancestors.add(value);
    if (Array.isArray(value)) {
      if (value.length > 2048) throw new RangeError("합성 결과 배열이 너무 큽니다.");
      for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index)) throw new RangeError("희소 배열은 지원하지 않습니다.");
        visit(value[index], depth + 1);
      }
    } else {
      const entries = Object.entries(value);
      if (entries.length > 64) throw new RangeError("합성 결과의 속성이 너무 많습니다.");
      for (const [, child] of entries) visit(child, depth + 1);
    }
    ancestors.delete(value);
  }
  function compare(actual: unknown, expected: unknown, key = ""): void {
    if (["nameKo", "nameEn"].includes(key) && typeof actual === "string" && typeof expected === "string") return;
    if (actual === expected) return;
    if (typeof actual !== "object" || actual === null || typeof expected !== "object" || expected === null || Array.isArray(actual) !== Array.isArray(expected)) throw new RangeError("원래 생성 결과와 내보내기 데이터가 일치하지 않습니다.");
    const a: [string, unknown][] = Object.entries(actual); const b: [string, unknown][] = Object.entries(expected);
    if (a.length !== b.length) throw new RangeError("합성 결과 구조가 일치하지 않습니다.");
    const values = new Map(a);
    for (const [name, item] of b) {
      if (!values.has(name)) throw new RangeError("합성 결과 속성이 누락됐습니다.");
      compare(values.get(name), item, name);
    }
  }
  visit(result, 0);
  if (!result?.params) throw new RangeError("합성 입력 이력이 없습니다.");
  compare(result, build(result.params));
}
