/**
 * 빈칸 0% 스마트 기본값 · 선택 의도 자동 맞춤 엔진 (₩0 로컬 결정적 추론).
 *
 * `smart-defaults-stage-catalog.ts`의 5대 단계 정본 카탈로그를 바탕으로
 * `buildSmartStageDefaults`, 빈칸 0% 감사(`auditZeroBlankFields`), 빈칸 방어 가드,
 * 원클릭 "내 의도 한 줄로 전체 기본값 자동 맞춤"(`adaptSmartDefaultsFromIntentText`)을 제공한다.
 */

import {
  SMART_STAGE_ORDER,
  SMART_STAGE_TEMPLATES,
  type SmartFieldDefaultSpec,
  type SmartStageDefaultsBundle,
  type SmartStageId,
  type SmartStageTemplate,
} from "./smart-defaults-stage-catalog";

export {
  SMART_DEFAULT_SPRITE_PATHS,
  SMART_STAGE_ORDER,
  SMART_STAGE_TEMPLATES,
  type SmartFieldAlternative,
  type SmartFieldControlType,
  type SmartFieldDefaultSpec,
  type SmartStageDefaultsBundle,
  type SmartStageId,
  type SmartStagePreset,
  type SmartStageTemplate,
} from "./smart-defaults-stage-catalog";

export interface ZeroBlankAuditReport {
  readonly totalFields: number;
  readonly filledFields: number;
  readonly blankFields: readonly string[];
  readonly blankCount: number;
  readonly filledRatioPercent: number;
  readonly isZeroBlankCompliant: boolean;
}

export interface IntentAdaptationSignals {
  readonly genreKey: "action-fantasy" | "romance-fantasy" | "thriller-mystery" | "slice-of-life";
  readonly platformKey: "naver-official-1600" | "naver-challenge-690" | "kakao-page-720" | "global-800";
  readonly lightingKey: "golden-hour" | "neon-night" | "daylight-clear" | "deep-shadow";
  readonly tempoKey: "fast-impact" | "balanced-drama" | "slow-suspense" | "light-comedy";
  readonly detectedKeywordsKo: readonly string[];
}

export interface SmartIntentAdaptationResult {
  readonly rawIntentText: string;
  readonly normalizedIntentKo: string;
  readonly signals: IntentAdaptationSignals;
  readonly confidenceScore: number;
  readonly summaryKo: string;
  readonly activeStageId: SmartStageId;
  readonly activeStage: SmartStageDefaultsBundle;
  readonly stages: Readonly<Record<SmartStageId, SmartStageDefaultsBundle>>;
  readonly audit: ZeroBlankAuditReport;
}

export interface BuildSmartStageOptions {
  readonly seedOverrides?: Readonly<Record<string, string>>;
  readonly customBadgeKo?: string;
}

function finalizeStageBundle(
  template: SmartStageTemplate,
  fields: readonly SmartFieldDefaultSpec[],
): SmartStageDefaultsBundle {
  const blankCount = fields.filter((field) => field.value.trim().length === 0).length;
  const total = fields.length;
  const completionRatePercent = total === 0 ? 100 : Math.round(((total - blankCount) / total) * 100);
  return {
    stageId: template.stageId,
    stageLabelKo: template.stageLabelKo,
    stageGoalKo: template.stageGoalKo,
    spritePath: template.spritePath,
    fields,
    stagePresets: template.stagePresets,
    blankFieldCount: blankCount,
    completionRatePercent,
  };
}

/**
 * 지정한 창작 단계의 빈칸 0% 스마트 기본값 세트를 생성한다.
 */
export function buildSmartStageDefaults(
  stageId: SmartStageId,
  options?: BuildSmartStageOptions,
): SmartStageDefaultsBundle {
  const template = SMART_STAGE_TEMPLATES[stageId];
  const overrides = options?.seedOverrides;
  const fields = template.fields.map((field) => {
    const rawOverride = overrides?.[field.fieldId];
    const resolvedValue =
      typeof rawOverride === "string" && rawOverride.trim().length > 0
        ? rawOverride.trim()
        : field.recommendedValue;
    return {
      ...field,
      value: resolvedValue,
      aiSuggestionBadgeKo: options?.customBadgeKo ?? field.aiSuggestionBadgeKo,
    };
  });
  return finalizeStageBundle(template, fields);
}

/**
 * 전 5단계 기본값 번들을 한 번에 생성한다.
 */
export function buildAllSmartStageDefaults(): Readonly<Record<SmartStageId, SmartStageDefaultsBundle>> {
  return {
    planning: buildSmartStageDefaults("planning"),
    storyboard: buildSmartStageDefaults("storyboard"),
    stage3d: buildSmartStageDefaults("stage3d"),
    coloring: buildSmartStageDefaults("coloring"),
    delivery: buildSmartStageDefaults("delivery"),
  };
}

/**
 * 빈칸 0% 준수 여부를 전 필드 기준으로 감사한다.
 */
export function auditZeroBlankFields(
  input: SmartStageDefaultsBundle | Readonly<Record<SmartStageId, SmartStageDefaultsBundle>>,
): ZeroBlankAuditReport {
  const bundles: readonly SmartStageDefaultsBundle[] =
    "stageId" in input ? [input] : SMART_STAGE_ORDER.map((id) => input[id]);
  const blankFields: string[] = [];
  let totalFields = 0;

  for (const bundle of bundles) {
    for (const field of bundle.fields) {
      totalFields += 1;
      if (field.value.trim().length === 0) {
        blankFields.push(`${bundle.stageId}.${field.fieldId}`);
      }
    }
  }

  const filledFields = totalFields - blankFields.length;
  const filledRatioPercent = totalFields === 0 ? 100 : Math.round((filledFields / totalFields) * 100);
  return {
    totalFields,
    filledFields,
    blankFields,
    blankCount: blankFields.length,
    filledRatioPercent,
    isZeroBlankCompliant: blankFields.length === 0,
  };
}

/**
 * 사용자가 실수로 입력칸을 비워도 즉시 추천값으로 안전 복구할 수 있는 가드 값을 반환한다.
 */
export function guardNonEmptyFieldValue(
  field: SmartFieldDefaultSpec,
  candidateValue: string,
): { readonly value: string; readonly restoredFromFallback: boolean } {
  if (candidateValue.trim().length > 0) {
    return { value: candidateValue, restoredFromFallback: false };
  }
  return { value: field.recommendedValue, restoredFromFallback: true };
}

/**
 * 특정 단계 번들 내 1개 필드의 값을 대안 프리셋 또는 사용자 값으로 갱신한다.
 */
export function updateSmartStageFieldValue(
  bundle: SmartStageDefaultsBundle,
  fieldId: string,
  nextValue: string,
  options?: { readonly allowTemporaryEmpty?: boolean },
): SmartStageDefaultsBundle {
  const template = SMART_STAGE_TEMPLATES[bundle.stageId];
  const fields = bundle.fields.map((field) => {
    if (field.fieldId !== fieldId) return field;
    if (options?.allowTemporaryEmpty) {
      return { ...field, value: nextValue };
    }
    const guarded = guardNonEmptyFieldValue(field, nextValue);
    return { ...field, value: guarded.value };
  });
  return finalizeStageBundle(template, fields);
}

/**
 * 단계 단위 프리셋(3종 중 1종)을 원클릭 적용한다.
 */
export function applySmartStagePreset(
  bundle: SmartStageDefaultsBundle,
  presetId: string,
): SmartStageDefaultsBundle {
  const preset = bundle.stagePresets.find((item) => item.presetId === presetId);
  if (!preset) return bundle;
  const template = SMART_STAGE_TEMPLATES[bundle.stageId];
  const fields = bundle.fields.map((field) => {
    const override = preset.overrides[field.fieldId];
    if (!override || override.trim().length === 0) return field;
    return {
      ...field,
      value: override,
      recommendedWhy: `${preset.labelKo} 프리셋 적용: ${preset.summaryKo}`,
      aiSuggestionBadgeKo: `프리셋 적용 · ${preset.labelKo}`,
    };
  });
  return finalizeStageBundle(template, fields);
}

function detectSignalsFromIntent(intentText: string): IntentAdaptationSignals {
  const normalized = intentText.toLowerCase();
  const keywords: string[] = [];

  let genreKey: IntentAdaptationSignals["genreKey"] = "action-fantasy";
  if (/로판|로맨스|궁정|영애|회귀.*결혼|감정선|학원.*설렘/u.test(normalized)) {
    genreKey = "romance-fantasy";
    keywords.push("로맨스/감정선");
  } else if (/스릴러|미스터리|공포|호러|추리|느와르|누아르|사건/u.test(normalized)) {
    genreKey = "thriller-mystery";
    keywords.push("미스터리/스릴러");
  } else if (/일상|힐링|코미디|개그|고양이|오피스|에세이/u.test(normalized)) {
    genreKey = "slice-of-life";
    keywords.push("일상/힐링");
  } else if (/액션|헌터|판타지|사이버펑크|무협|배틀|전투/u.test(normalized)) {
    genreKey = "action-fantasy";
    keywords.push("액션/판타지");
  }

  let platformKey: IntentAdaptationSignals["platformKey"] = "naver-official-1600";
  if (/카카오|kakao|720|1440/u.test(normalized)) {
    platformKey = "kakao-page-720";
    keywords.push("카카오페이지");
  } else if (/글로벌|영문|영어|global|tapas|webtoon.*800|800px/u.test(normalized)) {
    platformKey = "global-800";
    keywords.push("글로벌 800px");
  } else if (/도전|베도|690/u.test(normalized)) {
    platformKey = "naver-challenge-690";
    keywords.push("네이버 도전 690px");
  } else if (/네이버|1600|정식/u.test(normalized)) {
    platformKey = "naver-official-1600";
    keywords.push("네이버 정식 1600px");
  }

  let lightingKey: IntentAdaptationSignals["lightingKey"] = "golden-hour";
  if (/네온|사이버|밤|야간|심야/u.test(normalized)) {
    lightingKey = "neon-night";
    keywords.push("야간/네온 광원");
  } else if (/새벽|어두운|암전|공포|그림자/u.test(normalized)) {
    lightingKey = "deep-shadow";
    keywords.push("저채도 심야 암부");
  } else if (/낮|맑은|학원|오피스|밝은|파스텔/u.test(normalized)) {
    lightingKey = "daylight-clear";
    keywords.push("맑은 자연광");
  } else if (/노을|석양|골든|따뜻/u.test(normalized)) {
    lightingKey = "golden-hour";
    keywords.push("오후 골든아워");
  } else if (genreKey === "thriller-mystery") {
    lightingKey = "deep-shadow";
  } else if (genreKey === "slice-of-life") {
    lightingKey = "daylight-clear";
  }

  let tempoKey: IntentAdaptationSignals["tempoKey"] = "balanced-drama";
  if (/빠른|고속|타격|75컷|박진감|전투/u.test(normalized)) {
    tempoKey = "fast-impact";
    keywords.push("고속 75컷 템포");
  } else if (/느린|긴장|서스펜스|여백/u.test(normalized)) {
    tempoKey = "slow-suspense";
    keywords.push("저속 서스펜스");
  } else if (/가벼운|경쾌|45컷|48컷|1인|코미디/u.test(normalized)) {
    tempoKey = "light-comedy";
    keywords.push("1인 경량 템포");
  } else if (genreKey === "action-fantasy") {
    tempoKey = "fast-impact";
  } else if (genreKey === "thriller-mystery") {
    tempoKey = "slow-suspense";
  } else if (genreKey === "slice-of-life") {
    tempoKey = "light-comedy";
  }

  return {
    genreKey,
    platformKey,
    lightingKey,
    tempoKey,
    detectedKeywordsKo: keywords.length > 0 ? keywords : ["상업 주간연재 기본 패턴"],
  };
}

function buildIntentOverridesByStage(
  signals: IntentAdaptationSignals,
  cleanIntent: string,
): Readonly<Record<SmartStageId, Readonly<Record<string, string>>>> {
  const planning: Record<string, string> = { synopsis: cleanIntent };
  const storyboard: Record<string, string> = {};
  const stage3d: Record<string, string> = {};
  const coloring: Record<string, string> = {};
  const delivery: Record<string, string> = {};

  if (signals.genreKey === "romance-fantasy") {
    planning.genre = "로맨스 판타지 · 회귀 궁정";
    planning.targetAudience = "2030 여성 중심 (감정선·작화 밀도)";
    planning.artStyle = "얇은 색선 + 부드러운 그라데이션 채색";
    storyboard.cliffhangerBeat = "두 사람 시선 교차 + 빛망울 클로즈업";
    stage3d.cameraPerspective = "인물 50mm (얕은 심도 · 감정 클로즈업)";
    stage3d.lineWeightPx = "1.0";
    stage3d.shadowContrast = "저대비 소프트 (로맨스·일상용)";
    coloring.paletteMood = "화사한 로맨스 파스텔 (피치·라벤더 하이라이트)";
    coloring.shadingStyle = "다층 반사광 + 머리카락/눈동자 글로우";
  } else if (signals.genreKey === "thriller-mystery") {
    planning.genre = "미스터리 · 도시 스릴러";
    planning.artStyle = "강약 큰 브러시 먹선 + 딥 블랙 톤";
    storyboard.cliffhangerBeat = "한 줄 충격 대사 + 흑백 반전 컷";
    stage3d.shadowContrast = "고대비 하드 셀 (액션·스릴러용)";
    coloring.paletteMood = "저채도 슬레이트 그레이 + 포인트 크림슨";
    coloring.keyLightAngleDeg = "290";
    coloring.postAtmosphere = "가장자리 암부 비네팅 25% + 미세 그레인";
  } else if (signals.genreKey === "slice-of-life") {
    planning.genre = "일상 · 오피스 힐링 코미디";
    planning.artStyle = "일정 굵기 둥근펜 + 1단 심플 음영";
    storyboard.cliffhangerBeat = "소품 클로즈업 + 나레이션 한 줄";
    coloring.shadingStyle = "1단 하드 셀 명암 (초고속 마감)";
    coloring.postAtmosphere = "색온도 미세 통일만 적용 (선명도 최우선)";
    delivery.ageRating = "전체 이용가 (비속어·흡연·유혈 완전 배제)";
  }

  if (signals.tempoKey === "fast-impact") {
    storyboard.cutCount = "75";
    storyboard.verticalGutterPx = "120";
    storyboard.pacingTempo = "고속 타격 (1스크롤 2컷 · 클라이맥스 집중)";
    stage3d.cameraPerspective = "광각 24mm (3점 투시 · 로우앵글)";
    coloring.postAtmosphere = "방사형 모션블러 + 하이라이트 스파크 30%";
  } else if (signals.tempoKey === "slow-suspense") {
    storyboard.cutCount = "58";
    storyboard.verticalGutterPx = "260";
    storyboard.pacingTempo = "저속 긴장 (긴 여백 · 시선 유도 암전 컷)";
  } else if (signals.tempoKey === "light-comedy") {
    storyboard.cutCount = "48";
    storyboard.verticalGutterPx = "150";
    storyboard.pacingTempo = "기승전결 4박자 (리액션 컷 강조)";
  }

  if (signals.lightingKey === "neon-night") {
    stage3d.timeOfDay = "네온 심야 (23:00 · 젖은 아스팔트 반사광)";
    stage3d.lineWeightPx = "2.2";
    coloring.paletteMood = "고채도 네온 림라이트 (시안·마젠타 대비)";
    coloring.keyLightAngleDeg = "135";
  } else if (signals.lightingKey === "deep-shadow") {
    stage3d.timeOfDay = "깊은 새벽 (02:30 · 단광원 손전등/가로등)";
  } else if (signals.lightingKey === "daylight-clear") {
    stage3d.timeOfDay = "맑은 낮 (11:30 · 선명한 중립 자연광)";
    stage3d.lineWeightPx = "1.4";
  }

  if (signals.platformKey === "naver-challenge-690") {
    delivery.platformSpec = "네이버 도전만화 · 베스트도전 (가로 690px · 72DPI)";
    delivery.sliceHeightPx = "1600";
  } else if (signals.platformKey === "kakao-page-720") {
    delivery.platformSpec = "카카오페이지 · 카카오웹툰 (가로 720px / 2x 1440px)";
    delivery.sliceHeightPx = "1600";
  } else if (signals.platformKey === "global-800") {
    planning.targetAudience = "글로벌 영미·동남아 독자 (12세 이용가)";
    delivery.platformSpec = "글로벌 WEBTOON · Tapas (가로 800×1280px 분할)";
    delivery.sliceHeightPx = "1280";
    delivery.colorProfile = "sRGB 무손실 PNG (선화·식자 최선명)";
    delivery.ageRating = "12세 이용가 (경미한 갈등 · 건전 연출)";
  }

  return { planning, storyboard, stage3d, coloring, delivery };
}

/**
 * 원클릭 "내 의도 한 줄로 전체 기본값 자동 맞춤" 엔진.
 */
export function adaptSmartDefaultsFromIntentText(
  intentText: string,
  activeStageId: SmartStageId = "planning",
): SmartIntentAdaptationResult {
  const cleanIntent =
    intentText.trim() ||
    "현대 판타지 헌터 액션, 빠른 75컷 전개, 네온 야간 3D 배경, 네이버 정식연재 1600px 출고";
  const signals = detectSignalsFromIntent(cleanIntent);
  const overridesByStage = buildIntentOverridesByStage(signals, cleanIntent);
  const badge = `의도 맞춤 · ${signals.detectedKeywordsKo.slice(0, 2).join(" · ")}`;

  const stages: Record<SmartStageId, SmartStageDefaultsBundle> = {
    planning: buildSmartStageDefaults("planning", { seedOverrides: overridesByStage.planning, customBadgeKo: badge }),
    storyboard: buildSmartStageDefaults("storyboard", { seedOverrides: overridesByStage.storyboard, customBadgeKo: badge }),
    stage3d: buildSmartStageDefaults("stage3d", { seedOverrides: overridesByStage.stage3d, customBadgeKo: badge }),
    coloring: buildSmartStageDefaults("coloring", { seedOverrides: overridesByStage.coloring, customBadgeKo: badge }),
    delivery: buildSmartStageDefaults("delivery", { seedOverrides: overridesByStage.delivery, customBadgeKo: badge }),
  };

  const audit = auditZeroBlankFields(stages);
  const confidenceScore = Math.min(98, 72 + signals.detectedKeywordsKo.length * 6);
  const summaryKo = `${signals.detectedKeywordsKo.join(", ")} 의도를 반영해 5단계 ${audit.totalFields}개 항목을 빈칸 0%로 자동 맞춤했습니다.`;

  return {
    rawIntentText: intentText,
    normalizedIntentKo: cleanIntent,
    signals,
    confidenceScore,
    summaryKo,
    activeStageId,
    activeStage: stages[activeStageId],
    stages,
    audit,
  };
}
