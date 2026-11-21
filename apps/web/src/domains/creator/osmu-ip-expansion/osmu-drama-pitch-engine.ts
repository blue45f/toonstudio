/**
 * OSMU IP 확장 엔진 — 웹드라마 · OTT 영상화 피칭 & 제작 패키저.
 * 100% 무과금(₩0) 로컬 결정론적 규칙 엔진이다.
 */
import {
  DRAMA_BUDGET_TIER_SPECS,
  type BudgetTierId,
  type CastingProfileSheet,
  type DramaCharacterInput,
  type DramaKeySceneInput,
  type DramaPitchIpInput,
  type DramaPitchPackage,
  type DramaPlatformId,
  type SceneProductionAssessment,
  type SeasonEpisodeArc,
  type VfxDifficultyLevel,
} from "./osmu-webnovel-drama-types";

const DRAMA_PLATFORM_META: Readonly<
  Record<
    DramaPlatformId,
    { readonly labelKo: string; readonly fitReason: string; readonly secondaryAudience: string }
  >
> = Object.freeze({
  netflix: {
    labelKo: "넷플릭스 (글로벌 동시 공개)",
    fitReason: "전 세계 190개국 동시 공개 기준에 맞는 강한 1화 오프닝 훅과 장르 시각 완성도를 전면에 배치합니다.",
    secondaryAudience: "글로벌 K-장르물 · 하이콘셉트 스릴러·판타지 구독자",
  },
  tving: {
    labelKo: "티빙 (국내 오리지널 팬덤)",
    fitReason: "국내 2030 웹툰 원작 팬덤의 입소문과 주간 공개 엔딩 몰입감에 맞춘 감정·갈등 설계입니다.",
    secondaryAudience: "국내 웹툰 원작 독자층 및 주간 정주행 구독자",
  },
  "disney-plus": {
    labelKo: "디즈니+ (프랜차이즈 IP 확장)",
    fitReason: "세계관 확장성과 시즌제·스핀오프 연계가 가능한 캐릭터 아크와 시각적 시그니처에 집중합니다.",
    secondaryAudience: "장르 프랜차이즈·히어로·미스터리 시리즈 시청자",
  },
  "shortform-drama": {
    labelKo: "숏폼 드라마 (세로 2분 초고속 몰입)",
    fitReason: "회당 90~120초 안에 매 30초마다 반전·갈등 비트를 배치해 모바일 결제 전환을 극대화합니다.",
    secondaryAudience: "모바일 출퇴근·숏폼 플랫폼 세로 영상 시청층",
  },
});


function scoreVfxScene(scene: DramaKeySceneInput): {
  readonly difficulty: VfxDifficultyLevel;
  readonly score: number;
  readonly recommendedTier: BudgetTierId;
  readonly locationTier: SceneProductionAssessment["locationTier"];
  readonly costMillionKrw: number;
  readonly shootingDays: number;
  readonly riskFlags: readonly string[];
} {
  let score = scene.vfxElements.length * 22;
  if (scene.stuntRequired) score += 16;
  if (scene.crowdScale === "medium") score += 10;
  if (scene.crowdScale === "large") score += 22;
  if (scene.interiorExterior !== "INT") score += 8;
  score = Math.min(100, score);

  const difficulty: VfxDifficultyLevel =
    score === 0
      ? "NONE"
      : score <= 25
        ? "LOW"
        : score <= 50
          ? "MEDIUM"
          : score <= 75
            ? "HIGH"
            : "HERO_CG";

  const recommendedTier: BudgetTierId =
    score <= 35 ? "low" : score <= 68 ? "mid" : "tentpole";

  const locationTier: SceneProductionAssessment["locationTier"] =
    scene.interiorExterior === "INT" && scene.crowdScale === "small"
      ? "실내 세트"
      : scene.crowdScale === "large" || scene.vfxElements.length >= 3
        ? "대형 특수 로케이션"
        : "로케이션 촬영";

  const costMillionKrw = Math.round(
    18 +
      score * 2.4 +
      (locationTier === "대형 특수 로케이션" ? 85 : locationTier === "로케이션 촬영" ? 30 : 12),
  );
  const shootingDays = score >= 70 ? 3 : score >= 35 ? 2 : 1;

  const riskFlags: string[] = [];
  if (scene.vfxElements.length >= 2) riskFlags.push("프리비즈(Pre-vis) 사전 콘티 필수");
  if (scene.stuntRequired) riskFlags.push("무술팀 안전 리허설·와이어 장비 필요");
  if (scene.crowdScale === "large") riskFlags.push("보조출연자 통제 및 야간 허가 협의");
  if (scene.timeOfDay.includes("야간") || scene.timeOfDay.includes("밤")) {
    riskFlags.push("야간 조명 셋업 시간 여유 확보");
  }

  return {
    difficulty,
    score,
    recommendedTier,
    locationTier,
    costMillionKrw,
    shootingDays,
    riskFlags,
  };
}

function buildSeasonArc(input: DramaPitchIpInput): readonly SeasonEpisodeArc[] {
  const isShortform = input.format === "shortform-50ep";
  const totalEpisodes = isShortform ? 50 : 12;
  const runtimePerEp = isShortform ? 2 : 52;

  const actNames: Readonly<Record<1 | 2 | 3 | 4, string>> = {
    1: "1막 · 세계관 발단과 사건 점화",
    2: "2막 · 동맹 균열과 판돈 상승",
    3: "3막 · 정체 폭로와 최대 위기",
    4: "4막 · 최종 대결과 시즌2 훅",
  };

  const leadName = input.characters.find((c) => c.roleType === "lead")?.name ?? "주인공";
  const antagonistName =
    input.characters.find((c) => c.roleType === "antagonist")?.name ?? "핵심 적대 세력";

  const arc: SeasonEpisodeArc[] = [];
  for (let ep = 1; ep <= totalEpisodes; ep += 1) {
    const progress = ep / totalEpisodes;
    const actNumber: 1 | 2 | 3 | 4 =
      progress <= 0.25 ? 1 : progress <= 0.55 ? 2 : progress <= 0.85 ? 3 : 4;
    const tensionScore = Math.min(
      100,
      Math.round(
        actNumber === 1
          ? 42 + progress * 90
          : actNumber === 2
            ? 60 + (progress - 0.25) * 70
            : actNumber === 3
              ? 78 + (progress - 0.55) * 65
              : ep === totalEpisodes
                ? 98
                : 88 + (progress - 0.85) * 60,
      ),
    );
    const keyScene = input.keyScenes[(ep - 1) % Math.max(1, input.keyScenes.length)];
    const sceneTitle = keyScene?.title ?? `${input.title} 핵심 전환점`;

    const beatSummary =
      actNumber === 1
        ? `${leadName}의 일상이 깨지며 ‘${sceneTitle}’ 사건에 휘말리고 ${input.genre} 규칙을 처음 체감한다.`
        : actNumber === 2
          ? `${antagonistName}의 숨겨진 의도가 드러나고, 조력자와의 신뢰가 시험대에 오른다.`
          : actNumber === 3
            ? `기존 전제가 뒤집히는 반전 속에 ${leadName}이(가) 정면 돌파를 선택하며 판이 최대치로 커진다.`
            : ep === totalEpisodes
              ? `${antagonistName}과의 최종 결착 이후 시즌 2를 예고하는 미회수 떡밥이 열리며 막을 내린다.`
              : `최종 결전 직전 모든 인물의 선택이 한 공간(${keyScene?.setting ?? "핵심 무대"})으로 집결한다.`;

    const cliffhangerHook =
      ep === totalEpisodes
        ? `에필로그: 해결된 줄 알았던 ${input.title}의 핵심 법칙이 새로운 장소에서 재작동한다.`
        : isShortform
          ? `[2분 엔딩 훅 #${ep}] ${leadName}의 눈앞에 예상치 못한 증거가 도착하며 즉시 다음 화 결제를 유도한다.`
          : `[엔딩 훅 #${ep}] ${antagonistName}의 다음 수가 공개되며 ${leadName}의 선택이 절벽 끝에 선다.`;

    arc.push({
      episodeNumber: ep,
      actNumber,
      actLabelKo: actNames[actNumber],
      title: `${ep}화 · ${sceneTitle}${isShortform ? ` (파트 ${((ep - 1) % 5) + 1})` : ""}`,
      beatSummary,
      cliffhangerHook,
      tensionScore,
      estimatedRuntimeMin: runtimePerEp,
    });
  }
  return arc;
}

/**
 * 2. 웹드라마 · OTT 영상화 피칭 & 제작 패키저.
 * 1-Page 기획서 + 12부작/50부작 시즌 아크 + 씬별 로케이션/VFX/제작비 매트릭스 + 주조연 캐스팅 시트를 산출한다.
 */
export function buildDramaPitchPackage(ipInput: DramaPitchIpInput): DramaPitchPackage {
  const platformMeta = DRAMA_PLATFORM_META[ipInput.targetPlatform];
  const tierSpec = DRAMA_BUDGET_TIER_SPECS[ipInput.budgetTier];
  const isShortform = ipInput.format === "shortform-50ep";
  const episodeCount = isShortform ? 50 : 12;
  const runtimePerEpisodeMin = isShortform ? 2 : 52;

  const logline = `[${ipInput.genre}/${ipInput.subGenre}] ${ipInput.protagonistSummary} — ${ipInput.antagonistOrConflict}에 맞서는 ${episodeCount}부작 ${platformMeta.labelKo.split(" ")[0]} 프로젝트.`;

  const seasonArc = buildSeasonArc(ipInput);

  const sceneProductionMatrix: SceneProductionAssessment[] = ipInput.keyScenes.map((scene) => {
    const scored = scoreVfxScene(scene);
    return {
      sceneId: scene.sceneId,
      title: scene.title,
      locationTag: `${scene.interiorExterior}. ${scene.setting} (${scene.timeOfDay})`,
      locationTier: scored.locationTier,
      vfxDifficulty: scored.difficulty,
      vfxScore: scored.score,
      recommendedBudgetTier: scored.recommendedTier,
      estimatedSceneCostMillionKrw: scored.costMillionKrw,
      shootingDays: scored.shootingDays,
      riskFlags: scored.riskFlags,
    };
  });

  const highestVfxScore = sceneProductionMatrix.reduce((max, s) => Math.max(max, s.vfxScore), 0);
  const highestSceneVfx: VfxDifficultyLevel =
    sceneProductionMatrix.find((s) => s.vfxScore === highestVfxScore)?.vfxDifficulty ?? "NONE";

  const perEpisodeMillionKrw = isShortform
    ? tierSpec.shortformPerEpisodeMillionKrw
    : tierSpec.ottPerEpisodeMillionKrw;
  const totalSeasonMillionKrw = perEpisodeMillionKrw * episodeCount;

  const vfxBudgetSharePercent = Math.min(48, Math.max(8, Math.round(highestVfxScore * 0.45)));
  const locationBudgetSharePercent = Math.min(
    32,
    Math.max(
      14,
      Math.round(
        (sceneProductionMatrix.filter((s) => s.locationTier !== "실내 세트").length /
          Math.max(1, sceneProductionMatrix.length)) *
          28,
      ),
    ),
  );
  const castAndCrewSharePercent = 100 - vfxBudgetSharePercent - locationBudgetSharePercent;

  const tierFitAssessment: DramaPitchPackage["budgetSummary"]["tierFitAssessment"] =
    highestVfxScore > tierSpec.maxRecommendedVfxScore
      ? "예산 상향 권고"
      : ipInput.budgetTier === "tentpole" && highestVfxScore < 40
        ? "여유"
        : "적정";

  const recommendationNote =
    tierFitAssessment === "예산 상향 권고"
      ? `최고 VFX 난이도(${highestSceneVfx}) 대비 선택 예산 티어가 낮습니다. 씬 분리 또는 상위 티어 검토를 권고합니다.`
      : tierFitAssessment === "여유"
        ? "VFX 부하 대비 예산 여유가 충분해 A급 캐스팅과 로케이션 퀄리티에 집중 배분할 수 있습니다."
        : "선택 예산 티어가 핵심 씬 VFX 및 로케이션 난이도와 균형을 이룹니다.";

  const roleLabels: Readonly<Record<DramaCharacterInput["roleType"], string>> = {
    lead: "주연 (1번 롤)",
    "co-lead": "공동 주연",
    supporting: "핵심 조연",
    antagonist: "메인 빌런·대립축",
  };
  const roleWeights: Readonly<Record<DramaCharacterInput["roleType"], number>> = {
    lead: 42,
    "co-lead": 26,
    antagonist: 20,
    supporting: 12,
  };
  const totalRoleWeight = ipInput.characters.reduce((sum, c) => sum + roleWeights[c.roleType], 0);
  let remainingShare = 100;

  const castingProfiles: CastingProfileSheet[] = ipInput.characters.map((char, idx) => {
    const share =
      idx === ipInput.characters.length - 1
        ? remainingShare
        : Math.max(5, Math.round((roleWeights[char.roleType] / Math.max(1, totalRoleWeight)) * 100));
    remainingShare = Math.max(0, remainingShare - share);
    return {
      characterName: char.name,
      roleLabelKo: roleLabels[char.roleType],
      ageRange: char.ageRange,
      archetype: char.archetype,
      visualVibe: `${char.archetype} 이미지 · ${char.actingKeywords.slice(0, 2).join(" / ")} 톤`,
      actingRequirements: [
        `핵심 욕망 표현: ${char.coreDesire}`,
        `내면 결핍 연기: ${char.flaw}`,
        ...char.actingKeywords.map((kw) => `연기 톤: ${kw}`),
      ],
      screenTimeSharePercent: share,
      chemistryWithLead: char.chemistryNote,
      auditionSidePrompt: `[오디션 지정 씬] ${char.name}(${char.ageRange})가 ‘${char.coreDesire}’을 지키기 위해 ‘${char.flaw}’을(를) 드러내는 90초 독백·대면 연기.`,
    };
  });

  const differentiators =
    ipInput.differentiators.length >= 3
      ? ipInput.differentiators
      : [
          ...ipInput.differentiators,
          `검증된 원작 웹툰 ${ipInput.episodesPublished}화 분량의 탄탄한 서사 아크`,
          `${ipInput.coreAppealKeywords.join(" · ")} 기반 팬덤 확산 구조`,
        ].slice(0, 3);

  const onePageProposal: DramaPitchPackage["onePageProposal"] = {
    title: ipInput.title,
    platformId: ipInput.targetPlatform,
    platformLabelKo: platformMeta.labelKo,
    formatId: ipInput.format,
    formatLabelKo: isShortform ? "숏폼 드라마 50부작 (회당 2분)" : "OTT 시리즈 12부작 (회당 52분)",
    episodeCount,
    runtimePerEpisodeMin,
    logline,
    targetAudience: {
      primary: ipInput.targetAudienceKo,
      secondary: platformMeta.secondaryAudience,
      platformFitReason: platformMeta.fitReason,
    },
    differentiators,
    hookStatement: `${ipInput.premise} — 첫 10분 안에 시청자의 질문을 고정하는 하이콘셉트 IP`,
    comparablePositioning: `${ipInput.genre} 팬덤 서사 × ${ipInput.subGenre} 시각 연출의 교차점`,
  };

  const budgetSummary: DramaPitchPackage["budgetSummary"] = {
    selectedTier: ipInput.budgetTier,
    tierLabelKo: tierSpec.labelKo,
    perEpisodeMillionKrw,
    totalSeasonMillionKrw,
    vfxBudgetSharePercent,
    locationBudgetSharePercent,
    castAndCrewSharePercent,
    highestSceneVfx,
    tierFitAssessment,
    recommendationNote,
  };

  const exportPayload = {
    onePageProposal,
    budgetSummary,
    seasonArc,
    sceneProductionMatrix,
    castingProfiles,
  };

  const jsonExport = JSON.stringify(exportPayload, null, 2);

  const markdownExport = [
    `# [${onePageProposal.platformLabelKo}] ${onePageProposal.title} 영상화 피칭 바이블`,
    "",
    "## 1. 1-Page 기획서",
    `- **편성 포맷**: ${onePageProposal.formatLabelKo}`,
    `- **로그라인**: ${onePageProposal.logline}`,
    `- **타겟 시청층**: ${onePageProposal.targetAudience.primary} / ${onePageProposal.targetAudience.secondary}`,
    `- **차별점**:`,
    ...onePageProposal.differentiators.map((item) => `  - ${item}`),
    "",
    "## 2. 제작비 & VFX 매트릭스",
    `- **선택 예산 티어**: ${budgetSummary.tierLabelKo} (회당 ${budgetSummary.perEpisodeMillionKrw.toLocaleString("ko-KR")}백만 원 · 시즌 총 ${budgetSummary.totalSeasonMillionKrw.toLocaleString("ko-KR")}백만 원)`,
    `- **예산 적합성**: ${budgetSummary.tierFitAssessment} — ${budgetSummary.recommendationNote}`,
    ...sceneProductionMatrix.map(
      (s) =>
        `- **${s.sceneId} ${s.title}**: ${s.locationTag} | ${s.locationTier} | VFX ${s.vfxDifficulty}(${s.vfxScore}점) | 추정 ${s.estimatedSceneCostMillionKrw}백만 원 (${s.shootingDays}일)`,
    ),
    "",
    `## 3. 시즌 아크 (${seasonArc.length}부작)`,
    ...seasonArc.slice(0, 12).map(
      (ep) =>
        `- **${ep.title}** [${ep.actLabelKo}, 텐션 ${ep.tensionScore}] ${ep.beatSummary}`,
    ),
    ...(seasonArc.length > 12
      ? [`- *(이하 13~${seasonArc.length}화 전체 아크는 JSON 패키지에 수록)*`]
      : []),
    "",
    "## 4. 주조연 캐스팅 프로필 시트",
    ...castingProfiles.map(
      (c) =>
        `- **${c.characterName}** (${c.roleLabelKo}, ${c.ageRange}, 비중 ${c.screenTimeSharePercent}%) — ${c.visualVibe} | 케미: ${c.chemistryWithLead}`,
    ),
    "",
  ].join("\n");

  return {
    onePageProposal,
    seasonArc,
    sceneProductionMatrix,
    budgetSummary,
    castingProfiles,
    jsonExport,
    markdownExport,
  };
}
