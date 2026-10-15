import { runInNewContext } from "node:vm";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import canvasSource from "./promo-canvas.ts?raw";
import { emptyPromoProject, localPromoPlan, parsePromoProject, promoFrameCount, promoMaxPanels, promoShotList, promoSrt, promoTimeline } from "./promo-model";
import modelSource from "./promo-model.ts?raw";
import voiceStudioModelSource from "./promo-voice-studio-model.ts?raw";

import type { PromoPanel, PromoProject, PromoSeconds } from "./promo-model";

/*
 * Remotion 킷은 promo-model·promo-canvas·promo-voice-studio-model 세 파일의 "원문"만 싣는다(promo-downloads.ts).
 * 모델에 상수나 규칙을 더할 때 킷에 실리지 않는 파일을 가져오면, 앱 미리보기는 되는데 킷 렌더만 깨진다.
 * 그래서 세 파일이 서로만 가져오는지, 그리고 실린 원문 그대로 실행해도 편집기와 같은 타임라인을 계산하는지 확인한다.
 */
const SHIPPED = ["./promo-model", "./promo-canvas", "./promo-voice-studio-model"];

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gmu)) specifiers.push(match[1] ?? "");
  for (const match of source.matchAll(/^import\s+["']([^"']+)["']/gmu)) specifiers.push(match[1] ?? "");
  return specifiers;
}

function load(source: string, name: string, modules: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const module = { exports: {} as Record<string, unknown> };
  const require = (id: string): unknown => {
    if (id in modules) return modules[id];
    throw new Error(`킷에 실리지 않는 모듈을 가져왔어요: ${id} (${name})`);
  };
  runInNewContext(outputText, { module, exports: module.exports, require }, { filename: name });
  return module.exports;
}

const image = "data:image/png;base64,aGVsbG8=";
function project(count: number, seconds: PromoSeconds): PromoProject {
  const panels: PromoPanel[] = Array.from({ length: count }, (_, index) => ({
    id: `cut-${index}`, src: image, description: `장면 ${index + 1}`, caption: ["네", "그때 우리가 만났던 골목에서 이야기가 시작됐어요", "응", "마지막 인사", "다섯째", "여섯째"][index] ?? `자막 ${index}`, motion: "push-in", fit: "contain", weight: index % 2 ? 2 : 0.5,
  }));
  return { ...emptyPromoProject(), seconds, panels };
}

describe("Remotion 킷 이식성", () => {
  it("킷에 실리는 세 원문은 서로만 가져온다", () => {
    for (const [name, source] of [["promo-model", modelSource], ["promo-canvas", canvasSource], ["promo-voice-studio-model", voiceStudioModelSource]] as const) {
      for (const specifier of importSpecifiers(source)) expect(SHIPPED, `${name}이 가져온 ${specifier}`).toContain(specifier);
    }
    expect(importSpecifiers(modelSource)).toContain("./promo-voice-studio-model");
  });

  it("실린 원문 그대로 실행해도 편집기와 같은 길이·컷 상한·타임라인을 계산한다", () => {
    const voiceStudio = load(voiceStudioModelSource, "promo-voice-studio-model", {});
    const kit = load(modelSource, "promo-model", { "./promo-voice-studio-model": voiceStudio }) as {
      promoTimeline: typeof promoTimeline; promoFrameCount: typeof promoFrameCount; promoMaxPanels: typeof promoMaxPanels;
      parsePromoProject: typeof parsePromoProject; promoSrt: typeof promoSrt; promoShotList: typeof promoShotList; localPromoPlan: typeof localPromoPlan;
    };
    for (const [seconds, count] of [[10, 1], [10, 6], [15, 12], [30, 5], [60, 12]] as const) {
      const value = project(count, seconds);
      expect(kit.promoMaxPanels(seconds)).toBe(promoMaxPanels(seconds));
      expect(kit.promoFrameCount(value)).toBe(promoFrameCount(value));
      expect(kit.promoTimeline(value)).toEqual(promoTimeline(value));
      expect(kit.promoSrt(value)).toBe(promoSrt(value));
      expect(kit.promoShotList(value)).toBe(promoShotList(value));
      expect(kit.localPromoPlan(value)).toEqual(localPromoPlan(value));
      expect(kit.parsePromoProject(JSON.parse(JSON.stringify(value)))).toEqual(value);
    }
    expect(() => kit.promoTimeline(project(7, 10))).toThrow();
  });

  it("킷의 캔버스 원문도 가져온 모델 위에서 바로 평가된다", () => {
    const voiceStudio = load(voiceStudioModelSource, "promo-voice-studio-model", {});
    const model = load(modelSource, "promo-model", { "./promo-voice-studio-model": voiceStudio });
    const canvas = load(canvasSource, "promo-canvas", { "./promo-model": model }) as { drawPromoFrame: unknown; loadPromoImages: unknown };
    expect(typeof canvas.drawPromoFrame).toBe("function");
    expect(typeof canvas.loadPromoImages).toBe("function");
  });
});
