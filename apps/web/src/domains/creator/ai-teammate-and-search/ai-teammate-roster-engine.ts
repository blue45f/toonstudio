/**
 * 창작 인원수(1인 · 2~3인 · 7~8인 · 30인+)별 6인 AI 보조작가 로스터 및 빈 공정 자동 배정 엔진.
 *
 * - 사람이 맡은 공정(`humanRoles`)을 제외한 빈 자리에만 전담 AI 팀원을 자동 투입한다.
 * - 모든 시간 절감 수치는 60컷 기준 회차 작업의 추정치(`estimatedHoursSaved`)로 명시한다.
 * - 브라우저 영속 저장소에 직접 의존하지 않는 순수 결정론적 엔진이다.
 */

export type CreatorTeamScaleId = "solo" | "small" | "production" | "enterprise";

export type CreatorPipelineRoleId =
  | "storyboard"
  | "lineart"
  | "coloring"
  | "bg3d"
  | "lettering"
  | "bom-producer";

export type AiTeammateApprovalMode = "auto-draft" | "review-first";

export type AiTeammateAccentTone =
  | "indigo"
  | "ink"
  | "coral"
  | "teal"
  | "amber"
  | "emerald";

export interface AiTeammateQueueTemplate {
  readonly id: string;
  readonly title: string;
  readonly stageUnit: string;
  readonly baseMinutesSaved: number;
}

export interface AiTeammateQueueTask {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly approvalMode: AiTeammateApprovalMode;
  readonly estimatedMinutesSaved: number;
}

export interface AiTeammatePersona {
  readonly id: string;
  readonly roleId: CreatorPipelineRoleId;
  readonly roleLabel: string;
  readonly personaName: string;
  readonly codename: string;
  readonly spritePath: string;
  readonly accentTone: AiTeammateAccentTone;
  readonly summary: string;
  readonly capabilities: readonly string[];
  readonly baseEpisodeHoursSaved: number;
  readonly recommendedApprovalByScale: Readonly<
    Record<CreatorTeamScaleId, AiTeammateApprovalMode>
  >;
  readonly queueTemplates: readonly AiTeammateQueueTemplate[];
}

export interface TeamScalePreset {
  readonly id: CreatorTeamScaleId;
  readonly label: string;
  readonly headcountBadge: string;
  readonly description: string;
  readonly defaultHumanRoles: readonly CreatorPipelineRoleId[];
  readonly defaultApprovalMode: AiTeammateApprovalMode;
  readonly defaultEpisodeCuts: number;
  readonly workflowModeLabel: string;
}

export interface AiTeammateAssignment {
  readonly persona: AiTeammatePersona;
  readonly roleId: CreatorPipelineRoleId;
  readonly coverageOwner: "human" | "ai";
  readonly deployed: boolean;
  readonly approvalMode: AiTeammateApprovalMode;
  readonly queue: readonly AiTeammateQueueTask[];
  readonly estimatedHoursSaved: number;
  readonly assignmentReason: string;
}

export interface AssembleAiTeammateSquadInput {
  readonly teamScale: CreatorTeamScaleId;
  readonly humanRoles?: readonly CreatorPipelineRoleId[];
  readonly approvalModeOverrides?: Readonly<
    Partial<Record<CreatorPipelineRoleId, AiTeammateApprovalMode>>
  >;
  readonly episodeCuts?: number;
}

export interface AiTeammateSquadPlan {
  readonly teamScale: CreatorTeamScaleId;
  readonly preset: TeamScalePreset;
  readonly episodeCuts: number;
  readonly humanRoles: readonly CreatorPipelineRoleId[];
  readonly vacantRoles: readonly CreatorPipelineRoleId[];
  readonly allSlots: readonly AiTeammateAssignment[];
  readonly deployedTeammates: readonly AiTeammateAssignment[];
  readonly standbyTeammates: readonly AiTeammateAssignment[];
  readonly humanCoverageCount: number;
  readonly aiCoverageCount: number;
  readonly coveragePercent: number;
  readonly totalQueueTaskCount: number;
  readonly totalEstimatedHoursSaved: number;
  readonly autoDraftCount: number;
  readonly reviewFirstCount: number;
  readonly headlineSummary: string;
}

export const PIPELINE_ROLE_ORDER: readonly CreatorPipelineRoleId[] = [
  "storyboard",
  "lineart",
  "coloring",
  "bg3d",
  "lettering",
  "bom-producer",
];

export const AI_TEAMMATE_ROSTER: readonly AiTeammatePersona[] = [
  {
    id: "ai-storyboard-partner",
    roleId: "storyboard",
    roleLabel: "콘티·연출",
    personaName: "콘티·연출 파트너",
    codename: "나침반",
    spritePath: "/assets/studio/vibrant-sprites/tool-ai-compass.webp",
    accentTone: "indigo",
    summary: "스크립트→컷 분할·시선 흐름·긴장감 리듬 제안",
    capabilities: [
      "대본 감정 곡선 기반 세로 스크롤 컷 분할",
      "Z자 시선 동선·컷 간 여백 호흡 자동 계산",
      "클라이맥스 직전 정적 컷·클로즈업 연출 대안",
    ],
    baseEpisodeHoursSaved: 4.5,
    recommendedApprovalByScale: {
      solo: "auto-draft",
      small: "review-first",
      production: "review-first",
      enterprise: "review-first",
    },
    queueTemplates: [
      {
        id: "sb-beat-split",
        title: "스크립트 컷 분할 초안 생성",
        stageUnit: "씬 비트 분석",
        baseMinutesSaved: 120,
      },
      {
        id: "sb-eyeline-flow",
        title: "시선 흐름·말풍선 동선 충돌 점검",
        stageUnit: "스크롤 리듬",
        baseMinutesSaved: 85,
      },
      {
        id: "sb-tension-alt",
        title: "클라이맥스 컷 연출 2안 제안",
        stageUnit: "구도 대안",
        baseMinutesSaved: 65,
      },
    ],
  },
  {
    id: "ai-lineart-cleanup",
    roleId: "lineart",
    roleLabel: "선화 클린업",
    personaName: "선화 클린업 어시",
    codename: "지펜",
    spritePath: "/assets/studio/vibrant-sprites/tool-gpen.webp",
    accentTone: "ink",
    summary: "러프 정리·필압 보정·벡터화·화풍 메모리 일관성",
    capabilities: [
      "겹선·잔털 정리 및 매끄러운 필압 테이퍼 보정",
      "래스터 러프를 수정 가능한 벡터 선화 레이어로 변환",
      "작가 화풍 메모리 기준 선 두께·눈매 비율 일관성 유지",
    ],
    baseEpisodeHoursSaved: 6.0,
    recommendedApprovalByScale: {
      solo: "auto-draft",
      small: "review-first",
      production: "review-first",
      enterprise: "review-first",
    },
    queueTemplates: [
      {
        id: "la-rough-clean",
        title: "러프 겹선 제거 및 외곽선 클린업",
        stageUnit: "펜선 정리",
        baseMinutesSaved: 170,
      },
      {
        id: "la-vector-taper",
        title: "벡터 선화 변환·필압 강약 보정",
        stageUnit: "벡터 잉크",
        baseMinutesSaved: 110,
      },
      {
        id: "la-style-consistency",
        title: "캐릭터 얼굴·선 두께 화풍 일관성 점검",
        stageUnit: "화풍 메모리",
        baseMinutesSaved: 80,
      },
    ],
  },
  {
    id: "ai-coloring-cel",
    roleId: "coloring",
    roleLabel: "밑색·명암 채색",
    personaName: "밑색·명암 채색 어시",
    codename: "수채",
    spritePath: "/assets/studio/vibrant-sprites/tool-watercolor.webp",
    accentTone: "coral",
    summary: "닫힌 영역 자동 밑색·캐릭터 바이블 색 고정·광원 셀 음영",
    capabilities: [
      "틈새 보정 기반 닫힌 영역 원클릭 밑색 채우기",
      "캐릭터 바이블 팔레트 자동 잠금으로 회차 색 틀어짐 방지",
      "장면 광원 방향에 맞춘 1·2단 셀 음영 및 림라이트 초안",
    ],
    baseEpisodeHoursSaved: 7.5,
    recommendedApprovalByScale: {
      solo: "auto-draft",
      small: "auto-draft",
      production: "review-first",
      enterprise: "review-first",
    },
    queueTemplates: [
      {
        id: "co-flat-fill",
        title: "캐릭터 바이블 기준 닫힌 영역 자동 밑색",
        stageUnit: "밑색 분리",
        baseMinutesSaved: 210,
      },
      {
        id: "co-cel-shadow",
        title: "주광원 방향 연동 셀 음영·역광 레이어 생성",
        stageUnit: "명암 보정",
        baseMinutesSaved: 155,
      },
      {
        id: "co-palette-lock",
        title: "컷 간 피부·의상 명도 편차 자동 정렬",
        stageUnit: "색감 일관성",
        baseMinutesSaved: 85,
      },
    ],
  },
  {
    id: "ai-bg3d-props",
    roleId: "bg3d",
    roleLabel: "3D 배경·소품",
    personaName: "3D 배경·소품 어시",
    codename: "무대",
    spritePath: "/assets/studio/vibrant-sprites/tool-bg3d.webp",
    accentTone: "teal",
    summary: "장면 키워드→3D 앵글·선화/음영/마스크 3층 추출",
    capabilities: [
      "장면 키워드에서 3D 배경 무대·소품 앵글 자동 세팅",
      "선화 · 셀 음영 · 재질 ID 마스크 3층 분리 출력",
      "인물 눈높이(아이레벨) 기준 투시 소실점 자동 정합",
    ],
    baseEpisodeHoursSaved: 5.5,
    recommendedApprovalByScale: {
      solo: "auto-draft",
      small: "auto-draft",
      production: "review-first",
      enterprise: "review-first",
    },
    queueTemplates: [
      {
        id: "bg-angle-match",
        title: "장면 키워드 기반 3D 배경 카메라 앵글 매칭",
        stageUnit: "구도 배치",
        baseMinutesSaved: 135,
      },
      {
        id: "bg-3layer-extract",
        title: "선화·음영·마스크 3층 배경 레이어 일괄 추출",
        stageUnit: "NPR 3층 추출",
        baseMinutesSaved: 120,
      },
      {
        id: "bg-prop-grounding",
        title: "실내 소품 바닥 접지·투시 스케일 정합",
        stageUnit: "소품 정합",
        baseMinutesSaved: 75,
      },
    ],
  },
  {
    id: "ai-lettering-sfx",
    roleId: "lettering",
    roleLabel: "식자·SFX·번역",
    personaName: "식자·SFX·번역 어시",
    codename: "말풍선",
    spritePath: "/assets/studio/vibrant-sprites/tool-bubble-sfx.webp",
    accentTone: "amber",
    summary: "말풍선 여백 최적화·효과음 타이포·다국어 검수",
    capabilities: [
      "모바일 가독성 기준 말풍선 줄바꿈·내부 여백 자동 조판",
      "장면 강도에 맞춘 효과음(SFX) 외곽선·기울기 타이포 제안",
      "한/영/일 번역 대사 넘침·인물 말투 일관성 동시 검수",
    ],
    baseEpisodeHoursSaved: 4.0,
    recommendedApprovalByScale: {
      solo: "auto-draft",
      small: "auto-draft",
      production: "auto-draft",
      enterprise: "review-first",
    },
    queueTemplates: [
      {
        id: "lt-balloon-fit",
        title: "말풍선 여백·행간 모바일 가독성 최적화",
        stageUnit: "대사 조판",
        baseMinutesSaved: 105,
      },
      {
        id: "lt-sfx-typo",
        title: "액션·감정 효과음 타이포 초안 배치",
        stageUnit: "SFX 연출",
        baseMinutesSaved: 75,
      },
      {
        id: "lt-i18n-overflow",
        title: "다국어 번역 말풍선 넘침·맞춤법 검수",
        stageUnit: "글로벌 검수",
        baseMinutesSaved: 60,
      },
    ],
  },
  {
    id: "ai-bom-producer",
    roleId: "bom-producer",
    roleLabel: "마감·권리 BOM",
    personaName: "마감·권리 BOM 프로듀서",
    codename: "검수관",
    spritePath: "/assets/studio/vibrant-sprites/emblem-production.webp",
    accentTone: "emerald",
    summary: "컷 누락·해상도·폰트/소재 상업 라이선스 자동 감사",
    capabilities: [
      "회차 컷 번호 누락·규격 해상도·여백 잘림 자동 스캔",
      "사용 폰트·3D·브러시·스크린톤 상업 출고 권리 BOM 감사",
      "플랫폼별 최종 출고 체크리스트 및 수정 핀 리포트 생성",
    ],
    baseEpisodeHoursSaved: 3.0,
    recommendedApprovalByScale: {
      solo: "review-first",
      small: "review-first",
      production: "review-first",
      enterprise: "review-first",
    },
    queueTemplates: [
      {
        id: "bom-cut-spec",
        title: "컷 누락·해상도·세로 슬라이스 규격 검사",
        stageUnit: "출고 규격",
        baseMinutesSaved: 60,
      },
      {
        id: "bom-rights-audit",
        title: "폰트·소재 상업 라이선스 BOM 전수 감사",
        stageUnit: "권리 게이트",
        baseMinutesSaved: 75,
      },
      {
        id: "bom-preflight-pack",
        title: "최종 납품 패키지 및 변경 이력 리포트 작성",
        stageUnit: "마감 패키징",
        baseMinutesSaved: 45,
      },
    ],
  },
];

export const TEAM_SCALE_PRESETS: readonly TeamScalePreset[] = [
  {
    id: "solo",
    label: "1인 작가",
    headcountBadge: "1인",
    description: "작가가 핵심 연출·콘티에 집중하고 나머지 5개 공정을 AI 팀원이 자동 보완합니다.",
    defaultHumanRoles: ["storyboard"],
    defaultApprovalMode: "auto-draft",
    defaultEpisodeCuts: 48,
    workflowModeLabel: "속도 우선 · 자동 초안 중심",
  },
  {
    id: "small",
    label: "2~3인 소규모",
    headcountBadge: "2~3인",
    description: "콘티·선화는 사람이 맡고 채색·3D 배경·식자·BOM 감사를 AI가 이어받습니다.",
    defaultHumanRoles: ["storyboard", "lineart"],
    defaultApprovalMode: "auto-draft",
    defaultEpisodeCuts: 60,
    workflowModeLabel: "릴레이 협업 · 채색/배경 가속",
  },
  {
    id: "production",
    label: "7~8인 프로덕션",
    headcountBadge: "7~8인",
    description: "핵심 작화 4공정은 전담 인력이 담당하고 식자·번역과 마감 BOM 감사를 AI가 지원합니다.",
    defaultHumanRoles: ["storyboard", "lineart", "coloring", "bg3d"],
    defaultApprovalMode: "review-first",
    defaultEpisodeCuts: 75,
    workflowModeLabel: "검토 우선 · 병목 공정 보강",
  },
  {
    id: "enterprise",
    label: "30인+ 스튜디오",
    headcountBadge: "30인+",
    description: "전 작화·편집 라인을 전문 팀이 운영하고 권리 BOM·납품 감사를 AI 프로듀서가 전담합니다.",
    defaultHumanRoles: ["storyboard", "lineart", "coloring", "bg3d", "lettering"],
    defaultApprovalMode: "review-first",
    defaultEpisodeCuts: 120,
    workflowModeLabel: "엄격 승인 · 전사 권리 BOM 게이트",
  },
];

const SCALE_PRESET_MAP: Readonly<Record<CreatorTeamScaleId, TeamScalePreset>> = {
  solo: TEAM_SCALE_PRESETS[0],
  small: TEAM_SCALE_PRESETS[1],
  production: TEAM_SCALE_PRESETS[2],
  enterprise: TEAM_SCALE_PRESETS[3],
};

const VALID_ROLE_SET = new Set<CreatorPipelineRoleId>(PIPELINE_ROLE_ORDER);

export function getTeamScalePreset(scale: CreatorTeamScaleId): TeamScalePreset {
  return SCALE_PRESET_MAP[scale];
}

export function toggleHumanRoleAssignment(
  current: readonly CreatorPipelineRoleId[],
  roleId: CreatorPipelineRoleId,
): readonly CreatorPipelineRoleId[] {
  const next = new Set(current.filter((role) => VALID_ROLE_SET.has(role)));
  if (next.has(roleId)) {
    next.delete(roleId);
  } else {
    next.add(roleId);
  }
  return PIPELINE_ROLE_ORDER.filter((role) => next.has(role));
}

function clampEpisodeCuts(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(400, Math.max(10, Math.round(value)));
}

function roundHalfHour(hours: number): number {
  return Math.round(hours * 2) / 2;
}

/**
 * 창작 인원수(`teamScale`)와 사람이 맡은 공정(`humanRoles`)을 기준으로
 * 비어 있는 공정에만 AI 보조작가를 자동 투입하고 작업 큐·승인 모드·예상 시간 절감을 계산한다.
 */
export function assembleAiTeammateSquad(
  input: AssembleAiTeammateSquadInput,
): AiTeammateSquadPlan {
  const preset = getTeamScalePreset(input.teamScale);
  const episodeCuts = clampEpisodeCuts(input.episodeCuts, preset.defaultEpisodeCuts);
  const cutScaleFactor = episodeCuts / 60;

  const rawHumanRoles = input.humanRoles ?? preset.defaultHumanRoles;
  const humanRoleSet = new Set<CreatorPipelineRoleId>(
    rawHumanRoles.filter((role) => VALID_ROLE_SET.has(role)),
  );
  const humanRoles = PIPELINE_ROLE_ORDER.filter((role) => humanRoleSet.has(role));
  const vacantRoles = PIPELINE_ROLE_ORDER.filter((role) => !humanRoleSet.has(role));

  const allSlots: AiTeammateAssignment[] = AI_TEAMMATE_ROSTER.map((persona) => {
    const isHumanOwned = humanRoleSet.has(persona.roleId);
    const approvalMode =
      input.approvalModeOverrides?.[persona.roleId] ??
      persona.recommendedApprovalByScale[input.teamScale];

    if (isHumanOwned) {
      return {
        persona,
        roleId: persona.roleId,
        coverageOwner: "human",
        deployed: false,
        approvalMode,
        queue: [],
        estimatedHoursSaved: 0,
        assignmentReason: `사람 담당 공정(${persona.roleLabel}) — AI 자동 투입 대기`,
      };
    }

    const queue: AiTeammateQueueTask[] = persona.queueTemplates.map((tpl) => {
      const estimatedMinutesSaved = Math.max(
        15,
        Math.round((tpl.baseMinutesSaved * cutScaleFactor) / 5) * 5,
      );
      return {
        id: `${persona.id}:${tpl.id}`,
        title: tpl.title,
        detail: `${episodeCuts}컷 기준 · ${tpl.stageUnit}`,
        approvalMode,
        estimatedMinutesSaved,
      };
    });

    const estimatedHoursSaved = roundHalfHour(
      persona.baseEpisodeHoursSaved * cutScaleFactor,
    );

    return {
      persona,
      roleId: persona.roleId,
      coverageOwner: "ai",
      deployed: true,
      approvalMode,
      queue,
      estimatedHoursSaved,
      assignmentReason: `${preset.label} 빈 공정(${persona.roleLabel}) 자동 보충`,
    };
  });

  const deployedTeammates = allSlots.filter((slot) => slot.deployed);
  const standbyTeammates = allSlots.filter((slot) => !slot.deployed);

  const totalQueueTaskCount = deployedTeammates.reduce(
    (sum, slot) => sum + slot.queue.length,
    0,
  );
  const totalEstimatedHoursSaved = roundHalfHour(
    deployedTeammates.reduce((sum, slot) => sum + slot.estimatedHoursSaved, 0),
  );
  const autoDraftCount = deployedTeammates.filter(
    (slot) => slot.approvalMode === "auto-draft",
  ).length;
  const reviewFirstCount = deployedTeammates.filter(
    (slot) => slot.approvalMode === "review-first",
  ).length;

  const humanCoverageCount = humanRoles.length;
  const aiCoverageCount = deployedTeammates.length;
  const coveragePercent = Math.round(
    ((humanCoverageCount + aiCoverageCount) / AI_TEAMMATE_ROSTER.length) * 100,
  );

  const headlineSummary =
    aiCoverageCount === 0
      ? `전 공정(${humanCoverageCount}/6) 사람 직접 담당 · AI 대기 모드`
      : `사람 ${humanCoverageCount}공정 · AI ${aiCoverageCount}명 자동 투입 · 회당 예상 ${totalEstimatedHoursSaved.toFixed(1)}시간 단축(추정)`;

  return {
    teamScale: input.teamScale,
    preset,
    episodeCuts,
    humanRoles,
    vacantRoles,
    allSlots,
    deployedTeammates,
    standbyTeammates,
    humanCoverageCount,
    aiCoverageCount,
    coveragePercent,
    totalQueueTaskCount,
    totalEstimatedHoursSaved,
    autoDraftCount,
    reviewFirstCount,
    headlineSummary,
  };
}
