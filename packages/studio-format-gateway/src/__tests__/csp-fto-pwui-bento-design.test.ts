import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CSP_BUILTIN_FTO_FONTS,
  CSP_MENUV3_KOREAN_BENTO_ITEMS,
  CSP_MENUV3_THEME_TOKENS,
  CSP_PW_UI_WIDGET_CLASSES,
  encodeCspUiDialogResourceArchive,
  evaluateCspPwglVividToonShading,
  parseCspFtoOpenTypeFontHeader,
  parseCspUiDialogResourceArchive,
} from "../csp-fto-pwui-bento-design";

describe("csp-fto-pwui-bento-design", () => {
  it("parses .fto OpenType CFF font headers and validates real asset01.fto when installed", () => {
    expect(CSP_BUILTIN_FTO_FONTS).toHaveLength(5);

    // Build synthetic OTTO header with VORG, vhea, vmtx
    const buf = new Uint8Array(12 + 3 * 16);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 0x4f54544f, false); // 'OTTO'
    view.setUint16(4, 3, false);
    view.setUint16(6, 32, false);
    view.setUint16(8, 1, false);
    view.setUint16(10, 16, false);

    const tags = ["VORG", "vhea", "vmtx"];
    tags.forEach((tag, idx) => {
      const base = 12 + idx * 16;
      for (let c = 0; c < 4; c += 1) {
        buf[base + c] = tag.charCodeAt(c);
      }
      view.setUint32(base + 4, 0x12345678, false);
      view.setUint32(base + 8, 60 + idx * 32, false);
      view.setUint32(base + 12, 32, false);
    });

    const parsed = parseCspFtoOpenTypeFontHeader(buf);
    expect(parsed.sfntSignature).toBe("OTTO");
    expect(parsed.numTables).toBe(3);
    expect(parsed.supportsVerticalTypesetting).toBe(true);

    const ftoPath =
      "/Applications/CLIP STUDIO 1.5/App/CLIP STUDIO PAINT.app/Contents/Resources/clipstudio_assets/asset01.fto";
    if (existsSync(ftoPath)) {
      const realHeader = parseCspFtoOpenTypeFontHeader(
        new Uint8Array(readFileSync(ftoPath).subarray(0, 512)),
      );
      expect(realHeader.sfntSignature).toBe("OTTO");
      expect(realHeader.numTables).toBe(15);
      expect(realHeader.supportsVerticalTypesetting).toBe(true);
    }
  });

  it("round-trips nested absolute-offset UI dialog archives and validates real 742DEA58 & 5634F3A9", () => {
    expect(CSP_PW_UI_WIDGET_CLASSES).toHaveLength(27);

    const syntheticArchive = encodeCspUiDialogResourceArchive([
      {
        dialogId: 1,
        strings: {
          3: "뷰를 편집대상으로 맞추기",
          5: "투시도와 캔버스를 동기화하기",
        },
        widgetClassNames: ["PWWindow", "PWView", "PWEditSliderJoint", "PWPushButton"],
      },
      {
        dialogId: 2,
        strings: {
          1: "어니언 스킨 설정",
          2: "표시 매수",
        },
        widgetClassNames: ["PWView", "PWCheckBoxEnabler", "PWEditComboJoint"],
      },
    ]);

    const decoded = parseCspUiDialogResourceArchive(syntheticArchive);
    expect(decoded.dialogCount).toBe(2);
    expect(decoded.dialogs[0]?.strings[3]).toBe("뷰를 편집대상으로 맞추기");
    expect(decoded.dialogs[0]?.widgetClassNames).toContain("PWEditSliderJoint");
    expect(decoded.dialogs[1]?.strings[1]).toBe("어니언 스킨 설정");
    expect(decoded.dialogs[1]?.widgetClassNames).toContain("PWCheckBoxEnabler");

    const realKoPath =
      "/Applications/CLIP STUDIO 1.5/App/CLIP STUDIO PAINT.app/Contents/Resources/korean/742DEA58-ED6B-4402-BC11-20DFC6D08040";
    if (existsSync(realKoPath)) {
      const realParsed = parseCspUiDialogResourceArchive(
        new Uint8Array(readFileSync(realKoPath)),
        15,
      );
      expect(realParsed.dialogCount).toBe(507);
      expect(Object.values(realParsed.dialogs[0]?.strings ?? {})).toContain(
        "뷰를 편집대상으로 맞추기",
      );
      expect(realParsed.dialogs[0]?.widgetClassNames).toContain("PWPushButton");
    }

    const realUxPath =
      "/Applications/CLIP STUDIO 1.5/App/CLIP STUDIO PAINT.app/Contents/Resources/korean/5634F3A9-5D0B-4f87-8BC1-DAB1F89966C3";
    if (existsSync(realUxPath)) {
      const realUxParsed = parseCspUiDialogResourceArchive(
        new Uint8Array(readFileSync(realUxPath)),
        10,
      );
      expect(realUxParsed.dialogCount).toBe(40);
      expect(Object.values(realUxParsed.dialogs[0]?.strings ?? {})).toContain(
        "셀 일괄 지정",
      );
    }
  });

  it("evaluates PWGLCalcVividColor 3D toon and vivid shadow saturation boost accurately", () => {
    const shadedShadow = evaluateCspPwglVividToonShading({
      texRgb01: [0.95, 0.45, 0.35],
      ambientMaterialRgb01: [0.5, 0.5, 0.5],
      diffuseMaterialRgb01: [0.9, 0.9, 0.9],
      lightRgb01: [0.25, 0.25, 0.25],
      vividness: 5.0,
      maxSaturationEffect: 0.12,
      brightness: 0.8,
      toonShading: true,
      toonFaultList: [0.35, 0.7],
    });

    expect(shadedShadow.quantizedLightValue).toBe(0.35);
    expect(shadedShadow.appliedSaturationBoost).toBeGreaterThan(0);
    expect(shadedShadow.shadedRgb01[0]).toBeGreaterThan(shadedShadow.shadedRgb01[2]);
  });

  it("provides MENUv3 light/dark design tokens and 9 Korean Bento launcher items", () => {
    expect(CSP_MENUV3_THEME_TOKENS.light.colorBgMain).toBe("#FAF9F9");
    expect(CSP_MENUV3_THEME_TOKENS.dark.colorBgMain).toBe("#4E4E4E");
    expect(CSP_MENUV3_KOREAN_BENTO_ITEMS).toHaveLength(9);
  });
});
