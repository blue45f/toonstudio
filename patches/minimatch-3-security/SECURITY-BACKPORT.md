# minimatch 보안 호환 백포트

원본 배포본과 해시는 UPSTREAM.json에 기록한다. 원본 LICENSE를 유지한다.

3.x에는 취약한 firstPhasePreProcess/secondPhasePreProcess 최적화가 존재하지 않는다. 기존 brace-expansion 5.0.12의 제한 및 callable CommonJS API를 유지한다. 수정판 11의 API 제거 때문에 구형 glob 7 및 jsx-a11y 소비자에 한해 이 코드를 유지한다.

소비자가 minimatch 11 API를 지원하면 해당 override와 이 폴더를 제거한다. 회귀 검증은 scripts/minimatch-security-compat.test.mjs이다. 로컬 패키지는 레지스트리 audit 범위 밖이므로 회귀 테스트와 원본 해시로 별도 검증한다.

Node 전용 소비 경로에 맞춰 path fallback을 node:path로 정리하고, 미사용 매개변수·catch binding·불필요한 escape·중복 var를 제거해 저장소 lint를 적용한다. 매칭 동작은 유지한다.
