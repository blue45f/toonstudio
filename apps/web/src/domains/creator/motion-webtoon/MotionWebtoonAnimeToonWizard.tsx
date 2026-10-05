/**
 * 애니툰 원클릭 변환 위저드 (`/studio/motion-webtoon` 페이지 상단 진입점).
 *
 * 단계: 01 작품 선택(저장된 회차) → 02 컷 미리보기 → 03 애니툰 결과.
 * 상태 전이는 `motion-webtoon-anime-toon` 코어가 맡고, 이 컴포넌트는
 * 표시·저장·편집기 이동만 담당한다. 자동 생성은 규칙 기반 AI 자동 연출이며
 * 영상 렌더링·음성 합성은 하지 않는다는 점을 화면에 정직하게 밝힌다.
 */

import type { JSX } from "react";
import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  backAnimeToonStep,
  createAnimeToonWizardState,
  generateAnimeToonDraft,
  renameAnimeToonDraft,
  selectAnimeToonSource,
  type AnimeToonWizardState,
} from "./motion-webtoon-anime-toon";
import { ANIME_TOON_UI_LABELS } from "./motion-webtoon-labels";
import type { MotionEpisode } from "./motion-webtoon-model";
import {
  listStoredMotionEpisodes,
  saveMotionEpisode,
} from "./motion-webtoon-storage";

const AL = ANIME_TOON_UI_LABELS;

export interface MotionWebtoonAnimeToonWizardProps {
  /** 변환된 초안을 편집기로 열 때 호출된다 (페이지가 에디터를 교체한다). */
  readonly onOpenDraft: (draft: MotionEpisode) => void;
  /** 테스트·스토리용으로 저장 목록을 주입할 수 있다. 기본값은 실제 스토리지 열거. */
  readonly listSources?: () => MotionEpisode[];
  /** 저장 함수를 주입할 수 있다. 기본값은 실제 스토리지 저장. */
  readonly saveDraft?: (episode: MotionEpisode) => boolean;
}

function countDialogues(episode: MotionEpisode): number {
  return episode.cuts.reduce((sum, cut) => sum + cut.dialogues.length, 0);
}

export function MotionWebtoonAnimeToonWizard(
  props: MotionWebtoonAnimeToonWizardProps,
): JSX.Element {
  const t = useBilingual("motion-webtoon");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AnimeToonWizardState>(createAnimeToonWizardState);
  const [saveFailed, setSaveFailed] = useState(false);
  const sources = useMemo(
    () => (open ? (props.listSources ?? listStoredMotionEpisodes)() : []),
    [open, props.listSources ],
  );

  const close = () => {
    setOpen(false);
    setState(createAnimeToonWizardState());
    setSaveFailed(false);
  };

  const handleOpenDraft = () => {
    if (!state.draft) return;
    const save = props.saveDraft ?? saveMotionEpisode;
    if (!save(state.draft)) {
      setSaveFailed(true);
      return;
    }
    props.onOpenDraft(state.draft);
    close();
  };

  if (!open) {
    return (
      <div className="mw-anime-toon-entry">
        <button type="button" className="mw-cta-primary" onClick={() => setOpen(true)}>
          {t(AL.entryCta.titleKo, AL.entryCta.titleEn)}
        </button>
      </div>
    );
  }

  const stepLabels = [AL.stepSelect, AL.stepPreview, AL.stepResult];
  const stepIndex = state.step === "select" ? 0 : state.step === "preview" ? 1 : 2;

  return (
    <section className="mw-panel mw-anime-toon" aria-label={t(AL.wizardTitle.titleKo, AL.wizardTitle.titleEn)}>
      <div className="mw-panel-head">
        <h2>{t(AL.wizardTitle.titleKo, AL.wizardTitle.titleEn)}</h2>
        <button type="button" className="mw-btn mw-btn-small" onClick={close}>
          {t(AL.close.titleKo, AL.close.titleEn)}
        </button>
      </div>
      <p className="mw-empty-desc">{t(AL.wizardDesc.titleKo, AL.wizardDesc.titleEn)}</p>
      <p className="mw-empty-hint">{t(AL.directorNote.titleKo, AL.directorNote.titleEn)}</p>

      <ol className="mw-anime-toon-steps" aria-label={t(AL.wizardTitle.titleKo, AL.wizardTitle.titleEn)}>
        {stepLabels.map((stepLabel, index) => (
          <li
            key={stepLabel.titleKo}
            className="mw-anime-toon-step"
            aria-current={index === stepIndex ? "step" : undefined}
          >
            {`${String(index + 1).padStart(2, "0")} ${t(stepLabel.titleKo, stepLabel.titleEn)}`}
          </li>
        ))}
      </ol>

      {state.step === "select" && (
        sources.length === 0 ? (
          <p className="mw-empty-hint">{t(AL.emptyLibrary.titleKo, AL.emptyLibrary.titleEn)}</p>
        ) : (
          <ul className="mw-anime-toon-sources">
            {sources.map((source) => (
              <li key={source.id} className="mw-anime-toon-source">
                <span className="mw-anime-toon-source-title">{t(source.titleKo, source.titleEn)}</span>
                <span className="mw-anime-toon-source-meta">
                  {t(
                    AL.cutMeta.titleKo
                      .replace("{cuts}", String(source.cuts.length))
                      .replace("{lines}", String(countDialogues(source))),
                    AL.cutMeta.titleEn
                      .replace("{cuts}", String(source.cuts.length))
                      .replace("{lines}", String(countDialogues(source))),
                  )}
                </span>
                <button
                  type="button"
                  className="mw-btn mw-btn-small"
                  onClick={() => setState((prev) => selectAnimeToonSource(prev, source))}
                >
                  {t(AL.selectThis.titleKo, AL.selectThis.titleEn)}
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {state.step === "preview" && state.source && (
        <div className="mw-anime-toon-preview">
          <ol className="mw-anime-toon-cuts">
            {state.source.cuts.map((cut, index) => (
              <li key={cut.id} className="mw-anime-toon-cut">
                {cut.imageUrl ? (
                  <img src={cut.imageUrl} alt={t(cut.altKo, cut.altEn)} loading="lazy" />
                ) : (
                  <span className="mw-cutlist-thumb-fallback">{index + 1}</span>
                )}
                <span>{t(`컷 ${index + 1}`, `Cut ${index + 1}`)}</span>
                {cut.dialogues.length > 0 && (
                  <span className="mw-anime-toon-cut-dialogue">
                    {t(`대사 ${cut.dialogues.length}개`, `${cut.dialogues.length} line(s)`)}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {state.failure === "no-cuts" && (
            <p className="mw-anime-toon-failure" role="alert">
              {t(AL.noCutsFailure.titleKo, AL.noCutsFailure.titleEn)}
            </p>
          )}
          <div className="mw-caption-actions">
            <button
              type="button"
              className="mw-btn mw-btn-small"
              onClick={() => setState((prev) => backAnimeToonStep(prev))}
            >
              {t(AL.back.titleKo, AL.back.titleEn)}
            </button>
            <button
              type="button"
              className="mw-cta-primary"
              onClick={() => setState((prev) => generateAnimeToonDraft(prev))}
            >
              {t(AL.generateCta.titleKo, AL.generateCta.titleEn)}
            </button>
          </div>
        </div>
      )}

      {state.step === "result" && state.draft && state.summary && (
        <div className="mw-anime-toon-result">
          <label className="mw-field">
            <span>{t(AL.draftTitleLabel.titleKo, AL.draftTitleLabel.titleEn)}</span>
            <input
              type="text"
              value={state.draft.titleKo}
              onChange={(e) => setState((prev) => renameAnimeToonDraft(prev, e.target.value))}
            />
          </label>
          <ul className="mw-anime-toon-summary">
            <li>
              {t(
                AL.summaryCuts.titleKo
                  .replace("{count}", String(state.summary.cutCount))
                  .replace("{seconds}", String(Math.round(state.summary.totalDurationSeconds))),
                AL.summaryCuts.titleEn
                  .replace("{count}", String(state.summary.cutCount))
                  .replace("{seconds}", String(Math.round(state.summary.totalDurationSeconds))),
              )}
            </li>
            {state.summary.captionCueCount > 0 ? (
              <li>
                {t(
                  AL.summaryCaptions.titleKo.replace("{count}", String(state.summary.captionCueCount)),
                  AL.summaryCaptions.titleEn.replace("{count}", String(state.summary.captionCueCount)),
                )}
              </li>
            ) : (
              <li>{t(AL.summaryNoCaptions.titleKo, AL.summaryNoCaptions.titleEn)}</li>
            )}
            {state.summary.skippedCaptionCount > 0 && (
              <li>
                {t(
                  AL.summarySkipped.titleKo.replace("{count}", String(state.summary.skippedCaptionCount)),
                  AL.summarySkipped.titleEn.replace("{count}", String(state.summary.skippedCaptionCount)),
                )}
              </li>
            )}
            {state.summary.voicePresetAppliedCount > 0 && (
              <li>
                {t(
                  AL.summaryVoice.titleKo.replace("{count}", String(state.summary.voicePresetAppliedCount)),
                  AL.summaryVoice.titleEn.replace("{count}", String(state.summary.voicePresetAppliedCount)),
                )}
              </li>
            )}
            <li>{t(AL.manualNote.titleKo, AL.manualNote.titleEn)}</li>
          </ul>
          {saveFailed && (
            <p className="mw-anime-toon-failure" role="alert">
              {t(AL.saveFailed.titleKo, AL.saveFailed.titleEn)}
            </p>
          )}
          <div className="mw-caption-actions">
            <button
              type="button"
              className="mw-btn mw-btn-small"
              onClick={() => setState((prev) => backAnimeToonStep(prev))}
            >
              {t(AL.back.titleKo, AL.back.titleEn)}
            </button>
            <button type="button" className="mw-cta-primary" onClick={handleOpenDraft}>
              {t(AL.openInEditor.titleKo, AL.openInEditor.titleEn)}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
