# 인앱 기능 sweep CI 재현과 검증 동선 보정

상태: migration. 2026-11-07 CI 실패의 재현 기록이며 운영 배포 결과가 아니다.

## 기준과 범위

- 원격 실패: [isolated main QA 42414083406](https://github.com/blue45f/toonstudio/actions/runs/42414083406).
- 제품 기준 SHA: d823079b2f3d9daa0fc5c241e09d64f533ee8ea0.
- 로컬 production build의 dist/index.html SHA256: 34fe696a04d23f862c7d18b1793cda0de4b8fdd6bd9cd978718fd00294cfa6e6.
- 격리 worktree에서 pnpm install --offline --frozen-lockfile, harness:doctor, 전체 웹 typecheck 및 production build를 실행했다. 웹 typecheck는 26,348개 파일에서 진단 0이었다.
- 이 후보는 sweep과 회귀 테스트만 수정한다. 제품 UI, 엔진, API 응답, 공유 설정은 변경하지 않았다. PR 공개·draft 상태·원격 브랜치·운영 배포를 변경하지 않았다.

## 먼저 재현한 실패

원본 제품과 원본 sweep으로 naver-android-412 프로필의 45단계를 실행했다. 30 통과, 0 제외, 15 실패, 수집된 런타임 오류 0으로 원격의 같은 프로필 실패 15개를 재현했다.

- 닫힌 작업 메뉴에서 선택·픽셀·채우기·도형 버튼을 바로 찾는 오래된 동선 4건.
- 펜 선택으로 메뉴가 닫힌 뒤 사라진 브러시 설정 버튼을 기다리는 동선.
- 별도 브러시 색상 팝오버로 이동한 색상 제어를 예전 스와치에서 찾는 동선.
- 브러시 선택 후 모바일 라이브러리가 닫혔는데 사라진 목록에서 선택 상태를 읽는 동선.
- 모바일 페이지 버튼의 사라진 속성을 사용하는 페이지·필터 진입 2건.
- 독립 포즈 화면에서 편집기 도크를 기다리는 라우트 준비 조건.
- 다시 실행 버튼 클릭 실패. 엔진 관련 별도 조사와 구분하며 이 후보에서 제품 동작은 고치지 않는다.
- 연결 실패 배너와 오프라인 안내가 작업 메뉴를 가려 검색·댓글·빠른 시작·색각 검토 클릭을 막는 4건. 정상 클릭의 hit-test와 실패 스크린샷에서 확인했다.

API가 없는 정적 프리뷰에서 연결 실패 상태가 나타났다. 이 관측은 정상 연결된 운영 화면 전체의 실패를 뜻하지 않는다. 다만 안내가 보이는 상태에서 실제 클릭이 가려진 결과는 실패로 보존하며 API 성공 응답 주입, 경고 숨김, force 클릭으로 우회하지 않는다.

## 보정 내용

- 도구 선택 전에 작업 메뉴를 펼치고, 선택 후 같은 버튼의 aria-pressed를 확인한다.
- 펜 활성화 뒤 메뉴를 다시 펼쳐 브러시 설정에 진입한다.
- 브러시 색상 팝오버에서 실제 헥스 입력과 적용 버튼으로 색을 바꾼 뒤 원래 색을 복원하고 각각 확인한다.
- 모바일에서 닫힌 브러시 목록을 UI로 다시 열어 선택한 동일 ID의 실제 활성 상태를 확인한다. 선택되지 않은 브러시는 계속 실패한다.
- 모바일 페이지 버튼은 aria-controls 계약으로 찾고, 포즈 화면은 실제 독립 페이지의 준비된 제어를 기다린다.
- 클릭 진단을 한 곳에서 재사용한다. hit-test 정보와 버튼 disabled 상태를 남기며 기존 timeout과 실패 정책을 유지한다.
- 35개의 고정 단계 ID와 10개의 라우트를 그대로 유지했다. 신규 회귀 테스트 5건은 수정 전 실패했고 수정 후 집중 검사 152개가 통과했다.

## 재실행

저장소 루트에서 production build가 먼저 필요하다. 아래 명령은 격리 브라우저 저장소에 검증용 원고를 만들며 운영 데이터나 배포를 변경하지 않는다. GPU 브라우저 검증은 다른 실행과 겹치지 않게 한다.

```sh
pnpm run build
TOONSPECTRUM_SWEEP_PROFILES=naver-android-412 \
TOONSPECTRUM_SWEEP_VERIFY_DIR=/tmp/toon-inapp-sweep-recheck \
pnpm run verify:studio-inapp-feature-sweep
```

성공 기준은 45 통과·0 제외·0 실패·런타임 오류 0이다. 잔여 실패가 있으면 report.json과 단계별 실패 PNG를 보존하고 실패 상태 그대로 보고한다. gate를 완화하거나 운영 배포를 시작하지 않는다.

## 후속 결과와 제한

보정된 sweep을 동일한 제품 production dist에서 실행한 결과는 39 통과, 0 제외, 6 실패, 런타임 오류 0이다. 종료 코드는 1이며 전체 gate 통과로 보고하지 않는다. 기존 15실패 중 9건이 검증 동선 보정으로 해소됐다. 원본에서 실패했던 Undo/Redo도 도구를 올바르게 선택하자 통과하여 별도 highlighter gate 실패 조사와 구분한다.

잔여 6건은 pages-sheet, command-search, filter-dialog, canvas-comments, quick-start-panel, colour-vision-review다. 페이지 버튼은 올바른 locator로 찾은 뒤에도 오프라인 안내 summary가 클릭을 가렸고 필터 준비도 같은 페이지 버튼에서 막혔다. 검색은 오프라인 details/aside, 댓글·빠른 시작·색각 검토는 서비스 상태 배너의 실제 버튼·링크가 가렸다. 이 결과와 실패 스크린샷은 /tmp/toon-inapp-sweep-20261107-candidate/에 보존했다.

최종 pnpm harness:verify는 exit 0으로 완료했다. 변경 범위 ESLint·Secretlint, 아키텍처·소스 크기·번들 경계 계약, 전체 웹 26,348개 파일(진단 0), API 및 도구 typecheck를 통과했다. 제품 안내 배치 파일은 동시 작업 소유가 확인되지 않아 보존했다. 연결 실패 상태에서 메뉴와 안내가 겹치지 않도록 별도 제품 보정 후 재검증이 필요하다. 추가로 Android360·iOS390의 90단계를 순차 실행했고 각 프로필에서 같은 39 통과·6 실패를 확인했다. 전체 3프로필 합산은 117 통과·0 제외·18 실패·런타임 오류 0이다. 추가 산출물은 /tmp/toon-inapp-sweep-20261107-candidate-other/에 보존했다. 원격에서만 발생했던 iOS route-projects 타임아웃은 이번 로컬 재실행에서는 재현되지 않았으며 원인이 해결됐다고 단정하지 않는다. 세 프로필은 모두 Chromium 기반 UA/viewport 에뮬레이션이고 실제 네이티브 WebView·iOS Safari·운영 연결 상태는 검증하지 않았다.

원본 로컬 산출물: /tmp/toon-inapp-sweep-20261107-red/report.json 및 같은 디렉터리의 실패 PNG. 원격 run은 해당 산출물 업로드가 없어 로컬 재현과 구분한다. 별도 CI 후보에서 출력 경로 계약을 보완하며 이 후보는 workflow를 수정하지 않는다.
