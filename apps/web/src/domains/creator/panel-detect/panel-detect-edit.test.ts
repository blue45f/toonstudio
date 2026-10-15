import { describe, expect, it } from "vitest";

import { detectPanels } from "./panel-detect-core";
import {
  PANEL_EDIT_MIN_SIDE,
  addPanel,
  applyReadingOrder,
  commitPanelEdit,
  createEmptyPanelEditState,
  createPanelEditHistory,
  createPanelEditState,
  mergePanels,
  movePanelBy,
  movePanelInOrder,
  normalizePanelRect,
  redoPanelEdit,
  removePanel,
  reorderPanel,
  resizePanelEdge,
  setPanelRect,
  splitPanel,
  undoPanelEdit,
  validatePanelEditState,
  type PanelEditState,
} from "./panel-detect-edit";
import { FixtureImage, WHITE, mulberry32 } from "./panel-detect-fixtures";
import { tightenRectToContent } from "./panel-detect-tighten";

function gridState(readingOrder: "manga" | "comic" | "webtoon" = "comic"): PanelEditState {
  const image = new FixtureImage(1000, 1200, WHITE);
  image.art(20, 20, 460, 560, { seed: 0 });
  image.art(520, 20, 460, 560, { seed: 1 });
  image.art(20, 620, 960, 560, { seed: 2 });
  return createPanelEditState(detectPanels(image.raster(), { readingOrder }));
}

const ids = (state: PanelEditState): string[] => state.panels.map((panel) => panel.id);

describe("컷 편집 — 기본 전이", () => {
  it("감지 결과에서 시작하고 원점은 detected 다", () => {
    const state = gridState();
    expect(state.panels).toHaveLength(3);
    expect(state.panels.every((panel) => panel.origin === "detected" && panel.confidence !== null)).toBe(true);
    expect(validatePanelEditState(state)).toBe(true);
  });

  it("사각형을 숫자로 지정하면 이미지 안으로 맞추고 경고를 지운다", () => {
    const state = gridState();
    const next = setPanelRect(state, "panel-1", { x: -30, y: 10, width: 600, height: 300.4 });
    const panel = next.panels.find((candidate) => candidate.id === "panel-1");
    expect(panel).toMatchObject({ x: 0, y: 10, width: 570, height: 300 });
    expect(next.panels.find((candidate) => candidate.id === "panel-1")?.warnings).toEqual([]);
    expect(setPanelRect(state, "panel-1", { x: 0, y: 0, width: 3, height: 3 })).toBe(state);
    expect(setPanelRect(state, "없는-컷", { x: 0, y: 0, width: 50, height: 50 })).toBe(state);
    expect(setPanelRect(state, "panel-1", { x: Number.NaN, y: 0, width: 50, height: 50 })).toBe(state);
  });

  it("이동은 이미지 밖으로 나가지 않는다", () => {
    const state = gridState();
    const moved = movePanelBy(state, "panel-1", -500, 9_999);
    const panel = moved.panels.find((candidate) => candidate.id === "panel-1");
    expect(panel?.x).toBe(0);
    expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBe(1200);
    expect(movePanelBy(state, "panel-1", 0, 0)).toBe(state);
  });

  it("변 끌기는 반대편 변을 넘지 못하고 최소 크기에서 멈춘다", () => {
    const state = gridState();
    const first = state.panels[0];
    const squeezed = resizePanelEdge(state, first.id, "right", first.x - 500);
    const squeezedPanel = squeezed.panels.find((candidate) => candidate.id === first.id);
    expect(squeezedPanel?.width).toBe(PANEL_EDIT_MIN_SIDE);
    const grown = resizePanelEdge(state, first.id, "bottom", 99_999);
    expect(grown.panels.find((candidate) => candidate.id === first.id)?.height).toBe(1200 - first.y);
    const lefted = resizePanelEdge(state, first.id, "left", 5);
    expect(lefted.panels.find((candidate) => candidate.id === first.id)).toMatchObject({ x: 5, width: first.width + first.x - 5 });
    const topped = resizePanelEdge(state, first.id, "top", 12);
    expect(topped.panels.find((candidate) => candidate.id === first.id)).toMatchObject({ y: 12 });
    expect(validatePanelEditState(squeezed) && validatePanelEditState(grown)).toBe(true);
  });

  it("그려서 추가한 컷은 user 원점·신뢰도 없음이며 읽기 순서 자리에 들어간다", () => {
    const state = gridState();
    const next = addPanel(state, { x: 300, y: 600, width: 80, height: 80 });
    const added = next.panels.find((panel) => panel.origin === "user");
    expect(added).toMatchObject({ id: "user-1", confidence: null });
    expect(next.nextId).toBe(2);
    expect(addPanel(state, { x: 5, y: 5, width: 2, height: 2 })).toBe(state);
  });

  it("컷 삭제", () => {
    const state = gridState();
    expect(ids(removePanel(state, "panel-2"))).toEqual(["panel-1", "panel-3"]);
    expect(removePanel(state, "없음")).toBe(state);
  });
});

describe("컷 편집 — 경계 추가(나누기)와 경계 삭제(합치기)", () => {
  it("가로선으로 나누면 두 조각이 이어지고 간격만큼 비운다", () => {
    const state = gridState();
    const target = state.panels[2];
    const split = splitPanel(state, target.id, "horizontal", target.y + 200, 20);
    expect(split.panels).toHaveLength(4);
    const parts = split.panels.filter((panel) => panel.origin === "user");
    expect(parts).toHaveLength(2);
    const [top, bottom] = parts;
    expect(top.y + top.height).toBe(target.y + 190);
    expect(bottom.y).toBe(target.y + 210);
    expect(top.width).toBe(target.width);
    expect(validatePanelEditState(split)).toBe(true);
  });

  it("세로선으로 나눌 수 있고, 한쪽이 최소 크기보다 작아지면 거절한다", () => {
    const state = gridState();
    const target = state.panels[2];
    const split = splitPanel(state, target.id, "vertical", target.x + 300);
    expect(split.panels.filter((panel) => panel.origin === "user").map((panel) => panel.width)).toEqual([300, target.width - 300]);
    expect(splitPanel(state, target.id, "vertical", target.x + 3)).toBe(state);
    expect(splitPanel(state, target.id, "horizontal", target.y + target.height + 50)).toBe(state);
    expect(splitPanel(state, target.id, "horizontal", target.y + 100, -4)).toBe(state);
  });

  it("합치면 포함 사각형 하나가 되고 합친 컷들은 사라진다", () => {
    const state = gridState();
    const merged = mergePanels(state, ["panel-1", "panel-2"]);
    expect(merged.panels).toHaveLength(2);
    const panel = merged.panels.find((candidate) => candidate.origin === "user");
    expect(panel).toMatchObject({ x: 20, y: 20, width: 960, height: 560 });
    expect(mergePanels(state, ["panel-1"])).toBe(state);
    expect(mergePanels(state, ["x", "y"])).toBe(state);
  });
});

describe("컷 편집 — 읽기 순서", () => {
  it("읽기 순서 방식을 바꾸면 자동 정렬로 돌아간다", () => {
    const comic = gridState("comic");
    expect(ids(comic)).toEqual(["panel-1", "panel-2", "panel-3"]);
    const manga = applyReadingOrder(comic, "manga");
    expect(manga.panels.map((panel) => panel.x)).toEqual([520, 20, 20]);
    expect(manga.manualOrder).toBe(false);
  });

  it("순서를 직접 바꾸면 이후 편집이 순서를 건드리지 않는다", () => {
    const state = gridState();
    const moved = movePanelInOrder(state, "panel-3", -1);
    expect(ids(moved)).toEqual(["panel-1", "panel-3", "panel-2"]);
    expect(moved.manualOrder).toBe(true);
    const edited = movePanelBy(moved, "panel-1", 5, 5);
    expect(ids(edited)).toEqual(["panel-1", "panel-3", "panel-2"]);
    expect(movePanelInOrder(state, "panel-1", -1)).toBe(state);
    expect(reorderPanel(state, "panel-1", 99).panels.map((panel) => panel.id)).toEqual(["panel-2", "panel-3", "panel-1"]);
    expect(applyReadingOrder(moved, "comic").manualOrder).toBe(false);
  });

  it("자동 정렬 중이면 위치를 옮기는 편집이 순서를 다시 계산한다", () => {
    const state = gridState("comic");
    const dragged = setPanelRect(state, "panel-1", { x: 520, y: 700, width: 400, height: 400 });
    expect(ids(dragged)[0]).not.toBe("panel-1");
  });
});

describe("컷 편집 — 되돌리기/다시하기", () => {
  it("변화가 없으면 기록하지 않고, 되돌리기·다시하기가 상태를 오간다", () => {
    const base = gridState();
    let history = createPanelEditHistory(base);
    history = commitPanelEdit(history, base);
    expect(history.past).toHaveLength(0);
    history = commitPanelEdit(history, removePanel(history.present, "panel-1"));
    history = commitPanelEdit(history, removePanel(history.present, "panel-2"));
    expect(ids(history.present)).toEqual(["panel-3"]);
    history = undoPanelEdit(history);
    expect(ids(history.present)).toEqual(["panel-2", "panel-3"]);
    history = redoPanelEdit(history);
    expect(ids(history.present)).toEqual(["panel-3"]);
    history = undoPanelEdit(undoPanelEdit(history));
    expect(history.present).toBe(base);
    expect(undoPanelEdit(history)).toBe(history);
    history = commitPanelEdit(history, removePanel(base, "panel-3"));
    expect(history.future).toEqual([]);
    expect(redoPanelEdit(history)).toBe(history);
  });

  it("기록은 100개까지만 남긴다", () => {
    let history = createPanelEditHistory(gridState());
    for (let index = 0; index < 130; index += 1) {
      history = commitPanelEdit(history, movePanelBy(history.present, "panel-3", index % 2 === 0 ? 1 : -1, 0));
    }
    expect(history.past.length).toBe(100);
  });
});

describe("컷 편집 — 불변식(무작위 편집 열)", () => {
  it("어떤 편집 열을 적용해도 컷은 이미지 안·최소 크기·id 유일을 지킨다", () => {
    const random = mulberry32(2026);
    const pick = (max: number): number => Math.floor(random() * max);
    for (let run = 0; run < 150; run += 1) {
      let state = createEmptyPanelEditState(900, 1400, run % 3 === 0 ? "manga" : run % 3 === 1 ? "comic" : "webtoon");
      for (let step = 0; step < 40; step += 1) {
        const target = state.panels.length > 0 ? state.panels[pick(state.panels.length)].id : "없음";
        switch (pick(9)) {
          case 0:
            state = addPanel(state, { x: pick(950) - 30, y: pick(1450) - 30, width: pick(500), height: pick(500) });
            break;
          case 1:
            state = setPanelRect(state, target, { x: pick(950) - 30, y: pick(1450) - 30, width: pick(700) - 20, height: pick(700) - 20 });
            break;
          case 2:
            state = movePanelBy(state, target, pick(400) - 200, pick(400) - 200);
            break;
          case 3:
            state = resizePanelEdge(state, target, (["left", "right", "top", "bottom"] as const)[pick(4)], pick(1500) - 50);
            break;
          case 4:
            state = splitPanel(state, target, pick(2) === 0 ? "horizontal" : "vertical", pick(1400), pick(40));
            break;
          case 5:
            state = mergePanels(state, state.panels.slice(0, 1 + pick(3)).map((panel) => panel.id));
            break;
          case 6:
            state = removePanel(state, target);
            break;
          case 7:
            state = reorderPanel(state, target, pick(6) - 1);
            break;
          default:
            state = applyReadingOrder(state, (["manga", "comic", "webtoon"] as const)[pick(3)]);
        }
        expect(validatePanelEditState(state), `run ${run} step ${step}`).toBe(true);
      }
    }
  });

  it("normalizePanelRect 는 정수로 맞추고 이미지 밖은 잘라낸다", () => {
    expect(normalizePanelRect({ x: -5.6, y: 3.2, width: 100.7, height: 50 }, 200, 100)).toEqual({ x: 0, y: 3, width: 95, height: 50 });
    expect(normalizePanelRect({ x: 195, y: 0, width: 50, height: 50 }, 200, 100)).toBeNull();
  });
});

describe("컷 편집 — 내용에 맞추기", () => {
  it("대충 그린 사각형을 내용 경계까지 줄이고, 내용이 없으면 null", () => {
    const image = new FixtureImage(600, 600, WHITE);
    image.art(100, 120, 300, 200, { seed: 0 });
    const raster = image.raster();
    const gutter = { kind: "white", color: { r: 255, g: 255, b: 255 }, tolerance: 28, votes: 10 } as const;
    expect(tightenRectToContent(raster, gutter, { x: 40, y: 60, width: 460, height: 400 })).toEqual({ x: 100, y: 120, width: 300, height: 200 });
    expect(tightenRectToContent(raster, gutter, { x: 450, y: 450, width: 100, height: 100 })).toBeNull();
    expect(tightenRectToContent(raster, { ...gutter, kind: "none", color: null }, { x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});
