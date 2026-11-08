import { describe, expect, it } from "vitest";

import { PAGE_NOTE_MAX, STUDIO_PROJECT_MAX_PAGES } from "../page/studio-page-constants";
import { canCopyEpisodeShots, canInitializeEpisodeShotPages, initializeEpisodeShotPages } from "./studio-episode-shot-pages";

import type { PageState } from "../studio-page-state";

const title = "1화 원고";
const starter: PageState = {
  id: "starter", name: title, elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1_440,
};
const shots = [{ summary: "C01 사서가 도장을 꺼낸다." }, { summary: "학생이 녹음을 마친다." }] as const;

describe("회차 샷의 콘티 페이지 초기화", () => {
  it("첫 페이지의 ID와 규격을 유지하고 컷 번호와 샷 전문을 편집 가능한 메모로 옮긴다", () => {
    const pages = initializeEpisodeShotPages([starter], title, shots);
    expect(pages?.map(({ name, note }) => [name, note])).toEqual([
      ["C01", shots[0].summary], ["C02", shots[1].summary],
    ]);
    expect(pages?.[0]?.id).toBe(starter.id);
    expect(new Set(pages?.map(({ id }) => id)).size).toBe(2);
    for (const page of pages ?? []) {
      expect(page).toMatchObject({ canvasH: 1_440, bg: "#ffffff", bgGrad: null, elements: [] });
    }
    expect(starter.name).toBe(title);
    expect(starter.note).toBeUndefined();
    expect(initializeEpisodeShotPages(pages ?? [], title, shots)).toBeNull();
  });

  it("이름 없는 빈 원고에도 적용되며 한 컷짜리 기획도 두 번 반영하지 않는다", () => {
    const unnamed = { ...starter };
    delete unnamed.name;
    const pages = initializeEpisodeShotPages([unnamed], title, [shots[0]]);
    expect(pages).toHaveLength(1);
    expect(canInitializeEpisodeShotPages(pages ?? [], "C01")).toBe(false);
  });

  it("프레임·검수·메모·배경 등 편집 흔적이 하나라도 있으면 기존 원고를 보존한다", () => {
    const authored: PageState[] = [
      { ...starter, elements: [{ id: "f1", type: "frame", x: 0, y: 0, width: 100, height: 100, stroke: "#222", strokeWidth: 2 }] },
      { ...starter, note: "원본 메모" }, { ...starter, shotType: "wide" },
      { ...starter, review: { status: "approved", locked: true } },
      { ...starter, hideMaster: true }, { ...starter, name: "수정한 제목" },
      { ...starter, bg: "#f5d0c8" }, { ...starter, bgGrad: ["#fff", "#abc"] },
    ];
    for (const page of authored) {
      expect(canInitializeEpisodeShotPages([page], title)).toBe(false);
      expect(initializeEpisodeShotPages([page], title, shots)).toBeNull();
    }
    expect(initializeEpisodeShotPages([], title, shots)).toBeNull();
    expect(initializeEpisodeShotPages([starter, { ...starter, id: "two" }], title, shots)).toBeNull();
  });

  it("샷 수와 메모 길이 한도를 검사하고 잘못된 샷이 있으면 원고 전체를 보존한다", () => {
    expect(initializeEpisodeShotPages([starter], title, [])).toBeNull();
    expect(initializeEpisodeShotPages([starter], title, Array.from({ length: STUDIO_PROJECT_MAX_PAGES + 1 }, () => shots[0]))).toBeNull();
    for (const summary of ["  ", "가".repeat(PAGE_NOTE_MAX + 1)]) {
      expect(initializeEpisodeShotPages([starter], title, [...shots, { summary }])).toBeNull();
    }
    const exact = "가".repeat(PAGE_NOTE_MAX);
    expect(canCopyEpisodeShots([{ summary: exact }])).toBe(true);
    expect(canCopyEpisodeShots([{ summary: exact + "가" }])).toBe(false);
    expect(initializeEpisodeShotPages([starter], title, [{ summary: exact }])?.[0]?.note).toBe(exact);
  });
});
