# 구매 번들 로컬 빌드 검증 — 2026-10-29

상태: **current — 통합 소스의 로컬 검증 완료**. 검증 소스는 `ca9c84521e42a6aa4308b3565b9f1bd8fb2f668a`이며 main `7177969d4497237c8daee031b49da3148b0f409a`·타입 수정·4팩 790개 장르 연결을 포함한다. 운영 배포와 승인된 main SHA의 릴리스 산출물 검증은 별도 단계다. [기계 판독 기록](./build-review.json)의 `latestIntegratedValidation`에 이번 종료 코드와 범위를 기록했다.

`pnpm harness:verify`가 종료 코드 0으로 끝났다. 변경 548파일 기준 lint·Secretlint·아키텍처·문서·소스 크기·Studio 진입 그래프, Web 전체 타입 검사와 API 세 프로젝트 타입 검사가 통과했다. 장르 연결·안내 문구 정리 후 `pnpm test:creator-bundle-rights`도 Node 169개·Vitest 12파일 209개가 통과했다. 별도 장르·씬 구성 회귀 2파일 10개는 중복 합산하지 않는다.

`VITE_CATALOG_SOURCE=static pnpm run build:bundle`은 14,662개 모듈을 변환하고 종료 코드 0으로 production manifest를 생성했다. postbuild의 제3자 고지 598 pnpm 항목/444 라이선스 원문 생성과 CSP 1개 inline data hash 검증이 통과했다. 빌드 전후 HEAD가 같고 생성기가 추적 소스를 변경하지 않았다. Studio 구조 검사는 417청크, raw 8,348.8KiB/gzip 2,715.6KiB로 통과했으며 제품 투어 Remotion 청크 검사도 통과했다. 이전에 기록된 런타임 시작 시간과 public CWV는 이번에 측정하지 않았다.

[정적 산출물 대조](./static-artifact-review.json)는 소품 357파일/80,948,537바이트, 완성 배경 7파일/4,440,353바이트, 가상 장식 4파일/800,020바이트의 public/dist SHA를 전수 대조해 모두 같은 바이트임을 확인했다. 이번 dist는 19,370파일이며 현재 R2 media descriptor와 oversized ignore 정책 적용 후 Static Assets 파일 수 상한은 12,030/20,000이다. Wrangler의 기본 숨김 파일 제외 전 상한이며 원격 quota·객체 존재·사용량을 확인한 값은 아니다. manifest SHA는 `3df2e5563f22b61c4b5dd1d950d9ffbc112fd689c34ddb566cfc6a7317fcdd83`다.

API build·runtime guard·문법 검사 성공은 `98179bd298ec6c1fe2c360759a8de9624305ffaf` 시점의 기록이다. 이후 API·공유 packages·package/lock·관련 빌드 설정과 스크립트의 차이가 없는 것을 확인했고, 현재 소스의 API 타입 검사도 통과했다. 로컬 API 빌드와 production 패키징은 macOS arm64이며 Linux 컨테이너는 검증하지 않았다. 기존 `@pixiv/three-vrm` nodes의 `tslFn` export 빌드 경고도 보존했으며 native GLB 검증을 VRM WebGPU 전체 검증으로 확장하지 않는다.

과거 main 통합 전 `98179...`의 Web 빌드와 19,329파일/Static Assets 상한 12,024개 기록은 JSON의 과거 항목에 남겼다. 그 시점의 전체 하네스는 타입 진단 4개로 exit 2였고, 도구 벨트 타입·프레임 fixture·Three/native WebGLProgram 계약을 맞춘 뒤 이번 전체 검사가 성공했다. 과거 실패를 성공으로 바꾸지 않았다.

이 로컬 dist를 운영 릴리스로 사용하지 않는다. 운영 전환은 정확한 main SHA·필수 CI·인증·승인·롤백 기록을 갖춘 별도 빌드와 API → Web 순서를 따른다. 업로드·배포·환경변수·DNS·플랜 변경은 실행하지 않았다.
