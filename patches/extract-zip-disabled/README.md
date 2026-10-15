# extract-zip 보안 대체본 (비활성화)

## 왜 필요한가

`extract-zip` 2.0.1 이하는 압축 파일 안의 심볼릭 링크 항목을 검증하지 않아 대상 폴더 밖에 파일을 쓸 수 있다
(GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3). 2026-10-15 기준 레지스트리에 수정 릴리스가 없다(최신 2.0.1).
저장소 정책(`scripts/verify-security-advisory-exceptions.mjs`)은 예외 등록을 허용하지 않고 `pnpm audit` 가
개발 의존성까지 모두 통과해야 하므로, 취약 코드를 트리에서 없앤다.

## 어떻게 쓰이는가

유일한 소비자는 `@lhci/cli > lighthouse > puppeteer-core > @puppeteer/browsers@2.x` 의 **브라우저 내려받기·설치 경로**다.
Lighthouse CI 는 러너에 이미 설치된 Chrome 을 쓰므로 이 경로를 호출하지 않는다. 대체본은 호출되면 이유를
알려 주는 오류로 거부한다(조용히 성공하지 않는다).

## 제거 조건

업스트림이 수정 릴리스(>=2.0.2)를 내면 `pnpm-workspace.yaml` 의 `extract-zip@<=2.0.1` 오버라이드와
이 폴더를 지우고 레지스트리 버전으로 되돌린다. 회귀는 `scripts/extract-zip-disabled.test.mjs` 가 지킨다.
