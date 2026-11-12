import { Box, Camera, ChevronDown, Layers, PenTool, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";

import Link from "@/shared/navigation/router-link";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioBg3dAssetShelf", ko, en);

type AssetShelfCategoryId = "rooms" | "props" | "characters" | "lighting";

interface AssetShelfEntry {
  readonly id: string;
  readonly category: AssetShelfCategoryId;
  readonly spec: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly metaKo: string;
  readonly metaEn: string;
  readonly href: string;
}

const STAGE_FLOW_BADGES = [
  { id: "build", icon: Box, ko: "1. 공간 조립 Build", en: "1. Build Stage" },
  { id: "pose", icon: UserRound, ko: "2. 캐릭터 포즈 Pose", en: "2. Character Pose" },
  { id: "shot", icon: Camera, ko: "3. 카메라 컷 Shot", en: "3. Camera Shot" },
  { id: "ink", icon: PenTool, ko: "4. 선화 브리지 Live Ink", en: "4. Live Ink Bridge" },
] as const;

const SHELF_CATEGORIES: readonly {
  readonly id: AssetShelfCategoryId;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "rooms", ko: "공간 프리셋", en: "Stage Presets" },
  { id: "props", ko: "가구·소품", en: "Props & Sets" },
  { id: "characters", ko: "캐릭터·포즈", en: "Characters & Poses" },
  { id: "lighting", ko: "조명·선화", en: "Lighting & Lineart" },
] as const;

const DCC_MODE_LINKS: readonly {
  readonly id: string;
  readonly ko: string;
  readonly en: string;
  readonly href: string;
}[] = [
  { id: "build", ko: "DCC 빌드", en: "DCC Build", href: "/studio/3d/dcc/build" },
  { id: "model", ko: "모델링", en: "Modeling", href: "/studio/3d/dcc/model" },
  { id: "sculpt", ko: "스컬프트", en: "Sculpt", href: "/studio/3d/dcc/sculpt" },
  { id: "material", ko: "머티리얼", en: "Material", href: "/studio/3d/dcc/material" },
  { id: "cad", ko: "정밀 CAD", en: "Precision CAD", href: "/studio/3d/dcc/cad" },
  { id: "shot", ko: "카메라 샷", en: "Camera Shot", href: "/studio/3d/dcc/shot" },
  { id: "companion", ko: "보조기기 컴패니언", en: "Companion Pad", href: "/studio/companion/workspace" },
  { id: "storyworld", ko: "세계관·컬러", en: "Storyworld & Color", href: "/studio/storyworld" },
] as const;

const SHELF_ENTRIES: readonly AssetShelfEntry[] = [
  {
    id: "room-classroom",
    category: "rooms",
    spec: "2PT · AUTO-HIDE WALL",
    titleKo: "학교 교실·복도 모듈",
    titleEn: "Classroom & Hallway Set",
    metaKo: "2점 투시 · 가림 벽면 자동 투명화",
    metaEn: "2-point perspective · auto-hide occluding walls",
    href: "/studio/bg3d?preset=classroom",
  },
  {
    id: "room-alley",
    category: "rooms",
    spec: "NIGHT · WET PBR",
    titleKo: "야간 골목길·상점가",
    titleEn: "Night Alley & Storefronts",
    metaKo: "빗길 반사 · 네온 간판 분리 레이어",
    metaEn: "Wet road reflections · layered signage",
    href: "/studio/bg3d?preset=alley",
  },
  {
    id: "room-office",
    category: "rooms",
    spec: "SNAP GRID",
    titleKo: "현대 오피스·회의실",
    titleEn: "Modern Office & Boardroom",
    metaKo: "파티션·데스크 격자 스냅 지원",
    metaEn: "Modular desks & partition snap grid",
    href: "/studio/bg3d?preset=office",
  },
  {
    id: "prop-desk",
    category: "props",
    spec: "FLOOR SNAP",
    titleKo: "책상·의자·모니터 세트",
    titleEn: "Desk, Chair & Monitor Kit",
    metaKo: "바닥 충돌 스냅 · 원근 자동 정렬",
    metaEn: "Floor collision snap & perspective align",
    href: "/market/browse?kind=3d-asset",
  },
  {
    id: "prop-cafe",
    category: "props",
    spec: "CLEAN INK",
    titleKo: "카페 테이블·식기 소품",
    titleEn: "Cafe Table & Tableware Props",
    metaKo: "외곽선 두께 분리 추출 최적화",
    metaEn: "Optimized for clean contour lineart",
    href: "/market/browse?kind=3d-asset",
  },
  {
    id: "char-turnaround",
    category: "characters",
    spec: "24-JOINT IK",
    titleKo: "기본 체형 더미·포즈 릭",
    titleEn: "Body Mannequin & 24-Joint Rig",
    metaKo: "관절 기즈모 · 카메라 시선 고정",
    metaEn: "IK joint gizmos & camera gaze lock",
    href: "/studio/assets/characters/new",
  },
  {
    id: "char-duo",
    category: "characters",
    spec: "HEIGHT RATIO",
    titleKo: "대화 투샷 구도 가이드",
    titleEn: "Two-Shot Dialogue Framing",
    metaKo: "등신대·신장비 자동 비교 가이드",
    metaEn: "Automatic character height-ratio guide",
    href: "/studio/assets/characters/new",
  },
  {
    id: "light-sunset",
    category: "lighting",
    spec: "SPLIT-WIPE INK",
    titleKo: "노을 역광 + 외곽선 추출",
    titleEn: "Sunset Rim Light & Lineart",
    metaKo: "툰 셰이딩 · 그림자/선화 분리 패스",
    metaEn: "Toon shading with separated shadow & ink passes",
    href: "/research/open-data/ambientcg",
  },
  {
    id: "light-cc0",
    category: "lighting",
    spec: "CC0",
    titleKo: "ambientCG CC0 PBR 재질",
    titleEn: "ambientCG CC0 PBR Materials",
    metaKo: "출처와 이용 조건을 확인하고 적용",
    metaEn: "Check source and usage terms before applying",
    href: "/research/open-data/ambientcg",
  },
] as const;

export function StudioBg3dAssetShelf({
  onClose,
}: {
  readonly onClose: () => void;
}) {
  useBilingualI18nRevision();
  const [category, setCategory] = useState<AssetShelfCategoryId>("rooms");
  const items = SHELF_ENTRIES.filter((entry) => entry.category === category);

  return (
    <section
      aria-label={bi("3D 에셋 쉘프", "3D Asset Shelf")}
      data-testid="studio-bg3d-asset-shelf"
      className="shrink-0 border-t border-line bg-panel/95 px-3.5 py-3 backdrop-blur-xl"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2.5">
        <ol
          aria-label={bi("3D 세트·선화 4단계 흐름", "4-stage 3D set to lineart workflow")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {STAGE_FLOW_BADGES.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold",
                  index === 3
                    ? "bg-accent-soft text-accent"
                    : "bg-card/80 text-fg-2",
                )}
              >
                <Icon size={12} aria-hidden="true" />
                {bi(step.ko, step.en)}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/studio/comic"
            data-testid="studio-bg3d-bake-to-panel-cta"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-black text-on-accent shadow-sm transition-colors hover:bg-accent-2"
          >
            <Sparkles size={14} aria-hidden="true" />
            {bi("원고 편집기로 이동", "Open manuscript editor")}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-black text-fg">
            <Layers size={14} className="text-accent" aria-hidden="true" />
            {bi("에셋 쉘프", "Asset Shelf")}
          </span>
          {SHELF_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 transition-colors hover:border-accent/60 hover:text-fg aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
            >
              {bi(item.ko, item.en)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/60 hover:text-fg"
        >
          <ChevronDown size={14} aria-hidden="true" />
          {bi("쉘프 접기", "Collapse shelf")}
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((entry) => (
          <Link
            key={entry.id}
            href={entry.href}
            className="group flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5 text-left transition-colors hover:border-accent/55 hover:bg-raised"
          >
            <span className="min-w-0 flex-1">
              <span className="mb-0.5 inline-block rounded bg-panel px-1.5 py-0.5 font-display text-[10px] font-bold tracking-wider text-accent">
                {entry.spec}
              </span>
              <span className="block truncate text-xs font-black text-fg group-hover:text-accent">
                {bi(entry.titleKo, entry.titleEn)}
              </span>
              <span className="block truncate text-[0.68rem] text-fg-2">
                {bi(entry.metaKo, entry.metaEn)}
              </span>
            </span>
            <span className="shrink-0 rounded-lg bg-accent-soft px-2.5 py-1 text-[0.68rem] font-extrabold text-accent">
              {bi("열기", "Open")}
            </span>
          </Link>
        ))}
      </div>

      <nav
        aria-label={bi("3D 하이브리드 DCC 6대 전문 모드 및 컴패니언", "3D hybrid DCC 6 pro modes and companion")}
        data-testid="studio-bg3d-dcc-mode-bar"
        className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2.5"
      >
        <span className="mr-1 text-[11px] font-bold text-fg-3">
          {bi("전문 DCC · 보조기기:", "Pro DCC & Companion:")}
        </span>
        {DCC_MODE_LINKS.map((mode) => (
          <Link
            key={mode.id}
            href={mode.href}
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/55 hover:text-accent"
          >
            {bi(mode.ko, mode.en)}
          </Link>
        ))}
      </nav>
    </section>
  );
}
