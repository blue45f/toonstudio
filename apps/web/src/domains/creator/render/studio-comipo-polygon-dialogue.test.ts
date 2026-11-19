import { describe, expect, it, vi } from "vitest";

import { computeBubbleShapeGeometry } from "../lettering/studio-bubble-custom-shape";
import { runStudioPageAddDialogueBubbles } from "../studio-comipo-shipped";
import { pointInPolygon } from "../studio-selection-tools";

const upper = { id: "upper", type: "frame", x: 24, y: 24, width: 672, height: 264, points: [0, 0, 672, 0, 672, 176, 0, 264] };
const lower = { id: "lower", type: "frame", x: 24, y: 218, width: 672, height: 246, points: [0, 88, 672, 0, 672, 246, 0, 246] };

describe("사선·다각 컷에 대사 넣기", () => {
  it.each([
    { name: "간편 사선 2분할 아래 컷", frame: lower },
    { name: "삼각 컷", frame: { ...lower, height: 500, points: [0, 500, 672, 0, 672, 500] } },
    { name: "가운데가 패인 컷", frame: { ...lower, height: 500,
      points: [0, 0, 280, 0, 280, 160, 395, 160, 395, 0, 672, 0, 672, 500, 0, 500] } },
  ])("$name 안에 꼬리까지 들어가는 대사 두 개만 추가한다", ({ frame }) => {
    const sibling = { id: "existing", type: "bubble", variant: "speech", text: "기존 대사", x: 500, y: 210,
      width: 120, height: 42, rotation: 0, fill: "#fff", textFill: "#000", frameClipId: upper.id };
    const elements = [upper, sibling, frame];
    const result = runStudioPageAddDialogueBubbles({ elements, selected: null, canvasH: 1800 }, "민수: 비가 와.\n지영: 우산을 가져왔어.", (() => { let i = 0; return () => String(++i); })(), frame.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.elements.slice(0, 3)).toEqual(elements);
    const points = frame.points.flatMap((x, i, coords) => i % 2 ? [] : [{ x: frame.x + x, y: frame.y + coords[i + 1]! }]);
    const added = result.snapshot.decor.filter(element => element.id !== sibling.id);
    expect(added).toHaveLength(2);
    for (const el of added) {
      if (el.type !== "bubble") throw new Error("말풍선으로 생성되지 않았습니다.");
      expect(result.elements.find(e => e.id === el.id)?.frameClipId).toBe(frame.id);
      const tail = computeBubbleShapeGeometry({ ...el, theme: "classic" }).tailSpec?.length ?? 0;
      for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
        expect(pointInPolygon({ x: el.x + el.width * i / 10, y: el.y + (el.height + tail) * j / 10 }, points)).toBe(true);
      }
    }
  });

  it("공간이 부족하거나 점이 손상되면 일부 대사나 ID를 만들지 않는다", () => {
    for (const points of [[0, 0, 672, 0, 672, 2], [0, 0, 672, NaN, 672, 200], [0, 0, 672]]) {
      const createId = vi.fn(() => "unexpected");
      const elements = [{ ...lower, points }];
      expect(runStudioPageAddDialogueBubbles({ elements, canvasH: 1800, selected: null }, "민수: 안녕", createId, lower.id)).toEqual({ ok: false });
      expect(createId).not.toHaveBeenCalled();
    }
  });
});
