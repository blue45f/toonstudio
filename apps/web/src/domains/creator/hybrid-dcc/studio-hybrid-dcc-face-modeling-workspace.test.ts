import { describe, expect, it } from "vitest";

import { serializeStudioCommandJournal } from "../studio-command-journal";
import { createStudioEditableMeshFromPolygons, hashStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  validateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import {
  analyzeStudioEditableMeshIntegrity,
  STUDIO_FACE_MODELING_LIMITS,
  type StudioFaceModelingResult,
} from "./studio-hybrid-dcc-face-modeling-mesh";
import {
  commitStudioHybridDccFaceModeling,
  planStudioHybridDccFaceModeling,
  previewStudioHybridDccFaceModeling,
  studioHybridDccFaceDrawingGuide,
  studioHybridDccFaceModelingRange,
  type StudioFaceModelingRequest,
} from "./studio-hybrid-dcc-face-modeling-workspace";
import {
  decodeStudioHybridDccWorkspacePersistenceEnvelope,
  encodeStudioHybridDccWorkspacePersistenceEnvelope,
} from "./studio-hybrid-dcc-workspace-persistence";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceComponentSelectionSource,
  workspaceRedo,
  workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

const SCOPE = { userId: "tester", workId: "face-modeling" } as const;
const TOP = 3;

function cubeWorkspace(): StudioHybridDccWorkspace {
  return workspaceAddUnitCube(createStudioHybridDccWorkspace("face-modeling"), "cube");
}

function faceSelection(
  workspace: StudioHybridDccWorkspace,
  ids: readonly number[],
): StudioHybridDccComponentSelection {
  const source = workspaceComponentSelectionSource(workspace);
  if (!source) throw new Error("no active mesh");
  const result = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face",
    operation: "replace",
    ids,
    activeId: ids.at(-1),
    source,
  });
  if (!result.ok) throw new Error(result.diagnostics.map(({ message }) => message).join(" · "));
  return result.value;
}

function meshHash(workspace: StudioHybridDccWorkspace): string {
  return workspace.session.state.geometry.records.cube!.meshHash;
}

function expectOk<T>(result: StudioFaceModelingResult<T>): T {
  if (!result.ok) throw new Error(`expected ok but got ${result.code}: ${result.detail}`);
  return result.value;
}

function expectFailure(result: StudioFaceModelingResult<unknown>, code: string) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.code).toBe(code);
  return result;
}

const SQUARE = [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]] as const;

const REQUESTS: readonly (readonly [string, StudioFaceModelingRequest])[] = [
  ["밀기", { tool: "push-pull", distance: 0.25 }],
  ["당기기", { tool: "push-pull", distance: -0.3 }],
  ["안쪽 테두리", { tool: "inset", distance: 0.1 }],
  ["안쪽 오프셋", { tool: "offset", distance: 0.1, direction: "inward" }],
  ["면 그리기", { tool: "draw", points: SQUARE }],
];

describe("면 모델링 작업공간: 미리보기는 문서를 건드리지 않는다", () => {
  it.each(REQUESTS)("%s 미리보기는 세션·기록·원본 메시를 그대로 둔다", (_name, request) => {
    const workspace = cubeWorkspace();
    const selection = faceSelection(workspace, [TOP]);
    const before = {
      session: workspace.session,
      commandCount: workspace.session.state.commandCount,
      undoDepth: workspace.session.undoStack.length,
      hash: meshHash(workspace),
      journal: serializeStudioCommandJournal(workspace.session.journal),
    };
    const preview = expectOk(previewStudioHybridDccFaceModeling(workspace, selection, request));

    expect(workspace.session).toBe(before.session);
    expect(workspace.session.state.commandCount).toBe(before.commandCount);
    expect(workspace.session.undoStack).toHaveLength(before.undoDepth);
    expect(meshHash(workspace)).toBe(before.hash);
    expect(serializeStudioCommandJournal(workspace.session.journal)).toBe(before.journal);

    const previewRecord = preview.workspace.session.state.geometry.records.cube!;
    expect(previewRecord.mesh).toBe(preview.plan.outcome.mesh);
    expect(previewRecord.meshHash).toBe(hashStudioEditableMesh(preview.plan.outcome.mesh));
    expect(previewRecord.meshHash).not.toBe(before.hash);
    expect(previewRecord.renderCache).toBeNull();
    // 미리보기 선택은 미리보기 메시 기준으로 유효하다.
    const source = {
      assetId: "cube",
      mesh: previewRecord.mesh,
      meshRevision: previewRecord.revision,
      sourceHash: previewRecord.meshHash,
    };
    expect(validateStudioHybridDccComponentSelection(preview.selection, source).ok).toBe(true);
    expect(preview.selection.mode).toBe("face");
    expect(preview.selection.elementIds.length).toBeGreaterThan(0);
    expect(analyzeStudioEditableMeshIntegrity(previewRecord.mesh, { renderableFaces: "all" }).closed).toBe(true);
  });
});

describe("면 모델링 작업공간: 확정은 되돌리기 한 단위다", () => {
  it.each(REQUESTS)("%s 확정은 명령 하나를 남기고 되돌리기·다시 실행이 정확히 복원한다", (_name, request) => {
    const workspace = cubeWorkspace();
    const selection = faceSelection(workspace, [TOP]);
    const initialState = workspace.session.state.stateHash;
    const initialHash = meshHash(workspace);

    const result = commitStudioHybridDccFaceModeling(workspace, selection, request);
    const committed = result.workspace;
    expect(committed.session.state.commandCount).toBe(workspace.session.state.commandCount + 1);
    expect(committed.session.undoStack).toHaveLength(workspace.session.undoStack.length + 1);
    expect(committed.session.redoStack).toHaveLength(0);
    expect(committed.session.state.geometry.records.cube!.revision)
      .toBe(workspace.session.state.geometry.records.cube!.revision + 1);
    expect(meshHash(committed)).not.toBe(initialHash);
    expect(committed.bridge.set.objects.find(({ id }) => id === "cube")?.geometryHash).toBe(meshHash(committed));
    expect(analyzeStudioEditableMeshIntegrity(
      committed.session.state.geometry.records.cube!.mesh,
      { renderableFaces: "all" },
    ).closed).toBe(true);

    // 새 선택은 확정된 메시 기준으로 유효하다.
    const nextSource = workspaceComponentSelectionSource(committed)!;
    expect(result.selection).toBeDefined();
    expect(validateStudioHybridDccComponentSelection(result.selection!, nextSource).ok).toBe(true);
    expect(result.selection!.elementIds.length).toBeGreaterThan(0);

    const undone = workspaceUndo(committed);
    expect(meshHash(undone)).toBe(initialHash);
    expect(undone.session.state.stateHash).toBe(initialState);
    expect(undone.session.undoStack).toHaveLength(workspace.session.undoStack.length);

    const redone = workspaceRedo(undone);
    expect(meshHash(redone)).toBe(meshHash(committed));
    expect(redone.session.state.stateHash).toBe(committed.session.state.stateHash);
  });

  it("밀기는 기둥 벽이면 일반 커밋(면 ID 유지), 새 옆면이 필요하면 영수증이 달린 영역 밀기로 기록한다", () => {
    const workspace = cubeWorkspace();
    const stretched = commitStudioHybridDccFaceModeling(
      workspace,
      faceSelection(workspace, [TOP]),
      { tool: "push-pull", distance: 0.25 },
    );
    expect(JSON.stringify(stretched.workspace.session.journal.records)).toContain("geometry.commit");
    expect(JSON.stringify(stretched.workspace.session.journal.records)).not.toContain("geometry.extrude-region");
    expect(stretched.selection!.elementIds).toEqual([TOP]);
    expect(stretched.workspace.session.state.geometry.records.cube!.mesh.faces).toHaveLength(6);

    const drawn = commitStudioHybridDccFaceModeling(workspace, faceSelection(workspace, [TOP]), {
      tool: "draw",
      points: SQUARE,
    });
    const pit = commitStudioHybridDccFaceModeling(drawn.workspace, drawn.selection!, {
      tool: "push-pull",
      distance: -0.25,
    });
    expect(JSON.stringify(pit.workspace.session.journal.records)).toContain("geometry.extrude-region");
    expect(pit.selection!.elementIds).toHaveLength(1);
  });

  it("그리기→안쪽 테두리→당기기→오프셋을 이어 적용하고 한 번씩 되돌리면 단계마다 정확히 복원된다", () => {
    let workspace = cubeWorkspace();
    const hashes: string[] = [meshHash(workspace)];
    const states: string[] = [workspace.session.state.stateHash];
    let selection = faceSelection(workspace, [TOP]);
    const steps: StudioFaceModelingRequest[] = [
      { tool: "draw", points: SQUARE },
      { tool: "offset", distance: 0.1, direction: "outward" },
      { tool: "inset", distance: 0.02 },
      { tool: "push-pull", distance: -0.2 },
    ];
    for (const request of steps) {
      const result = commitStudioHybridDccFaceModeling(workspace, selection, request);
      workspace = result.workspace;
      selection = result.selection!;
      hashes.push(meshHash(workspace));
      states.push(workspace.session.state.stateHash);
    }
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(workspace.session.undoStack).toHaveLength(steps.length + 1);

    const final = workspace;
    for (let step = steps.length - 1; step >= 0; step -= 1) {
      workspace = workspaceUndo(workspace);
      expect(meshHash(workspace)).toBe(hashes[step]);
      expect(workspace.session.state.stateHash).toBe(states[step]);
    }
    for (let step = 1; step <= steps.length; step += 1) {
      workspace = workspaceRedo(workspace);
      expect(meshHash(workspace)).toBe(hashes[step]);
    }
    expect(workspace.session.state.stateHash).toBe(final.session.state.stateHash);
    expect(analyzeStudioEditableMeshIntegrity(
      final.session.state.geometry.records.cube!.mesh,
      { renderableFaces: "all" },
    )).toMatchObject({ closed: true, bowTieVertices: 0, orientationConflicts: 0, zeroAreaFaces: [] });
  });

  it("확정한 작업공간은 저장·복원해도 같은 메시와 같은 명령 기록을 가진다", () => {
    let workspace = cubeWorkspace();
    let selection = faceSelection(workspace, [TOP]);
    for (const request of [
      { tool: "draw", points: SQUARE },
      { tool: "inset", distance: 0.03 },
      { tool: "push-pull", distance: 0.1 },
    ] satisfies StudioFaceModelingRequest[]) {
      const result = commitStudioHybridDccFaceModeling(workspace, selection, request);
      workspace = result.workspace;
      selection = result.selection!;
    }
    const encoded = encodeStudioHybridDccWorkspacePersistenceEnvelope({ workspace, scope: SCOPE, savedAt: 1 });
    const decoded = decodeStudioHybridDccWorkspacePersistenceEnvelope({ bytes: encoded.bytes, scope: SCOPE });
    expect(decoded.kind).toBe("workspace");
    const restored = decoded.workspace!;
    expect(meshHash(restored)).toBe(meshHash(workspace));
    expect(restored.session.state.stateHash).toBe(workspace.session.state.stateHash);
    expect(serializeStudioCommandJournal(restored.session.journal))
      .toBe(serializeStudioCommandJournal(workspace.session.journal));
    expect(meshHash(workspaceUndo(restored))).toBe(meshHash(workspaceUndo(workspace)));
  });
});

describe("면 모델링 작업공간: 입력 오류는 이유를 돌려준다", () => {
  it("활성 오브젝트·면 선택·최신 선택·한 면 조건을 확인한다", () => {
    const empty = createStudioHybridDccWorkspace("face-modeling-empty");
    const workspace = cubeWorkspace();
    const request: StudioFaceModelingRequest = { tool: "inset", distance: 0.1 };
    expectFailure(
      previewStudioHybridDccFaceModeling(empty, createStudioHybridDccComponentSelection(), request),
      "no-active-asset",
    );
    expectFailure(
      previewStudioHybridDccFaceModeling(workspace, createStudioHybridDccComponentSelection(), request),
      "selection-required",
    );
    const emptyFaces = faceSelection(workspace, []);
    expectFailure(previewStudioHybridDccFaceModeling(workspace, emptyFaces, request), "selection-required");

    const selection = faceSelection(workspace, [TOP]);
    const changed = commitStudioHybridDccFaceModeling(workspace, selection, request).workspace;
    expectFailure(previewStudioHybridDccFaceModeling(changed, selection, request), "selection-stale");

    const two = faceSelection(workspace, [TOP, 2]);
    expectFailure(
      previewStudioHybridDccFaceModeling(workspace, two, { tool: "offset", distance: 0.1, direction: "inward" }),
      "single-face-required",
    );
    expectFailure(previewStudioHybridDccFaceModeling(workspace, two, { tool: "draw", points: SQUARE }), "single-face-required");
    expect(previewStudioHybridDccFaceModeling(workspace, two, { tool: "inset", distance: 0.1 }).ok).toBe(true);
    expect(previewStudioHybridDccFaceModeling(workspace, two, { tool: "push-pull", distance: 0.1 }).ok).toBe(true);
  });

  it("커널의 거부 이유와 허용 최대 거리를 그대로 전달하고 확정은 오류를 던진다", () => {
    const workspace = cubeWorkspace();
    const selection = faceSelection(workspace, [TOP]);
    const collapse = expectFailure(
      previewStudioHybridDccFaceModeling(workspace, selection, { tool: "inset", distance: 0.6 }),
      "collapse",
    );
    if (!collapse.ok) expect(collapse.maxDistance).toBeGreaterThan(0.49);
    const deep = expectFailure(
      planStudioHybridDccFaceModeling(workspace, selection, { tool: "push-pull", distance: -2 }),
      "collapse",
    );
    if (!deep.ok) expect(deep.maxDistance).toBeGreaterThan(0.99);
    const depth = workspace.session.undoStack.length;
    expect(() => commitStudioHybridDccFaceModeling(workspace, selection, { tool: "inset", distance: 0.6 })).toThrow();
    expect(workspace.session.undoStack).toHaveLength(depth);
  });
});

describe("면 모델링 작업공간: 범위와 그리기 안내", () => {
  it("도구별 허용 범위를 알려 준다", () => {
    const workspace = cubeWorkspace();
    const selection = faceSelection(workspace, [TOP]);
    const pushPull = expectOk(studioHybridDccFaceModelingRange(workspace, selection, "push-pull"));
    expect(pushPull.method).toBe("stretch");
    expect(pushPull.minDistance).toBeLessThan(-0.99);
    expect(pushPull.maxDistance).toBe(1000);
    const inset = expectOk(studioHybridDccFaceModelingRange(workspace, selection, "inset"));
    expect(inset.minDistance).toBe(0);
    expect(inset.maxDistance).toBeGreaterThan(0.49);
    expect(inset.maxDistance).toBeLessThan(0.5);
    const inward = expectOk(studioHybridDccFaceModelingRange(workspace, selection, "offset", "inward"));
    expect(inward.maxDistance).toBeCloseTo(inset.maxDistance, 12);
    expectFailure(studioHybridDccFaceModelingRange(workspace, selection, "offset", "outward"), "no-coplanar-region");
    expectFailure(
      studioHybridDccFaceModelingRange(workspace, faceSelection(workspace, [TOP, 2]), "offset", "inward"),
      "single-face-required",
    );
  });

  it("면 그리기 안내는 한 면의 윤곽과 좌표계를 준다", () => {
    const workspace = cubeWorkspace();
    const guide = expectOk(studioHybridDccFaceDrawingGuide(workspace, faceSelection(workspace, [TOP])));
    expect(guide.faceId).toBe(TOP);
    expect(guide.outline).toHaveLength(4);
    expect(guide.frame.normal.y).toBeCloseTo(1, 12);
    expectFailure(
      studioHybridDccFaceDrawingGuide(workspace, faceSelection(workspace, [TOP, 2])),
      "single-face-required",
    );
  });
});

/** 가로 columns x 세로 rows 칸의 사각형으로 이루어진 열린 평면 격자. 면 수가 많은 오브젝트를 싸게 만든다. */
function gridPlate(columns: number, rows: number): StudioEditableMesh {
  const positions: { x: number; y: number; z: number }[] = [];
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= columns; i += 1) positions.push({ x: i / columns, y: 0, z: j / rows });
  }
  const faces: number[][] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const at = (di: number, dj: number) => (j + dj) * (columns + 1) + i + di;
      faces.push([at(0, 0), at(0, 1), at(1, 1), at(1, 0)]);
    }
  }
  return createStudioEditableMeshFromPolygons(positions, faces);
}

function plateWorkspace(columns: number, rows: number): StudioHybridDccWorkspace {
  const base = createStudioHybridDccWorkspace("face-modeling-plate");
  const session = hybridDccRegisterAsset(base.session, "cube", gridPlate(columns, rows), {
    source: "primitive",
    creator: "studio",
    license: "CC0-1.0",
    useScope: "commercial",
    derivative: "original",
  });
  return { ...base, session, activeAssetId: "cube" };
}

describe("면 모델링 작업공간: 면이 너무 많은 오브젝트", () => {
  it("상한(8000면)을 한 면이라도 넘으면 범위·그리기 안내·계획·미리보기·확정이 모두 mesh-too-large 로 거부된다", () => {
    const workspace = plateWorkspace(80, 101);
    expect(workspace.session.state.geometry.records.cube!.mesh.faces).toHaveLength(8080);
    const selection = faceSelection(workspace, [0]);
    const request: StudioFaceModelingRequest = { tool: "push-pull", distance: 0.1 };
    expectFailure(studioHybridDccFaceModelingRange(workspace, selection, "push-pull"), "mesh-too-large");
    expectFailure(studioHybridDccFaceDrawingGuide(workspace, selection), "mesh-too-large");
    expectFailure(planStudioHybridDccFaceModeling(workspace, selection, request), "mesh-too-large");
    expectFailure(previewStudioHybridDccFaceModeling(workspace, selection, request), "mesh-too-large");
    expect(() => commitStudioHybridDccFaceModeling(workspace, selection, request)).toThrow();
  });

  it("정확히 상한(8000면)이면 같은 요청이 처리된다", () => {
    const workspace = plateWorkspace(80, 100);
    expect(workspace.session.state.geometry.records.cube!.mesh.faces).toHaveLength(STUDIO_FACE_MODELING_LIMITS.maxMeshFaces);
    const selection = faceSelection(workspace, [0]);
    expectOk(studioHybridDccFaceModelingRange(workspace, selection, "push-pull"));
    expectOk(previewStudioHybridDccFaceModeling(workspace, selection, { tool: "push-pull", distance: 0.1 }));
  });
});
