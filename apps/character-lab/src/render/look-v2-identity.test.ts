/**
 * 레시피 v3 `LOOK_V2_IDENTITY`(contracts/art-style.ts)가 v2 렌더 상수와 같은 값인지 대조한다(2026-10-23 CORE-1, 설계 K3).
 * 값이 어긋나면 v2 레시피를 v3로 올렸을 때 화풍 경로(R-1·R-2)가 다른 그림을 낸다. 엔진 파일(render/babylon/**)은 시험이 import할 수 없으므로
 * (architecture.test.ts 규칙 5) 그 상수는 소스 문자열에서 읽는다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LOOK_V2_IDENTITY, PART_ROLES, PART_ROLE_SHADE_GROUP } from "../contracts";

import { toonShadeTint } from "./material-presets";
import { TOON_RIM_EDGE0, TOON_RIM_EDGE1 } from "./toon-reference";

function engineSource(): string {
  const candidates = [
    typeof import.meta.dirname === "string" ? path.join(import.meta.dirname, "babylon", "character-engine.ts") : "",
    path.resolve(process.cwd(), "apps", "character-lab", "src", "render", "babylon", "character-engine.ts"),
    path.resolve(process.cwd(), "src", "render", "babylon", "character-engine.ts"),
  ];
  const found = candidates.find((candidate) => candidate !== "" && existsSync(candidate));
  if (found === undefined) throw new Error(`character-engine.ts를 찾지 못했습니다(cwd=${process.cwd()}).`);
  return readFileSync(found, "utf8");
}

describe("render: LOOK_V2_IDENTITY ↔ v2 렌더 상수", () => {
  it("그림자 틴트: 모든 역할에서 look.shade[그룹]이 toonShadeTint(역할)와 같다(multiply)", () => {
    for (const role of PART_ROLES) {
      expect(LOOK_V2_IDENTITY.shade[PART_ROLE_SHADE_GROUP[role]], role).toEqual({ kind: "multiply", rgb: [...toonShadeTint(role)] });
    }
  });

  it("림 경계는 툰 기준 구현 상수와 같다", () => {
    expect(LOOK_V2_IDENTITY.rim.edge0).toBe(TOON_RIM_EDGE0);
    expect(LOOK_V2_IDENTITY.rim.edge1).toBe(TOON_RIM_EDGE1);
    expect(LOOK_V2_IDENTITY.rim.strength).toBe(1);
  });

  it("엔진 소스의 hull 폭·외곽선 색·림 색과 같다", () => {
    const source = engineSource();
    const width = /export const TOON_OUTLINE_WIDTH = ([0-9.]+);/u.exec(source)?.[1];
    expect(width).toBeDefined();
    expect(Number(width) * 1000).toBeCloseTo(LOOK_V2_IDENTITY.line.widthMm, 12);
    const outline = /mesh\.outlineColor\.set\(([0-9.]+), ([0-9.]+), ([0-9.]+)\)/u.exec(source);
    expect(outline).not.toBeNull();
    expect(LOOK_V2_IDENTITY.line.color).toEqual({ mode: "fixed", rgb: [Number(outline?.[1]), Number(outline?.[2]), Number(outline?.[3])] });
    const rim = /rimColor: \[([0-9.]+), ([0-9.]+), ([0-9.]+)\]/u.exec(source);
    expect(rim).not.toBeNull();
    expect(LOOK_V2_IDENTITY.rim.color).toEqual([Number(rim?.[1]), Number(rim?.[2]), Number(rim?.[3])]);
  });
});
