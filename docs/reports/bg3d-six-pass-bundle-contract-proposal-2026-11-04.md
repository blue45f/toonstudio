# 실제 제품 6패스 LT 묶음 전달 계약 검토안

- 상태: **migration — 2026-11-05 사용자 구현 승인, 로컬 구현·검증 완료, 운영 미반영**
- 최종 구현·검증 보고: [2026-11-05 결과](bg3d-six-pass-bundle-implementation-2026-11-05.md). 아래는 승인 당시의 검토안이다.
- 작성일: 2026-11-04
- 조사 기준: `650beb41c1269dfd978757e288134f7037956a1c`와 별도 로컬 캡처 수정
- 구현 기준: `fa68e24ef8b100f8971fbd402714e5d7c3287d4e`의 독립 작업트리
- 추가 승인: 2026-11-05 사용자가 CRDT·에셋 계약의 코드·migration 파일·로컬 검증 진행을 승인했다.
- 선행 승인: scene/project v4 로컬 저장 계약과 실제 분리 픽셀 생성
- 이 검토안: 선행 승인 범위를 넘어서는 work asset·CRDT 전송·원격 복원 계약
- 운영 배포·실제 DB 변경·환경변수·유료 자원 변경은 이 검토안의 구현 승인에 포함하지 않는다.

## 1. 확인한 제품 실패

실제 새 guest 원고에서 22개 도형·2점 투시·WebGL2·6패스를 적용해 출력했다.
캡처와 Worker는 통과했지만, 원고 콜백은 실시간 표면이라는 이유로 거부했다. 레이어는 0개다.

새 원고의 `!workId`는 live jam으로 분류된다. 저장된 로그인 작품도 서버 협업 정본을 사용한다.
따라서 “일반 페이지”를 `isRealtimeTeamSession=false`로 판정한 기존 조건으로는 주요 제작
경로를 지원할 수 없다. guest 여부·연결 끊김·일시적인 runtime null을 로컬 문서 모드로
해석해 우회하지 않는다.

기존 일반 LT의 실시간 합성 저장 동작과 도형 삽입·카메라 적용 콜백은 유지한다.

## 2. 기존 계약을 그대로 사용할 수 없는 이유

| 경계 | 현재 사실 | 실제 6패스에 필요한 보강 |
| --- | --- | --- |
| 원고 CAS | main-line 한 장의 strict descriptor·receipt만 생성 | 여섯 본문·원본 scene을 함께 확인하는 bundle receipt |
| 로컬 이미지 CRDT | topology reference로 일부 속성만 전달 | 원격에서 실제 본문과 role·bundle·blend를 복원할 manifest reference |
| generic 이미지 입장 | 기본 opt-in 비활성, 이미지별 비동기 업로드 | 렌더 요청으로 명시한 여섯 장의 원자 batch |
| 기존 atomic batch | LayerLift background/foreground 두 역할 고정 | 독립된 6패스 역할·개수 계약 |
| work asset 변경 | immutable source의 같은 요소 ID 교체 거부 | 요소 ID는 유지하고 immutable render revision을 교체하는 명시적 계약 |
| 공유 원본 | Shared Stage는 sourceHash reference, scene 본문 아님 | hash와 일치하는 complete scene v4 본문·shot·link 복원 |
| 구버전 보호 | 로컬 파일 reader v4 보호 | CRDT peer·서버에서 새 bundle 계약 지원 여부 확인 |

관련 소스는 `studio-crdt-page-bridge.ts`, `studio-work-asset-admission.ts`,
`packages/contracts/src/studio-work-asset-contract.ts`, `studio-work-asset-edit-guard.ts`,
`studio-cuttoon-bg3d-insert.ts`다.

## 3. 권장 최소 구현

### 조건부 manifest와 immutable render revision

새 6패스에만 별도 `bg3d-lt-bundle` 계약을 적용한다. 기존 이미지나 기존 문서를 일괄 변환하지 않는다.
manifest는 PNG 본문을 담지 않고 다음 정보를 묶는다.

- 계약 버전과 최소 reader 요구
- 안정적인 `bundleId`와 새 `renderRevisionId`
- 정확히 여섯 role의 요소 ID, 본문 asset reference·SHA-256·byte length·PNG 크기
- role별 blendMode·opacity·visible
- complete scene v4의 본문 reference·sourceHash·active shot
- 기존 canonical line-pass descriptor와 Shared Stage·linked-render 연결

본문은 기존 CAS·work asset 저장소에 immutable하게 보관한다. scene reference만 만들고
본문 저장을 생략하거나 beauty 한 장을 여섯 역할로 복제하지 않는다.

### 준비 후 단일 문서 전이

1. 실제 GPU 결과 여섯 장의 hash·IHDR·길이와 scene 정본을 검증한다.
2. 기존 업로드·예약·보상 패턴을 재사용해 여섯 본문과 manifest를 준비한다.
3. 모두 준비됐다는 동일 bundle receipt를 받은 뒤 기존 권한·페이지·문서 세대를 다시 검사한다.
4. 여섯 요소·그룹·scene·Stage·link·revision을 기존 command/history/CRDT 권위에서 한 번에 반영한다.
5. 수신 탭은 manifest와 본문 hash를 확인해 전체 묶음을 복원한다. 일부만 도착하면 준비 상태를
   표시하고 완성된 여섯 레이어로 취급하지 않는다.

실패·응답 유실 시 임의로 새 요청을 반복하지 않는다. 동일한 준비 영수증과 idempotency key를
재사용하며, 문서 반영 전 취소·실패는 원고 레이어를 변경하지 않는다.

### 재캡처·실행 취소·다시 실행

재캡처는 같은 bundle·요소 ID와 사용자의 presentation을 유지하되 새 immutable 본문·render
revision을 준비한다. 원고 전이는 이전/새 manifest reference를 교체한다. history가 참조하는
이전 본문은 실행 취소가 끝났다는 이유로 삭제하지 않는다. 다른 탭에서도 동일한 revision과
레이어 집합으로 수렴해야 한다.

### 지원과 크기 제한

Three WebGL2의 검증된 불투명 표준 재질부터 지원한다. 미지원 renderer·재질·마스터는 기존처럼
명시적으로 거부한다. 저장 공간·단일 본문·전체 batch 예산은 GPU 제출과 업로드 전에 확인한다.
해상도 축소, 합성 한 장으로의 자동 전환, 업로드 제한의 조용한 상향으로 해결하지 않는다.

기존 cloud image 8 MiB와 canonical line artifact 64 MiB는 같은 계약이 아니다. 검토안의
전용 artifact 한도는 PNG 한 장 64 MiB, 여섯 PNG 합계 최대 384 MiB다. 이는 8Mpx 결과를
품질 축소 없이 검증하기 위한 최대 입력 한도이며 실제 PNG 크기는 별도로 계산한다.
scene·manifest는 기존 정본 JSON 예산을 넘지 못하게 별도 검사한다. 이 값은 운영 사용자
quota·요금제 승인과 같지 않으며, 실제 운영 한도·보존 비용은 배포 승인 전에 다시 확인한다.

### DB와 API에 필요한 최소 추가

현행 `creator_work_asset`에는 image 8 MiB와 모든 행 12 MiB 등의 SQL CHECK가 있다.
64 MiB artifact를 이 테이블의 기존 image 행으로 저장할 수 없다. 기존 image 제한을 넓히지
않고 다음 별도 namespace와 추가형 metadata 테이블을 사용한다.

- 새 `creator_work_bg3d_lt_bundle_revision` 테이블: work/bundle/revision identity, 소유·권한 범위,
  manifest hash·object reference, 준비 영수증·상태, 이전 revision reference를 저장한다.
- 새 `creator_work_bg3d_lt_bundle_artifact` 테이블: revision에 속한 여섯 PNG와 canonical scene JSON의
  역할·hash·object reference·크기를 정규화해 결박한다. canonical scene은 기존 320 KiB 예산을
  재사용하며 manifest와 서로 일치해야 한다.
- PNG·scene·manifest 본문은 기존 private object/CAS와 `creator_asset_storage_object`를
  재사용한다. 이 object 계약은 이미 generic contentType·derived purpose·5 GiB object 한도를
  지원한다. 기존 image 행의 payload·type·SQL CHECK나 이전 파일은 변환하지 않는다.
- 전용 준비/확정 API: 여섯 PNG의 역할·hash·IHDR·크기·합계와 scene을 검증하고 기존 batch
  transaction·object 보상 패턴을 사용한다. generic image ingest의 8 MiB 우회를 만들지 않는다.
- 새 bundle에만 CRDT manifest reference·최소 reader admission을 적용한다. 기존 이미지
  peer 계약을 전부 새 버전으로 바꾸지 않는다.

이는 추가형 migration 파일·공통 DTO/validator·API/service·클라이언트·peer 복원 테스트의
코드 변경을 요구한다. 이 검토안의 승인은 그 구현과 로컬 검증에 대한 것이며, 실제 운영 DB에
migration을 적용하거나 object를 업로드하는 승인은 아니다.

## 4. 저장·호환성 영향과 승인 경계

- 기존 scene/project v2/v3와 이미 저장된 v4 파일을 일괄 재작성하지 않는다.
- 새 원격 bundle을 담은 프로젝트만 **조건부 project v5**로 저장한다. scene은 v4를 유지한다.
  현재 설치된 v4 reader는 모르는 optional manifest를 무시할 수 있으므로 단순한
  `minimumReader` 필드만으로 보호할 수 없다. 기존 로컬 6패스 v4 파일은 일괄 승격하지 않는다.
- 새 bundle만 새 asset/CRDT 계약을 쓴다. work에 retained bundle이 생긴 경우 websocket·REST
  쓰기·snapshot 재열기에 `bg3d-sixpass-bundle.v1` capability를 요구한다. 미지원 peer는 업데이트를
  요구하며, 일부 레이어·메타데이터를 버린 문서로 편집을 계속하지 못하게 한다.
- 일반 작품의 기존 CRDT v8 프로토콜은 유지한다. 전역 v9 변경으로 6패스 없는 작품의 구앱까지
  모두 차단하지 않고, retained bundle이 있는 작품 단위의 feature admission을 추가한다.
- 기존 v4 로컬 파일에 원격 bundle 영수증이 있다고 추측하지 않는다. 원격으로 전달할 때 실제
  여섯 본문을 입장시키는 준비 단계를 수행한다.
- 정상 이미지·일반 LT·기존 LayerLift 두 장 계약을 새 여섯 장 계약으로 바꾸지 않는다.
- API·저장소 schema 변경은 로컬 구현·테스트 범위로 검토한다. 실제 운영 DB migration과
  배포, 데이터 재작성·삭제, 환경변수·유료 quota 변경은 별도 승인 대상이다.

## 5. 완료 검증

- 실제 제품 모달 → 같은 원고의 6층/1그룹, 픽셀·role·blend·opacity 확인
- 단일 undo/redo와 재캡처 후 요소 ID·사용자 presentation 보존
- 다른 독립 탭/클라이언트에서 여섯 본문과 scene·shot·link 복원
- 부분 업로드·응답 유실·권한/페이지 변경·quota 거부에서 부분 원고 반영 없음
- ZIP·로컬 복구·새 브라우저 재열기와 기존 원본 3D 재편집
- 구버전 peer 거부와 기존 v2/v3·일반 LT·LayerLift 회귀

검증 경계와 구현 결과는 [2026-11-05 후속 보고](bg3d-six-pass-bundle-implementation-2026-11-05.md)에 기록한다.
실제 원고·화면·로컬 DB·구버전 reader·외부 전문 도구 호환성은 각각 구분한다.
