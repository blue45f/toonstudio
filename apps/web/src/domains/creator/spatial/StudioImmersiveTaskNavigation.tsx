import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { STUDIO_IMMERSIVE_TASKS } from "./studio-immersive-tasks";

export function StudioImmersiveTaskNavigation({ active }: { readonly active: string }) {
  const bt = useBilingual("StudioImmersiveTaskNavigation"), location = useLocation(), navigate = useNavigate();
  const href = (hash: string) => `${location.pathname}${location.search}${hash}`;
  if (active === "overview") return <nav aria-label={bt("공간 작업 목적 고르기", "Choose a spatial task")} className="my-6 grid gap-3 md:grid-cols-3">
    {[
      { hash: "#spatial-reader", ko: "내 원고 감상", en: "Read my pages", detailKo: "이미지를 열어 2D·공간에서 확인", detailEn: "Open images in 2D or in space" },
      { hash: "#immersive-workflow-title", ko: "공간 작품 만들기", en: "Create a spatial work", detailKo: "제작 흐름 · 키트 · XR 작업대", detailEn: "Workflow, starter kits and XR tools" },
      { hash: "#immersive-capability-title", ko: "기기 지원 확인", en: "Check device support", detailKo: "기기 기능 · 권한 · 사용 환경", detailEn: "Capabilities, permissions and setup" },
    ].map(task => <Link key={task.hash} href={href(task.hash)} className="flex min-h-28 flex-col gap-3 rounded-2xl border border-line bg-card p-5 text-fg hover:border-accent focus-visible:outline-accent"><strong>{bt(task.ko, task.en)}</strong><span className="text-xs text-fg-2">{bt(task.detailKo, task.detailEn)}</span><ArrowRight size={17} aria-hidden /></Link>)}
  </nav>;
  return <nav aria-label={bt("공간 작업 화면", "Spatial task screens")} className="my-5 flex flex-wrap gap-2">
    <Link href={href("")} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg"><ArrowLeft size={16} aria-hidden />{bt("목적 고르기", "Choose a task")}</Link>
    <label className="grid min-w-0 flex-1 gap-1 text-xs text-fg-2 sm:hidden">{bt("공간 작업 화면", "Spatial task screens")}<select value={active} className="min-h-12 w-full rounded-xl border border-line bg-card px-3 text-base text-fg"
      onChange={event => navigate(href(STUDIO_IMMERSIVE_TASKS.find(task => task.id === event.target.value)?.hash ?? ""))}>
      {STUDIO_IMMERSIVE_TASKS.map(task => <option key={task.id} value={task.id}>{bt(task.ko, task.en)}</option>)}
    </select></label>
    <div className="hidden flex-wrap gap-2 sm:flex">{STUDIO_IMMERSIVE_TASKS.map(task => <Link key={task.id} href={href(task.hash)} aria-current={active === task.id ? "page" : undefined}
      className={`inline-flex min-h-12 items-center rounded-xl border px-3 text-sm font-semibold ${active === task.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2"}`}>{bt(task.ko, task.en)}</Link>)}</div>
  </nav>;
}
