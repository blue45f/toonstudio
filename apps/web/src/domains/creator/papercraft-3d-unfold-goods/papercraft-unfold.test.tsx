// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MOUNTAIN_FOLD_DASH,
  PAPERCRAFT_MODEL_PRESETS,
  PAPER_SIZE_SPECS,
  PAPER_WEIGHT_SPECS,
  StudioPapercraftUnfoldPanel,
  VALLEY_FOLD_DASH,
  evaluatePaperFoldPreview,
  exportPapercraftDielineSvg,
  exportPapercraftManifestJson,
  formatOklch,
  getPaperSizeSpec,
  getPaperWeightSpec,
  getPapercraftPreset,
  isVioletSlopHue,
  sanitizeNonVioletHue,
  unfoldPapercraftDieline,
  type PaperSizeId,
  type PaperWeightGsm,
  type PapercraftPresetId,
} from "./index";

afterEach(cleanup);

function assertZeroVioletAndRawColors(svgMarkup: string): void {
  expect(svgMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(svgMarkup).not.toMatch(/\brgba?\s*\(/iu);
  expect(svgMarkup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of svgMarkup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 5종 웹툰 굿즈·배경 3D 로우폴리 프리셋 & 종이 규격·탈-바이올렛 OKLCH", () => {
  it("5종 필수 프리셋 ID와 메타데이터·유효 3D 정점/면 인덱스를 모두 포함한다", () => {
    expect(PAPERCRAFT_MODEL_PRESETS).toHaveLength(5);
    expect(PAPERCRAFT_MODEL_PRESETS.map((p) => p.id)).toEqual([
      "chibi-hero-cube",
      "hanok-rooftop-diorama",
      "cat-mascot-prism",
      "cafe-props-set",
      "fantasy-tower-mini",
    ]);

    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      expect(preset.nameKo.length).toBeGreaterThan(3);
      expect(preset.nameEn.length).toBeGreaterThan(3);
      expect(preset.vertices3d.length).toBeGreaterThanOrEqual(12);
      expect(preset.faces.length).toBeGreaterThanOrEqual(8);
      for (const face of preset.faces) {
        expect(face.vertexIndices.length).toBeGreaterThanOrEqual(3);
        for (const vi of face.vertexIndices) {
          expect(vi).toBeGreaterThanOrEqual(0);
          expect(vi).toBeLessThan(preset.vertices3d.length);
        }
      }
    }
  });

  it("용지 규격(A4/A3/Letter)의 정확한 mm 치수와 종이 평량(180/250/300gsm) 단조 보정 계수를 제공한다", () => {
    expect(PAPER_SIZE_SPECS.map((s) => `${s.id}:${s.widthMm}x${s.heightMm}`)).toEqual([
      "A4:210x297",
      "A3:297x420",
      "Letter:216x279",
    ]);
    const [w180, w250, w300] = PAPER_WEIGHT_SPECS;
    expect(w180.gsm).toBe(180);
    expect(w250.gsm).toBe(250);
    expect(w300.gsm).toBe(300);
    expect(w180.thicknessMm).toBeLessThan(w250.thicknessMm);
    expect(w250.thicknessMm).toBeLessThan(w300.thicknessMm);
    expect(w180.foldAllowanceMm).toBeLessThan(w250.foldAllowanceMm);
    expect(w250.foldAllowanceMm).toBeLessThan(w300.foldAllowanceMm);
    expect(w180.baseTabWidthMm).toBeLessThan(w250.baseTabWidthMm);
    expect(w250.baseTabWidthMm).toBeLessThan(w300.baseTabWidthMm);
  });

  it("isVioletSlopHue와 sanitizeNonVioletHue가 270~320° 바이올렛 구간을 완전히 배제한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(252)).toBe(false);
    expect(isVioletSlopHue(342)).toBe(false);
    expect(isVioletSlopHue(36)).toBe(false);
    for (let h = 270; h <= 320; h += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(h))).toBe(false);
    }
  });

  it("formatOklch가 raw hex/rgb/hsl 없이 탈-바이올렛 OKLCH 문자열을 생성한다", () => {
    expect(formatOklch({ l: 0.72, c: 0.14, h: 36 })).toBe("oklch(0.72 0.14 36)");
    const clamped = formatOklch({ l: 0.64, c: 0.18, h: 288 }, 0.5);
    expect(clamped).toBe("oklch(0.64 0.18 252 / 0.50)");
    expect(clamped).not.toMatch(/#|rgb|hsl/iu);
  });

  it("5종 프리셋의 모든 액센트 색과 면 팔레트가 바이올렛 휴(270~320°) 0%다", () => {
    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      expect(isVioletSlopHue(preset.accentOklch.h)).toBe(false);
      for (const face of preset.faces) {
        expect(isVioletSlopHue(face.colorOklch.h)).toBe(false);
      }
    }
  });

  it("프리셋·용지·평량 조회 헬퍼가 유효 ID를 반환하고 미등록 값에도 안전하게 폴백한다", () => {
    expect(getPapercraftPreset("hanok-rooftop-diorama").nameKo).toContain("한옥");
    expect(getPaperSizeSpec("A3").widthMm).toBe(297);
    expect(getPaperWeightSpec(300).foldAllowanceMm).toBe(0.56);
    expect(getPapercraftPreset("unknown" as PapercraftPresetId).id).toBe("chibi-hero-cube");
    expect(getPaperSizeSpec("B5" as PaperSizeId).id).toBe("A4");
    expect(getPaperWeightSpec(999 as PaperWeightGsm).gsm).toBe(250);
  });
});

describe("2. 순수 결정론적 3D→2D 전개도 엔진 (unfoldPapercraftDieline)", () => {
  it("5종 프리셋 모두 재단 실선·산접기 파선·골접기 일점쇄선·풀칠 탭을 1건 이상 생성한다", () => {
    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      const res = unfoldPapercraftDieline({ presetId: preset.id, paperSize: "A4", paperWeightGsm: 250, scale: 1 });
      expect(res.cutEdges.length).toBeGreaterThanOrEqual(20);
      expect(res.mountainFoldEdges.length).toBeGreaterThanOrEqual(5);
      expect(res.valleyFoldEdges.length).toBeGreaterThanOrEqual(2);
      expect(res.glueTabs.length).toBeGreaterThanOrEqual(9);
      for (const m of res.mountainFoldEdges) {
        expect(m.dihedralAngleDeg).toBeGreaterThan(0);
        expect(m.dashPattern).toBe(MOUNTAIN_FOLD_DASH);
      }
      for (const v of res.valleyFoldEdges) {
        expect(v.dihedralAngleDeg).toBeLessThan(0);
        expect(v.dashPattern).toBe(VALLEY_FOLD_DASH);
      }
    }
  });

  it("5종 프리셋의 모든 풀칠 탭 페어 번호가 1..N으로 중복 없이 호스트·타깃 재단선과 100% 일치한다", () => {
    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      const res = unfoldPapercraftDieline({ presetId: preset.id, paperSize: "A4", paperWeightGsm: 250, scale: 1 });
      expect(res.pairIntegrity.allPairsMatched).toBe(true);
      expect(res.pairIntegrity.unmatchedCount).toBe(0);
      expect(res.pairIntegrity.verifiedPairs).toBe(res.glueTabs.length);
      expect(res.pairIntegrity.maxLengthMismatchMm).toBeLessThanOrEqual(0.1);

      const pairNumbers = res.glueTabs.map((t) => t.pairNumber);
      expect(pairNumbers).toEqual(Array.from({ length: res.glueTabs.length }, (_, idx) => idx + 1));

      const cutMap = new Map(res.cutEdges.map((e) => [e.id, e]));
      for (const tab of res.glueTabs) {
        expect(cutMap.get(tab.hostEdgeId)?.pairNumber).toBe(tab.pairNumber);
        expect(cutMap.get(tab.targetEdgeId)?.pairNumber).toBe(tab.pairNumber);
        expect(Math.abs(tab.edgeLengthMm - tab.targetEdgeLengthMm)).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it("3D→2D 등거리 언폴드가 모든 면의 변 길이를 0.06mm 이내 오차로 보존한다", () => {
    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      const res = unfoldPapercraftDieline({ presetId: preset.id, paperSize: "A3", paperWeightGsm: 250, scale: 1 });
      const faceMap = new Map(res.faces.map((f) => [f.faceId, f]));
      for (const def of preset.faces) {
        const unfolded = faceMap.get(def.id);
        expect(unfolded).toBeDefined();
        if (!unfolded) continue;
        const n = def.vertexIndices.length;
        for (let i = 0; i < n; i += 1) {
          const vA = preset.vertices3d[def.vertexIndices[i] ?? 0];
          const vB = preset.vertices3d[def.vertexIndices[(i + 1) % n] ?? 0];
          const pA = unfolded.polygonMm[i];
          const pB = unfolded.polygonMm[(i + 1) % n];
          if (!vA || !vB || !pA || !pB) continue;
          const len3d = Math.hypot(vB.x - vA.x, vB.y - vA.y, vB.z - vA.z);
          const len2d = Math.hypot(pB.x - pA.x, pB.y - pA.y);
          expect(Math.abs(len3d - len2d)).toBeLessThanOrEqual(0.06);
        }
      }
    }
  });

  it("한옥 오목 처마·고양이 귀 정수리·판타지 첨탑 흉벽의 물리적 골접기(음의 이면각)를 정확히 판별한다", () => {
    const hanok = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 300 });
    expect(hanok.valleyFoldEdges.map((e) => e.secondaryFaceId).sort()).toEqual(["hanok-upper-b", "hanok-upper-f"]);

    const cat = unfoldPapercraftDieline({ presetId: "cat-mascot-prism", paperSize: "A4", paperWeightGsm: 180 });
    expect(cat.valleyFoldEdges.map((e) => e.secondaryFaceId).sort()).toEqual(["cat-ear-l", "cat-ear-r"]);

    const tower = unfoldPapercraftDieline({ presetId: "fantasy-tower-mini", paperSize: "A3", paperWeightGsm: 300 });
    expect(tower.valleyFoldEdges).toHaveLength(4);
    expect(tower.valleyFoldEdges.every((e) => e.secondaryFaceId?.startsWith("parapet-"))).toBe(true);
  });

  it("종이 평량(180 → 250 → 300gsm)이 커질수록 접힘 공차·풀칠 탭 폭·예상 조립 시간이 단조 증가한다", () => {
    const d180 = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 180 });
    const d250 = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 250 });
    const d300 = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 300 });

    expect(d180.paperCompensation.foldAllowanceMm).toBeLessThan(d250.paperCompensation.foldAllowanceMm);
    expect(d250.paperCompensation.foldAllowanceMm).toBeLessThan(d300.paperCompensation.foldAllowanceMm);
    expect(d180.paperCompensation.tabWidthMm).toBeLessThan(d250.paperCompensation.tabWidthMm);
    expect(d250.paperCompensation.tabWidthMm).toBeLessThan(d300.paperCompensation.tabWidthMm);
    expect(d180.estimatedAssemblyMinutes).toBeLessThan(d250.estimatedAssemblyMinutes);
    expect(d250.estimatedAssemblyMinutes).toBeLessThan(d300.estimatedAssemblyMinutes);
  });

  it("용지 규격(A4/Letter → A3) 변경 시 총 페이지 수와 용지 활용률이 물리 규격에 맞춰 재계산된다", () => {
    const towerA4 = unfoldPapercraftDieline({ presetId: "fantasy-tower-mini", paperSize: "A4", paperWeightGsm: 250 });
    const towerLetter = unfoldPapercraftDieline({ presetId: "fantasy-tower-mini", paperSize: "Letter", paperWeightGsm: 250 });
    const towerA3 = unfoldPapercraftDieline({ presetId: "fantasy-tower-mini", paperSize: "A3", paperWeightGsm: 250 });

    expect(towerA4.totalPages).toBe(2);
    expect(towerLetter.totalPages).toBe(2);
    expect(towerA3.totalPages).toBe(1);
    expect(towerA3.pages).toHaveLength(1);
    expect(towerA4.paperUtilizationPercent).toBeGreaterThan(0);
    expect(towerA4.paperUtilizationPercent).toBeLessThan(100);
  });

  it("스케일 배율 증가 시 재단·접선 총 길이와 페이지 수가 비례 증가하고 비정상 입력은 안전하게 클램프된다", () => {
    const small = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 250, scale: 0.7 });
    const mid = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 250, scale: 1.0 });
    const big = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 250, scale: 1.8 });
    const clampedLow = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 250, scale: Number.NaN });
    const clampedHigh = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 250, scale: 99 });

    expect(small.totalCutLengthMm).toBeLessThan(mid.totalCutLengthMm);
    expect(mid.totalCutLengthMm).toBeLessThan(big.totalCutLengthMm);
    expect(big.totalPages).toBeGreaterThan(mid.totalPages);
    expect(clampedLow.scale).toBe(0.5);
    expect(clampedHigh.scale).toBe(2.5);
  });

  it("조립 난이도 3단계(초급·중급·상급)가 모델 복잡도와 평량에 따라 정확히 구분된다", () => {
    const cat = unfoldPapercraftDieline({ presetId: "cat-mascot-prism", paperSize: "A4", paperWeightGsm: 180 });
    const hanok = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 250 });
    const tower = unfoldPapercraftDieline({ presetId: "fantasy-tower-mini", paperSize: "A3", paperWeightGsm: 300 });

    expect(cat.assemblyDifficulty).toBe("beginner");
    expect(cat.assemblyDifficultyLabelKo).toBe("초급");
    expect(hanok.assemblyDifficulty).toBe("intermediate");
    expect(hanok.assemblyDifficultyLabelKo).toBe("중급");
    expect(tower.assemblyDifficulty).toBe("advanced");
    expect(tower.assemblyDifficultyLabelKo).toBe("상급");
  });

  it("동일 입력에 대해 unfoldPapercraftDieline이 완전 결정론적으로 동일한 결과를 반환한다", () => {
    const a = unfoldPapercraftDieline({ presetId: "cafe-props-set", paperSize: "Letter", paperWeightGsm: 250, scale: 1.1 });
    const b = unfoldPapercraftDieline({ presetId: "cafe-props-set", paperSize: "Letter", paperWeightGsm: 250, scale: 1.1 });
    expect(a).toEqual(b);
  });

  it("5종 프리셋 × 3종 용지 × 3종 평량 전체 조합(45건)에서 NaN/Infinity 좌표가 0건이다", () => {
    const sizes: readonly PaperSizeId[] = ["A4", "A3", "Letter"];
    const gsms: readonly PaperWeightGsm[] = [180, 250, 300];
    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      for (const paperSize of sizes) {
        for (const paperWeightGsm of gsms) {
          const res = unfoldPapercraftDieline({ presetId: preset.id, paperSize, paperWeightGsm });
          expect(Number.isFinite(res.boundingBoxMm.widthMm)).toBe(true);
          expect(Number.isFinite(res.paperUtilizationPercent)).toBe(true);
          for (const f of res.faces) {
            expect(f.areaMm2).toBeGreaterThan(0);
            for (const p of f.polygonMm) {
              expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
            }
          }
          for (const t of res.glueTabs) {
            expect(t.areaMm2).toBeGreaterThan(0);
            for (const p of t.polygonMm) {
              expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe("3. 0%→100% 실시간 강체 접힘 3D 투영 프리뷰 (evaluatePaperFoldPreview)", () => {
  it("foldProgress = 0에서는 5종 프리셋 모두 완전히 평평한 전개 상태(maxElevationMm = 0)다", () => {
    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      const p0 = evaluatePaperFoldPreview({ presetId: preset.id, foldProgress: 0 });
      expect(p0.foldProgress).toBe(0);
      expect(p0.foldAngleDeg).toBe(0);
      expect(p0.maxElevationMm).toBe(0);
      expect(p0.faces).toHaveLength(preset.faces.length);
    }
  });

  it("foldProgress = 1에서는 5종 프리셋이 각 모델의 정확한 3D 조립 높이로 완성된다", () => {
    const expectedHeights: Readonly<Record<PapercraftPresetId, number>> = {
      "chibi-hero-cube": 50,
      "hanok-rooftop-diorama": 40,
      "cat-mascot-prism": 44,
      "cafe-props-set": 40,
      "fantasy-tower-mini": 86,
    };
    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      const p1 = evaluatePaperFoldPreview({ presetId: preset.id, foldProgress: 1, scale: 1 });
      expect(p1.foldProgress).toBe(1);
      expect(p1.foldAngleDeg).toBe(90);
      expect(Math.abs(p1.maxElevationMm - expectedHeights[preset.id])).toBeLessThanOrEqual(0.2);
    }
  });

  it("foldProgress 0 → 0.25 → 0.5 → 0.75 → 1.0 진행에 따라 접힘 각도가 단조 증가하고 강체 힌지 궤적과 그림자 오프셋이 반영된다", () => {
    const cubeSteps = [0, 0.25, 0.5, 0.75, 1.0].map((fp) =>
      evaluatePaperFoldPreview({ presetId: "chibi-hero-cube", foldProgress: fp }),
    );
    expect(cubeSteps[0]?.maxElevationMm).toBe(0);
    expect(cubeSteps[0]?.shadowOffsetPx.x).toBe(0);
    for (let i = 1; i < cubeSteps.length; i += 1) {
      const prev = cubeSteps[i - 1];
      const curr = cubeSteps[i];
      if (!prev || !curr) continue;
      expect(curr.foldAngleDeg).toBeGreaterThan(prev.foldAngleDeg);
      expect(curr.maxElevationMm).toBeGreaterThan(0);
    }
    // 2단 힌지(바닥→뒷면→정수리 뚜껑)는 50%에서 수직 정점을 통과한 뒤 100%에서 50mm 완성 높이로 닫힌다
    expect(cubeSteps[2]?.maxElevationMm ?? 0).toBeGreaterThan(cubeSteps[4]?.maxElevationMm ?? 0);
    expect(cubeSteps[4]?.maxElevationMm).toBe(50);
    expect(cubeSteps[4]?.shadowOffsetPx.x ?? 0).toBeGreaterThan(0);
  });

  it("종이 평량(180 → 250 → 300gsm)에 따라 종이 두께 림(paperThicknessPx)이 비례 증가한다", () => {
    const p180 = evaluatePaperFoldPreview({ presetId: "chibi-hero-cube", foldProgress: 0.8, paperWeightGsm: 180 });
    const p250 = evaluatePaperFoldPreview({ presetId: "chibi-hero-cube", foldProgress: 0.8, paperWeightGsm: 250 });
    const p300 = evaluatePaperFoldPreview({ presetId: "chibi-hero-cube", foldProgress: 0.8, paperWeightGsm: 300 });
    expect(p180.paperThicknessPx).toBeLessThan(p250.paperThicknessPx);
    expect(p250.paperThicknessPx).toBeLessThan(p300.paperThicknessPx);
  });

  it("카메라 시점(yaw/pitch) 변경 시 투영 좌표가 변하고 화가 알고리즘 깊이 정렬(averageDepth 오름차순)을 유지한다", () => {
    const viewA = evaluatePaperFoldPreview({ presetId: "hanok-rooftop-diorama", foldProgress: 1, cameraYawDeg: -40, cameraPitchDeg: 25 });
    const viewB = evaluatePaperFoldPreview({ presetId: "hanok-rooftop-diorama", foldProgress: 1, cameraYawDeg: 55, cameraPitchDeg: 35 });

    expect(viewA.faces[0]?.screenPoints).not.toEqual(viewB.faces[0]?.screenPoints);
    for (const view of [viewA, viewB]) {
      for (let i = 1; i < view.faces.length; i += 1) {
        const prev = view.faces[i - 1];
        const curr = view.faces[i];
        if (prev && curr) expect(curr.averageDepth).toBeGreaterThanOrEqual(prev.averageDepth);
      }
    }
  });

  it("범위 밖 foldProgress(-0.5, 2.4, NaN)와 카메라 각도를 안전하게 클램프한다", () => {
    const low = evaluatePaperFoldPreview({ presetId: "cat-mascot-prism", foldProgress: -0.5, cameraPitchDeg: 1 });
    const high = evaluatePaperFoldPreview({ presetId: "cat-mascot-prism", foldProgress: 2.4, cameraPitchDeg: 120 });
    const nan = evaluatePaperFoldPreview({ presetId: "cat-mascot-prism", foldProgress: Number.NaN });
    expect(low.foldProgress).toBe(0);
    expect(low.cameraPitchDeg).toBe(8);
    expect(high.foldProgress).toBe(1);
    expect(high.cameraPitchDeg).toBe(78);
    expect(nan.foldProgress).toBe(0);
  });

  it("투영된 모든 면의 fill/rim/stroke가 raw hex/rgb/hsl 및 바이올렛 0% OKLCH 문자열이다", () => {
    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      const preview = evaluatePaperFoldPreview({ presetId: preset.id, foldProgress: 0.65 });
      for (const face of preview.faces) {
        assertZeroVioletAndRawColors(`${face.fillOklch} ${face.rimOklch} ${face.strokeOklch}`);
        expect(face.fillOklch.startsWith("oklch(")).toBe(true);
      }
    }
  });
});

describe("4. 인쇄용 SVG 도면 & JSON 매니페스트 내보내기", () => {
  it("exportPapercraftDielineSvg가 1:1 mm 규격과 모든 레이어 그룹(faces·glue-tabs·mountain·valley·cut·tab-numbers)을 포함한다", () => {
    const dieline = unfoldPapercraftDieline({ presetId: "hanok-rooftop-diorama", paperSize: "A4", paperWeightGsm: 300 });
    const svg = exportPapercraftDielineSvg(dieline);
    expect(svg).toContain('width="210mm" height="297mm"');
    expect(svg).toContain('data-schema="toonstudio.papercraft-dieline-svg.v1"');
    expect(svg).toContain('id="faces-1"');
    expect(svg).toContain('id="glue-tabs-1"');
    expect(svg).toContain('id="mountain-folds-1"');
    expect(svg).toContain('id="valley-folds-1"');
    expect(svg).toContain('id="cut-lines-1"');
    expect(svg).toContain('id="tab-numbers-1"');
    expect(svg).toContain("실선=재단");
  });

  it("특정 페이지 필터(pageIndex)와 범례 제외(includeLegend: false) 옵션이 정확히 동작한다", () => {
    const dieline = unfoldPapercraftDieline({ presetId: "chibi-hero-cube", paperSize: "A4", paperWeightGsm: 250 });
    const fullSvg = exportPapercraftDielineSvg(dieline);
    const page2Svg = exportPapercraftDielineSvg(dieline, { pageIndex: 1, includeLegend: false });

    expect(fullSvg).toContain('data-pages="2"');
    expect(page2Svg).toContain('data-pages="1"');
    expect(page2Svg).toContain('width="210mm" height="297mm"');
    expect(page2Svg).toContain('id="page-2"');
    expect(page2Svg).not.toContain('id="page-1"');
    expect(page2Svg).not.toContain("실선=재단");
  });

  it("5종 프리셋 전체의 내보내기 SVG가 원시 hex/rgb/hsl 및 바이올렛 휴(270~320°) 0건이다", () => {
    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      const dieline = unfoldPapercraftDieline({ presetId: preset.id, paperSize: "A4", paperWeightGsm: 250 });
      assertZeroVioletAndRawColors(exportPapercraftDielineSvg(dieline));
    }
  });

  it("exportPapercraftManifestJson이 유효 스키마·보정값·풀칠 탭 쌍 매핑·접힘 상태를 포함한 JSON을 반환한다", () => {
    const dieline = unfoldPapercraftDieline({ presetId: "cafe-props-set", paperSize: "Letter", paperWeightGsm: 250, scale: 1.1 });
    const preview = evaluatePaperFoldPreview({ presetId: "cafe-props-set", foldProgress: 0.5, paperWeightGsm: 250, scale: 1.1 });
    const raw = exportPapercraftManifestJson(dieline, preview);
    const parsed = JSON.parse(raw) as {
      schema: string;
      sheet: { paperSize: string; totalPages: number };
      dielineMetrics: { glueTabCount: number; pairIntegrity: { allPairsMatched: boolean } };
      glueTabPairs: Array<{ pairNumber: number }>;
      foldPreview: { foldProgress: number; foldAngleDeg: number };
    };
    expect(parsed.schema).toBe("toonstudio.papercraft-unfold-goods.v1");
    expect(parsed.sheet.paperSize).toBe("Letter");
    expect(parsed.dielineMetrics.pairIntegrity.allPairsMatched).toBe(true);
    expect(parsed.glueTabPairs).toHaveLength(dieline.glueTabs.length);
    expect(parsed.foldPreview.foldProgress).toBe(0.5);
    expect(parsed.foldPreview.foldAngleDeg).toBe(45);
  });

  it("동일 전개도·프리뷰에 대한 SVG와 JSON 내보내기가 결정론적으로 완전히 동일하다", () => {
    const dieline = unfoldPapercraftDieline({ presetId: "cat-mascot-prism", paperSize: "A4", paperWeightGsm: 180 });
    const preview = evaluatePaperFoldPreview({ presetId: "cat-mascot-prism", foldProgress: 0.85, paperWeightGsm: 180 });
    expect(exportPapercraftDielineSvg(dieline)).toBe(exportPapercraftDielineSvg(dieline));
    expect(exportPapercraftManifestJson(dieline, preview)).toBe(exportPapercraftManifestJson(dieline, preview));
  });
});

describe("5. 스튜디오 패널 UI 상호작용 & 로케일 (StudioPapercraftUnfoldPanel)", () => {
  it("props 없이 기본 마운트 시 5종 프리셋·3종 용지·3종 평량·2단 SVG 프리뷰·풀칠 탭 매칭 표가 렌더링된다", () => {
    render(<StudioPapercraftUnfoldPanel />);
    expect(screen.getByTestId("papercraft-unfold-panel")).toBeTruthy();
    for (const preset of PAPERCRAFT_MODEL_PRESETS) {
      expect(screen.getByTestId(`papercraft-preset-${preset.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId("papercraft-paper-A4").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("papercraft-gsm-250").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("papercraft-dieline-svg").getAttribute("data-pairs-matched")).toBe("true");
    expect(screen.getByTestId("papercraft-fold-preview-svg").getAttribute("data-preset-id")).toBe("chibi-hero-cube");
    expect(screen.getByTestId("papercraft-tab-pair-list").textContent).toContain("#1");
  });

  it("5종 프리셋 버튼 전환 시 2D 전개도·3D 프리뷰·권장 평량·난이도 배지가 즉시 갱신된다", () => {
    render(<StudioPapercraftUnfoldPanel />);
    fireEvent.click(screen.getByTestId("papercraft-preset-fantasy-tower-mini"));
    expect(screen.getByTestId("papercraft-dieline-svg").getAttribute("data-preset-id")).toBe("fantasy-tower-mini");
    expect(screen.getByTestId("papercraft-fold-preview-svg").getAttribute("data-preset-id")).toBe("fantasy-tower-mini");
    expect(screen.getByTestId("papercraft-gsm-300").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("papercraft-difficulty-badge").textContent).toContain("상급");

    fireEvent.click(screen.getByTestId("papercraft-preset-cat-mascot-prism"));
    expect(screen.getByTestId("papercraft-gsm-180").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("papercraft-difficulty-badge").textContent).toContain("초급");
  });

  it("용지 규격(A4 ↔ A3 ↔ Letter) 전환 시 총 페이지 수와 페이지 전환 버튼이 실시간 반영된다", () => {
    render(<StudioPapercraftUnfoldPanel initialPresetId="chibi-hero-cube" initialPaperSize="A4" />);
    expect(screen.getByTestId("papercraft-dieline-svg").getAttribute("data-total-pages")).toBe("2");
    expect(screen.getByTestId("papercraft-page-btn-2")).toBeTruthy();

    fireEvent.click(screen.getByTestId("papercraft-page-btn-2"));
    expect(screen.getByTestId("papercraft-dieline-svg").getAttribute("data-active-page")).toBe("2");

    fireEvent.click(screen.getByTestId("papercraft-paper-A3"));
    expect(screen.getByTestId("papercraft-dieline-svg").getAttribute("data-paper-size")).toBe("A3");
    expect(screen.getByTestId("papercraft-dieline-svg").getAttribute("data-total-pages")).toBe("1");
    expect(screen.queryByTestId("papercraft-page-btn-2")).toBeNull();
  });

  it("종이 평량(180 → 300gsm) 전환 시 접힘 공차 문구와 3D SVG 종이 두께 속성이 즉시 갱신된다", () => {
    render(<StudioPapercraftUnfoldPanel />);
    fireEvent.click(screen.getByTestId("papercraft-gsm-180"));
    const thick180 = Number(screen.getByTestId("papercraft-fold-preview-svg").getAttribute("data-paper-thickness-px"));
    expect(screen.getByTestId("papercraft-compensation-note").textContent).toContain("+0.28mm");

    fireEvent.click(screen.getByTestId("papercraft-gsm-300"));
    const thick300 = Number(screen.getByTestId("papercraft-fold-preview-svg").getAttribute("data-paper-thickness-px"));
    expect(screen.getByTestId("papercraft-compensation-note").textContent).toContain("+0.56mm");
    expect(thick300).toBeGreaterThan(thick180);
  });

  it("접힘 슬라이더 및 빠른 버튼(0%·50%·100%) 조작 시 3D 프리뷰 높이와 각도가 실시간 변경된다", () => {
    render(<StudioPapercraftUnfoldPanel />);
    fireEvent.click(screen.getByTestId("papercraft-fold-preset-0"));
    expect(screen.getByTestId("papercraft-fold-readout").textContent).toBe("0% · 0°");
    expect(screen.getByTestId("papercraft-fold-preview-svg").getAttribute("data-max-elevation-mm")).toBe("0.0");

    fireEvent.change(screen.getByTestId("papercraft-fold-slider"), { target: { value: "50" } });
    expect(screen.getByTestId("papercraft-fold-readout").textContent).toBe("50% · 45°");

    fireEvent.click(screen.getByTestId("papercraft-fold-preset-100"));
    expect(screen.getByTestId("papercraft-fold-readout").textContent).toBe("100% · 90°");
    expect(Number(screen.getByTestId("papercraft-fold-preview-svg").getAttribute("data-max-elevation-mm"))).toBeGreaterThan(45);
  });

  it("스케일 및 시점 회전(Yaw) 슬라이더 조작 시 수치와 도면 메트릭이 실시간 반영된다", () => {
    render(<StudioPapercraftUnfoldPanel initialPresetId="hanok-rooftop-diorama" />);
    const beforeLengths = screen.getByTestId("papercraft-metric-lengths").textContent;
    fireEvent.change(screen.getByTestId("papercraft-scale-slider"), { target: { value: "1.5" } });
    expect(screen.getByTestId("papercraft-scale-readout").textContent).toBe("1.50x");
    expect(screen.getByTestId("papercraft-metric-lengths").textContent).not.toBe(beforeLengths);

    fireEvent.change(screen.getByTestId("papercraft-yaw-slider"), { target: { value: "45" } });
    expect(screen.getByTestId("papercraft-yaw-readout").textContent).toBe("45°");
  });

  it("인쇄용 SVG 복사·JSON 복사·소스 토글·초기화 버튼과 콜백(onExportSvg/onExportJson)이 정상 동작한다", () => {
    const onExportSvg = vi.fn();
    const onExportJson = vi.fn();
    render(<StudioPapercraftUnfoldPanel onExportSvg={onExportSvg} onExportJson={onExportJson} />);

    expect(screen.queryByTestId("papercraft-svg-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("papercraft-export-svg-btn"));
    expect(onExportSvg).toHaveBeenCalledTimes(1);
    expect(onExportSvg.mock.calls[0]?.[0]).toContain("toonstudio.papercraft-dieline-svg.v1");
    expect(screen.getByTestId("papercraft-svg-preview").textContent).toContain("<svg");

    fireEvent.click(screen.getByTestId("papercraft-export-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.papercraft-unfold-goods.v1");
    expect(screen.getByTestId("papercraft-json-preview").textContent).toContain('"glueTabPairs"');

    fireEvent.click(screen.getByTestId("papercraft-toggle-json-btn"));
    expect(screen.queryByTestId("papercraft-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("papercraft-preset-cafe-props-set"));
    fireEvent.click(screen.getByTestId("papercraft-reset-btn"));
    expect(screen.getByTestId("papercraft-dieline-svg").getAttribute("data-preset-id")).toBe("chibi-hero-cube");
  });

  it("영문 로케일(locale='en')과 초기 프리셋·용지 props 지정이 정상 렌더링된다", () => {
    render(<StudioPapercraftUnfoldPanel locale="en" initialPresetId="hanok-rooftop-diorama" initialPaperSize="A3" />);
    expect(screen.getByTestId("papercraft-unfold-panel").getAttribute("aria-label")).toContain("Papercraft");
    expect(screen.getByTestId("papercraft-dieline-svg").getAttribute("data-preset-id")).toBe("hanok-rooftop-diorama");
    expect(screen.getByTestId("papercraft-dieline-svg").getAttribute("data-paper-size")).toBe("A3");
    expect(screen.getByTestId("papercraft-pair-integrity-badge").textContent).toContain("Tab Pairs Verified");
  });
});

describe("6. 엄격 품질·하네스 계약 및 Calm Atelier 자가 검증", () => {
  it("소유 파일 4종 존재, 줄 수 상한 준수(engine<=750, panel<=700, all<=800) 및 금지 패턴 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "papercraft-unfold-engine.ts",
      "StudioPapercraftUnfoldPanel.tsx",
      "index.ts",
      "papercraft-unfold.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "papercraft-unfold-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioPapercraftUnfoldPanel.tsx") expect(lines).toBeLessThanOrEqual(700);

      if (file !== "papercraft-unfold.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
        expect(src).not.toContain("원활한 워크플로우를 보장");
      }

      if (file === "StudioPapercraftUnfoldPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("렌더된 모든 버튼이 min-h-11을 유지하고 2단 SVG 모두 원시 색·바이올렛 휴(270~320°)가 0건이다", () => {
    const { container } = render(<StudioPapercraftUnfoldPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(18);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    for (const svg of svgs) {
      assertZeroVioletAndRawColors(svg.outerHTML);
    }
  });
});
