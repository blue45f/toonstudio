// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PORTER_PIPELINE_STAGES,
  StudioRustHotspotPorterPanel,
  TOP_5PCT_HOTSPOT_TARGETS,
  TOTAL_CODEBASE_LOC_REFERENCE,
  createInitialHotspotSession,
  createRustCandidateKernel,
  enableRustHotspotKernel,
  exportHotspotParityMarkdown,
  exportHotspotParityReportJson,
  getHotspotTarget,
  recordGoldenIoFixtures,
  rollbackToTsReference,
  runFullVerifiedPortFlow,
  runPortStep,
  runRecordStep,
  runScanStep,
  runTsReferenceKernel,
  runVerifyStep,
  scanHotspotProfile,
  summarizeParetoConcentration,
  verifyTsVsRustParity,
  type FixtureCategory,
  type HotspotTargetId,
} from "./index";

afterEach(cleanup);

const ALL_HOTSPOT_IDS: readonly HotspotTargetId[] = [
  "km16-pigment-mix",
  "tactile-bristle-stamp",
  "tile-blend-composite",
  "vrm-4bone-skinning",
  "morton-bvh-cull",
  "mls-puppet-warp",
];

const REQUIRED_FIXTURE_CATEGORIES: readonly FixtureCategory[] = [
  "nominal",
  "zero",
  "one",
  "negative",
  "nan-guard",
  "inf-guard",
  "boundary-edge",
];

describe("1. 상위 5% 핫스팟 카탈로그 & 파레토 집중도 모델", () => {
  it("6종 실전 핫스팟이 요구 ID와 고유 파레토 순위(1~6)로 정확히 정의된다", () => {
    expect(TOP_5PCT_HOTSPOT_TARGETS).toHaveLength(6);
    expect(TOP_5PCT_HOTSPOT_TARGETS.map((t) => t.id)).toEqual(ALL_HOTSPOT_IDS);
    expect([...TOP_5PCT_HOTSPOT_TARGETS.map((t) => t.paretoRank)].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("5단계 파이프라인이 Scan→Record→Port→Verify→Enable 순으로 고정된다", () => {
    expect(PORTER_PIPELINE_STAGES.map((s) => s.id)).toEqual(["scan", "record", "port", "verify", "enable"]);
    expect(PORTER_PIPELINE_STAGES.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it("파레토 요약이 76만 LOC 기준 상위 5% 이하 코드 비중으로 85% 이상 핫 연산 집중을 보고한다", () => {
    const summary = summarizeParetoConcentration();
    expect(summary.totalCodebaseLoc).toBe(TOTAL_CODEBASE_LOC_REFERENCE);
    expect(summary.hotspotCount).toBe(6);
    expect(summary.hotspotLocSharePct).toBeLessThanOrEqual(5);
    expect(summary.hotspotLocSharePct).toBeGreaterThan(3);
    expect(summary.hotspotFrameTimeSharePct).toBeGreaterThanOrEqual(85);
    expect(summary.builtRustKernelCount).toBe(4);
    expect(summary.portCandidateCount).toBe(2);
    expect(summary.disclosureKo).toContain("실측 기기 FPS 배수는 단정하지 않고");
  });

  it("모든 핫스팟이 현재 상태와 전환 목표를 분리 기술하고 실제 크레이트·심볼을 가리킨다", () => {
    for (const target of TOP_5PCT_HOTSPOT_TARGETS) {
      expect(target.currentStateKo).toContain("현재:");
      expect(target.targetStateKo).toContain("목표:");
      expect(target.currentStateEn).toContain("Current:");
      expect(target.targetStateEn).toContain("Target:");
      expect(target.wasmExportSymbol.length).toBeGreaterThan(4);
      expect(target.rustTargetCrate).toContain("crates/studio-wasm64-drawing-core/");
    }
  });

  it("scanHotspotProfile이 연산 비중 15% 이상을 p0-critical, 미만을 p1-high로 분류한다", () => {
    expect(scanHotspotProfile("tactile-bristle-stamp").recommendedPriority).toBe("p0-critical");
    expect(scanHotspotProfile("tile-blend-composite").recommendedPriority).toBe("p0-critical");
    expect(scanHotspotProfile("km16-pigment-mix").recommendedPriority).toBe("p0-critical");
    expect(scanHotspotProfile("vrm-4bone-skinning").recommendedPriority).toBe("p1-high");
    expect(scanHotspotProfile("morton-bvh-cull").recommendedPriority).toBe("p1-high");
    expect(scanHotspotProfile("mls-puppet-warp").recommendedPriority).toBe("p1-high");
  });

  it("getHotspotTarget이 모든 6종 ID를 정확히 조회한다", () => {
    for (const id of ALL_HOTSPOT_IDS) {
      expect(getHotspotTarget(id).id).toBe(id);
    }
  });
});

describe("2. 결정론적 TS 참조 커널 & 골든 I/O 경계값 녹화", () => {
  it("km16-pigment-mix가 감산 혼색을 계산하고 0·1·음수·NaN·Infinity 입력에서 유한 출력을 보장한다", () => {
    const greenMix = runTsReferenceKernel("km16-pigment-mix", [0.08, 0.24, 0.86, 0.96, 0.88, 0.12, 0.5]);
    expect(greenMix).toHaveLength(4);
    expect(greenMix[1]).toBeGreaterThan(greenMix[0] ?? 1);
    const guardOut = runTsReferenceKernel("km16-pigment-mix", [Number.NaN, -1, Number.POSITIVE_INFINITY, 2, 0.5, 0.5, Number.NaN]);
    for (const v of guardOut) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("tactile-bristle-stamp가 필압 0에서 무착색(alpha=0), 습식 임파스토에서 고착색을 산출한다", () => {
    const zero = runTsReferenceKernel("tactile-bristle-stamp", [10, 20, 0, 0.8, 0.3, 0.15]);
    expect(zero[1]).toBe(0);
    expect(zero[3]).toBe(0);
    const wet = runTsReferenceKernel("tactile-bristle-stamp", [48, 96, 0.98, 0.4, 0, 0.08]);
    expect(wet[1]).toBeGreaterThan(0.9);
    expect(wet[3]).toBeGreaterThan(230);
  });

  it("tile-blend-composite가 12종 블렌드 모드(0~11)와 ColorDodge/ColorBurn 0나눗셈 경계를 정수 0..255로 처리한다", () => {
    for (let mode = 0; mode <= 11; mode += 1) {
      const out = runTsReferenceKernel("tile-blend-composite", [180, 120, 60, 255, 255, 0, 128, 220, mode, 0.9]);
      expect(out).toHaveLength(4);
      for (const ch of out) {
        expect(Number.isInteger(ch)).toBe(true);
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(255);
      }
    }
  });

  it("vrm-4bone-skinning이 가중치 합 0 폴백과 비정규 가중치 자동 정규화를 수행한다", () => {
    const zeroW = runTsReferenceKernel("vrm-4bone-skinning", [1, 2, 3, 0, 0, 0, 0, 10, 20, 30, 0, 0, 0, 0]);
    expect(zeroW).toEqual([11, 22, 33, 1]);
    const unnorm = runTsReferenceKernel("vrm-4bone-skinning", [0.5, 1.5, -0.75, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(unnorm[3]).toBe(1);
  });

  it("morton-bvh-cull이 프러스텀 가시 판정·뒤집힌 AABB 정규화·NaN 안전 컬링·부호 없는 모턴 코드를 산출한다", () => {
    const inside = runTsReferenceKernel("morton-bvh-cull", [10, 20, -5, 30, 40, 15, -100, -100, -100, 100, 100, 100]);
    expect(inside[0]).toBe(1);
    expect(inside[1]).toBeGreaterThan(0);

    const inverted = runTsReferenceKernel("morton-bvh-cull", [30, 40, 15, 10, 20, -5, -100, -100, -100, 100, 100, 100]);
    expect(inverted).toEqual(inside);

    const nanGuard = runTsReferenceKernel("morton-bvh-cull", [Number.NaN, 0, 0, 10, 10, 10, -100, -100, -100, 100, 100, 100]);
    expect(nanGuard[0]).toBe(0);
  });

  it("mls-puppet-warp가 핀 특이점 스냅(pinSnap=1)과 단위 평행이동을 정확히 계산한다", () => {
    const snapped = runTsReferenceKernel("mls-puppet-warp", [100, 0, 0, 0, 10, -5, 100, 0, 125, 45]);
    expect(snapped[0]).toBe(125);
    expect(snapped[1]).toBe(45);
    expect(snapped[3]).toBe(1);

    const shifted = runTsReferenceKernel("mls-puppet-warp", [1, 1, 0, 0, 1, 0, 2, 0, 3, 0]);
    expect(shifted[0]).toBeCloseTo(2, 5);
    expect(shifted[1]).toBeCloseTo(1, 5);
  });

  it("recordGoldenIoFixtures가 6종 모두에 0·1·음수·NaN/Inf·경계 엣지 7개 분류(8건)를 결정론적으로 녹화한다", () => {
    for (const id of ALL_HOTSPOT_IDS) {
      const fixtures = recordGoldenIoFixtures(id);
      expect(fixtures).toHaveLength(8);
      const cats = new Set(fixtures.map((f) => f.category));
      for (const requiredCat of REQUIRED_FIXTURE_CATEGORIES) {
        expect(cats.has(requiredCat)).toBe(true);
      }
      for (const f of fixtures) {
        expect(f.inputDigest).toMatch(/^[0-9a-f]{8}$/u);
        for (const outVal of f.expectedOutput) {
          expect(Number.isFinite(outVal)).toBe(true);
        }
      }
      expect(recordGoldenIoFixtures(id)).toEqual(fixtures);
    }
  });
});

describe("3. TS vs Rust 동치 검증 엔진 (verifyTsVsRustParity)", () => {
  it("정상 Rust 후보 커널은 6종 핫스팟 전부에서 mismatchCount=0 · maxAbsErr=0 · parityPassed=true를 증명한다", () => {
    for (const id of ALL_HOTSPOT_IDS) {
      const fixtures = recordGoldenIoFixtures(id);
      const candidate = createRustCandidateKernel(id);
      const result = verifyTsVsRustParity(id, fixtures, candidate);
      expect(result.parityPassed).toBe(true);
      expect(result.mismatchCount).toBe(0);
      expect(result.maxAbsErr).toBe(0);
      expect(result.passedCases).toBe(fixtures.length);
      expect(result.proofDigest).toMatch(/^sha-fnv32-[0-9a-f]{8}$/u);
    }
  });

  it("허용오차를 넘는 의도적 오차 주입 시 모든 케이스에서 불일치가 탐지되고 parityPassed=false가 된다", () => {
    const fixtures = recordGoldenIoFixtures("km16-pigment-mix");
    const drifted = createRustCandidateKernel("km16-pigment-mix", { injectedErrorMagnitude: 0.01 });
    const result = verifyTsVsRustParity("km16-pigment-mix", fixtures, drifted, 1e-5);
    expect(result.parityPassed).toBe(false);
    expect(result.mismatchCount).toBe(fixtures.length);
    expect(result.maxAbsErr).toBeGreaterThan(0.009);
  });

  it("단 1건의 픽스처에만 오차가 주입되어도 mismatchCount=1로 즉시 동치 실패를 판정한다", () => {
    const fixtures = recordGoldenIoFixtures("tactile-bristle-stamp");
    const singleDrift = createRustCandidateKernel("tactile-bristle-stamp", {
      injectedErrorMagnitude: 0.02,
      injectedFixtureIndex: 3,
    });
    const result = verifyTsVsRustParity("tactile-bristle-stamp", fixtures, singleDrift, 1e-5);
    expect(result.parityPassed).toBe(false);
    expect(result.mismatchCount).toBe(1);
    expect(result.passedCases).toBe(fixtures.length - 1);
    expect(result.details[3]?.passed).toBe(false);
  });

  it("허용오차 이내 미세 부동소수 차이는 부동소수 커널에서 통과하고 0-diff 바이트 커널에서는 차단한다", () => {
    const kmFixtures = recordGoldenIoFixtures("km16-pigment-mix");
    const tinyKm = createRustCandidateKernel("km16-pigment-mix", { injectedErrorMagnitude: 1e-6 });
    expect(verifyTsVsRustParity("km16-pigment-mix", kmFixtures, tinyKm, 1e-5).parityPassed).toBe(true);

    const tileFixtures = recordGoldenIoFixtures("tile-blend-composite");
    const tinyTile = createRustCandidateKernel("tile-blend-composite", { injectedErrorMagnitude: 1 });
    const tileRes = verifyTsVsRustParity("tile-blend-composite", tileFixtures, tinyTile, 0);
    expect(tileRes.parityPassed).toBe(false);
    expect(tileRes.mismatchCount).toBe(tileFixtures.length);
  });

  it("Rust 후보가 NaN을 출력하면 nonFiniteOutputCount를 집계하고 parityPassed=false로 차단한다", () => {
    const fixtures = recordGoldenIoFixtures("vrm-4bone-skinning");
    const nanCandidate = createRustCandidateKernel("vrm-4bone-skinning", { injectNonFinite: true, injectedFixtureIndex: 0 });
    const result = verifyTsVsRustParity("vrm-4bone-skinning", fixtures, nanCandidate);
    expect(result.parityPassed).toBe(false);
    expect(result.nonFiniteOutputCount).toBe(1);
    expect(result.mismatchCount).toBe(1);
    expect(Number.isFinite(result.maxAbsErr)).toBe(true);
    expect(result.details[0]?.nonFiniteOrShapeError).toBe(true);
  });

  it("Rust 후보 출력 길이가 다르면 shapeMismatchCount를 집계하고 동치 실패를 반환한다", () => {
    const fixtures = recordGoldenIoFixtures("morton-bvh-cull");
    const result = verifyTsVsRustParity("morton-bvh-cull", fixtures, () => [1, 2]);
    expect(result.parityPassed).toBe(false);
    expect(result.shapeMismatchCount).toBe(fixtures.length);
    expect(result.mismatchCount).toBe(fixtures.length);
  });

  it("Rust 후보 실행 중 예외가 발생해도 크래시 없이 안전하게 불일치로 차단한다", () => {
    const fixtures = recordGoldenIoFixtures("mls-puppet-warp");
    const result = verifyTsVsRustParity("mls-puppet-warp", fixtures, () => {
      throw new Error("wasm trap unreachable");
    });
    expect(result.parityPassed).toBe(false);
    expect(result.mismatchCount).toBe(fixtures.length);
    expect(result.details[0]?.errorNoteKo).toContain("예외 발생");
  });
});

describe("4. 5단계 상태 머신 · Fail-Closed 게이트 · 원클릭 롤백", () => {
  it("Verify를 거치지 않고 Enable을 시도하면 Fail-Closed로 차단하고 ts-reference를 유지한다", () => {
    const initial = createInitialHotspotSession("tile-blend-composite");
    const blocked = enableRustHotspotKernel(initial);
    expect(blocked.routingMode).toBe("ts-reference");
    expect(blocked.gateDecision).toBe("blocked-fail-closed");
    expect(blocked.blockedReasonKo).toContain("Fail-Closed");
  });

  it("불일치가 1건이라도 있는 검증 결과로는 Enable 승격을 절대 허용하지 않는다", () => {
    const blockedFlow = runFullVerifiedPortFlow("km16-pigment-mix", {
      injectErrorEnabled: true,
      injectedErrorMagnitude: 0.01,
    });
    expect(blockedFlow.verification?.mismatchCount).toBeGreaterThan(0);
    expect(blockedFlow.routingMode).toBe("ts-reference");
    expect(blockedFlow.gateDecision).toBe("blocked-fail-closed");
    expect(blockedFlow.stage).toBe("verify");
  });

  it("다른 핫스팟의 통과 영수증을 주입해 Enable을 시도해도 hotspotId 불일치로 Fail-Closed 차단한다", () => {
    const kmVerified = runFullVerifiedPortFlow("km16-pigment-mix");
    const tileSession = createInitialHotspotSession("tile-blend-composite");
    const blocked = enableRustHotspotKernel(tileSession, kmVerified.verification ?? undefined);
    expect(blocked.routingMode).toBe("ts-reference");
    expect(blocked.gateDecision).toBe("blocked-fail-closed");
  });

  it("Scan→Record→Port→Verify→Enable 순차 진행 시 0-diff 통과 후 rust-wasm-enabled로 무중단 승격한다", () => {
    const s1 = runScanStep(createInitialHotspotSession("mls-puppet-warp"));
    const s2 = runRecordStep(s1);
    const s3 = runPortStep(s2);
    const s4 = runVerifyStep(s3);
    const s5 = enableRustHotspotKernel(s4);
    expect(s5.stage).toBe("enable");
    expect(s5.routingMode).toBe("rust-wasm-enabled");
    expect(s5.gateDecision).toBe("approved");
    expect(s5.auditTrail.map((a) => a.action)).toContain("enable-approved");
  });

  it("rollbackToTsReference 호출 시 활성 Rust 경로가 즉시 ts-reference로 복귀하고 감사 로그에 남는다", () => {
    const enabled = runFullVerifiedPortFlow("tactile-bristle-stamp");
    expect(enabled.routingMode).toBe("rust-wasm-enabled");

    const rolled = rollbackToTsReference(enabled);
    expect(rolled.routingMode).toBe("ts-reference");
    expect(rolled.gateDecision).toBe("rolled-back");
    expect(rolled.auditTrail.at(-1)?.action).toBe("rollback");
  });

  it("이미 Rust 활성 상태에서 오차가 주입된 재검증이 실패하면 즉시 TS 참조로 자동 강등한다", () => {
    const enabled = runFullVerifiedPortFlow("vrm-4bone-skinning");
    expect(enabled.routingMode).toBe("rust-wasm-enabled");

    const driftedPort = runPortStep(enabled, { injectErrorEnabled: true, injectedErrorMagnitude: 0.05 });
    const failedVerify = runVerifyStep(driftedPort);
    expect(failedVerify.routingMode).toBe("ts-reference");
    expect(failedVerify.gateDecision).toBe("blocked-fail-closed");
  });
});

describe("5. 증명 영수증 JSON & Markdown 내보내기", () => {
  it("exportHotspotParityReportJson이 v1 스키마 JSON을 직렬화하고 무손실 왕복 파싱된다", () => {
    const session = runFullVerifiedPortFlow("tile-blend-composite");
    const { json, receipt } = exportHotspotParityReportJson(session);
    const parsed = JSON.parse(json) as typeof receipt;
    expect(parsed).toEqual(receipt);
    expect(parsed.schemaVersion).toBe("toonstudio.rust-hotspot-parity-receipt.v1");
    expect(parsed.routingMode).toBe("rust-wasm-enabled");
    expect(parsed.verification?.mismatchCount).toBe(0);
    expect(parsed.honestyNoteKo).toContain("실측 FPS 배수는 별도 브라우저 프로파일링");
  });

  it("exportHotspotParityMarkdown이 검증 전/후 상태를 마크다운 표와 증명 다이제스트로 출력한다", () => {
    const before = exportHotspotParityMarkdown(createInitialHotspotSession("km16-pigment-mix"), "ko");
    expect(before).toContain("아직 Verify 단계를 실행하지 않았다");

    const after = exportHotspotParityMarkdown(runFullVerifiedPortFlow("km16-pigment-mix"), "ko");
    expect(after).toContain("sha-fnv32-");
    expect(after).toContain("| 픽스처 | 분류 | 최대 절대오차 | 판정 |");
    expect(after).toContain("| PASS |");
  });

  it("exportHotspotParityMarkdown 영문 로케일이 영문 헤더와 영문 표를 출력한다", () => {
    const md = exportHotspotParityMarkdown(runFullVerifiedPortFlow("morton-bvh-cull"), "en");
    expect(md).toContain("Top-5% Rust Hotspot Parity Receipt");
    expect(md).toContain("| Fixture | Category | absErr | Status |");
  });
});

describe("6. 스튜디오 패널 UI 인터랙션 · Fail-Closed · 시맨틱 SVG", () => {
  it("props 없이 단독 마운트되며 6종 핫스팟 카드와 5단계 스텝퍼를 렌더한다", () => {
    render(<StudioRustHotspotPorterPanel />);
    expect(screen.getByTestId("studio-rust-hotspot-porter-panel")).toBeTruthy();
    for (const id of ALL_HOTSPOT_IDS) {
      expect(screen.getByTestId(`hotspot-card-${id}`)).toBeTruthy();
    }
    for (const stage of PORTER_PIPELINE_STAGES) {
      expect(screen.getByTestId(`stage-step-${stage.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("ts-reference");
  });

  it("핫스팟 카드 클릭 시 선택 대상과 SVG data-hotspot-id가 바뀌고 세션 상태가 개별 보존된다", () => {
    render(<StudioRustHotspotPorterPanel />);
    fireEvent.click(screen.getByTestId("run-full-flow-btn"));
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("rust-wasm-enabled");

    fireEvent.click(screen.getByTestId("hotspot-card-tile-blend-composite"));
    expect(screen.getByTestId("hotspot-pareto-parity-svg").getAttribute("data-hotspot-id")).toBe("tile-blend-composite");
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("ts-reference");

    fireEvent.click(screen.getByTestId("hotspot-card-km16-pigment-mix"));
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("rust-wasm-enabled");
  });

  it("Verify 없이 Enable 버튼을 누르면 Fail-Closed 경보가 뜨고 TS 참조를 유지한다", () => {
    const onGateChange = vi.fn();
    render(<StudioRustHotspotPorterPanel onGateChange={onGateChange} />);

    fireEvent.click(screen.getByTestId("enable-rust-btn"));
    expect(screen.getByTestId("fail-closed-banner")).toBeTruthy();
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("ts-reference");
    expect(screen.getByTestId("gate-decision-badge").textContent).toBe("blocked-fail-closed");
    expect(onGateChange).toHaveBeenCalledWith(expect.objectContaining({ gateDecision: "blocked-fail-closed", routingMode: "ts-reference" }));
  });

  it("Record → Port → Verify → Enable 순차 클릭으로 0-diff 증명 후 Rust 활성 전환 및 골든 표를 표시한다", () => {
    render(<StudioRustHotspotPorterPanel initialHotspotId="tactile-bristle-stamp" />);
    expect(screen.getByTestId("fixtures-empty-notice")).toBeTruthy();

    fireEvent.click(screen.getByTestId("stage-step-record"));
    expect(screen.getByTestId("golden-fixtures-table")).toBeTruthy();

    fireEvent.click(screen.getByTestId("stage-step-port"));
    fireEvent.click(screen.getByTestId("stage-step-verify"));
    expect(screen.getByTestId("verify-mismatch-count").textContent).toBe("0 / 8");

    fireEvent.click(screen.getByTestId("stage-step-enable"));
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("rust-wasm-enabled");
    expect(screen.getByTestId("hotspot-pareto-parity-svg").getAttribute("data-routing-mode")).toBe("rust-wasm-enabled");
  });

  it("의도적 오차 주입 토글을 켜면 Fail-Closed 차단이 실시간 작동하고 활성 Rust 경로가 TS로 강등된다", () => {
    render(<StudioRustHotspotPorterPanel initialHotspotId="mls-puppet-warp" />);
    fireEvent.click(screen.getByTestId("run-full-flow-btn"));
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("rust-wasm-enabled");

    const toggle = screen.getByTestId("toggle-error-injection");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("ts-reference");
    expect(screen.getByTestId("fail-closed-banner")).toBeTruthy();
    expect(screen.getByTestId("hotspot-pareto-parity-svg").getAttribute("data-gate-decision")).toBe("blocked-fail-closed");
    expect(Number(screen.getByTestId("hotspot-pareto-parity-svg").getAttribute("data-mismatch-count"))).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("enable-rust-btn"));
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("ts-reference");
  });

  it("원클릭 5단계 실행 후 TS 참조 즉시 롤백과 세션 초기화가 정상 작동한다", () => {
    const onGateChange = vi.fn();
    render(<StudioRustHotspotPorterPanel initialHotspotId="morton-bvh-cull" onGateChange={onGateChange} />);

    const rollbackBtn = screen.getByTestId("rollback-ts-btn") as HTMLButtonElement;
    expect(rollbackBtn.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("run-full-flow-btn"));
    expect(rollbackBtn.disabled).toBe(false);
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("rust-wasm-enabled");

    fireEvent.click(rollbackBtn);
    expect(screen.getByTestId("active-routing-mode").textContent).toBe("ts-reference");
    expect(screen.getByTestId("gate-decision-badge").textContent).toBe("rolled-back");
    expect(onGateChange).toHaveBeenLastCalledWith(expect.objectContaining({ gateDecision: "rolled-back", routingMode: "ts-reference" }));

    fireEvent.click(screen.getByTestId("reset-porter-panel-btn"));
    expect(screen.getByTestId("gate-decision-badge").textContent).toBe("pending");
  });

  it("JSON/Markdown 영수증 내보내기 · 미리보기 토글 및 영문 로케일(locale='en')이 정확히 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioRustHotspotPorterPanel locale="en" initialHotspotId="vrm-4bone-skinning" onExportJson={onExportJson} />);

    expect(screen.getByTestId("hotspot-pareto-parity-svg").textContent).toContain("PARETO TOP-5% HOTSPOT CONCENTRATION");
    fireEvent.click(screen.getByTestId("run-full-flow-btn"));

    fireEvent.click(screen.getByTestId("export-parity-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const preview = screen.getByTestId("parity-receipt-preview");
    expect(preview.getAttribute("data-preview-format")).toBe("json");
    expect(preview.textContent).toContain("toonstudio.rust-hotspot-parity-receipt.v1");

    fireEvent.click(screen.getByTestId("export-parity-md-btn"));
    expect(screen.getByTestId("parity-receipt-preview").getAttribute("data-preview-format")).toBe("markdown");
    expect(screen.getByTestId("parity-receipt-preview").textContent).toContain("Top-5% Rust Hotspot Parity Receipt");

    fireEvent.click(screen.getByTestId("toggle-receipt-preview-btn"));
    expect(screen.queryByTestId("parity-receipt-preview")).toBeNull();
  });
});

describe("7. 코드 위생 · 탈-바이올렛 OKLCH · Calm Atelier 계약 자가 검증", () => {
  it("4개 소유 파일 줄 수 제한(engine<=750, panel<=700, 전체<=800)과 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "rust-hotspot-porter-engine.ts",
      "StudioRustHotspotPorterPanel.tsx",
      "index.ts",
      "rust-hotspot-porter.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "rust-hotspot-porter-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioRustHotspotPorterPanel.tsx") expect(lines).toBeLessThanOrEqual(700);

      if (file !== "rust-hotspot-porter.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("Sparkles");
        expect(src).not.toContain("하는 것을 가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공합니다");
        expect(src).not.toContain("원활한 워크플로우를 보장합니다");
      }

      if (file === "StudioRustHotspotPorterPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("패널 내 모든 oklch() 색상이 바이올렛 휴 대역(270~320도)을 0% 배제한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioRustHotspotPorterPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(5);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("렌더된 패널의 모든 버튼이 min-h-11 접근성 터치 타깃을 충족한다", () => {
    const { container } = render(<StudioRustHotspotPorterPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(16);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});
