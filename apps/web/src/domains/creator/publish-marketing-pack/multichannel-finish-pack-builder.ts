/**
 * 1화 완료 시 멀티채널 마감 번들 플래너 (축 30 · #149–#150).
 *
 * 100% 온디바이스(₩0) 순수·결정론 번들 빌더 (브라우저 스토리지 직접 호출 없음):
 * 1) 9:16 숏폼 티저 스토리보드 & 안전영역 가이드 포스터 SVG (1080×1920, Shorts/Reels/TikTok)
 * 2) 대표 썸네일 3종 자동 조판 & SVG 출력 (정사각 1:1 600×600 · 가로 배너 16:9 1280×720 · 세로 포스터 3:4 720×960)
 * 3) WCAG 2.1 AA 컷별 대체 텍스트(ALT) 팩 & 커버리지 검증
 * 4) Rights BOM 라이선스 출고 게이트 리포트 (상업 승인 / 출처 표기 필수 / 출고 차단 판정 + 체크섬)
 */

import {
  SHORTFORM_TEASER_HEIGHT_PX,
  SHORTFORM_TEASER_WIDTH_PX,
  fnv1aFinishPackDigest,
  renderRepresentativeThumbnailSvg,
  renderShortformTeaserPosterSvg,
  toFinishPackSvgDataUrl,
  trimFinishPackCopy,
} from "./multichannel-finish-pack-svg";

export {
  SHORTFORM_TEASER_HEIGHT_PX,
  SHORTFORM_TEASER_WIDTH_PX,
} from "./multichannel-finish-pack-svg";

export type ThumbnailVariantId = "square-1x1" | "banner-16x9" | "poster-3x4";
export type RightsBomAssetCategory = "font" | "brush" | "bg3d" | "texture" | "sfx" | "music";
export type RightsBomLicenseTier =
  | "commercial-cleared"
  | "cc-by-attribution"
  | "editorial-only"
  | "unverified";
export type RightsBomGateStatus = "approved" | "approved-with-credits" | "blocked";

export interface FinishPackCutSource {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly sceneSummaryKo: string;
  readonly dialogueText: string;
  readonly sfxText: string;
  readonly characterNames: readonly string[];
  readonly visualMoodKo: string;
  readonly tensionScore: number;
  readonly has3dBackground: boolean;
}

export interface RightsBomAssetInput {
  readonly assetId: string;
  readonly name: string;
  readonly category: RightsBomAssetCategory;
  readonly licenseTier: RightsBomLicenseTier;
  readonly sourceVendor: string;
  readonly commercialUseAllowed: boolean;
  readonly redistributableInExport: boolean;
  readonly attributionText?: string;
}

export interface MultichannelFinishPackInput {
  readonly projectId: string;
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly episodeTitle: string;
  readonly authorName: string;
  readonly genreTag: string;
  readonly loglineKo: string;
  readonly cuts: readonly FinishPackCutSource[];
  readonly assets: readonly RightsBomAssetInput[];
}

export interface ShortformTeaserBeat {
  readonly beatOrder: number;
  readonly role: "hook" | "build" | "climax" | "cta";
  readonly cutId: string | null;
  readonly startSec: number;
  readonly endSec: number;
  readonly durationSec: number;
  readonly cameraMotion: "slow-zoom-in" | "vertical-pan-down" | "impact-shake" | "fade-hold";
  readonly subtitleOverlayKo: string;
  readonly audioBeatCue: string;
}

export interface ShortformTeaser9x16Plan {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly aspectRatio: "9:16";
  readonly fps: 30;
  readonly totalDurationSec: number;
  readonly targetChannels: readonly ["YouTube Shorts", "Instagram Reels", "TikTok"];
  readonly safeZoneInsetPx: {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
  };
  readonly beats: readonly ShortformTeaserBeat[];
  readonly posterSvgMarkup: string;
  readonly posterSvgDataUrl: string;
}

export interface RepresentativeThumbnailArtifact {
  readonly variantId: ThumbnailVariantId;
  readonly labelKo: string;
  readonly channelUseKo: string;
  readonly aspectRatio: "1:1" | "16:9" | "3:4";
  readonly widthPx: number;
  readonly heightPx: number;
  readonly safeMarginPx: number;
  readonly selectedCutId: string;
  readonly selectedCutIndex: number;
  readonly headlineKo: string;
  readonly wcagContrastPass: true;
  readonly svgMarkup: string;
  readonly svgDataUrl: string;
  readonly fileName: string;
}

export interface WcagCutAltEntry {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly altTextKo: string;
  readonly charLength: number;
  readonly includesSpeakerOrAction: boolean;
  readonly wcagStatus: "pass" | "warning";
  readonly warningKo: string | null;
}

export interface WcagAltPackReport {
  readonly standard: "WCAG 2.1 AA";
  readonly totalCutCount: number;
  readonly passedCount: number;
  readonly warningCount: number;
  readonly coveragePercent: number;
  readonly complianceLevel: "AA" | "needs-review";
  readonly entries: readonly WcagCutAltEntry[];
  readonly manifestMarkdown: string;
}

export interface RightsBomAuditItem {
  readonly assetId: string;
  readonly name: string;
  readonly category: RightsBomAssetCategory;
  readonly sourceVendor: string;
  readonly licenseTier: RightsBomLicenseTier;
  readonly verdict: "cleared" | "attribution-required" | "blocked";
  readonly reasonKo: string;
  readonly creditLineKo: string | null;
}

export interface RightsBomReport {
  readonly projectId: string;
  readonly episodeNumber: number;
  readonly totalAssetCount: number;
  readonly clearedCount: number;
  readonly attributionRequiredCount: number;
  readonly blockedCount: number;
  readonly exportGateStatus: RightsBomGateStatus;
  readonly exportAllowed: boolean;
  readonly compiledCreditsKo: readonly string[];
  readonly blockingReasonsKo: readonly string[];
  readonly items: readonly RightsBomAuditItem[];
  readonly manifestChecksum: string;
  readonly bomJson: string;
}

export interface FinishPackDeliverableFile {
  readonly fileName: string;
  readonly channelKo: string;
  readonly mimeType: string;
  readonly estimatedBytes: number;
  readonly ready: boolean;
}

export interface MultichannelFinishPackBundle {
  readonly projectId: string;
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly shortformTeaser9x16: ShortformTeaser9x16Plan;
  readonly thumbnails: readonly [
    RepresentativeThumbnailArtifact,
    RepresentativeThumbnailArtifact,
    RepresentativeThumbnailArtifact,
  ];
  readonly wcagAltPack: WcagAltPackReport;
  readonly rightsBomReport: RightsBomReport;
  readonly deliverableFiles: readonly FinishPackDeliverableFile[];
  readonly readinessScore: number;
  readonly bundleExportAllowed: boolean;
  readonly bundleManifestJson: string;
}

/** 1화 대표 샘플 멀티채널 마감 팩 입력 생성기. */
export function createDefaultMultichannelFinishPackInput(
  projectId: string,
  seriesTitle = "밤의 우편배달부",
  episodeNumber = 1,
): MultichannelFinishPackInput {
  return {
    projectId,
    seriesTitle,
    episodeNumber,
    episodeTitle: `${episodeNumber}화 · 빗속의 미배달 편지`,
    authorName: "스튜디오 작가",
    genreTag: "미스터리 · 어반 판타지",
    loglineKo: "자정 우체국에서 사라진 13번째 편지가 주인공의 이름을 부른다.",
    cuts: [
      {
        cutId: "cut-001",
        cutIndex: 1,
        sceneSummaryKo: "네온 빗방울이 떨어지는 서울 구도심 야간 골목과 붉은 우체통 전경",
        dialogueText: "비가 그치기 전에 이 편지부터 전해야 해.",
        sfxText: "쏴아아",
        characterNames: ["서준"],
        visualMoodKo: "차가운 청남색 야경과 붉은 우체통 대비",
        tensionScore: 76,
        has3dBackground: true,
      },
      {
        cutId: "cut-008",
        cutIndex: 8,
        sceneSummaryKo: "오래된 봉투의 밀랍 인장이 붉게 빛나며 주인공 얼굴을 비추는 클로즈업",
        dialogueText: "받는 사람 이름이… 내 이름이라고?",
        sfxText: "두근",
        characterNames: ["서준"],
        visualMoodKo: "긴장감 높은 저조도 클로즈업",
        tensionScore: 88,
        has3dBackground: false,
      },
      {
        cutId: "cut-019",
        cutIndex: 19,
        sceneSummaryKo: "우체국 시계탑 문이 열리며 낯선 조력자가 그림자 속에서 등장하는 하이앵글",
        dialogueText: "서준 씨, 그 편지는 절대 열면 안 돼요!",
        sfxText: "철컥",
        characterNames: ["유나", "서준"],
        visualMoodKo: "역광 실루엣과 높은 대비",
        tensionScore: 95,
        has3dBackground: true,
      },
      {
        cutId: "cut-024",
        cutIndex: 24,
        sceneSummaryKo: "공중으로 흩날리는 수십 장의 편지와 다음 화를 예고하는 마지막 컷",
        dialogueText: "이미 늦었어. 배달은 시작됐으니까.",
        sfxText: "휘잉",
        characterNames: ["서준"],
        visualMoodKo: "역동적인 대각선 구도와 림라이트",
        tensionScore: 92,
        has3dBackground: true,
      },
    ],
    assets: [
      {
        assetId: "font-pretendard-std",
        name: "Pretendard (SIL OFL 1.1)",
        category: "font",
        licenseTier: "commercial-cleared",
        sourceVendor: "Pretendard Open Source",
        commercialUseAllowed: true,
        redistributableInExport: true,
      },
      {
        assetId: "brush-maru-pro-v2",
        name: "ToonStudio 마루펜 프로 브러시",
        category: "brush",
        licenseTier: "commercial-cleared",
        sourceVendor: "ToonStudio Core Pack",
        commercialUseAllowed: true,
        redistributableInExport: true,
      },
      {
        assetId: "bg3d-seoul-alley-pack",
        name: "서울 구도심 야간 골목 3D 세트",
        category: "bg3d",
        licenseTier: "cc-by-attribution",
        sourceVendor: "Atelier3D Commons",
        commercialUseAllowed: true,
        redistributableInExport: true,
        attributionText: "3D 배경: 서울 구도심 야간 골목 세트 by Atelier3D Commons (CC-BY 4.0)",
      },
      {
        assetId: "tex-cotton-paper-04",
        name: "황마지 수채 종이 입자 텍스처",
        category: "texture",
        licenseTier: "commercial-cleared",
        sourceVendor: "ToonStudio Texture Lab",
        commercialUseAllowed: true,
        redistributableInExport: true,
      },
    ],
  };
}

/** ① 9:16 숏폼 티저 스토리보드 & 포스터 SVG 플래너. */
export function buildShortformTeaser9x16Plan(
  input: MultichannelFinishPackInput,
): ShortformTeaser9x16Plan {
  const ranked = [...input.cuts].sort(
    (a, b) => b.tensionScore - a.tensionScore || a.cutIndex - b.cutIndex,
  );
  const openerCut = input.cuts[0] ?? null;
  const climaxCut = ranked[0] ?? openerCut;
  const buildCut = ranked.find((cut) => cut.cutId !== climaxCut?.cutId) ?? openerCut;

  const beats: ShortformTeaserBeat[] = [
    Object.freeze({
      beatOrder: 1,
      role: "hook",
      cutId: openerCut?.cutId ?? null,
      startSec: 0,
      endSec: 3.5,
      durationSec: 3.5,
      cameraMotion: "slow-zoom-in",
      subtitleOverlayKo: trimFinishPackCopy(openerCut?.dialogueText || input.loglineKo, 38),
      audioBeatCue: openerCut?.sfxText ? `SFX 임팩트 (${openerCut.sfxText})` : "저음 드롭 인트로",
    }),
    Object.freeze({
      beatOrder: 2,
      role: "build",
      cutId: buildCut?.cutId ?? null,
      startSec: 3.5,
      endSec: 8.5,
      durationSec: 5.0,
      cameraMotion: "vertical-pan-down",
      subtitleOverlayKo: trimFinishPackCopy(
        buildCut?.dialogueText || buildCut?.sceneSummaryKo || input.episodeTitle,
        38,
      ),
      audioBeatCue: buildCut?.sfxText ? `리듬 전환 (${buildCut.sfxText})` : "심장 박동 빌드업",
    }),
    Object.freeze({
      beatOrder: 3,
      role: "climax",
      cutId: climaxCut?.cutId ?? null,
      startSec: 8.5,
      endSec: 14.0,
      durationSec: 5.5,
      cameraMotion: "impact-shake",
      subtitleOverlayKo: trimFinishPackCopy(climaxCut?.dialogueText || input.episodeTitle, 38),
      audioBeatCue: climaxCut?.sfxText ? `피크 컷 (${climaxCut.sfxText})` : "클라이맥스 브레이크",
    }),
    Object.freeze({
      beatOrder: 4,
      role: "cta",
      cutId: null,
      startSec: 14.0,
      endSec: 17.5,
      durationSec: 3.5,
      cameraMotion: "fade-hold",
      subtitleOverlayKo: `${input.seriesTitle} ${input.episodeNumber}화 지금 바로 감상`,
      audioBeatCue: "로고 스팅 아웃트로",
    }),
  ];

  const posterSvgMarkup = renderShortformTeaserPosterSvg({
    seriesTitle: input.seriesTitle,
    episodeNumber: input.episodeNumber,
    hookCopyKo: beats[0]?.subtitleOverlayKo || input.loglineKo,
    climaxCopyKo: beats[2]?.subtitleOverlayKo || input.episodeTitle,
  });

  return Object.freeze({
    widthPx: SHORTFORM_TEASER_WIDTH_PX,
    heightPx: SHORTFORM_TEASER_HEIGHT_PX,
    aspectRatio: "9:16",
    fps: 30,
    totalDurationSec: 17.5,
    targetChannels: Object.freeze(["YouTube Shorts", "Instagram Reels", "TikTok"] as const),
    safeZoneInsetPx: Object.freeze({ top: 210, bottom: 450, left: 64, right: 176 }),
    beats: Object.freeze(beats),
    posterSvgMarkup,
    posterSvgDataUrl: toFinishPackSvgDataUrl(posterSvgMarkup),
  });
}

/** ② 대표 썸네일 3종 (정사각 1:1 · 가로 배너 16:9 · 세로 포스터 3:4) 자동 생성. */
export function buildRepresentativeThumbnails3(
  input: MultichannelFinishPackInput,
): readonly [
  RepresentativeThumbnailArtifact,
  RepresentativeThumbnailArtifact,
  RepresentativeThumbnailArtifact,
] {
  const cuts = input.cuts;
  const sortedByTension = [...cuts].sort(
    (a, b) => b.tensionScore - a.tensionScore || a.cutIndex - b.cutIndex,
  );
  const closeupCut = sortedByTension.find((cut) => !cut.has3dBackground) ?? sortedByTension[0] ?? cuts[0];
  const wideCut = cuts.find((cut) => cut.has3dBackground) ?? cuts[0];
  const climaxCut = sortedByTension[0] ?? cuts[0];

  const makeThumb = (
    variantId: ThumbnailVariantId,
    labelKo: string,
    channelUseKo: string,
    aspectRatio: "1:1" | "16:9" | "3:4",
    widthPx: number,
    heightPx: number,
    safeMarginPx: number,
    cut: FinishPackCutSource | undefined,
    accentHex: string,
  ): RepresentativeThumbnailArtifact => {
    const svgMarkup = renderRepresentativeThumbnailSvg({
      widthPx,
      heightPx,
      safeMarginPx,
      badgeKo: `${input.genreTag} · EP.${input.episodeNumber}`,
      titleKo: input.seriesTitle,
      subtitleKo: cut?.dialogueText || input.loglineKo,
      accentHex,
    });
    return Object.freeze({
      variantId,
      labelKo,
      channelUseKo,
      aspectRatio,
      widthPx,
      heightPx,
      safeMarginPx,
      selectedCutId: cut?.cutId ?? "cut-001",
      selectedCutIndex: cut?.cutIndex ?? 1,
      headlineKo: `${input.seriesTitle} · ${input.episodeNumber}화`,
      wcagContrastPass: true,
      svgMarkup,
      svgDataUrl: toFinishPackSvgDataUrl(svgMarkup),
      fileName: `${input.projectId}-ep${input.episodeNumber}-thumb-${variantId}-${widthPx}x${heightPx}.svg`,
    });
  };

  return Object.freeze([
    makeThumb("square-1x1", "대표 정사각 썸네일 (1:1)", "네이버·카카오 작품 목록", "1:1", 600, 600, 48, closeupCut, "#74e2d8"),
    makeThumb("banner-16x9", "와이드 배너 썸네일 (16:9)", "홈 피처드 · 유튜브 · X 링크 카드", "16:9", 1280, 720, 64, wideCut, "#f2a65a"),
    makeThumb("poster-3x4", "세로 포스터 썸네일 (3:4)", "신작 카드 · 글로벌 플랫폼 표지", "3:4", 720, 960, 56, climaxCut, "#e57ca8"),
  ] as const);
}

/** ③ WCAG 2.1 AA 컷별 대체 텍스트(ALT) 팩 생성 및 검증. */
export function buildWcagAltPack(input: MultichannelFinishPackInput): WcagAltPackReport {
  const entries: WcagCutAltEntry[] = input.cuts.map((cut) => {
    const speakerPrefix =
      cut.characterNames.length > 0 ? `${cut.characterNames.join(", ")} 등장. ` : "";
    const scenePart = cut.sceneSummaryKo.trim();
    const moodPart = cut.visualMoodKo.trim() ? ` (${cut.visualMoodKo.trim()})` : "";
    const dialoguePart = cut.dialogueText.trim() ? ` 대사: "${cut.dialogueText.trim()}"` : "";
    const sfxPart = cut.sfxText.trim() ? ` 효과음: ${cut.sfxText.trim()}.` : "";

    const rawAlt = `${cut.cutIndex}컷: ${speakerPrefix}${scenePart}${moodPart}.${dialoguePart}${sfxPart}`
      .replace(/\s+/gu, " ")
      .replace(/\.{2,}/gu, ".")
      .trim();

    const charLength = rawAlt.length;
    const includesSpeakerOrAction = scenePart.length >= 6 || cut.dialogueText.trim().length > 0;
    let wcagStatus: "pass" | "warning" = "pass";
    let warningKo: string | null = null;

    if (!includesSpeakerOrAction || charLength < 20) {
      wcagStatus = "warning";
      warningKo = "장면 동작이나 대사 설명이 20자 미만으로 부족해요. 시각 정보를 보강하세요.";
    } else if (charLength > 200) {
      wcagStatus = "warning";
      warningKo = "대체 텍스트가 200자를 넘어 스크린리더 청취 피로가 커질 수 있어요.";
    }

    return Object.freeze({
      cutId: cut.cutId,
      cutIndex: cut.cutIndex,
      altTextKo: rawAlt,
      charLength,
      includesSpeakerOrAction,
      wcagStatus,
      warningKo,
    });
  });

  const totalCutCount = entries.length;
  const passedCount = entries.filter((entry) => entry.wcagStatus === "pass").length;
  const warningCount = totalCutCount - passedCount;

  return Object.freeze({
    standard: "WCAG 2.1 AA",
    totalCutCount,
    passedCount,
    warningCount,
    coveragePercent: totalCutCount === 0 ? 100 : Math.round((passedCount / totalCutCount) * 100),
    complianceLevel: warningCount === 0 ? "AA" : "needs-review",
    entries: Object.freeze(entries),
    manifestMarkdown: [
      `# WCAG 2.1 AA 대체 텍스트 팩 — ${input.seriesTitle} ${input.episodeNumber}화`,
      "",
      ...entries.map((entry) => `- **${entry.cutIndex}컷 (${entry.cutId})**: ${entry.altTextKo}`),
    ].join("\n"),
  });
}

/** ④ Rights BOM 라이선스 출고 게이트 리포트 감사기. */
export function buildRightsBomReport(input: MultichannelFinishPackInput): RightsBomReport {
  const items: RightsBomAuditItem[] = [];
  const compiledCreditsKo: string[] = [];
  const blockingReasonsKo: string[] = [];

  for (const asset of input.assets) {
    if (
      !asset.commercialUseAllowed ||
      !asset.redistributableInExport ||
      asset.licenseTier === "unverified" ||
      asset.licenseTier === "editorial-only"
    ) {
      const reasonKo =
        asset.licenseTier === "unverified"
          ? `라이선스 미검증 에셋 "${asset.name}"(${asset.sourceVendor}) — 출고 전 권리 증빙이 필요합니다.`
          : asset.licenseTier === "editorial-only"
            ? `비상업·편집용 전용 에셋 "${asset.name}" — 상업 연재 출고가 차단되었습니다.`
            : `상업 이용 또는 재배포 권한이 없는 에셋 "${asset.name}" — 대체 에셋으로 교체하세요.`;
      blockingReasonsKo.push(reasonKo);
      items.push(
        Object.freeze({
          assetId: asset.assetId,
          name: asset.name,
          category: asset.category,
          sourceVendor: asset.sourceVendor,
          licenseTier: asset.licenseTier,
          verdict: "blocked",
          reasonKo,
          creditLineKo: null,
        }),
      );
      continue;
    }

    if (asset.licenseTier === "cc-by-attribution") {
      const credit =
        asset.attributionText?.trim() || `${asset.name} by ${asset.sourceVendor} (CC-BY)`;
      compiledCreditsKo.push(credit);
      items.push(
        Object.freeze({
          assetId: asset.assetId,
          name: asset.name,
          category: asset.category,
          sourceVendor: asset.sourceVendor,
          licenseTier: asset.licenseTier,
          verdict: "attribution-required",
          reasonKo: "상업 출고 가능 · 화차 하단 출처 표기 필수",
          creditLineKo: credit,
        }),
      );
      continue;
    }

    items.push(
      Object.freeze({
        assetId: asset.assetId,
        name: asset.name,
        category: asset.category,
        sourceVendor: asset.sourceVendor,
        licenseTier: asset.licenseTier,
        verdict: "cleared",
        reasonKo: "상업 출고 및 재배포 검증 완료",
        creditLineKo: null,
      }),
    );
  }

  const clearedCount = items.filter((item) => item.verdict === "cleared").length;
  const attributionRequiredCount = items.filter((item) => item.verdict === "attribution-required").length;
  const blockedCount = items.filter((item) => item.verdict === "blocked").length;

  const exportGateStatus: RightsBomGateStatus =
    blockedCount > 0 ? "blocked" : attributionRequiredCount > 0 ? "approved-with-credits" : "approved";

  const payloadWithoutDigest = {
    projectId: input.projectId,
    seriesTitle: input.seriesTitle,
    episodeNumber: input.episodeNumber,
    exportGateStatus,
    clearedCount,
    attributionRequiredCount,
    blockedCount,
    compiledCreditsKo,
    blockingReasonsKo,
    items,
  };
  const manifestChecksum = fnv1aFinishPackDigest(JSON.stringify(payloadWithoutDigest));

  return Object.freeze({
    projectId: input.projectId,
    episodeNumber: input.episodeNumber,
    totalAssetCount: items.length,
    clearedCount,
    attributionRequiredCount,
    blockedCount,
    exportGateStatus,
    exportAllowed: blockedCount === 0,
    compiledCreditsKo: Object.freeze(compiledCreditsKo),
    blockingReasonsKo: Object.freeze(blockingReasonsKo),
    items: Object.freeze(items),
    manifestChecksum,
    bomJson: JSON.stringify({ ...payloadWithoutDigest, manifestChecksum }, null, 2),
  });
}

/** 1화 완료 시 멀티채널 마감 번들을 일괄 산출한다. */
export function buildMultichannelFinishPackBundle(
  input: MultichannelFinishPackInput,
): MultichannelFinishPackBundle {
  const shortformTeaser9x16 = buildShortformTeaser9x16Plan(input);
  const thumbnails = buildRepresentativeThumbnails3(input);
  const wcagAltPack = buildWcagAltPack(input);
  const rightsBomReport = buildRightsBomReport(input);

  const encoder = new TextEncoder();
  const byteSize = (text: string) => encoder.encode(text).length;

  const deliverableFiles: FinishPackDeliverableFile[] = [
    Object.freeze({
      fileName: `${input.projectId}-ep${input.episodeNumber}-shortform-9x16-storyboard.json`,
      channelKo: "Shorts · Reels · TikTok (9:16)",
      mimeType: "application/json",
      estimatedBytes: byteSize(JSON.stringify(shortformTeaser9x16.beats)),
      ready: true,
    }),
    Object.freeze({
      fileName: `${input.projectId}-ep${input.episodeNumber}-shortform-9x16-poster.svg`,
      channelKo: "숏폼 9:16 키프레임 포스터",
      mimeType: "image/svg+xml",
      estimatedBytes: byteSize(shortformTeaser9x16.posterSvgMarkup),
      ready: true,
    }),
    ...thumbnails.map((thumb) =>
      Object.freeze({
        fileName: thumb.fileName,
        channelKo: `${thumb.labelKo} (${thumb.channelUseKo})`,
        mimeType: "image/svg+xml",
        estimatedBytes: byteSize(thumb.svgMarkup),
        ready: true,
      }),
    ),
    Object.freeze({
      fileName: `${input.projectId}-ep${input.episodeNumber}-wcag-alt-manifest.md`,
      channelKo: "WCAG 2.1 AA 대체 텍스트",
      mimeType: "text/markdown",
      estimatedBytes: byteSize(wcagAltPack.manifestMarkdown),
      ready: wcagAltPack.complianceLevel === "AA",
    }),
    Object.freeze({
      fileName: `${input.projectId}-ep${input.episodeNumber}-rights-bom-report.json`,
      channelKo: "Rights BOM 라이선스 감사서",
      mimeType: "application/json",
      estimatedBytes: byteSize(rightsBomReport.bomJson),
      ready: rightsBomReport.exportAllowed,
    }),
  ];

  const readinessScore = Math.round(
    wcagAltPack.coveragePercent * 0.35 +
      (rightsBomReport.exportAllowed ? 45 : 0) +
      (thumbnails.length === 3 && shortformTeaser9x16.beats.length >= 3 ? 20 : 10),
  );

  const bundleManifestJson = JSON.stringify(
    {
      projectId: input.projectId,
      seriesTitle: input.seriesTitle,
      episodeNumber: input.episodeNumber,
      readinessScore,
      bundleExportAllowed: rightsBomReport.exportAllowed,
      rightsBomChecksum: rightsBomReport.manifestChecksum,
      rightsGate: rightsBomReport.exportGateStatus,
      wcagAltCoveragePercent: wcagAltPack.coveragePercent,
      shortformSpec: {
        widthPx: shortformTeaser9x16.widthPx,
        heightPx: shortformTeaser9x16.heightPx,
        totalDurationSec: shortformTeaser9x16.totalDurationSec,
        beatCount: shortformTeaser9x16.beats.length,
      },
      thumbnailVariants: thumbnails.map((thumb) => ({
        variantId: thumb.variantId,
        aspectRatio: thumb.aspectRatio,
        widthPx: thumb.widthPx,
        heightPx: thumb.heightPx,
        fileName: thumb.fileName,
      })),
      deliverableFiles,
    },
    null,
    2,
  );

  return Object.freeze({
    projectId: input.projectId,
    seriesTitle: input.seriesTitle,
    episodeNumber: input.episodeNumber,
    shortformTeaser9x16,
    thumbnails,
    wcagAltPack,
    rightsBomReport,
    deliverableFiles: Object.freeze(deliverableFiles),
    readinessScore,
    bundleExportAllowed: rightsBomReport.exportAllowed,
    bundleManifestJson,
  });
}
