// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioExportBasicOptions } from "./StudioExportBasicOptions";

// 파일·클립보드 경계만 대체한다. 실제 UI·접기·요약·포커스 구현은 그대로 렌더한다.
vi.mock("./studio-export", () => ({
  EXPORT_FORMATS: ["png", "jpg", "webp"], EXPORT_SCALES: [1, 2, 3],
  exportFormatLabel: (format: string) => format === "jpg" ? "JPG" : format === "webp" ? "WebP" : "PNG",
  canCopyImageToClipboard: () => true,
}));

type Props = ComponentProps<typeof StudioExportBasicOptions>;
function props(overrides: Partial<Props> = {}): Props {
  return {
    canvasWidth: 800, canvasHeight: 1200, exportScale: 2, exportFormat: "png", exportTransparent: false,
    watermark: { enabled: false, text: "", position: "br", opacity: 0.55, size: 0.028 },
    isExporting: false, busy: false,
    setExportScale: vi.fn(), setExportFormat: vi.fn(), setExportTransparent: vi.fn(), setExportPresetId: vi.fn(),
    setWatermark: vi.fn(), onCopyToClipboard: vi.fn(), onDownloadCurrentPage: vi.fn(), ...overrides,
  };
}
function appearance(container: HTMLElement): HTMLDetailsElement {
  const element = container.querySelector('[data-studio-export-section="appearance"]');
  if (!(element instanceof HTMLDetailsElement)) throw new Error("배경·서명 설정 누락");
  return element;
}
function summary(container: HTMLElement): HTMLElement {
  const element = container.querySelector("[data-studio-export-output-summary]");
  if (!(element instanceof HTMLElement)) throw new Error("출력 요약 누락");
  return element;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("모바일에서도 예측할 수 있는 이미지 다운로드", () => {
  it("상세 설정은 접고 실제 선택 형식·크기·배경·서명을 먼저 보여준다", () => {
    const { container } = render(<StudioExportBasicOptions {...props()} />);
    expect(appearance(container).open).toBe(false);
    expect(summary(container).textContent).toContain("PNG · 1600 × 2400 px");
    expect(summary(container).textContent).toContain("배경 유지");
    expect(summary(container).textContent).toContain("사용 안 함");
    const download = screen.getByRole("button", { name: "현재 페이지 PNG 다운로드" });
    expect(summary(container).compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(download.closest("details")).toBeNull();
  });
  it.each([["png", "무손실"], ["jpg", "투명 배경 불가"], ["webp", "웹에서"]] as const)("%s의 차이를 파일명만이 아닌 설명으로 알린다", (exportFormat, explanation) => {
    render(<StudioExportBasicOptions {...props({ exportFormat })} />);
    expect(screen.getByRole("group", { name: "파일 형식" }).textContent).toContain(explanation);
  });
  it("JPG에서 투명도 요청을 숨기지 않고 PNG·WebP 선택 방법을 알린다", () => {
    const configuration = props({ exportFormat: "jpg", exportTransparent: true });
    const { container } = render(<StudioExportBasicOptions {...configuration} />);
    expect(summary(container).textContent).toContain("JPG · 투명 배경 불가");
    expect(summary(container).textContent).toContain("PNG 또는 WebP");
    expect(configuration.setExportTransparent).not.toHaveBeenCalled();
    expect(configuration.setExportFormat).not.toHaveBeenCalled();
  });
  it("형식을 바꿔도 기존 투명 배경 요청을 지우지 않는다", () => {
    const configuration = props({ exportFormat: "jpg", exportTransparent: true });
    const view = render(<StudioExportBasicOptions {...configuration} />);
    fireEvent.click(screen.getByRole("button", { name: "PNG" }));
    expect(configuration.setExportFormat).toHaveBeenCalledExactlyOnceWith("png");
    view.rerender(<StudioExportBasicOptions {...configuration} exportFormat="png" />);
    expect(summary(view.container).textContent).toContain("투명 배경 켜짐");
    expect(configuration.setExportTransparent).not.toHaveBeenCalled();
  });
  it("배율은 기존 setter와 프리셋 해제 경로를 한 번만 호출한다", () => {
    const configuration = props(); render(<StudioExportBasicOptions {...configuration} />);
    fireEvent.click(screen.getByRole("button", { name: "3×" }));
    expect(configuration.setExportScale).toHaveBeenCalledExactlyOnceWith(3);
    expect(configuration.setExportPresetId).toHaveBeenCalledExactlyOnceWith(null);
  });
  it("배경 수정은 해당 설정을 펼치고 투명도 체크박스로 이동한다", () => {
    const { container } = render(<StudioExportBasicOptions {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "배경·서명 수정하기" }));
    expect(appearance(container).open).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "투명 배경 (PNG·WebP)" }));
  });
  it("JPG에서는 비활성 투명도에 초점을 잃지 않고 서명으로 이동한다", () => {
    render(<StudioExportBasicOptions {...props({ exportFormat: "jpg" })} />);
    fireEvent.click(screen.getByRole("button", { name: "배경·서명 수정하기" }));
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "서명·워터마크" }));
  });
  it("빈 문구가 적용된 것처럼 보이지 않으며 입력으로 바로 이동한다", () => {
    const configuration = props(); configuration.watermark.enabled = true;
    const { container } = render(<StudioExportBasicOptions {...configuration} />);
    expect(summary(container).textContent).toContain("문구 없음");
    fireEvent.click(screen.getByRole("button", { name: "서명 문구 입력하기" }));
    expect(appearance(container).open).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "워터마크 문구" }));
    fireEvent.change(document.activeElement ?? document.body, { target: { value: "서명" } });
    expect(configuration.setWatermark).toHaveBeenCalledWith({ ...configuration.watermark, text: "서명" });
  });
  it("투명도 0인 서명의 수정은 투명도 조작으로 이동한다", () => {
    const configuration = props(); configuration.watermark = { ...configuration.watermark, enabled: true, text: "서명", opacity: 0 };
    render(<StudioExportBasicOptions {...configuration} />);
    fireEvent.click(screen.getByRole("button", { name: "배경·서명 수정하기" }));
    expect(document.activeElement).toBe(screen.getByRole("slider", { name: "워터마크 투명도" }));
  });
  it("설정 뒤 복귀는 파일을 생성하지 않고 원래 다운로드 버튼으로 간다", () => {
    const configuration = props(); render(<StudioExportBasicOptions {...configuration} />);
    fireEvent.click(screen.getByRole("button", { name: "배경·서명 수정하기" }));
    fireEvent.click(screen.getByRole("button", { name: "다운로드로 돌아가기" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "현재 페이지 PNG 다운로드" }));
    expect(configuration.onDownloadCurrentPage).not.toHaveBeenCalled();
  });
  it("파일 준비 중에는 설정 변경을 잠그되 패키지 취소는 잠그지 않는다", () => {
    const configuration = props({ busy: true }); const cancel = vi.fn();
    const { container } = render(<StudioExportBasicOptions {...configuration}><button type="button" onClick={cancel}>패키지 취소</button></StudioExportBasicOptions>);
    fireEvent.click(screen.getByRole("button", { name: "WebP" }));
    fireEvent.click(screen.getByRole("button", { name: "3×" }));
    fireEvent.click(screen.getByRole("button", { name: "현재 페이지 PNG 다운로드" }));
    expect(configuration.setExportFormat).not.toHaveBeenCalled();
    expect(configuration.setExportScale).not.toHaveBeenCalled();
    expect(configuration.onDownloadCurrentPage).not.toHaveBeenCalled();
    const cancelButton = screen.getByRole("button", { name: "패키지 취소" });
    expect(cancelButton.matches(":disabled")).toBe(false);
    fireEvent.click(cancelButton); expect(cancel).toHaveBeenCalledOnce();
    appearance(container).open = true;
    expect(screen.getByRole("checkbox", { name: "서명·워터마크" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "다운로드로 돌아가기" }));
    expect(document.activeElement).toBe(summary(container));
  });
  it("부모 busy 전파 전이라도 isExporting이 참이면 설정을 잠근다", () => {
    render(<StudioExportBasicOptions {...props({ isExporting: true, busy: false })} />);
    expect(screen.getByRole("button", { name: "PNG" }).matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "파일 준비 중…" }).getAttribute("aria-busy")).toBe("true");
  });
  it("준비가 끝나면 선택값을 바꾸지 않고 조작을 다시 열어 준다", () => {
    const configuration = props({ busy: true }); const view = render(<StudioExportBasicOptions {...configuration} />);
    view.rerender(<StudioExportBasicOptions {...configuration} busy={false} />);
    expect(screen.getByRole("button", { name: "2×" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "PNG" }).matches(":disabled")).toBe(false);
    expect(configuration.setExportScale).not.toHaveBeenCalled();
  });
  it("현재 페이지 다운로드는 기존 콜백을 한 번만 부른다", () => {
    const configuration = props(); render(<StudioExportBasicOptions {...configuration} />);
    fireEvent.click(screen.getByRole("button", { name: "현재 페이지 PNG 다운로드" }));
    expect(configuration.onDownloadCurrentPage).toHaveBeenCalledOnce();
  });
  it("클립보드는 선택한 JPG가 아닌 실제 PNG 형식임을 명시한다", () => {
    const configuration = props({ exportFormat: "jpg" }); render(<StudioExportBasicOptions {...configuration} />);
    const copy = screen.getByRole("button", { name: "현재 페이지 복사" });
    const description = document.getElementById(copy.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("PNG");
    fireEvent.click(copy); expect(configuration.onCopyToClipboard).toHaveBeenCalledOnce();
  });
  it("다운로드 콜백이 없는 호스트에서도 복귀는 안전한 요약을 가리킨다", () => {
    const { container } = render(<StudioExportBasicOptions {...props({ onDownloadCurrentPage: undefined })} />);
    fireEvent.click(screen.getByRole("button", { name: "배경·서명 수정하기" }));
    fireEvent.click(screen.getByRole("button", { name: "다운로드로 돌아가기" }));
    expect(document.activeElement).toBe(summary(container));
  });
  it("두 패널이 함께 있어도 도움말 id와 수정 대상이 섞이지 않는다", () => {
    const first = render(<StudioExportBasicOptions {...props()} />);
    const second = render(<StudioExportBasicOptions {...props()} />);
    const ids = Array.from(document.querySelectorAll("[id]"), (element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    fireEvent.click(within(second.container).getByRole("button", { name: "배경·서명 수정하기" }));
    expect(appearance(second.container).open).toBe(true);
    expect(appearance(first.container).open).toBe(false);
  });
  it.each([
    { canvasWidth: 800, canvasHeight: 1200, exportScale: 2, dimensions: "1600 × 2400 px", large: false },
    { canvasWidth: 1600, canvasHeight: 20000, exportScale: 1, dimensions: "1600 × 20000 px", large: false },
    { canvasWidth: 1601, canvasHeight: 1200, exportScale: 1, dimensions: "1601 × 1200 px", large: true },
    { canvasWidth: 800, canvasHeight: 20001, exportScale: 1, dimensions: "800 × 20001 px", large: true },
    { canvasWidth: 1200, canvasHeight: 9000, exportScale: 3, dimensions: "3600 × 27000 px", large: true },
  ] as const)("이미지 크기 $dimensions 안내는 권리·투고 규격 검사 완료를 주장하지 않는다", ({ dimensions, large, ...configuration }) => {
    const { container } = render(<StudioExportBasicOptions {...props(configuration)} />);
    const output = summary(container);
    expect(output.textContent).toContain(dimensions);
    expect(output.textContent).toContain("이미지 크기 안내");
    expect(output.textContent).toContain(large
      ? "큰 이미지예요. 제출처의 가로·세로 제한을 확인하세요."
      : "선택한 이미지 크기입니다.");
    expect(output.textContent).not.toMatch(/Rights BOM|규격 적합|자동 점검|자동 슬라이스/u);
  });
});
