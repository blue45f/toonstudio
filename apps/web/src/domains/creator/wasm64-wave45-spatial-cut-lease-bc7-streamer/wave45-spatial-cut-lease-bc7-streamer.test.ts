import { describe, expect, it } from "vitest";

import {
  acquireCutRoleLease,
  advanceHlc,
  compareHlc,
  computeRgbaTilePsnrDb,
  createCutRoleLeaseArbiterState,
  expireStaleCutRoleLeases,
  mergeBoundaryTilePixelDeltas,
  packGpuTextureTile,
  packManuscriptTileBatch,
  releaseCutRoleLease,
  resolveSimultaneousCutRoleClaims,
  scheduleScrollMipmapResidency,
  unpackGpuTextureTile,
  type BoundaryTileSubrectDelta,
  type CutRoleLeaseRequest,
  type HybridLogicalClock,
  type ManuscriptRole,
  type ManuscriptTileCandidate,
  type PackGpuTextureTileOptions,
  type ResidentGpuTileState,
} from "./index";

const hlc = (wallTimeMs: number, logicalCounter: number, nodeId: string): HybridLogicalClock => ({
  wallTimeMs,
  logicalCounter,
  nodeId,
});

function makeSolidTileRgba(width: number, height: number, r: number, g: number, b: number, a: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const o = p * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }
  return out;
}

function makeLeaseReq(
  cutId: string,
  role: ManuscriptRole,
  authorId: string,
  wallMs: number,
  counter = 0,
  ttlMs?: number,
): CutRoleLeaseRequest {
  return { cutId, role, authorId, hlc: hlc(wallMs, counter, authorId), nowWallTimeMs: wallMs, ttlMs };
}

describe("wasm64-wave45-spatial-cut-lease-bc7-streamer", () => {
  it("1. 동일 컷에서 선화·밑색·명암·배경·식자 담당자가 차단 없이 동시에 임대를 획득한다", () => {
    const lineart = acquireCutRoleLease(createCutRoleLeaseArbiterState(), makeLeaseReq("cut-03", "lineart", "a-line", 1_000));
    expect(lineart.ok).toBe(true);

    const lettering = acquireCutRoleLease(lineart.nextState, makeLeaseReq("cut-03", "lettering", "a-type", 1_020));
    expect(lettering.ok).toBe(true);
    expect(lettering.status).toBe("granted");
    expect(lettering.coexistingRolesInCut).toEqual(["lineart"]);

    const shade = acquireCutRoleLease(lettering.nextState, makeLeaseReq("cut-03", "shade", "a-shade", 1_040));
    expect(shade.ok).toBe(true);
    expect(shade.coexistingRolesInCut).toEqual(["lineart", "lettering"]);
  });

  it("2. 동일 컷·동일 공정은 타인의 침범을 막고 본인 재요청 시 만료 시각을 갱신한다", () => {
    const first = acquireCutRoleLease(createCutRoleLeaseArbiterState(), makeLeaseReq("cut-05", "flat", "color-a", 2_000, 0, 10_000));
    const blocked = acquireCutRoleLease(first.nextState, makeLeaseReq("cut-05", "flat", "color-b", 5_000));
    expect(blocked.ok).toBe(false);
    expect(blocked.status).toBe("rejected-active-lease");
    expect(blocked.blockingLease?.authorId).toBe("color-a");
    expect(blocked.reasonKo).toContain("밑색");

    const renewed = acquireCutRoleLease(first.nextState, makeLeaseReq("cut-05", "flat", "color-a", 6_000, 1, 12_000));
    expect(renewed.ok).toBe(true);
    expect(renewed.status).toBe("renewed");
    expect(renewed.lease?.expiresAtMs).toBe(18_000);
  });

  it("3. 담당자 연결 끊김으로 TTL이 만료된 좀비 잠금을 자동 회수하고 새 담당자에게 넘긴다", () => {
    const initial = acquireCutRoleLease(createCutRoleLeaseArbiterState(), makeLeaseReq("cut-07", "bg", "bg-dead", 1_000, 0, 5_000));
    const takeover = acquireCutRoleLease(initial.nextState, makeLeaseReq("cut-07", "bg", "bg-live", 6_001, 0, 8_000));
    expect(takeover.ok).toBe(true);
    expect(takeover.status).toBe("granted");
    expect(takeover.expiredLeases).toHaveLength(1);
    expect(takeover.expiredLeases[0]?.authorId).toBe("bg-dead");
    expect(takeover.lease?.authorId).toBe("bg-live");
  });

  it("4. 명시적 임대 반납(release)과 일괄 만료 스윕이 본인 권한만 정확히 정리한다", () => {
    const leased = acquireCutRoleLease(createCutRoleLeaseArbiterState(), makeLeaseReq("cut-02", "lettering", "type-owner", 1_000, 0, 4_000));
    expect(releaseCutRoleLease(leased.nextState, { cutId: "cut-02", role: "lettering", authorId: "intruder" }).released).toBe(false);
    const swept = expireStaleCutRoleLeases(leased.nextState, 5_500);
    expect(swept.expiredLeases).toHaveLength(1);
    expect(Object.keys(swept.state.leasesByKey)).toHaveLength(0);
  });

  it("5. 동일 컷·동일 공정 동시 경합 시 패킷 도착 순서와 무관하게 HLC 선행 의도가 승리한다", () => {
    const claimEarly: CutRoleLeaseRequest = { cutId: "cut-09", role: "lineart", authorId: "pen-a", hlc: hlc(10_000, 1, "pen-a"), nowWallTimeMs: 10_050 };
    const claimLate: CutRoleLeaseRequest = { cutId: "cut-09", role: "lineart", authorId: "pen-b", hlc: hlc(10_000, 3, "pen-b"), nowWallTimeMs: 10_050 };
    const resForward = resolveSimultaneousCutRoleClaims(createCutRoleLeaseArbiterState(), [claimEarly, claimLate], 10_050);
    const resReverse = resolveSimultaneousCutRoleClaims(createCutRoleLeaseArbiterState(), [claimLate, claimEarly], 10_050);
    expect(resForward.grantedLeases[0]?.authorId).toBe("pen-a");
    expect(resReverse.grantedLeases[0]?.authorId).toBe("pen-a");
    expect(resForward.rejectedRequests).toHaveLength(1);

    const lateFirst = acquireCutRoleLease(createCutRoleLeaseArbiterState(), claimLate);
    const earlyArrived = acquireCutRoleLease(lateFirst.nextState, claimEarly);
    expect(earlyArrived.ok).toBe(true);
    expect(earlyArrived.status).toBe("preempted-by-hlc");
    expect(earlyArrived.preemptedLease?.authorId).toBe("pen-b");
  });

  it("6. HLC 시계 전진 규칙은 물리 시계가 뒤처져도 단조 증가 전순서를 보장한다", () => {
    const c0 = hlc(5_000, 2, "node-a");
    const remoteAhead = hlc(5_200, 4, "node-b");
    const c1 = advanceHlc(c0, 4_950, remoteAhead);
    expect(c1.wallTimeMs).toBe(5_200);
    expect(c1.logicalCounter).toBe(5);
    expect(compareHlc(c0, c1)).toBe(-1);
    expect(compareHlc(remoteAhead, c1)).toBe(-1);
  });

  it("7. 컷 경계 공유 타일에서 서로 다른 영역을 수정한 두 컷의 델타를 무충돌 병합한다", () => {
    const base = makeSolidTileRgba(16, 16, 255, 255, 255, 255);
    const merged = mergeBoundaryTilePixelDeltas({
      tileWidth: 16,
      tileHeight: 16,
      baseRgba: base,
      deltas: [
        { patchId: "p1", cutId: "cut-01", role: "flat", authorId: "u1", hlc: hlc(1_000, 0, "u1"), x: 0, y: 0, width: 16, height: 8, afterRgba: makeSolidTileRgba(16, 8, 20, 40, 180, 255) },
        { patchId: "p2", cutId: "cut-02", role: "flat", authorId: "u2", hlc: hlc(1_005, 0, "u2"), x: 0, y: 8, width: 16, height: 8, afterRgba: makeSolidTileRgba(16, 8, 200, 60, 30, 255) },
      ],
    });
    expect(merged.sameRoleConflictPixelCount).toBe(0);
    expect(merged.disjointMergedPixelCount).toBe(256);
    expect(Array.from(merged.mergedRgba.slice(0, 4))).toEqual([20, 40, 180, 255]);
    expect(Array.from(merged.mergedRgba.slice(8 * 16 * 4, 8 * 16 * 4 + 4))).toEqual([200, 60, 30, 255]);
  });

  it("8. 경계 타일 동일 픽셀에서 이종 공정은 레이어 순서로 합성하고 동종 공정은 HLC로 수렴한다", () => {
    const base = makeSolidTileRgba(4, 4, 255, 255, 255, 255);
    const flatOld: BoundaryTileSubrectDelta = {
      patchId: "f-old", cutId: "cut-01", role: "flat", authorId: "a", hlc: hlc(1_000, 0, "a"),
      x: 0, y: 0, width: 2, height: 2, afterRgba: makeSolidTileRgba(2, 2, 100, 150, 220, 255),
    };
    const flatNewer: BoundaryTileSubrectDelta = {
      ...flatOld, patchId: "f-new", authorId: "b", hlc: hlc(1_000, 2, "b"),
      afterRgba: makeSolidTileRgba(2, 2, 240, 180, 90, 255),
    };
    const lineInk: BoundaryTileSubrectDelta = {
      patchId: "l-ink", cutId: "cut-01", role: "lineart", authorId: "c", hlc: hlc(990, 0, "c"),
      x: 0, y: 0, width: 1, height: 1, afterRgba: new Uint8Array([10, 10, 10, 255]),
    };

    const m1 = mergeBoundaryTilePixelDeltas({ tileWidth: 4, tileHeight: 4, baseRgba: base, deltas: [flatOld, flatNewer, lineInk] });
    const m2 = mergeBoundaryTilePixelDeltas({ tileWidth: 4, tileHeight: 4, baseRgba: base, deltas: [lineInk, flatNewer, flatOld] });
    expect(m1.mergedRgba).toEqual(m2.mergedRgba);
    expect(m1.sameRoleConflictPixelCount).toBe(4);
    expect(m1.crossRoleCompositedPixelCount).toBe(1);
    expect(Array.from(m1.mergedRgba.slice(0, 4))).toEqual([10, 10, 10, 255]);
    expect(Array.from(m1.mergedRgba.slice(4, 8))).toEqual([240, 180, 90, 255]);
  });

  it("9. 빈 투명 타일과 단색 배경 타일을 0바이트 상수 타일로 승격해 무손실 복원한다", () => {
    const emptyRgba = new Uint8Array(256 * 256 * 4);
    const packedEmpty = packGpuTextureTile({ tileId: "t-empty", width: 256, height: 256, rgba: emptyRgba });
    expect(packedEmpty.format).toBe("constant-zero-bytes");
    expect(packedEmpty.vramPayloadByteLength).toBe(0);
    expect(computeRgbaTilePsnrDb(emptyRgba, unpackGpuTextureTile(packedEmpty))).toBe(Number.POSITIVE_INFINITY);

    const creamPaper = makeSolidTileRgba(256, 256, 250, 248, 243, 255);
    const packedSolid = packGpuTextureTile({ tileId: "t-solid", width: 256, height: 256, rgba: creamPaper });
    expect(packedSolid.format).toBe("constant-zero-bytes");
    expect(packedSolid.vramPayloadByteLength).toBe(0);
    expect(computeRgbaTilePsnrDb(creamPaper, unpackGpuTextureTile(packedSolid))).toBe(Number.POSITIVE_INFINITY);
  });

  it("10. 흰 원고지 위 흑백 안티에일리어싱 선화 타일을 R8 단일 채널(75% 절감)로 패킹한다", () => {
    const rgba = makeSolidTileRgba(256, 256, 255, 255, 255, 255);
    for (let i = 0; i < 256; i += 1) {
      const o = (i * 256 + i) * 4;
      const luma = (i * 7) % 220;
      rgba[o] = luma;
      rgba[o + 1] = luma;
      rgba[o + 2] = luma;
    }
    const packed = packGpuTextureTile({ tileId: "t-paper-line", width: 256, height: 256, rgba });
    expect(packed.format).toBe("r8-paper-luma");
    expect(packed.vramPayloadByteLength).toBe(65_536);
    expect(packed.savingsRatio).toBeCloseTo(0.75, 5);
    expect(computeRgbaTilePsnrDb(rgba, unpackGpuTextureTile(packed))).toBe(Number.POSITIVE_INFINITY);
  });

  it("11. 투명 레이어 위 단색 잉크 선화를 알파 마스크 R8(75% 절감)로 무손실 압축·복원한다", () => {
    const rgba = new Uint8Array(256 * 256 * 4);
    for (let y = 16; y < 240; y += 1) {
      for (let x = 20; x < 36; x += 1) {
        const o = (y * 256 + x) * 4;
        rgba[o] = 28;
        rgba[o + 1] = 22;
        rgba[o + 2] = 35;
        rgba[o + 3] = Math.min(255, (x - 19) * 16);
      }
    }
    const packed = packGpuTextureTile({ tileId: "t-ink-alpha", width: 256, height: 256, rgba });
    expect(packed.format).toBe("r8-ink-alpha");
    expect(packed.vramPayloadByteLength).toBe(65_536);
    expect(computeRgbaTilePsnrDb(rgba, unpackGpuTextureTile(packed))).toBe(Number.POSITIVE_INFINITY);
  });

  it("12. 불투명 셀 채색·그라데이션 타일을 64비트 BC1(87.5% 절감)로 압축하고 높은 PSNR을 유지한다", () => {
    const rgba = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const o = (y * 256 + x) * 4;
        const inHair = x > 80 && x < 180 && y > 40 && y < 190;
        rgba[o] = inHair ? 52 + ((x - 80) >> 2) : 236 - (y >> 3);
        rgba[o + 1] = inHair ? 64 + ((y - 40) >> 2) : 204 - (y >> 4);
        rgba[o + 2] = inHair ? 112 + ((x + y) >> 3) : 188;
        rgba[o + 3] = 255;
      }
    }
    const packed = packGpuTextureTile({ tileId: "t-bc1-color", width: 256, height: 256, rgba });
    expect(packed.format).toBe("bc1-rgb565-64bit");
    expect(packed.vramPayloadByteLength).toBe(32_768);
    expect(packed.savingsRatio).toBeCloseTo(0.875, 5);
    expect(computeRgbaTilePsnrDb(rgba, unpackGpuTextureTile(packed))).toBeGreaterThan(36);
  });

  it("13. 반투명 명암·수채 타일을 128비트 ASTC-4x4 호환 블록(75% 절감)으로 압축하고 알파를 보존한다", () => {
    const rgba = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const o = (y * 256 + x) * 4;
        rgba[o] = 90 + (x >> 1);
        rgba[o + 1] = 70 + (y >> 2);
        rgba[o + 2] = 150 + (x >> 2);
        rgba[o + 3] = Math.min(255, Math.round((x + y) * 0.5));
      }
    }
    const packed = packGpuTextureTile({ tileId: "t-astc-shade", width: 256, height: 256, rgba });
    expect(packed.format).toBe("astc4x4-rgba-128bit");
    expect(packed.vramPayloadByteLength).toBe(65_536);
    expect(packed.savingsRatio).toBeCloseTo(0.75, 5);
    expect(computeRgbaTilePsnrDb(rgba, unpackGpuTextureTile(packed))).toBeGreaterThan(40);
  });

  it("14. 800px 원고 우측 경계 비정방·비배수 가장자리 타일도 크기 손상 없이 패킹·복원한다", () => {
    const width = 30;
    const height = 62;
    const rgba = new Uint8Array(width * height * 4);
    for (let p = 0; p < width * height; p += 1) {
      const o = p * 4;
      rgba[o] = 180 + (p % 40);
      rgba[o + 1] = 120 + (p % 30);
      rgba[o + 2] = 95;
      rgba[o + 3] = 255;
    }
    const packed = packGpuTextureTile({ tileId: "t-edge-800", width, height, rgba });
    const unpacked = unpackGpuTextureTile(packed);
    expect(unpacked.length).toBe(width * height * 4);
    expect(computeRgbaTilePsnrDb(rgba, unpacked)).toBeGreaterThan(36);
  });

  it("15. 800×20,000px 장편 원고(316개 타일) 일괄 스트리밍 시 VRAM 점유율을 75%~92% 범위로 절감한다", () => {
    const emptyTemplate = new Uint8Array(256 * 256 * 4);
    const lineTemplate = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < 256; i += 1) {
      const o = (i * 256 + 128) * 4;
      lineTemplate.set([20, 20, 20, 240], o);
    }
    const colorTemplate = new Uint8Array(256 * 256 * 4);
    const shadeTemplate = new Uint8Array(256 * 256 * 4);
    for (let p = 0; p < 256 * 256; p += 1) {
      const o = p * 4;
      colorTemplate.set([210 - ((p >> 8) >> 2), 175, 155 + ((p & 255) >> 3), 255], o);
      shadeTemplate.set([60 + (p & 31), 50 + ((p >> 8) & 15), 95, p & 255], o);
    }

    const tiles: PackGpuTextureTileOptions[] = Array.from({ length: 316 }, (_, idx) => {
      const mod = idx % 10;
      const rgba = mod < 3 ? emptyTemplate : mod < 5 ? lineTemplate : mod < 9 ? colorTemplate : shadeTemplate;
      return { tileId: `ep-tile-${idx}`, width: 256, height: 256, rgba };
    });

    const summary = packManuscriptTileBatch(tiles);
    expect(summary.packedTiles).toHaveLength(316);
    expect(summary.overallSavingsRatio).toBeGreaterThanOrEqual(0.75);
    expect(summary.overallSavingsRatio).toBeLessThanOrEqual(0.92);
    expect(summary.formatCounts["constant-zero-bytes"]).toBeGreaterThan(0);
    expect(summary.formatCounts["r8-ink-alpha"]).toBeGreaterThan(0);
    expect(summary.formatCounts["bc1-rgb565-64bit"]).toBeGreaterThan(0);
    expect(summary.formatCounts["astc4x4-rgba-128bit"]).toBeGreaterThan(0);
  });

  it("16. 정지·확대 편집 상태에서 현재 뷰포트 및 활성 컷 타일에 원본 LOD0을 최우선 배정한다", () => {
    const candidates: ManuscriptTileCandidate[] = [
      { tileId: "t-cut-vis", x: 0, y: 1_024, width: 256, height: 256, cutId: "cut-04", baseLod0VramBytes: 65_536 },
      { tileId: "t-vis-other", x: 256, y: 1_280, width: 256, height: 256, cutId: "cut-05", baseLod0VramBytes: 65_536 },
    ];
    const plan = scheduleScrollMipmapResidency({
      viewportTopY: 1_000, viewportHeightPx: 900, zoom: 1.25, scrollVelocityPxPerSec: 80,
      activeCutId: "cut-04", candidates, residentTiles: [], vramBudgetBytes: 4 * 1024 * 1024, nowTimestampMs: 5_000,
    });
    expect(plan.dominantTargetLod).toBe(0);
    expect(plan.uploads[0]?.tileId).toBe("t-cut-vis");
    expect(plan.uploads[0]?.targetLod).toBe(0);
    expect(plan.uploads[0]?.reason).toBe("visible-active-cut");
  });

  it("17. 고속 하향 스크롤 시 진행 방향 앞쪽 타일을 선제 프리페치하고 경량 LOD2로 전환한다", () => {
    const candidates: ManuscriptTileCandidate[] = Array.from({ length: 40 }, (_, row) => ({
      tileId: `row-${row}`, x: 0, y: row * 256, width: 256, height: 256, baseLod0VramBytes: 65_536,
    }));
    const plan = scheduleScrollMipmapResidency({
      viewportTopY: 2_560, viewportHeightPx: 1_024, zoom: 1, scrollVelocityPxPerSec: 5_200,
      candidates, residentTiles: [], vramBudgetBytes: 8 * 1024 * 1024, nowTimestampMs: 10_000,
    });
    expect(plan.dominantTargetLod).toBe(2);
    expect(plan.lookaheadWindowBottomY).toBeGreaterThan(2_560 + 1_024 + 1_800);
    expect(plan.uploads.filter((u) => u.reason === "velocity-prefetch" && u.targetLod === 2).length).toBeGreaterThan(4);
    expect(plan.uploads.some((u) => u.tileId === "row-18")).toBe(true);
    expect(plan.uploads.some((u) => u.tileId === "row-2")).toBe(false);
  });

  it("18. VRAM 예산 초과 시 오래되고 뷰포트에서 먼 비활성 컷 타일부터 결정론적으로 퇴거시킨다", () => {
    const residentTiles: ResidentGpuTileState[] = [
      { tileId: "res-far-old", x: 0, y: 16_000, width: 256, height: 256, cutId: "cut-30", residentLod: 0, vramBytes: 65_536, lastUsedTimestampMs: 1_000 },
      { tileId: "res-active-cut", x: 0, y: 2_800, width: 256, height: 256, cutId: "cut-05", residentLod: 0, vramBytes: 65_536, lastUsedTimestampMs: 8_500 },
      { tileId: "res-pinned", x: 0, y: 19_000, width: 256, height: 256, residentLod: 0, vramBytes: 32_768, lastUsedTimestampMs: 500, pinned: true },
    ];
    const plan = scheduleScrollMipmapResidency({
      viewportTopY: 1_000, viewportHeightPx: 800, zoom: 1, scrollVelocityPxPerSec: 0, activeCutId: "cut-05",
      candidates: [{ tileId: "new-vis-1", x: 0, y: 1_024, width: 256, height: 256, cutId: "cut-05", baseLod0VramBytes: 65_536 }],
      residentTiles, vramBudgetBytes: 170_000, nowTimestampMs: 10_000,
    });
    expect(plan.uploads.map((u) => u.tileId)).toEqual(["new-vis-1"]);
    expect(plan.evictions[0]?.tileId).toBe("res-far-old");
    expect(plan.evictions.some((e) => e.tileId === "res-pinned")).toBe(false);
    expect(plan.projectedResidentBytes).toBeLessThanOrEqual(170_000);
  });

  it("19. 이미 동일·상위 LOD로 상주 중인 타일은 재업로드를 생략하고 하위 LOD 타일만 승격한다", () => {
    const residentTiles: ResidentGpuTileState[] = [
      { tileId: "already-lod0", x: 0, y: 0, width: 256, height: 256, residentLod: 0, vramBytes: 65_536, lastUsedTimestampMs: 9_000 },
      { tileId: "needs-upgrade", x: 256, y: 0, width: 256, height: 256, residentLod: 2, vramBytes: 4_096, lastUsedTimestampMs: 9_000 },
    ];
    const candidates: ManuscriptTileCandidate[] = [
      { tileId: "already-lod0", x: 0, y: 0, width: 256, height: 256, baseLod0VramBytes: 65_536 },
      { tileId: "needs-upgrade", x: 256, y: 0, width: 256, height: 256, baseLod0VramBytes: 65_536 },
    ];
    const plan = scheduleScrollMipmapResidency({
      viewportTopY: 0, viewportHeightPx: 800, zoom: 1, scrollVelocityPxPerSec: 0,
      candidates, residentTiles, vramBudgetBytes: 512_000, nowTimestampMs: 10_000,
    });
    expect(plan.uploads).toHaveLength(1);
    expect(plan.uploads[0]?.tileId).toBe("needs-upgrade");
    expect(plan.uploads[0]?.targetLod).toBe(0);
    expect(plan.uploads[0]?.netDeltaVramBytes).toBe(65_536 - 4_096);
  });

  it("20. 1,200개 타일 장편 원고에서 실측 2ms 예산 안에 스케줄링하며 시간 소진 시 즉시 안전 절단한다", () => {
    const candidates: ManuscriptTileCandidate[] = Array.from({ length: 1_200 }, (_, i) => ({
      tileId: `long-${i}`, x: (i % 4) * 256, y: Math.floor(i / 4) * 256, width: 256, height: 256, baseLod0VramBytes: 32_768,
    }));
    const realtimePlan = scheduleScrollMipmapResidency({
      viewportTopY: 12_800, viewportHeightPx: 1_080, zoom: 1, scrollVelocityPxPerSec: 2_400,
      candidates, residentTiles: [], vramBudgetBytes: 16 * 1024 * 1024, nowTimestampMs: 20_000, frameBudgetMs: 2,
    });
    expect(realtimePlan.elapsedMs).toBeLessThanOrEqual(2);
    expect(realtimePlan.uploads.length).toBeGreaterThan(0);

    let syntheticTick = 0;
    const truncatedPlan = scheduleScrollMipmapResidency({
      viewportTopY: 12_800, viewportHeightPx: 1_080, zoom: 1, scrollVelocityPxPerSec: 2_400,
      candidates, residentTiles: [], vramBudgetBytes: 16 * 1024 * 1024, nowTimestampMs: 20_000, frameBudgetMs: 2,
      clockNowMs: () => {
        syntheticTick += 0.8;
        return syntheticTick;
      },
    });
    expect(truncatedPlan.budgetTruncated).toBe(true);
  });
});
