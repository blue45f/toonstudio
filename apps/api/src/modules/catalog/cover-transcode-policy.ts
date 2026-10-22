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

// 표지 바이트 최적화(cover-transcode.ts의 optimizeCoverBytes)를 쓸지 정하는 별도 정책.
//
// 위 변환(COVER_SERVER_TRANSCODE)은 "폭(w)이 지정됐고 업스트림이 더 큰 이미지를 준
// 경우"만 줄인다. 그런데 폭이 없는 요청이거나 원본 폭이 이미 목표 이하인 표지는
// 그 경로를 타지 못해, 예를 들어 320px인데 수백 KB인 불투명 PNG가 그대로 내려간다.
// 바이트 최적화는 그 남은 경우에 디코드→재인코딩만으로 바이트를 줄이는 경로다
// (불투명 PNG→JPEG q82, JPEG 재압축 — 원본보다 작아질 때만 채택).
//
// 별도 플래그로 분리한 이유: 이 경로는 폭 변환보다 적용 범위가 넓어(폭 없는 요청
// 포함) 디코드를 거는 요청 수가 늘고, CPU 비용의 성격은 위 변환과 같다(메인 스레드
// 동기 실행, 2026-10-16 사고와 같은 위험). 이미 변환을 켠 환경의 동작을 새 코드가
// 몰래 바꾸지 않도록, 기본값은 끔으로 두고 소유자가 별도로 명시했을 때만 켠다.
// 두 플래그가 모두 꺼져 있으면(기본) /api/cover 응답은 기존과 바이트·헤더·캐시
// 정책까지 완전히 동일하다.

export const COVER_SERVER_TRANSCODE_OPTIMIZE_ENV = "COVER_SERVER_TRANSCODE_OPTIMIZE";

/** 환경변수를 호출 시점에 읽는다(테스트가 stubEnv 로 바꿀 수 있어야 한다). */
export function coverTranscodeByteOptimizeEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (env[COVER_SERVER_TRANSCODE_OPTIMIZE_ENV] ?? "").trim().toLowerCase() === "on";
}
