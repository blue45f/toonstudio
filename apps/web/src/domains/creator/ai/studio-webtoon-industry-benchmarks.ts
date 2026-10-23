/**
 * studio-webtoon-industry-benchmarks.ts
 *
 * 국내외 대표 웹툰 AI 제작 서비스 벤치마크 기반 고도화 모듈:
 * 1. 오노마AI 페뷸레이터 & 투툰(Fabulator & Tootoon) 벤치마크:
 *    - 로그라인 → 세계관 규칙(Lore Pillars) → 시놉시스 → 회차 트리트먼트 → 컷별 대사 시나리오로 이어지는
 *      5단계 내러티브 빌드업 체인(`buildFabulatorNarrativeChain`) 및 캐릭터 관계성 텐션 매트릭스
 * 2. 라이언로켓 젠버스(Genvas) 벤치마크:
 *    - 소량(10장 기준) 작가 본인 원고 옵트인(Opt-In) 저작권 클린 학습 인증 + 캐릭터 외모·복장 고정 시드 +
 *      웹툰 고난도 포즈·앵글 프리셋 제어(`buildGenvasCharacterPoseLock`)
 * 3. 리얼드로우(RealDraw) & 클립스튜디오 EX 벤치마크:
 *    - 단일 컷을 프로 웹툰 스튜디오 표준 4개 작업 레이어(3D·배경 렌즈 / 밑색 / 명암·조명 / 선화)와
 *      카메라 초점거리(18mm~85mm) 사양으로 분해하는 테크니컬 PD 엔진(`decomposeCutIntoProductionLayers`)
 */

import type {
  StoryboardArtistStyleBinding,
  StoryboardCutPlan,
} from "./studio-ai-storyboard-director";

export type GenvasPosePresetId =
  | "pose-dynamic-slash"
  | "pose-over-shoulder-confront"
  | "pose-lookback-closeup"
  | "pose-kneel-awakening"
  | "pose-aerial-landing";

export interface GenvasPosePresetDescriptor {
  readonly id: GenvasPosePresetId;
  readonly label: string;
  readonly recommendedShotScale: StoryboardCutPlan["shotScale"];
  readonly recommendedCameraAngle: StoryboardCutPlan["cameraAngle"];
  readonly skeletonControlPrompt: string;
  readonly foreshorteningGuide: string;
}

export const GENVAS_POSE_PRESETS: readonly GenvasPosePresetDescriptor[] = Object.freeze([
  {
    id: "pose-dynamic-slash",
    label: "역동적 도약·참격 액션",
    recommendedShotScale: "full-shot",
    recommendedCameraAngle: "low-angle",
    skeletonControlPrompt:
      "dynamic diagonal leap, torso twist, foreground weapon foreshortening, speed lines",
    foreshorteningGuide: "전경 손·무기를 1.35배 과장 투시하고 대각선 동세선으로 스크롤 낙차 극대화",
  },
  {
    id: "pose-over-shoulder-confront",
    label: "2인 대치 오버더숄더",
    recommendedShotScale: "medium-shot",
    recommendedCameraAngle: "eye-level",
    skeletonControlPrompt:
      "over-the-shoulder two-shot framing, foreground silhouette shoulder, sharp eye contact",
    foreshorteningGuide: "전경 인물 어깨 실루엣을 좌하단 25%에 배치하고 후경 상대방 시선에 초점 고정",
  },
  {
    id: "pose-lookback-closeup",
    label: "뒤돌아보는 감정 클로즈업",
    recommendedShotScale: "close-up",
    recommendedCameraAngle: "eye-level",
    skeletonControlPrompt:
      "three-quarter back turn lookback, wind-swept hair, expressive pupils, rim lighting",
    foreshorteningGuide: "어깨선 너머로 고개를 35도 회전시켜 눈동자 하이라이트와 역광 머리카락 결 강조",
  },
  {
    id: "pose-kneel-awakening",
    label: "절체절명 무릎 꿇기·각성",
    recommendedShotScale: "medium-shot",
    recommendedCameraAngle: "dutch-tilt",
    skeletonControlPrompt:
      "one-knee crouch awakening pose, rising aura particles, clenched fist, tilted horizon",
    foreshorteningGuide: "수평선을 12도 기울인 더치 틸트와 상향 오라 파티클로 반전 각성 텐션 연출",
  },
  {
    id: "pose-aerial-landing",
    label: "공중 낙하·히어로 착지",
    recommendedShotScale: "long-shot",
    recommendedCameraAngle: "high-angle",
    skeletonControlPrompt:
      "vertical aerial descent, three-point hero landing impact, radial shockwave dust",
    foreshorteningGuide: "세로 스크롤 방향과 일치하는 수직 낙하 궤적 및 착지 충격파 방사형 집중선 배치",
  },
]);

export type CharacterRelationshipDynamicId =
  | "fated-rivals"
  | "contract-allies"
  | "mentor-disciple"
  | "enemies-to-lovers";

export interface FabulatorNarrativeChainInput {
  readonly genre?: string;
  readonly coreConflict?: string;
  readonly protagonistName?: string;
  readonly partnerName?: string;
  readonly relationshipDynamic?: CharacterRelationshipDynamicId;
}

export interface FabulatorNarrativeStage {
  readonly stageNumber: 1 | 2 | 3 | 4 | 5;
  readonly stageCode: "logline" | "worldview" | "synopsis" | "treatment" | "cut-script";
  readonly stageLabel: string;
  readonly content: string;
}

export interface FabulatorNarrativeChainResult {
  readonly genre: string;
  readonly relationshipDynamic: CharacterRelationshipDynamicId;
  readonly relationshipLabel: string;
  readonly relationshipSubtextGuide: string;
  readonly logline: string;
  readonly worldviewPillars: readonly string[];
  readonly synopsis: string;
  readonly episodeTreatmentBeats: readonly string[];
  readonly readyToDirectScript: string;
  readonly stages: readonly FabulatorNarrativeStage[];
}

const RELATIONSHIP_META: Readonly<
  Record<
    CharacterRelationshipDynamicId,
    { readonly label: string; readonly subtext: string; readonly dialogueHook: string }
  >
> = {
  "fated-rivals": {
    label: "숙명적 라이벌 (경쟁·인정)",
    subtext: "서로의 실력을 가장 잘 알기에 날 선 도발 속에서도 신뢰가 드러나는 텐션",
    dialogueHook: "네가 쓰러지면 이 승부는 무의미해. 끝까지 버텨라.",
  },
  "contract-allies": {
    label: "비밀 계약 동맹 (이해관계·줄다리기)",
    subtext: "계약 조건을 방패 삼아 진심을 숨기지만 결정적 순간 상대를 구하는 구도",
    dialogueHook: "착각하지 마. 계약서 제3조, 파트너의 생존 보장을 이행할 뿐이니까.",
  },
  "mentor-disciple": {
    label: "사제·전승 관계 (성장·초월)",
    subtext: "절대적 기준점인 스승/선배의 등을 보며 한계를 돌파하는 정통 성장 서사",
    dialogueHook: "내 검로를 따라 하지 마라. 지금부턴 네 호흡으로 길을 베어라.",
  },
  "enemies-to-lovers": {
    label: "혐관·적대 로맨스 (경계·끌림)",
    subtext: "의심과 경계로 시작해 예상치 못한 상처와 진심을 목격하며 흔들리는 감정선",
    dialogueHook: "당신이 왜 그런 눈으로 나를 보는지… 대답하기 전엔 한 발짝도 못 가요.",
  },
};

/**
 * 오노마AI 페뷸레이터 & 투툰(Fabulator & Tootoon) 벤치마크:
 * 짧은 갈등 키워드와 캐릭터 관계성만으로 [로그라인 → 세계관 → 시놉시스 → 트리트먼트 → 컷별 대사 시나리오]
 * 5단계 서사 빌드업 체인을 결정적으로 생성한다.
 */
export function buildFabulatorNarrativeChain(
  input: FabulatorNarrativeChainInput = {},
): FabulatorNarrativeChainResult {
  const genre = (input.genre ?? "판타지").trim() || "판타지";
  const conflict = (input.coreConflict ?? "봉인된 기억의 각성과 세계의 균열").trim();
  const protagonist = (input.protagonistName ?? "주인공").trim() || "주인공";
  const partner = (input.partnerName ?? "조력자").trim() || "조력자";
  const dynamicId: CharacterRelationshipDynamicId =
    input.relationshipDynamic ?? "fated-rivals";
  const rel = RELATIONSHIP_META[dynamicId];

  const logline = `[${genre}] '${conflict}'의 한복판에서 ${protagonist}(이)가 ${partner}와(과) ${rel.label} 구도로 얽히며 세계의 금기를 깨뜨리는 서사.`;
  const worldviewPillars = Object.freeze([
    `법칙 1 (핵심 동력): '${conflict}' 현상이 발생할 때마다 공간 왜곡과 각성자의 표식이 공명한다.`,
    `법칙 2 (세력 구도): 기존 질서를 수호하려는 통제 기관과 균열의 진실을 추적하는 ${protagonist} 진영이 대립한다.`,
    `법칙 3 (관계 제약): ${protagonist}와(과) ${partner}는 '${rel.label}' 관계로 묶여 단독 행동 시 패널티를 겪는다.`,
  ]);
  const synopsis =
    `평온해 보이던 일상에 '${conflict}' 징후가 덮치며 ${protagonist}의 숨겨진 힘이 각성한다. ` +
    `${partner}는 이를 감시하거나 시험하기 위해 접근하지만, 통제 불능의 위기 속에서 두 사람은 ${rel.label}의 호흡으로 첫 합동 돌파에 나서고, ` +
    `회차 엔딩에서 진짜 흑막의 단서와 마주한다.`;
  const episodeTreatmentBeats = Object.freeze([
    `#1 [도입·세계관 제시] ${genre} 배경의 위압적인 전경(Long Shot)과 '${conflict}' 전조 현상 노출`,
    `#2 [관계성 충돌] ${protagonist}와(과) ${partner}의 첫 대치(Over-the-shoulder) 및 서브텍스트 신경전`,
    `#3 [위기 고조] 기습적인 적대 세력 혹은 균열 폭발로 인한 공간 붕괴(Dynamic Action Shot)`,
    `#4 [절정·클리프행어] ${protagonist}의 각성 클로즈업과 다음 화 결전을 예고하는 수직 스크롤 여백`,
  ]);

  const readyToDirectScript = [
    `[나레이션] ${conflict}의 전조가 하늘을 가로지르던 날, 모든 규칙이 뒤집혔다.`,
    `${protagonist}: 이 균열… 단순한 사고가 아니야! 지금 당장 봉인 핵을 확인해야 해!`,
    `${partner}: ${rel.dialogueHook}`,
    `[나레이션] 두 사람의 시선이 교차하는 순간, 발밑의 공간이 거대한 굉음과 함께 갈라진다…`,
  ].join("\n");

  const stages: readonly FabulatorNarrativeStage[] = Object.freeze([
    { stageNumber: 1, stageCode: "logline", stageLabel: "1단계: 로그라인 (Logline)", content: logline },
    {
      stageNumber: 2,
      stageCode: "worldview",
      stageLabel: "2단계: 세계관 3대 법칙 (Worldview)",
      content: worldviewPillars.join(" / "),
    },
    { stageNumber: 3, stageCode: "synopsis", stageLabel: "3단계: 시놉시스 (Synopsis)", content: synopsis },
    {
      stageNumber: 4,
      stageCode: "treatment",
      stageLabel: "4단계: 회차 트리트먼트 (Treatment)",
      content: episodeTreatmentBeats.join(" → "),
    },
    {
      stageNumber: 5,
      stageCode: "cut-script",
      stageLabel: "5단계: 투툰형 컷 대본 (Cut Script)",
      content: readyToDirectScript,
    },
  ]);

  return Object.freeze({
    genre,
    relationshipDynamic: dynamicId,
    relationshipLabel: rel.label,
    relationshipSubtextGuide: rel.subtext,
    logline,
    worldviewPillars,
    synopsis,
    episodeTreatmentBeats,
    readyToDirectScript,
    stages,
  });
}

export interface GenvasCharacterPoseLockInput {
  readonly artistStyle: StoryboardArtistStyleBinding;
  readonly posePresetId?: GenvasPosePresetId;
  readonly sampleCount?: number;
  readonly protagonistName?: string;
}

export interface GenvasCharacterPoseLockSpec {
  readonly characterIdentityToken: string;
  readonly posePreset: GenvasPosePresetDescriptor;
  readonly sampleCount: number;
  readonly minimumFewShotTarget: 10;
  readonly fewShotEfficiencyScore: number;
  readonly lineArtExtractionReady: boolean;
  readonly copyrightProvenanceBadge: {
    readonly status: "verified-artist-opt-in";
    readonly labelKo: string;
    readonly commercialUseCleared: true;
  };
  readonly compositeCharacterLockPrompt: string;
}

/**
 * 라이언로켓 젠버스(Genvas) 벤치마크:
 * 소량(10장 내외) 작가 본인 화풍 학습 데이터만으로도 전 컷에서 캐릭터 외모·복장 일관성을 고정하고,
 * 고난도 액션/감정 포즈 프리셋과 저작권 클린 학습 인증 메타데이터를 결합한다.
 */
export function buildGenvasCharacterPoseLock(
  input: GenvasCharacterPoseLockInput,
): GenvasCharacterPoseLockSpec {
  const posePreset =
    GENVAS_POSE_PRESETS.find((p) => p.id === input.posePresetId) ?? GENVAS_POSE_PRESETS[0]!;
  const sampleCount = Math.max(1, input.sampleCount ?? 10);
  const minimumFewShotTarget = 10 as const;
  const fewShotEfficiencyScore = Math.min(
    100,
    Math.round(72 + Math.min(sampleCount, 12) * 2.3),
  );
  const protagonist = (input.protagonistName ?? "주인공").trim() || "주인공";
  const characterIdentityToken = `${input.artistStyle.triggerWord}_char_${protagonist.replace(/\s+/gu, "_").toLowerCase()}`;

  const compositeCharacterLockPrompt = [
    input.artistStyle.triggerWord,
    characterIdentityToken,
    "consistent facial proportions, locked hair silhouette and outfit details",
    posePreset.skeletonControlPrompt,
    `clean webtoon line-art extraction (${input.artistStyle.lineWeight} weight)`,
  ].join(", ");

  return Object.freeze({
    characterIdentityToken,
    posePreset,
    sampleCount,
    minimumFewShotTarget,
    fewShotEfficiencyScore,
    lineArtExtractionReady: true,
    copyrightProvenanceBadge: Object.freeze({
      status: "verified-artist-opt-in" as const,
      labelKo: `작가 본인 저작물 옵트인(Opt-In) 클린 학습 인증 · 소량 ${sampleCount}장 고정`,
      commercialUseCleared: true as const,
    }),
    compositeCharacterLockPrompt,
  });
}

export interface RealDrawLayerSpec {
  readonly layerOrder: 1 | 2 | 3 | 4;
  readonly layerId: "background-3d" | "base-flat-color" | "cel-shading-light" | "line-art-ink";
  readonly layerLabelKo: string;
  readonly blendMode: "Normal" | "Multiply" | "Screen / Add";
  readonly technicalDirective: string;
}

export interface RealDrawCutDecomposition {
  readonly cutNumber: number;
  readonly lensFocalLengthMm: 18 | 28 | 50 | 85;
  readonly lensDescriptionKo: string;
  readonly lightingRigKo: string;
  readonly layers: readonly RealDrawLayerSpec[];
}

/**
 * 리얼드로우(RealDraw) & 클립스튜디오 EX 벤치마크:
 * 개별 스토리보드 컷을 프로 웹툰 스튜디오의 분업 공정인 4개 레이어
 * (1: 3D·배경 렌즈, 2: 밑색, 3: 명암·조명, 4: 선화)와 카메라 초점거리(mm) 사양으로 분해한다.
 */
export function decomposeCutIntoProductionLayers(
  cut: StoryboardCutPlan,
  artistStyle: StoryboardArtistStyleBinding,
): RealDrawCutDecomposition {
  const lensFocalLengthMm: 18 | 28 | 50 | 85 =
    cut.shotScale === "extreme-close-up" || cut.shotScale === "close-up"
      ? 85
      : cut.shotScale === "medium-shot"
        ? 50
        : cut.cameraAngle === "low-angle" || cut.cameraAngle === "dutch-tilt"
          ? 18
          : 28;

  const lensDescriptionKo =
    lensFocalLengthMm === 85
      ? "85mm 망원 인물 렌즈 (배경 아웃포커싱 · 표정 밀도 극대화)"
      : lensFocalLengthMm === 50
        ? "50mm 표준 렌즈 (자연스러운 상반신 대화·시선 교환)"
        : lensFocalLengthMm === 18
          ? "18mm 초광각 다이내믹 렌즈 (원근 과장 · 역동적 액션 투시)"
          : "28mm 와이드 배경 렌즈 (세계관 공간감 및 인물 동선 확보)";

  const lightingRigKo =
    cut.emotion === "tension" || cut.emotion === "shock"
      ? "강한 역광 림라이트(Rim Light) + 고대비 측면 키라이트"
      : cut.emotion === "lyrical"
        ? "부드러운 확산 반사광(Soft Bounce) + 상단 골든아워 백라이트"
        : "표준 3점 조명(Key/Fill/Rim) + 피사체 얼굴 전면 가독성 확보";

  const layers: readonly RealDrawLayerSpec[] = Object.freeze([
    {
      layerOrder: 1,
      layerId: "background-3d",
      layerLabelKo: "L1. 3D·배경 카메라 레이어",
      blendMode: "Normal",
      technicalDirective: `${lensDescriptionKo} · 수평선/소실점 투시 그리드 및 3D 배경 배치`,
    },
    {
      layerOrder: 2,
      layerId: "base-flat-color",
      layerLabelKo: "L2. 밑색 분리 레이어 (Flat ID)",
      blendMode: "Normal",
      technicalDirective: `${artistStyle.paletteMood} 팔레트 기준 피부·헤어·의상 파츠별 단색 마스킹 분리`,
    },
    {
      layerOrder: 3,
      layerId: "cel-shading-light",
      layerLabelKo: "L3. 명암·조명 레이어 (Shading & Rim)",
      blendMode: "Multiply",
      technicalDirective: `${artistStyle.shadingMode} 명암 법칙 + ${lightingRigKo} 적용`,
    },
    {
      layerOrder: 4,
      layerId: "line-art-ink",
      layerLabelKo: "L4. 마스터 선화 레이어 (Vector Ink)",
      blendMode: "Normal",
      technicalDirective: `${artistStyle.lineWeight} 필압 벡터 선화 추출 · 말풍선/효과음(SFX) 안전 여백 보존`,
    },
  ]);

  return Object.freeze({
    cutNumber: cut.cutNumber,
    lensFocalLengthMm,
    lensDescriptionKo,
    lightingRigKo,
    layers,
  });
}

export interface WebtoonAiBenchmarkEntry {
  readonly serviceId: "genvas" | "fabulator-tootoon" | "realdraw" | "clip-studio-naver";
  readonly serviceNameKo: string;
  readonly coreStrengthKo: string;
  readonly toonStudioIntegrationKo: string;
}

export const WEBTOON_AI_SERVICE_BENCHMARK_MATRIX: readonly WebtoonAiBenchmarkEntry[] = Object.freeze([
  {
    serviceId: "genvas",
    serviceNameKo: "라이언로켓 젠버스 (Genvas)",
    coreStrengthKo: "소량(10장) 작가 화풍·캐릭터 고정, 포즈 제어, 본인 저작물 클린 학습",
    toonStudioIntegrationKo:
      "buildGenvasCharacterPoseLock: 10장 기준 캐릭터 시드 고정 + 5종 웹툰 포즈 프리셋 + 옵트인 저작권 클린 배지 내장",
  },
  {
    serviceId: "fabulator-tootoon",
    serviceNameKo: "오노마AI 페뷸레이터 & 투툰 (Fabulator & Tootoon)",
    coreStrengthKo: "로그라인→세계관→시놉시스→트리트먼트→콘티 5단계 스토리 빌드업 및 캐릭터 관계성",
    toonStudioIntegrationKo:
      "buildFabulatorNarrativeChain: 4대 캐릭터 관계성 텐션 + 5단계 서사 체인 및 투툰형 대본 즉시 변환 내장",
  },
  {
    serviceId: "realdraw",
    serviceNameKo: "리얼드로우 (RealDraw)",
    coreStrengthKo: "3D 렌즈·조명 기반 테크니컬 디렉팅 및 선화·밑색·명암·배경 멀티레이어 분업",
    toonStudioIntegrationKo:
      "decomposeCutIntoProductionLayers: 18~85mm 카메라 렌즈 매칭 + 4레이어(3D배경/밑색/명암/선화) 프로덕션 분해 내장",
  },
  {
    serviceId: "clip-studio-naver",
    serviceNameKo: "클립스튜디오 EX & 네이버웹툰 글로벌",
    coreStrengthKo: "세로 스크롤 컷 배분, 모바일 말풍선 가독성, 다국어(KO/EN/JA/ES) 현지화 식자 규격",
    toonStudioIntegrationKo:
      "runWebtoonStoryboardMasterPipeline: 4개국 번역 팽창률 검수 + 세로 스크롤 여백 + 프로덕션 시트 번들 통합",
  },
]);
