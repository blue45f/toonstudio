// 기준 main 45dbe47d7cc86b238054df608d5bff5757e8afab, 관측 2026-11-18T04:39:54Z. 실제 실행 결과와 정적 근거를 구분한다.
import type { Snapshot } from "./admin-nestjs-quality";

export const nestQualitySnapshot: Snapshot = {
  "observedAt": "2026-11-18T04:39:54Z",
  "observedKst": "2026-11-18 13:39:54 KST",
  "repository": "blue45f/toonstudio",
  "mainSha": "45dbe47d7cc86b238054df608d5bff5757e8afab",
  "mainUrl": "https://github.com/blue45f/toonstudio/commit/45dbe47d7cc86b238054df608d5bff5757e8afab",
  "mainCiUrl": "https://github.com/blue45f/toonstudio/actions/runs/44237128814",
  "mainCiState": "pending · 최신 main의 CI 최종 결론과 개별 실행 결과 미확인",
  "releaseUrl": "https://github.com/nestjs/nest/releases/tag/v12.5.0",
  "releaseDate": "2026-11-12 22:19:45 KST",
  "packages": [
    {
      "name": "@nestjs/common",
      "declared": "^12.5.0",
      "locked": "12.5.0",
      "target": "12.5.0 · 현재 정렬",
      "targetNote": "핵심 5개 패키지의 manifest와 lockfile이 정렬됐다. 실제 API·실시간 검증 결과는 별도 기록한다.",
      "peerSummary": "rxjs ^7.1.0 / reflect-metadata ^0.1.12 || ^0.2.0. 연결된 핵심 Nest 12.5.0의 Nest peer는 ^12.0.0.",
      "assessment": "버전 정렬 확인 · 런타임 호환성은 별도",
      "scope": "API 런타임 / 동일 lockfile",
      "taskId": "nest-001",
      "links": [
        {
          "label": "현재 선언",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "잠금 버전·peer",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
          "type": "코드"
        },
        {
          "label": "12.5.0 공식 peer",
          "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/common/package.json",
          "type": "호환성"
        }
      ]
    },
    {
      "name": "@nestjs/core",
      "declared": "^12.5.0",
      "locked": "12.5.0",
      "target": "12.5.0 · 현재 정렬",
      "targetNote": "핵심 5개 패키지의 manifest와 lockfile이 정렬됐다. 실제 API·실시간 검증 결과는 별도 기록한다.",
      "peerSummary": "현재 핵심 Nest peer는 ^12.0.0이며 common/core/HTTP/Socket.IO 패키지가 모두 12.5.0으로 잠겼다.",
      "assessment": "버전 정렬 확인 · 런타임 호환성은 별도",
      "scope": "API 런타임 / 동일 lockfile",
      "taskId": "nest-001",
      "links": [
        {
          "label": "현재 선언",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "잠금 버전·peer",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
          "type": "코드"
        },
        {
          "label": "12.5.0 공식 peer",
          "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/core/package.json",
          "type": "호환성"
        }
      ]
    },
    {
      "name": "@nestjs/platform-express",
      "declared": "^12.5.0",
      "locked": "12.5.0",
      "target": "12.5.0 · 현재 정렬",
      "targetNote": "핵심 5개 패키지의 manifest와 lockfile이 정렬됐다. 실제 API·실시간 검증 결과는 별도 기록한다.",
      "peerSummary": "현재 핵심 Nest peer는 ^12.0.0이며 common/core/HTTP/Socket.IO 패키지가 모두 12.5.0으로 잠겼다.",
      "assessment": "버전 정렬 확인 · 런타임 호환성은 별도",
      "scope": "API 런타임 / 동일 lockfile",
      "taskId": "nest-001",
      "links": [
        {
          "label": "현재 선언",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "잠금 버전·peer",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
          "type": "코드"
        },
        {
          "label": "12.5.0 공식 peer",
          "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/platform-express/package.json",
          "type": "호환성"
        }
      ]
    },
    {
      "name": "@nestjs/platform-socket.io",
      "declared": "^12.5.0",
      "locked": "12.5.0",
      "target": "12.5.0 · 현재 정렬",
      "targetNote": "핵심 5개 패키지의 manifest와 lockfile이 정렬됐다. 실제 API·실시간 검증 결과는 별도 기록한다.",
      "peerSummary": "현재 핵심 Nest peer는 ^12.0.0이며 common/core/HTTP/Socket.IO 패키지가 모두 12.5.0으로 잠겼다.",
      "assessment": "버전 정렬 확인 · 런타임 호환성은 별도",
      "scope": "API 런타임 / 동일 lockfile",
      "taskId": "nest-001",
      "links": [
        {
          "label": "현재 선언",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "잠금 버전·peer",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
          "type": "코드"
        },
        {
          "label": "12.5.0 공식 peer",
          "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/platform-socket.io/package.json",
          "type": "호환성"
        }
      ]
    },
    {
      "name": "@nestjs/websockets",
      "declared": "^12.5.0",
      "locked": "12.5.0",
      "target": "12.5.0 · 현재 정렬",
      "targetNote": "핵심 5개 패키지의 manifest와 lockfile이 정렬됐다. 실제 API·실시간 검증 결과는 별도 기록한다.",
      "peerSummary": "현재 핵심 Nest peer는 ^12.0.0이며 common/core/HTTP/Socket.IO 패키지가 모두 12.5.0으로 잠겼다.",
      "assessment": "버전 정렬 확인 · 런타임 호환성은 별도",
      "scope": "API 런타임 / 동일 lockfile",
      "taskId": "nest-001",
      "links": [
        {
          "label": "현재 선언",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "잠금 버전·peer",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
          "type": "코드"
        },
        {
          "label": "12.5.0 공식 peer",
          "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/websockets/package.json",
          "type": "호환성"
        }
      ]
    },
    {
      "name": "@nestjs/testing",
      "declared": "API 직접 의존성 없음",
      "locked": "미확인",
      "target": "사용 시 12.5.0 (제안)",
      "targetNote": "API manifest 직접 의존성에 없다. 실제 사용 여부를 확인한 뒤 필요한 경우에만 검토한다.",
      "peerSummary": "공식 testing 12.5.0은 common/core/platform-express ^12.0.0 요구.",
      "assessment": "사용 여부·현재 설치 미확인",
      "scope": "테스트 도구",
      "taskId": "nest-023",
      "links": [
        {
          "label": "API 의존성",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "공식 testing peer",
          "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/testing/package.json",
          "type": "호환성"
        }
      ]
    },
    {
      "name": "socket.io",
      "declared": "^4.8.4",
      "locked": "4.8.4",
      "target": "4.8.4 유지 검토",
      "targetNote": "Nest 버전 번호와 별개. 현재 root override 4.8.4와 후보 의존성 확인.",
      "peerSummary": "Nest platform-socket.io 12.5.0의 직접 의존성 4.8.4. 실제 연결 검증은 별도.",
      "assessment": "버전 확인 · 실행 호환성 미확인",
      "scope": "서버 전송",
      "taskId": "nest-010",
      "links": [
        {
          "label": "의존성",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "override·lock",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
          "type": "코드"
        },
        {
          "label": "Socket.IO 전송 보장",
          "url": "https://socket.io/docs/v4/delivery-guarantees/",
          "type": "근거"
        }
      ]
    },
    {
      "name": "@socket.io/postgres-adapter",
      "declared": "^0.5.0",
      "locked": "0.5.0",
      "target": "0.5.0 유지 검토",
      "targetNote": "독립 패키지. 12.5.0으로 기계적 변경하지 않음.",
      "peerSummary": "잠금은 socket.io-adapter 2.5.8. 프로젝트는 공식 클래스 위에 자체 lifecycle-safe transport를 구성.",
      "assessment": "선언·구현 확인 · 실제 PG 동작 미확인",
      "scope": "노드 간 전파",
      "taskId": "nest-017",
      "links": [
        {
          "label": "의존성",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "자체 어댑터",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
          "type": "코드"
        },
        {
          "label": "upstream PG 문서",
          "url": "https://socket.io/docs/v4/postgres-adapter",
          "type": "근거"
        }
      ]
    },
    {
      "name": "pg",
      "declared": "^8.23.1",
      "locked": "8.23.1",
      "target": "8.23.1 유지 검토",
      "targetNote": "PostgreSQL 드라이버. Nest 메이저와 별도로 검증.",
      "peerSummary": "전용 pool / direct endpoint / LISTEN·NOTIFY·bytea 경로를 코드에서 확인.",
      "assessment": "설정·운영 연결 상태 미확인",
      "scope": "DB 연결·listener",
      "taskId": "nest-018",
      "links": [
        {
          "label": "의존성",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "pool·preflight",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
          "type": "코드"
        }
      ]
    },
    {
      "name": "nestjs-pino",
      "declared": "^5.3.1",
      "locked": "5.3.1",
      "target": "5.3.1 유지 검토",
      "targetNote": "현재 버전 유지 가능성을 검토. Nest12와 같은 번호로 변경하지 않음.",
      "peerSummary": "5.3.1은 @nestjs/common/core ^11.0.8 || ^12.0.2를 선언해 현재 12.5.0을 포함한다. 실제 요청·오류 로깅 검증은 별도.",
      "assessment": "Nest 12 peer 범위 확인 · 실제 로깅 미확인",
      "scope": "요청·오류 로깅",
      "taskId": "nest-023",
      "links": [
        {
          "label": "현재 선언",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "잠금",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
          "type": "코드"
        },
        {
          "label": "배포 패키지 manifest",
          "url": "https://registry.npmjs.org/nestjs-pino/5.3.1",
          "type": "호환성"
        }
      ]
    },
    {
      "name": "nestjs-zod",
      "declared": "^5.6.0",
      "locked": "5.6.0",
      "target": "Nest 12 지원 근거 확인 후 결정",
      "targetNote": "독립 버전 체계. 검증·직렬화 동작을 후보 SHA에서 확인.",
      "peerSummary": "설치된 5.6.0 manifest의 @nestjs/common peer는 ^10.0.0 || ^11.0.0으로 12.5.0을 포함하지 않는다. 실제 요청 검증 실패를 뜻하지는 않는다.",
      "assessment": "선언 peer 범위 불일치 확인 · 실제 재현 미확인",
      "scope": "입력 검증·직렬화",
      "taskId": "nest-023",
      "links": [
        {
          "label": "현재 선언",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
          "type": "코드"
        },
        {
          "label": "잠금",
          "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
          "type": "코드"
        },
        {
          "label": "배포 패키지 manifest",
          "url": "https://registry.npmjs.org/nestjs-zod/5.6.0",
          "type": "호환성"
        }
      ]
    }
  ],
  "prs": [
    {
      "number": 2801,
      "title": "@nestjs/common 11.2.9 → 12.5.0",
      "state": "main 머지 완료",
      "sha": "fa5264efc96a9bc05d11fa7d135ec35f24344ad2",
      "mergedAt": "2026-11-16 21:38:44 KST",
      "url": "https://github.com/blue45f/toonstudio/pull/2801",
      "note": "병합 확인. 미완료 병합 작업에서 제외하고 이력으로 보존한다. 실제 런타임 검증 완료와 별도다."
    },
    {
      "number": 2798,
      "title": "@nestjs/core 11.2.9 → 12.5.0",
      "state": "main 머지 완료",
      "sha": "7e9ab4cd45db8f15951956d542113003c171313c",
      "mergedAt": "2026-11-16T14:57:45Z",
      "url": "https://github.com/blue45f/toonstudio/pull/2798",
      "note": "병합 확인. 미완료 병합 작업에서 제외하고 이력으로 보존한다. 실제 런타임 검증 완료와 별도다."
    },
    {
      "number": 2800,
      "title": "@nestjs/platform-socket.io 11.2.9 → 12.5.0",
      "state": "main 머지 완료",
      "sha": "b8429be8ef243b2961638b08962944a765a9adb2",
      "mergedAt": "2026-11-16T14:57:45Z",
      "url": "https://github.com/blue45f/toonstudio/pull/2800",
      "note": "병합 확인. 미완료 병합 작업에서 제외하고 이력으로 보존한다. 실제 런타임 검증 완료와 별도다."
    }
  ],
  "ci": [
    {
      "title": "기준 main · CI",
      "scope": "main45dbe47",
      "result": "pending",
      "detail": "관측 시 conclusion null. 앞선 main의 빌드 성공·실패 결과를 새 SHA의 결과로 복사하지 않는다. 동일 SHA의 job과 최종 결론을 다시 확인해야 한다.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44237128814",
      "counted": true
    },
    {
      "title": "이전 main 2cfbfa5 · CI",
      "scope": "main 2cfbfa5",
      "result": "in_progress",
      "detail": "관측 시 전체 CI conclusion null. 개별 build는 성공했고 lint·파일 크기·검수 DB job은 실패했다. 남은 작업과 최종 결론은 미확인.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44235319729",
      "counted": false
    },
    {
      "title": "Core production build",
      "scope": "main 2cfbfa5",
      "result": "success",
      "detail": "API+web 프로덕션 빌드 작업 성공. 실제 로그인·Socket.IO 재연결·PG 2노드 시나리오 통과 여부는 미확인.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44235319729/job/134569936119",
      "counted": false
    },
    {
      "title": "Core preflight / 타입 검사 진입",
      "scope": "main 2cfbfa5",
      "result": "failure",
      "detail": "Source file size ratchet 단계 실패: character-lab RenderPanel·ViewportPane·character-engine. 이후 전체 타입 검사 완료 증거로 사용할 수 없다.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44235319729/job/134569936226",
      "counted": false
    },
    {
      "title": "Core strict lint",
      "scope": "character-lab · 원인 분리 · 이전 main2cfbfa5",
      "result": "failure",
      "detail": "toon-reference.ts의 pat 변수 no-useless-assignment. NestJS import 실패와 다른 원인이다.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44235319729/job/134569935779",
      "counted": false
    },
    {
      "title": "Core review database invariants",
      "scope": "검수 권한·동시성 테스트 · 이전 main2cfbfa5",
      "result": "failure",
      "detail": "17 files 중 1 failed / 16 passed. 5 failed / 314 passed / 1 skipped. studio-project-graph-review-race에서 예상 conflict/unsatisfied 대신 studio_manage_forbidden. NestJS 버전 원인 여부 미확인. 별도 개발 checkout에서 정책 fixture와 자기 승인 금지의 충돌을 재현했다. 수정 브랜치의 통과를 이 main의 완료로 기록하지 않는다.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44235319729/job/134569936180",
      "counted": false
    },
    {
      "title": "Core regression · product",
      "scope": "저장소 계약 게이트 · 이전 main2cfbfa5",
      "result": "failure",
      "detail": "source file size ratchet에서 중단. 과거 common/internal import 실패로 재분류하지 않는다.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44235319729/job/134569936413",
      "counted": false
    },
    {
      "title": "과거 PR #2798 · import 실패",
      "scope": "head ed1ac751 · 역사 기록",
      "result": "failure · 과거 SHA",
      "detail": "core12/common11에서 common/internal import 실패. 현재 핵심 5개는 12.5.0으로 정렬됐다. 당시 실패를 현재 main 실패로 집계하지 않는다.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/43863196898/job/133285000974",
      "counted": false
    },
    {
      "title": "이전 main 2cfbfa5 · Lighthouse",
      "scope": "Nest 실행 검증에 포함하지 않음",
      "result": "in_progress",
      "detail": "현재 main 2cfbfa5의 결론은 미확인. 이전 main 5ea952c의 Lighthouse 성공은 과거 Vello 실패를 활성 Nest 문제에서 제외한 근거로만 보존한다.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44235319837",
      "counted": false
    },
    {
      "title": "이전 main 2cfbfa5 · CodeQL",
      "scope": "보안 정적 검사",
      "result": "pending",
      "detail": "관측 시 conclusion null. API 빌드·실시간 실행 근거와 별도다.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44235319753",
      "counted": false
    },
    {
      "title": "이전 main · CI",
      "scope": "main 5ea952c",
      "result": "failure",
      "detail": "이전 main 5ea952c의 완료된 실패 기록. 최신 main 결과와 합산하지 않는다.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44231435766",
      "counted": false
    }
  ],
  "paths": [
    {
      "id": "bootstrap",
      "title": "API 시작",
      "subtitle": "main.ts → NestFactory → listen",
      "detail": "dev: tsx watch src/main.ts / start: node dist/apps/api/src/main.js. PORT > NEST_API_PORT > 4001, host 0.0.0.0. capability-worker는 Studio adapter 생략.",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/main.ts",
      "taskId": "nest-008"
    },
    {
      "id": "http-auth",
      "title": "HTTP 인증·입장권",
      "subtitle": "sessionAuth → CSRF → /api",
      "detail": "POST /api/creator/studio-live/auth-ticket. middleware가 검증한 cookie principal 필요. signed x-user-id header만으로 발급하지 않는 경로.",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-auth-ticket.controller.ts",
      "taskId": "nest-009"
    },
    {
      "id": "adapter",
      "title": "어댑터 등록·확장",
      "subtitle": "useWebSocketAdapter → IoAdapter",
      "detail": "StudioLivePostgresIoAdapter extends IoAdapter. createIOServer → super.createIOServer → server.adapter(custom transport constructor). WsAdapter 상속 아님.",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
      "taskId": "nest-006"
    },
    {
      "id": "admission",
      "title": "Socket admission",
      "subtitle": "/socket.io → /studio-live → studio:join",
      "detail": "HTTP /api prefix와 별도. allowed Origin / private principal / token 소비·제거. websocket-only, maxHttpBufferSize 384 KiB, perMessageDeflate false.",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live.gateway.ts",
      "taskId": "nest-010"
    },
    {
      "id": "reconnect",
      "title": "재연결·재참가",
      "subtitle": "connect → fresh studio:join → snapshot",
      "detail": "manager 8회 재시도 후 이미 입장한 소켓은 배경 timer 가능. 자격 refresh 1회, snapshot/binary 선택 완료 후 ready. 운영 Origin 설정은 미확인.",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/creator/live/studio-live-socket-transport-lifecycle.ts",
      "taskId": "nest-012"
    },
    {
      "id": "events",
      "title": "협업 이벤트",
      "subtitle": "submit → durable store → ACK → broadcast",
      "detail": "opId/seq/duplicate ACK. 새 insert만 broadcast. studio:op:sync(fromSeq)로 복구. ACK와 peer 전달은 별도 검증.",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live-gateway-handlers-op.ts",
      "taskId": "nest-014"
    },
    {
      "id": "postgres",
      "title": "PostgreSQL 전파",
      "subtitle": "preflight → LISTEN/NOTIFY → 재구독",
      "detail": "기본 memory, 명시 postgres만 전용 pool. active→reconnecting(20초 grace)→stale→active/closed. 운영 설정·실연결은 미확인.",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-pubsub.ts",
      "taskId": "nest-017"
    },
    {
      "id": "shutdown",
      "title": "종료·자원 회수",
      "subtitle": "super.close → transport.close → pool.end",
      "detail": "WeakMap와 단일 close promise로 멱등 보호하는 코드 존재. 반복 종료·누수·실제 자원 수는 별도 실행 증거 필요.",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
      "taskId": "nest-021"
    }
  ],
  "exclusions": [
    {
      "title": "핵심 Nest 11/12 혼재",
      "reason": "기준 main의 핵심 5개 선언과 잠금 버전 모두 12.5.0. 해결된 버전 혼재를 활성 문제로 남기지 않는다.",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json"
    },
    {
      "title": "PR #2801 재병합",
      "reason": "main 병합 확인. 완료 이력으로 보존하며 중복 병합 작업에서 제외한다.",
      "url": "https://github.com/blue45f/toonstudio/pull/2801"
    },
    {
      "title": "PR #2798 재병합",
      "reason": "main 병합 확인. 완료 이력으로 보존하며 중복 병합 작업에서 제외한다.",
      "url": "https://github.com/blue45f/toonstudio/pull/2798"
    },
    {
      "title": "PR #2800 재병합",
      "reason": "main 병합 확인. 완료 이력으로 보존하며 중복 병합 작업에서 제외한다.",
      "url": "https://github.com/blue45f/toonstudio/pull/2800"
    },
    {
      "title": "PR #2798 과거 import 실패 집계",
      "reason": "다른 SHA·core12/common11 조합의 실패다. 현재 버전 혼재는 해소됐으며 실제 재현 결과는 별도 시나리오에서 기록한다.",
      "url": "https://github.com/blue45f/toonstudio/pull/2798"
    },
    {
      "title": "PR #2800 과거 Lighthouse Vello 실패",
      "reason": "Nest와 독립 원인이며 이전 main 5ea952c의 Lighthouse 성공을 확인했다. 현재 main 2cfbfa5의 Lighthouse 결론은 미확인이고, 과거 실패를 현재 Nest 회귀 건수에 합산하지 않는다.",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44231435606"
    },
    {
      "title": "이미 존재하는 PG 방어 코드",
      "reason": "preflight·재구독·종료 보호와 테스트 존재. 새 결함으로 단정하지 않고 실행 회귀 시나리오로 관리한다.",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.test.ts"
    }
  ],
  "sources": [
    {
      "label": "기준 main45dbe47 CI",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44237128814",
      "type": "CI"
    },
    {
      "label": "최신 main API 의존성",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json",
      "type": "코드"
    },
    {
      "label": "최신 main lockfile",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml",
      "type": "코드"
    },
    {
      "label": "CI 정의",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/.github/workflows/ci.yml",
      "type": "코드"
    },
    {
      "label": "PR #2801",
      "url": "https://github.com/blue45f/toonstudio/pull/2801",
      "type": "PR"
    },
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
      "label": "PR #2798 import 실패 로그",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/43863196898/job/133285000974",
      "type": "CI 로그"
    },
    {
      "label": "StudioLivePostgresIoAdapter",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts",
      "type": "코드"
    },
    {
      "label": "PostgreSQL transport",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-pubsub.ts",
      "type": "코드"
    },
    {
      "label": "Gateway",
      "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/modules/creator/studio-live.gateway.ts",
      "type": "코드"
    },
    {
      "label": "NestJS 12.5.0 공식 릴리스",
      "url": "https://github.com/nestjs/nest/releases/tag/v12.5.0",
      "type": "릴리스"
    },
    {
      "label": "공식 IoAdapter 12.5.0",
      "url": "https://github.com/nestjs/nest/blob/v12.5.0/packages/platform-socket.io/adapters/io-adapter.ts",
      "type": "코드"
    },
    {
      "label": "공식 어댑터 문서",
      "url": "https://docs.nestjs.com/websockets/adapter",
      "type": "공식 문서"
    },
    {
      "label": "Socket.IO 전송 보장",
      "url": "https://socket.io/docs/v4/delivery-guarantees/",
      "type": "공식 문서"
    },
    {
      "label": "Socket.IO 재연결",
      "url": "https://socket.io/docs/v4/client-socket-instance/#disconnect",
      "type": "공식 문서"
    },
    {
      "label": "Socket.IO payload 한도",
      "url": "https://socket.io/docs/v4/server-options/#maxhttpbuffersize",
      "type": "공식 문서"
    },
    {
      "label": "upstream PostgreSQL 어댑터",
      "url": "https://socket.io/docs/v4/postgres-adapter",
      "type": "공식 문서"
    },
    {
      "label": "이전 main2cfbfa5 CI",
      "url": "https://github.com/blue45f/toonstudio/actions/runs/44235319729",
      "type": "CI"
    },
    {
      "label": "nestjs-zod 5.6.0 manifest",
      "url": "https://registry.npmjs.org/nestjs-zod/5.6.0",
      "type": "호환성"
    },
    {
      "label": "nestjs-pino 5.3.1 manifest",
      "url": "https://registry.npmjs.org/nestjs-pino/5.3.1",
      "type": "호환성"
    }
  ],
  "sequence": [
    {
      "title": "1 · 기준 고정",
      "detail": "main SHA·manifest·lock·PR 병합·CI 결과를 고정한 수동 스냅샷. 새 main으로 자동 갱신되지 않는다.",
      "status": "검증 완료"
    },
    {
      "title": "2 · 핵심 버전 정렬 이력",
      "detail": "핵심 5개 12.5.0 정렬과 #2798/#2800 병합을 확인. 추가 변경은 승인 대기 항목에서만 검토한다.",
      "status": "main 머지 완료"
    },
    {
      "title": "3 · 연관 패키지·실제 경로 검증",
      "detail": "nestjs-zod peer 범위, API 인증·연결·재연결·이벤트·PG 경로를 같은 SHA에서 검증하고 전후 증거를 남긴다.",
      "status": "미확인"
    },
    {
      "title": "4 · 추가 코드·PR 변경 검토",
      "detail": "새로 필요한 변경의 영향·검증·중복 여부를 검토한다. 보드에서는 승인 메모만 저장한다.",
      "status": "승인 대기"
    },
    {
      "title": "5 · 운영 반영 검토",
      "detail": "배포·설정·마이그레이션·롤백은 별도 승인과 실행 증거가 필요하다.",
      "status": "승인 대기"
    }
  ]
};
