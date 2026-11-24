// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CAMERA_BLOCKING_PRESETS,
  CINEMA_FOCAL_LENGTHS,
  StudioCameraLensBlockingPanel,
  analyzeCameraBlocking,
  autoFixAxisViolations,
  classifyShotSize,
  computeDutchTensionScore,
  computeHorizontalFovDeg,
  computeVerticalFovDeg,
  exportThreeJsCameraRig,
  findCameraBlockingPresetById,
  serializeThreeJsCameraRig,
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

describe("camera-lens-blocking-director: 3D 시네마 렌즈 & 180도 액션 축 연출 감독 엔진", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("24/35/50/85/135mm 풀프레임 화각 단조 감소와 5단계 샷 사이즈(ECU~WS) 분류를 검증한다", () => {
    const fovs = CINEMA_FOCAL_LENGTHS.map((mm) => computeVerticalFovDeg(mm));
    for (let i = 1; i < fovs.length; i += 1) {
      expect(fovs[i]).toBeLessThan(fovs[i - 1] ?? 180);
    }
    expect(computeHorizontalFovDeg(fovs[0] ?? 53, 1.5)).toBeGreaterThan(fovs[0] ?? 0);

    expect(classifyShotSize(0.28)).toBe("ECU");
    expect(classifyShotSize(0.6)).toBe("CU");
    expect(classifyShotSize(1.05)).toBe("MCU");
    expect(classifyShotSize(1.85)).toBe("MS");
    expect(classifyShotSize(3.4)).toBe("WS");
  });

  it("180도 액션 라인 이탈과 시선 일치 오차를 탐지하고 원클릭 교정 후 피사체 거리를 보존하며 0위반을 달성한다", () => {
    const rooftop = findCameraBlockingPresetById("rooftop-confrontation");
    const before = analyzeCameraBlocking({
      sceneId: rooftop.id,
      actors: rooftop.actors,
      cuts: rooftop.cuts,
      primaryAxisActorIds: rooftop.primaryAxisActorIds,
    });

    expect(before.axisViolationCount).toBe(1);
    expect(before.isContinuityClean).toBe(false);
    const cut3Before = before.cutAnalyses.find((c) => c.cutNumber === 3);
    expect(cut3Before?.axisCrossedFromCutNumber).not.toBeNull();
    expect(cut3Before?.eyelineMatchErrorDeg).toBeGreaterThan(24);

    const fixedCuts = autoFixAxisViolations({
      actors: rooftop.actors,
      cuts: rooftop.cuts,
      primaryAxisActorIds: rooftop.primaryAxisActorIds,
    });
    const after = analyzeCameraBlocking({
      sceneId: rooftop.id,
      actors: rooftop.actors,
      cuts: fixedCuts,
      primaryAxisActorIds: rooftop.primaryAxisActorIds,
    });

    expect(after.axisViolationCount).toBe(0);
    expect(after.isContinuityClean).toBe(true);
    expect(after.continuityScore).toBeGreaterThan(before.continuityScore);

    const cut3After = after.cutAnalyses.find((c) => c.cutNumber === 3);
    expect(cut3After?.eyelineMatchErrorDeg).toBeLessThan(cut3Before?.eyelineMatchErrorDeg ?? 90);
    // 축 대칭 반사는 피사체 거리와 샷 사이즈를 그대로 보존해야 한다.
    expect(cut3After?.distanceToSubjectM).toBeCloseTo(cut3Before?.distanceToSubjectM ?? 0, 1);
    expect(cut3After?.shotSize).toBe(cut3Before?.shotSize);
  });

  it("더치 앵글 긴장도 점수가 기울기 증가에 따라 상승하고 정석 프리셋은 0위반을 유지한다", () => {
    const calm = computeDutchTensionScore(0, 50, "MS");
    const tense = computeDutchTensionScore(22, 135, "ECU");
    expect(tense).toBeGreaterThan(calm);
    expect(tense).toBeLessThanOrEqual(100);

    const cafe = findCameraBlockingPresetById("cafe-confession");
    const cafeReport = analyzeCameraBlocking({
      sceneId: cafe.id,
      actors: cafe.actors,
      cuts: cafe.cuts,
      primaryAxisActorIds: cafe.primaryAxisActorIds,
    });
    expect(cafeReport.axisViolationCount).toBe(0);
    expect(cafeReport.isContinuityClean).toBe(true);
  });

  it("결정적 Three.js PerspectiveCamera JSON 리그가 정규화된 단위 쿼터니언(|q|=1)과 광학 필드를 출력한다", () => {
    expect(CAMERA_BLOCKING_PRESETS).toHaveLength(3);
    const preset = findCameraBlockingPresetById("corridor-thriller");

    const rigA = exportThreeJsCameraRig({
      sceneId: preset.id,
      sceneNameKo: preset.nameKo,
      actors: preset.actors,
      cuts: preset.cuts,
      primaryAxisActorIds: preset.primaryAxisActorIds,
    });
    const rigB = exportThreeJsCameraRig({
      sceneId: preset.id,
      sceneNameKo: preset.nameKo,
      actors: preset.actors,
      cuts: preset.cuts,
      primaryAxisActorIds: preset.primaryAxisActorIds,
    });

    expect(serializeThreeJsCameraRig(rigA)).toBe(serializeThreeJsCameraRig(rigB));
    expect(rigA.schemaVersion).toBe("toonstudio.camera-rig.v1");
    expect(rigA.cameras).toHaveLength(preset.cuts.length);

    for (const cam of rigA.cameras) {
      expect(cam.cameraType).toBe("PerspectiveCamera");
      expect(cam.filmGaugeMm).toBe(35);
      expect(cam.fov).toBeGreaterThan(8);
      expect(cam.fov).toBeLessThan(90);
      const [qx, qy, qz, qw] = cam.quaternion;
      const norm = Math.hypot(qx, qy, qz, qw);
      expect(norm).toBeCloseTo(1, 3);
    }
  });

  it("StudioCameraLensBlockingPanel이 2D 플로어플랜 SVG를 렌더하고 원클릭 교정·렌즈 전환·JSON 펼치기를 수행한다", () => {
    render(<StudioCameraLensBlockingPanel />);

    expect(
      screen.getByRole("img", { name: "3D 카메라 블로킹 탑뷰 스테이지 플로어플랜 및 180도 액션 라인" }),
    ).toBeTruthy();

    const fixBtn = screen.getByRole("button", { name: "180° 축 위반 원클릭 교정" });
    expect((fixBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(fixBtn);
    expect(screen.getByRole("status").textContent).toContain("대칭 교정");
    expect((fixBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "85mm" }));
    expect(screen.getByRole("button", { name: "85mm" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "JSON 펼치기" }));
    expect(screen.getByText(/toonstudio\.camera-rig\.v1/)).toBeTruthy();
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
