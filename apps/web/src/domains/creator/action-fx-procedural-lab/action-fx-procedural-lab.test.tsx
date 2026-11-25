// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACTION_FX_PRESETS,
  ACTION_FX_PRESET_IDS,
  StudioActionFxLabPanel,
  createSeededPrng,
  exportActionFxSvg,
  generateActionFxLayer,
  getActionFxPresetSpec,
  measurePrimitiveIntrusion,
  verifyCharacterMaskClearance,
  type ActionFxVectorPrimitive,
  type ResolvedCharacterMask,
} from "./index";

afterEach(cleanup);

describe("1. 결정론적 PRNG 및 6종 웹툰 벡터 FX 엔진 (action-fx-vector-engine)", () => {
  it("createSeededPrng는 동일 시드에 대해 완전히 동일한 난수 수열을 반환하고 시드 변경 시 분기한다", () => {
    const a = createSeededPrng(20261125);
    const b = createSeededPrng(20261125);
    const c = createSeededPrng(20261126);

    const seqA = Array.from({ length: 64 }, () => a());
    const seqB = Array.from({ length: 64 }, () => b());
    const seqC = Array.from({ length: 64 }, () => c());

    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const value of seqA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("6종 프리셋 카탈로그가 액션·판타지·로맨스 분류와 순수 OKLCH 팔레트를 모두 갖춘다", () => {
    expect(ACTION_FX_PRESET_IDS).toHaveLength(6);
    expect(ACTION_FX_PRESETS).toHaveLength(6);

    for (const id of ACTION_FX_PRESET_IDS) {
      const spec = getActionFxPresetSpec(id);
      expect(spec.id).toBe(id);
      expect(spec.labelKo.length).toBeGreaterThan(2);
      expect(spec.labelEn.length).toBeGreaterThan(2);
      const colors = [
        spec.palette.primaryOklch,
        spec.palette.secondaryOklch,
        spec.palette.accentOklch,
        spec.palette.subtleOklch,
      ];
      for (const color of colors) {
        expect(color).toMatch(/^oklch\(/u);
        expect(color).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      }
    }
  });

  it("radial-focus-lines는 테이퍼 삼각 집중선 폴리곤을 생성하고 소실점 오프셋을 정확히 반영한다", () => {
    const centered = generateActionFxLayer({
      preset: "radial-focus-lines",
      seed: 101,
      vanishingPointX: 0.5,
      vanishingPointY: 0.44,
    });
    const shifted = generateActionFxLayer({
      preset: "radial-focus-lines",
      seed: 101,
      vanishingPointX: 0.22,
      vanishingPointY: 0.24,
    });

    const wedges = centered.primitives.filter((p) => p.role === "focus-wedge" && p.kind === "polygon");
    expect(wedges.length).toBeGreaterThanOrEqual(20);
    for (const wedge of wedges) {
      if (wedge.kind === "polygon") expect(wedge.points).toHaveLength(3);
    }
    expect(shifted.resolvedOptions.vanishingPointPx.x).toBeLessThan(centered.resolvedOptions.vanishingPointPx.x);
    expect(exportActionFxSvg(centered)).not.toBe(exportActionFxSvg(shifted));
  });

  it("parallel-speed-lines는 지정 각도를 따르는 평행 블레이드·스트릭을 생성하고 밀도에 비례해 확장한다", () => {
    const low = generateActionFxLayer({ preset: "parallel-speed-lines", angleDeg: -35, density: 0.5, seed: 77 });
    const high = generateActionFxLayer({ preset: "parallel-speed-lines", angleDeg: -35, density: 1.7, seed: 77 });
    const rotated = generateActionFxLayer({ preset: "parallel-speed-lines", angleDeg: 40, density: 1.0, seed: 77 });

    expect(low.primitives.some((p) => p.role === "speed-blade")).toBe(true);
    expect(high.primitives.length).toBeGreaterThan(low.primitives.length);
    expect(rotated.resolvedOptions.angleDeg).toBe(40);
    expect(exportActionFxSvg(high)).not.toBe(exportActionFxSvg(rotated));
  });

  it("impact-shockwave는 충격파 링 아크와 파편 쐐기 폴리곤을 함께 생성한다", () => {
    const layer = generateActionFxLayer({ preset: "impact-shockwave", density: 1.2, intensity: 1.3, seed: 505 });
    const rings = layer.primitives.filter((p) => p.role === "shockwave-ring");
    const shards = layer.primitives.filter((p) => p.role === "shockwave-shard");

    expect(rings.length).toBeGreaterThanOrEqual(8);
    expect(shards.length).toBeGreaterThanOrEqual(16);
    expect(layer.maskAudit.safeZoneGuaranteed).toBe(true);
  });

  it("arcane-magic-circle은 동심원·정다각형 성진·궤도 노드·기하 룬 문자 4종을 모두 생성한다", () => {
    const layer = generateActionFxLayer({ preset: "arcane-magic-circle", density: 1.2, seed: 909 });

    expect(layer.primitives.some((p) => p.role === "magic-ring")).toBe(true);
    expect(layer.primitives.some((p) => p.role === "magic-star")).toBe(true);
    expect(layer.primitives.some((p) => p.role === "magic-node")).toBe(true);
    expect(layer.primitives.filter((p) => p.role === "magic-rune").length).toBeGreaterThanOrEqual(10);
    expect(layer.maskAudit.safeZoneGuaranteed).toBe(true);
  });

  it("motion-afterimage-ghost는 불투명도가 감쇠하는 단계별 동작 잔상 실루엣과 궤적 리본을 생성한다", () => {
    const layer = generateActionFxLayer({
      preset: "motion-afterimage-ghost",
      angleDeg: -20,
      density: 1.2,
      seed: 314,
    });
    const ghosts = layer.primitives.filter((p) => p.role === "ghost-silhouette");
    const trails = layer.primitives.filter((p) => p.role === "ghost-trail");

    expect(ghosts.length).toBeGreaterThanOrEqual(3);
    expect(trails.length).toBeGreaterThanOrEqual(6);
    const firstOpacity = ghosts[0]?.opacity ?? 0;
    const lastOpacity = ghosts[ghosts.length - 1]?.opacity ?? 1;
    expect(firstOpacity).toBeGreaterThan(lastOpacity);
  });

  it("romance-petal-frame은 꽃잎·별빛·빛망울 3종 비네트 요소를 인물 얼굴 바깥에 생성한다", () => {
    const layer = generateActionFxLayer({ preset: "romance-petal-frame", density: 1.1, seed: 808 });

    expect(layer.primitives.filter((p) => p.role === "petal").length).toBeGreaterThanOrEqual(12);
    expect(layer.primitives.filter((p) => p.role === "starlight").length).toBeGreaterThanOrEqual(6);
    expect(layer.primitives.filter((p) => p.role === "bokeh").length).toBeGreaterThanOrEqual(5);
    expect(layer.maskAudit.safeZoneGuaranteed).toBe(true);
  });

  it("6종 프리셋 전수가 동일 시드·옵션에서 바이트 단위 결정론적 SVG를 출력한다", () => {
    for (const preset of ACTION_FX_PRESET_IDS) {
      const first = generateActionFxLayer({ preset, seed: 4242, density: 1.1 });
      const second = generateActionFxLayer({ preset, seed: 4242, density: 1.1 });
      expect(first.primitives).toEqual(second.primitives);
      expect(exportActionFxSvg(first)).toBe(exportActionFxSvg(second));
    }
  });

  it("시드 변경 시 벡터 배치가 달라지고 밀도 상향(0.4 -> 1.8) 시 모든 프리셋의 요소 수가 증가한다", () => {
    for (const preset of ACTION_FX_PRESET_IDS) {
      const seedA = generateActionFxLayer({ preset, seed: 1111, density: 1.0 });
      const seedB = generateActionFxLayer({ preset, seed: 9999, density: 1.0 });
      expect(exportActionFxSvg(seedA)).not.toBe(exportActionFxSvg(seedB));

      const sparse = generateActionFxLayer({ preset, seed: 4201, density: 0.4 });
      const dense = generateActionFxLayer({ preset, seed: 4201, density: 1.8 });
      expect(dense.metrics.primitiveCount).toBeGreaterThan(sparse.metrics.primitiveCount);
    }
  });
});

describe("2. 인물 얼굴 안전 영역(characterMask) 0px 침범 감사 및 SVG 익스포터", () => {
  it("기본 인물 얼굴 마스크(135px)에서 6종 프리셋 전수가 침범 0px 및 독립 재감사 통과를 보장한다", () => {
    for (const preset of ACTION_FX_PRESET_IDS) {
      const layer = generateActionFxLayer({ preset, seed: 4201 });
      expect(layer.maskAudit.maskEnabled).toBe(true);
      expect(layer.maskAudit.safeZoneGuaranteed).toBe(true);
      expect(layer.maskAudit.maxIntrusionPx).toBe(0);
      expect(layer.maskAudit.intrudingPrimitiveIds).toHaveLength(0);
      expect(layer.metrics.primitiveCount).toBeGreaterThan(0);

      const independent = verifyCharacterMaskClearance(layer.primitives, layer.resolvedOptions.characterMask);
      expect(independent.safeZoneGuaranteed).toBe(true);
      expect(independent.maxIntrusionPx).toBe(0);
    }
  });

  it("극한 파라미터(최대 안전 반경 240px + 4방향 소실점 오프셋)에서도 6종 전수 침범 0px를 유지한다", () => {
    const anchors: readonly (readonly [number, number])[] = [
      [0.18, 0.2],
      [0.82, 0.22],
      [0.2, 0.78],
      [0.8, 0.76],
    ];
    for (const preset of ACTION_FX_PRESET_IDS) {
      for (const [vpX, vpY] of anchors) {
        const layer = generateActionFxLayer({
          preset,
          seed: 7331,
          density: 1.3,
          vanishingPointX: vpX,
          vanishingPointY: vpY,
          characterMask: { cx: 400, cy: 450, radius: 240, enabled: true },
        });
        expect(layer.maskAudit.safeZoneGuaranteed).toBe(true);
        expect(layer.maskAudit.maxIntrusionPx).toBe(0);
        expect(layer.metrics.primitiveCount).toBeGreaterThan(0);
      }
    }
  });

  it("독립 감사기(verifyCharacterMaskClearance)가 얼굴 마스크를 침범하는 모든 프리미티브 유형을 정확히 적발한다", () => {
    const mask: ResolvedCharacterMask = { cx: 400, cy: 450, radius: 120, enabled: true };
    const intrudingPrimitives: readonly ActionFxVectorPrimitive[] = [
      {
        kind: "polygon", id: "bad-poly-enclosing", role: "focus-wedge",
        points: [{ x: 320, y: 380 }, { x: 480, y: 380 }, { x: 480, y: 520 }, { x: 320, y: 520 }],
        fill: "oklch(0.9 0.02 80)", opacity: 1,
      },
      {
        kind: "polyline", id: "bad-line-crossing", role: "speed-streak",
        points: [{ x: 100, y: 450 }, { x: 700, y: 450 }],
        fill: "none", stroke: "oklch(0.8 0.1 230)", strokeWidth: 4, opacity: 1,
      },
      {
        kind: "circle", id: "bad-filled-disk", role: "bokeh",
        cx: 450, cy: 450, r: 90, fill: "oklch(0.9 0.1 40)", opacity: 1,
      },
      {
        kind: "circle", id: "bad-hollow-ring", role: "magic-ring",
        cx: 400, cy: 450, r: 100, fill: "none", stroke: "oklch(0.8 0.12 232)", strokeWidth: 4, opacity: 1,
      },
      {
        kind: "ellipse", id: "bad-ellipse", role: "petal",
        cx: 480, cy: 450, rx: 60, ry: 30, rotationDeg: 15, fill: "oklch(0.84 0.11 16)", opacity: 1,
      },
    ];

    const report = verifyCharacterMaskClearance(intrudingPrimitives, mask);
    expect(report.safeZoneGuaranteed).toBe(false);
    expect(report.intrudingPrimitiveIds).toEqual(intrudingPrimitives.map((p) => p.id));
    expect(report.maxIntrusionPx).toBeGreaterThan(20);
  });

  it("얼굴 안전 영역을 바깥에서 감싸는 중공 링은 0px 침범으로 정확히 통과한다", () => {
    const mask: ResolvedCharacterMask = { cx: 400, cy: 450, radius: 120, enabled: true };
    const haloRing: ActionFxVectorPrimitive = {
      kind: "circle", id: "safe-halo-ring", role: "magic-ring",
      cx: 400, cy: 450, r: 180, fill: "none", stroke: "oklch(0.8 0.12 232)", strokeWidth: 4, opacity: 0.9,
    };

    const measured = measurePrimitiveIntrusion(haloRing, mask);
    expect(measured.intrusionPx).toBe(0);
    expect(measured.clearancePx).toBe(58);
  });

  it("characterMask 비활성화(enabled: false) 또는 반경 0일 때 마스킹 없이 정상 생성한다", () => {
    const disabled = generateActionFxLayer({
      preset: "radial-focus-lines",
      characterMask: { enabled: false, radius: 135 },
    });
    const zeroRadius = generateActionFxLayer({
      preset: "arcane-magic-circle",
      characterMask: { enabled: true, radius: 0 },
    });

    expect(disabled.maskAudit.maskEnabled).toBe(false);
    expect(disabled.maskAudit.safeZoneGuaranteed).toBe(true);
    expect(zeroRadius.maskAudit.maskEnabled).toBe(false);
    expect(zeroRadius.metrics.primitiveCount).toBeGreaterThan(0);
  });

  it("exportActionFxSvg가 순수 OKLCH 기반 독립 SVG 문자열과 선택적 가이드 레이어를 정확히 직렬화한다", () => {
    const layer = generateActionFxLayer({ preset: "arcane-magic-circle", seed: 4201 });
    const pureSvg = exportActionFxSvg(layer);
    const guidedSvg = exportActionFxSvg(layer, {
      includeBackdrop: true,
      includeSafeMaskGuide: true,
      includeVanishingGuide: true,
    });

    expect(pureSvg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(pureSvg.endsWith("</svg>")).toBe(true);
    expect(pureSvg).toContain('data-fx-preset="arcane-magic-circle"');
    expect(pureSvg).toContain('data-safe-zone="verified"');
    expect(pureSvg).not.toContain('data-guide="character-safe-mask"');
    expect(pureSvg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(pureSvg).not.toMatch(/\brgba?\s*\(/iu);
    expect(pureSvg).not.toMatch(/\bhsla?\s*\(/iu);

    expect(guidedSvg).toContain('data-guide="character-safe-mask"');
    expect(guidedSvg).toContain('data-guide="vanishing-point"');
    expect(guidedSvg).toContain("<rect x=\"0\" y=\"0\"");
  });

  it("metrics.estimatedSvgBytes가 기본 exportActionFxSvg 출력 길이와 정확히 일치한다", () => {
    for (const preset of ACTION_FX_PRESET_IDS) {
      const layer = generateActionFxLayer({ preset, seed: 5555 });
      const svg = exportActionFxSvg(layer);
      expect(layer.metrics.estimatedSvgBytes).toBe(svg.length);
      expect(layer.metrics.primitiveCount).toBe(
        layer.metrics.polygonCount +
          layer.metrics.polylineCount +
          layer.metrics.circleCount +
          layer.metrics.ellipseCount,
      );
    }
  });
});

describe("3. StudioActionFxLabPanel UI · 인터랙션 · 접근성 · 엄격 규칙 감사", () => {
  it("<StudioActionFxLabPanel />이 props 없이 단독 렌더링되고 실시간 SVG 프리뷰와 안전 통과 배지를 표시한다", () => {
    render(<StudioActionFxLabPanel />);

    expect(screen.getByTestId("studio-action-fx-lab-panel")).toBeTruthy();
    const svg = screen.getByTestId("action-fx-preview-svg");
    expect(svg.getAttribute("data-preset")).toBe("radial-focus-lines");
    expect(Number(svg.getAttribute("data-primitive-count"))).toBeGreaterThan(20);
    expect(screen.getByTestId("fx-mask-audit-badge").textContent).toContain("얼굴 침범 0px");
    expect(screen.getByTestId("fx-svg-code-preview").textContent).toContain('data-fx-preset="radial-focus-lines"');
  });

  it("6종 프리셋 버튼 클릭 시 즉시 전환되며 모든 프리셋에서 침범 0px를 유지한다", () => {
    render(<StudioActionFxLabPanel />);

    for (const presetId of ACTION_FX_PRESET_IDS) {
      const button = screen.getByTestId(`fx-preset-${presetId}`);
      fireEvent.click(button);
      expect(button.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByTestId("action-fx-preview-svg").getAttribute("data-preset")).toBe(presetId);
      expect(screen.getByTestId("fx-mask-audit-badge").textContent).toContain("얼굴 침범 0px");
      expect(screen.getByTestId("fx-svg-code-preview").textContent).toContain(`data-fx-preset="${presetId}"`);
    }
  });

  it("밀도·소실점·안전 반경·각도·강도 슬라이더 조작 시 프리뷰와 수치가 즉시 갱신된다", () => {
    render(<StudioActionFxLabPanel />);
    const initialCount = Number(screen.getByTestId("fx-primitive-count-readout").textContent);

    fireEvent.change(screen.getByTestId("fx-density-slider"), { target: { value: "1.9" } });
    const denserCount = Number(screen.getByTestId("fx-primitive-count-readout").textContent);
    expect(denserCount).toBeGreaterThan(initialCount);

    fireEvent.change(screen.getByTestId("fx-vp-x-slider"), { target: { value: "25" } });
    fireEvent.change(screen.getByTestId("fx-vp-y-slider"), { target: { value: "75" } });
    fireEvent.change(screen.getByTestId("fx-mask-radius-slider"), { target: { value: "210" } });
    fireEvent.change(screen.getByTestId("fx-angle-slider"), { target: { value: "45" } });
    fireEvent.change(screen.getByTestId("fx-intensity-slider"), { target: { value: "1.45" } });

    expect(screen.getByTestId("fx-mask-audit-badge").textContent).toContain("얼굴 침범 0px");
    expect(screen.getByTestId("fx-safe-mask-guide")).toBeTruthy();
  });

  it("빠른 소실점 앵커·얼굴 마스킹 토글·시드 변경·초기화 버튼이 상태와 가이드를 정확히 제어한다", () => {
    render(<StudioActionFxLabPanel />);

    fireEvent.click(screen.getByTestId("fx-anchor-upper-left"));
    expect((screen.getByTestId("fx-vp-x-slider") as HTMLInputElement).value).toBe("28");

    const seedBefore = screen.getByTestId("fx-seed-readout").textContent;
    fireEvent.click(screen.getByTestId("fx-randomize-seed-btn"));
    expect(screen.getByTestId("fx-seed-readout").textContent).not.toBe(seedBefore);

    fireEvent.click(screen.getByTestId("fx-mask-toggle-btn"));
    expect(screen.getByTestId("fx-mask-audit-badge").textContent).toContain("해제");
    expect(screen.queryByTestId("fx-safe-mask-guide")).toBeNull();

    fireEvent.click(screen.getByTestId("fx-reset-btn"));
    expect(screen.getByTestId("fx-seed-readout").textContent).toBe(seedBefore);
    expect(screen.getByTestId("fx-mask-audit-badge").textContent).toContain("얼굴 침범 0px");
  });

  it("SVG 내보내기 미리보기 토글·가이드 포함 옵션·복사/저장 버튼과 콜백이 정상 동작한다", () => {
    const onLayerChange = vi.fn();
    const onExportSvg = vi.fn();
    render(<StudioActionFxLabPanel onLayerChange={onLayerChange} onExportSvg={onExportSvg} />);

    fireEvent.click(screen.getByTestId("fx-export-guides-toggle"));
    expect(screen.getByTestId("fx-svg-code-preview").textContent).toContain('data-guide="character-safe-mask"');

    fireEvent.click(screen.getByTestId("fx-copy-svg-btn"));
    expect(onExportSvg).toHaveBeenCalledTimes(1);
    expect(onExportSvg.mock.calls[0]?.[0]).toContain("<svg xmlns=");
    expect(screen.getByTestId("fx-status-banner").textContent).toContain("복사했습니다");

    fireEvent.click(screen.getByTestId("fx-toggle-svg-preview-btn"));
    expect(screen.queryByTestId("fx-svg-code-preview")).toBeNull();
    expect(onLayerChange).toHaveBeenCalled();
  });

  it("영문 로케일(locale='en')과 initialPreset='romance-petal-frame'을 정확히 렌더링한다", () => {
    render(<StudioActionFxLabPanel locale="en" initialPreset="romance-petal-frame" />);

    expect(screen.getByTestId("action-fx-preview-svg").getAttribute("data-preset")).toBe("romance-petal-frame");
    expect(screen.getByTestId("fx-mask-audit-badge").textContent).toContain("Face Intrusion 0px");
    expect(screen.getByTestId("fx-copy-svg-btn").textContent).toContain("Copy SVG");
  });

  it("엄격 규칙(4개 파일 800줄 이하 · Storage/BigInt리터럴/private Map store/원시 색/props={} 0건)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "action-fx-vector-engine.ts",
      "StudioActionFxLabPanel.tsx",
      "index.ts",
      "action-fx-procedural-lab.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "action-fx-procedural-lab.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }
      if (file === "StudioActionFxLabPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
