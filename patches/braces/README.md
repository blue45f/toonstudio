# braces 보안 포크 (ToonStudio)

이 디렉터리는 [micromatch/braces](https://github.com/micromatch/braces)의 저장소 내 포크다.
`pnpm-workspace.yaml`의 `overrides`가 취약 범위 `braces@>=3.0.0 <3.0.4`를 `file:patches/braces`로
대체한다. 현재 의존 경로는 개발 도구뿐이다:
`@heejun/eslint-config > eslint-plugin-boundaries (> @boundaries/elements) > micromatch@4.0.8 > braces`.

## 포크한 이유 (2026-10-08 기준)

- GHSA-vfj7-8cjw-p6xm / CVE-2026-93687(high, 2026-09-18 공개): braces `<=3.0.3`은 입력 문자 수
  (`MAX_LENGTH` 10,000)만 제한하고 중첩 깊이는 제한하지 않는다. 문자 수 상한 아래의 깊은 중첩
  패턴이 재귀 AST 워커(`lib/compile.js`, `lib/expand.js`, `lib/stringify.js`)의 호출 스택을 소진해
  `RangeError: Maximum call stack size exceeded`로 프로세스를 종료시킨다.
- 업스트림 수정 릴리스가 없다(권고의 `first_patched_version: null`, npm 최신 `3.0.3`). 관련 PR
  #72, #75, #77, #78, #79, #81, #82, #83은 모두 병합되지 않았고, 관리자는 issue #70에서
  `maxLength`로 충분하다는 입장이다.
- `eslint-plugin-boundaries` 7.2.0과 `@boundaries/elements` 3.1.1까지 모두 `micromatch@4.0.8`을
  고정하고, micromatch 최신(4.0.8)도 `braces@^3.0.3`에 의존하므로 의존성 갱신으로는 제거할 수 없다.
- 저장소 정책상 감사 예외(`auditConfig.ignore*`)를 쓰지 않는다.

## 기준과 변경 사항

- 기준: npm `braces@3.0.3` + 업스트림 master `e53730e6f9`(2025-01-19)의 미배포 수정.
  런타임 파일(`index.js`, `lib/*.js`)은 기존 `patches/braces@3.0.3.patch`를 적용한 결과와 같다.
  - unpaired quote 처리(upstream PR #49), 범위 연산자를 담은 집합 처리(issue #56).
- 추가한 깊이 가드(`ToonStudio 보안 포크` 주석으로 표시):
  - `lib/constants.js`: `MAX_DEPTH = 100`(중괄호·괄호 컨테이너 중첩 깊이).
  - `lib/utils.js`: `assertDepth()`가 상한 초과 시 `SyntaxError`를 던진다. 기존 `MAX_LENGTH`
    검증과 같은 오류 계약이다.
  - `lib/parse.js`: 새 `{`·`(` 컨테이너를 열기 전에 깊이를 검사한다. 닫히지 않은 컨테이너도
    101개 이상 동시에 열리면 거부한다.
  - `compile`·`expand`·`stringify` 워커: 호출자가 파서를 거치지 않고 넘긴 AST도 재귀 전에
    같은 상한으로 거부한다.
- 깊이 100 이하 입력의 결과는 기준과 같다. 업스트림 테스트 894건이 기준·포크 모두 통과했고,
  무작위·경계 패턴 차등 비교 약 100만 건에서 차이가 없었다.

## 검증

- `scripts/braces-security-compat.test.mjs`: lockfile 경로, 설치본과 이 디렉터리의 동일성,
  권고 PoC 거부, 경계 깊이(100 허용·101 거부), 직접 AST 입력, 기존 패치 동작, ESLint 경계 패턴.
- 포크는 레지스트리 패키지가 아니므로 `pnpm audit` 대상에서 빠진다. 앞으로 나올 braces 권고도
  자동 감지되지 않으니 업스트림 권고와 릴리스를 직접 확인해야 한다.

## 수정과 제거

- 이 디렉터리를 고친 뒤에는 `pnpm install`로 `node_modules` 사본을 다시 연결한다.
  동일성 테스트가 낡은 사본을 잡아낸다.
- 업스트림이 수정 릴리스(예: `3.0.4`)를 내고 권고의 `first_patched_version`이 채워지면
  `pnpm-workspace.yaml`의 braces override와 이 디렉터리, 위 테스트를 함께 지우고
  레지스트리 버전으로 되돌린다.

라이선스: MIT, Copyright (c) 2014-present Jon Schlinkert. 원문은 같은 디렉터리의 `LICENSE`.
