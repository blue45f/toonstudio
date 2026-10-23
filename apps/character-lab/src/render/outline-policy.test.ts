import { describe, expect, it } from "vitest";

import { PART_ROLES } from "../contracts";

import { KIT_OUTLINE_EXEMPT_ROLES, KIT_SKIN_OUTLINE_WIDTH_SCALE, hullOutlineAllowed, hullOutlineWidthScale } from "./outline-policy";

import type { PartRole } from "../contracts";

/**
 * 리드 결정 A-5·A-9와 2026-10-11 속옷 hull 제외가 정한 제외 역할(표를 바꾸면 이 테스트가 먼저 알린다).
 * A-9: 머리 hull이 눈·눈썹을 깊이 테스트로 지운다. 2026-10-11: 속옷 hull이 의상을 뚫고 비친다(`outline-policy.ts` 근거 4). 몸(`skin`) hull은 SubMesh를 하나로 둬 다시 켰다(근거 3).
 */
const EXEMPT: readonly PartRole[] = ["head", "eyeball", "iris", "pupil", "eye-highlight", "lash", "brow", "teeth", "tongue", "underwear"];
/**
 * 레시피 v3(2026-10-23) 역할: 층 의상(inner·outer·legwear)과 헤어 부속은 의상·액세서리처럼 hull을 유지한다(정책 표 변경 없음).
 * 키트 v2 층이 실제로 나오면 inner hull이 outer를 뚫고 비치는지(근거 4와 같은 구성)를 GPU 실측으로 다시 판정한다.
 */
const KEPT: readonly PartRole[] = ["skin", "hair", "top", "bottom", "shoes", "accessory", "inner", "outer", "legwear", "hair-accessory"];

describe("hull 외곽선 정책(A-5·A-9)", () => {
  it("제외 역할 10개 + 유지 역할 10개가 PART_ROLES 전체를 빠짐없이 나눈다(새 역할이 생기면 어느 쪽인지 정해야 한다)", () => {
    expect([...KIT_OUTLINE_EXEMPT_ROLES].sort()).toEqual([...EXEMPT].sort());
    expect([...EXEMPT, ...KEPT].sort()).toEqual([...PART_ROLES].sort());
  });

  it("키트 리그: 머리·눈·입 안 계열·속옷 10개 역할은 hull을 켜지 않고 몸·헤어·의상(층 포함)·신발·액세서리(헤어 부속 포함)는 켠다", () => {
    for (const role of EXEMPT) expect(hullOutlineAllowed("kit", role), role).toBe(false);
    for (const role of KEPT) expect(hullOutlineAllowed("kit", role), role).toBe(true);
  });

  it("절차 소스와 제작 패키지는 모든 역할에 hull을 켠다(기존 거동 유지)", () => {
    for (const kind of ["procedural", "package"] as const) for (const role of PART_ROLES) expect(hullOutlineAllowed(kind, role), `${kind}/${role}`).toBe(true);
  });

  it("hull 폭 배율: 키트 몸만 얇게(0.5배) 그리고 나머지는 모두 1배다", () => {
    expect(KIT_SKIN_OUTLINE_WIDTH_SCALE).toBe(0.5);
    expect(hullOutlineWidthScale("kit", "skin")).toBe(0.5);
    for (const role of PART_ROLES) if (role !== "skin") expect(hullOutlineWidthScale("kit", role), role).toBe(1);
    for (const kind of ["procedural", "package"] as const) for (const role of PART_ROLES) expect(hullOutlineWidthScale(kind, role), `${kind}/${role}`).toBe(1);
  });
});
