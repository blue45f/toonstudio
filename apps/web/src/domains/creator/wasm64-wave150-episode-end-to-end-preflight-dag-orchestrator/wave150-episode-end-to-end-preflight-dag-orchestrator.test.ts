import { describe, expect, it } from "vitest";
import {
  EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION,
  EpisodePreflightDagOrchestrator,
  STANDARD_PREFLIGHT_GATE_DEFINITIONS,
  STANDARD_PREFLIGHT_GATE_ORDER,
  canonicalizePreflightValue,
  encodePreflightUtf8Bytes,
  escapePreflightXml,
  planPreflightDagTopology,
  rankCriticalPreflightBlockers,
  renderPreflightDagBoardSvg,
  runEpisodePreflightDag,
  sha256PreflightUtf8Hex,
  summarizePreflightDagReportKo,
  verifyEpisodeReleasePassport,
  type EpisodePreflightArtifactSnapshot,
  type EpisodePreflightDagResult,
  type PreflightGateDefinition,
  type PreflightGateEvaluator,
} from "./index";

const RAW_HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const RAW_RGB_RE = /\brgba?\s*\(/i;
const RAW_HSL_RE = /\bhsla?\s*\(/i;

const mkGate = (
  gateId: string,
  labelKo: string,
  dependsOn: readonly string[],
  artifactSliceKey = "customHash",
  estimatedComputeMs = 150,
): PreflightGateDefinition => ({
  gateId,
  labelKo,
  shortLabelKo: labelKo,
  categoryKo: "확장",
  descriptionKo: `${labelKo} 검증 게이트`,
  dependsOn,
  artifactSliceKey,
  estimatedComputeMs,
});

const idsByDisposition = (res: EpisodePreflightDagResult, kind: "cache-hit" | "cache-miss"): string[] =>
  res.gateResults.filter((g) => g.cacheDisposition === kind).map((g) => g.gateId);

function snap(overrides?: Partial<EpisodePreflightArtifactSnapshot>): EpisodePreflightArtifactSnapshot {
  return {
    episodeId: "ep-150",
    episodeTitleKo: "150화 · 여명의 교차점",
    revisionTag: "rc-20261128-01",
    evaluatedAtIso: "2026-11-28T09:00:00.000Z",
    releaseScope: {
      platforms: ["naver-webtoon", "kakao-webtoon", "ridi", "webtoon-global", "tapas"],
      locales: ["ko-KR", "en-US", "ja-JP"],
      distributionTierKo: "정기 연재 글로벌 동시 출고",
    },
    layersHash: "layers-hash-v1",
    continuityHash: "continuity-hash-v1",
    compositionHash: "composition-hash-v1",
    dialogueHash: "dialogue-hash-v1",
    themeSettingsHash: "theme-hash-v1",
    rightsBomHash: "rights-bom-hash-v1",
    platformTargetsHash: "platform-targets-hash-v1",
    watermarkPolicyHash: "watermark-policy-hash-v1",
    ...overrides,
  };
}

function makeCountingEvaluators(): {
  readonly counts: Record<string, number>;
  readonly evaluators: Record<string, PreflightGateEvaluator>;
} {
  const counts: Record<string, number> = {};
  const evaluators: Record<string, PreflightGateEvaluator> = {};
  for (const gateId of STANDARD_PREFLIGHT_GATE_ORDER) {
    counts[gateId] = 0;
    evaluators[gateId] = (ctx) => {
      counts[gateId] = (counts[gateId] ?? 0) + 1;
      const blockers = (ctx.signal?.findings ?? []).filter((f) => f.severity === "blocker").length;
      const warnings = (ctx.signal?.findings ?? []).filter((f) => f.severity === "warning").length;
      const status =
        ctx.signal?.forcedStatus ?? (blockers > 0 ? "blocked" : warnings > 0 ? "warning" : "passed");
      return {
        status,
        findings: ctx.signal?.findings ?? [],
        metrics: { ...(ctx.signal?.metrics ?? {}), countedCall: counts[gateId] ?? 1 },
        durationMs: ctx.signal?.simulatedDurationMs ?? ctx.gate.estimatedComputeMs,
      };
    };
  }
  return { counts, evaluators };
}

describe("Wave 150 — 9대 출고 품질 게이트 DAG 토폴로지 & 위상 정렬", () => {
  it("표준 9대 게이트 DAG를 유효하게 계획하고 모든 선행 의존 순서를 보존한다", () => {
    const plan = planPreflightDagTopology();
    expect(plan).toMatchObject({ valid: true, cycleDetected: false });
    expect(plan.validationErrors).toHaveLength(0);
    expect(plan.topologicalOrder).toHaveLength(9);

    const idx = new Map(plan.topologicalOrder.map((id, i) => [id, i]));
    for (const def of STANDARD_PREFLIGHT_GATE_DEFINITIONS) {
      for (const depId of def.dependsOn) expect(idx.get(depId)!).toBeLessThan(idx.get(def.gateId)!);
    }
    expect(plan.topologicalOrder[8]).toBe("episode-release-passport");
  });

  it("표준 9대 게이트의 계층 깊이(layerDepth)와 전이 하류 파급 범위를 정확히 산출한다", () => {
    const plan = planPreflightDagTopology();
    expect(plan.layerDepthByGate).toMatchObject({
      "layer-hygiene-vram": 0,
      "rights-bom-clearance": 0,
      "wardrobe-timeline-continuity": 1,
      "eyeline-gaze-composition": 1,
      "dialogue-typeset-tails": 2,
      "oled-dual-theme-contrast": 3,
      "multiplatform-smart-slice": 4,
      "forensic-watermark-shield": 5,
      "episode-release-passport": 6,
    });
    expect(plan.transitiveDownstreamByGate["layer-hygiene-vram"]).toHaveLength(7);
    expect(plan.transitiveDownstreamByGate["eyeline-gaze-composition"]).toHaveLength(5);
    expect(plan.transitiveDownstreamByGate["dialogue-typeset-tails"]).toHaveLength(4);
    expect(plan.transitiveDownstreamByGate["rights-bom-clearance"]).toEqual([
      "forensic-watermark-shield",
      "episode-release-passport",
    ]);
    expect(plan.transitiveDownstreamByGate["episode-release-passport"]).toEqual([]);
  });

  it("2노드 직접 순환 의존성을 CYCLE_DETECTED로 fail-closed 차단한다", () => {
    const res = runEpisodePreflightDag(snap(), {
      replaceStandardGates: true,
      customGates: [mkGate("gate-a", "게이트 A", ["gate-b"]), mkGate("gate-b", "게이트 B", ["gate-a"])],
    });
    expect(res).toMatchObject({ ok: false, cycleDetected: true, releaseDecision: "blocked", releaseApproved: false });
    expect(res.validationErrors.some((e) => e.code === "CYCLE_DETECTED")).toBe(true);
    expect(res.cyclePathGateIds.length).toBeGreaterThanOrEqual(3);
    expect(verifyEpisodeReleasePassport(res.passport).valid).toBe(true);
  });

  it("3노드 간접 순환 의존성(A -> B -> C -> A)을 CYCLE_DETECTED로 탐지한다", () => {
    const res = runEpisodePreflightDag(snap(), {
      overrideGates: [{ ...STANDARD_PREFLIGHT_GATE_DEFINITIONS[0]!, dependsOn: ["dialogue-typeset-tails"] }],
    });
    expect(res).toMatchObject({ ok: false, cycleDetected: true });
    expect(res.validationErrors.some((e) => e.code === "CYCLE_DETECTED")).toBe(true);
    expect(res.cyclePathGateIds).toEqual(
      expect.arrayContaining(["layer-hygiene-vram", "eyeline-gaze-composition", "dialogue-typeset-tails"]),
    );
  });

  it("자기 자신에 대한 의존성(SELF_DEPENDENCY)을 fail-closed로 차단한다", () => {
    const res = runEpisodePreflightDag(snap(), {
      overrideGates: [{ ...STANDARD_PREFLIGHT_GATE_DEFINITIONS[5]!, dependsOn: ["rights-bom-clearance"] }],
    });
    expect(res).toMatchObject({ ok: false, cycleDetected: true });
    expect(res.validationErrors.some((e) => e.code === "SELF_DEPENDENCY")).toBe(true);
  });

  it("등록되지 않은 선행 게이트 참조(UNKNOWN_DEPENDENCY)를 fail-closed로 차단한다", () => {
    const res = runEpisodePreflightDag(snap(), {
      customGates: [mkGate("custom-sfx-sync", "효과음 동기화", ["nonexistent-gate-99"], "sfxHash")],
    });
    expect(res).toMatchObject({ ok: false, releaseApproved: false });
    expect(res.validationErrors.some((e) => e.code === "UNKNOWN_DEPENDENCY")).toBe(true);
  });

  it("중복 게이트 ID(DUPLICATE_GATE_ID)를 fail-closed로 차단한다", () => {
    const res = runEpisodePreflightDag(snap(), { customGates: [STANDARD_PREFLIGHT_GATE_DEFINITIONS[0]!] });
    expect(res.ok).toBe(false);
    expect(res.validationErrors.some((e) => e.code === "DUPLICATE_GATE_ID")).toBe(true);
  });

  it("빈 게이트 ID(EMPTY_GATE_ID)를 fail-closed로 차단한다", () => {
    const res = runEpisodePreflightDag(snap(), { customGates: [mkGate("   ", "빈 게이트", [])] });
    expect(res.ok).toBe(false);
    expect(res.validationErrors.some((e) => e.code === "EMPTY_GATE_ID")).toBe(true);
  });

  it("episodeId 또는 필수 스냅샷 해시가 비어 있으면 fail-closed로 차단한다", () => {
    expect(runEpisodePreflightDag(snap({ episodeId: "   " })).validationErrors[0]?.code).toBe("MISSING_EPISODE_ID");
    expect(runEpisodePreflightDag(snap({ rightsBomHash: "" })).validationErrors[0]?.code).toBe("INVALID_HASH_VALUE");
  });

  it("커스텀 DAG 노드와 오버라이드 의존성을 자연스럽게 확장·실행한다", () => {
    const customBgm = mkGate("scroll-bgm-cue-sync", "BGM 큐", ["dialogue-typeset-tails"], "bgmCueHash", 310);
    const passportOv: PreflightGateDefinition = {
      ...STANDARD_PREFLIGHT_GATE_DEFINITIONS[8]!,
      dependsOn: ["forensic-watermark-shield", "scroll-bgm-cue-sync"],
    };
    const r1 = runEpisodePreflightDag(snap({ customArtifactHashes: { bgmCueHash: "bgm-v1" } }), {
      customGates: [customBgm],
      overrideGates: [passportOv],
    });
    expect(r1.ok && r1.releaseApproved && r1.gateResults.length === 10).toBe(true);

    const r2 = runEpisodePreflightDag(snap({ customArtifactHashes: { bgmCueHash: "bgm-v2" } }), {
      customGates: [customBgm],
      overrideGates: [passportOv],
      previousRunCache: r1.nextCache,
    });
    expect(idsByDisposition(r2, "cache-miss")).toEqual(["scroll-bgm-cue-sync", "episode-release-passport"]);
    expect(r2.cacheMetrics.cacheHitCount).toBe(8);
  });
});

describe("Wave 150 — 증분 입력 해시 캐시 무효화 (Dirty Subgraph Invalidation)", () => {
  it("초기 실행에서 9개 게이트 전체 통과 시 approved 여권을 발급한다", () => {
    const res = runEpisodePreflightDag(snap());
    expect(res).toMatchObject({ ok: true, releaseDecision: "approved", releaseApproved: true });
    expect(res.cacheMetrics).toMatchObject({ totalGateCount: 9, cacheHitCount: 0, cacheMissCount: 9 });
    expect(res.passport).toMatchObject({ passedGateCount: 9, blockedGateCount: 0 });
    expect(res.criticalBlockers).toHaveLength(0);
  });

  it("동일 입력 재실행 시 9/9 전체 캐시 히트(100%) 및 평가기 0회 호출을 보장한다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const { counts, evaluators } = makeCountingEvaluators();
    const r2 = runEpisodePreflightDag(snap(), { previousRunCache: r1.nextCache, gateEvaluators: evaluators });
    expect(r2.cacheMetrics).toMatchObject({
      cacheHitCount: 9,
      cacheMissCount: 0,
      hitRateRatio: 1,
      actualExecutedDurationMs: 0,
      savedDurationMs: r2.cacheMetrics.estimatedFullDurationMs,
    });
    expect(Object.values(counts).every((c) => c === 0)).toBe(true);
  });

  it("rightsBomHash만 변경되면 정확히 3개 노드만 재실행하고 6개 노드는 캐시 히트한다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const { counts, evaluators } = makeCountingEvaluators();
    const r2 = runEpisodePreflightDag(snap({ rightsBomHash: "rights-bom-hash-v2" }), {
      previousRunCache: r1.nextCache,
      gateEvaluators: evaluators,
    });
    expect(idsByDisposition(r2, "cache-miss")).toEqual([
      "rights-bom-clearance",
      "forensic-watermark-shield",
      "episode-release-passport",
    ]);
    expect(idsByDisposition(r2, "cache-hit")).toEqual([
      "layer-hygiene-vram",
      "wardrobe-timeline-continuity",
      "eyeline-gaze-composition",
      "dialogue-typeset-tails",
      "oled-dual-theme-contrast",
      "multiplatform-smart-slice",
    ]);
    expect(r2.cacheMetrics).toMatchObject({ cacheMissCount: 3, cacheHitCount: 6 });
    expect([counts["rights-bom-clearance"], counts["forensic-watermark-shield"], counts["episode-release-passport"]]).toEqual([1, 1, 1]);
    expect([counts["layer-hygiene-vram"], counts["multiplatform-smart-slice"]]).toEqual([0, 0]);
    expect(r2.cacheMetrics.savedDurationMs).toBeGreaterThan(0);
  });

  it("dialogueHash만 변경되면 정확히 영향 하위 체인 5개만 무효화하고 4개는 캐시 히트한다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const { counts, evaluators } = makeCountingEvaluators();
    const r2 = runEpisodePreflightDag(snap({ dialogueHash: "dialogue-hash-v2" }), {
      previousRunCache: r1.nextCache,
      gateEvaluators: evaluators,
    });
    expect(idsByDisposition(r2, "cache-miss")).toEqual([
      "dialogue-typeset-tails",
      "oled-dual-theme-contrast",
      "multiplatform-smart-slice",
      "forensic-watermark-shield",
      "episode-release-passport",
    ]);
    expect(idsByDisposition(r2, "cache-hit")).toEqual([
      "layer-hygiene-vram",
      "wardrobe-timeline-continuity",
      "eyeline-gaze-composition",
      "rights-bom-clearance",
    ]);
    expect([counts["wardrobe-timeline-continuity"], counts["rights-bom-clearance"], counts["dialogue-typeset-tails"]]).toEqual([0, 0, 1]);
  });

  it("continuityHash만 변경되면 정확히 4개 노드만 재실행하고 5개는 캐시 히트한다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const r2 = runEpisodePreflightDag(snap({ continuityHash: "continuity-v2" }), { previousRunCache: r1.nextCache });
    expect(idsByDisposition(r2, "cache-miss")).toEqual([
      "wardrobe-timeline-continuity",
      "multiplatform-smart-slice",
      "forensic-watermark-shield",
      "episode-release-passport",
    ]);
    expect(r2.cacheMetrics.cacheHitCount).toBe(5);
  });

  it("layersHash가 변경되면 독립 입력 rights-bom-clearance 1개만 캐시 히트를 유지한다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const r2 = runEpisodePreflightDag(snap({ layersHash: "layers-v2" }), { previousRunCache: r1.nextCache });
    expect(idsByDisposition(r2, "cache-hit")).toEqual(["rights-bom-clearance"]);
    expect(r2.cacheMetrics.cacheMissCount).toBe(8);
  });

  it("watermarkPolicyHash만 변경되면 정확히 2개 노드만 재실행하고 7개는 캐시 히트한다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const r2 = runEpisodePreflightDag(snap({ watermarkPolicyHash: "wm-v2" }), { previousRunCache: r1.nextCache });
    expect(idsByDisposition(r2, "cache-miss")).toEqual(["forensic-watermark-shield", "episode-release-passport"]);
    expect(r2.cacheMetrics.cacheHitCount).toBe(7);
  });

  it("ReadonlyMap 형태의 previousRunCache도 동일하게 증분 캐시로 동작한다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const r2 = runEpisodePreflightDag(snap({ rightsBomHash: "rights-map-v2" }), {
      previousRunCache: new Map(Object.entries(r1.nextCache.entries)),
    });
    expect(r2.cacheMetrics).toMatchObject({ cacheHitCount: 6, cacheMissCount: 3 });
  });

  it("EpisodePreflightDagOrchestrator 클래스는 세션 캐시 유지·내보내기·가져오기·초기화를 지원한다", () => {
    const orch = new EpisodePreflightDagOrchestrator();
    expect(orch.run(snap()).cacheMetrics.cacheHitCount).toBe(0);
    expect(orch.getRunCount()).toBe(1);
    expect(orch.run(snap({ rightsBomHash: "rights-v2" })).cacheMetrics).toMatchObject({ cacheHitCount: 6, cacheMissCount: 3 });

    const restored = new EpisodePreflightDagOrchestrator();
    restored.importCache(orch.exportCache());
    expect(restored.run(snap({ rightsBomHash: "rights-v2" })).cacheMetrics.cacheHitCount).toBe(9);
    restored.clearCache();
    expect(restored.run(snap({ rightsBomHash: "rights-v2" })).cacheMetrics.cacheMissCount).toBe(9);
  });
});

describe("Wave 150 — Fail-Closed 차단 전파, 엄격 무경고 정책 & 트리아지 랭커", () => {
  it("layer-hygiene-vram 차단 시 하류 7개는 skipped-upstream-blocked가 되고 rights-bom-clearance는 독립 실행된다", () => {
    const { counts, evaluators } = makeCountingEvaluators();
    const res = runEpisodePreflightDag(
      snap({
        gateSignals: {
          "layer-hygiene-vram": {
            findings: [{ code: "VRAM_OVER", severity: "blocker", titleKo: "VRAM 초과", detailKo: "18컷 512MB 초과", cutIndex: 18 }],
          },
        },
      }),
      { gateEvaluators: evaluators },
    );
    expect(res).toMatchObject({ releaseDecision: "blocked", releaseApproved: false });
    expect(res.gateById["layer-hygiene-vram"]?.status).toBe("blocked");
    expect(res.gateById["rights-bom-clearance"]?.status).toBe("passed");
    expect(res.gateById["episode-release-passport"]?.status).toBe("skipped-upstream-blocked");
    expect(res.passport.skippedGateCount).toBe(7);
    expect([counts["rights-bom-clearance"], counts["wardrobe-timeline-continuity"], counts["episode-release-passport"]]).toEqual([1, 0, 0]);
    expect(res.gateById["episode-release-passport"]?.rootBlockerGateIds).toEqual(["layer-hygiene-vram"]);
  });

  it("eyeline-gaze-composition 차단 시 하류 5개만 생략되고 형제 wardrobe-timeline-continuity는 정상 실행된다", () => {
    const res = runEpisodePreflightDag(snap({ gateSignals: { "eyeline-gaze-composition": { forcedStatus: "blocked" } } }));
    expect(res.releaseDecision).toBe("blocked");
    expect(res.gateById["wardrobe-timeline-continuity"]?.status).toBe("passed");
    expect(res.gateById["rights-bom-clearance"]?.status).toBe("passed");
    for (const id of [
      "dialogue-typeset-tails",
      "oled-dual-theme-contrast",
      "multiplatform-smart-slice",
      "forensic-watermark-shield",
      "episode-release-passport",
    ]) {
      expect(res.gateById[id]?.status).toBe("skipped-upstream-blocked");
    }
  });

  it("rights-bom-clearance 차단 시 워터마크·여권 2개만 생략되고 나머지 6개 게이트는 정상 진단한다", () => {
    const res = runEpisodePreflightDag(
      snap({
        gateSignals: {
          "rights-bom-clearance": {
            findings: [{ code: "UNLICENSED_3D", severity: "blocker", titleKo: "미승인 3D 소품", detailKo: "상업 불가", assetRef: "asset://3d/chair" }],
          },
        },
      }),
    );
    expect(res.passport).toMatchObject({ passedGateCount: 6, blockedGateCount: 1, skippedGateCount: 2 });
    expect(res.gateById["multiplatform-smart-slice"]?.status).toBe("passed");
    expect(res.gateById["forensic-watermark-shield"]?.status).toBe("skipped-upstream-blocked");
    expect(res.gateById["episode-release-passport"]?.status).toBe("skipped-upstream-blocked");
  });

  it("상류 차단 해소 후 증분 재실행 시 기존 통과 6개는 캐시 히트하고 복구 체인 3개만 실행해 approved에 도달한다", () => {
    const blocked = runEpisodePreflightDag(
      snap({ rightsBomHash: "rights-blk-v1", gateSignals: { "rights-bom-clearance": { forcedStatus: "blocked" } } }),
    );
    const recovered = runEpisodePreflightDag(snap({ rightsBomHash: "rights-ok-v2" }), { previousRunCache: blocked.nextCache });
    expect(recovered).toMatchObject({ releaseDecision: "approved", releaseApproved: true });
    expect(recovered.cacheMetrics).toMatchObject({ cacheHitCount: 6, cacheMissCount: 3 });
  });

  it("경고만 존재할 때 기본 정책은 conditional-pass, strictZeroWarnings는 blocked로 승격한다", () => {
    const warnSnap = snap({
      gateSignals: {
        "oled-dual-theme-contrast": {
          findings: [{ code: "OLED_GLARE", severity: "warning", titleKo: "OLED 눈부심 주의", detailKo: "44컷 휘도 초과", cutIndex: 44 }],
        },
      },
    });
    const std = runEpisodePreflightDag(warnSnap, { strictZeroWarnings: false });
    expect(std).toMatchObject({ releaseDecision: "conditional-pass", releaseApproved: false });
    expect(std.gateById["episode-release-passport"]?.status).toBe("warning");
    expect(verifyEpisodeReleasePassport(std.passport).valid).toBe(true);

    const strict = runEpisodePreflightDag(warnSnap, { strictZeroWarnings: true, previousRunCache: std.nextCache });
    expect(strict).toMatchObject({ releaseDecision: "blocked", releaseApproved: false });
    expect(strict.cacheMetrics).toMatchObject({ cacheHitCount: 8, cacheMissCount: 1 });
    expect(strict.gateById["episode-release-passport"]?.findings.some((f) => f.code === "STRICT_ZERO_WARNINGS_VIOLATION")).toBe(true);
  });

  it("커스텀 평가기 예외 발생 시 파이프라인을 중단하지 않고 fail-closed 차단으로 전파한다", () => {
    const res = runEpisodePreflightDag(snap(), {
      gateEvaluators: {
        "dialogue-typeset-tails": () => {
          throw new Error("글꼴 메트릭 테이블 손상");
        },
      },
    });
    expect(res).toMatchObject({ ok: true, releaseDecision: "blocked" });
    expect(res.gateById["dialogue-typeset-tails"]?.findings[0]?.code).toBe("GATE_EVALUATOR_EXCEPTION");
    expect(res.gateById["oled-dual-theme-contrast"]?.status).toBe("skipped-upstream-blocked");
    expect(res.gateById["episode-release-passport"]?.status).toBe("skipped-upstream-blocked");
  });

  it("최소 수정 트리아지 랭커가 하류 파급 반경(Blast Radius)이 큰 근본 차단 항목을 최우선 정렬한다", () => {
    const res = runEpisodePreflightDag(
      snap({
        gateSignals: {
          "eyeline-gaze-composition": { findings: [{ code: "AXIS_180", severity: "blocker", titleKo: "180도 축 반전", detailKo: "21컷 반전", cutIndex: 21 }] },
          "rights-bom-clearance": { findings: [{ code: "FONT_EXP", severity: "blocker", titleKo: "폰트 만료", detailKo: "기한 경과", assetRef: "font://sfx" }] },
          "wardrobe-timeline-continuity": { findings: [{ code: "SCAR_SWAP", severity: "blocker", titleKo: "흉터 모순", detailKo: "19컷 반전", cutIndex: 19 }] },
        },
      }),
    );
    expect(res.criticalBlockers.map((b) => [b.gateId, b.transitiveBlastRadius])).toEqual([
      ["eyeline-gaze-composition", 5],
      ["wardrobe-timeline-continuity", 3],
      ["rights-bom-clearance", 2],
    ]);
    expect(rankCriticalPreflightBlockers(res.gateResults, res.topology, false)).toEqual(res.criticalBlockers);
  });

  it("동일 Blast Radius에서는 impactWeight와 계층 깊이 순으로 결정론적 트리아지 순위를 매긴다", () => {
    const res = runEpisodePreflightDag(
      snap({
        gateSignals: {
          "rights-bom-clearance": {
            findings: [
              { findingId: "f-low", code: "META", severity: "blocker", titleKo: "표기 누락", detailKo: "메타 누락", impactWeight: 1.0 },
              { findingId: "f-high", code: "INF", severity: "blocker", titleKo: "무단 어셋", detailKo: "권리 미확보", impactWeight: 2.5 },
            ],
          },
        },
      }),
    );
    expect(res.criticalBlockers.map((b) => b.findingId)).toEqual(["f-high", "f-low"]);
  });

  it("엄격 무경고 모드 차단 시 승격된 경고 항목을 promotedByStrictPolicy=true로 트리아지에 노출한다", () => {
    const res = runEpisodePreflightDag(
      snap({
        gateSignals: {
          "wardrobe-timeline-continuity": {
            findings: [{ code: "PROP_DRIFT", severity: "warning", titleKo: "소품 오차", detailKo: "시계 색감 차이" }],
          },
        },
      }),
      { strictZeroWarnings: true },
    );
    expect(res.criticalBlockers.some((i) => i.code === "STRICT_ZERO_WARNINGS_VIOLATION")).toBe(true);
    expect(res.criticalBlockers.some((i) => i.code === "PROP_DRIFT" && i.promotedByStrictPolicy)).toBe(true);
  });
});

describe("Wave 150 — FIPS 180-4 SHA-256 결정론 & 출고 여권 위변조 검증", () => {
  it("FIPS 180-4 SHA-256 공식 NIST 테스트 벡터와 UTF-8 한글 인코딩이 정확히 일치한다", () => {
    expect(sha256PreflightUtf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256PreflightUtf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256PreflightUtf8Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(encodePreflightUtf8Bytes("웹툰🚀").length).toBe(10);
  });

  it("객체 속성 삽입 순서가 달라도 정규 직렬화와 출고 여권 해시가 비트 단위로 동일하다", () => {
    expect(canonicalizePreflightValue({ z: 1, a: { d: true, b: -0 } })).toBe(
      canonicalizePreflightValue({ a: { b: 0, d: true }, z: 1 }),
    );
    const a = runEpisodePreflightDag(snap({ gateSignals: { "layer-hygiene-vram": { metrics: { vramMb: 210, empty: 0 } } } }));
    const b = runEpisodePreflightDag(snap({ gateSignals: { "layer-hygiene-vram": { metrics: { empty: 0, vramMb: 210 } } } }));
    expect(a.passport.passportSha256Hex).toBe(b.passport.passportSha256Hex);
    expect(a.dagRunSha256Hex).toBe(b.dagRunSha256Hex);
  });

  it("verifyEpisodeReleasePassport가 변조 없는 approved·conditional-pass·blocked 여권을 통과시킨다", () => {
    const ok = runEpisodePreflightDag(snap());
    const warn = runEpisodePreflightDag(snap({ gateSignals: { "dialogue-typeset-tails": { forcedStatus: "warning" } } }));
    const blk = runEpisodePreflightDag(snap({ gateSignals: { "rights-bom-clearance": { forcedStatus: "blocked" } } }));
    expect(verifyEpisodeReleasePassport(ok.passport)).toMatchObject({ valid: true, releaseApproved: true });
    expect(verifyEpisodeReleasePassport(warn.passport)).toMatchObject({ valid: true, releaseApproved: false });
    expect(verifyEpisodeReleasePassport(blk.passport)).toMatchObject({ valid: true, releaseApproved: false });
  });

  it("passportSha256Hex가 단 1글자만 변조되어도 valid=false를 반환한다", () => {
    const { passport } = runEpisodePreflightDag(snap());
    const flipped = passport.passportSha256Hex[0] === "a" ? "b" : "a";
    const check = verifyEpisodeReleasePassport({ ...passport, passportSha256Hex: `${flipped}${passport.passportSha256Hex.slice(1)}` });
    expect(check).toMatchObject({ valid: false, releaseApproved: false });
    expect(check.mismatchReasonsKo.length).toBeGreaterThan(0);
  });

  it("episodeId·revisionTag·releaseDecision·gateStatusMap·releaseScope 중 1바이트라도 변조되면 탐지한다", () => {
    const { passport } = runEpisodePreflightDag(snap());
    expect(verifyEpisodeReleasePassport({ ...passport, episodeId: "ep-151" }).valid).toBe(false);
    expect(verifyEpisodeReleasePassport({ ...passport, revisionTag: "rc-tampered" }).valid).toBe(false);
    expect(verifyEpisodeReleasePassport({ ...passport, releaseDecision: "conditional-pass" }).valid).toBe(false);
    expect(verifyEpisodeReleasePassport({ ...passport, gateStatusMap: { ...passport.gateStatusMap, "rights-bom-clearance": "blocked" } }).valid).toBe(false);
    expect(verifyEpisodeReleasePassport({ ...passport, releaseScope: { ...passport.releaseScope, platforms: ["naver-webtoon"] } }).valid).toBe(false);
    expect(verifyEpisodeReleasePassport({ ...passport, strictZeroWarnings: true }).valid).toBe(false);
  });

  it("해시를 위조해 재계산하더라도 정책 모순(blocked인데 releaseApproved=true)을 거부한다", () => {
    const { passport } = runEpisodePreflightDag(snap({ gateSignals: { "rights-bom-clearance": { forcedStatus: "blocked" } } }));
    const { passportSha256Hex: _old, ...rest } = passport;
    void _old;
    const forgedPayload = { ...rest, schemaVersion: EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION, releaseDecision: "approved" as const, releaseApproved: true };
    const forged = { ...forgedPayload, passportSha256Hex: sha256PreflightUtf8Hex(canonicalizePreflightValue(forgedPayload)) };
    expect(verifyEpisodeReleasePassport(forged)).toMatchObject({ valid: false, releaseApproved: false });
  });
});

describe("Wave 150 — 순수 OKLCH DAG 보드 SVG & 한국어 총괄 PD 브리프", () => {
  it("9-게이트 DAG 보드 SVG에 모든 게이트 노드, 방향 간선, 캐시 배지, 여권 SHA-256 봉인 도장이 포함된다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const r2 = runEpisodePreflightDag(snap({ rightsBomHash: "rights-svg-v2" }), { previousRunCache: r1.nextCache });
    const svg = renderPreflightDagBoardSvg(r2);
    expect(svg.startsWith("<svg") && svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain("캐시 히트 6/9");
    expect(svg).toContain(r2.passport.passportId);
    expect(svg).toContain(r2.passport.passportSha256Hex);
    expect(svg).toContain("marker-end=");
    for (const gateId of STANDARD_PREFLIGHT_GATE_ORDER) expect(svg).toContain(`data-gate-id="${gateId}"`);
  });

  it("승인·조건부 통과·차단·순환 오류 모든 SVG 출력에 원시 hex/rgb/hsl 색상이 전혀 포함되지 않는다", () => {
    const runs = [
      runEpisodePreflightDag(snap()),
      runEpisodePreflightDag(snap({ gateSignals: { "dialogue-typeset-tails": { forcedStatus: "warning" } } })),
      runEpisodePreflightDag(snap({ gateSignals: { "eyeline-gaze-composition": { forcedStatus: "blocked" } } })),
      runEpisodePreflightDag(snap(), { overrideGates: [{ ...STANDARD_PREFLIGHT_GATE_DEFINITIONS[0]!, dependsOn: ["episode-release-passport"] }] }),
    ];
    for (const res of runs) {
      const svg = renderPreflightDagBoardSvg(res);
      expect(svg).toContain("oklch(");
      expect(RAW_HEX_RE.test(svg) || RAW_RGB_RE.test(svg) || RAW_HSL_RE.test(svg)).toBe(false);
    }
  });

  it("SVG 출력과 XML 이스케이프 헬퍼가 악성 스크립트·따옴표 XSS 페이로드를 완전히 차단한다", () => {
    expect(escapePreflightXml(`<script>alert("x&'y")</script>`)).toBe("&lt;script&gt;alert(&quot;x&amp;&apos;y&quot;)&lt;/script&gt;");
    const res = runEpisodePreflightDag(
      snap({
        episodeTitleKo: `<script>alert("xss")</script> & 150화`,
        revisionTag: `"onload="alert(1)`,
        gateSignals: {
          "rights-bom-clearance": { findings: [{ code: "XSS", severity: "blocker", titleKo: `<img src=x onerror="alert(1)"> 오류`, detailKo: "검증" }] },
        },
      }),
    );
    const svg = renderPreflightDagBoardSvg(res);
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&lt;img ");
  });

  it("순환 의존성 fail-closed 상태에서 전용 차단 SVG 보드와 한국어 브리프를 렌더링한다", () => {
    const cyclic = runEpisodePreflightDag(snap(), {
      overrideGates: [{ ...STANDARD_PREFLIGHT_GATE_DEFINITIONS[0]!, dependsOn: ["forensic-watermark-shield"] }],
    });
    expect(renderPreflightDagBoardSvg(cyclic)).toContain("CYCLE_DETECTED");
    expect(summarizePreflightDagReportKo(cyclic)).toContain("순환 의존성 감지");
    expect(summarizePreflightDagReportKo(cyclic)).toContain(cyclic.passport.passportSha256Hex);
  });

  it("한국어 총괄 PD 출고 여권 브리프가 번역투 없이 캐시 효율·트리아지·여권 해시를 보고한다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const r2 = runEpisodePreflightDag(
      snap({
        dialogueHash: "dialogue-v2",
        gateSignals: {
          "dialogue-typeset-tails": {
            findings: [{ code: "TAIL_CROSS", severity: "blocker", titleKo: "말풍선 꼬리 교차 발생", detailKo: "27컷 교차", cutIndex: 27, fixHintKo: "14px 이동" }],
          },
        },
      }),
      { previousRunCache: r1.nextCache },
    );
    const report = summarizePreflightDagReportKo(r2);
    expect(report).toContain("[ToonStudio 에피소드 출고 여권 브리프]");
    expect(report).toContain("출고 차단");
    expect(report).toContain("캐시 히트 4개");
    expect(report).toContain("최우선 수정 트리아지");
    expect(report).toContain("말풍선 꼬리 교차 발생");
    expect(report).toContain("27컷");
    expect(report).toContain(r2.passport.passportSha256Hex);
    expect(report).not.toContain("가능하게 합니다");
    expect(report).not.toContain("직관적인 경험을 제공합니다");
  });

  it("동일 입력을 두 번 독립 실행하면 DAG 결과·여권·SVG·한국어 브리프가 비트 단위로 완전 결정론적이다", () => {
    const a = runEpisodePreflightDag(snap());
    const b = runEpisodePreflightDag(snap());
    expect(a.dagRunSha256Hex).toBe(b.dagRunSha256Hex);
    expect(a.passport.passportSha256Hex).toBe(b.passport.passportSha256Hex);
    expect(renderPreflightDagBoardSvg(a)).toBe(renderPreflightDagBoardSvg(b));
    expect(summarizePreflightDagReportKo(a)).toBe(summarizePreflightDagReportKo(b));
  });

  it("표준 9대 게이트의 effectiveInputDigest가 부모 다이제스트를 반영해 정확히 연쇄 변경된다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const r2 = runEpisodePreflightDag(snap({ rightsBomHash: "rights-chain-v2" }));
    expect(r1.gateById["layer-hygiene-vram"]?.effectiveInputDigest).toBe(r2.gateById["layer-hygiene-vram"]?.effectiveInputDigest);
    expect(r1.gateById["multiplatform-smart-slice"]?.effectiveInputDigest).toBe(r2.gateById["multiplatform-smart-slice"]?.effectiveInputDigest);
    expect(r1.gateById["rights-bom-clearance"]?.effectiveInputDigest).not.toBe(r2.gateById["rights-bom-clearance"]?.effectiveInputDigest);
    expect(r1.gateById["forensic-watermark-shield"]?.effectiveInputDigest).not.toBe(r2.gateById["forensic-watermark-shield"]?.effectiveInputDigest);
    expect(r1.gateById["episode-release-passport"]?.effectiveInputDigest).not.toBe(r2.gateById["episode-release-passport"]?.effectiveInputDigest);
  });

  it("게이트 토폴로지 구조가 바뀌면 구 토폴로지 캐시를 자동 무효화해 오탐 캐시 히트를 방지한다", () => {
    const r1 = runEpisodePreflightDag(snap());
    const r2 = runEpisodePreflightDag(snap({ customArtifactHashes: { bleedHash: "bleed-v1" } }), {
      customGates: [mkGate("custom-print-bleed", "재단선 여백", ["layer-hygiene-vram"], "bleedHash", 250)],
      previousRunCache: r1.nextCache,
    });
    expect(r2.cacheMetrics).toMatchObject({ cacheHitCount: 0, cacheMissCount: 10 });
  });
});
