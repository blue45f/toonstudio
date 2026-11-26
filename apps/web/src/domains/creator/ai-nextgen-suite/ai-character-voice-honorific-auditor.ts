import { z } from "zod";

import {
  detectKoreanTranslationese,
  executeDualProviderCascade,
  sanitizeValueStringsDeep,
  type JsonSchemaContract,
  type NextGenCascadeOptions,
  type NextGenCascadeResult,
} from "./ai-nextgen-provider-cascade";

/**
 * 한국어 화법·존비어(하십시오체·해요체·반말·사극체) 인물 간 관계 매트릭스 및 캐릭터 보이스 이탈 검수기.
 *
 * 다컷 원고에서 화자-청자 쌍별 기대 화법과 실제 대사 어미를 문장 단위로 대조하고,
 * 금기 어휘 노출·말투 길이 붕괴·기계 번역투 혼입을 잡아 캐릭터 고유의 입말로 교정한다.
 */

export const SPEECH_REGISTERS = ["hasipsio", "haeyo", "banmal", "sageuk"] as const;

export type SpeechRegister = (typeof SPEECH_REGISTERS)[number];

export const SPEECH_REGISTER_LABEL_KO: Readonly<Record<SpeechRegister, string>> = Object.freeze({
  hasipsio: "하십시오체(격식 높임)",
  haeyo: "해요체(두루높임)",
  banmal: "반말(해체·해라체)",
  sageuk: "사극체(하오·하소서·하게체)",
});

export interface CharacterVoiceSpec {
  readonly id: string;
  readonly name: string;
  readonly voiceSignatureKo: string;
  readonly defaultRegister: SpeechRegister;
  readonly sentenceLengthTarget?: "short" | "medium" | "long";
  readonly forbiddenPhrases?: readonly string[];
}

export interface HonorificRelationRule {
  readonly speakerId: string;
  readonly listenerId: string;
  readonly expectedRegister: SpeechRegister;
  readonly relationLabelKo: string;
}

export interface DialogueCutItem {
  readonly cutNumber: number;
  readonly speakerId: string;
  readonly listenerId: string;
  readonly line: string;
  readonly sceneContextKo?: string;
}

export interface CharacterVoiceHonorificAuditInput {
  readonly workTitle?: string;
  readonly genre?: string;
  readonly characters: readonly CharacterVoiceSpec[];
  readonly relationMatrix: readonly HonorificRelationRule[];
  readonly dialogueCuts: readonly DialogueCutItem[];
}

export const VIOLATION_ISSUE_KINDS = [
  "honorific-mismatch",
  "voice-drift",
  "forbidden-phrase",
  "translationese-tone",
] as const;

export type HonorificViolationKind = (typeof VIOLATION_ISSUE_KINDS)[number];

export const RelationMatrixCoverageItemSchema = z
  .object({
    speakerId: z.string().min(1).max(80),
    listenerId: z.string().min(1).max(80),
    expectedRegister: z.enum(SPEECH_REGISTERS),
    observedRegisters: z.array(z.enum(SPEECH_REGISTERS)).min(0).max(4),
    compliantCount: z.number().int().min(0).max(500),
    violationCount: z.number().int().min(0).max(500),
  })
  .strict();

export const HonorificViolationItemSchema = z
  .object({
    cutNumber: z.number().int().min(1).max(1_000),
    speakerId: z.string().min(1).max(80),
    listenerId: z.string().min(1).max(80),
    issueKind: z.enum(VIOLATION_ISSUE_KINDS),
    severity: z.enum(["critical", "warn", "tip"]),
    detectedRegister: z.enum(SPEECH_REGISTERS),
    expectedRegister: z.enum(SPEECH_REGISTERS),
    originalLine: z.string().min(1).max(360),
    reasonKo: z.string().min(1).max(360),
    rewrittenLineKo: z.string().min(1).max(360),
  })
  .strict();

export const CharacterVoiceProfileSummarySchema = z
  .object({
    characterId: z.string().min(1).max(80),
    consistencyScore: z.number().int().min(0).max(100),
    averageCharLength: z.number().int().min(1).max(500),
    voiceFeedbackKo: z.string().min(1).max(320),
  })
  .strict();

export const CharacterVoiceHonorificAuditOutputSchema = z
  .object({
    overallVoiceConsistencyScore: z.number().int().min(0).max(100),
    auditSummaryKo: z.string().min(1).max(520),
    relationMatrixCoverage: z.array(RelationMatrixCoverageItemSchema).min(1).max(40),
    violations: z.array(HonorificViolationItemSchema).min(0).max(60),
    characterVoiceProfiles: z.array(CharacterVoiceProfileSummarySchema).min(1).max(24),
  })
  .strict();

export type RelationMatrixCoverageItem = z.infer<typeof RelationMatrixCoverageItemSchema>;
export type HonorificViolationItem = z.infer<typeof HonorificViolationItemSchema>;
export type CharacterVoiceProfileSummary = z.infer<typeof CharacterVoiceProfileSummarySchema>;
export type CharacterVoiceHonorificAuditOutput = z.infer<
  typeof CharacterVoiceHonorificAuditOutputSchema
>;

const REGISTER_ENUM_SCHEMA = { type: "string", enum: ["hasipsio", "haeyo", "banmal", "sageuk"] } as const;

export const CHARACTER_VOICE_HONORIFIC_JSON_SCHEMA: JsonSchemaContract = Object.freeze({
  name: "toonstudio_character_voice_honorific_audit",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["overallVoiceConsistencyScore", "auditSummaryKo", "relationMatrixCoverage", "violations", "characterVoiceProfiles"],
    properties: {
      overallVoiceConsistencyScore: { type: "integer", description: "전체 대사 화법·보이스 일관성 점수(0~100 정수)" },
      auditSummaryKo: { type: "string", description: "존비어 매트릭스 준수 여부 및 캐릭터 말투 총평(자연스러운 한국어)" },
      relationMatrixCoverage: {
        type: "array",
        description: "화자-청자 관계별 화법 준수·위반 집계",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["speakerId", "listenerId", "expectedRegister", "observedRegisters", "compliantCount", "violationCount"],
          properties: {
            speakerId: { type: "string" },
            listenerId: { type: "string" },
            expectedRegister: REGISTER_ENUM_SCHEMA,
            observedRegisters: { type: "array", items: REGISTER_ENUM_SCHEMA },
            compliantCount: { type: "integer" },
            violationCount: { type: "integer" },
          },
        },
      },
      violations: {
        type: "array",
        description: "검출된 존비어 충돌·보이스 이탈·금기어·번역투 목록(없으면 빈 배열)",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["cutNumber", "speakerId", "listenerId", "issueKind", "severity", "detectedRegister", "expectedRegister", "originalLine", "reasonKo", "rewrittenLineKo"],
          properties: {
            cutNumber: { type: "integer" },
            speakerId: { type: "string" },
            listenerId: { type: "string" },
            issueKind: { type: "string", enum: ["honorific-mismatch", "voice-drift", "forbidden-phrase", "translationese-tone"] },
            severity: { type: "string", enum: ["critical", "warn", "tip"] },
            detectedRegister: REGISTER_ENUM_SCHEMA,
            expectedRegister: REGISTER_ENUM_SCHEMA,
            originalLine: { type: "string" },
            reasonKo: { type: "string", description: "위반 사유 설명(번역투 없는 한국어)" },
            rewrittenLineKo: { type: "string", description: "기대 화법과 캐릭터 개성에 맞게 고친 실제 대사" },
          },
        },
      },
      characterVoiceProfiles: {
        type: "array",
        description: "캐릭터별 말투 일관성 진단",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["characterId", "consistencyScore", "averageCharLength", "voiceFeedbackKo"],
          properties: {
            characterId: { type: "string" },
            consistencyScore: { type: "integer" },
            averageCharLength: { type: "integer" },
            voiceFeedbackKo: { type: "string" },
          },
        },
      },
    },
  },
});

const TRAILING_PUNCT_CHARS = new Set([
  " ", "\t", "\r", "\n", ".", "!", "?", "~", "…", "⋯", ",", "\"", "'", "“", "”", "‘", "’", ")", "]", "}", "♪", "♡",
]);

const SAGEUK_SUFFIXES = [
  "사옵니다", "이옵니다", "옵니다", "나이다", "시옵소서", "하소서", "옵소서", "주소서", "소서",
  "구려", "도다", "노라", "렷다", "거라", "너라", "느냐", "으시오", "하시오", "보시오", "마시오",
  "겠소", "있소", "없소", "아닌가", "하는가", "되는가", "하오", "마오", "보오", "시오", "리다", "오리다", "소이다",
] as const;

const HASIPSIO_SUFFIXES = [
  "습니다", "습니까", "십시오", "십니까", "옵니다만", "입니다", "입니까", "랍니다",
  "갑니다", "옵니다", "봅니다", "합니다", "됩니다", "줍니다", "니다", "니까",
] as const;

const HAEYO_SUFFIXES = [
  "군요", "네요", "지요", "까요", "래요", "대요", "나요", "가요",
  "어요", "아요", "여요", "예요", "이에요", "세요", "셔요", "죠", "요",
] as const;

const BANMAL_SUFFIXES = [
  "잖아", "거든", "구나", "란다", "거야", "이야", "건가", "던가", "는데", "할게", "갈게", "볼게", "줄게",
  "어라", "아라", "자고", "다고", "냐고", "다", "야", "어", "아", "지", "냐", "니", "군", "네",
  "자", "마", "래", "대", "걸", "해", "와", "줘", "봐", "가",
] as const;

const PURE_INTERJECTIONS = new Set(["헉", "앗", "아", "어", "음", "흠", "으악", "크윽", "윽", "하아", "후우", "잠깐"]);

function stripTrailingPunctuation(raw: string): string {
  let end = raw.length;
  while (end > 0 && TRAILING_PUNCT_CHARS.has(raw[end - 1]!)) {
    end -= 1;
  }
  return raw.slice(0, end).trim();
}

/**
 * 단일 문장의 종결 어미를 선형 시간(`O(n)`)으로 분석해 한국어 4대 화법을 판정한다.
 * 감탄사·말줄임표 단독 컷은 `"neutral"`을 반환해 오탐을 막는다.
 */
export function classifySingleClauseRegister(clause: string): SpeechRegister | "neutral" {
  const core = stripTrailingPunctuation(clause);
  if (!core || core.length <= 1 || PURE_INTERJECTIONS.has(core)) {
    return "neutral";
  }
  for (const suffix of SAGEUK_SUFFIXES) {
    if (core.endsWith(suffix)) return "sageuk";
  }
  for (const suffix of HASIPSIO_SUFFIXES) {
    if (core.endsWith(suffix)) return "hasipsio";
  }
  for (const suffix of HAEYO_SUFFIXES) {
    if (core.endsWith(suffix)) return "haeyo";
  }
  for (const suffix of BANMAL_SUFFIXES) {
    if (core.endsWith(suffix)) return "banmal";
  }
  return "neutral";
}

/**
 * 말풍선 대사 전체(복수 문장 포함)를 분석해 대표 화법과 기대 화법 위반 어미를 찾아낸다.
 */
export function classifyKoreanHonorificRegister(
  line: string,
  expectedRegister?: SpeechRegister,
): SpeechRegister | "neutral" {
  const clauses = line
    .split(/[.!?…\r\n]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const detectedList: SpeechRegister[] = [];
  for (const clause of clauses) {
    const reg = classifySingleClauseRegister(clause);
    if (reg !== "neutral") {
      detectedList.push(reg);
    }
  }
  if (detectedList.length === 0) {
    return classifySingleClauseRegister(line);
  }
  // 말풍선 내 한 문장이라도 기대 화법에서 이탈하면 해당 이탈 화법을 우선 보고한다.
  if (expectedRegister) {
    const mismatch = detectedList.find((reg) => reg !== expectedRegister);
    if (mismatch) return mismatch;
  }
  return detectedList[detectedList.length - 1]!;
}

/**
 * 화법 충돌이 발생한 문장을 기대 화법(`하십시오체/해요체/반말/사극체`)에 맞게 자연스럽게 변환한다.
 */
export function convertKoreanLineToRegister(
  originalLine: string,
  targetRegister: SpeechRegister,
): string {
  const trimmed = originalLine.trim();
  if (!trimmed) return trimmed;
  const isQuestion = trimmed.includes("?");
  const core = stripTrailingPunctuation(trimmed);
  if (!core) return trimmed;

  // 대표 종결부를 어간 근처로 정리한 뒤 목표 화법 종결형을 결합한다.
  const stemCleaners = [
    "사옵니다", "이옵니다", "시옵소서", "하소서", "습니다", "습니까", "십시오", "십니까", "입니다", "입니까",
    "했어요", "해요", "예요", "이에요", "군요", "네요", "잖아", "거든", "거야", "이야", "구나",
    "하오", "겠소", "거라", "느냐", "도다", "어", "아", "야", "지", "냐", "니", "다", "요",
  ] as const;

  let base = core;
  for (const suffix of stemCleaners) {
    if (base.length > suffix.length + 1 && base.endsWith(suffix)) {
      base = base.slice(0, base.length - suffix.length);
      break;
    }
  }

  switch (targetRegister) {
    case "hasipsio":
      return isQuestion ? `${base}습니까?` : `${base}습니다.`;
    case "haeyo":
      return isQuestion ? `${base}나요?` : `${base}어요.`;
    case "banmal":
      return isQuestion ? `${base}냐?` : `${base}어.`;
    case "sageuk":
      return isQuestion ? `${base}는가?` : `${base}사옵니다.`;
  }
}

function clampIntScore(value: unknown, fallback: number, max = 100): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(0, Math.round(n)));
}

function trimSafe(value: unknown, fallback: string, maxLen: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return fallback;
  return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1)}…`;
}

function resolveExpectedRegister(
  speakerId: string,
  listenerId: string,
  characters: readonly CharacterVoiceSpec[],
  relationMatrix: readonly HonorificRelationRule[],
): { readonly expected: SpeechRegister; readonly relationLabelKo: string } {
  const rule = relationMatrix.find(
    (item) => item.speakerId === speakerId && item.listenerId === listenerId,
  );
  if (rule) {
    return { expected: rule.expectedRegister, relationLabelKo: rule.relationLabelKo };
  }
  const speaker = characters.find((ch) => ch.id === speakerId);
  return {
    expected: speaker?.defaultRegister ?? "haeyo",
    relationLabelKo: "기본 화법",
  };
}

/**
 * 로컬 결정론 존비어·캐릭터 보이스 검수기.
 */
export function buildLocalCharacterVoiceHonorificAudit(
  rawInput: CharacterVoiceHonorificAuditInput,
): CharacterVoiceHonorificAuditOutput {
  const clean = sanitizeValueStringsDeep(rawInput, { polishKorean: false }).sanitized;
  const characters =
    clean.characters.length > 0
      ? clean.characters.slice(0, 24)
      : [
          {
            id: "char-1",
            name: "주인공",
            voiceSignatureKo: "간결하고 단호한 말투",
            defaultRegister: "haeyo" as const,
          },
        ];

  const charById = new Map<string, CharacterVoiceSpec>();
  for (const ch of characters) {
    charById.set(ch.id, ch);
  }

  const pairStats = new Map<
    string,
    {
      speakerId: string;
      listenerId: string;
      expectedRegister: SpeechRegister;
      observed: Set<SpeechRegister>;
      compliantCount: number;
      violationCount: number;
    }
  >();

  for (const rel of clean.relationMatrix.slice(0, 40)) {
    const key = `${rel.speakerId}->${rel.listenerId}`;
    pairStats.set(key, {
      speakerId: rel.speakerId,
      listenerId: rel.listenerId,
      expectedRegister: rel.expectedRegister,
      observed: new Set<SpeechRegister>(),
      compliantCount: 0,
      violationCount: 0,
    });
  }

  const violations: HonorificViolationItem[] = [];
  const charLengths = new Map<string, number[]>();
  const charViolationCounts = new Map<string, number>();

  for (const cut of clean.dialogueCuts.slice(0, 120)) {
    const speaker = charById.get(cut.speakerId);
    const listener = charById.get(cut.listenerId);
    const speakerName = speaker?.name ?? cut.speakerId;
    const listenerName = listener?.name ?? cut.listenerId;
    const { expected, relationLabelKo } = resolveExpectedRegister(
      cut.speakerId,
      cut.listenerId,
      characters,
      clean.relationMatrix,
    );

    const detectedRaw = classifyKoreanHonorificRegister(cut.line, expected);
    const detected: SpeechRegister = detectedRaw === "neutral" ? expected : detectedRaw;

    const pairKey = `${cut.speakerId}->${cut.listenerId}`;
    let stat = pairStats.get(pairKey);
    if (!stat) {
      stat = {
        speakerId: cut.speakerId,
        listenerId: cut.listenerId,
        expectedRegister: expected,
        observed: new Set<SpeechRegister>(),
        compliantCount: 0,
        violationCount: 0,
      };
      pairStats.set(pairKey, stat);
    }
    stat.observed.add(detected);

    const lineChars = cut.line.trim().length;
    const lengths = charLengths.get(cut.speakerId) ?? [];
    lengths.push(lineChars);
    charLengths.set(cut.speakerId, lengths);

    let cutViolated = false;

    const forbiddenHit = (speaker?.forbiddenPhrases ?? []).find(
      (phrase) => phrase.trim().length > 0 && cut.line.includes(phrase.trim()),
    );
    const cleanedLineForRewrite = forbiddenHit
      ? cut.line.split(forbiddenHit).join("").replace(/\s{2,}/gu, " ").trim()
      : cut.line;

    if (detectedRaw !== "neutral" && detected !== expected) {
      cutViolated = true;
      violations.push({
        cutNumber: Math.max(1, Math.trunc(cut.cutNumber)),
        speakerId: cut.speakerId,
        listenerId: cut.listenerId,
        issueKind: "honorific-mismatch",
        severity: "critical",
        detectedRegister: detected,
        expectedRegister: expected,
        originalLine: trimSafe(cut.line, "(빈 대사)", 360),
        reasonKo: `${speakerName} -> ${listenerName}(${relationLabelKo}) 관계는 ${SPEECH_REGISTER_LABEL_KO[expected]}가 기준인데 ${SPEECH_REGISTER_LABEL_KO[detected]} 어미가 섞였습니다.`,
        rewrittenLineKo: trimSafe(
          convertKoreanLineToRegister(cleanedLineForRewrite || cut.line, expected),
          cut.line,
          360,
        ),
      });
    }

    if (forbiddenHit) {
      cutViolated = true;
      violations.push({
        cutNumber: Math.max(1, Math.trunc(cut.cutNumber)),
        speakerId: cut.speakerId,
        listenerId: cut.listenerId,
        issueKind: "forbidden-phrase",
        severity: "warn",
        detectedRegister: detected,
        expectedRegister: expected,
        originalLine: trimSafe(cut.line, "(빈 대사)", 360),
        reasonKo: `${speakerName} 캐릭터 금기 표현('${forbiddenHit}')이 대사에 노출되어 인물 설정과 충돌합니다.`,
        rewrittenLineKo: trimSafe(
          convertKoreanLineToRegister(cleanedLineForRewrite || "지금 당장 확인하겠어", expected),
          cut.line,
          360,
        ),
      });
    }

    const transHits = detectKoreanTranslationese(cut.line);
    if (transHits.length > 0) {
      cutViolated = true;
      violations.push({
        cutNumber: Math.max(1, Math.trunc(cut.cutNumber)),
        speakerId: cut.speakerId,
        listenerId: cut.listenerId,
        issueKind: "translationese-tone",
        severity: "warn",
        detectedRegister: detected,
        expectedRegister: expected,
        originalLine: trimSafe(cut.line, "(빈 대사)", 360),
        reasonKo: `대사에 딱딱한 번역투('${transHits[0]}')가 섞여 입말 호흡이 어색합니다.`,
        rewrittenLineKo: trimSafe(
          sanitizeValueStringsDeep(cut.line, { polishKorean: true }).sanitized,
          cut.line,
          360,
        ),
      });
    }

    if (speaker?.sentenceLengthTarget === "short" && lineChars > 68 && !cutViolated) {
      cutViolated = true;
      const firstSentence = cut.line.split(/[.!?]/u)[0]?.trim() ?? cut.line.slice(0, 36);
      violations.push({
        cutNumber: Math.max(1, Math.trunc(cut.cutNumber)),
        speakerId: cut.speakerId,
        listenerId: cut.listenerId,
        issueKind: "voice-drift",
        severity: "tip",
        detectedRegister: detected,
        expectedRegister: expected,
        originalLine: trimSafe(cut.line, "(빈 대사)", 360),
        reasonKo: `${speakerName}는 짧고 건조한 단문 화법 캐릭터인데 한 말풍선에 긴 설명문이 몰려 캐릭터 결이 흐려졌습니다.`,
        rewrittenLineKo: trimSafe(
          convertKoreanLineToRegister(firstSentence, expected),
          cut.line,
          360,
        ),
      });
    }

    if (cutViolated) {
      stat.violationCount += 1;
      charViolationCounts.set(cut.speakerId, (charViolationCounts.get(cut.speakerId) ?? 0) + 1);
    } else {
      stat.compliantCount += 1;
    }
  }

  if (pairStats.size === 0) {
    const first = characters[0]!;
    pairStats.set(`${first.id}->${first.id}`, {
      speakerId: first.id,
      listenerId: first.id,
      expectedRegister: first.defaultRegister,
      observed: new Set([first.defaultRegister]),
      compliantCount: 1,
      violationCount: 0,
    });
  }

  const relationMatrixCoverage: RelationMatrixCoverageItem[] = Array.from(pairStats.values())
    .slice(0, 40)
    .map((entry) => ({
      speakerId: entry.speakerId,
      listenerId: entry.listenerId,
      expectedRegister: entry.expectedRegister,
      observedRegisters: Array.from(entry.observed).slice(0, 4),
      compliantCount: entry.compliantCount,
      violationCount: entry.violationCount,
    }));

  const characterVoiceProfiles: CharacterVoiceProfileSummary[] = characters.map((ch) => {
    const lengths = charLengths.get(ch.id) ?? [18];
    const avgLen = Math.max(
      1,
      Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
    );
    const vCount = charViolationCounts.get(ch.id) ?? 0;
    const score = clampIntScore(100 - vCount * 18, 92);
    return {
      characterId: ch.id,
      consistencyScore: score,
      averageCharLength: Math.min(500, avgLen),
      voiceFeedbackKo:
        vCount === 0
          ? `${ch.name}의 기본 화법(${SPEECH_REGISTER_LABEL_KO[ch.defaultRegister]})과 말투 호흡이 흔들림 없이 유지됩니다.`
          : `${ch.name} 대사에서 화법·어휘 이탈 ${vCount}건이 발견되어 관계 기준 어미로 재정렬이 필요합니다.`,
    };
  });

  const totalCuts = Math.max(1, clean.dialogueCuts.length);
  const overallScore = clampIntScore(100 - Math.round((violations.length / totalCuts) * 75), 85);

  return {
    overallVoiceConsistencyScore: overallScore,
    auditSummaryKo:
      violations.length === 0
        ? `총 ${clean.dialogueCuts.length}개 대사 컷 모두 화자-청자 존비어 매트릭스와 캐릭터 고유의 입말 리듬을 정확히 지켰습니다.`
        : `총 ${clean.dialogueCuts.length}개 대사 컷 중 ${violations.length}건의 화법·캐릭터 말투 충돌을 찾아 관계별 종결 어미와 대사 호흡에 맞는 수정안을 제시했습니다.`,
    relationMatrixCoverage,
    violations: violations.slice(0, 60),
    characterVoiceProfiles,
  };
}

function reconcileWithDeterministicTraps(
  llmResult: CharacterVoiceHonorificAuditOutput,
  input: CharacterVoiceHonorificAuditInput,
): CharacterVoiceHonorificAuditOutput {
  const deterministic = buildLocalCharacterVoiceHonorificAudit(input);
  const hardDetViolations = deterministic.violations.filter(
    (v) => v.issueKind === "honorific-mismatch" || v.issueKind === "forbidden-phrase",
  );
  if (hardDetViolations.length === 0) return llmResult;

  const merged = [...llmResult.violations];
  for (const trap of hardDetViolations) {
    const alreadyCovered = merged.some(
      (item) =>
        item.cutNumber === trap.cutNumber &&
        item.speakerId === trap.speakerId &&
        (item.issueKind === trap.issueKind ||
          (trap.issueKind === "honorific-mismatch" &&
            item.detectedRegister !== item.expectedRegister)),
    );
    if (!alreadyCovered && merged.length < 60) {
      merged.push(trap);
    }
  }
  if (merged.length === llmResult.violations.length) return llmResult;

  merged.sort((a, b) => a.cutNumber - b.cutNumber);
  const adjustedScore = Math.min(
    llmResult.overallVoiceConsistencyScore,
    deterministic.overallVoiceConsistencyScore,
  );
  return {
    ...llmResult,
    overallVoiceConsistencyScore: adjustedScore,
    relationMatrixCoverage: deterministic.relationMatrixCoverage,
    violations: merged,
  };
}

export function buildCharacterVoiceHonorificPrompt(input: CharacterVoiceHonorificAuditInput): {
  readonly systemInstruction: string;
  readonly userPrompt: string;
  readonly piiInputRedactedCount: number;
} {
  const sanitized = sanitizeValueStringsDeep(input, { polishKorean: false });
  const safe = sanitized.sanitized;

  const systemInstruction = [
    "당신은 한국 웹툰 대사 감수 전문가이자 캐릭터 화법 디렉터입니다.",
    "제공된 캐릭터 보이스 설정과 화자-청자 존비어 매트릭스(hasipsio=하십시오체, haeyo=해요체, banmal=반말, sageuk=사극체)를 기준으로 모든 대사 컷을 검수하세요.",
    "한 말풍선 안에 두 문장이 있을 때 뒷문장에서 반말·현대어가 튀어나오는 함정, 캐릭터 금기어 노출, 말투 길이 이탈을 빠짐없이 찾아내 자연스러운 입말 대사로 고치세요.",
    "reasonKo, auditSummaryKo, voiceFeedbackKo에는 번역투('~하는 것을 가능하게', '직관적인 경험', '에 있어서')를 절대 쓰지 마세요.",
  ].join("\n");

  const charLines = safe.characters.slice(0, 24).map((ch) => {
    const forbidden =
      ch.forbiddenPhrases && ch.forbiddenPhrases.length > 0
        ? ` | 금기어: ${ch.forbiddenPhrases.join(", ")}`
        : "";
    const lenHint = ch.sentenceLengthTarget ? ` | 문장 호흡: ${ch.sentenceLengthTarget}` : "";
    return `- ${ch.id}(${ch.name}): 기본=${ch.defaultRegister}, 특징=${ch.voiceSignatureKo}${lenHint}${forbidden}`;
  });

  const matrixLines = safe.relationMatrix
    .slice(0, 40)
    .map(
      (rel) =>
        `- ${rel.speakerId} -> ${rel.listenerId}: 기대 화법=${rel.expectedRegister} (${rel.relationLabelKo})`,
    );

  const cutLines = safe.dialogueCuts.slice(0, 120).map((cut) => {
    const { expected } = resolveExpectedRegister(
      cut.speakerId,
      cut.listenerId,
      safe.characters,
      safe.relationMatrix,
    );
    const morphHint = classifyKoreanHonorificRegister(cut.line, expected);
    const ctx = cut.sceneContextKo ? ` [상황: ${cut.sceneContextKo}]` : "";
    return `- ${cut.cutNumber}컷 (${cut.speakerId} -> ${cut.listenerId}, 기대=${expected}, 형태소감지=${morphHint})${ctx}: "${cut.line}"`;
  });

  const userPrompt = [
    `작품/장르: ${safe.workTitle ?? "웹툰 원고"} (${safe.genre ?? "일반"})`,
    "캐릭터 설정:",
    ...charLines,
    "존비어 관계 매트릭스:",
    ...(matrixLines.length > 0 ? matrixLines : ["- 기본 캐릭터 설정 화법 적용"]),
    "검수 대상 대사 컷:",
    ...cutLines,
  ].join("\n");

  return {
    systemInstruction,
    userPrompt,
    piiInputRedactedCount: sanitized.redactedCount,
  };
}

export async function runCharacterVoiceHonorificAuditor(
  input: CharacterVoiceHonorificAuditInput,
  options?: NextGenCascadeOptions,
): Promise<NextGenCascadeResult<CharacterVoiceHonorificAuditOutput>> {
  const prompt = buildCharacterVoiceHonorificPrompt(input);
  return executeDualProviderCascade({
    systemInstruction: prompt.systemInstruction,
    userPrompt: prompt.userPrompt,
    piiInputRedactedCount: prompt.piiInputRedactedCount,
    jsonSchema: CHARACTER_VOICE_HONORIFIC_JSON_SCHEMA,
    outputSchema: CharacterVoiceHonorificAuditOutputSchema,
    postTransformValid: (validated) => reconcileWithDeterministicTraps(validated, input),
    buildLocalFallback: () => buildLocalCharacterVoiceHonorificAudit(input),
    options,
  });
}
