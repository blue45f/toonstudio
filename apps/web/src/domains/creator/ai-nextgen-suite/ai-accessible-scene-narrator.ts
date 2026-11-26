import { z } from "zod";

import {
  detectKoreanTranslationese,
  executeDualProviderCascade,
  sanitizeValueStringsDeep,
  type JsonSchemaContract,
  type NextGenCascadeOptions,
  type NextGenCascadeResult,
  type NextGenProviderId,
} from "./ai-nextgen-provider-cascade";
import { redactNextGenSensitiveText } from "./ai-nextgen-text-guardrails";

/**
 * 시각장애인·스크린리더 독자용 생생한 장면 해설(Audio Description)·구조화 컷 대체텍스트(Alt-Text) 생성기
 * 및 교차 모델 품질 심사기(`scoreAssistOutputQuality`).
 *
 * - 짧은 스와이프 탐색용 핵심 대체텍스트(`altTextShortKo`, 중복 '이미지:' 접두어 자동 제거)와
 *   공간감·빛·표정·동작 결을 살린 오디오 해설(`vividNarrationKo`), 대사·효과음 낭독 순서를 함께 생성한다.
 * - `scoreAssistOutputQuality`는 스키마 정합성, `@toonstudio/contracts/studio-pii-redactor` 기반
 *   개인정보 유출 `0건` 검증, 한국어 번역투 배제, 길이 경계를 종합 채점(`0..100`)한다.
 */

export interface AccessibleDialogueLineInput {
  readonly speakerKo: string;
  readonly lineKo: string;
  readonly toneKo?: string;
}

export interface AccessibleCutSourceItem {
  readonly cutNumber: number;
  readonly visualSceneKo: string;
  readonly dialogues?: readonly AccessibleDialogueLineInput[];
  readonly sfxKo?: readonly string[];
  readonly spatialCueKo?: string;
}

export interface AccessibleSceneNarratorInput {
  readonly workTitleKo: string;
  readonly episodeTitleKo: string;
  readonly genre: string;
  readonly narrationDepth?: "concise" | "vivid";
  readonly cuts: readonly AccessibleCutSourceItem[];
}

export const AccessibleCutNarrationSchema = z
  .object({
    cutNumber: z.number().int().min(1).max(1_000),
    altTextShortKo: z.string().min(8).max(125),
    vividNarrationKo: z.string().min(16).max(380),
    dialogueTranscriptKo: z.string().max(360),
    audioCueKo: z.string().min(1).max(200),
    recommendedPauseMs: z.number().int().min(150).max(2_500),
    readingOrderSteps: z.array(z.string().min(1).max(160)).min(2).max(6),
  })
  .strict();

export const AccessibleSceneNarratorOutputSchema = z
  .object({
    episodeOrientationKo: z.string().min(12).max(420),
    screenReaderGuideKo: z.string().min(10).max(280),
    cuts: z.array(AccessibleCutNarrationSchema).min(1).max(32),
  })
  .strict();

export type AccessibleCutNarration = z.infer<typeof AccessibleCutNarrationSchema>;
export type AccessibleSceneNarratorOutput = z.infer<typeof AccessibleSceneNarratorOutputSchema>;

export const ACCESSIBLE_SCENE_NARRATOR_JSON_SCHEMA: JsonSchemaContract = Object.freeze({
  name: "toonstudio_accessible_scene_narrator",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["episodeOrientationKo", "screenReaderGuideKo", "cuts"],
    properties: {
      episodeOrientationKo: {
        type: "string",
        description: "회차 시작 전 공간·인물 구도를 스포일러 없이 안내하는 도입 해설(한국어, 400자 이내)",
      },
      screenReaderGuideKo: {
        type: "string",
        description: "보이스오버·톡백 독자를 위한 컷 이동·낭독 순서 안내(자연스러운 한국어)",
      },
      cuts: {
        type: "array",
        description: "컷별 대체텍스트 및 생생한 화면 해설 목록",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "cutNumber",
            "altTextShortKo",
            "vividNarrationKo",
            "dialogueTranscriptKo",
            "audioCueKo",
            "recommendedPauseMs",
            "readingOrderSteps",
          ],
          properties: {
            cutNumber: { type: "integer" },
            altTextShortKo: {
              type: "string",
              description: "빠른 스와이프 탐색용 핵심 대체텍스트(120자 이내, '이미지:'/'그림:' 접두어 금지)",
            },
            vividNarrationKo: {
              type: "string",
              description: "인물 표정·시선·거리감·빛과 그림자를 손에 잡히듯 들려주는 화면 해설(360자 이내)",
            },
            dialogueTranscriptKo: {
              type: "string",
              description: "화자 이름과 감정 톤을 붙인 대사 낭독문(대사가 없으면 빈 문자열)",
            },
            audioCueKo: {
              type: "string",
              description: "시각 효과음을 청각 질감으로 풀어 쓴 소리 단서",
            },
            recommendedPauseMs: {
              type: "integer",
              description: "다음 컷으로 넘어가기 전 권장 호흡 간격(150~2500ms)",
            },
            readingOrderSteps: {
              type: "array",
              description: "스크린리더 초점 이동 단계(2~6단계)",
              items: { type: "string" },
            },
          },
        },
      },
    },
  },
});

const REDUNDANT_ALT_PREFIXES = [
  "이미지:",
  "이미지 :",
  "그림:",
  "그림 :",
  "사진:",
  "사진 :",
  "컷 이미지:",
] as const;

function stripRedundantAltPrefix(raw: string): string {
  let trimmed = raw.trim();
  for (const prefix of REDUNDANT_ALT_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      trimmed = trimmed.slice(prefix.length).trim();
      break;
    }
  }
  return trimmed;
}

function clampLen(raw: unknown, fallback: string, minLen: number, maxLen: number): string {
  const base = typeof raw === "string" ? raw.trim() : "";
  const candidate = base.length >= minLen ? base : fallback;
  return candidate.length <= maxLen ? candidate : `${candidate.slice(0, maxLen - 1)}…`;
}

function clampPause(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(2_500, Math.max(150, Math.round(n)));
}

/**
 * 로컬 결정론 시각장애인용 화면 해설·구조화 대체텍스트 생성기.
 */
export function buildLocalAccessibleSceneNarration(
  rawInput: AccessibleSceneNarratorInput,
): AccessibleSceneNarratorOutput {
  const clean = sanitizeValueStringsDeep(rawInput, { polishKorean: true }).sanitized;
  const sourceCuts =
    clean.cuts.length > 0
      ? clean.cuts.slice(0, 32)
      : [
          {
            cutNumber: 1,
            visualSceneKo: "어두운 작업실 책상 위 스탠드 불빛 아래 주인공이 펜을 고쳐 쥔다.",
          },
        ];

  const cuts: AccessibleCutNarration[] = sourceCuts.map((cut) => {
    const baseScene = stripRedundantAltPrefix(cut.visualSceneKo) || "인물이 정면을 응시하며 멈춰 선 장면";
    const spatial = cut.spatialCueKo ? ` ${cut.spatialCueKo.trim()}` : "";
    const altShort = clampLen(
      baseScene,
      `${cut.cutNumber}컷 핵심 행동 장면`,
      8,
      125,
    );

    const vivid = clampLen(
      `${baseScene}${spatial} 인물 주변의 명암 대비와 미세한 시선 떨림이 긴장감을 또렷하게 전합니다.`,
      `${baseScene} 화면 중앙 인물의 표정 변화에 초점이 모입니다.`,
      16,
      380,
    );

    const dlgList = cut.dialogues ?? [];
    const dialogueTranscriptKo =
      dlgList.length > 0
        ? dlgList
            .map((d) =>
              d.toneKo
                ? `${d.speakerKo}(${d.toneKo}): "${d.lineKo}"`
                : `${d.speakerKo}: "${d.lineKo}"`,
            )
            .join(" / ")
            .slice(0, 360)
        : "";

    const sfxList = cut.sfxKo ?? [];
    const audioCueKo =
      sfxList.length > 0
        ? `효과음 '${sfxList.join(", ")}' — 화면 속 움직임과 맞물리는 현장 음향 단서`
        : "정적 속 옷자락 스치는 미세한 공간음";

    const hasSuspense = /폭발|충격|정적|눈물|칼|뒤돌아|발견/u.test(baseScene);
    const recommendedPauseMs = hasSuspense ? 950 : dlgList.length > 1 ? 700 : 450;

    const readingOrderSteps: string[] = [
      `1단계 구도: ${altShort.slice(0, 90)}`,
      `2단계 세부 묘사: ${vivid.slice(0, 120)}`,
      ...(dialogueTranscriptKo
        ? [`3단계 대사: ${dialogueTranscriptKo.slice(0, 120)}`]
        : []),
      `${dialogueTranscriptKo ? "4" : "3"}단계 음향 여운: ${audioCueKo.slice(0, 110)}`,
    ];

    return {
      cutNumber: Math.max(1, Math.min(1_000, Math.trunc(cut.cutNumber))),
      altTextShortKo: altShort,
      vividNarrationKo: vivid,
      dialogueTranscriptKo,
      audioCueKo: audioCueKo.slice(0, 200),
      recommendedPauseMs,
      readingOrderSteps: readingOrderSteps.slice(0, 6),
    };
  });

  return {
    episodeOrientationKo: clampLen(
      `${clean.workTitleKo} — ${clean.episodeTitleKo}(${clean.genre}) 총 ${cuts.length}컷 화면 해설입니다. 각 컷은 공간 구도, 인물 동작과 표정, 대사, 효과음 순서로 안내합니다.`,
      "이번 회차의 공간과 인물 배치를 컷 순서대로 차분히 안내합니다.",
      12,
      420,
    ),
    screenReaderGuideKo:
      "좌우 스와이프로 컷 단위 핵심 대체텍스트를 빠르게 훑거나, 연속 낭독에서 생생한 장면 묘사와 대사를 순서대로 들을 수 있습니다.",
    cuts,
  };
}

function normalizeAccessibleSceneParsed(
  decoded: unknown,
  fallbackInput: AccessibleSceneNarratorInput,
): unknown {
  if (!decoded || typeof decoded !== "object") return decoded;
  const raw = decoded as Record<string, unknown>;
  const localRef = buildLocalAccessibleSceneNarration(fallbackInput);

  const rawCuts = Array.isArray(raw.cuts) ? raw.cuts : [];
  const cuts =
    rawCuts.length > 0
      ? rawCuts.slice(0, 32).map((entry, idx) => {
          const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
          const refCut = localRef.cuts[idx] ?? localRef.cuts[0]!;
          const cleanedAlt = stripRedundantAltPrefix(
            typeof item.altTextShortKo === "string" ? item.altTextShortKo : "",
          );
          const rawSteps = Array.isArray(item.readingOrderSteps)
            ? item.readingOrderSteps
                .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
                .map((s) => s.trim().slice(0, 160))
                .slice(0, 6)
            : [];

          return {
            cutNumber: Math.max(
              1,
              Math.min(
                1_000,
                Math.trunc(typeof item.cutNumber === "number" ? item.cutNumber : refCut.cutNumber),
              ),
            ),
            altTextShortKo: clampLen(cleanedAlt, refCut.altTextShortKo, 8, 125),
            vividNarrationKo: clampLen(item.vividNarrationKo, refCut.vividNarrationKo, 16, 380),
            dialogueTranscriptKo:
              typeof item.dialogueTranscriptKo === "string"
                ? item.dialogueTranscriptKo.trim().slice(0, 360)
                : refCut.dialogueTranscriptKo,
            audioCueKo: clampLen(item.audioCueKo, refCut.audioCueKo, 1, 200),
            recommendedPauseMs: clampPause(item.recommendedPauseMs, refCut.recommendedPauseMs),
            readingOrderSteps: rawSteps.length >= 2 ? rawSteps : refCut.readingOrderSteps,
          };
        })
      : localRef.cuts;

  return {
    episodeOrientationKo: clampLen(
      raw.episodeOrientationKo,
      localRef.episodeOrientationKo,
      12,
      420,
    ),
    screenReaderGuideKo: clampLen(
      raw.screenReaderGuideKo,
      localRef.screenReaderGuideKo,
      10,
      280,
    ),
    cuts,
  };
}

export function buildAccessibleSceneNarratorPrompt(input: AccessibleSceneNarratorInput): {
  readonly systemInstruction: string;
  readonly userPrompt: string;
  readonly piiInputRedactedCount: number;
} {
  const sanitized = sanitizeValueStringsDeep(input, { polishKorean: false });
  const safe = sanitized.sanitized;

  const systemInstruction = [
    "당신은 시각장애인 웹툰 독자를 위한 전문 화면해설 작가(Audio Describer)이자 접근성 에디터입니다.",
    "altTextShortKo에는 '이미지:', '그림:' 같은 불필요한 접두어를 절대 붙이지 말고 핵심 피사체와 행동을 120자 이내로 명료하게 담으세요.",
    "vividNarrationKo에는 빛의 온도, 공간의 깊이, 인물의 시선·손끝 떨림을 감각적이고 자연스러운 한국어 입말로 묘사하세요.",
    "번역투('~하는 것을 가능하게 합니다', '직관적인 경험을 제공합니다', '에 있어서')와 다음 컷 스포일러를 절대 쓰지 마세요.",
  ].join("\n");

  const cutLines = safe.cuts.slice(0, 32).map((c) => {
    const dlg =
      c.dialogues && c.dialogues.length > 0
        ? ` | 대사: ${c.dialogues.map((d) => `${d.speakerKo}:"${d.lineKo}"`).join(", ")}`
        : "";
    const sfx = c.sfxKo && c.sfxKo.length > 0 ? ` | 효과음: ${c.sfxKo.join(", ")}` : "";
    const sp = c.spatialCueKo ? ` | 공간: ${c.spatialCueKo}` : "";
    return `- ${c.cutNumber}컷: ${c.visualSceneKo}${sp}${dlg}${sfx}`;
  });

  const userPrompt = [
    `작품명: ${safe.workTitleKo} — ${safe.episodeTitleKo} (${safe.genre})`,
    `해설 밀도: ${safe.narrationDepth ?? "vivid"}`,
    "대상 컷 목록:",
    ...cutLines,
  ].join("\n");

  return {
    systemInstruction,
    userPrompt,
    piiInputRedactedCount: sanitized.redactedCount,
  };
}

export async function runAccessibleSceneNarrator(
  input: AccessibleSceneNarratorInput,
  options?: NextGenCascadeOptions,
): Promise<NextGenCascadeResult<AccessibleSceneNarratorOutput>> {
  const prompt = buildAccessibleSceneNarratorPrompt(input);
  return executeDualProviderCascade({
    systemInstruction: prompt.systemInstruction,
    userPrompt: prompt.userPrompt,
    piiInputRedactedCount: prompt.piiInputRedactedCount,
    jsonSchema: ACCESSIBLE_SCENE_NARRATOR_JSON_SCHEMA,
    outputSchema: AccessibleSceneNarratorOutputSchema,
    normalizeParsed: (decoded) => normalizeAccessibleSceneParsed(decoded, input),
    buildLocalFallback: () => buildLocalAccessibleSceneNarration(input),
    options,
  });
}

// ============================================================================
// Cross-Model Quality Judge (`scoreAssistOutputQuality` & `runCrossModelQualityJudge`)
// ============================================================================

export interface AssistOutputQualityInput<T = unknown> {
  readonly output: unknown;
  readonly schema?: z.ZodType<T>;
  readonly minChars?: number;
  readonly maxChars?: number;
  readonly rawCanarySecrets?: readonly string[];
}

export interface AssistQualityScoreReport {
  readonly totalScore: number;
  readonly passed: boolean;
  readonly breakdown: {
    readonly schemaScore: number;
    readonly piiSafetyScore: number;
    readonly naturalKoreanScore: number;
    readonly lengthBoundsScore: number;
  };
  readonly schemaValid: boolean;
  readonly schemaIssues: readonly string[];
  readonly piiLeakCount: number;
  readonly piiSafe: boolean;
  readonly translationeseHits: readonly string[];
  readonly lengthWithinBounds: boolean;
  readonly measuredCharLength: number;
  readonly summaryKo: string;
}

function collectLeafStrings(value: unknown, bucket: string[], depth = 0): void {
  if (depth > 12 || value === null || value === undefined) return;
  if (typeof value === "string") {
    bucket.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectLeafStrings(item, bucket, depth + 1);
    }
    return;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectLeafStrings(entry, bucket, depth + 1);
    }
  }
}

/**
 * AI 창작 도우미 구조화 출력의 4대 품질 게이트(스키마 정합성 35점, PII 무유출 30점,
 * 한국어 자연스러움/반번역투 20점, 길이 경계 15점)를 결정적으로 채점한다.
 */
export function scoreAssistOutputQuality<T = unknown>(
  input: AssistOutputQualityInput<T>,
): AssistQualityScoreReport {
  const minChars = input.minChars ?? 20;
  const maxChars = input.maxChars ?? 28_000;

  // 1. 스키마 정합성 (35점)
  let schemaValid = false;
  const schemaIssues: string[] = [];
  if (input.schema) {
    const parsed = input.schema.safeParse(input.output);
    schemaValid = parsed.success;
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 8)) {
        schemaIssues.push(`${issue.path.join(".") || "root"}: ${issue.message}`);
      }
    }
  } else if (typeof input.output === "string") {
    schemaValid = input.output.trim().length > 0;
    if (!schemaValid) schemaIssues.push("root: 빈 문자열 출력입니다.");
  } else if (input.output && typeof input.output === "object") {
    schemaValid = Object.keys(input.output as Record<string, unknown>).length > 0;
    if (!schemaValid) schemaIssues.push("root: 빈 객체 출력입니다.");
  } else {
    schemaIssues.push("root: 유효한 구조화 객체가 아닙니다.");
  }
  const schemaScore = schemaValid ? 35 : 0;

  // 리프 문자열 수집
  const leafStrings: string[] = [];
  collectLeafStrings(input.output, leafStrings);
  const joinedLeaves = leafStrings.join("\n");
  const measuredCharLength = leafStrings.reduce((sum, s) => sum + s.length, 0);

  // 2. 개인정보 무유출 점검 (@toonstudio/contracts/studio-pii-redactor 기반 정밀 래퍼 + 카나리 시크릿 대조) (30점)
  const piiScan = redactNextGenSensitiveText(joinedLeaves);
  let canaryLeakCount = 0;
  for (const canary of input.rawCanarySecrets ?? []) {
    const needle = canary.trim();
    if (needle.length >= 4 && joinedLeaves.includes(needle)) {
      canaryLeakCount += 1;
    }
  }
  const piiLeakCount = piiScan.redactedCount + canaryLeakCount;
  const piiSafe = piiLeakCount === 0;
  const piiSafetyScore = piiSafe ? 30 : 0;

  // 3. 한국어 번역투 점검 (20점)
  const hitSet = new Set<string>();
  for (const leaf of leafStrings) {
    if (/[가-힣]/u.test(leaf)) {
      for (const hit of detectKoreanTranslationese(leaf)) {
        hitSet.add(hit);
      }
    }
  }
  const translationeseHits = Array.from(hitSet);
  const naturalKoreanScore = Math.max(0, 20 - translationeseHits.length * 10);

  // 4. 길이 경계 점검 (15점)
  const lengthWithinBounds = measuredCharLength >= minChars && measuredCharLength <= maxChars;
  const lengthBoundsScore = lengthWithinBounds ? 15 : 0;

  const totalScore = schemaScore + piiSafetyScore + naturalKoreanScore + lengthBoundsScore;
  const passed =
    schemaValid &&
    piiSafe &&
    translationeseHits.length === 0 &&
    lengthWithinBounds &&
    totalScore >= 85;

  const failureReasons: string[] = [];
  if (!schemaValid) failureReasons.push("스키마 불일치");
  if (!piiSafe) failureReasons.push(`개인정보 미마스킹 유출 ${piiLeakCount}건`);
  if (translationeseHits.length > 0) failureReasons.push(`번역투 검출(${translationeseHits.join(", ")})`);
  if (!lengthWithinBounds) failureReasons.push(`출력 글자 수 범위 이탈(${measuredCharLength}자)`);

  const summaryKo = passed
    ? `품질 심사 통과(${totalScore}점/100점): 스키마 정합성, 개인정보 무유출(0건), 자연스러운 한국어 문체, 길이 경계를 모두 만족합니다.`
    : `품질 보완 필요(${totalScore}점/100점): ${failureReasons.join(", ")} 항목을 확인하세요.`;

  return {
    totalScore,
    passed,
    breakdown: {
      schemaScore,
      piiSafetyScore,
      naturalKoreanScore,
      lengthBoundsScore,
    },
    schemaValid,
    schemaIssues,
    piiLeakCount,
    piiSafe,
    translationeseHits,
    lengthWithinBounds,
    measuredCharLength,
    summaryKo,
  };
}

const CrossModelEditorialVerdictSchema = z
  .object({
    editorialScore: z.number().int().min(0).max(100),
    strengthKo: z.string().min(1).max(260),
    improvementTipKo: z.string().min(1).max(260),
  })
  .strict();

const CROSS_MODEL_JUDGE_JSON_SCHEMA: JsonSchemaContract = Object.freeze({
  name: "toonstudio_cross_model_quality_judge",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["editorialScore", "strengthKo", "improvementTipKo"],
    properties: {
      editorialScore: {
        type: "integer",
        description: "실제 웹툰 제작 현장 활용도 및 한국어 자연스러움 점수(0~100)",
      },
      strengthKo: { type: "string", description: "출력 결과의 가장 뛰어난 강점(한국어)" },
      improvementTipKo: { type: "string", description: "추가로 다듬으면 좋은 한 줄 조언(한국어)" },
    },
  },
});

export interface CrossModelQualityJudgeResult extends AssistQualityScoreReport {
  readonly judgeProviderUsed: NextGenProviderId;
  readonly judgeModelUsed: string;
  readonly editorialScore: number;
  readonly blendedScore: number;
  readonly strengthKo: string;
  readonly improvementTipKo: string;
}

/**
 * 결정론 4대 안전·품질 게이트(`scoreAssistOutputQuality`) 위에 교차 공급자(OpenAI <-> Gemini)의
 * 편집부 현장성 평가를 결합한다. 안전 게이트가 하나라도 실패하면 `passed`는 항상 `false`를 유지한다.
 */
export async function runCrossModelQualityJudge<T = unknown>(
  input: AssistOutputQualityInput<T> & {
    readonly moduleNameKo: string;
    readonly producedByProvider?: NextGenProviderId;
  },
  options?: NextGenCascadeOptions,
): Promise<CrossModelQualityJudgeResult> {
  const baseReport = scoreAssistOutputQuality(input);
  const crossOrder: readonly ("openai" | "gemini")[] =
    input.producedByProvider === "openai" ? ["gemini", "openai"] : ["openai", "gemini"];

  const serializedPreview = sanitizeValueStringsDeep(
    JSON.stringify(input.output ?? {}).slice(0, 3_200),
    { polishKorean: false },
  );

  const cascade = await executeDualProviderCascade({
    systemInstruction:
      "당신은 한국 웹툰 스튜디오 수석 편집장입니다. 전달된 AI 도우미 JSON 결과물의 현장 활용성, 대사·연출 구체성, 번역투 없는 한국어 완성도를 엄격히 채점하세요.",
    userPrompt: `대상 모듈: ${input.moduleNameKo}\n결정론 사전 점수: ${baseReport.totalScore}/100\n결과물 미리보기:\n${serializedPreview.sanitized}`,
    piiInputRedactedCount: serializedPreview.redactedCount,
    jsonSchema: CROSS_MODEL_JUDGE_JSON_SCHEMA,
    outputSchema: CrossModelEditorialVerdictSchema,
    normalizeParsed: (decoded) => {
      if (!decoded || typeof decoded !== "object") return decoded;
      const obj = decoded as Record<string, unknown>;
      const scoreNum = typeof obj.editorialScore === "number" ? obj.editorialScore : 88;
      return {
        editorialScore: Math.min(100, Math.max(0, Math.round(scoreNum))),
        strengthKo: clampLen(
          obj.strengthKo,
          "웹툰 실무 규격과 한국어 구어 호흡이 안정적으로 맞물립니다.",
          4,
          260,
        ),
        improvementTipKo: clampLen(
          obj.improvementTipKo,
          "장르별 고유 어휘 밀도를 한층 더 살리면 완성도가 높아집니다.",
          4,
          260,
        ),
      };
    },
    buildLocalFallback: () => ({
      editorialScore: baseReport.totalScore,
      strengthKo: baseReport.passed
        ? "스키마 정합성과 한국어 문체, 개인정보 보호 기준을 모두 충족합니다."
        : "사전 품질 게이트에서 보완 지점이 명확히 식별되었습니다.",
      improvementTipKo: baseReport.passed
        ? "컷 전환 직전 여운과 캐릭터별 고유 말버릇을 함께 대조해 보세요."
        : baseReport.summaryKo.slice(0, 240),
    }),
    options: {
      ...options,
      preferredOrder: options?.preferredOrder ?? crossOrder,
      maxCompletionTokens: 500,
    },
  });

  const blendedScore = Math.round(baseReport.totalScore * 0.7 + cascade.data.editorialScore * 0.3);

  return {
    ...baseReport,
    passed: baseReport.passed && blendedScore >= 82,
    judgeProviderUsed: cascade.providerUsed,
    judgeModelUsed: cascade.modelUsed,
    editorialScore: cascade.data.editorialScore,
    blendedScore,
    strengthKo: cascade.data.strengthKo,
    improvementTipKo: cascade.data.improvementTipKo,
  };
}
