import {
  ArrowLeft,
  Brush,
  CheckCircle2,
  Gauge,
  GitFork,
  Library,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useLocation, useParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";

import {
  STUDIO_BRUSH_LABELS,
  STUDIO_BRUSH_LIBRARY_ROUTE,
  resolveStudioBrushEditorContext,
} from "../brush/studio-brush-product-model";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { StudioBrushIntegratedWorkbench } from "./StudioBrushIntegratedWorkbench";
import { StudioBrushProductCataloguePanel } from "./StudioBrushProductCataloguePanel";
import { StudioTextureToneLab } from "../drawing/StudioTextureToneLab";

const STEPS = [
  {
    icon: Sparkles,
    number: "1",
    title: "시작 브러시 선택",
    description: "실제 결과와 손맛이 구분되는 제품 브러시나 목적별 레시피에서 시작합니다.",
  },
  {
    icon: Brush,
    number: "2",
    title: "실제 입력으로 시험",
    description: "현재 펜의 필압·기울기·속도로 직접 그리며 결과를 확인합니다.",
  },
  {
    icon: SlidersHorizontal,
    number: "3",
    title: "결과부터 조절",
    description: "기본 편집은 재료와 질감에 집중하고 엔진·물리는 필요할 때만 엽니다.",
  },
  {
    icon: CheckCircle2,
    number: "4",
    title: "저장하고 원고에 적용",
    description: "완성한 브러시를 라이브러리에 저장하고 원래 원고에서 바로 사용합니다.",
  },
] as const;

/** Render the canonical full editor for the single Brush Studio product. */
export function StudioBrushLabPage() {
  const params = useParams<{ workId?: string; sourceWorkId?: string; brushId?: string }>();
  const location = useLocation();
  const context = resolveStudioBrushEditorContext(params, location.search);
  const editingSavedBrush = context.mode === "edit";

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1920px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-[1.75rem] border border-line bg-card/55 p-5 shadow-sm sm:p-7">
        <figure className="relative -mx-5 -mt-5 mb-6 sm:-mx-7 sm:-mt-7">
          <img
            src="/brand/hero-20261009/brush-lab-hero.webp"
            srcSet="/brand/hero-20261009/brush-lab-hero-960.webp 960w, /brand/hero-20261009/brush-lab-hero.webp 1680w"
            sizes="(max-width: 1920px) 100vw, 1856px"
            width={1680}
            height={560}
            alt="붓과 잉크, 수채 도구와 펜 태블릿이 놓인 작가 책상에서 만화 원고를 그리는 손"
            fetchPriority="high"
            decoding="async"
            className="block aspect-[3/1] w-full object-cover motion-safe:animate-fade-up"
          />
          <figcaption className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[0.65rem] font-semibold text-white/90 backdrop-blur-sm">
            브랜드 콘셉트 아트 · 실제 편집 화면이 아닙니다
          </figcaption>
        </figure>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.2em] text-accent">
              <Brush size={14} aria-hidden /> BRUSH STUDIO
            </p>
            <h1 className="mt-2 text-pretty text-2xl font-black tracking-tight text-fg sm:text-4xl">
              {context.workspaceTitle}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
              {editingSavedBrush
                ? "저장한 브러시를 실제 획으로 비교하면서 재료·입력·패턴·엔진 구성을 한곳에서 다듬습니다."
                : "시작 브러시를 고른 뒤 실제 획으로 시험하고, 재료·입력·패턴을 필요한 깊이까지 조절합니다."}
              {" "}기본 편집과 전문가 설정은 같은 브러시 정의와 저장 경로를 사용합니다.
            </p>
            <p className="mt-3 inline-flex rounded-full border border-line bg-panel/60 px-3 py-1 text-xs font-bold text-fg-3">
              {context.contextLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={STUDIO_BRUSH_LIBRARY_ROUTE}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg transition-colors hover:border-line-strong hover:bg-raised ${STUDIO_FOCUS_RING}`}
            >
              <Library size={15} aria-hidden />
              {STUDIO_BRUSH_LABELS.choose}
            </Link>
            <Link
              href={context.returnHref}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg transition-colors hover:border-line-strong hover:bg-raised ${STUDIO_FOCUS_RING}`}
            >
              <ArrowLeft size={15} aria-hidden />
              {context.returnLabel}
            </Link>
          </div>
        </div>

        {/*
          적용 범위 밴드는 리믹스 전용이다 (2026-10-08 소형 잔여 처분으로 재확인).
          이 밴드는 현황 스트립이 아니라 "원본은 바뀌지 않는다"는 적용 범위 경고라서
          그 오해가 생기는 리믹스에만 붙는다. 비-리믹스 컨텍스트의 상태 표시는 위쪽
          헤더의 workspaceTitle·contextLabel이 담당한다. 제작 프로젝트 현황 스트립
          (ProductionProjectStatusStrip)은 ProductionProjectAggregate가 전제라,
          제작 프로젝트 종속이 없는 이 표면에는 해당하지 않는다.
        */}
        {context.kind === "remix" ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-accent/35 bg-accent/10 px-4 py-3" role="status">
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-accent">
              <GitFork size={14} aria-hidden />
              리믹스 작업 중
            </span>
            <p className="text-xs leading-5 text-fg-2">
              이 작업 공간은 원본 작품에서 갈라져 나온 리믹스 전용입니다. 여기서 만든 브러시는 리믹스 원고에만 적용되고, 원본 작품은 바뀌지 않아요.
            </p>
          </div>
        ) : null}

        <section className="mt-6 grid gap-2 md:grid-cols-2" aria-label="브러시 스튜디오 편집 깊이">
          <article className="rounded-2xl border border-line bg-panel/45 p-4">
            <span className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-fg-3">QUICK</span>
            <h2 className="mt-1 text-sm font-black text-fg">{STUDIO_BRUSH_LABELS.editCurrent}</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              캔버스 안에서 크기·필압·펜촉·질감을 빠르게 조절합니다. 현재 작업을 끊지 않는 간편 모드입니다.
            </p>
          </article>
          <article aria-current="page" className="rounded-2xl border border-accent/45 bg-accent/10 p-4">
            <span className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-accent">FULL · CURRENT</span>
            <h2 className="mt-1 text-sm font-black text-fg">{STUDIO_BRUSH_LABELS.product} · {STUDIO_BRUSH_LABELS.fullEditor}</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              시작점 선택, 실제 입력 시험, A/B 비교, 재료·물리·패턴·엔진 구성과 저장을 한 화면에서 진행합니다.
            </p>
          </article>
        </section>

        <ol className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4" aria-label="브러시 전체 편집 단계">
          {STEPS.map(({ icon: Icon, number, title, description }) => (
            <li key={number} className="rounded-2xl border border-line bg-panel/55 p-3.5">
              <div className="flex items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon size={15} aria-hidden />
                </span>
                <span className="text-[0.62rem] font-black text-accent">STEP {number}</span>
              </div>
              <strong className="mt-3 block text-sm text-fg">{title}</strong>
              <span className="mt-1 block text-xs leading-5 text-fg-3">{description}</span>
            </li>
          ))}
        </ol>

        <details className="mt-4 rounded-2xl border border-line bg-panel/35 p-3.5">
          <summary className={`flex min-h-11 cursor-pointer items-center gap-2 text-xs font-bold text-fg-2 ${STUDIO_FOCUS_RING}`}>
            <Gauge size={15} className="text-accent" aria-hidden />
            전문가 설정은 필요할 때만 표시됩니다
          </summary>
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs leading-6 text-fg-3">
              기본 편집에서는 레시피·비교·재료·입력·패턴에 집중합니다. 전문가 설정을 켜면
              엔진 조합, 물리 패스, 공급자 호환성과 실행 비용을 추가로 확인할 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[0.65rem] font-semibold text-fg-3">
              {["필압·기울기", "종이·재질", "수채·유화", "듀얼 팁·입자", "패턴·문양", "엔진 조합", "가져오기·내보내기"].map((label) => (
                <span key={label} className="rounded-full border border-line bg-card px-2.5 py-1">{label}</span>
              ))}
            </div>
          </div>
        </details>
      </header>

      <div className="mt-5 space-y-5">
        {!editingSavedBrush ? <StudioBrushProductCataloguePanel baseHref={context.baseHref} /> : null}
        <StudioBrushIntegratedWorkbench scope={context.scope} />
        {editingSavedBrush ? <StudioBrushProductCataloguePanel baseHref={context.baseHref} /> : null}
        <section aria-label="질감·톤 실험실" className="overflow-hidden rounded-[1.75rem] border border-line bg-card/55 p-5 shadow-sm sm:p-7">
          <div className="max-w-4xl">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.2em] text-accent">TEXTURE · TONE LAB</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-fg sm:text-2xl">
              질감·톤 실험실
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
              브러시에 종이결을 입히고, 만화 톤을 붙이고, 색감을 한 번에 바꾸는 실험실입니다.
              이중 브러시·스크린톤·그라데이션 맵을 실시간 캔버스 프리뷰로 시험해 보세요.
            </p>
          </div>
          <div className="mt-5">
            <StudioTextureToneLab />
          </div>
        </section>
      </div>
    </div>
  );
}
