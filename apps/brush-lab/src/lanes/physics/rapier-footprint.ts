/**
 * Rapier 2D(compat) 청크 크기·초기화 시간 수치의 **단일 출처**(2026-10-08 재측정).
 * UI 안내문(그리기 화면·실험 배지)·레인 디스크립터·로더 주석·README가 같은 값을 쓰도록 여기서만 정의한다
 * (`rapier-footprint.test.ts`가 문서·소스에 옛 수치가 남지 않았고 설치본 크기와 어긋나지 않는지 검사한다).
 *
 * 측정 방법(Node 22.22, 이 저장소의 `@dimforge/rapier2d-compat@0.21.0`):
 * - 청크 크기: `pnpm build:brush-lab`이 만든 `rapier-*.js`(wasm 2,404,467 B를 base64로 JS에 내장)의 원본 바이트.
 * - gzip: 같은 청크에 `gzip -9`를 직접 적용한 바이트(설치본 `dist/rapier.mjs`는 1,288,513 B). Vite 빌드 로그의 gzip 수치(1,301.59 kB)는
 *   Vite가 쓰는 압축 설정 때문에 이보다 약간 크다 — 전송 크기는 서버의 압축 설정(gzip/brotli)에 따라 달라진다.
 * - 첫 로드: 모듈 동적 import(약 30 ms) + `RAPIER.init()`(약 120~157 ms)의 합. 5회 측정 150.4~189.8 ms. 브라우저·다른 기기 값이 아니다.
 */

/** 번들 청크 원본 크기(바이트). */
export const RAPIER_CHUNK_BYTES = 3_405_436;
/** 같은 청크의 `gzip -9` 크기(바이트). */
export const RAPIER_GZIP_BYTES = 1_288_163;
/** gzip 크기(MB, 1 MB = 1,000,000 B, 소수 둘째 자리). */
export const RAPIER_GZIP_MB = Math.round(RAPIER_GZIP_BYTES / 10_000) / 100;
/** 첫 로드(동적 import + `RAPIER.init`) 시간 범위(ms, Node 22 5회 측정). */
export const RAPIER_FIRST_LOAD_MS_RANGE = [150, 190] as const;

/** 사용자에게 보이는 크기 문구: 예) "약 1.29 MB". */
export const RAPIER_GZIP_LABEL_KO = `약 ${RAPIER_GZIP_MB.toFixed(2)} MB`;
/** 사용자에게 보이는 첫 로드 시간 문구: 예) "약 150~190 ms". */
export const RAPIER_FIRST_LOAD_LABEL_KO = `약 ${RAPIER_FIRST_LOAD_MS_RANGE[0]}~${RAPIER_FIRST_LOAD_MS_RANGE[1]} ms`;
/** 크기·시간을 함께 쓰는 한 줄 문구(측정 조건 포함). */
export const RAPIER_FOOTPRINT_KO = `JS gzip ${RAPIER_GZIP_LABEL_KO}, 첫 로드 ${RAPIER_FIRST_LOAD_LABEL_KO}는 Node 22 값`;
