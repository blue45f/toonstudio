import { describe, expect, it } from "vitest";

import {
  applyNaverGrammarBubbleLayout,
  autoAssignCastTtsVoices,
  buildTtsAudioScriptManifest,
  compileGraphicNovelManuscript,
  evaluateFiveLanguageQaSheet,
  fitBubbleFontSizeToBounds,
  generateDialogueInspectionReport,
  KAISTORY_A4_HEIGHT_PT,
  KAISTORY_A4_WIDTH_PT,
  planInterleavedEpisodeExport,
  sliceTallCanvasForDocx,
  stitchSentencePcmIntoEpisodeWav,
  type KaistoryEditorBubbleBox,
} from "./kaistory-editor-compositor";

describe("kaistory-editor-compositor", () => {
  const sampleBubbles: readonly KaistoryEditorBubbleBox[] = [
    {
      id: "b-1",
      cutNumber: 1,
      pageNumber: 1,
      speakerName: "지수",
      shape: "ellipse",
      x: 200,
      y: 80,
      width: 180,
      height: 90,
      fontSizePx: 22,
      fontFamily: "NanumGothic",
      texts: {
        ko: "첫 번째 일반 대사",
        en: "First normal line",
        ja: "最初のセリフ",
        zh: "第一句台词",
        ru: "Первая реплика",
      },
    },
    {
      id: "b-2",
      cutNumber: 1,
      pageNumber: 1,
      speakerName: "민준",
      shape: "ellipse",
      x: 200,
      y: 220,
      width: 180,
      height: 90,
      fontSizePx: 22,
      fontFamily: "NanumGothic",
      texts: {
        ko: "두 번째 대사는 우측 배치",
        en: "Second line on the right",
      },
    },
    {
      id: "b-3",
      cutNumber: 2,
      pageNumber: 1,
      speakerName: "지수",
      shape: "burst",
      x: 310,
      y: 120,
      width: 220,
      height: 110,
      fontSizePx: 28,
      fontFamily: "NanumGothic",
      texts: {
        ko: "외침 말풍선은 제자리 유지!",
      },
    },
  ];

  it("네이버 문법 말풍선 좌/우 번갈아 배치를 수행하고 burst 말풍선은 원래 X 위치를 유지한다", () => {
    const placed = applyNaverGrammarBubbleLayout({
      cutWidth: 800,
      cutHeight: 1200,
      bubbles: sampleBubbles,
    });
    expect(placed[0]?.x).toBe(40); // 5% of 800
    expect(placed[1]?.x).toBe(580); // 95% of 800 - 180
    expect(placed[2]?.x).toBe(310); // burst keeps original X
  });

  it("말풍선 넘침 자동 줄이기(fontfit)와 5언어 비교 시트([glyph]/[fallback]/[overflow]) 및 대사점검 리포트를 생성한다", () => {
    const fitted = fitBubbleFontSizeToBounds({
      text: "이 대사는 작은 상자에 비해 매우 길어서 글자 크기가 자동으로 줄어들어야 하는 테스트 문장입니다.",
      bubbleWidth: 130,
      bubbleHeight: 75,
      initialFontSizePx: 26,
      minFontSizePx: 12,
    });
    expect(fitted.wasReduced).toBe(true);
    expect(fitted.fittedFontSizePx).toBeLessThan(26);

    const qaSheets = evaluateFiveLanguageQaSheet(sampleBubbles);
    expect(qaSheets).toHaveLength(2);
    // b-1 RU는 NanumGothic + 키릴 문자이므로 [fallback] 진단이 포함된다.
    const cut1Ru = qaSheets[0]?.byLang.ru[0];
    expect(cut1Ru?.tags).toContain("fallback");
    // b-2 JA는 번역 누락이므로 [glyph] 진단이 포함된다.
    const cut1Ja = qaSheets[0]?.byLang.ja[1];
    expect(cut1Ja?.tags).toContain("glyph");

    const report = generateDialogueInspectionReport({
      title: "과학탐험 1화",
      bubbles: sampleBubbles,
    });
    expect(report.fileName).toBe("대사점검_과학탐험 1화.txt");
    expect(report.issueCount).toBeGreaterThan(0);
    expect(report.reportText).toContain("[번역 누락]");
  });

  it("웹툰/만화 내보내기 시 학습카드를 연관 컷/페이지 바로 다음에 끼워 넣고 세로 캔버스를 슬라이스한다", () => {
    const webtoonPlan = planInterleavedEpisodeExport({
      mode: "webtoon",
      lang: "ko",
      cutNumbers: [1, 2],
      pageNumbers: [1],
      studyCards: [
        { cardId: "sc-1", title: "관성의 법칙", afterCutNumber: 1, afterPageNumber: 1 },
        { cardId: "sc-end", title: "단원 요약", afterCutNumber: null, afterPageNumber: null },
      ],
    });
    expect(webtoonPlan.map((item) => item.refId)).toEqual([
      "cut_1",
      "sc-1",
      "cut_2",
      "sc-end",
    ]);

    const slices = sliceTallCanvasForDocx({
      width: 800,
      totalHeight: 2500,
      maxSliceHeight: 1000,
    });
    expect(slices).toHaveLength(3);
    expect(slices[2]).toEqual({ sliceIndex: 2, yStart: 2000, height: 500 });
  });

  it("그래픽노블 A4 원고를 컴파일하고 등장인물+나레이터 TTS 음성 배정 및 RIFF WAV 병합을 수행한다", () => {
    const manuscript = compileGraphicNovelManuscript(
      [
        {
          pageNumber: 1,
          widthPt: KAISTORY_A4_WIDTH_PT,
          heightPt: KAISTORY_A4_HEIGHT_PT,
          blocks: [
            { id: "blk-1", kind: "illustration", panelCutId: "cut-1", imageFit: "cover" },
            {
              id: "blk-2",
              kind: "paragraph",
              texts: { ko: "지수는 실험실 창문을 열었다.", en: "Jisoo opened the lab window." },
            },
          ],
        },
      ],
      "en",
    );
    expect(manuscript).toContain("[삽화: cut-1 (cover)]");
    expect(manuscript).toContain("Jisoo opened the lab window.");

    const voiceMap = autoAssignCastTtsVoices({
      lang: "ko",
      characters: [
        { id: "char-1", name: "지수", gender: "female", ageGroup: "teen" },
        { id: "char-2", name: "박사님", gender: "male", ageGroup: "senior" },
      ],
      availableVoices: [
        { voiceId: "v-f-teen", name: "서연", lang: "ko", gender: "female", ageGroup: "teen" },
        { voiceId: "v-m-senior", name: "현우", lang: "ko", gender: "male", ageGroup: "senior" },
        { voiceId: "v-f-adult", name: "해린", lang: "ko", gender: "female", ageGroup: "adult" },
      ],
    });
    expect(voiceMap["char-1"]).toBe("v-f-teen");
    expect(voiceMap["char-2"]).toBe("v-m-senior");
    expect(voiceMap["narrator"]).toBe("v-f-adult");

    const wavBytes = stitchSentencePcmIntoEpisodeWav({
      sentenceClips: [new Int16Array([100, -100, 200]), new Int16Array([300, -300])],
      sampleRate: 8000,
      pauseMs: 10,
    });
    expect(String.fromCharCode(wavBytes[0]!, wavBytes[1]!, wavBytes[2]!, wavBytes[3]!)).toBe("RIFF");
    expect(String.fromCharCode(wavBytes[8]!, wavBytes[9]!, wavBytes[10]!, wavBytes[11]!)).toBe("WAVE");

    const manifest = buildTtsAudioScriptManifest([
      { pageNumber: 1, kind: "dialogue", speakerName: "지수", text: "출발하자!" },
    ]);
    expect(manifest).toContain("1\t1\tdialogue\t지수\tvoice_001.wav\t출발하자!");
  });
});
