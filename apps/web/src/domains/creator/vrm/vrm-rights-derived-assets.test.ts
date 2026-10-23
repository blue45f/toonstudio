import { execFileSync, spawnSync } from "node:child_process";
import { basename, dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { BUNDLED_VRM_RIGHTS_BLOCKS, SAMPLE_VRMS } from "./vrm-library";

// 권리 판정으로 서빙을 내린 모델의 "파생물"(썸네일 렌더)이 추적 파일에 남지 않게 막는다.
// 2026-10-14 판정은 파생 썸네일도 함께 내렸다고 기록했지만 실제 트리에는 10개가 남아 있었고
// 캐논 편집기가 계속 가리키고 있었다(2026-10-23 정리). 모델 파일(.vrm)의 고아 검사는
// vrm-library.test.ts 에 있다.
//
// 목록은 디스크 readdir 이 아니라 git 인덱스로 본다. CI 의 희소 체크아웃은 public/assets 를 빼서
// 디스크로는 폴더가 비어 보이고, 그러면 아래 검사가 아무것도 못 잡은 채 초록이 된다.
const THUMBNAIL_ROOT = "apps/web/public/assets/3d/characters/thumbnails";
const THUMBNAIL_URL_PREFIX = "/assets/3d/characters/thumbnails/";
const FLAT_THUMBNAIL_DIRS = [THUMBNAIL_ROOT, `${THUMBNAIL_ROOT}/refined-v1`, `${THUMBNAIL_ROOT}/refined-v2`];

function trackedFiles(pathspec: string): string[] {
  return execFileSync("git", ["ls-files", "--", pathspec], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
}

const trackedThumbnails = trackedFiles(THUMBNAIL_ROOT).filter((path) => path.endsWith(".png"));
const stem = (path: string) => basename(path, ".png");

describe("권리 차단 모델의 파생 자산", () => {
  it("썸네일 인덱스를 실제로 읽었다 (희소 체크아웃에서 빈 목록으로 통과하지 않는다)", () => {
    expect(trackedThumbnails.length).toBeGreaterThan(50);
  });

  it("차단 모델에서 만든 썸네일이 어느 폴더에도 추적되지 않는다", () => {
    const blockedIds = new Set(BUNDLED_VRM_RIGHTS_BLOCKS.map((block) => block.id));
    expect(trackedThumbnails.filter((path) => blockedIds.has(stem(path)))).toEqual([]);
  });

  it("썸네일 폴더 직속 PNG 는 모두 카탈로그 모델의 것이다 (고아 썸네일 금지)", () => {
    const catalogIds = new Set(SAMPLE_VRMS.map((sample) => sample.id));
    const orphans = trackedThumbnails
      .filter((path) => FLAT_THUMBNAIL_DIRS.includes(dirname(path)))
      .filter((path) => !catalogIds.has(stem(path)));
    expect(orphans).toEqual([]);
  });

  it("카탈로그가 가리키는 썸네일 파일이 모두 추적된다", () => {
    const tracked = new Set(trackedThumbnails);
    const missing = SAMPLE_VRMS.flatMap((sample) =>
      sample.thumbnailUrl?.startsWith(THUMBNAIL_URL_PREFIX)
        && !tracked.has(`apps/web/public${sample.thumbnailUrl}`)
        ? [`${sample.id}: ${sample.thumbnailUrl}`]
        : [],
    );
    expect(missing).toEqual([]);
  });

  it("화면 코드(비시험 소스)가 차단 모델의 썸네일 경로를 가리키지 않는다", () => {
    const ids = BUNDLED_VRM_RIGHTS_BLOCKS.map((block) => block.id).join("|");
    const pattern = `thumbnails/(refined-v[0-9]+/)?(${ids})\\.png`;
    const result = spawnSync(
      "git",
      ["grep", "-nIE", "-e", pattern, "--", "apps/web/src", ":(exclude)*.test.ts", ":(exclude)*.test.tsx"],
      { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    // git grep 은 일치가 없으면 1, 오류면 2 로 끝난다. 오류가 "일치 없음"으로 보이지 않게 정확히 1 을 요구한다.
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toBe("");
  });
});
