# Cloudflare·Onpod 관리자 운영 보드

- 상태: **current — 소스 구현. 운영 DB 적용·운영 배포는 별도 승인 대기**
- 작성 기준: **2026-11-18**
- 화면: `/admin/platform/ai-operations/`
- API: `GET/POST /api/admin/ai-operations`

## 목적과 현재 구현

Cloudflare Workers AI 모델 종료 대응과 Onpod 무료 플랜 처리 한도 관측을 공용 검토 기록으로 관리한다.
기존 관리자 세션과 독립 Admin 앱을 사용하며 앱 간 source import를 추가하지 않는다.
UI와 API가 실제로 공유하는 계약만 `packages/contracts/src/ai-operations.ts`에서 검증한다.

화면은 통합 현황·Cloudflare 모델·Onpod 알림·원인 가설·작업 보드·근거 자료로 나뉜다.
검색과 상태·제공자·우선순위 필터, 상세 기록, JSON 가져오기·내보내기, 필터 결과 CSV를 지원한다.
기본 모델과 공식 종료 대상은 고정된 관측 시점의 공개 자료다. 운영 환경의 모델 override나 실제 호출 통계와 동일하다고 간주하지 않는다.

공개 시작 자료의 기준은 `45dbe47d7cc86b238054df608d5bff5757e8afab`이다.
이 SHA는 자료를 읽은 코드 기준이며 이 보드의 PR 병합·CI·배포 증거가 아니다.
공식 종료 공지는 [Cloudflare 변경 공지](https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/)를 참조한다.
종료 예정일과 오류 대응에 관한 새로운 사실은 출처 관측 시각과 함께 수동 갱신한다.

## 기록과 근거의 의미

| 기록 | 구분해야 하는 값 |
| --- | --- |
| 모델 | 현재 코드 구성·운영 사용 여부, 종료 예정일, 대체 후보, 호출 경로, 기능 영향, 호출 빈도와 측정 구간, 404/model_not_found·410 대응, 최소 변경 파일, 롤백, 저비용 검증, 다음 조치 |
| Onpod 알림 | 알림 시각, 관측된 초과 시간, 측정 구간, 단일 인스턴스 로컬 rate limit, memory 클러스터, 최근 변경, 재현 여부, 비용 영향, 무료 한도 내 완화안 |
| 원인 가설 | 처리량·동시성·재시도·장시간 요청·중복 실행을 별도 기록하며 지지 근거·반증·추가 측정·완화안을 대조 |
| 출처 | 공식 문서·메일·코드·PR·커밋·CI·배포·저장소 문서의 HTTPS URL, 관측 시각, 증명하는 범위 |

초과 시간은 알림의 원문 측정값이다. 서로 다른 측정 구간을 합산하거나 장애 지속 시간으로 환산하지 않는다.
보드에 등록된 알림 수는 실제 지난 24시간 발생 건수가 아니다. 운영 API·메일 수집기가 없으므로 미수집 상태를 0건으로 확정하지 않는다.
단일 인스턴스 로컬 제한과 memory 기반 실시간 클러스터 설정은 서로 다른 개념이며 전역 처리량 제한으로 간주하지 않는다.
대체 모델의 비용·사용 가능성·품질은 검증 전까지 후보로만 기록한다.

## 상태와 운영 승인

미확인 → 분석 중 → 검토 필요 → 승인 대기 → 검증 완료 → main 반영 완료의 여섯 상태를 제공한다.
필수 선형 전환은 강제하지 않지만, 검증 완료에는 검증 시각·결과 설명·근거가 필요하고 main 반영 완료에는 정확한 40자리 SHA와 해당 저장소 커밋 근거가 필요하다.
입력 형식 검사는 GitHub의 실제 병합·CI·배포 결과를 자동 확인한 검증이 아니다.

`approvalRequired` 항목은 승인 대기만 허용한다. 기존 항목을 가져오기에서 제거하거나 승인 필요 표시를 해제하거나 종류를 바꿔 우회할 수 없다.
화면에는 운영 작업을 실행하는 버튼·웹훅·명령 실행기가 없다. 코드·푸시·PR 병합·운영 배포·계정·플랜 변경은 이 보드 밖에서 별도 승인과 실제 증거로 처리한다.
이 구현을 main에 병합하는 행위와 이후 보드의 운영 기록을 완료로 바꾸는 행위는 별개다.

## 접근·저장·충돌

검증된 세션 사용자 ID를 사용하고 서버가 트랜잭션 안에서 활성 사용자 역할을 다시 확인한다.
`admin`은 공용 기록을 읽고 쓰며 `operator`는 읽기만 한다. 다른 역할·중지된 계정·위조 사용자 ID에는 공개하지 않는다.
페이지 진입·창 복귀·인증 변경 시 권한을 재확인한다. 재확인 중에는 비공개 DOM을 숨기고 거부·사용자 또는 역할 변경 시 기존 화면 상태를 폐기한다.
요청은 같은 origin과 기존 CSRF 경계를 따른다. 본문은 2 MiB 이하이고 항목·출처는 각각 500개, 가져온 과거 이력은 100개 이하로 제한한다.

`expectedRevision`으로 저장 충돌을 409 처리한다. `mutationId`는 네트워크 응답 유실 후 같은 요청을 재시도할 때 중복 리비전·감사를 만들지 않는다.
같은 ID로 내용을 바꾼 요청은 거절한다. 보드 갱신·감사 digest·영수증은 같은 DB 트랜잭션에 기록한다.
테이블 부재, 손상된 payload 또는 감사 연결 오류는 503으로 응답하며 정상 빈 보드로 초기화하지 않는다.
현재 화면의 미저장 초안은 메모리에만 남고 JSON 백업 후 명시적으로 폐기·재조회할 수 있다.
서버 저장 시각을 바꾸더라도 근거 관측 시각은 그대로 보존한다. 서버에서 다시 읽는 동작은 외부 자료 재수집이 아니다.

## 기존 Sites 기록 가져오기

1. 권한이 있는 사용자가 기존 Sites 보드에서 JSON을 내보낸다. 비공개 메일·관측값을 공개 저장소나 정적 번들에 추가하지 않는다.
2. 관리자 운영 보드의 `JSON 가져오기`에서 파일 또는 JSON 텍스트를 입력한다.
3. 전체 schema·출처 참조·URL·완료 근거 검증과 변경 개수, 기준 SHA·관측 시각, 보존할 기존 승인 항목을 검토한다.
4. 대체 확인 후 화면에 적용하고 `서버에 저장`을 눌러 공용 저장본을 갱신한다. 검토·화면 적용만으로 서버가 바뀌지 않는다.
5. 다시 읽어 기록과 서버 감사 리비전을 확인한다. 가져온 Sites `activity`는 과거 외부 이력으로 구분하고 서버 감사로 승격하지 않는다.

가져온 파일의 기존 revision은 서버 revision으로 신뢰하지 않는다. 원래 관측 시각을 내보내기·가져오기 시각으로 덮어쓰지 않는다.
누락된 기존 승인 항목은 보존하며, 그 항목이 참조하는 출처 ID가 다른 내용과 충돌하면 가져오기를 거절한다.

## DB 준비와 배포 전제

추가형 migration `0122_admin_ai_operations.sql`은 보드·감사·영수증 테이블과 빈 singleton만 만든다. 개인 자료나 운영 설정을 seed하지 않는다.
manifest·capability 검사·runtime 최소권한 계약에 포함하며 운영 runtime에는 필요한 조회·갱신·추가 권한만 준다.
일반 API health의 전역 필수 테이블을 늘리지 않는다. 이 기능의 스키마가 없으면 해당 API만 실패한다.

이 작업은 운영 DB migration이나 배포를 실행하지 않는다. 실행 승인 주체는 저장소·운영 계정 소유자다.
실제 적용 시 [인프라 지도](infrastructure-map.md)와 [배포 정책](../../DEPLOY.md)의 SHA·CI·승인·백업·최소권한 절차를 따른다.
입력은 승인된 main SHA와 migration manifest, 적용 대상·runtime 역할, 기존 정상 배포의 롤백 정보다.
성공 기준은 해당 스키마·권한 검사, 실제 관리자 GET/POST, 운영자 수정 거절, 리비전 충돌과 감사 기록 검증이다.

실패 시 배포·추가 운영 변경을 중단하고 기존 정상 앱 버전으로 되돌린다. 새 테이블과 이미 저장된 보드·감사 자료는 보존한다.
애플리케이션 롤백을 위해 테이블을 DROP하거나 기록을 덮어쓰지 않는다. 데이터 삭제·repair는 별도 승인 대상이다.

## 재현 가능한 검증

저장소 루트에서 실행한다. DB 테스트에는 **격리된 테스트 Postgres**의 `TEST_DATABASE_URL`만 사용하며 운영 URL을 넣지 않는다.

```sh
pnpm harness:verify
pnpm typecheck:admin
pnpm test:admin
pnpm build:admin
pnpm exec playwright test --config apps/admin-web/playwright.config.ts ai-operations.e2e.ts
pnpm exec vitest run packages/contracts/src/ai-operations.test.ts apps/api/src/modules/admin/ai-operations/ai-operations.controller.test.ts
pnpm exec vitest run apps/api/src/modules/admin/ai-operations/ai-operations.repository.integration.test.ts
```

실제 SQL 테스트의 `TEST_RUNTIME_DATABASE_ROLE`은 테스트 DB 안의 비소유자 역할이다. 환경이 준비되지 않으면 실행하지 않은 것으로 기록한다.
브라우저 fixture 성공은 운영 로그인·배포·알림 수집 성공을 의미하지 않는다. 실제 실행 결과와 검증 범위를 PR에 기록한다.
