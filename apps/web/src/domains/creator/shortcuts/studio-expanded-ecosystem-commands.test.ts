import { describe, expect, it } from "vitest";

import { STUDIO_STANDARD_SEVEN_MENU_GROUPS } from "../studio-main-menu-group-spec";
import { listRegisteredEcosystemLoaderIds } from "../studio-cuttoon-editor/studio-ecosystem-lazy-registry";

import {
  STUDIO_EXPANDED_ECOSYSTEM_COMMANDS,
  groupExpandedEcosystemCommandsBySevenMenus,
  searchExpandedEcosystemCommands,
  validateExpandedEcosystemCommands,
  type StudioCompetitorProduct,
  type StudioExpandedEcosystemCommand,
} from "./studio-expanded-ecosystem-commands";

describe("studio-expanded-ecosystem-commands", () => {
  it("Three Doors One Command 정합 검증에서 중복 ID·단축키 충돌·금지 용어·메뉴 이탈·누락 로더가 0건이다", () => {
    const loaderIds = listRegisteredEcosystemLoaderIds();
    const issues = validateExpandedEcosystemCommands(STUDIO_EXPANDED_ECOSYSTEM_COMMANDS, loaderIds);
    expect(issues).toEqual([]);
    expect(STUDIO_EXPANDED_ECOSYSTEM_COMMANDS.length).toBeGreaterThanOrEqual(55);
  });

  it("모든 7대 표준 메뉴에 명령이 고르게 귀속되며 그 외 그룹은 존재하지 않는다", () => {
    const grouped = groupExpandedEcosystemCommandsBySevenMenus();
    expect(grouped.size).toBe(7);
    for (const spec of STUDIO_STANDARD_SEVEN_MENU_GROUPS) {
      expect((grouped.get(spec.id) ?? []).length).toBeGreaterThan(0);
    }
  });

  it("주요 경쟁 제품명과 다국어 별칭을 F1/⌘K 검색에 입력하면 정확한 한국어 커맨드를 최상위로 찾는다", () => {
    const queries: ReadonlyArray<{ readonly q: string; readonly expectedId: string }> = [
      { q: "shading assist", expectedId: "eco.layer.shading-assist" },
      { q: "Blend If", expectedId: "eco.layer.blend-if" },
      { q: "vanishing point", expectedId: "eco.edit.vanishing-point-planes" },
      { q: "Auto Layout", expectedId: "eco.edit.auto-layout-grid" },
      { q: "Shape Builder", expectedId: "eco.comic.planar-shape-builder" },
      { q: "pie menu", expectedId: "eco.3d.radial-pie-menu" },
      { q: "에이블러 벽 숨김", expectedId: "eco.3d.wall-cutaway" },
      { q: "False Perspective", expectedId: "eco.3d.false-perspective" },
      { q: "wrap-around mode", expectedId: "eco.layer.viewport-wrap-around" },
      { q: "헤비페인트", expectedId: "eco.layer.pochade-blockin" },
      { q: "PureRef", expectedId: "eco.view.reference-pro-overlay" },
      { q: "이글 스마트 폴더", expectedId: "eco.file.asset-color-smart-folder" },
      { q: "Live Performing", expectedId: "eco.motion.live-performing" },
      { q: "AutoPhysics", expectedId: "eco.3d.autophysics-trajectory" },
      { q: "Live2D", expectedId: "eco.motion.live2d-artmesh" },
      { q: "Rive", expectedId: "eco.motion.rive-state-machine" },
      { q: "Toon Boom", expectedId: "eco.motion.multiplane-z-camera" },
      { q: "controlnet stack", expectedId: "eco.collab.regional-control-stack" },
      { q: "comfy graph", expectedId: "eco.collab.ai-node-graph" },
      { q: "Typecast", expectedId: "eco.motion.voice-lipsync" },
      { q: "Raycast", expectedId: "eco.edit.dynamic-snippets-quicklinks" },
      { q: "Linear", expectedId: "eco.collab.keyboard-triage-cycles" },
      { q: "Notion", expectedId: "eco.collab.slash-script-director" },
      { q: "3D 두상 모델", expectedId: "eco.3d.head-mixer" },
      { q: "컴패니언 모드", expectedId: "eco.view.companion-pairing" },
    ];

    for (const { q, expectedId } of queries) {
      const hits = searchExpandedEcosystemCommands(q);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.command.id).toBe(expectedId);
    }

    // 요구된 핵심 경쟁 제품군이 전부 카탈로그 별칭에 등재되어 있는지 검증
    const coveredProducts = new Set<StudioCompetitorProduct>(
      STUDIO_EXPANDED_ECOSYSTEM_COMMANDS.flatMap((c) => c.competitorAliases.map((a) => a.product)),
    );
    const requiredProducts: readonly StudioCompetitorProduct[] = [
      "CSP", "Photoshop", "Figma", "Illustrator", "Blender", "SketchUp",
      "Shaper", "Tooning Plus", "Plotr", "Manyfast", "ABLER", "Snaptoon",
      "DesignDoll", "Krita", "HeavyPaint", "PureRef", "Eagle", "Procreate",
      "Cascadeur", "Live2D", "Rive", "Toon Boom", "ComfyUI", "Typecast",
      "Raycast", "Linear", "Notion", "VRoid", "CLO 3D", "Substance 3D",
      "Plasticity", "Storyboarder",
    ];
    for (const product of requiredProducts) {
      expect(coveredProducts.has(product)).toBe(true);
    }
  });

  it("정합 검증기가 중복 ID·코어 단축키 충돌·금지 UI 용어·누락 로더를 정확히 적발한다", () => {
    const badCommands: readonly StudioExpandedEcosystemCommand[] = [
      {
        id: "dup.cmd",
        group: "edit",
        koreanLabel: "리비전 동기화",
        competitorAliases: [{ product: "CSP", terms: ["test"], conceptNote: "메모" }],
        shortcut: "Alt+Shift+Q", // 코어 `correct-current-stroke`와 충돌
        panelLoaderId: "shading-assist-panel",
      },
      {
        id: "dup.cmd",
        group: "edit",
        koreanLabel: "정상 라벨",
        competitorAliases: [{ product: "Figma", terms: ["dup"], conceptNote: "메모" }],
        shortcut: "Alt+Shift+Q",
        panelLoaderId: "shading-assist-panel",
      },
    ];

    const issues = validateExpandedEcosystemCommands(badCommands, new Set(["other-loader"]));
    const codes = new Set(issues.map((i) => i.code));
    expect(codes.has("duplicate-id")).toBe(true);
    expect(codes.has("shortcut-conflict-core")).toBe(true);
    expect(codes.has("shortcut-conflict-internal")).toBe(true);
    expect(codes.has("forbidden-ui-term")).toBe(true);
    expect(codes.has("dangling-loader-id")).toBe(true);
  });
});
