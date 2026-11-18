// 기준 main 45dbe47d7cc86b238054df608d5bff5757e8afab, 관측 2026-11-18T04:39:54Z. 실제 실행 결과와 정적 근거를 구분한다.
import type { Task } from "./admin-nestjs-quality";

export const nestQualityApiScenarios: Task[] = [
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "검토 필요",
    "kind": "최소 검증 시나리오",
    "scope": "IoAdapter 확장 / shared HTTP / namespace / shutdown",
    "nextAction": "현재 SHA에서 서버/namespace identity·등록 횟수·close trace를 전후 증거로 추가한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "기준·후보에서 현재 override의 타입 검사와 API 빌드를 비교한다.",
      "기존 HTTP 서버 공유 port0·namespace 생성에서 서버 identity와 adapter 등록 횟수를 기록한다.",
      "애플리케이션이 실제 사용하는 경우에 한해 undefined/no-listener 경로를 검증한다."
    ],
    "acceptance": "옵션·HTTP 서버가 보존되고 adapter가 정확히 등록되며 불필요한 listener·pool이 생성되지 않는다. 사용하지 않는 경로는 적용 제외 근거를 기록한다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "override",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
        "type": "코드"
      },
      {
        "label": "bootstrap",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/main.ts",
        "type": "코드"
      },
      {
        "label": "기존 adapter test",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.test.ts",
        "type": "코드"
      },
      {
        "label": "Nest12 IoAdapter",
        "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/platform-socket.io/adapters/io-adapter.ts",
        "type": "근거"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-006",
    "title": "createIOServer 재정의·서버 부착 경로 검증",
    "summary": "현재 override는 port:number → super.createIOServer → server.adapter 순서다. 이전 main2cfbfa5의 프로덕션 빌드는 성공했고 최신main45dbe47의 CI는pending이다. shared HTTP·namespace·no-listener의 실제 실행 검증은 미확인."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "기준/후보 SHA, Node/pnpm, startup 로그, exit code, health 응답, listener 상태를 각각 저장한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "동일 Node/pnpm·lock으로 API build 후 node dist/apps/api/src/main.js를 실행한다.",
      "memory와 전용 테스트 postgres 구성에서 GET /api/health/live·/api/health/ready 응답을 기록한다.",
      "capability-worker 및 preflight 실패 경로의 startup exit·readiness·자원 해제를 비교한다."
    ],
    "acceptance": "import/DI/route 오류 없이 시작하고 실제 adapter 준비를 health가 반영한다. 초기화 실패를 ready로 표시하지 않는다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "start·build",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
        "type": "코드"
      },
      {
        "label": "bootstrap",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/main.ts",
        "type": "코드"
      },
      {
        "label": "health routes",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/health/health.controller.ts",
        "type": "코드"
      },
      {
        "label": "readiness",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/health/health-runtime-readiness.ts",
        "type": "코드"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-008",
    "title": "API 부팅·health·역할별 실행 경로",
    "summary": "실제 start entrypoint를 memory/postgres 구성에서 실행하고 capability-worker가 Studio adapter를 생략하는지 비교하는 최소 시나리오."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "요청 경로·인증 분류·상태 코드·민감값 제거 응답·test fixture ID를 전후 증거에 기록한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "격리 fixture로 공개 요청·인증된 주요 읽기·쓰기의 상태/응답 schema를 기록한다.",
      "정상·누락·만료 쿠키와 CSRF 누락/불일치 요청을 비교한다.",
      "위조 x-user-id 및 signed-header-only로 auth-ticket 발급을 시도하고 정상 cookie principal과 비교한다.",
      "잘못된 body·route parameter·예외 응답이 기존 계약을 지키는지 확인한다."
    ],
    "acceptance": "cookie principal만 ticket을 발급하고 권한 없는 읽기/쓰기·위조 헤더가 차단된다. 성공/오류 코드와 schema가 기준 계약을 만족한다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "session middleware",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/session-middleware.ts",
        "type": "코드"
      },
      {
        "label": "ticket controller",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-auth-ticket.controller.ts",
        "type": "코드"
      },
      {
        "label": "ticket tests",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-auth-ticket.controller.test.ts",
        "type": "코드"
      },
      {
        "label": "bootstrap",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/main.ts",
        "type": "코드"
      },
      {
        "label": "PR 인증 통합 실패 로그",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43863196898/job/133285000974",
        "type": "CI 로그"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-009",
    "title": "주요 API 요청·쿠키 인증·CSRF·입장권",
    "summary": "정상·누락·만료 쿠키와 위조/서명 헤더를 구분하여 주요 read/write 및 POST /api/creator/studio-live/auth-ticket 경계를 검증한다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "서버 SHA·연결 옵션·socket/room ID·connect/join/snapshot 타임라인을 저장한다. 운영 설정 값은 아직 미확인이다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "실제 API 주소·VITE_STUDIO_LIVE_ORIGIN·allowed Origin과 websocket-only 옵션을 기록한다.",
      "정상 sessionToken으로 /studio-live에 연결하고 studio:join을 보낸다.",
      "서로 다른 두 실제 클라이언트의 join ACK·room membership·초기 snapshot/binary 선택·ready 순서를 확인한다."
    ],
    "acceptance": "올바른 path/namespace·허용 Origin으로 연결되며 인증과 초기 동기화 완료 전에 ready나 보호 이벤트를 노출하지 않는다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "Gateway",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live.gateway.ts",
        "type": "코드"
      },
      {
        "label": "endpoint",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-endpoint.ts",
        "type": "코드"
      },
      {
        "label": "client connection",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-connection-factory.ts",
        "type": "코드"
      },
      {
        "label": "lifecycle",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-transport-lifecycle.ts",
        "type": "코드"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-010",
    "title": "실제 Socket.IO 연결·namespace·room 참가",
    "summary": "/socket.io path와 /studio-live namespace에 정상 자격으로 연결하고 studio:join ACK·room·초기 snapshot까지 확인한다. HTTP /api prefix와 혼동하지 않는다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "token 값 없이 인증 분류·connect_error·join ACK·권한 철회 시간·거부 이벤트 수를 기록한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "token 없음·형식 오류·만료·비허용 Origin의 connect_error와 보호 이벤트 수신을 확인한다.",
      "정상 사용자·guest:v1 자격으로 권한 없는 work 참가·작업을 요청한다.",
      "참여 후 테스트 세션/권한을 철회하고 15초 주기 재검사와 terminal UI를 관찰한다.",
      "handshake token 소비·삭제 및 private principal이 로그나 socket.data로 노출되지 않는지 확인한다."
    ],
    "acceptance": "무효 자격은 admission에서 차단되고 거부 클라이언트에 보호 이벤트가 전달되지 않는다. 권한 철회 뒤 허용되지 않은 작업이 저장되지 않는다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "socket auth",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-socket-auth.service.ts",
        "type": "코드"
      },
      {
        "label": "auth tests",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-socket-auth.service.test.ts",
        "type": "코드"
      },
      {
        "label": "Gateway middleware",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live.gateway.ts",
        "type": "코드"
      },
      {
        "label": "constants",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-gateway-constants.ts",
        "type": "코드"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-011",
    "title": "Socket admission 거부·guest·권한 철회",
    "summary": "무효·만료 token, 비허용 Origin, 타인 work 및 guest 경계를 검증하고 세션 철회 뒤 권한 재검사 경로를 확인한다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "disconnect reason·시도/시간·새 socket ID·refresh 횟수·join generation·seq/hash를 전후 증거로 추가한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "join 완료 후 한 클라이언트 네트워크만 단절하고 다른 클라이언트에서 편집한다.",
      "manager 재시도8회·1~8초 지연 및 이미 참가한 소켓의 배경 재연결 timer를 관찰한다.",
      "자격 만료 시 1회 refresh·auth 교체, 새 connect에서 studio:join과 snapshot/binary 선택을 확인한다.",
      "stale ACK 무시 및 CRDT state-vector/op sync 후 최종 문서 hash를 비교한다."
    ],
    "acceptance": "초기 동기화 전에 ready 표시가 없고 복구 후 문서가 수렴한다. 재시도8회를 전체 수명 최대8회로 오해하지 않는다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "retry 설정",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-connection-factory.ts",
        "type": "코드"
      },
      {
        "label": "재연결 lifecycle",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-transport-lifecycle.ts",
        "type": "코드"
      },
      {
        "label": "FakeSocket 테스트 범위",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-transport.test.ts",
        "type": "코드"
      },
      {
        "label": "공식 재연결",
        "url": "https://socket.io/docs/v4/client-socket-instance/#disconnect",
        "type": "근거"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-012",
    "title": "네트워크 단절 후 재연결·fresh join·동기화",
    "summary": "실제 두 클라이언트 중 하나의 transport를 끊고 다른 클라이언트 편집·ticket 만료·복구를 거쳐 문서 수렴을 검증한다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "종료 사유별 client state·UI·connect 호출·복구/terminal 결과를 나누어 기록한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "격리 환경에서 서버 강제 disconnect와 네트워크 단절을 각각 발생시킨다.",
      "disconnect reason·socket.active·manager 시도·앱 배경 timer를 비교한다.",
      "복구 가능한 종료는 fresh join/resync, 권한 철회는 terminal 처리되는지 확인한다."
    ],
    "acceptance": "강제 종료를 자동 재연결 성공으로 추측하지 않는다. 허용된 복구가 명시적으로 동작하고 거부/권한 철회에는 무한 재참가가 없다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "Socket.IO disconnect",
        "url": "https://socket.io/docs/v4/client-socket-instance/#disconnect",
        "type": "근거"
      },
      {
        "label": "앱 lifecycle",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-transport-lifecycle.ts",
        "type": "코드"
      },
      {
        "label": "Nest12 queue 종료",
        "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/platform-socket.io/adapters/io-adapter.ts",
        "type": "근거"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-013",
    "title": "서버 강제 disconnect 후 복구 정책",
    "summary": "서버 강제 종료는 transport 손실과 달리 Socket.IO 기본 자동 재연결을 보장하지 않는다. 앱의 timer·명시적 connect·권한 terminal 처리 여부를 별도 판정한다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "sent/accepted/applied/received ID 배열·counter·seq·timestamp·최종 hash를 기록한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "opId·actorId·counter를 붙여 정상 연속 이벤트를 전송한다.",
      "counter gap·역순·비동기 지연·복수 actor 전송을 각각 분리해 재현한다.",
      "수신순서·handler 완료·DB append·ACK seq·peer broadcast 순서를 상호 대조한다."
    ],
    "acceptance": "정의된 actor FIFO 위반을 거부하고 유효 op의 저장·ACK·수신 seq가 계약대로 일치한다. 근거 없는 전체 exactly-once/전역 완료순서 보장을 주장하지 않는다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "op handler",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-gateway-handlers-op.ts",
        "type": "코드"
      },
      {
        "label": "durable op store",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-op.ts",
        "type": "코드"
      },
      {
        "label": "공식 전달 보장",
        "url": "https://socket.io/docs/v4/delivery-guarantees/",
        "type": "근거"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-014",
    "title": "협업 이벤트 순서·actor counter·seq",
    "summary": "studio:op:submit의 sender별 직렬화와 durable seq를 검증한다. 전송 순서 보장과 비동기 handler 완료 순서·복수 actor 순서를 구별한다."
  }
];
