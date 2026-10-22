import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import {
  StudioBg3dModelPlacementAdmissionError,
  assertStudioBg3dModelAttachmentAdmission,
} from "./studio-bg3d-model-placement-admission";
import {
  StudioBg3dStaleModalOperationError,
  studioBg3dModalOperationCoordinator,
} from "./studio-bg3d-modal-operation-coordinator";
import { rotateVectorEulerXyz } from "./studio-bg3d-object-ops";
import { isStudioBg3dPhysicsTransientPhase } from "./studio-bg3d-physics-ui";
import { planStudioBg3dModelPlacementRecipe } from "./studio-bg3d-placement-recipe";
import { STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS } from "./studio-bg3d-scene-document-types";
import { isStudioBg3dSceneEditReady } from "./studio-bg3d-scene-edit-readiness";
import {
  STUDIO_BG3D_RECIPE_IN_PROGRESS_MESSAGE,
  STUDIO_BG3D_RECIPE_UNEXPECTED_MESSAGE,
  attachStudioBg3dEditorRecipeHost,
} from "./studio-bg3d-editor-recipe-host";

import type { StudioBg3dEditorRecipeHost } from "./studio-bg3d-editor-recipe-run";

// 가벼운 접합부만 확인한다: 본문 모듈은 가짜로 바꾸고, 불러오기 실패·중복 누름·예상 밖 예외를 본다.
const run = vi.hoisted(() => ({ place: vi.fn() }));
vi.mock("./studio-bg3d-editor-recipe-run", () => ({ placeStudioBg3dModelWithRecipe: run.place }));

function createHost() {
  const status = vi.fn();
  const host = { setSurfaceSnapStatus: status } as unknown as StudioBg3dEditorRecipeHost;
  attachStudioBg3dEditorRecipeHost(host);
  return { host, status };
}

beforeEach(() => {
  run.place.mockReset();
});

describe("attachStudioBg3dEditorRecipeHost — 가벼운 접합부", () => {
  it("본문을 처음 눌렀을 때 불러와 호스트 백과 인자를 그대로 넘기고 결과를 돌려준다", async () => {
    run.place.mockResolvedValue(true);
    const { host } = createHost();
    await expect(host.placeCustomModelWithRecipe("model-1", "floor")).resolves.toBe(true);
    expect(run.place).toHaveBeenCalledWith(host, "model-1", "floor", expect.any(Object));
    run.place.mockResolvedValue(false);
    await expect(host.placeCustomModelWithRecipe("model-1", "wall")).resolves.toBe(false);
  });

  it("본문에는 활성화 그래프 모듈의 실제 함수·클래스·상수를 인자로 넘긴다(본문이 그 모듈을 값으로 가져오지 않는다)", async () => {
    run.place.mockResolvedValue(true);
    const { host } = createHost();
    await host.placeCustomModelWithRecipe("model-1", "floor");
    const deps = run.place.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(Object.keys(deps).sort()).toEqual([
      "PlacementAdmissionError",
      "StaleModalOperationError",
      "assertAttachmentAdmission",
      "createHistorySnapshot",
      "isPhysicsTransientPhase",
      "isSceneEditReady",
      "maxAttachments",
      "modalCoordinator",
      "placementMath",
    ]);
    expect(deps.isSceneEditReady).toBe(isStudioBg3dSceneEditReady);
    expect(deps.isPhysicsTransientPhase).toBe(isStudioBg3dPhysicsTransientPhase);
    expect(deps.createHistorySnapshot).toBe(createStudioBg3dHistorySnapshot);
    expect(deps.modalCoordinator).toBe(studioBg3dModalOperationCoordinator);
    expect(deps.StaleModalOperationError).toBe(StudioBg3dStaleModalOperationError);
    expect(deps.PlacementAdmissionError).toBe(StudioBg3dModelPlacementAdmissionError);
    expect(deps.assertAttachmentAdmission).toBe(assertStudioBg3dModelAttachmentAdmission);
    expect(deps.maxAttachments).toBe(STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS);
    expect(deps.placementMath).toEqual({ planBase: planStudioBg3dModelPlacementRecipe, rotateVector: rotateVectorEulerXyz });
  });

  it("배치가 끝나기 전에 또 누르면 두 번 놓지 않고 한 줄만 안내한다, 끝나면 다시 누를 수 있다", async () => {
    let finish!: (value: boolean) => void;
    run.place.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      finish = resolve;
    }));
    const { host, status } = createHost();
    const first = host.placeCustomModelWithRecipe("model-1", "floor");
    // 첫 호출이 본문 안에 들어간 뒤에 두 번째를 누른다.
    while (run.place.mock.calls.length === 0) await Promise.resolve();
    await expect(host.placeCustomModelWithRecipe("model-1", "floor")).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith({ tone: "info", message: STUDIO_BG3D_RECIPE_IN_PROGRESS_MESSAGE });
    expect(run.place).toHaveBeenCalledTimes(1);

    finish(true);
    await expect(first).resolves.toBe(true);
    run.place.mockResolvedValue(true);
    await expect(host.placeCustomModelWithRecipe("model-1", "floor")).resolves.toBe(true);
    expect(run.place).toHaveBeenCalledTimes(2);
  });

  it("본문이 예상 밖으로 던져도 상태 줄로 알리고, 다음 누름을 막지 않는다", async () => {
    run.place.mockRejectedValueOnce(new Error("boom"));
    const { host, status } = createHost();
    await expect(host.placeCustomModelWithRecipe("model-1", "floor")).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith({ tone: "error", message: STUDIO_BG3D_RECIPE_UNEXPECTED_MESSAGE });
    run.place.mockResolvedValue(true);
    await expect(host.placeCustomModelWithRecipe("model-1", "floor")).resolves.toBe(true);
  });
});

describe("편집기 정적 그래프에 올라가는 파일의 경계", () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "studio-bg3d-editor-recipe-host.ts"), "utf8");

  it("본문(three·배치 계획·벽 탐지)은 정적으로 가져오지 않고 동적 import 하나로만 불러온다", () => {
    const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gmu)];
    // 값 import 는 이미 편집기 활성화 그래프에 있는 모듈뿐이고(본문에 주입한다), 본문은 타입으로만 가져온다.
    expect(imports.map((match) => [Boolean(match[1]), match[2]])).toEqual([
      [false, "./studio-bg3d-editor-derivations"],
      [false, "./studio-bg3d-model-placement-admission"],
      [false, "./studio-bg3d-modal-operation-coordinator"],
      [false, "./studio-bg3d-object-ops"],
      [false, "./studio-bg3d-physics-ui"],
      [false, "./studio-bg3d-placement-recipe"],
      [false, "./studio-bg3d-scene-document-types"],
      [false, "./studio-bg3d-scene-edit-readiness"],
      [true, "./studio-bg3d-editor-recipe-run"],
    ]);
    // `typeof import(...)` 는 타입이라 지워진다. 실제로 불러오는 것은 import() 호출 하나다.
    expect([...source.matchAll(/(?<!typeof )import\("([^"]+)"\)/gu)].map((match) => match[1])).toEqual(["./studio-bg3d-editor-recipe-run"]);
    expect(source).not.toContain('"three"');
    expect(source).not.toContain("studio-bg3d-asset-placement");
    expect(source).not.toContain("studio-bg3d-wall-probe");
  });
});
