/** 정밀 작업대와 Studio dialog가 공유하는 전달 안내다. 도구 런타임에 의존하지 않는다. */
type Bilingual = (ko: string, en: string) => string;
interface Studio3dHandoffAnnouncementInput {
  readonly assets: readonly unknown[];
  readonly shots: readonly unknown[];
  readonly losses: readonly { readonly code: string }[];
}

export function studioHybridDccToonHandoffNotice(bt: Bilingual): string {
  return bt("배경 편집기는 현재 일반 재질로 표시하며 툰 명암·외곽선은 반영하지 않습니다. 툰 재질 설정은 정밀 작업대와 GLB에 보존됩니다.", "The background editor currently displays a standard material without toon shading or outlines. Toon settings are preserved in the precision workbench and GLB.");
}
export function studioHybridDccHandoffAnnouncement(bt: Bilingual, result: Studio3dHandoffAnnouncementInput): string {
  const summary = bt(`3D 장면을 열었습니다 · 메시 ${result.assets.length}개 · 컷 ${result.shots.length}개 · 보존 안내 ${result.losses.length}건`, `Opened the 3D scene · ${result.assets.length} meshes · ${result.shots.length} shots · ${result.losses.length} preservation notes`);
  return result.losses.some(({ code }) => code === "toon-material-display-fallback") ? `${summary} · ${studioHybridDccToonHandoffNotice(bt)}` : summary;
}
