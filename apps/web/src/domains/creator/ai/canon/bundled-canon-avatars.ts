// 캐논 편집기 "기본 아바타" 탭의 번들 목록과, 권리 판정으로 서빙을 내린 아바타 썸네일 경로 판별.
// VRM 저장소 없이 원고용 초상 경로와 캐논의 4열 배치에 필요한 정보만 불러온다.
// 목록이 vrm-library 카탈로그와 어긋나지 않는지, 차단 모델이 섞이지 않는지는
// bundled-canon-avatars.test.ts 가 강제한다.
import { studioManuscriptPortraitUrl } from "../../catalog/studio-manuscript-portrait";

export interface BundledCanonAvatar {
  readonly id: string;
  readonly name: string;
  readonly thumbnail: string;
}

export const BUNDLED_CANON_AVATARS: readonly BundledCanonAvatar[] = [
  { id: "sample-vrm", name: "루미" },
  { id: "shino", name: "시노" },
  { id: "ts-vrm-hero-v1-romance-female", name: "서연 (로맨스 여성 주연)" },
  { id: "fumi", name: "후미" },
  { id: "shion", name: "시온" },
  { id: "vivi", name: "비비" },
  { id: "vita", name: "비타" },
  { id: "rubin", name: "루빈" },
].map((avatar) => ({ ...avatar, thumbnail: studioManuscriptPortraitUrl(avatar.id) }));

// vrm-library 의 BUNDLED_VRM_RIGHTS_BLOCKS(meebit·avatar-a/b/c·mio·noa) 모델에서 만든 파생 썸네일 경로.
// 썸네일 파일은 삭제됐지만 이전에 저장된 캐논 시트가 이 경로를 레퍼런스로 들고 있을 수 있다.
// id 목록이 차단 원장과 같은지는 시험이 대조한다.
const REMOVED_BLOCKED_AVATAR_THUMBNAIL =
  /\/assets\/3d\/characters\/thumbnails\/(?:refined-v\d+\/)?(?:meebit|avatar-[abc]|mio|noa)\.png(?:[?#]|$)/iu;

export function isRemovedBlockedAvatarThumbnail(src: string): boolean {
  return REMOVED_BLOCKED_AVATAR_THUMBNAIL.test(src);
}
