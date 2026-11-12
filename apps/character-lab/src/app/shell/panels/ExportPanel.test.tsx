// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createDefaultRecipe, createKitDefaultRecipe } from "../../../contracts";
import { isPng } from "../../../export/png-encoder";
import { serializeRecipe } from "../../../export/recipe-file";
import { createPaintSession } from "../../../paint/paint-session";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";
import { installPsdCanvasStub } from "../../../testing/psd-canvas-stub";
import { legacyRecipeV1Fixture } from "../../../testing/recipe-fixtures";

import { ExportPanel, readTextFile } from "./ExportPanel";

import type { LabCommand } from "../../../contracts";
import type { SaveBytesResult } from "../../../export/save-bytes";
import type { MockEngine } from "../../../testing/mock-engine";

interface SaveCall {
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly mime: string;
}

function fakeSave(calls: SaveCall[]): (fileName: string, bytes: Uint8Array, mime: string) => SaveBytesResult {
  return (fileName, bytes, mime) => {
    calls.push({ fileName, bytes, mime });
    return { ok: true, fileName, bytes: bytes.length, url: "blob:test" };
  };
}

function readySession(engine: MockEngine) {
  const session = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
  session.setEngine(engine);
  return session;
}

beforeAll(() => {
  installPsdCanvasStub();
});

afterEach(cleanup);

describe("ExportPanel", () => {
  it("엔진이 없으면 PNG·PSD·GLB 버튼이 비활성이고 사유를 보여주며 레시피 저장은 가능하다", async () => {
    const calls: SaveCall[] = [];
    render(
      <MockLabProvider>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave(calls), now: () => 1 }} />
      </MockLabProvider>,
    );
    expect(screen.getByRole("status").textContent).toMatch(/엔진 상태: idle/u);
    expect((screen.getByRole("button", { name: "투명 PNG 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("export-turnaround-sheet-png") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "레이어 PSD 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "GLB 저장" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "레시피 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.fileName).toMatch(/\.character\.json$/u);
    expect(calls[0]?.mime).toBe("application/json");
    expect(JSON.parse(new TextDecoder().decode(calls[0]?.bytes)).version).toBe(3);
    expect(screen.getByText(/저장됨: character-/u)).toBeTruthy();
  });

  it("투명 PNG는 입력한 해상도로 캡처해 PNG 바이트를 저장한다", async () => {
    const calls: SaveCall[] = [];
    const engine = createMockEngine();
    render(
      <MockLabProvider engineSession={readySession(engine)}>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave(calls), now: () => 1 }} />
      </MockLabProvider>,
    );
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "48" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "32" } });
    fireEvent.change(screen.getByLabelText("프레이밍"), { target: { value: "bust" } });
    fireEvent.change(screen.getByLabelText("물리 settle 스텝"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "투명 PNG 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.fileName).toBe("character-mock-48x32.png");
    expect(isPng(calls[0]?.bytes ?? new Uint8Array())).toBe(true);
    const request = engine.calls.find((c) => c.method === "renderPasses")?.args[0] as { width: number; height: number; camera?: { mode: string }; settleSteps: number };
    expect(request).toMatchObject({ width: 48, height: 32, settleSteps: 0 });
    expect(request.camera?.mode).toBe("bust");
    expect(engine.calls.find((c) => c.method === "settle")?.args).toEqual([5]);
    expect(screen.getByText(/저장됨: character-mock-48x32\.png/u)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("PSD·GLB 저장과 저장 실패·크기 오류 표시", async () => {
    const calls: SaveCall[] = [];
    const engine = createMockEngine({ partIdPalette: { 1: { role: "skin", labelKo: "피부" } } });
    render(
      <MockLabProvider engineSession={readySession(engine)}>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave(calls), now: () => 1 }} />
      </MockLabProvider>,
    );
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "24" } });
    fireEvent.click(screen.getByLabelText(/참조 패스/u));
    fireEvent.click(screen.getByRole("button", { name: "레이어 PSD 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.fileName).toBe("character-mock-24x24.psd");
    expect(String.fromCharCode(...(calls[0]?.bytes.subarray(0, 4) ?? []))).toBe("8BPS");
    expect(screen.getByText(/레이어 \d+\(그룹 \d+\)/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "GLB 저장" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.mime).toBe("model/gltf-binary");

    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "4000" } });
    fireEvent.click(screen.getByRole("button", { name: "레이어 PSD 저장" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/export-size/u));
    expect(calls).toHaveLength(2);
  });

  it("PSD 캔버스 팩토리 등록이 실패하면 export-psd-canvas 사유를 보여주고 캡처하지 않는다", async () => {
    const calls: SaveCall[] = [];
    const engine = createMockEngine();
    render(
      <MockLabProvider engineSession={readySession(engine)}>
        <ExportPanel
          session={createPaintSession({ layerSize: 8 })}
          deps={{
            save: fakeSave(calls),
            now: () => 1,
            preparePsd: () => {
              throw new Error("no canvas");
            },
          }}
        />
      </MockLabProvider>,
    );
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: "레이어 PSD 저장" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/export-psd-canvas/u));
    expect(calls).toHaveLength(0);
    expect(engine.calls.some((c) => c.method === "renderPasses")).toBe(false);
  });

  it("레시피 불러오기는 recipe/load를 dispatch하고 페인트 레이어를 복원하며 손상 파일은 사유를 보여준다", async () => {
    const dispatched: LabCommand[] = [];
    const engine = createMockEngine();
    const paintSession = createPaintSession({ layerSize: 8 });
    const recipe = { ...createDefaultRecipe(), colors: { ...createDefaultRecipe().colors, skin: "#123456" } };
    const painted = createPaintSession({ layerSize: 8, brush: { radiusPx: 2, hardness: 1, opacity: 1 } });
    painted.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    painted.endStroke();
    const { embedPaintLayers } = await import("../../../export/recipe-file");
    const text = serializeRecipe(await embedPaintLayers(recipe, painted.layersForExport()));
    render(
      <MockLabProvider engineSession={readySession(engine)} dispatchSpy={(command) => dispatched.push(command)}>
        <ExportPanel session={paintSession} deps={{ save: fakeSave([]), now: () => 1, readFile: async (file) => (file.name === "bad.json" ? "{ broken" : text) }} />
      </MockLabProvider>,
    );
    const input = screen.getByLabelText("레시피 불러오기") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([text], "ok.character.json", { type: "application/json" })] } });
    });
    await waitFor(() => expect(dispatched).toHaveLength(1));
    expect(dispatched[0]?.type).toBe("recipe/load");
    expect(dispatched[0]?.type === "recipe/load" && dispatched[0].recipe.colors.skin).toBe("#123456");
    expect(paintSession.layersForExport()).toHaveLength(1);
    expect(engine.paintUploads).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["{ broken"], "bad.json", { type: "application/json" })] } });
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/recipe-json-syntax/u));
    expect(dispatched).toHaveLength(1);
  });

  it("레시피 불러오기: 새 파일에 없는 부위의 이전 칠은 엔진 텍스처에서 비워지고, 있는 부위는 새 내용으로 올라간다", async () => {
    const engine = createMockEngine();
    const paintSession = createPaintSession({ layerSize: 8, brush: { radiusPx: 2, hardness: 1, opacity: 1 } });
    paintSession.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "top");
    paintSession.endStroke();
    engine.updatePaintTexture(paintSession.layer("top"));
    expect(engine.paintUploads).toHaveLength(1);
    const source = createPaintSession({ layerSize: 8, brush: { radiusPx: 2, hardness: 1, opacity: 1 } });
    source.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "skin");
    source.endStroke();
    const { embedPaintLayers } = await import("../../../export/recipe-file");
    const text = serializeRecipe(await embedPaintLayers(createDefaultRecipe(), source.layersForExport()));
    render(
      <MockLabProvider engineSession={readySession(engine)}>
        <ExportPanel session={paintSession} deps={{ save: fakeSave([]), now: () => 1, readFile: async () => text }} />
      </MockLabProvider>,
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("레시피 불러오기"), { target: { files: [new File([text], "skin-only.character.json", { type: "application/json" })] } });
    });
    await waitFor(() => expect(engine.paintUploads.length).toBeGreaterThan(1));
    expect(paintSession.layersForExport().map((layer) => layer.part)).toEqual(["skin"]);
    const afterLoad = engine.paintUploads.slice(1);
    const skin = afterLoad.find((layer) => layer.part === "skin");
    const top = afterLoad.find((layer) => layer.part === "top");
    expect(skin?.rgba.some((byte) => byte !== 0)).toBe(true);
    expect(top).toBeDefined();
    expect(top?.rgba.every((byte) => byte === 0)).toBe(true);
    expect(top?.width).toBe(8);
  });

  it("v1 레시피 파일을 불러오면 변환 안내를 상태 문구로 보이고, 다음 작업을 시작하면 지운다", async () => {
    const dispatched: LabCommand[] = [];
    const v1Text = JSON.stringify(legacyRecipeV1Fixture({ ...createDefaultRecipe(), body: { height: 0.25 } }));
    const calls: SaveCall[] = [];
    render(
      <MockLabProvider dispatchSpy={(command) => dispatched.push(command)}>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave(calls), now: () => 1, readFile: async () => v1Text }} />
      </MockLabProvider>,
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("레시피 불러오기"), { target: { files: [new File([v1Text], "old.character.json", { type: "application/json" })] } });
    });
    await waitFor(() => expect(dispatched).toHaveLength(1));
    const list = screen.getByRole("list", { name: "레시피 불러오기 안내" });
    expect(list.textContent).toBe("레시피 v1 파일을 현재 형식(v3)으로 변환해 열었습니다. 저장하면 v3 파일로 기록됩니다.");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "레시피 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByRole("list", { name: "레시피 불러오기 안내" })).toBeNull();
  });

  it("현재 형식 파일은 변환 안내가 없다", async () => {
    const text = serializeRecipe(createDefaultRecipe());
    render(
      <MockLabProvider>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave([]), now: () => 1, readFile: async () => text }} />
      </MockLabProvider>,
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("레시피 불러오기"), { target: { files: [new File([text], "cur.character.json", { type: "application/json" })] } });
    });
    await waitFor(() => expect(screen.getByText(/저장됨: cur\.character\.json/u)).toBeTruthy());
    expect(screen.queryByRole("list", { name: "레시피 불러오기 안내" })).toBeNull();
  });

  it("키트 소스 파일: 칠한 레이어 중 변형을 바꾸면 어긋날 수 있는 것만 안내하고(피부·머리는 제외) 절차 소스 파일은 안내하지 않는다", async () => {
    const painted = createPaintSession({ layerSize: 8, brush: { radiusPx: 2, hardness: 1, opacity: 1 } });
    painted.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "top");
    painted.endStroke();
    painted.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "skin");
    painted.endStroke();
    const { embedPaintLayers } = await import("../../../export/recipe-file");
    const kitText = serializeRecipe(await embedPaintLayers(createKitDefaultRecipe(), painted.layersForExport()));
    const proceduralText = serializeRecipe(await embedPaintLayers(createDefaultRecipe(), painted.layersForExport()));
    const dispatched: LabCommand[] = [];
    let text = kitText;
    render(
      <MockLabProvider dispatchSpy={(command) => dispatched.push(command)}>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave([]), now: () => 1, readFile: async () => text }} />
      </MockLabProvider>,
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("레시피 불러오기"), { target: { files: [new File([kitText], "kit.character.json", { type: "application/json" })] } });
    });
    await waitFor(() => expect(dispatched).toHaveLength(1));
    const items = within(screen.getByRole("list", { name: "레시피 불러오기 안내" })).getAllByRole("listitem");
    expect(items.map((node) => node.textContent)).toEqual(["이미 칠한 상의 레이어: 상의 변형을 바꾸면 UV가 달라져 그림이 어긋납니다. 변형을 확정한 뒤에 칠하세요."]);
    text = proceduralText;
    await act(async () => {
      fireEvent.change(screen.getByLabelText("레시피 불러오기"), { target: { files: [new File([proceduralText], "proc.character.json", { type: "application/json" })] } });
    });
    await waitFor(() => expect(dispatched).toHaveLength(2));
    expect(screen.queryByRole("list", { name: "레시피 불러오기 안내" })).toBeNull();
  });

  it("빠른 해상도 프리셋과 VRM 프레이밍 프리셋의 선택 표시(aria-pressed)가 서로 일관되고 실패 시 이전 저장 영수증을 지우며 입력값을 보존한다", async () => {
    const calls: SaveCall[] = [];
    const engine = createMockEngine();
    render(
      <MockLabProvider engineSession={readySession(engine)}>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave(calls), now: () => 1 }} />
      </MockLabProvider>,
    );
    const group = screen.getByTestId("export-resolution-presets");
    const squareBtn = within(group).getByRole("button", { name: "정방형 기본 (1024×1024)" });
    expect(squareBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(group).getByRole("button", { name: "웹툰 컷 (800×1200)" }));
    expect((screen.getByLabelText("너비(px)") as HTMLInputElement).value).toBe("800");
    expect((screen.getByLabelText("높이(px)") as HTMLInputElement).value).toBe("1200");

    const vrmFaceBtn = screen.getByTestId("export-preset-vrm-face");
    fireEvent.click(vrmFaceBtn);
    expect((screen.getByLabelText("너비(px)") as HTMLInputElement).value).toBe("1024");
    expect((screen.getByLabelText("높이(px)") as HTMLInputElement).value).toBe("1024");
    expect((screen.getByLabelText("프레이밍") as HTMLSelectElement).value).toBe("face");
    expect(vrmFaceBtn.getAttribute("aria-pressed")).toBe("true");
    expect(squareBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(squareBtn);
    expect((screen.getByLabelText("프레이밍") as HTMLSelectElement).value).toBe("full-body");
    expect(squareBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "레시피 저장" }));
    await waitFor(() => expect(screen.getByText(/저장됨:/u)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "4000" } });
    fireEvent.click(screen.getByRole("button", { name: "레이어 PSD 저장" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/export-size/u));
    expect(screen.queryByText(/저장됨:/u)).toBeNull();
    expect((screen.getByLabelText("너비(px)") as HTMLInputElement).value).toBe("4000");
  });

  it("readTextFile은 File 내용을 읽는다", async () => {
    const file = new File(["안녕"], "hello.txt", { type: "text/plain" });
    expect(await readTextFile(file)).toBe("안녕");
  });

  it("헤어 분리 미지원 사유를 저장 전에 표시하고 일반 PSD 경로를 유지한다", async () => {
    const calls: SaveCall[] = [];
    const engine = createMockEngine();
    engine.psdHairLayers = () => ({ status: "unavailable", reasonKo: "겹친 BLEND 표면은 분리할 수 없습니다. 일반 PSD를 사용하세요." });
    render(<MockLabProvider engineSession={readySession(engine)}><ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave(calls) }} /></MockLabProvider>);
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "24" } });
    fireEvent.click(screen.getByLabelText(/헤어 3-레이어 분리/u));
    expect((screen.getByRole("button", { name: "레이어 PSD 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/겹친 BLEND 표면은 분리할 수 없습니다/u)).toBeTruthy();
    expect(engine.calls.some(call => call.method === "renderPasses")).toBe(false);
    fireEvent.click(screen.getByLabelText(/헤어 3-레이어 분리/u));
    fireEvent.click(screen.getByRole("button", { name: "레이어 PSD 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it("SHAPER 프리셋 저장 및 .preset 파일 불러오기·헤어 3-레이어 분리 PSD 옵션을 지원하고 기존 페인트 레이어와 input.value 초기화를 보장한다", async () => {
    const calls: SaveCall[] = [];
    const dispatched: LabCommand[] = [];
    const engine = createMockEngine({ partIdPalette: { 1: { role: "hair", labelKo: "머리" } } });
    engine.psdHairLayers = () => ({ status: "available" });
    const renderPasses = engine.renderPasses.bind(engine);
    engine.renderPasses = async (request) => {
      const result = await renderPasses(request);
      const lit = result.passes.lit;
      if (!request.includeHairOwnership || !lit) return result;
      const rgba = new Uint8ClampedArray(lit.rgba);
      for (let i = 0; i < rgba.length; i += 4) rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] ? 255 : 0;
      return { ...result, hairOwnership: { status: "available", raster: { ...lit, rgba }, samples: 1, classification: "majority-visible-samples", limitationsKo: [] } };
    };
    const paintSession = createPaintSession({ layerSize: 8, brush: { radiusPx: 2, hardness: 1, opacity: 1 } });
    paintSession.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "skin");
    paintSession.endStroke();
    expect(paintSession.layersForExport()).toHaveLength(1);
    let presetText = "";
    render(
      <MockLabProvider engineSession={readySession(engine)} dispatchSpy={(command) => dispatched.push(command)}>
        <ExportPanel
          session={paintSession}
          deps={{
            save: (fileName, bytes, mime) => {
              if (fileName.endsWith(".preset")) {
                presetText = new TextDecoder().decode(bytes);
              }
              return fakeSave(calls)(fileName, bytes, mime);
            },
            now: () => 1,
            readFile: async () => presetText || "1.0\nhC*0.2/0.4/0.6,sC*1/0.8/0.7",
          }}
        />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "SHAPER 프리셋 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.fileName).toMatch(/-style\.preset$/u);

    const input = screen.getByLabelText("레시피 불러오기") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([presetText], "style.preset", { type: "text/plain" })] } });
    });
    await waitFor(() => expect(dispatched).toHaveLength(1));
    expect(dispatched[0]?.type).toBe("recipe/load");
    expect(paintSession.layersForExport()).toHaveLength(1);
    expect(input.value).toBe("");
    expect(screen.getByRole("list", { name: "레시피 불러오기 안내" }).textContent).toContain(
      "SHAPER 프리셋 파일을 현재 형식(v3)으로 변환해 열었습니다.",
    );

    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "24" } });
    fireEvent.click(screen.getByLabelText(/헤어 3-레이어 분리/u));
    fireEvent.click(screen.getByLabelText(/SHAPER 휘도 반전 선화 추출/u));
    fireEvent.click(screen.getByRole("button", { name: "레이어 PSD 저장" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.fileName).toBe("character-mock-24x24.psd");
  });

  it("R&D 실험 재사용 여정: 패키지 소스+포즈 실험 레시피 저장 후 초기화 상태에서 다시 불러와 소스·포즈·페인트·능력표를 복원하고 탭 전환을 지원한다", async () => {
    const { ALL_AVAILABLE_CAPABILITIES, ALL_UNAVAILABLE_CAPABILITIES } = await import("../../../contracts");
    const { createMockLabStore } = await import("../../../testing/mock-store");
    const { createPackagePlanRegistry } = await import("../package-plan-registry");
    const { createUiStateStore } = await import("../ui-state");

    const calls: SaveCall[] = [];
    const packagePlans = createPackagePlanRegistry();
    const ui = createUiStateStore({ inspectorTab: "export" });
    const orionCapabilities = {
      ...ALL_AVAILABLE_CAPABILITIES,
      body: { status: "unavailable" as const, reasonKo: "제작 패키지는 단일 리그입니다." },
      pose: { status: "available" as const },
    };
    packagePlans.register({
      manifest: { characterId: "orion" } as never,
      glbUrl: "/characters/orion/character.glb",
      glbBytes: 1024,
      glbSha256: "a".repeat(64),
      selectedLod: 0,
      skeletonMap: {} as never,
      boneTranslationPolicy: {} as never,
      springBones: [],
      materialOverrides: [],
      capabilities: orionCapabilities,
      warningsKo: [],
    } as never);

    const baseRecipe = createDefaultRecipe();
    const experimentRecipe = {
      ...baseRecipe,
      source: {
        kind: "package" as const,
        characterId: "orion",
        sha256: "a".repeat(64),
      },
      slots: {
        ...baseRecipe.slots,
        pose: "pose/wave" as const,
        "hand-pose": "hand-pose/peace" as const,
      },
      pose: {
        rightUpperArm: [0, 0, 0.4, 0.9165] as const,
        rightLowerArm: [0, 0, 0.2, 0.9798] as const,
      },
    };

    const paintSession = createPaintSession({ layerSize: 8, brush: { radiusPx: 2, hardness: 1, opacity: 1 } });
    paintSession.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "skin");
    paintSession.endStroke();

    let savedRecipeJson = "";
    const store = createMockLabStore(
      {
        recipe: experimentRecipe,
        capabilities: orionCapabilities,
      },
      (cmd) => {
        if (cmd.type === "recipe/load") {
          store.setState({ recipe: cmd.recipe });
        }
      },
    );

    render(
      <MockLabProvider store={store} shell={{ ui, packagePlans }}>
        <ExportPanel
          session={paintSession}
          deps={{
            save: (fileName, bytes, mime) => {
              if (fileName.endsWith(".character.json")) {
                savedRecipeJson = new TextDecoder().decode(bytes);
              }
              return fakeSave(calls)(fileName, bytes, mime);
            },
            now: () => 1700000000000,
            readFile: async () => savedRecipeJson,
          }}
        />
      </MockLabProvider>,
    );

    expect(screen.getByTestId("export-active-source").textContent).toContain("제작 패키지 (orion · 등록됨)");
    expect(screen.getByTestId("export-active-pose").textContent).toContain("손 흔들기 (본 2개 · 손 peace)");

    fireEvent.click(screen.getByRole("button", { name: "레시피 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(savedRecipeJson).toContain('"characterId": "orion"');
    expect(savedRecipeJson).toContain('"pose": "pose/wave"');

    act(() => {
      store.dispatch({ type: "recipe/load", recipe: createDefaultRecipe() });
      store.applyEvent({ type: "source/capabilities", capabilities: ALL_UNAVAILABLE_CAPABILITIES });
      paintSession.replaceLayers([]);
    });
    expect(screen.getByTestId("export-active-source").textContent).toContain("절차적 휴머노이드");
    expect(paintSession.layersForExport()).toHaveLength(0);
    expect(store.getState().capabilities.pose.status).toBe("unavailable");

    await act(async () => {
      fireEvent.change(screen.getByLabelText("레시피 불러오기"), {
        target: { files: [new File([savedRecipeJson], "orion-wave.character.json", { type: "application/json" })] },
      });
    });
    await waitFor(() => expect(screen.getByTestId("export-active-source").textContent).toContain("제작 패키지 (orion · 등록됨)"));
    expect(screen.getByTestId("export-active-pose").textContent).toContain("손 흔들기 (본 2개 · 손 peace)");
    expect(paintSession.layersForExport()).toHaveLength(1);
    expect(store.getState().capabilities.pose.status).toBe("available");

    const packageTab = document.createElement("button");
    packageTab.id = "cl-tab-package";
    const poseTab = document.createElement("button");
    poseTab.id = "cl-tab-pose";
    document.body.append(packageTab, poseTab);
    try {
      fireEvent.click(screen.getByTestId("export-switch-to-package-tab"));
      expect(ui.getState().inspectorTab).toBe("package");
      expect(document.activeElement).toBe(packageTab);
      fireEvent.click(screen.getByTestId("export-switch-to-pose-tab"));
      expect(ui.getState().inspectorTab).toBe("pose");
      expect(document.activeElement).toBe(poseTab);
    } finally {
      packageTab.remove();
      poseTab.remove();
    }
  });

  it("빈 파일(0 B)·손상된 내장 페인트 PNG·선택 취소·실패 후 재시도·긴 파일 이름·미등록 패키지 안내에서 데이터 소실과 거짓 성공을 막는다", async () => {
    const { ALL_UNAVAILABLE_CAPABILITIES } = await import("../../../contracts");
    const { createMockLabStore } = await import("../../../testing/mock-store");
    const { createPackagePlanRegistry } = await import("../package-plan-registry");

    const dispatched: LabCommand[] = [];
    const paintSession = createPaintSession({ layerSize: 8, brush: { radiusPx: 2, hardness: 1, opacity: 1 } });
    paintSession.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "skin");
    paintSession.endStroke();
    expect(paintSession.layersForExport()).toHaveLength(1);

    const store = createMockLabStore(
      {
        capabilities: ALL_UNAVAILABLE_CAPABILITIES,
      },
      (cmd) => {
        dispatched.push(cmd);
        if (cmd.type === "recipe/load") {
          store.setState({ recipe: cmd.recipe });
        }
      },
    );
    const packagePlans = createPackagePlanRegistry();

    let fileContentToRead = "";
    render(
      <MockLabProvider
        store={store}
        shell={{ packagePlans }}
      >
        <ExportPanel
          session={paintSession}
          deps={{
            save: fakeSave([]),
            now: () => 1,
            readFile: async () => fileContentToRead,
          }}
        />
      </MockLabProvider>,
    );

    const input = screen.getByLabelText("레시피 불러오기") as HTMLInputElement;

    fileContentToRead = "   \n  ";
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File([""], "empty.character.json", { type: "application/json" })] },
      });
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/recipe-file-empty/u));
    expect(screen.getByRole("alert").textContent).toMatch(/파일이 비어 있습니다/u);
    expect(dispatched).toHaveLength(0);
    expect(paintSession.layersForExport()).toHaveLength(1);
    expect(screen.queryByTestId("export-receipt")).toBeNull();

    const baseRecipe = createDefaultRecipe();
    const corruptPaintRecipe = {
      ...baseRecipe,
      slots: { ...baseRecipe.slots, pose: "pose/run" as const },
      paint: {
        layers: [
          {
            part: "skin" as const,
            width: 8,
            height: 8,
            pngBase64: "bm90LWEtdmFsaWQtcG5n",
          },
        ],
      },
    };
    fileContentToRead = serializeRecipe(corruptPaintRecipe);
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File([fileContentToRead], "corrupt-paint.character.json", { type: "application/json" })] },
      });
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/paint-layer-png/u));
    expect(dispatched).toHaveLength(0);
    expect(store.getState().recipe.slots.pose).toBe("pose/a-pose");
    expect(paintSession.layersForExport()).toHaveLength(1);
    expect(screen.queryByTestId("export-receipt")).toBeNull();

    const longFileName = `experiment_${"very_long_segment_".repeat(6)}restore.character.json`;
    const validProceduralRecipe = {
      ...baseRecipe,
      slots: { ...baseRecipe.slots, pose: "pose/cheer" as const },
    };
    fileContentToRead = serializeRecipe(validProceduralRecipe);
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File([fileContentToRead], longFileName, { type: "application/json" })] },
      });
    });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByTestId("export-receipt").textContent).toContain(longFileName);
    expect(store.getState().recipe.slots.pose).toBe("pose/cheer");
    expect(store.getState().capabilities.pose.status).toBe("available");

    await act(async () => {
      fireEvent.change(input, { target: { files: [] } });
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("export-receipt").textContent).toContain(longFileName);
    expect(store.getState().recipe.slots.pose).toBe("pose/cheer");

    const unloadedPkgRecipe = {
      ...baseRecipe,
      source: {
        kind: "package" as const,
        characterId: "unloaded_hero_pkg",
        sha256: "b".repeat(64),
      },
    };
    fileContentToRead = serializeRecipe(unloadedPkgRecipe);
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File([fileContentToRead], "unloaded-pkg.character.json", { type: "application/json" })] },
      });
    });
    await waitFor(() => expect(screen.getByTestId("export-active-source").textContent).toContain("제작 패키지 (unloaded_hero_pkg · 미로드)"));
    expect(store.getState().capabilities.pose.status).toBe("unavailable");
    expect(screen.getByRole("list", { name: "레시피 불러오기 안내" }).textContent).toContain(
      "제작 패키지 'unloaded_hero_pkg'가 아직 로드되지 않았습니다.",
    );
  });

  it("4방향 설정시트 PNG 저장 버튼이 0°·35°·90°·180° 캡처 후 가로 합성 turnaround PNG를 저장한다", async () => {
    const calls: SaveCall[] = [];
    const engine = createMockEngine();
    render(
      <MockLabProvider engineSession={readySession(engine)}>
        <ExportPanel session={createPaintSession({ layerSize: 8 })} deps={{ save: fakeSave(calls), now: () => 1 }} />
      </MockLabProvider>,
    );
    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "32" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "48" } });
    fireEvent.click(screen.getByTestId("export-turnaround-sheet-png"));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.fileName).toBe("character-mock-128x48-turnaround.png");
    expect(isPng(calls[0]?.bytes ?? new Uint8Array())).toBe(true);
    expect(screen.getByTestId("export-receipt").textContent).toContain("128×48");
  });

  it("2×2 종합 설정시트 PNG 저장 및 로컬 클립보드 레시피 복사·붙여넣기 왕복이 동작하고 빈 클립보드 오류를 노출한다", async () => {
    const calls: SaveCall[] = [];
    const dispatched: LabCommand[] = [];
    const engine = createMockEngine();
    const paintSession = createPaintSession({ layerSize: 8, brush: { radiusPx: 2, hardness: 1, opacity: 1, color: "#cc2244" } });
    paintSession.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "head");
    paintSession.endStroke();

    let clipboardText = "";
    render(
      <MockLabProvider engineSession={readySession(engine)} dispatchSpy={(cmd) => dispatched.push(cmd)}>
        <ExportPanel
          session={paintSession}
          deps={{
            save: fakeSave(calls),
            now: () => 10,
            writeClipboard: async (text) => {
              clipboardText = text;
            },
            readClipboard: async () => clipboardText,
          }}
        />
      </MockLabProvider>,
    );

    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "32" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "40" } });
    fireEvent.click(screen.getByTestId("export-quad-sheet-png"));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.fileName).toBe("character-mock-64x80-quad-sheet.png");
    expect(isPng(calls[0]?.bytes ?? new Uint8Array())).toBe(true);

    fireEvent.click(screen.getByTestId("export-paste-recipe-clipboard"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/recipe-clipboard-empty/u));

    fireEvent.click(screen.getByTestId("export-copy-recipe-clipboard"));
    await waitFor(() => expect(clipboardText.length).toBeGreaterThan(20));
    act(() => {
      paintSession.replaceLayers([]);
    });
    expect(paintSession.layersForExport()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("export-paste-recipe-clipboard"));
    await waitFor(() => expect(dispatched.some((cmd) => cmd.type === "recipe/load")).toBe(true));
    expect(paintSession.layersForExport()).toHaveLength(1);
    expect(paintSession.layersForExport()[0]?.part).toBe("head");
  });

  it("다중 서브레이어(숨김·불투명도·순서) 레시피 저장/복원 왕복, 2×2 종횡비 축소 안내, 키보드 단축키 및 포커스 전환을 검증한다", async () => {
    const { readPixel } = await import("../../../paint/paint-layer");
    const calls: SaveCall[] = [];
    const dispatched: LabCommand[] = [];
    const engine = createMockEngine();
    const paintSession = createPaintSession({ layerSize: 16, activePart: "head", brush: { radiusPx: 3, hardness: 1, opacity: 1, color: "#112233" } });

    paintSession.setActiveSublayer(0);
    paintSession.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    paintSession.endStroke();
    paintSession.setActiveSublayer(1);
    paintSession.setBrush({ color: "#ee3355" });
    paintSession.beginStroke({ u: 0.25, v: 0.25, pressure: 1 });
    paintSession.endStroke();
    paintSession.setSublayerVisible("head", 1, false);
    paintSession.setActiveSublayer(2);
    paintSession.setBrush({ color: "#22aa88" });
    paintSession.beginStroke({ u: 0.75, v: 0.75, pressure: 1 });
    paintSession.endStroke();
    paintSession.setSublayerOpacity("head", 2, 0.6);
    paintSession.moveSublayer("head", 2, "down");

    let savedJson = "";
    render(
      <MockLabProvider engineSession={readySession(engine)} dispatchSpy={(cmd) => dispatched.push(cmd)}>
        <ExportPanel
          session={paintSession}
          deps={{
            save: (fileName, bytes, mime) => {
              if (fileName.endsWith(".character.json")) savedJson = new TextDecoder().decode(bytes);
              return fakeSave(calls)(fileName, bytes, mime);
            },
            now: () => 20,
            readFile: async () => savedJson,
          }}
        />
      </MockLabProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "레시피 저장" }));
    await waitFor(() => expect(savedJson.length).toBeGreaterThan(50));
    expect(JSON.parse(savedJson).paint.sublayers).toHaveLength(1);
    act(() => paintSession.replaceLayers([]));

    const fileInput = screen.getByTestId("export-recipe-file-input") as HTMLInputElement;
    let clickedByKeyboard = false;
    fileInput.addEventListener("click", () => { clickedByKeyboard = true; });
    fireEvent.keyDown(fileInput, { key: "Enter" });
    expect(clickedByKeyboard).toBe(true);

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [new File([savedJson], "multi.character.json", { type: "application/json" })] } });
    });
    await waitFor(() => expect(dispatched.some((cmd) => cmd.type === "recipe/load")).toBe(true));
    expect(paintSession.getState().sublayerOrders.get("head")).toEqual([0, 2, 1, 3, 4, 5]);
    expect(paintSession.getState().sublayers.get("head")?.[1]?.visible).toBe(false);
    expect(paintSession.getState().sublayers.get("head")?.[2]?.opacity).toBeCloseTo(0.6, 5);
    expect(readPixel(paintSession.sublayer("head", 1), 4, 4)).toEqual([238, 51, 85, 255]);

    const firstPreset = within(screen.getByTestId("export-resolution-presets")).getByRole("button", { name: "웹툰 컷 (800×1200)" });
    firstPreset.focus();
    fireEvent.keyDown(firstPreset, { key: "ArrowRight" });
    expect((screen.getByLabelText("너비(px)") as HTMLInputElement).value).toBe("1024");

    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "1600" } });
    fireEvent.change(screen.getByLabelText("높이(px)"), { target: { value: "2400" } });
    fireEvent.keyDown(screen.getByRole("heading", { name: "내보내기" }), { key: "Q", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(calls.some((c) => c.fileName === "character-mock-2730x4096-quad-sheet.png")).toBe(true));
    expect(screen.getByRole("list", { name: "레시피 불러오기 안내" }).textContent).toContain("종횡비를 유지한 채 셀당 1365×2048px");

    fireEvent.change(screen.getByLabelText("너비(px)"), { target: { value: "4000" } });
    fireEvent.click(screen.getByRole("button", { name: "레이어 PSD 저장" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("export-failure-alert")));
    fireEvent.keyDown(screen.getByTestId("export-failure-alert"), { key: "Escape" });
    expect(screen.queryByTestId("export-failure-alert")).toBeNull();
  });
});
