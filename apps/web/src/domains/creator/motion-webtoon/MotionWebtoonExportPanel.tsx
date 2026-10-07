/**
 * 모션 웹툰 내보내기 패널.
 *
 * 형식(GIF·MP4·WebM)과 프레임레이트를 골라 브라우저 안에서 렌더링하고
 * 내려받기 링크를 만든다. 폴백이 걸리면 실제 만들어진 형식과 사유를
 * 그대로 보여준다(요청과 다른 파일을 조용히 주지 않는다).
 */

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  exportMotionEpisode,
  type MotionExportFormat,
  type MotionExportPlan,
} from "./motion-webtoon-export";
import { MOTION_WEBTOON_UI_LABELS as L } from "./motion-webtoon-labels";
import type { MotionEpisode } from "./motion-webtoon-model";

export interface MotionWebtoonExportPanelProps {
  readonly episode: MotionEpisode;
}

type ExportStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "working"; readonly ratio: number }
  | { readonly kind: "done"; readonly url: string; readonly fileName: string; readonly plan: MotionExportPlan }
  | { readonly kind: "error"; readonly message: string };

const FORMAT_OPTIONS: readonly { id: MotionExportFormat; label: string }[] = [
  { id: "mp4", label: "MP4" },
  { id: "webm", label: "WebM" },
  { id: "gif", label: "GIF" },
];

const FPS_OPTIONS: readonly number[] = [12, 24, 30];

export function MotionWebtoonExportPanel(props: MotionWebtoonExportPanelProps): JSX.Element {
  const { episode } = props;
  const t = useBilingual("motion-webtoon");
  const [format, setFormat] = useState<MotionExportFormat>("mp4");
  const [fps, setFps] = useState(24);
  const [status, setStatus] = useState<ExportStatus>({ kind: "idle" });
  const urlRef = useRef<string | null>(null);

  const revokeUrl = (): void => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const startExport = async (): Promise<void> => {
    revokeUrl();
    setStatus({ kind: "working", ratio: 0 });
    try {
      const outcome = await exportMotionEpisode(episode, {
        format,
        fps,
        onProgress: (ratio) => setStatus({ kind: "working", ratio }),
      });
      const url = URL.createObjectURL(outcome.blob);
      urlRef.current = url;
      setStatus({ kind: "done", url, fileName: outcome.fileName, plan: outcome.plan });
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : t(L.exportFailed.titleKo, L.exportFailed.titleEn),
      });
    }
  };

  const working = status.kind === "working";
  const noCuts = episode.cuts.length === 0;

  return (
    <section className="mw-panel" aria-label={t(L.exportTitle.titleKo, L.exportTitle.titleEn)}>
      <div className="mw-panel-head">
        <h2>{t(L.exportTitle.titleKo, L.exportTitle.titleEn)}</h2>
      </div>
      <p className="mw-export-status">{t(L.exportDesc.titleKo, L.exportDesc.titleEn)}</p>
      <div className="mw-export-row">
        <label className="mw-field">
          <span>{t(L.exportFormatLabel.titleKo, L.exportFormatLabel.titleEn)}</span>
          <select
            value={format}
            disabled={working}
            onChange={(e) => setFormat(e.target.value as MotionExportFormat)}
          >
            {FORMAT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mw-field">
          <span>{t(L.exportFpsLabel.titleKo, L.exportFpsLabel.titleEn)}</span>
          <select value={fps} disabled={working} onChange={(e) => setFps(Number(e.target.value))}>
            {FPS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} fps
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="mw-btn mw-btn-primary"
          disabled={working || noCuts}
          onClick={() => void startExport()}
        >
          {working ? t(L.exportWorking.titleKo, L.exportWorking.titleEn) : t(L.exportStart.titleKo, L.exportStart.titleEn)}
        </button>
      </div>

      {noCuts && <p className="mw-export-status">{t(L.exportNoCuts.titleKo, L.exportNoCuts.titleEn)}</p>}

      {status.kind === "working" && (
        <progress
          className="mw-export-progress"
          value={Math.round(status.ratio * 100)}
          max={100}
          aria-label={t(L.exportWorking.titleKo, L.exportWorking.titleEn)}
        />
      )}

      {status.kind === "done" && (
        <>
          <p className="mw-export-status" role="status">
            {t(L.exportDone.titleKo, L.exportDone.titleEn)}{" "}
            {t(status.plan.reasonKo, status.plan.reasonEn)}
          </p>
          <a className="mw-export-download" href={status.url} download={status.fileName}>
            {t(L.exportDownload.titleKo, L.exportDownload.titleEn)} — {status.fileName}
          </a>
        </>
      )}

      {status.kind === "error" && (
        <p className="mw-export-error" role="alert">
          {status.message}
        </p>
      )}
    </section>
  );
}
