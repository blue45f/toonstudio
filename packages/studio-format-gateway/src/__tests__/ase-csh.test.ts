import { describe, expect, it } from "vitest";

import {
  AseParseError,
  aseColorToRgbHex,
  CshParseError,
  cshShapeToSvgPath,
  exportAse,
  exportCsh,
  importAse,
  importCsh,
  type CshShapeEntry,
} from "../ase-csh";

describe("Adobe Swatch Exchange (.ase) 바이너리 코덱", () => {
  it("RGB·CMYK·Gray·LAB 색상 블록과 그룹(0xC001/0xC002)을 무손실 왕복 직렬화/파싱한다", () => {
    const encoded = exportAse({
      groups: [
        {
          name: "웹툰 피부 톤",
          colors: [
            {
              name: "웜 아이보리",
              color: { mode: "RGB", r: 1, g: 0.9, b: 0.8, type: "global" },
            },
            {
              name: "코랄 치크",
              color: {
                mode: "CMYK",
                c: 0,
                m: 0.45,
                y: 0.4,
                k: 0.05,
                type: "spot",
              },
            },
          ],
        },
      ],
      colors: [
        {
          name: "잉크 그레이",
          color: { mode: "Gray", k: 0.75, type: "normal" },
        },
        {
          name: "네온 시안 LAB",
          color: { mode: "LAB", l: 0.82, a: -42, b: -18, type: "normal" },
        },
      ],
    });

    const parsed = importAse(encoded);
    expect(parsed.versionMajor).toBe(1);
    expect(parsed.versionMinor).toBe(0);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]?.name).toBe("웹툰 피부 톤");
    expect(parsed.groups[0]?.colors).toHaveLength(2);
    expect(parsed.colors).toHaveLength(4);

    const warmIvory = parsed.colors[0]!;
    expect(warmIvory.name).toBe("웜 아이보리");
    expect(warmIvory.groupName).toBe("웹툰 피부 톤");
    // IEEE-754 Float32(0.9) = 0.8999999761581421 -> 229.49999 -> 0xe5
    expect(warmIvory.rgbHex).toBe("#ffe5cc");
    expect(warmIvory.color.mode).toBe("RGB");
    if (warmIvory.color.mode === "RGB") {
      expect(warmIvory.color.r).toBeCloseTo(1, 5);
      expect(warmIvory.color.g).toBeCloseTo(0.9, 5);
      expect(warmIvory.color.b).toBeCloseTo(0.8, 5);
      expect(warmIvory.color.type).toBe("global");
    }

    const coralCheek = parsed.colors[1]!;
    expect(coralCheek.color.mode).toBe("CMYK");
    expect(coralCheek.rgbHex).toMatch(/^#[0-9a-f]{6}$/);

    const inkGray = parsed.colors[2]!;
    expect(inkGray.groupName).toBeUndefined();
    expect(inkGray.rgbHex).toBe("#404040");

    const labColor = parsed.colors[3]!;
    expect(labColor.color.mode).toBe("LAB");
    expect(labColor.rgbHex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("잘못된 시그니처·지원하지 않는 버전·잘린 버퍼를 명시적 AseParseError로 거부한다", () => {
    expect(() => importAse(new Uint8Array([1, 2, 3]))).toThrowError(
      AseParseError,
    );

    const badSig = new Uint8Array(12);
    badSig.set([0x42, 0x41, 0x44, 0x21]);
    expect(() => importAse(badSig)).toThrowError(
      expect.objectContaining({ code: "invalid-signature" }),
    );

    const badVer = new Uint8Array(12);
    badVer.set([0x41, 0x53, 0x45, 0x46, 0x00, 0x02, 0x00, 0x00]);
    expect(() => importAse(badVer)).toThrowError(
      expect.objectContaining({ code: "unsupported-version" }),
    );
  });

  it("aseColorToRgbHex가 NaN·비유한 입력에서도 안전하게 #rrggbb를 반환한다", () => {
    expect(
      aseColorToRgbHex({
        mode: "RGB",
        r: Number.NaN,
        g: 1.5,
        b: -0.5,
        type: "normal",
      }),
    ).toBe("#00ff00");
  });
});

describe("Adobe Custom Shapes (.csh) 바이너리 코덱", () => {
  it("커스텀 셰이프 벡터 서브패스·베지어 매듭을 직렬화·파싱하고 SVG path로 변환한다", () => {
    const sampleShapes: readonly CshShapeEntry[] = [
      {
        name: "말풍선 꼬리 스타",
        id: "toon-star-01",
        width: 200,
        height: 100,
        fillStartsWithAllPixels: false,
        paths: [
          {
            open: false,
            operation: "combine",
            knots: [
              {
                linked: true,
                before: [20, 10],
                anchor: [20, 10],
                after: [60, 10],
              },
              {
                linked: true,
                before: [140, 10],
                anchor: [180, 50],
                after: [140, 90],
              },
              {
                linked: false,
                before: [60, 90],
                anchor: [20, 90],
                after: [20, 50],
              },
            ],
          },
        ],
      },
    ];

    const bytes = exportCsh(sampleShapes);
    const parsed = importCsh(bytes);
    expect(parsed.version).toBe(2);
    expect(parsed.shapes).toHaveLength(1);

    const shape = parsed.shapes[0]!;
    expect(shape.name).toBe("말풍선 꼬리 스타");
    expect(shape.id).toBe("toon-star-01");
    expect(shape.width).toBe(200);
    expect(shape.height).toBe(100);
    expect(shape.paths).toHaveLength(1);
    expect(shape.paths[0]?.open).toBe(false);
    expect(shape.paths[0]?.operation).toBe("combine");
    expect(shape.paths[0]?.knots).toHaveLength(3);
    expect(shape.paths[0]?.knots[0]?.anchor[0]).toBeCloseTo(20, 2);
    expect(shape.paths[0]?.knots[0]?.anchor[1]).toBeCloseTo(10, 2);
    expect(shape.paths[0]?.knots[1]?.anchor[0]).toBeCloseTo(180, 2);
    expect(shape.paths[0]?.knots[1]?.anchor[1]).toBeCloseTo(50, 2);

    const svgPath = cshShapeToSvgPath(shape);
    expect(svgPath).toContain("M 20 10");
    expect(svgPath).toContain("C 60 10, 140 10, 180 50");
    expect(svgPath.endsWith("Z")).toBe(true);
  });

  it("잘못된 CSH 헤더 및 버전을 CshParseError로 거부한다", () => {
    expect(() => importCsh(new Uint8Array([1, 2, 3]))).toThrowError(
      CshParseError,
    );

    const badSig = new Uint8Array(12);
    badSig.set([0x6e, 0x6f, 0x70, 0x65]);
    expect(() => importCsh(badSig)).toThrowError(
      expect.objectContaining({ code: "invalid-signature" }),
    );
  });
});
