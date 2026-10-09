import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canvas = readFileSync(new URL("./StudioVirtualSpacePhaserCanvas.tsx", import.meta.url), "utf8");

describe("Phaser 게임 시간 설정", () => {
  it("델타 쿨다운(panicMax)을 기본 120프레임보다 훨씬 짧게 둔다(60fps 미만 기기에서 시작·탭 복귀 직후 아바타가 슬로모션이 되던 것)", () => {
    // Phaser는 쿨다운 동안 프레임 간격을 16.7ms로 잘라 물리를 프레임당 한 걸음만 돌린다. 14fps에서 120프레임은 약 8초다.
    const match = /\bfps:\s*\{\s*panicMax:\s*(\d+)\s*\}/u.exec(canvas);
    expect(match, "게임 설정에 fps.panicMax가 있어야 한다").not.toBeNull();
    expect(Number(match?.[1])).toBeLessThanOrEqual(20);
  });

  it("물리는 60Hz 고정 걸음이다(프레임이 늦으면 한 프레임에 여러 걸음을 따라잡는 Phaser 동작에 기댄다)", () => {
    expect(canvas).toMatch(/arcade:\s*\{[\s\S]*?fps:\s*60,\s*fixedStep:\s*true/u);
  });
});
