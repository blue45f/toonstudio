import type { StudioAmbientSynthKind } from "./studio-virtual-space-ambient-synth";

/**
 * 환경음 트랙 목록. 두 종류가 있다.
 * - recording: 원본 필드 녹음(아래 출처·라이선스). 무결성 검증 후 재생한다.
 * - synth: 음원 파일 없이 기기에서 절차 생성하는 합성 앰비언스
 *   (studio-virtual-space-ambient-synth). 라이선스·전송 비용이 없다.
 */
export const STUDIO_AMBIENT_TRACKS = [
  { id: "gentle-rain", kind: "recording", labelKo: "잔잔한 빗소리", labelEn: "Gentle rain", duration: 45,
    src: "/assets/virtual-studio/ambient-audio/gentle-window-rain.ogg", bytes: 913769,
    sha256: "73a0f5ef19ed9f64599c0425b1fb52d857acfc42c0fd5eab85c4577ace18f0ed" },
  { id: "window-rain", kind: "recording", labelKo: "창가 빗소리", labelEn: "Window rain", duration: 27,
    src: "/assets/virtual-studio/ambient-audio/window-rain.ogg", bytes: 550049,
    sha256: "4f659f68cf5219007d0bb0969a1862491ceee4057fda4c491c6001e8608fa2cb" },
  { id: "synth-wind", kind: "synth", labelKo: "바람 소리", labelEn: "Wind (synthesized)", duration: 8, synth: "wind" },
  { id: "synth-room", kind: "synth", labelKo: "실내 공기감", labelEn: "Room tone (synthesized)", duration: 8, synth: "room" },
  { id: "synth-ocean", kind: "synth", labelKo: "노을 하버 파도 소리", labelEn: "Harbor waves (synthesized)", duration: 10, synth: "ocean" },
  { id: "synth-hearth", kind: "synth", labelKo: "코지 원목 벽난로 온기", labelEn: "Cozy hearth warmth (synthesized)", duration: 8, synth: "hearth" },
  { id: "synth-focus-stream", kind: "synth", labelKo: "딥워크 시냇물·브라운 노이즈", labelEn: "Deep-work stream (synthesized)", duration: 8, synth: "focus-stream" },
  { id: "synth-atelier-breeze", kind: "synth", labelKo: "가든 테라스 산들바람", labelEn: "Garden terrace breeze (synthesized)", duration: 8, synth: "atelier-breeze" },
] as const;
export type StudioAmbientTrack = typeof STUDIO_AMBIENT_TRACKS[number];
export type StudioAmbientTrackId = StudioAmbientTrack["id"];
export type StudioAmbientRecordingTrack = Extract<StudioAmbientTrack, { kind: "recording" }>;
export type StudioAmbientSynthTrack = Extract<StudioAmbientTrack, { kind: "synth"; synth: StudioAmbientSynthKind }>;
export const STUDIO_AMBIENT_SOURCE = "https://opengameart.org/content/rain-loopable";
export const STUDIO_AMBIENT_LICENSE = "https://creativecommons.org/publicdomain/zero/1.0/";
