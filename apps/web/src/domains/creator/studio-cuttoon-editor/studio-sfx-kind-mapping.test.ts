import { describe, expect, it } from "vitest";

import {
  mapSfxCuesToStingerCues,
  mapSfxKindToStingerPreset,
} from "../studio-sfx-kind-mapping";

describe("studio-sfx-kind-mapping", () => {
  it("종류 5종을 스팅어 프리셋으로 매핑한다", () => {
    expect(mapSfxKindToStingerPreset("heartbeat")).toBe("heartbeat");
    expect(mapSfxKindToStingerPreset("impact")).toBe("hit");
    expect(mapSfxKindToStingerPreset("bright")).toBe("sparkle");
    expect(mapSfxKindToStingerPreset("dark")).toBe("tension");
    expect(mapSfxKindToStingerPreset("soft")).toBe("droplet");
  });

  it("모르는 종류는 조용히 대체하지 않고 null이다", () => {
    expect(mapSfxKindToStingerPreset("unknown")).toBeNull();
    expect(mapSfxKindToStingerPreset("")).toBeNull();
  });

  it("큐 목록을 재생용 스팅어 큐로 바꾸고 매핑 불가·음수 시점은 제외한다", () => {
    const mapped = mapSfxCuesToStingerCues([
      { kind: "heartbeat", atSeconds: 0 },
      { kind: "impact", atSeconds: 2 },
      { kind: "dark", atSeconds: -1 },
    ]);
    expect(mapped).toEqual([
      { presetId: "heartbeat", atSeconds: 0 },
      { presetId: "hit", atSeconds: 2 },
    ]);
  });
});
