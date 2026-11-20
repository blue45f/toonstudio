import { Box, Camera, Check, ChevronDown, Layers, PenTool, UserRound } from "lucide-react";
import { useState } from "react";

import Link from "@/shared/navigation/router-link";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioBg3dAssetShelf", ko, en);

export type Bg3dShelfStageId = "build" | "pose" | "shot" | "ink";
type AssetShelfCategoryId = "rooms" | "props" | "characters" | "lighting";

export interface AssetShelfEntry {
  readonly id: string;
  readonly category: AssetShelfCategoryId;
  readonly specKo: string;
  readonly specEn: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly metaKo: string;
  readonly metaEn: string;
}

const STAGE_FLOW_STEPS: readonly {
  readonly id: Bg3dShelfStageId;
  readonly icon: typeof Box;
  readonly category: AssetShelfCategoryId;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "build", icon: Box, category: "rooms", ko: "1. 공간 조립", en: "1. Build Stage" },
  { id: "pose", icon: UserRound, category: "characters", ko: "2. 캐릭터 포즈", en: "2. Character Pose" },
  { id: "shot", icon: Camera, category: "props", ko: "3. 카메라 컷", en: "3. Camera Shot" },
  { id: "ink", icon: PenTool, category: "lighting", ko: "4. 선화 브리지", en: "4. Live Ink Bridge" },
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
    specKo: "2점 투시 · 벽 자동 숨김",
    specEn: "2-point · Auto-hide walls",
    titleKo: "학교 교실·복도 모듈",
    titleEn: "Classroom & Hallway Set",
    metaKo: "2점 투시 · 가림 벽면 자동 투명화",
    metaEn: "2-point perspective · auto-hide occluding walls",
  },
  {
    id: "room-alley",
    category: "rooms",
    specKo: "야간 · 빗길 반사",
    specEn: "Night · Wet reflection",
    titleKo: "야간 골목길·상점가",
    titleEn: "Night Alley & Storefronts",
    metaKo: "빗길 반사 · 네온 간판 분리 레이어",
    metaEn: "Wet road reflections · layered signage",
  },
  {
    id: "room-office",
    category: "rooms",
    specKo: "격자 스냅",
    specEn: "Snap grid",
    titleKo: "현대 오피스·회의실",
    titleEn: "Modern Office & Boardroom",
    metaKo: "파티션·데스크 격자 스냅 지원",
    metaEn: "Modular desks & partition snap grid",
  },
  {
    id: "prop-desk",
    category: "props",
    specKo: "바닥 스냅",
    specEn: "Floor snap",
    titleKo: "책상·의자·모니터 세트",
    titleEn: "Desk, Chair & Monitor Kit",
    metaKo: "바닥 충돌 스냅 · 원근 자동 정렬",
    metaEn: "Floor collision snap & perspective align",
  },
  {
    id: "prop-cafe",
    category: "props",
    specKo: "선화 최적화",
    specEn: "Clean lineart",
    titleKo: "카페 테이블·식기 소품",
    titleEn: "Cafe Table & Tableware Props",
    metaKo: "외곽선 두께 분리 추출 최적화",
    metaEn: "Optimized for clean contour lineart",
  },
  {
    id: "char-turnaround",
    category: "characters",
    specKo: "24관절 포즈",
    specEn: "24-joint rig",
    titleKo: "기본 체형 더미·포즈 릭",
    titleEn: "Body Mannequin & 24-Joint Rig",
    metaKo: "관절 기즈모 · 카메라 시선 고정",
    metaEn: "IK joint gizmos & camera gaze lock",
  },
  {
    id: "char-duo",
    category: "characters",
    specKo: "신장비 가이드",
    specEn: "Height ratio",
    titleKo: "대화 투샷 구도 가이드",
    titleEn: "Two-Shot Dialogue Framing",
    metaKo: "등신대·신장비 자동 비교 가이드",
    metaEn: "Automatic character height-ratio guide",
  },
  {
    id: "light-sunset",
    category: "lighting",
    specKo: "선화 분할 비교",
    specEn: "Split-wipe lineart",
    titleKo: "노을 역광 + 외곽선 추출",
    titleEn: "Sunset Rim Light & Lineart",
    metaKo: "툰 음영 · 그림자/선화 분리 패스",
    metaEn: "Toon shading with separated shadow & ink passes",
  },
  {
    id: "light-cc0",
    category: "lighting",
    specKo: "상업 무료 (CC0)",
    specEn: "Commercial free (CC0)",
    titleKo: "상업 무료 표면 재질(CC0)",
    titleEn: "Commercial Free Materials (CC0)",
    metaKo: "출처와 이용 조건을 확인하고 현재 장면에 적용",
    metaEn: "Verify source terms and apply to current scene",
  },
] as const;

export interface StudioBg3dAssetShelfProps {
  readonly onClose: () => void;
  readonly activeStage?: Bg3dShelfStageId;
  readonly onSelectStage?: (stage: Bg3dShelfStageId) => void;
  readonly placedAssetIds?: readonly string[];
  readonly onInsertAsset?: (entry: AssetShelfEntry) => void;
  readonly onBakeToManuscriptCut?: () => void;
}

export function StudioBg3dAssetShelf({
  onClose,
  activeStage: controlledStage,
  onSelectStage,
  placedAssetIds,
  onInsertAsset,
  onBakeToManuscriptCut,
}: StudioBg3dAssetShelfProps) {
  useBilingualI18nRevision();
  const [internalStage, setInternalStage] = useState<Bg3dShelfStageId>("build");
  const [category, setCategory] = useState<AssetShelfCategoryId>("rooms");
  const [localPlacedIds, setLocalPlacedIds] = useState<readonly string[]>([]);
  const [shelfNotice, setShelfNotice] = useState<string | null>(null);

  const activeStage = controlledStage ?? internalStage;
  const effectivePlacedIds = placedAssetIds ?? localPlacedIds;
  const items = SHELF_ENTRIES.filter((entry) => entry.category === category);

  const handleStageSelect = (step: (typeof STAGE_FLOW_STEPS)[number]) => {
    setInternalStage(step.id);
    setCategory(step.category);
    onSelectStage?.(step.id);
  };

  const handleInsertEntry = (entry: AssetShelfEntry) => {
    const label = bi(entry.titleKo, entry.titleEn);
    if (!placedAssetIds) {
      setLocalPlacedIds((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]));
    }
    onInsertAsset?.(entry);
    setShelfNotice(
      bi(`“${label}” 항목을 현재 3D 장면에 배치했습니다.`, `Placed "${label}" into the active 3D scene.`),
    );
  };

  const handleBakeClick = () => {
    if (onBakeToManuscriptCut) {
      onBakeToManuscriptCut();
      return;
    }
    setShelfNotice(
      bi("현재 3D 뷰포트를 2D 컷 레이어로 굽기 준비를 마쳤습니다.", "Prepared current 3D viewport to bake into the 2D cut."),
    );
  };

  return (
    <section
      aria-label={bi("3D 에셋 쉘프", "3D Asset Shelf")}
      data-testid="studio-bg3d-asset-shelf"
      className="shrink-0 border-t border-line bg-panel px-3.5 py-3"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div
          role="group"
          aria-label={bi("3D 세트·선화 4단계 모드 전환", "4-stage 3D set to lineart mode switch")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {STAGE_FLOW_STEPS.map((step) => {
            const Icon = step.icon;
            const active = activeStage === step.id;
            return (
              <button
                key={step.id}
                type="button"
                aria-pressed={active}
                data-testid={`studio-bg3d-stage-step-${step.id}`}
                onClick={() => handleStageSelect(step)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors [word-break:keep-all]",
                  active
                    ? "border-accent bg-accent-soft text-accent shadow-[inset_2px_0_0_var(--color-accent)]"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                <Icon size={13} aria-hidden="true" />
                {bi(step.ko, step.en)}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="studio-bg3d-bake-to-panel-cta"
            onClick={handleBakeClick}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2 [word-break:keep-all]"
          >
            <PenTool size={14} aria-hidden="true" />
            {bi("현재 컷에 바로 굽기", "Bake to current cut")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Layers size={14} className="text-accent" aria-hidden="true" />
            {bi("에셋 쉘프", "Asset Shelf")}
          </span>
          {SHELF_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/60 hover:text-fg aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent [word-break:keep-all]"
            >
              {bi(item.ko, item.en)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/60 hover:text-fg"
        >
          <ChevronDown size={14} aria-hidden="true" />
          {bi("쉘프 접기", "Collapse shelf")}
        </button>
      </div>

      {shelfNotice ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="studio-bg3d-asset-shelf-status"
          className="mt-2 rounded-lg border border-accent/35 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent"
        >
          {shelfNotice}
        </p>
      ) : null}

      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((entry) => {
          const placed = effectivePlacedIds.includes(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              data-testid={`studio-bg3d-shelf-item-${entry.id}`}
              aria-pressed={placed}
              onClick={() => handleInsertEntry(entry)}
              className={cn(
                "group flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors [word-break:keep-all]",
                placed
                  ? "border-accent bg-accent-soft/45 shadow-[inset_2px_0_0_var(--color-accent)]"
                  : "border-line bg-card hover:border-accent/55 hover:bg-raised",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="mb-0.5 inline-block rounded bg-panel px-1.5 py-0.5 text-xs font-medium text-accent">
                  {bi(entry.specKo, entry.specEn)}
                </span>
                <span className="block truncate text-xs font-semibold text-fg group-hover:text-accent">
                  {bi(entry.titleKo, entry.titleEn)}
                </span>
                <span className="block truncate text-xs text-fg-2">
                  {bi(entry.metaKo, entry.metaEn)}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
                {placed ? <Check size={12} aria-hidden="true" /> : null}
                {placed ? bi("배치됨", "Placed") : bi("씬에 배치", "Place")}
              </span>
            </button>
          );
        })}
      </div>

      <nav
        aria-label={bi("3D 하이브리드 DCC 6대 전문 모드 및 컴패니언", "3D hybrid DCC 6 pro modes and companion")}
        data-testid="studio-bg3d-dcc-mode-bar"
        className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5"
      >
        <span className="mr-1 text-xs font-medium text-fg-3">
          {bi("전문 DCC · 보조기기:", "Pro DCC & Companion:")}
        </span>
        {DCC_MODE_LINKS.map((mode) => (
          <Link
            key={mode.id}
            href={mode.href}
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/55 hover:text-accent"
          >
            {bi(mode.ko, mode.en)}
          </Link>
        ))}
      </nav>
    </section>
  );
}
