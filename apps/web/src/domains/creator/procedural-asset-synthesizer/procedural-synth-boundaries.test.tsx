// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateDeliveryRightsBom } from "../delivery-pack/rights-bom-validator";
import { PROCEDURAL_ASSET_RECIPES, StudioProceduralAssetSynthPanel, exportProceduralAssetManifestJson, exportSynthesizedAssetSvg, formatOklch, normalizeSeed, synthesizeProceduralAsset, type ProceduralAssetSynthInput, type ProceduralAssetSynthResult } from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function fixture(input: Partial<ProceduralAssetSynthInput> = {}): ProceduralAssetSynthResult {
  return synthesizeProceduralAsset({ recipeId: "gothic-window-arch", ...input });
}

describe("실제 산출물·권리 미승인 경계", () => {
  it("로컬 생성 이력을 CC0·상업 권한 승인서로 발급하지 않는다", () => {
    const result = fixture();
    const note = result.rightsBomCertificate;
    expect(note.licenseClass).toBe("unknown");
    expect(note.commercialWebtoonRedistributionAllowed).toBe(false);
    expect(note.auditChecklist.commercialWebtoonCleared).toBe(false);
    expect(note.auditChecklist.manifoldWatertightVerified).toBe(false);
    expect(note.certificateId).not.toContain("CC0");
  });
  it("생성되지 않은 mesh·PBR 지도를 glbforge 또는 법선 검증 통과로 기록하지 않는다", () => {
    const result = fixture();
    expect(result.mesh3dSummary.glbForgeReady).toBe(false);
    expect(result.mesh3dSummary.nonManifoldEdges).toBeNull();
    expect(result.pbrMaterialStats.channels.normal.tangentSpaceValid).toBe(false);
    expect(result.pbrMaterialStats.seamlessTileable).toBe(false);
  });
  it("기존 상업 납품 gate는 이 로컬 이력을 unknown 권리 상태로 차단한다", () => {
    const result = fixture();
    const report = validateDeliveryRightsBom([{ id: result.rightsBomCertificate.certificateId, name: result.recipe.nameKo, category: "effect", licenseStatus: result.rightsBomCertificate.commercialWebtoonRedistributionAllowed ? "commercial-allowed" : "unknown", licenseCode: result.rightsBomCertificate.licenseClass, creatorOrVendor: "ToonStudio procedural SVG", requiresAttribution: false }], { evaluatedAt: "2026-11-25T12:00:00.000Z" });
    expect(report.clearedForDelivery).toBe(false);
    expect(report.blockers.some((item) => item.code === "UNKNOWN_LICENSE")).toBe(true);
  });
});

describe("유한 입력·외부 결과 검증", () => {
  it.each(["weathering01", "lineWeightPx"] as const)("NaN %s를 SVG/JSON null이나 NaN으로 내보내지 않는다", (key) => {
    const result = fixture({ [key]: Number.NaN });
    expect(Number.isFinite(result.params[key])).toBe(true);
    expect(exportSynthesizedAssetSvg(result)).not.toContain("NaN");
    const parsed = JSON.parse(exportProceduralAssetManifestJson(result)) as { parameters: Record<string, unknown> };
    expect(typeof parsed.parameters[key]).toBe("number");
  });
  it.each(["l", "c", "h"] as const)("NaN 색상 %s도 유효한 CSS로 보정한다", (key) => {
    expect(formatOklch({ l: 0.5, c: 0.1, h: 220, [key]: Number.NaN })).not.toContain("NaN");
  });
  it("비유한 fallback seed도 유효한 시드로 제한한다", () => {
    expect(Number.isFinite(normalizeSeed(undefined, Number.NaN))).toBe(true);
  });
  it.each(["svg", "json"] as const)("%s는 변조된 숫자·권리 메타데이터를 신뢰하지 않는다", (kind) => {
    const result = structuredClone(fixture());
    Reflect.set(result.svgScene, "width", 1e308);
    expect(() => kind === "svg" ? exportSynthesizedAssetSvg(result) : exportProceduralAssetManifestJson(result)).toThrow(RangeError);
  });
  it("SVG ID·CSS 속성의 주입과 중복 ID를 거부한다", () => {
    const result = structuredClone(fixture()); const first = result.svgScene.elements[0];
    if (!first) throw new Error("missing primitive");
    Reflect.set(first, "id", 'x" onload="alert(1)');
    expect(() => exportSynthesizedAssetSvg(result)).toThrow(RangeError);
    const duplicate = structuredClone(fixture()); const a = duplicate.svgScene.elements[0]; const b = duplicate.svgScene.elements[1];
    if (!a || !b) throw new Error("missing primitives");
    Reflect.set(b, "id", a.id);
    expect(() => exportSynthesizedAssetSvg(duplicate)).toThrow(RangeError);
  });
  it("큰 배열과 비유한 감사 값은 생성 전에 거부한다", () => {
    const result = structuredClone(fixture()); Reflect.set(result.svgScene, "elements", new Array(100_001));
    expect(() => exportSynthesizedAssetSvg(result)).toThrow(RangeError);
    const corrupt = structuredClone(fixture()); Reflect.set(corrupt.dagIntegrity, "totalEstimatedCostMs", Number.NaN);
    expect(() => exportProceduralAssetManifestJson(corrupt)).toThrow(RangeError);
  });
});

describe("실제 복사 ACK", () => {
  it.each(["svg", "json"] as const)("%s는 ACK 전 완료 표시·수신자 호출을 하지 않는다", async (kind) => {
    let acknowledge: (() => void) | undefined;
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; })) } });
    const recipient = vi.fn(); render(<StudioProceduralAssetSynthPanel onExportSvg={recipient} onExportJson={recipient} />);
    fireEvent.click(screen.getByTestId(`synth-export-${kind}-btn`));
    try {
      expect(screen.getByTestId("synth-status-banner").textContent).not.toContain("복사했습니다");
      expect(recipient).not.toHaveBeenCalled();
    } finally { await act(async () => { acknowledge?.(); }); }
    await waitFor(() => expect(recipient).toHaveBeenCalledOnce());
  });
});

describe("실패·재시도·최신 수신자", () => {
  it.each(["svg", "json"] as const)("%s의 복사 실패와 수신자 변경은 같은 원문을 재시도한다", async (kind) => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("clipboard denied")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const recipient = vi.fn(); const { rerender } = render(<StudioProceduralAssetSynthPanel onExportSvg={recipient} onExportJson={recipient} />);
    fireEvent.click(screen.getByTestId(`synth-export-${kind}-btn`));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const requested = writeText.mock.calls[0]?.[0];
    fireEvent.change(screen.getByTestId("synth-seed-input"), { target: { value: "998" } });
    const next = vi.fn(); rerender(<StudioProceduralAssetSynthPanel onExportSvg={next} onExportJson={next} />);
    fireEvent.click(screen.getByTestId("synth-export-retry-btn"));
    await waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(next.mock.calls[0]?.[0]).toBe(requested);
    expect(writeText.mock.calls[1]?.[0]).toBe(requested);
    expect(recipient).not.toHaveBeenCalled();
  });
  it.each(["svg", "json"] as const)("%s의 ACK 중 추가된 수신자가 거절한 뒤 제거돼도 false ACK를 내지 않는다", async (kind) => {
    let acknowledge: (() => void) | undefined;
    const writeText = vi.fn((_text: string) => new Promise<void>((resolve) => { acknowledge = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { rerender } = render(<StudioProceduralAssetSynthPanel />);
    fireEvent.click(screen.getByTestId(`synth-export-${kind}-btn`));
    const bad = vi.fn().mockRejectedValue(new Error("recipient rejected"));
    rerender(<StudioProceduralAssetSynthPanel onExportSvg={bad} onExportJson={bad} />);
    await act(async () => { acknowledge?.(); });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    rerender(<StudioProceduralAssetSynthPanel />);
    fireEvent.click(screen.getByTestId("synth-export-retry-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const good = vi.fn(); rerender(<StudioProceduralAssetSynthPanel onExportSvg={good} onExportJson={good} />);
    fireEvent.click(screen.getByTestId("synth-export-retry-btn"));
    await waitFor(() => expect(good).toHaveBeenCalledOnce());
    expect(good.mock.calls[0]?.[0]).toBe(writeText.mock.calls[0]?.[0]);
    expect(writeText).toHaveBeenCalledOnce();
  });
  it("생성 알림의 throw는 미리보기를 보존하고 최신 수신자로 재시도한다", () => {
    const bad = vi.fn((_result: ProceduralAssetSynthResult) => { throw new Error("receiver failed"); });
    const { rerender } = render(<StudioProceduralAssetSynthPanel onAssetSynthesized={bad} />);
    fireEvent.change(screen.getByTestId("synth-seed-input"), { target: { value: "101" } });
    expect(screen.getByTestId("synth-preview-svg").getAttribute("data-seed")).toBe("101");
    expect(screen.getByRole("alert")).toBeTruthy();
    const good = vi.fn(); rerender(<StudioProceduralAssetSynthPanel onAssetSynthesized={good} />);
    expect(good).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("synth-notification-retry-btn"));
    expect(good).toHaveBeenCalledOnce();
    expect(good.mock.calls[0]?.[0]?.params.seed).toBe(101);
    rerender(<StudioProceduralAssetSynthPanel onAssetSynthesized={vi.fn()} />);
    expect(good).toHaveBeenCalledOnce();
  });
  it("비동기 생성 알림은 직렬로 처리하고 중간 입력 대신 최신 입력을 전달한다", async () => {
    let finish: (() => void) | undefined;
    const first = vi.fn((_result: ProceduralAssetSynthResult) => new Promise<void>((resolve) => { finish = resolve; }));
    const { rerender } = render(<StudioProceduralAssetSynthPanel onAssetSynthesized={first} />);
    for (const seed of [101, 102, 103]) fireEvent.change(screen.getByTestId("synth-seed-input"), { target: { value: String(seed) } });
    expect(first).toHaveBeenCalledOnce();
    expect(screen.getByTestId("synth-preview-svg").getAttribute("data-seed")).toBe("103");
    const latest = vi.fn(); rerender(<StudioProceduralAssetSynthPanel onAssetSynthesized={latest} />);
    await act(async () => { finish?.(); });
    expect(latest).toHaveBeenCalledOnce();
    expect(latest.mock.calls[0]?.[0]?.params.seed).toBe(103);
  });
  it("생성 알림 reject 뒤 수신자 제거는 재시도 성공으로 처리하지 않는다", async () => {
    const bad = vi.fn().mockRejectedValue(new Error("notification rejected"));
    const { rerender } = render(<StudioProceduralAssetSynthPanel onAssetSynthesized={bad} />);
    fireEvent.change(screen.getByTestId("synth-seed-input"), { target: { value: "101" } });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    rerender(<StudioProceduralAssetSynthPanel />);
    fireEvent.click(screen.getByTestId("synth-notification-retry-btn"));
    expect(screen.getByRole("alert")).toBeTruthy();
    const good = vi.fn(); rerender(<StudioProceduralAssetSynthPanel onAssetSynthesized={good} />);
    fireEvent.click(screen.getByTestId("synth-notification-retry-btn"));
    expect(good).toHaveBeenCalledOnce();
  });
  it("클립보드 부재와 unmount 대기는 허위 성공이나 외부 전달을 하지 않는다", async () => {
    vi.stubGlobal("navigator", {}); const recipient = vi.fn();
    const first = render(<StudioProceduralAssetSynthPanel onExportSvg={recipient} />);
    fireEvent.click(screen.getByTestId("synth-export-svg-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy()); expect(recipient).not.toHaveBeenCalled(); first.unmount();
    let finish: (() => void) | undefined;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const second = render(<StudioProceduralAssetSynthPanel onExportSvg={recipient} />);
    fireEvent.click(screen.getByTestId("synth-export-svg-btn")); fireEvent.click(screen.getByTestId("synth-export-json-btn"));
    expect(writeText).toHaveBeenCalledOnce(); second.unmount(); await act(async () => { finish?.(); }); expect(recipient).not.toHaveBeenCalled();
  });
});

it("제목 원문의 Unicode/XML은 보존하고 정본 팔레트·레시피를 바꾸지 않는다", () => {
  const result = structuredClone(fixture()); const original = fixture().recipe.nameEn;
  const title = '</title><script>alert("x")</script><title>원문 🖋️ & <보기>';
  Reflect.set(result.recipe, "nameEn", title);
  const doc = new DOMParser().parseFromString(exportSynthesizedAssetSvg(result), "image/svg+xml");
  expect(doc.querySelector("script")).toBeNull(); expect(doc.querySelector("parsererror")).toBeNull(); expect(doc.querySelector("title")?.textContent).toContain(title);
  expect(fixture().recipe.nameEn).toBe(original);
});

it.each(["not-a-channel", 'x" onload="alert(1)'])("외부 채널 %s를 명시 거부한다", (channel) => {
  expect(() => Reflect.apply(synthesizeProceduralAsset, null, [{ recipeId: "gothic-window-arch", previewChannel: channel }])).toThrow(RangeError);
  expect(() => Reflect.apply(exportSynthesizedAssetSvg, null, [fixture(), channel])).toThrow(RangeError);
});


it("6종 × 최대 LOD 경계는 상한·고유 ID·유한 XML·미검토 권리 상태를 보존한다", () => {
  for (const recipe of PROCEDURAL_ASSET_RECIPES) {
    const input = Object.freeze({ recipeId: recipe.id, seed: Number.MAX_VALUE, complexityLod: 4 as const, weathering01: Number.POSITIVE_INFINITY, lineWeightPx: Number.NaN });
    const result = synthesizeProceduralAsset(input);
    expect(result.svgScene.elements.length).toBeLessThanOrEqual(2048);
    expect(new Set(result.svgScene.elements.map((item) => item.id)).size).toBe(result.svgScene.elements.length);
    const source = JSON.stringify(result);
    const svg = exportSynthesizedAssetSvg(result);
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull(); expect(svg).not.toContain("NaN");
    const parsed = JSON.parse(exportProceduralAssetManifestJson(result)) as { evidence: { meshGenerated: boolean; pbrMapsGenerated: boolean }; rightsBomCertificate: { licenseClass: string } };
    expect(parsed.evidence).toMatchObject({ meshGenerated: false, pbrMapsGenerated: false });
    expect(parsed.rightsBomCertificate.licenseClass).toBe("unknown");
    expect(JSON.stringify(result)).toBe(source); expect(Number.isNaN(input.lineWeightPx)).toBe(true);
  }
});


it("SVG와 설계 DAG를 실제 그래프 런타임 실행 또는 무저작권 보증으로 표시하지 않는다", () => {
  const parsed = JSON.parse(exportProceduralAssetManifestJson(fixture())) as { evidence: { dagRuntimeExecuted: boolean } };
  expect(parsed.evidence.dagRuntimeExecuted).toBe(false);
  render(<StudioProceduralAssetSynthPanel />);
  expect(screen.getByTestId("procedural-asset-synth-panel").textContent).not.toMatch(/무저작권|CC0 CLEAN BOM|Manifold 0/u);
});
