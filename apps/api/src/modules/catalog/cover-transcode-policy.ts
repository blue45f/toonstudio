// 서버 표지 픽셀 변환(cover-transcode.ts)을 쓸지 정하는 정책.
//
// 기본값은 "끔"이다. 이유 (2026-10-16 운영 사고 기록):
// 변환은 image-js(순수 JS)로 디코드→리사이즈→재인코딩을 메인 스레드에서 동기 실행한다.
// Render 무료 플랜(0.1 CPU)에서는 표지 한 장이 약 8초를 쓰며 그동안 이벤트 루프가 멈춘다.
// 목록 화면이 표지 십여 장을 한꺼번에 요청하자 /api/health/live 가 5초 제한을 넘겨
// 22분 동안 server_failed 가 3번 났고 인스턴스가 재시작을 반복했다(변환이 없던 이전 이미지는 8일 무사고).
// 그래서 CPU 여유가 확인된 실행 환경에서 소유자가 COVER_SERVER_TRANSCODE=on 으로 명시했을 때만 변환한다.
// 끄면 /api/cover 는 업스트림 바이트를 그대로 중계한다 — 폭 힌트(Width 헤더)와 엣지 캐시는 그대로 쓴다.

export const COVER_SERVER_TRANSCODE_ENV = "COVER_SERVER_TRANSCODE";

/** 환경변수를 호출 시점에 읽는다(테스트가 stubEnv 로 바꿀 수 있어야 한다). */
export function coverServerTranscodeEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (env[COVER_SERVER_TRANSCODE_ENV] ?? "").trim().toLowerCase() === "on";
}
