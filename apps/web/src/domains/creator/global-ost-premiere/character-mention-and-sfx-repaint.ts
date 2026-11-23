/**
 * @캐릭터 바이블 일관성 멘션 엔진 + Vizcom/Krea 실시간 렌더 미러 + 글로벌 20개국 SFX 리페인팅 계획기.
 */

import {
  DEFAULT_CHARACTER_BIBLE_ENTRIES,
  DEFAULT_SFX_REPAINT_SOURCES,
  GLOBAL_20_LOCALIZATION_LOCALES,
  GLOBAL_OST_PREMIERE_SPRITE_PATHS,
  type CharacterBibleEntry,
  type CharacterProportionLock,
  type CharacterSignatureSwatch,
  type GlobalLocaleCode,
  type GlobalLocaleSfxProfile,
  type PaletteSwatchTokenId,
  type SfxBoundsPx,
  type SfxBubbleSourceItem,
  type SfxSoundCategory,
  type WritingDirection,
  type WritingModeSpec,
} from "./global-sfx-and-bible-catalog";

export {
  DEFAULT_CHARACTER_BIBLE_ENTRIES,
  DEFAULT_SFX_REPAINT_SOURCES,
  GLOBAL_20_LOCALIZATION_LOCALES,
  GLOBAL_OST_PREMIERE_SPRITE_PATHS,
  type CharacterBibleEntry,
  type CharacterProportionLock,
  type CharacterSignatureSwatch,
  type GlobalLocaleCode,
  type GlobalLocaleSfxProfile,
  type PaletteSwatchTokenId,
  type SfxBoundsPx,
  type SfxBubbleSourceItem,
  type SfxSoundCategory,
  type WritingDirection,
  type WritingModeSpec,
};

export type RenderInfluenceStageId = "sketch-strict" | "line-balanced" | "finish-expressive";

export type LiveMirrorCompareMode = "split-side-by-side" | "slider-wipe" | "onion-diff";

export interface RealtimeRenderMirrorState {
  readonly renderInfluence: number;
  readonly stageId: RenderInfluenceStageId;
  readonly stageLabelKo: string;
  readonly sketchPreservationPercent: number;
  readonly aiFinishWeightPercent: number;
  readonly lineLockStrictnessKo: string;
  readonly mirrorMode: LiveMirrorCompareMode;
  readonly leftPaneLabelKo: string;
  readonly rightPaneLabelKo: string;
  readonly splitRatioPercent: number;
  readonly estimatedFrameLatencyMs: number;
  readonly syncStatusKo: string;
}

export interface ResolvedCharacterMention {
  readonly rawToken: string;
  readonly handle: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly entry: CharacterBibleEntry;
  readonly lockedTokensKo: readonly string[];
  readonly consistencyLockPrompt: string;
}

export interface CharacterBibleMentionResolution {
  readonly sourceText: string;
  readonly mentions: readonly ResolvedCharacterMention[];
  readonly uniqueEntries: readonly CharacterBibleEntry[];
  readonly unresolvedHandles: readonly string[];
  readonly compiledPrompt: string;
  readonly consistencyScore: number;
  readonly mirrorState: RealtimeRenderMirrorState;
  readonly warningsKo: readonly string[];
}

export interface ResolveCharacterBibleOptions {
  readonly bible?: readonly CharacterBibleEntry[];
  readonly renderInfluence?: number;
  readonly mirrorMode?: LiveMirrorCompareMode;
  readonly splitRatioPercent?: number;
}

export interface InpaintMaskSpecPx extends SfxBoundsPx {
  readonly featherPx: number;
}

export interface LocalizedSfxRepaintItem {
  readonly sourceId: string;
  readonly kind: "dialogue" | "handwritten-sfx";
  readonly localizedText: string;
  readonly direction: WritingDirection;
  readonly writingMode: WritingModeSpec;
  readonly adjustedBubbleBoundsPx: SfxBoundsPx;
  readonly inpaintMaskPx: InpaintMaskSpecPx | null;
  readonly inpaintAreaPx2: number;
  readonly requiresManualArtCheck: boolean;
  readonly layoutGuidanceKo: string;
}

export interface GlobalSfxRepaintLocalePlan {
  readonly locale: GlobalLocaleSfxProfile;
  readonly canvasWidthPx: number;
  readonly items: readonly LocalizedSfxRepaintItem[];
  readonly totalInpaintAreaPx2: number;
  readonly estimatedRepaintSeconds: number;
  readonly bubbleWidthScalePercent: number;
  readonly rtlMirrored: boolean;
  readonly verticalTypeset: boolean;
  readonly qaChecklistKo: readonly string[];
}

export interface GlobalSfxRepaintBatchPlan {
  readonly canvasWidthPx: number;
  readonly sourceItemCount: number;
  readonly supportedCountryCount: 20;
  readonly plans: readonly GlobalSfxRepaintLocalePlan[];
  readonly totalEstimatedSeconds: number;
  readonly summaryKo: string;
}

const KOREAN_TRAILING_PARTICLES = [
  "에게는", "한테는", "에게서", "한테서", "처럼", "까지", "부터", "에게",
  "한테", "에서", "으로", "은", "는", "이", "가", "을", "를", "의", "와", "과", "도", "만", "로",
] as const;

const LOCALE_PROFILE_BY_CODE: Readonly<Record<GlobalLocaleCode, GlobalLocaleSfxProfile>> =
  Object.fromEntries(GLOBAL_20_LOCALIZATION_LOCALES.map((p) => [p.code, p])) as Readonly<
    Record<GlobalLocaleCode, GlobalLocaleSfxProfile>
  >;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeHandleCandidate(raw: string): string {
  return raw.trim().toLowerCase();
}

function findBibleEntryForHandle(
  rawHandle: string,
  bible: readonly CharacterBibleEntry[],
): { readonly entry: CharacterBibleEntry; readonly matchedHandle: string } | null {
  const candidates: string[] = [rawHandle];
  for (const particle of KOREAN_TRAILING_PARTICLES) {
    if (rawHandle.length > particle.length && rawHandle.endsWith(particle)) {
      candidates.push(rawHandle.slice(0, rawHandle.length - particle.length));
    }
  }
  for (const candidate of candidates) {
    const normalized = normalizeHandleCandidate(candidate);
    for (const entry of bible) {
      if (normalizeHandleCandidate(entry.mentionHandle) === normalized) {
        return { entry, matchedHandle: entry.mentionHandle };
      }
      if (entry.aliases.some((alias) => normalizeHandleCandidate(alias) === normalized)) {
        return { entry, matchedHandle: entry.mentionHandle };
      }
    }
  }
  return null;
}

/** Vizcom식 단일 렌더 영향도(0~100)와 Krea식 좌/우 실시간 미러 상태를 계산한다. */
export function buildRealtimeRenderMirrorState(input: {
  readonly renderInfluence: number;
  readonly mirrorMode?: LiveMirrorCompareMode;
  readonly splitRatioPercent?: number;
  readonly lockedCharacterCount?: number;
}): RealtimeRenderMirrorState {
  const renderInfluence = Math.round(clampNumber(input.renderInfluence, 0, 100));
  const splitRatioPercent = Math.round(clampNumber(input.splitRatioPercent ?? 50, 15, 85));
  const mirrorMode: LiveMirrorCompareMode = input.mirrorMode ?? "split-side-by-side";
  const lockedCount = Math.max(0, Math.round(input.lockedCharacterCount ?? 0));

  let stageId: RenderInfluenceStageId = "line-balanced";
  let stageLabelKo = "선화·채색 균형 미러";
  let lineLockStrictnessKo = "원화 선화 65% 보존 + 바이블 팔레트 자동 광원 보정";

  if (renderInfluence <= 35) {
    stageId = "sketch-strict";
    stageLabelKo = "원화 선화 최우선 고정";
    lineLockStrictnessKo = "작가 펜선 윤곽 85%+ 강제 보존 · 밑색과 톤만 보조";
  } else if (renderInfluence >= 70) {
    stageId = "finish-expressive";
    stageLabelKo = "채색·광원 밀도 확장";
    lineLockStrictnessKo = "VRM 실루엣·얼굴 비율은 잠그고 명암·재질 밀도를 강화";
  }

  const estimatedFrameLatencyMs = Math.round(42 + renderInfluence * 0.48 + lockedCount * 14);
  const modeLabelKo =
    mirrorMode === "split-side-by-side"
      ? "좌/우 나란히 미러"
      : mirrorMode === "slider-wipe"
        ? `경계 슬라이더 ${splitRatioPercent}% 비교`
        : "어니언 스킨 윤곽 오차 비교";

  return {
    renderInfluence,
    stageId,
    stageLabelKo,
    sketchPreservationPercent: 100 - renderInfluence,
    aiFinishWeightPercent: renderInfluence,
    lineLockStrictnessKo,
    mirrorMode,
    leftPaneLabelKo: "좌측 · 작가 원화 스케치",
    rightPaneLabelKo: "우측 · 실시간 렌더 미러",
    splitRatioPercent,
    estimatedFrameLatencyMs,
    syncStatusKo: `${modeLabelKo} · 렌더 영향도 ${renderInfluence}% · 추정 프레임 지연 ${estimatedFrameLatencyMs}ms`,
  };
}

/** 대본/프롬프트 속 `@캐릭터명` 멘션을 파싱해 바이블 일관성 락과 실시간 미러 상태를 산출한다. */
export function resolveCharacterBibleMentions(
  scriptOrPrompt: string,
  options: ResolveCharacterBibleOptions = {},
): CharacterBibleMentionResolution {
  const bible = options.bible ?? DEFAULT_CHARACTER_BIBLE_ENTRIES;
  const mentions: ResolvedCharacterMention[] = [];
  const unresolvedSet = new Set<string>();
  const uniqueMap = new Map<string, CharacterBibleEntry>();
  const pattern = /@([가-힣A-Za-z0-9_-]+)/gu;

  for (const match of scriptOrPrompt.matchAll(pattern)) {
    const startIndex = match.index ?? 0;
    const prevChar = startIndex > 0 ? scriptOrPrompt[startIndex - 1] ?? "" : "";
    if (/[A-Za-z0-9._-]/u.test(prevChar)) continue;

    const rawToken = match[0];
    const rawHandle = match[1] ?? "";
    const resolved = findBibleEntryForHandle(rawHandle, bible);
    if (!resolved) {
      unresolvedSet.add(rawHandle);
      continue;
    }

    const { entry } = resolved;
    uniqueMap.set(entry.id, entry);
    const paletteText = entry.signaturePalette.map((s) => `${s.roleKo}:${s.colorNameKo}`).join(", ");
    const lockedTokensKo = [
      `머리: ${entry.hairColorKo} (${entry.hairStyleKo})`,
      `의상: ${entry.outfitSummaryKo}`,
      `팔레트: ${paletteText}`,
      `VRM: ${entry.vrmAssetId}`,
      `비율 락: ${entry.proportionLock.lockSummaryKo}`,
    ];
    const consistencyLockPrompt =
      `[@${entry.mentionHandle} → ${entry.displayNameKo} | VRM:${entry.vrmAssetId} | ` +
      `머리:${entry.hairColorKo} | 의상:${entry.outfitSummaryKo} | ${entry.proportionLock.lockSummaryKo}]`;

    mentions.push({
      rawToken,
      handle: entry.mentionHandle,
      startIndex,
      endIndex: startIndex + rawToken.length,
      entry,
      lockedTokensKo,
      consistencyLockPrompt,
    });
  }

  const uniqueEntries = [...uniqueMap.values()];
  const unresolvedHandles = [...unresolvedSet];
  const mirrorState = buildRealtimeRenderMirrorState({
    renderInfluence: options.renderInfluence ?? 42,
    mirrorMode: options.mirrorMode ?? "split-side-by-side",
    splitRatioPercent: options.splitRatioPercent ?? 50,
    lockedCharacterCount: uniqueEntries.length,
  });

  const lockFooter =
    uniqueEntries.length > 0
      ? uniqueEntries
          .map(
            (entry) =>
              `#${entry.mentionHandle}[vrm=${entry.vrmAssetId}, ratio=${entry.proportionLock.headToBodyRatio}, hair="${entry.hairColorKo}", outfit="${entry.outfitSummaryKo}"]`,
          )
          .join(" ; ")
      : "고정된 캐릭터 바이블 없음";

  const compiledPrompt =
    `${scriptOrPrompt.trim()}\n` +
    `[바이블 일관성 락: ${lockFooter} | 렌더 영향도=${mirrorState.renderInfluence}% | 원화보존=${mirrorState.sketchPreservationPercent}%]`;

  const warningsKo: string[] = [];
  if (unresolvedHandles.length > 0) {
    warningsKo.push(
      `미등록 멘션 ${unresolvedHandles.map((h) => `@${h}`).join(", ")}을 바이블에 추가하면 컷 간 외형 이탈을 막을 수 있습니다.`,
    );
  }
  if (uniqueEntries.length === 0) {
    warningsKo.push("대본에 @유진, @세라처럼 @캐릭터명을 넣으면 머리색·의상·VRM 비율이 자동 고정됩니다.");
  }
  if (mirrorState.renderInfluence > 75 && uniqueEntries.length > 0) {
    warningsKo.push("렌더 영향도가 75%를 넘어 세부 표정선이 변형될 수 있습니다. 35~60% 구간을 권장합니다.");
  }

  const baseScore = uniqueEntries.length > 0 ? 96 : 58;
  const unresolvedPenalty = unresolvedHandles.length * 14;
  const influencePenalty = mirrorState.renderInfluence > 75 ? Math.round((mirrorState.renderInfluence - 75) * 0.6) : 0;
  const consistencyScore = Math.round(clampNumber(baseScore - unresolvedPenalty - influencePenalty, 25, 100));

  return {
    sourceText: scriptOrPrompt,
    mentions,
    uniqueEntries,
    unresolvedHandles,
    compiledPrompt,
    consistencyScore,
    mirrorState,
    warningsKo,
  };
}

export function getGlobalLocaleProfile(code: GlobalLocaleCode): GlobalLocaleSfxProfile {
  return LOCALE_PROFILE_BY_CODE[code];
}

/** 글로벌 20개국 원클릭 SFX 리페인팅 & 말풍선 레이아웃·인페인팅 영역을 계산한다. */
export function planGlobalSfxRepaint(input: {
  readonly canvasWidthPx?: number;
  readonly items?: readonly SfxBubbleSourceItem[];
  readonly targetLocales: readonly GlobalLocaleCode[];
}): GlobalSfxRepaintBatchPlan {
  const canvasWidthPx = Math.round(clampNumber(input.canvasWidthPx ?? 800, 360, 2400));
  const items = input.items && input.items.length > 0 ? input.items : DEFAULT_SFX_REPAINT_SOURCES;
  const uniqueLocales = [...new Set(input.targetLocales)];
  const activeLocales: readonly GlobalLocaleCode[] =
    uniqueLocales.length > 0 ? uniqueLocales : ["en-US", "ja-JP", "ar-SA", "es-ES"];

  const plans: GlobalSfxRepaintLocalePlan[] = activeLocales.map((code) => {
    const profile = getGlobalLocaleProfile(code);
    const verticalTypeset = profile.writingMode === "vertical-rl";
    const rtlMirrored = profile.direction === "rtl";

    const localizedItems: LocalizedSfxRepaintItem[] = items.map((item) => {
      const safeOverlap = clampNumber(item.strokeOverlapRatio, 0, 1);
      const maxBubbleWidth = Math.max(120, canvasWidthPx - 48);

      let adjustedWidth = Math.round(
        clampNumber(item.boundsPx.width * profile.textExpansionFactor, 96, maxBubbleWidth),
      );
      let adjustedHeight = Math.round(
        Math.max(64, item.boundsPx.height * (profile.lineHeightMultiplier / 1.3)),
      );

      if (verticalTypeset) {
        adjustedWidth = Math.round(clampNumber(item.boundsPx.height * 0.9, 88, maxBubbleWidth));
        adjustedHeight = Math.round(
          Math.max(140, item.boundsPx.width * Math.max(0.88, profile.textExpansionFactor)),
        );
      }

      const rawX = rtlMirrored
        ? canvasWidthPx - (item.boundsPx.x + adjustedWidth)
        : item.boundsPx.x;
      const adjustedX = Math.round(clampNumber(rawX, 16, Math.max(16, canvasWidthPx - adjustedWidth - 16)));
      const adjustedY = Math.max(0, Math.round(item.boundsPx.y));

      let inpaintMaskPx: InpaintMaskSpecPx | null = null;
      let inpaintAreaPx2 = 0;

      if (item.kind === "handwritten-sfx" && profile.code !== "ko-KR") {
        const padPx = Math.round(12 + safeOverlap * 20);
        const maskW = Math.min(canvasWidthPx, Math.round(item.boundsPx.width + padPx * 2));
        const maskH = Math.round(item.boundsPx.height + padPx * 2);
        inpaintMaskPx = {
          x: Math.max(0, Math.round(item.boundsPx.x - padPx)),
          y: Math.max(0, Math.round(item.boundsPx.y - padPx)),
          width: maskW,
          height: maskH,
          featherPx: Math.round(6 + safeOverlap * 8),
        };
        inpaintAreaPx2 = maskW * maskH;
      }

      const localizedText =
        item.kind === "handwritten-sfx"
          ? profile.sampleSfxMap[item.sfxCategory ?? "impact"]
          : `[${profile.code}] ${item.sourceTextKo}`;

      const requiresManualArtCheck =
        item.kind === "handwritten-sfx" && safeOverlap >= 0.45 && profile.code !== "ko-KR";
      const layoutGuidanceKo =
        item.kind === "handwritten-sfx"
          ? inpaintMaskPx
            ? `원본 손글씨 제거(${inpaintMaskPx.width}×${inpaintMaskPx.height}px, 페더 ${inpaintMaskPx.featherPx}px) 후 ${profile.languageKo} 효과음 재채색`
            : "원본 한국어 레이어 유지 (추가 인페인팅 불필요)"
          : rtlMirrored
            ? `RTL 우→좌 미러링(x=${adjustedX}px) · 말풍선 폭 ${adjustedWidth}px`
            : verticalTypeset
              ? `세로쓰기(vertical-rl) 전환 · 폭 ${adjustedWidth}×높이 ${adjustedHeight}px`
              : `가로쓰기 말풍선 폭 ${adjustedWidth}px (${Math.round(profile.textExpansionFactor * 100)}% 보정)`;

      return {
        sourceId: item.id,
        kind: item.kind,
        localizedText,
        direction: profile.direction,
        writingMode: profile.writingMode,
        adjustedBubbleBoundsPx: { x: adjustedX, y: adjustedY, width: adjustedWidth, height: adjustedHeight },
        inpaintMaskPx,
        inpaintAreaPx2,
        requiresManualArtCheck,
        layoutGuidanceKo,
      };
    });

    const totalInpaintAreaPx2 = localizedItems.reduce((sum, item) => sum + item.inpaintAreaPx2, 0);
    const manualReviewCount = localizedItems.filter((item) => item.requiresManualArtCheck).length;
    const estimatedRepaintSeconds =
      profile.code === "ko-KR"
        ? 0
        : Math.max(2, Math.round(localizedItems.length * 1.4 + totalInpaintAreaPx2 / 32000));

    const qaChecklistKo: string[] = [
      `서체 권장: ${profile.recommendedFontStackKo}`,
      profile.sfxStyleNoteKo,
    ];
    if (rtlMirrored) qaChecklistKo.push("RTL 컷 시선 이동(우→좌) 및 말풍선 꼬리 방향 자동 반전 확인");
    if (verticalTypeset) qaChecklistKo.push("세로쓰기 느낌표·말줄임표 회전 및 말풍선 세로 여백 검수");
    if (manualReviewCount > 0) {
      qaChecklistKo.push(`배경 겹침이 큰 손글씨 SFX ${manualReviewCount}건은 인페인팅 후 선화 보강 확인`);
    }

    return {
      locale: profile,
      canvasWidthPx,
      items: localizedItems,
      totalInpaintAreaPx2,
      estimatedRepaintSeconds,
      bubbleWidthScalePercent: Math.round(profile.textExpansionFactor * 100),
      rtlMirrored,
      verticalTypeset,
      qaChecklistKo,
    };
  });

  const totalEstimatedSeconds = plans.reduce((sum, plan) => sum + plan.estimatedRepaintSeconds, 0);
  const summaryKo =
    `${plans.length}개국(지원 총 20개국) 로컬라이징 계획 완료 · ` +
    `RTL ${plans.filter((p) => p.rtlMirrored).length}개국 · 세로쓰기 ${plans.filter((p) => p.verticalTypeset).length}개국 · ` +
    `예상 처리 ${totalEstimatedSeconds}초`;

  return {
    canvasWidthPx,
    sourceItemCount: items.length,
    supportedCountryCount: 20,
    plans,
    totalEstimatedSeconds,
    summaryKo,
  };
}
