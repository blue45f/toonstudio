import { ChevronRight, CloudOff, PenLine, Plus } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { ProductionCommandPalette } from "./ProductionCommandPalette";
import { ProductionProjectStatusStrip } from "./ProductionProjectStatusStrip";
import type { ProductionProjectAccess } from "./production-dashboard-api";
import { projectAccessRoleLabel } from "./production-labels";
import { ProductionPill, ProductionSampleBadge } from "./production-ui";
import type { ProductionSaveState } from "./use-production-project-session";
import {
  parseProcessLens,
  summarizeProcessLensTasks,
  usePreferredProcessLens,
  type ProductionProcessLens,
} from "./use-preferred-process-lens";
import { parseRoleLens } from "./use-preferred-role-lens";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const ROLE_LENS_OPTIONS: readonly { readonly value: CreatorRoleLens; readonly ko: string; readonly en: string }[] = [
  { value: "story", ko: "스토리 작가", en: "Story writer" },
  { value: "art", ko: "그림 작가", en: "Artist" },
  { value: "producer", ko: "PD·편집자", en: "Producer" },
];

const PROCESS_LENS_OPTIONS: readonly { readonly value: ProductionProcessLens; readonly ko: string; readonly en: string }[] = [
  { value: "all", ko: "전체 공정", en: "All processes" },
  { value: "storyboard", ko: "콘티", en: "Storyboard" },
  { value: "line-art", ko: "선화", en: "Line art" },
  { value: "color", ko: "채색", en: "Coloring" },
  { value: "background", ko: "배경", en: "Background" },
  { value: "lettering", ko: "식자", en: "Lettering" },
];

/**
 * 선택한 공정의 작업 현황 한 줄. 역할 렌즈만으로는 "내 공정 일이 지금 어떤가"가
 * 안 보여, 공정 렌즈를 고르면 그 공정의 작업 수·진행·검수·막힘을 헤더에서 바로 읽힌다.
 * aggregate 파생만 쓰고, 전체 공정이면 아무것도 그리지 않는다.
 */
function ProcessLensSummary({ aggregate, lens }: { readonly aggregate: ProductionProjectAggregate; readonly lens: ProductionProcessLens }) {
  const bt = useBilingual("ProductionProjectHeader");
  const summary = useMemo(() => summarizeProcessLensTasks(aggregate.tasks, lens), [aggregate.tasks, lens]);
  if (lens === "all") return null;
  const option = PROCESS_LENS_OPTIONS.find((entry) => entry.value === lens);
  if (!option) return null;
  const label = bt(option.ko, option.en);
  if (summary.total === 0) {
    return (
      <span className="text-xs text-fg-3" role="status">
        {bt(`${label} 작업이 아직 없습니다`, `No ${label} tasks yet`)}
      </span>
    );
  }
  const koParts = [`${label} 작업 ${summary.total}건`];
  const enParts = [`${summary.total} ${label} task${summary.total === 1 ? "" : "s"}`];
  if (summary.active > 0) {
    koParts.push(`진행 중 ${summary.active}`);
    enParts.push(`${summary.active} in progress`);
  }
  if (summary.review > 0) {
    koParts.push(`검수 대기 ${summary.review}`);
    enParts.push(`${summary.review} in review`);
  }
  if (summary.blocked > 0) {
    koParts.push(`막힘 ${summary.blocked}`);
    enParts.push(`${summary.blocked} blocked`);
  }
  if (summary.active === 0 && summary.review === 0 && summary.blocked === 0) {
    koParts.push("모두 완료");
    enParts.push("all done");
  }
  return (
    <span className="text-xs text-fg-3" role="status">
      {bt(koParts.join(" · "), enParts.join(" · "))}
    </span>
  );
}

function SaveStatus({ saveState, revision, isDemo }: { readonly saveState: ProductionSaveState; readonly revision: number; readonly isDemo: boolean }) {
  const bt = useBilingual("ProductionProjectHeader");
  const text = saveState === "saving"
    ? bt("저장 중…", "Saving…")
    : saveState === "saved"
      ? isDemo ? bt("이 브라우저에 반영됨", "Applied in this browser") : bt("저장됨", "Saved")
      : saveState === "error"
        ? bt("저장 실패", "Save failed")
        : isDemo ? bt("샘플 · 서버 저장 안 함", "Sample · not saved to server") : bt(`버전 ${revision}`, `Version ${revision}`);
  return (
    <span className="inline-flex min-h-11 items-center gap-1.5 text-xs text-fg-3" role="status">
      {isDemo ? <CloudOff className="size-3.5" aria-hidden="true" /> : null}
      {text}
    </span>
  );
}

/**
 * 프로젝트 표지 타일 — 16개 제작 표면이 공유하는 공통 헤더의 첫 화면 주인공.
 * aggregate.coverImageUrl이 채워졌을 때만 실물 이미지를 쓰고, 없으면 제목 이니셜
 * 타이포 폴백을 같은 크기로 유지해 레이아웃이 흔들리지 않는다.
 */
function ProductionProjectCoverTile({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const coverImageUrl = aggregate.coverImageUrl ?? null;
  if (coverImageUrl) {
    return (
      <img
        src={coverImageUrl}
        alt=""
        className="h-16 w-12 shrink-0 rounded-lg border border-line object-cover shadow-sm sm:h-[4.5rem] sm:w-[3.375rem]"
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="studio-texture-paper flex h-16 w-12 shrink-0 select-none items-center justify-center rounded-lg border border-line bg-[linear-gradient(150deg,var(--color-accent-soft),var(--color-panel)_58%,var(--color-raised))] text-xl font-black text-accent sm:h-[4.5rem] sm:w-[3.375rem]"
    >
      {aggregate.title.trim().charAt(0) || "?"}
    </span>
  );
}

export function ProductionProjectHeader({
  aggregate,
  access,
  roleLens,
  onRoleLensChange,
  saveState,
  isDemo,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly access: ProductionProjectAccess;
  readonly roleLens: CreatorRoleLens;
  readonly onRoleLensChange: (value: CreatorRoleLens) => void;
  readonly saveState: ProductionSaveState;
  readonly isDemo: boolean;
}) {
  const bt = useBilingual("ProductionProjectHeader");
  const [processLens, setProcessLens] = usePreferredProcessLens(aggregate.projectId);
  return (
    <header className="creator-workflow-topbar border-b border-line bg-panel px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[100rem] flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ProductionProjectCoverTile aggregate={aggregate} />
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link className="inline-flex min-h-6 items-center font-bold tracking-[0.04em] text-accent hover:underline" to="/production">
              {bt("제작 관리", "Production")}
            </Link>
            <ChevronRight className="size-3.5 text-fg-3" aria-hidden="true" />
            {isDemo ? <ProductionSampleBadge label={bt("샘플 프로젝트", "Sample project")} /> : null}
            <ProductionPill tone={access.owner || access.manage ? "accent" : "neutral"}>
              {bt("내 권한", "My access")}: {projectAccessRoleLabel(access.role, bt)}
            </ProductionPill>
          </div>
          <h1 className="mt-1 truncate text-xl font-black tracking-tight text-fg sm:text-2xl">{aggregate.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductionCommandPalette aggregate={aggregate} />
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2 focus-within:ring-2 focus-within:ring-accent">
            <span>{bt("내 역할", "My role")}</span>
            <select
              className="min-h-10 bg-transparent font-semibold text-fg outline-none"
              value={roleLens}
              onChange={(event) => {
                const next = parseRoleLens(event.target.value);
                if (next) onRoleLensChange(next);
              }}
            >
              {ROLE_LENS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{bt(option.ko, option.en)}</option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2 focus-within:ring-2 focus-within:ring-accent">
            <span>{bt("내 공정", "My process")}</span>
            <select
              className="min-h-10 bg-transparent font-semibold text-fg outline-none"
              value={processLens}
              onChange={(event) => {
                const next = parseProcessLens(event.target.value);
                if (next) setProcessLens(next);
              }}
            >
              {PROCESS_LENS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{bt(option.ko, option.en)}</option>
              ))}
            </select>
          </label>
          <ProcessLensSummary aggregate={aggregate} lens={processLens} />
          <SaveStatus saveState={saveState} revision={aggregate.revision} isDemo={isDemo} />
          {isDemo ? (
            <Link className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })} to="/studio/new">
              <Plus className="size-4" aria-hidden="true" />
              {bt("내 작품으로 시작", "Start my own work")}
            </Link>
          ) : (
            <Link
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}
              to={`/studio/work/${encodeURIComponent(aggregate.workId)}/canvas`}
            >
              <PenLine className="size-4" aria-hidden="true" />
              {bt("원고 작업 열기", "Open manuscript editor")}
            </Link>
          )}
        </div>
      </div>
      <div className="mx-auto mt-3 max-w-[100rem] border-t border-line pt-3">
        <ProductionProjectStatusStrip aggregate={aggregate} />
      </div>
    </header>
  );
}
