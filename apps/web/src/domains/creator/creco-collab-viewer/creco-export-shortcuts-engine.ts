/**
 * CRECO++ 단축키 빠른 조작 매퍼 (J/K/C/H/F/S/V) 및
 * 6대 웹툰 플랫폼 다중 규격 & 대타·이어그리기 인수인계 매니페스트 생성 엔진.
 */

import type { CrecoStageId } from "./creco-version-compare-types";

export type CrecoShortcutAction =
  | "next-cut"
  | "prev-cut"
  | "toggle-compare"
  | "toggle-horizontal-overview"
  | "toggle-pin-feedback"
  | "toggle-ai-shading"
  | "create-version";

export interface CrecoShortcutDefinition {
  readonly key: string;
  readonly action: CrecoShortcutAction;
  readonly label: string;
  readonly description: string;
}

export const CRECO_SHORTCUT_DEFINITIONS: readonly CrecoShortcutDefinition[] = [
  { key: "J", action: "next-cut", label: "다음 컷", description: "세로/가로 뷰어에서 다음 컷으로 이동" },
  { key: "K", action: "prev-cut", label: "이전 컷", description: "세로/가로 뷰어에서 이전 컷으로 이동" },
  { key: "C", action: "toggle-compare", label: "비교 전환", description: "4열 세로 비교 ↔ 와이프 비교 전환" },
  { key: "H", action: "toggle-horizontal-overview", label: "가로 오버뷰", description: "세로 스크롤 ↔ 가로 한눈에 오버뷰 전환" },
  { key: "F", action: "toggle-pin-feedback", label: "핀 피드백", description: "뷰어 핀·레드라인 작성 모드 토글" },
  { key: "S", action: "toggle-ai-shading", label: "AI 음영", description: "무료 AI 어시스턴트 음영 비교 토글" },
  { key: "V", action: "create-version", label: "새 버전", description: "현재 공정 1클릭 불변 버전 생성" },
];

export interface ShortcutKeyEventLike {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly targetTagName?: string;
  readonly isContentEditable?: boolean;
}

export function mapCrecoViewerShortcut(
  eventLike: ShortcutKeyEventLike,
): CrecoShortcutAction | null {
  if (eventLike.ctrlKey || eventLike.metaKey || eventLike.altKey) return null;
  if (eventLike.isContentEditable) return null;
  const tag = (eventLike.targetTagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;

  const normalized = eventLike.key.trim().toUpperCase();
  const matched = CRECO_SHORTCUT_DEFINITIONS.find((item) => item.key === normalized);
  return matched ? matched.action : null;
}

export type WebtoonPlatformId =
  | "naver-webtoon"
  | "kakao-webtoon"
  | "lezhin-bomtoon"
  | "ridi"
  | "piccoma-linemanga"
  | "webtoon-global";

export type ExportResizeMode = "fixed-slice" | "fit-width" | "original";
export type ExportQualityTier = "best" | "high" | "standard";

export interface WebtoonPlatformSpec {
  readonly platformId: WebtoonPlatformId;
  readonly name: string;
  readonly region: string;
  readonly widthPx: number;
  readonly maxSliceHeightPx: number;
  readonly format: "JPG" | "PNG";
  readonly thumbnailSpec: string;
  readonly requiredStage: CrecoStageId;
}

export const WEBTOON_PLATFORM_SPECS: readonly WebtoonPlatformSpec[] = [
  {
    platformId: "naver-webtoon",
    name: "네이버 웹툰",
    region: "KR",
    widthPx: 690,
    maxSliceHeightPx: 1280,
    format: "JPG",
    thumbnailSpec: "434×330 · 202×164",
    requiredStage: "lettering",
  },
  {
    platformId: "kakao-webtoon",
    name: "카카오웹툰 · 카카오페이지",
    region: "KR",
    widthPx: 720,
    maxSliceHeightPx: 1100,
    format: "JPG",
    thumbnailSpec: "720×720 · 600×870",
    requiredStage: "lettering",
  },
  {
    platformId: "lezhin-bomtoon",
    name: "레진 · 봄툰",
    region: "KR",
    widthPx: 1280,
    maxSliceHeightPx: 1600,
    format: "PNG",
    thumbnailSpec: "1080×1080",
    requiredStage: "lettering",
  },
  {
    platformId: "ridi",
    name: "리디 웹툰",
    region: "KR",
    widthPx: 1080,
    maxSliceHeightPx: 1440,
    format: "JPG",
    thumbnailSpec: "600×870",
    requiredStage: "lettering",
  },
  {
    platformId: "piccoma-linemanga",
    name: "피코마 · 라인망가",
    region: "JP",
    widthPx: 800,
    maxSliceHeightPx: 1280,
    format: "JPG",
    thumbnailSpec: "750×750",
    requiredStage: "loc-ja",
  },
  {
    platformId: "webtoon-global",
    name: "웹툰 글로벌",
    region: "EN",
    widthPx: 800,
    maxSliceHeightPx: 1280,
    format: "JPG",
    thumbnailSpec: "1080×1080",
    requiredStage: "loc-en",
  },
];

export interface MultiSpecExportRequest {
  readonly projectAbbreviation: string;
  readonly episodeNumber: number;
  readonly versionLabel: string;
  readonly versionDigest: string;
  readonly cutCount: number;
  readonly unresolvedPinCount: number;
  readonly platformIds: readonly WebtoonPlatformId[];
  readonly resizeMode: ExportResizeMode;
  readonly quality: ExportQualityTier;
  readonly includeThumbnails: boolean;
  readonly includeHandoffPack: boolean;
}

export interface MultiSpecExportManifest {
  readonly manifestId: string;
  readonly filePrefix: string;
  readonly resizeMode: ExportResizeMode;
  readonly quality: ExportQualityTier;
  readonly includeThumbnails: boolean;
  readonly platforms: readonly {
    readonly platformId: WebtoonPlatformId;
    readonly name: string;
    readonly region: string;
    readonly outputWidthPx: number;
    readonly sliceCount: number;
    readonly format: "JPG" | "PNG";
    readonly thumbnailSpec: string;
    readonly requiredStage: CrecoStageId;
  }[];
  readonly handoffPack: {
    readonly enabled: boolean;
    readonly lockedVersionDigest: string;
    readonly unresolvedPinCount: number;
    readonly guestSeatCostKrw: 0;
    readonly checklist: readonly string[];
  };
}

function computeManifestHash(seed: string): string {
  let hash = 2166136261;
  for (let idx = 0; idx < seed.length; idx += 1) {
    hash ^= seed.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return `exp_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildMultiSpecExportManifest(
  input: MultiSpecExportRequest,
): MultiSpecExportManifest {
  const selected = WEBTOON_PLATFORM_SPECS.filter((spec) =>
    input.platformIds.includes(spec.platformId),
  );
  const targets = selected.length > 0 ? selected : [WEBTOON_PLATFORM_SPECS[0]];
  const epTag = `EP${String(input.episodeNumber).padStart(3, "0")}`;
  const filePrefix = `${input.projectAbbreviation}_${epTag}_${input.versionLabel.replace(/\s+/gu, "_")}`;

  const platforms = targets.map((spec) => {
    const sliceMultiplier = input.resizeMode === "fixed-slice" ? 2 : 1;
    return {
      platformId: spec.platformId,
      name: spec.name,
      region: spec.region,
      outputWidthPx: input.resizeMode === "original" ? 1600 : spec.widthPx,
      sliceCount: Math.max(1, input.cutCount * sliceMultiplier),
      format: spec.format,
      thumbnailSpec: spec.thumbnailSpec,
      requiredStage: spec.requiredStage,
    };
  });

  return {
    manifestId: computeManifestHash(`${filePrefix}|${input.versionDigest}|${platforms.length}`),
    filePrefix,
    resizeMode: input.resizeMode,
    quality: input.quality,
    includeThumbnails: input.includeThumbnails,
    platforms,
    handoffPack: {
      enabled: input.includeHandoffPack,
      lockedVersionDigest: input.versionDigest,
      unresolvedPinCount: input.unresolvedPinCount,
      guestSeatCostKrw: 0,
      checklist: input.includeHandoffPack
        ? [
            `불변 버전 다이제스트 고정 (${input.versionDigest})`,
            `미해결 핀·레드라인 ${input.unresolvedPinCount}건 좌표 포함`,
            "캐릭터 팔레트·선화 브러시 시트 및 3D 카메라 구도 번들 포함",
            "대타·이어그리기 파트너 ₩0 무제한 시트 즉시 초대 가능",
          ]
        : [],
    },
  };
}
