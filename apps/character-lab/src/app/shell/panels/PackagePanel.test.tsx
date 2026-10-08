// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, KIT_CURRENT_VERSION, KIT_DEFAULT_ID, createKitDefaultRecipe, createPresetCatalog, failVisible } from "../../../contracts";
import { deriveKitCapabilities } from "../../../domains/authored/kit-capability";
import { buildKitPlanDetailed } from "../../../domains/authored/kit-plan";
import { loadAuthoredPackageFlow, loadPackageIndexFlow } from "../../../domains/authored/package-load-flow";
import { APPEARANCE_PRESETS } from "../../../presets";
import { kitManifestFixture } from "../../../testing/kit-fixtures";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession, createMockLabStore } from "../../../testing/mock-store";
import { createKitPlanRegistry } from "../kit-plan-registry";
import { createPackagePlanRegistry } from "../package-plan-registry";

import { PackagePanel } from "./PackagePanel";

import type { PackagePanelLoader } from "./PackagePanel";
import type { LabFailure, LabState } from "../../../contracts";
import type { PackageFetchPort } from "../../../domains/authored/package-load-flow";
import type { ApplyLoop } from "../apply-loop";
import type { KitManifestRequest, KitPlanRegistry } from "../kit-plan-registry";

/**
 * jsdom 환경(web transform)에서는 `import.meta.url`이 `http://localhost/<vite root 상대 경로>`라 fileURLToPath를 쓸 수 없다.
 * file: 스킴이면 그대로 쓰고, 아니면 cwd(루트 설정 = 저장소 루트, 앱 로컬 설정 = apps/character-lab) 기준 후보 중 존재하는 디렉터리를 고른다.
 */
function resolveAssetRoot(): string {
  const metaUrl = new URL(import.meta.url);
  if (metaUrl.protocol === "file:") return fileURLToPath(new URL("../../../../public/assets/characters/", metaUrl));
  const candidates = [path.resolve(process.cwd(), "public/assets/characters"), path.resolve(process.cwd(), "apps/character-lab/public/assets/characters")];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`제작 패키지 디렉터리(public/assets/characters)를 찾지 못했습니다(cwd ${process.cwd()}).`);
  return `${found}${path.sep}`;
}

const ASSET_ROOT = resolveAssetRoot();
const URL_PREFIX = "/assets/characters/";
const ORION_SHA = "7a2bfd8d2a8a3f54395162ba44f4249259d9c8bdd826a619bc0090c040cd06ed";

function fsPort(): PackageFetchPort {
  const resolve = (url: string): string => `${ASSET_ROOT}${url.slice(URL_PREFIX.length)}`;
  return {
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
}

const nodeSha256 = async (bytes: Uint8Array): Promise<string> => createHash("sha256").update(bytes).digest("hex");

function fsLoader(sha256 = nodeSha256): PackagePanelLoader {
  const port = fsPort();
  return {
    loadIndex: () => loadPackageIndexFlow(port, undefined, 1),
    loadPackage: (entry, options) => loadAuthoredPackageFlow(port, entry, { sha256, preferredLod: options.preferredLod, now: 1 }),
  };
}

afterEach(cleanup);

describe("PackagePanel", () => {
  it("실제 index.json을 읽어 2개 패키지를 나열하고 Orion을 끝까지 불러와 source/set을 dispatch한다", async () => {
    const store = createMockLabStore();
    const packagePlans = createPackagePlanRegistry();
    render(
      <MockLabProvider store={store} shell={{ packagePlans }}>
        <PackagePanel loader={fsLoader()} now={() => 1} />
      </MockLabProvider>,
    );
    expect(screen.getByRole("status").textContent).toMatch(/절차적 휴머노이드/u);
    await screen.findByText("Avatar Orion · Authored Toon");
    expect(screen.getByText("ToonStudio Reference Character")).toBeTruthy();
    expect(screen.getByText("주 캐릭터")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Avatar Orion · Authored Toon 불러오기" }));
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy(), { timeout: 15000 });

    const sourceSet = store.dispatched.find((command) => command.type === "source/set");
    expect(sourceSet).toBeDefined();
    if (sourceSet?.type === "source/set" && sourceSet.source.kind === "package") {
      expect(sourceSet.source.characterId).toBe("avatar-orion-authored");
      expect(sourceSet.source.sha256).toBe(ORION_SHA);
      expect(sourceSet.capabilities.ears.status).toBe("partial");
      expect(sourceSet.capabilities.pose.status).toBe("available");
    } else {
      throw new Error("source/set(package) 없음");
    }
    expect(packagePlans.get("avatar-orion-authored")?.glbSha256).toBe(ORION_SHA);
    expect(store.events.filter((event) => event.type === "failure")).toEqual([]);

    const statuses = screen.getAllByRole("status").map((node) => node.textContent ?? "");
    expect(statuses.some((text) => text.includes("플랜을 등록했습니다") && text.includes(ORION_SHA.slice(0, 12)))).toBe(true);
    const earsRow = document.querySelector('tr[data-slot="ears"]');
    expect(earsRow?.textContent).toMatch(/부분 지원/u);
    expect(earsRow?.textContent).toMatch(/선언 \(규칙 판정: 지원\)/u);
    const poseRow = document.querySelector('tr[data-slot="pose"]');
    expect(poseRow?.textContent).toMatch(/지원/u);
    expect(screen.getByText(/불일치 2개/u)).toBeTruthy();
    expect(screen.getByText(/GLB에 VRM 확장 없음/u)).toBeTruthy();
    expect(screen.getByText(/필수 15\/15 · 손가락 30\/30/u)).toBeTruthy();
    expect(screen.getByText(/패키지 격차 \d+개/u)).toBeTruthy();
  }, 30000);

  it("엔진이 있으면 reloadSource로 올리고 '절차 소스로 돌아가기'는 procedural source/set을 보낸다", async () => {
    const store = createMockLabStore({ recipe: { ...createMockLabStore().getState().recipe, source: { kind: "package", characterId: "avatar-orion-authored", sha256: ORION_SHA } } });
    const engineSession = createMockEngineSession({ phase: "ready", backend: "webgpu", diagnostics: createMockEngine().diagnostics });
    const engine = createMockEngine();
    engineSession.setEngine(engine);
    render(
      <MockLabProvider store={store} engineSession={engineSession}>
        <PackagePanel loader={fsLoader()} now={() => 1} />
      </MockLabProvider>,
    );
    expect(screen.getByText(/현재 소스: 제작 패키지 avatar-orion-authored/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "절차 소스로 돌아가기" }));
    expect(store.dispatched[0]).toEqual({ type: "source/set", source: { kind: "procedural" }, capabilities: ALL_AVAILABLE_CAPABILITIES });

    await screen.findByText("ToonStudio Reference Character");
    fireEvent.click(screen.getByRole("button", { name: "ToonStudio Reference Character 불러오기" }));
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy(), { timeout: 15000 });
    expect(engine.calls.some((call) => call.method === "loadSource")).toBe(true);
    expect(screen.getAllByRole("status").some((node) => (node.textContent ?? "").includes("엔진에 올렸습니다"))).toBe(true);
    const sourceSet = store.dispatched.find((command) => command.type === "source/set" && command.source.kind === "package");
    expect(sourceSet?.type === "source/set" && sourceSet.source.kind === "package" && sourceSet.source.characterId).toBe("reference-character");
  }, 30000);

  it("index 404·SHA 불일치는 사유를 그대로 보여 주고 source/set을 보내지 않는다", async () => {
    const store = createMockLabStore();
    const failing: PackagePanelLoader = {
      loadIndex: async () => ({ ok: false, failure: failVisible("package-index-missing", "등록된 제작 패키지가 없습니다(index.json 없음).", undefined, 1) }),
      loadPackage: async () => Promise.reject(new Error("unused")),
    };
    const { unmount } = render(
      <MockLabProvider store={store}>
        <PackagePanel loader={failing} />
      </MockLabProvider>,
    );
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/등록된 제작 패키지가 없습니다/u);
    expect(store.events.some((event) => event.type === "failure" && event.failure.code === "package-index-missing")).toBe(true);
    unmount();

    const store2 = createMockLabStore();
    render(
      <MockLabProvider store={store2}>
        <PackagePanel loader={fsLoader(async () => "f".repeat(64))} />
      </MockLabProvider>,
    );
    await screen.findByText("Avatar Orion · Authored Toon");
    fireEvent.click(screen.getByRole("button", { name: "Avatar Orion · Authored Toon 불러오기" }));
    await screen.findByRole("alert", undefined, { timeout: 15000 });
    expect(screen.getByRole("alert").textContent).toMatch(/GLB SHA-256이 manifest와 다릅니다/u);
    expect(store2.dispatched.filter((command) => command.type === "source/set")).toEqual([]);
    expect(screen.queryByRole("table")).toBeNull();
  }, 30000);
});

// ---------------------------------------------------------------- 모듈식 키트

interface FakeKit {
  readonly calls: KitManifestRequest[];
  /** 패널이 `useKitPlans()`로 받는 실제 등록소(로더만 가짜) */
  readonly registry: KitPlanRegistry;
}

/** 합성 kit.json을 돌려주는 키트 등록소(로더 요청을 기록한다). `failure`를 주면 그 실패를 돌려준다. */
function fakeKit(options: { readonly failure?: LabFailure; readonly male?: boolean } = {}): FakeKit {
  const manifest = kitManifestFixture(options.male === false ? { male: false } : {});
  const calls: KitManifestRequest[] = [];
  const registry = createKitPlanRegistry({
    async loadManifest(request) {
      calls.push(request);
      if (options.failure) return { ok: false, failure: options.failure };
      return { ok: true, manifest, rootUrl: "/assets/characters/toonstudio-kit-v1" };
    },
    buildPlan: buildKitPlanDetailed,
    now: () => 1,
  });
  return { calls, registry };
}

interface FakeLoop extends ApplyLoop {
  readonly retries: number;
  setSettled(value: boolean): void;
}

function fakeApplyLoop(settled = false): FakeLoop {
  let retries = 0;
  let isSettled = settled;
  // useSyncExternalStore가 요구하는 안정 참조(호출마다 새 객체를 돌려주면 무한 렌더가 된다)
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
    settled: () => isSettled,
    subscribe: () => () => undefined,
  };
  return Object.defineProperties(loop, {
    retries: { get: () => retries },
    setSettled: { value: (value: boolean) => void (isSettled = value) },
  }) as FakeLoop;
}

const kitRecipe = (): LabState["recipe"] => createKitDefaultRecipe();
const kitCatalog = () => createPresetCatalog(APPEARANCE_PRESETS);
const readyEngine = (): LabState["engine"] => ({ phase: "ready", backend: "webgpu", diagnostics: createMockEngine().diagnostics });

describe("PackagePanel — 모듈식 키트", () => {
  it("키트 소스면 kit.json을 받아 현재 소스·출처·라이선스·베이스별 제공 파츠를 보인다", async () => {
    const loader = fakeKit();
    const store = createMockLabStore({ recipe: kitRecipe() });
    render(
      <MockLabProvider store={store} shell={{ kitPlans: loader.registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} now={() => 100} />
      </MockLabProvider>,
    );
    expect(screen.getAllByRole("status")[0]?.textContent).toMatch(/현재 소스: 모듈식 키트 toonstudio-kit-v1 v1 \(여성 베이스\)/u);
    await screen.findByLabelText("출처와 라이선스");
    expect(loader.calls).toEqual([{ kitId: KIT_DEFAULT_ID, kitVersion: KIT_CURRENT_VERSION }]);
    const sources = screen.getByLabelText("출처와 라이선스");
    expect(within(sources).getByText("Blender Foundation Human Base Meshes Bundle")).toBeTruthy();
    expect(sources.textContent).toMatch(/라이선스 CC0-1\.0 · 파생물/u);
    expect(sources.textContent).toMatch(/변경 내용: 멀티레스 레벨 1 적용/u);
    expect(sources.textContent).toMatch(/내려받은 곳: https:\/\/download\.blender\.org/u);
    expect(sources.textContent).toMatch(/원본 SHA-256 811f43accbb3/u);
    expect(sources.textContent).toMatch(/라이선스 original · 원본 디자인/u);
    expect(screen.getByText(/출처 고지 파일: NOTICE\.md/u)).toBeTruthy();
    expect(screen.getByText(/joint 68개/u)).toBeTruthy();
    const hair = document.querySelector('tr[data-slot="hair"]');
    expect(hair?.querySelector('td[data-base="female"]')?.textContent).toBe("7/7");
    expect(hair?.querySelector('td[data-base="male"]')?.textContent).toBe("1/7");
    expect(hair?.querySelector('td[data-base="male"]')?.getAttribute("title")).toMatch(/hair\/twin-tail: 남성 핏 미제작/u);
    expect(document.querySelector('tr[data-slot="accessory"] td[data-base="male"]')?.textContent).toBe("0/6");
    expect(store.dispatched).toEqual([]);
  });

  it("등록소에 이미 받아 둔 manifest는 패널이 다시 요청하지 않고 출처·라이선스(요약 + 라이선스 목록)를 보인다", async () => {
    const kit = fakeKit();
    const recipe = kitRecipe();
    if (recipe.source.kind !== "kit") throw new Error("키트 부팅 레시피가 아닙니다.");
    await kit.registry.ensure(recipe.source);
    expect(kit.calls).toHaveLength(1);
    render(
      <MockLabProvider store={createMockLabStore({ recipe })} shell={{ kitPlans: kit.registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} autoLoadKit={false} now={() => 100} />
      </MockLabProvider>,
    );
    // 자동 로드를 끄면 요청이 없고, 등록소에 있는 manifest는 즉시 그려진다
    expect(screen.getByLabelText("출처와 라이선스")).toBeTruthy();
    expect(kit.calls).toHaveLength(1);
    const licenseRow = [...document.querySelectorAll(".cl-package-kit-provenance dt")].find((node) => node.textContent === "라이선스");
    expect(licenseRow?.nextElementSibling?.textContent).toMatch(/\(라이선스: CC0-1\.0, original\)$/u);
  });

  it("키트 등록소가 조립되지 않았으면(null) 사유를 보이고 베이스를 골라도 source/set을 보내지 않는다", async () => {
    const store = createMockLabStore();
    render(
      <MockLabProvider store={store}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} now={() => 100} />
      </MockLabProvider>,
    );
    expect(screen.getByText(/키트 등록소가 조립되지 않아 출처·제공 파츠 정보를 불러올 수 없습니다/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "여성 베이스" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/\(kit-loader-unavailable\)/u);
    expect(store.dispatched).toEqual([]);
    expect(store.events.some((event) => event.type === "failure" && event.failure.code === "kit-loader-unavailable")).toBe(true);
  });

  it("베이스를 고르면 그 베이스의 능력 맵과 함께 kit 소스를 source/set으로 보낸다(엔진 로드는 적용 루프가 한다)", async () => {
    const loader = fakeKit();
    const store = createMockLabStore({ recipe: kitRecipe() });
    render(
      <MockLabProvider store={store} shell={{ kitPlans: loader.registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} now={() => 100} />
      </MockLabProvider>,
    );
    await screen.findByLabelText("출처와 라이선스");
    expect((screen.getByRole("button", { name: "여성 베이스" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "여성 베이스" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "남성 베이스" }));
    await waitFor(() => expect(store.dispatched).toHaveLength(1));
    const command = store.dispatched[0];
    expect(command?.type).toBe("source/set");
    if (command?.type !== "source/set") throw new Error("source/set 없음");
    expect(command.source).toEqual({ kind: "kit", kitId: KIT_DEFAULT_ID, baseId: "male", kitVersion: KIT_CURRENT_VERSION });
    expect(command.capabilities).toEqual(deriveKitCapabilities(kitManifestFixture(), "male"));
    // 남성 베이스는 필수 파츠만 있어 헤어는 부분 지원이고 미제공 프리셋 목록을 싣는다
    expect(command.capabilities.hair.status).toBe("partial");
    expect(command.capabilities.hair.unavailablePresets?.["hair/twin-tail"]).toBe("남성 핏 미제작");
    expect(store.events.filter((event) => event.type === "failure")).toEqual([]);
    // 패널은 엔진을 직접 건드리지 않는다
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("레시피에 고정된 manifestSha256은 베이스를 바꿔도 유지한다", async () => {
    const loader = fakeKit();
    const sha = "a".repeat(64);
    const base = kitRecipe();
    const store = createMockLabStore({ recipe: { ...base, source: { kind: "kit", kitId: KIT_DEFAULT_ID, baseId: "female", kitVersion: KIT_CURRENT_VERSION, manifestSha256: sha } } });
    render(
      <MockLabProvider store={store} shell={{ kitPlans: loader.registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} now={() => 100} />
      </MockLabProvider>,
    );
    await screen.findByLabelText("출처와 라이선스");
    expect(loader.calls[0]?.manifestSha256).toBe(sha);
    fireEvent.click(screen.getByRole("button", { name: "남성 베이스" }));
    await waitFor(() => expect(store.dispatched).toHaveLength(1));
    const command = store.dispatched[0];
    expect(command?.type === "source/set" && command.source.kind === "kit" && command.source.manifestSha256).toBe(sha);
  });

  it("고르려는 베이스가 현재 선택을 제공하지 않으면 바꾸지 않고 사유를 보이며 다른 프리셋으로 대체하지 않는다", async () => {
    const loader = fakeKit();
    const base = kitRecipe();
    const recipe = { ...base, slots: { ...base.slots, hair: "hair/twin-tail" as const, accessory: "accessory/glasses" as const } };
    const store = createMockLabStore({ recipe });
    render(
      <MockLabProvider store={store} catalog={kitCatalog()} shell={{ kitPlans: loader.registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} now={() => 100} />
      </MockLabProvider>,
    );
    await screen.findByLabelText("출처와 라이선스");
    fireEvent.click(screen.getByRole("button", { name: "남성 베이스" }));
    const notice = await screen.findByText(/남성 베이스로 바꾸지 못했습니다/u);
    expect(notice.textContent).toMatch(/헤어 트윈테일: 남성 핏 미제작/u);
    expect(notice.textContent).toMatch(/액세서리 안경: /u);
    expect(notice.textContent).toMatch(/자동으로 바꾸지 않습니다/u);
    expect(store.dispatched).toEqual([]);
    // 현재 선택을 제공하는 베이스(여성)는 영향을 받지 않는다
    expect(store.getState().recipe.slots.hair).toBe("hair/twin-tail");
  });

  it("절차 소스에서 베이스를 고르면 kit.json을 받아 kit 소스로 전환한다(키트 정보는 그때 불러온다)", async () => {
    const loader = fakeKit();
    const store = createMockLabStore();
    render(
      <MockLabProvider store={store} shell={{ kitPlans: loader.registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} now={() => 100} />
      </MockLabProvider>,
    );
    expect(loader.calls).toEqual([]);
    expect(screen.getByRole("status").textContent).toMatch(/절차적 휴머노이드\(키트가 아닌 대체 소스\)/u);
    expect(screen.getByText(/키트 정보\(출처·제공 파츠\)는 베이스를 고르면 불러옵니다/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "절차 소스로 전환" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "여성 베이스" }));
    await waitFor(() => expect(store.dispatched).toHaveLength(1));
    expect(loader.calls).toEqual([{ kitId: KIT_DEFAULT_ID, kitVersion: KIT_CURRENT_VERSION }]);
    const command = store.dispatched[0];
    expect(command?.type === "source/set" && command.source).toEqual({ kind: "kit", kitId: KIT_DEFAULT_ID, baseId: "female", kitVersion: KIT_CURRENT_VERSION });
  });

  it("kit.json을 못 받으면 사유를 그대로 보이고 source/set을 보내지 않으며 절차 소스로 바꾸지 않는다", async () => {
    const failure = failVisible("kit-manifest-fetch-failed", "키트 manifest(kit.json)를 불러오지 못했습니다(404): /assets/characters/toonstudio-kit-v1/kit.json", undefined, 100);
    const loader = fakeKit({ failure });
    const store = createMockLabStore();
    render(
      <MockLabProvider store={store} shell={{ kitPlans: loader.registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} now={() => 100} />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "남성 베이스" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/kit\.json\)를 불러오지 못했습니다\(404\).*\(kit-manifest-fetch-failed\)/u);
    expect(store.dispatched).toEqual([]);
    expect(store.events.some((event) => event.type === "failure" && event.failure.code === "kit-manifest-fetch-failed")).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/절차적 휴머노이드/u);
  });

  it("현재 소스가 키트일 때 kit.json 로드 실패는 패널에만 보이고 같은 실패를 이중으로 쌓지 않는다", async () => {
    const failure = failVisible("kit-version-mismatch", "레시피의 키트 버전(1)이 불러온 키트 버전(2)과 다릅니다.", undefined, 100);
    const store = createMockLabStore({ recipe: kitRecipe(), failures: [failure] });
    render(
      <MockLabProvider store={store} shell={{ kitPlans: fakeKit({ failure }).registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} now={() => 5} />
      </MockLabProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    // 적용 루프가 올린 실패와 패널이 받은 실패가 같으면 한 번만 보인다
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toMatch(/키트 버전\(1\)이 불러온 키트 버전\(2\)과 다릅니다.*\(kit-version-mismatch\)/u);
    expect(store.events).toEqual([]);
  });

  it("키트 다시 불러오기는 적용 루프 retrySource와 kit.json 재요청을 하고 지난 실패를 숨긴다", async () => {
    const loader = fakeKit();
    const loop = fakeApplyLoop(false);
    const failure = failVisible("kit-part-missing", "프리셋 hair/soft-bob은(는) female 베이스용 변형이 없습니다.", undefined, 50);
    const store = createMockLabStore({ recipe: kitRecipe(), failures: [failure], engine: readyEngine() });
    render(
      <MockLabProvider store={store} shell={{ applyLoop: loop, kitPlans: loader.registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} now={() => 100} />
      </MockLabProvider>,
    );
    await screen.findByLabelText("출처와 라이선스");
    expect(screen.getByRole("alert").textContent).toMatch(/hair\/soft-bob은\(는\) female 베이스용 변형이 없습니다.*\(kit-part-missing\)/u);
    expect(screen.queryByText(/키트를 불러오는 중/u)).toBeNull();
    expect(loader.calls).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "키트 다시 불러오기" }));
    expect(loop.retries).toBe(1);
    await waitFor(() => expect(loader.calls).toHaveLength(2));
    expect(screen.queryByRole("alert")).toBeNull();
    // 다시 불러오는 동안은 진행 표시를 보인다
    expect(screen.getByText(/키트를 불러오는 중/u)).toBeTruthy();
  });

  it("다시 불러오기는 키트 소스가 아니거나 적용 루프가 없으면 비활성이다", () => {
    const { unmount } = render(
      <MockLabProvider store={createMockLabStore()} shell={{ applyLoop: fakeApplyLoop(), kitPlans: fakeKit().registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} />
      </MockLabProvider>,
    );
    expect((screen.getByRole("button", { name: "키트 다시 불러오기" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    render(
      <MockLabProvider store={createMockLabStore({ recipe: kitRecipe() })} shell={{ kitPlans: fakeKit().registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} autoLoadKit={false} />
      </MockLabProvider>,
    );
    expect((screen.getByRole("button", { name: "키트 다시 불러오기" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("엔진 준비 여부와 적용 루프 상태에 따라 안내·진행·완료 문구를 보인다", async () => {
    const loop = fakeApplyLoop(false);
    const store = createMockLabStore({ recipe: kitRecipe() });
    render(
      <MockLabProvider store={store} shell={{ applyLoop: loop, kitPlans: fakeKit().registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} autoLoadKit={false} now={() => 100} />
      </MockLabProvider>,
    );
    expect(screen.getByText(/엔진을 고르면 베이스·선택 파츠\(GLB\)를 받아 올립니다/u)).toBeTruthy();
    expect(screen.queryByText(/키트를 불러오는 중/u)).toBeNull();
    act(() => store.setState({ engine: readyEngine() }));
    expect(screen.getByText(/키트를 불러오는 중/u)).toBeTruthy();
    expect(screen.queryByText(/엔진을 고르면/u)).toBeNull();
    loop.setSettled(true);
    act(() => store.setState({ engine: readyEngine() }));
    expect(screen.getByText("키트를 엔진에 올렸습니다.")).toBeTruthy();
    expect(screen.queryByText(/키트를 불러오는 중/u)).toBeNull();
  });

  it("엔진에 올라간 키트에는 지난 실패를 보이지 않고, 올라가지 못했으면 마지막 실패를 보인다", () => {
    const failure = failVisible("kit-sha-mismatch", "GLB SHA-256이 계획과 다릅니다.", undefined, 50);
    const loop = fakeApplyLoop(true);
    const store = createMockLabStore({ recipe: kitRecipe(), failures: [failure], engine: readyEngine() });
    render(
      <MockLabProvider store={store} shell={{ applyLoop: loop, kitPlans: fakeKit().registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} autoLoadKit={false} now={() => 100} />
      </MockLabProvider>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => {
      loop.setSettled(false);
      store.setState({ failures: [failure] });
    });
    expect(screen.getByRole("alert").textContent).toMatch(/GLB SHA-256이 계획과 다릅니다.*\(kit-sha-mismatch\)/u);
    expect(screen.queryByText(/키트를 불러오는 중/u)).toBeNull();
  });

  it("키트 소스에서는 '절차 소스로 전환'이 대체 휴머노이드임을 밝히고 procedural source/set을 보낸다", () => {
    const store = createMockLabStore({ recipe: kitRecipe() });
    render(
      <MockLabProvider store={store} shell={{ kitPlans: fakeKit().registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} autoLoadKit={false} now={() => 100} />
      </MockLabProvider>,
    );
    expect(screen.getByText(/절차 소스는 키트가 아닌 대체 휴머노이드입니다\. 키트 로드가 실패해도 자동으로 바뀌지 않으며/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "절차 소스로 돌아가기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "절차 소스로 전환" }));
    expect(store.dispatched).toEqual([{ type: "source/set", source: { kind: "procedural" }, capabilities: ALL_AVAILABLE_CAPABILITIES }]);
  });

  it("남성 베이스가 없는 키트는 남성 버튼을 비활성으로 두고 사유를 툴팁으로 보인다", async () => {
    const store = createMockLabStore({ recipe: kitRecipe() });
    render(
      <MockLabProvider store={store} shell={{ kitPlans: fakeKit({ male: false }).registry }}>
        <PackagePanel loader={fsLoader()} autoLoadIndex={false} now={() => 100} />
      </MockLabProvider>,
    );
    await screen.findByLabelText("출처와 라이선스");
    const male = screen.getByRole("button", { name: "남성 베이스" }) as HTMLButtonElement;
    expect(male.disabled).toBe(true);
    expect(male.title).toMatch(/해당 베이스가 없습니다/u);
    expect(document.querySelector('td[data-base="male"]')).toBeNull();
  });
});
