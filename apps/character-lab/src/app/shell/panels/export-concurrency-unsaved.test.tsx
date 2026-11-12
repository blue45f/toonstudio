// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PERFORMANCE_PRESETS } from "../../../animation/presets";
import {
  ALL_AVAILABLE_CAPABILITIES,
  createDefaultRecipe,
  createKitDefaultRecipe,
  createPresetCatalog,
  failVisible,
} from "../../../contracts";
import { serializeRecipeFile } from "../../../export/recipe-file";
import { createPaintSession } from "../../../paint/paint-session";
import { APPEARANCE_PRESETS } from "../../../presets";
import { createLabStore } from "../../../state/lab-store";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";
import { createPackagePlanRegistry } from "../package-plan-registry";
import { hasUnsavedCharacterWork } from "../unsaved-work";

import { ExportPanel } from "./ExportPanel";

import type { ExportPanelDeps } from "./ExportPanel";
import type { AuthoredPackagePlan, EngineStatus } from "../../../contracts";

afterEach(cleanup);

const READY_STATUS: EngineStatus = {
  phase: "ready",
  backend: "webgpu",
  diagnostics: createMockEngine().diagnostics,
};

function createRealHarness() {
  const catalog = createPresetCatalog([...APPEARANCE_PRESETS, ...PERFORMANCE_PRESETS]);
  const store = createLabStore({
    catalog,
    initial: {
      recipe: createKitDefaultRecipe(),
      capabilities: ALL_AVAILABLE_CAPABILITIES,
      engine: READY_STATUS,
    },
    now: () => 500,
  });
  const engine = createMockEngine();
  const engineSession = createMockEngineSession(READY_STATUS);
  engineSession.setEngine(engine);
  const packagePlans = createPackagePlanRegistry();
  const session = createPaintSession({ layerSize: 16 });
  const savedFiles: Array<{ readonly fileName: string; readonly bytes: Uint8Array; readonly mime: string }> = [];
  const save: NonNullable<ExportPanelDeps["save"]> = (fileName, bytes, mime) => {
    savedFiles.push({ fileName, bytes, mime });
    return { ok: true };
  };
  return { catalog, store, engine, engineSession, packagePlans, session, savedFiles, save };
}

describe("ExportPanel — 연속 클릭 중복 차단 · 컷별 진행률 · 실패 후 재시도 · 미저장 덮어쓰기 복구", () => {
  it("2×2 설정시트 버튼 연속 클릭 및 Ctrl+Shift+Q 단축키 연타 시 단일 실행만 수행하고 컷별(1/4~4/4) 진행률을 표시한다", async () => {
    const h = createRealHarness();
    const baseRender = h.engine.renderPasses.bind(h.engine);
    const resolvers: Array<() => void> = [];
    h.engine.renderPasses = async (req) => {
      await new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
      return baseRender(req);
    };

    render(
      <MockLabProvider store={h.store} catalog={h.catalog} engineSession={h.engineSession} shell={{ packagePlans: h.packagePlans }}>
        <ExportPanel session={h.session} deps={{ save: h.save, now: () => 1000 }} />
      </MockLabProvider>,
    );

    const quadBtn = screen.getByTestId("export-quad-sheet-png");
    const pngBtn = screen.getByRole("button", { name: "투명 PNG 저장" });

    // 동일 틱 안에서 2×2 버튼 3연타 + 단일 PNG 클릭 + 단축키 Ctrl+Shift+Q 2연타 발생
    fireEvent.click(quadBtn);
    fireEvent.click(quadBtn);
    fireEvent.click(quadBtn);
    fireEvent.click(pngBtn);
    fireEvent.keyDown(quadBtn, { key: "Q", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(quadBtn, { key: "q", metaKey: true, shiftKey: true });

    // 첫 번째 캡처(1/4 · 전신 0° 정면)만 진입했어야 한다
    expect(resolvers).toHaveLength(1);
    expect(screen.getByTestId("export-progress").textContent).toContain("1/4 · 전신 0° 정면");

    // 1/4 → 2/4 → 3/4 → 4/4 순차 진행 확인
    await act(async () => {
      resolvers[0]?.();
    });
    expect(resolvers).toHaveLength(2);
    expect(screen.getByTestId("export-progress").textContent).toContain("2/4 · 전신 35° 반측면");

    await act(async () => {
      resolvers[1]?.();
    });
    expect(resolvers).toHaveLength(3);
    expect(screen.getByTestId("export-progress").textContent).toContain("3/4 · 상반신 바스트컷");

    await act(async () => {
      resolvers[2]?.();
    });
    expect(resolvers).toHaveLength(4);
    expect(screen.getByTestId("export-progress").textContent).toContain("4/4 · 얼굴 클로즈업");

    await act(async () => {
      resolvers[3]?.();
    });

    await waitFor(() => expect(screen.getByTestId("export-receipt")).toBeTruthy());
    // 중복 파일 저장 없이 정확히 1개의 2×2 설정시트만 저장되었다
    expect(h.savedFiles).toHaveLength(1);
    expect(h.savedFiles[0]?.fileName).toMatch(/-quad-sheet\.png$/u);
    expect(screen.queryByTestId("export-progress")).toBeNull();
  });

  it("내보내기 실패 시 이전 안내 문구를 정리하고, 원인 해결 후 '다시 시도' 버튼으로 최신 설정을 반영해 정상 저장한다", async () => {
    const h = createRealHarness();
    let shouldFailCapture = false;
    const baseRender = h.engine.renderPasses.bind(h.engine);
    h.engine.renderPasses = async (req) => {
      if (shouldFailCapture) {
        throw failVisible("gpu-context-transient", "일시적 GPU 컨텍스트 지연으로 캡처에 실패했습니다.", undefined, 1200);
      }
      return baseRender(req);
    };

    render(
      <MockLabProvider store={h.store} catalog={h.catalog} engineSession={h.engineSession} shell={{ packagePlans: h.packagePlans }}>
        <ExportPanel session={h.session} deps={{ save: h.save, now: () => 1200 }} />
      </MockLabProvider>,
    );

    // 1) 먼저 2500×2500으로 2×2 설정시트를 내보내 자동 축소 안내(notices)가 표시된 상태를 만든다
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "2500" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "2500" } });
    fireEvent.click(screen.getByTestId("export-quad-sheet-png"));
    await waitFor(() => expect(screen.getByLabelText("레시피 불러오기 안내")).toBeTruthy());
    expect(h.savedFiles).toHaveLength(1);

    // 2) 다음 2×2 캡처가 실패하면 이전 성공 영수증과 이전 축소 안내(notices)가 함께 지워지고 실패 알림 + 다시 시도 버튼이 나타난다
    shouldFailCapture = true;
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "800" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "1200" } });
    fireEvent.click(screen.getByTestId("export-quad-sheet-png"));

    const alert = await screen.findByTestId("export-failure-alert");
    expect(alert.textContent).toContain("gpu-context-transient");
    expect(screen.queryByLabelText("레시피 불러오기 안내")).toBeNull();
    expect(screen.queryByTestId("export-receipt")).toBeNull();

    const retryBtn = screen.getByTestId("export-retry-last-action");
    expect(retryBtn.textContent).toContain("2×2 종합 설정시트 PNG 저장 다시 시도");

    // 3) 원인이 해소된 뒤 '다시 시도' 클릭 시 변경된 800×1200(전체 1600×2400) 해상도로 정상 내보낸다
    shouldFailCapture = false;
    fireEvent.click(retryBtn);

    await waitFor(() => expect(screen.getByTestId("export-receipt")).toBeTruthy());
    expect(screen.queryByTestId("export-failure-alert")).toBeNull();
    expect(screen.queryByTestId("export-retry-last-action")).toBeNull();
    expect(h.savedFiles).toHaveLength(2);
    expect(h.savedFiles[1]?.fileName).toContain("1600x2400-quad-sheet.png");
  });

  it("미로드 패키지 레시피 불러오기 실패 시 원본을 보존하고, 패키지 등록 후 파일 재선택 없이 '다시 시도'만으로 불러오기를 완료한다", async () => {
    const h = createRealHarness();
    h.store.dispatch({ type: "color/set", key: "skin", value: "#d9a98c" });

    const pkgSha = "b".repeat(64);
    const pkgRecipe = {
      ...createDefaultRecipe(),
      source: { kind: "package" as const, characterId: "hero-hunter", sha256: pkgSha },
      colors: { ...createDefaultRecipe().colors, hair: "#1a2438" },
    };
    const fileText = await serializeRecipeFile(pkgRecipe, []);
    const file = new File([fileText], "hero-hunter.character.json", { type: "application/json" });

    render(
      <MockLabProvider store={h.store} catalog={h.catalog} engineSession={h.engineSession} shell={{ packagePlans: h.packagePlans }}>
        <ExportPanel session={h.session} deps={{ save: h.save, readFile: async (f) => f.text(), now: () => 1500 }} />
      </MockLabProvider>,
    );

    const input = screen.getByTestId("export-recipe-file-input");
    fireEvent.change(input, { target: { files: [file] } });

    // 패키지 미등록으로 차단되고 현재 피부색(#d9a98c)은 보존된다
    const alert = await screen.findByTestId("export-failure-alert");
    expect(alert.textContent).toContain("package-plan-missing");
    expect(h.store.getState().recipe.colors.skin).toBe("#d9a98c");

    // 패키지를 등록한 뒤 파일을 다시 고르지 않고 '레시피 불러오기 다시 시도'를 클릭하면 성공한다
    const dummyPlan = {
      manifest: { characterId: "hero-hunter" },
      glbSha256: pkgSha,
      capabilities: ALL_AVAILABLE_CAPABILITIES,
    } as unknown as AuthoredPackagePlan;
    h.packagePlans.register(dummyPlan);

    fireEvent.click(screen.getByTestId("export-retry-last-action"));
    await waitFor(() => expect(screen.getByTestId("export-receipt")).toBeTruthy());
    expect(h.store.getState().recipe.source).toEqual({ kind: "package", characterId: "hero-hunter", sha256: pkgSha });
    expect(h.store.getState().recipe.colors.hair).toBe("#1a2438");
  });

  it("미저장 포즈·다중 페인트 작업 위에 새 레시피를 불러오면 이전 작업 백업 배너를 제공하고 1클릭으로 6단 서브레이어까지 복원한다", async () => {
    const h = createRealHarness();
    // 1) 초보 작가가 포즈/색상 변경 + head 서브레이어 L2 페인트 작업 수행 (미저장 상태)
    h.store.dispatch({ type: "color/set", key: "eye", value: "#3366cc" });
    h.session.setActivePart("head");
    h.session.setActiveSublayer(2);
    h.session.setBrush({ color: "#ee4477", radiusPx: 3, opacity: 0.9 });
    h.session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "head");
    h.session.endStroke();
    h.session.setSublayerOpacity("head", 2, 0.75);
    expect(hasUnsavedCharacterWork(h.store, h.store.getState(), h.session)).toBe(true);

    // 2) 다른 레시피 파일을 실수로 불러옴
    const incomingRecipe = {
      ...createKitDefaultRecipe(),
      colors: { ...createKitDefaultRecipe().colors, eye: "#884422" },
    };
    const incomingText = await serializeRecipeFile(incomingRecipe, []);
    const incomingFile = new File([incomingText], "other.character.json", { type: "application/json" });

    render(
      <MockLabProvider store={h.store} catalog={h.catalog} engineSession={h.engineSession} shell={{ packagePlans: h.packagePlans }}>
        <ExportPanel session={h.session} deps={{ save: h.save, readFile: async (f) => f.text(), now: () => 2000 }} />
      </MockLabProvider>,
    );

    fireEvent.change(screen.getByTestId("export-recipe-file-input"), { target: { files: [incomingFile] } });
    await waitFor(() => expect(screen.getByTestId("export-unsaved-backup-banner")).toBeTruthy());
    expect(h.store.getState().recipe.colors.eye).toBe("#884422");
    expect(h.session.sublayersForExport()).toHaveLength(0);

    // 3) '이전 작업으로 되돌리기' 클릭 시 눈 색상(#3366cc)과 head L2 서브레이어(불투명도 0.75 + 픽셀) 및 엔진 텍스처가 즉시 복원된다
    fireEvent.click(screen.getByTestId("export-restore-pre-import"));
    expect(screen.queryByTestId("export-unsaved-backup-banner")).toBeNull();
    expect(h.store.getState().recipe.colors.eye).toBe("#3366cc");
    expect(h.session.sublayersForExport()).toHaveLength(1);
    expect(h.session.getState().sublayers.get("head")?.[2]?.opacity).toBeCloseTo(0.75, 3);
    expect(h.session.getState().sublayers.get("head")?.[2]?.hasPixels).toBe(true);
    expect(h.engine.calls.some((call) => call.method === "updatePaintTexture")).toBe(true);

    // 4) 이후 '레시피 저장'을 실행하면 미저장 상태가 해제된다
    fireEvent.click(screen.getByRole("button", { name: "레시피 저장" }));
    await waitFor(() => expect(h.savedFiles).toHaveLength(1));
    expect(hasUnsavedCharacterWork(h.store, h.store.getState(), h.session)).toBe(false);
  });
});
