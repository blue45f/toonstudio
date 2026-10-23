// 캐논 편집기 "기본 아바타" 탭의 번들 목록과, 권리 판정으로 서빙을 내린 아바타 썸네일 경로 판별.
// vrm-library 모듈은 sqlite/OPFS 저장소까지 끌어와 무거우므로 id·표시명·썸네일 경로만 따로 둔다.
// 목록이 vrm-library 카탈로그와 어긋나지 않는지, 차단 모델이 섞이지 않는지는
// bundled-canon-avatars.test.ts 가 강제한다.

export interface BundledCanonAvatar {
  readonly id: string;
  readonly name: string;
  readonly thumbnail: string;
}

export const BUNDLED_CANON_AVATARS: readonly BundledCanonAvatar[] = [
  { id: "sample-vrm", name: "루미", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/sample-vrm.png" },
  { id: "shino", name: "시노", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/shino.png" },
  { id: "kate", name: "케이트", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/kate.png" },
  { id: "jimmy", name: "지미", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/jimmy.png" },
  { id: "shion", name: "시온", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/shion.png" },
  { id: "vivi", name: "비비", thumbnail: "/assets/3d/characters/thumbnails/refined-v1/vivi.png" },
  { id: "vita", name: "비타", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/vita.png" },
  { id: "rubin", name: "루빈", thumbnail: "/assets/3d/characters/thumbnails/refined-v1/rubin.png" },
];

// vrm-library 의 BUNDLED_VRM_RIGHTS_BLOCKS(meebit·avatar-a/b/c·mio·noa) 모델에서 만든 파생 썸네일 경로.
// 썸네일 파일은 삭제됐지만 이전에 저장된 캐논 시트가 이 경로를 레퍼런스로 들고 있을 수 있다.
// id 목록이 차단 원장과 같은지는 시험이 대조한다.
const REMOVED_BLOCKED_AVATAR_THUMBNAIL =
  /\/assets\/3d\/characters\/thumbnails\/(?:refined-v\d+\/)?(?:meebit|avatar-[abc]|mio|noa)\.png(?:[?#]|$)/iu;

export function isRemovedBlockedAvatarThumbnail(src: string): boolean {
  return REMOVED_BLOCKED_AVATAR_THUMBNAIL.test(src);
}
