import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTarotArtPath } from "./tarot-art";

// 아트 경로가 실제 public 자산과 어긋나면 폴백만 남는다 — 매핑과 파일
// 실재를 함께 고정한다. vitest는 repo 루트에서 실행된다.
const PUBLIC_TAROT_DIR = join(process.cwd(), "apps/web/public/images/tarot");

function expectArtFileExists(path: string) {
  const file = join(PUBLIC_TAROT_DIR, path.replace("/images/tarot/", ""));
  expect(existsSync(file), `${path} 파일이 있어야 한다`).toBe(true);
  expect(statSync(file).size).toBeGreaterThan(10_000);
}

describe("getTarotArtPath", () => {
  it("사진풍 아트가 있는 메이저 아르카나는 카드별 webp를 돌려준다", () => {
    for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 16, 17, 18, 19, 20, 21]) {
      const path = getTarotArtPath(id);
      expect(path).toBe(`/images/tarot/major-${String(id).padStart(2, "0")}.webp`);
      expectArtFileExists(path!);
    }
  });

  it("아트가 없는 메이저 아르카나(12·15)는 폴백용으로 null이다", () => {
    expect(getTarotArtPath(12)).toBeNull();
    expect(getTarotArtPath(15)).toBeNull();
  });

  it("마이너 아르카나는 슈트별 대표 아트를 쓴다", () => {
    expect(getTarotArtPath(22)).toBe("/images/tarot/suit-wands.webp");
    expect(getTarotArtPath(35)).toBe("/images/tarot/suit-wands.webp");
    expect(getTarotArtPath(36)).toBe("/images/tarot/suit-cups.webp");
    expect(getTarotArtPath(50)).toBe("/images/tarot/suit-swords.webp");
    expect(getTarotArtPath(64)).toBe("/images/tarot/suit-pentacles.webp");
    expect(getTarotArtPath(77)).toBe("/images/tarot/suit-pentacles.webp");
    for (const suit of ["wands", "cups", "swords", "pentacles"]) {
      expectArtFileExists(`/images/tarot/suit-${suit}.webp`);
    }
  });

  it("범위 밖 id는 null이다", () => {
    expect(getTarotArtPath(-1)).toBeNull();
    expect(getTarotArtPath(78)).toBeNull();
    expect(getTarotArtPath(1.5)).toBeNull();
  });
});
