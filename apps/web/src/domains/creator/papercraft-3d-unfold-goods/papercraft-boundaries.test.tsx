// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPapercraftUnfoldPanel, PAPERCRAFT_MODEL_PRESETS, evaluatePaperFoldPreview, exportPapercraftDielineSvg, exportPapercraftManifestJson, formatOklch, getPapercraftPreset, unfoldPapercraftDieline } from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function fixture() {
  return unfoldPapercraftDieline({ presetId: "chibi-hero-cube", paperSize: "A4", paperWeightGsm: 250 });
}
function preview() { return evaluatePaperFoldPreview({ presetId: "chibi-hero-cube", paperWeightGsm: 250, foldProgress: 0.72 }); }

describe("외부 출력 데이터 경계", () => {
  it.each(["svg", "json"])("%s의 유한 극값과 원본 정규값 불일치를 거부한다", (kind) => {
    const dieline = structuredClone(fixture());
    Reflect.set(dieline.paperSpec, "heightMm", 1e308);
    const original = JSON.stringify(dieline);
    expect(() => kind === "svg" ? exportPapercraftDielineSvg(dieline) : exportPapercraftManifestJson(dieline, preview())).toThrow(RangeError);
    expect(JSON.stringify(dieline)).toBe(original);
  });
  it("과도한 쪽수와 희소 배열을 생성 전에 거부한다", () => {
    const dieline = structuredClone(fixture());
    Reflect.set(dieline, "totalPages", 129);
    expect(() => exportPapercraftDielineSvg(dieline)).toThrow(RangeError);
    const huge = structuredClone(fixture());
    Reflect.set(huge, "faces", new Array(10_001));
    expect(() => exportPapercraftDielineSvg(huge)).toThrow(RangeError);
  });
  it("중복 면 ID와 비유한 감사 값이 JSON에서 조용히 사라지지 않는다", () => {
    const dieline = structuredClone(fixture());
    const first = dieline.faces[0]; const second = dieline.faces[1];
    if (!first || !second) throw new Error("fixture lacks faces");
    Reflect.set(second, "faceId", first.faceId);
    expect(() => exportPapercraftDielineSvg(dieline)).toThrow(RangeError);
    const corrupt = structuredClone(fixture());
    Reflect.set(corrupt.pairIntegrity, "maxLengthMismatchMm", Number.NaN);
    expect(() => exportPapercraftManifestJson(corrupt, preview())).toThrow(RangeError);
  });
  it("다른 모델의 프리뷰를 같은 도안의 조립 검증으로 내보내지 않는다", () => {
    const wrong = evaluatePaperFoldPreview({ presetId: "cat-mascot-prism", paperWeightGsm: 250, foldProgress: 0.72 });
    expect(() => exportPapercraftManifestJson(fixture(), wrong)).toThrow(RangeError);
  });
  it("사용자 표제의 XML 문자와 유니코드를 자르지 않고 이스케이프한다", () => {
    const dieline = structuredClone(fixture());
    const title = '</title><script>alert("x")</script><title>한글 🖋️ & <원문>';
    Reflect.set(dieline.preset, "nameKo", title);
    const xml = exportPapercraftDielineSvg(dieline, { pageIndex: 0 });
    const doc = new DOMParser().parseFromString(xml, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("title")?.textContent).toContain(title);
    expect(dieline.preset.nameKo).toBe(title);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("비유한 hue %s를 CSS에 내보내지 않는다", (h) => {
    expect(formatOklch({ l: 0.5, c: 0.1, h })).not.toMatch(/NaN|Infinity/u);
  });
  it("생성 결과의 표제를 바꿔도 정본 프리셋은 보존된다", () => {
    const before = getPapercraftPreset("chibi-hero-cube").nameKo;
    const dieline = fixture();
    try {
      Reflect.set(dieline.preset, "nameKo", "별도 표제 🖋️");
      expect(getPapercraftPreset("chibi-hero-cube").nameKo).toBe(before);
    } finally { Reflect.set(dieline.preset, "nameKo", before); }
  });
});

it("분할 경계에 걸친 면의 모든 쪽에 도안 조각과 인쇄영역 클립이 남는다", () => {
  let fragments = 0;
  for (const preset of PAPERCRAFT_MODEL_PRESETS) {
    const dieline = unfoldPapercraftDieline({ presetId: preset.id, paperSize: "A4", paperWeightGsm: 250, scale: 2.5 });
    function group(index: number): number {
      for (let page = index; page >= 0; page--) {
        const origin = dieline.pages[page]?.sheetOriginMm;
        if (origin?.x === 0 && origin.y === 0) return page;
      }
      return 0;
    }
    for (const page of dieline.pages) {
      const origin = page.sheetOriginMm; const spec = dieline.paperSpec;
      const doc = new DOMParser().parseFromString(exportPapercraftDielineSvg(dieline, { pageIndex: page.pageIndex }), "image/svg+xml");
      for (const face of dieline.faces) {
        if (group(face.pageIndex) !== group(page.pageIndex)) continue;
        const xs = face.polygonMm.map((p) => p.x); const ys = face.polygonMm.map((p) => p.y);
        if (Math.max(...xs) <= origin.x + spec.printableMarginMm || Math.min(...xs) >= origin.x + spec.widthMm - spec.printableMarginMm || Math.max(...ys) <= origin.y + spec.printableMarginMm || Math.min(...ys) >= origin.y + spec.heightMm - spec.printableMarginMm) continue;
        if (face.pageIndex === page.pageIndex) continue;
        fragments++;
        expect(doc.querySelector(`[data-face="${face.faceId}"]`)).not.toBeNull();
        expect(doc.querySelector("clipPath rect")?.getAttribute("width")).toBe(String(spec.printableWidthMm));
      }
    }
  }
  expect(fragments).toBeGreaterThan(0);
});

describe("복사 ACK 경계", () => {
  it.each(["svg", "json"])("%s는 ACK 전에 성공이나 외부 알림을 보내지 않는다", async (kind) => {
    let acknowledge: (() => void) | undefined;
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; })) } });
    const recipient = vi.fn();
    render(<StudioPapercraftUnfoldPanel onExportSvg={recipient} onExportJson={recipient} />);
    fireEvent.click(screen.getByTestId(`papercraft-export-${kind}-btn`));
    try {
      expect(screen.queryByText(/복사했습니다/u)).toBeNull();
      expect(recipient).not.toHaveBeenCalled();
    } finally { await act(async () => { acknowledge?.(); }); }
    await waitFor(() => expect(recipient).toHaveBeenCalledOnce());
  });
});

it("Letter는 8.5×11인치의 정확한 mm 치수를 SVG에 유지한다", () => {
  const dieline = unfoldPapercraftDieline({ presetId: "chibi-hero-cube", paperSize: "Letter", paperWeightGsm: 250 });
  expect(dieline.paperSpec.widthMm).toBe(215.9);
  expect(dieline.paperSpec.heightMm).toBe(279.4);
  expect(exportPapercraftDielineSvg(dieline, { pageIndex: 0 })).toContain('width="215.9mm" height="279.4mm"');
});

describe("최신 수신자·실패·재시도·고정 스냅샷", () => {
  it.each(["svg", "json"] as const)("%s의 복사 실패는 같은 원문으로 재시도한다", async (kind) => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("clipboard denied")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const recipient = vi.fn();
    render(<StudioPapercraftUnfoldPanel onExportSvg={recipient} onExportJson={recipient} />);
    fireEvent.click(screen.getByTestId(`papercraft-export-${kind}-btn`));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const requested = writeText.mock.calls[0]?.[0];
    expect(recipient).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("papercraft-preset-hanok-rooftop-diorama"));
    fireEvent.click(screen.getByTestId("papercraft-export-retry-btn"));
    await waitFor(() => expect(recipient).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[1]?.[0]).toBe(requested);
    expect(recipient.mock.calls[0]?.[0]).toBe(requested);
  });

  it.each(["svg", "json"] as const)("%s의 ACK 도중 추가된 수신자가 거절한 뒤 제거돼도 재시도는 실패를 보존한다", async (kind) => {
    let acknowledge: (() => void) | undefined;
    const writeText = vi.fn((_text: string) => new Promise<void>((resolve) => { acknowledge = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { rerender } = render(<StudioPapercraftUnfoldPanel />);
    fireEvent.click(screen.getByTestId(`papercraft-export-${kind}-btn`));
    const requested = writeText.mock.calls[0]?.[0];
    const bad = vi.fn().mockRejectedValue(new Error("recipient rejected"));
    rerender(<StudioPapercraftUnfoldPanel onExportSvg={bad} onExportJson={bad} />);
    await act(async () => { acknowledge?.(); });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(bad).toHaveBeenCalledOnce();
    rerender(<StudioPapercraftUnfoldPanel />);
    fireEvent.click(screen.getByTestId("papercraft-export-retry-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const good = vi.fn().mockResolvedValue(undefined);
    rerender(<StudioPapercraftUnfoldPanel onExportSvg={good} onExportJson={good} />);
    fireEvent.click(screen.getByTestId("papercraft-export-retry-btn"));
    await waitFor(() => expect(good).toHaveBeenCalledOnce());
    expect(good.mock.calls[0]?.[0]).toBe(requested);
    expect(writeText).toHaveBeenCalledOnce();
  });

  it.each(["svg", "json"] as const)("%s의 동기 throw는 재시도 가능하고 수신자의 데이터 변경은 원본을 보존한다", async (kind) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const bad = vi.fn((_text: string, dieline: ReturnType<typeof fixture>) => {
      Reflect.set(dieline.preset, "nameKo", "수신자 변경 🖋️");
      throw new Error("receiver failed");
    });
    const { rerender } = render(<StudioPapercraftUnfoldPanel onExportSvg={bad} onExportJson={bad} />);
    fireEvent.click(screen.getByTestId(`papercraft-export-${kind}-btn`));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const good = vi.fn();
    rerender(<StudioPapercraftUnfoldPanel onExportSvg={good} onExportJson={good} />);
    fireEvent.click(screen.getByTestId("papercraft-export-retry-btn"));
    await waitFor(() => expect(good).toHaveBeenCalledOnce());
    expect(good.mock.calls[0]?.[1]?.preset.nameKo).toBe("SD 주인공 큐브 피규어");
    expect(getPapercraftPreset("chibi-hero-cube").nameKo).toBe("SD 주인공 큐브 피규어");
    expect(writeText).toHaveBeenCalledOnce();
  });

  it("클립보드 API 부재는 성공으로 처리하지 않고 unmount 후 외부 알림을 보내지 않는다", async () => {
    vi.stubGlobal("navigator", {});
    const recipient = vi.fn();
    const first = render(<StudioPapercraftUnfoldPanel onExportSvg={recipient} />);
    fireEvent.click(screen.getByTestId("papercraft-export-svg-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(recipient).not.toHaveBeenCalled();
    first.unmount();
    let acknowledge: (() => void) | undefined;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const second = render(<StudioPapercraftUnfoldPanel onExportSvg={recipient} />);
    fireEvent.click(screen.getByTestId("papercraft-export-svg-btn"));
    fireEvent.click(screen.getByTestId("papercraft-export-json-btn"));
    expect(writeText).toHaveBeenCalledOnce();
    second.unmount();
    await act(async () => { acknowledge?.(); });
    expect(recipient).not.toHaveBeenCalled();
  });
});

it("최대 배율·종이·평량 조합은 상한 안에서 SVG/JSON roundtrip과 원본을 보존한다", () => {
  for (const preset of PAPERCRAFT_MODEL_PRESETS) {
    const raw = Object.freeze({ presetId: preset.id, paperSize: "Letter" as const, paperWeightGsm: 300 as const, scale: Number.MAX_VALUE });
    const dieline = unfoldPapercraftDieline(raw);
    const view = evaluatePaperFoldPreview({ ...raw, foldProgress: Number.MAX_VALUE, cameraPitchDeg: Number.NaN, cameraYawDeg: Number.NEGATIVE_INFINITY });
    const before = JSON.stringify(dieline);
    const svg = exportPapercraftDielineSvg(dieline);
    expect(svg).not.toMatch(/NaN|Infinity/u);
    expect(dieline.totalPages).toBeLessThanOrEqual(128);
    const parsed = JSON.parse(exportPapercraftManifestJson(dieline, view)) as { evidence: { assemblyVerified: boolean; printerCalibrated: boolean } };
    expect(parsed.evidence).toMatchObject({ assemblyVerified: false, printerCalibrated: false });
    expect(JSON.stringify(dieline)).toBe(before);
    expect(raw.scale).toBe(Number.MAX_VALUE);
  }
});

it("수동 소스 보기는 현재 설정을 표시하고 복사 재시도의 고정 원문과 구분된다", async () => {
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  render(<StudioPapercraftUnfoldPanel />);
  fireEvent.click(screen.getByTestId("papercraft-export-svg-btn"));
  await waitFor(() => expect(screen.getByTestId("papercraft-status-banner").textContent).toContain("복사했습니다"));
  fireEvent.click(screen.getByTestId("papercraft-paper-A3"));
  fireEvent.click(screen.getByTestId("papercraft-toggle-svg-btn"));
  fireEvent.click(screen.getByTestId("papercraft-toggle-svg-btn"));
  expect(screen.getByTestId("papercraft-svg-preview").textContent).toContain('width="297mm" height="420mm"');
});
