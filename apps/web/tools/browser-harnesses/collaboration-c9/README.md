# C9 실제 저장 원고 계측 초안 — 2026-11-02

상태: **migration — 구문·순수 계약 검증 통과, 실제 원고 성능 실행 전**. C9 성능 통과·실행 준비 완료·운영 배포 결과가 아니다.

기존 `webtoon-collaboration-c9-measurement-contract-20261029`의 9개 파일을 별도 디렉터리로 복사해 계측 계약을 재사용했다. 기존 v2·보관 자료와 제품 main은 수정하지 않는다. 실제 원고 데이터나 인증 설정을 이 디렉터리에 넣지 않는다.

## 모드와 데이터 권위

- 기존 `synthetic-no-manuscript-images` 모드는 기존 고정 DAG와 seed를 유지한다. 합성 결과를 이미지 성능으로 표시하지 않는다.
- 새 `existing-manuscript-with-images` 모드는 이미 실제 UI·서버에 저장된 원고·고정 검수본·Production 제출본만 읽는다. `seed.mjs`는 이 모드를 파일 생성·DB 연결 전에 거절한다.
- `actualInputPath`는 실제 실행에서 별도로 수집한 0600 JSON이다. 소스 SHA, Production 프로젝트·작품·회차·작업·제출 ID, 현재 aggregate digest·수량, 계정 ID별 실제 view/comment/edit/manage 권한, 전체 sourceEvidence·revisionRef, 제품이 출력한 `toonstudio.page-manifest.v1`, 명시 페이지 수·디코드 순번·이미지 origin, 읽기 전용 DB 기준 snapshot을 요구한다.
- `sourceEvidence.selectionMode`는 이 계측 프로필에서 `document`다. 제품의 pages/frames 선택 기능을 제한하는 정책이 아니다. 페이지 수를 컷 수로 바꾸어 보고하지 않는다.
- Production 프로젝트와 Graph 프로젝트는 구분한다. 출력 manifest의 top artifact는 출력 대상이며 각 페이지의 source artifact·review·revision과 혼동하지 않는다.
- 원고 페이지·검수본·실제 이미지가 없으면 실패한다. 빈 pages/doc를 삽입하거나 측정 중 capture를 만들어 누락 자료를 대신하지 않는다.

실제 입력의 예시는 `actual-input.test.mjs`의 합성 단위 fixture로 구조만 확인할 수 있다. 그 fixture는 실행 입력이나 서버 저장 증거가 아니다. `config.example.json`과 build evidence 예시의 REPLACE 값도 실행 증거가 아니다.

## 기존 계약과 추가 관측

기존 소스 SHA·clean, 별도 QA cluster·계정, 실제 AppShell 초기화, 측정 중 GET/HEAD/OPTIONS 외 요청 차단, DB 불변 snapshot, production dist와 실제 요청 자산의 바이트 대조를 유지한다. 실제 자료에는 기존 revision/event/receipt의 절대값 0을 요구하지 않고 기록된 기준에서 전후 delta 0을 요구한다. 계정의 권한은 역할 이름으로 추정하지 않는다.

자체 서명한 로컬 QA 이미지 저장소는 actorConfig의 `storage.certificatePath`에 공개 서버 인증서만 지정한다. 인증서는 승인된 `expectedPgData`의 부모인 QA infra 안에 있어야 하며, `storage.qaOnly: true`와 실제 원고의 HTTPS loopback 이미지 origin 일치, 유효 기간·호스트·leaf 인증서를 확인한다. 브라우저에는 이 인증서의 SPKI 한 개만 허용한다. 인증서 설정이 없으면 기본 시스템 신뢰를 사용하며, 운영체제 신뢰 저장소를 바꾸거나 전역 TLS 오류 무시는 사용하지 않는다. 결과에는 공개 인증서 hash와 신뢰 모드만 기록한다.

실제 검수 경로의 `검수 제출본` 선택과 `고정 제출 원고 이미지` 패널을 사용한다. 패널 첫 목록·전체 목록·첫 이미지 decode는 같은 패널 열기의 별도 milestone이며 서로 겹친다. 명시한 나머지 순번은 실제 select 조작 뒤 decode한다. 정상 DOM을 읽기만 하며 원고·상태·가짜 이미지 요소를 주입하지 않는다.

`img.decode()`, complete, natural 치수, mapping의 render 치수, 실제 viewport·상위 스크롤 영역 안의 가시성과 두 번째 rAF를 관측한다. 이것은 decode 관측이며 GPU 업로드 완료·정확한 paint·VRAM·RSS·peak·장시간 누수 증거가 아니다. JS heap/DOM은 열기 전·전체 목록과 첫 decode 뒤·나머지 순회 뒤를 구분한다.

서명 URL은 메모리에서만 다룬다. 사전 실제 GET에서 검증한 이미지 origin·pathname만 요청 예외로 두며, 측정 뒤 실제 관측 API가 반환한 현재 전체 URL과 이미지 bytes/hash/길이를 다시 대조한다. 다른 origin·경로·source tuple·hash는 거절한다. 서명 query의 갱신과 같은 이미지 bytes를 여러 순번에서 사용하는 정상 경우는 구분한다. 결과·오류에는 URL·query·쿠키·비밀번호·원문 응답을 저장하지 않는다.

응답 본문·바이트 hash 검증은 semantic 시각을 관측한 뒤 수행한다. `sourceOrdinals`는 하나의 이미지 응답을 공유한 원고 순번이며 HTTP 응답 수를 원고 페이지 수로 세지 않는다. 동일 열기의 milestone 결과 파일 쓰기는 순차 처리한다.

## 남은 필수 검증

2026-11-02에 Node 24.22.1의 MJS 13개 구문 검사와 순수 계약 시험 42개가 실제 종료값 0으로 통과했다. 실패·취소·건너뜀은 0개이며, 시험은 단일 파일 worker 순서로 실행했다. DB·HTTP·API·브라우저·타입·빌드는 실행하지 않았다. 이후 검증도 단일 manager와 자원 구간을 조율한다. 이후 현재 SHA의 실제 production build·preview, 실제 Me/Auth·새 QA cluster·계정, 실제로 저장된 원고/검수본/제출본/이미지 입력과 별도 실행 구간이 필요하다. 이 디렉터리에는 서버 생성·원고 seed·자료 삭제·배포 명령이 없다.

임의 p95/메모리 합격 예산을 추가하지 않는다. 원시 표본과 조건을 기록하고 `qualified:false`를 유지한다. 작은 표본 p95를 실서비스 모집단으로 해석하지 않으며, 통제 자동 실행과 실제 제작팀의 현장 결과를 구분한다.
