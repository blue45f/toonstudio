import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectStudioScopedSaveDocument, studioScopedSaveHasExcludedChanges, studioScopedSaveMutationId } from "./studio-scoped-save-document";

const context = { version: 1 as const, policyVersion: 1, grantIds: ["grant"], creations: [], restorations: [] };
afterEach(() => vi.unstubAllGlobals());
describe("담당 원고의 doc-only 저장 본문", () => {
  it("현재 요소만 반영하고 master·공용 설정·페이지 설정과 원본 객체는 보존한다", () => {
    const saved = { width: 800, master: { elements: [{ id: "logo" }] }, opaque: { retain: true }, pagesList: [{ id: "p", canvasH: 1200, bg: "old", elements: [{ id: "own", x: 0 }] }] };
    const runtime = { width: 900, master: { elements: [] }, pagesList: [{ id: "p", canvasH: 9, bg: "new", elements: [{ id: "own", x: 1 }] }] };
    expect(projectStudioScopedSaveDocument(saved, runtime)).toEqual({ ...saved, pagesList: [{ ...saved.pagesList[0], elements: [{ id: "own", x: 1 }] }] });
    expect(saved.pagesList[0]?.elements).toEqual([{ id: "own", x: 0 }]);
    expect(studioScopedSaveHasExcludedChanges(saved, runtime)).toBe(true);
  });
  it("서버의 미상 확장 누락과 현재 페이지 선택만으로 부분 저장을 오인하지 않는다", () => {
    const saved = { currentPageId: "p1", vendorOnly: { retain: true }, pagesList: [{ id: "p1", vendorOnly: 2, elements: [] }] };
    const runtime = { currentPageId: "p2", pagesList: [{ id: "p1", elements: [{ id: "own" }] }] };
    expect(studioScopedSaveHasExcludedChanges(saved, runtime)).toBe(false);
    expect(studioScopedSaveHasExcludedChanges({ ...saved, master: { elements: [{ id: "logo" }] } }, runtime)).toBe(true);
  });
  it("페이지 추가·재배치·중복을 같은 범위의 본문 저장으로 추정하지 않는다", () => {
    const saved = { pagesList: [{ id: "p1", elements: [] }, { id: "p2", elements: [] }] };
    for (const pagesList of [[{ id: "p1", elements: [] }], [{ id: "p2", elements: [] }, { id: "p1", elements: [] }], [{ id: "p1", elements: [] }, { id: "p1", elements: [] }]]) {
      expect(() => projectStudioScopedSaveDocument(saved, { pagesList })).toThrow();
    }
  });
  it("같은 요청 본문은 속성 순서와 재시작에 관계없이 같은 mutation ID를 쓴다", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const input = { baseRevision: 3, crdtServerSequence: "7", doc: { b: 2, a: 1 }, writeContext: context };
    const first = await studioScopedSaveMutationId("actor", "work", input);
    expect(await studioScopedSaveMutationId("actor", "work", { ...input, doc: { a: 1, b: 2 } })).toBe(first);
    expect(first).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
  });
  it("계정·원고·본문·현재 정책이 달라지면 이전 성공 ID를 재사용하지 않는다", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const input = { baseRevision: 3, crdtServerSequence: "7", doc: { content: 1 }, writeContext: context };
    const first = await studioScopedSaveMutationId("actor", "work", input);
    for (const next of [studioScopedSaveMutationId("other", "work", input), studioScopedSaveMutationId("actor", "other", input),
      studioScopedSaveMutationId("actor", "work", { ...input, doc: { content: 2 } }),
      studioScopedSaveMutationId("actor", "work", { ...input, writeContext: { ...context, policyVersion: 2 } })]) expect(await next).not.toBe(first);
  });
});
