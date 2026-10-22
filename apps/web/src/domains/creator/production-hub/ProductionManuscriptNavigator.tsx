/**
 * Production 원고 워크스페이스 — 뷰 카탈로그·공정 내비게이터·역량 그리드.
 *
 * `ProductionManuscriptWorkspace.tsx`에서 분리한 표시 계층이다.
 * 데이터 로딩과 명령 실행은 워크스페이스가 소유하고, 이 파일은 카탈로그와
 * 내비게이션 표시만 책임진다.
 */

import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileArchive,
  GitCompareArrows,
  History,
  Layers3,
  MessageSquare,
  MonitorSmartphone,
  Sparkles,
  Users,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { cn } from "@/shared/lib/utils";

import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import { productionManuscriptAttention } from "./production-manuscript-ux";

export type ManuscriptView = "processes" | "workbench" | "versions" | "feedback" | "delivery" | "assistant" | "permissions" | "start" | "activity";

export const VIEW_ITEMS: readonly {
  readonly id: ManuscriptView;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "processes", label: "공정·원고", icon: Workflow },
  { id: "workbench", label: "전문 비교", icon: GitCompareArrows },
  { id: "versions", label: "버전·비교", icon: FileArchive },
  { id: "feedback", label: "피드백", icon: MessageSquare },
  { id: "delivery", label: "공유·내보내기", icon: Download },
  { id: "assistant", label: "AI 도우미", icon: WandSparkles },
  { id: "permissions", label: "팀·권한", icon: Users },
  { id: "start", label: "시작 가이드", icon: Sparkles },
  { id: "activity", label: "활동", icon: History },
];

export const CAPABILITIES: readonly {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly destination: "workspace" | "production" | "versions" | "feedback" | "delivery" | "assistant";
}[] = [
  { title: "워크스페이스·멤버·권한", description: "소유자·관리자·편집자·댓글·보기 권한을 서버에서 다시 확인합니다.", icon: Users, destination: "workspace" },
  { title: "이미지·텍스트 공정", description: "대본·콘티·작화·배경·식자·현지화·오디오·납품 공정을 한 회차에 묶습니다.", icon: Layers3, destination: "production" },
  { title: "불변 버전·최종본", description: "자동 저장·체크포인트·검수본·승인본·게시본을 덮어쓰지 않고 보존합니다.", icon: FileArchive, destination: "versions" },
  { title: "원고 비교·복원", description: "버전 간 비교와 과거 revision의 새 체크포인트 복원을 지원합니다.", icon: GitCompareArrows, destination: "versions" },
  { title: "페이지·컷 피드백", description: "위치 주석, 필수 수정, 해결 상태, 댓글과 검수 결정을 고정 원고에 연결합니다.", icon: MessageSquare, destination: "feedback" },
  { title: "보호 공유·모바일 검수", description: "고정된 검수본만 공유하고 접근·만료·폐기를 매 열기마다 검증합니다.", icon: MonitorSmartphone, destination: "delivery" },
  { title: "다중 형식 내보내기", description: "플랫폼·SNS·인쇄·PDF·편집본·전자책·영상·보관 규격을 사전 검사합니다.", icon: Download, destination: "delivery" },
  { title: "AI 제작 보조", description: "대사·구도·배경·캐릭터·팔레트 요청을 편집기로 넘기고 원본은 보호합니다.", icon: Sparkles, destination: "assistant" },
];


export function attentionBadgeClass(
  level: ReturnType<typeof productionManuscriptAttention>["level"],
): string {
  if (level === "danger") return "border-bad/35 bg-bad/10 text-bad";
  if (level === "warning") return "border-warn/35 bg-warn/10 text-warn";
  if (level === "success") return "border-good/35 bg-good/10 text-good";
  return "border-line bg-raised text-fg-2";
}

export function Badge({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-[0.6875rem] font-bold", className)}>{children}</span>;
}


export function episodeLabels(aggregate: ProductionProjectAggregate): Readonly<Record<string, string>> {
  const labels: Record<string, string> = {};
  for (const plan of aggregate.episodePlans) {
    labels[plan.episodeId] = `${plan.episodeNumber}화 · ${plan.title}`;
  }
  for (const [index, episode] of aggregate.episodes.entries()) {
    labels[episode.episodeId] ??= `${index + 1}화 · ${episode.episodeId}`;
  }
  return Object.freeze(labels);
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

