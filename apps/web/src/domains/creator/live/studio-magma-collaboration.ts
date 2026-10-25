/**
 * Magma Studio 멀티플레이어 협업(Artspace / ArtJam / Huddle) 고도화 도메인 모델
 *
 * REA 정적·라이브 번들 분석(`chunk-925e93ca.js`)에서 확인된 Magma Studio의 실시간 협업 UX 기능을
 * 클린룸으로 내재화한다:
 * 1. 5단계 포인터 프레즌스 표시 모드 (`pointer-name`, `pointer`, `none`, `pointer-avatar-name`, `pointer-avatar`)
 * 2. 개인별 로컬 레이어 가시성 오버라이드 (`visibleLocally` vs `visibleGlobally` — 타 참여자에게 영향 없이 레퍼런스/러프 레이어를 개인 화면에서만 숨김·표시)
 * 3. 레이어 소유권 인수(`own` / `pendingLayerOwns` / `takeOverAllAvailableLayers` / 관리자 강제 회수)
 * 4. 음성·화상 허들 투명 비디오 HUD 오버레이 설정 및 비디오 프레임 레퍼런스 캡처 메타데이터
 * 5. ArtJam 11단계 누적 스트로크 마일스톤(150 ~ 204,800획) 트래커 및 공동 작화 잼 템플릿
 */

export type StudioMagmaPointerDisplayMode =
  | "pointer-name"
  | "pointer"
  | "none"
  | "pointer-avatar-name"
  | "pointer-avatar";

export interface CollaboratorPointerPeer {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
  readonly colorHex: string;
  readonly x: number;
  readonly y: number;
  readonly activeTool?: string;
  readonly isDrawing?: boolean;
}

export interface ProjectedCollaboratorPointerBadge {
  readonly userId: string;
  readonly visible: boolean;
  readonly showCursorIcon: boolean;
  readonly showNameLabel: boolean;
  readonly showAvatarBadge: boolean;
  readonly compactLabel: string;
  readonly avatarInitials: string;
  readonly colorHex: string;
  readonly x: number;
  readonly y: number;
}

export const STUDIO_MAGMA_POINTER_DISPLAY_MODES: readonly {
  readonly id: StudioMagmaPointerDisplayMode;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "pointer-name", labelKo: "포인터 + 이름", labelEn: "Pointer + Name" },
  { id: "pointer", labelKo: "포인터만", labelEn: "Pointer Only" },
  { id: "none", labelKo: "표시 안 함", labelEn: "None" },
  {
    id: "pointer-avatar-name",
    labelKo: "포인터 + 아바타 + 이름",
    labelEn: "Pointer + Avatar + Name",
  },
  { id: "pointer-avatar", labelKo: "포인터 + 아바타", labelEn: "Pointer + Avatar" },
];

function extractInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return Array.from(trimmed).slice(0, 2).join("").toUpperCase();
}

/**
 * Magma Studio의 5종 포인터 프레즌스 표시 모드에 맞춰 원격 참여자 커서 배지를 투영한다.
 */
export function projectCollaboratorPointerBadge(
  peer: CollaboratorPointerPeer,
  displayMode: StudioMagmaPointerDisplayMode,
): ProjectedCollaboratorPointerBadge {
  const safeName = peer.displayName.trim() || "익명 작가";
  const compactLabel =
    Array.from(safeName).length > 14
      ? `${Array.from(safeName).slice(0, 13).join("")}…`
      : safeName;

  if (displayMode === "none") {
    return {
      userId: peer.userId,
      visible: false,
      showCursorIcon: false,
      showNameLabel: false,
      showAvatarBadge: false,
      compactLabel,
      avatarInitials: extractInitials(safeName),
      colorHex: peer.colorHex,
      x: peer.x,
      y: peer.y,
    };
  }

  return {
    userId: peer.userId,
    visible: true,
    showCursorIcon: true,
    showNameLabel:
      displayMode === "pointer-name" || displayMode === "pointer-avatar-name",
    showAvatarBadge:
      displayMode === "pointer-avatar" || displayMode === "pointer-avatar-name",
    compactLabel,
    avatarInitials: extractInitials(safeName),
    colorHex: peer.colorHex,
    x: peer.x,
    y: peer.y,
  };
}

// ============================================================================
// 개인별 로컬 레이어 가시성 오버라이드 (ChangePersonalLayerVisibility)
// ============================================================================

export interface CollaborativeLayerVisibilityDescriptor {
  readonly layerId: string;
  readonly visibleGlobally: boolean;
}

export interface EffectiveLayerVisibility {
  readonly layerId: string;
  readonly visibleGlobally: boolean;
  readonly visibleLocallyOverride: boolean | null;
  readonly effectiveVisible: boolean;
  readonly isLocallyOverridden: boolean;
}

/**
 * Magma Studio(`layer.visibleLocally` / `ChangePersonalLayerVisibility`)의 개인별 로컬 레이어 가시성 저장소.
 *
 * 팀 전체가 공유하는 전역 가시성(`visibleGlobally`)을 변경하지 않고 내 화면에서만 특정 레이어(러프, 가이드, 레퍼런스 등)를
 * 켜거나 끌 수 있도록 관리한다.
 */
export class StudioPersonalLayerVisibilityStore {
  private readonly localOverrides = new Map<string, boolean>();

  public setPersonalVisibility(layerId: string, visibleLocally: boolean): void {
    if (!layerId) return;
    this.localOverrides.set(layerId, visibleLocally);
  }

  public clearPersonalOverride(layerId: string): void {
    this.localOverrides.delete(layerId);
  }

  public clearAllOverrides(): void {
    this.localOverrides.clear();
  }

  public togglePersonalVisibility(
    layer: CollaborativeLayerVisibilityDescriptor,
  ): EffectiveLayerVisibility {
    const currentEffective = this.resolveVisibility(layer).effectiveVisible;
    const nextLocal = !currentEffective;
    if (nextLocal === layer.visibleGlobally) {
      this.localOverrides.delete(layer.layerId);
    } else {
      this.localOverrides.set(layer.layerId, nextLocal);
    }
    return this.resolveVisibility(layer);
  }

  public resolveVisibility(
    layer: CollaborativeLayerVisibilityDescriptor,
  ): EffectiveLayerVisibility {
    const override = this.localOverrides.has(layer.layerId)
      ? (this.localOverrides.get(layer.layerId) ?? null)
      : null;
    const effectiveVisible = override !== null ? override : layer.visibleGlobally;
    return {
      layerId: layer.layerId,
      visibleGlobally: layer.visibleGlobally,
      visibleLocallyOverride: override,
      effectiveVisible,
      isLocallyOverridden: override !== null && override !== layer.visibleGlobally,
    };
  }
}

// ============================================================================
// 레이어 소유권 인수 및 대기 큐 (TakeOverLayer / takeOverAllAvailableLayers)
// ============================================================================

export type StudioCollaboratorRole = "owner" | "admin" | "moderator" | "editor" | "viewer";

export interface LayerOwnershipRecord {
  readonly layerId: string;
  readonly ownerUserId: string | null;
  readonly lockedByOwner: boolean;
  readonly pendingRequesterIds: readonly string[];
  readonly updatedAtMs: number;
}

export interface LayerTakeoverOutcome {
  readonly layerId: string;
  readonly status: "acquired" | "queued-pending" | "force-taken-over" | "denied";
  readonly ownerUserId: string | null;
  readonly pendingRequesterIds: readonly string[];
}

/**
 * Magma Studio(`own(layer)` / `pendingLayerOwns` / `takeOverAllAvailableLayers`)의 레이어 소유권 조정기.
 */
export class StudioLayerTakeoverCoordinator {
  private readonly records = new Map<
    string,
    {
      ownerUserId: string | null;
      lockedByOwner: boolean;
      pendingRequesterIds: string[];
      updatedAtMs: number;
    }
  >();

  public registerLayer(
    layerId: string,
    ownerUserId: string | null = null,
    lockedByOwner = false,
    nowMs = 0,
  ): void {
    this.records.set(layerId, {
      ownerUserId,
      lockedByOwner,
      pendingRequesterIds: [],
      updatedAtMs: nowMs,
    });
  }

  public getLayerRecord(layerId: string): LayerOwnershipRecord | null {
    const rec = this.records.get(layerId);
    if (!rec) return null;
    return {
      layerId,
      ownerUserId: rec.ownerUserId,
      lockedByOwner: rec.lockedByOwner,
      pendingRequesterIds: [...rec.pendingRequesterIds],
      updatedAtMs: rec.updatedAtMs,
    };
  }

  /**
   * 레이어 소유권을 요청한다.
   * - 주인이 없거나 이미 본인 소유이면 즉시 `"acquired"`
   * - 다른 사용자가 잠금 중인데 `force === true`이고 역할이 `owner`/`admin`/`moderator`이면 `"force-taken-over"`
   * - 그 외에는 `pendingLayerOwns` 대기열에 등록하고 `"queued-pending"` 반환
   */
  public requestLayerOwnership(params: {
    readonly layerId: string;
    readonly requesterUserId: string;
    readonly role: StudioCollaboratorRole;
    readonly force?: boolean;
    readonly nowMs?: number;
  }): LayerTakeoverOutcome {
    const nowMs = params.nowMs ?? 0;
    if (params.role === "viewer") {
      const current = this.records.get(params.layerId);
      return {
        layerId: params.layerId,
        status: "denied",
        ownerUserId: current?.ownerUserId ?? null,
        pendingRequesterIds: current ? [...current.pendingRequesterIds] : [],
      };
    }

    let rec = this.records.get(params.layerId);
    if (!rec) {
      rec = {
        ownerUserId: null,
        lockedByOwner: false,
        pendingRequesterIds: [],
        updatedAtMs: nowMs,
      };
      this.records.set(params.layerId, rec);
    }

    if (rec.ownerUserId === null || rec.ownerUserId === params.requesterUserId) {
      rec.ownerUserId = params.requesterUserId;
      rec.pendingRequesterIds = rec.pendingRequesterIds.filter(
        (id) => id !== params.requesterUserId,
      );
      rec.updatedAtMs = nowMs;
      return {
        layerId: params.layerId,
        status: "acquired",
        ownerUserId: rec.ownerUserId,
        pendingRequesterIds: [...rec.pendingRequesterIds],
      };
    }

    const canForce =
      Boolean(params.force) &&
      (params.role === "owner" ||
        params.role === "admin" ||
        params.role === "moderator");

    if (canForce || !rec.lockedByOwner) {
      rec.ownerUserId = params.requesterUserId;
      rec.pendingRequesterIds = rec.pendingRequesterIds.filter(
        (id) => id !== params.requesterUserId,
      );
      rec.updatedAtMs = nowMs;
      return {
        layerId: params.layerId,
        status: canForce ? "force-taken-over" : "acquired",
        ownerUserId: rec.ownerUserId,
        pendingRequesterIds: [...rec.pendingRequesterIds],
      };
    }

    if (!rec.pendingRequesterIds.includes(params.requesterUserId)) {
      rec.pendingRequesterIds.push(params.requesterUserId);
    }
    return {
      layerId: params.layerId,
      status: "queued-pending",
      ownerUserId: rec.ownerUserId,
      pendingRequesterIds: [...rec.pendingRequesterIds],
    };
  }

  /**
   * 현재 소유자를 해제하고 대기 큐 첫 번째 요청자에게 소유권을 자동 승계한다.
   */
  public releaseLayerOwnership(layerId: string, nowMs = 0): LayerOwnershipRecord | null {
    const rec = this.records.get(layerId);
    if (!rec) return null;
    const nextOwner = rec.pendingRequesterIds.shift() ?? null;
    rec.ownerUserId = nextOwner;
    rec.lockedByOwner = false;
    rec.updatedAtMs = nowMs;
    return this.getLayerRecord(layerId);
  }

  /**
   * Magma의 `takeOverAllAvailableLayers`: 주인이 없거나 잠기지 않은 모든 레이어를 일괄 인수한다.
   */
  public takeOverAllAvailableLayers(
    requesterUserId: string,
    nowMs = 0,
  ): readonly string[] {
    const acquiredIds: string[] = [];
    for (const [layerId, rec] of this.records.entries()) {
      if (rec.ownerUserId === null || (!rec.lockedByOwner && rec.ownerUserId !== requesterUserId)) {
        rec.ownerUserId = requesterUserId;
        rec.pendingRequesterIds = rec.pendingRequesterIds.filter(
          (id) => id !== requesterUserId,
        );
        rec.updatedAtMs = nowMs;
        acquiredIds.push(layerId);
      }
    }
    return acquiredIds;
  }
}

// ============================================================================
// Huddle 화상·음성 투명 비디오 오버레이 및 ArtJam 마일스톤 트래커
// ============================================================================

export interface StudioHuddleVideoOverlayConfig {
  readonly enableVideoTransparency: boolean;
  readonly overlayOpacity01: number;
  readonly showInactiveSpeakers: boolean;
  readonly videoLayout: "floating-hud" | "compact-strip" | "grid";
}

export function normalizeHuddleVideoOverlayConfig(
  input: Partial<StudioHuddleVideoOverlayConfig>,
): StudioHuddleVideoOverlayConfig {
  const rawOpacity = input.overlayOpacity01 ?? 0.72;
  const clampedOpacity = Number.isFinite(rawOpacity)
    ? Math.min(1, Math.max(0.2, rawOpacity))
    : 0.72;
  return {
    enableVideoTransparency: input.enableVideoTransparency ?? true,
    overlayOpacity01: input.enableVideoTransparency === false ? 1 : clampedOpacity,
    showInactiveSpeakers: input.showInactiveSpeakers ?? false,
    videoLayout: input.videoLayout ?? "floating-hud",
  };
}

/**
 * Magma Studio(`chunk-925e93ca.js`)의 ArtJam 11단계 누적 스트로크 마일스톤 임계값
 */
export const STUDIO_ARTJAM_STROKE_MILESTONES: readonly number[] = [
  150, 300, 600, 1200, 3200, 6400, 12800, 25600, 51200, 102400, 204800,
];

export interface ArtJamMilestoneStatus {
  readonly currentStrokes: number;
  readonly reachedMilestone: number | null;
  readonly newlyCrossedMilestone: number | null;
  readonly nextMilestone: number | null;
  readonly progressToNext01: number;
  readonly celebrationMessageKo: string | null;
  readonly celebrationMessageEn: string | null;
}

/**
 * ArtJam 세션의 누적 획 수를 평가하여 마일스톤 달성 여부와 다음 단계 진행률을 반환한다.
 */
export function evaluateArtJamStrokeMilestone(
  previousStrokeCount: number,
  currentStrokeCount: number,
): ArtJamMilestoneStatus {
  const prev = Math.max(0, Math.trunc(previousStrokeCount));
  const curr = Math.max(prev, Math.trunc(currentStrokeCount));

  let reachedMilestone: number | null = null;
  let newlyCrossedMilestone: number | null = null;
  let nextMilestone: number | null = null;

  for (const m of STUDIO_ARTJAM_STROKE_MILESTONES) {
    if (curr >= m) {
      reachedMilestone = m;
      if (prev < m) {
        newlyCrossedMilestone = m;
      }
    } else if (nextMilestone === null) {
      nextMilestone = m;
    }
  }

  const prevTier = reachedMilestone ?? 0;
  const progressToNext01 =
    nextMilestone === null
      ? 1
      : Math.min(1, Math.max(0, (curr - prevTier) / Math.max(1, nextMilestone - prevTier)));

  return {
    currentStrokes: curr,
    reachedMilestone,
    newlyCrossedMilestone,
    nextMilestone,
    progressToNext01: Number(progressToNext01.toFixed(4)),
    celebrationMessageKo:
      newlyCrossedMilestone !== null
        ? `축하합니다! 공동 캔버스 누적 ${newlyCrossedMilestone.toLocaleString("en-US")}획을 돌파했습니다!`
        : null,
    celebrationMessageEn:
      newlyCrossedMilestone !== null
        ? `Congratulations! Your ArtJam reached ${newlyCrossedMilestone.toLocaleString("en-US")} collaborative strokes!`
        : null,
  };
}

export interface StudioArtJamTemplate {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly maxParticipantsRecommended: number;
  readonly zones: readonly {
    readonly id: string;
    readonly labelKo: string;
    readonly normalizedRect: readonly [number, number, number, number];
  }[];
}

export const STUDIO_ARTJAM_TEMPLATES: readonly StudioArtJamTemplate[] = [
  {
    id: "character-sheet-jam",
    titleKo: "공동 캐릭터 시트 잼 (4인 구역)",
    titleEn: "Character Sheet Jam (4 Zones)",
    maxParticipantsRecommended: 4,
    zones: [
      { id: "zone-tl", labelKo: "정면 전신", normalizedRect: [0, 0, 0.5, 0.5] },
      { id: "zone-tr", labelKo: "후면·실루엣", normalizedRect: [0.5, 0, 0.5, 0.5] },
      { id: "zone-bl", labelKo: "표정 클로즈업", normalizedRect: [0, 0.5, 0.5, 0.5] },
      { id: "zone-br", labelKo: "액션 포즈·소품", normalizedRect: [0.5, 0.5, 0.5, 0.5] },
    ],
  },
  {
    id: "exquisite-corpse-3panel",
    titleKo: "릴레이 3단 컷툰 잼 (상·중·하)",
    titleEn: "Exquisite Corpse 3-Panel Jam",
    maxParticipantsRecommended: 3,
    zones: [
      { id: "panel-top", labelKo: "도입 컷 (머리)", normalizedRect: [0, 0, 1, 0.333] },
      { id: "panel-mid", labelKo: "전개 컷 (몸통)", normalizedRect: [0, 0.333, 1, 0.334] },
      { id: "panel-bot", labelKo: "결말 컷 (하체)", normalizedRect: [0, 0.667, 1, 0.333] },
    ],
  },
  {
    id: "expression-grid-9x",
    titleKo: "9감정 표정 챌린지 그리드",
    titleEn: "9-Emotion Expression Grid",
    maxParticipantsRecommended: 9,
    zones: Array.from({ length: 9 }, (_, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      return {
        id: `cell-${i + 1}`,
        labelKo: `표정 #${i + 1}`,
        normalizedRect: [col / 3, row / 3, 1 / 3, 1 / 3] as const,
      };
    }),
  },
];
