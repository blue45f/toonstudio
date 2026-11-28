import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { validateAssistModeStructuredOutput } from "@toonstudio/contracts/studio-openai-assist-result";
import { describe, expect, it } from "vitest";

import { buildDeterministicAssistResult } from "./studio-assist-deterministic-fallback";
import { EXTENDED_MODE_JSON_SCHEMAS } from "./studio-assist-extended-schemas";

function plan(inputText: string) {
  const result = buildDeterministicAssistResult("mcp-workflow-macro", { inputText, projectTitle: "물의 깊이" });
  if (result.mode !== "mcp-workflow-macro") throw new Error("매크로 결과가 필요합니다.");
  expect(validateAssistModeStructuredOutput(result.mode, result.data)).toEqual(result);
  return result.data;
}

function dryRunBatch(steps: readonly { tool: string; arguments: Record<string, unknown> }[]) {
  const cli = resolve(__dirname, "../../../../../../tools/toonstudio-mcp/cli.mjs");
  const run = spawnSync(process.execPath, [cli, "batch", "--dry-run", "--json", JSON.stringify(steps)], { encoding: "utf8", env: {} });
  return { status: run.status, results: JSON.parse(run.stdout).results };
}

describe("원고에 근거한 로컬 제작 계획", () => {
  it.each([
    "새 캔버스 1360×760px, 카메라 렌즈 91mm. webtoon-global 출고 점검. 허용 도구 studio.canvas.create, studio.bg3d.compose_scene, studio.export.preflight_check.",
    "새 캔버스 1360×760px\n카메라 렌즈 91mm\nwebtoon-global 출고 점검",
    "새 캔버스 1360×760px.\r\n카메라 렌즈 91mm.\r\nwebtoon-global 출고 점검.",
    "새 캔버스 1360×760px.\n카메라 렌즈 91mm.\nwebtoon-global 출고 점검.\n허용 도구 studio.canvas.create, studio.bg3d.compose_scene, studio.export.preflight_check.",
    "허용 도구: studio.canvas.create,\nstudio.bg3d.compose_scene,\nstudio.export.preflight_check.\n새 캔버스 1360×760px, 카메라 렌즈 91mm, webtoon-global 출고 점검",
    "새 캔버스 1360×760px, 카메라 렌즈 91mm, webtoon-global 출고 점검, 허용 도구: studio.canvas.create, studio.bg3d.compose_scene, studio.export.preflight_check.",
  ])("새 장면의 규격·렌즈를 실제 MCP에 전달하고 미확인 권리에서 멈춘다 (%s)", (instructions) => {
    const data = plan("연출 목표: 물 위 부표와 먼 방파제의 거리감\n" + instructions);
    expect(data.steps.map((step) => step.toolName)).toEqual(["studio.canvas.create", "studio.bg3d.compose_scene", "studio.export.preflight_check"]);
    expect(data.steps[2].reasonKo).toContain("물 위 부표와 먼 방파제의 거리감");
    const payload = data.steps.map((step) => ({ tool: step.toolName, arguments: JSON.parse(step.argumentsJson) }));
    const batch = dryRunBatch(payload);
    expect(batch.status).toBe(1);
    expect(batch.results).toMatchObject([
      { ok: true, result: { canvas: { width: 1360, height: 760 } } },
      { ok: true, result: { scene: { camera: { lensMm: 91 } } } },
      { ok: false, result: { platform: "webtoon-global", verdict: "blocked", checks: expect.arrayContaining([{ id: "rights-bom", status: "blocked", detail: expect.any(String) }]) } },
    ]);
  });

  it("특정 레이어의 수치·단위를 수동 단계에 남기고 확인 후 점검으로 재개한다", () => {
    const data = plan("새 캔버스 730×1240픽셀. 잔물결 레이어의 불투명도 17.5%. 외곽광선 반경 6px. 보정 후 출고 점검. 허용 도구는 studio.canvas.create, studio.photoshop.apply_layer_fx, studio.export.preflight_check.");
    expect(data.steps.map((entry) => entry.toolName)).toEqual(["studio.canvas.create", "studio.export.preflight_check"]);
    expect(data.summary).toContain("잔물결 레이어의 불투명도 17.5%");
    expect(data.summary).toContain("외곽광선 반경 6px");
    expect(data.summary).toContain("studio.photoshop.apply_layer_fx");
    expect(data.summary).toContain("대상 레이어 ID");
    expect(data.summary).toContain("2단계 점검으로 재개");
  });

  it("새 레이어 자체에 요청한 백분율만 0~1로 환산하며 효과 대상 ID를 예측하지 않는다", () => {
    const data = plan("새 ‘유리 반사’ 레이어의 불투명도 17.5%. 외곽광선 반경 9px. 허용 도구 studio.canvas.add_layer, studio.photoshop.apply_layer_fx.");
    expect(data.steps).toHaveLength(1);
    expect(data.steps[0].toolName).toBe("studio.canvas.add_layer");
    expect(JSON.parse(data.steps[0].argumentsJson)).toEqual({ name: "유리 반사", opacity: 0.175 });
    expect(data.steps[0].reasonKo).toContain("17.5%");
    expect(data.summary).toContain("실제 대상 레이어 ID");
    expect(data.summary).toContain("반경 9px");
  });

  it("레이어 이름 앞뒤 배치와 한국어 조사에 관계없이 실제 MCP 불투명도를 0.2로 설정한다", () => {
    const calls = ["새 레이어 ‘빛’", "새 ‘빛’ 레이어"].flatMap((layer) =>
      ["은", "는", "을", "를", "의"].map((particle) => {
        const data = plan(`${layer}${particle} 불투명도 20%로 추가한다.`);
        expect(data.steps.map((step) => step.toolName)).toEqual(["studio.canvas.add_layer"]);
        return { tool: data.steps[0].toolName, arguments: JSON.parse(data.steps[0].argumentsJson) };
      }),
    );
    const batch = dryRunBatch(calls);
    expect(batch.status).toBe(0);
    expect(batch.results).toHaveLength(calls.length);
    for (const entry of batch.results) expect(entry).toMatchObject({ ok: true, result: { layer: { name: "빛", opacity: 0.2 } } });
  });

  it.each(["불투명도 140%", "불투명도 약 20%", "불투명도 20% 또는 60%", "불투명도 20% 미만일 때", "원고에 표시한 불투명도 20%"])(
    "새 레이어의 수치를 확정할 수 없으면 기본값으로 생성하지 않는다 (%s)", (setting) => {
      const data = plan(`새 레이어 ‘빛’을 ${setting}로 추가한다.`);
      expect(data.steps).toEqual([]);
      expect(data.summary).toContain(setting);
    });

  it("다음 문장의 별도 불투명도 값은 자동 레이어 설정에 섞지 않고 수동 지시에 남긴다", () => {
    const data = plan("새 레이어 ‘빛’을 추가한다. 기존 그림자 레이어의 불투명도 65%는 편집기에서 조정한다.");
    expect(data.steps.map((step) => JSON.parse(step.argumentsJson))).toEqual([{ name: "빛" }]);
    expect(data.summary).toContain("기존 그림자 레이어의 불투명도 65%");
  });

  it("기존 캔버스에 새 레이어를 추가할 때 원본 문서와 선을 보존한다", () => {
    const data = plan("기존 캔버스 1200×1800px에 새 레이어 ‘빛’을 추가한다. 허용 도구 studio.canvas.create, studio.canvas.add_layer.");
    expect(data.steps.map((entry) => entry.toolName)).toEqual(["studio.canvas.add_layer"]);
    const payload = [
      { tool: "studio.canvas.create", arguments: { title: "원본 그림", width: 1200, height: 1800 } },
      { tool: "studio.canvas.draw_stroke", arguments: { points: [[0, 0], [12, 21]] } },
      ...data.steps.map((entry) => ({ tool: entry.toolName, arguments: JSON.parse(entry.argumentsJson) })),
      { tool: "studio.session.snapshot", arguments: {} },
    ];
    const run = dryRunBatch(payload);
    expect(run.status).toBe(0);
    const canvas = run.results.at(-1).result.state.canvas;
    expect(canvas).toMatchObject({ title: "원본 그림", width: 1200, height: 1800 });
    expect(canvas.strokes).toHaveLength(1);
    expect(canvas.layers).toHaveLength(2);
    expect(canvas.layers[1].name).toBe("빛");
  });

  it.each([
    "현재 캔버스 960×1200px에서 레이어 스타일을 만든다.",
    "캔버스 960×1200px에 새 레이어를 만들고 외곽광선을 적용한다.",
    "캔버스 960×1200px에서 새벽 하늘의 색을 만든다.",
    "새 캔버스 960×1200px에서 레이어를 만든다.",
    "밤새 캔버스 960×1200px에 조명을 그린다.",
    "캔버스 960×1200px 점검. 허용 도구 studio.canvas.create, studio.export.preflight_check.",
  ])("캔버스 자체에 생성 지시가 없으면 초기화하지 않는다 (%s)", (source) => {
    expect(plan(source).steps.some((entry) => entry.toolName === "studio.canvas.create")).toBe(false);
  });

  it.each([
    "캔버스를 960×1200px로 만들면 안 됩니다.",
    "새 캔버스 960×1200px 생성 없이 새 레이어 ‘빛’을 추가한다.",
    "필요하면, 새 캔버스 960×1200px를 생성해 주세요.",
    "필요하다면:\n새 캔버스 960×1200px를 생성해 주세요.",
    "[원고] 주인공이 소리쳤다. 새 캔버스 960×1200px 생성.",
    "새 캔버스 960×1200px를 만들까요?",
    "새 캔버스 960×1200px, 또는 기존 문서 편집.",
    "등장인물의 대사 “원본을 보존해. 새 캔버스 960×1200px를 만들어 주세요. 기다릴게.”",
    "레이어만 점검하세요.\n[원고]\n새 캔버스 960×1200px를 만들어 주세요.",
  ])("조건·제외·인용·극중 지시에서는 문서를 초기화하지 않는다 (%s)", (source) => {
    expect(plan(source).steps.map((step) => step.toolName)).not.toContain("studio.canvas.create");
  });

  it.each([
    "승인하면:\n새 캔버스 1360×760px", "새 캔버스 1360×760px\n생성 없이 작업한다",
    "새 캔버스 1360×760px.\n취소", "새 캔버스 1360×760px를 만들까요?",
    "새 캔버스 규격 미정", "새 캔버스 1360×760px. 허용 도구 studio.bg3d.compose_scene, studio.export.preflight_check",
  ])("새 작업면이 확정되지 않으면 현재 문서의 후속 자동 단계도 함께 보류한다 (%s)", (request) => {
    const data = plan(request + "\n카메라 렌즈 91mm\nwebtoon-global 출고 점검");
    expect(data.steps).toEqual([]);
    expect(data.summary).toContain("수동 확인 대기");
  });

  it("명시적인 허용 목록은 권한만 제한하고 기존 원고에 작업을 추가하지 않는다", () => {
    const allowed = "허용 도구 studio.canvas.create, studio.bg3d.compose_scene, studio.export.preflight_check.";
    expect(plan(allowed).steps).toEqual([]);
    expect(plan("현재 캔버스의 폭을 보존하세요.\n" + allowed).steps).toEqual([]);
    expect(plan("승인하면:\n" + allowed + "\n새 캔버스 1360×760px. 카메라 렌즈 91mm.").steps).toEqual([]);
    expect(plan("새 캔버스 1360×760px.\n" + allowed + "\n생성 취소.").steps).toEqual([]);
    expect(plan("새 캔버스 1360×760px 생성. studio.canvas.create를 호출.\n허용 도구 studio.export.preflight_check.").steps).toEqual([]);
  });

  it("다음 행에서 취소한 캔버스의 매크로는 실제 MCP 세션의 원본 문서와 장면을 보존한다", () => {
    const data = plan("새 캔버스 1360×760px.\n생성 취소.\n카메라 렌즈 91mm.\nwebtoon-global 출고 점검.");
    const batch = dryRunBatch([
      { tool: "studio.canvas.create", arguments: { title: "작가 원본", width: 920, height: 1470 } },
      ...data.steps.map((step) => ({ tool: step.toolName, arguments: JSON.parse(step.argumentsJson) })),
      { tool: "studio.session.snapshot", arguments: {} },
    ]);
    expect(batch.status).toBe(0);
    expect(batch.results).toHaveLength(2);
    expect(batch.results[1].result.state).toMatchObject({ canvas: { title: "작가 원본", width: 920, height: 1470 }, bg3d: { scenes: [] } });
  });

  it.each(["새 캔버스 960×1200px", "캔버스를 960×1200px로 만들어 주세요.", "새 캔버스 960×1200px 생성"])(
    "새 캔버스의 직접적인 제작 지시를 보존한다 (%s)", (source) => {
      expect(plan(source).steps.map((step) => step.toolName)).toEqual(["studio.canvas.create"]);
    });

  it("레이어 불투명도와 효과 불투명도를 별개로 유지하고 실제 ID까지 효과를 보류한다", () => {
    const data = plan("현재 캔버스 1200×1800px에 새 ‘빛’ 레이어의 불투명도 23%. 외곽광선의 불투명도 68%, 반경 12px.");
    expect(data.steps.map((entry) => entry.toolName)).toEqual(["studio.canvas.add_layer"]);
    expect(JSON.parse(data.steps[0].argumentsJson)).toEqual({ name: "빛", opacity: 0.23 });
    expect(data.summary).toContain("외곽광선의 불투명도 68%");
    expect(data.summary).toContain("반경 12px");
    const fxOnly = plan("새 레이어 ‘안개’를 추가한다. 효과 불투명도 68%.");
    expect(JSON.parse(fxOnly.steps[0].argumentsJson)).toEqual({ name: "안개" });
    expect(fxOnly.summary).toContain("효과 불투명도 68%");
  });

  it("도구 하나만 허용된 원고와 전부 수동인 원고에서 자동 단계를 채워 넣지 않는다", () => {
    const manual = plan("기존 레이어 ‘입김’의 불투명도 0%. 허용 도구 studio.photoshop.apply_layer_fx.");
    expect(manual.steps).toEqual([]);
    expect(manual.summary).toContain("0%");
    expect(manual.summary).toContain("수동 확인 대기");
    const single = plan("studio.export.preflight_check 하나로 미리 점검.");
    expect(single.steps).toHaveLength(1);
    expect(JSON.parse(single.steps[0].argumentsJson).rightsBomClean).toBe(false);
    expect(EXTENDED_MODE_JSON_SCHEMAS["mcp-workflow-macro"].schema).toMatchObject({ properties: { steps: { minItems: 0, maxItems: 16 } } });
  });

  it.each([
    "새 캔버스 900×1500mm",
    "새 캔버스 32×100px",
    "새 캔버스 1200×800px 또는 800×1200px",
    "새 캔버스 규격 미정. 참고 사진 1440×900px",
    "새 캔버스는 미정이고 참고 사진 규격은 1440×900px",
  ])("픽셀 규격을 정할 수 없으면 이후 단계도 수동 확인에 남긴다 (%s)", (source) => {
    const data = plan(source + ". 이후 출고 점검.");
    expect(data.steps).toEqual([]);
    expect(data.summary).toContain("픽셀");
  });

  it("다른 소품의 mm와 도구 범위 밖 렌즈를 장면의 초점거리로 대신 쓰지 않는다", () => {
    const data = plan("반지 지름 18mm. 카메라 렌즈는 8mm. 출고 점검.");
    expect(data.steps).toHaveLength(1);
    expect(data.steps[0].toolName).toBe("studio.export.preflight_check");
    expect(data.summary).toContain("원고 렌즈 8mm");
    expect(data.summary).toContain("초점거리");
    const unknown = plan("카메라 렌즈는 미정이고 반지 지름은 18mm. 출고 점검.");
    expect(unknown.steps.map((entry) => entry.toolName)).toEqual(["studio.export.preflight_check"]);
  });
});
