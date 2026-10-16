/**
 * 참 하나를 화면에 그리고 실행하는 데 필요한 "해석된" 모양.
 *
 * 저장되는 것은 참조(ID)뿐이고, 이 타입은 `studio-charm-catalog.ts` 가 기존 카탈로그에서 즉석에서
 * 만들어 낸다. 소재 자체를 복제하지 않으므로 권리·출처 정보는 항상 원본 항목에서 그대로 온다.
 */

import type { BubbleVariant } from "../studio-assets";
import type { StudioObjectInsertOpenTarget } from "../studio-object-insert-catalog";
import type { StudioRasterAsset } from "../render/studio-raster-assets";
import type { SfxPreset } from "../studio-sfx-presets";
import type { StudioCharmId, StudioCharmKind } from "./studio-charm-model";

/** 선택기(picker) 필터와 칩 그룹에 쓰는 사용자 관점 분류. */
export const STUDIO_CHARM_SECTIONS = [
  "effect",
  "sticker",
  "prop",
  "emoji",
  "sfx",
  "shape",
  "illustration",
  "mine",
  "bubble",
  "object3d",
] as const;
export type StudioCharmSection = (typeof STUDIO_CHARM_SECTIONS)[number];

export type StudioCharmPreview =
  | { readonly type: "svg"; readonly svg: string }
  | { readonly type: "emoji"; readonly emoji: string }
  | { readonly type: "image"; readonly src: string }
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "icon"; readonly icon: "bubble" | "object3d" };

/** 눌렀을 때 호스트(편집기)에 요청하는 삽입 동작. 종류마다 기존 삽입 경로를 그대로 쓴다. */
export type StudioCharmAction =
  | { readonly type: "svg-image"; readonly svg: string; readonly width: number; readonly height: number }
  | { readonly type: "emoji-sticker"; readonly emoji: string }
  | { readonly type: "raster-asset"; readonly asset: StudioRasterAsset }
  | { readonly type: "library-image"; readonly dataUrl: string; readonly width: number; readonly height: number }
  | { readonly type: "sfx-text"; readonly preset: SfxPreset }
  | { readonly type: "native-bubble"; readonly variant: BubbleVariant }
  | {
    readonly type: "open-3d";
    readonly itemId: string;
    readonly openTarget: StudioObjectInsertOpenTarget;
    readonly sourceId: string;
    readonly width: number;
    readonly height: number;
  };

export type StudioCharmRightsOrigin =
  | "toonstudio-original"
  | "system-glyph"
  | "builtin-ai-raster"
  | "user-library"
  | "toonstudio-3d";

/** 원본 항목이 가진 권리 정보를 칩 곁에 요약한 값. 참이 새로 만들거나 바꾸는 값이 아니다. */
export interface StudioCharmRights {
  readonly origin: StudioCharmRightsOrigin;
  readonly summary: string;
  readonly licenseId: string | null;
  readonly aiGenerated: boolean;
  readonly attributionRequired: boolean | null;
}

export interface StudioCharmDescriptor {
  readonly id: StudioCharmId;
  readonly kind: StudioCharmKind;
  readonly section: StudioCharmSection;
  readonly label: string;
  readonly keywords: readonly string[];
  readonly preview: StudioCharmPreview;
  readonly action: StudioCharmAction;
  readonly rights: StudioCharmRights;
}

/** 지연 로드되는 SVG 스티커·효과 한 항목의 최소 모양(`FxOverlay` 와 호환). */
export interface StudioCharmFxAsset {
  readonly id: string;
  readonly label: string;
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

/** 첫 화면 번들에 들어가지 않고 참 바가 열릴 때 불러오는 카탈로그 데이터. */
export interface StudioCharmCatalogData {
  readonly fxOverlays: readonly StudioCharmFxAsset[];
  readonly comicStickers: readonly StudioCharmFxAsset[];
  readonly creatureStickers: readonly StudioCharmFxAsset[];
  readonly propStickers: readonly StudioCharmFxAsset[];
  readonly sfxPresets: readonly SfxPreset[];
}

/** 내 소재 라이브러리 항목에서 참이 읽는 필드(`StudioAsset` 의 부분집합). */
export interface StudioCharmLibraryAsset {
  readonly id: string;
  readonly name: string;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly kind?: string;
  readonly rights?: {
    /** 출처 종류. `ai-generated` 면 AI 생성으로 표시한다(`kind === "ai"` 와 같은 뜻). */
    readonly sourceKind?: string;
    readonly licenseId: string;
    readonly licenseLabel: string;
    readonly attributionRequired: boolean | null;
    readonly rightsConfirmed: boolean;
  };
}
