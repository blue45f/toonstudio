// 기준 main 45dbe47d7cc86b238054df608d5bff5757e8afab, 관측 2026-11-18T04:39:54Z. 실제 실행 결과와 정적 근거를 구분한다.
import type { Task } from "./admin-nestjs-quality";

export const nestQualityRealtimeScenarios: Task[] = [
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "fault 주입 위치·ACK/DB/peer correlation·누락 ID·sync 반환값·최종 hash를 기록한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "송신/수신 seq baseline과 DB append를 기록한다.",
      "격리 harness에서 영속 후 peer broadcast 중단·단절 중 편집을 재현한다.",
      "복구 시 op:sync의 snapshot/ops/lastSeq 및 CRDT state vector를 비교한다."
    ],
    "acceptance": "누락을 감지하거나 동기화하여 최종 문서가 수렴한다. ACK만으로 peer 전달을 성공 처리하지 않는다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "ACK와 broadcast",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-gateway-handlers-op.ts",
        "type": "코드"
      },
      {
        "label": "PG transport",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-pubsub.ts",
        "type": "코드"
      },
      {
        "label": "client lifecycle",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-transport-lifecycle.ts",
        "type": "코드"
      },
      {
        "label": "기본 at most once",
        "url": "https://socket.io/docs/v4/delivery-guarantees/",
        "type": "근거"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-015",
    "title": "ACK 후 broadcast 누락·단절 구간 catch-up",
    "summary": "영속 ACK는 peer 전파 성공과 별개다. ACK 뒤 broadcast 오류·네트워크/PG 단절 중 누락을 studio:op:sync(fromSeq) 및 CRDT 동기화로 회복하는지 확인한다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "opId/updateId·ACK trace·중복 count·DB append count·최종 문서 hash를 전후 기록한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "정상 op를 영속한 뒤 ACK만 손실시키고 같은 opId를 재전송한다.",
      "동일 updateId의 CRDT 재전송과 중복 peer 이벤트를 별도로 주입한다.",
      "DB row·ACK duplicate/seq·broadcast count·문서 적용 횟수를 비교한다."
    ],
    "acceptance": "같은 op는 추가 저장·추가 효과 없이 같은 seq로 응답하며 새 insert만 broadcast한다. 문서 최종 상태가 기준과 일치한다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "op dedupe",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-gateway-handlers-op.ts",
        "type": "코드"
      },
      {
        "label": "store",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-op.ts",
        "type": "코드"
      },
      {
        "label": "FakeSocket dedupe tests",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-transport.test.ts",
        "type": "코드"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-016",
    "title": "ACK 손실·동일 opId 재전송·중복 적용 방지",
    "summary": "동일 opId 재제출 시 duplicate ACK와 동일 seq, 신규 broadcast 억제 및 CRDT updateId dedupe를 실제 클라이언트로 검증한다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "노드별 SHA·비밀 제외 설정·schema 버전·listener 상태·payload hash/count·RPC ACK·rollback 결과를 저장한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "격리 PG schema·권한·마이그레이션 상태를 확인하고 동일 SHA 두 API 노드를 postgres 모드로 구성한다.",
      "small JSON·binary bytes·64KiB attachment를 다른 노드 peer로 전달한다.",
      "fetchSockets·serverSideEmitWithAck 및 startup preflight rollback을 확인한다.",
      "직접 endpoint·TLS·poolMax2 조건과 schema/권한 실패를 구분해 기록한다."
    ],
    "acceptance": "두 노드 간 전달 count/hash·binary bytes·RPC가 일치하고 preflight 실패를 준비 완료로 표시하지 않는다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "실제 PG 통합 test",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.integration.test.ts",
        "type": "코드"
      },
      {
        "label": "adapter preflight",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
        "type": "코드"
      },
      {
        "label": "custom transport",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-pubsub.ts",
        "type": "코드"
      },
      {
        "label": "upstream 문서",
        "url": "https://socket.io/docs/v4/postgres-adapter",
        "type": "근거"
      }
    ],
    "notes": "기본 runtime 모드는 memory. 운영 postgres 사용·환경값은 미확인. upstream recovery 제한을 자체 transport의 결과로 단정하지 않는다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-017",
    "title": "실제 PostgreSQL 2노드 전파·binary·RPC",
    "summary": "테스트용 실제 PG와 독립 API 두 노드에서 소형 JSON·binary·64KiB attachment, fetchSockets·serverSideEmitWithAck를 확인한다. 기존 raw HTTP 통합 테스트만으로 Nest 인증까지 통과했다고 보지 않는다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "장애/복구 timestamp·ready 응답·pool active/idle/waiting·seq gap·복구 hash를 기록한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "테스트 PG의 listener 연결 종료·재접속 실패를 분리해 주입한다.",
      "20초 grace 전후 listener 상태와 /api/health/ready를 측정한다.",
      "PG 복구 후 namespace LISTEN 재등록·broadcast·누락 이벤트 catch-up을 확인한다."
    ],
    "acceptance": "active/reconnecting grace만 ready이며 stale/closed는 not ready. 재구독 후 전달이 회복되고 누락 구간의 결과가 명시된다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "listener lifecycle",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-pubsub.ts",
        "type": "코드"
      },
      {
        "label": "readiness",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/health/health-runtime-readiness.ts",
        "type": "코드"
      },
      {
        "label": "mock 회귀 테스트",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-pubsub.test.ts",
        "type": "코드"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-018",
    "title": "PG listener 장애·20초 grace·재구독·readiness",
    "summary": "active→reconnecting→20초 초과 stale→복구 active 전환, namespace 재구독 및 중단 중 누락 복구를 실제 PG에서 확인한다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P1",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "encoded byte size·연결 상태·ACK/오류·disconnect reason·복구 trace를 전후 저장한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "실행 Gateway의 유효 maxHttpBufferSize·transport·compression 옵션을 기록한다.",
      "인코딩 후 한계 아래/근처/초과 JSON·정상 binary payload를 전송한다.",
      "연결 종료·ACK·오류 사유·앱 복구를 측정한다.",
      "Nest12 반복 binary 참조는 정상 클라이언트 전송과 구분한 격리 adapter 경계로만 평가한다."
    ],
    "acceptance": "효과적 크기 제한과 오류 원인이 일치하며 프로세스 crash·부분 저장·조용한 데이터 손실이 없다. 종료 코드는 실제 관측값으로 기록한다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "Gateway 상수",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-gateway-constants.ts",
        "type": "코드"
      },
      {
        "label": "Gateway options",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live.gateway.ts",
        "type": "코드"
      },
      {
        "label": "Socket.IO maxHttpBufferSize",
        "url": "https://socket.io/docs/v4/server-options/#maxhttpbuffersize",
        "type": "근거"
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
    "id": "nest-019",
    "title": "Socket.IO 384KiB·binary payload 경계",
    "summary": "현재 Gateway의 Socket.IO maxHttpBufferSize=384×1024 bytes를 기준으로 직렬화 후 크기 경계를 확인한다. WsAdapter의 1MiB/1009를 예상값으로 적용하지 않는다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P1",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "후보 SHA·설정·queue count·대기/완료/거부 ID·disconnect·복구 결과를 기록한다. harness 코드 변경이 필요하면 nest-024 승인 범위에 포함한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "격리 harness에서 handler 완료를 제어하여 동시 처리와 대기 수를 따로 계측한다.",
      "한계 전후 이벤트·ACK·disconnect 사유를 기록한다.",
      "강제 종료 후 앱의 명시적 재참가·resync 또는 terminal 처리를 확인한다."
    ],
    "acceptance": "상속된 실제 한도에서 예측 가능한 종료가 발생하고 프로세스·메모리·데이터 무결성이 유지된다. 앱 quota 때문에 도달하지 못했다면 미검증으로 표시한다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "Nest12 queue 구현",
        "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/platform-socket.io/adapters/io-adapter.ts",
        "type": "근거"
      },
      {
        "label": "Nest11 기존 동시성",
        "url": "https://github.com/nestjs/nest/blob/v11.2.9/packages/platform-socket.io/adapters/io-adapter.ts",
        "type": "근거"
      },
      {
        "label": "상속 경로",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
        "type": "코드"
      },
      {
        "label": "강제 disconnect 정책",
        "url": "https://socket.io/docs/v4/client-socket-instance/#disconnect",
        "type": "근거"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-020",
    "title": "Nest12 대기열 10000 한계·강제 종료·회복",
    "summary": "12.5.0 후보에서 client/event별 blocked handler로 대기열 한계를 검증한다. 기존 동시1000·신규 대기10000·앱 quota를 각각 구분하며 운영 부하를 발생시키지 않는다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P1",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "전후 pool/listener/활성 핸들 수·종료 trace·오류 로그·exit 상태를 저장한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "미확인",
    "steps": [
      "정상 부팅 후 동시/반복 close와 여러 namespace 종료를 실행한다.",
      "preflight 실패·listener 재접속 중 종료를 각각 검증한다.",
      "super.close→transport.close→pool.end 순서와 client release 횟수·타이머·핸들을 기록한다."
    ],
    "acceptance": "double release·pool 누수·미종료 타이머 없이 종료하며 이미 닫힌 서버에 추가 부작용이 없다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "미확인 · 실행 증거 없음",
    "evidenceLinks": [
      {
        "label": "close 구현",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
        "type": "코드"
      },
      {
        "label": "transport close",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-pubsub.ts",
        "type": "코드"
      },
      {
        "label": "adapter 단위 test",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.test.ts",
        "type": "코드"
      },
      {
        "label": "pubsub 단위 test",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-pubsub.test.ts",
        "type": "코드"
      }
    ],
    "notes": "코드·문서 열람은 실행 통과 증거가 아니다. 토큰·쿠키·접속 문자열은 증거에서 제거한다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-021",
    "title": "어댑터 반복 종료·초기화 실패·pool 회수",
    "summary": "코드에 있는 WeakMap·단일 close promise 보호가 실제 서버·namespace·transport·pool 수명에서 멱등 종료와 누수 방지를 만족하는지 확인한다."
  },
  {
    "category": "검증 시나리오",
    "priority": "P0",
    "status": "미확인",
    "kind": "최소 검증 시나리오",
    "scope": "API · Studio Live",
    "nextAction": "현재 동일 SHA의 설치·타입·빌드·실제 start 및 관련 테스트 로그·실행/skip 수를 기록한다.",
    "owner": "미지정",
    "commit": "45dbe47d7cc86b238054df608d5bff5757e8afab",
    "checkedAt": "2026-11-18T04:39:54Z",
    "verificationDate": "",
    "environment": "격리 테스트 환경 · 실제 실행 미확인 · 운영 데이터 사용 금지",
    "result": "관련 import 3개 파일·54개 단위 테스트 통과 · 실제 start 미확인",
    "steps": [
      "기준/후보 SHA·lock·Node/pnpm·명령을 고정한다.",
      "frozen-lockfile 설치·API typecheck/build와 dist/apps/api/src/main.js 산출을 확인한다.",
      "실제 start 및 #2798에서 실패한 import/PG/auth 파일 결과를 별도 기록한다.",
      "skip·cancelled·다른 SHA의 성공을 후보 통과로 대체하지 않는다."
    ],
    "acceptance": "같은 후보 SHA에서 필요한 검사 모두 실제 완료하며 build만으로 런타임 검증 완료를 표시하지 않는다.",
    "beforeEvidence": "미확인 · 실행 증거 없음",
    "afterEvidence": "이전main2cfbfa5 CI production build success. main5ea952c 기반개발checkout의 변경하지않은 adapter·socket auth·auth ticket3개파일54개 단위통과. 최신main45dbe47까지 API·lockfile차이없음. 최신CI·실제start·PG·클라이언트연결검증은별도미확인.",
    "evidenceLinks": [
      {
        "label": "PR build success",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43863197015/job/133285000607",
        "type": "CI 로그"
      },
      {
        "label": "PR runtime failure",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43863196898/job/133285000974",
        "type": "CI 로그"
      },
      {
        "label": "API scripts",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
        "type": "코드"
      },
      {
        "label": "CI 정의",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/.github/workflows/ci.yml",
        "type": "코드"
      }
    ],
    "notes": "참고: PR #2798 job133285000607 API+web build success, job133285000974/133285000674 common/internal import failure. 이는 현재 기준/정렬 후보의 전후 실행 증거가 아니다. 기준 스냅샷은 수동 관측이며 저장 시 GitHub·CI·운영 작업을 실행하지 않는다.",
    "approvalRequired": false,
    "archived": false,
    "revision": 0,
    "id": "nest-022",
    "title": "같은 후보 SHA의 빌드·타입·runtime import 검증",
    "summary": "과거 빌드 성공과 runtime import 실패가 공존했다. 현재 핵심5개 정렬을 확인했으며 이전main2cfbfa5의 빌드 성공은 역사 근거다. 최신main45dbe47 CI결론과 실제 start는미확인."
  }
];
