// @vitest-environment jsdom

import { readFileSync } from "node:fs";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { HologramWebtoonStagePanel } from "./HologramWebtoonStagePanel";
import {
  HOLOGRAM_DEMO_SCENES,
  buildManifestFromScene,
  findHologramDemoScene,
} from "./hologram-demo-scenes";
import {
  DEFAULT_HOLOGRAM_VIEWER_POSE,
  HOLOGRAM_MANIFEST_SCHEMA,
  computeHologramLayerTransforms,
  computeLayerAngularDisparityDeg,
  computeOffAxisFrustum,
  computeStereoEyePoses,
  generateQuiltViewCameraArray,
  parseHologramManifest,
  serializeHologramManifest,
  type HologramLayerSpec,
  type HologramViewMode,
} from "./hologram-spatial-projection";

const HANGUL_REGEX = /[ㄱ-ㅎㅏ-ㅣ가-힣]/u;

function mockMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  mockMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("hologram-spatial-projection math", () => {
  const fivePlanes: readonly HologramLayerSpec[] = findHologramDemoScene("neon-rooftop-action").layers;

  it("computes opposite parallax signs for +Z pop-out and -Z recessed planes with strict monotonicity", () => {
    const rightLook = computeHologramLayerTransforms(fivePlanes, {
      eyeXMm: 100,
      eyeYMm: 50,
      eyeZMm: 600,
    });

    const byRole = new Map(rightLook.transforms.map((item) => [item.role, item]));
    const bg = byRole.get("bg");
    const mid = byRole.get("mid");
    const char = byRole.get("char");
    const fx = byRole.get("fx");
    const balloon = byRole.get("balloon");

    expect(bg && mid && char && fx && balloon).toBeTruthy();
    if (!bg || !mid || !char || !fx || !balloon) return;

    // +eyeXMm 시 화면 뒤(-Z)는 +방향, 기준면(0)은 0, 화면 앞(+Z)은 -방향으로 정확히 반대 시차를 가진다.
    expect(bg.translateX).toBeGreaterThan(0);
    expect(mid.translateX).toBeGreaterThan(0);
    expect(char.translateX).toBe(0);
    expect(char.translateY).toBe(0);
    expect(char.scale).toBe(1);
    expect(char.depthBlurPx).toBe(0);
    expect(fx.translateX).toBeLessThan(0);
    expect(balloon.translateX).toBeLessThan(0);

    // Z 깊이가 증가함에 따라 translateX는 단조 감소, 원근 scale은 단조 증가한다.
    expect(bg.translateX).toBeGreaterThan(mid.translateX);
    expect(mid.translateX).toBeGreaterThan(char.translateX);
    expect(char.translateX).toBeGreaterThan(fx.translateX);
    expect(fx.translateX).toBeGreaterThan(balloon.translateX);

    expect(bg.scale).toBeLessThan(mid.scale);
    expect(mid.scale).toBeLessThan(char.scale);
    expect(char.scale).toBeLessThan(fx.scale);
    expect(fx.scale).toBeLessThan(balloon.scale);

    // 반대 시점(-eyeXMm)에서는 시차 부호가 정확히 반전된다.
    const leftLook = computeHologramLayerTransforms(fivePlanes, {
      eyeXMm: -100,
      eyeYMm: -50,
      eyeZMm: 600,
    });
    const leftBg = leftLook.transforms.find((item) => item.role === "bg");
    const leftBalloon = leftLook.transforms.find((item) => item.role === "balloon");
    expect(leftBg?.translateX).toBeCloseTo(-bg.translateX, 3);
    expect(leftBalloon?.translateX).toBeCloseTo(-balloon.translateX, 3);
  });

  it("produces symmetric off-axis frustum at center and shifts asymmetrically off-center", () => {
    const centered = computeOffAxisFrustum(DEFAULT_HOLOGRAM_VIEWER_POSE);
    expect(centered.left).toBeCloseTo(-centered.right, 4);
    expect(centered.bottom).toBeCloseTo(-centered.top, 4);
    expect(centered.horizontalAsymmetry).toBe(0);

    const shifted = computeOffAxisFrustum({ eyeXMm: 90, eyeYMm: 30, eyeZMm: 600 });
    expect(shifted.right - shifted.left).toBeCloseTo(centered.right - centered.left, 3);
    expect(shifted.left).toBeLessThan(centered.left);
    expect(shifted.right).toBeLessThan(centered.right);
    expect(shifted.horizontalAsymmetry).toBeLessThan(0);
  });

  it("computes symmetric WebXR stereo eye poses for IPD 63mm", () => {
    const centerPose = { eyeXMm: 24, eyeYMm: -12, eyeZMm: 600 };
    const stereo = computeStereoEyePoses(centerPose, 63, { layers: fivePlanes });

    expect(stereo.ipdMm).toBe(63);
    expect(stereo.leftEye.eyeXMm).toBeCloseTo(24 - 31.5, 4);
    expect(stereo.rightEye.eyeXMm).toBeCloseTo(24 + 31.5, 4);
    expect((stereo.leftEye.eyeXMm + stereo.rightEye.eyeXMm) / 2).toBeCloseTo(centerPose.eyeXMm, 4);
    expect(stereo.rightEye.eyeXMm - stereo.leftEye.eyeXMm).toBeCloseTo(63, 4);
    expect(stereo.leftEye.eyeYMm).toBe(centerPose.eyeYMm);
    expect(stereo.rightEye.eyeYMm).toBe(centerPose.eyeYMm);
    expect(stereo.leftEye.eyeZMm).toBe(600);
    expect(stereo.rightEye.eyeZMm).toBe(600);
    expect(stereo.comfortEvaluation?.withinComfortZone).toBe(true);
    expect(stereo.comfortEvaluation?.effectiveMaxDisparityDeg).toBeLessThanOrEqual(2.5);
  });

  it("clamps excessive Z-depth so angular disparity never exceeds the 2.5 degree comfort limit", () => {
    const extremeLayers: readonly HologramLayerSpec[] = fivePlanes.map((layer) =>
      layer.role === "balloon" ? { ...layer, zMm: 260 } : layer,
    );

    const rawDisparity = computeLayerAngularDisparityDeg(260, 600, 63);
    expect(rawDisparity).toBeGreaterThan(2.5);

    const clamped = computeHologramLayerTransforms(extremeLayers, { eyeXMm: 80, eyeYMm: 0, eyeZMm: 600 });
    expect(clamped.comfortStatus).toBe("clamped");
    expect(clamped.comfortScale).toBeLessThan(1);
    expect(clamped.rawMaxDisparityDeg).toBeGreaterThan(2.5);
    expect(clamped.effectiveMaxDisparityDeg).toBeLessThanOrEqual(2.5);

    // 비율 축소 덕분에 5-평면 깊이 순서(bg < mid < char < fx < balloon)가 그대로 보존된다.
    const effectiveDepths = clamped.transforms.map((item) => item.effectiveZMm);
    for (let i = 1; i < effectiveDepths.length; i += 1) {
      expect(effectiveDepths[i]).toBeGreaterThan(effectiveDepths[i - 1]);
    }

    const unclamped = computeHologramLayerTransforms(
      extremeLayers,
      { eyeXMm: 80, eyeYMm: 0, eyeZMm: 600 },
      { clampComfortZone: false },
    );
    expect(unclamped.effectiveMaxDisparityDeg).toBeGreaterThan(2.5);
  });

  it("collapses transforms cleanly when reducedMotion is enabled", () => {
    const flat = computeHologramLayerTransforms(
      fivePlanes,
      { eyeXMm: 140, eyeYMm: 90, eyeZMm: 600 },
      { reducedMotion: true, holofoilIntensity: 1, depthOfFieldStrength: 1 },
    );
    for (const transform of flat.transforms) {
      expect(transform.translateX).toBe(0);
      expect(transform.translateY).toBe(0);
      expect(transform.scale).toBe(1);
      expect(transform.rotateX).toBe(0);
      expect(transform.rotateY).toBe(0);
      expect(transform.prismaticShiftPx).toBe(0);
      expect(transform.depthBlurPx).toBe(0);
    }
  });

  it("generates an exact 4x8 = 32-view Looking Glass Quilt camera array across 40 deg", () => {
    const quilt = generateQuiltViewCameraArray(4, 8, 40);
    expect(quilt.cols).toBe(4);
    expect(quilt.rows).toBe(8);
    expect(quilt.totalViews).toBe(32);
    expect(quilt.views).toHaveLength(32);

    expect(quilt.views[0].azimuthDeg).toBeCloseTo(-20, 4);
    expect(quilt.views[31].azimuthDeg).toBeCloseTo(20, 4);

    for (let i = 0; i < quilt.views.length; i += 1) {
      const view = quilt.views[i];
      const mirror = quilt.views[31 - i];
      expect(view.azimuthDeg).toBeCloseTo(-mirror.azimuthDeg, 4);
      expect(view.cameraPositionMm.x).toBeCloseTo(-mirror.cameraPositionMm.x, 3);
      const dirLen = Math.hypot(view.direction.x, view.direction.y, view.direction.z);
      expect(dirLen).toBeCloseTo(1, 4);
      expect(view.uvRect.u1 - view.uvRect.u0).toBeCloseTo(0.25, 4);
      expect(view.uvRect.v1 - view.uvRect.v0).toBeCloseTo(0.125, 4);
      if (i > 0) {
        expect(view.azimuthDeg).toBeGreaterThan(quilt.views[i - 1].azimuthDeg);
        expect(view.cameraPositionMm.x).toBeGreaterThan(quilt.views[i - 1].cameraPositionMm.x);
      }
    }
  });

  it("round-trips .toon-holo.json manifests and rejects malformed payloads", () => {
    const scene = findHologramDemoScene("arcane-library-rofan");
    const manifest = buildManifestFromScene({
      scene,
      layers: scene.layers,
      eyeZMm: 600,
      ipdMm: 63,
      maxComfortDisparityDeg: 2.5,
      holofoilIntensity: 0.72,
      depthOfFieldStrength: 0.42,
      createdAtIso: "2026-11-23T06:00:00.000Z",
    });

    const json = serializeHologramManifest(manifest);
    const parsed = parseHologramManifest(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.manifest).toEqual(manifest);
      expect(parsed.manifest.schema).toBe(HOLOGRAM_MANIFEST_SCHEMA);
      expect(parsed.manifest.layers).toHaveLength(5);
    }

    const badJson = parseHologramManifest("{invalid");
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) expect(badJson.errorCode).toBe("INVALID_JSON");

    const badSchema = parseHologramManifest(JSON.stringify({ ...manifest, schema: "legacy/0.1" }));
    expect(badSchema.ok).toBe(false);
    if (!badSchema.ok) expect(badSchema.errorCode).toBe("UNSUPPORTED_SCHEMA");

    const badDepth = parseHologramManifest(
      JSON.stringify({
        ...manifest,
        layers: manifest.layers.map((layer, index) => (index === 0 ? { ...layer, zMm: 999 } : layer)),
      }),
    );
    expect(badDepth.ok).toBe(false);
    if (!badDepth.ok) expect(badDepth.errorCode).toBe("INVALID_LAYERS");
  });
});

describe("HologramWebtoonStagePanel UI & accessibility", () => {
  it("switches across all 4 view modes and 3 demo scene presets", () => {
    render(<HologramWebtoonStagePanel />);

    const panel = screen.getByTestId("hologram-webtoon-stage-panel");
    expect(panel.getAttribute("data-scene-id")).toBe("neon-rooftop-action");
    expect(panel.getAttribute("data-view-mode")).toBe("off-axis");

    // 5개 평면 모두 마운트 확인
    const planes = panel.querySelectorAll("[data-plane-role]");
    expect(planes.length).toBe(5);

    // 씬 프리셋 전환 (로판 마법 도서관 → 무협 대나무 숲)
    fireEvent.click(screen.getByTestId("holo-scene-preset-arcane-library-rofan"));
    expect(panel.getAttribute("data-scene-id")).toBe("arcane-library-rofan");
    expect(screen.getByText(/봉인된 서고가 마침내 눈을 떴군요/)).toBeTruthy();

    fireEvent.click(screen.getByTestId("holo-scene-preset-murim-bamboo-forest"));
    expect(panel.getAttribute("data-scene-id")).toBe("murim-bamboo-forest");
    expect(screen.getByText(/바람이 멈추는 찰나, 검기가 열린다/)).toBeTruthy();

    // 뷰 모드 4종 전환 검증
    fireEvent.click(screen.getByTestId("holo-mode-tab-stereo-sbs"));
    expect(screen.getByTestId("holo-stereo-sbs-view")).toBeTruthy();
    expect(panel.querySelectorAll('[data-eye="left"]').length).toBe(1);
    expect(panel.querySelectorAll('[data-eye="right"]').length).toBe(1);

    fireEvent.click(screen.getByTestId("holo-mode-tab-anaglyph"));
    expect(screen.getByTestId("holo-anaglyph-view")).toBeTruthy();

    fireEvent.click(screen.getByTestId("holo-mode-tab-quilt-32"));
    expect(screen.getByTestId("holo-quilt-view")).toBeTruthy();
    expect(screen.getByTestId("holo-quilt-cell-0")).toBeTruthy();
    expect(screen.getByTestId("holo-quilt-cell-31")).toBeTruthy();
    fireEvent.click(screen.getByTestId("holo-quilt-cell-0"));
    expect(screen.getByTestId("holo-quilt-cell-0").getAttribute("aria-pressed")).toBe("true");
  });

  it("responds to pointer/keyboard tilt, Z-depth sliders, manifest export, and prefers-reduced-motion", () => {
    const onExport = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { container } = render(<HologramWebtoonStagePanel onExportManifest={onExport} />);

    const viewport = screen.getByTestId("holo-stage-viewport");
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 640,
      bottom: 420,
      width: 640,
      height: 420,
      toJSON: () => ({}),
    });

    // 포인터 우측 이동 시 DOM 평면 시차 부호(bg > 0, char === 0, balloon < 0) 검증
    fireEvent.pointerMove(viewport, { clientX: 560, clientY: 210 });
    const bgPlane = container.querySelector('[data-plane-role="bg"]');
    const charPlane = container.querySelector('[data-plane-role="char"]');
    const balloonPlane = container.querySelector('[data-plane-role="balloon"]');
    expect(Number(bgPlane?.getAttribute("data-translate-x"))).toBeGreaterThan(0);
    expect(Number(charPlane?.getAttribute("data-translate-x"))).toBe(0);
    expect(Number(balloonPlane?.getAttribute("data-translate-x"))).toBeLessThan(0);

    // Home 중앙 정렬 + 키보드 방향키 조작 검증
    fireEvent.keyDown(viewport, { key: "Home" });
    expect(screen.getByTestId("holo-eye-readout").textContent).toContain("(0mm, 0mm, 600mm)");
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    expect(screen.getByTestId("holo-eye-readout").textContent).toContain("+16mm");

    // Z-깊이 슬라이더 조작 및 기본값 복원 검증
    const balloonSlider = screen.getByTestId("holo-depth-slider-balloon") as HTMLInputElement;
    fireEvent.change(balloonSlider, { target: { value: "180" } });
    expect(balloonSlider.value).toBe("180");
    fireEvent.click(screen.getByTestId("holo-reset-depths-btn"));
    expect(balloonSlider.value).toBe("88");

    // JSON 미리보기 및 매니페스트 내보내기 검증
    fireEvent.click(screen.getByTestId("holo-toggle-manifest-preview-btn"));
    const previewJson = screen.getByTestId("holo-manifest-preview").textContent ?? "";
    expect(parseHologramManifest(previewJson).ok).toBe(true);

    fireEvent.click(screen.getByTestId("holo-export-manifest-btn"));
    expect(onExport).toHaveBeenCalledTimes(1);
    const [exportedJson] = onExport.mock.calls[0] as [string];
    const reparsed = parseHologramManifest(exportedJson);
    expect(reparsed.ok).toBe(true);
    expect(screen.getByTestId("holo-export-notice")).toBeTruthy();

    // 평면 안전 모드 활성화 시 시뮬레이션 버튼 비활성화 및 reduced-motion 배지 표시
    fireEvent.click(screen.getByTestId("holo-flat-mode-toggle"));
    expect(screen.getByTestId("holo-reduced-motion-badge")).toBeTruthy();
    expect((screen.getByTestId("holo-gaze-sim-toggle") as HTMLButtonElement).disabled).toBe(true);

    // 시스템 prefers-reduced-motion 자동 감지 검증
    cleanup();
    mockMatchMedia(true);
    render(<HologramWebtoonStagePanel />);
    expect(screen.getByTestId("hologram-webtoon-stage-panel").getAttribute("data-reduced-motion")).toBe("true");
    expect(screen.getByTestId("holo-reduced-motion-badge")).toBeTruthy();
  });

  it("renders zero Korean characters in EN mode across every scene preset and view mode", () => {
    useI18n.getState().setLang("en");
    const { container } = render(<HologramWebtoonStagePanel />);

    const modes: readonly HologramViewMode[] = ["off-axis", "stereo-sbs", "anaglyph", "quilt-32"];

    for (const scene of HOLOGRAM_DEMO_SCENES) {
      fireEvent.click(screen.getByTestId(`holo-scene-preset-${scene.id}`));
      for (const mode of modes) {
        fireEvent.click(screen.getByTestId(`holo-mode-tab-${mode}`));
        const visibleText = container.textContent ?? "";
        expect(visibleText).not.toMatch(HANGUL_REGEX);

        const labelledElements = container.querySelectorAll("[aria-label], [aria-valuetext], [title]");
        for (const el of labelledElements) {
          const ariaLabel = el.getAttribute("aria-label") ?? "";
          const ariaValueText = el.getAttribute("aria-valuetext") ?? "";
          const title = el.getAttribute("title") ?? "";
          expect(ariaLabel).not.toMatch(HANGUL_REGEX);
          expect(ariaValueText).not.toMatch(HANGUL_REGEX);
          expect(title).not.toMatch(HANGUL_REGEX);
        }
      }
    }
  });

  it("enforces CSS token-only colors, zero transition-all, and prefers-reduced-motion support", () => {
    const stageCssText = readFileSync(
      "apps/web/src/domains/creator/hologram-webtoon/hologram-webtoon-stage.css",
      "utf8",
    );
    expect(stageCssText).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(stageCssText).not.toMatch(/\brgba?\s*\(/iu);
    expect(stageCssText).not.toMatch(/\btransition-all\b/iu);
    expect(stageCssText).not.toMatch(/transition\s*:\s*all\b/iu);
    expect(stageCssText).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
