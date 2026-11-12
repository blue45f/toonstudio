// @vitest-environment jsdom
/**
 * 레시피 불러오기 무결성·복구·원본 보존 종단 회귀 테스트.
 * - 손상 JSON / 잘린 JSON / 바이너리(GLB·PNG) 오선택 / 원시 JSON 중복 키 / 스키마 중복 ID / 서브레이어 PNG 손상 /
 *   누락 키트 에셋 / 활성 엔진 미등록·해시 불일치 패키지 불러오기 실패 시:
 *   현재 레시피(체형·포즈·색), 다중 페인트 서브레이어(L0~L5 픽셀·숨김·순서·불투명도), Undo/Redo 히스토리, 엔진 텍스처가
 *   100% 그대로 유지되는지 검증한다.
 * - UTF-8 BOM + data:image/png;base64 구버전 인코딩 복구, v1+비표준 부위(underwear) 페인트 보존 및 PaintPanel 비우기 연동,
 *   카탈로그 누락 프리셋 무대체 경고 안내를 검증한다.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ALL_AVAILABLE_CAPABILITIES,
  CHARACTER_SLOT_KINDS,
   KIT_DEFAULT_SLOTS,
  createDefaultRecipe,
  createInitialLabState,
  createKitDefaultRecipe,
  createPresetCatalog,
  failVisible,
} from "../../../contracts";
import { embedPaintLayers, serializeRecipe } from "../../../export/recipe-file";
import { readPixel } from "../../../paint/paint-layer";
import { createPaintSession } from "../../../paint/paint-session";
import { bytesEqual } from "../../../shared/typed-array";
import { createLabStore } from "../../../state/lab-store";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";
import { legacyRecipeV1Fixture } from "../../../testing/recipe-fixtures";
import { createKitPlanRegistry } from "../kit-plan-registry";
import { createPackagePlanRegistry } from "../package-plan-registry";

import { ExportPanel } from "./ExportPanel";
import { PaintPanel } from "./PaintPanel";

import type { PresetCatalog, PresetEntry } from "../../../contracts";
import type { SaveBytesResult } from "../../../export/save-bytes";

function noopSave(): SaveBytesResult {
  return { ok: true, fileName: "noop", bytes: 0, url: "blob:noop" };
}

function buildPopulatedTestCatalog(): PresetCatalog {
  const entries: PresetEntry[] = [];
  for (const slot of CHARACTER_SLOT_KINDS) {
    const defaultId = KIT_DEFAULT_SLOTS[slot];
    if (defaultId !== null) {
      entries.push({
        id: defaultId,
        slot,
        labelKo: `기본 ${slot}`,
        patch: {},
        requires: [],
        conflictsWith: [],
        thumbnailFraming: { mode: "full-body", yawDeg: 0, pitchDeg: 0, distanceScale: 1 },
        license: "original",
      });
    }
  }
  return createPresetCatalog(entries);
}

afterEach(cleanup);

describe("ExportPanel 레시피 불러오기 무결성·복구·원본 보존", () => {
  it("모든 유형의 import 실패(손상/잘린 JSON·바이너리·중복 키/ID·깨진 서브레이어·누락 키트·패키지 해시 불일치)에서 현재 작업·서브레이어·Undo 이력을 100% 보존한다", async () => {
    const engine = createMockEngine();
    const engineSession = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
    engineSession.setEngine(engine);

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

    // 1) 현재 진행 중인 사용자 작업 구성: 체형/포즈/색 편집 + 다중 서브레이어(L0 + 숨김 L1 + 불투명도 0.6 L2 + 순서 변경) + Undo 스택
    store.dispatch({ type: "param/set", group: "body", key: "height", value: 0.42 });
    store.dispatch({ type: "color/set", key: "skin", value: "#e6bfa8" });
    store.dispatch({ type: "pose/set", pose: { head: [0, 0.1, 0, 0.995] }, scope: "full", labelKo: "머리 포즈" });

    paintSession.setActiveSublayer(0);
    paintSession.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "head");
    const stroke0 = paintSession.endStroke();
    if (stroke0) store.dispatch({ type: "paint/stroke", undoToken: stroke0 });

    paintSession.setActiveSublayer(1);
    paintSession.setBrush({ color: "#ee4466" });
    paintSession.beginStroke({ u: 0.25, v: 0.25, pressure: 1 }, "head");
    const stroke1 = paintSession.endStroke();
    if (stroke1) store.dispatch({ type: "paint/stroke", undoToken: stroke1 });
    const hide1 = paintSession.setSublayerVisible("head", 1, false);
    if (hide1) store.dispatch({ type: "paint/stroke", undoToken: hide1 });

    paintSession.setActiveSublayer(2);
    paintSession.setBrush({ color: "#33bb77" });
    paintSession.beginStroke({ u: 0.75, v: 0.75, pressure: 1 }, "head");
    const stroke2 = paintSession.endStroke();
    if (stroke2) store.dispatch({ type: "paint/stroke", undoToken: stroke2 });
    const op2 = paintSession.setSublayerOpacity("head", 2, 0.6);
    if (op2) store.dispatch({ type: "paint/stroke", undoToken: op2 });
    const mv2 = paintSession.moveSublayer("head", 2, "down");
    if (mv2) store.dispatch({ type: "paint/stroke", undoToken: mv2 });

    engine.updatePaintTexture(paintSession.layer("head"));

    const baselineRecipe = structuredClone(store.getState().recipe);
    const baselineHistory = structuredClone(store.getState().history);
    const baselineMasterRgba = new Uint8ClampedArray(paintSession.layer("head").rgba);
    const baselineHiddenL1Rgba = new Uint8ClampedArray(paintSession.sublayer("head", 1).rgba);
    const baselineOrder = [...(paintSession.getState().sublayerOrders.get("head") ?? [])];
    const baselineUploadsCount = engine.paintUploads.length;

    expect(baselineHistory.canUndo).toBe(true);
    expect(baselineOrder).toEqual([0, 2, 1, 3, 4, 5]);
    expect(readPixel(paintSession.sublayer("head", 1), 4, 4)).toEqual([238, 68, 102, 255]);

    const packagePlans = createPackagePlanRegistry();
    packagePlans.register({
      manifest: { characterId: "registered-hero" } as never,
      glbUrl: "/characters/registered-hero/model.glb",
      glbBytes: 512,
      glbSha256: "a".repeat(64),
      selectedLod: 0,
      skeletonMap: {} as never,
      boneTranslationPolicy: {} as never,
      springBones: [],
      materialOverrides: [],
      capabilities: ALL_AVAILABLE_CAPABILITIES,
      warningsKo: [],
    } as never);

    const kitPlans = createKitPlanRegistry({
      loadManifest: async (req) => ({
        ok: false,
        failure: failVisible("kit-manifest-fetch-failed", `키트 '${req.kitId}'의 kit.json 에셋을 찾을 수 없습니다.`),
      }),
      buildPlan: () => ({ ok: false, failure: failVisible("kit-part-missing", "파츠 누락") }),
    });

    let fileText = "";
    let clipboardText = "";

    render(
      <MockLabProvider store={store} engineSession={engineSession} shell={{ packagePlans, kitPlans }}>
        <ExportPanel
          session={paintSession}
          deps={{
            save: noopSave,
            now: () => 100,
            readFile: async () => fileText,
            readClipboard: async () => clipboardText,
          }}
        />
      </MockLabProvider>,
    );

    const assertCurrentWorkIntact = (): void => {
      expect(store.getState().recipe).toEqual(baselineRecipe);
      expect(store.getState().history).toEqual(baselineHistory);
      expect(bytesEqual(paintSession.layer("head").rgba, baselineMasterRgba)).toBe(true);
      expect(bytesEqual(paintSession.sublayer("head", 1).rgba, baselineHiddenL1Rgba)).toBe(true);
      expect(paintSession.getState().sublayerOrders.get("head")).toEqual(baselineOrder);
      expect(paintSession.getState().sublayers.get("head")?.[1]?.visible).toBe(false);
      expect(paintSession.getState().sublayers.get("head")?.[2]?.opacity).toBeCloseTo(0.6, 5);
      expect(engine.paintUploads).toHaveLength(baselineUploadsCount);
      expect(screen.queryByTestId("export-receipt")).toBeNull();
    };

    const fileInput = screen.getByTestId("export-recipe-file-input") as HTMLInputElement;
    const baseClean = createDefaultRecipe();

    const failureCases: ReadonlyArray<{
      readonly name: string;
      readonly content: string;
      readonly expectedCode: string;
      readonly expectedSnippet: string;
    }> = [
      {
        name: "truncated.character.json",
        content: '{\n  "version": 3,\n  "colors": { "skin": "#123456"',
        expectedCode: "recipe-json-syntax",
        expectedSnippet: "파일 끝이 잘렸거나",
      },
      {
        name: "wrong-binary.glb",
        content: "glTF\u0002\u0000\u0000\u0000\u0020\u0000\u0000\u0000",
        expectedCode: "recipe-json-syntax",
        expectedSnippet: "GLB 3D 모델 바이너리",
      },
      {
        name: "duplicate-raw-key.character.json",
        content: serializeRecipe(baseClean).replace('"skin": "#f3d3bd"', '"skin": "#000000",\n    "skin": "#f3d3bd"'),
        expectedCode: "recipe-duplicate-id",
        expectedSnippet: "colors.skin",
      },
      {
        name: "duplicate-paint-part.character.json",
        content: JSON.stringify({
          ...baseClean,
          paint: {
            layers: [
              { part: "head", width: 8, height: 8, pngBase64: "AAAA" },
              { part: "head", width: 8, height: 8, pngBase64: "BBBB" },
            ],
          },
        }),
        expectedCode: "recipe-invalid",
        expectedSnippet: "paint.layers에 중복된 부위",
      },
      {
        name: "duplicate-accessory-id.character.json",
        content: JSON.stringify({
          ...baseClean,
          wardrobe: {
            ...baseClean.wardrobe,
            accessories: [
              { id: "acc-1", presetId: "accessory/ribbon", anchor: "hair", offset: { tMm: [0, 0, 0], rDeg: [0, 0, 0], scale: 1 } },
              { id: "acc-1", presetId: "accessory/glasses", anchor: "face", offset: { tMm: [0, 0, 0], rDeg: [0, 0, 0], scale: 1 } },
            ],
          },
        }),
        expectedCode: "recipe-invalid",
        expectedSnippet: "중복",
      },
      {
        name: "corrupt-sublayer.character.json",
        content: JSON.stringify({
          ...baseClean,
          paint: {
            layers: [],
            sublayers: [
              {
                part: "head",
                width: 16,
                height: 16,
                order: [0, 1, 2, 3, 4, 5],
                slots: [
                  { index: 0, visible: true, opacity: 1, pngBase64: "bm90LWEtcG5n" },
                  { index: 1, visible: true, opacity: 1 },
                  { index: 2, visible: true, opacity: 1 },
                  { index: 3, visible: true, opacity: 1 },
                  { index: 4, visible: true, opacity: 1 },
                  { index: 5, visible: true, opacity: 1 },
                ],
              },
            ],
          },
        }),
        expectedCode: "paint-sublayer-png",
        expectedSnippet: "head · L0",
      },
      {
        name: "missing-kit.character.json",
        content: serializeRecipe(createKitDefaultRecipe()),
        expectedCode: "kit-manifest-fetch-failed",
        expectedSnippet: "kit.json",
      },
      {
        name: "unregistered-active-pkg.character.json",
        content: serializeRecipe({
          ...baseClean,
          source: { kind: "package", characterId: "missing-pkg", sha256: "b".repeat(64) },
        }),
        expectedCode: "package-plan-missing",
        expectedSnippet: "missing-pkg",
      },
      {
        name: "sha-mismatch-pkg.character.json",
        content: serializeRecipe({
          ...baseClean,
          source: { kind: "package", characterId: "registered-hero", sha256: "f".repeat(64) },
        }),
        expectedCode: "package-sha-mismatch",
        expectedSnippet: "SHA-256",
      },
    ];

    for (const testCase of failureCases) {
      fileText = testCase.content;
      await act(async () => {
        fireEvent.change(fileInput, {
          target: { files: [new File([testCase.content], testCase.name, { type: "application/json" })] },
        });
      });
      await waitFor(() => expect(screen.getByTestId("export-failure-alert").textContent).toContain(testCase.expectedCode));
      expect(screen.getByTestId("export-failure-alert").textContent).toContain(testCase.expectedSnippet);
      assertCurrentWorkIntact();
    }

    // 클립보드 붙여넣기 실패에서도 동일하게 현재 작업 보존
    clipboardText = '{"version":3,"body":{"height":0.1,"height":0.9}}';
    fireEvent.click(screen.getByTestId("export-paste-recipe-clipboard"));
    await waitFor(() => expect(screen.getByTestId("export-failure-alert").textContent).toContain("recipe-duplicate-id"));
    assertCurrentWorkIntact();

    // 연속 실패 후에도 기존 Undo / Redo 스택이 정상 작동한다
    act(() => {
      store.dispatch({ type: "history/undo" });
    });
    expect(paintSession.getState().sublayerOrders.get("head")).toEqual([0, 1, 2, 3, 4, 5]);
    act(() => {
      store.dispatch({ type: "history/redo" });
    });
    expect(paintSession.getState().sublayerOrders.get("head")).toEqual([0, 2, 1, 3, 4, 5]);
  });

  it("구버전 v1+비표준 부위(underwear)·BOM+data-URI 페인트 복구와 카탈로그 누락 프리셋 경고가 정상 동작하고 PaintPanel에서 구버전 레이어를 비울 수 있다", async () => {
    const sourcePaint = createPaintSession({ layerSize: 8, brush: { radiusPx: 2, hardness: 1, opacity: 1, color: "#dd5533" } });
    sourcePaint.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "skin");
    sourcePaint.endStroke();
    const underwearLayer = sourcePaint.layer("underwear");
    underwearLayer.rgba.fill(180);
    underwearLayer.revision = 1;

    const encodedRecipe = await embedPaintLayers(createDefaultRecipe(), [sourcePaint.layer("skin"), underwearLayer]);
    const legacyRecords = encodedRecipe.paint.layers.map((rec) => ({
      ...rec,
      pngBase64: `data:image/png;base64,${rec.pngBase64.slice(0, 16)}\r\n${rec.pngBase64.slice(16)}`,
    }));
    const v1WithLegacyPaint = {
      ...legacyRecipeV1Fixture({
        ...createDefaultRecipe(),
        slots: {
          ...createDefaultRecipe().slots,
          hair: "hair/deleted-legacy-cut",
        },
      }),
      paint: { layers: legacyRecords },
    };
    const bomLegacyText = `\ufeff${JSON.stringify(v1WithLegacyPaint)}`;

    const targetPaint = createPaintSession({ layerSize: 8 });
    const catalog = buildPopulatedTestCatalog();
    const store = createLabStore({
      catalog,
      initial: createInitialLabState(createDefaultRecipe(), ALL_AVAILABLE_CAPABILITIES),
      onPaintUndo: (token) => targetPaint.applyToken(token) ?? undefined,
    });

    render(
      <MockLabProvider store={store} catalog={catalog}>
        <ExportPanel session={targetPaint} deps={{ save: noopSave, now: () => 50, readFile: async () => bomLegacyText }} />
        <PaintPanel session={targetPaint} />
      </MockLabProvider>,
    );

    const fileInput = screen.getByTestId("export-recipe-file-input");
    await act(async () => {
      fireEvent.change(fileInput, {
        target: { files: [new File([bomLegacyText], "legacy-v1-bom.character.json", { type: "application/json" })] },
      });
    });

    await waitFor(() => expect(screen.getByTestId("export-receipt").textContent).toContain("legacy-v1-bom.character.json"));
    expect(screen.queryByTestId("export-failure-alert")).toBeNull();

    const noticeText = screen.getByRole("list", { name: "레시피 불러오기 안내" }).textContent ?? "";
    expect(noticeText).toContain("레시피 v1 파일을 현재 형식(v3)으로 변환해 열었습니다");
    expect(noticeText).toContain("구버전(v1) 단일 페인트 레이어 2개를 다중 서브레이어 기본 슬롯(L0)으로 복구해 보존했습니다");
    expect(noticeText).toContain("구버전 비표준 부위(속옷) 페인트 레이어를 손실 없이 보존했습니다");
    expect(noticeText).toContain("카탈로그에 없는 프리셋 'hair/deleted-legacy-cut'(헤어)");

    // 무음 대체 없이 슬롯 ID 원본 유지 + L0 복구 + 속옷 레이어 보존 확인
    expect(store.getState().recipe.slots.hair).toBe("hair/deleted-legacy-cut");
    expect(targetPaint.sublayer("skin", 0).rgba.some((b) => b !== 0)).toBe(true);
    expect(targetPaint.layer("underwear").rgba.every((b) => b === 180)).toBe(true);

    // PaintPanel에 보존된 속옷 레이어가 노출되고 비우기 + 되돌리기가 동작한다
    const preservedList = screen.getByTestId("paint-preserved-legacy-layers");
    expect(within(preservedList).getByText(/구버전 보존 레이어: 속옷/u)).toBeTruthy();

    fireEvent.click(screen.getByTestId("paint-clear-legacy-underwear"));
    expect(targetPaint.layer("underwear").rgba.every((b) => b === 0)).toBe(true);
    expect(screen.queryByTestId("paint-preserved-legacy-layers")).toBeNull();

    act(() => {
      store.dispatch({ type: "history/undo" });
    });
    expect(targetPaint.layer("underwear").rgba.every((b) => b === 180)).toBe(true);
    expect(screen.getByTestId("paint-preserved-legacy-layers")).toBeTruthy();
  });
});
