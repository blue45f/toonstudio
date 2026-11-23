/**
 * 실제 PowerPoint 호환 OOXML `.pptx` 생성·가져오기 + SmartArt/차트/표/애니메이션 슬라이드 스튜디오 탭.
 */

import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileUp,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";

import {
  OOXML_THEMES,
  PPTX_SLIDE_SIZES,
  buildPptxArchive,
  parsePptxArchive,
  parsePptxArchiveAsync,
  type OoxmlThemeId,
  type PptxDeckInput,
  type PptxDeckPresetId,
  type PptxSlideInput,
  type PptxSlideSizePreset,
} from "./ooxml-pptx-builder";
import {
  PPTX_DECK_PRESETS,
  createBlankSlide,
  createPptxPresetDeck,
  getTotalTimelineDurationMs,
} from "./ppt-smartart-chart-table";
import { PptxSlideInspector, type PptxInspectorTabId } from "./PptxSlideInspector";
import { PptxSlideStage } from "./PptxSlideStage";
import "./pptx-deck-studio.css";

export interface PptxDeckStudioTabProps {
  readonly projectId?: string;
  readonly initialPreset?: PptxDeckPresetId;
}

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error("파일 바이너리를 읽지 못했습니다."));
      }
    };
    reader.onerror = () => reject(new Error("파일 읽기 중 오류가 발생했습니다."));
    reader.readAsArrayBuffer(file);
  });
}

function sanitizeDownloadFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 64);
  return `${cleaned || "toonstudio-deck"}.pptx`;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PptxDeckStudioTab({
  projectId,
  initialPreset = "psst-business-plan",
}: PptxDeckStudioTabProps) {
  const uid = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const copySeqRef = useRef(1);

  const [activePreset, setActivePreset] = useState<PptxDeckPresetId | null>(initialPreset);
  const [deck, setDeck] = useState<PptxDeckInput>(() => createPptxPresetDeck(initialPreset));
  const [selectedSlideIdx, setSelectedSlideIdx] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<PptxInspectorTabId>("text");
  const [playbackElapsedMs, setPlaybackElapsedMs] = useState<number | null>(null);
  const [transitionPulseKey, setTransitionPulseKey] = useState(0);
  const [statusTone, setStatusTone] = useState<"info" | "good" | "warn">("info");
  const [statusMessage, setStatusMessage] = useState(
    "실제 PowerPoint · Keynote · LibreOffice에서 열리는 OOXML .pptx를 로컬에서 즉시 생성하거나 가져올 수 있습니다.",
  );

  const safeSlideIdx = Math.min(Math.max(0, selectedSlideIdx), Math.max(0, deck.slides.length - 1));
  const activeSlide = deck.slides[safeSlideIdx] ?? deck.slides[0];

  const stopPlayback = () => {
    if (rafRef.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setPlaybackElapsedMs(null);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const updateCurrentSlide = (updater: (prev: PptxSlideInput) => PptxSlideInput) => {
    setDeck((prev) => ({
      ...prev,
      slides: prev.slides.map((slide, idx) => (idx === safeSlideIdx ? updater(slide) : slide)),
    }));
  };

  const handleLoadPreset = (presetId: PptxDeckPresetId) => {
    stopPlayback();
    const nextDeck = createPptxPresetDeck(presetId);
    setDeck(nextDeck);
    setActivePreset(presetId);
    setSelectedSlideIdx(0);
    setTransitionPulseKey((k) => k + 1);
    setStatusTone("info");
    setStatusMessage(`'${nextDeck.title}' 프리셋(${nextDeck.slides.length}슬라이드)을 불러왔습니다.`);
  };

  const handleSelectSlide = (idx: number) => {
    stopPlayback();
    setSelectedSlideIdx(idx);
    setTransitionPulseKey((k) => k + 1);
  };

  const handleAddSlide = () => {
    stopPlayback();
    setDeck((prev) => {
      const nextSlide = createBlankSlide(prev.slides.length + 1);
      return { ...prev, slides: [...prev.slides, nextSlide] };
    });
    setSelectedSlideIdx(deck.slides.length);
    setTransitionPulseKey((k) => k + 1);
    setStatusTone("info");
    setStatusMessage(`슬라이드 ${deck.slides.length + 1}을 추가했습니다.`);
  };

  const handleDuplicateSlide = () => {
    if (!activeSlide) return;
    stopPlayback();
    const seq = copySeqRef.current;
    copySeqRef.current += 1;
    const copy: PptxSlideInput = {
      ...activeSlide,
      id: `${activeSlide.id}-copy-${seq}`,
      title: `${activeSlide.title} (사본)`,
    };
    setDeck((prev) => {
      const next = [...prev.slides];
      next.splice(safeSlideIdx + 1, 0, copy);
      return { ...prev, slides: next };
    });
    setSelectedSlideIdx(safeSlideIdx + 1);
    setStatusTone("info");
    setStatusMessage(`슬라이드 ${safeSlideIdx + 1}을 복제했습니다.`);
  };

  const handleMoveSlide = (direction: -1 | 1) => {
    const targetIdx = safeSlideIdx + direction;
    if (targetIdx < 0 || targetIdx >= deck.slides.length) return;
    stopPlayback();
    setDeck((prev) => {
      const next = [...prev.slides];
      const temp = next[safeSlideIdx];
      next[safeSlideIdx] = next[targetIdx];
      next[targetIdx] = temp;
      return { ...prev, slides: next };
    });
    setSelectedSlideIdx(targetIdx);
  };

  const handleDeleteSlide = () => {
    if (deck.slides.length <= 1) return;
    stopPlayback();
    setDeck((prev) => ({
      ...prev,
      slides: prev.slides.filter((_, idx) => idx !== safeSlideIdx),
    }));
    setSelectedSlideIdx(Math.max(0, safeSlideIdx - 1));
    setStatusTone("info");
    setStatusMessage("선택한 슬라이드를 삭제했습니다.");
  };

  const handlePlayAnimations = () => {
    if (!activeSlide) return;
    stopPlayback();
    const totalMs = Math.max(480, getTotalTimelineDurationMs(activeSlide.animations ?? []));
    setTransitionPulseKey((k) => k + 1);

    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      setPlaybackElapsedMs(totalMs);
      setStatusTone("info");
      setStatusMessage("동작 축소 설정에 따라 최종 애니메이션 프레임을 즉시 표시했습니다.");
      return;
    }

    let startTime: number | null = null;
    setPlaybackElapsedMs(0);
    const step = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      if (elapsed >= totalMs) {
        setPlaybackElapsedMs(totalMs);
        rafRef.current = null;
        return;
      }
      setPlaybackElapsedMs(elapsed);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const handleDownloadPptx = () => {
    try {
      const bytes = buildPptxArchive(deck);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy], { type: PPTX_MIME });
      const filename = sanitizeDownloadFilename(deck.title);

      if (typeof URL.createObjectURL === "function") {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(objectUrl);
        }
      }

      const kb = (bytes.byteLength / 1024).toFixed(1);
      setStatusTone("good");
      setStatusMessage(
        `${filename} 생성 완료 (${deck.slides.length}슬라이드 · ${kb} KB · PowerPoint/Keynote/LibreOffice 호환 OOXML)`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "알 수 없는 오류";
      setStatusTone("warn");
      setStatusMessage(`.pptx 내보내기 실패: ${detail}`);
    }
  };

  const handleImportPptx = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const bytes = await readFileAsUint8Array(file);
      let parsed;
      try {
        parsed = await parsePptxArchiveAsync(bytes);
      } catch {
        parsed = parsePptxArchive(bytes);
      }
      stopPlayback();
      setDeck(parsed.deck);
      setActivePreset(null);
      setSelectedSlideIdx(0);
      setTransitionPulseKey((k) => k + 1);
      setStatusTone("good");
      const warnSuffix =
        parsed.warnings.length > 0 ? ` (참고: ${parsed.warnings.join(" / ")})` : "";
      setStatusMessage(
        `'${file.name}' 가져오기 완료 — ${parsed.slideCount}개 슬라이드를 편집 모드로 복원했습니다.${warnSuffix}`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "유효한 OOXML .pptx 파일이 아닙니다.";
      setStatusTone("warn");
      setStatusMessage(`.pptx 가져오기 실패: ${detail}`);
    }
  };

  if (!activeSlide) return null;

  const isPlaying = playbackElapsedMs !== null;

  return (
    <section
      className="pptx-studio"
      aria-label="OOXML PowerPoint .pptx 슬라이드 생성·가져오기 스튜디오"
      data-testid="pptx-ooxml-studio-tab"
    >
      <header className="pptx-toolbar-card">
        <div className="pptx-toolbar-top">
          <div className="pptx-deck-title-group">
            <label htmlFor={`${uid}-deck-title`} className="pptx-label">
              프레젠테이션 덱 제목{projectId ? ` · ${projectId}` : ""}
            </label>
            <input
              id={`${uid}-deck-title`}
              type="text"
              className="pptx-input pptx-input--deck-title"
              value={deck.title}
              onChange={(event) => setDeck((prev) => ({ ...prev, title: event.target.value }))}
            />
          </div>

          <div className="pptx-io-actions">
            <button
              type="button"
              className="pptx-btn pptx-btn--primary"
              data-testid="pptx-download-btn"
              onClick={handleDownloadPptx}
            >
              <Download size={16} aria-hidden="true" />
              <span>.pptx 파일 다운로드</span>
            </button>

            <button
              type="button"
              className="pptx-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp size={16} aria-hidden="true" />
              <span>.pptx 가져오기</span>
            </button>
            <input
              ref={fileInputRef}
              id={`${uid}-pptx-import`}
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              aria-label=".pptx 파일 가져오기"
              data-testid="pptx-import-input"
              className="pptx-sr-only"
              onChange={(event) => {
                void handleImportPptx(event);
              }}
            />
          </div>
        </div>

        <div className="pptx-toolbar-controls">
          <div className="pptx-control-group">
            <span className="pptx-group-caption">원클릭 덱 프리셋</span>
            <div className="pptx-btn-row">
              {PPTX_DECK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={
                    activePreset === preset.id ? "pptx-btn pptx-btn--active" : "pptx-btn"
                  }
                  aria-pressed={activePreset === preset.id}
                  onClick={() => handleLoadPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pptx-control-group">
            <span className="pptx-group-caption">테마 4종</span>
            <div className="pptx-btn-row">
              {OOXML_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={
                    deck.themeId === theme.id ? "pptx-btn pptx-btn--active" : "pptx-btn"
                  }
                  aria-pressed={deck.themeId === theme.id}
                  onClick={() => setDeck((prev) => ({ ...prev, themeId: theme.id as OoxmlThemeId }))}
                >
                  {theme.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pptx-control-group">
            <label htmlFor={`${uid}-slide-size`} className="pptx-group-caption">
              슬라이드 비율
            </label>
            <select
              id={`${uid}-slide-size`}
              className="pptx-select pptx-select--compact"
              value={deck.slideSize}
              onChange={(event) =>
                setDeck((prev) => ({
                  ...prev,
                  slideSize: event.target.value as PptxSlideSizePreset,
                }))
              }
            >
              {Object.values(PPTX_SLIDE_SIZES).map((size) => (
                <option key={size.preset} value={size.preset}>
                  {size.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <p
        role="status"
        aria-live="polite"
        data-testid="pptx-studio-status"
        className={`pptx-status pptx-status--${statusTone}`}
      >
        {statusMessage}
      </p>

      <div className="pptx-workspace-grid">
        <nav className="pptx-thumb-rail" aria-label="슬라이드 목록">
          <div className="pptx-rail-actions">
            <button type="button" className="pptx-btn" onClick={handleAddSlide}>
              <Plus size={14} aria-hidden="true" />
              <span>슬라이드 추가</span>
            </button>
            <button
              type="button"
              className="pptx-icon-btn"
              aria-label="현재 슬라이드 복제"
              onClick={handleDuplicateSlide}
            >
              <Copy size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pptx-icon-btn"
              aria-label="슬라이드 앞으로 이동"
              disabled={safeSlideIdx === 0}
              onClick={() => handleMoveSlide(-1)}
            >
              <ChevronUp size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pptx-icon-btn"
              aria-label="슬라이드 뒤로 이동"
              disabled={safeSlideIdx >= deck.slides.length - 1}
              onClick={() => handleMoveSlide(1)}
            >
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pptx-icon-btn"
              aria-label="현재 슬라이드 삭제"
              disabled={deck.slides.length <= 1}
              onClick={handleDeleteSlide}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>

          <ol className="pptx-thumb-list">
            {deck.slides.map((slide, idx) => {
              const selected = idx === safeSlideIdx;
              return (
                <li key={slide.id}>
                  <button
                    type="button"
                    className={
                      selected ? "pptx-thumb-card pptx-thumb-card--selected" : "pptx-thumb-card"
                    }
                    aria-current={selected ? "step" : undefined}
                    onClick={() => handleSelectSlide(idx)}
                  >
                    <span className="pptx-thumb-num">{idx + 1}</span>
                    <span className="pptx-thumb-content">
                      <span className="pptx-thumb-title">{slide.title}</span>
                      <span className="pptx-thumb-tags">
                        {slide.smartArt ? <span>SmartArt</span> : null}
                        {slide.chart ? <span>차트</span> : null}
                        {slide.table ? <span>표</span> : null}
                        {slide.transition && slide.transition !== "none" ? (
                          <span>{slide.transition}</span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="pptx-stage-column">
          <div className="pptx-stage-actions">
            <span className="pptx-stage-counter">
              슬라이드 {safeSlideIdx + 1} / {deck.slides.length}
            </span>
            <div className="pptx-btn-row">
              <button
                type="button"
                className="pptx-btn"
                data-testid="pptx-play-animations-btn"
                onClick={handlePlayAnimations}
              >
                <Play size={14} aria-hidden="true" />
                <span>{isPlaying ? "재생 중…" : "애니메이션 재생"}</span>
              </button>
              {isPlaying ? (
                <button type="button" className="pptx-btn" onClick={stopPlayback}>
                  <RotateCcw size={14} aria-hidden="true" />
                  <span>초기화</span>
                </button>
              ) : null}
            </div>
          </div>

          <PptxSlideStage
            slide={activeSlide}
            slideIndex={safeSlideIdx}
            totalSlides={deck.slides.length}
            themeId={deck.themeId}
            slideSize={deck.slideSize}
            playbackElapsedMs={playbackElapsedMs}
            transitionPulseKey={transitionPulseKey}
          />

          <div className="pptx-notes-card">
            <label htmlFor={`${uid}-speaker-notes`} className="pptx-label">
              발표자 노트 (OOXML notesSlide{safeSlideIdx + 1}.xml 자동 포함)
            </label>
            <textarea
              id={`${uid}-speaker-notes`}
              className="pptx-textarea"
              data-testid="pptx-speaker-notes"
              value={activeSlide.speakerNotes ?? ""}
              onChange={(event) =>
                updateCurrentSlide((prev) => ({ ...prev, speakerNotes: event.target.value }))
              }
              placeholder="발표 중 참고할 대본이나 시간 배분을 기록하세요."
            />
          </div>
        </div>

        <PptxSlideInspector
          slide={activeSlide}
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
          onUpdateSlide={updateCurrentSlide}
          onPlayAnimations={handlePlayAnimations}
          onResetAnimations={stopPlayback}
          isPlayingAnimations={isPlaying}
        />
      </div>
    </section>
  );
}
