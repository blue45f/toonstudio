import {
  Boxes,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  PenTool,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Suspense, lazy, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { BakedManuscriptCutLayer, Stage3DMode } from "./studio-bg3d-live-ink-bake-bridge";
import type { StudioBg3dSectionCapSummary } from "./studio-bg3d-section-cap-coordination";
import {
  evaluateCameraWallCutaway,
  type Bg3dCutawayCameraInput,
  type Bg3dWallCutawayConfig,
} from "./studio-bg3d-wall-cutaway-runtime";

const LazyStudioBg3dWallCutawayToggle = lazy(() =>
  import("./StudioBg3dWallCutawayToggle").then((module) => ({
    default: module.StudioBg3dWallCutawayToggle,
  })),
);

interface StageStepSpec {
  readonly id: Stage3DMode;
  readonly stepNumber: number;
  readonly ko: string;
  readonly en: string;
  readonly helperKo: string;
  readonly helperEn: string;
  readonly accentVar: string;
  readonly glowMix: string;
}

const STAGE_STEPS: readonly StageStepSpec[] = [
  {
    id: "build",
    stepNumber: 1,
    ko: "구축",
    en: "Build",
    helperKo: "방·배경·소품 배치",
    helperEn: "Place rooms & props",
    accentVar: "var(--color-warn)",
    glowMix: "color-mix(in oklch, var(--color-warn) 20%, var(--color-card))",
  },
  {
    id: "pose",
    stepNumber: 2,
    ko: "포즈",
    en: "Pose",
    helperKo: "캐릭터 자세·배치",
    helperEn: "Pose characters",
    accentVar: "var(--color-good)",
    glowMix: "color-mix(in oklch, var(--color-good) 20%, var(--color-card))",
  },
  {
    id: "shot",
    stepNumber: 3,
    ko: "촬영",
    en: "Shot",
    helperKo: "구도·조명·벽 숨김",
    helperEn: "Frame, light & cutaway",
    accentVar: "var(--color-cool)",
    glowMix: "color-mix(in oklch, var(--color-cool) 20%, var(--color-card))",
  },
  {
    id: "live-ink",
    stepNumber: 4,
    ko: "선화",
    en: "Live Ink",
    helperKo: "실시간 선화·컷 굽기",
    helperEn: "Live Ink & bake cut",
    accentVar: "var(--color-accent)",
    glowMix: "color-mix(in oklch, var(--color-accent) 22%, var(--color-card))",
  },
];

function StageIcon({ id }: { readonly id: Stage3DMode }) {
  switch (id) {
    case "build":
      return <Boxes size={14} className="shrink-0" aria-hidden />;
    case "pose":
      return <UserRound size={14} className="shrink-0" aria-hidden />;
    case "shot":
      return <Camera size={14} className="shrink-0" aria-hidden />;
    case "live-ink":
      return <PenTool size={14} className="shrink-0" aria-hidden />;
  }
}

export interface StudioBg3dStageStepperBarProps {
  readonly activeStage: Stage3DMode;
  readonly onSelectStage: (stage: Stage3DMode) => void;
  readonly wallCutawayConfig: Bg3dWallCutawayConfig;
  readonly onToggleWallCutaway: () => void;
  readonly onChangeWallCutawayConfig: (next: Bg3dWallCutawayConfig) => void;
  readonly heroCamera?: Bg3dCutawayCameraInput | null;
  readonly sectionCapSummary?: StudioBg3dSectionCapSummary | null;
  readonly lastBakedLayer?: BakedManuscriptCutLayer | null;
  readonly bakeFlashActive?: boolean;
  readonly onRestoreReshoot?: (layer: BakedManuscriptCutLayer) => void;
}

const DEFAULT_PREVIEW_ROOM = {
  center: [0, 1.5, 0] as const,
  size: [6, 3, 6] as const,
};

/**
 * 4단계 통합 3D 공정(Build → Pose → Shot → Live Ink) 컬러 슬라이딩 스테퍼,
 * 1클릭 가림 벽 자동 투명화 툴바 버튼, 컷 굽기 완료 셔터 리플 확인 배지 및 3D 재촬영 복원 바.
 */
export function StudioBg3dStageStepperBar({
  activeStage,
  onSelectStage,
  wallCutawayConfig,
  onToggleWallCutaway,
  onChangeWallCutawayConfig,
  heroCamera = null,
  sectionCapSummary = null,
  lastBakedLayer = null,
  bakeFlashActive = false,
  onRestoreReshoot,
}: StudioBg3dStageStepperBarProps) {
  const { isEn } = useBilingual();
  const copy = (ko: string, en: string) => (isEn ? en : ko);
  const [cutawayPopoverOpen, setCutawayPopoverOpen] = useState(false);

  const previewEvaluation = evaluateCameraWallCutaway({
    camera: heroCamera ?? { position: [0, 1.6, 5.2], target: [0, 1.2, 0] },
    room: DEFAULT_PREVIEW_ROOM,
    config: wallCutawayConfig,
  });

  return (
    <div
      data-testid="studio-bg3d-stage-stepper-bar"
      className="relative flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-2.5 py-1.5"
    >
      {/* 4단계 스테이지 컬러 슬라이딩 필 */}
      <nav
        aria-label={copy("4단계 3D 제작 공정", "4-stage 3D production flow")}
        className="flex min-w-0 flex-wrap items-center gap-1"
      >
        {STAGE_STEPS.map((step) => {
          const active = activeStage === step.id;
          return (
            <button
              key={step.id}
              type="button"
              aria-pressed={active}
              data-testid={`studio-bg3d-stage-step-${step.id}`}
              title={copy(step.helperKo, step.helperEn)}
              onClick={() => onSelectStage(step.id)}
              style={{
                borderColor: active ? step.accentVar : undefined,
                background: active ? step.glowMix : undefined,
                boxShadow: active
                  ? `0 0 0 1px ${step.accentVar}, 0 8px 18px -12px ${step.accentVar}`
                  : undefined,
              }}
              className="group inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 [word-break:keep-all] transition-[transform,box-shadow,border-color,background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-accent/60 hover:text-fg active:scale-[0.97] aria-pressed:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:transform-none"
            >
              <span
                className="inline-flex size-5 items-center justify-center rounded-full text-[0.625rem] font-extrabold tabular-nums transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:transform-none"
                style={{
                  color: active ? "var(--color-on-accent)" : step.accentVar,
                  background: active ? step.accentVar : step.glowMix,
                }}
              >
                {step.stepNumber}
              </span>
              <StageIcon id={step.id} />
              <span>{copy(step.ko, step.en)}</span>
              <span className="hidden text-[0.625rem] font-medium text-fg-3 xl:inline">
                {copy(step.helperKo, step.helperEn)}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 우측 촬영·선화 즉시 제어: 1클릭 가림 벽 자동 숨김 + 단면 캡 상태 + 컷 굽기 완료/3D 재촬영 복원 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative inline-flex items-center gap-1">
          <button
            type="button"
            aria-pressed={wallCutawayConfig.enabled}
            data-testid="studio-bg3d-toolbar-wall-cutaway-btn"
            title={copy(
              "카메라 앞을 가리는 벽을 자동으로 투명 처리해 실내 컷을 편하게 촬영합니다.",
              "Automatically hide walls occluding the camera for interior shots.",
            )}
            onClick={onToggleWallCutaway}
            style={{
              borderColor: wallCutawayConfig.enabled ? "var(--color-cool)" : undefined,
              background: wallCutawayConfig.enabled
                ? "color-mix(in oklch, var(--color-cool) 20%, var(--color-card))"
                : undefined,
              boxShadow: wallCutawayConfig.enabled
                ? "0 0 0 1px var(--color-cool), 0 8px 18px -12px var(--color-cool)"
                : undefined,
            }}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 [word-break:keep-all] transition-[transform,box-shadow,border-color,background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-accent/60 hover:text-fg active:scale-[0.97] aria-pressed:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:transform-none"
          >
            {wallCutawayConfig.enabled ? (
              <Eye size={14} className="shrink-0 text-cool" aria-hidden />
            ) : (
              <EyeOff size={14} className="shrink-0 text-fg-3" aria-hidden />
            )}
            <span>{copy("가림 벽 자동 숨김", "Auto-hide walls")}</span>
            <span className="rounded-full border border-line/70 bg-panel px-1.5 py-0.5 font-mono text-[0.625rem] tabular-nums text-fg-2">
              {wallCutawayConfig.enabled
                ? copy(`${previewEvaluation.hiddenWalls.length}면`, `${previewEvaluation.hiddenWalls.length}`)
                : copy("꺼짐", "Off")}
            </span>
          </button>
          <button
            type="button"
            aria-expanded={cutawayPopoverOpen}
            aria-label={copy("가림 벽 숨김 세부 설정", "Wall cutaway settings")}
            title={copy("가림 벽 숨김 각도와 투명도를 조절합니다.", "Adjust wall cutaway angle and opacity.")}
            data-testid="studio-bg3d-toolbar-wall-cutaway-settings-btn"
            onClick={() => setCutawayPopoverOpen((prev) => !prev)}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-xl border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 [word-break:keep-all] transition-[transform,border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-accent/60 hover:text-fg active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none"
          >
            <SlidersHorizontal size={14} aria-hidden />
            <span className="hidden sm:inline">{copy("벽 설정", "Wall opts")}</span>
          </button>

          {cutawayPopoverOpen ? (
            <div
              data-testid="studio-bg3d-toolbar-wall-cutaway-popover"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(92vw,340px)] rounded-2xl border border-line bg-panel p-2 shadow-xl"
            >
              <Suspense fallback={null}>
                <LazyStudioBg3dWallCutawayToggle
                  config={wallCutawayConfig}
                  evaluation={previewEvaluation}
                  onChange={onChangeWallCutawayConfig}
                />
              </Suspense>
            </div>
          ) : null}
        </div>

        {sectionCapSummary?.enabled ? (
          <span
            data-testid="studio-bg3d-section-cap-badge"
            className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-warn/50 bg-warning-soft px-2.5 text-[0.6875rem] font-semibold text-fg"
          >
            <Scissors size={12} className="shrink-0 text-warn" aria-hidden />
            {copy(
              `단면 캡 활성 (${sectionCapSummary.capTriangleCount}면)`,
              `Section cap (${sectionCapSummary.capTriangleCount} tris)`,
            )}
          </span>
        ) : null}

        {lastBakedLayer ? (
          <div className="inline-flex items-center gap-1">
            <span
              data-testid="studio-bg3d-bake-success-badge"
              data-flash-active={bakeFlashActive ? "true" : "false"}
              style={{
                borderColor: "var(--color-good)",
                background: "color-mix(in oklch, var(--color-good) 20%, var(--color-card))",
                boxShadow: bakeFlashActive
                  ? "0 0 0 3px color-mix(in oklch, var(--color-good) 35%, transparent), 0 0 24px -4px var(--color-accent)"
                  : undefined,
              }}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold text-fg transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:transform-none ${bakeFlashActive ? "scale-[1.03]" : "scale-100"}`}
            >
              <CheckCircle2 size={14} className="shrink-0 text-good" aria-hidden />
              <span>
                {copy(
                  `컷 #${lastBakedLayer.targetCutIndex + 1} 구움 · 비파괴`,
                  `Cut #${lastBakedLayer.targetCutIndex + 1} baked`,
                )}
              </span>
            </span>
            {onRestoreReshoot ? (
              <button
                type="button"
                data-testid="studio-bg3d-restore-reshoot-btn"
                onClick={() => onRestoreReshoot(lastBakedLayer)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-xl border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 [word-break:keep-all] transition-[transform,border-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-accent hover:text-accent active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none"
              >
                <RotateCcw size={13} aria-hidden />
                {copy("3D 재촬영 복원", "Restore 3D re-shoot")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
