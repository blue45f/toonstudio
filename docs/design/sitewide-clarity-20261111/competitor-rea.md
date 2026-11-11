# 경쟁 서비스 공개 화면·REA 분석 근거

- 상태: `current` — `2026-11-11`에 실제 실행한 조사 기록. 아래 적용 판단은 설계 근거이며 사용자 연구 결과나 경쟁사 전체 기능의 검증을 뜻하지 않는다.
- 범위: WEBTOON Global, KakaoPage, CLIP STUDIO 공식 제품 안내 **3개 공개 페이지**의 브라우저 관찰과 선택한 공개 JavaScript 정적 분석. 로그인·결제·비공개 API·독점 실행 파일은 조사하지 않았다.
- 기존 광범위 자료: `docs/design/comprehensive-competitor-role-ux-rea-analysis-20261102.md` 등의 비교 대상 전체를 이번에 다시 검증하지 않았다. 이번 직접 관찰 3개와 공식 문서 참고를 구분한다.

## 실행 환경과 방법

공식 [REA 저장소](https://github.com/morluto/rea)의 npm `rea-agents@6.8.0`을 `/tmp/toonstudio-rea-20261111`에 `--ignore-scripts --no-audit --no-fund`로 격리 설치했다. 저장소의 `package.json`·lockfile·에이전트 등록은 수정하지 않았다. 패키지 무결성은 `sha512-9QDeRnGqEDzABZyr04eLnBXBv/c6I9/TWu/6M0MD4pEfkySI/BIgwTODIbAReX3C1x6hjw9+Jlx4A2yUSPZ9ww==`다.

호스트 Node `24.19.0`은 REA의 명시 지원 하한 `24.22.1`보다 낮아, 정적 분석과 최종 CDP 관찰에는 격리 설치한 `node-linux-x64@24.22.1`을 사용했다. 브라우저는 시스템 Chromium `154.0.8037.57`이다.

| 수행 | 실제 provider | 방법·제한 |
| --- | --- | --- |
| 공개 화면 DOM·접근성 트리 | `rea-cdp-browser` v2 | 환경의 HTTPS 프록시를 사용하는 별도 Chromium에 loopback CDP로 연결. `inspect-web-page --include-accessibility-text` 성공. 로그인 없는 현재 화면의 스냅샷이며 클릭 여정 전체의 증거는 아니다. |
| 공개 JS 정적 분석 | `rea-javascript-application` v1 | HTML이 직접 참조한 파일을 HTTPS로 회수하고 SHA-256 기록 후 `analyze-javascript-application`. 코드를 실행하지 않고 AST를 분석했다. 동적 경로의 실제 실행을 보장하지 않는다. |
| 요약 | `rea-analysis-view` v1 | 완전한 Evidence 번들을 저장한 뒤 요약 뷰를 반환한다. 요약 성공을 전체 경쟁사 기능 분석 완료로 읽으면 안 된다. |

네이티브 바이너리를 열지 않았으므로 Ghidra provider가 필요한 작업은 없었다. Hopper를 설치·선택하지 않았다.

실행 위치는 저장소 루트다. 아래 변수는 위 격리 설치가 존재한다는 전제다. 대상의 공개 파일만 있는 `.qa/clarity-20261111/rea/`를 입력으로 쓴다. 원문·Evidence·브라우저 정보는 Git에서 제외된 이 폴더에 보관하며, 추적 문서에는 원문 번들을 복사하지 않는다.

```sh
REA_NODE=/tmp/toonstudio-rea-node-20261111/node_modules/node-linux-x64/bin/node
REA_PACKAGE=/tmp/toonstudio-rea-20261111/node_modules/rea-agents
"$REA_NODE" "$REA_PACKAGE/scripts/rea.mjs" inspect-web-page \
  http://127.0.0.1:9432 <list-browser-targets로-확인한-target-id> \
  --observation-ms 500 --include-accessibility-text --format json
"$REA_NODE" "$REA_PACKAGE/scripts/rea.mjs" analyze-javascript-application \
  /workspace/toonstudio/.qa/clarity-20261111/rea/webtoon-navigation \
  --max-heap-mb 512 --max-semantic-nodes 10000 \
  --max-semantic-nodes-per-file 5000 --analysis-timeout-ms 60000 \
  --detail summary \
  --evidence_output /workspace/toonstudio/.qa/clarity-20261111/rea/new-webtoon-evidence.json \
  --format json
```

KakaoPage는 같은 분석 명령에 `--source-path script-1.js --source-path script-2.js`를 지정했다. 큰 공통 앱 파일 1개는 입력 목록에는 있지만 분석에서 제외했다. 위 명령은 기존 Evidence 파일을 덮어쓰지 않는다. CDP 브라우저는 조사자가 별도로 시작해야 하고, target ID는 실행마다 다시 확인해야 한다.

## 직접 관찰·적용 판단

| 서비스·공식 출처 | 직접 확인한 사실 | ToonStudio 적용 판단 |
| --- | --- | --- |
| [WEBTOON Global](https://www.webtoons.com/en/) | 공개 화면에 검색과 작품 분류·인기·창작자 작품 진입을 구분한다. 헤더·내비게이션·홈의 선택 JS 2개를 분석했다. | 탐색 화면은 작품 선택을 우선하고, 읽기 중 부가 창작 기능은 선택해서 펼치게 한다. |
| [KakaoPage](https://page.kakao.com/) | 추천·웹툰·웹소설·책·요일연재로 구분한 5개 메뉴가 DOM과 접근성 트리에 존재한다. 공개 홈 코드와 경로 manifest의 선택 JS 2개를 분석했다. | 메뉴는 짧은 목적어를 사용하고 현재 영역을 명확히 표시한다. 전체 기능을 한꺼번에 펼치지 않는다. |
| [CLIP STUDIO 제품 안내](https://www.clipstudio.net/en/design/tool/multi-device.html) | 공식 안내가 Simple Mode와 Studio Mode를 구분한다. 관찰한 것은 제품 안내 페이지이며 실제 편집기 실행 화면은 아니다. 페이지의 보조 JS 3개를 정적 분석했다. | 기본 사용자는 핵심 도구부터 시작하고 고급 기능을 명시적으로 확장하게 한다. 제품 안내의 JS 분석을 편집기 내부 구조의 근거로 사용하지 않는다. |

설계 판단은 위 사실을 ToonStudio의 현재 문제에 적용한 추론이다. 경쟁사 레이아웃·문구·자산을 복제하지 않는다. 자료가 없는 사용성 향상률, 완료 시간, 만족도 점수는 제시하지 않는다.

다음 공식 문서는 비교 설계의 보조 참고다. 이번 3개 REA 대상과 달리 새 번들 분석·앱 실행 검증을 하지 않았다.

| 보조 참고 | 설계에 참고한 원칙 |
| --- | --- |
| [Figma 내비게이션·사이드바](https://help.figma.com/hc/en-us/articles/360039831974-Explore-the-navigation-bar-and-left-sidebar) | 선택 문맥에 맞는 속성, 접을 수 있는 패널, 식별 가능한 라벨 |
| [Canva 모바일 내비게이션](https://www.canva.com/help/navigate-canva-mobile-app/) | 시작과 최근 작업·내 작업의 역할 구분. 계정별 점진 배포 차이는 미확인 |
| [CLIP ASSETS](https://assets.clip-studio.com/en-us/) | 소재 유형, 검색, 무료·유료 구분 |
| [ACON](https://www.acon3d.com/en) | 소재 종류에 맞는 범위 좁히기 |

## Evidence 식별과 원문 무결성

| 대상 | DOM / 접근성 노드 | 성공한 브라우저 관찰 Evidence |
| --- | ---: | --- |
| WEBTOON | 2,996 / 923 | `ev_400b964ffb3881e20c86ea5c67611e13f53d5b8cb79e2a6a9cd92d86c132b94d` |
| KakaoPage | 1,693 / 1,123 | `ev_3544239ec4ecafe36db687ec864849b9c4b285a7d842a4fe52ccbbe53d24b1f2` |
| CLIP STUDIO 안내 | 1,601 / 914 | `ev_f597cffd2006789cafb4bfe83682d1aeed844cb293d50d33098bbcae1ad68bc3` |

노드 수는 캡처 당시 렌더된 구조의 크기이며 복잡성·사용성의 점수가 아니다. 같은 공개 화면 3개에 `capture-web-screenshot`도 실행해 성공한 PNG Evidence를 `*-screenshot-evidence.json`으로 보존했다. 자동 시나리오 캡처의 실패와 이 수동 설정 브라우저의 관찰·스크린샷 성공은 별개다.

| 선택 정적 입력 | JS 파일 / AST 노드 / 파싱 실패 | Evidence ID |
| --- | --- | --- |
| WEBTOON 내비게이션·홈 | 2 / 26,472 / 0 | `ev_cbba9c860a843dcb927a9f82349591540c684c1183299b1e1d46a8b52cbf78dc` |
| KakaoPage 홈·manifest | 2 / 3,503 / 0 | `ev_ad0e0fa5e4ce668db0e5fae5716c5c4a53f5cd632859c4b3678fe4b9e273dc1f` |
| CLIP 안내 보조 스크립트 | 3 / 3,237 / 0 | `ev_0414d2a1154b9ed78b1250bae37acc529b475a42806e7ef8facc3cd2b5e31abd` |

선택 정적 입력의 root artifact SHA-256은 각각 다음과 같다.

- WEBTOON: `628e90b076b9659ffb5b7a9f65ad65f25fc68012f84cb42c48788e363cc86282`
- KakaoPage: `6b0425bfb957bd5fd76b262d041590426f3bb19b55e13df1c769d5a73c633158`
- CLIP 안내: `a60c0489dada47f03bdd9a9324e3a4d9a133b131e3547a0e9912b3e1537ba90b`

HTML 및 스크립트별 회수 URL·크기·SHA-256은 `acquisition.json`, 완전한 정적 Evidence 파일 자체의 SHA-256은 `verified-analysis-summary.json`, 브라우저 Evidence 파일의 SHA-256은 `verified-browser-summary.json`에 기록했다. 모두 위 Git 제외 증거 폴더에 있다. 사이트가 바뀌면 재회수한 원문의 해시도 바뀔 수 있다.

## 실패·미확인 범위

- 최초 `capture-browser-scenario`의 자동 launch 3건은 초기 탐색에서 실패했고, connect 1건도 실행·정리 오류를 반환했다. 성공으로 집계하지 않았다. 최종 성공 경로는 환경의 프록시를 적용한 브라우저에 **passive CDP 관찰로 연결**한 것이다. 실패 원인을 REA 버그 또는 프록시 문제라고 확정하지 않는다.
- 최초 광범위 JS 선택에서 WEBTOON·KakaoPage 공통 스크립트가 파일당 60초 제한에 도달했다. 이를 전체 분석 완료로 간주하지 않고, 목적과 관련된 작은 파일을 명시적으로 다시 선택한 성공 결과만 위 표에 넣었다.
- REA 관찰은 attach 이후의 상태만 담는다. 그 전에 발생한 네트워크·콘솔, 로그인 후 동선, 실제 편집기의 도구 동작, 모든 경쟁 서비스·모바일 앱을 확인하지 않았다.
- CLIP 공식 안내 화면에는 쿠키 동의 패널이 떠 있었다. 동의하지 않고 보이는 본문·접근성 트리만 확인했으며 안내 페이지의 버튼과 실제 편집기 상호작용을 검증하지 않았다.
- 공개 화면·공식 안내의 관찰에서 나온 구조 원칙만 자체 설계에 반영한다. 이전 자료의 광범위한 완료 주장이나 공급자 내부 알고리즘을 이번 증거로 확정하지 않는다.
