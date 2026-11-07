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
    // top에 칠하고 엔진에 올라간 상태(스트로크 경로 흉내)
    paintSession.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "top");
    paintSession.endStroke();
    engine.updatePaintTexture(paintSession.layer("top"));
    expect(engine.paintUploads).toHaveLength(1);
    // 불러올 파일은 skin만 칠해져 있고 top 레이어가 없다
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
    // 엔진 텍스처에는 제거 API가 없으므로 top은 같은 크기의 투명 레이어를 올려 비운다(뷰포트에 이전 칠이 남지 않는다)
    expect(top).toBeDefined();
    expect(top?.rgba.every((byte) => byte === 0)).toBe(true);
    expect(top?.width).toBe(8);
  });

  it("v1 레시피 파일을 불러오면 변환 안내를 상태 문구로 보이고, 다음 작업을 시작하면 지운다", async () => {
    const dispatched: LabCommand[] = [];
    // v1 파일 모양은 fixture로 만든다(v3 기본 레시피를 펼치면 v3 전용 필드가 섞여 v1 파일이 아니다)
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
    // 다른 작업(레시피 저장)을 시작하면 안내는 사라진다
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
    // 절차 소스 파일은 같은 칠이 있어도 경고가 없다
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
    // face 프레이밍일 때는 전신 정방형 기본 버튼이 동시에 눌린 것으로 표시되지 않는다
    expect(squareBtn.getAttribute("aria-pressed")).toBe("false");

    // 다시 정방형 기본 클릭 시 full-body 프레이밍으로 복원된다
    fireEvent.click(squareBtn);
    expect((screen.getByLabelText("프레이밍") as HTMLSelectElement).value).toBe("full-body");
    expect(squareBtn.getAttribute("aria-pressed")).toBe("true");

    // 성공 저장 후 이어서 실패가 발생하면 이전 '저장됨:' 영수증은 지워지고 사용자 입력(너비/높이)은 그대로 보존된다
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
    // .preset 불러오기 후에도 기존 칠한 페인트 레이어가 지워지지 않고 유지되어야 하며 input.value는 빈 문자열로 초기화된다
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

    // 1. 실험 요약 카드에 패키지 소스·포즈·손 프리셋·관절 변형 수가 명확히 표시된다
    expect(screen.getByTestId("export-active-source").textContent).toContain("제작 패키지 (orion · 등록됨)");
    expect(screen.getByTestId("export-active-pose").textContent).toContain("손 흔들기 (본 2개 · 손 peace)");

    // 2. 레시피 저장 실행(.character.json)
    fireEvent.click(screen.getByRole("button", { name: "레시피 저장" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(savedRecipeJson).toContain('"characterId": "orion"');
    expect(savedRecipeJson).toContain('"pose": "pose/wave"');

    // 3. 다른 실험 상태로 초기화(절차 소스 기본 레시피 + 빈 페인트 + 비활성 능력표 가정)
    act(() => {
      store.dispatch({ type: "recipe/load", recipe: createDefaultRecipe() });
      store.applyEvent({ type: "source/capabilities", capabilities: ALL_UNAVAILABLE_CAPABILITIES });
      paintSession.replaceLayers([]);
    });
    expect(screen.getByTestId("export-active-source").textContent).toContain("절차적 휴머노이드");
    expect(paintSession.layersForExport()).toHaveLength(0);
    expect(store.getState().capabilities.pose.status).toBe("unavailable");

    // 4. 저장해 둔 .character.json 재가져오기 → 패키지 소스·포즈·페인트 레이어·패키지 능력표까지 완전 복원
    await act(async () => {
      fireEvent.change(screen.getByLabelText("레시피 불러오기"), {
        target: { files: [new File([savedRecipeJson], "orion-wave.character.json", { type: "application/json" })] },
      });
    });
    await waitFor(() => expect(screen.getByTestId("export-active-source").textContent).toContain("제작 패키지 (orion · 등록됨)"));
    expect(screen.getByTestId("export-active-pose").textContent).toContain("손 흔들기 (본 2개 · 손 peace)");
    expect(paintSession.layersForExport()).toHaveLength(1);
    expect(store.getState().capabilities.pose.status).toBe("available");

    // 5. 탭 전환 버튼(패키지 선택 탭으로 / 포즈 실험 탭으로) 및 초점 복원 검증
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

    // 1. 빈 파일(0 B) 불러오기 → 명확한 recipe-file-empty 오류를 표시하고 기존 레시피·페인트를 유지한다
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

    // 2. 손상된 내장 페인트 PNG가 포함된 레시피 → recipe/load 디스패치 금지, 기존 페인트 레이어 보존, 거짓 '저장됨:' 영수증 금지
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

    // 3. 실패 후 유효한 긴 이름 레시피로 재시도 → 오류가 걷히고 영수증·능력표가 정상 갱신된다
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
    // 절차 소스로 복구되면서 비활성 상태였던 pose 능력표도 available로 동기화된다
    expect(store.getState().capabilities.pose.status).toBe("available");

    // 4. 파일 선택 창에서 취소(files: []) → 기존 영수증과 레시피 상태를 그대로 보존한다
    await act(async () => {
      fireEvent.change(input, { target: { files: [] } });
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("export-receipt").textContent).toContain(longFileName);
    expect(store.getState().recipe.slots.pose).toBe("pose/cheer");

    // 5. 아직 PackagePanel에서 불러오지 않은 제작 패키지 레시피를 가져오면 미등록 안내를 띄우고 거짓 준비 상태를 막는다
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
});


