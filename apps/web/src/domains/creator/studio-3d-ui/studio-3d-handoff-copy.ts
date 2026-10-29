/** 정밀 작업대와 Studio dialog가 공유하는 전달 안내다. 도구 런타임에 의존하지 않는다. */
type Bilingual = (ko: string, en: string) => string;
interface Studio3dHandoffAnnouncementInput {
  readonly assets: readonly unknown[];
  readonly shots: readonly unknown[];
  readonly losses: readonly unknown[];
}

export function studioHybridDccToonHandoffNotice(bt: Bilingual): string {
  return bt("툰 재질 설정과 외곽선 정보를 배경 편집기로 함께 보냅니다.", "Toon material and outline settings are included in the background scene.");
}
export function studioHybridDccHandoffAnnouncement(bt: Bilingual, result: Studio3dHandoffAnnouncementInput): string {
  return bt(`3D 장면을 열었습니다 · 메시 ${result.assets.length}개 · 컷 ${result.shots.length}개 · 보존 안내 ${result.losses.length}건`, `Opened the 3D scene · ${result.assets.length} meshes · ${result.shots.length} shots · ${result.losses.length} preservation notes`);
}
