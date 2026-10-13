/**
 * 상호작용 연출 런타임의 계약·상수 — 콜백/옵션/시트/뷰 타입과 연출 풀·색상 상수.
 * StudioInteractionFxRuntime(studio-virtual-space-interaction-fx)이 소비하는
 * 기반 정의만 모았다.
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioSpaceUiEvent } from "./studio-virtual-space-engine-events";
import type {
  StudioInteractableObjectKind,
  StudioInteractableRuntime,
  StudioInteractableStateKey,
} from "./studio-virtual-space-interactable-objects";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type {
  StudioWorldFxAnchor,
  StudioWorldFxObject,
  StudioWorldInteractionKind,
} from "./studio-virtual-space-world-interaction-kinds";
import type { StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

export type FxScene = Pick<Phaser.Scene, "add" | "textures" | "make">;

/** 피어 전파용 오브젝트 상태 전이 통지. 로컬 전이에서만 만들어진다. */
export interface StudioInteractionFxObjectStateChange {
  readonly objectId: string;
  readonly stateKey: StudioInteractableStateKey;
  readonly stateChangedAt: number;
}

export interface StudioInteractionFxCallbacks {
  /** point 근처(radius 안) NPC 한 명이 대사를 durationMs 동안 말한다. 근처에 NPC가 없으면 아무것도 하지 않는다. */
  readonly npcSay: (point: StudioVirtualSpacePoint, radius: number, ko: string, en: string, durationMs: number) => void;
  /** 내 머리 위 이모트(이 브라우저에서만 재생). */
  readonly selfEmote: (emote: StudioSpaceEmoteId) => void;
  /** HUD 알림. 캔버스가 onSpaceUiEvent로 넘긴다. */
  readonly notify: (event: StudioSpaceUiEvent) => void;
  /**
   * 로컬 오브젝트 상태 전이가 일어날 때만 호출된다(주문·추출 완성·수령).
   * 원격 적용(applyRemoteObjectState)은 호출하지 않는다 — 전파 에코 방지.
   * 배선 측은 이 통지를 프레즌스 컨트롤러의 sendObjectState로 넘긴다.
   */
  readonly onObjectStateChange?: (change: StudioInteractionFxObjectStateChange) => void;
}

export interface StudioInteractionFxOptions {
  readonly style: StudioVirtualArtStyleKey;
  /** 연출 기준점을 고를 오브젝트 그림(캠퍼스 오브젝트). 없으면 상호작용 지점 위를 쓴다. */
  readonly objects: readonly StudioWorldFxObject[];
  /** 배지 색(CSS 토큰에서 읽은 값). */
  readonly badge: { readonly plate: number; readonly text: number; readonly accent: number };
  readonly translate: (ko: string, en: string) => string;
}

/** 캔버스가 읽어 앉은 자세를 그리는 월드 자리. */
export interface StudioInteractionFxSeat {
  readonly id: string;
  readonly anchorPoint: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
}

/** 발동 연출 길이(ms). */
export const STUDIO_INTERACTION_BURST_MS = 1_400;
/** 받은 커피를 손에 드는 시간(ms). */
export const STUDIO_INTERACTION_COFFEE_HOLD_MS = 45_000;
/** 커피가 완성됐을 때 이 거리(상호작용 반경 배수) 안이면 바로 손에 쥔다. */
export const COFFEE_HANDOFF_RADIUS = 1.6;
/** 같은 사람이 무대에 다시 올라도 알림은 이 간격에 한 번. */
export const STAGE_NOTICE_COOLDOWN_MS = 20_000;
/** 바리스타 권유 대사 간격. */
export const CAFE_INVITE_COOLDOWN_MS = 25_000;
export const NPC_LINE_MS = 3_200;
export const NPC_SEARCH_RADIUS = 240;
export const BURST_POOL = 6;
export const CUP_POOL = 8;
export const BADGE_POOL = 4;
export const FX_DEPTH = 150_200;
export const BADGE_DEPTH = 160_120;
/** 화면 밖 여유(px). 이 밖의 연출은 그리지 않는다. */
export const VIEW_MARGIN = 160;

export interface Burst {
  readonly graphics: Phaser.GameObjects.Graphics;
  kind: StudioWorldInteractionKind;
  anchorX: number;
  anchorY: number;
  originX: number;
  originY: number;
  startedAt: number;
  seed: number;
  still: boolean;
  active: boolean;
}

export interface Machine {
  readonly interaction: StudioWorldInteractionDefinition;
  readonly anchor: StudioWorldFxAnchor;
  readonly graphics: Phaser.GameObjects.Graphics;
  readonly cup: Phaser.GameObjects.Image;
  runtime: StudioInteractableRuntime;
}

/** 상태 가구 고정물(문·조명·게시판·미디어 보드/스크린). 커피 머신과 달리 시간 전이·수령 연출이 없고 상태 반응만 그린다. */
export interface Fixture {
  /** 고정물 식별자만 필요하다 — 배치 가구는 매니페스트 상호작용 정의가 없다. */
  readonly interaction: Pick<StudioWorldInteractionDefinition, "id">;
  readonly kind: StudioInteractableObjectKind;
  readonly anchor: StudioWorldFxAnchor;
  readonly graphics: Phaser.GameObjects.Graphics;
  runtime: StudioInteractableRuntime;
}

/** 배치 가구 고정물 등록 입력(빌드 모드 등 매니페스트 밖에서 배치된 상태 가구). */
export interface StudioInteractionFxPlacedFixture {
  readonly objectId: string;
  readonly kind: StudioInteractableObjectKind;
  readonly anchor: StudioWorldFxAnchor;
}

export interface Badge {
  readonly text: Phaser.GameObjects.Text;
  label: string;
}

export interface StudioInteractionFxView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const COLORS = Object.freeze({
  steam: 0xf4f0ea,
  amber: 0xffc35a,
  water: 0x8fe3ff,
  foam: 0xeefcff,
  gold: 0xf2c75c,
  pink: 0xff7aa8,
  cyan: 0x55e0ff,
  violet: 0x9b7bff,
  green: 0x7ee08a,
  paper: 0xfbf8f1,
  red: 0xe4575f,
  lamp: 0xffe2a0,
  spot: 0xfff1c4,
});
