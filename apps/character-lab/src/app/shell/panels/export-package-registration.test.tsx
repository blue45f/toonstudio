// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, createDefaultRecipe, createInitialLabState, createPresetCatalog, failVisible } from "../../../contracts";
import { parseCharacterPackageIndex } from "../../../domains/authored/package-index";
import { buildPackagePlanDetailed } from "../../../domains/authored/package-plan";
import { serializeRecipe } from "../../../export/recipe-file";
import { createPaintSession } from "../../../paint/paint-session";
import { createLabStore } from "../../../state/lab-store";
import { FIXTURE_GLB_SHA256, characterPackageIndexFixture, characterPackageManifestFixture } from "../../../testing/manifest-fixtures";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";
import { createPackagePlanRegistry } from "../package-plan-registry";

import { ExportPanel } from "./ExportPanel";
import { browserPackageLoader } from "./PackagePanel";

import type { CharacterRecipe } from "../../../contracts";
import type { AuthoredIndexEntry } from "../../../domains/authored/package-index";
import type { AuthoredPackageLoadResult } from "../../../domains/authored/package-load-flow";

const CHARACTER_ID = "import-hero";
const OTHER_SHA256 = "f".repeat(64);

function packageFixture(indexSha256: string | null = null, planSha256 = FIXTURE_GLB_SHA256): {
  readonly entry: AuthoredIndexEntry;
  readonly loaded: Extract<AuthoredPackageLoadResult, { readonly ok: true }>;
} {
  const parsed = parseCharacterPackageIndex(characterPackageIndexFixture([CHARACTER_ID]));
  if (!parsed.ok || !parsed.entries[0]) throw new Error("패키지 인덱스 fixture를 만들지 못했습니다.");
  const entry = { ...parsed.entries[0], glbSha256: indexSha256 };
  const glbBytes = new Uint8Array([1, 2, 3]);
  const manifest = characterPackageManifestFixture({ characterId: CHARACTER_ID, glbSha256: planSha256, glbBytes: glbBytes.length });
  const built = buildPackagePlanDetailed(manifest, entry.baseUrl, { glbSha256: planSha256, glbBytes: glbBytes.length });
  if (!built.ok) throw new Error(built.failure.reasonKo);
  return {
    entry,
    loaded: {
      ok: true,
      plan: built.plan,
      detail: {
        judgement: built.judgement,
        hairLod: built.hairLod,
        conversion: null,
        gaps: [],
        warnings: [],
        glbBytes,
        observedSha256: planSha256,
      },
    },
  };
}

function renderImportPanel() {
  const engine = createMockEngine();
  const engineSession = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
  engineSession.setEngine(engine);
  const reloadSource = vi.spyOn(engineSession, "reloadSource");
  const paintSession = createPaintSession({
    layerSize: 16,
    activePart: "head",
    brush: { radiusPx: 3, hardness: 1, opacity: 1, color: "#224488" },
  });
  const store = createLabStore({
    catalog: createPresetCatalog([]),
    initial: createInitialLabState(createDefaultRecipe(), ALL_AVAILABLE_CAPABILITIES),
    onPaintUndo: (token) => paintSession.applyToken(token) ?? undefined,
  });
  store.dispatch({ type: "param/set", group: "body", key: "height", value: 0.42 });
  paintSession.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "head");
  const stroke = paintSession.endStroke();
  if (!stroke) throw new Error("보존할 페인트 stroke fixture를 만들지 못했습니다.");
  store.dispatch({ type: "paint/stroke", undoToken: stroke });
  paintSession.setActiveSublayer(1);
  paintSession.setBrush({ color: "#ee4466" });
  paintSession.beginStroke({ u: 0.25, v: 0.25, pressure: 1 }, "head");
  const hiddenStroke = paintSession.endStroke();
  if (!hiddenStroke) throw new Error("보존할 숨김 서브레이어 fixture를 만들지 못했습니다.");
  store.dispatch({ type: "paint/stroke", undoToken: hiddenStroke });
  const hideSublayer = paintSession.setSublayerVisible("head", 1, false);
  if (hideSublayer) store.dispatch({ type: "paint/stroke", undoToken: hideSublayer });
  engine.updatePaintTexture(paintSession.layer("head"));

  const paintSnapshot = () => ({
    layers: paintSession.layersForExport().map(({ rgba, ...layer }) => ({ ...layer, rgba: Array.from(rgba) })),
    sublayers: paintSession.sublayersForExport().map(({ slots, ...part }) => ({
      ...part,
      slots: slots.map(({ rgba, ...slot }) => ({ ...slot, rgba: rgba === null ? null : Array.from(rgba) })),
    })),
  });
  const baselineRecipe = structuredClone(store.getState().recipe);
  const baselineHistory = structuredClone(store.getState().history);
  const baselineCapabilities = store.getState().capabilities;
  const baselinePaint = paintSnapshot();
  const baselineUploads = engine.paintUploads.length;
  const packagePlans = createPackagePlanRegistry();
  let fileText = "";

  render(
    <MockLabProvider store={store} engineSession={engineSession} shell={{ packagePlans }}>
      <ExportPanel session={paintSession} deps={{ now: () => 100, readFile: async () => fileText }} />
    </MockLabProvider>,
  );

  const importRecipe = async (): Promise<void> => {
    const recipe: CharacterRecipe = {
      ...createDefaultRecipe(),
      source: { kind: "package", characterId: CHARACTER_ID, sha256: FIXTURE_GLB_SHA256 },
    };
    fileText = serializeRecipe(recipe);
    await act(async () => {
      fireEvent.change(screen.getByTestId("export-recipe-file-input"), {
        target: { files: [new File([fileText], "package.character.json", { type: "application/json" })] },
      });
    });
  };

  const assertCurrentWorkPreserved = (): void => {
    expect(store.getState().recipe).toEqual(baselineRecipe);
    expect(store.getState().history).toEqual(baselineHistory);
    expect(store.getState().history.canUndo).toBe(true);
    expect(store.getState().capabilities).toBe(baselineCapabilities);
    expect(paintSnapshot()).toEqual(baselinePaint);
    expect(engine.paintUploads).toHaveLength(baselineUploads);
    expect(reloadSource).not.toHaveBeenCalled();
    expect(engine.loadedSources).toHaveLength(0);
    expect(screen.queryByTestId("export-receipt")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  };

  return { store, packagePlans, reloadSource, importRecipe, assertCurrentWorkPreserved };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ExportPanel 제작 패키지 자동 등록의 null 해시·불일치 보호", () => {
  it("인덱스 해시가 null이면 패키지를 검증·등록한 뒤 일치하는 레시피를 불러온다", async () => {
    const { entry, loaded } = packageFixture();
    const loadIndex = vi.spyOn(browserPackageLoader, "loadIndex").mockResolvedValue({ ok: true, entries: [entry] });
    const loadPackage = vi.spyOn(browserPackageLoader, "loadPackage").mockResolvedValue(loaded);
    const panel = renderImportPanel();

    await panel.importRecipe();

    await waitFor(() => expect(screen.getByTestId("export-receipt").textContent).toContain("package.character.json"));
    expect(entry.glbSha256).toBeNull();
    expect(loadIndex).toHaveBeenCalledTimes(1);
    expect(loadPackage).toHaveBeenCalledExactlyOnceWith(entry, { preferredLod: 0 });
    expect(panel.packagePlans.get(CHARACTER_ID)).toBe(loaded.plan);
    expect(panel.store.getState().recipe.source).toEqual({ kind: "package", characterId: CHARACTER_ID, sha256: FIXTURE_GLB_SHA256 });
    expect(panel.store.getState().capabilities).toBe(loaded.plan.capabilities);
    expect(screen.queryByTestId("export-failure-alert")).toBeNull();
    expect(panel.reloadSource).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("null 인덱스에서 로드한 실제 해시가 레시피와 다르면 엔진을 바꾸지 않고 현재 작업을 보존한다", async () => {
    const { entry, loaded } = packageFixture(null, OTHER_SHA256);
    vi.spyOn(browserPackageLoader, "loadIndex").mockResolvedValue({ ok: true, entries: [entry] });
    const loadPackage = vi.spyOn(browserPackageLoader, "loadPackage").mockResolvedValue(loaded);
    const panel = renderImportPanel();

    await panel.importRecipe();

    await waitFor(() => expect(screen.getByTestId("export-failure-alert").textContent).toContain("package-sha-mismatch"));
    expect(loadPackage).toHaveBeenCalledExactlyOnceWith(entry, { preferredLod: 0 });
    panel.assertCurrentWorkPreserved();
  });

  it("null 인덱스의 패키지 검증이 실패하면 활성 엔진의 기존 작업을 보호하고 플랜을 등록하지 않는다", async () => {
    const { entry } = packageFixture();
    vi.spyOn(browserPackageLoader, "loadIndex").mockResolvedValue({ ok: true, entries: [entry] });
    const loadPackage = vi.spyOn(browserPackageLoader, "loadPackage").mockResolvedValue({
      ok: false,
      failure: failVisible("package-sha-mismatch", "GLB SHA-256이 manifest와 다릅니다.", undefined, 100),
    });
    const panel = renderImportPanel();

    await panel.importRecipe();

    await waitFor(() => expect(screen.getByTestId("export-failure-alert").textContent).toContain("package-plan-missing"));
    expect(loadPackage).toHaveBeenCalledExactlyOnceWith(entry, { preferredLod: 0 });
    expect(panel.packagePlans.get(CHARACTER_ID)).toBeUndefined();
    panel.assertCurrentWorkPreserved();
  });

  it("인덱스에 명시된 다른 해시는 패키지 로드 전에 거절하고 현재 작업을 보존한다", async () => {
    const { entry, loaded } = packageFixture(OTHER_SHA256);
    const loadIndex = vi.spyOn(browserPackageLoader, "loadIndex").mockResolvedValue({ ok: true, entries: [entry] });
    const loadPackage = vi.spyOn(browserPackageLoader, "loadPackage").mockResolvedValue(loaded);
    const panel = renderImportPanel();

    await panel.importRecipe();

    await waitFor(() => expect(screen.getByTestId("export-failure-alert").textContent).toContain("package-sha-mismatch"));
    expect(loadIndex).toHaveBeenCalledTimes(1);
    expect(loadPackage).not.toHaveBeenCalled();
    expect(panel.packagePlans.get(CHARACTER_ID)).toBeUndefined();
    panel.assertCurrentWorkPreserved();
  });
});
