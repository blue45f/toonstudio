/**
 * 멀티 디바이스 폼팩터 분류 · 왼손/오른손잡이 반전 · 폴더블 힌지 회피 ·
 * BroadcastChannel 로컬 크로스-디바이스 실시간 동기화 브릿지 엔진.
 */

import {
  DEVICE_FORM_FACTOR_ORDER,
  DEVICE_FORM_FACTOR_PROFILES,
  MULTI_DEVICE_HUB_SUMMARY,
  MULTI_DEVICE_SPRITE_PATHS,
  TV_STORYBOARD_TILES,
  moveTvSpatialFocusIndex,
  type DeviceChromeDensity,
  type DeviceFormFactorCategory,
  type DeviceFormFactorId,
  type DeviceFormFactorProfile,
  type DeviceHandedness,
  type DevicePointerClass,
  type DeviceRect,
  type FoldablePosture,
  type HingeAxis,
  type MultiDeviceSpriteKey,
  type TvDpadDirection,
  type TvStoryboardTile,
} from "./device-form-factor-profiles";

export {
  DEVICE_FORM_FACTOR_ORDER,
  DEVICE_FORM_FACTOR_PROFILES,
  MULTI_DEVICE_HUB_SUMMARY,
  MULTI_DEVICE_SPRITE_PATHS,
  TV_STORYBOARD_TILES,
  moveTvSpatialFocusIndex,
};
export type {
  DeviceChromeDensity,
  DeviceFormFactorCategory,
  DeviceFormFactorId,
  DeviceFormFactorProfile,
  DeviceHandedness,
  DevicePointerClass,
  DeviceRect,
  FoldablePosture,
  HingeAxis,
  MultiDeviceSpriteKey,
  TvDpadDirection,
  TvStoryboardTile,
};

export interface DeviceViewportMetrics {
  readonly width: number;
  readonly height: number;
  readonly pointerClass?: DevicePointerClass;
  readonly isRoundDisplay?: boolean;
  readonly viewportSegments?: number;
  readonly hingeRect?: DeviceRect | null;
  readonly foldPosture?: "continuous" | "folded";
  readonly tvModeHint?: boolean;
  readonly viewingDistanceFeet?: number;
  readonly userAgent?: string;
}

export interface DeviceFormFactorClassification {
  readonly formFactor: DeviceFormFactorId;
  readonly profile: DeviceFormFactorProfile;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
  readonly orientation: "portrait" | "landscape" | "square";
  readonly isFoldableDual: boolean;
  readonly isTenFootTv: boolean;
}

const TV_USER_AGENT_PATTERN = /\b(?:SmartTV|Tizen|Web0S|webOS|BRAVIA|AppleTV|Android TV|GoogleTV|Roku|FireTV)\b/iu;

function sanitizeDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/** 현재 뷰포트 치수·포인터·세그먼트·TV 힌트를 바탕으로 10단계 반응형 폼팩터를 판별한다. */
export function classifyDeviceFormFactor(
  metrics: DeviceViewportMetrics,
): DeviceFormFactorClassification {
  const width = sanitizeDimension(metrics.width, 1440);
  const height = sanitizeDimension(metrics.height, 900);
  const aspectRatio = Number((width / Math.max(1, height)).toFixed(3));
  const orientation: "portrait" | "landscape" | "square" =
    Math.abs(width - height) <= 12 ? "square" : width > height ? "landscape" : "portrait";

  const hasHinge =
    metrics.hingeRect !== null &&
    metrics.hingeRect !== undefined &&
    (metrics.hingeRect.width > 0 || metrics.hingeRect.height > 0);
  const isFoldableDual =
    (typeof metrics.viewportSegments === "number" && metrics.viewportSegments >= 2) ||
    metrics.foldPosture === "folded" ||
    hasHinge;
  const isTenFootTv =
    metrics.tvModeHint === true ||
    (typeof metrics.viewingDistanceFeet === "number" && metrics.viewingDistanceFeet >= 8) ||
    (metrics.pointerClass === "none" && width >= 1280) ||
    (typeof metrics.userAgent === "string" && TV_USER_AGENT_PATTERN.test(metrics.userAgent));

  let formFactor: DeviceFormFactorId;
  if (isTenFootTv) {
    formFactor = "tv-10ft";
  } else if (isFoldableDual) {
    formFactor = "foldable-dual";
  } else if (Math.max(width, height) <= 280 || (Math.min(width, height) <= 260 && Math.max(width, height) <= 320)) {
    formFactor =
      metrics.isRoundDisplay === true || (metrics.isRoundDisplay !== false && orientation === "square")
        ? "watch-round"
        : "watch-rect";
  } else if (width < 375) {
    formFactor = "mobile-xs";
  } else if (width < 640) {
    formFactor = "mobile-lg";
  } else if (width >= 1920 && (aspectRatio >= 2.05 || width >= 2400)) {
    formFactor = "ultrawide";
  } else if (width < 1024 && height >= width) {
    formFactor = "tablet-portrait";
  } else if (
    (width < 1200 && metrics.pointerClass === "coarse") ||
    (width < 1024 && width > height)
  ) {
    formFactor = "tablet-landscape";
  } else {
    formFactor = "desktop";
  }

  return Object.freeze({
    formFactor,
    profile: DEVICE_FORM_FACTOR_PROFILES[formFactor],
    width,
    height,
    aspectRatio,
    orientation,
    isFoldableDual,
    isTenFootTv,
  });
}

export interface BrowserViewportProbeEnv {
  readonly innerWidth?: number;
  readonly innerHeight?: number;
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
  readonly userAgent?: string;
  readonly viewportSegments?: readonly DeviceRect[];
}

/** 현재 브라우저 환경에서 안전하게 뷰포트 메트릭을 수집한다(SSR/테스트 환경 안전 폴백 포함). */
export function readBrowserViewportMetrics(env?: BrowserViewportProbeEnv): DeviceViewportMetrics {
  const win = typeof window !== "undefined" ? window : undefined;
  const width = env?.innerWidth ?? win?.innerWidth ?? 1440;
  const height = env?.innerHeight ?? win?.innerHeight ?? 900;
  const matchMediaFn =
    env?.matchMedia ?? (typeof win?.matchMedia === "function" ? win.matchMedia.bind(win) : undefined);

  let pointerClass: DevicePointerClass = "fine";
  if (matchMediaFn) {
    if (matchMediaFn("(pointer: none)").matches) pointerClass = "none";
    else if (matchMediaFn("(pointer: coarse)").matches) pointerClass = "coarse";
  }

  const runtimeSegments =
    env?.viewportSegments ??
    (win as unknown as { readonly visualViewport?: { readonly segments?: readonly DeviceRect[] } } | undefined)
      ?.visualViewport?.segments;

  let hingeRect: DeviceRect | null = null;
  if (Array.isArray(runtimeSegments) && runtimeSegments.length >= 2) {
    const first = runtimeSegments[0];
    const second = runtimeSegments[1];
    if (first && second) {
      if (second.x > first.x + first.width) {
        hingeRect = Object.freeze({
          x: first.x + first.width,
          y: 0,
          width: Math.max(8, second.x - (first.x + first.width)),
          height,
        });
      } else if (second.y > first.y + first.height) {
        hingeRect = Object.freeze({
          x: 0,
          y: first.y + first.height,
          width,
          height: Math.max(8, second.y - (first.y + first.height)),
        });
      }
    }
  }

  return Object.freeze({
    width,
    height,
    pointerClass,
    viewportSegments: Array.isArray(runtimeSegments) ? runtimeSegments.length : 1,
    hingeRect,
    userAgent: env?.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : ""),
  });
}

export interface HandednessMirrorLayout {
  readonly handedness: DeviceHandedness;
  readonly formFactor: DeviceFormFactorId;
  readonly toolRailSide: "left" | "right";
  readonly inspectorSide: "left" | "right";
  readonly thumbDockAnchor: "bottom-right" | "bottom-left";
  readonly watchCrownSide: "right" | "left";
  readonly dialPadSide: "left" | "right";
  readonly dataAttribute: "right-handed" | "left-handed";
  readonly summaryKo: string;
}

/** 오른손/왼손잡이 설정에 따라 도구 레일·인스펙터·엄지 독·워치 크라운·왼손 다이얼 패드 배치를 대칭 반전한다. */
export function resolveHandednessLayout(
  formFactor: DeviceFormFactorId,
  handedness: DeviceHandedness,
): HandednessMirrorLayout {
  const isLeft = handedness === "left";
  const summaryKo = isLeft
    ? `왼손잡이 반전 활성 · 도구 막대 오른쪽 · 인스펙터 왼쪽 · 워치 크라운 좌측(${DEVICE_FORM_FACTOR_PROFILES[formFactor].shortLabelKo})`
    : `오른손 기본 배치 · 도구 막대 왼쪽 · 인스펙터 오른쪽 · 워치 크라운 우측(${DEVICE_FORM_FACTOR_PROFILES[formFactor].shortLabelKo})`;

  return Object.freeze({
    handedness,
    formFactor,
    toolRailSide: isLeft ? "right" : "left",
    inspectorSide: isLeft ? "left" : "right",
    thumbDockAnchor: isLeft ? "bottom-left" : "bottom-right",
    watchCrownSide: isLeft ? "left" : "right",
    dialPadSide: isLeft ? "right" : "left",
    dataAttribute: isLeft ? "left-handed" : "right-handed",
    summaryKo,
  });
}

export interface FoldableHingeAvoidancePlan {
  readonly posture: FoldablePosture;
  readonly hingeAxis: HingeAxis;
  readonly hingeRect: DeviceRect | null;
  readonly safeMarginPx: number;
  readonly primaryCanvasRect: DeviceRect;
  readonly secondaryToolRect: DeviceRect | null;
  readonly summaryKo: string;
  readonly isPointInHingeZone: (x: number, y: number) => boolean;
}

/** 폴더블 기기의 중앙 힌지(세로 책 펼침 / 가로 테이블탑)를 피하도록 주/보조 영역을 안전 여백과 함께 계산한다. */
export function computeFoldableHingeAvoidance(
  viewport: { readonly width: number; readonly height: number },
  hingeRect?: DeviceRect | null,
  safeMarginPx: number = 12,
): FoldableHingeAvoidancePlan {
  const width = sanitizeDimension(viewport.width, 1440);
  const height = sanitizeDimension(viewport.height, 900);
  const margin = Number.isFinite(safeMarginPx) && safeMarginPx >= 0 ? Math.round(safeMarginPx) : 12;

  if (!hingeRect || (hingeRect.width <= 0 && hingeRect.height <= 0)) {
    return Object.freeze({
      posture: "continuous",
      hingeAxis: "none",
      hingeRect: null,
      safeMarginPx: margin,
      primaryCanvasRect: Object.freeze({ x: 0, y: 0, width, height }),
      secondaryToolRect: null,
      summaryKo: "단일 연속 화면 · 전체 영역을 원고 캔버스로 활용합니다.",
      isPointInHingeZone: () => false,
    });
  }

  const normalizedHinge: DeviceRect = Object.freeze({
    x: Math.max(0, Math.round(hingeRect.x)),
    y: Math.max(0, Math.round(hingeRect.y)),
    width: Math.max(0, Math.round(hingeRect.width)),
    height: Math.max(0, Math.round(hingeRect.height)),
  });
  const isVerticalHinge = normalizedHinge.height >= normalizedHinge.width;

  if (isVerticalHinge) {
    const leftWidth = Math.max(0, normalizedHinge.x - margin);
    const rightStart = Math.min(width, normalizedHinge.x + normalizedHinge.width + margin);
    const rightWidth = Math.max(0, width - rightStart);
    const leftRect = Object.freeze({ x: 0, y: 0, width: leftWidth, height });
    const rightRect = Object.freeze({ x: rightStart, y: 0, width: rightWidth, height });
    const primaryIsLeft = leftWidth >= rightWidth;

    return Object.freeze({
      posture: "folded-book",
      hingeAxis: "vertical",
      hingeRect: normalizedHinge,
      safeMarginPx: margin,
      primaryCanvasRect: primaryIsLeft ? leftRect : rightRect,
      secondaryToolRect: primaryIsLeft ? rightRect : leftRect,
      summaryKo: `책 펼침 분할 · 세로 힌지(${normalizedHinge.width}px + 여백 ${margin * 2}px) 회피 배치`,
      isPointInHingeZone: (x: number, y: number) =>
        x >= normalizedHinge.x - margin &&
        x <= normalizedHinge.x + normalizedHinge.width + margin &&
        y >= 0 &&
        y <= height,
    });
  }

  const topHeight = Math.max(0, normalizedHinge.y - margin);
  const bottomStart = Math.min(height, normalizedHinge.y + normalizedHinge.height + margin);
  const bottomHeight = Math.max(0, height - bottomStart);

  return Object.freeze({
    posture: "folded-tabletop",
    hingeAxis: "horizontal",
    hingeRect: normalizedHinge,
    safeMarginPx: margin,
    primaryCanvasRect: Object.freeze({ x: 0, y: 0, width, height: topHeight }),
    secondaryToolRect: Object.freeze({ x: 0, y: bottomStart, width, height: bottomHeight }),
    summaryKo: `테이블탑 상하 분할 · 가로 힌지(${normalizedHinge.height}px + 여백 ${margin * 2}px) 회피 배치`,
    isPointInHingeZone: (x: number, y: number) =>
      y >= normalizedHinge.y - margin &&
      y <= normalizedHinge.y + normalizedHinge.height + margin &&
      x >= 0 &&
      x <= width,
  });
}

export type TvMirrorModeId = "theater-4k" | "storyboard-wall" | "live-broadcast";

export type MultiDeviceSyncPayload =
  | {
      readonly kind: "device.hello";
      readonly formFactor: DeviceFormFactorId;
      readonly labelKo: string;
      readonly handedness: DeviceHandedness;
    }
  | { readonly kind: "device.goodbye" }
  | {
      readonly kind: "brush.delta";
      readonly sizePx: number;
      readonly opacity: number;
      readonly colorTokenId: string;
    }
  | {
      readonly kind: "canvas.zoom";
      readonly zoomPercent: number;
      readonly rotationDeg: number;
    }
  | { readonly kind: "canvas.undo"; readonly reasonKo: string }
  | { readonly kind: "canvas.redo"; readonly reasonKo: string }
  | { readonly kind: "voice.bubble"; readonly text: string; readonly tone: "normal" | "shout" | "whisper" }
  | {
      readonly kind: "tv.mirror";
      readonly mode: TvMirrorModeId;
      readonly panelIndex: number;
      readonly pairingCode: string;
    }
  | { readonly kind: "handedness.sync"; readonly handedness: DeviceHandedness }
  | {
      readonly kind: "peripheral.command";
      readonly deviceKind: string;
      readonly actionId: string;
      readonly value: number;
    };

export interface MultiDeviceSyncEnvelope {
  readonly id: string;
  readonly senderId: string;
  readonly senderFormFactor: DeviceFormFactorId;
  readonly sentAtMs: number;
  readonly payload: MultiDeviceSyncPayload;
}

export interface MultiDevicePeerInfo {
  readonly deviceId: string;
  readonly formFactor: DeviceFormFactorId;
  readonly labelKo: string;
  readonly handedness: DeviceHandedness;
  readonly lastSeenAtMs: number;
}

export interface BroadcastChannelLike {
  readonly name: string;
  postMessage: (message: unknown) => void;
  close: () => void;
  addEventListener: (type: "message", listener: (event: { readonly data: unknown }) => void) => void;
  removeEventListener: (type: "message", listener: (event: { readonly data: unknown }) => void) => void;
}

export interface MultiDeviceSyncBridgeOptions {
  readonly channelName?: string;
  readonly deviceId?: string;
  readonly formFactor?: DeviceFormFactorId;
  readonly deviceLabelKo?: string;
  readonly handedness?: DeviceHandedness;
  readonly channelFactory?: (name: string) => BroadcastChannelLike | null;
  readonly now?: () => number;
  readonly maxHistory?: number;
}

export interface MultiDeviceSyncBridge {
  readonly channelName: string;
  readonly deviceId: string;
  readonly transportMode: "broadcast-channel" | "memory-loopback";
  readonly publish: (payload: MultiDeviceSyncPayload) => MultiDeviceSyncEnvelope;
  readonly subscribe: (listener: (envelope: MultiDeviceSyncEnvelope) => void) => () => void;
  readonly announceHello: (handedness?: DeviceHandedness) => MultiDeviceSyncEnvelope;
  readonly getPeers: () => readonly MultiDevicePeerInfo[];
  readonly getHistory: () => readonly MultiDeviceSyncEnvelope[];
  readonly close: () => void;
}

const DEFAULT_SYNC_CHANNEL = "toonstudio:multi-device-sync:v1";

function isValidSyncEnvelope(raw: unknown): raw is MultiDeviceSyncEnvelope {
  if (typeof raw !== "object" || raw === null) return false;
  const candidate = raw as Partial<MultiDeviceSyncEnvelope>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.senderId === "string" &&
    typeof candidate.senderFormFactor === "string" &&
    typeof candidate.sentAtMs === "number" &&
    typeof candidate.payload === "object" &&
    candidate.payload !== null &&
    typeof (candidate.payload as { readonly kind?: unknown }).kind === "string"
  );
}

/** BroadcastChannel 기반 로컬 크로스-디바이스 실시간 동기화 브릿지를 생성한다. */
export function createMultiDeviceSyncBridge(
  options: MultiDeviceSyncBridgeOptions = {},
): MultiDeviceSyncBridge {
  const channelName = options.channelName ?? DEFAULT_SYNC_CHANNEL;
  const now = options.now ?? (() => Date.now());
  const formFactor = options.formFactor ?? "desktop";
  const deviceLabelKo = options.deviceLabelKo ?? DEVICE_FORM_FACTOR_PROFILES[formFactor].shortLabelKo;
  const initialHandedness = options.handedness ?? "right";
  const maxHistory = Math.max(8, options.maxHistory ?? 32);

  let seq = 0;
  const deviceId =
    options.deviceId ?? `mde-${formFactor}-${Math.abs(now() % 1_000_000).toString(36)}`;

  let channel: BroadcastChannelLike | null = null;
  if (options.channelFactory) {
    channel = options.channelFactory(channelName);
  } else if (typeof globalThis.BroadcastChannel === "function") {
    try {
      channel = new globalThis.BroadcastChannel(channelName) as unknown as BroadcastChannelLike;
    } catch {
      channel = null;
    }
  }

  const transportMode: "broadcast-channel" | "memory-loopback" = channel
    ? "broadcast-channel"
    : "memory-loopback";

  const listeners = new Set<(envelope: MultiDeviceSyncEnvelope) => void>();
  const peers = new Map<string, MultiDevicePeerInfo>();
  const history: MultiDeviceSyncEnvelope[] = [];
  let closed = false;

  const recordEnvelope = (envelope: MultiDeviceSyncEnvelope): void => {
    history.push(envelope);
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }
    if (envelope.senderId !== deviceId) {
      if (envelope.payload.kind === "device.hello") {
        peers.set(envelope.senderId, {
          deviceId: envelope.senderId,
          formFactor: envelope.payload.formFactor,
          labelKo: envelope.payload.labelKo,
          handedness: envelope.payload.handedness,
          lastSeenAtMs: envelope.sentAtMs,
        });
      } else if (envelope.payload.kind === "device.goodbye") {
        peers.delete(envelope.senderId);
      } else {
        const existing = peers.get(envelope.senderId);
        if (existing) {
          peers.set(envelope.senderId, { ...existing, lastSeenAtMs: envelope.sentAtMs });
        }
      }
    }
  };

  const handleIncoming = (event: { readonly data: unknown }): void => {
    if (closed || !isValidSyncEnvelope(event.data)) return;
    if (event.data.senderId === deviceId) return;
    recordEnvelope(event.data);
    for (const listener of listeners) {
      listener(event.data);
    }
  };

  channel?.addEventListener("message", handleIncoming);

  const publish = (payload: MultiDeviceSyncPayload): MultiDeviceSyncEnvelope => {
    seq += 1;
    const envelope: MultiDeviceSyncEnvelope = Object.freeze({
      id: `${deviceId}-${seq}`,
      senderId: deviceId,
      senderFormFactor: formFactor,
      sentAtMs: now(),
      payload,
    });
    if (closed) return envelope;
    recordEnvelope(envelope);
    if (channel) {
      try {
        channel.postMessage(envelope);
      } catch {
        // 채널이 이미 닫힌 경우 로컬 기록만 유지한다.
      }
    }
    for (const listener of listeners) {
      listener(envelope);
    }
    return envelope;
  };

  return Object.freeze({
    channelName,
    deviceId,
    transportMode,
    publish,
    subscribe(listener: (envelope: MultiDeviceSyncEnvelope) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    announceHello(handedness: DeviceHandedness = initialHandedness): MultiDeviceSyncEnvelope {
      return publish({
        kind: "device.hello",
        formFactor,
        labelKo: deviceLabelKo,
        handedness,
      });
    },
    getPeers(): readonly MultiDevicePeerInfo[] {
      return Object.freeze([...peers.values()]);
    },
    getHistory(): readonly MultiDeviceSyncEnvelope[] {
      return Object.freeze([...history]);
    },
    close(): void {
      if (closed) return;
      try {
        publish({ kind: "device.goodbye" });
      } catch {
        // 종료 시 전송 실패는 무시한다.
      }
      closed = true;
      channel?.removeEventListener("message", handleIncoming);
      channel?.close();
      listeners.clear();
    },
  });
}
