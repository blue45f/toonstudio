/**
 * kaistory-editor-compositor.ts — KAISTORY `editor.kaistory.net` (렌더·내보내기·그래픽노블·TTS 합성) 정밀 이식 순수 모듈.
 *
 * REA 역공학 근거:
 * - Evidence: `ev_42f72285d7b994f73c22901968783299d3c65fb96d34b683c683bd80c2bf553e`,
 *   `ev_060c07e77797b63d2925057d03800049ff94563f70f5a65bf7541600a9ae439b`
 * - 번들: `editor.kaistory.net/assets/index-DqFBw3-q.js`
 *
 * 핵심 기능:
 * 1. 네이버 문법 말풍선 좌/우 번갈아 배치(`applyNaverGrammarBubbleLayout`) — 일반 대사는 좌/우 교차, 외침(burst)은 제자리 유지
 * 2. 대사 점검 리포트(`대사점검_${title}.txt`) 및 말풍선 넘침 자동 글자 크기 축소(`fitBubbleFontSizeToBounds`)
 * 3. 5언어 비교 시트(`KO / EN / JA / ZH / RU`) — `[glyph]`(글리프 누락), `[fallback]`(글꼴 폴백), `[overflow]`(상자 넘침 %) 진단
 * 4. 학습카드(`StudyCard`) 자동 끼워넣기 내보내기 플래너(웹툰 컷 뒤·만화 페이지 뒤·화 끝) 및 DOCX/PDF 세로 스트립 분할기
 * 5. 그래픽노블(`content_kind: "graphic_novel"`, A4 595.276 × 841.89 pt) 블록 레이아웃 및 원고 텍스트 컴파일러
 * 6. 등장인물 + 나레이터 다화자 TTS 연령대·성별 자동 매칭, RIFF WAV PCM 병합(Stitcher) 및 대본 매니페스트 생성기
 */

import {
  KAISTORY_LANG_CODES,
  type KaistoryAgeGroup,
  type KaistoryCharacterGender,
  type KaistoryLangCode,
} from "./kaistory-conti-model";
import type { KaistoryBubbleShapeKind } from "./kaistory-design-engine";

export const KAISTORY_A4_WIDTH_PT = 595.276;
export const KAISTORY_A4_HEIGHT_PT = 841.89;

export interface KaistoryEditorBubbleBox {
  readonly id: string;
  readonly cutNumber: number;
  readonly pageNumber: number;
  readonly speakerName: string;
  readonly shape: KaistoryBubbleShapeKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontSizePx: number;
  readonly fontFamily: string;
  readonly texts: Readonly<Partial<Record<KaistoryLangCode, string>>>;
}

/**
 * 「네이버 문법 말풍선 좌/우 번갈아 배치」 (`editor.kaistory.net` 자동 배치 규칙):
 * - 일반 말풍선은 컷마다 좌측(5% 여백) ↔ 우측(95% 경계)을 번갈아 배치한다.
 * - 외침(`burst`) 말풍선은 원래 X 위치를 유지한다.
 * - 같은 컷 안의 복수 말풍선은 세로 18px 간격으로 쌓는다.
 */
export function applyNaverGrammarBubbleLayout(input: {
  readonly cutWidth: number;
  readonly cutHeight: number;
  readonly bubbles: readonly KaistoryEditorBubbleBox[];
}): readonly KaistoryEditorBubbleBox[] {
  const byCut = new Map<number, KaistoryEditorBubbleBox[]>();
  for (const b of input.bubbles) {
    const list = byCut.get(b.cutNumber) ?? [];
    list.push(b);
    byCut.set(b.cutNumber, list);
  }

  const cutNumbers = [...byCut.keys()].sort((a, b) => a - b);
  let placeOnLeft = true;
  const placed: KaistoryEditorBubbleBox[] = [];

  for (const cutNo of cutNumbers) {
    const cutBubbles = [...(byCut.get(cutNo) ?? [])].sort((a, b) => a.y - b.y || a.x - b.x);
    let currentY = Math.round(input.cutHeight * 0.06);

    for (const bubble of cutBubbles) {
      if (bubble.shape === "burst") {
        placed.push({
          ...bubble,
          y: Math.min(currentY, Math.max(0, input.cutHeight - bubble.height)),
        });
        currentY += bubble.height + 18;
        continue;
      }

      const marginX = Math.round(input.cutWidth * 0.05);
      const targetX = placeOnLeft
        ? marginX
        : Math.max(marginX, Math.round(input.cutWidth * 0.95 - bubble.width));
      const targetY = Math.min(currentY, Math.max(0, input.cutHeight - bubble.height - 12));

      placed.push({
        ...bubble,
        x: targetX,
        y: targetY,
      });
      currentY = targetY + bubble.height + 18;
      placeOnLeft = !placeOnLeft;
    }
  }

  return Object.freeze(placed);
}

/**
 * 「말풍선 넘침 자동 줄이기」 (`fontfit`):
 * 지정된 언어 텍스트가 말풍선 내부 유효 영역에 들어갈 때까지 글자 크기를 줄인다.
 */
export function fitBubbleFontSizeToBounds(input: {
  readonly text: string;
  readonly bubbleWidth: number;
  readonly bubbleHeight: number;
  readonly initialFontSizePx: number;
  readonly minFontSizePx?: number;
}): {
  readonly fittedFontSizePx: number;
  readonly wasReduced: boolean;
  readonly overflowPercentAfterFit: number;
} {
  const minFont = input.minFontSizePx ?? 11;
  const usableW = Math.max(24, input.bubbleWidth * 0.76);
  const usableH = Math.max(24, input.bubbleHeight * 0.74);
  const charCount = Math.max(1, Array.from(input.text.trim()).length);

  const estimateAreaRatio = (fontSize: number): number => {
    const avgCharW = fontSize * 0.68;
    const lineH = fontSize * 1.35;
    const charsPerLine = Math.max(1, Math.floor(usableW / avgCharW));
    const lines = Math.ceil(charCount / charsPerLine);
    const totalHeight = lines * lineH;
    return totalHeight / usableH;
  };

  let size = input.initialFontSizePx;
  while (size > minFont && estimateAreaRatio(size) > 1) {
    size -= 1;
  }
  const finalRatio = estimateAreaRatio(size);
  const overflowPercentAfterFit =
    finalRatio > 1 ? Math.round((finalRatio - 1) * 100) : 0;

  return {
    fittedFontSizePx: size,
    wasReduced: size < input.initialFontSizePx,
    overflowPercentAfterFit,
  };
}

export type KaistoryQaIssueTag = "glyph" | "fallback" | "overflow";

export interface KaistoryFiveLangQaBubbleDiagnostic {
  readonly bubbleId: string;
  readonly cutNumber: number;
  readonly lang: KaistoryLangCode;
  readonly tags: readonly KaistoryQaIssueTag[];
  readonly overflowPercent: number;
  readonly summaryKo: string;
}

export interface KaistoryFiveLangQaCutSheet {
  readonly cutNumber: number;
  readonly totalIssues: number;
  readonly byLang: Readonly<Record<KaistoryLangCode, readonly KaistoryFiveLangQaBubbleDiagnostic[]>>;
}

/**
 * `editor.kaistory.net`의 「5언어 비교 시트 — 컷 N」 진단을 수행한다.
 * `[glyph]`(글리프 누락·두부 문자), `[fallback]`(언어 스크립트와 글꼴 불일치 폴백), `[overflow]`(상자 넘침 %)를 검출한다.
 */
export function evaluateFiveLanguageQaSheet(
  bubbles: readonly KaistoryEditorBubbleBox[],
): readonly KaistoryFiveLangQaCutSheet[] {
  const cuts = [...new Set(bubbles.map((b) => b.cutNumber))].sort((a, b) => a - b);

  return Object.freeze(
    cuts.map((cutNumber) => {
      const cutBubbles = bubbles.filter((b) => b.cutNumber === cutNumber);
      const byLang: Record<KaistoryLangCode, KaistoryFiveLangQaBubbleDiagnostic[]> = {
        ko: [],
        en: [],
        ja: [],
        zh: [],
        ru: [],
      };
      let totalIssues = 0;

      for (const bubble of cutBubbles) {
        const fontLower = bubble.fontFamily.toLowerCase();
        for (const lang of KAISTORY_LANG_CODES) {
          const text = (bubble.texts[lang] ?? "").trim();
          const tags: KaistoryQaIssueTag[] = [];

          if (!text || /[\uFFFD□▯]/u.test(text)) {
            tags.push("glyph");
          }

          const needsCyrillic = lang === "ru" && /[А-Яа-яЁё]/u.test(text);
          const needsCjk = (lang === "ja" || lang === "zh") && /[\u3040-\u30ff\u4e00-\u9faf]/u.test(text);
          if (
            (needsCyrillic && /nanum|gulim|batang|malgun/u.test(fontLower)) ||
            (needsCjk && /arial|helvetica|times/u.test(fontLower))
          ) {
            tags.push("fallback");
          }

          const fit = fitBubbleFontSizeToBounds({
            text: text || " ",
            bubbleWidth: bubble.width,
            bubbleHeight: bubble.height,
            initialFontSizePx: bubble.fontSizePx,
            minFontSizePx: bubble.fontSizePx,
          });
          if (fit.overflowPercentAfterFit > 0) {
            tags.push("overflow");
          }

          if (tags.length > 0) {
            totalIssues += tags.length;
          }

          const tagLabels = tags.map((t) =>
            t === "overflow" ? `[overflow ${fit.overflowPercentAfterFit}%]` : `[${t}]`,
          );

          byLang[lang].push({
            bubbleId: bubble.id,
            cutNumber,
            lang,
            tags: Object.freeze(tags),
            overflowPercent: fit.overflowPercentAfterFit,
            summaryKo:
              tagLabels.length > 0
                ? `${bubble.id}: ${tagLabels.join(" ")}`
                : `${bubble.id}: 정상`,
          });
        }
      }

      return Object.freeze({
        cutNumber,
        totalIssues,
        byLang: Object.freeze({
          ko: Object.freeze(byLang.ko),
          en: Object.freeze(byLang.en),
          ja: Object.freeze(byLang.ja),
          zh: Object.freeze(byLang.zh),
          ru: Object.freeze(byLang.ru),
        }),
      });
    }),
  );
}

/**
 * `editor.kaistory.net`의 `대사점검_${title}.txt` 텍스트 리포트를 생성한다.
 */
export function generateDialogueInspectionReport(input: {
  readonly title: string;
  readonly bubbles: readonly KaistoryEditorBubbleBox[];
}): {
  readonly fileName: string;
  readonly issueCount: number;
  readonly reportText: string;
} {
  const safeTitle = input.title.trim().replace(/[\\/:*?"<>|]/gu, "_") || "작품";
  const lines: string[] = [`=== 대사점검 리포트: ${input.title.trim() || "제목 없음"} ===`];
  let issueCount = 0;

  const sorted = [...input.bubbles].sort(
    (a, b) => a.pageNumber - b.pageNumber || a.cutNumber - b.cutNumber || a.y - b.y,
  );

  for (const b of sorted) {
    const missingLangs = KAISTORY_LANG_CODES.filter((lang) => !(b.texts[lang] ?? "").trim());
    if (!b.speakerName.trim()) {
      issueCount += 1;
      lines.push(`[화자 미지정] ${b.pageNumber}쪽 컷#${b.cutNumber} (${b.id}): "${b.texts.ko ?? ""}"`);
    }
    if (missingLangs.length > 0) {
      issueCount += 1;
      lines.push(
        `[번역 누락] ${b.pageNumber}쪽 컷#${b.cutNumber} (${b.id}): 미번역 언어 [${missingLangs
          .map((l) => l.toUpperCase())
          .join(", ")}]`,
      );
    }
    const fit = fitBubbleFontSizeToBounds({
      text: b.texts.ko ?? "",
      bubbleWidth: b.width,
      bubbleHeight: b.height,
      initialFontSizePx: b.fontSizePx,
      minFontSizePx: b.fontSizePx,
    });
    if (fit.overflowPercentAfterFit > 0) {
      issueCount += 1;
      lines.push(
        `[말풍선 넘침] ${b.pageNumber}쪽 컷#${b.cutNumber} (${b.id}): ${fit.overflowPercentAfterFit}% 초과`,
      );
    }
  }

  if (issueCount === 0) {
    lines.push("점검 완료: 화자 미지정·번역 누락·말풍선 넘침이 없습니다.");
  } else {
    lines.push(`총 ${issueCount}건의 점검 항목이 발견되었습니다.`);
  }

  return {
    fileName: `대사점검_${safeTitle}.txt`,
    issueCount,
    reportText: lines.join("\n"),
  };
}

export interface KaistoryExportStudyCardSlot {
  readonly cardId: string;
  readonly title: string;
  /** 웹툰 모드에서 이 컷 번호 바로 다음에 끼워 넣는다 (`null`이면 화 끝). */
  readonly afterCutNumber: number | null;
  /** 만화 모드에서 이 페이지 번호 바로 다음에 끼워 넣는다 (`null`이면 화 끝). */
  readonly afterPageNumber: number | null;
}

export interface KaistoryOrderedExportAsset {
  readonly kind: "cut" | "page" | "study_card";
  readonly refId: string;
  readonly orderIndex: number;
  readonly fileName: string;
}

/**
 * 웹툰/만화 내보내기 시 학습카드(`StudyCard`)를 연관 컷/페이지 바로 다음 또는 화 끝에 끼워 넣는 순서를 계산한다.
 */
export function planInterleavedEpisodeExport(input: {
  readonly mode: "webtoon" | "manga";
  readonly lang: KaistoryLangCode;
  readonly cutNumbers: readonly number[];
  readonly pageNumbers: readonly number[];
  readonly studyCards: readonly KaistoryExportStudyCardSlot[];
}): readonly KaistoryOrderedExportAsset[] {
  const result: KaistoryOrderedExportAsset[] = [];
  let order = 1;

  if (input.mode === "webtoon") {
    for (const cutNo of input.cutNumbers) {
      result.push({
        kind: "cut",
        refId: `cut_${cutNo}`,
        orderIndex: order++,
        fileName: `${String(order - 1).padStart(3, "0")}_cut_${String(cutNo).padStart(3, "0")}_${input.lang}.png`,
      });
      const linkedCards = input.studyCards.filter((c) => c.afterCutNumber === cutNo);
      for (const card of linkedCards) {
        result.push({
          kind: "study_card",
          refId: card.cardId,
          orderIndex: order++,
          fileName: `${String(order - 1).padStart(3, "0")}_studycard_${card.cardId}_${input.lang}.png`,
        });
      }
    }
    for (const tailCard of input.studyCards.filter((c) => c.afterCutNumber === null)) {
      result.push({
        kind: "study_card",
        refId: tailCard.cardId,
        orderIndex: order++,
        fileName: `${String(order - 1).padStart(3, "0")}_studycard_${tailCard.cardId}_${input.lang}.png`,
      });
    }
    return Object.freeze(result);
  }

  for (const pageNo of input.pageNumbers) {
    result.push({
      kind: "page",
      refId: `page_${pageNo}`,
      orderIndex: order++,
      fileName: `${String(order - 1).padStart(3, "0")}_page_${String(pageNo).padStart(3, "0")}_${input.lang}.png`,
    });
    const linkedCards = input.studyCards.filter((c) => c.afterPageNumber === pageNo);
    for (const card of linkedCards) {
      result.push({
        kind: "study_card",
        refId: card.cardId,
        orderIndex: order++,
        fileName: `${String(order - 1).padStart(3, "0")}_studycard_${card.cardId}_${input.lang}.png`,
      });
    }
  }
  for (const tailCard of input.studyCards.filter((c) => c.afterPageNumber === null)) {
    result.push({
      kind: "study_card",
      refId: tailCard.cardId,
      orderIndex: order++,
      fileName: `${String(order - 1).padStart(3, "0")}_studycard_${tailCard.cardId}_${input.lang}.png`,
    });
  }
  return Object.freeze(result);
}

/**
 * 세로로 긴 웹툰 합성 캔버스를 Word(`.docx`)/PDF 페이지 삽입용 세로 슬라이스 구간으로 분할한다.
 */
export function sliceTallCanvasForDocx(input: {
  readonly width: number;
  readonly totalHeight: number;
  readonly maxSliceHeight?: number;
}): readonly {
  readonly sliceIndex: number;
  readonly yStart: number;
  readonly height: number;
}[] {
  const maxH = Math.max(200, input.maxSliceHeight ?? Math.round(input.width * 1.414));
  const slices: { sliceIndex: number; yStart: number; height: number }[] = [];
  let y = 0;
  let idx = 0;
  while (y < input.totalHeight) {
    const h = Math.min(maxH, input.totalHeight - y);
    slices.push({ sliceIndex: idx++, yStart: y, height: h });
    y += h;
  }
  return Object.freeze(slices);
}

export type KaistoryGraphicNovelImageFit = "fill" | "cover" | "contain";

export interface KaistoryGraphicNovelBlock {
  readonly id: string;
  readonly kind: "illustration" | "paragraph";
  readonly panelCutId?: string;
  readonly imageFit?: KaistoryGraphicNovelImageFit;
  readonly panX?: number;
  readonly panY?: number;
  readonly scale?: number;
  readonly texts?: Readonly<Partial<Record<KaistoryLangCode, string>>>;
}

export interface KaistoryGraphicNovelPage {
  readonly pageNumber: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly blocks: readonly KaistoryGraphicNovelBlock[];
}

/**
 * 그래픽노블(`content_kind: "graphic_novel"`) 페이지에서 지정 언어의 원고 텍스트를 추출한다.
 */
export function compileGraphicNovelManuscript(
  pages: readonly KaistoryGraphicNovelPage[],
  lang: KaistoryLangCode,
): string {
  return pages
    .map((page) => {
      const lines = page.blocks.map((block) => {
        if (block.kind === "illustration") {
          return `[삽화: ${block.panelCutId ?? block.id} (${block.imageFit ?? "cover"})]`;
        }
        return (block.texts?.[lang] ?? block.texts?.ko ?? "").trim();
      });
      return `--- ${page.pageNumber}쪽 ---\n${lines.filter(Boolean).join("\n\n")}`;
    })
    .join("\n\n");
}

export interface KaistoryTtsVoiceCatalogItem {
  readonly voiceId: string;
  readonly name: string;
  readonly lang: KaistoryLangCode;
  readonly gender: KaistoryCharacterGender;
  readonly ageGroup: KaistoryAgeGroup;
}

/**
 * 등장인물 목록과 `나레이터`에 성별·연령대(`child/teen/young/adult/senior`)가 가장 잘 맞는 TTS 음성을 자동 배정한다.
 */
export function autoAssignCastTtsVoices(input: {
  readonly lang: KaistoryLangCode;
  readonly characters: readonly {
    readonly id: string;
    readonly name: string;
    readonly gender: KaistoryCharacterGender;
    readonly ageGroup: KaistoryAgeGroup;
    readonly existingVoiceId?: string;
  }[];
  readonly availableVoices: readonly KaistoryTtsVoiceCatalogItem[];
}): Readonly<Record<string, string>> {
  const langVoices = input.availableVoices.filter((v) => v.lang === input.lang);
  const pool = langVoices.length > 0 ? langVoices : input.availableVoices;
  const assignments: Record<string, string> = {};
  const usedVoiceIds = new Set<string>();

  for (const char of input.characters) {
    if (char.existingVoiceId) {
      assignments[char.id] = char.existingVoiceId;
      usedVoiceIds.add(char.existingVoiceId);
      continue;
    }
    const candidates = [...pool].sort((a, b) => {
      const score = (v: KaistoryTtsVoiceCatalogItem): number => {
        let s = 0;
        if (v.gender === char.gender) s += 4;
        if (v.ageGroup === char.ageGroup) s += 3;
        if (!usedVoiceIds.has(v.voiceId)) s += 2;
        return s;
      };
      return score(b) - score(a);
    });
    const chosen = candidates[0];
    if (chosen) {
      assignments[char.id] = chosen.voiceId;
      usedVoiceIds.add(chosen.voiceId);
    }
  }

  const narratorCandidate =
    pool.find((v) => !usedVoiceIds.has(v.voiceId) && v.ageGroup === "adult") ?? pool[0];
  if (narratorCandidate) {
    assignments["narrator"] = narratorCandidate.voiceId;
  }

  return Object.freeze(assignments);
}

/**
 * 16-bit 모노 PCM 샘플 배열을 표준 44바이트 RIFF `.wav` 바이트 배열로 인코딩한다.
 */
export function encodePcm16MonoWav(
  samples: Int16Array,
  sampleRate = 24000,
): Uint8Array {
  const dataByteLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeAscii(36, "data");
  view.setUint32(40, dataByteLength, true);

  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(44 + i * 2, samples[i] ?? 0, true);
  }

  return new Uint8Array(buffer);
}

/**
 * 여러 문장의 16-bit PCM 샘플 배열을 문장 간 무음 간격(`pauseMs`)과 함께 하나의 RIFF `.wav` 파일로 병합한다.
 */
export function stitchSentencePcmIntoEpisodeWav(input: {
  readonly sentenceClips: readonly Int16Array[];
  readonly sampleRate?: number;
  readonly pauseMs?: number;
}): Uint8Array {
  const sampleRate = input.sampleRate ?? 24000;
  const pauseSamples = Math.max(0, Math.round(((input.pauseMs ?? 350) / 1000) * sampleRate));
  const totalSamples =
    input.sentenceClips.reduce((sum, clip) => sum + clip.length, 0) +
    Math.max(0, input.sentenceClips.length - 1) * pauseSamples;

  const merged = new Int16Array(totalSamples);
  let offset = 0;
  input.sentenceClips.forEach((clip, idx) => {
    merged.set(clip, offset);
    offset += clip.length;
    if (idx < input.sentenceClips.length - 1) {
      offset += pauseSamples;
    }
  });

  return encodePcm16MonoWav(merged, sampleRate);
}

/**
 * `editor.kaistory.net` 오디오 내보내기용 대본 매니페스트(`번호 | 페이지 | 유형 | 화자 | 파일 | 내용`)를 생성한다.
 */
export function buildTtsAudioScriptManifest(
  lines: readonly {
    readonly pageNumber: number;
    readonly kind: string;
    readonly speakerName: string;
    readonly text: string;
  }[],
): string {
  const header = "번호\t페이지\t유형\t화자\t파일\t내용";
  const rows = lines.map((line, index) => {
    const num = index + 1;
    const fileName = `voice_${String(num).padStart(3, "0")}.wav`;
    return `${num}\t${line.pageNumber}\t${line.kind}\t${line.speakerName || "나레이터"}\t${fileName}\t${line.text.replace(/\r?\n/gu, " ")}`;
  });
  return [header, ...rows].join("\n");
}
