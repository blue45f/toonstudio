# React Compiler 안정화 메모 (2026-10-28)

상태: 현재 상태 기록. 코드 변경 없음. RC 정식 전환과 Vite 개발 shim 제거는 2026-11-01 이후 시범으로 별도 진행한다.

## 현재 사실 (2026-10-28 확인)

- React Compiler는 이미 `apps/web`에 전역으로 적용돼 있다. 새로 도입하는 작업이 아니다.
- lockfile 확인 버전: React 19.3.1, Vite 8.3.4, `babel-plugin-react-compiler` 1.0.0, `eslint-plugin-react-compiler` 19.1.0-rc.2 (RC, 정식 아님).
- 적용 방식: `apps/web/vite.config.ts`에서 `@vitejs/plugin-react`(Babel 경로) 다음에 `babel-plugin-react-compiler` 프리셋을 적용하고, `compilationMode: "annotation"` 옵션이 없어 기본 전역 모드다.
- 제외 파일: `node_modules`와 `programmatic-reload(-hmr).ts`만(`apps/web/vite-react-compiler-filter.ts`).
- 개발 서버 전용 shim: `serve` 모드에서만 `react/compiler-runtime`을 `apps/web/config/react-compiler-runtime-interop.mjs`로 별칭한다. 프로덕션은 공식 런타임을 직접 쓴다.

## 기술 지도 행과의 차이 (2026-10-28 확인)

- `apps/web/src/domains/legal/technology/engineering-map-open-source-rows.ts`의 React 행은 작성 기준일 2026-10-07 기준으로 "설치본은 React 19.2.7"이라고 적혀 있다.
- 2026-10-28에 설치본(`node_modules/react/package.json`)과 lockfile을 확인한 결과는 19.3.1이다.
- 이 행은 공유 기준일(`AS_OF`)을 쓰는 자료라서, 한 행만 19.3.1로 고치지 않았다. 기술 지도를 다시 대조할 때 기준일과 함께 갱신해야 한다.

## 린트 예외 검토 결과 (2026-10-28 확인)

`react-compiler` 규칙을 끈 곳은 2곳이며, 둘 다 유지한다.

1. `eslint.config.mjs`의 `legacyExceptions.closureBagFiles` 블록: StudioCuttoonEditor 클로저 추출 파일군. 다른 규칙과 함께 묶인 레거시 예외라서, 이 규칙 하나만 떼지 않는다.
2. `eslint.config.mjs`의 `StudioViewInspectorHud.tsx` 블록: 호출자 소유 viewport ref가 가리키는 DOM 노드를 의도적으로 변경하는 effect라서, React 상태·props 객체를 변경하지 않는다는 주석과 함께 예외가 있다. 빌드 컴파일 대상에서는 제외되지 않으며, 린트 예외만 적용된다.

린트 off가 빌드 컴파일 off를 뜻하지 않는다. 이 2곳의 파일도 빌드 컴파일 대상이다.

## 문서화된 bail-out 사례

- `apps/web/src/domains/creator/studio-cuttoon-editor/runtime/useStudioHistoryDurability.ts`: effect 안의 `??=` 때문에 컴파일러 1.0.0이 훅 전체를 bail out한다. 파일 내 주석은 이를 정체성 안정화로 설명하고, 강제 수정 대상이 아닌 예외로 관리한다.
- 수동 메모(`useMemo`·`memo`)를 대량으로 추가하거나 대량으로 제거하는 방향은 모두 금지한다. 컴파일러가 이미 자동 메모이제이션을 담당하고, 제거는 컴파일 출력을 바꾼다.

## 2026-11-01 이후 시범 (아직 하지 않음)

1. RC 린트 플러그인 정식 버전 전환 + zod v3 호환 shim(`scripts/eslint-react-compiler-zod-v3-compat.mjs`) 제거를 같은 단위로 진행한다. 검증은 `verify-security-advisory-exceptions` 테스트가 지킨다.
2. Vite 개발 shim 제거: lockfile Vite 8.3.4는 문서화된 제거 조건(Vite 8.2.0 이상 고정)을 버전으로는 만족한다. 그래도 제거는 로컬 개발 실행 → shim 제거 → 프로덕션 빌드 → `check:studio-bundle` 순서로 시범한다.
3. 다른 앱(admin-web·brush-lab·character-lab)으로의 확장은 별도 판단이 필요하며, 현재 확인된 적용 범위는 `apps/web`뿐이다.
