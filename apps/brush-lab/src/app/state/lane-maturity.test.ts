import { describe, expect, it } from "vitest";

import { LANE_REGISTRY } from "../../lanes/registry";

import { isLaneId } from "./lane-helpers";
import {
  EXPERIMENTAL_SCOPE_KO,
  experimentalDescription,
  isCertificationExcluded,
  isExperimental,
  laneOptionLabel,
  metricVerdictDisplay,
  rawVerdictNoteKo,
  summarizeCertification,
  verdictDisplay,
} from "./lane-maturity";

import type { LaneDescriptor } from "../../lanes/lane";

function desc(partial: Partial<LaneDescriptor>): LaneDescriptor {
  return {
    id: "cpu-reference",
    label: "CPU 참조",
    kind: "baseline",
    status: "implemented",
    nodeVerification: "",
    browserVerification: "",
    create: () => {
      throw new Error("테스트에서 레인을 만들지 않는다");
    },
    ...partial,
  };
}

describe("lane-maturity", () => {
  it("maturity가 experimental인 레인만 실험·인증 제외다(생략 = stable)", () => {
    expect(isExperimental(desc({}))).toBe(false);
    expect(isExperimental(desc({ maturity: "stable" }))).toBe(false);
    expect(isExperimental(desc({ maturity: "experimental" }))).toBe(true);
    expect(isExperimental(null)).toBe(false);
    expect(isCertificationExcluded(desc({ maturity: "experimental" }))).toBe(true);
    expect(isCertificationExcluded(desc({}))).toBe(false);
  });

  it("레지스트리의 모든 레인 ID가 앱 선택기 목록(LANE_IDS)에 있다 — 신규 레인이 빠지면 앱이 오류를 낸다", () => {
    for (const d of LANE_REGISTRY) expect(isLaneId(d.id), d.id).toBe(true);
  });

  it("실험 레인 3종은 검증 범위(Node 22 단일 스레드·브라우저 미검증)와 인증 제외를 한글로 설명한다", () => {
    const experimental = LANE_REGISTRY.filter((d) => isExperimental(d));
    expect(experimental.map((d) => d.id).sort()).toEqual(["bristle-pbd", "bristle-rapier", "mpm-paint"]);
    for (const d of experimental) {
      const text = experimentalDescription(d);
      expect(text, d.id).toContain("Node 22 단일 스레드");
      expect(text, d.id).toContain("브라우저");
      expect(text, d.id).toContain("인증 판정(PASS/FAIL) 집계에서 제외");
    }
    expect(experimentalDescription(desc({ id: "bristle-rapier", maturity: "experimental" }))).toContain("다른 레인으로 바꾸지 않는다");
    expect(experimentalDescription(desc({ id: "cpu-reference" }))).toBeNull();
    expect(experimentalDescription(desc({ id: "hokusai", maturity: "experimental" }))).toBe(EXPERIMENTAL_SCOPE_KO);
  });

  it("안정 레인은 실험 레인으로 오인되지 않는다(기존 10개 레인에 maturity가 없다)", () => {
    const stable = LANE_REGISTRY.filter((d) => !isExperimental(d));
    expect(stable).toHaveLength(LANE_REGISTRY.length - 3);
    for (const d of stable) expect(experimentalDescription(d), d.id).toBeNull();
  });

  it("옵션 문구: 실험 레인에 [실험]을 붙이되 레이블에 이미 '실험'이 있으면 중복하지 않는다", () => {
    expect(laneOptionLabel(desc({}), null)).toBe("CPU 참조 (cpu-reference)");
    expect(laneOptionLabel(desc({ id: "hokusai", label: "Hokusai", maturity: "experimental" }), null)).toBe("Hokusai (hokusai) [실험]");
    expect(laneOptionLabel(desc({ id: "mpm-paint", label: "MLS-MPM 점탄성 물감(실험)", maturity: "experimental" }), "x")).toBe(
      "MLS-MPM 점탄성 물감(실험) (mpm-paint) — x",
    );
  });

  it("종합 판정 표시: 실험 레인은 인증 제외로 바꾸고 원래 판정은 참고로만 남긴다", () => {
    expect(verdictDisplay("PASS", desc({}))).toEqual({ text: "PASS", excluded: false, unregistered: false, reference: "PASS" });
    expect(verdictDisplay("FAIL", desc({ maturity: "experimental" }))).toEqual({ text: "인증 제외(실험)", excluded: true, unregistered: false, reference: "FAIL" });
    expect(verdictDisplay(null, desc({ maturity: "experimental" }))).toEqual({ text: "—", excluded: false, unregistered: false, reference: null });
  });

  it("R-C-6 레지스트리에 없는 레인(구버전 세션·레지스트리 변경)은 성숙도를 알 수 없으므로 안전한 쪽으로 인증 집계에서 빼고 '레인 미등록'으로 표시한다", () => {
    // 이전에는 안정 레인으로 취급해 PASS/FAIL 로 셌다.
    expect(verdictDisplay("FAIL", null)).toEqual({ text: "레인 미등록", excluded: true, unregistered: true, reference: "FAIL" });
    expect(verdictDisplay("PASS", undefined)).toEqual({ text: "레인 미등록", excluded: true, unregistered: true, reference: "PASS" });
    // 판정이 없으면(리포트 자체가 없으면) 미등록이라고 말하지 않는다.
    expect(verdictDisplay(null, null)).toEqual({ text: "—", excluded: false, unregistered: false, reference: null });
  });

  it("R-C-5 지표별 판정 셀: 실험·미등록 레인은 참고용 문구를 붙이고 안정 레인은 그대로 둔다", () => {
    expect(metricVerdictDisplay("PASS", desc({}))).toEqual({ text: "PASS", reference: false });
    expect(metricVerdictDisplay("FAIL", desc({ maturity: "experimental" }))).toEqual({ text: "FAIL (참고)", reference: true });
    expect(metricVerdictDisplay("UNAVAILABLE", desc({ maturity: "experimental" }))).toEqual({ text: "UNAVAILABLE (참고)", reference: true });
    expect(metricVerdictDisplay("PASS", null)).toEqual({ text: "PASS (참고·레인 미등록)", reference: true });
    expect(metricVerdictDisplay(undefined, desc({ maturity: "experimental" }))).toEqual({ text: "—", reference: false });
  });

  it("R-C-5 원시 리포트 JSON 안내: 성숙도를 담지 않는 원시 판정임을 실험·미등록 레인에만 밝힌다", () => {
    expect(rawVerdictNoteKo(desc({}))).toBeNull();
    expect(rawVerdictNoteKo(desc({ maturity: "experimental" }))).toContain("인증이 아니다");
    expect(rawVerdictNoteKo(null)).toContain("레지스트리에 없는 레인");
  });

  it("R-C-9 실험 레인 검증 범위 문구는 브라우저를 소프트웨어 렌더러 스모크로 한정하고 성능·결정성·실기기는 미검증이라 적는다", () => {
    expect(EXPERIMENTAL_SCOPE_KO).toContain("브라우저는 소프트웨어 렌더러 스모크만");
    expect(EXPERIMENTAL_SCOPE_KO).toContain("성능·결정성·실기기");
    expect(EXPERIMENTAL_SCOPE_KO).toContain("미검증");
    // 이전 문구("브라우저·GPU…미검증")처럼 한정 없이 브라우저 전체를 미검증이라고 쓰지 않는다.
    expect(EXPERIMENTAL_SCOPE_KO).not.toContain("브라우저·GPU");
  });

  it("인증 집계: 실험 레인 리포트는 PASS·FAIL·UNAVAILABLE 어디에도 세지 않고 제외로만 센다", () => {
    const registry = [desc({ id: "cpu-reference" }), desc({ id: "mpm-paint", maturity: "experimental" })];
    const summary = summarizeCertification(
      [
        { laneId: "cpu-reference", verdict: "PASS" },
        { laneId: "cpu-reference", verdict: "FAIL" },
        { laneId: "cpu-reference", verdict: "UNAVAILABLE" },
        { laneId: "mpm-paint", verdict: "FAIL" },
        { laneId: "mpm-paint", verdict: "PASS" },
        { laneId: "wasm-cpu", verdict: "FAIL" },
      ],
      registry,
    );
    // wasm-cpu는 레지스트리에 없으므로 성숙도를 알 수 없다: PASS/FAIL로 세지 않고 '미등록' 칸으로만 센다.
    expect(summary).toEqual({ pass: 1, fail: 1, unavailable: 1, excluded: 2, unregistered: 1, total: 6 });
  });
});
