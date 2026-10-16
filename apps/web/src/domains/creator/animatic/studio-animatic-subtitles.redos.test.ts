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
      const legacy = cue
        .trim()
        .replace(/<[^>]+>/gu, "")
        .replace(/&lt;/gu, "<")
        .replace(/&gt;/gu, ">")
        .replace(/&amp;/gu, "&")
        .trim();
      expect(firstCueText(vtt(cue)), `입력 ${JSON.stringify(cue)}`).toBe(legacy || undefined);
    }
  });

  it("화자 태그가 있는 큐는 화자와 본문을 나눠 읽는다", () => {
    const parsed = parseStudioAnimaticSubtitles(vtt("<v 민수>안녕</v>"));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.cues[0]).toMatchObject({ speaker: "민수", text: "안녕" });
  });
});
