# 공간 모델러 이름·모바일·품질 보존 검증 — 2026-10-29

- 상태: `migration` — 집중 회귀와 제한된 타입·정적 검사는 통과했다. 새 브라우저·전체 하네스·production build는 미완료다.
- 작업트리: `sketchup-primitive-edit/toonstudio`, 브랜치 `codex/sketchup-scene-export`.
- HEAD: `35307f655e0ce855cca0f363c9b98c448e4ea8f9`에 미커밋 변경이 있는 상태에서 실행했다. clean HEAD 단독의 결과가 아니다.
- 기능 기준: [공간 모델러](../features/spatial-modeler.md), [3D 웹 품질·성능 정책](../features/3d-web-performance-policy.md).
- 실행 범위: 릴리스 조정자가 배정한 5분 이내 좁은 검사 구간에서 root만 순차 실행하고, 소유 프로세스 0으로 반환했다.
- 후속 변경과의 경계: 이 검사를 마친 뒤 active 작업트리에서 SKP run 소유권, 품질 패널의 선택 보존·canvas 복구 상태, 별도 MR packing 통합을 추가하고 있다. 아래 113회귀·타입·정적 결과는 입력 지문으로 고정한 이전 체크포인트에 한정하며 이 후속 source의 통과 근거가 아니다. 동결된 `4d86/353` 후보는 수정하지 않는다.

## 구현 결과와 경계

제품 표시명, 주 패널·예제 컴포넌트, 고급 작업대 탭과 진입점은 **공간 모델러 / Spatial Modeler**를 사용한다.
스타일 상태 메시지·예제 파일 이름과 가상 스튜디오·AI 보조 화면·매뉴얼의 자체 제품명도 맞췄다.
외부 원본 제품·SKP 버전/파일 호환·API·영속 데이터 식별자는 용도를 구분해 유지했다.

모바일 professional 작업공간은 첫 작은 화면에서 컷 패널 접힘을 요청한다. 실제 사용자가 선택한 접힘과
responsive 권장 상태를 분리하며, 접기만으로 입력·session·장면·저장소를 폐기하지 않는다.
좁은 화면의 세로 스크롤·inspector 최소 높이 보완은 소스에 적용했지만 실제 버튼 가시성은 아래 브라우저 대기 범위다.

프레임 governor는 기본 `resolutionPolicy: "preserve"`로 DPR 배율 1을 유지하면서 실제 표본의 frame smoothing을
계속 계산한다. 기존 `[1, .85, .7, .55]` adaptive 알고리즘과 부하·회복·cooldown 기준은 명시적 `adaptive`에서만
동작한다. 고품질 모델 load 실패의 전역 `high → auto` reset도 제거해 원래 오류와 선택한 품질을 보존한다.
안전 admission·권리·메모리 cap을 완화하지 않았다. device profile 자동 선택과 품질 패널의 세션/context-loss reset은
별도 검토가 남아 있으므로 모든 품질 축소 경계가 해결됐다는 뜻이 아니다.

## 재현한 실패와 수정

첫 모바일 presentation 회귀는 **8개 중 1개 실패**로 actual exit 1이었다.
사용자가 컷 패널을 닫은 직후 native `toggle` 전달 전에 desktop→mobile→desktop preference가 두 번 commit되면
DOM이 다시 열리고, 기존 pending 상태가 실제 DOM과 달라져 사용자 선택을 잃었다.

수정은 summary activation에서 **클릭 직전의 DOM open 값을 React prop 기준으로 고정**하고, 이어지는 native
default toggle은 한 번 그대로 실행한 뒤 `onToggle`에서 실제 DOM 결과를 반영한다. 클릭에서 값을 직접 반전하거나
`preventDefault()`하지 않는다. 처음 사용자 activation 전의 prop-only toggle은 사용자 선택으로 기록하지 않는다.
최종 집중 실행에서 해당 race·빠른 두 번 클릭·Enter/Space activation·resize·입력/원본 보존 회귀가 통과했다.
jsdom의 키보드 회귀는 UA activation click 경계이며 실제 브라우저 키보드 검증은 별도다.

첫 14파일 실행에서는 이름 변경 테스트의 잘못된 DOM 가정 하나도 확인했다. 작업대 버튼은 카테고리와 제품 라벨을
함께 갖는데 전체 `textContent`가 제품명과 같다고 가정했다. 정확한 하위 라벨을 `within(...).getByText(..., { exact: true })`로
검증하도록 고쳐 카테고리와 제품명을 모두 보존했다. 첫 실패 로그는 삭제하지 않았다.

## 실제 실행 결과

| 검사 | 실제 결과와 범위 |
| --- | --- |
| 기존 changed-entry strict scoped TSC | **exit 0**, `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc -p /private/tmp/toonstudio-scene-export-root-tsconfig.json --noEmit`. 기존 narrow 설정에서 삭제된 Panel 경로만 새 이름으로 고쳤다. 전체 프로젝트 TSC가 아니다. |
| 이름·모바일·governor·admission·기존 소비자 회귀 | **14파일·113/113 통과**, 단일 worker, 파일 병렬화 없음, 18.23초, 실제 exit 0. |
| 변경 TS/TSX ESLint | **76파일 exit 0**, `--max-warnings=0`, 자동 수정 없음. |
| 변경 텍스트 Secretlint | **89파일 exit 0**. 이 검사 뒤 작성한 본 검증 기록·문서 갱신은 해당 89파일 실행으로 검증한 것으로 합산하지 않는다. |
| `git diff --check` | exit 0. |

집중 회귀는 새 공간 모델러 패널·Hub·건축 도구·launcher·엔진 안내·professional workspace·모바일 CutPanel·실제
CutPanel 통합·frame governor·model admission 및 AI/가상 스튜디오의 이름 변경 소비자 세 파일을 포함했다.
Vitest의 Vite config 안내와 jsdom Canvas 미구현 경고는 남아 있으며, 이 실행은 실제 GPU 픽셀·렌더 성능 검증이 아니다.

## 입력 지문과 로그

타입 검사 전후 HEAD·config·변경/미추적/삭제 입력 92개의 지문은 같았다.
그 receipt의 SHA-256은 `0c541d8dfa5f49a1be756b7f14c3663a4aa211d53b0842c9c80d64cd4da628b7`다.
이후 바뀐 코드는 TSC include 밖의 `StudioBg3dSpatialModelerPanel.test.tsx` 라벨 단언 한 파일뿐이다.
최종 production runtime source는 타입 검사를 실행한 때와 같았다. 그 단언 수정은 최종 113회귀와 ESLint에 포함했다.

최종 ESLint·Secretlint 전후 입력도 같았다. HEAD와 변경 파일 내용으로 만든 dirty receipt의 SHA-256은
`7eb11f63c9bd00fce71d9d3649f544cad8a5df7a4ca501d066568419babbb7c1`다.
이는 본 문서의 후속 기록을 추가하기 전 검사 체크포인트 지문이다.

- `/private/tmp/toonstudio-spatial-modeler-mobile-repro.log`: 선행 모바일 race 1실패.
- `/private/tmp/toonstudio-spatial-modeler-focused-tests.log`: 첫 집중 실행의 라벨 가정 1실패.
- `/private/tmp/toonstudio-spatial-modeler-narrow-tsc.log`: 최종 scoped TSC, exit 0, diagnostics 없음.
- `/private/tmp/toonstudio-spatial-modeler-focused-tests-final.log`: 14파일 113회귀 통과.
- `/private/tmp/toonstudio-spatial-modeler-eslint.log`, `...-secretlint.log`: 각각 exit 0, diagnostics 없음.
- `/private/tmp/toonstudio-spatial-modeler-narrow-input-before.json`, `...-after-tsc.json`: 타입 검사 입력 동일성.
- `/private/tmp/toonstudio-spatial-modeler-final-input-before-checks.json`, `...-after-checks.json`: 최종 정적 검사 입력 동일성.

## 다음 검증

준비한 `/private/tmp/toonstudio-spatial-modeler-qa/`는 새 고유 산출물 폴더에서 fresh 390 touch/1600 context,
실제 Enter·Space·touch, 작은 표시 영역에서 저장·취소 버튼의 가림, 실제 GLB·Worker·카메라·원본 보존과
6조건 scoped axe를 확인하도록 작성했다. 아직 실행하지 않았으며 390×350 resize/focus를 OS 가상 키보드 실증으로
설명하지 않는다. 기존 GPU20·UI30 증거를 이름·모바일·품질 변경 후의 새 증거로 재사용하지 않는다.

전체 `pnpm harness:verify`, build/bundle 및 새 브라우저/GPU는 별도 실행 구간을 기다린다.
커밋·PR·병합·운영 배포는 이번 검사 구간에 수행하지 않았다. 동결된 4d86/353 후보도 변경하지 않았다.
