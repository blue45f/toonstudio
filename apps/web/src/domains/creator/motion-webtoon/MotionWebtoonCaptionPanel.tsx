/**
 * 모션 웹툰 자막 패널 — Vrew식 텍스트 기반 편집의 최소형.
 *
 * 자막은 대사에서 파생되므로 목록에서 문구를 고치면 원본 대사가 바뀌고,
 * 자막·플레이어 자막이 함께 갱신된다. 시간은 컷 타이밍에서 계산된 값이라
 * 여기서 직접 고치지 않는다. 스타일은 위치(위/아래)·크기(3단계)만 다루며,
 * 위치는 VTT 내보내기의 cue 설정에도 반영되고 크기는 미리보기 전용이다.
 */

import type { JSX } from "react";
import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getLang } from "@/shared/lib/i18n-core";

import {
  buildCaptionTrack,
  captionFileName,
  serializeCaptionsSrt,
  serializeCaptionsVtt,
  updateCaptionDialogueText,
  type CaptionLanguage,
  type CaptionPosition,
  type CaptionSize,
  type CaptionStyle,
} from "./motion-webtoon-captions";
import { CAPTION_UI_LABELS } from "./motion-webtoon-labels";
import type { MotionEpisode } from "./motion-webtoon-model";
import { MotionWebtoonTranscriptionSection } from "./MotionWebtoonTranscriptionSection";

export interface MotionWebtoonCaptionPanelProps {
  readonly episode: MotionEpisode;
  readonly onEpisodeChange: (episode: MotionEpisode) => void;
}

const CL = CAPTION_UI_LABELS;

function currentCaptionLanguage(): CaptionLanguage {
  return getLang().toLowerCase().startsWith("en") ? "en" : "ko";
}

function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

function downloadCaptionFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MotionWebtoonCaptionPanel(props: MotionWebtoonCaptionPanelProps): JSX.Element {
  const t = useBilingual("motion-webtoon");
  const [style, setStyle] = useState<CaptionStyle>({ position: "bottom", size: "medium" });
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  // 입력 중에는 파생값(마크업 제거·트림)이 아니라 사용자가 친 원문을 보여준다.
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});

  const track = useMemo(() => buildCaptionTrack(props.episode), [props.episode]);
  const selectedCue =
    track.cues.find((cue) => cue.id === selectedCueId) ?? track.cues[0] ?? null;

  const handleDownload = (format: "srt" | "vtt") => {
    const lang = currentCaptionLanguage();
    const content =
      format === "srt"
        ? serializeCaptionsSrt(track, lang)
        : serializeCaptionsVtt(track, lang, style);
    downloadCaptionFile(content, captionFileName(props.episode, format));
  };

  return (
    <section className="mw-panel" aria-label={t(CL.captionTitle.titleKo, CL.captionTitle.titleEn)}>
      <div className="mw-panel-head">
        <h2>{t(CL.captionTitle.titleKo, CL.captionTitle.titleEn)}</h2>
      </div>
      <p className="mw-empty-desc">{t(CL.captionDesc.titleKo, CL.captionDesc.titleEn)}</p>

      {track.cues.length === 0 ? (
        <p className="mw-empty-hint">{t(CL.captionEmpty.titleKo, CL.captionEmpty.titleEn)}</p>
      ) : (
        <>
          <div
            className={`mw-caption-stage mw-caption-stage-${style.position} mw-caption-size-${style.size}`}
            aria-label={t(CL.captionPreview.titleKo, CL.captionPreview.titleEn)}
          >
            {selectedCue ? (
              <p className="mw-caption-stage-text">
                {selectedCue.speakerNameKo || selectedCue.speakerNameEn ? (
                  <span className="mw-subtitle-speaker">
                    {t(selectedCue.speakerNameKo, selectedCue.speakerNameEn)}
                  </span>
                ) : null}
                <span>{selectedCue.text}</span>
              </p>
            ) : null}
          </div>

          <div className="mw-fieldrow">
            <label className="mw-field">
              <span>{t(CL.captionPosition.titleKo, CL.captionPosition.titleEn)}</span>
              <select
                value={style.position}
                onChange={(e) =>
                  setStyle((prev) => ({ ...prev, position: e.target.value as CaptionPosition }))
                }
              >
                <option value="bottom">{t(CL.positionBottom.titleKo, CL.positionBottom.titleEn)}</option>
                <option value="top">{t(CL.positionTop.titleKo, CL.positionTop.titleEn)}</option>
              </select>
            </label>
            <label className="mw-field">
              <span>{t(CL.captionSize.titleKo, CL.captionSize.titleEn)}</span>
              <select
                value={style.size}
                onChange={(e) =>
                  setStyle((prev) => ({ ...prev, size: e.target.value as CaptionSize }))
                }
              >
                <option value="small">{t(CL.sizeSmall.titleKo, CL.sizeSmall.titleEn)}</option>
                <option value="medium">{t(CL.sizeMedium.titleKo, CL.sizeMedium.titleEn)}</option>
                <option value="large">{t(CL.sizeLarge.titleKo, CL.sizeLarge.titleEn)}</option>
              </select>
            </label>
          </div>

          <ol className="mw-caption-list">
            {track.cues.map((cue) => (
              <li key={cue.id} className="mw-caption-row">
                <button
                  type="button"
                  className="mw-caption-time"
                  onClick={() => setSelectedCueId(cue.id)}
                  aria-label={`${formatClock(cue.startSeconds)} – ${formatClock(cue.endSeconds)}`}
                >
                  {formatClock(cue.startSeconds)} – {formatClock(cue.endSeconds)}
                </button>
                <span className="mw-caption-cut">
                  {t(`컷 ${cue.cutIndex + 1}`, `Cut ${cue.cutIndex + 1}`)}
                </span>
                <textarea
                  className="mw-caption-input"
                  rows={2}
                  value={drafts[cue.id] ?? cue.text}
                  aria-label={t(CL.captionTextLabel.titleKo, CL.captionTextLabel.titleEn)}
                  onFocus={() => setSelectedCueId(cue.id)}
                  onChange={(e) => {
                    setDrafts((prev) => ({ ...prev, [cue.id]: e.target.value }));
                    props.onEpisodeChange(
                      updateCaptionDialogueText(props.episode, cue.cutId, cue.dialogueId, e.target.value),
                    );
                  }}
                  onBlur={() =>
                    setDrafts((prev) => {
                      const next = { ...prev };
                      delete next[cue.id];
                      return next;
                    })
                  }
                />
              </li>
            ))}
          </ol>

          {track.skippedDialogueCount > 0 ? (
            <p className="mw-empty-hint" role="note">
              {t(
                CL.captionSkipped.titleKo.replace("{count}", String(track.skippedDialogueCount)),
                CL.captionSkipped.titleEn.replace("{count}", String(track.skippedDialogueCount)),
              )}
            </p>
          ) : null}

          <div className="mw-caption-actions">
            <button type="button" className="mw-btn mw-btn-small" onClick={() => handleDownload("srt")}>
              {t(CL.downloadSrt.titleKo, CL.downloadSrt.titleEn)}
            </button>
            <button type="button" className="mw-btn mw-btn-small" onClick={() => handleDownload("vtt")}>
              {t(CL.downloadVtt.titleKo, CL.downloadVtt.titleEn)}
            </button>
          </div>
        </>
      )}

      <MotionWebtoonTranscriptionSection
        episode={props.episode}
        onEpisodeChange={props.onEpisodeChange}
      />
    </section>
  );
}
