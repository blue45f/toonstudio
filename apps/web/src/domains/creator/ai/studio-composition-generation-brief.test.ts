import { describe, expect, it } from "vitest";

import {
  buildCompositionGenerationBrief,
  renderCompositionBriefPreviewDataUrl,
  type CompositionGenerationSnapshot,
} from "./studio-composition-generation-brief";

const BASE: CompositionGenerationSnapshot = Object.freeze({
  characterId: "char-hero-01",
  characterName: "주인공",
  characterAppearance: ["검은 단발", "교복 재킷"],
  posePresetId: "dramatic-shock-stepback",
  poseDescription: "경악하며 뒷걸음질",
  camera: Object.freeze({
    fovDegrees: 35,
    azimuthDegrees: 30,
    elevationDegrees: 0,
    framing: "upper-body" as const,
  }),
  lightingPresetId: "twilight",
  environmentId: "school_classroom",
});

describe("buildCompositionGenerationBrief", () => {
  it("스냅샷을 결정적 프롬프트와 일관성 키로 조립한다", () => {
    const result = buildCompositionGenerationBrief(BASE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.prompt).toContain("character: 주인공 (char-hero-01)");
    expect(result.request.prompt).toContain("three-quarter view from the right");
    expect(result.request.prompt).toContain("upper body shot");
    expect(result.request.prompt).toContain(
      "keep the exact pose and camera angle of the composition reference",
    );
    expect(result.request.consistencyKeys).toEqual([
      "character:char-hero-01",
      "pose:dramatic-shock-stepback",
      "environment:school_classroom",
      "lighting:twilight",
    ]);
    expect(result.request.requiresCompositionReference).toBe(true);
    expect(result.request.fallback).toBe("insert-capture-as-is");
    expect(result.request.aspectHint).toBe("vertical-webtoon");
  });

  it("같은 입력은 같은 출력을 낸다 (결정성)", () => {
    const a = buildCompositionGenerationBrief(BASE);
    const b = buildCompositionGenerationBrief(BASE);
    expect(a).toEqual(b);
  });

  it("캐릭터가 없으면 부분 패킷을 만들지 않고 실패한다", () => {
    const result = buildCompositionGenerationBrief({
      ...BASE,
      characterId: "  ",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("missing-character");
  });

  it("화각이 범위를 벗어나면 invalid-fov로 실패한다", () => {
    const result = buildCompositionGenerationBrief({
      ...BASE,
      camera: { ...BASE.camera, fovDegrees: Number.NaN },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("invalid-fov");
  });

  it("와이드 샷은 가로 힌트, 뒷모습 방위는 back view로 조립된다", () => {
    const result = buildCompositionGenerationBrief({
      ...BASE,
      camera: { fovDegrees: 50, azimuthDegrees: 180, elevationDegrees: 20, framing: "wide-shot" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.aspectHint).toBe("landscape");
    expect(result.request.prompt).toContain("back view");
    expect(result.request.prompt).toContain("high angle looking down");
  });

  it("한국어 브리프에는 구도·포즈·조명이 줄 단위로 담긴다", () => {
    const result = buildCompositionGenerationBrief(BASE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.briefKo).toContain("구도: 상반신");
    expect(result.request.briefKo).toContain("포즈: 경악하며 뒷걸음질");
    expect(result.request.briefKo).toContain("조명: twilight");
  });

  it("작가 화풍 DNA(styleDnaId)와 스크롤 호흡을 브리프에 결합하고 SVG 와이어프레임 프리뷰를 생성한다", () => {
    const snapshot: CompositionGenerationSnapshot = {
      ...BASE,
      styleDnaId: "k-action-sharp",
      scrollPacingHint: "fast-action",
    };
    const result = buildCompositionGenerationBrief(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.consistencyKeys).toContain("style-dna:k-action-sharp");
    expect(result.request.briefKo).toContain("화풍 DNA:");
    expect(result.request.briefKo).toContain("빠른 액션 스크롤");

    const previewUrl = renderCompositionBriefPreviewDataUrl(snapshot, result.request);
    expect(previewUrl.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(decodeURIComponent(previewUrl)).toContain("주인공");
  });
});

