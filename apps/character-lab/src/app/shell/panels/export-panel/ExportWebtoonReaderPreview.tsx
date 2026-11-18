/**
 * 스크롤 여백 호흡(`gutterPaces`)·시간대 색온도 무드(`manuscriptMood`) 연동
 * 모바일 웹툰 리더 & 자동 패닝(Auto-Pan) 모션 콘티 미리보기 서브컴포넌트.
 *
 * Canvas/WebGPU Guard & React 19 규약 준수:
 * - 60fps 스크롤 좌표 갱신은 DOM ref(`viewportRef.current.scrollTop`)에서 직접 수행하고,
 *   React state(`activeCutIndex`)는 컷 경계(0..3)가 실제로 바뀔 때만 갱신한다.
 * - 일시정지 및 언마운트 시 `cancelAnimationFrame`을 결정적으로 호출해 타이머 누수를 원천 차단한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  WEBTOON_MANUSCRIPT_MOODS,
  WEBTOON_STRIP_GUTTER_PACES,
  clampWebtoonStripLayout,
  computeStripAutoPanTimeline,
  sampleAutoPanScrollState,
} from "../../../../export/webtoon-strip-composer";

import type {
  WebtoonManuscriptMoodId,
  WebtoonStripGutterPaces,
} from "../../../../export/webtoon-strip-composer";

export interface ExportWebtoonReaderPreviewProps {
  readonly stripImageUrl: string;
  readonly stripWidth: number;
  readonly stripHeight: number;
  readonly manuscriptMood: WebtoonManuscriptMoodId;
  readonly gutterPaces: WebtoonStripGutterPaces;
  readonly exportBusy?: boolean;
  readonly onExportMotionWebm?: (speed: number) => void;
  readonly onClose: () => void;
}

const CUT_JUMP_INDICES = [0, 1, 2, 3] as const;
const SPEED_OPTIONS = [
  { value: 0.75, labelKo: "0.75× 느리게" },
  { value: 1, labelKo: "1.0× 표준 호흡" },
  { value: 1.5, labelKo: "1.5× 숏폼 템포" },
] as const;

export function ExportWebtoonReaderPreview({
  stripImageUrl,
  stripWidth,
  stripHeight,
  manuscriptMood,
  gutterPaces,
  exportBusy = false,
  onExportMotionWebm,
  onClose,
}: ExportWebtoonReaderPreviewProps) {
  const layout = useMemo(
    () => clampWebtoonStripLayout(stripWidth, true, gutterPaces),
    [stripWidth, gutterPaces],
  );
  const timeline = useMemo(
    () => computeStripAutoPanTimeline(layout, gutterPaces),
    [layout, gutterPaces],
  );
  const moodSpec = WEBTOON_MANUSCRIPT_MOODS[manuscriptMood] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(1);
  const [activeCutIndex, setActiveCutIndex] = useState<0 | 1 | 2 | 3>(0);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeCutRef = useRef<0 | 1 | 2 | 3>(0);
  const elapsedMsRef = useRef<number>(0);
  const lastTickMsRef = useRef<number | null>(null);

  const applyScrollRatio = useCallback((ratio01: number, cutIndex: 0 | 1 | 2 | 3): void => {
    const el = viewportRef.current;
    if (el) {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.round(maxScroll * ratio01);
    }
    if (activeCutRef.current !== cutIndex) {
      activeCutRef.current = cutIndex;
      setActiveCutIndex(cutIndex);
    }
  }, []);

  useEffect(() => {
    if (!playing || typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      lastTickMsRef.current = null;
      return undefined;
    }
    let rafId = 0;
    let alive = true;
    const step = (nowMs: number): void => {
      if (!alive) return;
      const prev = lastTickMsRef.current ?? nowMs;
      lastTickMsRef.current = nowMs;
      const deltaMs = Math.min(100, Math.max(0, nowMs - prev));
      elapsedMsRef.current = (elapsedMsRef.current + deltaMs * speed) % Math.max(1, timeline.totalDurationMs);
      const sampled = sampleAutoPanScrollState(timeline, elapsedMsRef.current);
      applyScrollRatio(sampled.scrollRatio01, sampled.activeCutIndex);
      rafId = window.requestAnimationFrame(step);
    };
    rafId = window.requestAnimationFrame(step);
    return () => {
      alive = false;
      lastTickMsRef.current = null;
      window.cancelAnimationFrame(rafId);
    };
  }, [playing, speed, timeline, applyScrollRatio]);

  const onJumpToCut = (cutIdx: 0 | 1 | 2 | 3): void => {
    setPlaying(false);
    const seg = timeline.segments[cutIdx];
    elapsedMsRef.current = seg.dwellStartMs;
    const sampled = sampleAutoPanScrollState(timeline, seg.dwellStartMs);
    applyScrollRatio(sampled.scrollRatio01, cutIdx);
  };

  const onManualScroll = (): void => {
    if (playing) return;
    const el = viewportRef.current;
    if (!el) return;
    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    const ratio = Math.min(1, Math.max(0, el.scrollTop / maxScroll));
    const approxCut = Math.min(3, Math.max(0, Math.round(ratio * 3))) as 0 | 1 | 2 | 3;
    if (activeCutRef.current !== approxCut) {
      activeCutRef.current = approxCut;
      setActiveCutIndex(approxCut);
    }
  };

  const activePaceLabel =
    activeCutIndex < 3
      ? WEBTOON_STRIP_GUTTER_PACES[gutterPaces[activeCutIndex as 0 | 1 | 2]].labelKo
      : "엔딩 여운 홀드";
  const cycleSeconds = (timeline.totalDurationMs / (1000 * speed)).toFixed(1);
  const [mr, mg, mb] = moodSpec.stripMarginRgb;

  return (
    <section
      className="cl-webtoon-reader-preview"
      aria-label="모바일 웹툰 리더 및 오토패닝 모션 미리보기"
      data-testid="export-webtoon-reader-preview"
    >
      <div className="cl-webtoon-reader-header">
        <div className="cl-webtoon-reader-meta">
          <strong className="cl-webtoon-reader-title">모바일 스크롤·오토패닝 뷰어</strong>
          <span className="cl-webtoon-reader-badge" data-testid="webtoon-reader-active-cut">
            {`${activeCutIndex + 1}컷 / 4컷 · ${activePaceLabel} · 루프 ${cycleSeconds}s (${stripWidth}×${stripHeight}px)`}
          </span>
        </div>
        <div className="cl-webtoon-reader-controls" role="group" aria-label="오토패닝 재생 및 배속 제어">
          <button
            type="button"
            className="cl-button cl-export-nav-btn"
            data-testid="webtoon-reader-autopan-toggle"
            aria-pressed={playing}
            onClick={() => setPlaying((prev) => !prev)}
          >
            {playing ? "오토패닝 일시정지" : "오토패닝 재생"}
          </button>
          <select
            aria-label="오토패닝 재생 배속"
            data-testid="webtoon-reader-speed"
            value={String(speed)}
            onChange={(event) => setSpeed(Number(event.target.value) || 1)}
          >
            {SPEED_OPTIONS.map((opt) => (
              <option key={opt.value} value={String(opt.value)}>
                {opt.labelKo}
              </option>
            ))}
          </select>
          {onExportMotionWebm ? (
            <button
              type="button"
              className="cl-button cl-export-nav-btn"
              data-testid="webtoon-reader-export-webm"
              disabled={exportBusy}
              onClick={() => onExportMotionWebm(speed)}
            >
              현재 배속 9:16 WebM 티저 저장
            </button>
          ) : null}
          <button
            type="button"
            className="cl-button cl-export-nav-btn"
            data-testid="webtoon-reader-close"
            onClick={onClose}
          >
            미리보기 닫기
          </button>
        </div>
      </div>

      <div className="cl-webtoon-reader-jumps" role="group" aria-label="컷 바로가기">
        {CUT_JUMP_INDICES.map((cutIdx) => (
          <button
            key={cutIdx}
            type="button"
            className="cl-preset-chip"
            data-testid={`webtoon-reader-jump-${cutIdx}`}
            aria-pressed={activeCutIndex === cutIdx}
            onClick={() => onJumpToCut(cutIdx)}
          >
            {`${cutIdx + 1}컷 이동 (${(timeline.cutDwellMs[cutIdx] / 1000).toFixed(2)}s)`}
          </button>
        ))}
      </div>

      <div
        ref={viewportRef}
        className="cl-webtoon-reader-viewport"
        data-testid="webtoon-reader-viewport"
        onScroll={onManualScroll}
        style={{ backgroundColor: `rgb(${mr}, ${mg}, ${mb})` }}
      >
        <img
          src={stripImageUrl}
          alt="세로 4컷 웹툰 모바일 리더 미리보기 스트립"
          className="cl-webtoon-reader-img"
          data-testid="webtoon-reader-strip-img"
        />
      </div>
    </section>
  );
}
