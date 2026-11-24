// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NARRATIVE_COLOR_TEMPLATES,
  StudioEpisodeColorScriptPanel,
  auditEpisodeColorScript,
  buildEpisodeColorScriptBundle,
  computeCutLightingAndLutGrade,
  computeDeltaEOklch,
  evaluateCircularHueSpline,
  evaluateMonotonicCubicSpline,
  formatOklchCss,
  generateEpisodeColorScript,
  harmonizeEpisodeColorScript,
  renderEpisodeColorRibbonCanvas,
  serializeEpisodeColorScriptBundle,
} from "./index";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const FORBIDDEN_STORAGE_REGEX = /\blocalStorage\b|\bsessionStorage\b/;
const FORBIDDEN_TRANSITION_ALL_REGEX = /\btransition-all\b/;
const FORBIDDEN_SPARKLES_REGEX = /\bSparkles\b/;
const FORBIDDEN_PRIVATE_STORE_MAP_REGEX =
  /\bprivate\s+(?:readonly\s+)?store\b|\bstore\s*=\s*new\s+Map\b/;

function readModuleSourceFiles(): readonly { readonly file: string; readonly text: string }[] {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(ts|tsx|css)$/u.test(name) && !name.includes(".test."))
    .map((file) => ({
      file,
      text: fs.readFileSync(path.join(dir, file), "utf8"),
    }));
}

describe("episode-color-script-harmonizer: AI-Free 60컷 로컬 OKLCH 컬러 스크립트 하모나이저", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("4종 서사 템플릿 × 12~60컷 생성 시 순수 아크는 심각 급변(jarring) 0건을 유지한다", () => {
    expect(NARRATIVE_COLOR_TEMPLATES).toHaveLength(4);

    for (const tpl of NARRATIVE_COLOR_TEMPLATES) {
      for (const cutCount of [12, 24, 36, 60] as const) {
        const cuts = generateEpisodeColorScript(tpl.id, cutCount, { injectDraftSpikes: false });
        expect(cuts).toHaveLength(cutCount);
        const audit = auditEpisodeColorScript(cuts);
        expect(audit.cutCount).toBe(cutCount);
        expect(audit.jarringCount).toBe(0);
        expect(audit.arcSmoothnessScore).toBeGreaterThanOrEqual(80);
      }
    }
  });

  it("Fritsch-Carlson 단조 스플라인은 단조 구간 오버슈트를 방지하고 원형 색상각은 350°→15° 최단 호로 보간한다", () => {
    const xs = [0, 0.5, 1];
    const ys = [0.2, 0.25, 0.9];
    let prev = evaluateMonotonicCubicSpline(xs, ys, 0);
    for (let step = 1; step <= 20; step += 1) {
      const val = evaluateMonotonicCubicSpline(xs, ys, step / 20);
      expect(val).toBeGreaterThanOrEqual(prev - 1e-6);
      expect(val).toBeGreaterThanOrEqual(0.2 - 1e-6);
      expect(val).toBeLessThanOrEqual(0.9 + 1e-6);
      prev = val;
    }

    // 350° → 15° 중간 지점은 180° 방향이 아닌 0°~5° 근처(최단 호)여야 한다.
    const midHue = evaluateCircularHueSpline([0, 1], [350, 15], 0.5);
    expect(midHue > 345 || midHue < 20).toBe(true);
  });

  it("초안 급변 주입 시 ΔE_OKLCH 불연속성 경고를 탐지하고 원클릭 스플라인 조화로 0건까지 해소한다", () => {
    const roughCuts = generateEpisodeColorScript("daily-dusk-night-dawn", 60, {
      injectDraftSpikes: true,
    });
    const beforeAudit = auditEpisodeColorScript(roughCuts);
    expect(beforeAudit.jarringCount).toBeGreaterThanOrEqual(3);
    expect(beforeAudit.discontinuityAlerts.length).toBeGreaterThanOrEqual(3);

    const smoothedCuts = harmonizeEpisodeColorScript(roughCuts, { strength: 1.0 });
    const afterAudit = auditEpisodeColorScript(smoothedCuts);
    expect(afterAudit.jarringCount).toBe(0);
    expect(afterAudit.maxDeltaE).toBeLessThan(beforeAudit.maxDeltaE);
    expect(afterAudit.arcSmoothnessScore).toBeGreaterThan(beforeAudit.arcSmoothnessScore);
  });

  it("3D 조명 색온도(Kelvin)가 난색(황혼)에서 낮고 한색(심야)에서 높으며 1D/3D LUT 규격을 충족한다", () => {
    const cuts = generateEpisodeColorScript("daily-dusk-night-dawn", 60, {
      injectDraftSpikes: false,
    });
    const duskCut = cuts[20];
    const midnightCut = cuts[40];
    expect(duskCut).toBeDefined();
    expect(midnightCut).toBeDefined();
    if (!duskCut || !midnightCut) return;
    const duskGrade = computeCutLightingAndLutGrade(duskCut);
    const midnightGrade = computeCutLightingAndLutGrade(midnightCut);

    expect(duskGrade.keyLightKelvin).toBeLessThan(4600);
    expect(midnightGrade.keyLightKelvin).toBeGreaterThan(6400);
    expect(duskGrade.lut1dCurve16).toHaveLength(16);
    expect(duskGrade.lut3dCubeSize).toBe(17);
    expect(duskGrade.lut3dCornerSamples).toHaveLength(8);

    // 1D LUT 커브는 단조 비감소 [0..1]
    for (let i = 1; i < duskGrade.lut1dCurve16.length; i += 1) {
      expect(duskGrade.lut1dCurve16[i]).toBeGreaterThanOrEqual(duskGrade.lut1dCurve16[i - 1] ?? 0);
    }

    const bundle = buildEpisodeColorScriptBundle("daily-dusk-night-dawn", cuts);
    const parsed = JSON.parse(serializeEpisodeColorScriptBundle(bundle)) as {
      schemaVersion: string;
      lightingGrades: readonly unknown[];
    };
    expect(parsed.schemaVersion).toBe("toonstudio.color-script.v1");
    expect(parsed.lightingGrades).toHaveLength(60);

    // ΔE 및 OKLCH CSS 직렬화 검증
    const selfDiff = computeDeltaEOklch(duskCut.primary, duskCut.primary);
    expect(selfDiff.deltaE).toBe(0);
    expect(formatOklchCss(duskCut.primary)).toMatch(/^oklch\(/);
  });

  it("renderEpisodeColorRibbonCanvas가 2D 컨텍스트 모의 환경에서 getComputedStyle 기반 렌더를 완료한다", () => {
    const cuts = generateEpisodeColorScript("romance-pastel-4act", 24, { injectDraftSpikes: true });
    const audit = auditEpisodeColorScript(cuts);
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 180;

    const fillRect = vi.fn();
    const clearRect = vi.fn();
    const strokeRect = vi.fn();
    const beginPath = vi.fn();
    const moveTo = vi.fn();
    const lineTo = vi.fn();
    const stroke = vi.fn();
    const fillText = vi.fn();
    const save = vi.fn();
    const restore = vi.fn();

    const mockCtx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      fillRect,
      clearRect,
      strokeRect,
      beginPath,
      moveTo,
      lineTo,
      stroke,
      fillText,
      save,
      restore,
    };
    vi.spyOn(canvas, "getContext").mockImplementation(
      (() => mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );

    const rendered = renderEpisodeColorRibbonCanvas(canvas, cuts, audit, 5);
    expect(rendered).toBe(true);
    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(fillRect.mock.calls.length).toBeGreaterThanOrEqual(24 * 3);
    expect(strokeRect).toHaveBeenCalledTimes(1);
  });

  it("StudioEpisodeColorScriptPanel이 Props 없이 단독 렌더되고 원클릭 조화·템플릿/컷 수 전환이 동작한다", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<StudioEpisodeColorScriptPanel />);

    expect(
      screen.getByLabelText("에피소드 OKLCH 컬러 스크립트 리본 캔버스"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "원클릭 스플라인 조화" }));
    expect(screen.getByRole("status").textContent).toContain("부드럽게 조화");
    expect(screen.getByText(/전 컷의 명도·채도·색상각 전이가 단조 스플라인 기준 안에서/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "로맨스 파스텔 4막" }));
    expect(screen.getByRole("status").textContent).toContain("로맨스 파스텔 4막");

    fireEvent.click(screen.getByRole("button", { name: "24컷" }));
    expect(screen.getByText(/#1 \/ 24/)).toBeTruthy();
  });

  it("모듈 소스 전체가 800줄 이하이며 원시 색상·금지 패턴을 포함하지 않는다", () => {
    const files = readModuleSourceFiles();
    expect(files.length).toBeGreaterThanOrEqual(4);

    for (const { file, text } of files) {
      const lineCount = text.split("\n").length;
      expect(lineCount, `${file} exceeds 800 lines (${lineCount})`).toBeLessThanOrEqual(800);
      expect(text, `${file} contains raw hex/rgb/hsl`).not.toMatch(RAW_COLOR_REGEX);
      expect(text, `${file} uses web storage`).not.toMatch(FORBIDDEN_STORAGE_REGEX);
      expect(text, `${file} uses transition-all`).not.toMatch(FORBIDDEN_TRANSITION_ALL_REGEX);
      expect(text, `${file} uses Sparkles`).not.toMatch(FORBIDDEN_SPARKLES_REGEX);
      expect(text, `${file} uses private store Map`).not.toMatch(FORBIDDEN_PRIVATE_STORE_MAP_REGEX);
    }
  });
});
