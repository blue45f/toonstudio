import { describe, expect, it } from "vitest";

import {
  buildComputedAbr,
  buildSampledAbr,
} from "../../../../tests/corpus/brushes/abr/synthetic-abr";
import { importAbr } from "../abr";
import { decodeAbrPreviewBrushes } from "../abr-preview";
import { SafeXmlError, parseSafeXml } from "../format-common";
import { SvgParseError, parseSvgToScene } from "../svg";
import { matchPaintUrl, scanTransformCalls } from "../svg-syntax-scan";

/**
 * 외부에서 받은 파일(브러시 묶음·SVG·OpenRaster)을 읽는 포맷 게이트웨이의 최악 입력 시간 회귀 테스트
 * (CodeQL js/polynomial-redos). 정규식이 입력 길이의 제곱 시간이면 수십~수백 KB 한 장으로 탭이 수 초에서
 * 수십 분까지 멈춘다. 아래 입력은 수정 전 구현에서 각각 2.4~8.9초가 걸렸고(상한 1초의 2배 이상), 선형 시간이면 수십 ms 안에
 * 끝난다. 상한은 느린 CI 에서도 흔들리지 않게 1초로 넉넉히 둔다. SVG `url(` 계열은 공백 6만 칸일 때 수정 전에도 1.2~1.4초뿐이라
 * 더 빠른 기계에서는 되돌려도 통과할 수 있어 15만 칸으로 키웠다(수정 전 7~9초).
 */
const LINEAR_TIME_BUDGET_MS = 1_000;

function timed<T>(run: () => T): { value: T | undefined; error: unknown; elapsedMs: number } {
  const startedAt = performance.now();
  let value: T | undefined;
  let error: unknown = null;
  try {
    value = run();
  } catch (caught) {
    error = caught;
  }
  return { value, error, elapsedMs: performance.now() - startedAt };
}

/**
 * 입력을 마음껏 키울 수 없는 경우를 위한 "입력 크기를 키웠을 때의 시간 배율" 검사. ABR 이름은 `String.fromCharCode(...chars)` 의
 * 인자 수 한계(스택 때문에 약 12.5만 글자) 아래로만 키울 수 있어서, 절대 시간만 보면 더 빠른 기계에서 수정 전 구현도 상한 안에
 * 들어올 수 있다. 입력을 8배 키웠을 때 선형이면 시간도 8배 안팎, 제곱이면 64배 안팎이라 24배를 경계로 둔다.
 * 한 번 튀는 값에 흔들리지 않게 각각 3번 중 가장 빠른 값을 쓰고, 분모는 5ms 아래로 내려가지 않게 해 잡음이 배율을 부풀리지 못하게 한다.
 */
const MAX_GROWTH_RATIO = 24;
const MIN_BASELINE_MS = 5;

function fastestTimed<T>(run: () => T, repeat = 3) {
  let best = timed(run);
  for (let attempt = 1; attempt < repeat; attempt += 1) {
    const next = timed(run);
    if (next.elapsedMs < best.elapsedMs) best = next;
  }
  return best;
}

describe("XML 엔티티 해독의 선형 시간", () => {
  it("';' 없이 '&' 만 길게 이어진 본문도 제곱 시간이 되지 않는다", () => {
    const body = "&".repeat(80_000);
    const { value, error, elapsedMs } = timed(() => parseSafeXml(`<root>${body}</root>`));
    expect(error).toBeNull();
    expect(value?.text).toBe(body);
    expect(elapsedMs, "본문 엔티티 해독 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("속성 값의 '&' 열도 제곱 시간이 되지 않는다", () => {
    const body = "&".repeat(80_000);
    const { value, error, elapsedMs } = timed(() => parseSafeXml(`<root a="${body}"/>`));
    expect(error).toBeNull();
    expect(value?.attrs.a).toBe(body);
    expect(elapsedMs, "속성 엔티티 해독 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("끝에 ';' 가 하나 있어도 '&' 열은 한 번에 읽고 알 수 없는 엔티티로 거부한다", () => {
    const { error, elapsedMs } = timed(() => parseSafeXml(`<root>${"&".repeat(80_000)};</root>`));
    expect(error).toBeInstanceOf(SafeXmlError);
    expect(error).toMatchObject({ code: "xml-entity-invalid" });
    expect(elapsedMs, "알 수 없는 엔티티 거부 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });
});

/** 수정 전 구현(정규식)을 그대로 옮겨 둔 기준. 판정 보존을 대조하는 데만 쓴다. */
const LEGACY_XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

function legacyDecode(value: string): string {
  return value.replace(/&([^;]+);/gu, (whole, body: string) => {
    const named = LEGACY_XML_ENTITIES[body];
    if (named !== undefined) return named;
    const hex = body.startsWith("#x") || body.startsWith("#X");
    const decimal = body.startsWith("#") && !hex;
    if (!hex && !decimal) {
      throw new SafeXmlError(`unknown XML entity ${whole}`, "xml-entity-invalid");
    }
    const parsed = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 0 ||
      parsed > 0x10ffff ||
      (parsed >= 0xd800 && parsed <= 0xdfff)
    ) {
      throw new SafeXmlError(`invalid XML character reference ${whole}`, "xml-entity-invalid");
    }
    return String.fromCodePoint(parsed);
  });
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("XML 엔티티 해독의 판정 보존", () => {
  it.each([
    ["이름 있는 엔티티", "a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;", "a & b <c> \"d\" 'e'"],
    ["10진 문자 참조", "&#65;&#44032;", "A가"],
    ["16진 문자 참조", "&#x41;&#X1F600;", "A😀"],
    ["';' 가 없는 '&' 는 그대로", "a & b &amp c", "a & b &amp c"],
    ["빈 본문 '&;' 는 그대로", "x &; y", "x &; y"],
    ["엔티티 뒤의 짝 없는 '&'", "&amp; & end", "& & end"],
  ])("%s", (_label, source, expected) => {
    expect(parseSafeXml(`<r>${source}</r>`).text).toBe(expected);
  });

  it.each([
    ["알 수 없는 이름", "&nbsp;", "xml-entity-invalid"],
    ["'&' 사이의 공백이 이름에 들어가는 경우", "&a &amp;", "xml-entity-invalid"],
    ["서로게이트 범위 문자 참조", "&#xD800;", "xml-entity-invalid"],
    ["유니코드 범위를 넘는 문자 참조", "&#x110000;", "xml-entity-invalid"],
    ["숫자가 아닌 문자 참조", "&#xZZ;", "xml-entity-invalid"],
  ])("%s 는 계속 거부한다", (_label, source, code) => {
    const { error } = timed(() => parseSafeXml(`<r>${source}</r>`));
    expect(error).toBeInstanceOf(SafeXmlError);
    expect(error).toMatchObject({ code });
  });

  it("무작위 짧은 문자열 3,000건에서 수정 전 정규식 구현과 결과·오류가 같다", () => {
    const alphabet = ["&", ";", "a", "m", "p", "#", "x", "4", "1", " ", "l", "t", "D", "8", "0"];
    const random = seededRandom(20_261_015);
    for (let caseIndex = 0; caseIndex < 3_000; caseIndex += 1) {
      const length = Math.floor(random() * 14);
      let source = "";
      for (let index = 0; index < length; index += 1) {
        source += alphabet[Math.floor(random() * alphabet.length)] ?? "";
      }
      const expected = timed(() => legacyDecode(source));
      const actual = timed(() => parseSafeXml(`<r>${source}</r>`).text);
      if (expected.error instanceof SafeXmlError) {
        expect(actual.error, `입력 ${JSON.stringify(source)}`).toBeInstanceOf(SafeXmlError);
        expect(actual.error).toMatchObject({ code: expected.error.code });
      } else {
        expect(actual.error, `입력 ${JSON.stringify(source)}`).toBeNull();
        expect(actual.value, `입력 ${JSON.stringify(source)}`).toBe(expected.value);
      }
    }
  });
});

/**
 * 엔티티 이름은 바깥 파일에서 온 임의 문자열이라 표를 `표[이름]` 으로 바로 읽으면 Object.prototype 의 키가 걸린다.
 * 수정 전에는 `&constructor;` 가 "function Object() { [native code] }", `&__proto__;` 가 "[object Object]" 로 풀려 본문에 들어갔다.
 * 위의 무작위 대조는 알파벳에 'c'·'o'·'_' 가 없어 이 이름들을 만들 수 없으므로 이름을 직접 점검한다.
 */
describe("XML 엔티티 표 조회는 등록된 이름만 푼다", () => {
  const PROTOTYPE_NAMES = Object.getOwnPropertyNames(Object.prototype);

  it("점검 대상 Object.prototype 속성 이름 목록에 대표 이름이 들어 있다", () => {
    expect(PROTOTYPE_NAMES).toEqual(
      expect.arrayContaining(["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]),
    );
  });

  it.each(PROTOTYPE_NAMES)("&%s; 는 본문·속성 어디서도 풀리지 않고 알 수 없는 엔티티로 거부한다", (name) => {
    for (const source of [`<r>&${name};</r>`, `<r a="&${name};"/>`]) {
      const { value, error } = timed(() => parseSafeXml(source));
      expect(value, source).toBeUndefined();
      expect(error, source).toBeInstanceOf(SafeXmlError);
      expect(error).toMatchObject({ code: "xml-entity-invalid", message: `unknown XML entity &${name};` });
    }
  });

  it.each([
    ["amp", "&"],
    ["lt", "<"],
    ["gt", ">"],
    ["quot", '"'],
    ["apos", "'"],
  ])("등록된 &%s; 는 본문과 속성 값에서 모두 풀린다", (name, expected) => {
    const parsed = parseSafeXml(`<r a="&${name};">&${name};</r>`);
    expect(parsed.text).toBe(expected);
    expect(parsed.attrs.a).toBe(expected);
  });

  it.each([
    ["10진", "&#65;", "A"],
    ["16진 소문자 x", "&#x41;", "A"],
    ["16진 대문자 X", "&#X41;", "A"],
    ["유니코드 상한", "&#x10FFFF;", String.fromCodePoint(0x10ffff)],
    ["서로게이트 범위 바로 아래", "&#xD7FF;", String.fromCodePoint(0xd7ff)],
    ["서로게이트 범위 바로 위", "&#xE000;", String.fromCodePoint(0xe000)],
  ])("숫자 참조 %s 는 계속 풀린다", (_label, reference, expected) => {
    expect(parseSafeXml(`<r>${reference}</r>`).text).toBe(expected);
  });

  it.each([
    ["서로게이트 범위 시작", "&#xD800;"],
    ["서로게이트 범위 끝", "&#xDFFF;"],
    ["유니코드 상한 초과", "&#x110000;"],
    ["숫자가 아닌 16진", "&#xZZ;"],
    ["숫자가 없는 참조", "&#;"],
    ["음수", "&#-1;"],
  ])("숫자 참조 %s 는 계속 거부한다", (_label, reference) => {
    const { error } = timed(() => parseSafeXml(`<r>${reference}</r>`));
    expect(error).toBeInstanceOf(SafeXmlError);
    expect(error).toMatchObject({ code: "xml-entity-invalid" });
  });
});

describe("SVG transform·paint 해석의 선형 시간", () => {
  it("괄호 없이 영문자만 길게 이어진 transform 도 제곱 시간이 되지 않고 같은 오류로 거부한다", () => {
    const { error, elapsedMs } = timed(() =>
      parseSvgToScene(`<svg width="10" height="10"><rect width="5" height="5" transform="${"A".repeat(80_000)}"/></svg>`),
    );
    expect(error).toBeInstanceOf(SvgParseError);
    expect(String((error as Error).message)).toContain("unparseable transform fragment");
    expect(elapsedMs, "transform 해석 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("닫히지 않은 함수 호출이 길게 반복돼도 transform 해석이 제곱 시간이 되지 않는다", () => {
    const { error, elapsedMs } = timed(() =>
      parseSvgToScene(`<svg width="10" height="10"><rect width="5" height="5" transform="${"translate(".repeat(10_000)}"/></svg>`),
    );
    expect(error).toBeInstanceOf(SvgParseError);
    expect(elapsedMs, "transform 해석 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("url( 뒤에 공백이 길게 이어진 fill 도 제곱 시간이 되지 않는다", () => {
    const { value, error, elapsedMs } = timed(() =>
      parseSvgToScene(`<svg width="10" height="10"><rect width="5" height="5" fill="url(${" ".repeat(150_000)}x"/></svg>`),
    );
    expect(error).toBeNull();
    expect(value?.scene.nodes.length).toBeGreaterThan(0);
    expect(elapsedMs, "paint url 해석 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("')' 뒤 꼬리에 줄바꿈이 낀 url() fill 도 제곱 시간이 되지 않는다", () => {
    const { error, elapsedMs } = timed(() =>
      parseSvgToScene(`<svg width="10" height="10"><rect width="5" height="5" fill="url(#a)${" ".repeat(150_000)}x\ny"/></svg>`),
    );
    expect(error).toBeNull();
    expect(elapsedMs, "paint url 꼬리 해석 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });
});

describe("SVG transform·paint 해석의 판정 보존", () => {
  it("여러 transform 함수를 앞에서부터 곱한다", () => {
    const { scene } = parseSvgToScene(
      `<svg width="100" height="100"><rect width="10" height="10" transform="translate(5 6) scale(2),rotate(90)"/></svg>`,
    );
    const rect = scene.nodes[0];
    expect(rect?.kind).toBe("fill-path");
  });

  it.each([
    ["함수 사이 쓰레기", "translate(1 2) junk scale(2)"],
    ["꼬리 쓰레기", "translate(1 2) junk"],
    ["알 수 없는 함수", "wobble(1)"],
    ["인자 개수 오류", "translate(1 2 3)"],
    ["숫자가 아닌 인자", "translate(a b)"],
  ])("%s 는 계속 SvgParseError 로 거부한다", (_label, transform) => {
    const { error } = timed(() =>
      parseSvgToScene(`<svg width="10" height="10"><rect width="5" height="5" transform="${transform}"/></svg>`),
    );
    expect(error).toBeInstanceOf(SvgParseError);
  });

  it.each([
    ["문서 안 참조", 'fill="url(#g)"', true],
    ["공백이 낀 참조", 'fill="url( #g )"', true],
    ["따옴표 참조", `fill="url('#g')"`, true],
    ["이중 따옴표 참조", `fill='url("#g")'`, true],
    ["대체 색이 붙은 참조", 'fill="url(#g) red"', true],
    ["외부 참조", 'fill="url(https://example.test/a.svg)"', false],
  ])("%s 는 수정 전과 같은 경고를 낸다", (_label, attribute, resolvable) => {
    const { warnings } = parseSvgToScene(
      `<svg width="10" height="10"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="5" height="5" ${attribute}/></svg>`,
    );
    expect(warnings.some((warning) => warning.includes("cannot be resolved"))).toBe(!resolvable);
  });
});

describe("ABR 이름 끝 NUL 정리의 선형 시간", () => {
  // 큰 쪽은 스택 한계(약 12.5만 글자) 아래로 두고, 작은 쪽은 그 8분의 1이다.
  const SMALL_NAME_NULS = 12_500;
  const LARGE_NAME_NULS = 100_000;

  it("이름 앞에 NUL 이 길게 이어져도 제곱 시간이 되지 않는다", () => {
    const abrWithNuls = (count: number) =>
      buildComputedAbr({ version: 2, name: `${"\0".repeat(count)}a`, spacingPct: 25, angleDeg: 0, roundness: 50, diameterPx: 32 });
    const smallBytes = abrWithNuls(SMALL_NAME_NULS);
    const largeBytes = abrWithNuls(LARGE_NAME_NULS);
    const small = fastestTimed(() => importAbr(smallBytes));
    const large = fastestTimed(() => importAbr(largeBytes));
    expect(small.error).toBeNull();
    expect(large.error).toBeNull();
    expect(large.value?.brushes[0]).toMatchObject({ kind: "computed", name: `${"\0".repeat(LARGE_NAME_NULS)}a` });
    expect(large.elapsedMs, "ABR 이름 정리 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
    expect(large.elapsedMs / Math.max(small.elapsedMs, MIN_BASELINE_MS), "입력 8배 때 시간 배율").toBeLessThan(MAX_GROWTH_RATIO);
  });

  it("미리보기용 표본 브러시 이름도 제곱 시간이 되지 않는다", () => {
    const alpha = new Uint8Array(16).fill(255);
    const sampledWithNuls = (count: number) =>
      buildSampledAbr({ version: 2, name: `${"\0".repeat(count)}b`, width: 4, height: 4, alpha });
    const smallBytes = sampledWithNuls(SMALL_NAME_NULS);
    const largeBytes = sampledWithNuls(LARGE_NAME_NULS);
    const small = fastestTimed(() => decodeAbrPreviewBrushes(smallBytes));
    const large = fastestTimed(() => decodeAbrPreviewBrushes(largeBytes));
    expect(small.error).toBeNull();
    expect(large.error).toBeNull();
    expect(large.value?.brushes[0]).toMatchObject({ name: `${"\0".repeat(LARGE_NAME_NULS)}b` });
    expect(large.elapsedMs, "ABR 미리보기 이름 정리 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
    expect(large.elapsedMs / Math.max(small.elapsedMs, MIN_BASELINE_MS), "입력 8배 때 시간 배율").toBeLessThan(MAX_GROWTH_RATIO);
  });

  it.each([
    ["끝 NUL 하나", "G-Pen", "G-Pen"],
    ["이름 안쪽 NUL 은 보존", "A\0B", "A\0B"],
    ["이름이 NUL 뿐이면 대체 이름", "", "computed-0"],
  ])("%s", (_label, name, expected) => {
    const result = importAbr(buildComputedAbr({ version: 2, name, spacingPct: 25, angleDeg: 0, roundness: 50, diameterPx: 32 }));
    expect(result.brushes[0]).toMatchObject({ kind: "computed", name: expected });
  });
});

describe("SVG 속성 스캐너와 수정 전 정규식의 판정 대조", () => {
  const LEGACY_TRANSFORM = /([A-Za-z]+)\s*\(([^)]*)\)/g;
  const LEGACY_PAINT_URL = /^url\(\s*(["']?)([^"')\s]*)\1\s*\)\s*(.*)$/;
  const LINE_SEPARATOR = String.fromCharCode(0x2028);

  function randomText(random: () => number, pieces: readonly string[], maxPieces: number, prefix = ""): string {
    const count = Math.floor(random() * maxPieces);
    let text = prefix;
    for (let index = 0; index < count; index += 1) text += pieces[Math.floor(random() * pieces.length)] ?? "";
    return text;
  }

  it("transform 함수 호출 목록이 무작위 문자열 4,000건에서 같다", () => {
    const pieces = ["translate", "scale", "a", "B", "(", ")", " ", ",", "1", "-", "\n", "x", "(1 2)", "  "];
    const random = seededRandom(1_015_001);
    for (let caseIndex = 0; caseIndex < 4_000; caseIndex += 1) {
      const source = randomText(random, pieces, 12);
      const legacy = [...source.matchAll(LEGACY_TRANSFORM)].map((match) => ({
        index: match.index,
        end: match.index + match[0].length,
        name: match[1],
        args: match[2],
      }));
      expect(scanTransformCalls(source), `입력 ${JSON.stringify(source)}`).toEqual(legacy);
    }
  });

  it("paint url 해석이 무작위 문자열 6,000건에서 같다", () => {
    const pieces = [")", "(", " ", "\t", "\n", "\r", LINE_SEPARATOR, '"', "'", "#", "a", "b", "g", "none", "red", "  ", "url("];
    const random = seededRandom(1_015_002);
    for (let caseIndex = 0; caseIndex < 6_000; caseIndex += 1) {
      const source = randomText(random, pieces, 10, random() < 0.85 ? "url(" : "");
      const legacyMatch = LEGACY_PAINT_URL.exec(source);
      const legacy = legacyMatch ? { target: legacyMatch[2], rest: legacyMatch[3] } : null;
      expect(matchPaintUrl(source), `입력 ${JSON.stringify(source)}`).toEqual(legacy);
    }
  });
});
