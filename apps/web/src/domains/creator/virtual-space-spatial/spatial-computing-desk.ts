/**
 * 공간 컴퓨팅(WebXR / 3D 공간 워크벤치) 라이트박스 · 3D 피드백 스티커 · CRDT 동기화 상태기.
 *
 * - 공중 플로팅 멀티컷 라이트박스 스토리보드 테이블의 3D 배치(곡면 아크 / 2열 그리드)를 계산한다.
 * - 컷 또는 3D 공간 좌표에 고정되는 피드백 스티커와 동료의 실시간 3D 포인터/드로잉 테이블 상태를 관리한다.
 * - Lamport 시계와 결정론적 `(lamportClock, actorPeerId, opId)` LWW 타이브레이커를 적용해
 *   다중 동료 간 연산 순서가 뒤섞여도 동일한 상태로 수렴하는 CRDT 상태기를 제공한다.
 */

import type { SpatialVec3 } from "./spatial-binaural-stage";

export type SpatialRuntimeMode = "webxr-ar" | "webxr-vr" | "desktop-3d-workbench";

export type LightboxLayoutMode = "curved-arc" | "dual-row-grid";

export type LightboxCutStage = "rough" | "inked" | "toned" | "approved";

export type FeedbackStickerCategory =
  | "composition"
  | "dialogue"
  | "lighting"
  | "continuity";

export interface SpatialRuntimeCapability {
  readonly mode: SpatialRuntimeMode;
  readonly supportsImmersiveAr: boolean;
  readonly supportsImmersiveVr: boolean;
  readonly supportsSpatialAnchors: boolean;
  readonly recommendedTableHeightM: number;
  readonly viewingRadiusM: number;
  readonly summaryKo: string;
}

export interface SpatialCutPose {
  readonly position: SpatialVec3;
  /** Y축 회전(도, 양수 = 우측 회전) */
  readonly rotationYDeg: number;
  /** X축 기울기(도, 음수 = 시선 쪽으로 약간 기울임) */
  readonly tiltXDeg: number;
  /** 패널 배율 (0.5 ~ 2.0) */
  readonly scale: number;
}

export interface FloatingLightboxCut {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly titleKo: string;
  readonly sceneTagKo: string;
  readonly stage: LightboxCutStage;
  readonly pose: SpatialCutPose;
  readonly pinned: boolean;
  readonly layerCount: number;
  readonly lamportClock: number;
  readonly updatedByPeerId: string;
  readonly removed: boolean;
}

export interface SpatialFeedbackSticker {
  readonly stickerId: string;
  readonly cutId: string | null;
  readonly authorPeerId: string;
  readonly authorNameKo: string;
  readonly category: FeedbackStickerCategory;
  readonly bodyKo: string;
  readonly anchorPosition: SpatialVec3;
  readonly resolved: boolean;
  readonly lamportClock: number;
  readonly updatedByPeerId: string;
  readonly removed: boolean;
}

export interface PeerSpatialPointerState {
  readonly peerId: string;
  readonly displayNameKo: string;
  readonly rayOrigin: SpatialVec3;
  readonly rayTarget: SpatialVec3;
  readonly hoveredCutId: string | null;
  readonly drawingOnTable: boolean;
  readonly activeToolKo: string;
  readonly deskContactM: SpatialVec3;
  readonly lamportClock: number;
}

export type SpatialDeskOperation =
  | {
      readonly opId: string;
      readonly kind: "upsert-cut";
      readonly lamportClock: number;
      readonly actorPeerId: string;
      readonly payload: Omit<FloatingLightboxCut, "lamportClock" | "updatedByPeerId">;
    }
  | {
      readonly opId: string;
      readonly kind: "upsert-sticker";
      readonly lamportClock: number;
      readonly actorPeerId: string;
      readonly payload: Omit<SpatialFeedbackSticker, "lamportClock" | "updatedByPeerId">;
    }
  | {
      readonly opId: string;
      readonly kind: "update-pointer";
      readonly lamportClock: number;
      readonly actorPeerId: string;
      readonly payload: Omit<PeerSpatialPointerState, "lamportClock">;
    };

export interface SpatialDeskSnapshot {
  readonly localPeerId: string;
  readonly lamportClock: number;
  readonly layoutMode: LightboxLayoutMode;
  readonly cuts: readonly FloatingLightboxCut[];
  readonly stickers: readonly SpatialFeedbackSticker[];
  readonly pointers: readonly PeerSpatialPointerState[];
  readonly pinnedCutCount: number;
  readonly unresolvedStickerCount: number;
  readonly activeDrawingPeerCount: number;
  readonly operationCount: number;
  readonly convergenceDigest: string;
}

interface NavigatorXrLike {
  readonly xr?: {
    isSessionSupported?: (mode: "immersive-ar" | "immersive-vr") => Promise<boolean>;
  };
}

export const CUT_STAGE_LABEL_KO: Readonly<Record<LightboxCutStage, string>> = {
  rough: "러프 콘티",
  inked: "펜선 완료",
  toned: "채색 · 톤",
  approved: "최종 승인",
};

export const CUT_STAGE_ORDER: readonly LightboxCutStage[] = [
  "rough",
  "inked",
  "toned",
  "approved",
];

export const STICKER_CATEGORY_LABEL_KO: Readonly<Record<FeedbackStickerCategory, string>> = {
  composition: "구도",
  dialogue: "대사",
  lighting: "광원",
  continuity: "연속성",
};

function roundCoord(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampVal(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function computeFnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function isIncomingVersionNewer(
  incomingClock: number,
  incomingActor: string,
  currentClock: number,
  currentActor: string,
): boolean {
  if (incomingClock !== currentClock) {
    return incomingClock > currentClock;
  }
  return incomingActor.localeCompare(currentActor) > 0;
}

/**
 * WebXR 세션 지원 여부를 안전하게 탐지한다(SSR/JSDOM/데스크톱 브라우저 완전 폴백).
 */
export async function probeSpatialComputingRuntime(
  navOverride?: NavigatorXrLike | null,
): Promise<SpatialRuntimeCapability> {
  const nav: NavigatorXrLike | undefined =
    navOverride === undefined
      ? typeof navigator !== "undefined"
        ? (navigator as unknown as NavigatorXrLike)
        : undefined
      : (navOverride ?? undefined);

  let supportsImmersiveAr = false;
  let supportsImmersiveVr = false;

  if (nav?.xr && typeof nav.xr.isSessionSupported === "function") {
    try {
      supportsImmersiveAr = await nav.xr.isSessionSupported("immersive-ar");
    } catch {
      supportsImmersiveAr = false;
    }
    try {
      supportsImmersiveVr = await nav.xr.isSessionSupported("immersive-vr");
    } catch {
      supportsImmersiveVr = false;
    }
  }

  if (supportsImmersiveAr) {
    return {
      mode: "webxr-ar",
      supportsImmersiveAr: true,
      supportsImmersiveVr,
      supportsSpatialAnchors: true,
      recommendedTableHeightM: 0.92,
      viewingRadiusM: 1.45,
      summaryKo: "WebXR 패스스루 AR · 공간 앵커 지원",
    };
  }

  if (supportsImmersiveVr) {
    return {
      mode: "webxr-vr",
      supportsImmersiveAr: false,
      supportsImmersiveVr: true,
      supportsSpatialAnchors: true,
      recommendedTableHeightM: 0.96,
      viewingRadiusM: 1.65,
      summaryKo: "WebXR 몰입형 VR 워크벤치 지원",
    };
  }

  return {
    mode: "desktop-3d-workbench",
    supportsImmersiveAr: false,
    supportsImmersiveVr: false,
    supportsSpatialAnchors: false,
    recommendedTableHeightM: 0.92,
    viewingRadiusM: 1.45,
    summaryKo: "데스크톱 3D 공간 라이트박스 시뮬레이션 모드",
  };
}

/**
 * 공중 플로팅 멀티컷 라이트박스 스토리보드 슬롯의 3D 배치 좌표를 산출한다.
 * - `curved-arc`: 크리에이터 정면 반경 1.45m 곡면 아크에 시선 높이(1.38m)로 배치.
 * - `dual-row-grid`: 상·하 2단 평면 스토리보드 벽면 배치.
 */
export function computeLightboxCutPose(
  slotIndex: number,
  totalCuts: number,
  layoutMode: LightboxLayoutMode,
  viewingRadiusM = 1.45,
): SpatialCutPose {
  const safeTotal = Math.max(1, totalCuts);
  const safeIndex = clampVal(slotIndex, 0, safeTotal - 1);

  if (layoutMode === "dual-row-grid") {
    const columns = Math.max(2, Math.ceil(safeTotal / 2));
    const col = safeIndex % columns;
    const row = Math.floor(safeIndex / columns);
    const xSpacing = 0.72;
    const ySpacing = 0.56;
    const x = (col - (columns - 1) / 2) * xSpacing;
    const y = 1.62 - row * ySpacing;
    const z = -viewingRadiusM;

    return {
      position: { x: roundCoord(x), y: roundCoord(y), z: roundCoord(z) },
      rotationYDeg: 0,
      tiltXDeg: row === 0 ? -6 : -2,
      scale: 1,
    };
  }

  // 곡면 아크 배치: 좌우 ±54° 범위 내 등간격 배치, 모든 컷이 크리에이터 시선을 향함
  const maxSpanDeg = Math.min(108, Math.max(28, (safeTotal - 1) * 26));
  const normalized = safeTotal === 1 ? 0 : safeIndex / (safeTotal - 1) - 0.5;
  const angleDeg = normalized * maxSpanDeg;
  const angleRad = (angleDeg * Math.PI) / 180;

  const x = Math.sin(angleRad) * viewingRadiusM;
  const z = -Math.cos(angleRad) * viewingRadiusM;
  const y = 1.38 + (safeIndex % 2 === 0 ? 0.04 : -0.04);

  return {
    position: { x: roundCoord(x), y: roundCoord(y), z: roundCoord(z) },
    rotationYDeg: roundCoord(-angleDeg, 1),
    tiltXDeg: -5,
    scale: 1,
  };
}

/**
 * 공중 플로팅 라이트박스 · 3D 피드백 스티커 · 동료 실시간 포인터 동기화 CRDT 상태기.
 */
export class SpatialDeskCrdtStateMachine {
  private readonly localPeerId: string;
  private lamportClock = 0;
  private localOpCounter = 0;
  private activeLayoutMode: LightboxLayoutMode = "curved-arc";

  private readonly cutRecords = new Map<string, FloatingLightboxCut>();
  private readonly stickerRecords = new Map<string, SpatialFeedbackSticker>();
  private readonly pointerRecords = new Map<string, PeerSpatialPointerState>();
  private readonly opLedger = new Map<string, SpatialDeskOperation>();

  constructor(localPeerId: string, layoutMode: LightboxLayoutMode = "curved-arc") {
    this.localPeerId = localPeerId;
    this.activeLayoutMode = layoutMode;
  }

  private nextClock(): number {
    this.lamportClock += 1;
    return this.lamportClock;
  }

  private nextOpId(): string {
    this.localOpCounter += 1;
    return `${this.localPeerId}#${this.lamportClock}.${this.localOpCounter}`;
  }

  public getLayoutMode(): LightboxLayoutMode {
    return this.activeLayoutMode;
  }

  public upsertCut(input: {
    readonly cutId: string;
    readonly cutNumber: number;
    readonly titleKo: string;
    readonly sceneTagKo: string;
    readonly stage: LightboxCutStage;
    readonly pose: SpatialCutPose;
    readonly pinned: boolean;
    readonly layerCount: number;
    readonly removed?: boolean;
  }): SpatialDeskOperation {
    const clock = this.nextClock();
    const op: SpatialDeskOperation = {
      opId: this.nextOpId(),
      kind: "upsert-cut",
      lamportClock: clock,
      actorPeerId: this.localPeerId,
      payload: {
        cutId: input.cutId,
        cutNumber: input.cutNumber,
        titleKo: input.titleKo,
        sceneTagKo: input.sceneTagKo,
        stage: input.stage,
        pose: {
          position: {
            x: roundCoord(input.pose.position.x),
            y: roundCoord(input.pose.position.y),
            z: roundCoord(input.pose.position.z),
          },
          rotationYDeg: roundCoord(input.pose.rotationYDeg, 1),
          tiltXDeg: roundCoord(input.pose.tiltXDeg, 1),
          scale: roundCoord(clampVal(input.pose.scale, 0.5, 2.0), 2),
        },
        pinned: input.pinned,
        layerCount: Math.max(1, Math.round(input.layerCount)),
        removed: input.removed ?? false,
      },
    };
    this.applyOperation(op);
    return op;
  }

  public toggleCutPin(cutId: string, pinned?: boolean): SpatialDeskOperation | null {
    const existing = this.cutRecords.get(cutId);
    if (!existing || existing.removed) return null;
    return this.upsertCut({
      cutId: existing.cutId,
      cutNumber: existing.cutNumber,
      titleKo: existing.titleKo,
      sceneTagKo: existing.sceneTagKo,
      stage: existing.stage,
      pose: existing.pose,
      pinned: pinned ?? !existing.pinned,
      layerCount: existing.layerCount,
    });
  }

  public moveCutPose(cutId: string, pose: SpatialCutPose): SpatialDeskOperation | null {
    const existing = this.cutRecords.get(cutId);
    if (!existing || existing.removed) return null;
    return this.upsertCut({
      cutId: existing.cutId,
      cutNumber: existing.cutNumber,
      titleKo: existing.titleKo,
      sceneTagKo: existing.sceneTagKo,
      stage: existing.stage,
      pose,
      pinned: existing.pinned,
      layerCount: existing.layerCount,
    });
  }

  public advanceCutStage(cutId: string): SpatialDeskOperation | null {
    const existing = this.cutRecords.get(cutId);
    if (!existing || existing.removed) return null;
    const idx = CUT_STAGE_ORDER.indexOf(existing.stage);
    const nextStage = CUT_STAGE_ORDER[(idx + 1) % CUT_STAGE_ORDER.length] ?? "rough";
    return this.upsertCut({
      cutId: existing.cutId,
      cutNumber: existing.cutNumber,
      titleKo: existing.titleKo,
      sceneTagKo: existing.sceneTagKo,
      stage: nextStage,
      pose: existing.pose,
      pinned: existing.pinned,
      layerCount: existing.layerCount,
    });
  }

  public arrangeAllCuts(layoutMode: LightboxLayoutMode): readonly SpatialDeskOperation[] {
    this.activeLayoutMode = layoutMode;
    const activeCuts = this.getActiveCuts();
    const emitted: SpatialDeskOperation[] = [];
    for (let i = 0; i < activeCuts.length; i += 1) {
      const cut = activeCuts[i];
      if (!cut) continue;
      // 고정(pinned)된 컷은 위치 보존, 미고정 컷만 자동 재배치
      if (cut.pinned) continue;
      const pose = computeLightboxCutPose(i, activeCuts.length, layoutMode);
      const op = this.moveCutPose(cut.cutId, pose);
      if (op) emitted.push(op);
    }
    return emitted;
  }

  public attachFeedbackSticker(input: {
    readonly stickerId: string;
    readonly cutId: string | null;
    readonly authorPeerId?: string;
    readonly authorNameKo: string;
    readonly category: FeedbackStickerCategory;
    readonly bodyKo: string;
    readonly anchorPosition: SpatialVec3;
    readonly resolved?: boolean;
    readonly removed?: boolean;
  }): SpatialDeskOperation {
    const clock = this.nextClock();
    const op: SpatialDeskOperation = {
      opId: this.nextOpId(),
      kind: "upsert-sticker",
      lamportClock: clock,
      actorPeerId: this.localPeerId,
      payload: {
        stickerId: input.stickerId,
        cutId: input.cutId,
        authorPeerId: input.authorPeerId ?? this.localPeerId,
        authorNameKo: input.authorNameKo,
        category: input.category,
        bodyKo: input.bodyKo.trim(),
        anchorPosition: {
          x: roundCoord(input.anchorPosition.x),
          y: roundCoord(input.anchorPosition.y),
          z: roundCoord(input.anchorPosition.z),
        },
        resolved: input.resolved ?? false,
        removed: input.removed ?? false,
      },
    };
    this.applyOperation(op);
    return op;
  }

  public toggleStickerResolved(
    stickerId: string,
    resolved?: boolean,
  ): SpatialDeskOperation | null {
    const existing = this.stickerRecords.get(stickerId);
    if (!existing || existing.removed) return null;
    return this.attachFeedbackSticker({
      stickerId: existing.stickerId,
      cutId: existing.cutId,
      authorPeerId: existing.authorPeerId,
      authorNameKo: existing.authorNameKo,
      category: existing.category,
      bodyKo: existing.bodyKo,
      anchorPosition: existing.anchorPosition,
      resolved: resolved ?? !existing.resolved,
    });
  }

  public updatePeerPointer(input: Omit<PeerSpatialPointerState, "lamportClock">): SpatialDeskOperation {
    const clock = this.nextClock();
    const op: SpatialDeskOperation = {
      opId: this.nextOpId(),
      kind: "update-pointer",
      lamportClock: clock,
      actorPeerId: this.localPeerId,
      payload: {
        peerId: input.peerId,
        displayNameKo: input.displayNameKo,
        rayOrigin: {
          x: roundCoord(input.rayOrigin.x),
          y: roundCoord(input.rayOrigin.y),
          z: roundCoord(input.rayOrigin.z),
        },
        rayTarget: {
          x: roundCoord(input.rayTarget.x),
          y: roundCoord(input.rayTarget.y),
          z: roundCoord(input.rayTarget.z),
        },
        hoveredCutId: input.hoveredCutId,
        drawingOnTable: input.drawingOnTable,
        activeToolKo: input.activeToolKo,
        deskContactM: {
          x: roundCoord(input.deskContactM.x),
          y: roundCoord(input.deskContactM.y),
          z: roundCoord(input.deskContactM.z),
        },
      },
    };
    this.applyOperation(op);
    return op;
  }

  /**
   * 단일 CRDT 연산을 멱등·교환법칙 안전하게 적용한다.
   */
  public applyOperation(op: SpatialDeskOperation): boolean {
    if (this.opLedger.has(op.opId)) {
      return false;
    }
    this.opLedger.set(op.opId, op);
    this.lamportClock = Math.max(this.lamportClock, op.lamportClock);

    if (op.kind === "upsert-cut") {
      const current = this.cutRecords.get(op.payload.cutId);
      if (
        !current ||
        isIncomingVersionNewer(
          op.lamportClock,
          op.actorPeerId,
          current.lamportClock,
          current.updatedByPeerId,
        )
      ) {
        this.cutRecords.set(op.payload.cutId, {
          ...op.payload,
          lamportClock: op.lamportClock,
          updatedByPeerId: op.actorPeerId,
        });
      }
      return true;
    }

    if (op.kind === "upsert-sticker") {
      const current = this.stickerRecords.get(op.payload.stickerId);
      if (
        !current ||
        isIncomingVersionNewer(
          op.lamportClock,
          op.actorPeerId,
          current.lamportClock,
          current.updatedByPeerId,
        )
      ) {
        this.stickerRecords.set(op.payload.stickerId, {
          ...op.payload,
          lamportClock: op.lamportClock,
          updatedByPeerId: op.actorPeerId,
        });
      }
      return true;
    }

    const currentPointer = this.pointerRecords.get(op.payload.peerId);
    if (
      !currentPointer ||
      isIncomingVersionNewer(
        op.lamportClock,
        op.actorPeerId,
        currentPointer.lamportClock,
        currentPointer.peerId,
      )
    ) {
      this.pointerRecords.set(op.payload.peerId, {
        ...op.payload,
        lamportClock: op.lamportClock,
      });
    }
    return true;
  }

  public mergeOperations(operations: readonly SpatialDeskOperation[]): number {
    let appliedCount = 0;
    for (const op of operations) {
      if (this.applyOperation(op)) {
        appliedCount += 1;
      }
    }
    return appliedCount;
  }

  public exportOperations(): readonly SpatialDeskOperation[] {
    return Array.from(this.opLedger.values()).sort((a, b) => {
      if (a.lamportClock !== b.lamportClock) return a.lamportClock - b.lamportClock;
      return a.opId.localeCompare(b.opId);
    });
  }

  public exportDeltaSince(sinceClock: number): readonly SpatialDeskOperation[] {
    return this.exportOperations().filter((op) => op.lamportClock > sinceClock);
  }

  private getActiveCuts(): readonly FloatingLightboxCut[] {
    return Array.from(this.cutRecords.values())
      .filter((cut) => !cut.removed)
      .sort((a, b) => a.cutNumber - b.cutNumber || a.cutId.localeCompare(b.cutId));
  }

  private getActiveStickers(): readonly SpatialFeedbackSticker[] {
    return Array.from(this.stickerRecords.values())
      .filter((sticker) => !sticker.removed)
      .sort((a, b) => a.stickerId.localeCompare(b.stickerId));
  }

  private getSortedPointers(): readonly PeerSpatialPointerState[] {
    return Array.from(this.pointerRecords.values()).sort((a, b) =>
      a.peerId.localeCompare(b.peerId),
    );
  }

  public computeConvergenceDigest(): string {
    const canonical = JSON.stringify({
      cuts: this.getActiveCuts(),
      stickers: this.getActiveStickers(),
      pointers: this.getSortedPointers(),
    });
    return computeFnv1aHex(canonical);
  }

  public getSnapshot(): SpatialDeskSnapshot {
    const cuts = this.getActiveCuts();
    const stickers = this.getActiveStickers();
    const pointers = this.getSortedPointers();

    return {
      localPeerId: this.localPeerId,
      lamportClock: this.lamportClock,
      layoutMode: this.activeLayoutMode,
      cuts,
      stickers,
      pointers,
      pinnedCutCount: cuts.filter((cut) => cut.pinned).length,
      unresolvedStickerCount: stickers.filter((sticker) => !sticker.resolved).length,
      activeDrawingPeerCount: pointers.filter((pointer) => pointer.drawingOnTable).length,
      operationCount: this.opLedger.size,
      convergenceDigest: this.computeConvergenceDigest(),
    };
  }
}

/**
 * 기본 웹툰 스토리보드 플로팅 라이트박스 · 3D 피드백 스티커 · 동료 포인터가 채워진 CRDT 인스턴스를 생성한다.
 */
export function createDefaultSpatialDeskMachine(
  localPeerId = "peer-local-creator",
): SpatialDeskCrdtStateMachine {
  const machine = new SpatialDeskCrdtStateMachine(localPeerId, "curved-arc");

  const initialCuts: readonly {
    readonly cutId: string;
    readonly cutNumber: number;
    readonly titleKo: string;
    readonly sceneTagKo: string;
    readonly stage: LightboxCutStage;
    readonly pinned: boolean;
    readonly layerCount: number;
  }[] = [
    {
      cutId: "cut-01",
      cutNumber: 1,
      titleKo: "빗속 골목 도입 전경",
      sceneTagKo: "오프닝 · 24mm 광각",
      stage: "toned",
      pinned: true,
      layerCount: 14,
    },
    {
      cutId: "cut-02",
      cutNumber: 2,
      titleKo: "주인공 시선 클로즈업",
      sceneTagKo: "감정선 · 85mm",
      stage: "inked",
      pinned: false,
      layerCount: 9,
    },
    {
      cutId: "cut-03",
      cutNumber: 3,
      titleKo: "우산 아래 대치 2샷",
      sceneTagKo: "긴장 전환 · 50mm",
      stage: "rough",
      pinned: false,
      layerCount: 6,
    },
    {
      cutId: "cut-04",
      cutNumber: 4,
      titleKo: "옥상 역광 실루엣 엔딩",
      sceneTagKo: "클리프행어 · 역광",
      stage: "approved",
      pinned: true,
      layerCount: 18,
    },
  ];

  for (let i = 0; i < initialCuts.length; i += 1) {
    const spec = initialCuts[i];
    if (!spec) continue;
    machine.upsertCut({
      ...spec,
      pose: computeLightboxCutPose(i, initialCuts.length, "curved-arc"),
    });
  }

  machine.attachFeedbackSticker({
    stickerId: "sticker-01",
    cutId: "cut-02",
    authorPeerId: "peer-jisu",
    authorNameKo: "지수",
    category: "lighting",
    bodyKo: "우측 림라이트를 15% 밝히면 비 젖은 머리카락 질감이 살아납니다.",
    anchorPosition: { x: -0.24, y: 1.46, z: -1.36 },
  });

  machine.attachFeedbackSticker({
    stickerId: "sticker-02",
    cutId: "cut-03",
    authorPeerId: "peer-seoyeon",
    authorNameKo: "서연",
    category: "dialogue",
    bodyKo: "우측 말풍선 꼬리를 턱선 아래로 내리면 시선 흐름이 매끄럽습니다.",
    anchorPosition: { x: 0.31, y: 1.32, z: -1.39 },
  });

  machine.updatePeerPointer({
    peerId: "peer-seoyeon",
    displayNameKo: "서연",
    rayOrigin: { x: -0.9, y: 1.25, z: -0.2 },
    rayTarget: { x: -0.32, y: 1.38, z: -1.41 },
    hoveredCutId: "cut-02",
    drawingOnTable: true,
    activeToolKo: "2B 흑연 연필",
    deskContactM: { x: -0.45, y: 0.92, z: -0.58 },
  });

  machine.updatePeerPointer({
    peerId: "peer-minho",
    displayNameKo: "민호",
    rayOrigin: { x: 0.85, y: 1.25, z: -0.15 },
    rayTarget: { x: 0.36, y: 1.36, z: -1.4 },
    hoveredCutId: "cut-03",
    drawingOnTable: true,
    activeToolKo: "G펜 잉킹 브러시",
    deskContactM: { x: 0.42, y: 0.92, z: -0.52 },
  });

  return machine;
}
