/**
 * 모션 웹툰 자막 패널의 오디오 전사 섹션.
 *
 * 통합 AI 설정에 등록된 본인 Groq 키가 있을 때만 전사를 실행할 수 있고,
 * 없으면 비활성 사유와 설정 동선을 정직하게 안내한다 (BYOK).
 * 전사 결과는 기존 대사를 지우지 않고 컷 타임라인에 대사 초안으로 들어간다.
 */

import type { JSX } from "react";
import { useMemo, useState } from "react";

import { useUserAi } from "@/shared/ai/user-ai-store";
import { USER_AI_SETTINGS_HREF } from "@/shared/ai/user-ai-types";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getLang } from "@/shared/lib/i18n-core";

import { CAPTION_UI_LABELS } from "./motion-webtoon-labels";
import type { MotionEpisode } from "./motion-webtoon-model";
import {
  applyTranscriptionSegments,
  GroqTranscriptionError,
  resolveGroqTranscriptionRoute,
  transcribeAudioFileWithGroq,
  type GroqTranscriptionErrorCode,
} from "./motion-webtoon-transcription";

export interface MotionWebtoonTranscriptionSectionProps {
  readonly episode: MotionEpisode;
  readonly onEpisodeChange: (episode: MotionEpisode) => void;
}

const CL = CAPTION_UI_LABELS;

type TranscriptionUiState =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "error"; readonly code: GroqTranscriptionErrorCode }
  | { readonly kind: "empty" }
  | { readonly kind: "done"; readonly applied: number; readonly skipped: number };

function errorLabel(code: GroqTranscriptionErrorCode) {
  switch (code) {
    case "authentication":
      return CL.transcriptionErrorAuth;
    case "quota-exhausted":
      return CL.transcriptionErrorQuota;
    case "unsupported-format":
      return CL.transcriptionErrorFormat;
    case "too-large":
      return CL.transcriptionErrorTooLarge;
    case "empty-file":
      return CL.transcriptionErrorEmptyFile;
    case "network":
      return CL.transcriptionErrorNetwork;
    case "not-configured":
      return CL.transcriptionNeedKey;
    default:
      return CL.transcriptionErrorGeneric;
  }
}

export function MotionWebtoonTranscriptionSection(
  props: MotionWebtoonTranscriptionSectionProps,
): JSX.Element {
  const t = useBilingual("motion-webtoon");
  const snapshot = useUserAi();
  const route = useMemo(
    () => resolveGroqTranscriptionRoute(snapshot.configuration),
    [snapshot.configuration],
  );
  const [file, setFile] = useState<File | null>(null);
  const [fileEpoch, setFileEpoch] = useState(0);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [ui, setUi] = useState<TranscriptionUiState>({ kind: "idle" });

  const characters = props.episode.characters;
  const effectiveSpeakerId =
    speakerId && characters.some((character) => character.id === speakerId)
      ? speakerId
      : characters[0]?.id ?? null;
  const running = ui.kind === "running";

  const handleRun = async () => {
    if (!file || !route || !effectiveSpeakerId || running) return;
    setUi({ kind: "running" });
    try {
      const language = getLang().toLowerCase().startsWith("en") ? "en" : "ko";
      const result = await transcribeAudioFileWithGroq(file, { language });
      if (result.segments.length === 0) {
        setUi({ kind: "empty" });
        return;
      }
      const applied = applyTranscriptionSegments(props.episode, result.segments, effectiveSpeakerId);
      if (applied.appliedCount > 0) {
        props.onEpisodeChange(applied.episode);
      }
      setUi({ kind: "done", applied: applied.appliedCount, skipped: applied.skippedCount });
      setFile(null);
      setFileEpoch((epoch) => epoch + 1);
    } catch (error) {
      if (error instanceof GroqTranscriptionError) {
        // 사용자가 취소한 경우만 조용히 대기 상태로 돌아간다.
        if (error.code === "aborted") {
          setUi({ kind: "idle" });
          return;
        }
        setUi({ kind: "error", code: error.code });
        return;
      }
      setUi({ kind: "error", code: "http-error" });
    }
  };

  return (
    <div className="mw-transcribe">
      <h3>{t(CL.transcriptionTitle.titleKo, CL.transcriptionTitle.titleEn)}</h3>
      <p className="mw-empty-desc">{t(CL.transcriptionDesc.titleKo, CL.transcriptionDesc.titleEn)}</p>

      {!route ? (
        <>
          <p className="mw-empty-hint">
            {t(CL.transcriptionNeedKey.titleKo, CL.transcriptionNeedKey.titleEn)}
          </p>
          <p>
            <a href={USER_AI_SETTINGS_HREF}>
              {t(CL.transcriptionSettingsCta.titleKo, CL.transcriptionSettingsCta.titleEn)}
            </a>
          </p>
        </>
      ) : characters.length === 0 ? (
        <p className="mw-empty-hint">
          {t(CL.transcriptionNoCharacters.titleKo, CL.transcriptionNoCharacters.titleEn)}
        </p>
      ) : (
        <>
          <div className="mw-fieldrow">
            <label className="mw-field">
              <span>{t(CL.transcriptionFileLabel.titleKo, CL.transcriptionFileLabel.titleEn)}</span>
              <input
                key={fileEpoch}
                type="file"
                accept=".flac,.mp3,.mp4,.mpeg,.mpga,.m4a,.ogg,.wav,.webm"
                disabled={running}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setUi({ kind: "idle" });
                }}
              />
            </label>
            <label className="mw-field">
              <span>
                {t(CL.transcriptionSpeakerLabel.titleKo, CL.transcriptionSpeakerLabel.titleEn)}
              </span>
              <select
                value={effectiveSpeakerId ?? ""}
                disabled={running}
                onChange={(event) => setSpeakerId(event.target.value)}
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {t(character.nameKo, character.nameEn)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mw-caption-actions">
            <button
              type="button"
              className="mw-btn mw-btn-small"
              disabled={!file || running}
              onClick={() => void handleRun()}
            >
              {running
                ? t(CL.transcriptionRunning.titleKo, CL.transcriptionRunning.titleEn)
                : t(CL.transcriptionRun.titleKo, CL.transcriptionRun.titleEn)}
            </button>
          </div>
        </>
      )}

      {ui.kind === "running" ? (
        <p role="status" className="mw-empty-hint">
          {t(CL.transcriptionRunning.titleKo, CL.transcriptionRunning.titleEn)}
        </p>
      ) : null}
      {ui.kind === "error" ? (
        <p role="alert" className="mw-empty-hint">
          {t(errorLabel(ui.code).titleKo, errorLabel(ui.code).titleEn)}
        </p>
      ) : null}
      {ui.kind === "empty" ? (
        <p role="status" className="mw-empty-hint">
          {t(CL.transcriptionEmpty.titleKo, CL.transcriptionEmpty.titleEn)}
        </p>
      ) : null}
      {ui.kind === "done" ? (
        <p role="status" className="mw-empty-hint">
          {ui.applied > 0
            ? t(
                CL.transcriptionApplied.titleKo.replace("{count}", String(ui.applied)),
                CL.transcriptionApplied.titleEn.replace("{count}", String(ui.applied)),
              )
            : null}
          {ui.skipped > 0
            ? ` ${t(
                CL.transcriptionSkippedPart.titleKo.replace("{count}", String(ui.skipped)),
                CL.transcriptionSkippedPart.titleEn.replace("{count}", String(ui.skipped)),
              )}`
            : null}
        </p>
      ) : null}
    </div>
  );
}
