/**
 * 세로 4컷 웹툰 스트립 연기·구도·스크롤 호흡·시간대 색온도·할프톤 스크린톤·다국어(세로쓰기 포함) 식자 디렉터 서브컴포넌트.
 *
 * React 19 & Editor Chrome 아키텍처 준수:
 * - 인라인 컴포넌트 선언 금지, 명시적 삼항 연산자 렌더링, 비활성 컨트롤마다 사유(title) 제공.
 * - 표면 계층과 1px 헤어라인 구분선만 사용하여 중첩 보더 카드 과잉을 방지한다.
 */
import {
  WEBTOON_CUT_CAMERA_PRESETS,
  WEBTOON_DIALOGUE_LOCALES,
  WEBTOON_DIALOGUE_LOCALE_LABELS,
  WEBTOON_JA_WRITING_MODES,
  WEBTOON_JA_WRITING_MODE_LABELS_KO,
  WEBTOON_MANUSCRIPT_MOODS,
  WEBTOON_MANUSCRIPT_MOOD_IDS,
  WEBTOON_SCREENTONE_IDS,
  WEBTOON_SCREENTONE_SPECS,
  WEBTOON_STRIP_ACTING_ARCS,
  WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO,
  WEBTOON_STRIP_FONT_SCALE_LABELS_KO,
  WEBTOON_STRIP_GUTTER_PACES,
  WEBTOON_STRIP_GUTTER_PACE_IDS,
  WEBTOON_STRIP_SPEAKER_LABELS_KO,
  resolveSfxGlyphByLocale,
} from "../../../../export/webtoon-strip-composer";
import { WEBTOON_SFX_STAMPS } from "../viewport-hand-prop-controls";

import type {
  WebtoonDialogueLocale,
  WebtoonJaWritingMode,
  WebtoonManuscriptMoodId,
  WebtoonScreentoneId,
  WebtoonSfxStampOption,
  WebtoonStripActingArcId,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleShape,
  WebtoonStripCutCameraPresetId,
  WebtoonStripFxLinesKind,
  WebtoonStripGutterPaceId,
  WebtoonStripSpeakerTarget,
} from "../../../../export/webtoon-strip-composer";
import type { StripDirectorSession, StripDirectorState } from "../viewport-scene-director";

export interface ExportStripDirectorSectionProps {
  readonly idsPrefix: string;
  readonly state: StripDirectorState;
  readonly session: StripDirectorSession;
}

const CUT_INDICES = [0, 1, 2, 3] as const;
const GUTTER_GAPS = [
  { index: 0 as const, labelKo: "1→2컷 호흡" },
  { index: 1 as const, labelKo: "2→3컷 호흡" },
  { index: 2 as const, labelKo: "3→4컷 호흡" },
] as const;

export function ExportStripDirectorSection({
  idsPrefix,
  state,
  session,
}: ExportStripDirectorSectionProps) {
  const {
    locale: stripLocale,
    jaWritingMode,
    manuscriptMood,
    gutterPaces,
    screentones,
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

  const isJapanese = stripLocale === "ja";
  const uniformScreentone: WebtoonScreentoneId | "" =
    screentones[0] === screentones[1] && screentones[1] === screentones[2] && screentones[2] === screentones[3]
      ? screentones[0]
      : "";

  return (
    <div className="cl-export-strip-director" role="group" aria-label="세로 4컷 스트립 연기·구도·호흡·스크린톤·다국어 식자 디렉터">
      <div className="cl-export-row">
        <label htmlFor={`${idsPrefix}-strip-acting-arc`}>4컷 연기 시퀀스</label>
        <select
          id={`${idsPrefix}-strip-acting-arc`}
          data-testid="export-strip-acting-arc"
          value={stripActingArc}
          onChange={(event) => session.update({ actingArc: event.target.value as WebtoonStripActingArcId })}
        >
          <option value="none">고정 표정·시선 (단일 포즈 유지)</option>
          {WEBTOON_STRIP_ACTING_ARCS.map((arc) => (
            <option key={arc.id} value={arc.id}>
              {arc.labelKo}
            </option>
          ))}
        </select>
        <label htmlFor={`${idsPrefix}-strip-mood`}>시간대 원고 무드</label>
        <select
          id={`${idsPrefix}-strip-mood`}
          data-testid="export-strip-mood"
          value={manuscriptMood}
          onChange={(event) => session.setManuscriptMood(event.target.value as WebtoonManuscriptMoodId)}
        >
          {WEBTOON_MANUSCRIPT_MOOD_IDS.map((moodId) => (
            <option key={moodId} value={moodId}>
              {WEBTOON_MANUSCRIPT_MOODS[moodId].labelKo}
            </option>
          ))}
        </select>
      </div>

      <div className="cl-export-row">
        <label htmlFor={`${idsPrefix}-strip-locale`}>식자 언어·말풍선 비율</label>
        <select
          id={`${idsPrefix}-strip-locale`}
          data-testid="export-strip-locale"
          value={stripLocale}
          onChange={(event) => session.setLocale(event.target.value as WebtoonDialogueLocale)}
        >
          {WEBTOON_DIALOGUE_LOCALES.map((loc) => (
            <option key={loc} value={loc}>
              {WEBTOON_DIALOGUE_LOCALE_LABELS[loc]}
            </option>
          ))}
        </select>
        <label htmlFor={`${idsPrefix}-strip-ja-mode`}>일본어 조판 방향</label>
        <select
          id={`${idsPrefix}-strip-ja-mode`}
          data-testid="export-strip-ja-writing-mode"
          value={jaWritingMode}
          disabled={!isJapanese}
          title={
            isJapanese
              ? "일본어 대사를 웹툰 가로쓰기(横書き) 또는 단행본 전통 세로쓰기(縦書き · 우→좌 열 조판)로 전환합니다"
              : "식자 언어를 日本語(JA)로 선택하면 단행본 세로쓰기(縦書き) 모드를 활성화할 수 있습니다"
          }
          onChange={(event) => session.setJaWritingMode(event.target.value as WebtoonJaWritingMode)}
        >
          {WEBTOON_JA_WRITING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {WEBTOON_JA_WRITING_MODE_LABELS_KO[mode]}
            </option>
          ))}
        </select>
        <label htmlFor={`${idsPrefix}-strip-tankobon-order`}>단행본 읽기 순서</label>
        <select
          id={`${idsPrefix}-strip-tankobon-order`}
          data-testid="export-strip-tankobon-order"
          value={state.tankobonOrder}
          title="단행본 4컷 출판 페이지 PNG 저장 시 1~4컷을 우→좌(일본 단행본 표준) 또는 좌→우(한국 단행본)로 배치합니다"
          onChange={(event) =>
            session.update({
              tankobonOrder: event.target.value === "ltr-manhwa" ? "ltr-manhwa" : "rtl-tankobon",
            })
          }
        >
          <option value="rtl-tankobon">우→좌 (1우상·2좌상)</option>
          <option value="ltr-manhwa">좌→우 (1좌상·2우상)</option>
        </select>
      </div>

      <div className="cl-export-row">
        <label htmlFor={`${idsPrefix}-tankobon-page-num`}>단행본 쪽번호(Folio)</label>
        <input
          id={`${idsPrefix}-tankobon-page-num`}
          data-testid="export-tankobon-page-num"
          type="number"
          min={0}
          max={999}
          value={state.tankobonPageNumber}
          title="0이면 쪽번호 생략, 1~999 입력 시 하단 트림 안에 P.01 형식으로 인쇄합니다"
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            session.update({
              tankobonPageNumber: Number.isFinite(parsed) ? Math.min(999, Math.max(0, parsed)) : 0,
            });
          }}
        />
        <label htmlFor={`${idsPrefix}-tankobon-binding`}>제본 책등 여백</label>
        <select
          id={`${idsPrefix}-tankobon-binding`}
          data-testid="export-tankobon-binding"
          value={state.tankobonBindingSide}
          title="실물 단행본 제본 시 홀수 쪽(Recto) 또는 짝수 쪽(Verso) 책등 안쪽 여백을 자동으로 넓혀 대칭을 맞춥니다"
          onChange={(event) => {
            const v = event.target.value;
            session.update({
              tankobonBindingSide: v === "odd-recto" || v === "even-verso" ? v : "none",
            });
          }}
        >
          <option value="none">대칭 여백 (단면)</option>
          <option value="odd-recto">홀수 쪽 (책등 확대)</option>
          <option value="even-verso">짝수 쪽 (맞면 대칭)</option>
        </select>
        <label htmlFor={`${idsPrefix}-strip-ambient-bgm`}>
          <input
            id={`${idsPrefix}-strip-ambient-bgm`}
            data-testid="export-strip-ambient-bgm"
            type="checkbox"
            checked={state.includeAmbientBgm}
            onChange={(event) => session.update({ includeAmbientBgm: event.target.checked })}
          />{" "}
          무드 앰비언트 BGM 패드 믹싱
        </label>
      </div>

      <div className="cl-export-gutter-pace-row" role="group" aria-label="컷 사이 스크롤 여백 호흡">
        {GUTTER_GAPS.map((gap) => (
          <label key={gap.index} className="cl-export-gutter-pace-cell" htmlFor={`${idsPrefix}-strip-gutter-${gap.index}`}>
            <span>{gap.labelKo}</span>
            <select
              id={`${idsPrefix}-strip-gutter-${gap.index}`}
              aria-label={`${gap.labelKo} 여백 배율`}
              data-testid={`export-strip-gutter-${gap.index}`}
              value={gutterPaces[gap.index]}
              onChange={(event) => session.setGutterPace(gap.index, event.target.value as WebtoonStripGutterPaceId)}
            >
              {WEBTOON_STRIP_GUTTER_PACE_IDS.map((paceId) => (
                <option key={paceId} value={paceId}>
                  {WEBTOON_STRIP_GUTTER_PACES[paceId].labelKo}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="cl-export-row">
        <label htmlFor={`${idsPrefix}-strip-bake-fx`}>
          <input
            id={`${idsPrefix}-strip-bake-fx`}
            data-testid="export-strip-bake-fx"
            type="checkbox"
            checked={bakeStripFx}
            onChange={(event) => session.update({ bakeStripFx: event.target.checked })}
          />{" "}
          4컷 말풍선·효과선 베이킹
        </label>
        <label htmlFor={`${idsPrefix}-strip-fx-lines`}>효과선</label>
        <select
          id={`${idsPrefix}-strip-fx-lines`}
          data-testid="export-strip-fx-lines"
          value={stripFxLines}
          disabled={!bakeStripFx}
          title={bakeStripFx ? "4컷 배경에 합성할 만화 효과선을 선택합니다" : "4컷 말풍선·효과선 베이킹을 켜면 효과선을 선택할 수 있습니다"}
          onChange={(event) => session.update({ stripFxLines: event.target.value as WebtoonStripFxLinesKind })}
        >
          <option value="focus-radial">집중선 (방사형)</option>
          <option value="speed-diagonal">속도선 (대각선)</option>
          <option value="romance-sparkle">로맨스 스파클</option>
          <option value="none">말풍선만 (효과선 없음)</option>
        </select>
        <label htmlFor={`${idsPrefix}-strip-tone-all`}>일괄 스크린톤</label>
        <select
          id={`${idsPrefix}-strip-tone-all`}
          aria-label="4컷 일괄 할프톤 스크린톤"
          data-testid="export-strip-screentone-all"
          value={uniformScreentone}
          onChange={(event) => {
            const val = event.target.value as WebtoonScreentoneId | "";
            if (val) session.setAllScreentones(val);
          }}
        >
          <option value="" disabled>
            컷별 개별 망점 사용 중
          </option>
          {WEBTOON_SCREENTONE_IDS.map((toneId) => (
            <option key={toneId} value={toneId}>
              {WEBTOON_SCREENTONE_SPECS[toneId].labelKo}
            </option>
          ))}
        </select>
      </div>

      <div className="cl-export-dialogue-grid" role="group" aria-label="1~4컷 카메라 구도·스크린톤·발화자·말풍선·강조·효과음·다국어 대사">
        {CUT_INDICES.map((cutIdx) => {
          const bubbleHidden = bubbleShapes[cutIdx] === "none";
          const textDisabled = !bakeStripFx || bubbleHidden;
          const disabledReason = !bakeStripFx
            ? "4컷 말풍선·효과선 베이킹을 켜면 편집할 수 있습니다"
            : bubbleHidden
              ? "말풍선 모양이 숨김으로 설정되어 비활성화되었습니다"
              : undefined;
          return (
            <div key={cutIdx} className="cl-export-dialogue-item">
              <div className="cl-export-cut-header-row">
                <label htmlFor={`${idsPrefix}-strip-dialogue-${cutIdx}`}>{`${cutIdx + 1}컷 구도·대사`}</label>
                <select
                  aria-label={`${cutIdx + 1}컷 카메라 구도`}
                  data-testid={`export-strip-camera-${cutIdx}`}
                  value={cutCameraPresets[cutIdx]}
                  onChange={(event) => session.setCutCameraPreset(cutIdx, event.target.value as WebtoonStripCutCameraPresetId)}
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
                  aria-label={`${cutIdx + 1}컷 할프톤 스크린톤`}
                  data-testid={`export-strip-screentone-${cutIdx}`}
                  value={screentones[cutIdx]}
                  onChange={(event) => session.setScreentone(cutIdx, event.target.value as WebtoonScreentoneId)}
                >
                  {WEBTOON_SCREENTONE_IDS.map((toneId) => (
                    <option key={toneId} value={toneId}>
                      {WEBTOON_SCREENTONE_SPECS[toneId].labelKo}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${cutIdx + 1}컷 발화자`}
                  data-testid={`export-strip-speaker-${cutIdx}`}
                  disabled={textDisabled}
                  title={disabledReason}
                  value={speakerTargets[cutIdx]}
                  onChange={(event) => session.setSpeakerTarget(cutIdx, event.target.value as WebtoonStripSpeakerTarget)}
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
                  title={!bakeStripFx ? "4컷 말풍선·효과선 베이킹을 켜면 말풍선 도형을 바꿀 수 있습니다" : undefined}
                  value={bubbleShapes[cutIdx]}
                  onChange={(event) => session.setBubbleShape(cutIdx, event.target.value as WebtoonStripBubbleShape)}
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
                  disabled={textDisabled}
                  title={disabledReason}
                  value={bubbleFontScales[cutIdx]}
                  onChange={(event) => session.setBubbleFontScale(cutIdx, event.target.value as WebtoonStripBubbleFontScale)}
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
                  title={!bakeStripFx ? "4컷 말풍선·효과선 베이킹을 켜면 효과음 스탬프를 배치할 수 있습니다" : undefined}
                  value={sfxStamps[cutIdx]}
                  onChange={(event) => session.setSfxStamp(cutIdx, event.target.value as WebtoonSfxStampOption)}
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
                id={`${idsPrefix}-strip-dialogue-${cutIdx}`}
                data-testid={`export-strip-dialogue-${cutIdx}`}
                type="text"
                maxLength={64}
                disabled={textDisabled}
                title={disabledReason}
                value={dialogueLines[cutIdx]}
                onChange={(event) => session.setDialogueLine(cutIdx, event.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
