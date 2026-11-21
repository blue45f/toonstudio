// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";
import { useI18n } from "@/shared/lib/i18n";

import Market3dTurntablePreviewCard from "./Market3dTurntablePreviewCard";

const SAMPLE_3D_RECORD = {
  id: "11111111-1111-4111-8111-111111111111",
  schemaVersion: 1,
  packageId: "studio-bg3d-cafe-rooftop",
  name: "옥상 카페 3D 배경 세트",
  description: "웹툰 노을 장면용 3D 옥상 카페 배경",
  kind: "3d-asset",
  resourceVersion: "1.2.0",
  minimumStudioVersion: "1.0.0",
  tags: ["카페", "옥상"],
  license: "toonstudio-standard",
  attributionText: "",
  containsAi: false,
  provenance: { origin: "original", authoredByPublisher: true },
  compatibility: { engines: ["three", "webgpu"] },
  entries: [
    {
      id: "cafe-main",
      kind: "3d-asset",
      name: "메인 카페 구조",
      delivery: { mode: "builtin-ref", runtimeRef: "studio-3d-asset:cafe", byteSize: 0, sha256: "a".repeat(64) },
    },
  ],
  manifestHash: "b".repeat(64),
  manifestByteSize: 512,
  publisher: { id: "pub-3d", name: "배경 공방", avatar: null },
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
  isOwner: false,
  access: "free",
} as unknown as CreatorMarketplaceResourceRecord;

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Market3dTurntablePreviewCard (T-046)", () => {
  it("솔리드·와이어프레임·웹툰 툰라인 모드를 전환하고 각도/키보드 회전·초기화를 처리한다", () => {
    render(<Market3dTurntablePreviewCard record={SAMPLE_3D_RECORD} />);

    const card = screen.getByTestId("market-3d-turntable-card");
    expect(card.getAttribute("data-preview-mode")).toBe("solid");
    expect(screen.getByTestId("market-3d-angle-readout").textContent).toContain("수평 35°");

    fireEvent.click(screen.getByTestId("market-3d-mode-wireframe"));
    expect(card.getAttribute("data-preview-mode")).toBe("wireframe");
    expect(screen.getByTestId("market-3d-angle-readout").textContent).toContain("매니폴드 정상");

    fireEvent.click(screen.getByTestId("market-3d-mode-toon-line"));
    expect(card.getAttribute("data-preview-mode")).toBe("toon-line");
    expect(screen.getByTestId("market-3d-angle-readout").textContent).toContain("먹선 2.4px");

    const viewport = screen.getByTestId("market-3d-turntable-viewport");
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    expect(screen.getByTestId("market-3d-angle-readout").textContent).toContain("수평 50°");

    fireEvent.change(screen.getByTestId("market-3d-yaw-slider"), { target: { value: "180" } });
    expect(screen.getByTestId("market-3d-angle-readout").textContent).toContain("수평 180°");

    fireEvent.click(screen.getByTestId("market-3d-reset-btn"));
    expect(screen.getByTestId("market-3d-angle-readout").textContent).toContain("수평 35°");
    expect(card.getAttribute("data-preview-mode")).toBe("solid");
  });

  it("prefers-reduced-motion: reduce 환경에서는 360도 자동 회전 버튼을 안전하게 비활성화한다", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    });

    try {
      render(<Market3dTurntablePreviewCard record={SAMPLE_3D_RECORD} />);
      const spinBtn = screen.getByTestId("market-3d-autospin-btn") as HTMLButtonElement;
      expect(spinBtn.disabled).toBe(true);
      expect(spinBtn.textContent).toContain("모션 감소");
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });
});
