import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  STUDIO_EXPANDED_ECOSYSTEM_COMMANDS,
  validateExpandedEcosystemCommands,
} from "../shortcuts/studio-expanded-ecosystem-commands";
import {
  STUDIO_ECOSYSTEM_LAZY_ENTRIES,
  clearEcosystemLazyLoaderOverrides,
  getEcosystemLazyEntry,
  getEcosystemLoaderStatusBadge,
  isDeferredEcosystemModule,
  listRegisteredEcosystemLoaderIds,
  loadEcosystemModule,
  preloadEcosystemLoader,
  registerEcosystemLazyLoaderOverride,
} from "./studio-ecosystem-lazy-registry";

describe("studio-ecosystem-lazy-registry", () => {
  afterEach(() => {
    clearEcosystemLazyLoaderOverrides();
  });

  it("정적 import로 무거운 패널·엔진을 끌어오지 않고 80/80 동적 import() 경계만 사용한다", () => {
    const sourcePath = resolve(__dirname, "./studio-ecosystem-lazy-registry.ts");
    const source = readFileSync(sourcePath, "utf8");
    const staticImportSpecifiers = [...source.matchAll(/^\s*import\s+(?!type\b)[\s\S]*?from\s+["']([^"']+)["'];?/gmu)]
      .map((m) => m[1]);

    // 오직 경량 `studio-intent-lazy-loader` 한 건만 정적 import 허용
    expect(staticImportSpecifiers).toEqual(["../studio-intent-lazy-loader"]);

    // 80/80 전체 엔트리가 동적 `() => import("...")`로 등록되어야 한다
    const dynamicImportCount = (source.match(/\(\)\s*=>\s*import\(["']/gu) ?? []).length;
    expect(dynamicImportCount).toBe(80);
    expect(STUDIO_ECOSYSTEM_LAZY_ENTRIES).toHaveLength(80);
  });

  it("planned 상태가 0건이며 80/80 모든 확장 생태계 커맨드가 라이브 지연 로더로 1:1 연결된다", () => {
    const ids = STUDIO_ECOSYSTEM_LAZY_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(80);

    const plannedEntries = STUDIO_ECOSYSTEM_LAZY_ENTRIES.filter((e) => e.status === "planned");
    expect(plannedEntries).toHaveLength(0);

    const registeredIds = listRegisteredEcosystemLoaderIds();
    const crossIssues = validateExpandedEcosystemCommands(
      STUDIO_EXPANDED_ECOSYSTEM_COMMANDS,
      registeredIds,
    );
    expect(crossIssues).toEqual([]);
    expect(STUDIO_EXPANDED_ECOSYSTEM_COMMANDS).toHaveLength(80);
  });

  it("실제 동적 로더로 Wave 5·7·8 핵심 엔진 및 UI 패널 모듈을 지연 로드하고 상태 배지를 정확히 반환한다", async () => {
    expect(getEcosystemLoaderStatusBadge("custom-pattern-tip-engine")).toEqual({
      status: "engine-ready",
      badgeKo: "엔진 준비됨",
    });
    expect(getEcosystemLoaderStatusBadge("head-mixer-3d-panel")).toEqual({
      status: "ui-ready",
      badgeKo: "패널 준비됨",
    });

    preloadEcosystemLoader("custom-pattern-tip-engine");
    const tipMod = await loadEcosystemModule("custom-pattern-tip-engine");
    expect(isDeferredEcosystemModule(tipMod)).toBe(false);
    if (!isDeferredEcosystemModule(tipMod)) {
      expect(typeof tipMod["registerCustomPatternTipFromPixels"]).toBe("function");
    }

    const smartObjMod = await loadEcosystemModule("smart-object-runtime-engine");
    expect(isDeferredEcosystemModule(smartObjMod)).toBe(false);
    if (!isDeferredEcosystemModule(smartObjMod)) {
      expect(typeof smartObjMod["StudioSmartObjectRuntime"]).toBe("function");
    }

    // 승격된 Wave 7/8 프런티어 4종이 모두 실동작 모듈을 반환해야 한다
    const promotedChecks = [
      ["planned-live2d-artmesh-rig", "createGridArtMesh"],
      ["planned-rive-state-machine", "RiveStateMachineRuntime"],
      ["planned-multiplane-z-camera", "createMultiplaneCameraDoc"],
      ["planned-ai-node-graph", "createAiNodeGraph"],
    ] as const;
    for (const [loaderId, exportName] of promotedChecks) {
      expect(getEcosystemLoaderStatusBadge(loaderId)).toEqual({
        status: "engine-ready",
        badgeKo: "엔진 준비됨",
      });
      const mod = await loadEcosystemModule(loaderId);
      expect(isDeferredEcosystemModule(mod)).toBe(false);
      if (!isDeferredEcosystemModule(mod)) {
        expect(typeof mod[exportName]).toBe("function");
      }
    }

    const entry = getEcosystemLazyEntry("radial-pie-3d-menu");
    expect(entry?.primaryExportName).toBe("Studio3dRadialPieMenu");
  });

  it("런타임 오버라이드 등록·초기가 정상 동작한다", async () => {
    registerEcosystemLazyLoaderOverride("planned-rive-state-machine", async () => ({
      customOverrideHook: () => "active",
    }));
    const overridden = await loadEcosystemModule("planned-rive-state-machine");
    expect(isDeferredEcosystemModule(overridden)).toBe(false);
    if (!isDeferredEcosystemModule(overridden)) {
      expect(typeof overridden["customOverrideHook"]).toBe("function");
    }
  });
});
