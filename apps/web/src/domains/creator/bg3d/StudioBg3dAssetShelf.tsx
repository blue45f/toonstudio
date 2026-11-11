import { useState } from "react";

type AssetShelfCategoryId = "rooms" | "props" | "characters" | "lighting";

interface AssetShelfEntry {
  readonly id: string;
  readonly category: AssetShelfCategoryId;
  readonly title: string;
  readonly meta: string;
  readonly href: string;
}

const SHELF_CATEGORIES: readonly { readonly id: AssetShelfCategoryId; readonly label: string }[] = [
  { id: "rooms", label: "공간 프리셋" },
  { id: "props", label: "가구·소품" },
  { id: "characters", label: "캐릭터·포즈" },
  { id: "lighting", label: "조명·선화" },
] as const;

const DCC_MODE_LINKS: readonly { readonly id: string; readonly label: string; readonly href: string }[] = [
  { id: "build", label: "DCC 빌드", href: "/studio/3d/dcc/build" },
  { id: "model", label: "모델링", href: "/studio/3d/dcc/model" },
  { id: "sculpt", label: "스컬프트", href: "/studio/3d/dcc/sculpt" },
  { id: "material", label: "머티리얼", href: "/studio/3d/dcc/material" },
  { id: "cad", label: "정밀 CAD", href: "/studio/3d/dcc/cad" },
  { id: "shot", label: "카메라 샷", href: "/studio/3d/dcc/shot" },
  { id: "companion", label: "보조기기 컴패니언", href: "/studio/companion/canvas" },
  { id: "storyworld", label: "세계관·컬러", href: "/studio/storyworld" },
] as const;

const SHELF_ENTRIES: readonly AssetShelfEntry[] = [
  { id: "room-classroom", category: "rooms", title: "학교 교실·복도 모듈", meta: "2점 투시 · 벽면 자동 숨김", href: "/studio/bg3d?preset=classroom" },
  { id: "room-alley", category: "rooms", title: "야간 골목길·상점가", meta: "빗길 반사 · 간판 레이어", href: "/studio/bg3d?preset=alley" },
  { id: "room-office", category: "rooms", title: "현대 오피스·회의실", meta: "파티션·데스크 스냅", href: "/studio/bg3d?preset=office" },
  { id: "prop-desk", category: "props", title: "책상·의자·모니터 세트", meta: "바닥 스냅 지원", href: "/market/browse?kind=3d" },
  { id: "prop-cafe", category: "props", title: "카페 테이블·식기 소품", meta: "클립 선화 최적화", href: "/market/browse?kind=3d" },
  { id: "char-turnaround", category: "characters", title: "기본 체형 더미·포즈 릭", meta: "관절 기즈모 · 시선 고정", href: "/character-lab" },
  { id: "char-duo", category: "characters", title: "대화 투샷 구도 가이드", meta: "신장비 자동 비교", href: "/character-lab" },
  { id: "light-sunset", category: "lighting", title: "노을 역광 + 외곽선 추출", meta: "툰 셰이딩 · 그림자 분리", href: "/research/open-data/ambientcg" },
  { id: "light-cc0", category: "lighting", title: "ambientCG CC0 PBR 재질", meta: "출처 보존 즉시 적용", href: "/research/open-data/ambientcg" },
] as const;

export function StudioBg3dAssetShelf({
  onClose,
}: {
  readonly onClose: () => void;
}) {
  const [category, setCategory] = useState<AssetShelfCategoryId>("rooms");
  const items = SHELF_ENTRIES.filter((entry) => entry.category === category);

  return (
    <section
      aria-label="3D 에셋 쉘프"
      data-testid="studio-bg3d-asset-shelf"
      className="shrink-0 border-t border-line bg-panel/95 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-black text-fg">에셋 쉘프</span>
          {SHELF_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
              className="min-h-8 rounded-lg border border-line bg-card px-2.5 text-[0.68rem] font-semibold text-fg-2 hover:border-accent/60 hover:text-fg aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-8 rounded-lg border border-line bg-card px-2.5 text-[0.68rem] font-semibold text-fg-2 hover:border-accent/60 hover:text-fg"
        >
          쉘프 접기
        </button>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((entry) => (
          <a
            key={entry.id}
            href={entry.href}
            className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2 text-left transition-colors hover:border-accent/55 hover:bg-raised"
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-fg">{entry.title}</span>
              <span className="block truncate text-[0.65rem] text-fg-3">{entry.meta}</span>
            </span>
            <span className="shrink-0 rounded-md bg-accent-soft px-2 py-0.5 text-[0.62rem] font-bold text-accent">
              열기
            </span>
          </a>
        ))}
      </div>
      <nav
        aria-label="3D 하이브리드 DCC 6대 전문 모드 및 컴패니언"
        data-testid="studio-bg3d-dcc-mode-bar"
        className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2"
      >
        <span className="text-[11px] font-bold text-fg-3">전문 DCC · 보조기기:</span>
        {DCC_MODE_LINKS.map((mode) => (
          <a
            key={mode.id}
            href={mode.href}
            className="inline-flex min-h-8 items-center rounded-lg border border-line bg-card px-2.5 text-[11px] font-semibold text-fg-2 transition-colors hover:border-accent/55 hover:text-accent"
          >
            {mode.label}
          </a>
        ))}
      </nav>
    </section>
  );
}
