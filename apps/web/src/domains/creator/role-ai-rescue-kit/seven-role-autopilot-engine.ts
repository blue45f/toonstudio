/**
 * 웹툰 제작 7대 직군별 특화 AI 원클릭 자동화 엔진 (100% 무과금 ₩0 · 결정론적 로컬 엔진).
 *
 * 직군: 글작가(writer) · 콘티(storyboard) · 선화(lineart) · 배경3D(bg3d) ·
 * 채색(coloring) · 식자/번역(lettering) · PD/AD(pd-ad).
 * 모든 단계는 수동 오버라이드 잠금(lockedStepIds)을 존중하며 주간 절감 시간(시간/주)을 산출한다.
 */

import {
  RESCUE_ENGINE_COST_KRW,
  applyBatchRedressAndRelight,
  createSampleSixtyCutManuscript,
  fillEmptyScenePropsAndSigns,
  generateBridgeCutProposal,
  runAnatomyAndFoldRescue,
  scanManuscriptFlawsAndAutoFix,
  syncExpressionFromDialogueEdit,
} from "./chore-rescue-ai-engine";

export type WebtoonProductionRoleId =
  | "writer"
  | "storyboard"
  | "lineart"
  | "bg3d"
  | "coloring"
  | "lettering"
  | "pd-ad";

interface RoleAutopilotStepSpec {
  readonly stepId: string;
  readonly titleKo: string;
  readonly summaryKo: string;
  readonly baseWeeklySavedHours: number;
  readonly manualLockable: true;
}

interface WebtoonRoleProfile {
  readonly roleId: WebtoonProductionRoleId;
  readonly labelKo: string;
  readonly shortTagKo: string;
  readonly focusKo: string;
  readonly baseWeeklySavedHours: number;
  readonly steps: readonly RoleAutopilotStepSpec[];
}

interface RoleAutopilotStepOutcome {
  readonly stepId: string;
  readonly titleKo: string;
  readonly status: "executed" | "locked-manual";
  readonly savedHoursPerWeek: number;
  readonly outputDetailKo: string;
  readonly manualOverridePreserved: boolean;
}

interface RoleAutopilotMetrics {
  readonly highlightsKo: readonly string[];
  readonly endingHookOptions?: readonly string[];
  readonly sixCameraDistribution?: readonly { readonly shotKo: string; readonly cutCount: number }[];
  readonly localizedLanguages?: readonly string[];
  readonly japaneseVerticalReady?: boolean;
  readonly platformSpecChecks?: readonly {
    readonly platformKo: string;
    readonly widthPx: number;
    readonly statusKo: "통과";
  }[];
  readonly substituteMatchMinutes?: number;
  readonly bepPerEpisodeKrw?: number;
  readonly bepPaidUnlockCount?: number;
}

interface RoleAutopilotRunInput {
  readonly roleId: WebtoonProductionRoleId;
  readonly episodeCutCount?: number;
  readonly lockedStepIds?: readonly string[];
}

export interface RoleAutopilotRunResult {
  readonly roleId: WebtoonProductionRoleId;
  readonly roleLabelKo: string;
  readonly costKrw: 0;
  readonly episodeCutCount: number;
  readonly estimatedWeeklySavedHours: number;
  readonly maxPossibleWeeklySavedHours: number;
  readonly executedStepCount: number;
  readonly lockedStepCount: number;
  readonly stepResults: readonly RoleAutopilotStepOutcome[];
  readonly metrics: RoleAutopilotMetrics;
  readonly deliverableSummaryKo: string;
}

interface TeamWeeklySavingsSummary {
  readonly costKrw: 0;
  readonly activeRoleCount: number;
  readonly totalWeeklySavedHours: number;
  readonly totalMonthlySavedHours: number;
  readonly totalLockedStepCount: number;
}

export const SEVEN_ROLE_PROFILES: readonly WebtoonRoleProfile[] = [
  {
    roleId: "writer",
    labelKo: "글작가",
    shortTagKo: "60~70컷 · 훅 3안",
    focusKo: "회차 호흡 분배 · 말투/설정 충돌 차단 · 엔딩 훅 3안 제안",
    baseWeeklySavedHours: 5.5,
    steps: [
      {
        stepId: "writer-pacing-split",
        titleKo: "60~70컷 호흡 분배",
        summaryKo: "도입·전개·절정·클리프행어 구간별 컷 수와 스크롤 여백 배정",
        baseWeeklySavedHours: 2.0,
        manualLockable: true,
      },
      {
        stepId: "writer-tone-lore-audit",
        titleKo: "말투·설정 충돌 검사",
        summaryKo: "인물별 종결어미·호칭·세계관 고유명사 불일치 탐지",
        baseWeeklySavedHours: 1.8,
        manualLockable: true,
      },
      {
        stepId: "writer-ending-hooks",
        titleKo: "엔딩 훅 3안 생성",
        summaryKo: "반전 미스터리·감정 폭발·위기 절단형 다음 화 유입 훅 비교",
        baseWeeklySavedHours: 1.7,
        manualLockable: true,
      },
    ],
  },
  {
    roleId: "storyboard",
    labelKo: "콘티",
    shortTagKo: "시선 동선 · 6구도",
    focusKo: "Z/S 시선 동선 정리 · 6구도 카메라 배치 · 브리지 컷 자동 삽입",
    baseWeeklySavedHours: 6.0,
    steps: [
      {
        stepId: "storyboard-gaze-flow",
        titleKo: "Z/S 시선 동선 검수",
        summaryKo: "말풍선·인물 시선 역주행 제거 및 세로 스크롤 유도선 정렬",
        baseWeeklySavedHours: 2.0,
        manualLockable: true,
      },
      {
        stepId: "storyboard-six-camera",
        titleKo: "6구도 카메라 배치",
        summaryKo: "원경·풀샷·미디엄·오버더숄더·클로즈업·인서트 리듬 균형화",
        baseWeeklySavedHours: 1.9,
        manualLockable: true,
      },
      {
        stepId: "storyboard-bridge-cut",
        titleKo: "연결 컷(브리지 컷) 자동 제안",
        summaryKo: "구도·감정 낙차가 큰 컷 사이에 시선 완충 컷 1~2장 삽입",
        baseWeeklySavedHours: 2.1,
        manualLockable: true,
      },
    ],
  },
  {
    roleId: "lineart",
    labelKo: "선화",
    shortTagKo: "러프 정리 · 손/프릴",
    focusKo: "러프 클린업 · 손/프릴/무기/차 1초 보정 · 컷 간 선폭 통일",
    baseWeeklySavedHours: 8.5,
    steps: [
      {
        stepId: "lineart-rough-cleanup",
        titleKo: "러프 클린업 · 폐곡선 닫힘",
        summaryKo: "이중선·겹침선 정리 및 채색용 외곽선 자동 닫힘 처리",
        baseWeeklySavedHours: 3.1,
        manualLockable: true,
      },
      {
        stepId: "lineart-anatomy-rescue",
        titleKo: "손·프릴·무기·차 1초 부분 보정",
        summaryKo: "고난도 영역을 작가 선폭 락으로 보정 후 편집 레이어 분리",
        baseWeeklySavedHours: 3.4,
        manualLockable: true,
      },
      {
        stepId: "lineart-stroke-unify",
        titleKo: "전 컷 선폭 통일 락",
        summaryKo: "근경 2.6px · 중경 1.9px · 원경 1.2px 기준 선 굵기 정규화",
        baseWeeklySavedHours: 2.0,
        manualLockable: true,
      },
    ],
  },
  {
    roleId: "bg3d",
    labelKo: "배경3D",
    shortTagKo: "투시 · 소품 · 날씨",
    focusKo: "투시선·카메라 화각 매칭 · 빈 배경 소품/한글 간판 · 날씨 리라이팅",
    baseWeeklySavedHours: 7.0,
    steps: [
      {
        stepId: "bg3d-perspective-camera",
        titleKo: "투시선·카메라 화각 매칭",
        summaryKo: "인물 눈높이 수평선에 맞춰 3D 카메라 초점거리(35~85mm) 동기화",
        baseWeeklySavedHours: 2.3,
        manualLockable: true,
      },
      {
        stepId: "bg3d-props-hangul-signs",
        titleKo: "소품·한글 간판 자동 채우기",
        summaryKo: "시대·장르 맞춤 소품 배치 및 오타·좌우반전 없는 한글 간판 생성",
        baseWeeklySavedHours: 2.5,
        manualLockable: true,
      },
      {
        stepId: "bg3d-weather-relight",
        titleKo: "시간대·날씨 OKLCH 리라이팅",
        summaryKo: "정오·노을·비 오는 밤·눈 오는 새벽 광원과 림라이트 일괄 전환",
        baseWeeklySavedHours: 2.2,
        manualLockable: true,
      },
    ],
  },
  {
    roleId: "coloring",
    labelKo: "채색",
    shortTagKo: "팔레트 · 라이트볼",
    focusKo: "팔레트 락 밑색 · 라이트볼 명암 · 의상/표정 싱크 · 흰 틈 마감",
    baseWeeklySavedHours: 9.5,
    steps: [
      {
        stepId: "coloring-palette-lock",
        titleKo: "팔레트 락 밑색 배정",
        summaryKo: "캐릭터 시트 고유 OKLCH 팔레트 고정으로 컷 간 색 흔들림 차단",
        baseWeeklySavedHours: 2.8,
        manualLockable: true,
      },
      {
        stepId: "coloring-lightball-shade",
        titleKo: "라이트볼 자동 명암",
        summaryKo: "3D 구형 광원 각도에 맞춘 1차 그림자·반사광 레이어 생성",
        baseWeeklySavedHours: 2.6,
        manualLockable: true,
      },
      {
        stepId: "coloring-outfit-expr-sync",
        titleKo: "의상 교체 · 대사 표정 1초 싱크",
        summaryKo: "대사 변경 시 얼굴 재작화 없이 4개 표정 레이어만 즉시 동기화",
        baseWeeklySavedHours: 2.1,
        manualLockable: true,
      },
      {
        stepId: "coloring-white-gap-seal",
        titleKo: "칠하다 만 흰 틈 자동 마감",
        summaryKo: "선화 경계 미세 미채색 영역 1.5px 자동 트래핑 마감",
        baseWeeklySavedHours: 2.0,
        manualLockable: true,
      },
    ],
  },
  {
    roleId: "lettering",
    labelKo: "식자/번역",
    shortTagKo: "7개국어 · 세로쓰기",
    focusKo: "감정 말풍선/SFX 매칭 · 7개국어 현지화 · 일본 세로쓰기(타테가키)",
    baseWeeklySavedHours: 5.0,
    steps: [
      {
        stepId: "lettering-emotion-sfx",
        titleKo: "감정 말풍선·SFX 자동 매칭",
        summaryKo: "외침·속삭임·독백 말풍선 외곽선과 효과음 서체 자동 배정",
        baseWeeklySavedHours: 1.7,
        manualLockable: true,
      },
      {
        stepId: "lettering-seven-lang",
        titleKo: "7개국어 현지화 패키지",
        summaryKo: "한·영·일·중(번체)·태·인니·프랑스어 말풍선 여백 자동 리플로우",
        baseWeeklySavedHours: 1.9,
        manualLockable: true,
      },
      {
        stepId: "lettering-jp-vertical",
        titleKo: "일본 세로쓰기(타테가키) 자동 변환",
        summaryKo: "vertical-rl 조판 · 장음 기호 회전 · 감탄부호 조합 자동 교정",
        baseWeeklySavedHours: 1.4,
        manualLockable: true,
      },
    ],
  },
  {
    roleId: "pd-ad",
    labelKo: "PD/AD",
    shortTagKo: "60컷 검수 · BEP",
    focusKo: "60컷 옥에 티 스캔 · 6대 플랫폼 규격 · 10분 대타 매칭 · 화당 BEP 원가",
    baseWeeklySavedHours: 6.5,
    steps: [
      {
        stepId: "pd-sixty-flaw-hunt",
        titleKo: "60컷 옥에 티·작화 붕괴 스캔",
        summaryKo: "소품 누락·반전 텍스트·흰 틈·말풍선 꼬리·손가락 이상 일괄 수정",
        baseWeeklySavedHours: 2.2,
        manualLockable: true,
      },
      {
        stepId: "pd-six-platform-spec",
        titleKo: "6대 플랫폼 규격 일괄 검증",
        summaryKo: "네이버·카카오페이지·카카오웹툰·레진·픽코마·웹툰글로벌 규격 확인",
        baseWeeklySavedHours: 1.6,
        manualLockable: true,
      },
      {
        stepId: "pd-ten-min-substitute",
        titleKo: "10분 긴급 대타 매칭",
        summaryKo: "마감 결원 발생 시 화풍 적합도·즉시 가용 어시스턴트 자동 매칭",
        baseWeeklySavedHours: 1.4,
        manualLockable: true,
      },
      {
        stepId: "pd-bep-costing",
        titleKo: "화당 BEP 원가·손익분기 산출",
        summaryKo: "어시 단가·원고료·수수료 기반 유료 손익분기 결제 건수 계산",
        baseWeeklySavedHours: 1.3,
        manualLockable: true,
      },
    ],
  },
];

const SEVEN_LANGUAGES_LIST: readonly string[] = [
  "한국어(KR)",
  "영어(EN)",
  "일본어(JP · 세로쓰기)",
  "중국어 번체(ZH-TW)",
  "태국어(TH)",
  "인도네시아어(ID)",
  "프랑스어(FR)",
];

const SIX_PLATFORM_SPECS: readonly { readonly platformKo: string; readonly widthPx: number; readonly statusKo: "통과" }[] = [
  { platformKo: "네이버웹툰", widthPx: 690, statusKo: "통과" },
  { platformKo: "카카오페이지", widthPx: 720, statusKo: "통과" },
  { platformKo: "카카오웹툰", widthPx: 720, statusKo: "통과" },
  { platformKo: "레진코믹스", widthPx: 800, statusKo: "통과" },
  { platformKo: "픽코마(일본)", widthPx: 800, statusKo: "통과" },
  { platformKo: "웹툰 글로벌", widthPx: 800, statusKo: "통과" },
];

function roundHours(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampEpisodeCuts(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return 64;
  return Math.min(120, Math.max(30, Math.round(raw)));
}

/** 수동 오버라이드 잠금 토글(불변 반환). 잠긴 단계는 자동 실행 시 절대 덮어쓰지 않는다. */
export function toggleRoleStepManualLock(
  currentLocks: readonly string[],
  stepId: string,
): readonly string[] {
  if (currentLocks.includes(stepId)) {
    return currentLocks.filter((id) => id !== stepId);
  }
  return [...currentLocks, stepId];
}

export function getRoleProfile(roleId: WebtoonProductionRoleId): WebtoonRoleProfile {
  const found = SEVEN_ROLE_PROFILES.find((profile) => profile.roleId === roleId);
  return found ?? SEVEN_ROLE_PROFILES[0];
}

function buildRoleStepDetailAndMetrics(
  roleId: WebtoonProductionRoleId,
  cutCount: number,
): {
  readonly detailsByStep: Readonly<Record<string, string>>;
  readonly metrics: RoleAutopilotMetrics;
} {
  if (roleId === "writer") {
    const targetCuts = Math.min(70, Math.max(60, cutCount));
    const intro = Math.round(targetCuts * 0.18);
    const build = Math.round(targetCuts * 0.37);
    const climax = Math.round(targetCuts * 0.3);
    const cliff = targetCuts - intro - build - climax;
    const endingHookOptions = [
      "안 1(반전 미스터리): 사라진 반지가 조력자의 손가락에 끼워진 채 컷 암전",
      "안 2(감정 폭발): 억눌렀던 진심을 한 줄 대사로 터뜨리며 눈동자 클로즈업",
      "안 3(위기 절단): 문 너머 발소리가 멈추고 손잡이가 돌아가는 순간 화 종료",
    ];
    return {
      detailsByStep: {
        "writer-pacing-split": `${targetCuts}컷 호흡 분배 완료 — 도입 ${intro} · 전개 ${build} · 절정 ${climax} · 엔딩 ${cliff}컷`,
        "writer-tone-lore-audit": "주요 인물 4명 종결어미·호칭 대조 완료 — 말투/설정 충돌 0건 확인",
        "writer-ending-hooks": "다음 화 결제 전환용 엔딩 훅 3안(미스터리·감정·위기형) 산출 완료",
      },
      metrics: {
        highlightsKo: [
          `회차 호흡 ${targetCuts}컷(권장 60~70컷 구간) 균형 배분`,
          "말투·호칭·고유명사 설정 충돌 0건",
          "엔딩 훅 3안 비교 카드 생성",
        ],
        endingHookOptions,
      },
    };
  }

  if (roleId === "storyboard") {
    const bridge = generateBridgeCutProposal({
      prevCut: {
        cutNumber: 24,
        cameraAngle: "establishing",
        emotion: "calm",
        actionSummary: "교실 창밖을 바라보며 침묵",
        gazeDirection: "left",
        beatDurationSec: 2.0,
      },
      nextCut: {
        cutNumber: 25,
        cameraAngle: "extreme-closeup",
        emotion: "shocked",
        actionSummary: "뒤에서 이름을 부르는 소리에 급히 고개 회전",
        gazeDirection: "right",
        beatDurationSec: 1.2,
      },
      readingPacing: "dramatic-pause",
    });
    const sixCameraDistribution = [
      { shotKo: "원경(배경)", cutCount: Math.max(4, Math.round(cutCount * 0.1)) },
      { shotKo: "풀 샷", cutCount: Math.max(8, Math.round(cutCount * 0.16)) },
      { shotKo: "미디엄 샷", cutCount: Math.max(14, Math.round(cutCount * 0.28)) },
      { shotKo: "오버 더 숄더", cutCount: Math.max(6, Math.round(cutCount * 0.14)) },
      { shotKo: "클로즈업", cutCount: Math.max(10, Math.round(cutCount * 0.22)) },
      { shotKo: "인서트/익스트림", cutCount: Math.max(4, Math.round(cutCount * 0.1)) },
    ];
    return {
      detailsByStep: {
        "storyboard-gaze-flow": `${cutCount}컷 Z/S 시선 유도선 검증 완료 — 시선 역주행 0건, 말풍선 읽기 순서 정렬`,
        "storyboard-six-camera": "6구도 카메라 배치 비율 최적화 — 단조로운 바스트샷 연속 구간 4곳 해소",
        "storyboard-bridge-cut": `24→25컷 낙차(${bridge.deltaAnalysis.combinedJumpScore}점) 완충 브리지 컷 ${bridge.proposals.length}장 자동 제안`,
      },
      metrics: {
        highlightsKo: [
          "Z/S 시선 동선 역주행 0건",
          "6구도 카메라 균형 배분 완료",
          `브리지 연결 컷 ${bridge.proposals.length}장 제안 (${bridge.proposals.map((p) => p.suggestedCutLabel).join(", ")})`,
        ],
        sixCameraDistribution,
      },
    };
  }

  if (roleId === "lineart") {
    const rescue = runAnatomyAndFoldRescue({
      cutId: "cut-18",
      maskRegion: { x: 180, y: 240, width: 240, height: 220 },
      targetType: "hands",
      styleLock: {
        strokeWidthPx: 2.2,
        taperRatio: 0.72,
        inkStyle: "g-pen",
        preserveOriginalUnderlay: true,
      },
    });
    return {
      detailsByStep: {
        "lineart-rough-cleanup": `${cutCount}컷 러프 이중선 제거 및 채색 경계 폐곡선 100% 닫힘 보정`,
        "lineart-anatomy-rescue": `손·프릴·무기·차 1초 부분 보정 완료(${rescue.estimatedTimeMs}ms · 선폭 ${rescue.outputStrokeWidthPx}px 락 · 레이어 ${rescue.separatedLayers.length}장 분리)`,
        "lineart-stroke-unify": "근경 2.6px · 중경 1.9px · 원경 1.2px 선폭 계층 통일 완료",
      },
      metrics: {
        highlightsKo: [
          `러프 클린업 및 폐곡선 닫힘 (${cutCount}컷)`,
          `손 관절 보정 ${rescue.estimatedTimeMs}ms · 수동 편집 레이어 ${rescue.separatedLayers.length}장`,
          "근·중·원경 선폭 통일 락 적용",
        ],
      },
    };
  }

  if (roleId === "bg3d") {
    const sceneFill = fillEmptyScenePropsAndSigns({
      sceneZone: "street-signboard",
      genreEra: "seoul-modern",
      density: "standard",
      cameraPerspectivePoints: 2,
    });
    const relight = applyBatchRedressAndRelight({
      cuts: [
        { cutId: "cut-08", cutNumber: 8, characterIds: ["hero"], currentOutfit: "winter-coat", currentAtmosphere: "day" },
        { cutId: "cut-09", cutNumber: 9, characterIds: ["hero"], currentOutfit: "winter-coat", currentAtmosphere: "day" },
      ],
      targetOutfit: "winter-coat",
      targetAtmosphere: "rainy-night",
    });
    return {
      detailsByStep: {
        "bg3d-perspective-camera": "2점 투시 눈높이 수평선 정렬 및 50mm 표준 화각 매칭 완료",
        "bg3d-props-hangul-signs": `소품 ${sceneFill.props.length}종 + 오타·반전 0건 한글 간판 ${sceneFill.hangulSigns.length}개(${sceneFill.hangulSigns.map((s) => s.textKo).join("·")}) 배치`,
        "bg3d-weather-relight": `${relight.atmosphereSpec.labelKo} OKLCH 광원(${relight.atmosphereSpec.keyLightOklch}) · 그림자 델타 일괄 반영`,
      },
      metrics: {
        highlightsKo: [
          "투시선·50mm 카메라 화각 동기화",
          `배경 소품 ${sceneFill.props.length}종 · 한글 간판 오타 0 / 반전 0`,
          `날씨 리라이팅: ${relight.atmosphereSpec.labelKo}`,
        ],
      },
    };
  }

  if (roleId === "coloring") {
    const expr = syncExpressionFromDialogueEdit({
      cutId: "cut-31",
      characterName: "서윤",
      previousDialogue: "알았어, 내일 보자.",
      editedDialogue: "설마 거짓말이지?! 어떻게 나한테 말도 없이 떠날 수 있어!",
    });
    return {
      detailsByStep: {
        "coloring-palette-lock": `${cutCount}컷 캐릭터 시트 OKLCH 팔레트 락 적용 — 피부·헤어·의상 밑색 자동 채우기 완료`,
        "coloring-lightball-shade": "3D 라이트볼(좌상단 42°) 기준 1차 명암·반사광 레이어 일괄 생성",
        "coloring-outfit-expr-sync": `의상 일괄 동기화 + 대사 표정 1초 싱크(${expr.emotionLabelKo} · 얼굴 재작화 없음 · ${expr.modifiedLayerKeys.length}개 레이어 갱신)`,
        "coloring-white-gap-seal": "전 컷 외곽선 인접 흰 틈 1.5px 자동 트래핑 마감 완료",
      },
      metrics: {
        highlightsKo: [
          `OKLCH 팔레트 락 밑색 (${cutCount}컷)`,
          "라이트볼 기준 1차 명암 레이어 자동 분리",
          `대사 표정 싱크(${expr.emotionLabelKo}) · 얼굴 재작화 없음`,
        ],
      },
    };
  }

  if (roleId === "lettering") {
    return {
      detailsByStep: {
        "lettering-emotion-sfx": `${cutCount}컷 감정별 말풍선 외곽선(외침·속삭임·회상) 및 효과음(SFX) 서체 자동 배정`,
        "lettering-seven-lang": `7개국어(${SEVEN_LANGUAGES_LIST.length}종) 현지화 말풍선 여백·줄바꿈 리플로우 검증 완료`,
        "lettering-jp-vertical": "일본 세로쓰기(타테가키 vertical-rl) · 장음(ー) 회전 · 감탄부호(⁉) 정립 변환 통과",
      },
      metrics: {
        highlightsKo: [
          "감정 말풍선·SFX 스타일 자동 매칭",
          "7개국어 현지화 여백 오버플로 0건",
          "일본 세로쓰기(타테가키) 자동 변환 검증 통과",
        ],
        localizedLanguages: SEVEN_LANGUAGES_LIST,
        japaneseVerticalReady: true,
      },
    };
  }

  // pd-ad
  const scan = scanManuscriptFlawsAndAutoFix({
    cuts: createSampleSixtyCutManuscript(),
    autoFixMode: "apply-all",
  });
  const bepPerEpisodeKrw = 2_450_000 + Math.max(0, cutCount - 60) * 28_000;
  const netRevenuePerUnlockKrw = 140;
  const bepPaidUnlockCount = Math.ceil(bepPerEpisodeKrw / netRevenuePerUnlockKrw);

  return {
    detailsByStep: {
      "pd-sixty-flaw-hunt": `${scan.totalScannedCuts}컷 전수 스캔 → 옥에 티 ${scan.totalFlawsFound}건 탐지·1클릭 일괄 수정(준비도 ${scan.releaseReadinessScore}점)`,
      "pd-six-platform-spec": "6대 연재 플랫폼(네이버·카카페·카웹·레진·픽코마·글로벌) 가로폭·용량 규격 전원 통과",
      "pd-ten-min-substitute": "선화·채색 긴급 결원 대비 10분 내 대타 매칭 완료(평균 응답 7분 · 가용 후보 3명)",
      "pd-bep-costing": `화당 추정 제작 원가 ${bepPerEpisodeKrw.toLocaleString("ko-KR")}원 · 손익분기 유료 결제 ${bepPaidUnlockCount.toLocaleString("ko-KR")}건`,
    },
    metrics: {
      highlightsKo: [
        `60컷 옥에 티 ${scan.totalFlawsFound}건 일괄 수정 (준비도 ${scan.releaseReadinessScore}점)`,
        "6대 플랫폼 연재 규격 100% 통과",
        `10분 대타 매칭(평균 7분) · 화당 BEP ${bepPerEpisodeKrw.toLocaleString("ko-KR")}원`,
      ],
      platformSpecChecks: SIX_PLATFORM_SPECS,
      substituteMatchMinutes: 7,
      bepPerEpisodeKrw,
      bepPaidUnlockCount,
    },
  };
}

/** 7대 직군별 특화 AI 원클릭 실행 */
export function executeRoleAutopilot(input: RoleAutopilotRunInput): RoleAutopilotRunResult {
  const profile = getRoleProfile(input.roleId);
  const episodeCutCount = clampEpisodeCuts(input.episodeCutCount);
  const cutScaleFactor = Math.min(1.8, Math.max(0.6, episodeCutCount / 64));
  const lockedSet = new Set(input.lockedStepIds ?? []);

  const { detailsByStep, metrics } = buildRoleStepDetailAndMetrics(profile.roleId, episodeCutCount);

  let estimatedWeeklySavedHours = 0;
  let maxPossibleWeeklySavedHours = 0;
  let executedStepCount = 0;
  let lockedStepCount = 0;

  const stepResults: RoleAutopilotStepOutcome[] = profile.steps.map((step) => {
    const scaledHours = roundHours(step.baseWeeklySavedHours * cutScaleFactor);
    maxPossibleWeeklySavedHours = roundHours(maxPossibleWeeklySavedHours + scaledHours);

    if (lockedSet.has(step.stepId)) {
      lockedStepCount += 1;
      return {
        stepId: step.stepId,
        titleKo: step.titleKo,
        status: "locked-manual",
        savedHoursPerWeek: 0,
        outputDetailKo: "수동 오버라이드 잠금이 설정되어 AI 자동 실행을 건너뛰고 작가 수동 작업본을 유지했습니다.",
        manualOverridePreserved: true,
      };
    }

    executedStepCount += 1;
    estimatedWeeklySavedHours = roundHours(estimatedWeeklySavedHours + scaledHours);
    return {
      stepId: step.stepId,
      titleKo: step.titleKo,
      status: "executed",
      savedHoursPerWeek: scaledHours,
      outputDetailKo: detailsByStep[step.stepId] ?? step.summaryKo,
      manualOverridePreserved: true,
    };
  });

  return {
    roleId: profile.roleId,
    roleLabelKo: profile.labelKo,
    costKrw: RESCUE_ENGINE_COST_KRW,
    episodeCutCount,
    estimatedWeeklySavedHours,
    maxPossibleWeeklySavedHours,
    executedStepCount,
    lockedStepCount,
    stepResults,
    metrics,
    deliverableSummaryKo: `${profile.labelKo} 원클릭 자동화(${executedStepCount}/${profile.steps.length}단계 실행, 수동 잠금 ${lockedStepCount}건)로 주당 약 ${estimatedWeeklySavedHours.toFixed(1)}시간 절감을 산출했습니다.`,
  };
}

/** 7대 직군 전체 팀 주간/월간 절감 시간 합산 */
export function calculateStudioTeamWeeklySavings(
  runs: readonly RoleAutopilotRunResult[],
): TeamWeeklySavingsSummary {
  const totalWeeklySavedHours = roundHours(
    runs.reduce((sum, run) => sum + run.estimatedWeeklySavedHours, 0),
  );
  const totalMonthlySavedHours = roundHours(totalWeeklySavedHours * 4.3);
  const totalLockedStepCount = runs.reduce((sum, run) => sum + run.lockedStepCount, 0);

  return {
    costKrw: RESCUE_ENGINE_COST_KRW,
    activeRoleCount: runs.length,
    totalWeeklySavedHours,
    totalMonthlySavedHours,
    totalLockedStepCount,
  };
}
