import "../../../shared/styles/studio-route.css";

import {
  ArrowLeft,
  Brush,
  CheckCircle2,
  Gauge,
  GitFork,
  Library,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

import { registerStudioBrushGrainSourcesV1 } from "../brush/studio-brush-grain-source-catalog-v1";
import {
  STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS,
  pinStudioCompetitorFavoritesToProductRepository,
  type StudioFavoriteSlotPinResult,
} from "../brush/studio-competitor-favorite-slots";
import { refineStudioCompetitorFreehandStroke } from "../brush/studio-competitor-stroke-refinement";
import {
  STUDIO_BRUSH_LABELS,
  STUDIO_BRUSH_LIBRARY_ROUTE,
  resolveStudioBrushEditorContext,
} from "../brush/studio-brush-product-model";
import { StudioTextureToneLab } from "../drawing/StudioTextureToneLab";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { StudioBrushIntegratedWorkbench } from "./StudioBrushIntegratedWorkbench";
import { StudioBrushProductCataloguePanel } from "./StudioBrushProductCataloguePanel";

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

const KERNEL_MODES = [
  { id: "dual-tip-multiply", ko: "듀얼 팁 Multiply 합성", en: "Dual-Tip Multiply Kernel" },
  { id: "rebelle-wet-pigment", ko: "Rebelle 습식 안료 확산", en: "Rebelle Wet-Pigment Diffusion" },
  { id: "gpen-velocity-taper", ko: "G펜 속도 감응 칼끝 테이퍼", en: "G-Pen Velocity Taper" },
] as const;

const STYLUS_CURVES = [
  { id: "scurve-soft-ink", ko: "S-커브 소프트 잉크 필압", en: "S-Curve Soft Ink Pressure" },
  { id: "linear-precision", ko: "선형 정밀 드로잉 응답", en: "Linear Precision Response" },
  { id: "heavy-chisel-tilt", ko: "고필압 치즐 기울기 보정", en: "Heavy Chisel Tilt Curve" },
] as const;

const WAVE37_FLAGSHIP_RECIPES = [
  {
    id: "csp-real-gpen-aa",
    ko: "리얼 G펜 · 서브픽셀 칼선",
    en: "Real G-Pen · Subpixel AA",
    spacing: 0.08,
    taper: 0.85,
  },
  {
    id: "csp-dual-chalk-ink-liner",
    ko: "듀얼 초크 건식 펜선",
    en: "Dual-Chalk Dry Ink Liner",
    spacing: 0.08,
    taper: 0.78,
  },
  {
    id: "calligraphy-barrel-twist-nib",
    ko: "배럴 트위스트 납작 닙",
    en: "Barrel-Twist Chisel Nib",
    spacing: 0.08,
    taper: 0.68,
  },
  {
    id: "procreate-6b-tilt-graphite",
    ko: "6B 틸트 그래파이트",
    en: "6B Tilt Graphite",
    spacing: 0.1,
    taper: 0.62,
  },
  {
    id: "rebelle-capillary-wash",
    ko: "모세관 꽃양배추 수채 워시",
    en: "Capillary Cauliflower Wash",
    spacing: 0.11,
    taper: 0.45,
  },
  {
    id: "krita-impasto-fan-bristle",
    ko: "원심 강모 임파스토 믹서",
    en: "Centrifugal Impasto Bristle",
    spacing: 0.09,
    taper: 0.54,
  },
] as const;

function resolveToolbarNextIndex(
  event: KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  total: number,
  allowDigits = false,
): { readonly nextIndex: number; readonly digitShortcut: boolean } | null {
  if (total <= 0) return null;
  if (
    allowDigits
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && /^[1-9]$/u.test(event.key)
  ) {
    const slot = Number(event.key) - 1;
    if (slot >= 0 && slot < total) {
      return { nextIndex: slot, digitShortcut: true };
    }
  }
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    return { nextIndex: (currentIndex + 1) % total, digitShortcut: false };
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    return { nextIndex: (currentIndex - 1 + total) % total, digitShortcut: false };
  }
  if (event.key === "Home") {
    return { nextIndex: 0, digitShortcut: false };
  }
  if (event.key === "End") {
    return { nextIndex: total - 1, digitShortcut: false };
  }
  return null;
}

function focusToolbarButtonAt(currentButton: HTMLButtonElement, nextIndex: number): void {
  const toolbar = currentButton.closest<HTMLElement>('[role="toolbar"]');
  const buttons = toolbar?.querySelectorAll<HTMLButtonElement>("button");
  const target = buttons?.[nextIndex];
  target?.focus({ preventScroll: true });
  target?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

/** Render the canonical full editor for the single Brush Studio product. */
export function StudioBrushLabPage() {
  const params = useParams<{ workId?: string; sourceWorkId?: string; brushId?: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const task = searchParams.get("brushTask") ?? (params.brushId ? "edit" : "presets");
  const activeTask = ["presets", "edit", "engine", "texture"].includes(task) ? task : "presets";
  const previousTask = useRef(activeTask), taskHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (previousTask.current !== activeTask) { previousTask.current = activeTask; taskHeading.current?.focus(); } }, [activeTask]);
  const taskHref = (next: string) => { const query = new URLSearchParams(location.search); query.set("brushTask", next); return `${location.pathname}?${query.toString()}${location.hash}`; };
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const [kernelMode, setKernelMode] = useState<(typeof KERNEL_MODES)[number]["id"]>("dual-tip-multiply");
  const [stylusCurve, setStylusCurve] = useState<(typeof STYLUS_CURVES)[number]["id"]>("scurve-soft-ink");
  const [wave37RecipeId, setWave37RecipeId] =
    useState<(typeof WAVE37_FLAGSHIP_RECIPES)[number]["id"]>("csp-real-gpen-aa");
  const [pinResult, setPinResult] = useState<StudioFavoriteSlotPinResult | null>(null);
  const [pinError, setPinError] = useState<boolean>(false);
  const [isPinningFavorites, setIsPinningFavorites] = useState<boolean>(false);
  const activeKernel = KERNEL_MODES.find((item) => item.id === kernelMode) ?? KERNEL_MODES[0];
  const activeCurve = STYLUS_CURVES.find((item) => item.id === stylusCurve) ?? STYLUS_CURVES[0];
  const activeWave37Recipe =
    WAVE37_FLAGSHIP_RECIPES.find((item) => item.id === wave37RecipeId) ?? WAVE37_FLAGSHIP_RECIPES[0];

  const wave37Refinement = useMemo(
    () =>
      refineStudioCompetitorFreehandStroke({
        points: [14, 38, 56, 8, 98, 40, 152, 10, 198, 28],
        pressures: [0.34, 0.78, 0.92, 0.68, 0.16],
        strokeWidthPx: 12,
        baseSpacingRatio: activeWave37Recipe.spacing,
        subdivisionsPerSegment: 8,
        exitTaperStrength01: activeWave37Recipe.taper,
      }),
    [activeWave37Recipe.spacing, activeWave37Recipe.taper],
  );

  function selectKernelMode(nextId: (typeof KERNEL_MODES)[number]["id"]): void {
    setKernelMode(nextId);
    globalThis.dispatchEvent?.(
      new CustomEvent("toonspectrum:brush-lab-rea-preset", {
        detail: { kernelMode: nextId },
      }),
    );
  }

  function selectStylusCurve(nextId: (typeof STYLUS_CURVES)[number]["id"]): void {
    setStylusCurve(nextId);
    globalThis.dispatchEvent?.(
      new CustomEvent("toonspectrum:brush-lab-rea-preset", {
        detail: { stylusCurve: nextId },
      }),
    );
  }

  async function runPinFavorites(resetCustomizations: boolean): Promise<void> {
    if (isPinningFavorites) return;
    setIsPinningFavorites(true);
    setPinError(false);
    try {
      const result = await pinStudioCompetitorFavoritesToProductRepository(
        undefined,
        resetCustomizations ? { resetCustomizations: true } : undefined,
      );
      setPinResult(result);
    } catch {
      setPinError(true);
      setPinResult(null);
    } finally {
      setIsPinningFavorites(false);
    }
  }

  const context = resolveStudioBrushEditorContext(params, location.search);
  useEffect(() => {
    registerStudioBrushGrainSourcesV1();
  }, []);
  const editingSavedBrush = context.mode === "edit";
  const isRemixContext = context.kind === "remix";
  const heroArt = isRemixContext
    ? {
        src: "/brand/hero-20261009/remix-brush-hero.webp",
        srcSet: "/brand/hero-20261009/remix-brush-hero-960.webp 960w, /brand/hero-20261009/remix-brush-hero.webp 1680w",
        alt: "하나의 원고 캔버스에서 주황과 청록 두 갈래로 갈라지는 리믹스 변형 캔버스와 붓",
      }
    : {
        src: "/brand/hero-20261009/brush-lab-hero.webp",
        srcSet: "/brand/hero-20261009/brush-lab-hero-960.webp 960w, /brand/hero-20261009/brush-lab-hero.webp 1680w",
        alt: "붓과 잉크, 수채 도구와 펜 태블릿이 놓인 작가 책상에서 만화 원고를 그리는 손",
      };

  const pinNeedsAttention = pinError || pinResult?.status === "memory-only";

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1920px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="overflow-hidden rounded-[1.75rem] border border-line bg-card/55 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.2em] text-accent">
              <Brush size={14} aria-hidden /> BRUSH STUDIO
            </p>
            <h1 className="mt-2 text-pretty text-2xl font-black tracking-tight text-fg sm:text-4xl">
              {context.workspaceTitle}
            </h1>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              {pickLang("작업을 고른 뒤 브러시를 시험하고 저장하세요.", "Choose a task, test your brush, then save it.")}
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

        {isRemixContext ? (
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

        <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{pickLang("시작 방법과 전문가 설정 안내", "Getting started and advanced settings guide")}</summary>
        <p className="mt-3 text-sm leading-7 text-fg-2">{editingSavedBrush ? "저장한 브러시를 실제 획으로 비교하면서 재료·입력·패턴·엔진 구성을 한곳에서 다듬습니다." : "시작 브러시를 고른 뒤 실제 획으로 시험하고, 재료·입력·패턴을 필요한 깊이까지 조절합니다."} 기본 편집과 전문가 설정은 같은 브러시 정의와 저장 경로를 사용합니다.</p>
        <figure className="relative mt-4"><img src={heroArt.src} srcSet={heroArt.srcSet} sizes="(max-width: 1920px) 100vw, 1856px" width={1680} height={560} alt={heroArt.alt} loading="lazy" decoding="async" className="block aspect-[3/1] w-full object-cover" /><figcaption className="mt-1 text-xs text-fg-3">브랜드 콘셉트 아트 · 실제 편집 화면이 아닙니다</figcaption></figure>
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

        <section
          aria-label="타사 툴 브러시 1:1 매칭 가이드"
          data-testid="brush-lab-competitor-matching"
          className="mt-4 rounded-2xl border border-accent/25 bg-accent/5 p-3.5"
        >
          <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-accent">
            COMPETITOR 1:1 MATCHING GUIDE · 익숙한 타사 브러시 그대로 시작하기
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-line bg-card/85 px-3 py-2">
              <strong className="block text-xs font-bold text-fg">클립스튜디오 리얼 G펜·마루펜</strong>
              <span className="mt-0.5 block text-[0.68rem] leading-4 text-fg-3">
                → 리얼 G펜 · 서브픽셀 칼선 (구심 Catmull 곡률 보간 + 서브픽셀 SDF AA)
              </span>
            </div>
            <div className="rounded-xl border border-line bg-card/85 px-3 py-2">
              <strong className="block text-xs font-bold text-fg">프로크리에이트 6B 연필·시럽 잉크</strong>
              <span className="mt-0.5 block text-[0.68rem] leading-4 text-fg-3">
                → 6B 틸트 그래파이트 (저고도 기울기 측면 셰이딩 + 판화지 요철 침착)
              </span>
            </div>
            <div className="rounded-xl border border-line bg-card/85 px-3 py-2">
              <strong className="block text-xs font-bold text-fg">사이툴(SAI) 연필·수채 블렌더</strong>
              <span className="mt-0.5 block text-[0.68rem] leading-4 text-fg-3">
                → 샤프·수채 혼색 브러시 (S-1~S-7 견인줄 평활화 + K/S 감산 혼색)
              </span>
            </div>
            <div className="rounded-xl border border-line bg-card/85 px-3 py-2">
              <strong className="block text-xs font-bold text-fg">리벨 7·크리타 습식 수채·유화</strong>
              <span className="mt-0.5 block text-[0.68rem] leading-4 text-fg-3">
                → 모세관 꽃양배추 수채 / 원심 강모 임파스토 믹서 (커피링·부채꼴 강모)
              </span>
            </div>
          </div>
        </section></details>
      </header>
      <nav aria-label={pickLang("브러시 작업 선택", "Choose a brush task")} className="my-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {([["presets", "브러시 고르기", "Choose a brush"], ["edit", "브러시 조절", "Adjust brush"], ["engine", "입력·엔진", "Input and engine"], ["texture", "질감·톤", "Texture and tone"]] as const).map(([id, ko, en]) => <Link key={id} href={taskHref(id)} aria-current={activeTask === id ? "page" : undefined}
          className={`flex min-h-12 items-center justify-center rounded-xl border px-3 py-3 text-sm font-semibold ${activeTask === id ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg hover:bg-raised"} ${STUDIO_FOCUS_RING}`}>{pickLang(ko, en)}</Link>)}
      </nav>
      <h2 ref={taskHeading} tabIndex={-1} className="mb-4 text-lg font-bold text-fg">{pickLang(({ presets: "브러시 고르기", edit: "브러시 조절", engine: "입력·엔진", texture: "질감·톤" } as Record<string, string>)[activeTask], ({ presets: "Choose a brush", edit: "Adjust brush", engine: "Input and engine", texture: "Texture and tone" } as Record<string, string>)[activeTask])}</h2>

      <section hidden={activeTask !== "engine"}
        data-testid="brush-lab-rea-wetmix-wgsl-bar"
        aria-label={pickLang("브러시 랩 WGSL 습식 안료 및 스타일러스 커브 워크벤치", "Brush Lab WGSL Wet-Mix & Stylus Curve Workbench")}
        className="mt-3 mb-4 rounded-2xl border border-line bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-xs font-semibold text-accent">
              {pickLang("브러시 엔진 · WGSL 습식 혼색 & 스타일러스 커브", "BRUSH ENGINE · WGSL WET-MIX & STYLUS CURVE")}
            </p>
            <p className="mt-2 text-xs font-semibold text-fg">
              {pickLang(
                "듀얼 팁·습식 안료 커널과 필압·기울기 응답 곡선을 조합해 실제 획감을 조율합니다.",
                "Tune dual-tip and wet-pigment WGSL kernels with stylus pressure and tilt curves.",
              )}
            </p>
          </div>
          <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-2">
            Procreate Brush Studio · Clip Studio .sut · Krita .kpp · Rebelle 7 Wet Mix
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("커널 모드:", "Kernel Mode:")}
          </span>
          <div
            role="toolbar"
            aria-label={pickLang("커널 모드 선택", "Select Kernel Mode")}
            className="flex flex-wrap items-center gap-2"
          >
            {KERNEL_MODES.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                tabIndex={kernelMode === item.id ? 0 : -1}
                data-testid={`brush-lab-rea-kernel-${item.id}`}
                aria-pressed={kernelMode === item.id}
                onClick={() => selectKernelMode(item.id)}
                onKeyDown={(event) => {
                  const nav = resolveToolbarNextIndex(event, idx, KERNEL_MODES.length);
                  const next = nav ? KERNEL_MODES[nav.nextIndex] : undefined;
                  if (!nav || !next) return;
                  event.preventDefault();
                  selectKernelMode(next.id);
                  focusToolbarButtonAt(event.currentTarget, nav.nextIndex);
                }}
                className={`${
                  kernelMode === item.id
                    ? "rounded-xl border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                    : "rounded-xl border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
                } ${STUDIO_FOCUS_RING}`}
              >
                {pickLang(item.ko, item.en)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("스타일러스 곡선:", "Stylus Curve:")}
          </span>
          <div
            role="toolbar"
            aria-label={pickLang("스타일러스 곡선 선택", "Select Stylus Curve")}
            className="flex flex-wrap items-center gap-2"
          >
            {STYLUS_CURVES.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                tabIndex={stylusCurve === item.id ? 0 : -1}
                data-testid={`brush-lab-rea-curve-${item.id}`}
                aria-pressed={stylusCurve === item.id}
                onClick={() => selectStylusCurve(item.id)}
                onKeyDown={(event) => {
                  const nav = resolveToolbarNextIndex(event, idx, STYLUS_CURVES.length);
                  const next = nav ? STYLUS_CURVES[nav.nextIndex] : undefined;
                  if (!nav || !next) return;
                  event.preventDefault();
                  selectStylusCurve(next.id);
                  focusToolbarButtonAt(event.currentTarget, nav.nextIndex);
                }}
                className={`${
                  stylusCurve === item.id
                    ? "rounded-xl border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                    : "rounded-xl border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
                } ${STUDIO_FOCUS_RING}`}
              >
                {pickLang(item.ko, item.en)}
              </button>
            ))}
          </div>
        </div>
        <p
          data-testid="brush-lab-rea-status"
          aria-live="polite"
          aria-atomic="true"
          className="mt-3 rounded-xl border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-2"
        >
          {pickLang(
            `커널: ${activeKernel.ko} (${kernelMode}) · 곡선: ${activeCurve.ko} (${stylusCurve})`,
            `Kernel: ${activeKernel.en} (${kernelMode}) · Curve: ${activeCurve.en} (${stylusCurve})`,
          )}
        </p>
      </section>

      <section hidden={activeTask !== "presets"}
        data-testid="brush-lab-wave37-stroke-refinement-panel"
        aria-label={pickLang(
          "경쟁사 동급 곡률 보간 및 서브픽셀 R&D 검증 바",
          "Competitor Parity Curvature & Subpixel R&D Verification Bar",
        )}
        className="mb-5 rounded-2xl border border-line bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-semibold text-accent">
              {pickLang(
                "R&D → 드로잉 툴 직결 · 구심 Catmull 곡률 적응 스탬프 & 서브픽셀 SDF AA",
                "R&D TO DRAWING TOOL · CENTRIPETAL CATMULL ADAPTIVE STAMP & SUBPIXEL SDF AA",
              )}
            </p>
            <p className="mt-1 text-xs text-fg-2">
              {pickLang(
                "아래 플래그십 브러시는 드로잉 캔버스 머티리얼 엔진(V7.4)과 브러시 스튜디오에 동시 등록되어 바로 사용할 수 있습니다.",
                "Flagship V7.4 recipes below run natively inside both Brush Studio and the live drawing canvas.",
              )}
            </p>
          </div>
          <svg
            viewBox="0 0 212 48"
            className="h-11 w-52 shrink-0 rounded-xl border border-line bg-panel/80"
            aria-label={pickLang("구심 곡률 보간 스탬프 프리뷰", "Centripetal adaptive stamp preview")}
          >
            <polyline
              points="14,38 56,8 98,40 152,10 198,28"
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.28}
              strokeDasharray="3 2"
              strokeWidth={1}
            />
            {wave37Refinement.stamps.map((s, idx) => (
              <circle
                key={idx}
                cx={s.x}
                cy={s.y}
                r={Math.max(0.6, s.radiusPx * 0.65)}
                className="text-accent"
                fill="currentColor"
                fillOpacity={0.34}
              />
            ))}
          </svg>
        </div>
        <div
          role="toolbar"
          aria-label={pickLang("플래그십 6종 레시피 선택 (방향키·숫자 1~6)", "Select 6 Flagship Recipes (Arrow Keys or 1-6)")}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          {WAVE37_FLAGSHIP_RECIPES.map((recipe, idx) => (
            <button
              key={recipe.id}
              type="button"
              tabIndex={wave37RecipeId === recipe.id ? 0 : -1}
              aria-keyshortcuts={String(idx + 1)}
              data-testid={`brush-lab-wave37-recipe-${recipe.id}`}
              aria-pressed={wave37RecipeId === recipe.id}
              onClick={() => setWave37RecipeId(recipe.id)}
              onKeyDown={(event) => {
                const nav = resolveToolbarNextIndex(event, idx, WAVE37_FLAGSHIP_RECIPES.length, true);
                const next = nav ? WAVE37_FLAGSHIP_RECIPES[nav.nextIndex] : undefined;
                if (!nav || !next) return;
                event.preventDefault();
                setWave37RecipeId(next.id);
                focusToolbarButtonAt(event.currentTarget, nav.nextIndex);
              }}
              className={`${
                wave37RecipeId === recipe.id
                  ? "rounded-xl border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                  : "rounded-xl border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
              } ${STUDIO_FOCUS_RING}`}
            >
              {pickLang(`${idx + 1}. ${recipe.ko}`, `${idx + 1}. ${recipe.en}`)}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isPinningFavorites}
              aria-busy={isPinningFavorites || undefined}
              data-testid="brush-lab-pin-favorites-btn"
              onClick={() => {
                void runPinFavorites(false);
              }}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-accent bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/20 disabled:opacity-60 ${STUDIO_FOCUS_RING}`}
            >
              {pickLang(
                `원고 캔버스 빠른 선반에 플래그십 ${STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.length}종 고정 배치`,
                `Pin ${STUDIO_COMPETITOR_FAVORITE_SLOT_SPECS.length} Flagships to Canvas Quick Shelf`,
              )}
            </button>
            <button
              type="button"
              disabled={isPinningFavorites}
              data-testid="brush-lab-restore-favorites-order-btn"
              onClick={() => {
                void runPinFavorites(true);
              }}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2 hover:border-line-strong hover:bg-raised disabled:opacity-60 ${STUDIO_FOCUS_RING}`}
            >
              <RotateCcw size={13} aria-hidden />
              {pickLang("기본값·1~6 순서 복원", "Restore Default 1-6 Order")}
            </button>
          </div>
          {pinError || pinResult !== null ? (
            <span
              role={pinNeedsAttention ? "alert" : "status"}
              aria-live="polite"
              aria-atomic="true"
              data-testid="brush-lab-pin-favorites-status"
              className={`font-mono text-xs font-semibold ${pinNeedsAttention ? "text-bad" : "text-accent"}`}
            >
              {pinNeedsAttention
                ? pickLang(
                    "저장소 제한으로 영구 저장하지 못하고 현재 화면 복구본만 준비했어요. 공간 확인 후 다시 시도해 주세요.",
                    "Storage unavailable: prepared in-memory recovery slots only. Check storage and retry.",
                  )
                : pinResult?.status === "pinned-memory-session"
                  ? pickLang(
                      `현재 세션 빠른 선반에 ${pinResult.pinnedCount}종 고정 완료 (비영속 세션${pinResult.collapsedDuplicateCount > 0 ? ` · 중복 ${pinResult.collapsedDuplicateCount}개 병합` : ""})`,
                      `Pinned ${pinResult.pinnedCount} flagships to active session quick shelf (non-persistent${pinResult.collapsedDuplicateCount > 0 ? ` · merged ${pinResult.collapsedDuplicateCount} duplicates` : ""})`,
                    )
                  : pickLang(
                      `원고 캔버스 즐겨찾기 빠른 선반에 ${pinResult?.pinnedCount ?? 0}종 고정 완료${(pinResult?.collapsedDuplicateCount ?? 0) > 0 ? ` (중복 ${pinResult?.collapsedDuplicateCount}개 병합)` : ""}`,
                      `Pinned ${pinResult?.pinnedCount ?? 0} flagship brushes to canvas quick shelf${(pinResult?.collapsedDuplicateCount ?? 0) > 0 ? ` (merged ${pinResult?.collapsedDuplicateCount} duplicates)` : ""}`,
                    )}
            </span>
          ) : null}
        </div>
        <p
          data-testid="brush-lab-wave37-metrics"
          aria-live="polite"
          aria-atomic="true"
          className="mt-3 rounded-xl border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-2"
        >
          {pickLang(
            `레시피: ${activeWave37Recipe.ko} (${activeWave37Recipe.id}) · 적응 스탬프 ${wave37Refinement.stamps.length}개 · 코너 꺾임 감소 -${(wave37Refinement.kinkReductionRatio01 * 100).toFixed(1)}% · 콩알자국 이득 -${(wave37Refinement.scallopReductionGain01 * 100).toFixed(1)}% · 출필 끝선 반경 ${wave37Refinement.terminalTaperRadiusPx.toFixed(2)}px`,
            `Recipe: ${activeWave37Recipe.en} (${activeWave37Recipe.id}) · Stamps ${wave37Refinement.stamps.length} · Kink -${(wave37Refinement.kinkReductionRatio01 * 100).toFixed(1)}% · Scallop -${(wave37Refinement.scallopReductionGain01 * 100).toFixed(1)}% · Tip ${wave37Refinement.terminalTaperRadiusPx.toFixed(2)}px`,
          )}
        </p>
      </section>

      <div className="mt-5 space-y-5">
        <div hidden={activeTask !== "presets"}><StudioBrushProductCataloguePanel baseHref={context.baseHref} /></div>
        <div hidden={activeTask !== "edit"}><StudioBrushIntegratedWorkbench scope={context.scope} /></div>
        <section hidden={activeTask !== "texture"} aria-label="질감·톤 실험실" className="overflow-hidden rounded-[1.75rem] border border-line bg-card/55 p-5 shadow-sm sm:p-7">
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
