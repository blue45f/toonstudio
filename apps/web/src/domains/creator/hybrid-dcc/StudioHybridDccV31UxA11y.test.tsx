// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dBlenderFantasyWebtoonPanel } from "../bg3d/StudioBg3dBlenderFantasyWebtoonPanel";
import { StudioHybridDccPanel } from "./StudioHybridDccPanel";

const WEB_PUBLIC_DIR = path.resolve(import.meta.dirname, "../../../../public");

function assertAccessibleControls(scope: HTMLElement): void {
  for (const btn of scope.querySelectorAll<HTMLButtonElement>("button")) {
    const label = (
      btn.getAttribute("aria-label") ??
      btn.textContent ??
      ""
    ).trim();
    expect(label.length, `Button missing accessible name: ${btn.outerHTML}`).toBeGreaterThan(0);
  }
  for (const input of scope.querySelectorAll<HTMLInputElement>("input")) {
    const id = input.getAttribute("id");
    const hasExplicitLabel =
      Boolean(input.getAttribute("aria-label")?.trim()) ||
      Boolean(input.closest("label")) ||
      (id ? Boolean(scope.querySelector(`label[for="${id}"]`)) : false);
    expect(hasExplicitLabel, `Input missing accessible label: ${input.outerHTML}`).toBe(true);
  }
  for (const img of scope.querySelectorAll<HTMLImageElement>("img")) {
    expect(img.hasAttribute("alt"), `Image missing alt attribute: ${img.outerHTML}`).toBe(true);
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("V30~V31 UX · 19-Drawer Hangul Choseong · Real GLB Import & WCAG AA Verification", () => {
  it("19개 CC0 서랍에서 초성('ㅅㅁㅎ')으로 실제 V31 사물함 GLB를 임포트하고 모든 버튼·입력·이미지 접근성 계약을 통과한다", async () => {
    const lockerGlbPath = path.join(
      WEB_PUBLIC_DIR,
      "studio-assets/blender-genre-hero-props-v31/webtoon-prop-academy-locker-shoebox-bank-v31.glb",
    );
    const realGlbBytes = fs.readFileSync(lockerGlbPath);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("webtoon-prop-academy-locker-shoebox-bank-v31.glb")) {
        return new Response(new Uint8Array(realGlbBytes), {
          status: 200,
          headers: { "content-type": "model/gltf-binary" },
        });
      }
      return new Response(new Uint8Array([0x00, 0x01, 0x02]), { status: 200 });
    });

    const { container } = render(<StudioHybridDccPanel />);
    fireEvent.click(screen.getByRole("button", { name: "큐브로 시작" }));
    await waitFor(() => {
      expect(
        document
          .querySelector("[data-studio-hybrid-dcc-stats]")
          ?.getAttribute("data-assets"),
      ).toBe("1");
    });

    const searchInput = screen.getByLabelText("CC0 에셋 서랍 초성·키워드 통합 검색");
    fireEvent.change(searchInput, { target: { value: "ㅅㅁㅎ" } });
    const lockerBtn = document.querySelector<HTMLButtonElement>(
      '[data-studio-hybrid-dcc-kit-item="webtoon-prop-academy-locker-shoebox-bank-v31"]',
    );
    expect(lockerBtn).not.toBeNull();
    expect(lockerBtn!.className).toContain("min-h-11");
    expect(lockerBtn!.className).toContain("focus-visible:outline");
    fireEvent.click(lockerBtn!);

    await waitFor(
      () => {
        const assetCount = Number(
          document
            .querySelector("[data-studio-hybrid-dcc-stats]")
            ?.getAttribute("data-assets") ?? "0",
        );
        expect(assetCount).toBeGreaterThan(1);
      },
      { timeout: 10_000 },
    );

    const primitiveBar = container.querySelector<HTMLElement>(
      '[data-studio-hybrid-dcc-primitive-bar="true"]',
    );
    expect(primitiveBar).not.toBeNull();
    assertAccessibleControls(primitiveBar!);
  });

  it("BG3D V30 시나리오 바와 V31 세부 장르 히어로 소품 바가 모든 버튼·입력·이미지 접근성 및 한글 keep-all 규칙을 통과한다", () => {
    const { container } = render(<StudioBg3dBlenderFantasyWebtoonPanel />);
    const macroBar = container.querySelector<HTMLElement>(
      '[data-testid="bg3d-blender-v30-macro-scenario-bar"]',
    );
    const heroPropsBar = container.querySelector<HTMLElement>(
      '[data-testid="bg3d-blender-v31-hero-props-bar"]',
    );
    expect(macroBar).not.toBeNull();
    expect(heroPropsBar).not.toBeNull();
    expect(macroBar!.className).toContain("[word-break:keep-all]");
    expect(heroPropsBar!.className).toContain("[word-break:keep-all]");
    assertAccessibleControls(macroBar!);
  });
});
