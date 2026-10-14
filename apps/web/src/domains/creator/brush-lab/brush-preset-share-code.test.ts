import { describe, expect, it, vi } from "vitest";

import { BRUSH_LAB_SLOT_IDS, createBrushLabRecipe } from "./brush-lab-recipe";
import {
  BrushPresetShareCodeError,
  brushPresetSharePayloadToNamedPalette,
  brushPresetSharePayloadToRecipeSeed,
  createBrushPresetShareCardSvg,
  decodeBrushPresetShareCode,
  encodeBrushPresetShareCode,
  extractBrushPresetShareCode,
  installBrushPresetShareCode,
  type BrushPresetSharePayload,
} from "./brush-preset-share-code";

const recipe = {
  ...createBrushLabRecipe("carrier-webgpu-ribbon", 20260906),
  slots: BRUSH_LAB_SLOT_IDS.map((id, index) => ({
    id,
    sourceId: index % 2 === 0 ? `donor-${index}` : null,
    locked: index === 3,
  })),
};

const shareableBrush: BrushPresetSharePayload = {
  brush: {
    name: "나의 G펜 변형",
    recipe,
    delta: {
      slots: {
        carrier: "carrier-perfect-outline",
        physics: ["physics-dry-contact", "physics-height"],
      },
      tuning: {
        size: 12.345678901234567,
        flow: 0.72,
        stabilization: 0,
        primaryColor: "#A1B2C3",
      },
    },
  },
};

const shareablePalette: BrushPresetSharePayload = {
  palette: {
    name: "밤하늘 팔레트",
    colors: ["#0F172A", "#a1b2c3", "#0f172a", "#FFFFFF"],
  },
};

const bundle: BrushPresetSharePayload = {
  brush: shareableBrush.brush,
  palette: shareablePalette.palette,
};

function expectShareError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BrushPresetShareCodeError);
    expect((error as BrushPresetShareCodeError).code).toBe(code);
    expect((error as Error).message.length).toBeGreaterThan(0);
    return;
  }
  throw new Error(`expected BrushPresetShareCodeError(${code})`);
}

describe("브러시·프리셋 공유 코드 왕복", () => {
  it("브러시 레시피와 delta 파라미터가 손실 없이 복원된다", () => {
    const decoded = decodeBrushPresetShareCode(
      encodeBrushPresetShareCode(shareableBrush),
    );
    expect(decoded.brush?.name).toBe("나의 G펜 변형");
    expect(decoded.brush?.recipe).toEqual(recipe);
    expect(decoded.brush?.delta).toEqual({
      slots: {
        carrier: "carrier-perfect-outline",
        physics: ["physics-dry-contact", "physics-height"],
      },
      tuning: {
        size: 12.345678901234567,
        flow: 0.72,
        stabilization: 0,
        primaryColor: "#a1b2c3",
      },
    });
  });

  it("팔레트 색 순서·중복이 보존되고 hex만 소문자로 정규화된다", () => {
    const decoded = decodeBrushPresetShareCode(
      encodeBrushPresetShareCode(shareablePalette),
    );
    expect(decoded.palette?.colors).toEqual([
      "#0f172a",
      "#a1b2c3",
      "#0f172a",
      "#ffffff",
    ]);
  });

  it("브러시+팔레트 묶음도 한 코드로 왕복한다", () => {
    const decoded = decodeBrushPresetShareCode(
      encodeBrushPresetShareCode(bundle),
    );
    expect(decoded.brush?.recipe).toEqual(recipe);
    expect(decoded.palette?.colors).toHaveLength(4);
  });

  it("같은 프리셋은 항상 같은 코드를 만든다(결정성)", () => {
    expect(encodeBrushPresetShareCode(bundle)).toBe(
      encodeBrushPresetShareCode(bundle),
    );
  });

  it("설명 문구와 줄바꿈이 섞인 붙여넣기에서도 코드를 추출한다", () => {
    const code = encodeBrushPresetShareCode(shareableBrush);
    const wrapped = `이 브러시 써봐!\n${code.slice(0, 24)}\n${code.slice(24)}`;
    expect(extractBrushPresetShareCode(wrapped)?.body.length).toBeGreaterThan(0);
    expect(decodeBrushPresetShareCode(wrapped).brush?.name).toBe("나의 G펜 변형");
  });
});

describe("잘못된 코드 거부(사유 포함)", () => {
  it("빈 입력·코드 아닌 텍스트를 구분해 거부한다", () => {
    expectShareError(() => decodeBrushPresetShareCode(""), "empty");
    expectShareError(
      () => decodeBrushPresetShareCode("그냥 메모입니다"),
      "not-a-share-code",
    );
  });

  it("잘린 코드는 형식이 아니라고 거부한다", () => {
    const code = encodeBrushPresetShareCode(shareableBrush);
    expectShareError(
      () => decodeBrushPresetShareCode(code.slice(0, -3)),
      "not-a-share-code",
    );
  });

  it("본문이 한 글자라도 바뀌면 체크섬 불일치로 거부한다", () => {
    const code = encodeBrushPresetShareCode(shareableBrush);
    const bodyStart = code.indexOf(".") + 1;
    const replacement = code[bodyStart] === "A" ? "B" : "A";
    const tampered =
      code.slice(0, bodyStart) + replacement + code.slice(bodyStart + 1);
    expectShareError(
      () => decodeBrushPresetShareCode(tampered),
      "checksum-mismatch",
    );
  });

  it("미래 버전 코드는 unsupported-version으로 거부한다", () => {
    const code = encodeBrushPresetShareCode(shareableBrush);
    expectShareError(
      () => decodeBrushPresetShareCode(code.replace("TSB1.", "TSB9.")),
      "unsupported-version",
    );
  });

  it("레시피 슬롯이 깨진 페이로드는 invalid-recipe로 거부한다", () => {
    expectShareError(
      () =>
        encodeBrushPresetShareCode({
          brush: {
            name: "깨진 브러시",
            recipe: { ...recipe, slots: recipe.slots.slice(0, 3) } as never,
            delta: {},
          },
        }),
      "invalid-recipe",
    );
  });

  it("알 수 없는 tuning 값·-0은 invalid-payload로 거부한다(조용한 대체 금지)", () => {
    expectShareError(
      () =>
        encodeBrushPresetShareCode({
          brush: {
            name: "x",
            recipe,
            delta: { tuning: { size: "big" as never } },
          },
        }),
      "invalid-payload",
    );
    expectShareError(
      () =>
        encodeBrushPresetShareCode({
          brush: {
            name: "x",
            recipe,
            delta: { tuning: { flow: -0 } },
          },
        }),
      "invalid-payload",
    );
  });

  it("팔레트 색이 상한을 넘으면 절단하지 않고 too-large로 거부한다", () => {
    expectShareError(
      () =>
        encodeBrushPresetShareCode({
          palette: {
            name: "거대 팔레트",
            colors: Array.from({ length: 257 }, () => "#112233"),
          },
        }),
      "too-large",
    );
  });
});

describe("설치 — 설치 직후 목록에서 바로 사용 가능", () => {
  it("브러시 시드는 그룹·라벨을 갖고 기존 id와 충돌하지 않는다", () => {
    const seed = brushPresetSharePayloadToRecipeSeed(bundle);
    expect(seed.group).toBe("공유 프리셋");
    expect(seed.label).toBe("나의 G펜 변형");
    // 설치 시드는 정규화된 delta(hex 소문자)를 싣는다 — 왕복 디코드 결과와 동일.
    expect(seed.delta).toEqual(
      decodeBrushPresetShareCode(encodeBrushPresetShareCode(bundle)).brush?.delta,
    );
    const again = brushPresetSharePayloadToRecipeSeed(
      bundle,
      new Set([seed.id]),
    );
    expect(again.id).not.toBe(seed.id);
    // 같은 코드를 다시 설치하면 같은 id — 중복 설치 판정에 쓸 수 있다.
    expect(brushPresetSharePayloadToRecipeSeed(bundle).id).toBe(seed.id);
  });

  it("명명 팔레트는 라이브러리 자료형 그대로 생성된다", () => {
    const palette = brushPresetSharePayloadToNamedPalette(bundle, 1_700_000_000_000);
    expect(palette).toEqual({
      id: expect.stringMatching(/^shared-palette-[0-9a-f]{8}$/u),
      name: "밤하늘 팔레트",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      colors: ["#0f172a", "#a1b2c3", "#0f172a", "#ffffff"],
    });
  });

  it("코드 설치는 싱크에 시드와 팔레트를 모두 넣고 id를 돌려준다", () => {
    const addBrushSeed = vi.fn();
    const savePalette = vi.fn();
    const result = installBrushPresetShareCode(
      encodeBrushPresetShareCode(bundle),
      { addBrushSeed, savePalette, now: 42 },
    );
    expect(addBrushSeed).toHaveBeenCalledTimes(1);
    expect(savePalette).toHaveBeenCalledTimes(1);
    expect(result.brushSeedId).toBe(addBrushSeed.mock.calls[0]?.[0].id);
    expect(result.paletteId).toBe(savePalette.mock.calls[0]?.[0].id);
  });

  it("싱크가 없으면 부분 설치 없이 missing-sink로 거부한다", () => {
    const savePalette = vi.fn();
    expectShareError(
      () =>
        installBrushPresetShareCode(encodeBrushPresetShareCode(bundle), {
          savePalette,
        }),
      "missing-sink",
    );
    expect(savePalette).not.toHaveBeenCalled();
  });

  it("깨진 코드는 싱크를 전혀 호출하지 않는다", () => {
    const addBrushSeed = vi.fn();
    expectShareError(
      () => installBrushPresetShareCode("TSB1.AAAA.00000000", { addBrushSeed }),
      "checksum-mismatch",
    );
    expect(addBrushSeed).not.toHaveBeenCalled();
  });
});

describe("공유 카드(이미지)", () => {
  it("SVG 카드에 제목과 코드 전문이 실리고, 카드에서 뽑은 코드가 다시 설치된다", () => {
    const svg = createBrushPresetShareCardSvg(bundle);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("나의 G펜 변형");
    const code = encodeBrushPresetShareCode(bundle);
    const compactSvgText = svg.replace(/<[^>]+>/gu, "").replace(/\s+/gu, "");
    expect(compactSvgText).toContain(code.replace(/\s+/gu, ""));
    // 카드에서 텍스트만 뽑은(OCR·복사) 문자열도 같은 디코더로 설치된다.
    expect(decodeBrushPresetShareCode(compactSvgText).brush?.name).toBe("나의 G펜 변형");
  });

  it("제목의 XML 특수문자는 이스케이프된다", () => {
    const svg = createBrushPresetShareCardSvg({
      palette: { name: "A<B>&\"C\"", colors: ["#112233"] },
    });
    expect(svg).toContain("A&lt;B&gt;&amp;&quot;C&quot;");
    expect(svg).not.toContain("A<B>");
  });
});
