/**
 * Wasm64 Wave 161 공개 배럴 진입점 (`wasm64-wave161-multilingual-text-expansion-panel-reflow-solver`).
 *
 * 웹툰 말풍선·배경 간판·효과음의 6개국어(`ko`/`en`/`ja`/`zh-Hant`/`th`/`id`) 텍스트 확장·축소(±40%)를
 * 추정하고, 얼굴·눈 보호 영역 가림 0px²와 말풍선 비겹침을 유지하면서 컷 높이와 거터를 자동 재조정한다.
 */

import {
  DEFAULT_REFLOW_SOLVER_CONSTRAINTS,
  SUPPORTED_LOCALIZATION_LOCALES,
  resolveReflowConstraints,
  type MultilingualReflowScenarioInput,
  type MultilingualReflowSolverOutput,
  type WebtoonLocalizationLocale,
  type WebtoonPanelSpec,
} from "./multilingual-reflow-types";
import { auditEpisodeMultilingualReflowMatrix } from "./panel-reflow-and-gutter-solver";
import {
  computeReflowManifestFingerprint,
  renderMultilingualReflowAuditSvg,
  summarizeMultilingualReflowKo,
} from "./multilingual-reflow-report";

export {
  DEFAULT_REFLOW_SOLVER_CONSTRAINTS,
  SUPPORTED_LOCALIZATION_LOCALES,
  resolveReflowConstraints,
  type BalloonElementKind,
  type BalloonOverflowStatus,
  type BalloonPlacementStrategy,
  type EpisodeMultilingualMatrixAudit,
  type LocaleMatrixEntry,
  type LocaleTypographyProfile,
  type LocalizedBalloonEstimate,
  type MultilingualEpisodeReflowResult,
  type MultilingualReflowScenarioInput,
  type MultilingualReflowSolverOutput,
  type ProtectedFocalZone,
  type Rect2D,
  type ReflowAuditVerdict,
  type ReflowSolverConstraints,
  type ReflowedPanelResult,
  type ReflowedTextBlock,
  type ScriptWrappingMode,
  type TextBlockSpec,
  type WebtoonLocalizationLocale,
  type WebtoonPanelSpec,
} from "./multilingual-reflow-types";

export {
  LOCALE_TYPOGRAPHY_PROFILES,
  computeBalloonPaddingPx,
  computeEffectiveLineHeightPx,
  estimateLocalizedBalloonBox,
  isThaiCombiningMark,
  measureCharAdvancePx,
  measureTextWidthPx,
  segmentThaiClusters,
  wrapLocalizedText,
  type EstimateBalloonOptions,
} from "./script-expansion-estimator";

export {
  auditEpisodeMultilingualReflowMatrix,
  computeRectIntersectionAreaPx,
  solveMultilingualPanelReflow,
} from "./panel-reflow-and-gutter-solver";

export {
  computeReflowManifestFingerprint,
  renderMultilingualReflowAuditSvg,
  sha256ReflowHex,
  summarizeMultilingualReflowKo,
} from "./multilingual-reflow-report";

/**
 * `/studio` 런타임 허브 자체 점검 및 회귀 테스트용 3컷·6개국어 표준 웹툰 시나리오를 생성한다.
 */
export function createSampleMultilingualReflowScenario(
  overrides?: Partial<MultilingualReflowScenarioInput>,
): MultilingualReflowScenarioInput {
  const samplePanels: readonly WebtoonPanelSpec[] = [
    {
      panelId: "cut-01",
      panelIndex: 0,
      widthPx: 800,
      baselineHeightPx: 620,
      baselineGutterAfterPx: 64,
      protectedZones: [
        {
          zoneId: "hero-face-01",
          label: "주인공 얼굴",
          kind: "face",
          rect: { x: 290, y: 180, width: 220, height: 220 },
          clearanceMarginPx: 8,
        },
      ],
      textBlocks: [
        {
          blockId: "balloon-01-a",
          kind: "speech",
          baselineRect: { x: 32, y: 36, width: 230, height: 112 },
          baselineFontPx: 17,
          baselineText: "오늘 밤 마감 전까지 원고를 끝내야 해.",
          localizedTexts: {
            ko: "오늘 밤 마감 전까지 원고를 끝내야 해.",
            en: "We have to finish this manuscript before tonight's deadline hits.",
            ja: "今夜の締め切りまでに原稿を仕上げないと。",
            "zh-Hant": "今晚截稿前必須畫完原稿。",
            th: "เราต้องปั่นต้นฉบับให้เสร็จทันก่อนเส้นตายคืนนี้นะ",
            id: "Kita harus menyelesaikan seluruh naskah ini sebelum tenggat waktu malam ini.",
          },
        },
        {
          blockId: "sign-01-b",
          kind: "background-sign",
          baselineRect: { x: 560, y: 42, width: 196, height: 68 },
          baselineFontPx: 15,
          baselineText: "옥상 작업실 4층",
          localizedTexts: {
            ko: "옥상 작업실 4층",
            en: "Rooftop Atelier 4F",
            ja: "屋上アトリエ 4階",
            "zh-Hant": "頂樓畫室4樓",
            th: "สตูดิโอดาดฟ้า ชั้น 4",
            id: "Studio Loteng Lantai 4",
          },
        },
        {
          blockId: "balloon-01-c",
          kind: "speech",
          baselineRect: { x: 530, y: 430, width: 236, height: 124 },
          baselineFontPx: 17,
          baselineText: "걱정 마, 선화는 이미 절반 넘었어!",
          localizedTexts: {
            ko: "걱정 마, 선화는 이미 절반 넘었어!",
            en: "Don't worry, the lineart is already more than halfway finished!",
            ja: "心配しないで、線画はもう半分以上終わったよ！",
            "zh-Hant": "別擔心，線稿已經完成一半以上了！",
            th: "ไม่ต้องห่วงนะ งานตัดเส้นเสร็จไปแล้วเกินครึ่งแน่นอน!",
            id: "Jangan khawatir, pengerjaan garis gambarnya sudah lebih dari setengah selesai!",
          },
        },
      ],
    },
    {
      panelId: "cut-02",
      panelIndex: 1,
      widthPx: 800,
      baselineHeightPx: 580,
      baselineGutterAfterPx: 72,
      protectedZones: [
        {
          zoneId: "hero-eyes-02",
          label: "주인공 눈 클로즈업",
          kind: "eyes",
          rect: { x: 180, y: 170, width: 440, height: 150 },
          clearanceMarginPx: 10,
        },
      ],
      textBlocks: [
        {
          blockId: "sfx-02-a",
          kind: "sfx",
          baselineRect: { x: 52, y: 34, width: 180, height: 68 },
          baselineFontPx: 22,
          baselineText: "스윽—",
          localizedTexts: {
            ko: "스윽—",
            en: "SWISH—",
            ja: "スッ—",
            "zh-Hant": "刷—",
            th: "ฟึ่บ—",
            id: "SRAAK—",
          },
        },
        {
          blockId: "balloon-02-b",
          kind: "speech",
          baselineRect: { x: 46, y: 368, width: 310, height: 152 },
          baselineFontPx: 17,
          baselineText: "이번 회차 마지막 컷만큼은 절대 타협하지 않겠어.",
          localizedTexts: {
            ko: "이번 회차 마지막 컷만큼은 절대 타협하지 않겠어.",
            en: "When it comes to the final panel of this episode, I refuse to compromise at all.",
            ja: "今回の最終コマだけは、絶対に妥協するわけにはいかない。",
            "zh-Hant": "這回的最後一格，我絕不妥協。",
            th: "สำหรับช่องสุดท้ายของตอนนี้ ฉันจะไม่ยอมลดคุณภาพลงเด็ดขาดเลย!",
            id: "Khusus untuk panel penutup episode kali ini, aku tidak akan berkompromi sedikit pun.",
          },
        },
      ],
    },
    {
      panelId: "cut-03",
      panelIndex: 2,
      widthPx: 800,
      baselineHeightPx: 540,
      baselineGutterAfterPx: 0,
      protectedZones: [
        {
          zoneId: "scene-focal-03",
          label: "새벽 창가 실루엣",
          kind: "action-focal",
          rect: { x: 310, y: 190, width: 220, height: 190 },
          clearanceMarginPx: 8,
        },
      ],
      textBlocks: [
        {
          blockId: "narration-03-a",
          kind: "narration",
          baselineRect: { x: 40, y: 36, width: 290, height: 108 },
          baselineFontPx: 16,
          baselineText: "창밖으로 푸른 새벽빛이 천천히 스며들었다.",
          localizedTexts: {
            ko: "창밖으로 푸른 새벽빛이 천천히 스며들었다.",
            en: "Pale blue dawn light slowly spilled across the studio window.",
            ja: "窓の外から青い夜明けの光がゆっくり差し込んだ。",
            "zh-Hant": "窗外透進一抹淡藍晨光。",
            th: "แสงรุ่งอรุณสีครามค่อยๆ สาดส่องผ่านหน้าต่างเข้ามาช้าๆ",
            id: "Cahaya fajar berwarna biru pucat perlahan menyusup melalui jendela ruang kerja.",
          },
        },
        {
          blockId: "thought-03-b",
          kind: "thought",
          baselineRect: { x: 520, y: 392, width: 242, height: 112 },
          baselineFontPx: 16,
          baselineText: "좋아, 이제 저장하고 올리자.",
          localizedTexts: {
            ko: "좋아, 이제 저장하고 올리자.",
            en: "Alright, time to save and upload this chapter.",
            ja: "よし、保存して公開しよう。",
            "zh-Hant": "好，存檔上傳吧。",
            th: "เยี่ยมเลย ได้เวลาบันทึกแล้วอัปโหลดตอนนี้กันเถอะ",
            id: "Baiklah, sekarang waktunya menyimpan dan mengunggah bab ini.",
          },
        },
      ],
    },
  ];

  return {
    episodeId: overrides?.episodeId ?? "ep-161-atelier-rooftop",
    titleKo: overrides?.titleKo ?? "옥상 작업실의 결심",
    panels: overrides?.panels ?? samplePanels,
    targetLocales: overrides?.targetLocales ?? SUPPORTED_LOCALIZATION_LOCALES,
    focusLocale: overrides?.focusLocale,
    constraints: overrides?.constraints ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS,
  };
}

/**
 * 6개국어 텍스트 확장 추정 → 컷 높이·거터 자동 리플로우 → 매트릭스 감사 →
 * SHA-256 지문 → 순수 OKLCH 진단 SVG → 한글 QA 브리프를 한 번에 실행한다.
 */
export function runMultilingualPanelReflowSolver(
  scenario: MultilingualReflowScenarioInput,
): MultilingualReflowSolverOutput {
  const resolvedConstraints = resolveReflowConstraints(scenario.constraints);
  const matrixAudit = auditEpisodeMultilingualReflowMatrix(scenario.episodeId, scenario.panels, {
    targetLocales: scenario.targetLocales,
    constraints: resolvedConstraints,
  });

  const requestedFocus: WebtoonLocalizationLocale =
    scenario.focusLocale && matrixAudit.resultsByLocale[scenario.focusLocale]
      ? scenario.focusLocale
      : matrixAudit.worstCaseLocale;

  const focusResult =
    matrixAudit.resultsByLocale[requestedFocus] ??
    matrixAudit.resultsByLocale[matrixAudit.worstCaseLocale];

  if (!focusResult) {
    throw new Error(`No reflow result generated for episode ${scenario.episodeId}`);
  }

  const manifestFingerprintSha256 = computeReflowManifestFingerprint(matrixAudit, scenario.panels);
  const diagnosticSvg = renderMultilingualReflowAuditSvg(
    scenario.titleKo,
    focusResult,
    matrixAudit,
  );
  const summaryKo = summarizeMultilingualReflowKo(scenario.titleKo, matrixAudit);

  return {
    episodeId: scenario.episodeId,
    titleKo: scenario.titleKo,
    focusLocale: requestedFocus,
    matrixAudit,
    focusResult,
    manifestFingerprintSha256,
    diagnosticSvg,
    summaryKo,
  };
}
