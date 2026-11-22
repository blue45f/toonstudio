/**
 * 장르별 60컷 세로 스크롤 레이아웃 자동 골격 생성 엔진 (₩0 100% 브라우저 로컬).
 *
 * 프리셋 정의는 genre-skeleton-presets.ts에서 불러오며,
 * 기승전결 호흡 계산·말풍선 안전영역 배치·콘티 텍스트·리듬 맵 SVG·로컬 영속화를 담당한다.
 */

import {
  GENRE_SKELETON_ACT_META,
  GENRE_SKELETON_ACT_ORDER,
  GENRE_SKELETON_DEFAULT_CUTS,
  GENRE_SKELETON_DEFAULT_WIDTH_PX,
  GENRE_SKELETON_IDS,
  GENRE_SKELETON_MAX_CUTS,
  GENRE_SKELETON_MIN_CUTS,
  GENRE_SKELETON_PRESETS,
  type CutSafeMarginsPx,
  type GenreSkeletonActId,
  type GenreSkeletonActSummary,
  type GenreSkeletonCut,
  type GenreSkeletonCutRole,
  type GenreSkeletonGutterTone,
  type GenreSkeletonId,
  type GenreSkeletonInput,
  type GenreSkeletonPlan,
  type SpeechBubbleSafeBox,
} from "./genre-skeleton-presets";

export * from "./genre-skeleton-presets";

function clampCutCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return GENRE_SKELETON_DEFAULT_CUTS;
  return Math.max(GENRE_SKELETON_MIN_CUTS, Math.min(GENRE_SKELETON_MAX_CUTS, Math.round(value)));
}

function clampCanvasWidth(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return GENRE_SKELETON_DEFAULT_WIDTH_PX;
  return Math.max(600, Math.min(1600, Math.round(value)));
}

function allocateActCutCounts(
  totalCuts: number,
  ratios: Readonly<Record<GenreSkeletonActId, number>>,
): Readonly<Record<GenreSkeletonActId, number>> {
  const raw = GENRE_SKELETON_ACT_ORDER.map((id) => ({
    id,
    exact: Math.max(2, totalCuts * ratios[id]),
  }));
  const floored: Record<GenreSkeletonActId, number> = {
    ki: Math.floor(raw[0]?.exact ?? 2),
    seung: Math.floor(raw[1]?.exact ?? 2),
    jeon: Math.floor(raw[2]?.exact ?? 2),
    gyeol: Math.floor(raw[3]?.exact ?? 2),
  };

  let remaining = totalCuts - (floored.ki + floored.seung + floored.jeon + floored.gyeol);
  const remainders = [...raw].sort(
    (a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)),
  );
  let cursor = 0;
  while (remaining > 0) {
    const target = remainders[cursor % remainders.length];
    if (target) floored[target.id] += 1;
    remaining -= 1;
    cursor += 1;
  }
  while (remaining < 0) {
    const largest = [...GENRE_SKELETON_ACT_ORDER].sort((a, b) => floored[b] - floored[a])[0];
    if (largest && floored[largest] > 2) floored[largest] -= 1;
    remaining += 1;
  }
  return floored;
}

function buildSafeMargins(widthPx: number, heightPx: number, fullBleed: boolean): CutSafeMarginsPx {
  const sideRatio = fullBleed ? 0.065 : 0.085;
  const side = Math.max(44, Math.round(widthPx * sideRatio));
  const vertical = Math.max(40, Math.min(110, Math.round(heightPx * 0.07)));
  return { top: vertical, right: side, bottom: vertical, left: side };
}

function buildSpeechBubbleZones(params: {
  readonly cutIndex: number;
  readonly genre: GenreSkeletonId;
  readonly role: GenreSkeletonCutRole;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly safe: CutSafeMarginsPx;
}): readonly SpeechBubbleSafeBox[] {
  const { cutIndex, genre, role, widthPx, heightPx, safe } = params;
  const usableW = Math.max(200, widthPx - safe.left - safe.right);
  const usableH = Math.max(160, heightPx - safe.top - safe.bottom);
  const leftAnchorX = safe.left + Math.round(usableW * 0.03);
  const rightAnchorX = safe.left + Math.round(usableW * 0.44);
  const bubbleW = Math.round(usableW * 0.52);

  if (role === "tension-pause") {
    return [
      {
        id: `cut-${cutIndex}-bubble-1`,
        role: genre === "thriller" ? "narration" : "sfx-anchor",
        labelKo: genre === "thriller" ? "긴장 나레이션 박스" : "호흡·효과음 안전 구역",
        xPx: safe.left + Math.round(usableW * 0.18),
        yPx: safe.top + Math.round(usableH * 0.36),
        widthPx: Math.round(usableW * 0.64),
        heightPx: Math.min(130, Math.round(usableH * 0.24)),
        maxCharsRecommended: 18,
      },
    ];
  }

  if (role === "climax-fullbleed") {
    return [
      {
        id: `cut-${cutIndex}-bubble-1`,
        role: genre === "action" ? "sfx-anchor" : "monologue",
        labelKo: genre === "action" ? "임팩트 효과음·외침 구역" : "클라이맥스 핵심 대사 구역",
        xPx: leftAnchorX,
        yPx: safe.top + Math.round(usableH * 0.06),
        widthPx: Math.round(usableW * 0.54),
        heightPx: Math.min(180, Math.round(usableH * 0.14)),
        maxCharsRecommended: genre === "action" ? 14 : 26,
      },
      {
        id: `cut-${cutIndex}-bubble-2`,
        role: "dialogue",
        labelKo: "하단 잔향·마무리 대사 구역",
        xPx: rightAnchorX,
        yPx: safe.top + Math.round(usableH * 0.78),
        widthPx: bubbleW,
        heightPx: Math.min(170, Math.round(usableH * 0.14)),
        maxCharsRecommended: 22,
      },
    ];
  }

  if (role === "opening-hook" || role === "cliffhanger") {
    return [
      {
        id: `cut-${cutIndex}-bubble-1`,
        role: "narration",
        labelKo: role === "opening-hook" ? "오프닝 훅 나레이션" : "엔딩 훅 핵심 대사",
        xPx: safe.left + Math.round(usableW * 0.08),
        yPx: safe.top + Math.round(usableH * (role === "opening-hook" ? 0.08 : 0.72)),
        widthPx: Math.round(usableW * 0.84),
        heightPx: Math.min(165, Math.round(usableH * 0.2)),
        maxCharsRecommended: 28,
      },
    ];
  }

  const twoBubbles =
    role === "dialogue" ||
    genre === "slice-of-life" ||
    (genre === "romance" && cutIndex % 2 === 0);

  const primary: SpeechBubbleSafeBox = {
    id: `cut-${cutIndex}-bubble-1`,
    role: "dialogue",
    labelKo: "주 대사 말풍선 안전영역",
    xPx: cutIndex % 2 === 1 ? leftAnchorX : rightAnchorX,
    yPx: safe.top + Math.round(usableH * 0.08),
    widthPx: bubbleW,
    heightPx: Math.min(165, Math.round(usableH * 0.25)),
    maxCharsRecommended: genre === "slice-of-life" ? 32 : 24,
  };

  if (!twoBubbles) return [primary];

  const secondary: SpeechBubbleSafeBox = {
    id: `cut-${cutIndex}-bubble-2`,
    role: role === "reaction" ? "monologue" : "dialogue",
    labelKo: role === "reaction" ? "속마음·반응 말풍선" : "응답 말풍선 안전영역",
    xPx: cutIndex % 2 === 1 ? rightAnchorX : leftAnchorX,
    yPx: safe.top + Math.round(usableH * 0.62),
    widthPx: bubbleW,
    heightPx: Math.min(160, Math.round(usableH * 0.24)),
    maxCharsRecommended: genre === "slice-of-life" ? 30 : 22,
  };
  return [primary, secondary];
}

function shotGuideForCut(
  genre: GenreSkeletonId,
  role: GenreSkeletonCutRole,
  localStep: number,
): string {
  if (role === "opening-hook") {
    if (genre === "action") return "하이 앵글 임팩트 오프닝 · 동세 대각선 구도";
    if (genre === "romance") return "감정 눈빛 클로즈업 · 빛망울 여백 연출";
    if (genre === "thriller") return "단서 오브젝트 극단 클로즈업 · 암부 강조";
    return "배경·캐릭터 1초 상황 제시 · 밝은 미디엄 샷";
  }
  if (role === "climax-fullbleed") {
    if (genre === "action") return "전면 풀블리드 결정타 · 방사형 집중선·속도선";
    if (genre === "romance") return "전면 풀블리드 시선 교차 · 세로 스크롤 여운 컷";
    if (genre === "thriller") return "전면 풀블리드 반전 공개 · 강렬한 명암 대비";
    return "전면 확장 펀치라인 컷 · 과장 표정 및 리액션";
  }
  if (role === "tension-pause") {
    if (genre === "thriller") return "침묵의 암전 컷 · 시선 고정 후 긴 여백";
    if (genre === "action") return "타격 직전 0.5초 정지 컷 · 손끝/눈동자 포커스";
    return "숨 고르기 여백 컷 · 말풍선 최소화";
  }
  if (role === "cliffhanger") return "다음 화 클릭 유도 훅 · 화면 하단 여운 고정";
  if (role === "establishing") return "공간·시간대 설정 와이드 샷 · 인물 위치 안내";
  if (role === "reaction") return "상대방 표정 리액션 바스트 샷 · 감정 회수";
  const cycle = [
    "미디엄 투샷 · 좌상→우하 시선 유도",
    "오버더숄더 대화 컷 · 구도 리듬 전환",
    "클로즈업 감정 강조 · 배경 단순화",
  ];
  return cycle[localStep % cycle.length] ?? cycle[0];
}

function roleLabelKo(role: GenreSkeletonCutRole): string {
  switch (role) {
    case "opening-hook":
      return "오프닝 훅 컷";
    case "establishing":
      return "상황·공간 설정 컷";
    case "dialogue":
      return "대화·전개 컷";
    case "beat-build":
      return "고조·비트 축적 컷";
    case "tension-pause":
      return "호흡 정지·긴장 컷";
    case "climax-fullbleed":
      return "클라이맥스 전면 컷";
    case "reaction":
      return "감정 반응 컷";
    case "cliffhanger":
      return "엔딩 클리프행어 컷";
  }
}

/**
 * 장르 프리셋과 목표 컷 수로 기승전결 세로 스크롤 컷 골격을 결정론적으로 생성한다.
 */
export function generateGenreScrollSkeleton(input: GenreSkeletonInput): GenreSkeletonPlan {
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  const preset = GENRE_SKELETON_PRESETS[input.genre];
  const cutCount = clampCutCount(input.targetCutCount);
  const canvasWidthPx = clampCanvasWidth(input.canvasWidthPx);
  const widthScale = canvasWidthPx / GENRE_SKELETON_DEFAULT_WIDTH_PX;
  const includeCliffhanger = input.includeCliffhanger ?? true;
  const actCounts = allocateActCutCounts(cutCount, preset.actRatios);

  const cuts: GenreSkeletonCut[] = [];
  const acts: GenreSkeletonActSummary[] = [];
  const climaxCutIndices: number[] = [];

  let cursorY = 0;
  let globalIndex = 1;

  for (const actId of GENRE_SKELETON_ACT_ORDER) {
    const count = actCounts[actId];
    const actStartIndex = globalIndex;
    const actStartY = cursorY;
    let actCutHeightSum = 0;
    let actGutterSum = 0;
    let actFullBleedCount = 0;

    const jeonPrimaryClimax = Math.max(2, Math.round(count * 0.58));
    const jeonSecondaryClimax = count >= 14 ? Math.max(2, Math.round(count * 0.25)) : -1;
    const jeonFinalClimax = count >= 18 ? Math.max(jeonPrimaryClimax + 2, count - 1) : -1;

    for (let step = 1; step <= count; step += 1) {
      let role: GenreSkeletonCutRole;
      let fullBleed = false;
      let baseHeight = preset.actBaseHeightPx[actId];
      let baseGutter = preset.actBaseGutterPx[actId];
      let gutterTone: GenreSkeletonGutterTone = preset.defaultGutterTone;

      if (actId === "ki") {
        if (step === 1) {
          role = "opening-hook";
          fullBleed = true;
          baseHeight = preset.openingHookHeightPx;
          baseGutter = Math.round(preset.actBaseGutterPx.ki * 1.35);
        } else if (step === 2) {
          role = "establishing";
          baseHeight = Math.round(preset.actBaseHeightPx.ki * 1.08);
        } else if (step === count) {
          role = "beat-build";
          baseGutter = Math.round(preset.actBaseGutterPx.ki * 1.25);
        } else {
          role = step % 2 === 0 ? "dialogue" : "reaction";
        }
      } else if (actId === "seung") {
        if (step === count) {
          role = "tension-pause";
          baseHeight = Math.round(preset.actBaseHeightPx.seung * 0.82);
          baseGutter = Math.round(preset.actBaseGutterPx.seung * 1.75);
          gutterTone = preset.climaxGutterTone;
        } else if (step % 4 === 0) {
          role = "beat-build";
          baseHeight = Math.round(preset.actBaseHeightPx.seung * 1.12);
        } else if (step % 3 === 0) {
          role = "reaction";
          baseHeight = Math.round(preset.actBaseHeightPx.seung * 0.92);
        } else {
          role = "dialogue";
        }
      } else if (actId === "jeon") {
        const isClimaxSpot =
          step === jeonPrimaryClimax || step === jeonSecondaryClimax || step === jeonFinalClimax;
        const isPreClimaxPause =
          step === jeonPrimaryClimax - 1 ||
          (jeonSecondaryClimax > 2 && step === jeonSecondaryClimax - 1);

        if (isClimaxSpot) {
          role = "climax-fullbleed";
          fullBleed = true;
          baseHeight =
            step === jeonPrimaryClimax
              ? preset.climaxFullBleedHeightPx
              : Math.round(preset.climaxFullBleedHeightPx * 0.86);
          baseGutter = Math.round(preset.actBaseGutterPx.jeon * 1.6);
          gutterTone = preset.climaxGutterTone;
        } else if (isPreClimaxPause) {
          role = "tension-pause";
          baseHeight = Math.round(preset.actBaseHeightPx.jeon * 0.78);
          baseGutter = Math.round(Math.max(preset.actBaseGutterPx.jeon * 2.1, 210));
          gutterTone = preset.climaxGutterTone;
        } else {
          role = step % 2 === 0 ? "beat-build" : "reaction";
          const wave = step % 3 === 0 ? 0.9 : step % 3 === 1 ? 1.04 : 0.96;
          baseHeight = Math.round(preset.actBaseHeightPx.jeon * wave);
        }
      } else if (step === count && includeCliffhanger) {
        role = "cliffhanger";
        fullBleed = true;
        baseHeight = preset.cliffhangerHeightPx;
        baseGutter = 0;
        gutterTone = preset.climaxGutterTone;
      } else if (step === 1) {
        role = "reaction";
        baseHeight = Math.round(preset.actBaseHeightPx.gyeol * 1.08);
        baseGutter = Math.round(preset.actBaseGutterPx.gyeol * 1.25);
      } else if (step === count - 1 && includeCliffhanger) {
        role = "tension-pause";
        baseHeight = Math.round(preset.actBaseHeightPx.gyeol * 0.84);
        baseGutter = Math.round(Math.max(preset.actBaseGutterPx.gyeol * 1.55, 190));
        gutterTone = preset.climaxGutterTone;
      } else {
        role = step % 2 === 0 ? "dialogue" : "reaction";
      }

      const isLastCutOverall = globalIndex === cutCount;
      const heightPx = Math.round(baseHeight * widthScale);
      const gutterAfterPx = isLastCutOverall ? 0 : Math.round(baseGutter * widthScale);
      const safeMarginsPx = buildSafeMargins(canvasWidthPx, heightPx, fullBleed);
      const speechBubbleZones = buildSpeechBubbleZones({
        cutIndex: globalIndex,
        genre: input.genre,
        role,
        widthPx: canvasWidthPx,
        heightPx,
        safe: safeMarginsPx,
      });

      cuts.push({
        index: globalIndex,
        act: actId,
        role,
        labelKo: roleLabelKo(role),
        yPx: cursorY,
        heightPx,
        gutterAfterPx,
        gutterTone,
        fullBleed,
        recommendedShotKo: shotGuideForCut(input.genre, role, step),
        safeMarginsPx,
        speechBubbleZones,
      });

      if (role === "climax-fullbleed") climaxCutIndices.push(globalIndex);
      if (fullBleed) actFullBleedCount += 1;

      cursorY += heightPx + gutterAfterPx;
      actCutHeightSum += heightPx;
      actGutterSum += gutterAfterPx;
      globalIndex += 1;
    }

    acts.push({
      id: actId,
      labelKo: GENRE_SKELETON_ACT_META[actId].labelKo,
      intentKo: GENRE_SKELETON_ACT_META[actId].intentKo,
      startCutIndex: actStartIndex,
      endCutIndex: actStartIndex + count - 1,
      cutCount: count,
      heightPx: cursorY - actStartY,
      avgCutHeightPx: Math.round(actCutHeightSum / count),
      avgGutterPx: Math.round(actGutterSum / count),
      fullBleedCount: actFullBleedCount,
    });
  }

  const totalHeightPx = cursorY;
  const fullBleedCount = cuts.filter((c) => c.fullBleed).length;
  const bubbleZoneCount = cuts.reduce((sum, c) => sum + c.speechBubbleZones.length, 0);
  const avgCutHeightPx = Math.round(
    cuts.reduce((sum, c) => sum + c.heightPx, 0) / Math.max(1, cuts.length),
  );
  const gutteredCuts = cuts.slice(0, -1);
  const avgGutterPx = Math.round(
    gutteredCuts.reduce((sum, c) => sum + c.gutterAfterPx, 0) / Math.max(1, gutteredCuts.length),
  );
  const screenHeightPx = Math.round(canvasWidthPx * 2.1);
  const totalScrollScreens = Number((totalHeightPx / Math.max(1, screenHeightPx)).toFixed(1));
  const estimatedReadSeconds = Math.round(cutCount * preset.avgSecondsPerCut);

  const pacingTempoLabelKo =
    avgGutterPx >= 200
      ? "서스펜스 롱 호흡"
      : avgGutterPx <= 105
        ? "초고속 몰입 템포"
        : avgCutHeightPx >= 980
          ? "감정 여운 템포"
          : "균형 표준 리듬";

  const endTime = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    genre: input.genre,
    preset,
    episodeTitle: input.episodeTitle?.trim() || `${input.episodeNumber ?? 1}화 세로 스크롤 콘티`,
    episodeNumber: input.episodeNumber ?? 1,
    canvasWidthPx,
    cutCount,
    totalHeightPx,
    estimatedReadSeconds,
    generatedInMs: Number(Math.max(0.01, endTime - startTime).toFixed(2)),
    acts,
    cuts,
    climaxCutIndices,
    metrics: {
      totalScrollScreens,
      avgCutHeightPx,
      avgGutterPx,
      fullBleedCount,
      bubbleZoneCount,
      pacingTempoLabelKo,
    },
  };
}

/**
 * 개별 컷의 높이·여백을 조정하고 뒤따르는 컷들의 Y 좌표를 즉시 재계산한다.
 */
export function updateGenreSkeletonCut(
  plan: GenreSkeletonPlan,
  cutIndex: number,
  patch: { readonly heightPx?: number; readonly gutterAfterPx?: number; readonly fullBleed?: boolean },
): GenreSkeletonPlan {
  let cursorY = 0;
  const nextCuts = plan.cuts.map((cut, idx) => {
    const isTarget = cut.index === cutIndex;
    const heightPx =
      isTarget && patch.heightPx !== undefined
        ? Math.max(320, Math.min(3200, Math.round(patch.heightPx)))
        : cut.heightPx;
    const isLast = idx === plan.cuts.length - 1;
    const gutterAfterPx = isLast
      ? 0
      : isTarget && patch.gutterAfterPx !== undefined
        ? Math.max(0, Math.min(600, Math.round(patch.gutterAfterPx)))
        : cut.gutterAfterPx;
    const fullBleed = isTarget && patch.fullBleed !== undefined ? patch.fullBleed : cut.fullBleed;
    const safeMarginsPx = isTarget
      ? buildSafeMargins(plan.canvasWidthPx, heightPx, fullBleed)
      : cut.safeMarginsPx;
    const speechBubbleZones = isTarget
      ? buildSpeechBubbleZones({
          cutIndex: cut.index,
          genre: plan.genre,
          role: cut.role,
          widthPx: plan.canvasWidthPx,
          heightPx,
          safe: safeMarginsPx,
        })
      : cut.speechBubbleZones;

    const updated: GenreSkeletonCut = {
      ...cut,
      yPx: cursorY,
      heightPx,
      gutterAfterPx,
      fullBleed,
      safeMarginsPx,
      speechBubbleZones,
    };
    cursorY += heightPx + gutterAfterPx;
    return updated;
  });

  const totalHeightPx = cursorY;
  const fullBleedCount = nextCuts.filter((c) => c.fullBleed).length;
  const bubbleZoneCount = nextCuts.reduce((sum, c) => sum + c.speechBubbleZones.length, 0);
  const avgCutHeightPx = Math.round(
    nextCuts.reduce((sum, c) => sum + c.heightPx, 0) / Math.max(1, nextCuts.length),
  );
  const guttered = nextCuts.slice(0, -1);
  const avgGutterPx = Math.round(
    guttered.reduce((sum, c) => sum + c.gutterAfterPx, 0) / Math.max(1, guttered.length),
  );
  const screenHeightPx = Math.round(plan.canvasWidthPx * 2.1);

  return {
    ...plan,
    totalHeightPx,
    cuts: nextCuts,
    metrics: {
      ...plan.metrics,
      totalScrollScreens: Number((totalHeightPx / Math.max(1, screenHeightPx)).toFixed(1)),
      avgCutHeightPx,
      avgGutterPx,
      fullBleedCount,
      bubbleZoneCount,
    },
  };
}

/**
 * 회차 기획(EpisodePlanWithSynopsis)의 전환점(turningPoints)으로 연결할 4막 요약을 만든다.
 */
export function deriveEpisodePlanTurningPoints(plan: GenreSkeletonPlan): readonly string[] {
  return plan.acts.map((act) => {
    const climaxNote =
      act.id === "jeon" && plan.climaxCutIndices.length > 0
        ? ` · 클라이맥스 전면 컷 #${plan.climaxCutIndices.join(", #")}`
        : "";
    return `[${act.labelKo} · ${act.startCutIndex}~${act.endCutIndex}컷] ${act.intentKo}${climaxNote}`;
  });
}

/**
 * 한국어 텍스트 콘티 골격 문서를 생성한다.
 */
export function formatGenreSkeletonTextConti(plan: GenreSkeletonPlan): string {
  const lines: string[] = [
    `# ${plan.episodeTitle} — ${plan.preset.labelKo} ${plan.cutCount}컷 세로 스크롤 골격`,
    `규격: 폭 ${plan.canvasWidthPx}px × 총 세로 ${plan.totalHeightPx.toLocaleString("ko-KR")}px (모바일 약 ${plan.metrics.totalScrollScreens}화면 · 예상 독서 ${plan.estimatedReadSeconds}초)`,
    `리듬 요약: ${plan.preset.signatureRhythmKo}`,
    "",
  ];

  for (const act of plan.acts) {
    lines.push(
      `## ${act.labelKo} (${act.startCutIndex}~${act.endCutIndex}컷 · ${act.cutCount}컷 · 평균 컷 ${act.avgCutHeightPx}px / 여백 ${act.avgGutterPx}px)`,
    );
    lines.push(`의도: ${act.intentKo}`);
    for (const cut of plan.cuts.slice(act.startCutIndex - 1, act.endCutIndex)) {
      const bleedTag = cut.fullBleed ? "[전면 컷]" : "[일반 컷]";
      const bubbles = cut.speechBubbleZones
        .map((b) => `${b.labelKo}(최대 ${b.maxCharsRecommended}자)`)
        .join(" / ");
      lines.push(
        `- ${String(cut.index).padStart(2, "0")}컷 ${bleedTag} ${cut.labelKo} | 높이 ${cut.heightPx}px · 아래 여백 ${cut.gutterAfterPx}px | ${cut.recommendedShotKo} | 말풍선: ${bubbles}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function escapeSvgText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 세로 스크롤 리듬 맵 SVG를 생성한다(클라이맥스 전면 컷·여백·말풍선 안전영역 시각화).
 */
export function buildGenreSkeletonSvgPreview(
  plan: GenreSkeletonPlan,
  maxPreviewCuts = 60,
): string {
  const previewCuts = plan.cuts.slice(0, Math.max(1, maxPreviewCuts));
  const scale = 0.08;
  const padX = 24;
  const headerH = 56;
  const svgW = Math.round(plan.canvasWidthPx * scale) + padX * 2 + 120;

  let yCursor = headerH;
  const bodyParts: string[] = [];

  for (const cut of previewCuts) {
    const h = Math.max(16, Math.round(cut.heightPx * scale));
    const g = Math.max(0, Math.round(cut.gutterAfterPx * scale));
    const w = Math.round(plan.canvasWidthPx * scale);
    const fill = cut.fullBleed ? "oklch(0.32 0.09 275)" : "oklch(0.24 0.015 265)";
    const stroke = cut.fullBleed ? "oklch(0.75 0.14 275)" : "oklch(0.45 0.02 265)";

    bodyParts.push(
      `<rect x="${padX}" y="${yCursor}" width="${w}" height="${h}" rx="${cut.fullBleed ? 2 : 4}" fill="${fill}" stroke="${stroke}" stroke-width="${cut.fullBleed ? 1.5 : 1}" />`,
    );

    for (const box of cut.speechBubbleZones) {
      const bx = padX + Math.round(box.xPx * scale);
      const by = yCursor + Math.round((box.yPx / Math.max(1, cut.heightPx)) * h);
      const bw = Math.max(10, Math.round(box.widthPx * scale));
      const bh = Math.max(6, Math.round((box.heightPx / Math.max(1, cut.heightPx)) * h));
      bodyParts.push(
        `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="oklch(0.82 0.11 200 / 0.28)" stroke="oklch(0.82 0.11 200)" stroke-width="0.75" stroke-dasharray="2 2" />`,
      );
    }

    bodyParts.push(
      `<text x="${padX + w + 10}" y="${yCursor + 12}" fill="oklch(0.88 0.01 265)" font-size="9" font-family="sans-serif">#${cut.index} ${escapeSvgText(cut.labelKo)} (${cut.heightPx}px)</text>`,
    );

    yCursor += h + g;
  }

  const svgH = yCursor + 24;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="${escapeSvgText(`${plan.preset.labelKo} ${plan.cutCount}컷 세로 스크롤 리듬 맵`)}">`,
    `<rect width="${svgW}" height="${svgH}" fill="oklch(0.15 0.012 265)" />`,
    `<text x="${padX}" y="24" fill="oklch(0.95 0.01 265)" font-size="12" font-weight="700" font-family="sans-serif">${escapeSvgText(plan.episodeTitle)}</text>`,
    `<text x="${padX}" y="42" fill="oklch(0.74 0.015 265)" font-size="10" font-family="sans-serif">${escapeSvgText(`${plan.preset.labelKo} · ${plan.cutCount}컷 · 총 ${plan.totalHeightPx.toLocaleString("ko-KR")}px`)}</text>`,
    ...bodyParts,
    "</svg>",
  ].join("");
}

const STORAGE_PREFIX = "toonstudio:genre-skeleton-pro:v1:";

export interface SavedGenreSkeletonSettings {
  readonly genre: GenreSkeletonId;
  readonly targetCutCount: number;
  readonly canvasWidthPx: number;
  readonly includeCliffhanger: boolean;
}

export function loadGenreSkeletonSettings(
  storage: Storage | null | undefined,
  projectId: string,
): SavedGenreSkeletonSettings | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    const genre = GENRE_SKELETON_IDS.find((id) => id === rec.genre);
    if (!genre) return null;
    return {
      genre,
      targetCutCount: clampCutCount(
        typeof rec.targetCutCount === "number" ? rec.targetCutCount : undefined,
      ),
      canvasWidthPx: clampCanvasWidth(
        typeof rec.canvasWidthPx === "number" ? rec.canvasWidthPx : undefined,
      ),
      includeCliffhanger:
        typeof rec.includeCliffhanger === "boolean" ? rec.includeCliffhanger : true,
    };
  } catch {
    return null;
  }
}

export function saveGenreSkeletonSettings(
  storage: Storage | null | undefined,
  projectId: string,
  settings: SavedGenreSkeletonSettings,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
