# 실제 6패스 LT 원고 저장·전달 구현과 검증 경계

- 상태: **migration — 승인 범위의 로컬 구현·최종 회귀·화면 왕복 검증 완료, 운영 미반영**
- 최신 main 결합과 CI 범위: [통합 검증 기록](bg3d-six-pass-main-integration-2026-11-05.md). 아래 결과는 명시한 원본 검증 시점의 기록이다.
- 작성일: 2026-11-05
- 기준 SHA: `fa68e24ef8b100f8971fbd402714e5d7c3287d4e`
- 작업트리: `codex/bg3d-six-pass-handoff-20261104`
- 승인: 실제 분리 픽셀·scene/project v4 선행 승인과, 2026-11-05 추가 CRDT·에셋 계약 구현 승인.
- 운영 DB 적용·외부 object 업로드·배포·환경변수·유료 quota 변경은 실행하지 않았다.

## 1. 최초 스테이징과 이번 구현의 차이

[최초 조사](bg3d-staging-persistence-audit-2026-11-04.md)의 관통 개구부·몰딩 생성과 2점 투시
카메라 콜백은 중복 구현하지 않았다. 태양광·단면·스타일·태그·연속 컷·Mangaka 패널의 계산과
예제 계획을 실제 장면 편집·외부 서비스 연동으로 승격하지 않았다.

이번 보강은 실제 여섯 PNG를 생성하는 선행 캡처를 제품 원고의 저장·복원 권위에 연결한다.
기존 일반 LT의 실시간 병합 동작과 기존 3D line-pass 저장 계약은 계속 사용한다.

## 2. 새 묶음의 저장·편집 경로

```text
같은 제품 모달의 실제 WebGL 캡처·LT Worker
 → PNG 6장: CRC/IHDR/hash/바이트/실제 이미지 디코더 검증
 → native OPFS CAS: 6 PNG + scene v4 + canonical manifest
 → 저장된 본문 재읽기·영수증 확인
 → 저장된 작품이면 준비 API → 7역할 본문 → 봉인 API·작품 영수증
 → 기존 권한·페이지·문서 세대 재확인
 → 기존 원고 commit: 6요소·그룹·Scene/Shot·Stage·line index·bundle state
 → CRDT 그림자 문서 전체 전이 검증 → 기존 Y 문서에 단일 업데이트
 → 수신자: 작은 immutable revision 참조 → 7본문 검증 → 한 frontier 재조정
```

- 본문은 CRDT 메시지에 넣지 않는다. scene 320 KiB·manifest 8 KiB와 CRDT 메시지 예산은
  별도 검사한다. 원고 전체 전이가 메시지 한도를 넘으면 실제 Y 문서를 바꾸기 전에 거부한다.
- 원고를 계정 작품에 처음 저장할 때는 기존 임시 작품 provision·update·promote 경계를 재사용한다.
  보존된 모든 native revision의 7본문을 먼저 검증하고 같은 임시 work ID에 부모 순서대로 봉인한 뒤
  원고 저장·승격을 진행한다. 레이어를 모두 삭제한 retained-only 원고도 이 경로를 사용한다.
  기존 작품에 가져온 v5 파일의 저장과 REST 작품 재열기도 같은 cloud helper에서 처리한다.
  이 연결은 로컬 행위 회귀와 DB 계약으로 확인하며 운영 로그인 UI 성공으로 표시하지 않는다.
- stable bundle·group·role 요소 ID와 사용자가 바꾼 이름·opacity·blend·visible을 보존한다.
  재캡처는 새 immutable revision과 기존 line-pass revision 번호를 함께 결박한다.
- main-line은 기존 `studio-opfs-cas:`와 linked-render index를 유지한다. 나머지 다섯 장은
  `bg3d-lt-artifact://sha256/…`이며 브라우저 표시 때에만 검증된 Blob URL로 바뀐다.
- 본문 owner 반영과 원고 commit이 거부되면 이전 owner refs로 보상한다. 준비 본문을
  만들었다는 사실만으로 원고 저장 완료를 표시하지 않는다.
- 원격 봉인 뒤 원고 commit이 거부돼도 서버 본문을 되돌려 삭제하지 않는다. 알려진 묶음의 다음
  명시적 적용은 view ACL 아래 봉인 chain을 읽고, 로컬 이력이 정확한 부분집합인지 대조한 뒤
  누락된 7본문을 검증·복원한다. active·현재 레이어는 유지하고 새 child와 복구된 registry를
  같은 원고 전이에 포함한다. 모든 복구 owner와 새 owner는 commit 거부·예외 때 이전 참조로 보상한다.
- 실행 취소 뒤 재캡처는 활성 revision과 별개로 보존 chain의 마지막 revision을 부모로 선택한다.
  선화 번호는 마지막 보존 장면·주선 픽셀이 바뀔 때만 증가시키며 이전 snapshot은 바꾸지 않는다.
- undo/redo는 기존 history를 사용한다. 같은 문서의 snapshot에는 immutable 원본 revision을
  보존하고 active 포인터만 되돌린다. 새/open/import의 전체 문서 교체에는 이전 원본을 섞지 않는다.

핵심 구현은 Creator의 [6패스 저장 모듈](../../apps/web/src/domains/creator/scene3d/bg3d-six-pass/),
[원고 삽입 adapter](../../apps/web/src/domains/creator/studio-cuttoon-editor/studio-cuttoon-bg3d-insert.ts),
[CRDT 수신 경계](../../apps/web/src/domains/creator/live/studio-crdt-frontier-reconciliation-binding.ts)다.

## 3. 파일·복구·구버전·권한 경계

- 새 native bundle을 가진 원고만 project v5를 요구한다. scene은 v4다. 기존 v2·v3·v4는
  일괄 변환하지 않으며 일반 이미지 8 MiB·기존 row 12 MiB 제한도 유지한다.
- `.toonproject.zip`은 retained revision까지 포함한 7본문을 digest별로 중복 제거한다.
  모든 stat·합계 한도를 본문 읽기 전에 확인하고, 가져올 때 전체 검증·두 CAS 복원·owner 준비
  뒤 문서를 한 번 적용한다. 실패하면 현재 원고를 유지한다.
  현재 남은 요소는 marker를 지워도 보존 manifest가 예약한 ID를 기준으로 활성 revision·역할·
  이미지 타입·source·그룹·분리 출력 표시를 검사한다. 일부/전체 레이어 삭제와 비활성 이력 보존은 허용한다.
- v5 ZIP만 최대 544 MiB·첨부 합계 512 MiB다. 기존 버전의 280 MB/256 MB 한도는 유지한다.
  이것은 운영 사용자 저장 quota를 늘리는 설정이 아니다.
- 자동 복구는 별도 v5 wrapper로 구형 reader의 overwrite를 막고, 실제 pages 적용 전
  manifest·모든 PNG·scene·기존 line CAS를 재검증한다.
- 구형 `.toonstudio` formatVersion 1에는 새 본문을 넣는 계약이 없다. 불완전 내보내기·복구를
  거부하고 `.toonproject.zip` 경로를 안내한다.
- 일반 작품의 CRDT v8은 유지한다. retained bundle 작품은 별도 reader capability를 요구한다.
  서버 join/sync/write·REST 본문 저장/복원에서 구형 reader를 거부한다. 최신 CRDT registry도
  같은 DB transaction에서 검사하여, 이전 REST baseline에 없는 첫 commit 원본도 보호한다.
- 동일 origin 탭은 native OPFS를 공유한다. origin 영수증을 원격 권한으로 쓰지 않으며 P2P
  경로에는 보내지 않는다. 원격 작품은 실제 작품 영수증이 확인된 revision만 허용한다.

## 4. 현재 지원 범위와 운영 영향

- v1 원본 scene은 기본 도형만 지원한다. 외부 model node·첨부가 있으면 거부하며 원본 파일을
  버리고 저장 성공으로 처리하지 않는다. 문서 마스터와 미지원 renderer도 분리 출력을 허용하지 않는다.
- 기본 6패스의 합성 모드는 실제 Canvas와 SVG 썸네일에서 확인했다. 사용자 지정 Canvas 합성 모드는
  보존하며, CSS로 동일하게 표현할 수 없는 SVG 썸네일 합성은 안내 placeholder로 표시한다.
- native 묶음에서 일반 LT로 바꾸는 작업은 새 원격 픽셀 입장이 보장되지 않아 적용 전에
  명시적으로 거부한다. 기존 일반 LT 자체의 제작 경로는 유지한다.
- native 묶음의 직접 복제·복사/잘라내기·붙여넣기는 새 요소 ID의 봉인 계약이 없으므로
  안내하고 거부한다. 실제 픽셀 편집에는 원본을 보존하는 기존 정적 래스터 복사본 경로를 사용한다.
- 원본 페이지 전체 삭제는 보존 registry의 폐기 계약이 없어 원고 commit 전에 거부한다. 서버도
  registry를 버리는 REST overwrite/과거 작품 복원을 거부한다. 같은 페이지 안의 일반 레이어 삭제는
  undo 이력과 원본을 보존하며 허용한다.
- 원격 저장은 기존 asset opt-in과 준비된 DB schema가 필요하다. 권한·정책·남은 저장/일일
  업로드 한도를 재사용하고 실패 시 자동 증액·운영자 과금·자동 재시도를 하지 않는다.
- 봉인 metadata가 참조하는 원격 본문은 기존 private object CAS의 `source` purpose를 재사용한다.
  주선의 일반 work-asset 8 MiB 행을 중복 요구하지 않는 예외는 동일 transaction에서 봉인한
  native 원본과 정확한 page·bundle·요소·hash·바이트·치수를 검증한 입장 증거에만 적용한다.
  검토안의 `derived` 별도 복사 대신 기존 업로드 권한·서명 읽기·quota 경로를 유지하며, 운영 object는
  업로드하지 않았다.
- 승인한 추가형 `0121` SQL은 두 metadata 테이블을 만든다. Drizzle 정의는 기존 Studio
  raster schema에 포함했다. 불변 SQL 한 파일만을 위해 API DB 소스 상한 173→174를 기록했고,
  Creator 직하·파일 크기·교차 앱 경계 예산은 올리지 않았다.
- 운영에 코드만 먼저 반영하면 새 테이블을 요구하는 readiness·quota 검사에 영향이 있다.
  운영 적용 시 migration/코드 순서·롤백 대상·기존 정책/ACL을 별도 승인·검증해야 한다.
- 완전 신규 배경의 첫 봉인 뒤 commit이 실패하면 해당 bundle은 원고 ID를 얻지 못한 채 서버에
  남을 수 있다. 다음 신규 배경은 별도 bundle이다. 이 경우도 숨겨진 자동 삭제·무료 quota로 처리하지 않는다.
- 준비 중 revision도 예약 byte quota에 포함한다. 같은 ID로 명시적 재개가 가능하며 임의 취소·
  자동 GC·보관기간·provider 객체 물리 삭제 정책을 이번 변경에 추가하지 않았다.

## 5. 검증 기록과 완료 판정

실제 화면 증거는 Chrome for Testing `156.0.8078.4`, ANGLE Metal Apple M2 Max,
1600×1200의 격리 guest 원고에서 얻었다. API는 503 offline mock이며 운영 사용자 데이터와
외부 HTTP 요청을 사용하지 않았다. 아래 원고 흐름은 실제 제품 메뉴·모달·파일 입력·다운로드를
사용했다. Node 합성 PNG 및 인메모리 native-interface 단위 테스트를 이 증거에 합치지 않는다.

| 실제 제품 검증 | 결과 |
| --- | --- |
| 장면 도우미 → 개구부·몰딩·동적 소품·2점 투시 → 실제 GPU 6패스 → 같은 원고 | 22개 객체, 약 7.594초 후 이미지 6개·그룹 1개 |
| 패스 원본과 실제 Stage 표시 | PNG 각각 3155×2160, native PNG 디코드 RGBA와 Stage 이미지 RGBA 해시 6개 일치 |
| 캡처 전에 빈 native index를 연 두 번째 탭 | 이미지 6개·원본 장면·동일 픽셀 수신 |
| 두 탭의 실행 취소·다시 실행 | 이미지 0개 → 6개, 동일 픽셀·장면·bundle state 복원 |
| 실제 ZIP 내보내기·새 BrowserContext에서 정식 가져오기 | project v5, 2,957,697bytes, 이미지 6개·그룹 1개·native 8본문 복원 |
| ZIP에서 정식 3D 배경 재편집 | 객체 22/22, 카메라 38°, lensShift X=0/Y=0.12 복원 |
| 최신 소스로 같은 실제 GPU ZIP 재열기 → 정식 2배 원고 PNG 다운로드 | 1440×2160, 1,016,368bytes, 원고 합성 출력 성공 |
| 오류·표시 경계 | 성공 flow의 pageErrors 0, 외부 HTTP 요청 0, 360px sidebar 가로 overflow 없음 |

최종 원고 PNG의 SHA-256은
`f28bd7ad383db4d2db08acebf5ee67ddf045d1a872b0ef267d4428c12ef03188`이다.
썸네일은 실제 표시 bounds×DPR만 decode하며 원본 PNG와 Stage 해상도는 유지한다.
PNG 출력 뒤 resident surface 예약은 `166,488,437 / 268,435,456`bytes로 돌아왔다.
이 숫자는 모듈의 예약량이며 브라우저 RSS·GPU 전체 메모리 상한 측정값이 아니다.

추가 화면 검증에서 빈 기본 3D 창의 빠른 열기·닫기만으로도 같은 Canvas에 WebGL2를 먼저
획득하고 뒤늦은 WebGPU가 null context를 사용하는 오류를 재현했다. WebGPU 선택 상태에서
factory가 없는 일시적인 ready 상태에는 Canvas를 입장시키지 않도록 8줄 helper와 viewport 조건을
보강했다. 명시적 WebGL2 경로와 기존 XR 정책은 유지한다. 수정 후 같은 빠른 열기·닫기 3회,
기존 3D context 요청 5회에서 WebGPU/non-null만 관측했고 context 혼입·page error는 0이었다.
이 진단은 출력용 GPU 캡처 없이 수행했다. 이후 새 브라우저에서 실제 캡처 1회로 위 표의
전체 flow를 처음부터 다시 실행했고, 처음 표시·다른 탭·redo·새 문맥 재열기·3D 편집기 종료의
5개 시점 모두 native/Stage 픽셀·장면·state·legacy index가 같았다. 최종 `final-clean` 실행은
page error·자동화 명령 오류·외부 HTTP 요청이 모두 0이며 이전 오류 flow와 합치지 않는다.
격리 API 503 mock의 예상 network console 로그는 남아 있고 운영 API 성공 증거로 쓰지 않는다.

첫 실제 실행의 고정 1초 화면 검사에서 5장만 관측한 실패와 자동화 선택자 오류는 별도 기록으로
남긴다. 이후 전체 flow에서 6장 모두의 실제 표시·픽셀·왕복을 확인했다. 기존 실제 GPU ZIP을
재사용한 진단도 별도로 보존했다. 마지막 `final-clean` 전체 검증에서는 새 실제 GPU 캡처 1회를 사용했다. 마지막 ZIP SHA-256은
`1a2d56ed146e51e3a06deadab59901016fd644d031319b11ddf8eea9ac8a66c8`이다.

- 최종 관련 Vitest **107파일 1,416개**가 통과했다. 일반 도형·카메라·LT, native 6패스,
  파일/자동 저장·실행 취소·재캡처·두 CAS·원격 봉인·실패 복구·계정 작품 승격과 구 reader 거부,
  실제 Web CRDT publisher → API 입장을 포함한다. 전체 저장소의 모든 테스트를 실행했다는 뜻은 아니다.
- `pnpm harness:verify`는 변경 파일 ESLint·Secretlint, architecture·source layout·파일 크기·
  Studio eager graph, Web 전체·API·work-session browser tools·Postgres tools TypeScript 검사를
  포함한다. 마지막 renderer 수정까지 포함한 최종 소스에서 **exit 0**을 확인했다.
  Studio eager graph는 20012.8 KiB이며 파일 크기·eager 기준선을 늘리지 않았다.
- 분리한 로컬 PostgreSQL 17에서 migration 신규 적용·재실행, 7본문 봉인, quota·view/write ACL,
  구형 reader 거부, registry overwrite 거부, 최신 CRDT 보존, 같은 부모의 봉인 경쟁,
  보존 tip 2를 부모로 한 revision 3 생성, 미게시 봉인 이력 복구,
  임시 작품 생성→native 7본문 봉인→원고 갱신→승격까지 **11개 통합 검사**를 통과했다.
  일반 자산 행이 0개인 native 원고의 저장·승격 성공과 미봉인·다른 작품 원본·구 reader 거부,
  일반 LT의 업로드 누락 거부를 함께 확인했다. 마지막 타입 명시 뒤 두 파일을 다시 실행해
  PG 11개와 draft repository 회귀 19개, 합계 30개도 exit 0을 확인했다.
  운영 DB·운영 object 업로드·원격 로그인 제품 UI의 증거가 아니다.
- 선행 native SKP golden은 자체 생성한 삼각형 한 면·카메라 세 개의 제한된 코퍼스다.
  `.skp` 일반 파일군·전체 재질·동적 구성요소·native SketchUp 재열기 호환을 보증하지 않는다.
- 현재 작업트리에서 Blender 5.2.0 LTS(`fbe6228777e7`)의 기존 adapter 통합 검사를 1회
  실행하여 exit 0을 확인했다. 자체 `.blend` 저장·재열기, 원본 파일 hash 불변,
  frame 7·96×80 PNG, evaluated mesh GLB 48 triangles, 선화 검정 81/흰 7,453픽셀,
  Shape Key, compositor 주 이미지·추가 파일 출력 차단 및 카메라 누락·충돌 modifier·script 모드
  거부를 검증했다. test/adapters 4개 소스 SHA-256과 실제 결과를 별도 metadata에 결박했다.
- Blender adapter의 실제 `.blend` 시험과 내부 primitive 제작·카메라·6패스 검증을 구분한다.
  Blender modifier stack·Geometry Nodes·compositor를 웹에서 native 편집하거나 SketchUp·Blender
  전체 기능과 동등하다는 의미가 아니다. Higgsfield 외부 서비스 실행은 검증하지 않았다.


## 6. 원본 검증 시점의 산출물과 적용 상태

- 브라우저 최종 실행·픽셀 비교: `handoff-v5-final-clean-summary.json`,
  `handoff-v5-final-clean-verification.json`. 실패한 이전 실행과 결과를 합산하지 않았다.
- 실제 프로젝트: `handoff-v5-final-clean-real-six-pass.toonproject.zip`.
  실제 원고 PNG: `handoff-v5-final-clean-webtoon-2x.png`.
- 브라우저 production 소스 9,660개와 최종 검증 대상 변경 파일 235개의 SHA-256이
  실제 테스트 후 파일과 일치했다. 전체 Git 변경과 검증 로그는 별도 evidence index·patch로 보존한다.
- 원본 검증 당시 작업 브랜치: `codex/bg3d-six-pass-handoff-20261104`, 기준 HEAD
  `fa68e24ef8b100f8971fbd402714e5d7c3287d4e` 위의 검토 가능한 미커밋 변경이다.
  이 후속 작업에서 새 커밋·push·PR·병합·운영 migration·배포는 실행하지 않았다.
- 사업계획서에 사용할 수 있는 범위는 “내부 기본 도형 기반의 3D 배경을 실제 6개 LT 래스터
  레이어로 출력하고, 원고 삽입·동일 브라우저 origin의 두 탭 동기화·실행 취소/다시 실행·
  3D 재편집·자기완결 ZIP 저장/재열기·PNG 출력을 개발환경에서 검증했다”이다.
  계정 작품 저장·승격·원격 재열기의 코드와 로컬 통합 검증을 운영 계정 UI 성공으로 표시하지 않는다.
