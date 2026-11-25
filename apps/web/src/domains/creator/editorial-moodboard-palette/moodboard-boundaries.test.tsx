// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { auditChromaticBalance, autoRepairPaletteContrast, buildEditorialPosterSvg, buildCspSwatchBytes, computeWcagContrastRatio, exportPaletteCspSwatch, exportPaletteCssVariables, exportPaletteOklchJson } from "./editorial-moodboard-engine";
import { StudioEditorialMoodboardPanel } from "./StudioEditorialMoodboardPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("무드보드 입력과 내보내기 경계", () => {
  it("유효한 소수 비율의 자체 감사 결과를 원값 그대로 모든 형식으로 내보낸다", () => {
    const ratio = { neutralPct: 85.004, domainPct: 10.004, accentPct: 4.992 };
    const audit = auditChromaticBalance({ ratio });
    for (const exporter of [exportPaletteOklchJson, exportPaletteCssVariables, exportPaletteCspSwatch, buildCspSwatchBytes, buildEditorialPosterSvg]) {
      expect(() => exporter(audit)).not.toThrow();
    }
    expect(audit.ratio.input).toEqual(ratio);
  });
  it.each([0.001, Number.MIN_VALUE])("작은 양의 비율 %s도 실제 합계로 정규화하고 원값을 내보낸다", amount => {
    const ratio = { neutralPct: amount, domainPct: amount, accentPct: amount };
    const audit = auditChromaticBalance({ ratio });
    expect(audit.ratio.normalized).toEqual({ neutralPct: 33.33, domainPct: 33.33, accentPct: 33.34 });
    expect(Object.values(audit.ratio.normalized).reduce((sum, value) => sum + value, 0)).toBe(100);
    for (const exporter of [exportPaletteOklchJson, exportPaletteCssVariables, exportPaletteCspSwatch, buildCspSwatchBytes, buildEditorialPosterSvg]) {
      expect(() => exporter(audit)).not.toThrow();
    }
    expect(JSON.parse(exportPaletteOklchJson(audit)).ratio.input).toEqual(ratio);
  });
  it("합성 배경을 알 수 없는 투명 안료를 불투명 색 대비 통과로 처리하지 않는다", () => {
    const ink = auditChromaticBalance().resolvedPigments.ink.color;
    expect(() => auditChromaticBalance({ pigmentOverrides: { ink: { ...ink, alpha: 0 } } })).toThrow(/불투명|투명/);
    expect(() => computeWcagContrastRatio({ ...ink, alpha: 0 }, { l: 1, c: 0, h: 0 })).toThrow(/불투명|투명/);
  });
  it("불가능한 대비 목표를 보정 완료로 오인하지 않는다", () => {
    const result = autoRepairPaletteContrast(undefined, { targetWcagRatio: 21 });
    expect(result.fullyRepaired).toBe(result.afterAudit.isVioletFree && result.afterAudit.minWcagRatio >= 21);
    expect(() => autoRepairPaletteContrast(undefined, { targetWcagRatio: 1e308 })).toThrow(/범위|목표/);
  });
  it.each([NaN, Infinity])("비정상 안료 %s를 정상 색상으로 숨기지 않는다", (h) => {
    expect(() => auditChromaticBalance({ pigmentOverrides: { accent: { l: 0.5, c: 0.1, h } } })).toThrow(/유한|finite/);
  });
  it("추가 색상 상한과 중복·예약 ID를 검사한다", () => {
    const sample = { id: "reference", labelKo: "참조", labelEn: "Reference", color: { l: 0.5, c: 0.1, h: 30 } };
    expect(() => auditChromaticBalance({ extraSamples: [sample, sample] })).toThrow(/ID/);
    expect(() => auditChromaticBalance({ extraSamples: [{ ...sample, id: "toString" }] })).toThrow(/ID/);
    expect(() => auditChromaticBalance({ extraSamples: Array.from({ length: 257 }, (_, i) => ({ ...sample, id: `ref${i}` })) })).toThrow(/256|상한/);
  });
  it("보정 대상이 아닌 참조색을 지우고 완전 보정으로 오인하지 않는다", () => {
    const result = autoRepairPaletteContrast({ extraSamples: [{ id: "reference", labelKo: "원문", labelEn: "Source", color: { l: 0.7, c: 0.2, h: 294 } }] });
    expect(result.afterAudit.inspectedColorCount).toBe(result.beforeAudit.inspectedColorCount);
    expect(result.afterAudit.violetViolations.some((item) => item.slotId === "reference")).toBe(true);
    expect(result.fullyRepaired).toBe(false);
  });
  it.each([exportPaletteOklchJson, exportPaletteCssVariables, exportPaletteCspSwatch, buildCspSwatchBytes, buildEditorialPosterSvg])("외부 NaN 결과를 직렬화하지 않는다 (%#)", (exporter) => {
    const report = structuredClone(auditChromaticBalance());
    Object.assign(report, { minWcagRatio: NaN });
    expect(() => exporter(report)).toThrow(/유한|finite/);
    expect(Number.isNaN(report.minWcagRatio)).toBe(true);
  });
  it("외부 SVG/CSS 메타데이터를 등록 프리셋으로 검증한다", () => {
    const report = structuredClone(auditChromaticBalance());
    Object.assign(report.preset, { id: 'x" onload="alert(1)' });
    expect(() => buildEditorialPosterSvg(report)).toThrow();
    expect(() => exportPaletteCssVariables(report)).toThrow();
  });
  it("SVG 표제어의 여백·긴 Unicode 원문을 보존한다", () => {
    const headline = `  ${"가".repeat(23)}🧑🏽‍🎨 원문  `;
    const source = buildEditorialPosterSvg(auditChromaticBalance(), { headline });
    const svg = new DOMParser().parseFromString(source, "image/svg+xml");
    expect(svg.querySelector('text[y="356"]')?.textContent).toBe(headline);
  });
  it("CSP 산출물을 실제 호환성 검증 완료로 표시하지 않는다", () => {
    expect(JSON.parse(exportPaletteCspSwatch(auditChromaticBalance())).compatibilityVerified).toBe(false);
  });
});

describe("무드보드 알림과 클립보드", () => {
  it("유효한 소수 initialRatio를 미리보기에서 오류 없이 유지한다", () => {
    const ratio = { neutralPct: 85.004, domainPct: 10.004, accentPct: 4.992 };
    const notified = vi.fn();
    expect(() => render(<StudioEditorialMoodboardPanel initialRatio={ratio} onAuditChange={notified} />)).not.toThrow();
    expect(notified.mock.calls[0]?.[0].ratio.input).toEqual(ratio);
  });
  it("표제어를 비우면 SVG 미리보기도 같은 빈 원문을 표시한다", () => {
    render(<StudioEditorialMoodboardPanel />);
    fireEvent.change(screen.getByTestId("moodboard-headline-input"), { target: { value: "" } });
    expect(screen.getByTestId("moodboard-poster-svg").querySelector('text[y="356"]')?.textContent).toBe("");
  });
  it("수신자 교체만으로 같은 감사 결과를 재통지하지 않는다", () => {
    const first = vi.fn(); const latest = vi.fn();
    const { rerender } = render(<StudioEditorialMoodboardPanel onAuditChange={first} />);
    expect(first).toHaveBeenCalledTimes(1);
    rerender(<StudioEditorialMoodboardPanel onAuditChange={latest} />);
    expect(latest).not.toHaveBeenCalled();
  });
  it("복사 ACK 전 성공 표시를 피하고 실패한 같은 문자열만 재복사한다", async () => {
    let rejectCopy: (error: Error) => void = () => { throw new Error("요청 없음"); };
    const copy = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectCopy = reject; })).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    const exported = vi.fn();
    render(<StudioEditorialMoodboardPanel onExportCss={exported} />);
    fireEvent.click(screen.getByTestId("moodboard-copy-css-btn"));
    expect(screen.getByTestId("moodboard-copy-status").textContent).toContain("기다리");
    await act(async () => { rejectCopy(new Error("denied")); });
    expect(screen.getByTestId("moodboard-copy-status").getAttribute("role")).toBe("alert");
    fireEvent.click(screen.getByTestId("moodboard-retry-clipboard"));
    await waitFor(() => expect(screen.getByTestId("moodboard-copy-status").textContent).toContain("복사 완료"));
    expect(copy.mock.calls[1]?.[0]).toBe(copy.mock.calls[0]?.[0]);
    expect(exported).toHaveBeenCalledTimes(1);
  });
});
