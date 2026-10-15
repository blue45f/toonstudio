// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROMO_DOCUMENT_CUTS_MAX } from "../promo/promo-handoff-contract";
import { parsePromoDocumentCutBundle } from "../promo/promo-document-cuts";
import { parsePromoTranslationBundle } from "../promo/promo-translation-drafts";
import { DEFAULT_WATERMARK } from "../studio-watermark";
import { resetStudioExportGeometryDraft } from "./studio-export-geometry-draft";
import { StudioEnhancedExportMenuPanel } from "./StudioEnhancedExportMenuPanel";
import { StudioPromoHandoffSection, type StudioPromoHandoffSectionProps } from "./StudioPromoHandoffSection";

import type { DialogueElementLike } from "../lettering/studio-dialogue-batch";
import type { DialogueReviewPageLike } from "../lettering/studio-dialogue-review";
import type { StudioExportMenuPackageContext, StudioExportMenuPanelProps } from "./StudioExportMenuPanel";
import type { StudioPromoCutImageRenderer } from "./studio-promo-handoff";

const PNG = "data:image/png;base64,aGVsbG8=";
const hoisted = vi.hoisted(() => ({
  render: vi.fn<StudioPromoCutImageRenderer>(),
  download: vi.fn<(blob: Blob, fileName: string) => void>(),
}));
// 실제 캔버스가 없는 jsdom에서는 컷 이미지 그리기만 대신하고, 묶음 조립·검증은 실제 코드를 쓴다.
vi.mock("./studio-promo-handoff", async (original) => ({
  ...(await original<typeof import("./studio-promo-handoff")>()),
  createStudioPromoCutImageRenderer: () => hoisted.render,
}));
vi.mock("./studio-export", async (original) => ({
  ...(await original<typeof import("./studio-export")>()),
  downloadBlob: hoisted.download,
}));

const frame = (id: string, x: number, y: number, width: number, height: number): DialogueElementLike => ({ id, type: "frame", x, y, width, height });
const bubble = (id: string, text: string, x: number, y: number): DialogueElementLike => ({ id, type: "bubble", text, x, y, width: 60, height: 30 });

function documentPages(): DialogueReviewPageLike[] {
  return [
    {
      id: "p1",
      elements: [frame("f1", 20, 20, 330, 300), frame("f2", 370, 20, 330, 300), bubble("b1", "어서 와", 40, 40), bubble("b2", "어디로?", 400, 60)],
      dialogueI18n: { b1: { source: "어서 와", en: "Welcome.", ja: "ようこそ" }, b2: { source: "어디로?", en: "Where to?" } },
      dialogueReview: { b1: { en: "approved" }, b2: { en: "needs-edit" } },
    },
    { id: "p2", elements: [frame("f3", 20, 20, 680, 400), bubble("b3", "또 만나", 50, 50)] },
  ];
}

function canvasOf(width = 1440, height = 2000): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function contextOf(overrides: Partial<StudioExportMenuPackageContext> = {}): StudioExportMenuPackageContext {
  return {
    pageIndices: [0, 1],
    canExport: true,
    busy: false,
    rangeLabel: "페이지 1–2",
    capturePages: vi.fn(() => Promise.resolve({ pages: [canvasOf(), canvasOf()], indices: [0, 1], rangeLabel: "페이지 1–2" })),
    ...overrides,
  };
}

function sectionProps(overrides: Partial<StudioPromoHandoffSectionProps> = {}): StudioPromoHandoffSectionProps {
  return {
    context: contextOf(),
    pages: documentPages(),
    canvasWidth: 720,
    exportScale: 2,
    exportTitle: "별빛 아래",
    watermark: DEFAULT_WATERMARK,
    sourceWorkId: "work-1",
    onBusyChange: vi.fn(),
    ...overrides,
  };
}

const cutsButton = () => screen.getByRole("button", { name: /홍보 쇼츠용 컷 묶음 (저장|다시 시도)|컷 묶음 만드는 중|컷 묶음 다시 시도/u });
const translationsButton = () => screen.getByRole("button", { name: /번역 초안 (JSON 저장|다시 시도|만드는 중)/u });

beforeEach(() => {
  hoisted.render.mockReset();
  hoisted.render.mockImplementation(() => Promise.resolve(PNG));
  hoisted.download.mockReset();
});
afterEach(() => cleanup());

describe("홍보 쇼츠로 보내기 섹션", () => {
  it("선택한 범위의 컷·말풍선 수와 주의 사항을 보여 준다", () => {
    render(<StudioPromoHandoffSection {...sectionProps()} />);
    const region = screen.getByRole("region", { name: "홍보 쇼츠로 보내기" });
    expect(within(region).getByText(/페이지 1–2 · 컷 3개 · 말풍선 3개/u)).toBeTruthy();
    expect(within(region).getByText(/컷 이미지에는 말풍선이 그려진 채로 들어가요/u)).toBeTruthy();
    expect(within(region).getByText(/컷 순서는 대사 읽기 순서/u)).toBeTruthy();
    expect(cutsButton().hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("link", { name: /홍보 영상 편집기 열기/u }).getAttribute("href")).toBe("/showcase/promo");
    expect(screen.getByRole("link", { name: /홍보 영상 편집기 열기/u }).getAttribute("rel")).toContain("noopener");
  });

  it("문서 정보가 없으면 이유를 말하고 모든 버튼을 숨긴다", () => {
    render(<StudioPromoHandoffSection {...sectionProps({ pages: null })} />);
    expect(screen.getByText(/컷과 대사 정보를 받지 못해/u)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("내보내기 배율이 낮으면 해상도 안내를 보여 준다", () => {
    const { rerender } = render(<StudioPromoHandoffSection {...sectionProps({ exportScale: 1 })} />);
    expect(screen.getByText(/내보내기 배율이 1×예요\. 영상에서는 2× 이상을 권장해요/u)).toBeTruthy();
    rerender(<StudioPromoHandoffSection {...sectionProps({ exportScale: 2 })} />);
    expect(screen.queryByText(/내보내기 배율이/u)).toBeNull();
  });

  it("번역 언어로 보이는 말풍선이 있으면 원문으로 돌린 뒤 내보내라고 알린다", () => {
    const pages = documentPages();
    const first = pages[0];
    if (!first) throw new Error("fixture");
    const shown = { ...first, elements: first.elements.map((element) => (element.id === "b1" ? { ...element, text: "Welcome." } : element)) };
    render(<StudioPromoHandoffSection {...sectionProps({ pages: [shown, ...pages.slice(1)] })} />);
    expect(screen.getByText(/말풍선 1개가 번역 언어로 보이고 있어요/u)).toBeTruthy();
  });

  it("컷이 없는 범위와 컷이 너무 많은 범위는 버튼을 잠그고 이유를 알린다", () => {
    const empty = render(<StudioPromoHandoffSection {...sectionProps({ pages: [{ id: "p", elements: [bubble("b", "말", 10, 10)] }, { id: "q", elements: [] }] })} />);
    expect(screen.getByText(/컷\(프레임\)이 없어요/u)).toBeTruthy();
    expect(cutsButton().hasAttribute("disabled")).toBe(true);
    empty.unmount();
    const many = Array.from({ length: PROMO_DOCUMENT_CUTS_MAX + 1 }, (_, index) => frame(`f${index}`, 0, index * 100, 700, 90));
    render(<StudioPromoHandoffSection {...sectionProps({ pages: [{ id: "p", elements: many }], context: contextOf({ pageIndices: [0] }) })} />);
    expect(screen.getByRole("alert").textContent).toContain(`${PROMO_DOCUMENT_CUTS_MAX}컷까지`);
    expect(cutsButton().hasAttribute("disabled")).toBe(true);
  });

  it("다른 내보내기가 진행 중이거나 범위가 막혀 있으면 버튼을 잠근다", () => {
    const { rerender } = render(<StudioPromoHandoffSection {...sectionProps({ context: contextOf({ busy: true }) })} />);
    expect(cutsButton().hasAttribute("disabled")).toBe(true);
    expect(translationsButton().hasAttribute("disabled")).toBe(true);
    rerender(<StudioPromoHandoffSection {...sectionProps({ context: contextOf({ canExport: false }) })} />);
    expect(cutsButton().hasAttribute("disabled")).toBe(true);
    fireEvent.click(cutsButton());
    expect(hoisted.download).not.toHaveBeenCalled();
  });
});

describe("컷 묶음 저장", () => {
  it("선택 범위를 캡처해 컷 묶음 JSON을 저장하고 캡처 캔버스를 놓아 준다", async () => {
    const pages = [canvasOf(), canvasOf()];
    const onBusyChange = vi.fn();
    const context = contextOf({ capturePages: vi.fn(() => Promise.resolve({ pages, indices: [0, 1], rangeLabel: "페이지 1–2" })) });
    render(<StudioPromoHandoffSection {...sectionProps({ context, onBusyChange })} />);
    fireEvent.click(cutsButton());
    await waitFor(() => expect(hoisted.download).toHaveBeenCalledTimes(1));
    const [blob, fileName] = hoisted.download.mock.calls[0] ?? [];
    expect(fileName).toBe("별빛 아래-promo-cuts.json");
    const bundle = parsePromoDocumentCutBundle(JSON.parse(await (blob?.text() ?? Promise.resolve("null"))));
    expect(bundle).toMatchObject({ documentId: "work-1", title: "별빛 아래" });
    expect(bundle.cuts.map((cut) => cut.id)).toEqual(["p1:f1", "p1:f2", "p2:f3"]);
    expect(blob?.type).toBe("application/json");
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("컷 3개를 저장했어요"));
    expect(screen.getByRole("status").textContent).toContain("Studio 문서에서 컷 가져오기");
    expect(pages.every((canvas) => canvas.width === 1)).toBe(true);
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(cutsButton().hasAttribute("disabled")).toBe(false);
  });

  it("만드는 동안 진행률과 취소 버튼을 보여 주고 다른 버튼을 잠근다", async () => {
    let release: (() => void) | undefined;
    hoisted.render.mockImplementationOnce(() => new Promise<string>((resolve) => { release = () => resolve(PNG); }));
    render(<StudioPromoHandoffSection {...sectionProps()} />);
    fireEvent.click(cutsButton());
    await waitFor(() => expect(screen.getByRole("button", { name: "컷 묶음 만드는 중" })).toBeTruthy());
    expect(screen.getByRole("region", { name: "홍보 쇼츠로 보내기" }).getAttribute("aria-busy")).toBe("true");
    expect(cutsButton().hasAttribute("disabled")).toBe(true);
    expect(translationsButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "홍보 쇼츠용 컷 묶음 만들기 취소" })).toBeTruthy();
    await waitFor(() => expect(release).toBeDefined());
    release?.();
    await waitFor(() => expect(hoisted.download).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: "홍보 쇼츠용 컷 묶음 만들기 취소" })).toBeNull());
  });

  it("진행률 막대가 컷마다 올라간다", async () => {
    const releases: Array<() => void> = [];
    hoisted.render.mockImplementation(() => new Promise<string>((resolve) => { releases.push(() => resolve(PNG)); }));
    render(<StudioPromoHandoffSection {...sectionProps()} />);
    fireEvent.click(cutsButton());
    await waitFor(() => expect(releases).toHaveLength(1));
    releases[0]?.();
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "홍보 쇼츠용 컷 묶음 진행률" }).getAttribute("aria-valuenow")).toBe("33"));
    expect(screen.getByRole("status").textContent).toContain("1/3");
    await waitFor(() => expect(releases).toHaveLength(2));
    releases[1]?.();
    await waitFor(() => expect(releases).toHaveLength(3));
    releases[2]?.();
    await waitFor(() => expect(hoisted.download).toHaveBeenCalledTimes(1));
  });

  it("취소하면 파일을 저장하지 않고 다시 시도할 수 있게 한다", async () => {
    let release: (() => void) | undefined;
    hoisted.render.mockImplementationOnce(() => new Promise<string>((resolve) => { release = () => resolve(PNG); }));
    render(<StudioPromoHandoffSection {...sectionProps()} />);
    fireEvent.click(cutsButton());
    const cancel = await screen.findByRole("button", { name: "홍보 쇼츠용 컷 묶음 만들기 취소" });
    await waitFor(() => expect(release).toBeDefined());
    fireEvent.click(cancel);
    expect(screen.getByRole("status").textContent).toContain("멈추고 있어요");
    release?.();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("취소했어요"));
    expect(hoisted.download).not.toHaveBeenCalled();
    expect(cutsButton().textContent).toContain("다시 시도");
    expect(cutsButton().hasAttribute("disabled")).toBe(false);
  });

  it("캡처가 실패하면 이유를 알리고, 다시 시도하면 저장된다", async () => {
    const capturePages = vi.fn<StudioExportMenuPackageContext["capturePages"]>()
      .mockRejectedValueOnce(new Error("페이지 캡처가 완료되지 않았습니다."))
      .mockResolvedValue({ pages: [canvasOf(), canvasOf()], indices: [0, 1], rangeLabel: "페이지 1–2" });
    render(<StudioPromoHandoffSection {...sectionProps({ context: contextOf({ capturePages }) })} />);
    fireEvent.click(cutsButton());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("페이지 캡처가 완료되지 않았습니다."));
    expect(hoisted.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "컷 묶음 다시 시도" }));
    await waitFor(() => expect(hoisted.download).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("status").textContent).toContain("컷 3개를 저장했어요");
  });

  it("캡처 개수가 범위와 맞지 않으면 저장하지 않는다", async () => {
    const context = contextOf({ capturePages: vi.fn(() => Promise.resolve({ pages: [canvasOf()], indices: [0, 1], rangeLabel: "페이지 1–2" })) });
    render(<StudioPromoHandoffSection {...sectionProps({ context })} />);
    fireEvent.click(cutsButton());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("끝까지 되지 않았어요"));
    expect(hoisted.download).not.toHaveBeenCalled();
  });

  it("캡처 밖의 컷이 있으면 저장은 하되 경고로 알린다", async () => {
    const context = contextOf({ pageIndices: [0], capturePages: vi.fn(() => Promise.resolve({ pages: [canvasOf(1440, 400)], indices: [0], rangeLabel: "페이지 1" })), rangeLabel: "페이지 1" });
    const pages = documentPages();
    const first = pages[0];
    if (!first) throw new Error("fixture");
    render(<StudioPromoHandoffSection {...sectionProps({ context, pages: [{ ...first, elements: [...first.elements, frame("far", 20, 900, 300, 300)] }, ...pages.slice(1)] })} />);
    fireEvent.click(cutsButton());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("캡처 밖에 있는 컷 1개는 담지 못했어요"));
    expect(hoisted.download).toHaveBeenCalledTimes(1);
  });

  it("페이지 범위를 바꾸면 이전 결과 문구를 보여 주지 않는다", async () => {
    const { rerender } = render(<StudioPromoHandoffSection {...sectionProps()} />);
    fireEvent.click(cutsButton());
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("저장했어요"));
    rerender(<StudioPromoHandoffSection {...sectionProps({ context: contextOf({ pageIndices: [0], rangeLabel: "페이지 1" }) })} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("패널이 닫히면 진행 중인 작업을 멈추고 잠금을 풀어 준다", async () => {
    const onBusyChange = vi.fn();
    let release: (() => void) | undefined;
    hoisted.render.mockImplementationOnce(() => new Promise<string>((resolve) => { release = () => resolve(PNG); }));
    const view = render(<StudioPromoHandoffSection {...sectionProps({ onBusyChange })} />);
    fireEvent.click(cutsButton());
    await screen.findByRole("button", { name: "컷 묶음 만드는 중" });
    await waitFor(() => expect(release).toBeDefined());
    view.unmount();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(hoisted.download).not.toHaveBeenCalled();
  });
});

describe("번역 초안 저장", () => {
  it("로케일별 번역·승인 수를 보여 주고 번역 초안 JSON을 저장한다", async () => {
    render(<StudioPromoHandoffSection {...sectionProps()} />);
    const list = screen.getByRole("list", { name: "로케일별 번역 현황" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["en · 번역 2건 · 승인 1건", "ja · 번역 1건 · 승인 0건"]);
    fireEvent.click(translationsButton());
    await waitFor(() => expect(hoisted.download).toHaveBeenCalledTimes(1));
    const [blob, fileName] = hoisted.download.mock.calls[0] ?? [];
    expect(fileName).toBe("별빛 아래-translation-drafts.json");
    const parsed = parsePromoTranslationBundle(JSON.parse(await (blob?.text() ?? Promise.resolve("null"))));
    expect(parsed.documentId).toBe("work-1");
    expect(parsed.drafts).toHaveLength(3);
    expect(parsed.rows.map((row) => row.elementId)).toEqual(["b1", "b2", "b3"]);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("로케일 2개, 번역 3건을 저장했어요"));
  });

  it("번역이 없는 범위는 안내하고 버튼을 잠근다", () => {
    render(<StudioPromoHandoffSection {...sectionProps({ context: contextOf({ pageIndices: [1], rangeLabel: "페이지 2" }) })} />);
    expect(screen.getByText(/번역된 대사가 없어요/u)).toBeTruthy();
    expect(translationsButton().hasAttribute("disabled")).toBe(true);
  });
});

describe("내보내기 메뉴 안에서", () => {
  function panelProps(overrides: Partial<StudioExportMenuPanelProps> = {}): StudioExportMenuPanelProps {
    return {
      canvasWidth: 720, canvasHeight: 1200, exportScale: 2, exportFormat: "png",
      exportTransparent: false, exportPresetId: null, isExporting: false,
      watermark: { enabled: false, text: "", opacity: 0.2, position: "br", size: 0.028 },
      exportTitle: "별빛 아래", pageCount: 2, pageLabels: ["1", "2"],
      setExportScale: vi.fn(), setExportFormat: vi.fn(), setExportTransparent: vi.fn(),
      setExportPresetId: vi.fn(), setWatermark: vi.fn(), onCopyToClipboard: vi.fn(),
      capturePagesForPreset: vi.fn(() => Promise.resolve([canvasOf(), canvasOf()])),
      capturePagesForIndices: vi.fn((indices: number[]) => Promise.resolve(indices.map(() => canvasOf()))),
      dialoguePages: documentPages(),
      sourceWorkId: "work-1",
      ...overrides,
    };
  }
  beforeEach(() => resetStudioExportGeometryDraft());

  it("검증 다운로드 패키지 아래에 나타나고, 문서 정보가 없으면 만들 수 없다고 말한다", () => {
    const { unmount } = render(<StudioEnhancedExportMenuPanel {...panelProps()} />);
    const section = document.querySelector("[data-studio-promo-handoff]");
    const verified = document.querySelector("[data-studio-verified-download-package]");
    if (!section || !verified) throw new Error("내보내기 메뉴에 섹션이 없어요.");
    expect(section.closest("[data-studio-export-menu-panel]")).toBeTruthy();
    expect(verified.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/페이지 1–2 · 컷 3개 · 말풍선 3개/u)).toBeTruthy();
    unmount();
    render(<StudioEnhancedExportMenuPanel {...panelProps({ dialoguePages: null })} />);
    expect(screen.getByText(/컷과 대사 정보를 받지 못해/u)).toBeTruthy();
  });

  it("컷 묶음을 만드는 동안 다른 내보내기와 캡처 잠금을 공유한다", async () => {
    let finishCapture: ((pages: HTMLCanvasElement[]) => void) | undefined;
    const props = panelProps({ capturePagesForIndices: vi.fn(() => new Promise<HTMLCanvasElement[]>((resolve) => { finishCapture = resolve; })) });
    render(<StudioEnhancedExportMenuPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "홍보 쇼츠용 컷 묶음 저장" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "컷 묶음 만드는 중" })).toBeTruthy());
    expect(props.capturePagesForIndices).toHaveBeenCalledWith([0, 1]);
    expect(screen.getByRole("button", { name: "페이지 ZIP 다운로드" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /^CBZ ·/u }).hasAttribute("disabled")).toBe(true);
    finishCapture?.([canvasOf(), canvasOf()]);
    await waitFor(() => expect(hoisted.download).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "페이지 ZIP 다운로드" }).hasAttribute("disabled")).toBe(false));
  });

  it("검증 다운로드 패키지가 캡처하는 동안에는 컷 묶음 버튼이 잠긴다", async () => {
    const props = panelProps({ capturePagesForIndices: vi.fn(() => new Promise<HTMLCanvasElement[]>(() => undefined)) });
    render(<StudioEnhancedExportMenuPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "페이지 ZIP 다운로드" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "홍보 쇼츠용 컷 묶음 저장" }).hasAttribute("disabled")).toBe(true));
    expect(screen.getByRole("button", { name: "번역 초안 JSON 저장" }).hasAttribute("disabled")).toBe(true);
  });
});
