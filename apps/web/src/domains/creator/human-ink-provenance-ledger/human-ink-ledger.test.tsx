// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CRYPTOGRAPHIC_SCOPE_PREVIEW,
  GENESIS_CHAIN_HASH_HEX,
  HUMAN_INK_SCENARIOS,
  StudioHumanInkLedgerPanel,
  buildHumanInkMerkleLedger,
  buildScenarioHumanInkLedger,
  computePressureEntropyBits,
  computeTileDeltaHashHex,
  computeVelocityVariance,
  createNextHumanPenStrokeEvent,
  encodeUtf8Bytes,
  evaluateRightsBomContaminationGate,
  exportC2paHumanInkManifestJson,
  fnv1a64Hex,
  fnv1a64Words,
  formatOklch,
  getHumanInkScenario,
  injectSingleByteTamper,
  isVioletSlopHue,
  sanitizeNonVioletHue,
  verifyHumanInkLedger,
  verifyMerkleInclusionProof,
  type HumanInkLedgerEvent,
  type TamperMutationMode,
} from "./index";

afterEach(cleanup);

function assertZeroVioletAndRawColors(markup: string): void {
  expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(markup).not.toMatch(/\brgba?\s*\(/iu);
  expect(markup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of markup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 결정론적 FNV-1a 64-bit(이중 32비트, BigInt 미사용) 해시 · 텔레메트리 · OKLCH 가드", () => {
  it("공식 IETF FNV-1a 64-bit 표준 테스트 벡터('', 'a', 'foobar')와 100% 일치한다", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64Hex("foobar")).toBe("85944171f73967e8");
  });

  it("한글 UTF-8 및 서로게이트 페어 입력을 결정론적 16자리 16진 64-bit 해시로 변환한다", () => {
    const h1 = fnv1a64Hex("툰스튜디오-인간작화-원장-🖋️");
    const h2 = fnv1a64Hex("툰스튜디오-인간작화-원장-🖋️");
    const h3 = fnv1a64Hex("툰스튜디오-인간작화-원장-🖊️");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{16}$/u);
    expect(encodeUtf8Bytes("가")).toEqual([0xea, 0xb0, 0x80]);
  });

  it("fnv1a64Words가 항상 32비트 무부호 정수 워드 쌍을 반환하고 1문자 변화에 완전히 다른 해시를 만든다", () => {
    const a = fnv1a64Words("stroke-pressure:3.4200");
    const b = fnv1a64Words("stroke-pressure:3.4201");
    expect(a.hi).toBeGreaterThanOrEqual(0);
    expect(a.hi).toBeLessThanOrEqual(0xffffffff);
    expect(a.lo).toBeGreaterThanOrEqual(0);
    expect(a.lo).toBeLessThanOrEqual(0xffffffff);
    expect(`${a.hi}:${a.lo}`).not.toBe(`${b.hi}:${b.lo}`);
  });

  it("computePressureEntropyBits가 균일 필압(0 bits)과 자연 인간 필압(>2.5 bits)을 정확히 구분한다", () => {
    expect(computePressureEntropyBits([])).toBe(0);
    expect(computePressureEntropyBits([0.5, 0.5, 0.5, 0.5])).toBe(0);
    const humanSamples = [0.08, 0.16, 0.24, 0.33, 0.42, 0.51, 0.62, 0.74, 0.85, 0.93];
    const entropy = computePressureEntropyBits(humanSamples);
    expect(entropy).toBeGreaterThan(3.0);
    expect(entropy).toBeLessThanOrEqual(4.0);
  });

  it("computeVelocityVariance가 일정 속도(0)와 가감속 인간 스트로크(>0.1)를 정확히 산출한다", () => {
    expect(computeVelocityVariance([])).toBe(0);
    expect(computeVelocityVariance([120])).toBe(0);
    expect(computeVelocityVariance([120, 120, 120, 120])).toBe(0);
    const variance = computeVelocityVariance([60, 180, 310, 95, 240, 140]);
    expect(variance).toBeGreaterThan(0.15);
    expect(variance).toBeLessThanOrEqual(4);
  });

  it("computeTileDeltaHashHex가 픽셀 데이터 없이 결정론적 16자리 64-bit 타일 델타 해시를 만든다", () => {
    const d1 = computeTileDeltaHashHex("L-INK-MAIN", [1, 2, 128, 128], "stroke-1");
    const d2 = computeTileDeltaHashHex("L-INK-MAIN", [1, 2, 128, 128], "stroke-1");
    const d3 = computeTileDeltaHashHex("L-INK-MAIN", [1, 3, 128, 128], "stroke-1");
    expect(d1).toBe(d2);
    expect(d1).not.toBe(d3);
    expect(d1).toMatch(/^[0-9a-f]{16}$/u);
  });

  it("탈-바이올렛 OKLCH 가드가 270~320° 보라 휴(음수·360° 초과 포함)를 전부 배제한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(-65)).toBe(true);
    expect(isVioletSlopHue(655)).toBe(true);
    expect(isVioletSlopHue(156)).toBe(false);
    expect(isVioletSlopHue(222)).toBe(false);
    for (let h = 270; h <= 320; h += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(h))).toBe(false);
    }
    const formatted = formatOklch({ l: 0.55, c: 0.14, h: 288 }, 0.85);
    expect(formatted).toBe("oklch(0.55 0.14 248 / 0.85)");
    assertZeroVioletAndRawColors(formatted);
  });
});

describe("2. 이진 머클 트리 · 순차 해시 체인 · O(log N) 포함 증명 · 영지식 요약", () => {
  it("3종 필수 원고 시나리오가 모두 제공되고 동일 입력에 100% 동일한 머클 루트를 생성한다", () => {
    expect(HUMAN_INK_SCENARIOS.map((s) => s.id)).toEqual([
      "pure-human-ink",
      "hybrid-human-cc0-3d",
      "contaminated-external-scan",
    ]);
    for (const sc of HUMAN_INK_SCENARIOS) {
      const a = buildScenarioHumanInkLedger(sc.id);
      const b = buildScenarioHumanInkLedger(sc.id);
      expect(a.merkleRootHex).toBe(b.merkleRootHex);
      expect(a.chainTipHex).toBe(b.chainTipHex);
      expect(a.events.length).toBe(8);
      expect(a.treeDepth).toBe(3);
    }
  });

  it("빈 원고(N=0), 단일 리프(N=1), 홀수 리프(N=3, 5, 7) 및 확장 리프(N=9, 16, 17)에서 O(log N) 깊이를 정확히 지킨다", () => {
    const emptyLedger = buildHumanInkMerkleLedger([]);
    expect(emptyLedger.events).toHaveLength(0);
    expect(emptyLedger.chainTipHex).toBe(GENESIS_CHAIN_HASH_HEX);
    expect(emptyLedger.treeDepth).toBe(0);

    const baseEvents: HumanInkLedgerEvent[] = [];
    for (let i = 0; i < 17; i += 1) {
      baseEvents.push(createNextHumanPenStrokeEvent(baseEvents));
    }

    for (const count of [1, 2, 3, 5, 7, 8, 9, 16, 17]) {
      const slice = baseEvents.slice(0, count);
      const ledger = buildHumanInkMerkleLedger(slice);
      const expectedDepth = count <= 1 ? 0 : Math.ceil(Math.log2(count));
      expect(ledger.treeDepth).toBe(expectedDepth);
      expect(ledger.inclusionProofs).toHaveLength(count);
      for (let idx = 0; idx < count; idx += 1) {
        const proof = ledger.inclusionProofs[idx];
        expect(proof.siblings).toHaveLength(expectedDepth);
        const check = verifyMerkleInclusionProof(proof, {
          candidateEvent: slice[idx],
          expectedMerkleRootHex: ledger.merkleRootHex,
        });
        expect(check.valid).toBe(true);
        expect(check.reasonCode).toBe("verified");
      }
    }
  });

  it("홀수 리프(N=5)의 마지막 리프 포함 증명에서 duplicated=true 패딩 형제 해시가 정확히 검증된다", () => {
    const pure = getHumanInkScenario("pure-human-ink").events.slice(0, 5);
    const ledger = buildHumanInkMerkleLedger(pure);
    const lastProof = ledger.inclusionProofs[4];
    expect(lastProof.siblings[0].duplicated).toBe(true);
    expect(lastProof.siblings[0].siblingHashHex).toBe(lastProof.leafHashHex);
    const verified = verifyMerkleInclusionProof(lastProof, {
      candidateEvent: pure[4],
      expectedMerkleRootHex: ledger.merkleRootHex,
    });
    expect(verified.valid).toBe(true);
  });

  it("모든 시나리오의 전체 리프(24건)에 대해 O(log N) 머클 포함 증명이 100% 통과한다", () => {
    for (const sc of HUMAN_INK_SCENARIOS) {
      const ledger = buildScenarioHumanInkLedger(sc.id);
      for (let i = 0; i < ledger.events.length; i += 1) {
        const res = verifyMerkleInclusionProof(ledger.inclusionProofs[i], {
          candidateEvent: ledger.events[i],
          expectedMerkleRootHex: ledger.merkleRootHex,
        });
        expect(res.valid).toBe(true);
        expect(res.leafHashMatchesEvent).toBe(true);
        expect(res.computedRootHex).toBe(ledger.merkleRootHex);
      }
    }
  });

  it("후보 이벤트 1개 필드가 변조되면 verifyMerkleInclusionProof가 leaf-hash-mismatch로 즉시 실패한다", () => {
    const ledger = buildScenarioHumanInkLedger("pure-human-ink");
    const tampered = injectSingleByteTamper(ledger.events, 3, "pressure-1bit");
    const res = verifyMerkleInclusionProof(ledger.inclusionProofs[3], {
      candidateEvent: tampered.tamperedEvents[3],
      expectedMerkleRootHex: ledger.merkleRootHex,
    });
    expect(res.valid).toBe(false);
    expect(res.leafHashMatchesEvent).toBe(false);
    expect(res.reasonCode).toBe("leaf-hash-mismatch");
    expect(res.computedRootHex).not.toBe(ledger.merkleRootHex);
  });

  it("포함 증명의 형제 해시 또는 기대 루트를 1글자 조작하면 root-mismatch/proof-root-mismatch로 실패한다", () => {
    const ledger = buildScenarioHumanInkLedger("hybrid-human-cc0-3d");
    const proof = ledger.inclusionProofs[2];
    const corruptedProof = {
      ...proof,
      siblings: proof.siblings.map((s, idx) =>
        idx === 0 ? { ...s, siblingHashHex: "0000000000000000" } : s,
      ),
    };
    const res1 = verifyMerkleInclusionProof(corruptedProof, {
      expectedMerkleRootHex: ledger.merkleRootHex,
    });
    expect(res1.valid).toBe(false);
    expect(res1.reasonCode).toBe("root-mismatch");

    const res2 = verifyMerkleInclusionProof(proof, {
      expectedMerkleRootHex: "ffffffffffffffff",
    });
    expect(res2.valid).toBe(false);
    expect(res2.reasonCode).toBe("proof-root-mismatch");
  });

  it("이벤트 순서를 맞바꾸면 머클 루트와 순차 해시 체인 팁이 모두 달라진다", () => {
    const base = getHumanInkScenario("pure-human-ink").events;
    const swapped = [base[1], base[0], ...base.slice(2)];
    const ledgerA = buildHumanInkMerkleLedger(base);
    const ledgerB = buildHumanInkMerkleLedger(swapped);
    expect(ledgerA.merkleRootHex).not.toBe(ledgerB.merkleRootHex);
    expect(ledgerA.chainTipHex).not.toBe(ledgerB.chainTipHex);
  });

  it("영지식 요약 증명이 원본 픽셀·PSD 0바이트 노출을 유지하면서 비율을 정확히 계산한다", () => {
    const pure = buildScenarioHumanInkLedger("pure-human-ink").summaryProof;
    expect(pure.zeroPixelExposure).toBe(true);
    expect(pure.rawPsdIncluded).toBe(false);
    expect(pure.rawPixelBytesExposed).toBe(0);
    expect(pure.humanInkStrokeRatioPercent).toBe(100);
    expect(pure.proceduralCc0AssetRatioPercent).toBe(0);
    expect(pure.unverifiedExternalScanCount).toBe(0);

    const hybrid = buildScenarioHumanInkLedger("hybrid-human-cc0-3d").summaryProof;
    expect(hybrid.humanInkStrokeRatioPercent).toBe(62.5);
    expect(hybrid.proceduralCc0AssetRatioPercent).toBe(12.5);
    expect(hybrid.bg3dPlacementRatioPercent).toBe(12.5);
    expect(hybrid.nonDestructiveFilterRatioPercent).toBe(12.5);
    expect(hybrid.unverifiedExternalScanCount).toBe(0);
  });
});

describe("3. 1바이트 변조 100% 적발 검증기 (verifyHumanInkLedger · injectSingleByteTamper)", () => {
  it("무변조 원장은 valid=true, tampered=false, tamperedLeafIndices=[]로 검증 통과한다", () => {
    for (const sc of HUMAN_INK_SCENARIOS) {
      const ledger = buildScenarioHumanInkLedger(sc.id);
      const report = verifyHumanInkLedger(ledger);
      expect(report.valid).toBe(true);
      expect(report.tampered).toBe(false);
      expect(report.merkleRootMatches).toBe(true);
      expect(report.chainTipMatches).toBe(true);
      expect(report.summaryCommitmentMatches).toBe(true);
      expect(report.tamperedLeafIndices).toEqual([]);
      expect(report.firstTamperedIndex).toBeNull();
    }
  });

  it("모든 리프 인덱스(0..7)의 필압 1비트 변조를 100% 적발하고 정확한 리프 인덱스를 지목한다", () => {
    const ledger = buildScenarioHumanInkLedger("pure-human-ink");
    for (let idx = 0; idx < ledger.events.length; idx += 1) {
      const injected = injectSingleByteTamper(ledger.events, idx, "pressure-1bit");
      const report = verifyHumanInkLedger(ledger, injected.tamperedEvents);
      expect(report.valid).toBe(false);
      expect(report.tampered).toBe(true);
      expect(report.merkleRootMatches).toBe(false);
      expect(report.chainTipMatches).toBe(false);
      expect(report.tamperedLeafIndices).toEqual([idx]);
      expect(report.firstTamperedIndex).toBe(idx);
      expect(report.firstTamperedEventId).toBe(ledger.events[idx].eventId);
    }
  });

  it("타임스탬프 +1ms 변조를 100% 적발하고 정확한 리프 인덱스를 반환한다", () => {
    const ledger = buildScenarioHumanInkLedger("hybrid-human-cc0-3d");
    const injected = injectSingleByteTamper(ledger.events, 5, "timestamp-1ms");
    const report = verifyHumanInkLedger(ledger, injected.tamperedEvents);
    expect(report.valid).toBe(false);
    expect(report.tampered).toBe(true);
    expect(report.tamperedLeafIndices).toEqual([5]);
    expect(report.firstTamperedIndex).toBe(5);
  });

  it("외부 미검증 스캔의 라이선스 출처를 인간 작화로 위조(source-spoof)해도 100% 적발한다", () => {
    const ledger = buildScenarioHumanInkLedger("contaminated-external-scan");
    const injected = injectSingleByteTamper(ledger.events, 3, "source-spoof");
    expect(injected.beforeValue).toBe("external-unverified-raw-scan");
    expect(injected.afterValue).toBe("human-ink-original");
    const report = verifyHumanInkLedger(ledger, injected.tamperedEvents);
    expect(report.valid).toBe(false);
    expect(report.tampered).toBe(true);
    expect(report.tamperedLeafIndices).toEqual([3]);
    expect(report.firstTamperedEventId).toBe("SCN-004");
  });

  it("타일 델타 해시 1바이트(1 hex nibble) 조작을 100% 적발한다", () => {
    const ledger = buildScenarioHumanInkLedger("pure-human-ink");
    const injected = injectSingleByteTamper(ledger.events, 7, "tile-hash-1byte");
    expect(injected.beforeValue).not.toBe(injected.afterValue);
    const report = verifyHumanInkLedger(ledger, injected.tamperedEvents);
    expect(report.valid).toBe(false);
    expect(report.tampered).toBe(true);
    expect(report.tamperedLeafIndices).toEqual([7]);
  });

  it("복수 리프(1번·6번)를 동시에 변조하면 두 리프 인덱스를 모두 정확히 적발한다", () => {
    const ledger = buildScenarioHumanInkLedger("pure-human-ink");
    const first = injectSingleByteTamper(ledger.events, 1, "pressure-1bit");
    const second = injectSingleByteTamper(first.tamperedEvents, 6, "timestamp-1ms");
    const report = verifyHumanInkLedger(ledger, second.tamperedEvents);
    expect(report.valid).toBe(false);
    expect(report.tampered).toBe(true);
    expect(report.tamperedLeafIndices).toEqual([1, 6]);
    expect(report.firstTamperedIndex).toBe(1);
    expect(report.verifiedLeafCount).toBe(6);
  });

  it("원장에서 리프 1건을 누락(삭제)하거나 임의 추가하면 lengthMatches=false로 즉시 적발한다", () => {
    const ledger = buildScenarioHumanInkLedger("pure-human-ink");
    const truncated = ledger.events.slice(0, 7);
    const reportTrunc = verifyHumanInkLedger(ledger, truncated);
    expect(reportTrunc.valid).toBe(false);
    expect(reportTrunc.lengthMatches).toBe(false);
    expect(reportTrunc.tamperedLeafIndices).toContain(7);

    const extra = [...ledger.events, createNextHumanPenStrokeEvent(ledger.events)];
    const reportExtra = verifyHumanInkLedger(ledger, extra);
    expect(reportExtra.valid).toBe(false);
    expect(reportExtra.lengthMatches).toBe(false);
    expect(reportExtra.tamperedLeafIndices).toContain(8);
  });
});

describe("4. Rights-BOM 오염 차단 Fail-Closed 게이트 (evaluateRightsBomContaminationGate)", () => {
  it("100% 인간 작화 원고는 pass-clean, exportAllowed=true, failClosedTriggered=false를 반환한다", () => {
    const gate = evaluateRightsBomContaminationGate(getHumanInkScenario("pure-human-ink").events);
    expect(gate.status).toBe("pass-clean");
    expect(gate.exportAllowed).toBe(true);
    expect(gate.failClosedTriggered).toBe(false);
    expect(gate.contaminatedEventCount).toBe(0);
    expect(gate.licenseBreakdown["human-ink-original"]).toBe(8);
  });

  it("인간 작화+절차적 CC0+BYOT 3D 하이브리드는 pass-hybrid-verified, exportAllowed=true를 반환한다", () => {
    const gate = evaluateRightsBomContaminationGate(getHumanInkScenario("hybrid-human-cc0-3d").events);
    expect(gate.status).toBe("pass-hybrid-verified");
    expect(gate.exportAllowed).toBe(true);
    expect(gate.failClosedTriggered).toBe(false);
    expect(gate.licenseBreakdown["clean-procedural-cc0"]).toBe(1);
    expect(gate.licenseBreakdown["byot-personal-render"]).toBe(1);
    expect(gate.licenseBreakdown["external-unverified-raw-scan"]).toBe(0);
  });

  it("external-unverified-raw-scan이 1건이라도 섞이면 Fail-Closed(exportAllowed=false)로 즉시 차단한다", () => {
    const gate = evaluateRightsBomContaminationGate(
      getHumanInkScenario("contaminated-external-scan").events,
    );
    expect(gate.status).toBe("blocked-contaminated");
    expect(gate.exportAllowed).toBe(false);
    expect(gate.failClosedTriggered).toBe(true);
    expect(gate.contaminatedEventCount).toBe(1);
    expect(gate.contaminatedEventIds).toEqual(["SCN-004"]);
    expect(gate.contaminatedIndices).toEqual([3]);
    expect(gate.remediationStepsKo.length).toBeGreaterThanOrEqual(2);
  });

  it("unverified-external-scan 이벤트를 clean-procedural-cc0로 위장해도 심층 Fail-Closed가 출고를 차단한다", () => {
    const base = getHumanInkScenario("contaminated-external-scan").events;
    const disguised = base.map((ev, idx) =>
      idx === 3 ? { ...ev, licenseClass: "clean-procedural-cc0" as const } : ev,
    );
    const gate = evaluateRightsBomContaminationGate(disguised);
    expect(gate.status).toBe("blocked-contaminated");
    expect(gate.exportAllowed).toBe(false);
    expect(gate.failClosedTriggered).toBe(true);
    expect(gate.mismatchedLicenseIndices).toEqual([3]);
  });

  it("인간 스트로크에 external-unverified-raw-scan 라이선스가 태그돼도 Fail-Closed로 차단한다", () => {
    const base = getHumanInkScenario("pure-human-ink").events;
    const poisoned = base.map((ev, idx) =>
      idx === 2 ? { ...ev, licenseClass: "external-unverified-raw-scan" as const } : ev,
    );
    const gate = evaluateRightsBomContaminationGate(poisoned);
    expect(gate.status).toBe("blocked-contaminated");
    expect(gate.exportAllowed).toBe(false);
    expect(gate.contaminatedIndices).toEqual([2]);
    expect(gate.mismatchedLicenseIndices).toEqual([2]);
  });

  it("이벤트가 0건인 빈 원장은 Fail-Closed(blocked-empty, exportAllowed=false)로 처리한다", () => {
    const gate = evaluateRightsBomContaminationGate([]);
    expect(gate.status).toBe("blocked-empty");
    expect(gate.exportAllowed).toBe(false);
    expect(gate.failClosedTriggered).toBe(true);
  });
});

describe("5. C2PA Content Credentials 호환 매니페스트 JSON & 정직한 서명 범위 표기", () => {
  it("c2pa.actions, toonstudio.human_ink_merkle_v1, local-deterministic-merkle-fnv1a64-preview를 정확히 출력한다", () => {
    const ledger = buildScenarioHumanInkLedger("hybrid-human-cc0-3d");
    const json = exportC2paHumanInkManifestJson(ledger);
    const parsed = JSON.parse(json) as {
      schemaVersion: string;
      cryptographicScope: string;
      signingStatus: { hardwareX509Signed: boolean; tsaTimestamped: boolean };
      assertions: {
        "c2pa.actions": { actions: { action: string }[] };
        "toonstudio.human_ink_merkle_v1": {
          merkleRootHex: string;
          zeroPixelExposure: boolean;
          rawPsdIncluded: boolean;
          rawPixelBytesExposed: number;
        };
        "toonstudio.rights_bom_gate_v1": { status: string; exportAllowed: boolean };
      };
    };

    expect(parsed.schemaVersion).toBe("toonstudio.c2pa-human-ink-manifest.v1");
    expect(parsed.cryptographicScope).toBe(CRYPTOGRAPHIC_SCOPE_PREVIEW);
    expect(parsed.signingStatus.hardwareX509Signed).toBe(false);
    expect(parsed.signingStatus.tsaTimestamped).toBe(false);
    expect(parsed.assertions["c2pa.actions"].actions).toHaveLength(8);
    expect(parsed.assertions["toonstudio.human_ink_merkle_v1"].merkleRootHex).toBe(ledger.merkleRootHex);
    expect(parsed.assertions["toonstudio.human_ink_merkle_v1"].zeroPixelExposure).toBe(true);
    expect(parsed.assertions["toonstudio.human_ink_merkle_v1"].rawPsdIncluded).toBe(false);
    expect(parsed.assertions["toonstudio.human_ink_merkle_v1"].rawPixelBytesExposed).toBe(0);
    expect(parsed.assertions["toonstudio.rights_bom_gate_v1"].exportAllowed).toBe(true);
  });

  it("출력된 C2PA JSON에 원본 픽셀 버퍼나 data:image 바이너리가 0바이트도 포함되지 않는다", () => {
    for (const sc of HUMAN_INK_SCENARIOS) {
      const ledger = buildScenarioHumanInkLedger(sc.id);
      const json = exportC2paHumanInkManifestJson(ledger);
      expect(json).not.toContain("data:image");
      expect(json).not.toContain("rawPixels");
      expect(json).not.toContain("base64,");
    }
  });

  it("변조가 검출된 verification 리포트를 넘기면 C2PA JSON의 exportAllowed가 false(Fail-Closed)로 잠긴다", () => {
    const ledger = buildScenarioHumanInkLedger("pure-human-ink");
    const tampered = injectSingleByteTamper(ledger.events, 2, "tile-hash-1byte");
    const report = verifyHumanInkLedger(ledger, tampered.tamperedEvents);
    const parsed = JSON.parse(exportC2paHumanInkManifestJson(ledger, report, 2)) as {
      assertions: {
        "toonstudio.human_ink_merkle_v1": {
          integrityVerification: { valid: boolean; tampered: boolean; tamperedLeafIndices: number[] };
        };
        "toonstudio.rights_bom_gate_v1": { exportAllowed: boolean; failClosedTriggered: boolean };
      };
    };
    expect(parsed.assertions["toonstudio.human_ink_merkle_v1"].integrityVerification.valid).toBe(false);
    expect(parsed.assertions["toonstudio.human_ink_merkle_v1"].integrityVerification.tampered).toBe(true);
    expect(parsed.assertions["toonstudio.human_ink_merkle_v1"].integrityVerification.tamperedLeafIndices).toEqual([2]);
    expect(parsed.assertions["toonstudio.rights_bom_gate_v1"].exportAllowed).toBe(false);
    expect(parsed.assertions["toonstudio.rights_bom_gate_v1"].failClosedTriggered).toBe(true);
  });

  it("오염 원고의 C2PA JSON이 blocked-contaminated와 오염 이벤트 ID를 명시한다", () => {
    const ledger = buildScenarioHumanInkLedger("contaminated-external-scan");
    const parsed = JSON.parse(exportC2paHumanInkManifestJson(ledger)) as {
      assertions: {
        "toonstudio.rights_bom_gate_v1": {
          status: string;
          exportAllowed: boolean;
          contaminatedEventIds: string[];
        };
      };
    };
    expect(parsed.assertions["toonstudio.rights_bom_gate_v1"].status).toBe("blocked-contaminated");
    expect(parsed.assertions["toonstudio.rights_bom_gate_v1"].exportAllowed).toBe(false);
    expect(parsed.assertions["toonstudio.rights_bom_gate_v1"].contaminatedEventIds).toEqual(["SCN-004"]);
  });

  it("createNextHumanPenStrokeEvent로 스트로크 추가 시 리프 수·비율·머클 루트가 결정론적으로 갱신된다", () => {
    const base = getHumanInkScenario("hybrid-human-cc0-3d").events;
    const added = createNextHumanPenStrokeEvent(base);
    expect(added.kind).toBe("human-pen-stroke");
    expect(added.licenseClass).toBe("human-ink-original");
    expect(added.pressureEntropyBits).toBeGreaterThan(2.5);
    const nextLedger = buildHumanInkMerkleLedger([...base, added]);
    expect(nextLedger.events).toHaveLength(9);
    expect(nextLedger.treeDepth).toBe(4);
    expect(nextLedger.summaryProof.humanStrokeCount).toBe(6);
    expect(nextLedger.summaryProof.humanInkStrokeRatioPercent).toBe(66.7);
  });
});

describe("6. StudioHumanInkLedgerPanel 스튜디오 제어판 UI 상호작용 검증", () => {
  it("props 없이 기본 마운트 시 한국어 UI, 머클 트리 SVG, 비율 게이지 SVG가 정상 렌더링된다", () => {
    render(<StudioHumanInkLedgerPanel />);
    expect(screen.getByTestId("human-ink-ledger-panel")).toBeTruthy();
    expect(screen.getByTestId("human-ink-gate-badge").textContent).toContain("100% 인간 작화 클린");
    expect(screen.getByTestId("human-ink-metric-human-ratio").textContent).toBe("100%");
    expect(screen.getByTestId("human-ink-merkle-svg").getAttribute("data-leaf-count")).toBe("8");
    expect(screen.getByTestId("human-ink-ratio-gauge-svg").getAttribute("data-zero-pixel-exposure")).toBe("true");
  });

  it("3종 시나리오 전환 시 Rights-BOM 게이트·SVG·비율 지표가 즉시 갱신되고 onLedgerChange가 호출된다", () => {
    const onLedgerChange = vi.fn();
    render(<StudioHumanInkLedgerPanel onLedgerChange={onLedgerChange} />);

    fireEvent.click(screen.getByTestId("human-ink-scenario-hybrid-human-cc0-3d"));
    expect(screen.getByTestId("human-ink-gate-badge").textContent).toContain("하이브리드 검증");
    expect(screen.getByTestId("human-ink-metric-human-ratio").textContent).toBe("62.5%");
    expect(screen.getByTestId("human-ink-metric-cc0-ratio").textContent).toBe("12.5% / 12.5%");

    fireEvent.click(screen.getByTestId("human-ink-scenario-contaminated-external-scan"));
    expect(screen.getByTestId("human-ink-gate-badge").textContent).toContain("외부 스캔 오염");
    expect(screen.getByTestId("human-ink-metric-bom-gate").textContent).toContain("차단");
    expect(screen.getByTestId("human-ink-ratio-gauge-svg").getAttribute("data-contaminated-count")).toBe("1");
    expect(onLedgerChange).toHaveBeenCalledTimes(2);
  });

  it("인간 스트로크 추가 버튼 클릭 시 리프 수·머클 루트·트리 깊이가 즉시 갱신된다", () => {
    render(<StudioHumanInkLedgerPanel />);
    const rootBefore = screen.getByTestId("human-ink-merkle-svg").getAttribute("data-merkle-root");
    fireEvent.click(screen.getByTestId("human-ink-add-stroke-btn"));

    const svgAfter = screen.getByTestId("human-ink-merkle-svg");
    expect(svgAfter.getAttribute("data-leaf-count")).toBe("9");
    expect(svgAfter.getAttribute("data-tree-depth")).toBe("4");
    expect(svgAfter.getAttribute("data-merkle-root")).not.toBe(rootBefore);
  });

  it("의도적 1바이트 변조 주입 토글 시 머클 변조가 즉시 적발되고 해제하면 원복된다", () => {
    render(<StudioHumanInkLedgerPanel />);
    const toggle = screen.getByTestId("human-ink-tamper-toggle-btn");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("human-ink-merkle-svg").getAttribute("data-tampered")).toBe("true");
    expect(screen.getByTestId("human-ink-metric-integrity").textContent).toContain("변조 적발 #2");
    expect(screen.getByTestId("human-ink-gate-badge").textContent).toContain("머클 변조 적발");
    expect(screen.getByTestId("human-ink-proof-status-pill").textContent).toContain("증명 실패");
    expect(screen.getByTestId("human-ink-tamper-detail-alert")).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("human-ink-merkle-svg").getAttribute("data-tampered")).toBe("false");
    expect(screen.getByTestId("human-ink-metric-integrity").textContent).toContain("검증 통과");
    expect(screen.getByTestId("human-ink-proof-status-pill").textContent).toContain("증명 일치");
  });

  it("4종 변조 모드(필압·타임스탬프·출처·타일 해시) 전환 시 각 변조 필드가 모두 적발된다", () => {
    render(<StudioHumanInkLedgerPanel />);
    fireEvent.click(screen.getByTestId("human-ink-tamper-toggle-btn"));

    const modes: readonly TamperMutationMode[] = [
      "pressure-1bit",
      "timestamp-1ms",
      "source-spoof",
      "tile-hash-1byte",
    ];
    const expectedFieldTokens = ["pressureEntropyBits", "timestampMs", "licenseClass", "tileDeltaHashHex"];
    modes.forEach((mode, idx) => {
      fireEvent.click(screen.getByTestId(`human-ink-tamper-mode-${mode}`));
      expect(screen.getByTestId("human-ink-tamper-detail-alert").textContent).toContain(
        expectedFieldTokens[idx],
      );
      expect(screen.getByTestId("human-ink-merkle-svg").getAttribute("data-tampered")).toBe("true");
    });
  });

  it("다른 리프를 선택하고 포함 증명 검증 버튼을 누르면 O(log N) 형제 해시 경로 검증 결과가 갱신된다", () => {
    render(<StudioHumanInkLedgerPanel />);
    fireEvent.click(screen.getByTestId("human-ink-leaf-btn-5"));
    expect(screen.getByTestId("human-ink-merkle-svg").getAttribute("data-selected-leaf")).toBe("5");

    fireEvent.click(screen.getByTestId("human-ink-verify-proof-btn"));
    expect(screen.getByTestId("human-ink-proof-status-pill").textContent).toContain("증명 일치 · #1");
    expect(screen.getByTestId("human-ink-proof-siblings-list").querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByTestId("human-ink-status-banner").textContent).toContain("리프 #5");
  });

  it("C2PA JSON 미리보기 토글 및 복사 버튼이 정직한 암호화 범위와 함께 onExportJson을 호출한다", () => {
    const onExportJson = vi.fn();
    render(<StudioHumanInkLedgerPanel onExportJson={onExportJson} />);

    expect(screen.queryByTestId("human-ink-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("human-ink-toggle-json-btn"));
    const preview = screen.getByTestId("human-ink-json-preview");
    expect(preview.textContent).toContain(CRYPTOGRAPHIC_SCOPE_PREVIEW);
    expect(preview.textContent).toContain("toonstudio.human_ink_merkle_v1");

    fireEvent.click(screen.getByTestId("human-ink-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const exportedText = String(onExportJson.mock.calls[0]?.[0] ?? "");
    expect(exportedText).toContain("c2pa.actions");
  });

  it("영문 로케일(locale='en'), initialScenarioId, className, 초기화 버튼이 정상 동작한다", () => {
    render(
      <StudioHumanInkLedgerPanel
        locale="en"
        initialScenarioId="contaminated-external-scan"
        className="custom-w58c-shell"
      />,
    );
    const panel = screen.getByTestId("human-ink-ledger-panel");
    expect(panel.className).toContain("custom-w58c-shell");
    expect(panel.getAttribute("aria-label")).toContain("Human Ink Provenance Merkle Ledger");
    expect(screen.getByTestId("human-ink-gate-badge").textContent).toContain("Export Blocked");
    expect(screen.getByTestId("human-ink-honest-scope-notice").textContent).toContain(
      CRYPTOGRAPHIC_SCOPE_PREVIEW,
    );

    fireEvent.click(screen.getByTestId("human-ink-add-stroke-btn"));
    expect(screen.getByTestId("human-ink-merkle-svg").getAttribute("data-leaf-count")).toBe("9");
    fireEvent.click(screen.getByTestId("human-ink-reset-btn"));
    expect(screen.getByTestId("human-ink-merkle-svg").getAttribute("data-leaf-count")).toBe("8");
  });
});

describe("7. 엄격 품질·하네스 계약 및 Anti-Slop 자가 검증", () => {
  it("소유 파일 4종 존재, 줄 수 상한(engine<=750, panel<=680, all<=800) 및 금지 패턴 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "human-ink-ledger-engine.ts",
      "StudioHumanInkLedgerPanel.tsx",
      "index.ts",
      "human-ink-ledger.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "human-ink-ledger-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioHumanInkLedgerPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "human-ink-ledger.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
        expect(src).not.toContain("원활한 워크플로우를 보장");
      }

      if (file === "StudioHumanInkLedgerPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("렌더된 모든 버튼이 min-h-11을 유지하고 모든 SVG에 원시 색·바이올렛(270~320°)이 0건이다", () => {
    const { container } = render(<StudioHumanInkLedgerPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(18);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    for (const svg of svgs) {
      assertZeroVioletAndRawColors(svg.outerHTML);
    }
  });

  it("4개 소유 파일이 금지 도메인(vrm·bg3d·market·apps/api·apps/admin-web)을 정적으로 import하지 않는다", () => {
    const dir = path.resolve(import.meta.dirname);
    const files = [
      "human-ink-ledger-engine.ts",
      "StudioHumanInkLedgerPanel.tsx",
      "index.ts",
      "human-ink-ledger.test.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const importLines = src.split(/\r?\n/).filter((line) => /^\s*import\b/u.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/\/(?:vrm|bg3d|market)\b/u);
        expect(line).not.toContain("apps/api");
        expect(line).not.toContain("apps/admin-web");
      }
    }
  });
});
