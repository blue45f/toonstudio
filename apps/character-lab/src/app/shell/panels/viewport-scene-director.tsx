/**
 * 장르별 원클릭 풀세트 씬 디렉터 세션 및 뷰포트 컨트롤 (`viewport-scene-director.tsx`, Unslop 규약 준수):
 * - 9대 웹툰 씬 디렉터 카탈로그(`viewport-scene-director-presets.ts`) 연동
 * - `stripDirectorSession` 외부 반응형 스토어를 통해 `ViewportPane`과 `ExportPanel`이 `UiState` 오염 없이 실시간 동기화된다.
 */
import {
  DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  DEFAULT_WEBTOON_STRIP_CUT_CAMERA_PRESETS,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_BY_LOCALE,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  DEFAULT_WEBTOON_STRIP_SCREENTONES,
  DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
} from "../../../export/webtoon-strip-composer";
import { SHAPER_TOON_SHADER_PRESETS, buildShaperToonShadingProfile } from "../../../presets";

import { WEBTOON_SCENE_DIRECTOR_PRESETS } from "./viewport-scene-director-presets";

import type { DuoPartnerSide } from "./viewport-duo-shot-guide";
import type { WebtoonSceneDirectorPreset, WebtoonSceneDirectorPresetId } from "./viewport-scene-director-presets";
import type { ShadingProfile } from "../../../contracts";
import type {
  WebtoonDialogueLocale,
  WebtoonJaWritingMode,
  WebtoonManuscriptMoodId,
  WebtoonScreentoneId,
  WebtoonSfxStampOption,
  WebtoonStripActingArcId,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleFontScales,
  WebtoonStripBubbleShape,
  WebtoonStripBubbleShapes,
  WebtoonStripCutCameraPresetId,
  WebtoonStripCutCameraPresets,
  WebtoonStripDialogueLines,
  WebtoonStripFxLinesKind,
  WebtoonStripGutterPaceId,
  WebtoonStripGutterPaces,
  WebtoonStripScreentones,
  WebtoonStripSfxStamps,
  WebtoonStripSpeakerTarget,
  WebtoonStripSpeakerTargets,
} from "../../../export/webtoon-strip-composer";
import type { ShaperToonShaderId } from "../../../presets";

export { WEBTOON_SCENE_DIRECTOR_PRESETS } from "./viewport-scene-director-presets";
export type {
  WebtoonDirectorDuoCastingSpec,
  WebtoonSceneDirectorPreset,
  WebtoonSceneDirectorPresetId,
} from "./viewport-scene-director-presets";

export function findWebtoonSceneDirectorPreset(id: string): WebtoonSceneDirectorPreset | null {
  return WEBTOON_SCENE_DIRECTOR_PRESETS.find((item) => item.id === id) ?? null;
}

export function resolveDirectorShadingProfile(current: ShadingProfile, toonShaderId: ShaperToonShaderId): ShadingProfile {
  const matched = SHAPER_TOON_SHADER_PRESETS.find((item) => item.id === toonShaderId) ?? SHAPER_TOON_SHADER_PRESETS[0]!;
  return buildShaperToonShadingProfile(current, matched);
}

export type WebtoonTankobonOrder = "rtl-tankobon" | "ltr-manhwa";

export interface StripDirectorState {
  readonly activeDirectorId: WebtoonSceneDirectorPresetId | "";
  readonly locale: WebtoonDialogueLocale;
  readonly jaWritingMode: WebtoonJaWritingMode;
  readonly tankobonOrder: WebtoonTankobonOrder;
  readonly manuscriptMood: WebtoonManuscriptMoodId;
  readonly gutterPaces: WebtoonStripGutterPaces;
  readonly screentones: WebtoonStripScreentones;
  readonly actingArc: WebtoonStripActingArcId;
  readonly bakeStripFx: boolean;
  readonly stripFxLines: WebtoonStripFxLinesKind;
  readonly dialogueLines: WebtoonStripDialogueLines;
  readonly bubbleShapes: WebtoonStripBubbleShapes;
  readonly bubbleFontScales: WebtoonStripBubbleFontScales;
  readonly sfxStamps: WebtoonStripSfxStamps;
  readonly speakerTargets: WebtoonStripSpeakerTargets;
  readonly cutCameraPresets: WebtoonStripCutCameraPresets;
  readonly partnerSide: DuoPartnerSide;
  readonly includePsdMangaFx: boolean;
}

export interface StripDirectorSession {
  getState(): StripDirectorState;
  update(patch: Partial<StripDirectorState>): void;
  setLocale(locale: WebtoonDialogueLocale): void;
  setJaWritingMode(mode: WebtoonJaWritingMode): void;
  setManuscriptMood(mood: WebtoonManuscriptMoodId): void;
  setGutterPace(gapIndex: 0 | 1 | 2, paceId: WebtoonStripGutterPaceId): void;
  setScreentone(cutIndex: 0 | 1 | 2 | 3, toneId: WebtoonScreentoneId): void;
  setAllScreentones(toneId: WebtoonScreentoneId): void;
  setDialogueLine(cutIndex: 0 | 1 | 2 | 3, text: string): void;
  setBubbleShape(cutIndex: 0 | 1 | 2 | 3, shape: WebtoonStripBubbleShape): void;
  setBubbleFontScale(cutIndex: 0 | 1 | 2 | 3, scale: WebtoonStripBubbleFontScale): void;
  setSfxStamp(cutIndex: 0 | 1 | 2 | 3, stamp: WebtoonSfxStampOption): void;
  setSpeakerTarget(cutIndex: 0 | 1 | 2 | 3, target: WebtoonStripSpeakerTarget): void;
  setCutCameraPreset(cutIndex: 0 | 1 | 2 | 3, presetId: WebtoonStripCutCameraPresetId): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export const INITIAL_STRIP_DIRECTOR_STATE: StripDirectorState = Object.freeze({
  activeDirectorId: "",
  locale: "ko",
  jaWritingMode: "horizontal",
  tankobonOrder: "rtl-tankobon",
  manuscriptMood: "daylight-paper",
  gutterPaces: DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  screentones: DEFAULT_WEBTOON_STRIP_SCREENTONES,
  actingArc: "none",
  bakeStripFx: false,
  stripFxLines: "focus-radial",
  dialogueLines: DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  bubbleShapes: DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  bubbleFontScales: DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  sfxStamps: DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  speakerTargets: DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
  cutCameraPresets: DEFAULT_WEBTOON_STRIP_CUT_CAMERA_PRESETS,
  partnerSide: "right",
  includePsdMangaFx: false,
});

function linesEqual(a: WebtoonStripDialogueLines, b: WebtoonStripDialogueLines): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function createStripDirectorSession(initial: Partial<StripDirectorState> = {}): StripDirectorSession {
  let state: StripDirectorState = { ...INITIAL_STRIP_DIRECTOR_STATE, ...initial };
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    update(patch) {
      state = { ...state, ...patch };
      notify();
    },
    setLocale(nextLocale) {
      const activePreset = state.activeDirectorId ? findWebtoonSceneDirectorPreset(state.activeDirectorId) : null;
      const matchesPreset = activePreset
        ? linesEqual(state.dialogueLines, activePreset.dialogueByLocale[state.locale])
        : false;
      const matchesDefault = linesEqual(state.dialogueLines, DEFAULT_WEBTOON_STRIP_DIALOGUE_BY_LOCALE[state.locale]);
      const nextLines = matchesPreset && activePreset
        ? activePreset.dialogueByLocale[nextLocale]
        : matchesDefault
          ? DEFAULT_WEBTOON_STRIP_DIALOGUE_BY_LOCALE[nextLocale]
          : state.dialogueLines;
      state = { ...state, locale: nextLocale, dialogueLines: nextLines };
      notify();
    },
    setJaWritingMode(mode) {
      state = { ...state, jaWritingMode: mode };
      notify();
    },
    setManuscriptMood(mood) {
      state = { ...state, manuscriptMood: mood };
      notify();
    },
    setGutterPace(gapIndex, paceId) {
      const next: [WebtoonStripGutterPaceId, WebtoonStripGutterPaceId, WebtoonStripGutterPaceId] = [
        state.gutterPaces[0],
        state.gutterPaces[1],
        state.gutterPaces[2],
      ];
      next[gapIndex] = paceId;
      state = { ...state, gutterPaces: next };
      notify();
    },
    setScreentone(cutIndex, toneId) {
      const next: [WebtoonScreentoneId, WebtoonScreentoneId, WebtoonScreentoneId, WebtoonScreentoneId] = [
        state.screentones[0],
        state.screentones[1],
        state.screentones[2],
        state.screentones[3],
      ];
      next[cutIndex] = toneId;
      state = { ...state, screentones: next };
      notify();
    },
    setAllScreentones(toneId) {
      state = { ...state, screentones: [toneId, toneId, toneId, toneId] };
      notify();
    },
    setDialogueLine(cutIndex, text) {
      const next: [string, string, string, string] = [
        state.dialogueLines[0],
        state.dialogueLines[1],
        state.dialogueLines[2],
        state.dialogueLines[3],
      ];
      next[cutIndex] = text;
      state = { ...state, dialogueLines: next };
      notify();
    },
    setBubbleShape(cutIndex, shape) {
      const next: [WebtoonStripBubbleShape, WebtoonStripBubbleShape, WebtoonStripBubbleShape, WebtoonStripBubbleShape] = [
        state.bubbleShapes[0],
        state.bubbleShapes[1],
        state.bubbleShapes[2],
        state.bubbleShapes[3],
      ];
      next[cutIndex] = shape;
      state = { ...state, bubbleShapes: next };
      notify();
    },
    setBubbleFontScale(cutIndex, scale) {
      const next: [WebtoonStripBubbleFontScale, WebtoonStripBubbleFontScale, WebtoonStripBubbleFontScale, WebtoonStripBubbleFontScale] = [
        state.bubbleFontScales[0],
        state.bubbleFontScales[1],
        state.bubbleFontScales[2],
        state.bubbleFontScales[3],
      ];
      next[cutIndex] = scale;
      state = { ...state, bubbleFontScales: next };
      notify();
    },
    setSfxStamp(cutIndex, stamp) {
      const next: [WebtoonSfxStampOption, WebtoonSfxStampOption, WebtoonSfxStampOption, WebtoonSfxStampOption] = [
        state.sfxStamps[0],
        state.sfxStamps[1],
        state.sfxStamps[2],
        state.sfxStamps[3],
      ];
      next[cutIndex] = stamp;
      state = { ...state, sfxStamps: next };
      notify();
    },
    setSpeakerTarget(cutIndex, target) {
      const next: [WebtoonStripSpeakerTarget, WebtoonStripSpeakerTarget, WebtoonStripSpeakerTarget, WebtoonStripSpeakerTarget] = [
        state.speakerTargets[0],
        state.speakerTargets[1],
        state.speakerTargets[2],
        state.speakerTargets[3],
      ];
      next[cutIndex] = target;
      state = { ...state, speakerTargets: next };
      notify();
    },
    setCutCameraPreset(cutIndex, presetId) {
      const next: [WebtoonStripCutCameraPresetId, WebtoonStripCutCameraPresetId, WebtoonStripCutCameraPresetId, WebtoonStripCutCameraPresetId] = [
        state.cutCameraPresets[0],
        state.cutCameraPresets[1],
        state.cutCameraPresets[2],
        state.cutCameraPresets[3],
      ];
      next[cutIndex] = presetId;
      state = { ...state, cutCameraPresets: next };
      notify();
    },
    reset() {
      state = INITIAL_STRIP_DIRECTOR_STATE;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let defaultStripDirectorSession: StripDirectorSession | null = null;

export function getDefaultStripDirectorSession(): StripDirectorSession {
  defaultStripDirectorSession ??= createStripDirectorSession();
  return defaultStripDirectorSession;
}

export interface ViewportSceneDirectorControlsProps {
  readonly engineReady: boolean;
  readonly busy: boolean;
  readonly activeDirectorId: WebtoonSceneDirectorPresetId | "";
  readonly duoPartnerActive?: boolean;
  readonly onSelectDirector: (presetId: WebtoonSceneDirectorPresetId | "") => void;
  readonly onCastDuoPartner?: () => void;
}

export function ViewportSceneDirectorControls({
  engineReady,
  busy,
  activeDirectorId,
  duoPartnerActive = false,
  onSelectDirector,
  onCastDuoPartner,
}: ViewportSceneDirectorControlsProps) {
  const activeSpec = activeDirectorId ? findWebtoonSceneDirectorPreset(activeDirectorId) : null;
  return (
    <span className="cl-viewport-group cl-viewport-director-cluster" role="group" aria-label="장르별 원클릭 씬 디렉터">
      <select
        className="cl-viewport-select"
        aria-label="원클릭 씬 디렉터 프리셋"
        data-testid="viewport-scene-director-select"
        value={activeDirectorId}
        disabled={!engineReady || busy}
        title={
          activeSpec
            ? `${activeSpec.labelKo}: ${activeSpec.summaryKo}`
            : "손 소품·머리 액세서리·배경 스테이지·툰 조명·4컷 연기 시퀀스·카메라 구도·스크롤 여백·할프톤 스크린톤·다국어 대사를 한 번에 세팅합니다"
        }
        onChange={(event) => onSelectDirector(event.target.value as WebtoonSceneDirectorPresetId | "")}
      >
        <option value="">원클릭 씬 디렉터…</option>
        {WEBTOON_SCENE_DIRECTOR_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.labelKo}
          </option>
        ))}
      </select>
      {activeSpec && onCastDuoPartner ? (
        <button
          type="button"
          className="cl-viewport-button"
          data-testid="viewport-director-cast-duo"
          aria-pressed={duoPartnerActive}
          disabled={!engineReady || busy}
          title="선택한 장르 디렉터에 어울리는 3D 상대역 캐릭터·표정·전용 손소품·아이컨택 시선 교환과 4컷 발화자 배치를 한 번에 세팅합니다"
          onClick={onCastDuoPartner}
        >
          상대역 자동 캐스팅
        </button>
      ) : null}
    </span>
  );
}
