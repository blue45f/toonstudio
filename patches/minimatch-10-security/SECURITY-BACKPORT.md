# minimatch 보안 호환 백포트

원본 배포본과 해시는 UPSTREAM.json에 기록한다. 원본 LICENSE를 유지한다.

공식 수정 커밋 77a0f5c의 두 제한을 ESM/CommonJS 양쪽에 백포트한다. 첫 번째 최적화의 증폭을 braceExpandMax로 제한하고 1000개를 넘는 패턴 집합의 쌍별 최적화를 건너뛴다. makeRe와 RegExp 패턴 계약을 유지한다.

소비자가 minimatch 11 API를 지원하면 해당 override와 이 폴더를 제거한다. 회귀 검증은 scripts/minimatch-security-compat.test.mjs이다. 로컬 패키지는 레지스트리 audit 범위 밖이므로 회귀 테스트와 원본 해시로 별도 검증한다.
