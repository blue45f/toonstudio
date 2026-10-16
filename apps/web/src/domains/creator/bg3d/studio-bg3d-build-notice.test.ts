import { describe, expect, it } from "vitest";

import {
  describeStudioBg3dBuildNotice,
  STUDIO_BG3D_FOCUS_BUILT_LABEL,
  STUDIO_BG3D_RESTORE_WALLS_LABEL,
  summarizeStudioBg3dHiddenWalls,
  type StudioBg3dBuildNoticeInput,
} from "./studio-bg3d-build-notice";
import { buildStudioBg3dWebtoonBackground } from "./studio-bg3d-webtoon-background-templates";

import type { BgPrimitive } from "../studio-background-3d-metadata";

const wall = (id: string, name: string, visible?: boolean): BgPrimitive =>
  ({
    id,
    kind: "box",
    name,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#ffffff",
    ...(visible === undefined ? {} : { visible }),
  }) as BgPrimitive;

describe("summarizeStudioBg3dHiddenWalls", () => {
  it("숨김 상태인 조각의 id 와 벽별 조각 수를 처음 나온 순서로 모은다", () => {
    const summary = summarizeStudioBg3dHiddenWalls([
      wall("a", "바닥"),
      wall("b", "앞벽 벽체", false),
      wall("c", "앞벽 벽체", false),
      wall("d", "뒷벽 벽체"),
      wall("e", "오른벽 벽체", false),
      wall("f", "앞벽 벽체", false),
    ]);
    expect(summary.ids).toEqual(["b", "c", "e", "f"]);
    expect(summary.walls).toEqual([
      { label: "앞벽", pieces: 3 },
      { label: "오른벽", pieces: 1 },
    ]);
  });

  it("숨긴 것이 없으면 비어 있다", () => {
    expect(summarizeStudioBg3dHiddenWalls([wall("a", "바닥"), wall("b", "앞벽 벽체", true)])).toEqual({ ids: [], walls: [] });
    expect(summarizeStudioBg3dHiddenWalls([])).toEqual({ ids: [], walls: [] });
  });

  it("이름이 없거나 벽체가 아닌 숨김 도형도 id 는 잃지 않는다", () => {
    const unnamed = { ...wall("x", "", false), name: undefined } as unknown as BgPrimitive;
    const summary = summarizeStudioBg3dHiddenWalls([unnamed, wall("y", "의자 좌판", false)]);
    expect(summary.ids).toEqual(["x", "y"]);
    expect(summary.walls.map((entry) => entry.pieces)).toEqual([1, 1]);
  });

  it("실제 카탈로그 복도의 앞벽은 조각이 많고(이름이 모두 같다) 한 번에 모을 수 있다", () => {
    const build = buildStudioBg3dWebtoonBackground("corridor", 0, {
      autoCutawayCamera: { position: [0, 2, 14], target: [0, 1, 0] },
    })!;
    const summary = summarizeStudioBg3dHiddenWalls(build.primitives);
    expect(summary.walls).toHaveLength(1);
    expect(summary.walls[0]!.label).toBe("앞벽");
    expect(summary.walls[0]!.pieces).toBeGreaterThan(5);
    expect(summary.ids).toHaveLength(summary.walls[0]!.pieces);
    expect(new Set(summary.ids).size).toBe(summary.ids.length);
    // 조각 이름이 모두 같아 레이어 목록만으로는 구분하기 어렵다 — 그래서 id 목록이 필요하다.
    expect(new Set(build.primitives.filter((p) => p.visible === false).map((p) => p.name)).size).toBe(1);
  });
});

describe("describeStudioBg3dBuildNotice", () => {
  const hiddenOne = { ids: ["a", "b"], walls: [{ label: "앞벽", pieces: 2 }] };
  const base: StudioBg3dBuildNoticeInput = {
    label: "교실",
    objectCount: 99,
    hiddenWalls: { ids: [], walls: [] },
    wallsRestored: false,
    anchorX: 0,
  };

  it("숨긴 것도 밀린 것도 없으면 만든 것과 개수만 알린다", () => {
    expect(describeStudioBg3dBuildNotice(base)).toBe("교실 추가 완료 · 오브젝트 99개.");
  });

  it("숨긴 벽은 이름과 조각 수, 되돌리는 두 가지 길을 알린다", () => {
    expect(describeStudioBg3dBuildNotice({ ...base, hiddenWalls: hiddenOne })).toBe(
      "교실 추가 완료 · 오브젝트 99개. 시선을 가리는 앞벽 2조각을 숨겼어요. 아래 '숨긴 벽 되돌리기'나 레이어 목록의 눈 아이콘으로 다시 켤 수 있어요.",
    );
  });

  it("벽이 여럿이면 가운뎃점으로 이어 쓴다", () => {
    const text = describeStudioBg3dBuildNotice({
      ...base,
      hiddenWalls: { ids: ["a", "b", "c"], walls: [{ label: "앞벽", pieces: 2 }, { label: "오른벽", pieces: 1 }] },
    });
    expect(text).toContain("앞벽 2조각·오른벽 1조각을 숨겼어요");
  });

  it("되돌린 뒤에는 되돌렸다고 알리고 되돌리기 안내를 거둔다", () => {
    const text = describeStudioBg3dBuildNotice({ ...base, hiddenWalls: hiddenOne, wallsRestored: true });
    expect(text).toBe("교실 추가 완료 · 오브젝트 99개. 숨겼던 앞벽 2조각을 다시 보이게 했어요.");
    expect(text).not.toContain(STUDIO_BG3D_RESTORE_WALLS_LABEL);
  });

  it("기존 도형 때문에 옆으로 밀렸으면 거리를 소수 첫째 자리까지 알리고 이동 버튼 이름을 가리킨다", () => {
    expect(describeStudioBg3dBuildNotice({ ...base, anchorX: 148.5 })).toBe(
      "교실 추가 완료 · 오브젝트 99개. 기존 오브젝트와 겹치지 않게 +X 방향으로 148.5m 떨어진 곳에 만들었어요. 화면에 보이지 않으면 '새로 만든 곳 보기'를 눌러 주세요.",
    );
    expect(describeStudioBg3dBuildNotice({ ...base, anchorX: 12 })).toContain("+X 방향으로 12m 떨어진");
    expect(describeStudioBg3dBuildNotice({ ...base, anchorX: 4.2857 })).toContain("+X 방향으로 4.3m 떨어진");
    expect(describeStudioBg3dBuildNotice({ ...base, anchorX: 0 })).not.toContain("떨어진");
  });

  it("안내가 가리키는 버튼 이름은 실제 버튼 이름과 같다", () => {
    expect(STUDIO_BG3D_RESTORE_WALLS_LABEL).toBe("숨긴 벽 되돌리기");
    expect(STUDIO_BG3D_FOCUS_BUILT_LABEL).toBe("새로 만든 곳 보기");
    expect(describeStudioBg3dBuildNotice({ ...base, hiddenWalls: hiddenOne })).toContain(`'${STUDIO_BG3D_RESTORE_WALLS_LABEL}'`);
    expect(describeStudioBg3dBuildNotice({ ...base, anchorX: 3 })).toContain(`'${STUDIO_BG3D_FOCUS_BUILT_LABEL}'`);
  });
});
