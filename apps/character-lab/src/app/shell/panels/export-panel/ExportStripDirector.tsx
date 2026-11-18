import {
  WEBTOON_STRIP_ACTING_ARCS,
  WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO,
  WEBTOON_STRIP_FONT_SCALE_LABELS_KO,
} from "../../../../export/webtoon-strip-composer";
import { WEBTOON_SFX_STAMPS } from "../viewport-hand-prop-controls";

import type {
  WebtoonSfxStampOption,
  WebtoonStripActingArcId,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleShape,
  WebtoonStripFxLinesKind,
} from "../../../../export/webtoon-strip-composer";
import type { StripDirectorSession, StripDirectorState } from "../viewport-scene-director";

interface ExportStripDirectorProps {
  readonly ids: string;
  readonly directorState: StripDirectorState;
  readonly stripDirector: StripDirectorSession;
}

/** 뷰포트와 공유하는 스트립 세션의 컷별 연기·식자·효과음 입력부. */
export function ExportStripDirector({ ids, directorState, stripDirector }: ExportStripDirectorProps) {
  const { actingArc: stripActingArc, bakeStripFx, stripFxLines, dialogueLines, bubbleShapes, bubbleFontScales, sfxStamps } = directorState;

  return (
    <div className="cl-export-strip-director" role="group" aria-label="세로 4컷 스트립 연기·연출 디렉터">
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
      <div className="cl-export-dialogue-grid" role="group" aria-label="1~4컷 말풍선 모양·강조·효과음·한국어 대사">
        {([0, 1, 2, 3] as const).map((cutIdx) => (
          <div key={cutIdx} className="cl-export-dialogue-item">
            <label htmlFor={`${ids}-strip-dialogue-${cutIdx}`}>{`${cutIdx + 1}컷 대사·연출`}</label>
            <div className="cl-export-cut-controls-row">
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
                    {spec.glyphKo}
                  </option>
                ))}
              </select>
            </div>
            <input
              id={`${ids}-strip-dialogue-${cutIdx}`}
              data-testid={`export-strip-dialogue-${cutIdx}`}
              type="text"
              maxLength={42}
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
