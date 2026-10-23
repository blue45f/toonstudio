import { describe, expect, it } from "vitest";

import { BUNDLED_VRM_RIGHTS_BLOCKS, SAMPLE_VRM_ENTRIES } from "../../vrm/vrm-library";
import { BUNDLED_CANON_AVATARS, isRemovedBlockedAvatarThumbnail } from "./bundled-canon-avatars";

const THUMBNAIL_DIRS = ["", "refined-v1/", "refined-v2/"] as const;

describe("캐논 편집기 번들 아바타 목록", () => {
  it("모든 항목이 노출 중인 vrm 카탈로그의 id·표시명·썸네일과 같다", () => {
    for (const avatar of BUNDLED_CANON_AVATARS) {
      const entry = SAMPLE_VRM_ENTRIES.find((candidate) => candidate.id === avatar.id);
      expect(entry, `${avatar.id} 가 노출 카탈로그에 없다`).toBeDefined();
      expect(avatar.name, avatar.id).toBe(entry?.name);
      expect(avatar.thumbnail, avatar.id).toBe(entry?.thumbnail);
    }
  });

  it("id 가 겹치지 않고 권리 차단 모델이 섞이지 않는다", () => {
    const ids = BUNDLED_CANON_AVATARS.map((avatar) => avatar.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const block of BUNDLED_VRM_RIGHTS_BLOCKS) {
      expect(ids, block.id).not.toContain(block.id);
    }
  });

  it("그리드 4열을 빈칸 없이 채운다", () => {
    expect(BUNDLED_CANON_AVATARS.length % 4).toBe(0);
  });
});

describe("서빙을 내린 차단 아바타 썸네일 판별", () => {
  it("차단 원장의 모든 모델에 대해 예전 썸네일 경로를 가려낸다", () => {
    for (const block of BUNDLED_VRM_RIGHTS_BLOCKS) {
      for (const dir of THUMBNAIL_DIRS) {
        const path = `/assets/3d/characters/thumbnails/${dir}${block.id}.png`;
        expect(isRemovedBlockedAvatarThumbnail(path), path).toBe(true);
      }
    }
  });

  it("노출 중인 카탈로그 썸네일은 가려내지 않는다", () => {
    for (const entry of SAMPLE_VRM_ENTRIES) {
      expect(entry.thumbnail, entry.id).not.toBeNull();
      expect(isRemovedBlockedAvatarThumbnail(entry.thumbnail ?? ""), entry.id).toBe(false);
    }
  });

  it("질의·해시가 붙거나 절대 URL 이어도 가려내고, 이름이 비슷한 다른 파일은 두지 않는다", () => {
    expect(isRemovedBlockedAvatarThumbnail("/assets/3d/characters/thumbnails/refined-v2/avatar-a.png?v=2")).toBe(true);
    expect(isRemovedBlockedAvatarThumbnail("https://toonstudio.example/assets/3d/characters/thumbnails/MIO.png#top")).toBe(true);
    expect(isRemovedBlockedAvatarThumbnail("/assets/3d/characters/thumbnails/avatar-d.png")).toBe(false);
    expect(isRemovedBlockedAvatarThumbnail("/assets/3d/characters/thumbnails/mio-extra.png")).toBe(false);
    expect(isRemovedBlockedAvatarThumbnail("/assets/other/avatar-a.png")).toBe(false);
  });
});
