import { describe, expect, it } from "vitest";

import { PART_ROLES } from "../contracts";

import { KIT_OUTLINE_EXEMPT_ROLES, hullOutlineAllowed } from "./outline-policy";

import type { PartRole } from "../contracts";

/** 리드 결정 A-5·A-9가 정한 제외 역할(표를 바꾸면 이 테스트가 먼저 알린다). A-9: 머리 hull이 눈·눈썹을 깊이 테스트로 지운다. */
const EXEMPT: readonly PartRole[] = ["head", "eyeball", "iris", "pupil", "eye-highlight", "lash", "brow", "teeth", "tongue"];
const KEPT: readonly PartRole[] = ["skin", "hair", "top", "bottom", "shoes", "accessory", "underwear"];

describe("hull 외곽선 정책(A-5·A-9)", () => {
  it("제외 역할 9개 + 유지 역할 7개가 PART_ROLES 전체를 빠짐없이 나눈다(새 역할이 생기면 어느 쪽인지 정해야 한다)", () => {
    expect([...KIT_OUTLINE_EXEMPT_ROLES].sort()).toEqual([...EXEMPT].sort());
    expect([...EXEMPT, ...KEPT].sort()).toEqual([...PART_ROLES].sort());
  });

  it("키트 리그: 머리와 눈·입 안 계열 9개 역할은 hull을 켜지 않고 피부·헤어·의상·신발·액세서리·속옷은 켠다", () => {
    for (const role of EXEMPT) expect(hullOutlineAllowed("kit", role), role).toBe(false);
    for (const role of KEPT) expect(hullOutlineAllowed("kit", role), role).toBe(true);
  });

  it("절차 소스와 제작 패키지는 모든 역할에 hull을 켠다(기존 거동 유지)", () => {
    for (const kind of ["procedural", "package"] as const) for (const role of PART_ROLES) expect(hullOutlineAllowed(kind, role), `${kind}/${role}`).toBe(true);
  });
});
