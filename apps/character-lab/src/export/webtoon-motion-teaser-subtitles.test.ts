// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { planMotionTeaserSchedule } from "./webtoon-motion-teaser-schedule";
import { buildMotionTeaserWebVtt } from "./webtoon-motion-teaser-subtitles";
import { clampWebtoonStripLayout } from "./webtoon-strip-composer";

const schedule = planMotionTeaserSchedule(
  clampWebtoonStripLayout(320, true),
  ["compact", "dramatic-pause", "cliffhanger"],
  { fps: 24, speed: 1.5 },
);
const singleCueOptions = {
  bubbleShapes: ["oval", "none", "none", "none"],
  speakerTargets: ["protagonist", "partner", "protagonist", "partner"],
  sfxStamps: ["none", "none", "none", "none"],
} as const;

describe("모션 티저 WebVTT 사용자 텍스트 인코딩", () => {
  it.each([
    {
      name: "HTML 주석 종료 변형과 태그",
      input: "<!-- 숨김 --!><script>alert('x')</script><img src=x onerror=alert(1)>",
      encoded: "&lt;!-- 숨김 --!&gt;&lt;script&gt;alert('x')&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;",
      displayed: "<!-- 숨김 --!><script>alert('x')</script><img src=x onerror=alert(1)>",
    },
    {
      name: "음성·서식·인라인 시각 태그",
      input: "</v><v 침입자><b>강조</b><c.red>색상</c><00:00:00.500>",
      encoded: "&lt;/v&gt;&lt;v 침입자&gt;&lt;b&gt;강조&lt;/b&gt;&lt;c.red&gt;색상&lt;/c&gt;&lt;00:00:00.500&gt;",
      displayed: "</v><v 침입자><b>강조</b><c.red>색상</c><00:00:00.500>",
    },
    {
      name: "줄바꿈과 추가 큐 시도",
      input: " \r\n첫 줄\n\ncut-99\r00:00:00.000 --> 00:00:01.000\r\n<v 침입자>새 큐\n ",
      encoded: "첫 줄 cut-99 00:00:00.000 → 00:00:01.000 &lt;v 침입자&gt;새 큐",
      displayed: "첫 줄 cut-99 00:00:00.000 → 00:00:01.000 <v 침입자>새 큐",
    },
    {
      name: "기존 엔티티와 앰퍼샌드",
      input: "&lt;v 침입자&gt; &amp; &#60;b&#62; &#x3C; / A & B < C > D",
      encoded: "&amp;lt;v 침입자&amp;gt; &amp;amp; &amp;#60;b&amp;#62; &amp;#x3C; / A &amp; B &lt; C &gt; D",
      displayed: "&lt;v 침입자&gt; &amp; &#60;b&#62; &#x3C; / A & B < C > D",
    },
  ])("$name 입력은 제목과 대사에서 하나의 일반 텍스트로 유지된다", ({ input, encoded, displayed }) => {
    const vtt = buildMotionTeaserWebVtt(schedule, {
      ...singleCueOptions,
      episodeTitleKo: input,
      dialogueLines: [input, "", "", ""],
    });
    const lines = vtt.split("\n");
    const cues = lines.filter((line) => line.startsWith("<v "));
    expect(lines[1]).toBe(`NOTE ToonStudio 9:16 Motion Comic Subtitles (KO) — ${encoded}`);
    expect(cues).toEqual([`<v 주연>${encoded}`]);
    expect(vtt.match(/^cut-\d+$/gmu)).toEqual(["cut-1"]);
    expect(vtt.match(/<[^>]*>/gu)).toEqual(["<v 주연>"]);
    expect(vtt.split("-->")).toHaveLength(2);
    expect(vtt).not.toContain("\r");

    // 표준 엔티티 디코더로 한 번만 해석해 기존 엔티티 표기까지 표시 문자열로 보존되는지 확인한다.
    const cueText = cues[0]!.slice("<v 주연>".length);
    const decoded = new DOMParser().parseFromString(cueText, "text/html");
    expect(decoded.body.childElementCount).toBe(0);
    expect(decoded.body.textContent).toBe(displayed);
  });

  it("인코딩된 대사에서도 원래 타임라인과 큐 번호 오프셋을 유지한다", () => {
    const options = { ...singleCueOptions, cueOffsetMs: 1_250, cueIndexOffset: 8, omitHeader: true };
    const original = buildMotionTeaserWebVtt(schedule, { ...options, dialogueLines: ["안전한 대사", "", "", ""] });
    const escaped = buildMotionTeaserWebVtt(schedule, {
      ...options,
      dialogueLines: ["<v 침입자>\n00:00:00.000 --> 00:00:01.000", "", "", ""],
    });

    expect(escaped.split("\n").slice(0, 2)).toEqual(original.split("\n").slice(0, 2));
    expect(escaped.split("\n")[0]).toBe("cut-9");
    expect(escaped.split("-->")).toHaveLength(2);
    expect(escaped.match(/<[^>]*>/gu)).toEqual(["<v 주연>"]);
    expect(escaped).not.toContain("WEBVTT");
  });

  it.each([
    { locale: "ko", title: "첫 화", dialogue: "문이 열린다.", voice: "내레이션", sfx: "[효과음: 팟]" },
    { locale: "en", title: "First episode", dialogue: "The door opens.", voice: "Narration", sfx: "[SFX: FLASH]" },
    { locale: "ja", title: "第一話", dialogue: "扉が開く。", voice: "モノローグ", sfx: "[効果音: パッ]" },
  ] as const)("$locale 일반 대사·제목·생성 음성 태그·효과음을 유지한다", ({ locale, title, dialogue, voice, sfx }) => {
    const vtt = buildMotionTeaserWebVtt(schedule, {
      ...singleCueOptions,
      locale,
      episodeTitleKo: title,
      dialogueLines: [dialogue, "", "", ""],
      bubbleShapes: ["monologue-box", "none", "none", "none"],
      sfxStamps: ["pat", "none", "none", "none"],
    });

    expect(vtt.split("\n")[1]).toBe(`NOTE ToonStudio 9:16 Motion Comic Subtitles (${locale.toUpperCase()}) — ${title}`);
    expect(vtt.split("\n").filter((line) => line.startsWith("<v "))).toEqual([`<v ${voice}>${sfx} ${dialogue}`]);
    expect(vtt.match(/<[^>]*>/gu)).toEqual([`<v ${voice}>`]);
  });
});
