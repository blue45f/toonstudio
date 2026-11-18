/**
 * 장르별 원클릭 풀세트 씬 디렉터 프리셋 (`viewport-scene-director.tsx`, Unslop 규약 준수):
 * - 로판 대관식 · 느와르 취조실 · 캠퍼스 카페 · 무협 각성 4대 한국 웹툰 씬 디렉터
 * - 버튼/셀렉터 한 번으로 손 소품 + 그립 포즈 + 머리 액세서리 + 배경 스테이지 + 웹툰 셀셰이딩 조명 + 4컷 연기 시퀀스 + 컷별 발화자/말풍선 도형/강조/효과음 스탬프/한국어 대사까지 일괄 세팅
 * - `상대역 자동 캐스팅` 버튼으로 장르에 어울리는 3D 듀오 상대역 캐릭터·표정·전용 손소품·아이컨택 시선 교환까지 즉시 배치
 * - `stripDirectorSession` 외부 반응형 스토어를 통해 `ViewportPane`과 `ExportPanel`이 `UiState` 오염 없이 실시간 동기화된다.
 */
import {
  DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
} from "../../../export/webtoon-strip-composer";
import { SHAPER_TOON_SHADER_PRESETS, buildShaperToonShadingProfile } from "../../../presets";

import type { DuoPartnerSide, DuoShotDistanceKey } from "./viewport-duo-shot-guide";
import type {
  WebtoonSfxStampOption,
  WebtoonStripActingArcId,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleFontScales,
  WebtoonStripBubbleShape,
  WebtoonStripBubbleShapes,
  WebtoonStripDialogueLines,
  WebtoonStripFxLinesKind,
  WebtoonStripSfxStamps,
  WebtoonStripSpeakerTarget,
  WebtoonStripSpeakerTargets,
} from "../../../export/webtoon-strip-composer";
import type { ShaperToonShaderId } from "../../../presets";
import type {
  DuoPartnerExpressionPreset,
  DuoPartnerStance,
  HandPropId,
  HandPropSide,
  HeadPropId,
  SfxStampId,
  ShadingProfile,
  StagePropId,
} from "../../../contracts";

export type WebtoonSceneDirectorPresetId =
  | "director-rofan-coronation"
  | "director-noir-interrogation"
  | "director-campus-cafe"
  | "director-murim-awakening";

export interface WebtoonDirectorDuoCastingSpec {
  readonly partnerId: string;
  readonly side: DuoPartnerSide;
  readonly distanceKey: DuoShotDistanceKey;
  readonly stance: DuoPartnerStance;
  readonly expression: DuoPartnerExpressionPreset;
  readonly partnerHandPropId: HandPropId | "";
}

export interface WebtoonSceneDirectorPreset {
  readonly id: WebtoonSceneDirectorPresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly handPropId: HandPropId;
  readonly handSide: HandPropSide;
  readonly headPropId: HeadPropId;
  readonly stagePropId: StagePropId;
  readonly sfxStampId: SfxStampId;
  readonly toonShaderId: ShaperToonShaderId;
  readonly actingArc: Exclude<WebtoonStripActingArcId, "none">;
  readonly fxLinesKind: WebtoonStripFxLinesKind;
  readonly dialogueLines: WebtoonStripDialogueLines;
  readonly bubbleShapes: WebtoonStripBubbleShapes;
  readonly bubbleFontScales: WebtoonStripBubbleFontScales;
  readonly sfxStamps: WebtoonStripSfxStamps;
  readonly speakerTargets: WebtoonStripSpeakerTargets;
  readonly duoCasting: WebtoonDirectorDuoCastingSpec;
}

export const WEBTOON_SCENE_DIRECTOR_PRESETS: readonly WebtoonSceneDirectorPreset[] = Object.freeze([
  {
    id: "director-rofan-coronation",
    labelKo: "로판 대관식 (티아라·단검·대리석 단상)",
    summaryKo: "사파이어 티아라 + 마력 단검 + 황실 대리석 단상 + 일루미네이션 림 + 여유·역전 4컷 연기",
    handPropId: "aether-blade",
    handSide: "rightHand",
    headPropId: "rofan-tiara",
    stagePropId: "rofan-throne-dais",
    sfxStampId: "seureung",
    toonShaderId: "illumination-rim",
    actingArc: "arc-confident-smirk",
    fxLinesKind: "romance-sparkle",
    dialogueLines: [
      "황실의 검과 왕관, 오늘부로 내가 거둔다.",
      "감히 고개를 들어 내 눈을 마주 봐.",
      "오래 기다렸지? 이제 반격의 시간이야.",
      "내 제국에 온 걸 환영해.",
    ],
    bubbleShapes: ["monologue-box", "oval", "shout-burst", "oval"],
    bubbleFontScales: ["md", "md", "lg", "md"],
    sfxStamps: ["seureung", "none", "pat", "dugeun"],
    speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
    duoCasting: {
      partnerId: "shaper-noir-duke",
      side: "right",
      distanceKey: "talk",
      stance: "attentive",
      expression: "cold-smirk",
      partnerHandPropId: "imperial-scroll",
    },
  },
  {
    id: "director-noir-interrogation",
    labelKo: "느와르 취조실 (안경·서류철·펜던트 조명)",
    summaryKo: "메탈 라운드 안경 + 수사 서류철 + 취조실 스틸 책상·펜던트 램프 + 하드 셀 3단 + 스릴러 반전 4컷 연기",
    handPropId: "case-folder",
    handSide: "leftHand",
    headPropId: "wire-glasses",
    stagePropId: "noir-interrogation-lamp",
    sfxStampId: "pat",
    toonShaderId: "action-hard-cel3",
    actingArc: "arc-thriller-shock",
    fxLinesKind: "focus-radial",
    dialogueLines: [
      "사건 기록 14페이지, 비어 있던 시간 말인데.",
      "어젯밤 11시, 그 현장에 당신도 있었지?",
      "설마 진짜 배후가 내부에 있었다고?",
      "증거는 충분해. 여기서 끝내자.",
    ],
    bubbleShapes: ["monologue-box", "oval", "shout-burst", "whisper-dashed"],
    bubbleFontScales: ["md", "md", "lg", "sm"],
    sfxStamps: ["none", "pat", "kugugung", "none"],
    speakerTargets: ["protagonist", "protagonist", "partner", "protagonist"],
    duoCasting: {
      partnerId: "shaper-thriller-detective",
      side: "right",
      distanceKey: "talk",
      stance: "arms-crossed",
      expression: "stern-glare",
      partnerHandPropId: "case-folder",
    },
  },
  {
    id: "director-campus-cafe",
    labelKo: "캠퍼스 카페 (진주 귀걸이·커피컵·비스트로)",
    summaryKo: "진주 귀걸이·골드 핀 + 로스터리 커피컵 + 카페 비스트로 테이블 + 순정 소프트 SDF + 로맨스 설렘 4컷 연기",
    handPropId: "coffee-cup",
    handSide: "rightHand",
    headPropId: "pearl-earrings-pin",
    stagePropId: "cafe-bistro-table",
    sfxStampId: "dugeun",
    toonShaderId: "romance-soft-sdf",
    actingArc: "arc-romance-flutter",
    fxLinesKind: "romance-sparkle",
    dialogueLines: [
      "혹시 아까부터 여기 앉아 있었어?",
      "네가 좋아하는 로스터리 원두로 골라 봤어.",
      "왜 자꾸 그렇게 가까이서 쳐다봐…",
      "오늘 오후는 천천히 같이 걷자.",
    ],
    bubbleShapes: ["oval", "oval", "whisper-dashed", "oval"],
    bubbleFontScales: ["md", "md", "sm", "md"],
    sfxStamps: ["none", "dugeun", "dugeun", "none"],
    speakerTargets: ["partner", "protagonist", "protagonist", "partner"],
    duoCasting: {
      partnerId: "shaper-office-ceo",
      side: "right",
      distanceKey: "close",
      stance: "conversational",
      expression: "warm-smile",
      partnerHandPropId: "coffee-cup",
    },
  },
  {
    id: "director-murim-awakening",
    labelKo: "무협·헌터 각성 (전술 헤드셋·단검·검기 진법)",
    summaryKo: "전술 홀로그램 헤드셋 + 에테르 단검 + 무협 청운 검기 진법 + 하드 셀 3단 + 각성·결의 4컷 연기",
    handPropId: "aether-blade",
    handSide: "rightHand",
    headPropId: "tactical-headset",
    stagePropId: "murim-sword-aura",
    sfxStampId: "kugugung",
    toonShaderId: "action-hard-cel3",
    actingArc: "arc-awakening-climax",
    fxLinesKind: "speed-diagonal",
    dialogueLines: [
      "봉인된 청운의 검기가 다시 깨어난다.",
      "물러서라, 지금부터는 진검승부다.",
      "보인다, 모든 검로의 빈틈이.",
      "단 일검으로 승부를 매듭짓겠다.",
    ],
    bubbleShapes: ["monologue-box", "oval", "shout-burst", "shout-burst"],
    bubbleFontScales: ["md", "md", "lg", "lg"],
    sfxStamps: ["seureung", "none", "kugugung", "seureung"],
    speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
    duoCasting: {
      partnerId: "shaper-murim-swordmaster",
      side: "right",
      distanceKey: "wide",
      stance: "arms-crossed",
      expression: "stern-glare",
      partnerHandPropId: "jade-folding-fan",
    },
  },
]);

export function findWebtoonSceneDirectorPreset(id: string): WebtoonSceneDirectorPreset | null {
  return WEBTOON_SCENE_DIRECTOR_PRESETS.find((item) => item.id === id) ?? null;
}

export function resolveDirectorShadingProfile(current: ShadingProfile, toonShaderId: ShaperToonShaderId): ShadingProfile {
  const matched = SHAPER_TOON_SHADER_PRESETS.find((item) => item.id === toonShaderId) ?? SHAPER_TOON_SHADER_PRESETS[0]!;
  return buildShaperToonShadingProfile(current, matched);
}

// ---------------------------------------------------------------- 뷰포트 ↔ 내보내기 패널 실시간 스트립 디렉터 세션

export interface StripDirectorState {
  readonly activeDirectorId: WebtoonSceneDirectorPresetId | "";
  readonly actingArc: WebtoonStripActingArcId;
  readonly bakeStripFx: boolean;
  readonly stripFxLines: WebtoonStripFxLinesKind;
  readonly dialogueLines: WebtoonStripDialogueLines;
  readonly bubbleShapes: WebtoonStripBubbleShapes;
  readonly bubbleFontScales: WebtoonStripBubbleFontScales;
  readonly sfxStamps: WebtoonStripSfxStamps;
  readonly speakerTargets: WebtoonStripSpeakerTargets;
  readonly partnerSide: DuoPartnerSide;
  readonly includePsdMangaFx: boolean;
}

export interface StripDirectorSession {
  getState(): StripDirectorState;
  update(patch: Partial<StripDirectorState>): void;
  setDialogueLine(cutIndex: 0 | 1 | 2 | 3, text: string): void;
  setBubbleShape(cutIndex: 0 | 1 | 2 | 3, shape: WebtoonStripBubbleShape): void;
  setBubbleFontScale(cutIndex: 0 | 1 | 2 | 3, scale: WebtoonStripBubbleFontScale): void;
  setSfxStamp(cutIndex: 0 | 1 | 2 | 3, stamp: WebtoonSfxStampOption): void;
  setSpeakerTarget(cutIndex: 0 | 1 | 2 | 3, target: WebtoonStripSpeakerTarget): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export const INITIAL_STRIP_DIRECTOR_STATE: StripDirectorState = Object.freeze({
  activeDirectorId: "",
  actingArc: "none",
  bakeStripFx: false,
  stripFxLines: "focus-radial",
  dialogueLines: DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  bubbleShapes: DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  bubbleFontScales: DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  sfxStamps: DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  speakerTargets: DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
  partnerSide: "right",
  includePsdMangaFx: false,
});

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
            : "손 소품·머리 액세서리·배경 스테이지·툰 조명·4컷 연기 시퀀스·말풍선 모양/강조·효과음 스탬프를 한 번에 세팅합니다"
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
