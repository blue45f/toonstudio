import { describe, expect, it, vi } from "vitest";

import { hasErrorActionGuidance, isFailureCopy, violatesErrorPattern } from "@/shared/language/error-pattern";
import { findToneViolations, registersInFlow } from "@/shared/language/tone-policy";

import {
  STUDIO_BG3D_ASSET_PLACEMENT_INVALID_RECIPE_MESSAGE,
  STUDIO_BG3D_ASSET_PLACEMENT_RECIPES,
  STUDIO_BG3D_ASSET_PLACEMENT_WALL_NOT_FOUND_MESSAGE,
} from "./studio-bg3d-asset-placement-catalog";
import { planStudioBg3dAssetPlacement } from "./studio-bg3d-asset-placement.test-fixture";

import type {
  StudioBg3dAssetPlacementFailureCode,
  StudioBg3dAssetPlacementInput,
} from "./studio-bg3d-asset-placement-recipes";
import {
  STUDIO_BG3D_RECIPE_IN_PROGRESS_MESSAGE,
  STUDIO_BG3D_RECIPE_LOAD_FAILED_AGAIN_MESSAGE,
  STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE,
  STUDIO_BG3D_RECIPE_UNEXPECTED_MESSAGE,
} from "./studio-bg3d-editor-recipe-host";
import {
  STUDIO_BG3D_RECIPE_ATTACHMENT_MISSING_MESSAGE,
  STUDIO_BG3D_RECIPE_BOUNDS_UNAVAILABLE_MESSAGE,
  STUDIO_BG3D_RECIPE_BUSY_MESSAGES,
  STUDIO_BG3D_RECIPE_ENVIRONMENT_UNSUPPORTED_MESSAGE,
  STUDIO_BG3D_RECIPE_VERIFY_FAILED_MESSAGE,
  describeStudioBg3dRecipePlacedMessage,
} from "./studio-bg3d-editor-recipe-run";

// 번들 환경 판정은 카탈로그(정적 자산 매니페스트)에 기대므로 호스트 시험과 같은 가짜로 대체한다(문구와 무관).
vi.mock("./studio-bg3d-environment-catalog", () => ({
  isStudioBg3dEnvironmentAssetId: (id: string) => id.startsWith("ts-bg3d-"),
}));

// shared/language 의 두 가드(해요체 통일, 실패 문구의 "원인 + 다음 행동")는 사전(JSON)만 훑는다. 컴포넌트·모듈에 직접 적은
// 문구는 지나치므로, 배치 레시피가 사용자에게 보여 주는 모든 문구를 여기서 직접 검사한다.

const BASE: StudioBg3dAssetPlacementInput = {
  recipe: "floor",
  localBounds: { min: [0, 0, 0], max: [1, 2, 1] },
  seed: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
};

/** 실패 코드마다 그 코드를 내는 입력. 새 실패 코드가 생기면 이 표가 모자라서 아래 완전성 시험이 알려 준다. */
const FAILURE_INPUTS: Readonly<Record<StudioBg3dAssetPlacementFailureCode, StudioBg3dAssetPlacementInput>> = {
  "invalid-recipe": { ...BASE, recipe: "diagonal" as never },
  "invalid-bounds": { ...BASE, localBounds: null as never },
  "degenerate-size": { ...BASE, localBounds: { min: [0, 0, 0], max: [0, 0, 0] } },
  "invalid-seed": { ...BASE, seed: { ...BASE.seed, scale: [Number.NaN, 1, 1] } },
  "invalid-drop-point": { ...BASE, dropPoint: [Number.NaN, 0] },
  "invalid-scene-bounds": { ...BASE, recipe: "scene-center", sceneBounds: { min: [0, 0, Number.NaN], max: [1, 1, 1] } },
  "wall-not-found": { ...BASE, recipe: "wall", wall: null },
  "plan-failed": { ...BASE, recipe: "human-scale", humanHeightMeters: -1 },
  "scale-out-of-range": { ...BASE, recipe: "human-scale", humanHeightMeters: 1e9 },
  "position-out-of-range": { ...BASE, dropPoint: [1e9, 0] },
};

const FAILURE_COPY: ReadonlyArray<readonly [string, string]> = (
  Object.entries(FAILURE_INPUTS) as Array<[StudioBg3dAssetPlacementFailureCode, StudioBg3dAssetPlacementInput]>
).map(([code, input]): readonly [string, string] => {
  const result = planStudioBg3dAssetPlacement(input);
  if (result.ok) throw new Error(`${code} 입력이 실패하지 않았습니다.`);
  expect(result.code, code).toBe(code);
  return [`계획 실패 ${code}`, result.reason];
});

const NEW_COPY: ReadonlyArray<readonly [string, string]> = [
  ...STUDIO_BG3D_ASSET_PLACEMENT_RECIPES.map((recipe): readonly [string, string] => [`레시피 설명 ${recipe.id}`, recipe.description]),
  ...FAILURE_COPY,
  ["잘못된 배치 방식 이름", STUDIO_BG3D_ASSET_PLACEMENT_INVALID_RECIPE_MESSAGE],
  ["벽을 찾지 못함", STUDIO_BG3D_ASSET_PLACEMENT_WALL_NOT_FOUND_MESSAGE],
  ...Object.entries(STUDIO_BG3D_RECIPE_BUSY_MESSAGES).map(([name, text]): readonly [string, string] => [`막힘 안내 ${name}`, text]),
  ["환경 소재에 쓸 수 없음", STUDIO_BG3D_RECIPE_ENVIRONMENT_UNSUPPORTED_MESSAGE],
  ["장면 연결 정보 없음", STUDIO_BG3D_RECIPE_ATTACHMENT_MISSING_MESSAGE],
  ["모델 경계를 확인하지 못함", STUDIO_BG3D_RECIPE_BOUNDS_UNAVAILABLE_MESSAGE],
  ["모델 무결성을 확인하지 못함", STUDIO_BG3D_RECIPE_VERIFY_FAILED_MESSAGE],
  ["본문 불러오기 실패", STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE],
  ["본문 불러오기 연속 실패", STUDIO_BG3D_RECIPE_LOAD_FAILED_AGAIN_MESSAGE],
  ["이미 배치하는 중", STUDIO_BG3D_RECIPE_IN_PROGRESS_MESSAGE],
  ["예상 밖 오류", STUDIO_BG3D_RECIPE_UNEXPECTED_MESSAGE],
  ...STUDIO_BG3D_ASSET_PLACEMENT_RECIPES.map((recipe): readonly [string, string] => [
    `배치 성공 ${recipe.id}`,
    describeStudioBg3dRecipePlacedMessage(recipe.label),
  ]),
];

describe("배치 레시피 문구의 말투·오류 문형 가드", () => {
  it("실패 코드마다 입력이 있고 계획 실패 문구를 모두 모았다", () => {
    expect(FAILURE_COPY).toHaveLength(Object.keys(FAILURE_INPUTS).length);
    expect(new Set(FAILURE_COPY.map(([, text]) => text)).size).toBeGreaterThanOrEqual(9);
  });

  it.each(NEW_COPY)("%s: 해요체 한 가지로만 쓰고 실패 문구면 다음 행동이 있다", (_name, text) => {
    expect(text.length).toBeGreaterThan(10);
    expect(findToneViolations(text, "polite"), "합니다체 문장").toEqual([]);
    const registers = registersInFlow([text]);
    expect(registers.has("formal")).toBe(false);
    expect(registers.size).toBeLessThanOrEqual(1);
    expect(violatesErrorPattern(text)).toBe(false);
  });

  it("가드는 이 문구들을 실제로 읽는다(해요체 문장과 실패 계열 문구가 모두 잡힌다)", () => {
    for (const [name, text] of NEW_COPY) expect(registersInFlow([text]).has("polite"), name).toBe(true);
    const failures = NEW_COPY.filter(([, text]) => isFailureCopy(text));
    expect(failures.length).toBeGreaterThanOrEqual(5);
    for (const [name, text] of failures) expect(hasErrorActionGuidance(text), name).toBe(true);
  });

  it("대조군: 예전 문구(합니다체, 다음 행동 없는 실패)는 두 가드가 실제로 잡는다", () => {
    const old = "붙일 벽을 찾지 못했습니다.";
    expect(findToneViolations(old, "polite")).toHaveLength(1);
    expect(violatesErrorPattern(old)).toBe(true);
    expect(violatesErrorPattern("모델 경계를 읽지 못했어요.")).toBe(true);
  });
});
