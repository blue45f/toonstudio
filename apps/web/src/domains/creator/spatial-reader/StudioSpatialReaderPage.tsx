import { BookOpen, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  localSpatialImage,
  nextSpatialPanel,
  parseSpatialBook,
  SPATIAL_MAX_AUDIO_BYTES,
  SPATIAL_MAX_BOOK_BYTES,
  SPATIAL_MAX_PANELS,
  type SpatialBook,
  type SpatialPanel,
} from "./spatial-book";
import { spatialBookVtt } from "./spatial-book-captions";
import type { SpatialReaderRuntime } from "./spatial-reader-runtime";
import { createSampleSpatialBook, type SpatialSampleCopy } from "./spatial-sample-book";
import { SpatialReaderEditPanel } from "./SpatialReaderEditPanel";
import { SpatialReaderIntro } from "./SpatialReaderIntro";
import { SpatialReaderViewer, type SpatialView, type XrMode, type XrSupport } from "./SpatialReaderViewer";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const CURVATURE_MODES = [
  { id: "cylinder-90deg-canopy", ko: "90° 원통형 캐노피 곡률", en: "90-Deg Cylinder Canopy" },
  { id: "dome-120deg-cinema", ko: "120° 돔 시네마 몰입", en: "120-Deg Dome Cinema" },
  { id: "floating-panel-stack", ko: "부유 다층 컷 스택", en: "Floating Panel Stack" },
] as const;

const GAZE_FOCUSES = [
  { id: "foveated-depth-dof", ko: "시선 중심 심도(DoF) 포커스", en: "Foveated Depth-of-Field" },
  { id: "spatial-binaural-pan", ko: "바이노럴 공간 음향 패닝", en: "Spatial Binaural Audio Pan" },
  { id: "comfort-vignette-lock", ko: "멀미 방지 비네팅 잠금", en: "Comfort Vignette Lock" },
] as const;

type CurvatureModeId = (typeof CURVATURE_MODES)[number]["id"];
type GazeFocusId = (typeof GAZE_FOCUSES)[number]["id"];
type SpatialReaderFactory = typeof import("./spatial-reader-runtime")["createSpatialReader"];

/** 여러 장을 한 번에 열 때 이미지 데이터 총량 상한(작품 파일 상한보다 여유를 둔다). */
const MAX_TOTAL_IMAGE_CHARS = 64_000_000;
const DEFAULT_PANEL_SECONDS = 6;
const MS_PER_SECOND = 1000;
const DEFAULT_AR_SCALE = 0.65;
/** 깨진 컷 이미지 감지 시 정상 작품으로 오해하지 않도록 '이미지 로드 실패 대체 표시' 문구를 명시한 SVG 데이터 URI. */
function fallbackPanelImage(isKo: boolean): string {
  const label = isKo
    ? "이미지 로드 실패 · 원본 작품이 아닌 대체 표시"
    : "Image load failed · Fallback placeholder (not original artwork)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" rx="16" fill="#18181b"/><rect x="16" y="16" width="608" height="328" rx="12" fill="none" stroke="#71717a" stroke-width="2" stroke-dasharray="8 6"/><text x="320" y="184" text-anchor="middle" fill="#e4e4e7" font-family="sans-serif" font-size="16" font-weight="600">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function savedIndex(book: SpatialBook): number {
  try {
    return nextSpatialPanel(Number(localStorage.getItem(`toonstudio-spatial-progress:${book.id}`)) || 0, 0, book.panels.length);
  } catch {
    return 0;
  }
}

function downloadBook(book: SpatialBook): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(parseSpatialBook(book))], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "toonstudio-spatial-book.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function reaChipClass(active: boolean): string {
  return active
    ? "inline-flex min-h-11 min-w-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! max-w-full items-center justify-center rounded-xl border border-accent bg-accent-soft px-3 py-2 text-left text-xs font-semibold leading-snug text-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-center"
    : "inline-flex min-h-11 min-w-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! max-w-full items-center justify-center rounded-xl border border-line bg-panel px-3 py-2 text-left text-xs font-semibold leading-snug text-fg-2 transition-colors hover:border-accent/60 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-center";
}

function stepRovingChip<T extends string>(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  order: readonly T[],
  current: T,
  onSelect: (next: T) => void,
  refs: Record<T, HTMLButtonElement | null>,
): void {
  const currentIndex = order.indexOf(current);
  let nextId: T | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextId = order[(currentIndex + 1) % order.length] ?? order[0];
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextId = order[(currentIndex - 1 + order.length) % order.length] ?? order[0];
  } else if (event.key === "Home") {
    nextId = order[0];
  } else if (event.key === "End") {
    nextId = order[order.length - 1] ?? order[0];
  }
  if (nextId) {
    event.preventDefault();
    event.stopPropagation();
    onSelect(nextId);
    refs[nextId]?.focus();
  }
}

export function StudioSpatialReaderPage() {
  const bt = useBilingual("StudioSpatialReader");
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const [curvatureMode, setCurvatureMode] = useState<CurvatureModeId>("cylinder-90deg-canopy");
  const [gazeFocus, setGazeFocus] = useState<GazeFocusId>("foveated-depth-dof");
  const activeCurvature = CURVATURE_MODES.find((item) => item.id === curvatureMode) ?? CURVATURE_MODES[0];
  const activeGaze = GAZE_FOCUSES.find((item) => item.id === gazeFocus) ?? GAZE_FOCUSES[0];
  const [book, setBook] = useState<SpatialBook | null>(null);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<SpatialView>("2d");
  const [auto, setAuto] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(DEFAULT_AR_SCALE);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [xr, setXr] = useState<XrSupport>({ vr: null, ar: null });
  const [captionUrl, setCaptionUrl] = useState("");
  const [brokenPanelIds, setBrokenPanelIds] = useState<string[]>([]);
  const [panelFilter, setPanelFilter] = useState("");
  const [panelFilterOpen, setPanelFilterOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<SpatialReaderRuntime | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const viewerHeading = useRef<HTMLHeadingElement>(null);
  const panelFilterInputRef = useRef<HTMLInputElement>(null);
  const curveChipRefs = useRef<Record<CurvatureModeId, HTMLButtonElement | null>>({
    "cylinder-90deg-canopy": null,
    "dome-120deg-cinema": null,
    "floating-panel-stack": null,
  });
  const gazeChipRefs = useRef<Record<GazeFocusId, HTMLButtonElement | null>>({
    "foveated-depth-dof": null,
    "spatial-binaural-pan": null,
    "comfort-vignette-lock": null,
  });
  const loadGeneration = useRef(0);
  // 비동기 파일 읽기가 끝난 시점의 최신 작품(편집 중 다른 작품으로 바뀌었는지 확인용).
  const bookRef = useRef<SpatialBook | null>(book);
  const panel = book?.panels[index];
  const openedBookId = book?.id ?? null;

  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  // 새 작품을 열면 이전 깨진 이미지/컷 필터 상태를 초기화하고 감상 영역 제목에 초점을 둔다.
  useEffect(() => {
    setBrokenPanelIds([]);
    setPanelFilter("");
    setPanelFilterOpen(false);
    const heading = viewerHeading.current;
    if (!openedBookId || !heading) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    heading.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    heading.focus({ preventScroll: true });
  }, [openedBookId]);

  useEffect(() => {
    if (!book?.audio) {
      setCaptionUrl("");
      return;
    }
    const url = URL.createObjectURL(new Blob([spatialBookVtt(book)], { type: "text/vtt" }));
    setCaptionUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [book]);

  // 공간 보기를 켤 때 만든 시점의 컷 위치·AR 크기로 3D 장면을 준비한다.
  const createRuntime = useEffectEvent((factory: SpatialReaderFactory, element: HTMLElement, target: SpatialBook) => {
    const created = factory(element, target, index, setIndex, setStatus, (message) => {
      setError(message);
      setView("2d");
    });
    created.setScale(scale);
    return created;
  });

  useEffect(() => {
    const element = host.current;
    if (!book || view !== "spatial" || !element) return;
    let disposed = false;
    let current: SpatialReaderRuntime | null = null;
    setRuntimeReady(false);
    void import("./spatial-reader-runtime")
      .then(({ createSpatialReader }) => {
        if (disposed) return;
        current = createRuntime(createSpatialReader, element, book);
        runtime.current = current;
        setRuntimeReady(true);
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setError(errorText(cause, bt("공간 화면을 준비하지 못했어요. 일반 보기로 전환했어요.", "Couldn't prepare the spatial view. Switched to the flat view.")));
        setView("2d");
      });
    return () => {
      disposed = true;
      current?.destroy();
      if (runtime.current === current) runtime.current = null;
    };
  }, [book, bt, view]);

  useEffect(() => {
    if (book) {
      try {
        localStorage.setItem(`toonstudio-spatial-progress:${book.id}`, String(index));
      } catch {
        /* Reading never depends on browser storage. */
      }
    }
  }, [book, index]);

  // 자동 넘김 — 컷마다 지정한 감상 시간 뒤 다음 컷으로. 탭이 숨겨지거나 마지막 컷이면 멈춘다.
  useEffect(() => {
    if (!book || !auto) return;
    const seconds = book.panels[index]?.seconds ?? DEFAULT_PANEL_SECONDS;
    const timer = setTimeout(() => {
      if (document.hidden || index >= book.panels.length - 1) {
        setAuto(false);
        audio.current?.pause();
        return;
      }
      const next = index + 1;
      runtime.current?.focus(next);
      setIndex(next);
    }, seconds * MS_PER_SECOND);
    return () => clearTimeout(timer);
  }, [auto, book, index]);

  function dismissError() {
    setError("");
    queueMicrotask(() => {
      if (bookRef.current && viewerHeading.current) {
        viewerHeading.current.focus({ preventScroll: true });
        return;
      }
      curveChipRefs.current[curvatureMode]?.focus();
    });
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "Escape") {
      if (error) {
        event.preventDefault();
        dismissError();
        return;
      }
      if (panelFilter || panelFilterOpen) {
        event.preventDefault();
        setPanelFilter("");
        setPanelFilterOpen(false);
        viewerHeading.current?.focus({ preventScroll: true });
        return;
      }
    }
    if (!book) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || target instanceof HTMLAudioElement
      || (target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest('[data-testid="spatial-reader-rea-webxr-fov-bar"]'))))
    ) {
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      event.stopImmediatePropagation();
      setPanelFilterOpen(true);
      queueMicrotask(() => panelFilterInputRef.current?.focus());
      return;
    }
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? book.panels.length - 1
        : nextSpatialPanel(index, event.key === "ArrowRight" ? 1 : -1, book.panels.length);
    runtime.current?.focus(next);
    setIndex(next);
    setAuto(false);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => onKeyDown(event);
    const onVisibility = () => {
      if (document.hidden) {
        setAuto(false);
        audio.current?.pause();
      }
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // AR/VR 지원 여부는 권한 요청 없이 확인만 한다(세션 요청은 버튼을 누를 때만).
  useEffect(() => {
    let cancelled = false;
    const system = typeof navigator === "undefined" ? undefined : navigator.xr;
    if (!window.isSecureContext || !system) {
      setXr({ vr: false, ar: false });
      return;
    }
    void Promise.all([
      system.isSessionSupported("immersive-vr").catch(() => false),
      system.isSessionSupported("immersive-ar").catch(() => false),
    ]).then(([vr, ar]) => {
      if (!cancelled) setXr({ vr, ar });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 작품 열기 공통 흐름 — 늦게 끝난 이전 요청이 새 작품을 덮어쓰지 않게 세대를 비교한다. */
  async function openWith(load: () => Promise<{ book: SpatialBook; index: number; message: string } | null>, fallback: string) {
    const version = ++loadGeneration.current;
    setBusy(true);
    setError("");
    setStatus("");
    setAuto(false);
    try {
      const result = await load();
      if (!result || version !== loadGeneration.current) return;
      setBook(result.book);
      setIndex(result.index);
      setStatus(result.message);
    } catch (cause) {
      if (version === loadGeneration.current) setError(errorText(cause, fallback));
    } finally {
      if (version === loadGeneration.current) setBusy(false);
    }
  }

  function openImages(files: File[]) {
    const version = loadGeneration.current + 1;
    void openWith(async () => {
      if (!files.length || files.length > SPATIAL_MAX_PANELS) throw new Error(bt("1~32컷을 선택해 주세요.", "Choose 1–32 panels."));
      const panels: SpatialPanel[] = [];
      let total = 0;
      for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }))) {
        const src = await localSpatialImage(file);
        if (version !== loadGeneration.current) return null;
        total += src.length;
        if (total > MAX_TOTAL_IMAGE_CHARS) throw new Error(bt("이미지 총량이 너무 커요. 작품을 나누어 주세요.", "The images are too large in total. Split the work."));
        panels.push({
          id: crypto.randomUUID(),
          title: file.name.replace(/\.[^.]+$/u, "").slice(0, 120),
          caption: "",
          alt: file.name.slice(0, 120),
          src,
          seconds: DEFAULT_PANEL_SECONDS,
          layers: [],
        });
      }
      const next = parseSpatialBook({ format: "toonstudio-spatial-book", version: 1, id: crypto.randomUUID(), title: bt("나의 공간 웹툰", "My spatial webtoon"), panels });
      return {
        book: next,
        index: 0,
        message: "",
      };
    }, bt("이미지를 열지 못했어요.", "Couldn't open the images."));
  }

  function openBook(file: File) {
    void openWith(async () => {
      if (file.size > SPATIAL_MAX_BOOK_BYTES) throw new Error(bt("공간 웹툰 파일은 80MB 이하여야 해요.", "Spatial webtoon files must be 80MB or smaller."));
      const rawText = (await file.text()).trim();
      if (!rawText) {
        throw new Error(bt("비어 있는 파일이에요. 1~32컷의 공간 웹툰 파일을 사용해 주세요.", "The file is empty. Please use a 1–32 panel spatial webtoon file."));
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        throw new Error(bt("손상된 JSON 파일이에요. 1~32컷의 공간 웹툰 파일을 사용해 주세요.", "The JSON file is corrupted. Please use a 1–32 panel spatial webtoon file."));
      }
      const next = parseSpatialBook(parsedJson);
      return { book: next, index: savedIndex(next), message: "" };
    }, bt("공간 웹툰을 열지 못했어요.", "Couldn't open the spatial webtoon."));
  }

  function openSample() {
    const copy: SpatialSampleCopy = {
      bookTitle: bt("샘플 공간 웹툰 · 예시", "Sample spatial webtoon · example"),
      panels: [
        { title: bt("고백", "Confession"), caption: bt("두근거려… 오늘은 고백하는 날이야.", "My heart is pounding… today I confess."), alt: bt("노을 진 언덕 위, 하트를 사이에 두고 선 두 사람의 실루엣", "Two silhouettes on a sunset hill with a heart between them") },
        { title: bt("위기", "Danger"), caption: bt("조심해! 뒤에 뭔가 있어!", "Watch out! Something is behind you!"), alt: bt("밤거리의 속도선 사이로 달리는 인물 실루엣", "A figure running through speed lines on a night street") },
        { title: bt("축하", "Celebration"), caption: bt("정말 행복해! 우리가 해냈어!", "I'm so happy! We did it!"), alt: bt("아침 해와 무지개 아래 두 팔을 들어 올린 두 사람", "Two people raising their arms under a morning sun and rainbow") },
      ],
    };
    void openWith(async () => {
      const next = await createSampleSpatialBook(copy);
      return {
        book: next,
        index: 0,
        message: "",
      };
    }, bt("샘플 작품을 만들지 못했어요.", "Couldn't build the sample work."));
  }

  function focus(next: number) {
    if (!book) return;
    const clamped = nextSpatialPanel(next, 0, book.panels.length);
    runtime.current?.focus(clamped);
    setIndex(clamped);
    setAuto(false);
  }

  function updatePanel(update: Partial<SpatialPanel>) {
    setBook((current) => current ? { ...current, panels: current.panels.map((item, i) => (i === index ? { ...item, ...update } : item)) } : null);
  }

  function toggleAuto() {
    if (auto) {
      setAuto(false);
      audio.current?.pause();
      return;
    }
    setAuto(true);
    if (audio.current) void audio.current.play().catch(() => setStatus(bt("음악은 재생 버튼을 눌러 시작해 주세요.", "Press play to start the music.")));
  }

  async function enter(mode: XrMode) {
    setError("");
    setAuto(false);
    try {
      if (!runtime.current) throw new Error(bt("먼저 공간 보기를 켠 뒤 AR/VR 버튼을 눌러주세요.", "Turn on the spatial view before pressing AR/VR."));
      await runtime.current.enter(mode);
    } catch (cause) {
      setError(errorText(cause, bt("이 기기에서 공간 세션을 열지 못했어요. 일반 감상은 사용할 수 있습니다.", "Couldn't start an immersive session on this device. Flat reading still works.")));
    }
  }

  function addLayer(file: File) {
    if (!panel) return;
    const id = panel.id;
    void localSpatialImage(file)
      .then((src) => {
        const current = bookRef.current;
        if (!current || !current.panels.some((item) => item.id === id)) return;
        setBook(parseSpatialBook({
          ...current,
          panels: current.panels.map((item) => (item.id === id ? { ...item, layers: [...item.layers, { src, depth: 0.12 }] } : item)),
        }));
      })
      .catch((cause: unknown) => setError(errorText(cause, bt("레이어를 추가하지 못했어요.", "Couldn't add the layer."))));
  }

  function attachAudio(file: File) {
    if (!book) return;
    if (file.size > SPATIAL_MAX_AUDIO_BYTES) {
      setError(bt("오디오는 10MB 이하여야 해요.", "Audio must be 10MB or smaller."));
      return;
    }
    const id = book.id;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const current = bookRef.current;
        if (current?.id !== id) return;
        setBook(parseSpatialBook({ ...current, audio: reader.result }));
      } catch (cause) {
        setError(errorText(cause, bt("오디오를 넣지 못했어요.", "Couldn't embed the audio.")));
      }
    };
    reader.onerror = () => setError(bt("오디오를 읽지 못했어요.", "Couldn't read the audio."));
    reader.readAsDataURL(file);
  }

  const viewerBook: SpatialBook | null = book
    ? {
        ...book,
        title: book.title.trim() || bt("제목 없는 공간 웹툰", "Untitled spatial webtoon"),
        panels: book.panels.map((item, i) => {
          const fallbackTitle = item.title.trim() || (isKo ? `${i + 1}번째 컷` : `Panel ${i + 1}`);
          const baseAlt = item.alt.trim() || fallbackTitle;
          const isBroken = brokenPanelIds.includes(item.id);
          return {
            ...item,
            title: fallbackTitle,
            alt: isBroken
              ? `${bt("[이미지 로드 실패 대체 표시] ", "[Broken image fallback] ")}${baseAlt}`
              : baseAlt,
            src: isBroken ? fallbackPanelImage(isKo) : item.src,
          };
        }),
      }
    : null;
  const viewerPanel = viewerBook?.panels[index];
  const normalizedPanelFilter = panelFilter.trim().toLowerCase();
  const showPanelFilter = Boolean(viewerBook && (viewerBook.panels.length > 6 || panelFilterOpen || normalizedPanelFilter.length > 0));
  const matchingPanels = viewerBook
    ? viewerBook.panels
        .map((item, panelIndex) => ({ item, panelIndex }))
        .filter(({ item, panelIndex }) => (
          !normalizedPanelFilter
          || String(panelIndex + 1) === normalizedPanelFilter
          || item.title.toLowerCase().includes(normalizedPanelFilter)
          || item.caption.toLowerCase().includes(normalizedPanelFilter)
          || item.alt.toLowerCase().includes(normalizedPanelFilter)
        ))
    : [];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-6 px-4 py-8 [overflow-wrap:anywhere] sm:px-6">
      <SpatialReaderIntro busy={busy} onOpenImages={openImages} onOpenBook={openBook} onOpenSample={openSample} />

      <section
        data-testid="spatial-reader-rea-webxr-fov-bar"
        aria-label={pickLang("공간 리더 WebXR 시야각 곡률 및 시선 포커스 워크벤치", "Spatial Reader WebXR Curvature & Gaze Focus Workbench")}
        className="rounded-2xl border border-line bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-xs font-semibold text-accent">
              {pickLang("공간 리더 · WebXR 시야각 곡률 & 시선 심도", "SPATIAL READER · WEBXR FOV CURVATURE & GAZE DOF")}
            </p>
            <p className="mt-2 text-xs font-semibold text-fg">
              {pickLang(
                "원통형·돔 캐노피 곡률 배치와 시선 포커스·공간 음향·멀미 방지 모드를 조합합니다.",
                "Configure cylinder/dome canopy curvature with foveated depth-of-field and spatial audio focus.",
              )}
            </p>
          </div>
          <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-2">
            Apple Vision Pro visionOS · Meta Quest WebXR · Spline Spatial
          </span>
        </div>
        <div
          role="group"
          aria-label={pickLang("곡률 모드", "Curvature Mode")}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <span className="text-xs font-semibold text-fg-2">{pickLang("곡률 모드:", "Curvature Mode:")}</span>
          {CURVATURE_MODES.map((item) => (
            <button
              key={item.id}
              ref={(node) => {
                curveChipRefs.current[item.id] = node;
              }}
              type="button"
              data-testid={`spatial-rea-curve-${item.id}`}
              aria-pressed={curvatureMode === item.id}
              onClick={() => setCurvatureMode(item.id)}
              onKeyDown={(event) => stepRovingChip(event, CURVATURE_MODES.map((m) => m.id), curvatureMode, setCurvatureMode, curveChipRefs.current)}
              className={reaChipClass(curvatureMode === item.id)}
            >
              {pickLang(item.ko, item.en)}
            </button>
          ))}
        </div>
        <div
          role="group"
          aria-label={pickLang("시선 포커스", "Gaze Focus")}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <span className="text-xs font-semibold text-fg-2">{pickLang("시선 포커스:", "Gaze Focus:")}</span>
          {GAZE_FOCUSES.map((item) => (
            <button
              key={item.id}
              ref={(node) => {
                gazeChipRefs.current[item.id] = node;
              }}
              type="button"
              data-testid={`spatial-rea-gaze-${item.id}`}
              aria-pressed={gazeFocus === item.id}
              onClick={() => setGazeFocus(item.id)}
              onKeyDown={(event) => stepRovingChip(event, GAZE_FOCUSES.map((m) => m.id), gazeFocus, setGazeFocus, gazeChipRefs.current)}
              className={reaChipClass(gazeFocus === item.id)}
            >
              {pickLang(item.ko, item.en)}
            </button>
          ))}
        </div>
        <p
          data-testid="spatial-reader-rea-status"
          aria-live="polite"
          className="mt-3 rounded-xl border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-2"
        >
          {pickLang(
            `곡률: ${activeCurvature.ko} (${curvatureMode}) · 포커스: ${activeGaze.ko} (${gazeFocus})`,
            `Curvature: ${activeCurvature.en} (${curvatureMode}) · Focus: ${activeGaze.en} (${gazeFocus})`,
          )}
        </p>
      </section>

      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-bad/40 bg-bad/10 p-4">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-bad" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{bt("문제가 생겼어요", "Something went wrong")}</p>
            <p className="mt-1 break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-fg-2">{error}</p>
          </div>
          <button
            type="button"
            onClick={dismissError}
            aria-label={bt("안내 닫기", "Dismiss")}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : null}

      {busy || status ? (
        <p role="status" className="text-sm text-fg-2">
          {busy ? bt("작품을 읽는 중…", "Reading the work…") : status}
        </p>
      ) : null}

      {busy && !book ? (
        <div aria-hidden className="grid gap-3">
          <span className="skeleton block h-[min(60vh,520px)] rounded-3xl" />
          <span className="skeleton block h-16 rounded-2xl" />
        </div>
      ) : null}

      {book && panel && viewerBook && viewerPanel ? (
        <>
          {showPanelFilter ? (
            <div
              data-testid="spatial-reader-panel-filter-bar"
              className="flex flex-col gap-3 rounded-2xl border border-line bg-card/70 p-4"
            >
              <input
                ref={panelFilterInputRef}
                type="search"
                value={panelFilter}
                onChange={(event) => setPanelFilter(event.target.value)}
                aria-label={bt("컷 제목·대사 필터", "Filter panels by title or dialogue")}
                placeholder={bt("컷 번호·제목·대사로 찾기", "Filter by panel number, title, or dialogue")}
                data-testid="spatial-reader-panel-filter-input"
                className="min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg placeholder:text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />

              {normalizedPanelFilter ? (
                matchingPanels.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label={bt("필터된 컷 바로가기", "Filtered panels")}>
                    {matchingPanels.map(({ item, panelIndex }) => (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`spatial-reader-filtered-panel-${panelIndex + 1}`}
                        aria-pressed={panelIndex === index}
                        onClick={() => focus(panelIndex)}
                        className="inline-flex min-h-11 min-w-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-semibold text-fg hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <span className="numeral text-accent">#{panelIndex + 1}</span>
                        <span className="break-words [overflow-wrap:anywhere]">{item.title}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    role="status"
                    aria-live="polite"
                    data-testid="spatial-reader-filter-empty"
                    className="flex flex-col items-start justify-between gap-2 rounded-xl border border-dashed border-line bg-panel/60 p-3 sm:flex-row sm:items-center"
                  >
                    <p className="text-xs text-fg-2">
                      {bt(
                        "조건에 맞는 컷이 없습니다 (0건). 현재 감상 중인 컷 위치는 그대로 유지됩니다.",
                        "No panels match the filter (0 results). Your current panel position is preserved.",
                      )}
                    </p>
                    <button
                      type="button"
                      data-testid="spatial-reader-filter-reset"
                      onClick={() => {
                        setPanelFilter("");
                        setPanelFilterOpen(false);
                        viewerHeading.current?.focus({ preventScroll: true });
                      }}
                      className="inline-flex min-h-11 min-w-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! shrink-0 items-center justify-center rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-fg hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {bt("필터 초기화", "Reset filter")}
                    </button>
                  </div>
                )
              ) : null}
            </div>
          ) : null}

          {brokenPanelIds.length > 0 ? (
            <div
              role="status"
              aria-live="polite"
              data-testid="spatial-reader-broken-image-notice"
              className="flex flex-col items-start justify-between gap-2 rounded-2xl border border-line bg-panel/70 p-4 sm:flex-row sm:items-center"
            >
              <p className="text-xs leading-relaxed text-fg-2">
                {bt(
                  "일부 컷 이미지를 불러오지 못해 원본 작품이 아닌 ‘이미지 로드 실패 대체 표시’로 보여 주고 있어요. 원본 작품 데이터는 변경되지 않았습니다.",
                  "Some panel images failed to load and are shown with an explicit fallback placeholder instead of the original artwork. Your original work data is unchanged.",
                )}
              </p>
              <button
                type="button"
                data-testid="spatial-reader-broken-image-recover"
                onClick={() => setBrokenPanelIds([])}
                className="inline-flex min-h-11 min-w-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! shrink-0 items-center justify-center rounded-xl border border-line bg-card px-3.5 py-2 text-xs font-semibold text-fg hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {bt("원본 이미지 다시 불러오기", "Retry original image")}
              </button>
            </div>
          ) : null}

          <div
            data-testid="spatial-reader-viewer-stage"
            className="[&_#spatial-reader-book-title]:whitespace-normal [&_#spatial-reader-book-title]:break-words [&_#spatial-reader-book-title]:[overflow-wrap:anywhere] [&_#spatial-reader-book-title]:text-clip"
            onErrorCapture={(event) => {
              const target = event.target;
              if (!(target instanceof HTMLImageElement)) return;
              const failedSrc = target.getAttribute("src") ?? "";
              const matched = book.panels.find((item) => item.src === failedSrc) ?? panel;
              if (!matched) return;
              setBrokenPanelIds((prev) => (prev.includes(matched.id) ? prev : [...prev, matched.id]));
            }}
          >
            <SpatialReaderViewer
              book={viewerBook}
              index={index}
              view={view}
              auto={auto}
              runtimeReady={runtimeReady}
              xr={xr}
              hostRef={host}
              audioRef={audio}
              headingRef={viewerHeading}
              captionUrl={captionUrl}
              onView={(next) => {
                setView(next);
                if (next === "2d") setAuto(false);
              }}
              onFocus={focus}
              onToggleAuto={toggleAuto}
              onEnter={(mode) => void enter(mode)}
              onExit={() => void runtime.current?.exit().catch((cause: unknown) => setError(errorText(cause, bt("AR/VR을 종료하지 못했어요.", "Couldn't exit AR/VR."))))}
              onExport={() => {
                try {
                  downloadBook(book);
                } catch (cause) {
                  setError(errorText(cause, bt("작품 파일을 만들지 못했어요.", "Couldn't create the work file.")));
                }
              }}
            />
          </div>
          <SpatialReaderEditPanel
            book={book}
            panel={panel}
            index={index}
            scale={scale}
            onBookTitle={(title) => setBook({ ...book, title })}
            onPanel={updatePanel}
            onScale={(next) => {
              setScale(next);
              runtime.current?.setScale(next);
            }}
            onAddLayer={addLayer}
            onRemoveLayer={(layerIndex) => updatePanel({ layers: panel.layers.filter((_, j) => j !== layerIndex) })}
            onAudio={attachAudio}
          />
        </>
      ) : !busy ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-line bg-panel/30 px-6 py-12 text-center">
          <BookOpen size={28} aria-hidden className="text-accent" />
          <p className="text-sm font-semibold text-fg">{bt("작품을 열면 이곳에서 감상합니다", "Your work will appear here")}</p>
          <p className="max-w-md text-xs leading-relaxed text-fg-2">
            {bt("위에서 컷 이미지나 작품 파일을 고르거나, 샘플로 먼저 체험해 보세요.", "Choose panel images or a work file above, or try the sample first.")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
