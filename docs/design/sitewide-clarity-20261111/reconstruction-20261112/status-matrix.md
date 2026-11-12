# 화면군별 구현·검증 상태 — 2026-11-12

상태: **migration**. **기준선 검증완료**는 커밋 `74d62b03dc967e5eceeb9c32165c7c94bdff508c`, 로컬 production 빌드 `09f989953e81`에 한정한다. entry `/assets/index-CsZuPMiL.js`의 SHA-256은 `b15c2537cca5221b895bfefe84849ae1737ccca1e7e2ec82d65ad5555c7dbcca`이다. 이 기준선은 빌드 exit 0, 전체 Web 의미 타입 검사 26,742/26,742·진단 0, API 타입 검사와 변경 범위 하네스 exit 0을 확인했다. 하네스 종료 SHA는 같은 `74d62…`이며 종료 작업본 기록은 clean이다. 이는 모든 단위 테스트·브라우저 과업 전수 실행이나 운영 배포를 뜻하지 않는다.

**현재 major 후속 변경은 새 최종 번들·전체 하네스 대기**다. 홈·시작·서재·탐색·읽기·헤더·저장/연결 알림 및 마켓 하단 가림 변경은 기준선 이후의 통합 소스이며, 최종 SHA는 아직 정하지 않았다. 최초 집중 검사 r1의407통과/8실패(exit1)는 원본으로 보존한다. 해당 실패는 범위별 후속 수정·검사로 해소했지만 같은28suite 전체 재실행이나 major 최종 하네스 완료를 뜻하지 않는다. 개발 소스에서 얻은 화면과 단위 결과를 `09f989953e81`의 실제 화면으로 표시하지 않는다. 행에서 `74d62` 또는 `major-dev`를 명시하지 않은 브라우저 결과는 `4d48… / 9f16aec04d6b` 및 그 이전의 역사 근거다.

441주소·18화면군은 커버리지 원장이다. 1,323장 정적 경로 시안, 882개 과거 관측 조건, 877개 기존 PNG 경로가 전수 실사용 성공이나 독립 시안 441개를 뜻하지 않는다. 한 화면군의 일부 동작 통과를 그 화면군 전체 완료로 확대하지 않는다.

## 기준선과 현재 후속 변경의 검증 경계

| 구분 | 확인된 근거 | 완료 범위와 제한 |
| --- | --- | --- |
| `74d62` 기준선 | Root `.qa/mobile-main-integrated-bundle-20261112/{build-meta.json,preview-gate.json,harness.log,harness.exit,harness.end-sha,harness.end-status}`. 하네스 종료 2026-11-12 12:31:05 UTC | 로컬 빌드·전체 타입·변경 범위 하네스 완료. 하네스의 대응 단위 검사 10suite/119개는 전체 저장소 단위 검사 수가 아님 |
| major 통합 소스 | Root `.qa/major-integration-20261112/`의 stage1/2/3/4·초점 후속 manifest | 소스 반영과 영역별 검사 단계. 같은 소스의 최종 production 빌드·전체 하네스·운영 반영은 대기 |
| 공통 헤더 실제 `major-dev` | Root `.qa/major-header-clarity-20261112/actual-2026-11-12T12-52-30-598Z/report.json`: 320/390/639/640px의 8조건 통과, 4PNG, `closed=true` | 브랜드·검색·로그인·전체 메뉴, 메뉴 초점/Tab/Escape·배경 차단의 지정 조건. 개발 UI이며 모든 화면·계정 상태 성공 아님 |
| 서재 실제 `major-dev` | Side `.qa/studio-library-major-redesign-20261112/dev-runs/2026-11-12T12-53-52.698Z-studio-major-20261112-r2-uX7Y9E/results.json`: 21조건 통과·12PNG, source before/after 동일·`endGate=true`·`browserClosed=true` | 320/390/834/1440px의 populated/empty/error와 검색·정렬·선택·보관/Undo·Back·오류 재시도. 합성 로컬 원고이며 실제 개인 원고 저장·그리기·운영 검증 아님 |
| 홈·시작 실제 `major-dev` 이미지 | Side `.qa/major-actual-first-look-2026-11-12T12-30-04-117Z/report.json`: 홈390/1440·시작390, `closed=true` | 실제 개발 화면 3PNG의 관측 기록. 이후 헤더·초점 수정을 포함한 최종 화면 또는 핵심 과업 성공 수로 승격하지 않음. Library/대화 공유와 제품 검증을 구분 |
| major 영역별 단위 | Reader 1suite/46개, Service 2suite/53개, Discover 4suite/35개, Create 4suite/43개, Create 초점 후속 1suite/27개, Header 2suite/45개 | 각 정본 로그의 독립 실행 결과만 기록. Create 43과 후속 27, 재실행·기존 검사 수는 중복 합산하지 않음. |

위 단위 로그는 Root `.qa/major-integration-20261112/{stage2-create-units,create-focus-units,stage3-discover-units,stage4-reader-units}.log`, `.qa/major-service-slot-20261112/units.log`, `.qa/major-header-clarity-20261112/unit.log`다. stage1 최초 230통과/1실패 원본은 보존한다. 해당 floating 계약 후속은 별도 12개 통과, 홈 Escape 후속은 26개 통과이며 전체 major 검사 수로 합산하지 않는다.

## 최신 major 상태 snapshot — 2026-11-12 13:49:19 UTC

이 표는 아래 정본 파일을 읽은 시각의 상태다. 이후 코드·검증은 계속 진행되며, 짧은 커밋 표기는 Root가 전달한 통합 진행 정보다. 새 최종 build/하네스나 원격 main 반영의 완료 SHA가 아니다.

| 항목 | 정본과 확인 결과 | 현재 판정·다음 반영 |
| --- | --- | --- |
| 통합 소스 | Root stage5 Title7·stage6 Drawing29·Reader 하단2파일과 후속 수정 반영. Root 보고의 통합 커밋은8f8…/e969bc9d2e까지 진행 | 최종 SHA미정·새 major build/전체 하네스 대기. `74d62` 기준선 통과와 구분 |
| 최초 집중r1과 실패 해소 | Root `final-focused-r1.log`: 28suite 중24통과/4실패,415개 중407통과/8실패(exit1) 보존. `failed-suites-r2.log`는3suite/39통과와 Hero수집 실패를 남겼고 `title-hero-r3.log`의16통과가 그 후속을 닫음 | 원8실패 관련 수정·범위별 통과를 기록하되 원본 r1/r2 결과를 성공으로 덮지 않음. 직접 확인한 UI계약 로그는 Node3/3이며 다른 실행 수와 합산하지 않음 |
| 후속 단위 | Root `.qa/major-integration-20261112/`: native-save-role26,Market detail23·sticky row3,Studio preview54·compact cover17,Title back/navigation8,Drawing floating owner8 통과. 이전 offline/market7 통과는 별도 유지 | 각각의 영향 범위 검사다. suite 중복·재실행 수를 전체 성공 총계로 합산하지 않음 |
| 마켓 실제 priority-r2 | Root `.qa/market-clearance-dev-20261112/2026-11-12T13-40-45-368Z/report.json`:320/390/834/1440px와 native details 키보드·모의 clipboard 실패/재시도5조건 통과,source불변·종료 |390 하단 바는13:31:30 관측169px→최신121px. 제품 기본 권리·가격·설치/추가 행동을 유지한 지정 개발 UI 결과다. 실제 clipboard 권한·원고 설치/저장·production 결과 아님 |
| 서재 시각r3→r6/r7/r8 | Side `.qa/studio-library-major-redesign-20261112/`: r3 quality=false/findings4 원본 보존. r6 OPFS empty390 1조건·r7 populated390/1440+empty390 3조건·r8 compact empty390 1조건은 `previewQualityPass=true`,findings0·sourcegate·종료 확인 | r8은13:44:44 UTC에 종료됐고 compact cover 단위17개도 통과. 각 run의 `visualReviewCompleted=false`는 유지한다. 자동 미리보기 품질 관측을 전 페이지 시안 충실도·개인 실제 원고 복원 성공으로 확대하지 않음 |
| Drawing 실제r2 | Side `.qa/major-drawing-browser-20261112/run-2026-11-12T13-34-02-622Z-d1547ad54c91/results.json`:6조건 통과—새 UI프로젝트·두 획/UndoRedo·기기receipt·390화면·정상닫힘. 같은 profile 재접속은 app1+about:blank1로 ownership 전제 guard 중단 | r2 당시 재접속 guard 중단/미실행 범위는 보존한다. 아래r3에서 같은profile 복원·PNG를 확인했으나4폭·모달 전체는9/17로 미완료다. r2 결과를 소급 수정하지 않음 |
| Drawing Provider/칩 후속 | Root 보고:e969bc9d2e의2파일 수정, `drawing-floating-owner-units.log` 2suite/8개 통과 | 소스 수정 뒤r3 재접속390에서 Root가 연결준비 칩 제거를 직접 확인했다. 다른 폭·모달·중요경고의 전체 실측 완료는 아니며 이전r2 성공으로 소급하지 않음 |
| Title 실제basic-r2 | Side `.qa/title-mobile-first-browser-20261112/runs/2026-11-12T13-42-05-921Z/report.json`:4폭 첫화면4PNG와320 스크롤복귀1PNG,실패진단3PNG 보존.320 지정조건만 통과,390/834/1440 가림3실패 | back48 수정(8934…)/단위8개는 별도 근거. 남은 geometry·스크롤 수집기 보정/원인 확인 중이며 QA문제나 제품 결함으로 일괄 확정하지 않음. Title/Reader 전체 완료 아님 |
| Reader 하단·원격 상태 | Reader13:08:36 개발 UI4폭 하단 노출 통과는 재사용. Root 최신 fetch main보고=`ed413b1160a8b6c335504f3701f666d9536d1a61` 변동0 | 리더 공식 회차 완주/이어읽기·native 실기기·major 최종 번들은 별도 미완료. fetch·로컬 커밋·단위 통과를 병합/CI/배포로 표시하지 않음 |

후속 단위의 정확한 파일은 `native-save-role-r2.log`, `market-detail-priority-r2.log`, `market-sticky-row-r3.log`, `studio-preview-fix-units.log`, `studio-compact-cover-units.log`, `title-backlink-units.log`, `drawing-floating-owner-units.log`다. 한 테스트가 다른 실행에 다시 포함되므로 숫자를 합산하지 않는다. 단계별 실패 원본과 새 결과는 QA handoff의 evidence 입력 SHA로 구분한다.

### Drawing r3·직접 시각검토 후속 — 2026-11-12 13:58:24 UTC

- Side `.qa/major-drawing-browser-20261112/run-2026-11-12T13-50-25-822Z-6c10a83aaae7/results.json`은 **17조건 중9통과/8실패**다. 새 UI프로젝트→두 획/UndoRedo→기기receipt/픽셀→정상닫힘→같은profile 재접속의 원고본문·receipt·픽셀 검증을 통과했다. 실제 다운로드 PNG는1440×10666px·359,900B·비백색 불투명 픽셀7,717개다. 이는 로컬 출력 존재 근거이며 모든 획/레이어 충실도·서버ACK를 보증하지 않는다.
- 종료 source42개 gate 일치·`browserClosed=true`,Root 보고의2launch 잔여프로세스0을 확인 범위로 기록한다. **원8실패는 그대로 유지**한다.320 native Tab초점 실패 이후 modal잔류/cascade 가능성은 분석 중이며,PC1440 저장44px와 QA48px 기대도 따로 분류 중이다.4폭·모달·F1 전체 성공으로 표시하지 않는다. r2의 재접속 guard 중단 원본도 보존한다.
- 별도 직접 시각검토: Root는r3 `reopened-save-390.png`에서 연결준비 칩 제거를 확인하고,Studio r8 `actual-empty-390.png`를 열었다고 보고했다. 담당service는Studio r7 populated390/1440을 직접 검토했으며 알림 겹침1건은 후속 분석 중이다. 원본r7/r8의 `visualReviewCompleted=false`를 변경하거나 지정 이미지 관측을 전 페이지 검토 완료로 확대하지 않는다.

| 화면군 | 구현 기준 | 실제 확인 | 남은 범위 |
| --- | --- | --- | --- |
| `start` 시작·내 작업 | major: 이미지 두 시작 선택·최근 작업 한 건·다른 시작/도구는 목적별 화면. 명시적 추천 복귀 초점 보완 | `major-dev` 시작390 실제 이미지와 Create 43개·초점 후속27개 단위 통과. 서재는 위의21조건/12PNG 별도 관측 | 새 최종 번들에서 이야기/캔버스 진입·추천 복귀 초점·최근 실제 원고 재진입 확인 대기. 이전 4폭20검사 및 개인작업390 원본17통과/실패는 역사 보존; 과거44px 문제를 최신 구현에서 재확인한 것처럼 표시하지 않음 |
| `authoring` 편집·저장 | major: 핵심 도구·목적별 대화상자·저장/연결 알림, 기존 저장 권위 유지 | Drawing r3는17조건9통과/8실패. 새 UI생성·두 획/UndoRedo·기기receipt·정상닫힘·동일profile 재접속 본문/receipt/픽셀·실제PNG 확인. Root 재접속390 직접 검토 |320 native Tab 실패 이후 modal잔류/cascade 가능성과PC1440 save44/QA48 기대 분류 중.4폭·모달·F1 전체 성공 아님. 서버ACK·실기기·새 production 번들·완전 출력 충실도 미검증. r2 guard 실패 원본 유지 |
| `assets` 소재·전문 도구 | 기존 구현과 별도 DCC제안 구분. 기존 로컬 자산 보존 | 가상 캐릭터12조건 통과: 선택→실제 로컬 저장 실패→입력 유지→재시도→재진입,4방향 이동/정지·포즈. 3D authored 원룸 GLB 실제 선택/배치·컷1생성·기기 저장 안내 | **V5 실제 복원 미완료**: 과거 동일 프로필 ownership lock 실패 원본 보존. `74d62` 후속은 원본 보존/복제 후 시작 탭3개(예상 원고2·about:blank1)로 guard가 동작해 제품 조작 전에 중단했다. 탭 강제닫기·프로필/lock 삭제 없이 종료했으며 실제 복원 성공 아님. 3D의 실제 원고 적용·Undo·지속 복원, 루프 자연스러움·atlas 오류/복구·다른 샘플·성능·실기기 미완료 |
| `production` 제작·팀·게시 | 샘플 체험·세 제작 목적·게시 정보3단계 | 이전184fa 기준 샘플 board→room→review·복귀/새로고침, 게시3폭25검사·6 JSON 검산 재사용 | 게시 API는 로컬 fixture. 실제 외부 게시/예약 미실행. 해당25검사를9f16에서 새로 수행했다고 표시하지 않음. 같은 상태 시안 비교 잔여 |
| `discover` 작품 찾기 | major: 검색·작품 결과 우선, 보조 콘텐츠는 이름 있는 구역. 상세 Back 문맥·Calendar요일 보존 | major 관련 4suite/35개 단위 통과. 이전 Explore13통과·원본5실패 및 Calendar/native dialog 지정 성공은 역사 근거로 재사용 | Title basic-r2는320 지정조건만 통과했고390/834/1440의 가림·스크롤 검증은 보정/확인 중이다. 리더 하단4폭 가림 후속만 지정 조건을 확인했다. 새 최종 번들의 같은 작품·뷰포트·필터·Back·모바일 밀도/표지 오류·키보드 확인 필요. 과거 자동 merge POST6은 전송 전 차단, 실제 서버쓰기0 유지 |
| `reader` 상세·감상 | major: 공식 감상·회차·읽기 문맥 우선, 보조 정보 재접근 | major 관련 1suite/46개 단위 통과. 과거 상세 이미지·외부 공식 경로와 Explore/Calendar 실제 상세/복귀는 역사 근거 | 개발 UI 리더 하단4폭 가림은 통과했고 Title basic-r2는4폭 화면 확보/320 지정조건만 통과했다. Title/Reader 전체 동선·최종 번들은 진행/대기. 새 최종 번들에서 회차·이어읽기·콘텐츠 없음/오류·복귀 확인 필요. 외부 회차 완주·인증된 읽기 성공으로 표시하지 않음 |
| `research` 참고자료·리서치 | 출처·자료 찾기·작업 복귀 문맥 | 이전 자료권리 이동/Back의 지정 조건 재사용 | 각 자료의 실제 반입·정확한 원고 적용·Undo·저장 복원 잔여. 새 독립 리서치 과업 성공 추가 없음 |
| `learn` 학습·도움말 | 목표→한 과제→자가 확인, 작은 화면 핵심 CTA | 최신7/7. 320×740 세 테마 CTA 완전 노출·48px/9점 적중,1440고대비46→48px,390 키보드 목표→과제와 Back/Forward 초점·슬라이더·경로 보존. 이전61검사(57통과/4간격결함)는 별도 재사용 | 해당4간격결함의 후속 조건만 닫음. 이전61개를 새로 전부 통과한 것으로 합산하지 않음. 큰 글꼴·740보다 짧은 화면·전체 학습 변형·실제 로그인/서버 동기화 미검증 |
| `community` 커뮤니티·쇼케이스 | 기존 공통 셸·고유 업무 유지 | 이전390 오류 상태 캡처만 재사용 | 안내/분류 과밀. 제안 HTML 준비, 로컬 파일 접근 거부로 새 PNG0·구현 미착수. 제한 우회 없음. 실제 게시/복귀·오류 재시도 잔여 |
| `market` 소재 찾기·마켓 | `74d62`: 모바일 행카드·14px 제목·보기 URL/Back·검색 명시 실행. major: 찜48px·실측 sticky 높이로 공통 하단 가림 보완 | `74d62` 실제390의 행카드 이미지/Preview·조건/권리/Back 성공, 누락 보충 run은320/834/1440 및390 오류 재시도에서28조건 중24통과. 기존 실패·동일권리 fixture 전제 보정·정적 요청 수집기 기록 보존 | 보충 실패4개는 실제320 sticky 찜46px/가림1조건과 EN 진입 미관측3조건을 구분. 가림 후속 이후 priority-r2의4폭+native details·모의 clipboard 복구5조건을 개발 UI에서 통과했고390 하단 바는169→121px다. 새 production 번들 actual은 대기. 실제 소재→현재 원고 적용→Undo→저장/재접속·지불·서버 권리 검증은 미완료. 과거 320 가로 넘침·1440 select44 수정과 원본 실패는 역사로 유지 |
| `personal` 내 공간·메시지 | major: 서재의 최근 원고·검색·목적별 관리 재구성. 계정/기기 저장 범위 구분 | `major-dev` 서재21조건/12PNG는 위 근거에 한 번만 연결. r3 품질 불통과/4건은 보존하고r6/r7/r8 자동 품질은통과/findings0으로 구분. 자동 report의 visualReviewCompleted=false는 유지하고 Root r8·service r7 지정 이미지 직접검토는 별도 기록. 알림겹침1건 분석 중. Drawing r3 기기 복원은 별도 근거 | 실제 계정 클라우드·메시지·백업 과업, 서재→실제 편집→저장/재접속 전체 동선은 미완료. 합성 원고 링크 도달을 실제 저장 성공으로 확대하지 않음. 파일 선택 거부 유지 |
| `settings` 설정·외부 연동 | 전체 메뉴의 언어·테마·음악 진입, major 모바일 헤더 브랜드·검색·로그인·메뉴 우선 | `major-dev` 헤더8조건에서 메뉴 진입/Tab/Escape·배경 차단 확인. 이전 Workspace 게스트·Learn 테마 결과는 별도 재사용 | 새 최종 번들에서 다시 찾기·언어·음악·모바일/PC 가림 재검증. 마켓 EN 보충3조건은 진입 수집기 문제로 미관측이며 최신 EN 성공으로 세지 않음. 실제 계정/모든 언어·설정 과업 미완료 |
| `trust` 정책·개발자 문서 | 공통 색·간격·포커스·기술 설명 접기 | 이전 개발자390 KO/EN·상세 안내 키보드 열기 재사용 | 정책군 전체 목차·앵커·상위 복귀·좁은 화면 본문 검증 잔여. 새 독립 과업 성공 없음 |
| `marketing` 소개·쇼츠 홍보 | 실제 영상 우선·선택 시 로드·원본/재시도 유지 | 최신12조건 통과:390의1/3/49번째3편 정상속도·seek없이 완주/206 MIME,503실패→Enter재시도,4폭 초기204/쇼츠49·src0·한 영상 로드/이전 해제·컨트롤 가림 지정 조건 확인 | 1440다운로드 가장자리와 고정 도구/OST겹침 시각 잔여, 다운로드9점 미검사. 이전49편완주는5player소스/원본49·호환21미디어SHA동일 근거로 제한 재사용; 새49편완주·Android/Safari 성공 아님 |
| `experience` 체험 | 기존 체험 유지. 실험13개는 제안 | 이 묶음의 독립 체험 화면/핵심 과업 없음 | 시작→선택→결과→다시하기·터치·모션 감소. 가상 캐릭터 일부 성공을 체험군 전체 완료로 확장하지 않음 |
| `admin` 운영자 | 역할·권한 경계 유지. 독립 앱안은 제안 | 과거44관측 조건은 게스트 인증 게이트이며 실제 운영 과업 없음 | 세션 만료·권한 거부·운영 명령·감사 흐름. 기존 승인된 인증환경에서만 검증; 게스트 차단·메뉴 숨김을 권한/운영 성공으로 세지 않음 |
| `system` 인증·상태 | major: 활성 대화상자 안으로 저장/서비스 live 이동·닫힘 복귀, 중요한 기기 공간/준비 실패 경고 유지 | Service53개 단위 통과. 소스 교차리뷰 신규 확정 High/Medium0은 실행 접근성 검증과 별도. 과거 기기receipt·503 재시도·로컬 저장 실패/복구와 V5 중단 원본 연결 | Drawing r3의 재접속/PNG는 확인됐으나4폭·모달·F1 실패 분류와Title 3폭 실패 보정·Reader 전체 동선은 잔여다. 후속 오프라인/마켓 단위7개 통과는 별도 범위다. 최종 번들 native dialog/inert·실제 낭독·오류/복귀 확인, 실제 인증·서버ACK·온라인 재연결·실기기 복구 미완료. 기기 저장을 클라우드 완료로 표시하지 않음 |
| `compatibility` 이전 주소·호환 | 기존 resolver·별칭 유지 | 이 묶음의 별칭 전용 새 과업 없음 | 리다이렉트·권한·query/hash·Back/Forward.49별칭/92동적 표본 중복 합산 금지. 기존 하네스의 HTTP30x차단은 redirect 제품 결함으로 확정하지 않음 |

## 증거 재사용과 시각 검토 범위

기존 `4d48…` 및 이전 근거의 원본 경로와 SHA-256은 [asset-manifest.json](asset-manifest.json)의 `currentLocalVerification.evidence`에 연결한다. `74d62`와 major의 추가 근거는 위 경계 표에 정본 경로를 명시했으며, 이 2문서 갱신에서 자산 명세를 새 결과로 갱신한 것은 아니다. PNG·미디어·프로필·원본 실패를 중복 복제하지 않았다. `184fa… / 1af433f9ca81` 및 이전 기준의 변경 없는 근거는 역사 결과로 유지하고, 새 실제검증과 구분한다. 218개 기존 PNG 경로 존재 확인도 전체 직접 검토를 뜻하지 않는다.

| 검토 주체 | 확인 가능한 기록 | 판정 한계 |
| --- | --- | --- |
| Root 직접 열람 명시 원장 | `root-direct-visual`: 가상 세계 복원390·authored3D배치1440의2PNG와 SHA | 두 화면의 직접 시각 검토. 전체 저장/복원 성공·전 페이지 검토로 확대하지 않음 |
| Root가 직접 열람했다고 별도 보고 | Explore 실제390와UTF-8수정 비교판,Studio390첫화면 | 원장2PNG와 합쳐 새 전수 열람 수를 만들지 않음. 실제 이미지 원본/비교 manifest에 연결하고 보고 출처 구분 |
| Root 후속 직접검토 보고 | Drawing r3 재접속390·Studio r8 empty390,각PNG/SHA는 별도QA 시각범위 명세 | 지정 이미지에서 칩 제거/화면을 확인한 범위. 원본 자동 report 플래그와 전 페이지 충실도 완료는 별개 |
| service 담당 후속 직접검토 보고 | Studio r7 populated390/1440 | 알림겹침1건 후속 분석 중. 같은 run의 자동 qualityPASS와 시각 결함 잔여를 구분 |
| 담당 agent 직접 열람 기록 | Studio7이미지,Learn4(이전 비교1포함),Promo실제12+제안2,Virtual캐릭터14,3D7 | 각 handoff에 명시된 범위만 재사용. Root 직접 검토 수가 아님. 서로 겹친 이미지를 합산하지 않음 |
| 비교/캡처는 있으나 별도 전체 직접검토 판정 없음 | Explore동일6작품 비교판,Drawingreceipt/PNG·Market raw geometry | 자동 결과·이미지 존재를 시각 충실도 완료로 대체하지 않음 |

Explore는 실제 같은6작품 ID의 제안→실제 비교만 같은 콘텐츠 비교로 사용한다. 예시 일러스트를 실제 표지로 바꾸지 않았다. 실제 작품 메타데이터·장르색과9테마 토큰은 유지한다. Learn은 같은 학습 경로의 실제 전/후 비교이며 일반 코스 시안과 완전 일치 판정이 아니다. Promo의 공통4탭·실제 상태 설명·메타데이터는 원래 시안과 의도적으로 다르다. 마켓 행카드는 사용자에게 먼저 공유한 제안 이후 `74d62`에서 실제 구현 화면을 확인했다. 가상 공간 단계별 정리는 별도 제안/부분 구현 범위로 유지하며 실제 복원 성공으로 표기하지 않는다. major 홈·시작·서재·헤더의 개발 UI 이미지는 위 정본에 연결하고 새 최종 번들과 혼용하지 않는다.

Drawing의 이번 `reopened-save-confirmed-390-1.png`/`320-1.png`는 공개 저장 시각과 실제 로컬 receipt가 일치한다. 이전 `same-profile-restored-before-receipt-390.png`는 여전히 두 획 복원 증거만이며 저장 완료 시각 근거로 승격하지 않는다. native PNG의 잉크 픽셀은 출력 존재 근거로, 모든 획/레이어의 완전한 충실도와 구분한다. 같은 원고 권위를 복제한 후속 프로필 검사를 독립 신규 생성 성공으로 세지 않는다.

API fixture·실제 로컬 저장·제작 샘플의 메모리 상태·운영 서버를 구분한다. 원본 오류/실패를 보존하고, 오류를 빈 목록으로 표시하거나 QA 전제 오류를 제품 성공/실패로 바꾸지 않는다. 자동 접근성·좌표 적중·정적 이미지가 초보자 과업 성공을 대신하지 않는다. 모든 새 브라우저 결과는 로컬 Chromium이며 Android/Samsung Internet/Safari 실기기·저사양 성능 검증은 미수행이다.

## 후속 소스·검증·배포 상태

| 단계 | 현재 근거와 상태 |
| --- | --- |
| 기준선 로컬 빌드 | **완료**: `74d62… / 09f989953e81`, build exit0·endSHA일치·clean. served/dist entry 바이트 gate는 위 preview-gate에 연결. 운영 배포 아님 |
| 기준선 전체 하네스·타입 | **완료**: `harness.exit=0`, 종료SHA=`74d62…`, 종료 작업본 clean. 전체 Web26,742/26,742 진단0·API타입 검사·구조/경계·대응 단위10suite119개 통과. ‘전체’는 하네스 명령 완료를 뜻하며 제외된 대형 테스트/원격 CI 샤드와 브라우저 전수 확인을 대체하지 않음 |
| major 통합·영역별 검증 | stage1 홈/서재/하단 가림, stage2 시작, stage3 탐색, stage4 읽기, 공통 헤더·서비스 상태와 추천 복귀 초점 후속. 각 로그·manifest를 연결하고 중복 합산하지 않음 |
| major 실제 개발 화면 | 헤더8조건, 서재21조건/12PNG, 홈·시작3PNG는 개발 소스/fixture 관측. 이미지 공유·시안 충실도·동작 범위를 구분 |
| major 최종 번들·전체 하네스 | **대기**: 최종 SHA미정. 현재 major 소스 기준 새 build/타입·하네스 결과가 없음. 그리기·Title/Reader 전체 동선 actual은 완료로 표시하지 않음. 마켓 priority-r2 5조건/리더 하단4폭·서재r6/r7/r8 품질 자동관측은 별도 기록. Drawing r3 재접속/PNG·390 칩 직접검토는 별도 확인됐지만 원8실패·4폭/모달/F1 분류와Title 3폭 실패 보정은 잔여 |
| 과거 중단 타입 검사 | 184fa에서11,318/26,739 후 공유 링크 변경으로 중단한 원본은 역사로 보존. 이후 `74d62` 전체 검사가 완료했으나 해당 과거 run 자체를 성공으로 바꾸지 않음 |
| 원격 main·필수 CI·운영 배포·운영 검증 | 각각 완료 증거 없음. 새 최종 SHA의 원격 반영·CI·승인 배포·같은 프런트 SHA 운영 검증을 따로 확인해야 함. API live/ready200이나 로컬 production=true는 최신 프런트 배포 증거 아님 |

최초33파일 관련26suite/270개,후속9suite/132개,Explore2suite/25개,타입수정2suite/42개 및 변경TS/TSX32파일 의미진단0은 역사 검사로 보존한다. 전체 저장소 타입 통과 또는 서로 독립된 총성공 수로 합산하지 않는다. 역사 `57bee8c… / aead678b8310`, `c3449c504c`의44파일·224단위, `a11d4bad06` 문구 정리·39단위도 같은 원칙으로 보존한다.

## 남은 화면군 실행 준비

기존6화면군(assets/marketing/experience/admin/system/compatibility)86주소·172관측 조건·26배치는 그대로 재사용한다. **새 route batch 실행은0**이다. 최신Promo12·Virtual12·3D부분 실행은 별도 핵심 과업 근거이며 해당26배치를 완료시키지 않는다. 전체882렌더 반복보다 실제 소재→원고 적용/복원과V5복원 차단 원인 확인을 우선한다.

다음 READY와`coverage-1worker`슬롯이 별도로 주어질 때만 첫6개 모바일 배치35조건을 순차 실행한다: `marketing-02-mobile`(2),`system-01-mobile`(6),`assets-01-mobile`(8),`experience-02-mobile`(3),`compatibility-02-mobile`(8),`admin-01-mobile`(8). 한 배치당 최대8경로·브라우저1개/worker1개이며 종료 gate와 실제 PNG를 확인한 뒤 다음 배치를 지정한다. 최신 회귀가 있는Promo는 변경 영향만 보충하며 새 전수 완주를 암시하지 않는다. 예상6–18분은 실측이 아니고 timeout이면 늘어난다. 실제로그인·권한·운영쓰기·GPU과업은 이 렌더 배치로 완료 처리할 수 없다.

Cloudflare 인증 부재, 비용 불명/유료 실행, GitHub 또는 다른 명시적 접근 거부는 우회하지 않는다. 현재 작업은 비밀 복사·외부 실제 POST·유료 API·도구 설치를 포함하지 않는다. 배포가 막히면 필요한 권한·단일 재현 명령·남은 검증을 별도로 남기며 배포 완료로 표시하지 않는다.

## 역사 기록 — 11:12 UTC 통합 검증 보충

후속 변경은 제품·테스트·문서 40파일이다. 29suite/1,157개 단위 검사는 통과했다. 이후 저장 재시도·초점 변경에 대한 11suite 중 9suite/123개가 통과하고, 라우터 누락과 비동기 호출 대기 누락이 있던 2suite는 fixture를 보완한 뒤 29개 모두 통과했다. 실패 원본은 보존했으며 서로 겹치는 테스트 수는 합산하지 않는다. 변경된 TS/TSX 33개는 전체 프로그램 문맥에서 의미 진단 0개를 확인했고, 변경 lint와 구조 검사도 통과했다. 이는 당시 전체 하네스 통과를 뜻하지 않는다. 이후 `74d62` 기준선 하네스 완료는 위 표의 별도 실행이며 현재 major 후속까지 완료한 결과는 아니다.

소유권 오류 재시도는 실패한 동일 연결만 명시적으로 초기화한다. 정상 연결·다른 종류의 실패·교체된 연결은 보존하며, 소유권 실패 상태의 미저장 컷은 다시 불러오기로 덮지 않는다. 최초 경합의 원인은 미확정이고, 새 실제 브라우저에서 저장·재접속·복구를 확인하기 전까지 V5 복원 성공으로 판정하지 않는다. 근거: `.qa/mobile-visual-followup-integration-20261112/{final-unit,closing-checks,test-fixture-followup}`.

## 2026-11-12 14:04 UTC 후속 관측

상태: **migration**. 아래는 앞선 snapshot 이후의 로컬 개발 화면 결과다. 운영 API·실기기·새 production 번들 검증으로 확대하지 않는다.

- 작품 상세 `title-mobile-first-browser-20261112/runs/2026-11-12T14-00-32-235Z/report.json`: 320·390·834·1440px와 목적별 접기/키보드, 기존 hash 열기·초점, 회차 필터·정렬·빈 결과 복구, 회차 없음·표지 실패, 로딩·오류·동일 경로 재시도 **9조건 통과**, 실패0, sourceUnchanged/브라우저 정상 종료 확인. 기존 raw9점 실패 기록은 보존했고 실제 둥근 경계 계산 및 정상 스크롤 뒤 동작을 구분했다. 7개 hash 모두 관측했으며 공식 외부 플랫폼은 열지 않았다. Root가 populated390·오류390 PNG를 직접 확인했다.
- 내 작업 연결 안내: `0ba15b765f`의 정확 `/studio` 본문 배치와 관련 **49개 단위 검사 통과**. 실행 옵션 오류로 시작하지 못한 첫 검사 로그는 보존했다. `studio-library-major-redesign-20261112/visual-runs/2026-11-12T14-02-00.768Z-studio-visual-20261112-r9-inline-LcQEmO/`의 populated390/1440·empty390 3조건 통과, 미리보기 findings0. Root가 populated390을 직접 보고 연결 안내가 목록을 덮지 않고 위쪽 본문에 놓이는 것을 확인했다. 자동 보고서의 visualReviewCompleted 필드는 변경하지 않았다.
- 드로잉 r3의 원고 복원·기기 저장 시간·PNG 성공은 유지한다. native Tab 실패 당시 focus 증거가 부족해 별도 진단 준비 중이다. 열린 도구 창이 남은 후속 실패와 PC44px/모바일48px 높이 계약의 QA 가정 차이를 구분하며, 이를 전체 통과로 바꾸지 않는다. 모바일 뒤로 버튼은 실측46×48px로 사용자 최소44px는 충족하지만 전 버튼48px 충족 주장은 하지 않는다.
- 새 통합 build/harness는 이 snapshot 뒤 실행할 예정이며 현재 완료가 아니다. 원격 main·필수 CI·운영 배포는 별도 차단 상태를 유지한다.
