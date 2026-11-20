// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderExpandedExportPanel } from "./StudioExportMenuPanel.test-helpers";

import { STUDIO_WILL_V1_OPC_ASSURANCE } from "../studio-will-v1-opc-interchange";

import {
  STUDIO_WILL_V1_EXPORT_DISCLAIMER,
  STUDIO_WILL_V1_EXPORT_PROFILE_LABEL,
  type StudioWillV1PageExportResult,
} from "./studio-will-v1-export-bridge";
import { StudioExportMenuPanel } from "./StudioExportMenuPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioExportMenuPanel WILL v1 public-spec profile", () => {
  it("downloads the bounded Worker result while keeping official certification claims out of the UI", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:will"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const workerResult = Promise.withResolvers<StudioWillV1PageExportResult>();
    const exportCurrentPageToWillV1 = vi.fn(() => workerResult.promise);

    renderExpandedExportPanel(
      <StrictMode>
        <StudioExportMenuPanel
          canvasWidth={800}
          canvasHeight={1_200}
          exportScale={1}
          exportFormat="png"
          exportTransparent
          exportPresetId={null}
          watermark={{ enabled: false, text: "", opacity: 0.2, position: "br", size: 0.028 }}
          isExporting={false}
          exportTitle="episode:will"
          pageCount={1}
          pageLabels={["1"]}
          setExportScale={vi.fn()}
          setExportFormat={vi.fn()}
          setExportTransparent={vi.fn()}
          setExportPresetId={vi.fn()}
          setWatermark={vi.fn()}
          onCopyToClipboard={vi.fn()}
          capturePagesForPreset={vi.fn(async () => [])}
          exportCurrentPageToWillV1={exportCurrentPageToWillV1}
        />
      </StrictMode>,
    );

    const exchangeRegion = screen.getByRole("region", { name: "문서 교환 포맷" });
    expect(exchangeRegion.querySelector("div.grid")?.className).toContain("grid-cols-2");
    expect(
      screen.getByText(/Wacom 공식 SDK·인증 파일이 아닙니다/u),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "WILL v1" }));

    expect(exportCurrentPageToWillV1).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/WILL v1 내보내기 진행 중/u)).toBeTruthy();
    expect(click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    workerResult.resolve({
      bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      extension: ".will",
      mediaType: "application/vnd.toonstudio.will-v1-bounded+zip",
      profileLabel: STUDIO_WILL_V1_EXPORT_PROFILE_LABEL,
      disclaimer: STUDIO_WILL_V1_EXPORT_DISCLAIMER,
      exportedStrokeIds: ["stroke-1", "stroke-2"],
      skipped: [{
        elementId: "eraser-1",
        reason: "eraser-semantic-not-representable",
      }],
      adaptations: [],
      loss: {
        status: "exact",
        quantization: "truncate-toward-zero",
        items: [],
      },
      assurance: STUDIO_WILL_V1_OPC_ASSURANCE,
    });

    expect(await screen.findByText(/WILL v1 2개 획을 저장했어요/u)).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "application/vnd.toonstudio.will-v1-bounded+zip",
      }),
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toMatchObject({ href: "blob:will", download: "episodewill.will" });
    expect(screen.getByText(/표현할 수 없는 1개 요소/u)).toBeTruthy();
    expect(
      screen.getAllByText(/Wacom 공식 SDK·인증 파일이 아닙니다/u),
    ).toHaveLength(2);
  });
});
