import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseClipContainer } from "../../packages/studio-format-gateway/src/chunked-sqlite-container";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const SAMPLE_DIR = join(HERE, "..", "corpus", "formats", "local-samples");

/** 사용자가 로컬에 둔 실제 샘플. 비어 있으면 샘플별 테스트는 만들어지지 않는다. */
const SAMPLES = existsSync(SAMPLE_DIR)
  ? readdirSync(SAMPLE_DIR)
      .filter((name) => /\.(clip|lip)$/i.test(name))
      .sort()
  : [];

describe("청크형 SQLite 컨테이너 로컬 실샘플 코퍼스", () => {
  it("로컬 샘플 디렉터리는 Git이 무시하고 README만 추적한다", () => {
    const rules = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8").split(/\r?\n/);

    expect(rules).toContain("/tests/corpus/formats/local-samples/*");
    expect(rules).toContain("!/tests/corpus/formats/local-samples/README.md");
  });

  for (const name of SAMPLES) {
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
