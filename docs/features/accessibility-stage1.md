# 접근성 창작 1단계 — 열린 편집기 점검(axe·키보드 순회·이름/역할 감사)

- 상태: 1~6절은 이 변경(`claude/swq-a11y` 브랜치)이 구현하고 실행한 점검과 수정(**current** — 병합 전에는 이 브랜치에만 있다). 7절은 아직 하지 못했거나 확인하지 못한 것(**target**)과 알려진 공백(**legacy exception**)이다.
- 기준 커밋: `2cc3d1038f256a06116f42d93f0a4a2a64d194a8`(분기점). 이 문서의 코드 사실은 그 위의 커밋을 읽고 실행해 확인했다.
- 작성일: 2026-10-22
- 대상: `/studio/canvas`(로그인 없는 게스트 · 서버 연결 없는 오프라인 흐름)에서 연 편집기. 데스크톱 1440×900과 모바일 390×844.
- 함께 보기: [캐릭터 토크 음성 낭독과 접근성 있는 웹툰 만들기 안내](character-chat-voice-accessibility-guide.md)(창작자가 독자를 위해 접근성을 갖추는 방법 — 이 문서는 도구 자체의 접근성을 다룬다)

기존 `pnpm run test:a11y`(`e2e/a11y-smoke.spec.ts`)는 **닫힌 화면**(홈·탐색·`/studio` 진입 화면 등)의 serious·critical 위반을 본다. 이 문서의 점검은 그 다음 단계로, **편집기를 연 상태에서 패널과 창을 하나씩 열 때마다** 같은 기준을 적용하고, 키보드로 지나갈 수 있는지와 화면 낭독기가 읽을 이름·역할이 맞는지까지 본다.

## 1. 한눈에 보기

| 항목 | 상태 | 위치 | 비고 |
| --- | --- | --- | --- |
| 패널을 열 때마다 axe serious·critical 0건 | current | `e2e/studio-editor-a11y.spec.ts` | 데스크톱 9개 단계, 모바일 4개 단계(2절) |
| 이름·역할 감사 | current | 같은 파일 + `scripts/lib/studio-editor-a11y-audit.ts` | axe 이름·역할 규칙 30개(모든 영향도) + 접근성 트리 판정 |
| 키보드 순회(Tab·Shift+Tab) | current | 같은 파일 | 메뉴바 → 작업 모드 → 도구 → 캔버스 → 작업 패널, 포커스 함정·표시 점검 |
| 열고 닫기 포커스 복귀(Esc) | current | 같은 파일 | 메뉴·창·팝업·모달 7곳 + 모바일 시트 2곳 |
| 실제 화면 낭독기(NVDA·VoiceOver·TalkBack) 낭독 | **미확인** | — | 자동 점검은 접근성 트리와 속성을 본다. 소리로 들어 본 것이 아니다(7.1절) |
| 3D 장면 대화상자 | target | — | WebGL 엔진이 필요해 이번 점검에 넣지 못했다(7.2절) |

이 변경이 **하지 않은 것**은 다음과 같다: DB 마이그레이션, 새 런타임 의존성, 새 API 경로, `StudioCuttoonEditorHost.tsx` 수정(2만 9천 줄 규모의 호스트 파일은 손대지 않았다).

## 2. 점검 범위

게스트 흐름은 로그인하지 않고 `/studio/canvas`로 들어가 서버 응답을 모두 막은 상태다. `e2e/helpers/studio-editor-a11y.ts`의 `installGuestOfflineEnvironment`가 한국어 설정, 호환성·베타 안내 확인 완료, 인증 안 됨(`/auth/session`), 나머지 `/api/**`는 503으로 만든다. 서버가 없어도 같은 상태로 수렴하므로 CI와 로컬 결과가 같다.

| 뷰포트 | 단계(`e2e/helpers/studio-editor-panels.ts`) |
| --- | --- |
| 데스크톱 1440×900 | 첫 화면(빈 캔버스 시작 도크) · 소재(템플릿·에셋) 창 · 말풍선 창 · 레이어 탐색기 · 레이어 필터 팝업 · 페이지 탭 · 기능·설정 찾기(모달) · 파일 메뉴 · 속성(텍스트를 고른 작업 패널, 선택 동작 줄 포함) |
| 모바일 390×844 | 첫 화면(모바일 편집 안내) · 작업 메뉴 시트 · 브러시 색상 시트 · 레이어·속성(작업 패널 시트) |

각 단계는 사용자가 실제로 하는 조작(클릭·단축키)으로 열고, 점검한 뒤 Esc나 닫기 단추로 닫는다. 한 단계가 실패해도 다음 단계로 넘어가는 soft 단언을 쓰므로 한 번의 실행이 모든 패널의 결과를 보고한다.

## 3. 점검 방법

### 3.1 axe

- `@axe-core/playwright`의 `AxeBuilder`에 WCAG 태그 `wcag2a`·`wcag2aa`·`wcag21aa`·`wcag22aa`를 준다(기존 스모크와 같다). **serious와 critical은 0건**이어야 통과다. minor·moderate는 차단하지 않는다.
- 이름·역할 점검은 별도로 axe 규칙 30개(`NAME_ROLE_AXE_RULES` — `aria-*` 구조·값 규칙, `button-name`, `label`, `link-name`, `nested-interactive` 등)를 **모든 영향도**로 본다. `aria-allowed-role`처럼 minor로 분류되지만 "역할이 틀린 요소"를 가장 먼저 알려 주는 규칙을 놓치지 않기 위해서다.
- 호버 말풍선이 점검 도중 떠서 결과가 흔들리지 않도록 포인터를 화면 가운데로 치우고(`parkPointer`) 말풍선이 사라지기를 기다린다. 오프라인 안내가 늦게 나타나 상단 영역 높이가 바뀌는 일도 막으려고 "연결 다시 확인" 단추가 보일 때까지 기다린 뒤 시작한다(`waitForEditorSettled`).

### 3.2 접근성 트리 감사

CDP의 `Accessibility.getFullAXTree`를 읽어 `auditAccessibilityTree`(순수 함수)가 판정한다. 화면 낭독기가 보지 못하는 무시된(ignored) 노드는 판정하지 않는다.

| 판정 | 내용 |
| --- | --- |
| 이름 없음 | button·link·textbox·combobox·checkbox·tab·slider·menuitem 등 상호작용 역할의 이름이 비어 있다 |
| 무의미한 이름 | "×"·"…" 같은 기호, `studio.assetMenu.upload` 같은 번역 키 노출, `icon.png`·URL 같은 파일 이름, "button"·"버튼" |
| 역할 구조 | tab이 tablist 밖, tab에 `aria-selected` 없음, menuitem이 menu·menubar 밖, option이 listbox 밖 |
| 값·상태 | slider·spinbutton에 값이 없음, checkbox·radio·switch에 checked 상태가 없음 |

판정 규칙은 브라우저 없이 `scripts/lib/studio-editor-a11y-audit.test.ts`가 고정한다(표 형태 단위 시험). e2e는 규칙을 호출만 한다.

### 3.3 키보드 순회

건너뛰기 링크(`nav[aria-label="작업 영역 바로가기"]`)의 첫 단추에서 시작해 Tab을 눌러 작업 패널 단추를 3개 이상 지날 때까지(최대 420번) 정지 지점을 모두 기록하고, 거꾸로 Shift+Tab으로 건너뛰기 링크까지 되돌아온다. 정지마다 영역(건너뛰기 링크·메뉴바·작업 모드·도구·브러시·캔버스·작업 패널·떠 있는 창·상태), 이름, 보이는지, 포커스 표시를 남기고 `analyzeTabTraversal`이 다음을 판정한다.

- 포커스가 문서 본문으로 사라지는지(포커스 유실), 같은 요소를 되풀이해 도는지(함정), 영역 순서가 기대(메뉴바 → 작업 모드 → 도구 → 캔버스 → 작업 패널)와 다른지.
- 포커스가 가려지거나 화면 밖에 있는지, 포커스 표시가 없는지.
- 같은 요소끼리 보면 거꾸로 지난 순서가 앞으로 지난 순서를 뒤집은 것인지(`compareTraversalDirections`). 방향에 따라 포커스를 옮기는 키 처리 코드가 있으면 여기서 어긋난다. 연결 상태에 따라 켜졌다 꺼지는 단추처럼 한쪽에서만 닿은 요소는 순서 문제가 아니라서 보고서 주석으로만 남긴다.

**포커스 표시 판정**은 계산된 스타일로 먼저 한다(`classifyFocusIndicator`). 윤곽선(outline)은 두께 1px 이상·불투명도 0.35 이상이어야 하고, 그림자 링(box-shadow)은 번지지 않는 퍼짐(spread) 1.5px 이상·같은 중심·불투명도 0.35 이상이어야 표시로 센다(옅은 링, 떠 있는 카드 그림자, 한쪽으로 치우친 그림자는 표시가 아니다). 스타일로 못 찾으면(슬라이더 손잡이 같은 의사 요소) 포커스를 준 화면과 뺀 화면의 픽셀을 비교하는 방법으로 한 번 더 본다.

### 3.4 열고 닫기와 포커스 복귀

`expectOpenCloseRestoresFocus`가 여는 단추에 포커스를 주고 Enter로 연 뒤 (1) 창이 보이는지, (2) 포커스가 창 안으로 들어왔는지, (3) Esc로 닫히는지, (4) 포커스가 여는 단추로 돌아오는지를 본다. 모달(기능·설정 찾기)은 포커스가 모달 안으로 들어온 **뒤에** Tab·Shift+Tab을 12번씩 눌러도 포커스가 밖으로 새지 않는지(`expectFocusContained`)와 닫은 뒤 복귀를 함께 본다(모달이 다음 프레임에 포커스를 옮기므로 그 전에 Tab을 누르면 여는 단추 다음 요소로 가 버려 판정이 틀린다). 가두기 점검이어도 Esc로 반드시 빠져나올 수 있어야 한다.

## 4. 문서화된 예외

예외는 `STUDIO_EDITOR_AXE_EXEMPTIONS`에 근거와 함께 두고, 이름·역할 규칙에는 두지 않는다(단위 시험이 고정한다). 새 항목을 더하려면 같은 기능을 하는 다른 조작이 있다는 근거를 적고 이 표를 함께 바꾼다.

| id | 규칙 | 대상 | 근거 |
| --- | --- | --- | --- |
| `floating-resize-handles` | `target-size`(WCAG 2.5.8) | `[data-studio-floating-surface-resize-handle]` | 떠 있는 창의 크기 조절 손잡이 8개는 테두리 6px·모서리 16px의 포인터 전용 영역이다. 같은 창의 "최대 크기" 단추, "창 배치" 메뉴의 최소·권장·최대 크기 항목, Alt+방향키 크기 조절이 같은 기능을 24px 이상 목표로 제공하므로 "동등한 조작" 예외로 본다 |

## 5. 이번에 고친 것

점검을 처음 돌렸을 때 드러난 결함 중 작게 고칠 수 있는 것을 고쳤다. 각 항목은 단위 시험으로 고정했다.

| # | 증상 | 잡은 규칙 | 위치 | 수정 |
| --- | --- | --- | --- | --- |
| 1 | 소재 창의 이미지 올리기 입력이 이름 없이 노출돼 낭독기가 "파일 선택"만 읽는다 | axe `label` critical | `StudioUnifiedAssetWorkspace.tsx` | 이미 있던 번역 키 `studio.assetMenu.uploadAria`("이미지 소재 업로드")로 이름을 붙였다 |
| 2 | 말풍선 창의 결과 목록이 list 안에 group을 두고 그 안에 listitem을 넣어 항목 수·구조가 낭독되지 않는다 | axe `aria-required-children`·`aria-required-parent` critical | `lettering/StudioBubbleLibraryPanel.tsx` | 바깥 영역은 group, 구역마다 list(구역 제목으로 이름)를 두어 listitem의 바로 위 부모가 list가 되게 했다 |
| 3 | 메뉴바의 "템플릿·에셋"·"말풍선"·"프로젝트 센터"를 Enter로 열어도 포커스가 여는 단추에 남는다. 창은 `document.body` 포털이라 다음 Tab은 옆 메뉴로 가서, 키보드·낭독기 사용자는 창 안에 닿을 길이 없다 | 키보드 점검(WCAG 2.1.1·2.4.3) — 열기 포커스 복귀 시나리오가 잡았다 | `a11y/use-studio-window-keyboard-focus.ts`(새 훅), `studio-chrome-ui.tsx`, `StudioProjectCenterSurface.tsx` | 메뉴바·도구 줄 단추를 **키보드로** 눌러 연 창만 포커스를 받는다(마우스·단축키로 연 창은 그대로). 닫히며 포커스가 본문으로 떨어지면 여는 단추로 돌려준다. 창 루트에 `tabindex="-1"`을 주었다 |
| 4 | 작업 내역 패널을 닫으면 포커스가 문서 본문으로 떨어진다 | 키보드 점검(WCAG 2.4.3) | `StudioHistoryPanel.tsx` | 열기 직전 포커스를 ref에 기억했다가 닫힐 때 포커스가 비어 있으면 돌려준다. 이미 다른 단추로 옮겨 갔다면 그 선택을 존중한다. 개발 모드(StrictMode)는 효과를 두 번 돌려 두 번째 값이 이미 패널 안이라는 점까지 단위 시험으로 고정했다 |
| 5 | 선택 동작 줄에서 단추 래퍼가 폭 0으로 줄어 단추끼리 겹치고, 오른쪽 "복제·삭제·해제"가 줄 밖으로 잘렸다 | axe `target-size` serious | `canvas/StudioCanvasStatusRail.tsx` | 래퍼를 줄어들지 않게 하고, 단추 최소 크기 24px을 보장하고, 안내 문구가 남는 폭만 쓰며 넘치면 줄임표로 줄이게 했다 |
| 6 | 모바일에서 오프라인 안내로 상단 알약이 두 줄이 되면 "협업 보기 설정" 단추가 알약에 가려져 44×9px만 보인다 | axe `target-size` serious | `live/StudioLiveCollaborationQuickControls.tsx`, `shared/styles/studio-route.css` | 알약의 실제 높이를 담은 변수가 한 줄 기준(4.25rem)을 넘는 만큼만 단추를 내린다. 한 줄일 때는 0이라 위치가 같다 |
| 7 | 서비스 상태 안내가 `aside`(complementary 랜드마크)에 `role="status"`를 얹은 조합이다 | axe `aria-allowed-role` minor | `app/service-state/ServiceDegradedBanner.tsx` | 상태 영역은 랜드마크가 아니므로 `div`로 바꿨다(낭독은 `role="status"`가 맡는다) |
| 8 | 모바일 작업 패널 시트가 `aside`(complementary 랜드마크)에 `role="dialog"`를 얹은 조합이다 | axe `aria-allowed-role` minor | `StudioInspectorAsideShell.tsx` | `dialog`(모바일)와 `region`(데스크톱)을 모두 허용하는 `section`으로 바꿨다. 전역 테마 규칙은 `aside`와 `section`을 같게 다룬다 |
| 9 | 건너뛰기 단추 이름이 "도구 옵션로 이동"으로 낭독된다 | 눈으로 확인(자동 규칙 밖) | `studio-workspace-landmarks.ts`, `StudioWorkspaceNavigator.tsx` | 받침에 맞춰 "으로"/"로"를 고르는 순수 함수 `studioWorkspaceSkipLabel`로 "도구 옵션으로 이동"이 되게 했다 |

3번과 4번은 "키보드로 해 보니 막힌다"는 종류라 axe가 잡지 못한다. 열고 닫기 시나리오(3.4절)가 있었기에 드러났다.

## 6. 실행 방법

```sh
# 브라우저·개발 서버를 새로 띄워 7개 시험을 모두 실행한다(로컬 콜드 스타트, 첫 시험이 가장 오래 걸린다).
pnpm run test:a11y:editor
```

- 설정 파일은 `playwright.studio-editor-a11y.config.ts`다. 기본 포트 5233, 개발 서버는 항상 새로 띄운다. 시험 하나의 제한 시간은 480초이고 CI에서는 한 번 다시 시도한다(결정적인 위반은 두 번 다 실패하므로 가려지지 않고, 한 번 실패 뒤 통과하면 보고서가 flaky로 표시한다).
- 콜드 스타트한 개발 서버는 편집기 모듈을 처음 열 때 1~3분이 걸린다. 시험 파일의 `beforeAll`이 편집기를 한 번 미리 열어(`warmUpEditor`, 제한 10분) 그 비용을 시험 제한 시간 밖에서 치른다. 워밍업 없이 제한 시간 240초로 돌렸을 때는, 다른 작업이 함께 돌던 로컬 환경(적재 평균 10 안팎)에서 콜드 서버의 첫 두 시험이 제한 시간에 걸려 실패했다.
- 이미지에 고정된 Chromium을 쓰려면 `PLAYWRIGHT_EXECUTABLE_PATH`를, 채널을 고르려면 `PLAYWRIGHT_CHANNEL`을 준다. 서버를 재사용하려면 `TOONSTUDIO_A11Y_EDITOR_REUSE_SERVER=1`과 `TOONSTUDIO_A11Y_EDITOR_PORT`를 함께 준다.
- 한 시험만 보려면 `pnpm run test:a11y:editor -- -g "데스크톱.*대표 패널"`처럼 `-g`를 붙인다.
- 순수 판정 규칙의 단위 시험: `pnpm exec vitest run scripts/lib/studio-editor-a11y-audit.test.ts`.
- 열기·닫기 포커스의 단위 시험: `pnpm exec vitest run apps/web/src/domains/creator/a11y apps/web/src/domains/creator/history/StudioHistoryPanel.focus-return.test.tsx`.
- 새 소스는 소스 배치 래칫(`creatorRootFiles`)이 `domains/creator` 루트의 직속 파일 수 증가를 막으므로 하위 폴더(`a11y/`, `history/`)에 두었다.

### 6.1 안정성 점검과 CI 편입 판단

**점검 방법.** 같은 시나리오 7개를 **콜드 개발 서버로 연속 3번**(`PLAYWRIGHT_EXECUTABLE_PATH=/opt/pw-browsers/chromium pnpm run test:a11y:editor`, 매번 서버를 새로 띄움, 재시도 없음) 실행했다. 실행 환경은 다른 작업과 CPU·메모리를 나눠 쓰는 4코어 샌드박스(적재 평균 3~7)다.

| 실행 | 결과 | 걸린 시간(Playwright 보고) | 데스크톱 axe | 데스크톱 이름·역할 | 데스크톱 Tab 순회 | 데스크톱 Esc 복귀 | 모바일 3개 합 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 7개 통과 | 6.4분 | 1.2분 | 1.1분 | 2.0분 | 25초 | 44초 |
| 2 | 7개 통과 | 7.7분 | 1.6분 | 1.3분 | 2.2분 | 35초 | 60초 |
| 3 | 7개 통과 | 6.5분 | 1.2분 | 1.1분 | 1.9분 | 24초 | 45초 |
| 확인 | 7개 통과 | 8.7분 | 1.5분 | 1.5분 | 2.4분 | 42초 | 72초 |

맨 아래 "확인" 줄은 이 변경의 마지막 커밋(새 소스를 하위 폴더로 옮긴 뒤)에서 한 번 더 돌린 실행이다. 다른 작업이 CPU를 나눠 쓰던 구간이라 앞의 세 번보다 느렸고, 연속 3번 판정에는 넣지 않았다.

세 번 모두 실패·재시도·불안정 표시가 없었다. 이 점검이 처음 돌았을 때는 시험 제한 시간, 연결 상태에 따라 켜졌다 꺼지는 단추, 모달이 포커스를 옮기기 전에 누른 Tab 같은 **시험 쪽 불안정**이 있었고, 그 원인을 고친 뒤(워밍업·상한 있는 대기·공통 요소만 비교·포커스 도착 대기) 위 3회가 나왔다.

**결정: 이 변경에서는 필수 `a11y` job(`Core accessibility smoke`)에 넣지 않는다.** `pnpm run test:a11y:editor` 별도 스크립트로 둔다. 근거는 다음과 같다.

1. **증거가 로컬뿐이다.** 3회 연속 통과는 로컬 샌드박스에서의 결과이고, 실제 CI 러너(소프트웨어 GPU, 코어 수·적재가 다름)에서 한 번도 돌려 보지 못했다. 필수 검사의 불안정은 모든 PR과 main을 막는다.
2. **시간 예산이 빠듯하다.** 최근 성공한 CI 실행(run 39727749043)에서 `a11y` job은 7분 23초(준비 약 1분 50초 + 접근성 스모크 4분 2초 + 제작 작업 보드 1분 32초)였고 `timeout-minutes`는 20이다. 이 시나리오는 로컬에서 6.4~8.7분이라 같은 job에 더하면 약 14~16분이다. 러너가 더 느리면 제한에 닿는다.
3. **되돌리기 쉬운 순서가 있다.** 비필수 차선에서 CI 실행 이력을 쌓은 뒤 올리면 필수 게이트를 건드리지 않고도 같은 보증을 얻는다.

**승격 조건과 방법(제안, 이 변경에서 하지 않음).**
- 비필수 차선에서 CI 러너 기준 연속 5회 통과, 한 번에 8분 이하. 후보는 야간 진단 워크플로(`.github/workflows/main-full-qa-studio.yml`)의 한 줄 추가(`editor-a11y|pnpm run test:a11y:editor`)나 `workflow_dispatch` 실행이다.
- 편입하려면 (a) `ci.yml`에 병렬 job `a11y-editor`를 추가하고 `scripts/ci-core-gate.mjs`의 `REQUIRED_CORE_GATES`·`core`의 `needs`·`required`·`scripts/ci-executed-gates.test.mjs`를 함께 바꾸거나, (b) `a11y` job의 마지막 단계로 넣고 `timeout-minutes`를 30으로 올린다. (a)가 주 경로(필수 검사의 소요 시간을 늘리지 않는다)다.

## 7. 미해결과 알려진 한계

### 7.1 실제 화면 낭독기 낭독은 확인하지 못했다

이 점검은 **접근성 트리와 ARIA 속성**을 읽는다. NVDA·JAWS·VoiceOver·TalkBack으로 실제로 들어 보는 점검은 하지 않았다(**미확인**). 이름이 있고 역할 구조가 맞다는 것과 "듣기에 이해가 된다"는 것은 다르다. 다음 단계로 낭독기 한 쌍(Windows NVDA + Chrome, iOS VoiceOver + Safari)에서 같은 시나리오를 소리로 확인하는 점검이 필요하다.

### 7.2 이번 점검에 넣지 못한 표면

- 3D 장면 대화상자(WebGL 엔진 필요)와 그 안의 3D 조작.
- 캔버스 위에 그린 내용 자체(래스터)와 Konva 도형의 대체 텍스트. 편집기 캔버스는 시각 편집 표면이라 키보드·낭독기로 그림을 만드는 경로는 이 단계의 범위 밖이다.
- 로그인 상태의 협업·게시·AI 패널(서버 응답이 필요하다).

### 7.3 확인했지만 고치지 않은 것

차단 기준(serious·critical)에 걸리지 않았거나 구조 결정이 필요해서 이번에 손대지 않은 것이다. 아래는 모두 브라우저에서 관찰한 사실이고, 고친 것이 아니다.

| 관찰 | 위치 | 이번에 두는 이유 |
| --- | --- | --- |
| 메뉴바가 `role="banner"`인데 `<main>` 안에 있어 banner 랜드마크가 최상위가 아니다(axe `landmark-banner-is-top-level` moderate) | `studio-chrome-ui.tsx`의 `StudioAppMenubar` | 문서 메뉴 영역을 어떤 역할로 둘지 랜드마크 구조 결정이 필요하다. 차단 기준 밖이다 |
| 모바일 편집기 화면에 제목(h1)이 없다(axe `page-has-heading-one` moderate) | 편집기 셸 | 제목 계층 설계가 필요하다. 차단 기준 밖이다 |
| 한 바퀴 돌 때 서버 상태 안내(`details` > `summary` "서버 장애 · 로컬 작업 중" 등)가 건너뛰기 링크보다 먼저 포커스를 받는다 | `offline/StudioOfflinePanel.tsx` | 문서 순서와 겹침 레이아웃에 걸려 있어 따로 점검해야 한다 |
| 처음 저장이 끝난 뒤 한 번 뜨는 "게시 준비 제안" 카드가 작업 패널 머리글 위에 겹쳐 그 아래 단추(기능·설정 찾기 등)의 클릭을 가로챈다(WCAG 2.4.11 포커스 가림 후보) | `StudioFirstPublishSuggestion.tsx`, `StudioSaveStatusChromeMount.tsx` | 닫기 단추가 있고 한 번만 뜬다. 시나리오는 카드를 먼저 닫고 진행한다(`dismissFirstPublishSuggestion`) |
| 모바일 작업 메뉴 시트의 아래쪽 줄이 오프라인 안내 칩이나 코치 카드에 가려질 수 있다 | 모바일 하단 도크·시트 | 화면 크기·안내 상태 조합이 많아 axe 차단 기준에서는 잡히지 않았다 |
| 호버 말풍선(`role="tooltip"`)이 뜨는 순간에 내용이 비어 있는 프레임이 있다(axe `aria-tooltip-name`) | `AccessibleTooltipLayer.tsx`, `StudioToolHint.tsx` | 시나리오는 포인터를 치우고 말풍선이 사라지길 기다린다. 사용자가 보는 순간적인 빈 말풍선이 낭독되는지는 확인하지 못했다 |
| 3D 배경 표면의 `aria-controls="studio-brush-workbench"`가 가리키는 요소가 없는 경우를 관찰했다 | `bg3d` 표면 | 3D 엔진이 필요해 이번 점검 밖이다(7.2절) |
| 연결 상태에 따라 켜졌다 꺼지는 "연결 다시 확인" 단추가 한 방향 순회에만 잡힐 수 있다 | `StudioSaveSyncStatusCenter.tsx` | 순서 문제가 아니라 상태 변화다. 시나리오는 공통 요소의 순서 거울 여부만 실패로 세고, 한쪽에서만 닿은 요소는 보고서 주석으로 남긴다 |

`StudioCuttoonEditorHost.tsx`(호스트 파일) 안에서 만들어지는 위반은 이번 시나리오에서 확인하지 못했다. 위 표의 위치는 모두 호스트 밖의 개별 컴포넌트이고, 호스트 파일은 수정하지 않았다.
