import { describe, expect, it, vi } from "vitest";

import { PHOTO_WEBTOON_PRESETS } from "../../studio-photo-webtoon-preset";
import {
  STUDIO_AI_DEFAULT_SETTINGS,
  type StudioAiSettings,
} from "../studio-ai-client";
import { validateCanonSheetDraft } from "./studio-character-canon";
import {
  buildPhotoCharacterCanonDraft,
  buildPhotoCharacterGenerationPrompt,
  canLeavePhotoStep,
  canLeaveStyleStep,
  photoCharacterStyleOption,
  resolvePhotoCharacterResultImage,
  runPhotoCharacterGeneration,
  PHOTO_CHARACTER_STYLE_OPTIONS,
  type PhotoCharacterGenerateFn,
} from "./studio-photo-character-wizard";

const PHOTO = "data:image/webp;base64,photo";
const GENERATED = "data:image/png;base64,generated";

const CONFIGURED: StudioAiSettings = {
  ...STUDIO_AI_DEFAULT_SETTINGS,
  apiKey: "sk-test",
};

describe("사진→캐릭터 스타일 카탈로그", () => {
  it("기존 사진 프리셋 3종과 id 집합이 정확히 일치한다", () => {
    expect(PHOTO_CHARACTER_STYLE_OPTIONS.map((option) => option.id)).toEqual(
      PHOTO_WEBTOON_PRESETS.map((preset) => preset.id),
    );
    for (const option of PHOTO_CHARACTER_STYLE_OPTIONS) {
      const preset = PHOTO_WEBTOON_PRESETS.find((p) => p.id === option.id);
      expect(option.label).toBe(preset?.label);
      expect(option.tip).toBe(preset?.tip);
      expect(option.swatch).toBe(preset?.swatch);
      expect(option.generationPrompt.length).toBeGreaterThan(0);
    }
  });

  it("없는 스타일 id는 undefined를 돌려준다", () => {
    expect(photoCharacterStyleOption("sd-chibi")).toBeUndefined();
    expect(photoCharacterStyleOption("vivid-cartoon")?.label).toBe("선명한 카툰");
  });
});

describe("단계 전이 가드", () => {
  it("사진이 있어야 사진 단계를 벗어난다", () => {
    expect(canLeavePhotoStep(null)).toBe(false);
    expect(canLeavePhotoStep(PHOTO)).toBe(true);
  });

  it("카탈로그에 있는 스타일을 골라야 스타일 단계를 벗어난다", () => {
    expect(canLeaveStyleStep(null)).toBe(false);
    expect(canLeaveStyleStep("nope")).toBe(false);
    expect(canLeaveStyleStep("mono-screentone")).toBe(true);
  });

  it("결과 이미지는 생성 결과 우선, 없으면 원본 선택 시에만 원본 사진", () => {
    expect(
      resolvePhotoCharacterResultImage({
        generatedDataUrl: GENERATED,
        photoDataUrl: PHOTO,
        useOriginalPhoto: false,
      }),
    ).toBe(GENERATED);
    expect(
      resolvePhotoCharacterResultImage({
        generatedDataUrl: null,
        photoDataUrl: PHOTO,
        useOriginalPhoto: true,
      }),
    ).toBe(PHOTO);
    expect(
      resolvePhotoCharacterResultImage({
        generatedDataUrl: null,
        photoDataUrl: PHOTO,
        useOriginalPhoto: false,
      }),
    ).toBeNull();
  });
});

describe("생성 프롬프트 조립", () => {
  it("스타일 지시문을 그대로 쓰고, 메모가 있으면 덧붙인다", () => {
    const base = buildPhotoCharacterGenerationPrompt("vivid-cartoon");
    expect(base).toContain("웹툰 캐릭터 일러스트");
    expect(buildPhotoCharacterGenerationPrompt("vivid-cartoon", " 안경 추가 ")).toBe(
      `${base}\n추가 요청: 안경 추가`,
    );
    expect(buildPhotoCharacterGenerationPrompt("vivid-cartoon", "  ")).toBe(base);
  });

  it("없는 스타일은 null", () => {
    expect(buildPhotoCharacterGenerationPrompt("figure")).toBeNull();
  });
});

describe("생성 실행 계약", () => {
  it("사진이 없으면 생성 함수를 호출하지 않고 invalid_input", async () => {
    const generate: PhotoCharacterGenerateFn = vi.fn();
    const result = await runPhotoCharacterGeneration(
      { settings: CONFIGURED, photoDataUrl: null, styleId: "vivid-cartoon" },
      generate,
    );
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("스타일이 없으면 생성 함수를 호출하지 않고 invalid_input", async () => {
    const generate: PhotoCharacterGenerateFn = vi.fn();
    const result = await runPhotoCharacterGeneration(
      { settings: CONFIGURED, photoDataUrl: PHOTO, styleId: null },
      generate,
    );
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("BYOK 미설정이면 생성 함수를 호출하지 않고 not_configured", async () => {
    const generate: PhotoCharacterGenerateFn = vi.fn();
    const result = await runPhotoCharacterGeneration(
      {
        settings: STUDIO_AI_DEFAULT_SETTINGS,
        photoDataUrl: PHOTO,
        styleId: "soft-cel-shade",
      },
      generate,
    );
    expect(result).toMatchObject({ ok: false, code: "not_configured" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("설정·사진·스타일이 갖춰지면 사진과 조립된 프롬프트로 생성 함수를 호출한다", async () => {
    const generate: PhotoCharacterGenerateFn = vi.fn(async () => ({
      ok: true as const,
      data: { dataUrl: GENERATED },
    }));
    const result = await runPhotoCharacterGeneration(
      { settings: CONFIGURED, photoDataUrl: PHOTO, styleId: "mono-screentone" },
      generate,
    );
    expect(result).toEqual({ ok: true, data: { dataUrl: GENERATED } });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      CONFIGURED,
      PHOTO,
      buildPhotoCharacterGenerationPrompt("mono-screentone"),
      { signal: undefined },
    );
  });

  it("생성 실패 결과는 그대로 전파한다", async () => {
    const failure = {
      ok: false as const,
      code: "http_error" as const,
      error: "제공자 오류",
    };
    const generate: PhotoCharacterGenerateFn = vi.fn(async () => failure);
    const result = await runPhotoCharacterGeneration(
      { settings: CONFIGURED, photoDataUrl: PHOTO, styleId: "vivid-cartoon" },
      generate,
    );
    expect(result).toEqual(failure);
  });
});

describe("캐논 draft 조립", () => {
  it("생성 결과 저장 draft — 이름·설명·이미지·출처·태그가 캐논 검증 형식을 채운다", () => {
    const draft = buildPhotoCharacterCanonDraft({
      name: "하린",
      description: "긴 흑발, 회색 눈",
      imageDataUrl: GENERATED,
      styleId: "vivid-cartoon",
      usedOriginalPhoto: false,
    });
    expect(draft.referenceImage).toBe(GENERATED);
    expect(draft.referenceSource).toBe("upload");
    expect(draft.referenceLabel).toBe("사진으로 만든 캐릭터 · 선명한 카툰");
    expect(draft.tags).toEqual(["사진 생성", "선명한 카툰"]);
    expect(validateCanonSheetDraft(draft)).toHaveLength(0);
  });

  it("원본 사진으로 저장하면 태그가 '사진 등록'이 된다", () => {
    const draft = buildPhotoCharacterCanonDraft({
      name: "하린",
      description: "긴 흑발",
      imageDataUrl: PHOTO,
      styleId: null,
      usedOriginalPhoto: true,
    });
    expect(draft.tags).toEqual(["사진 등록"]);
    expect(draft.referenceLabel).toBe("사진으로 만든 캐릭터");
  });
});
