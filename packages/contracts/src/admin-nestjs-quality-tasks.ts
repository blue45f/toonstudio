// 기준 main 45dbe47d7cc86b238054df608d5bff5757e8afab, 관측 2026-11-18T04:39:54Z. 실제 실행 결과와 정적 근거를 구분한다.
import type { Task } from "./admin-nestjs-quality";

export const nestQualityTasks: Task[] = [
  {
    "category": "의존성",
    "priority": "P0",
    "status": "검증 완료",
    "kind": "해결된 정적 버전 혼재",
    "scope": "API 의존성·DI·HTTP·WebSocket",
    "nextAction": "해결 이력으로 보존. 연관 패키지 peer와 실제 런타임은 별도로 검증한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "2026-11-18",
    "environment": "GitHub main 파일 읽기",
    "result": "선언·잠금 버전 정렬 확인",
    "steps": [
      "기준 SHA에서 apps/api/package.json과 pnpm-lock.yaml importer·snapshot을 비교한다.",
      "Nest11/12 공식 peer와 실제 잠금 버전을 대조한다.",
      "실행 실패와 정적 범위 불일치를 다른 항목으로 기록한다."
    ],
    "acceptance": "선언·lock·peer 출처가 동일 SHA와 버전을 가리키며 확인하지 못한 런타임 결론을 추가하지 않는다.",
    "beforeEvidence": "이전 스냅샷 58fe8ae: common12.5.0 + 나머지 핵심4개11.2.9.",
    "afterEvidence": "기준 main45dbe47: 핵심5개 ^12.5.0 / lock12.5.0. #2798/#2800 병합 완료. 이후3D·Character Lab 변경에서 API·lockfile은 변경되지 않았다.",
    "evidenceLinks": [
      {
        "label": "API manifest",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
        "type": "코드"
      },
      {
        "label": "lock·peer",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
        "type": "코드"
      },
      {
        "label": "공식 릴리스",
        "url": "https://github.com/nestjs/nest/releases/tag/v12.5.0",
        "type": "근거"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": true,
    "revision": 0,
    "id": "nest-001",
    "title": "Nest 핵심 5개 패키지 12.5.0 정렬 확인",
    "summary": "기준 main의 common/core/platform-express/platform-socket.io/websockets 선언과 lockfile이 모두 12.5.0이다."
  },
  {
    "category": "CI",
    "priority": "P0",
    "status": "미확인",
    "kind": "현재 CI 결과 확인",
    "scope": "API · Studio Live",
    "nextAction": "같은 SHA의 실패 원인을 분리해 추적하고 새 CI 결과가 있으면 스냅샷을 갱신한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "GitHub Actions 읽기",
    "result": "pending · 동일 SHA 최종 CI 결과 미확인",
    "steps": [
      "최신 main SHA가 바뀌었는지 확인한다.",
      "동일 SHA run의 상태·job·로그·artifact를 읽는다.",
      "API 빌드/타입/인증/PG 결과를 범위별로 기록하고 cancelled·skipped를 통과로 계산하지 않는다."
    ],
    "acceptance": "완료된 동일 SHA의 필요한 job과 로그가 있을 때만 각 결과를 갱신한다.",
    "beforeEvidence": "2026-11-16 23:44 KST: pending / jobs 0 / conclusion null.",
    "afterEvidence": "main45dbe47에 연결된 CI run과 conclusion null을 확인했다. 개별 작업 실행 결과·최종 결론은 미확인이다.",
    "evidenceLinks": [
      {
        "label": "최신 관측 main CI",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/44237128814",
        "type": "CI"
      },
      {
        "label": "이전 main2cfbfa5 CI",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/44235319729",
        "type": "역사 CI"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-002",
    "title": "최신 main CI의 실제 결론 확인",
    "summary": "최신 관측 main45dbe47의 CI44237128814는 pending이며 최종 결론은 미확인이다. 앞선2cfbfa5의 빌드 성공·실패 로그는 역사 자료로만 보존한다."
  },
  {
    "category": "CI",
    "priority": "P0",
    "status": "검증 완료",
    "kind": "과거 import 실패 재확인 · 단위 경계",
    "scope": "API · Studio Live",
    "nextAction": "해소된 import 실패를 활성 목록에서 제외. 실제 API 시작·인증·재연결·PG 전파는 각 시나리오에서 검증한다.",
    "owner": "미지정",
    "commit": "5ea952cd44b31dd1074ab96ab251e97f84932128",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "2026-11-18",
    "environment": "main5ea952c 기반 격리 개발 checkout · Node24 · frozen lock · 단위 테스트",
    "result": "관련 3개 파일 · 54개 단위 테스트 통과",
    "steps": [
      "PR head와 로그에 기록된 core12/common11 조합을 고정한다.",
      "Full pnpm test의 실패 단계와 product shard 오류를 연결한다.",
      "정렬된 후보의 동일 테스트 결과로 해결 여부를 판정한다."
    ],
    "acceptance": "변경하지 않은 adapter·socket auth·auth ticket 단위 3개 파일의 import와 54개 테스트 통과를 확인한다. 실제 PG·서버 시작·클라이언트 재연결은 이 항목의 완료 범위가 아니다.",
    "beforeEvidence": "133285000974: common/internal module not found; 사전 통합 배치 3 files failed/25 passed, 455 tests passed/46 skipped. 133285000674: 7 files failed/418 passed, 4493 tests passed.",
    "afterEvidence": "main5ea952c 기반 격리 개발 checkout의 frozen lock 설치 후 studio-postgres-io.adapter.test.ts, studio-live-socket-auth.service.test.ts, studio-live-auth-ticket.controller.test.ts: 3 files / 54 tests passed. 후속 main2cfbfa5와45dbe47에서도 해당 API 소스와 lockfile은 동일함을 확인했다. 실제 PG·브라우저 전체 경로는 별도 미확인.",
    "evidenceLinks": [
      {
        "label": "PR #2798",
        "url": "https://github.com/blue45f/toonstudio/pull/2798",
        "type": "PR"
      },
      {
        "label": "Full pnpm test 로그",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43863196898/job/133285000974",
        "type": "CI 로그"
      },
      {
        "label": "product shard 로그",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43863197015/job/133285000674",
        "type": "CI 로그"
      },
      {
        "label": "같은 PR 빌드 성공",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43863197015/job/133285000607",
        "type": "CI 로그"
      }
    ],
    "notes": "빌드 성공과 runtime import 성공은 다르다. 이 실패를 현재 main에서 재현한 것으로 복사하지 않는다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": true,
    "revision": 0,
    "id": "nest-003",
    "title": "PR #2798 과거 import 실패와 현재 버전 정렬",
    "summary": "과거 ed1ac751의 core12/common11 import 실패를 보존한다. 현재 핵심5개는12.5.0으로 정렬되어 동일 버전 혼재는 없다."
  },
  {
    "category": "완료·제외",
    "priority": "P2",
    "status": "main 머지 완료",
    "kind": "완료 기록",
    "scope": "API · Studio Live",
    "nextAction": "재병합 없이 이력 보관. 실제 런타임 호환성은 별도 검증한다.",
    "owner": "미지정",
    "commit": "fa5264efc96a9bc05d11fa7d135ec35f24344ad2",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "2026-11-16",
    "environment": "GitHub PR·main 파일 읽기",
    "result": "merged=true 확인",
    "steps": [
      "PR merged·merged_at·merge_commit_sha를 확인한다.",
      "현재 main의 common 선언과 lock 반영을 확인한다."
    ],
    "acceptance": "PR 병합과 main 파일 반영 근거가 일치한다.",
    "beforeEvidence": "PR #2801: common 11.2.9 → 12.5.0.",
    "afterEvidence": "merged 2026-11-16T12:38:44Z / fa5264efc96a9bc05d11fa7d135ec35f24344ad2; 최신 main lock12.5.0.",
    "evidenceLinks": [
      {
        "label": "PR #2801",
        "url": "https://github.com/blue45f/toonstudio/pull/2801",
        "type": "PR"
      },
      {
        "label": "main 선언",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
        "type": "코드"
      },
      {
        "label": "main lock",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
        "type": "코드"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": true,
    "revision": 0,
    "id": "nest-004",
    "title": "PR #2801 common 12.5.0 병합 완료 기록",
    "summary": "#2801 common 업데이트 병합 완료. 후속 #2798/#2800도 병합됐으며 현재 핵심5개12.5.0으로 정렬됐다."
  },
  {
    "category": "적용 범위",
    "priority": "P0",
    "status": "검증 완료",
    "kind": "정적 적용 범위 판정",
    "scope": "API · Studio Live",
    "nextAction": "nest-006/007의 IoAdapter 변경과 nest-019/020의 실제 한계값 시나리오를 검토한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "2026-11-16T14:44:37Z",
    "environment": "현재 코드·공식 릴리스·IoAdapter 소스 읽기",
    "result": "범위 한정 확인",
    "steps": [
      "StudioLivePostgresIoAdapter의 import·extends를 확인한다.",
      "Gateway의 maxHttpBufferSize=384×1024와 transport 옵션을 읽는다.",
      "공식 WsAdapter 전용 변경과 IoAdapter 상속 변경을 분리한다."
    ],
    "acceptance": "정적 판정만 완료로 표시하며 payload·큐·강제 종료의 실제 동작은 nest-019/020에서 미확인으로 유지한다.",
    "beforeEvidence": "공식 릴리스: WsAdapter maxPayload 변경. 적용 대상은 @nestjs/platform-ws.",
    "afterEvidence": "현재 코드: extends IoAdapter / Gateway maxHttpBufferSize384KiB. 실제 실행 증거 없음.",
    "evidenceLinks": [
      {
        "label": "상속 클래스",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
        "type": "코드"
      },
      {
        "label": "Gateway 옵션",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live.gateway.ts",
        "type": "코드"
      },
      {
        "label": "384KiB 상수",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-gateway-constants.ts",
        "type": "코드"
      },
      {
        "label": "릴리스",
        "url": "https://github.com/nestjs/nest/releases/tag/v12.5.0",
        "type": "근거"
      },
      {
        "label": "어댑터 문서",
        "url": "https://docs.nestjs.com/websockets/adapter",
        "type": "근거"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-005",
    "title": "WsAdapter 제한이 현재 클래스에 그대로 적용되는가",
    "summary": "직접 적용 아님: 현재 클래스는 @nestjs/platform-socket.io의 IoAdapter를 확장한다. WsAdapter의 1MiB maxPayload/1009 변경과 구별한다. 현재 Gateway의 별도 Socket.IO maxHttpBufferSize는 384×1024 bytes."
  },
  {
    "category": "적용 범위",
    "priority": "P1",
    "status": "검토 필요",
    "kind": "공식 변경·현재 상속 경로 검토",
    "scope": "API · Studio Live",
    "nextAction": "nest-020의 격리 부하 시나리오를 설계하고 실제 결과는 미확인으로 둔다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "공식 11.2.9/12.5.0 소스·현재 클래스 읽기",
    "result": "변경 범위 확인 · 상속 후 실제 동작 미확인",
    "steps": [
      "IoAdapter11/12의 constructor·bindMessageHandlers·queue 경계를 비교한다.",
      "현재 클래스의 super(application)와 override 목록을 확인한다.",
      "기존1000 동시성·신규10000 대기열·Gateway 자체 quota를 구분한다."
    ],
    "acceptance": "기존 제한을 신규 회귀로 표시하지 않고 실제 큐·binary 경계는 별도 시나리오에서 검증한다.",
    "beforeEvidence": "공식11.2.9: 동시 handler1000. 공식12.5.0: 대기10000 및 초과 종료 추가.",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "IoAdapter11",
        "url": "https://github.com/nestjs/nest/blob/v11.2.9/packages/platform-socket.io/adapters/io-adapter.ts",
        "type": "근거"
      },
      {
        "label": "IoAdapter12",
        "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/platform-socket.io/adapters/io-adapter.ts",
        "type": "근거"
      },
      {
        "label": "공식 릴리스",
        "url": "https://github.com/nestjs/nest/releases/tag/v12.5.0",
        "type": "근거"
      },
      {
        "label": "상속 클래스",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
        "type": "코드"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-007",
    "title": "IoAdapter가 상속하는 큐·binary 변경 범위 검토",
    "summary": "동시 handler 기본1000은 11.2.9에도 존재. 12.5.0은 client/event별 대기10000 제한과 초과 disconnect를 추가한다. 동일 binary 객체 반복 참조 거부도 구별한다. 현재 override는 bindMessageHandlers를 대체하지 않는다."
  },
  {
    "category": "의존성",
    "priority": "P1",
    "status": "검토 필요",
    "kind": "확인된 정적 peer 불일치 · 실제 재현 미확인",
    "scope": "테스트 DI·로깅·입력 검증·전송·DB 연동",
    "nextAction": "입력 검증·직렬화·로깅의 실제 회귀를 재현하고 추가 버전 변경이 필요하면 nest-024 승인 항목으로 기록한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "정적 의존성·peer 확인 및 격리 후보 검증",
    "result": "nestjs-zod peer 범위 불일치 확인 · 요청 검증 회귀 여부 미확인",
    "steps": [
      "전체 workspace manifest·lock·import에서 testing 사용 여부를 확인한다.",
      "사용하는 addon의 공식 peer/engine을 후보 Nest 버전과 대조한다.",
      "로깅·validation·테스트 모듈 생성·전송 경로의 실행 증거를 확보한다."
    ],
    "acceptance": "사용 여부와 peer 출처를 확인하기 전 미확인으로 유지하며 불필요 패키지를 추가하거나 독립 버전을 기계적으로 정렬하지 않는다.",
    "beforeEvidence": "이전 스냅샷은 zod5.5.0·pino5.3.1의 공식 peer를 미확인으로 기록했다.",
    "afterEvidence": "frozen lock 설치된 package.json: nestjs-zod5.6.0 common ^10.0.0 || ^11.0.0; nestjs-pino5.3.1 common/core ^11.0.8 || ^12.0.2.",
    "evidenceLinks": [
      {
        "label": "현재 의존성",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
        "type": "코드"
      },
      {
        "label": "zod peer",
        "url": "https://registry.npmjs.org/nestjs-zod/5.6.0",
        "type": "호환성"
      },
      {
        "label": "pino peer",
        "url": "https://registry.npmjs.org/nestjs-pino/5.3.1",
        "type": "호환성"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-023",
    "title": "nestjs-zod의 Nest12 peer 범위와 연관 패키지 검증",
    "summary": "nestjs-zod5.6.0의 common peer는 ^10 || ^11로12.5.0을 포함하지 않는다. nestjs-pino5.3.1의 common/core peer ^11.0.8 || ^12.0.2는 현재12.5.0을 포함한다."
  },
  {
    "category": "승인",
    "priority": "P0",
    "status": "승인 대기",
    "kind": "실행 전 승인 항목",
    "scope": "의존성·lock·IoAdapter override·API 및 실시간 협업 회귀",
    "nextAction": "추가 수정의 필요성과 영향·검증 계획만 기록한다. 이 보드에는 실행 기능이 없다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "실행 전 · 대상 저장소 변경 없음",
    "result": "미확인",
    "steps": [
      "기존 #2798/#2800과 현재 main의 중복 변경·충돌을 확인한다.",
      "각 peer·engine·addon 영향과 단일 후보 변경안을 검토한다.",
      "수정 파일·검증 명령·회귀 범위·되돌리기 기준을 정리한 뒤 승인 여부를 기록한다."
    ],
    "acceptance": "구체적 변경안과 영향 범위를 승인받은 경우에만 별도 개발 작업에서 실행. 보드 상태 변경 자체는 실행 권한이나 실제 실행이 아니다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "PR #2798",
        "url": "https://github.com/blue45f/toonstudio/pull/2798",
        "type": "PR"
      },
      {
        "label": "PR #2800",
        "url": "https://github.com/blue45f/toonstudio/pull/2800",
        "type": "PR"
      },
      {
        "label": "manifest",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
        "type": "코드"
      },
      {
        "label": "lock",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
        "type": "코드"
      },
      {
        "label": "동시 업데이트 근거",
        "url": "https://github.com/nestjs/nest/releases/tag/v12.5.0",
        "type": "근거"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": true,
    "archived": false,
    "revision": 0,
    "id": "nest-024",
    "title": "추가 연관 패키지·필요 코드 수정 승인",
    "summary": "핵심5개 정렬은 완료됐다. nestjs-zod peer 범위 및 createIOServer·검증 harness에서 추가 수정이 필요한 경우 변경 범위와 근거를 검토한다."
  },
  {
    "category": "승인",
    "priority": "P0",
    "status": "승인 대기",
    "kind": "실행 전 승인 항목",
    "scope": "원격 PR·main 통합",
    "nextAction": "완료된 PR을 재병합 대상으로 만들지 않는다. 새 수정 PR이 필요한 경우에만 승인 메모를 추가한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "실행 전 · PR 변경·병합 없음",
    "result": "미확인",
    "steps": [
      "병합 직전 main·각 PR head와 기존 포함 여부를 다시 읽는다.",
      "후보의 필수 CI·runtime/PG 증거·충돌 및 회귀 검토를 확인한다.",
      "구체적 PR·head SHA·병합 순서/단일 통합안과 승인 기록을 남긴다."
    ],
    "acceptance": "승인된 정확한 후보와 동일 SHA의 검증 근거가 있어야 한다. 이미 병합된 #2801은 중복 병합하지 않는다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "PR #2798",
        "url": "https://github.com/blue45f/toonstudio/pull/2798",
        "type": "PR"
      },
      {
        "label": "PR #2800",
        "url": "https://github.com/blue45f/toonstudio/pull/2800",
        "type": "PR"
      },
      {
        "label": "PR #2801",
        "url": "https://github.com/blue45f/toonstudio/pull/2801",
        "type": "PR"
      },
      {
        "label": "현재 main",
        "url": "https://github.com/blue45f/toonstudio/commit/45dbe47d7cc86b238054df608d5bff5757e8afab",
        "type": "근거"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": true,
    "archived": false,
    "revision": 0,
    "id": "nest-025",
    "title": "추가 수정 PR의 병합 검토",
    "summary": "#2798/#2800/#2801은 모두 병합 완료다. 앞으로 필요한 별도 수정 PR만 중복 여부·같은 SHA 검증·승인 근거와 함께 기록한다."
  },
  {
    "category": "승인",
    "priority": "P0",
    "status": "승인 대기",
    "kind": "실행 전 승인 항목",
    "scope": "운영 API·협업 연결·인프라 설정·DB",
    "nextAction": "현재는 승인 대기로 유지. main 병합 후에도 실제 배포·설정 변경·운영 데이터 변경은 별도 실행 요청이 필요하다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "실행 전 · 운영 접속/변경/배포 없음",
    "result": "미확인",
    "steps": [
      "배포 후보 SHA와 설정·migration 필요 여부를 읽기 근거로 확정한다.",
      "영향·롤백·최소 smoke 및 사용자 재연결 계획을 작성한다.",
      "대상 환경·변경 항목·배포 시각과 승인 여부를 기록한다."
    ],
    "acceptance": "승인 주체·배포 커밋·DB 반영 경로·복구 계획·실행 근거를 승인 메모와 전후 증거에 기록한다. 이 보드에서는 승인 대기 상태를 유지하며 운영 작업을 실행하지 않는다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "API 시작 구성",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/main.ts",
        "type": "코드"
      },
      {
        "label": "PG 모드·preflight",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
        "type": "코드"
      },
      {
        "label": "Studio Live Origin",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-endpoint.ts",
        "type": "코드"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다. 어드민 통합의 운영 DB 반영 경로도 미확인이다. 현행 single-owner 환경과 제한 runtime 역할 절차를 구분하고 인프라 정본·역할·0122 migration 적용 계획을 승인 전에 확정한다.",
    "approvalRequired": true,
    "archived": false,
    "revision": 0,
    "id": "nest-026",
    "title": "운영 배포·설정·마이그레이션 필요 여부 승인",
    "summary": "병합과 운영 배포는 별도 상태다. 실제 운영 SHA·Nest 설치·Studio Live Origin·postgres 모드·마이그레이션 상태는 미확인. 변경이 필요하면 별도 검토·승인 후 실행한다."
  },
  {
    "category": "완료·제외",
    "priority": "P2",
    "status": "검증 완료",
    "kind": "독립 원인 확인·범위 제외",
    "scope": "API · Studio Live",
    "nextAction": "필요하면 기존 전체 CI 보드에서 추적. 이 Nest 보드에서는 제외 기록으로 유지한다.",
    "owner": "미지정",
    "commit": "35ae069878a873df646fd095c9bf241584cd0496",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "2026-11-16",
    "environment": "기존 CI 로그 읽기",
    "result": "독립 원인 확인 · Nest 범위 제외",
    "steps": [
      "실패 job 단계와 로그의 원문 원인을 읽는다.",
      "Nest import/adapter 원인이 아닌 독립 경고로 구분한다."
    ],
    "acceptance": "별도 원인은 보존하지만 Nest 미완료·실패 집계에서 제외한다. 해당 Vello 문제 자체가 해결됐다는 의미가 아니다.",
    "beforeEvidence": "Lighthouse job133364343525: Build the exact candidate production bundle failure.",
    "afterEvidence": "Error: Vello Cargo.toml/Cargo.lock changed without a reviewed notice inventory refresh.",
    "evidenceLinks": [
      {
        "label": "PR #2800",
        "url": "https://github.com/blue45f/toonstudio/pull/2800",
        "type": "PR"
      },
      {
        "label": "확인한 실패 로그",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43886046686/job/133364343525",
        "type": "CI 로그"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": true,
    "revision": 0,
    "id": "nest-027",
    "title": "Vello notice inventory 실패는 Nest 회귀 집계 제외",
    "summary": "PR #2800 Lighthouse build 실패의 실제 로그는 Vello Cargo.toml/Cargo.lock 변경 후 notice inventory 미갱신이다. NestJS·API·Socket.IO 회귀로 분류하지 않는다."
  },
  {
    "category": "CI",
    "priority": "P0",
    "status": "검토 필요",
    "kind": "테스트 소스 범위 확인",
    "scope": "API · Studio Live",
    "nextAction": "전체 경로의 실제 결과가 필요한 시나리오에 환경·테스트 ID·CI 로그를 연결한다. 테스트 소스 확인을 실행 검증일로 쓰지 않는다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "테스트 소스 읽기 · 실행 없음",
    "result": "증명 범위 확인 · 전체 통합 실행 미확인",
    "steps": [
      "각 test의 실제 의존성·서버·client mock·skip 조건을 기록한다.",
      "기존 단위/통합 test와 nest-008~021 실제 시나리오를 연결한다.",
      "실제 PG·인증·재연결 전체 증거가 없는 항목을 미확인으로 남긴다."
    ],
    "acceptance": "테스트 파일 존재·mock 통과를 운영 또는 실제 네트워크 통과로 확대하지 않는다. 이미 존재하는 방어 구현은 신규 결함으로 중복 등록하지 않는다.",
    "beforeEvidence": "pg integration: raw node:http, reconnection:false. socket transport: FakeSocket. reconnect-resync: BroadcastChannel/StudioMemoryBroadcastHub.",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "실제 PG test 범위",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.integration.test.ts",
        "type": "코드"
      },
      {
        "label": "FakeSocket test",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-transport.test.ts",
        "type": "코드"
      },
      {
        "label": "BroadcastChannel resync test",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-reconnect-resync.test.ts",
        "type": "코드"
      },
      {
        "label": "auth 단위 test",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-socket-auth.service.test.ts",
        "type": "코드"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-028",
    "title": "기존 테스트의 증명 범위와 실제 통합 공백",
    "summary": "PG2노드 test는 raw HTTP+adapter이며 Nest gateway/auth를 우회하고 reconnection:false다. socket transport test는 FakeSocket, reconnect-resync test는 in-process BroadcastChannel이다. 실제 Nest+인증+재연결+PG 전체 통과 근거는 미확인."
  }
];
