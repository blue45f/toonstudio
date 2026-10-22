/**
 * Production 원고 워크스페이스 — 배지·공정 내비게이터·역량 그리드·데모 미리보기.
 *
 * `ProductionManuscriptWorkspace.tsx`에서 분리한 표시 계층이다.
 * 데이터 로딩과 명령 실행은 워크스페이스가 소유하고, 이 파일은 내비게이션 표시만 책임진다.
 * Fast Refresh 경계를 지키려고 컴포넌트만 내보내며, 보기·역량 카탈로그와 순수 함수는
 * `production-manuscript-navigator-model.ts`에 둔다.
 */

import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { cn } from "@/shared/lib/utils";

import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import {
  CAPABILITIES,
  VIEW_ITEMS,
  attentionBadgeClass,
  type ManuscriptView,
} from "./production-manuscript-navigator-model";
import { productionManuscriptAttention } from "./production-manuscript-ux";

export function Badge({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-[0.6875rem] font-bold", className)}>{children}</span>;
}

export function ProcessNavigator({ processes, selected, view, onSelect }: {
  readonly processes: readonly ProductionManuscriptProcess[];
  readonly selected: ProductionManuscriptProcess | null;
  readonly view: "versions" | "feedback" | "delivery" | "assistant";
  readonly onSelect: (process: ProductionManuscriptProcess, view: ManuscriptView) => void;
}) {
  if (!selected) return null;
  const index = processes.findIndex((process) => process.artifact.id === selected.artifact.id);
  const previous = index > 0 ? processes[index - 1] : null;
  const next = index >= 0 && index < processes.length - 1 ? processes[index + 1] : null;
  const attention = productionManuscriptAttention(selected);
  return <section className="rounded-2xl border border-line bg-card p-3 sm:p-4" aria-label="선택한 원고 공정">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-black text-fg">{selected.artifact.title}</p>
          <Badge className={attentionBadgeClass(attention.level)}>{attention.label}</Badge>
        </div>
        <p className="mt-1 text-xs text-fg-2">
          {selected.artifact.scope.episodeId ?? "프로젝트 공통"} · {selected.label}
          {` · ${selected.revisions.length}개 revision`}
        </p>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          aria-label="이전 공정"
          disabled={!previous}
          onClick={() => previous && onSelect(previous, view)}
          data-manuscript-touch-target=""
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-panel text-fg-2 hover:bg-raised disabled:opacity-40"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <label className="min-w-0 flex-1 lg:flex-none">
          <span className="sr-only">원고 공정 선택</span>
          <select
            value={selected.artifact.id}
            onChange={(event) => {
              const process = processes.find((candidate) => candidate.artifact.id === event.target.value);
              if (process) onSelect(process, view);
            }}
            data-manuscript-touch-target=""
            className="min-h-11 max-w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
          >
            {processes.map((process) => <option key={process.artifact.id} value={process.artifact.id}>
              {process.artifact.title}
            </option>)}
          </select>
        </label>
        <button
          type="button"
          aria-label="다음 공정"
          disabled={!next}
          onClick={() => next && onSelect(next, view)}
          data-manuscript-touch-target=""
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-panel text-fg-2 hover:bg-raised disabled:opacity-40"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  </section>;
}

export function CapabilityGrid({ aggregate, setView }: {
  readonly aggregate: ProductionProjectAggregate;
  readonly setView: (view: ManuscriptView) => void;
}) {
  const hrefFor = (destination: (typeof CAPABILITIES)[number]["destination"]): string | null => {
    if (destination === "workspace") return "/team/people";
    if (destination === "production") return `/studio/p/${encodeURIComponent(aggregate.workId)}/production?view=documents`;
    return null;
  };
  return <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="manuscript-capabilities-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">CREATIVE OPERATIONS</p>
        <h2 id="manuscript-capabilities-title" className="mt-2 text-xl font-black text-fg">툰스튜디오에 통합된 제작 기능</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">별도 원고 복사본을 만들지 않고 Production과 Studio의 동일 프로젝트·revision·권한을 사용합니다.</p>
      </div>
      <Badge className="border-good/35 bg-good/10 text-good"><CheckCircle2 className="mr-1 size-3.5" aria-hidden="true" />통합 운영</Badge>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {CAPABILITIES.map((capability) => {
        const Icon = capability.icon;
        const content = <>
          <span className="flex size-9 items-center justify-center rounded-xl border border-line bg-raised text-accent"><Icon className="size-4" aria-hidden="true" /></span>
          <span className="mt-3 block text-sm font-black text-fg">{capability.title}</span>
          <span className="mt-1 block text-xs leading-5 text-fg-2">{capability.description}</span>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">열기 <ArrowRight className="size-3.5" aria-hidden="true" /></span>
        </>;
        if (capability.destination === "workspace" || capability.destination === "production") {
          return <Link key={capability.title} to={hrefFor(capability.destination)!} className="rounded-2xl border border-line bg-panel p-4 transition hover:border-accent/40 hover:bg-raised">{content}</Link>;
        }
        const view: ManuscriptView = capability.destination;
        return <button key={capability.title} type="button" onClick={() => setView(view)} className="rounded-2xl border border-line bg-panel p-4 text-left transition hover:border-accent/40 hover:bg-raised">{content}</button>;
      })}
    </div>
  </section>;
}

export function DemoWorkspace({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const [view, setView] = useState<ManuscriptView>("processes");
  return <div className="space-y-4">
    <section className="rounded-3xl border border-accent/30 bg-accent-soft/20 p-5">
      <div className="flex items-start gap-3"><Eye className="mt-0.5 size-5 text-accent" aria-hidden="true" /><div><h2 className="font-black text-fg">기능 미리보기 프로젝트</h2><p className="mt-1 text-sm leading-6 text-fg-2">실제 원고 revision과 검수 권한을 임의로 만들지 않습니다. 내 프로젝트에서 열면 아래 기능이 동일 ID로 연결됩니다.</p></div></div>
    </section>
    <CapabilityGrid aggregate={aggregate} setView={setView} />
    <div className="rounded-2xl border border-line bg-card p-4 text-xs text-fg-2">현재 선택: {VIEW_ITEMS.find((item) => item.id === view)?.label}</div>
  </div>;
}

