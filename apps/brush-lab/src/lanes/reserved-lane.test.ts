import { describe, expect, it } from "vitest";

import { InvalidStateError } from "../engine/core/errors";
import { presetById } from "../engine/presets/catalog";

import { reservedDescriptor } from "./reserved-lane";

describe("reserved 레인", () => {
  it("probe는 not-implemented이고 beginStroke는 색 옵션을 받아도 같은 InvalidStateError로 거부한다(색은 무시, 획은 받지 않는다)", async () => {
    const lane = reservedDescriptor("webgpu-compute", "예약 레인", "candidate", "시험").create();
    const report = await lane.probe({ clock: { now: () => 0 } });
    expect(report).toMatchObject({ status: "unavailable", reasons: ["not-implemented"] });
    const program = presetById("pencil-hb");
    expect(() => lane.beginStroke(program, 1)).toThrow(InvalidStateError);
    expect(() => lane.beginStroke(program, 1, { color: [1, 0, 0, 1] })).toThrow(InvalidStateError);
    // 색이 잘못돼도 예약 레인의 사유는 같다(색 검증 오류로 사유를 흐리지 않는다).
    expect(() => lane.beginStroke(program, 1, { color: [9, 0, 0, 1] })).toThrow(/예약 레인은 beginStroke를 지원하지 않는다/);
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
  });
});
