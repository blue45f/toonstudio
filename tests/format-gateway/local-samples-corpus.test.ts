import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseClipContainer } from "../../packages/studio-format-gateway/src/chunked-sqlite-container";
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

if (CLIP_SAMPLES.length > 0) registerClipSamples();
if (XCF_SAMPLES.length > 0) registerXcfSamples();
