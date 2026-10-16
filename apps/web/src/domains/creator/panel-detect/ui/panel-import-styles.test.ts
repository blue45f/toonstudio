import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { panelChipClass } from "./panel-import-styles";

/**
 * 키보드 사용자가 지금 어느 선택지에 있는지 보여야 한다(WCAG 2.4.7). 숨긴(sr-only) 라디오를 감싼 칩 라벨은
 * 포커스가 안쪽 input 에 있어서 라벨 자신의 focus-visible 만으로는 아무 표시도 나타나지 않는다.
 * (cn 이 겹치는 outline 클래스를 합치므로 outline-2 처럼 최종으로 남는 토큰으로 확인한다.)
 */

describe("컷 가져오기 칩 스타일 — 포커스 표시", () => {
  it("선택 여부와 무관하게 단추용 focus-visible 과 라벨용 has(:focus-visible) 테두리를 모두 가진다", () => {
    for (const active of [true, false]) {
      const tokens = new Set(panelChipClass(active).split(/\s+/u));
      for (const token of [
        "focus-visible:outline-2",
        "focus-visible:outline-accent",
        "has-[:focus-visible]:outline-2",
        "has-[:focus-visible]:outline-offset-2",
        "has-[:focus-visible]:outline-accent",
      ]) {
        expect(tokens.has(token), token).toBe(true);
      }
    }
  });

  it("안쪽 입력이 비활성이면 라벨도 눌리지 않는 모양으로 바뀐다", () => {
    expect(panelChipClass(false)).toContain("has-[:disabled]:cursor-not-allowed");
    expect(panelChipClass(false)).toContain("has-[:disabled]:opacity-45");
  });

  it("숨긴 라디오 input 은 모두 panelChipClass 를 쓰는 라벨 안에 있다(새 라디오 칩이 포커스 표시를 빠뜨리지 못한다)", () => {
    const folder = dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(folder)
      .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
      .map((name) => ({ name, code: readFileSync(join(folder, name), "utf8") }));
    const withRadios = sources.filter((source) => /type="radio"/u.test(source.code));
    expect(withRadios.map((source) => source.name).sort()).toEqual(["PanelCardFlow.tsx", "PanelDetectControls.tsx", "PanelReflowStep.tsx"]);
    for (const { name, code } of withRadios) {
      const radios = code.match(/type="radio"/gu)?.length ?? 0;
      const chipLabels = code.match(/<label[^>]*panelChipClass/gu)?.length ?? 0;
      expect({ name, radios }).toEqual({ name, radios: chipLabels });
    }
  });
});
