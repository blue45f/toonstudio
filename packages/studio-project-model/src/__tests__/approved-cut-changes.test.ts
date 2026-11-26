import { describe, expect, it } from "vitest";

import { approvedCutChangeSchema, compareApprovedCuts } from "../graph/approved-cut-changes";

interface SampleElement { id: string; type: string; frameClipId?: string; text?: string; src?: string }
interface SamplePage { id: string; elements: SampleElement[] }

const before: { width: number; pagesList: SamplePage[] } = { width: 720, pagesList: Array.from({ length: 8 }, (_, index) => ({
  id: `page-${index}`, elements: [
    { id: "a", type: "frame" }, { id: "b", type: "frame" },
    { id: "txt", type: "bubble", frameClipId: "a", text: "내가 오늘까지 보내지 않을게." },
    { id: "photo", type: "image", frameClipId: "b", src: "image1.png" },
  ],
})) };

describe("승인 당시 원고의 변경 컷 판정", () => {
  it("편집 화면 위치·메모를 바꿔도 원고는 같고, 8페이지 중 바뀐 대사 한 줄은 원문을 보존한다", () => {
    const after = structuredClone(before);
    expect(compareApprovedCuts(before, { ...after, currentPageId: "page-1", comments: ["메모"] })).toEqual([]);
    after.pagesList[3]!.elements[2]!.text = "네가 내일까지 보내 줄래?";
    const changes = compareApprovedCuts(before, after);
    expect(changes).toEqual([{ pageId: "page-3", frameId: "a", beforeIndex: 3, afterIndex: 3, kinds: ["dialogue"],
      dialogue: [{ elementId: "txt", before: "내가 오늘까지 보내지 않을게.", after: "네가 내일까지 보내 줄래?" }] }]);
    expect(approvedCutChangeSchema.safeParse(changes[0]).success).toBe(true);
  });

  it("프레임 이동·이미지 교체·레이어 순서를 식별하고 원고에 없는 소속을 추정하지 않는다", () => {
    const after = structuredClone(before);
    const [a,b,txt,photo] = after.pagesList[3]!.elements;
    after.pagesList[3]!.elements = [a!, b!, { ...photo!, src: "image2.png" }, { ...txt!, frameClipId: undefined }];
    const changes = compareApprovedCuts(before, after);
    expect(changes).toHaveLength(3);
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ frameId: "b", kinds: expect.arrayContaining(["image", "layer"]) }),
      expect.objectContaining({ frameId: "a", kinds: ["layer"] }),
      expect.objectContaining({ frameId: null, kinds: ["layer"] }),
    ]));
  });

  it("추가·삭제로 이동한 기존 페이지를 보존하며 공통 페이지 순서 변경을 찾는다", () => {
    const next = structuredClone(before);
    next.pagesList.shift();
    next.pagesList.push({ id: "new", elements: [] });
    const changed = compareApprovedCuts(before, next);
    expect([...new Set(changed.map(row => row.pageId))]).toEqual(["new", "page-0"]);
    expect(changed.filter(row => row.pageId === "page-0").map(row => row.frameId)).toEqual(["a", "b"]);
    expect(changed.find(row => row.pageId === "new")).toMatchObject({ kinds: ["page"], dialogue: [] });
    next.pagesList.reverse();
    expect(compareApprovedCuts(before, next).some((row) => row.pageId === "page-1" && row.kinds.includes("page"))).toBe(true);
  });

  it("공통 마스터의 변경은 표시한 페이지에만 연결한다", () => {
    const source = { ...before, pagesList: before.pagesList.map((page, index) => ({ ...page, hideMaster: index > 0 })) };
    expect(compareApprovedCuts(source, { ...source, master: { elements: [{ type: "image", id: "logo" }] } }))
      .toEqual([expect.objectContaining({ pageId: "page-0", frameId: null, kinds: ["image", "layer"] })]);
  });

  it("한 페이지의 8프레임 중 실제로 수정한 대사 한 줄만 변경 목록에 남긴다", () => {
    const elements = Array.from({ length: 8 }, (_, i) => [
      { id: `frame-${i}`, type: "frame" }, { id: `bubble-${i}`, type: "bubble", frameClipId: `frame-${i}`, text: "오늘 보내." },
    ]).flat();
    const page = { id: "episode", elements };
    const after = { ...page, elements: elements.map(el => el.id === "bubble-5" ? { ...el, text: "내일 보내." } : el) };
    expect(compareApprovedCuts({ pagesList: [page] }, { pagesList: [after] })).toEqual([{
      pageId: "episode", frameId: "frame-5", beforeIndex: 0, afterIndex: 0, kinds: ["dialogue"],
      dialogue: [{ elementId: "bubble-5", before: "오늘 보내.", after: "내일 보내." }],
    }]);
  });

  it("번역 모드 밖에서 고친 영어와 삭제한 일본어도 같은 프레임의 로케일별 근거로 묶는다", () => {
    const page = { id: "p", elements: [{ id: "f", type: "frame" }, { id: "b", type: "bubble", text: "보내지 마.", frameClipId: "f" }] };
    const old = { ...page, dialogueI18n: { b: { source: "보내지 마.", en: "Do not send it.", ja: "送らないで。" } } };
    const next = { ...page, dialogueI18n: { b: { source: "보내지 마.", en: "Send it." } } };
    const changes = compareApprovedCuts({ pagesList: [old] }, { pagesList: [next] });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ frameId: "f", kinds: ["dialogue"], dialogue: [
      { elementId: "b", locale: "en", before: "Do not send it.", after: "Send it." },
      { elementId: "b", locale: "ja", before: "送らないで。", after: null },
    ] });
    expect(approvedCutChangeSchema.safeParse(changes[0]).success).toBe(true);
  });

  it.each([true, false])("페이지 추가·삭제에 프레임별 대사·이미지 근거를 남긴다 (추가 %s)", added => {
    const unchanged = { id: "unchanged", elements: [] };
    const page = { id: "added", elements: [
      { id: "frame", type: "frame" }, { id: "balloon", type: "bubble", frameClipId: "frame", text: "금요일까지 보내지 마." },
      { id: "img", type: "image", frameClipId: "frame", src: "image.png" },
    ] };
    const withPage = { pagesList: [unchanged, page] }, withoutPage = { pagesList: [unchanged] };
    const diff = added ? compareApprovedCuts(withoutPage, withPage) : compareApprovedCuts(withPage, withoutPage);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ frameId: "frame", beforeIndex: added ? null : 1, afterIndex: added ? 1 : null,
      kinds: expect.arrayContaining(["dialogue", "image", "layer", "page"]),
      dialogue: [{ elementId: "balloon", before: added ? null : "금요일까지 보내지 마.", after: added ? "금요일까지 보내지 마." : null }] });
  });

  it("보이는 마스터 레이어에서 바꾼 문장을 페이지 요소와 구분한다", () => {
    const source = { pagesList: [{ id: "p", elements: [] }, { id: "q", elements: [], hideMaster: true }],
      master: { elements: [{ id: "caption", type: "text", text: "원본" }] } };
    const next = { ...source, master: { elements: [{ id: "caption", type: "text", text: "수정" }] } };
    expect(compareApprovedCuts(source, next)).toEqual([{
      pageId: "p", frameId: null, beforeIndex: 0, afterIndex: 0, kinds: ["dialogue", "layer"],
      dialogue: [{ elementId: "caption", origin: "master", before: "원본", after: "수정" }],
    }]);
  });
  it("중복 식별자·없는 요소 목록·손상된 대사를 빈 변경 목록으로 돌려주지 않는다", () => {
    expect(() => compareApprovedCuts(before, { pagesList: [before.pagesList[0], before.pagesList[0]] })).toThrow();
    expect(() => compareApprovedCuts({ pagesList: [] }, before)).toThrow();
    expect(() => compareApprovedCuts(before, { pagesList: [{ id: "wrong", elements: null }] })).toThrow();
    expect(() => compareApprovedCuts(before, { pagesList: [{ id: "wrong", elements: [{ id: "a", type: "bubble", text: 4 }] }] })).toThrow();
  });
});
