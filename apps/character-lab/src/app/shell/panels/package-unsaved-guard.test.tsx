// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  KIT_CURRENT_VERSION,
  KIT_DEFAULT_ID,
  createKitDefaultRecipe,
  failVisible,
} from "../../../contracts";
import { buildKitPlanDetailed } from "../../../domains/authored/kit-plan";
import { loadAuthoredPackageFlow, loadPackageIndexFlow } from "../../../domains/authored/package-load-flow";
import { createPaintSession } from "../../../paint/paint-session";
import { kitManifestFixture } from "../../../testing/kit-fixtures";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession, createMockLabStore } from "../../../testing/mock-store";
import { createKitPlanRegistry } from "../kit-plan-registry";
import { createUiStateStore } from "../ui-state";
import { markCharacterWorkSaved } from "../unsaved-work";

import { PackagePanel } from "./PackagePanel";

import type { PackagePanelLoader } from "./PackagePanel";
import type { LabState } from "../../../contracts";
import type { PackageFetchPort } from "../../../domains/authored/package-load-flow";
import type { ApplyLoop } from "../apply-loop";

function resolveAssetRoot(): string {
  const metaUrl = new URL(import.meta.url);
  if (metaUrl.protocol === "file:") return fileURLToPath(new URL("../../../../public/assets/characters/", metaUrl));
  const candidates = [
    path.resolve(process.cwd(), "public/assets/characters"),
    path.resolve(process.cwd(), "apps/character-lab/public/assets/characters"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`제작 패키지 디렉터리(public/assets/characters)를 찾지 못했습니다(cwd ${process.cwd()}).`);
  return `${found}${path.sep}`;
}

const ASSET_ROOT = resolveAssetRoot();
const URL_PREFIX = "/assets/characters/";
const MALE_PROVIDED_PRESETS = ["hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"];

function fsLoader(): PackagePanelLoader {
  const resolve = (url: string): string => `${ASSET_ROOT}${url.slice(URL_PREFIX.length)}`;
  const port: PackageFetchPort = {
    async fetchJson(url) {
      try {
        return { ok: true, json: JSON.parse(await readFile(resolve(url), "utf8")) as unknown };
      } catch (error) {
        return { ok: false, status: 404, message: String(error) };
      }
    },
    async fetchBytes(url) {
      try {
        return { ok: true, bytes: new Uint8Array(await readFile(resolve(url))) };
      } catch (error) {
        return { ok: false, status: 404, message: String(error) };
      }
    },
  };
  const sha256 = async (bytes: Uint8Array): Promise<string> => createHash("sha256").update(bytes).digest("hex");
  return {
    loadIndex: () => loadPackageIndexFlow(port, undefined, 1),
    loadPackage: (entry, options) => loadAuthoredPackageFlow(port, entry, { sha256, preferredLod: options.preferredLod, now: 1 }),
  };
}

function fakeKitRegistry() {
  const manifest = kitManifestFixture({ malePresets: MALE_PROVIDED_PRESETS });
  return createKitPlanRegistry({
    async loadManifest() {
      return { ok: true, manifest, rootUrl: "/assets/characters/toonstudio-kit-v1" };
    },
    buildPlan: buildKitPlanDetailed,
    now: () => 1,
  });
}

function fakeApplyLoop(): ApplyLoop & { readonly retries: number } {
  let retries = 0;
  const snapshot = { plan: null, receipt: null, sequence: 0 };
  const loop: ApplyLoop = {
    start: () => () => undefined,
    flush: async () => undefined,
    lastPlan: () => null,
    lastReceipt: () => null,
    snapshot: () => snapshot,
    markSourceLoaded: () => undefined,
    retrySource: () => {
      retries += 1;
    },
    settled: () => true,
    subscribe: () => () => undefined,
  };
  return Object.defineProperty(loop, "retries", { get: () => retries }) as ApplyLoop & { readonly retries: number };
}

const readyEngineStatus = (): LabState["engine"] => ({
  phase: "ready",
  backend: "webgpu",
  diagnostics: createMockEngine().diagnostics,
});

afterEach(cleanup);

describe("PackagePanel — 미저장 변경 보호 · 엔진 실패 복구 · 연속 클릭 중복 방지", () => {
  it("미저장 페인트 작업이 있을 때 모델 전환을 가로채고 취소·내보내기 탭 이동·유지 후 전환·저장 완료 후 무경고 전환을 보장한다", async () => {
    const paint = createPaintSession({ layerSize: 16 });
    paint.setActivePart("head");
    paint.setActiveSublayer(1);
    paint.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "head");
    paint.endStroke();

    const ui = createUiStateStore({ inspectorTab: "package" });
    const store = createMockLabStore({ recipe: createKitDefaultRecipe() });

    render(
      <MockLabProvider store={store} shell={{ ui, kitPlans: fakeKitRegistry() }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} session={paint} now={() => 300} />
      </MockLabProvider>,
    );

    await screen.findByLabelText("출처와 라이선스");

    // 1) 미저장 페인트 상태에서 '남성 베이스' 클릭 시 즉시 전환하지 않고 보호 안내를 표시한다
    fireEvent.click(screen.getByRole("button", { name: "남성 베이스" }));
    const guard = screen.getByTestId("package-unsaved-guard");
    expect(guard.textContent).toMatch(/저장하지 않은 페인트 레이어/u);
    expect(store.dispatched).toEqual([]);
    expect(paint.sublayersForExport()).toHaveLength(1);

    // 2) '취소' 클릭 시 현재 모델과 페인트가 그대로 보존된다
    fireEvent.click(screen.getByTestId("package-unsaved-cancel"));
    expect(screen.queryByTestId("package-unsaved-guard")).toBeNull();
    expect(store.dispatched).toEqual([]);

    // 3) '절차 소스로 전환' 클릭 → '내보내기 탭에서 먼저 저장' 선택 시 내보내기 탭으로 이동하고 소스는 바꾸지 않는다
    fireEvent.click(screen.getByRole("button", { name: "절차 소스로 전환" }));
    fireEvent.click(screen.getByTestId("package-unsaved-save-first"));
    expect(ui.getState().inspectorTab).toBe("export");
    expect(store.dispatched).toEqual([]);

    // 4) '변경 유지하고 전환' 선택 시 의도한 모델 전환을 실행하고 페인트 데이터도 손실되지 않는다
    fireEvent.click(screen.getByRole("button", { name: "남성 베이스" }));
    fireEvent.click(screen.getByTestId("package-unsaved-confirm-switch"));
    await waitFor(() => expect(store.dispatched).toHaveLength(1));
    expect(store.dispatched[0]?.type === "source/set" && store.dispatched[0].source).toEqual({
      kind: "kit",
      kitId: KIT_DEFAULT_ID,
      baseId: "male",
      kitVersion: KIT_CURRENT_VERSION,
    });
    expect(paint.sublayersForExport()).toHaveLength(1);

    // 5) "레시피 저장" 완료 체크포인트를 기록하면 이후 전환 시에는 보호창 없이 바로 전환된다
    markCharacterWorkSaved(store, store.getState().recipe, paint);
    fireEvent.click(screen.getByRole("button", { name: "절차 소스로 전환" }));
    expect(screen.queryByTestId("package-unsaved-guard")).toBeNull();
    expect(store.dispatched).toHaveLength(2);
  });

  it("엔진 reloadSource가 실패하면 source/set을 보내지 않고 applyLoop.retrySource()를 호출해 기존 캐릭터를 복구하며 연속 클릭을 중복 실행하지 않는다", async () => {
    const base = fsLoader();
    let loadCalls = 0;
    let resolveLoad!: (res: Awaited<ReturnType<PackagePanelLoader["loadPackage"]>>) => void;
    const controlledLoader: PackagePanelLoader = {
      loadIndex: () => base.loadIndex(),
      loadPackage: () => {
        loadCalls += 1;
        return new Promise((resolve) => {
          resolveLoad = resolve;
        });
      },
    };

    const indexRes = await base.loadIndex();
    if (!indexRes.ok) throw new Error("index fixture failed");
    const orionEntry = indexRes.entries.find((e) => e.characterId === "avatar-orion-authored");
    if (!orionEntry) throw new Error("orion entry missing");
    const realOrion = await base.loadPackage(orionEntry, {});

    const loop = fakeApplyLoop();
    const engineSession = createMockEngineSession(readyEngineStatus());
    const brokenEngine = createMockEngine();
    brokenEngine.loadSource = async () => {
      throw failVisible("engine-glb-corrupt", "손상된 GLB 버퍼로 리그 생성에 실패했습니다.", undefined, 400);
    };
    engineSession.setEngine(brokenEngine);

    const store = createMockLabStore({ recipe: createKitDefaultRecipe(), engine: readyEngineStatus() });
    render(
      <MockLabProvider store={store} engineSession={engineSession} shell={{ applyLoop: loop, kitPlans: fakeKitRegistry() }}>
        <PackagePanel loader={controlledLoader} autoLoadKit={false} now={() => 400} />
      </MockLabProvider>,
    );

    const loadBtn = await screen.findByRole("button", { name: "Avatar Orion · Authored Toon 불러오기" });
    // 동일 틱 연속 클릭 3회 → loadPackage는 정확히 1회만 호출된다
    fireEvent.click(loadBtn);
    fireEvent.click(loadBtn);
    fireEvent.click(loadBtn);
    expect(loadCalls).toBe(1);

    await act(async () => {
      resolveLoad(realOrion);
    });

    await waitFor(() => expect(screen.getByText(/engine-glb-corrupt/u)).toBeTruthy());
    expect(loop.retries).toBe(1);
    expect(store.dispatched).toEqual([]);
  });
});
