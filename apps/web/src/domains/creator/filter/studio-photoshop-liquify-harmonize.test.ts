import { describe, expect, it } from "vitest";
import {
  applyPhotoshopFaceAwareLiquifyToRgba,
  applyPhotoshopHarmonizeLayer,
  buildPhotoshopSelectDetailsMask,
  createSenseiTextToImageAdvancedParams,
  decodeSenseiGenStatusFlags,
  PHOTOSHOP_BODY_PARSER_DETAIL_PARTS,
  PHOTOSHOP_FACE_LIQUIFY_MODEL_FILES,
} from "./studio-photoshop-liquify-harmonize";

describe("studio-photoshop-liquify-harmonize", () => {
  it("Face-Aware Liquify 5종 랜드마크 모델 매니페스트와 16종 파라미터 기반 RGBA 메시 워프를 수행한다", () => {
    expect(PHOTOSHOP_FACE_LIQUIFY_MODEL_FILES.calibration48).toBe(
      "liquify/x48dnm-calib-align",
    );

    const width = 8;
    const height = 8;
    const src = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      src[i * 4] = (i * 17) % 256;
      src[i * 4 + 1] = (i * 31) % 256;
      src[i * 4 + 2] = (i * 53) % 256;
      src[i * 4 + 3] = 255;
    }

    const warped = applyPhotoshopFaceAwareLiquifyToRgba(src, width, height, {
      eyeSize: 45,
      noseWidth: -30,
      mouthSmile: 60,
      jawline: -40,
      faceWidth: -20,
      chinHeight: 15,
    });

    expect(warped.length).toBe(src.length);
    expect([...warped].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(
      true,
    );
  });

  it("Harmonize(genHarmonizeOnNewLayerEnabled)가 전경 레이어 색온도를 배경에 맞추고 비파괴 레이어 메타데이터를 반환한다", () => {
    const fg = new Uint8ClampedArray([100, 100, 200, 255, 90, 95, 190, 220]);
    const bg = new Uint8ClampedArray([220, 160, 80, 255, 210, 150, 70, 255]);

    const res = applyPhotoshopHarmonizeLayer(fg, bg, {
      genHarmonizeOnNewLayerEnabled: true,
      strength01: 0.8,
      sourceLayerName: "Character Cut",
    });

    expect(res.createdNewLayer).toBe(true);
    expect(res.outputLayerName).toBe("Character Cut (Harmonized)");
    // 배경이 따뜻한 톤(R 높음, B 낮음)이므로 전경 R은 증가하고 B는 감소해야 한다.
    expect(res.harmonizedRgba[0]!).toBeGreaterThan(fg[0]!);
    expect(res.harmonizedRgba[2]!).toBeLessThan(fg[2]!);
    expect(res.harmonizedRgba[3]).toBe(255);
  });

  it("Object-Based Editing(select_details 12개 부위) 마스크를 생성한다", () => {
    expect(PHOTOSHOP_BODY_PARSER_DETAIL_PARTS).toHaveLength(12);
    const mask = buildPhotoshopSelectDetailsMask(10, 10, [
      "hair",
      "upperClothes",
    ]);
    expect(mask.length).toBe(100);
    expect(mask.some((v) => v === 255)).toBe(true);
    expect(mask.some((v) => v === 0)).toBe(true);
  });

  it("SenseiService SPL 8비트 상태 플래그(De/Vt)와 스타일 프롬프트를 정확히 디코딩/생성한다", () => {
    const flags = decodeSenseiGenStatusFlags(1 | 4 | 64);
    expect(flags).toEqual({
      isDenied: true,
      isBlockedClassNSFW: false,
      isBlockedClassArtist: true,
      isDeniedSilent: false,
      isNotSupportedLanguage: false,
      isPostProcessingNSFW: false,
      isEmptyPrompt: true,
      isLongPrompt: false,
    });

    const adv = createSenseiTextToImageAdvancedParams(["photo", "synthwave"]);
    expect(adv.enable_mts).toBe(true);
    expect(adv.style_prompt).toContain("80s synthwave");
    expect(adv.anchor_prompt).toContain("illustration");
  });
});
