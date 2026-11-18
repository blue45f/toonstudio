/** 4컷 연출·카메라 구도·발화자·말풍선 모양·폰트 배율·효과음 스탬프·다국어 대사를 디렉터 세션에 연결한다. */
import {
  WEBTOON_CUT_CAMERA_PRESETS,
  WEBTOON_DIALOGUE_LOCALES,
  WEBTOON_DIALOGUE_LOCALE_LABELS,
  WEBTOON_STRIP_ACTING_ARCS,
  WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO,
  WEBTOON_STRIP_FONT_SCALE_LABELS_KO,
  WEBTOON_STRIP_SPEAKER_LABELS_KO,
  resolveSfxGlyphByLocale,
} from "../../../../export/webtoon-strip-composer";
import { WEBTOON_SFX_STAMPS } from "../viewport-hand-prop-controls";

import type {
  WebtoonDialogueLocale,
  WebtoonSfxStampOption,
  WebtoonStripActingArcId,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleShape,
  WebtoonStripCutCameraPresetId,
  WebtoonStripFxLinesKind,
  WebtoonStripSpeakerTarget,
} from "../../../../export/webtoon-strip-composer";
import type { StripDirectorSession, StripDirectorState } from "../viewport-scene-director";

interface ExportStripDirectorSectionProps {
  readonly ids: string;
  readonly state: StripDirectorState;
  readonly stripDirector: StripDirectorSession;
}

export function ExportStripDirectorSection({ ids, state, stripDirector }: ExportStripDirectorSectionProps) {
  const {
    locale: stripLocale,
    actingArc: stripActingArc,
    bakeStripFx,
    stripFxLines,
    dialogueLines,
    bubbleShapes,
    bubbleFontScales,
    sfxStamps,
    speakerTargets,
    cutCameraPresets,
  } = state;
  return (
    <div className="cl-export-strip-director" role="group" aria-label="세로 4컷 스트립 연기·구도·다국어 식자 디렉터">
      <div className="cl-export-row">
        <label htmlFor={`${ids}-strip-acting-arc`}>4컷 연기 시퀀스</label>
        <select
          id={`${ids}-strip-acting-arc`}
          data-testid="export-strip-acting-arc"
          value={stripActingArc}
          onChange={(event) => stripDirector.update({ actingArc: event.target.value as WebtoonStripActingArcId })}
        >
          <option value="none">고정 표정·시선 (단일 포즈 유지)</option>
          {WEBTOON_STRIP_ACTING_ARCS.map((arc) => (
            <option key={arc.id} value={arc.id}>
              {arc.labelKo}
            </option>
          ))}
        </select>
        <label htmlFor={`${ids}-strip-locale`}>식자 언어·말풍선 비율</label>
        <select
          id={`${ids}-strip-locale`}
          data-testid="export-strip-locale"
          value={stripLocale}
          onChange={(event) => stripDirector.setLocale(event.target.value as WebtoonDialogueLocale)}
        >
          {WEBTOON_DIALOGUE_LOCALES.map((loc) => (
            <option key={loc} value={loc}>
              {WEBTOON_DIALOGUE_LOCALE_LABELS[loc]}
            </option>
          ))}
        </select>
      </div>
      <div className="cl-export-row">
        <label htmlFor={`${ids}-strip-bake-fx`}>
          <input
            id={`${ids}-strip-bake-fx`}
            data-testid="export-strip-bake-fx"
            type="checkbox"
            checked={bakeStripFx}
            onChange={(event) => stripDirector.update({ bakeStripFx: event.target.checked })}
          />{" "}
          4컷 말풍선·효과선 베이킹
        </label>
        <label htmlFor={`${ids}-strip-fx-lines`}>효과선</label>
        <select
          id={`${ids}-strip-fx-lines`}
          data-testid="export-strip-fx-lines"
          value={stripFxLines}
          disabled={!bakeStripFx}
          onChange={(event) => stripDirector.update({ stripFxLines: event.target.value as WebtoonStripFxLinesKind })}
        >
          <option value="focus-radial">집중선 (방사형)</option>
          <option value="speed-diagonal">속도선 (대각선)</option>
          <option value="romance-sparkle">로맨스 스파클</option>
          <option value="none">말풍선만 (효과선 없음)</option>
        </select>
      </div>
      <div className="cl-export-dialogue-grid" role="group" aria-label="1~4컷 카메라 구도·발화자·말풍선·강조·효과음·다국어 대사">
        {([0, 1, 2, 3] as const).map((cutIdx) => (
          <div key={cutIdx} className="cl-export-dialogue-item">
            <div className="cl-export-cut-header-row">
              <label htmlFor={`${ids}-strip-dialogue-${cutIdx}`}>{`${cutIdx + 1}컷 구도·대사`}</label>
              <select
                aria-label={`${cutIdx + 1}컷 카메라 구도`}
                data-testid={`export-strip-camera-${cutIdx}`}
                value={cutCameraPresets[cutIdx]}
                onChange={(event) => stripDirector.setCutCameraPreset(cutIdx, event.target.value as WebtoonStripCutCameraPresetId)}
              >
                {(Object.keys(WEBTOON_CUT_CAMERA_PRESETS) as WebtoonStripCutCameraPresetId[]).map((presetId) => (
                  <option key={presetId} value={presetId}>
                    {WEBTOON_CUT_CAMERA_PRESETS[presetId].labelKo}
                  </option>
                ))}
              </select>
            </div>
            <div className="cl-export-cut-controls-row">
              <select
                aria-label={`${cutIdx + 1}컷 발화자`}
                data-testid={`export-strip-speaker-${cutIdx}`}
                disabled={!bakeStripFx || bubbleShapes[cutIdx] === "none"}
                value={speakerTargets[cutIdx]}
                onChange={(event) => stripDirector.setSpeakerTarget(cutIdx, event.target.value as WebtoonStripSpeakerTarget)}
              >
                {(Object.keys(WEBTOON_STRIP_SPEAKER_LABELS_KO) as WebtoonStripSpeakerTarget[]).map((target) => (
                  <option key={target} value={target}>
                    {WEBTOON_STRIP_SPEAKER_LABELS_KO[target]}
                  </option>
                ))}
              </select>
              <select
                aria-label={`${cutIdx + 1}컷 말풍선 모양`}
                data-testid={`export-strip-bubble-shape-${cutIdx}`}
                disabled={!bakeStripFx}
                value={bubbleShapes[cutIdx]}
                onChange={(event) => stripDirector.setBubbleShape(cutIdx, event.target.value as WebtoonStripBubbleShape)}
              >
                {(Object.keys(WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO) as WebtoonStripBubbleShape[]).map((shape) => (
                  <option key={shape} value={shape}>
                    {WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO[shape]}
                  </option>
                ))}
              </select>
              <select
                aria-label={`${cutIdx + 1}컷 대사 폰트 배율`}
                data-testid={`export-strip-font-scale-${cutIdx}`}
                disabled={!bakeStripFx || bubbleShapes[cutIdx] === "none"}
                value={bubbleFontScales[cutIdx]}
                onChange={(event) => stripDirector.setBubbleFontScale(cutIdx, event.target.value as WebtoonStripBubbleFontScale)}
              >
                {(Object.keys(WEBTOON_STRIP_FONT_SCALE_LABELS_KO) as WebtoonStripBubbleFontScale[]).map((scale) => (
                  <option key={scale} value={scale}>
                    {WEBTOON_STRIP_FONT_SCALE_LABELS_KO[scale]}
                  </option>
                ))}
              </select>
              <select
                aria-label={`${cutIdx + 1}컷 효과음 스탬프`}
                data-testid={`export-strip-sfx-stamp-${cutIdx}`}
                disabled={!bakeStripFx}
                value={sfxStamps[cutIdx]}
                onChange={(event) => stripDirector.setSfxStamp(cutIdx, event.target.value as WebtoonSfxStampOption)}
              >
                <option value="none">효과음 없음</option>
                {WEBTOON_SFX_STAMPS.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {resolveSfxGlyphByLocale(spec.id, stripLocale)}
                  </option>
                ))}
              </select>
            </div>
            <input
              id={`${ids}-strip-dialogue-${cutIdx}`}
              data-testid={`export-strip-dialogue-${cutIdx}`}
              type="text"
              maxLength={64}
              disabled={!bakeStripFx || bubbleShapes[cutIdx] === "none"}
              value={dialogueLines[cutIdx]}
              onChange={(event) => stripDirector.setDialogueLine(cutIdx, event.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
