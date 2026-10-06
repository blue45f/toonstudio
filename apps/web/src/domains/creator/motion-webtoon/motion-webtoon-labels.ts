/**
 * 모션 웹툰 한/영 라벨.
 */

export interface MotionWebtoonLabels {
  readonly titleKo: string;
  readonly titleEn: string;
}

function label(ko: string, en: string): MotionWebtoonLabels {
  return { titleKo: ko, titleEn: en };
}

export const MOTION_SCENE_MOOD_LABELS: Record<string, MotionWebtoonLabels> = {
  battle: label("전투", "Battle"),
  tension: label("긴장", "Tension"),
  romance: label("로맨스", "Romance"),
  daily: label("일상", "Daily"),
  sad: label("슬픔", "Sad"),
  mystery: label("미스터리", "Mystery"),
  comedy: label("코미디", "Comedy"),
  horror: label("호러", "Horror"),
};

export const CAMERA_MOVE_LABELS: Record<string, MotionWebtoonLabels> = {
  "zoom-in": label("줌인", "Zoom in"),
  "zoom-out": label("줌아웃", "Zoom out"),
  "pan-left": label("왼쪽 패닝", "Pan left"),
  "pan-right": label("오른쪽 패닝", "Pan right"),
  "pan-up": label("위쪽 패닝", "Pan up"),
  "pan-down": label("아래쪽 패닝", "Pan down"),
  shake: label("흔들림", "Shake"),
  static: label("고정", "Static"),
};

export const CUT_TRANSITION_LABELS: Record<string, MotionWebtoonLabels> = {
  cut: label("컷", "Cut"),
  fade: label("페이드", "Fade"),
  "wipe-left": label("와이프 ←", "Wipe left"),
  "wipe-right": label("와이프 →", "Wipe right"),
  blur: label("블러", "Blur"),
  flash: label("플래시", "Flash"),
};

export const DETECTED_EMOTION_LABELS: Record<string, MotionWebtoonLabels> = {
  anger: label("분노", "Anger"),
  sorrow: label("슬픔", "Sorrow"),
  joy: label("기쁨", "Joy"),
  tension: label("긴장", "Tension"),
  romance: label("설렘", "Romance"),
  fear: label("공포", "Fear"),
  surprise: label("놀람", "Surprise"),
  neutral: label("중립", "Neutral"),
};

export const MOTION_WEBTOON_UI_LABELS = {
  playerTitle: label("모션 웹툰 플레이어", "Motion webtoon player"),
  play: label("재생", "Play"),
  pause: label("일시정지", "Pause"),
  stop: label("정지", "Stop"),
  prevCut: label("이전 컷", "Previous cut"),
  nextCut: label("다음 컷", "Next cut"),
  bgmOn: label("BGM 켜기", "Turn BGM on"),
  bgmOff: label("BGM 끄기", "Turn BGM off"),
  voiceOn: label("음성 켜기", "Turn voice on"),
  voiceOff: label("음성 끄기", "Turn voice off"),
  editorTitle: label("모션 웹툰 에디터", "Motion webtoon editor"),
  aiDirect: label("AI 자동 연출", "AI auto-direct"),
  aiDirectDone: label("AI가 연출·BGM·음성을 입혔습니다. 각 항목을 확인하고 수정하세요.", "AI applied direction, BGM, and voice. Review and tweak each item."),
  addCut: label("컷 추가", "Add cut"),
  removeCut: label("컷 삭제", "Delete cut"),
  addDialogue: label("대사 추가", "Add dialogue"),
  addCharacter: label("캐릭터 추가", "Add character"),
  timelineTitle: label("타임라인", "Timeline"),
  previewTitle: label("미리보기", "Preview"),
  cutLabel: label("컷", "Cut"),
  directionLabel: label("연출", "Direction"),
  bgmLabel: label("BGM", "BGM"),
  dialogueLabel: label("대사", "Dialogue"),
  characterLabel: label("캐릭터", "Character"),
  durationLabel: label("재생 길이(초)", "Duration (sec)"),
  intensityLabel: label("연출 강도", "Direction intensity"),
  transitionLabel: label("전환 효과", "Transition"),
  imageUrlLabel: label("컷 이미지 URL", "Cut image URL"),
  voicePresetLabel: label("음성 프리셋", "Voice preset"),
  shareLabel: label("공유 링크 복사", "Copy share link"),
  shareCopied: label("공유 링크가 복사되었습니다.", "Share link copied."),
  emptyEpisode: label("컷을 추가해 모션 웹툰을 만들어 보세요.", "Add cuts to create your motion webtoon."),
  endedMessage: label("끝까지 감상해 주셔서 감사합니다.", "Thanks for watching to the end."),
  // 히어로
  heroBadge: label("MOTION WEBTOON", "MOTION WEBTOON"),
  heroTitle: label("컷이, 영상이 되는 순간", "The moment cuts become cinema"),
  heroSubtitle: label(
    "컷 이미지를 올리면 AI가 카메라·BGM·대사 음성을 입혀줍니다. 한 번의 클릭으로 완성하세요.",
    "Upload your cuts and AI adds camera work, BGM, and dialogue voices. Finish it in one click.",
  ),
  heroCta: label("✨ AI 자동 연출로 완성하기", "✨ Finish with AI auto-direction"),
  heroCtaHint: label(
    "컷이 없어도 괜찮아요 — 샘플 컷으로 바로 시작합니다.",
    "No cuts yet? We'll start you with sample cuts.",
  ),
  heroSecondary: label("샘플 컷으로 맛보기", "Try with sample cuts"),
  // 3단계 안내
  step1Title: label("컷 올리기", "Upload cuts"),
  step1Desc: label("웹툰 컷 이미지 URL을 순서대로 등록하세요.", "Register your webtoon cut image URLs in order."),
  step2Title: label("AI 자동 연출", "AI auto-direction"),
  step2Desc: label("대사 감정을 읽어 BGM·카메라·음성을 한 번에 입힙니다.", "AI reads dialogue emotion and adds BGM, camera, and voices at once."),
  step3Title: label("미리보기·공유", "Preview & share"),
  step3Desc: label("바로 재생해 보고 링크로 공유하세요.", "Play it right away and share the link."),
  // 빈 상태 · 다음 행동
  emptyEpisodeTitle: label("아직 컷이 없어요", "No cuts yet"),
  emptyEpisodeAction: label("첫 컷 추가하기", "Add your first cut"),
  emptyEpisodeAlt: label("또는 위의 ✨ AI 자동 연출 버튼을 눌러 샘플로 시작하세요.", "Or press the ✨ AI auto-direct button above to start with samples."),
  emptyDialogueTitle: label("대사가 없어요", "No dialogue yet"),
  emptyDialogueAction: label("첫 대사 추가하기", "Add the first line"),
  noCharacterHint: label("캐릭터를 먼저 등록하면 대사에 음성이 입혀집니다.", "Register a character first to give dialogue a voice."),
  addCharacterFirst: label("캐릭터 등록하기", "Register a character"),
  // 고급 설정 접기
  advancedSettings: label("고급 설정", "Advanced settings"),
  cameraSection: label("카메라 연출", "Camera direction"),
  // 검증 배너
  issuesFound: label("고칠 점이 있어요", "Things to fix"),
  jumpToCut: label("컷으로 이동", "Go to cut"),
  // 플레이어 스플래시
  splashPlay: label("▶ 지금 재생하기", "▶ Play now"),
  splashMeta: label("컷 {cuts}개 · {seconds}초", "{cuts} cuts · {seconds}s"),
  replay: label("↺ 다시 보기", "↺ Replay"),
  // 타임라인
  totalDuration: label("총 재생 시간", "Total duration"),
  secondsUnit: label("초", "s"),
  // 공유 안내
  shareNote: label(
    "링크를 열면 이 브라우저에 저장된 회차가 열립니다.",
    "Opening the link restores the saved episode in this browser.",
  ),
  // 페이지 (공유 링크 복원)
  pageRestoredNotice: label(
    "공유 링크의 회차를 불러왔습니다. 이어서 편집하거나 바로 재생해 보세요.",
    "Loaded the episode from the share link. Continue editing or play it right away.",
  ),
  pageShareNotFound: label(
    "링크의 회차를 이 브라우저에서 찾을 수 없어요. 저장된 마지막 회차를 엽니다.",
    "Couldn't find the linked episode in this browser. Opening your last saved episode instead.",
  ),
  pageResumeNotice: label(
    "마지막으로 작업하던 회차를 이어서 엽니다.",
    "Resuming your last edited episode.",
  ),
} as const;

export type MotionWebtoonUiLabelKey = keyof typeof MOTION_WEBTOON_UI_LABELS;

/** 자막 패널 라벨. */
export const CAPTION_UI_LABELS = {  captionTitle: label("자막", "Captions"),
  captionDesc: label(
    "대사와 컷 타이밍으로 자막을 자동 생성합니다. 자막 문구를 고치면 대사가 함께 바뀝니다.",
    "Captions are generated from dialogue and cut timing. Editing a caption updates the dialogue too.",
  ),
  captionEmpty: label(
    "대사가 있는 컷이 없어 자막을 만들 수 없습니다.",
    "No cut has dialogue yet, so there are no captions to build.",
  ),
  captionSkipped: label(
    "컷 길이를 벗어나거나 비어 있어 자막에서 빠진 대사가 {count}개 있습니다.",
    "{count} line(s) fall outside their cut or are empty and were left out of the captions.",
  ),
  captionTextLabel: label("자막 문구", "Caption text"),
  captionPosition: label("자막 위치", "Caption position"),
  captionSize: label("자막 크기", "Caption size"),
  positionBottom: label("아래", "Bottom"),
  positionTop: label("위", "Top"),
  sizeSmall: label("작게", "Small"),
  sizeMedium: label("보통", "Medium"),
  sizeLarge: label("크게", "Large"),
  captionPreview: label("자막 미리보기", "Caption preview"),
  downloadSrt: label("SRT 내려받기", "Download SRT"),
  downloadVtt: label("VTT 내려받기", "Download VTT"),
  transcriptionTitle: label("오디오에서 자막 만들기", "Create captions from audio"),
  transcriptionDesc: label(
    "녹음한 나레이션·대사 오디오를 Groq Whisper로 전사해, 시간에 맞는 대사로 넣습니다. 통합 AI 설정에 등록한 본인 Groq 키로 브라우저에서 직접 호출합니다.",
    "Transcribe a recorded narration or dialogue audio file with Groq Whisper and add the lines at their timestamps. It calls Groq directly from your browser with the Groq key you registered in the unified AI settings.",
  ),
  transcriptionNeedKey: label(
    "통합 AI 설정에 등록된 Groq 키가 없어 전사를 사용할 수 없어요.",
    "No Groq key is registered in the unified AI settings, so transcription is unavailable.",
  ),
  transcriptionSettingsCta: label("AI 설정에서 Groq 키 등록하기", "Register a Groq key in AI settings"),
  transcriptionFileLabel: label("오디오 파일", "Audio file"),
  transcriptionSpeakerLabel: label("전사 대사를 맡을 캐릭터", "Character for the transcribed lines"),
  transcriptionNoCharacters: label(
    "캐릭터가 없어 전사 대사를 넣을 수 없어요. 먼저 에디터에서 캐릭터를 추가하세요.",
    "There are no characters yet, so transcribed lines cannot be added. Add a character in the editor first.",
  ),
  transcriptionRun: label("전사해 자막 만들기", "Transcribe into captions"),
  transcriptionRunning: label("전사 중…", "Transcribing…"),
  transcriptionApplied: label(
    "전사한 대사 {count}개를 자막에 넣었어요.",
    "Added {count} transcribed line(s) as captions.",
  ),
  transcriptionSkippedPart: label(
    "회차 길이를 벗어난 구간 {count}개는 넣지 않았어요.",
    "{count} segment(s) fell outside the episode length and were not added.",
  ),
  transcriptionEmpty: label(
    "인식된 대사가 없어요. 다른 오디오로 다시 시도해 보세요.",
    "No speech was recognized. Try another audio file.",
  ),
  transcriptionErrorAuth: label(
    "Groq 키 인증에 실패했어요. AI 설정에서 키를 확인한 뒤 다시 시도하세요.",
    "The Groq key was rejected. Check the key in AI settings and try again.",
  ),
  transcriptionErrorQuota: label(
    "Groq 사용량 한도에 닿았어요. 잠시 뒤 다시 시도하세요.",
    "The Groq usage limit was reached. Try again later.",
  ),
  transcriptionErrorFormat: label(
    "지원하지 않는 오디오 형식이에요. (flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm)",
    "This audio format is not supported. (flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm)",
  ),
  transcriptionErrorTooLarge: label(
    "오디오는 25MB 이하만 전사할 수 있어요.",
    "Only audio files up to 25MB can be transcribed.",
  ),
  transcriptionErrorEmptyFile: label(
    "오디오 파일이 비어 있어요.",
    "The audio file is empty.",
  ),
  transcriptionErrorNetwork: label(
    "Groq에 연결하지 못했어요. 네트워크 상태를 확인하고 다시 시도하세요.",
    "Could not reach Groq. Check your network and try again.",
  ),
  transcriptionErrorGeneric: label(
    "전사에 실패했어요. 다시 시도하세요.",
    "Transcription failed. Please try again.",
  ),
} as const;

/** 애니툰 원클릭 변환 라벨. */
export const ANIME_TOON_UI_LABELS = {
  entryCta: label("🎬 웹툰을 애니툰으로 만들기", "🎬 Turn a webtoon into an AnimeToon"),
  wizardTitle: label("웹툰을 애니툰으로 만들기", "Turn a webtoon into an AnimeToon"),
  wizardDesc: label(
    "이 브라우저에 저장된 회차를 고르면, AI 자동 연출이 카메라·BGM·음성·자막을 입힌 애니툰 초안을 만들어 드립니다. 원본 회차는 그대로 남습니다.",
    "Pick an episode saved in this browser and AI auto-direction drafts an AnimeToon with camera work, BGM, voices, and captions. Your original episode stays untouched.",
  ),
  directorNote: label(
    "자동 생성은 규칙 기반 연출입니다 — 대사 감정을 읽어 카메라·BGM·음성 프리셋·자막을 채웁니다. 영상 파일을 렌더링하거나 음성 파일을 합성하지는 않습니다.",
    "Auto-generation is rule-based direction — it reads dialogue emotion to fill in camera work, BGM, voice presets, and captions. It does not render a video file or synthesize voice audio.",
  ),
  stepSelect: label("작품 선택", "Choose a work"),
  stepPreview: label("컷 미리보기", "Preview cuts"),
  stepResult: label("애니툰 결과", "AnimeToon result"),
  emptyLibrary: label(
    "아직 저장된 회차가 없어요. 먼저 아래 에디터에서 컷을 등록해 회차를 만들면, 여기서 애니툰으로 변환할 수 있습니다.",
    "No saved episodes yet. Create an episode with cuts in the editor below first, then convert it into an AnimeToon here.",
  ),
  selectThis: label("이 회차로 변환", "Convert this episode"),
  cutMeta: label("컷 {cuts}개 · 대사 {lines}개", "{cuts} cuts · {lines} lines"),
  generateCta: label("✨ 애니툰 자동 생성", "✨ Generate AnimeToon"),
  noCutsFailure: label(
    "선택한 회차에 컷이 없어 변환할 수 없습니다. 컷이 있는 회차를 골라 주세요.",
    "The selected episode has no cuts, so it can't be converted. Please pick an episode with cuts.",
  ),
  saveFailed: label(
    "초안을 이 브라우저에 저장하지 못했습니다. 저장 공간이나 비공개 모드 설정을 확인해 주세요.",
    "Couldn't save the draft in this browser. Check storage space or private-mode settings.",
  ),
  draftTitleLabel: label("애니툰 제목", "AnimeToon title"),
  openInEditor: label("편집기에서 다듬기", "Open in editor"),
  back: label("뒤로", "Back"),
  close: label("닫기", "Close"),
  summaryCuts: label("컷 {count}개 · 총 {seconds}초", "{count} cuts · {seconds}s total"),
  summaryCaptions: label(
    "대사가 있는 컷에서 자막 {count}개가 자동 생성됐습니다.",
    "{count} captions were generated from cuts with dialogue.",
  ),
  summaryNoCaptions: label(
    "대사가 없어 자막은 생성되지 않았습니다. 편집기에서 대사를 넣으면 자막 패널에서 바로 만들 수 있습니다.",
    "There was no dialogue, so no captions were generated. Add dialogue in the editor and captions follow from the caption panel.",
  ),
  summarySkipped: label(
    "컷 길이를 벗어나거나 비어 있어 자막에서 빠진 대사가 {count}개 있습니다.",
    "{count} line(s) fall outside their cut or are empty and were left out of the captions.",
  ),
  summaryVoice: label(
    "캐릭터 {count}명의 음성 프리셋을 대표 감정에 맞게 바꿨습니다.",
    "Voice presets for {count} character(s) were matched to their dominant emotion.",
  ),
  manualNote: label(
    "전환 효과·컷별 세부 연출·자막 문구 다듬기는 편집기에서 직접 하는 단계입니다.",
    "Transitions, per-cut fine-tuning, and caption wording are manual steps in the editor.",
  ),
} as const;
