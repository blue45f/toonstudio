import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  asepriteCelToRgba8,
  asepritePaletteAtFrame,
  importAsepriteSprite,
  inspectAsepriteSignature,
  resolveAsepriteLinkedCel,
} from "../../packages/studio-format-gateway/src/aseprite-sprite";
import { parseClipContainer } from "../../packages/studio-format-gateway/src/chunked-sqlite-container";
import { importGimpBrush, importGimpPattern, inspectGimpBrushFormat } from "../../packages/studio-format-gateway/src/gimp-brush";
import { importGimpBrushPipe } from "../../packages/studio-format-gateway/src/gimp-brush-pipe";
import { importGimpGeneratedBrush } from "../../packages/studio-format-gateway/src/gimp-generated-brush";
import { describeKraPixelFormat } from "../../packages/studio-format-gateway/src/kra-colorspace";
import { applyKraTransparencyMasks, importKra, inspectKraSignature } from "../../packages/studio-format-gateway/src/kra-document";
import { importXcf, inspectXcfHeader } from "../../packages/studio-format-gateway/src/xcf";

/**
 * 사용자가 로컬에 둔 실제 샘플로 포맷 가정을 검증하는 코퍼스 테스트.
 * 샘플은 `tests/corpus/formats/local-samples/`에 두며 README.md만 Git이 추적한다. 샘플이 없으면 샘플별
 * 테스트와 그 `describe`는 등록되지 않고 Git 무시 규칙만 확인한다.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const SAMPLE_DIR = join(HERE, "..", "corpus", "formats", "local-samples");

function listSamples(pattern: RegExp): string[] {
  return existsSync(SAMPLE_DIR) ? readdirSync(SAMPLE_DIR).filter((name) => pattern.test(name)).sort() : [];
}

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((entry) => entry.code);
}

const CLIP_SAMPLES = listSamples(/\.(clip|lip)$/i);
const XCF_SAMPLES = listSamples(/\.xcf$/i);
/** `.ase`는 Adobe Swatch Exchange도 쓰므로 서명이 Aseprite인 파일만 고른다. */
const ASEPRITE_SAMPLES = listSamples(/\.(aseprite|ase)$/i).filter(
  (name) => inspectAsepriteSignature(new Uint8Array(readFileSync(join(SAMPLE_DIR, name)).subarray(0, 256))) === "aseprite",
);
const GIMP_BRUSH_SAMPLES = listSamples(/\.(gbr|gih|pat|vbr)$/i);
/** `.kra`와 `.krz`는 둘 다 Krita 문서다. 서명이 Krita가 아닌 파일은 건너뛴다. */
const KRA_SAMPLES = listSamples(/\.(kra|krz)$/i).filter(
  (name) => inspectKraSignature(new Uint8Array(readFileSync(join(SAMPLE_DIR, name)).subarray(0, 256))) === "kra",
);
/** XCF 읽기 오라클로 쓰는 ImageMagick. 없으면 바이트 대조 테스트는 등록되지 않는다. */
const IMAGEMAGICK_AVAILABLE = spawnSync("convert", ["-version"]).status === 0;
const ORACLE_TIMEOUT_MS = 180_000;

describe("로컬 실샘플 코퍼스", () => {
  it("로컬 샘플 디렉터리는 Git이 무시하고 README만 추적한다", () => {
    const rules = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8").split(/\r?\n/);

    expect(rules).toContain("/tests/corpus/formats/local-samples/*");
    expect(rules).toContain("!/tests/corpus/formats/local-samples/README.md");
  });
});

function registerClipSamples(): void {
  describe("청크형 SQLite 컨테이너 로컬 실샘플", () => {
    for (const name of CLIP_SAMPLES) {
      it(`${name}: 컨테이너 가정(H1–H4)이 실제 파일과 맞는다`, () => {
        const bytes = new Uint8Array(readFileSync(join(SAMPLE_DIR, name)));
        const parsed = parseClipContainer(bytes);

        expect(parsed.truncated).toBe(false);
        expect(parsed.sqlite?.inspection.container).toBe("sqlite3");
        if (parsed.kind === "csfchunk") {
          expect(parsed.headerLayout).not.toBe("unrecognized");
          const types = parsed.chunks.map((chunk) => chunk.type);
          expect(types).toContain("SQLi");
          expect(types.at(-1)).toBe("Foot");
          expect(parsed.externalBlocks.every((block) => block.parsed)).toBe(true);
          expect(parsed.issues).toEqual([]);
        }
      });
    }
  });
}

function registerXcfSamples(): void {
  describe("XCF 로컬 실샘플", () => {
    for (const name of XCF_SAMPLES) {
      const path = join(SAMPLE_DIR, name);

      it(
        `${name}: 구조가 일관되고 픽셀 디코드가 실패하지 않는다`,
        async () => {
          const result = await importXcf(new Uint8Array(readFileSync(path)));

          // 레이어를 하나도 잃지 않았다.
          expect(result.layers).toHaveLength(result.image.layerCount);
          // 구조·타일 오류 진단이 없다. 마스크는 의도적으로 읽지 않으므로 허용한다.
          const failures = result.unsupported.filter((entry) => entry.code !== "xcf-layer-mask-not-decoded");
          expect(failures).toEqual([]);
          for (const layer of result.layers) {
            if (layer.kind === "group") {
              expect(layer.pixels).toBeNull();
            } else {
              expect(layer.pixels).not.toBeNull();
              expect(layer.pixels?.length).toBe(layer.width * layer.height * 4);
            }
            // 부모는 같은 이미지의 그룹 레이어여야 한다.
            if (layer.parentIndex !== null) {
              expect(result.layers.find((candidate) => candidate.index === layer.parentIndex)?.kind).toBe("group");
            }
          }
          expect(codes(result.warnings)).not.toContain("xcf-group-path-unresolved");
        },
        ORACLE_TIMEOUT_MS,
      );

      // ImageMagick 6.9는 XCF를 읽기만 하며 인덱스드와 8비트 초과 정밀도는 거부한다. 지원하는 파일만 대조한다.
      const header = inspectXcfHeader(new Uint8Array(readFileSync(path)));
      if (IMAGEMAGICK_AVAILABLE && header.baseType !== "indexed" && header.precision === 150) {
        it(
          `${name}: 모든 레이어가 ImageMagick 디코드와 바이트 단위로 일치한다`,
          async () => {
            const result = await importXcf(new Uint8Array(readFileSync(path)));
            const frames = result.image.layerCount;

            for (const layer of result.layers) {
              if (layer.pixels === null) continue;
              // ImageMagick은 프레임을 파일 순서의 역순(맨 아래부터)으로 돌려준다.
              const frame = frames - 1 - layer.index;
              const decoded = spawnSync("convert", [`${path}[${frame}]`, "-depth", "8", "rgba:-"], {
                maxBuffer: 1 << 30,
              });
              expect(decoded.status, `${name}[${frame}] 디코드`).toBe(0);
              const reference = new Uint8Array(decoded.stdout);
              expect(reference.length, `${layer.name} 크기`).toBe(layer.pixels.length);
              // 완전히 투명한 픽셀의 RGB는 의미가 없으므로 비교에서 제외한다.
              let differences = 0;
              for (let offset = 0; offset < reference.length; offset += 4) {
                if (reference[offset + 3] === 0 && layer.pixels[offset + 3] === 0) continue;
                for (let channel = 0; channel < 4; channel += 1) {
                  if (reference[offset + channel] !== layer.pixels[offset + channel]) differences += 1;
                }
              }
              expect(differences, `레이어 ${layer.index} "${layer.name}" 채널 차이`).toBe(0);
            }
          },
          ORACLE_TIMEOUT_MS,
        );
      }
    }
  });
}

function registerAsepriteSamples(): void {
  describe("Aseprite 로컬 실샘플", () => {
    // 이 코덱이 구조 오류로 보고하는 진단. 파일이 새 버전의 청크를 담은 경우(`aseprite-chunk-type-unknown`)는 허용한다.
    const STRUCTURE_WARNINGS = [
      "aseprite-file-size-mismatch",
      "aseprite-frame-truncated",
      "aseprite-frame-count-mismatch",
      "aseprite-frame-trailing-bytes",
      "aseprite-trailing-bytes",
      "aseprite-chunk-trailing-bytes",
      "aseprite-user-data-orphan",
      "aseprite-layer-child-level-invalid",
      "aseprite-layer-parent-not-group",
    ];

    for (const name of ASEPRITE_SAMPLES) {
      it(`${name}: 구조가 일관되고 모든 셀과 타일셋을 해제한다`, async () => {
        const result = await importAsepriteSprite(new Uint8Array(readFileSync(join(SAMPLE_DIR, name))));
        const bytesPerPixel = result.header.colorDepth / 8;

        expect(result.truncated).toBe(false);
        expect(result.frames).toHaveLength(result.header.frameCount);
        expect(codes(result.unsupported).filter((code) => code !== "aseprite-chunk-type-unknown")).toEqual([]);
        expect(codes(result.warnings).filter((code) => STRUCTURE_WARNINGS.includes(code))).toEqual([]);

        const palette = asepritePaletteAtFrame(result, result.frames.length - 1);
        for (const cel of result.cels) {
          expect(cel.layerIndex).toBeLessThan(result.layers.length);
          const layer = result.layers[cel.layerIndex]!;
          if (cel.kind === "linked") {
            const target = resolveAsepriteLinkedCel(result, cel);
            expect(target, `프레임 ${cel.frameIndex} 레이어 ${cel.layerIndex}의 링크`).not.toBeNull();
          } else if (cel.kind === "image") {
            expect(cel.pixels?.length).toBe(cel.width! * cel.height! * bytesPerPixel);
            if (result.header.colorDepth === 8) {
              const converted = asepriteCelToRgba8({
                pixels: cel.pixels!,
                width: cel.width!,
                height: cel.height!,
                colorDepth: 8,
                palette,
                transparentIndex: result.header.transparentIndex,
                isBackgroundLayer: layer.flags.background,
              });
              expect(converted.outOfRangePaletteIndexCount).toBe(0);
            }
          } else if (cel.kind === "tilemap") {
            expect(cel.tilemap?.bytes?.length).toBe(cel.width! * cel.height! * (cel.tilemap!.bitsPerTile / 8));
          }
        }
        for (const tileset of result.tilesets) {
          if (tileset.externalLink === null && (tileset.flags & 2) !== 0) {
            expect(tileset.tilePixels?.length).toBe(tileset.tileWidth * tileset.tileHeight * tileset.tileCount * bytesPerPixel);
          }
        }
        // 레이어 트리: 부모는 같은 스프라이트의 그룹이다.
        for (const layer of result.layers) {
          if (layer.parentIndex !== null) expect(result.layers[layer.parentIndex]?.kind).toBe("group");
        }
      });
    }
  });
}

function registerGimpBrushSamples(): void {
  describe("GIMP 브러시 계열 로컬 실샘플", () => {
    for (const name of GIMP_BRUSH_SAMPLES) {
      it(`${name}: 확장자와 같은 형식으로 판별되고 진단 없이 끝까지 읽힌다`, async () => {
        const bytes = new Uint8Array(readFileSync(join(SAMPLE_DIR, name)));
        const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();

        expect(inspectGimpBrushFormat(bytes)).toBe(extension);
        if (extension === "gbr") {
          const brush = await importGimpBrush(bytes);
          expect(brush.warnings).toEqual([]);
          expect(brush.unsupported).toEqual([]);
          expect(brush.byteLength).toBe(bytes.byteLength);
          expect(brush.pixels?.length).toBe(brush.width * brush.height * brush.bytesValue);
        } else if (extension === "pat") {
          const pattern = await importGimpPattern(bytes);
          expect(pattern.warnings).toEqual([]);
          expect(pattern.headerBytes + pattern.pixels.length).toBe(bytes.byteLength);
          expect(pattern.pixels.length).toBe(pattern.width * pattern.height * pattern.bytesPerPixel);
        } else if (extension === "gih") {
          const pipe = await importGimpBrushPipe(bytes);
          expect(pipe.truncated).toBe(false);
          expect(pipe.warnings).toEqual([]);
          expect(pipe.unsupported).toEqual([]);
          expect(pipe.brushes).toHaveLength(pipe.declaredBrushCount);
          expect(pipe.parameters.cellCount).toBe(pipe.declaredBrushCount);
          const last = pipe.brushes.at(-1)!;
          expect(last.byteOffset + last.byteLength).toBe(bytes.byteLength);
        } else {
          const generated = await importGimpGeneratedBrush(bytes);
          expect(generated.warnings).toEqual([]);
          expect(generated.radius).toBeGreaterThan(0);
        }
      });
    }
  });
}

function registerKraSamples(): void {
  describe("Krita 문서 로컬 실샘플", () => {
    // 구조 오류를 뜻하는 진단. 마스크·복제 레이어 같은 의미 손실(kra-mask-unsupported 등)과 새 Krita의 합성 연산 id는 허용한다.
    const STRUCTURAL_UNSUPPORTED = [
      "kra-layer-data-missing",
      "kra-layer-data-shared",
      "kra-layer-filename-invalid",
      "kra-layer-read-failed",
      "kra-layer-decode-failed",
      "kra-layer-limit-exceeded",
      "kra-layer-offset-invalid",
      // 마스크 값 파일(.pixelselection)이 깨졌거나 한도를 넘었다. 값 항목이 없는 마스크(kra-mask-data-missing)는 선택을 한 번도 만들지
      // 않은 정상 문서일 수 있어 구조 오류로 보지 않는다.
      "kra-mask-data-shared",
      "kra-mask-filename-invalid",
      "kra-mask-read-failed",
      "kra-mask-decode-failed",
      "kra-mask-limit-exceeded",
      "kra-mask-offset-invalid",
    ];
    // 관찰한 Krita 5.2.2 파일의 가정(첫 항목 mimetype, 타일 파일 끝, .defaultpixel, 속성 형식)이 실제 파일에서 깨졌다는 신호.
    const STRUCTURAL_WARNINGS = [
      "kra-attribute-invalid",
      "kra-default-pixel-missing",
      "kra-mimetype-missing",
      "kra-mimetype-not-first",
      "kra-mimetype-unexpected",
      "kra-png-signature-invalid",
      "kra-resource-read-failed",
      "kra-tile-trailing-bytes",
    ];

    for (const name of KRA_SAMPLES) {
      it(`${name}: 구조 진단 없이 읽히고 래스터 레이어 픽셀이 선언 크기와 맞는다`, async () => {
        const bytes = new Uint8Array(readFileSync(join(SAMPLE_DIR, name)));
        const result = await importKra(bytes);

        expect(codes(result.unsupported).filter((code) => STRUCTURAL_UNSUPPORTED.includes(code))).toEqual([]);
        expect(codes(result.warnings).filter((code) => STRUCTURAL_WARNINGS.includes(code))).toEqual([]);
        expect(result.layers.length).toBeGreaterThan(0);
        for (const layer of result.layers) {
          if (layer.parentIndex !== null) {
            expect(layer.parentIndex).toBeLessThan(layer.index);
            expect(result.layers[layer.parentIndex]?.kind).toBe("group");
          }
          for (const mask of layer.masks) {
            if (mask.values !== null) {
              expect(mask.extent).not.toBeNull();
              expect(mask.values.length).toBe(mask.extent!.width * mask.extent!.height);
              expect(mask.defaultValue).not.toBeNull();
            }
            if (mask.defaultValue !== null) {
              expect(mask.defaultValue).toBeGreaterThanOrEqual(0);
              expect(mask.defaultValue).toBeLessThanOrEqual(255);
            }
          }
          if (layer.masks.length > 0) {
            const masked = applyKraTransparencyMasks(layer);
            if (masked.status === "applied") expect(masked.pixels.length).toBe(layer.pixels!.length);
            else expect(["no-pixels", "mask-unreadable"]).toContain(masked.status);
          }
          if (layer.kind !== "raster") {
            expect(layer.pixels).toBeNull();
            continue;
          }
          if (layer.colorSpace !== null && describeKraPixelFormat(layer.colorSpace) === null) continue;
          if (layer.pixels === null) {
            // 타일이 하나도 없고 기본 픽셀이 투명한 빈 레이어만 픽셀이 없을 수 있다
            expect(layer.tileCount).toBe(0);
            expect(layer.defaultPixel?.[3]).toBe(0);
          } else {
            expect(layer.extent).not.toBeNull();
            expect(layer.pixels.length).toBe(layer.extent!.width * layer.extent!.height * 4);
          }
        }
      });
    }
  });
}

if (CLIP_SAMPLES.length > 0) registerClipSamples();
if (XCF_SAMPLES.length > 0) registerXcfSamples();
if (GIMP_BRUSH_SAMPLES.length > 0) registerGimpBrushSamples();
if (ASEPRITE_SAMPLES.length > 0) registerAsepriteSamples();
if (KRA_SAMPLES.length > 0) registerKraSamples();
