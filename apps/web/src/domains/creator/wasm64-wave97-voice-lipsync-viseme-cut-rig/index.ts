/**
 * Wasm64 Wave 97 공개 배럴 진입점 (`wasm64-wave97-voice-lipsync-viseme-cut-rig`).
 *
 * - `korean-phoneme-audio-viseme-aligner`: 한국어 유니코드 자모 분해·다국어 12종 비즘 변환,
 *   로컬 모노 PCM 운율(RMS·ZCR·자기상관 F0·VAD) 추출기, 결정론적 테스트 음성 합성기,
 *   음향 랜드마크 기반 단조 강제 정렬기 및 로컬 전용 프라이버시 계약
 * - `coarticulation-blendshape-rig-evaluator`: Cohen-Massaro 지배 함수 조음 결합 60fps 표정 리그 평가기,
 *   양순음(M_B_P) 입술 닫힘 지배 보장, 운율-표정 연동, 생리적 눈 깜박임 및 동작 줄이기 전정 안전 모드
 * - `lipsync-dopesheet-svg-and-audit`: 인쇄 안전 OKLCH 도프시트 SVG 렌더러, 출고 감사 리포트 및
 *   자연스러운 한국어 모션툰 연출 요약기
 */

export {
  COMIC_VISEME_ALPHABET,
  LOCAL_VOICE_PRIVACY_CONTRACT,
  alignDialogueToVoiceAudio,
  decomposeKoreanTextToVisemeSequence,
  extractVoiceAudioProsodyFrames,
  synthesizeDeterministicVoicePcmForScript,
  type ActiveSpeechSegment,
  type AlignedVisemeSpan,
  type ComicVisemeId,
  type ForcedAlignmentOptions,
  type ForcedVisemeAlignmentResult,
  type LocalVoicePrivacyContract,
  type ParsedVisemeToken,
  type SyntheticTokenGroundTruthSpan,
  type SyntheticVoicePcmOptions,
  type SynthesizedVoiceScriptPcm,
  type VisemeAcousticClass,
  type VisemeTokenRole,
  type VoiceAudioProsodyAnalysis,
  type VoiceProsodyFrame,
} from "./korean-phoneme-audio-viseme-aligner";

export {
  evaluateFacialRigTimelineAt60fps,
  type BilabialClosureAudit,
  type BilabialClosureCheck,
  type BlinkEvent,
  type FacialBlendshapePose,
  type FacialEmotionTag,
  type FacialRigEvaluationOptions,
  type FacialRigFrame,
  type FacialRigTimeline,
  type FacialRigTimelineMetrics,
} from "./coarticulation-blendshape-rig-evaluator";

export {
  auditLipsyncCutRig,
  renderLipsyncDopesheetSvg,
  summarizeLipsyncCutRigKo,
  type LipsyncCutRigAuditReport,
  type RenderLipsyncDopesheetSvgOptions,
} from "./lipsync-dopesheet-svg-and-audit";
