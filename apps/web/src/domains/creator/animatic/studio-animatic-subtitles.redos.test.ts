import { describe, expect, it } from "vitest";

import { parseStudioAnimaticSubtitles } from "./studio-animatic-subtitles";

/**
 * WebVTT 큐 본문의 태그(`<b>`, `<c.yellow>` 등)를 `/<[^>]+>/g` 로 지우면, 닫는 `>` 가 없이 `<` 만 길게 이어진 큐에서
 * 시작점마다 큐 끝까지 다시 읽어 입력 길이의 제곱 시간이 든다(CodeQL js/polynomial-redos).
 * 자막 파일은 번역가·협업자에게서 받는 바깥 파일이라 큐 하나의 크기를 가져오는 쪽이 통제하지 못한다.
 * 아래 입력은 수정 전 구현에서 수 초가 걸렸고, 선형 시간이면 수십 ms 안에 끝난다.
 */
const BUDGET_MS = 1_000;

function vtt(cueText: string): string {
  return `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n${cueText}\n`;
}

function firstCueText(raw: string): string | undefined {
  const parsed = parseStudioAnimaticSubtitles(raw);
  return parsed.ok ? parsed.cues[0]?.text : undefined;
}

describe("WebVTT 큐 태그 제거의 선형 시간", () => {
  it("'>' 없이 '<' 만 길게 이어진 큐도 제곱 시간이 되지 않고 본문을 그대로 보존한다", () => {
    const body = "<".repeat(120_000);
    const startedAt = performance.now();
    const text = firstCueText(vtt(body));
    expect(performance.now() - startedAt, "소요(ms)").toBeLessThan(BUDGET_MS);
    expect(text).toBe(body);
  });

  it("완결된 태그 뒤에 닫히지 않는 '<x' 가 길게 반복돼도 제곱 시간이 되지 않는다", () => {
    const tail = "<x".repeat(60_000);
    const startedAt = performance.now();
    const text = firstCueText(vtt(`<b>앞</b>${tail}`));
    expect(performance.now() - startedAt, "소요(ms)").toBeLessThan(BUDGET_MS);
    expect(text).toBe(`앞${tail}`);
  });
});

describe("WebVTT 큐 태그 제거의 판정 보존", () => {
  it.each([
    ["굵게·기울임 태그", "<b>굵게</b> <i>기울임</i>", "굵게 기울임"],
    ["클래스 태그", "<c.yellow>노랑</c> 일반", "노랑 일반"],
    ["타임스탬프 태그", "처음<00:00:01.500>중간", "처음중간"],
    ["태그가 아닌 빈 꺾쇠", "a<>b", "a<>b"],
    ["닫는 꺾쇠만 있는 경우", "a>b", "a>b"],
    ["여는 꺾쇠만 있는 경우", "a<b", "a<b"],
    ["중첩처럼 보이는 입력", "a<b<c>d", "ad"],
    ["이어진 태그", "<b><i>x</i></b>", "x"],
    ["태그 뒤 짝 없는 꺾쇠", "<b>x</b> 3 < 5", "x 3 < 5"],
    ["엔티티 해독", "&lt;b&gt; &amp; 끝", "<b> & 끝"],
  ])("%s", (_label, cue, expected) => {
    expect(firstCueText(vtt(cue))).toBe(expected);
  });

  it("무작위 큐 본문 3,000건에서 수정 전 정규식 구현과 결과가 같다", () => {
    let state = 20_261_015;
    const next = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    // 화자 태그(`<v `) 분기를 건드리지 않게 'v' 는 뺀다. 줄바꿈이 없어야 큐 하나로 읽힌다.
    const pieces = ["<", ">", "<", ">", "a", "b", " ", "&lt;", "&gt;", "&amp;", "/", "x", "<b>", "</b>", "<>", "1"];
    for (let caseIndex = 0; caseIndex < 3_000; caseIndex += 1) {
      const count = 1 + Math.floor(next() * 9);
      let cue = "";
      for (let index = 0; index < count; index += 1) cue += pieces[Math.floor(next() * pieces.length)] ?? "";
      // 수정 전 구현과 같은 순서(태그 제거 → 엔티티 해독)다. 둘 다 정규식 치환(`replace`) 대신 split/join 으로 쓴다:
      // 결과는 같지만, 이 시험은 비교용 사본일 뿐 HTML 로 쓰이지 않는데 정규식 치환 사슬이 CodeQL 의
      // "불완전한 다중 문자 살균" 규칙(js/incomplete-multi-character-sanitization)에 높음으로 걸려 PR 을 막는다.
      const legacy = unescapeLegacyEntities(stripLegacyTags(cue.trim()));
      expect(firstCueText(vtt(cue)), `입력 ${JSON.stringify(cue)}`).toBe(legacy || undefined);
    }
  });

  it("화자 태그가 있는 큐는 화자와 본문을 나눠 읽는다", () => {
    const parsed = parseStudioAnimaticSubtitles(vtt("<v 민수>안녕</v>"));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.cues[0]).toMatchObject({ speaker: "민수", text: "안녕" });
  });
});

/**
 * 화자 태그 큐 `<v 화자>본문</v>` 를 `/^<v\s+([^>]+)>([\s\S]*?)<\/v>$/u` 로 가르면 `\s+` 와 `[^>]+` 가 공백을 나눠 가져서, 공백이 길게
 * 이어진 뒤 `>` 나 끝의 `</v>` 가 맞지 않을 때 나눔 위치를 한 칸씩 옮기며 같은 구간과 본문을 다시 읽는다(입력 길이의 제곱 시간).
 * 수정 전 구현은 아래 첫 입력이 공백 2만·4만·8만 칸에서 각각 약 0.2·0.8·2.9초였고 배증마다 4배로 늘었다.
 *
 * 기계 속도에 기대지 않도록 절대 상한 하나만 두지 않고 "입력을 8배 키웠을 때 시간 배율"로도 가른다. 선형이면 8배 안팎, 제곱이면 64배
 * 안팎이라 24배를 경계로 둔다(수정 전 구현은 약 60배). 한 번 튀는 값에 흔들리지 않게 각각 3번 중 가장 빠른 값을 쓰고, 분모는 1ms
 * 아래로 내려가지 않게 해 서브밀리초 잡음이 배율을 부풀리지 못하게 한다.
 */
const GROWTH_SMALL_SIZE = 10_000;
const GROWTH_LARGE_SIZE = 80_000;
const MAX_GROWTH_RATIO = 24;
const MIN_BASELINE_MS = 1;

function measure<T>(run: () => T): { readonly ms: number; readonly value: T } {
  const startedAt = performance.now();
  const value = run();
  return { ms: performance.now() - startedAt, value };
}

/** `run` 을 `repeat` 번 돌려 가장 빠른 소요(ms)와 첫 반환값을 돌려준다. */
function fastest<T>(run: () => T, repeat = 3): { readonly ms: number; readonly value: T } {
  const first = measure(run);
  let best = first.ms;
  for (let attempt = 1; attempt < repeat; attempt += 1) best = Math.min(best, measure(run).ms);
  return { ms: best, value: first.value };
}

describe("WebVTT 화자 태그 판별의 선형 시간", () => {
  it.each<[string, (size: number) => string, (size: number) => string]>([
    [
      "공백열 뒤 '>' 와 본문이 오고 닫는 </v> 가 없는 큐",
      (size) => `<v${" ".repeat(size)}a>${"x".repeat(size)}`,
      (size) => "x".repeat(size),
    ],
    [
      "공백열 뒤에 '>' 없이 이름만 이어지는 큐",
      (size) => `<v${" ".repeat(size)}${"a".repeat(size)}`,
      (size) => `<v${" ".repeat(size)}${"a".repeat(size)}`,
    ],
  ])("%s 도 입력이 커져도 제곱 시간이 되지 않고 본문을 그대로 보존한다", (_label, build, expectedText) => {
    const smallRaw = vtt(build(GROWTH_SMALL_SIZE));
    const largeRaw = vtt(build(GROWTH_LARGE_SIZE));
    const small = fastest(() => firstCueText(smallRaw));
    const large = fastest(() => firstCueText(largeRaw));
    expect(small.value).toBe(expectedText(GROWTH_SMALL_SIZE));
    expect(large.value).toBe(expectedText(GROWTH_LARGE_SIZE));
    expect(large.ms, "8만 칸 입력 소요(ms)").toBeLessThan(BUDGET_MS);
    expect(large.ms / Math.max(small.ms, MIN_BASELINE_MS), "입력 8배 때 시간 배율").toBeLessThan(MAX_GROWTH_RATIO);
  });
});

/** 수정 전 구현(정규식)을 그대로 옮겨 둔 기준. 판정 보존을 대조하는 데만 쓴다. */
function legacyVttCue(cue: string): { readonly voice: boolean; readonly speaker?: string; readonly text: string } | undefined {
  const unescapeText = (value: string) => unescapeLegacyEntities(value);
  const joined = cue.trim();
  const voice = /^<v\s+([^>]+)>([\s\S]*?)<\/v>$/u.exec(joined);
  const parsed = voice
    ? { voice: true, speaker: (voice[1] ?? "").replace(/&amp;/gu, "&").trim() || undefined, text: unescapeText(voice[2] ?? "") }
    : { voice: false, speaker: undefined, text: unescapeText(stripLegacyTags(joined)) };
  return parsed.text ? parsed : undefined;
}

/**
 * 수정 전 구현의 태그 제거 `value.replace(/<[^>]+>/gu, "")` 와 같은 결과를 내는 비교용 함수.
 * 캡처 그룹이 없고 빈 문자열과 맞지 않는 정규식이라 `split` 한 조각을 이어 붙이면 `replace(…, "")` 와 정확히 같다.
 */
function stripLegacyTags(value: string): string {
  return value.split(/<[^>]+>/gu).join("");
}

/** 수정 전 구현의 엔티티 해독(`&lt;`→`<`, `&gt;`→`>`, `&amp;`→`&`, 순서 그대로)과 끝 공백 제거. */
function unescapeLegacyEntities(value: string): string {
  return value.split("&lt;").join("<").split("&gt;").join(">").split("&amp;").join("&").trim();
}

function firstCue(raw: string): { speaker?: string; text: string } | undefined {
  const parsed = parseStudioAnimaticSubtitles(raw);
  const cue = parsed.ok ? parsed.cues[0] : undefined;
  return cue === undefined ? undefined : { speaker: cue.speaker, text: cue.text };
}

describe("WebVTT 화자 태그 판별의 판정 보존", () => {
  it.each<[string, string, string | undefined, string]>([
    ["기본 화자 태그", "<v 민수>안녕</v>", "민수", "안녕"],
    ["공백 여러 칸·탭으로 시작", "<v \t  민수>안녕</v>", "민수", "안녕"],
    ["NBSP 로 시작", "<v\u00a0민수>안녕</v>", "민수", "안녕"],
    ["전각 공백으로 시작", "<v\u3000민수>안녕</v>", "민수", "안녕"],
    ["화자 이름 안의 공백은 보존", "<v 김 민수>안녕</v>", "김 민수", "안녕"],
    ["화자 이름의 &amp; 해독", "<v A&amp;B>안녕</v>", "A&B", "안녕"],
    ["본문은 첫 </v> 가 아니라 맨 끝 </v> 까지", "<v 민수>앞</v>뒤</v>", "민수", "앞</v>뒤"],
    ["본문 안의 '>' 는 그대로", "<v 민수>a > b</v>", "민수", "a > b"],
    ["본문은 엔티티만 풀고 태그는 지우지 않는다", "<v 민수>&lt;b&gt; <i>x</i> &amp;</v>", "민수", "<b> <i>x</i> &"],
    ["본문이 여러 줄", "<v 민수>첫 줄\n둘째 줄</v>", "민수", "첫 줄\n둘째 줄"],
    ["여는 태그 안쪽에 줄바꿈", "<v 민수\n>안녕</v>", "민수", "안녕"],
    // 아래는 화자 태그로 보지 않는 모양이다. 일반 태그로 지워져 화자 없이 본문만 남는다.
    ["<v 뒤에 공백이 없다", "<vx>안녕</v>", undefined, "안녕"],
    ["공백 한 칸뿐인 태그", "<v >안녕</v>", undefined, "안녕"],
    ["닫는 </v> 가 없다", "<v 민수>안녕", undefined, "안녕"],
    ["닫는 </v> 뒤에 꼬리가 있다", "<v 민수>안녕</v> 끝", undefined, "안녕 끝"],
    ["첫 '>' 가 닫는 </v> 의 것이다", "<v 민수</v>안녕", undefined, "안녕"],
  ])("%s", (_label, cue, speaker, text) => {
    expect(firstCue(vtt(cue))).toEqual({ speaker, text });
  });

  it("본문이 비어 있으면 큐를 만들지 않는다", () => {
    expect(parseStudioAnimaticSubtitles(vtt("<v 민수></v>")).ok).toBe(false);
  });

  it("앞 공백열·화자·'>'·본문·닫는 태그 변형 전수 약 6만 건에서 수정 전 정규식과 화자·본문이 같다", () => {
    const strings = (alphabet: readonly string[], maxCount: number): string[] => {
      const out: string[] = [];
      const walk = (value: string, depth: number): void => {
        out.push(value);
        if (depth === maxCount) return;
        for (const piece of alphabet) walk(value + piece, depth + 1);
      };
      walk("", 0);
      return out;
    };
    const heads = strings([" ", "a", ">"], 4);
    const bodies = strings(["a", ">", "</v>", " "], 3);
    const mismatches: string[] = [];
    let compared = 0;
    let voiceCues = 0;
    for (const head of heads) {
      for (const gate of ["", ">"]) {
        for (const body of bodies) {
          for (const closing of ["", "</v>", "</v>x"]) {
            const cue = `<v${head}${gate}${body}${closing}`;
            const legacy = legacyVttCue(cue);
            compared += 1;
            if (legacy?.voice) voiceCues += 1;
            const actual = firstCue(vtt(cue));
            const same =
              legacy === undefined
                ? actual === undefined
                : actual !== undefined && actual.text === legacy.text && actual.speaker === legacy.speaker;
            if (!same && mismatches.length < 5) {
              mismatches.push(`${JSON.stringify(cue)}: 새 ${JSON.stringify(actual)} / 옛 ${JSON.stringify(legacy)}`);
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    // 화자 태그로 읽히는 입력이 충분히 섞여 있어야 대조가 공허하지 않다.
    expect(voiceCues, `${compared}건 중 화자 태그로 읽힌 건수`).toBeGreaterThan(3_000);
  });

  it("무작위 화자 태그 큐 4,000건에서 수정 전 정규식과 결과가 같다", () => {
    let state = 20_261_016;
    const next = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const pick = (pieces: readonly string[]) => pieces[Math.floor(next() * pieces.length)] ?? "";
    const spaces = [" ", "\t", "\u00a0", "\u3000", "\u2028", "\ufeff", "\u200b"];
    const speakerPieces = ["a", "b", " ", "&amp;", "한", "<", "/", "v", "\t", "\u3000", "\u{1f642}"];
    const bodyPieces = ["a", " ", ">", "<", "</v>", "<v>", "&lt;", "&gt;", "&amp;", "</", "v>", "<b>", "</b>", "한"];
    for (let caseIndex = 0; caseIndex < 4_000; caseIndex += 1) {
      let cue = "<v";
      for (let count = Math.floor(next() * 4); count > 0; count -= 1) cue += pick(spaces);
      for (let count = Math.floor(next() * 5); count > 0; count -= 1) cue += pick(speakerPieces);
      if (next() < 0.93) cue += ">";
      for (let count = Math.floor(next() * 6); count > 0; count -= 1) cue += pick(bodyPieces);
      if (next() < 0.88) cue += "</v>";
      const legacy = legacyVttCue(cue);
      const actual = firstCue(vtt(cue));
      if (legacy === undefined) {
        expect(actual, `입력 ${JSON.stringify(cue)}`).toBeUndefined();
      } else {
        expect(actual, `입력 ${JSON.stringify(cue)}`).toEqual({ speaker: legacy.speaker, text: legacy.text });
      }
    }
  });
});
