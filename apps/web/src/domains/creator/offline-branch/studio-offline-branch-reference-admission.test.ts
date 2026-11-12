import { beforeAll, describe, expect, it } from "vitest";

import { StudioCrdtDocument } from "../live/studio-crdt-document";
import { publishStudioCrdtSceneGraphDiff } from "../live/studio-crdt-scene-publisher";
import { initializeStudioOfflineBranchAutomerge } from "./studio-offline-branch-automerge";
import { StudioOfflineBranchRuntime } from "./studio-offline-branch-runtime";
import { MemoryStorage, runtimeOptions } from "./studio-offline-branch-runtime.test-support";
import { planStudioOfflineSceneTransition } from "./studio-offline-branch-scene-bridge";

import type { DrawEl, El, ImageEl, TextEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";

function text(id: string, value = id): TextEl {
  return { id, type: "text", text: value, x: 10, y: 20, width: 160, fontSize: 20, fill: "#111111", rotation: 0 };
}
function image(): ImageEl & { groupId: string; name: string } {
  return { id: "cafe-existing", type: "image", src: "data:image/png;base64,iVBORw0KGgo=", x: 29, y: 62, width: 663, height: 442, rotation: 0, name: "기존 카페 소재", groupId: "group-1" };
}
function stroke(): DrawEl {
  return { id: "new-stroke", type: "draw", kind: "freehand", mode: "pen", points: [10, 10, 20, 20], stroke: "#111111", strokeWidth: 4, opacity: 1 };
}
function page(elements: El[]): PageState {
  return { id: "page-1", elements, bg: "#ffffff", bgGrad: null, canvasH: 1200 };
}
function original(): El[] { return [text("text-before"), image(), text("text-after")]; }
function targetPlan(next: El[]) { return planStudioOfflineSceneTransition([page(original())], [page(next)]); }
const referenceError = "cafe-existing: 에셋 참조 요소는 서버 정본 연결 후 수정해 주세요.";
const insertionCases = [0, 1, 2, 3, "chain", "updated-chain", "delete-before", "delete-after", "replace-before"] as const;
function insertedElements(position: (typeof insertionCases)[number]): El[] {
  const next = structuredClone(original());
  if (typeof position === "number") next.splice(position, 0, text("new-text", "오프라인 대사"));
  else if (position === "delete-before") next.splice(0, 1);
  else if (position === "delete-after") next.splice(2, 1);
  else if (position === "replace-before") next.splice(0, 1, text("replacement-text", "교체한 대사"));
  else {
    next.splice(1, 0, text("new-1", "첫 대사"), text("new-2", "둘째 대사"));
    if (position === "updated-chain") next[0] = text("text-before", "함께 수정한 대사");
  }
  return next;
}

beforeAll(async () => { await initializeStudioOfflineBranchAutomerge(); });

describe("오프라인 변경에서 불변 참조와 실제 참조 편집 구분", () => {
  it.each([0, 1, 2, 3])("기존 소재가 그대로면 %i번째 새 대사를 허용한다", (index) => {
    const next = structuredClone(original());
    next.splice(index, 0, text("new-text", "오프라인 대사"));
    const plan = targetPlan(next);
    expect(plan.unsupported).toEqual([]);
    expect(plan.mutations.some((mutation) => mutation.targetId === "new-text")).toBe(true);
    expect(plan.mutations.some((mutation) => mutation.targetId === "cafe-existing")).toBe(false);
  });

  it.each([0, 1, 3])("기존 소재가 그대로면 %i번째 새 획도 허용한다", (index) => {
    const next = structuredClone(original()); next.splice(index, 0, stroke());
    const plan = targetPlan(next);
    expect(plan.unsupported).toEqual([]);
    expect(plan.mutations.some((mutation) => mutation.targetType === "stroke" && mutation.targetId === "new-stroke")).toBe(true);
    expect(plan.mutations.some((mutation) => mutation.targetId === "cafe-existing")).toBe(false);
  });

  it("내용이 같은 복사본 참조를 유지하며 기존 대사를 편집한다", () => {
    const next = structuredClone(original()); next[0] = text("text-before", "수정한 대사");
    expect(targetPlan(next).unsupported).toEqual([]);
  });

  it.each(["text-before", "text-after"])("지원되는 %s 삭제로 index가 달라져도 기존 소재 편집으로 오인하지 않는다", (id) => {
    const plan = targetPlan(original().filter((element) => element.id !== id));
    expect(plan.unsupported).toEqual([]);
    expect(plan.mutations.some((mutation) => mutation.action === "delete" && mutation.targetId === id)).toBe(true);
  });

  it("동일한 참조만 복사한 페이지는 변경 명령이 없다", () => {
    const source = page([image()]);
    expect(planStudioOfflineSceneTransition([source], [structuredClone(source)])).toEqual({ mutations: [], unsupported: [] });
  });

  it("소재의 같은 쪽에서 대사끼리 바꾼 순서는 소재 이동이 아니다", () => {
    const a = text("a"), b = text("b"), asset = image();
    expect(planStudioOfflineSceneTransition([page([a, b, asset])], [page([structuredClone(b), structuredClone(a), structuredClone(asset)])]).unsupported).toEqual([]);
  });

  it("새로운 소재 참조 추가는 계속 거절한다", () => {
    expect(planStudioOfflineSceneTransition([page([text("a")])], [page([text("a"), image()])]).unsupported).toContain(referenceError);
  });

  it.each([
    { x: 30 }, { width: 664 }, { rotation: 15 }, { opacity: 0.5 }, { src: "data:image/png;base64,changed" },
  ] satisfies Partial<ImageEl>[])("기존 소재의 변형·원본 변경 %j를 거절한다", (patch) => {
    const next = original().map((element) => element.id === "cafe-existing" ? { ...image(), ...patch } : element);
    expect(targetPlan(next).unsupported).toContain(referenceError);
  });

  it.each([{ hidden: true }, { name: "변경한 출처 표시" }, { groupId: "group-2" }, { frameClipId: "frame-2" }])("기존 소재 메타데이터·레이어 변경 %j도 거절한다", (patch) => {
    const next = original().map((element) => element.id === "cafe-existing" ? { ...image(), ...patch } : element);
    expect(targetPlan(next).unsupported).toContain(referenceError);
  });

  it("소재 참조 삭제는 계속 거절한다", () => {
    expect(targetPlan(original().filter((element) => element.id !== "cafe-existing")).unsupported).toContain(referenceError);
  });

  it("소재 내용을 바꾸지 않아도 기존 요소와 상대 순서를 바꾸면 거절한다", () => {
    expect(targetPlan([image(), text("text-before"), text("text-after")]).unsupported).toContain(referenceError);
  });

  it("숫자 index가 같아도 앞뒤 요소를 교환하여 소재를 가로지르면 거절한다", () => {
    expect(targetPlan([text("text-after"), image(), text("text-before")]).unsupported).toContain(referenceError);
  });

  it("소재의 페이지 이동은 계속 거절한다", () => {
    const previous = [page(original()), { ...page([]), id: "page-2" }];
    const next = [page(original().filter((element) => element.id !== "cafe-existing")), { ...page([image()]), id: "page-2" }];
    expect(planStudioOfflineSceneTransition(previous, next).unsupported).toContain("cafe-existing: 페이지 간 요소 이동은 온라인 정본 연결이 필요합니다.");
  });

  it("참조를 일반 대사 종류로 바꾸어도 거절한다", () => {
    expect(targetPlan(original().map((element) => element.id === "cafe-existing" ? text("cafe-existing") : element)).unsupported).toContain(referenceError);
  });

  it("내용이 같아도 손상된 참조 검증을 건너뛰지 않는다", () => {
    const malformed: El = { ...image(), frameClipId: "bad\nclip" };
    const plan = planStudioOfflineSceneTransition([page([malformed])], [page([structuredClone(malformed), text("new-text")])]);
    expect(plan.unsupported.length).toBeGreaterThan(0);
    expect(plan.unsupported.join(" ")).toContain("원고 컷 클립 ID가 올바르지 않습니다.");
  });

  it.each(insertionCases)("%s 위치 대사는 저널 재열기 후 정확한 순서로 복원되며 정본·서버 영수증이 아니다", async (position) => {
    // 실제 Automerge 엔진·런타임과 메모리 저장 adapter의 단위 검증이다. 브라우저 OPFS 증거는 별도다.
    const storage = new MemoryStorage();
    const branch = await StudioOfflineBranchRuntime.create(runtimeOptions(storage));
    const previous = [page(original())];
    const expected = insertedElements(position);
    const result = branch.stageSceneTransition(previous, [page(expected)]);
    expect(branch.projectPages(previous)[0]?.elements).toEqual(expected);
    await branch.close();
    expect(result.staged).toBe(true);
    expect(result.unsupported).toEqual([]);
    const reopened = await StudioOfflineBranchRuntime.create(runtimeOptions(storage));
    try {
      const projected = reopened.projectPages(previous);
      expect(projected[0]?.elements).toEqual(expected);
      expect(projected[0]?.elements.map((element) => element.id)).toEqual(expected.map((element) => element.id));
      expect(projected[0]?.elements.find((element) => element.id === "cafe-existing")).toEqual(image());
      expect(reopened.status.pendingOperations).toBeGreaterThan(0);
      expect(reopened.status.canonicalAuthority).toBe(false);
      expect(Object.keys(reopened.snapshot.receipts)).toHaveLength(0);
    } finally { await reopened.close(); }
  });

  it.each(insertionCases)("%s 위치 삽입을 실제 Yjs에 로컬 승격해도 순서·CAS 충돌이나 가짜 서버 영수증이 없다", async (position) => {
    // 권위 전환을 명시한 단위 fixture다. 네트워크 ACK는 만들지 않고 device 보호 결과만 사용한다.
    const branch = await StudioOfflineBranchRuntime.create(runtimeOptions(new MemoryStorage()));
    const previous = [page(original())];
    const expected = insertedElements(position);
    const document = new StudioCrdtDocument();
    publishStudioCrdtSceneGraphDiff(document, [], previous);
    const initialReference = document.getSceneElement("cafe-existing");
    try {
      expect(branch.stageSceneTransition(previous, [page(expected)]).staged).toBe(true);
      branch.observeCanonicalPages(previous);
      branch.setCanonicalAuthority(true);
      await branch.promotePending(document, async () => ({ protection: "device", serverSequence: null, acknowledgedAt: null, protectedUpdateIds: [] }));
      expect(branch.status.conflicts).toBe(0);
      expect(document.getSceneElements().map((element) => element.id)).toEqual(expected.map((element) => element.id));
      if (!initialReference) throw new Error("기존 참조 fixture가 없습니다.");
      // 신규 대사 때문에 계산된 orderIndex만 달라진다. 원본 참조의 내용·소속·삭제 상태는 그대로다.
      expect(document.getSceneElement("cafe-existing")).toMatchObject({ id: initialReference.id, pageId: initialReference.pageId, layerId: initialReference.layerId, payload: initialReference.payload, deleted: initialReference.deleted });
      expect(branch.snapshot.operations.some((operation) => operation.targetId === "cafe-existing")).toBe(false);
      expect(branch.snapshot.operations.length).toBeGreaterThan(0);
      expect(Object.values(branch.snapshot.receipts)).toHaveLength(branch.snapshot.operations.length);
      for (const receipt of Object.values(branch.snapshot.receipts)) {
        expect(receipt.state).toBe("canonical-local");
        expect(receipt.serverSequence).toBeNull();
      }
    } finally { document.destroy(); await branch.close(); }
  });
});
