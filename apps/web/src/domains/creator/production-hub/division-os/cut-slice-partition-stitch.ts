/**
 * 1화 70~100컷 Cut-Slice 분할 · Lease 발급 · 앞뒤 1컷 읽기 전용 컨텍스트 · 무손실 마스터 자동 합본 엔진 (T-001).
 */

import type { DivisionRoleId, LayerFolderId } from "./layer-authority-rbac";

export type CutSliceStatus = "unassigned" | "leased" | "submitted" | "retake" | "approved";

export type PartitionStrategy = "by-cut-count" | "by-scene";

export interface EpisodeCutAsset {
  readonly cutIndex: number;
  readonly sceneId: string;
  readonly sceneTitleKo: string;
  readonly sceneTitleEn: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly primaryLayerFolder: LayerFolderId;
  readonly contentHash: string;
  readonly dialogueCount: number;
}

export interface CutSliceContextCut {
  readonly cutIndex: number;
  readonly sceneId: string;
  readonly contentHash: string;
  readonly readOnly: true;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface CutSliceLease {
  readonly leaseId: string;
  readonly holderId: string;
  readonly holderName: string;
  readonly role: DivisionRoleId;
  readonly issuedAtIso: string;
  readonly expiresAtIso: string;
}

export interface CutSlicePacket {
  readonly sliceId: string;
  readonly episodeId: string;
  readonly label: string;
  readonly sceneIds: readonly string[];
  readonly startCut: number;
  readonly endCut: number;
  readonly cuts: readonly EpisodeCutAsset[];
  readonly previousCutContext: CutSliceContextCut | null;
  readonly nextCutContext: CutSliceContextCut | null;
  readonly status: CutSliceStatus;
  readonly lease: CutSliceLease | null;
  readonly revision: number;
  readonly retakeNote: string | null;
  readonly updatedAtIso: string;
}

export interface PartitionEpisodeInput {
  readonly episodeId: string;
  readonly cuts: readonly EpisodeCutAsset[];
  readonly strategy?: PartitionStrategy;
  readonly targetSliceSize?: number;
  readonly createdAtIso?: string;
}

export interface IssueCutSliceLeaseInput {
  readonly holderId: string;
  readonly holderName: string;
  readonly role: DivisionRoleId;
  readonly nowIso: string;
  readonly ttlMinutes?: number;
}

export interface IssueCutSliceLeaseResult {
  readonly ok: boolean;
  readonly slice: CutSlicePacket;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface CutSliceTransitionInput {
  readonly type: "submit" | "approve" | "retake";
  readonly actorId: string;
  readonly note?: string;
  readonly nowIso: string;
}

export interface MasterEpisodeManuscript {
  readonly episodeId: string;
  readonly totalCuts: number;
  readonly totalHeightPx: number;
  readonly widthPx: number;
  readonly sliceCount: number;
  readonly cuts: readonly EpisodeCutAsset[];
  readonly manuscriptChecksum: string;
  readonly stitchedAtIso: string;
}

export interface MasterEpisodeStitchResult {
  readonly ok: boolean;
  readonly manuscript: MasterEpisodeManuscript | null;
  readonly collisionCount: number;
  readonly gapCount: number;
  readonly duplicateCutIndices: readonly number[];
  readonly missingCutIndices: readonly number[];
  readonly outOfRangeCutIndices: readonly number[];
  readonly unapprovedSliceIds: readonly string[];
  readonly summaryKo: string;
  readonly summaryEn: string;
}

function fnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function toContextCut(cut: EpisodeCutAsset): CutSliceContextCut {
  return {
    cutIndex: cut.cutIndex,
    sceneId: cut.sceneId,
    contentHash: cut.contentHash,
    readOnly: true,
    summaryKo: `${cut.cutIndex}컷 (${cut.sceneTitleKo} · 읽기 전용 참조)`,
    summaryEn: `Cut ${cut.cutIndex} (${cut.sceneTitleEn} · read-only ref)`,
  };
}

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

/** 1화 70~100컷 샘플 원고 자산 생성기 (시뮬레이션 워크벤치 및 단위 테스트용) */
export function createSampleEpisodeCuts(
  episodeId: string,
  totalCuts = 80,
): readonly EpisodeCutAsset[] {
  const clamped = Math.max(10, Math.min(120, Math.round(totalCuts)));
  const scenePlan: readonly {
    readonly id: string;
    readonly titleKo: string;
    readonly titleEn: string;
    readonly ratio: number;
  }[] = [
    { id: "S01", titleKo: "도입 · 밤거리 우편국", titleEn: "Intro · Night Post Office", ratio: 0.25 },
    { id: "S02", titleKo: "전개 · 봉인된 편지 대치", titleEn: "Build · Sealed Letter Tension", ratio: 0.25 },
    { id: "S03", titleKo: "클라이맥스 · 지붕 추격전", titleEn: "Climax · Rooftop Chase", ratio: 0.3 },
    { id: "S04", titleKo: "엔딩 · 다음 화 후크", titleEn: "Ending · Cliffhanger Hook", ratio: 0.2 },
  ];

  const cuts: EpisodeCutAsset[] = [];
  for (let cutIndex = 1; cutIndex <= clamped; cutIndex += 1) {
    const progress = (cutIndex - 1) / clamped;
    let cumulative = 0;
    let selectedScene = scenePlan[scenePlan.length - 1];
    for (const candidate of scenePlan) {
      cumulative += candidate.ratio;
      if (progress < cumulative) {
        selectedScene = candidate;
        break;
      }
    }
    const heightPx = 960 + ((cutIndex * 137) % 680);
    const dialogueCount = cutIndex % 4 === 0 ? 3 : (cutIndex % 3) + 1;
    cuts.push({
      cutIndex,
      sceneId: selectedScene.id,
      sceneTitleKo: selectedScene.titleKo,
      sceneTitleEn: selectedScene.titleEn,
      widthPx: 800,
      heightPx,
      primaryLayerFolder: cutIndex % 5 === 0 ? "10_BG_3D" : "20_LINE",
      contentHash: fnv1aHex(`${episodeId}:cut:${cutIndex}:${selectedScene.id}:${heightPx}`),
      dialogueCount,
    });
  }
  return cuts;
}

/**
 * 1화 원고를 구간(컷 수) 또는 씬 단위로 Cut-Slice 패킷으로 분할하고
 * 각 슬라이스에 앞뒤 1컷 읽기 전용 컨텍스트를 부착한다.
 */
export function partitionEpisodeIntoCutSlices(
  input: PartitionEpisodeInput,
): readonly CutSlicePacket[] {
  const {
    episodeId,
    cuts,
    strategy = "by-cut-count",
    targetSliceSize = 20,
    createdAtIso = "2026-11-21T09:00:00.000Z",
  } = input;

  if (cuts.length === 0) return [];

  const sorted = [...cuts].sort((left, right) => left.cutIndex - right.cutIndex);
  const groups: EpisodeCutAsset[][] = [];

  if (strategy === "by-scene") {
    for (const cut of sorted) {
      const currentGroup = groups[groups.length - 1];
      if (!currentGroup || currentGroup[0]?.sceneId !== cut.sceneId) {
        groups.push([cut]);
      } else {
        currentGroup.push(cut);
      }
    }
  } else {
    const sliceSize = Math.max(5, Math.min(40, Math.round(targetSliceSize)));
    for (let offset = 0; offset < sorted.length; offset += sliceSize) {
      groups.push(sorted.slice(offset, offset + sliceSize));
    }
  }

  return groups.map((groupCuts, index) => {
    const first = groupCuts[0];
    const last = groupCuts[groupCuts.length - 1];
    const startCut = first?.cutIndex ?? 1;
    const endCut = last?.cutIndex ?? startCut;
    const prevAsset = sorted.find((candidate) => candidate.cutIndex === startCut - 1) ?? null;
    const nextAsset = sorted.find((candidate) => candidate.cutIndex === endCut + 1) ?? null;
    const sceneIds = [...new Set(groupCuts.map((cut) => cut.sceneId))];
    const sliceNumber = padTwo(index + 1);
    return {
      sliceId: `${episodeId}-slice-${sliceNumber}`,
      episodeId,
      label: `Slice ${sliceNumber} · Cut ${padTwo(startCut)}–${padTwo(endCut)}`,
      sceneIds,
      startCut,
      endCut,
      cuts: groupCuts,
      previousCutContext: prevAsset ? toContextCut(prevAsset) : null,
      nextCutContext: nextAsset ? toContextCut(nextAsset) : null,
      status: "unassigned",
      lease: null,
      revision: 1,
      retakeNote: null,
      updatedAtIso: createdAtIso,
    };
  });
}

export function isCutSliceLeaseActive(lease: CutSliceLease | null, nowIso: string): boolean {
  if (!lease) return false;
  return Date.parse(lease.expiresAtIso) > Date.parse(nowIso);
}

/** 슬라이스 단독 Lease 발급 (타 작업자 활성 Lease 보유 시 차단) */
export function issueCutSliceLease(
  slice: CutSlicePacket,
  input: IssueCutSliceLeaseInput,
): IssueCutSliceLeaseResult {
  const ttlMinutes = Math.max(15, Math.min(480, input.ttlMinutes ?? 120));
  if (
    slice.lease
    && slice.lease.holderId !== input.holderId
    && isCutSliceLeaseActive(slice.lease, input.nowIso)
  ) {
    return {
      ok: false,
      slice,
      reasonKo: `${slice.label}은(는) ${slice.lease.holderName}님이 ${slice.lease.expiresAtIso}까지 점유 중입니다.`,
      reasonEn: `${slice.label} is currently leased by ${slice.lease.holderName} until ${slice.lease.expiresAtIso}.`,
    };
  }

  const nowMs = Date.parse(input.nowIso);
  const expiresAtIso = new Date(nowMs + ttlMinutes * 60_000).toISOString();
  const nextLease: CutSliceLease = {
    leaseId: `lease-${slice.sliceId}-${fnv1aHex(`${input.holderId}:${input.nowIso}`)}`,
    holderId: input.holderId,
    holderName: input.holderName,
    role: input.role,
    issuedAtIso: input.nowIso,
    expiresAtIso,
  };

  const nextSlice: CutSlicePacket = {
    ...slice,
    status: slice.status === "approved" ? "approved" : "leased",
    lease: nextLease,
    updatedAtIso: input.nowIso,
  };

  return {
    ok: true,
    slice: nextSlice,
    reasonKo: `${input.holderName}님에게 ${slice.label} 작업 Lease(${ttlMinutes}분)를 발급했습니다.`,
    reasonEn: `Issued ${ttlMinutes}m work lease on ${slice.label} to ${input.holderName}.`,
  };
}

/** 슬라이스 상태 전이 (검수 제출 / 승인 / 리테이크) */
export function transitionCutSliceStatus(
  slice: CutSlicePacket,
  input: CutSliceTransitionInput,
): CutSlicePacket {
  if (input.type === "submit") {
    return {
      ...slice,
      status: "submitted",
      revision: slice.revision + 1,
      retakeNote: null,
      updatedAtIso: input.nowIso,
    };
  }
  if (input.type === "approve") {
    return {
      ...slice,
      status: "approved",
      retakeNote: null,
      updatedAtIso: input.nowIso,
    };
  }
  return {
    ...slice,
    status: "retake",
    revision: slice.revision + 1,
    retakeNote: input.note?.trim() || "AD 리테이크 요청",
    updatedAtIso: input.nowIso,
  };
}

/**
 * 승인된 Cut-Slice들을 마스터 회차 원고로 무손실 자동 합본한다.
 * 미승인 슬라이스, 컷 인덱스 중복(충돌), 컷 누락(갭), 범위 이탈이 1건이라도 있으면 Fail-Closed한다.
 */
export function autoStitchEpisodeSlices(input: {
  readonly episodeId: string;
  readonly expectedTotalCuts: number;
  readonly slices: readonly CutSlicePacket[];
  readonly stitchedAtIso?: string;
}): MasterEpisodeStitchResult {
  const {
    episodeId,
    expectedTotalCuts,
    slices,
    stitchedAtIso = "2026-11-21T12:00:00.000Z",
  } = input;

  const unapprovedSliceIds = slices
    .filter((slice) => slice.status !== "approved")
    .map((slice) => slice.sliceId);

  const seenCounts = new Map<number, number>();
  const collected: EpisodeCutAsset[] = [];
  const outOfRangeCutIndices: number[] = [];

  for (const slice of slices) {
    for (const cut of slice.cuts) {
      if (cut.cutIndex < 1 || cut.cutIndex > expectedTotalCuts) {
        outOfRangeCutIndices.push(cut.cutIndex);
      }
      seenCounts.set(cut.cutIndex, (seenCounts.get(cut.cutIndex) ?? 0) + 1);
      collected.push(cut);
    }
  }

  const duplicateCutIndices: number[] = [];
  for (const [cutIndex, count] of seenCounts.entries()) {
    if (count > 1) duplicateCutIndices.push(cutIndex);
  }
  duplicateCutIndices.sort((a, b) => a - b);

  const missingCutIndices: number[] = [];
  for (let expected = 1; expected <= expectedTotalCuts; expected += 1) {
    if (!seenCounts.has(expected)) missingCutIndices.push(expected);
  }

  outOfRangeCutIndices.sort((a, b) => a - b);

  const hasFailure =
    unapprovedSliceIds.length > 0
    || duplicateCutIndices.length > 0
    || missingCutIndices.length > 0
    || outOfRangeCutIndices.length > 0
    || expectedTotalCuts <= 0;

  if (hasFailure) {
    return {
      ok: false,
      manuscript: null,
      collisionCount: duplicateCutIndices.length,
      gapCount: missingCutIndices.length,
      duplicateCutIndices,
      missingCutIndices,
      outOfRangeCutIndices,
      unapprovedSliceIds,
      summaryKo: `합본 차단: 미승인 ${unapprovedSliceIds.length}건 · 충돌 ${duplicateCutIndices.length}건 · 누락 ${missingCutIndices.length}건`,
      summaryEn: `Stitch blocked: ${unapprovedSliceIds.length} unapproved, ${duplicateCutIndices.length} collisions, ${missingCutIndices.length} gaps.`,
    };
  }

  const orderedCuts = [...collected].sort((left, right) => left.cutIndex - right.cutIndex);
  const totalHeightPx = orderedCuts.reduce((sum, cut) => sum + cut.heightPx, 0);
  const widthPx = orderedCuts[0]?.widthPx ?? 800;
  const manifestDigestInput = orderedCuts
    .map((cut) => `${cut.cutIndex}:${cut.contentHash}:${cut.heightPx}`)
    .join("|");
  const manuscriptChecksum = `ms-${fnv1aHex(manifestDigestInput)}-${fnv1aHex(`${episodeId}:${orderedCuts.length}:${totalHeightPx}`)}`;

  return {
    ok: true,
    manuscript: {
      episodeId,
      totalCuts: orderedCuts.length,
      totalHeightPx,
      widthPx,
      sliceCount: slices.length,
      cuts: orderedCuts,
      manuscriptChecksum,
      stitchedAtIso,
    },
    collisionCount: 0,
    gapCount: 0,
    duplicateCutIndices: [],
    missingCutIndices: [],
    outOfRangeCutIndices: [],
    unapprovedSliceIds: [],
    summaryKo: `무손실 마스터 합본 완료: ${orderedCuts.length}컷 (${slices.length}개 슬라이스 · 충돌 0 · 누락 0 · 높이 ${totalHeightPx.toLocaleString("ko-KR")}px)`,
    summaryEn: `Lossless master stitch complete: ${orderedCuts.length} cuts (${slices.length} slices · 0 collisions · 0 gaps · ${totalHeightPx.toLocaleString("en-US")}px).`,
  };
}
