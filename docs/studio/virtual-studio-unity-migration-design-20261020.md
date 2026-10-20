# 가상스튜디오 Godot → Unity 엔진 교체 설계

작성: 2026-10-20 · 기준: main 브랜치 실측 파일 (아래 §0 목록)
범위: 가상스튜디오 3D 무대(`apps/web/src/domains/creator/virtual-space/` + `apps/api/src/modules/studio-godot-space-layout/`)의 엔진 교체. 셸(React)·API·저장 데이터는 엔진 중립이므로 유지하고, 무대(엔진)만 교체하는 것이 이 설계의 전제다.

## 0. 읽은 파일 (계약의 근거)

웹: `StudioGodotSpaceEmbed.tsx`, `studio-godot-host-bridge.ts`, `studio-godot-space-embed-support.ts`, `studio-godot-space.ts`, `studio-godot-meeting-session.ts`, `StudioGodotMeetingPanel.tsx`, `StudioGodotLayoutPanel.tsx`
API: `studio-godot-space-layout.dto.ts` / `.controller.ts` / `.service.ts` / `.module.ts`, `studio-godot-space-background.dto.ts` / `.controller.ts` / `.service.ts`, `studio-godot-background-glb.ts`
정적: `apps/web/public/godot-space/index.html`(GODOT_CONFIG), `apps/web/public/godot-space/spaces.json`(실측 샘플), `apps/web/public/_headers`(헤더 규칙 — 원본은 `config/http-response-headers.json`에서 `scripts/cloudflare-static-rules.mjs`로 생성)
테스트 파일 존재 확인: `StudioGodotSpaceEmbed.test.tsx`, `StudioGodotLayoutPanel.test.tsx`, `studio-godot-space.test.ts`, `studio-godot-meeting-session.test.ts`, API 쪽 `studio-godot-space-layout.dto.test.ts`, `studio-godot-space-layout.service.test.ts`, `studio-godot-space-background.service.test.ts`, `studio-godot-background-glb.test.ts`

읽지 못한 것·추측으로 표시한 것은 NOTES.md에 분리했다.

## 1. 현행 구조 요약 (실측)

- 셸(`StudioGodotSpaceEmbed.tsx`)이 iframe으로 `/godot-space/index.html`을 띄우고, 경계는 정확히 세 가지뿐이다.
  1. 무대→셸: 부모 창의 `window.__tsvsHost` 콜백 객체 (13개 메서드, 전부 JSON 문자열 인자).
  2. 셸→무대: iframe `contentWindow`의 전역 함수 `__tsvs_*` (11개 선언, 아래 §2.2).
  3. 셸→무대 폴링: iframe 창의 `__godotBgState` 문자열 (무대 배경 로더 상태).
- 셸 소유: 계정 세션·티켓 발급/갱신(메모리만 보관), 연결 생존성(visibility 전파, 20초 워치독 ping), 공간 정의 해석(정적 카탈로그 → 작품별 저장본), 배치 편집 폼·저장 동선, 화상 세션(WebRTC)의 전체 상태 기계(`studio-godot-meeting-session.ts`).
- 무대 소유: 공간 렌더·이동·구역 판정·근접 판정·상호작용 판정·배치 드래그 편집·배경 GLB 로드·실시간 채널(presence + screen-signaling) 접속과 신호 중계.
- 공간 전환은 셸 상태 리셋이 아니라 **iframe 리로드**(src 교체)가 정본 동선이다 (`switchSpace`).

## 2. 브리지 계약 전수 목록

### 2.1 부팅 계약 (iframe URL)

| 형태 | src | 비고 |
|---|---|---|
| 온라인 최초 진입 | `/godot-space/index.html` | 쿼리 없음. 공간은 세션 페이로드·applyLayout으로 전달 |
| 공간 전환 (온라인) | `/godot-space/index.html?space=<spaceId>` | 무대 부팅 기본 공간 지정 |
| 로컬 모드 최초 | `/godot-space/index.html?local=1[&px=<x>&py=<y>]` | `local=1`이면 세션 없이 로컬 구동. px/py는 저장된 마지막 위치 (해당 공간일 때만) |
| 로컬 공간 전환 | `/godot-space/index.html?local=1&space=<spaceId>[&px=..&py=..]` | |

- 셸은 `window.__tsvsHost`를 등록한 **뒤에** frameSrc를 세팅한다 (onGodotReady를 놓치지 않기 위한 순서 계약). 언마운트 시 `__tsvsHost` 삭제, 티켓 타이머·발급 AbortController 정리.
- iframe 속성: `allow="autoplay; fullscreen"`, 비율 3:2, sandbox 없음.

### 2.2 셸 → 무대 (`iframe.contentWindow.__tsvs_*`, `TsvsGodotFrameWindow`)

전부 선택적(optional) 호출 — 무대에 함수가 없으면 셸은 조용히 건너뛴다.

| # | 함수 | 인자 | 페이로드 필드 | 호출 시점 (셸 코드 기준) |
|---|---|---|---|---|
| 1 | `__tsvs_setSession(json)` | JSON 문자열 | `{v:1, ticket, ws, workId, roomId, name, color, skinKey?, restore?, space?}` — `ws`는 실시간 오리진의 https→wss 치환, `roomId === workId`, `color`는 `#rrggbb`, `restore:{spaceId,x,y}`는 저장 위치가 현재 공간과 일치할 때만, `space`는 해석된 공간 정의의 무대용 사본(§3 배경 참조 변환 적용) | 티켓 발급 완료 시 (`injectSession`). 주입 직후 문서가 hidden이면 `__tsvs_setVisibility(true)`도 연달아 호출 |
| 2 | `__tsvs_setVisibility(hidden)` | boolean (JSON 아님) | — | 세션 주입 시(hidden인 경우) + `visibilitychange`마다 |
| 3 | `__tsvs_bridgePing()` | 없음 | — | 20초 간격 타이머, phase가 `connected`일 때만. 무대 루프가 얼어도 셸이 생존 신호 발행을 지시하는 워치독 |
| 4 | `__tsvs_requestReconnect()` | 없음 | — | **타입 선언만 있고 셸 코드에 호출 지점이 없다** (grep 전수 확인). 사문화된 계약으로 보고 Unity에서는 구현하지 않되, 선언 제거는 정리 단계에서 |
| 5 | `__tsvs_sendSignal(json)` | JSON 문자열 | 회의 신호 객체 그대로 (§2.5). 무대는 해석하지 않고 Worker의 screen-signaling 채널로 중계 | 회의 세션(`StudioGodotMeetingSession`)의 모든 신호 송신 |
| 6 | `__tsvs_showBubble(json)` | JSON 문자열 | `{actorId, text}` — actorId는 자기 actorId (zoneInfo에서), text는 입력 최대 200자 | 말풍선 채팅 전송 시 |
| 7 | `__tsvs_showEmote(json)` | JSON 문자열 | `{actorId, emote}` — emote id는 카탈로그 16종 중 바에 노출된 10종 (`wave, heart, party, thumbs-up, laugh, clap, wow, think, idea, dance`) | 이모트 바 버튼 클릭 시 |
| 8 | `__tsvs_setEditMode(enabled)` | boolean (JSON 아님) | — | 배치 편집 모드 토글 시 |
| 9 | `__tsvs_applyLayout(json)` | JSON 문자열 | `{spec: <공간 정의 무대용 사본>}` — 세션 페이로드의 `space`와 **키가 다르다** (`spec` vs `space`) | 공간 정의 해석 완료 시, 초안 편집(배경 교체 등) 시. 단 배경 로드가 진행 중이면 셸이 정착까지 보류했다가 흘려보낸다 (§2.4) |
| 10 | `__tsvs_layoutCommand(json)` | JSON 문자열 | `{op:"add", category:"zone"\|"prop", kind}` / `{op:"update", category, index, fields:{name?, kind?, rect?:[x,y,w,h]}}` / `{op:"delete", category, index}` (`GodotLayoutCommand`) | 배치 패널의 추가·숫자 편집 적용·삭제 |
| 11 | `__tsvs_notifyLayout(json)` | JSON 문자열 | `{spaceId, revision}` | API 저장 성공 직후. 무대가 같은 방에 알리면 상대 셸이 재조회한다 (수신 측은 §2.3-13) |

### 2.3 무대 → 셸 (`window.__tsvsHost.*`, `TsvsHostBridge`, 구현은 `studio-godot-host-bridge.ts`)

전부 `(json: string) => void`. 셸은 `parseHostPayload`로 파싱 실패 시 조용히 버린다.

| # | 콜백 | 페이로드 필드 | 셸의 처리 |
|---|---|---|---|
| 1 | `onGodotReady(json)` | (구현은 인자 무시) | 티켓 발급+세션 주입 시작 (`issueAndInject`) |
| 2 | `onConnectionState(json)` | `{state}` — `"connected"` / `"disconnected"`만 유효 | phase 전이 |
| 3 | `onTicketNeeded(json)` | (인자 무시) | 티켓 재발급+재주입. 접속 완료 후에는 티켓 만료 타이머가 재발급하지 않으므로, 재접속 동선의 진입점 |
| 4 | `onZoneChanged(json)` | `{selfZoneId, selfActorId, selfClientId, presenterActorId, peerClientIds:{actorId→clientId}, names:{actorId→name}, zones:[{zoneId, kind, name, occupants:[actorId]}]}` | 구역 상태 저장. 회의 맥락은 여기서 도출: kind가 `meeting`/`presentation`인 구역의 점유 합집합으로 상대 1명을 특정 |
| 5 | `onProximityChanged(json)` | `{size:number}` | 근접 대화 인원 표기 (`size >= 2`일 때만 UI 노출) |
| 6 | `onSignal(json)` | `{fromClientId, payload:<신호 객체>}` | 회의 세션 `handleSignal(fromClientId, payload)`. 자기 에코(clientId 일치)는 세션이 버린다 |
| 7 | `onBubble(json)` | `{fromActorId, text}` | 채팅 로그 추가 (이름은 zoneInfo.names 조회, 없으면 "상대"). 로그는 최근 50개 유지 |
| 8 | `onEmote(json)` | `{fromActorId, emote}` | 글리프 맵(16종)에 있는 id만 채팅 로그에 글리프로 추가. 자기 이모트면 fromSelf 판정 |
| 9 | `onInteract(json)` | `{kind}` — 라벨 맵 키: `board, desk, stage, bench, table, storefront` | 안내 문구 4초 표시. 맵에 없는 kind는 무시 |
| 10 | `onPosition(json)` | `{spaceId, x, y}` (전부 필수 타입 검사) | localStorage `tsvs-last-position:<workId>`에 `{spaceId, x, y, at}` 저장 (TTL 30일). 셸만 저장한다 |
| 11 | `onLayoutChanged(json)` | `{spec: <공간 정의>}` — 무대 정규화를 통과한 정의 | 배경 참조를 저장 정본(`uploads/…`)으로 역변환한 뒤 셸 초안으로 채택, dirty 표시. `spec.id`가 현재 공간과 다르면 무시 |
| 12 | `onLayoutSelection(json)` | `{selection:{category?\|type, index, kind, name, rect:[x,y,w,h]}}` — 무대 편집기는 구분 키로 **`type`**을 보낸다 (category는 예비 키). 빈 객체면 선택 해제 | 배치 패널 선택 상태 갱신 |
| 13 | `onLayoutRemote(json)` | `{spaceId}` | spaceId가 현재 공간일 때만: 내 미저장 변경이 있으면 저장 상태를 `conflict`로, 없으면 재조회 nonce 증가 (재조회→applyLayout 동선) |

### 2.4 셸 → 무대 폴링 계약 (콜백이 아님)

| 이름 | 위치 | 의미 |
|---|---|---|
| `__godotBgState` | iframe 창의 전역 문자열. 무대 배경 로더(`bg_stage.gd`)가 표기 | `"idle" \| "loading" \| "ready" \| "failed"` |

- 셸은 티켓 발급 전과 applyLayout 전파 전에 이 값이 `loading`이 아니게 될 때까지 50ms 간격으로 폴링한다 (상한 65초. 값이 끝내 나타나지 않으면 300ms만 기다리고 진행 — 무대·테스트 더블 호환).
- 존재 이유 (코드 주석·실측 기록): Godot 무대의 배경 HTTPRequest가 하나뿐이라 부팅 배경 다운로드 중 새 적용이 닿으면 요청이 실패(err=44)하고 적용이 유실됨. **이 경합은 Godot 로더 고유 사정**이지만, 셸 동선이 이 상태 계약에 묶여 있으므로 Unity도 같은 상태 표기를 제공해야 셸을 그대로 쓸 수 있다 (§4).

### 2.5 회의 신호 계약 (무대 중계, 페이로드는 무대에 불투명)

- 메시 세션 id: `"p2p-mesh-v1"` (`GODOT_MEETING_MESH_SESSION_ID`). 핸드셰이크 없이 offer/answer/ice를 바로 중계하는 구조.
- 셸→무대(`__tsvs_sendSignal`) 페이로드:
  - `{kind:"signal.offer", sessionId:"p2p-mesh-v1", peerConnectionId, targetClientId, sdp}`
  - `{kind:"signal.answer", sessionId, peerConnectionId, targetClientId, sdp}`
  - `{kind:"signal.ice", sessionId, peerConnectionId, targetClientId, candidate:{candidate, sdpMid, sdpMLineIndex, usernameFragment}}`
  - `{kind:"signal.stop", shareId:"p2p-mesh-v1"}` — **stop만 `sessionId`가 아니라 `shareId` 키를 쓴다** (현행 코드 실측). 무대는 중계만 하므로 영향 없지만, Unity 무대도 페이로드를 해석·재구성하지 말고 그대로 통과시켜야 한다.
- 발신 규칙: clientId가 더 큰 쪽이 offer 한다 (양쪽 셸이 같은 규칙으로 계산, 무대 무관).
- 무대→셸은 §2.3-6의 `{fromClientId, payload}` 봉투.
- ICE는 셸의 정책 리스(STUN-only, TURN 없음)가 만든 팩토리로만 생성 — 엔진과 무관하게 유지된다.

### 2.6 티켓·세션 계약 (셸 내부, 엔진 무관 — 참고용 전수)

- 티켓 요청: `{version:1, providerId, sessionId, scope:{workId, roomId:workId}, workloads, capabilities}`.
  - providerId 기본값 `"cloudflare-realtime-v1"` (env `VITE_STUDIO_REALTIME_PROVIDER_ID`로 교체 가능). sessionId는 셸이 만든 UUID (없으면 `godot-shell-<ts>` 폴백 — 접두사만 Unity에서 교체).
  - 일반: workloads `["presence","screen-signaling"]`, capabilities 7종 = `presence.snapshot-v1, presence.members-v1, presence.cursor-v1, presence.resume-v1, screen-signaling.session-v1, screen-signaling.webrtc-v1, screen-signaling.resume-v1`.
  - 게스트: workloads `["presence"]`, capabilities는 presence 4종만. 게스트는 회의 세션·ICE 리스·배치 저작·저장본 조회를 전부 켜지 않는다 (presenceOnly 분기).
- WS 오리진: env `VITE_STUDIO_REALTIME_ORIGIN`을 해석한 값. 없으면 phase `unavailable`.
- 티켓은 메모리에만 두고 저장·URL·로그에 남기지 않는다. 만료 마진 10초, 미접속 상태에서만 만료 타이머가 재발급한다 (코드 주석상 티켓 수명 120초).
- localOnly(개인 공간)는 티켓 자체가 없어 무대만 로컬로 띄운다.

### 2.7 정적 카탈로그·API 계약 (엔진 무관, 유지 대상)

- 정적 카탈로그: `GET /godot-space/spaces.json` → `{v:1, spaces:[<정의>]}`. 빌드와 함께 배포되는 기본 정의 묶음. 해석 순서: 작품별 저장본(API) 우선 → 카탈로그 기본값. 게스트·로컬은 카탈로그만 쓴다.
- 레이아웃 API (`creator/works/:workId/godot-space-layouts/:spaceId`):
  - `GET` → `{workId, spaceId, definition, revision, updatedByUserId, updatedAt}`. 저장본 없으면 404 = "기본 정의 사용 중"이라는 정상 상태.
  - `PUT` ← `{definition, expectedRevision}` → 성공 시 갱신된 DTO, 충돌 시 409 `{message, currentRevision}`. expectedRevision=0+행 없음이면 신규(revision 1), 아니면 revision 일치 행만 갱신 (낙관적 동시성, 마이그레이션 0106·0107의 테이블이 정본).
  - 인증은 `x-user-id` 헤더 규약 + 작품 멤버십 (읽기=view, 저장=edit).
- 배경 GLB API (`creator/works/:workId/godot-space-backgrounds`):
  - `POST` (multipart `file`, 최대 20MB) → `{assetId, glbRef:"uploads/<uuid>.glb", fileName, byteSize, sha256, uploadedByUserId, createdAt}`.
  - `GET` 목록 / `DELETE :assetId`. 작품당 상한: 12개·총 100MB (DB bytea 저장).
  - `GET :assetId/content` — **인증 없음** (assetId UUID가 capability). `Cache-Control: public, max-age=31536000, immutable`, ETag=sha256, `model/gltf-binary`, inline. 무대(엔진)는 커스텀 인증 헤더를 실을 수 없다는 전제의 설계라 Unity에서도 그대로 성립한다.
  - 업로드 검증(`studio-godot-background-glb.ts`): glTF 2.0 바이너리, JSON+BIN 청크 정합, 메시 ≥1, 그리고 **필수(required) 확장에 `EXT_meshopt_compression`, `KHR_mesh_quantization`, `KHR_draco_mesh_compression`, `KHR_texture_basisu`가 있으면 거절** (Godot GLTFDocument가 못 읽는 확장의 금지 목록. `EXT_texture_webp`는 허용으로 실측됨).

## 3. 공간 정의 호환 판정

### 3.1 판정: 저장된 레이아웃 JSON은 그대로 쓸 수 있다

- 정의 포맷 v1은 셸(zod)·API(zod)·DB(JSON+revision)가 소유하는 순수 JSON 계약이고 엔진 이름이 박힌 필드가 없다. **데이터 마이그레이션 불요.** Unity 무대는 같은 정의를 소비자로서 읽으면 된다.
- 필드 전수 (API dto 기준 상한):
  - `v: 1`, `id` (`/^[a-z0-9-]+$/`, ≤64), `name` (≤80)
  - `size: [w, h]` (각 400..4000)
  - `door?: [x, y]` (각 0..4000)
  - `floor?: string` (≤32, 실측값 `"#2e3444"` 같은 색상 문자열)
  - `background?: {glb, hideNodes?: string[] (≤16), camHeight?(2..40), camDist?(2..60), camFov?(20..90), camTargetLead?(-6..6), yaw?(-360..360)} | null` — `glb`는 `spaces/<slug>.glb` 또는 `uploads/<uuid>.glb` 패턴만 허용
  - `zones[]` (≤24): `{id, kind: meeting|presentation|focus|lounge|open, name, rect}`
  - `props[]` (≤64): `{kind: desk|bench|plant|board|storefront|stage|tree|lamp|table|crosswalk|sign|rug, name?, rect}`
  - `npcs[]` (≤6, 선택): `{name, role?, skin?, color?, points: [x,y][] (2..16), lines?: string[] (≤12)}` — 무대 로컬 연출용 (프레즌스 아님)

### 3.2 rect의 의미 (실측 확정)

- `rect = [x, y, w, h]` — 좌상단 좌표 + 너비·높이. 배치 패널 폼 필드가 X/Y/너비/높이 4개이고 `rect:[num("x"), num("y"), num("w"), num("h")]`로 조립한다.
- 검증 범위: x·y는 0..4000, w·h는 24..4000. 편집 UI step은 10, min은 0. 즉 정의 평면은 **좌상단 원점의 2D 평면**이고 단위는 미터가 아닌 "평면 단위"다 (방 하나가 1600×1200).

### 3.3 Unity 좌표계 변환 — 필요한 것과 불확실한 것

**확정 사실**
- 정의·위치·NPC 경로는 전부 2D 평면 좌표 `(x, y)`다. `onPosition`도 `{spaceId, x, y}` 2D만 주고받는다. 높이(z) 개념은 계약에 없다.
- 카메라 필드(camHeight 2..40, camDist 2..60, camTargetLead −6..6)는 평면 단위와 자릿수가 다른 **미터급 값**이다. 1600×1200 평면이 방 하나이고 camHeight 실측 기본값이 10.5, camDist가 12인 것과 함께 보면, 무대 내부에서 평면→월드 변환 배율이 존재한다는 것만 확정할 수 있다.

**불확실 (Godot 프로젝트 소스가 레포에 없어 GDScript 변환식을 읽을 수 없음 — NOTES 참조)**
- 평면→월드의 정확한 배율과, 평면 y가 월드 −Z인지 +Z인지(미러 여부)는 현행 무대 내부 구현에만 있다.

**Unity 설계 결정 (제안)**
- 변환 상수를 Unity 무대 한 곳에 명시한다: `PLANE_UNITS_PER_METER = 100` (1600×1200 → 16m×12m 방, camHeight 10.5m·camDist 12m와 정합하는 유일한 자릿수 — 단, 이는 추론이므로 3단계 A/B 검증으로 확정한다).
- 매핑: `worldX = x / 100`, `worldZ = y / 100`, 높이 `worldY`는 무대가 부여 (바닥 0). rect 중심은 `((x + w/2)/100, (y + h/2)/100)`, 점유 면적은 `(w/100) × (h/100)` m.
- 미러 검증: door([740, 860])·spawn·zone 배치를 랜드마크로 삼아 Godot 무대 화면과 Unity 무대 화면을 대조한다. y 부호가 뒤집힌 것으로 판명되면 `worldZ = (sizeH − y) / 100`로 한 줄 교정하는 구조로 둔다 (부호를 상수 `PLANE_Y_TO_WORLD_Z_SIGN`로 분리).
- 카메라: 대상 = 액터 위치 + 전진 방향 × camTargetLead, 카메라 위치 = 대상 + yaw 회전 × camDist (수평) + camHeight (수직), FOV = camFov. yaw 0 기준 방향도 A/B로 맞춘다.
- `hideNodes`: GLB 노드 이름으로 숨김. Unity glTF 런타임 로더도 노드 이름을 보존하므로 이름 조회→비활성화로 동등 구현 가능.
- `floor`: 색상 문자열 → 바닥 재질 색으로 해석 (Unity `ColorUtility.TryParseHtmlString`).
- 배경 GLB 참조 해석(§14 변환)은 셸이 이미 수행한다: 저장 정본 `uploads/<uuid>.glb` → 주입 시점에만 content 절대 URL로, 정적 `spaces/…` 상대 참조 → 스테이지 base(`/godot-space/` → `/unity-space/`) 절대 경로로. **Unity에서도 이 변환은 셸이 그대로 수행**하고 무대는 받은 URL을 fetch만 한다.

### 3.4 카탈로그에만 있는 무대 전용 필드 (주의)

`spaces.json` 실측본에는 zod 스키마에 없는 필드가 있다: `kind:"room"`, `rug:[x, y, w, h, 색1, 색2]`, `spawn:{a:[x,y], b:[x,y]}`, `wall:28`.
- 셸 zod는 미지 필드를 제거(strip)하므로, 셸 경유 정의에는 이 필드가 남지 않는다. 즉 현행 Godot 무대는 이 필드들을 **카탈로그 파일을 직접 읽어** 소비하는 것으로만 설명이 된다 (무대의 부팅 동선).
- Unity 대응: 무대가 부팅 시 같은 카탈로그 파일(신 경로 `/unity-space/spaces.json`으로 복사)을 직접 읽는 동선을 유지한다. 장기적으로는 `spawn`처럼 기능적으로 필요한 필드를 스키마 v1에 승격하는 것을 별도 과제로 둔다 (스키마 변경은 API·셸 동시 변경이라 이 교체의 범위를 넘는다).

## 4. Unity 대응 매핑

### 4.1 임베드 형태: iframe + 전용 페이지 패턴 유지 (권장)

현행과 동일하게 전용 페이지(`/unity-space/index.html`)를 iframe으로 띄우는 방식을 유지한다. 근거:
- §2의 계약 3종이 전부 "iframe 창 전역" 기준이라, Unity 페이지의 JS 글루가 같은 전역들을 제공하면 **셸 변경이 경로·이름 수준으로 끝난다**.
- 헤더/CSP 격리 블록이 경로 단위로 이미 존재하고 복제만 하면 된다 (§5).
- Unity 인스턴스 종료(`Quit()`) 같은 수명주기 부담이 페이지 안에 갇힌다. React 페이지에 캔버스를 직접 붙이는 방식은 `createUnityInstance` 수명주기와 언마운트 정리를 셸이 떠안아 변경 폭이 커진다 — 채택하지 않는다.

### 4.2 Unity 페이지 내부 구조

- Unity WebGL 빌드의 표준 산출물(`index.html`, `Build/*.loader.js`, `*.framework.js`, `*.wasm`, `*.data`, `TemplateData/`)을 `/unity-space/`에 배치한다. 페이지 스크립트가 `createUnityInstance(canvas, config, onProgress)`로 인스턴스를 만들고, **인스턴스 준비 완료 + 장면 초기화 완료 시점에** §4.3의 준비 신호를 보낸다.
- 부팅 쿼리(`?space=`, `?local=1`, `&px=&py=`)는 페이지 스크립트가 파싱해 Unity로 전달한다 (현행 Godot 페이지와 같은 해석).
- 페이지 글루가 노출할 전역 (현행 `TsvsGodotFrameWindow`와 1:1):
  - `__tsvs_setSession(json)` → `unityInstance.SendMessage("TsvsBridge", "OnSetSession", json)`
  - `__tsvs_setVisibility(hidden)` → SendMessage `"OnSetVisibility"`, 인자는 `"1"/"0"` 문자열 (SendMessage는 문자열·숫자 단일 인자만 받는다)
  - `__tsvs_bridgePing()` → SendMessage `"OnBridgePing"`, `""`
  - `__tsvs_sendSignal(json)` → `"OnSendSignal"`
  - `__tsvs_showBubble(json)` → `"OnShowBubble"`
  - `__tsvs_showEmote(json)` → `"OnShowEmote"`
  - `__tsvs_setEditMode(enabled)` → `"OnSetEditMode"`, `"1"/"0"`
  - `__tsvs_applyLayout(json)` → `"OnApplyLayout"`
  - `__tsvs_layoutCommand(json)` → `"OnLayoutCommand"`
  - `__tsvs_notifyLayout(json)` → `"OnNotifyLayout"`
  - `__godotBgState` → 이름 유지 또는 `__tsvsBgState`로 개명 (개명 시 셸 폴링 코드 1곳 수정; 전환기에는 페이지가 두 이름을 같이 표기하는 것이 안전)
- **준비 전 호출 큐잉**: Unity 인스턴스가 준비되기 전에 온 `__tsvs_*` 호출은 페이지 글루가 큐에 쌓아 준비 직후 순서대로 흘려보낸다. 현행 Godot에서는 "세션 주입 전 applyLayout는 무대가 버리고, 주입 페이로드가 정의를 싣는다"는 우연한 동선에 셸이 기대고 있는데, Unity에서는 큐잉으로 명시적으로 보장하는 편이 안전하다 (주입 페이로드가 `space`를 싣는 계약 자체는 유지).
- 연결 해제·페이지 언로드 시 `unityInstance.Quit()`를 호출한다 (iframe src 교체 = 페이지 언로드라 자동 정리되지만, 명시 호출이 메모리 반환을 보장).

### 4.3 무대 → 셸: .jslib 외부 호출

- C# 측 브리지(`TsvsBridge.cs`)가 Unity의 JavaScript 인터페이스 플러그인(`TsvsHost.jslib`)을 통해 **부모 창**의 `window.parent.__tsvsHost.*`를 호출한다 (동일 오리진 iframe이라 부모 접근 가능 — 현행 헤더의 CORP same-origin이 이를 보장).
- 매핑 (13종 전부 JSON 문자열 단일 인자라 현행 시그니처와 동일):
  - 부팅 완료 → `onGodotReady("")` (이름 유지; 개명은 셸 정리 단계에서 `onStageReady` 등으로 일괄)
  - WS 상태 → `onConnectionState(JSON {state})`
  - 티켓 필요 → `onTicketNeeded("")`
  - 구역 → `onZoneChanged(JSON)` / 근접 → `onProximityChanged(JSON {size})`
  - 신호 수신 → `onSignal(JSON {fromClientId, payload})` — payload는 해석하지 않고 봉투째
  - 말풍선·이모트·상호작용 수신 → `onBubble` / `onEmote` / `onInteract`
  - 위치 → `onPosition(JSON {spaceId, x, y})` — **발행 빈도는 현행 무대와 같은 수준으로** (이동 확정·간격 기준; 프레임마다 보내면 셸이 매번 localStorage에 쓴다)
  - 배치 → `onLayoutChanged(JSON {spec})` / `onLayoutSelection(JSON {selection})` (구분 키는 현행처럼 `type`으로 보낸다) / `onLayoutRemote(JSON {spaceId})`
- `__tsvsHost` 이름은 유지한다 — 셸 등록 코드·브리지 파일이 무변경으로 재사용된다.

### 4.4 createUnityInstance 수명주기와 셸 phase의 대응

| 셸 phase | Godot 현행 | Unity 대응 |
|---|---|---|
| `booting` | iframe 로드~onGodotReady | iframe 로드~`createUnityInstance` 완료+장면 초기화 후 jslib 준비 신호 |
| `ticket` | 티켓 발급 중 | 동일 (셸 소유) |
| `connecting` | 세션 주입 후~onConnectionState(connected) | 동일 |
| `connected`/`disconnected` | onConnectionState | 동일 |
| `local` | ?local=1 로컬 구동 | 동일 (페이지가 local 쿼리로 세션 없이 구동) |

- 로딩 진행률: Godot 페이지는 자체 status-progress로 표시한다. Unity는 `createUnityInstance`의 onProgress 콜백으로 페이지 안 진행 표시를 만들면 동등하다. 셸 오버레이는 phase 기반이라 무변경.

## 5. 기술 리스크 — 현행 Godot 임베드와의 대조

### 5.1 COOP/COEP·SharedArrayBuffer

현행 실측 (`_headers`):
- 전역: `Permissions-Policy: … cross-origin-isolated=(self)`.
- `/studio`, `/studio/*` (셸 페이지): `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless`.
- `/godot-space`, `/godot-space/*` (무대): 같은 COOP/COEP + `Cross-Origin-Resource-Policy: same-origin`. 무대 파일은 `Cache-Control: public, max-age=86400` (index.html만 no-cache).
- 그런데도 Godot 런타임은 `GODOT_THREADS_ENABLED = false`로 빌드돼 있어 **스레드(SharedArrayBuffer)가 실제로는 필요 없다**. `GODOT_CONFIG.ensureCrossOriginIsolationHeaders: true`라 격리가 없으면 페이지 스크립트가 서비스워커를 스스로 설치해 격리를 얻으려는 폴백이 있다.

Unity 판정:
- Unity WebGL 기본 빌드도 단일 스레드라 SharedArrayBuffer가 필요 없다. **초기 전환은 스레드 비활성으로 맞추면 헤더 변경이 "경로 복제"로 끝난다** (리스크 없음).
- Unity의 스레드 기능(C# 스레드/Job System 워커)을 켜는 경우에만 cross-origin isolation이 필수가 된다. 그 경우에도 현행 조합(COOP same-origin + COEP credentialless, 최신 Chrome에서 격리 성립)이 이미 갖춰져 있어 추가 작업은 무대 경로 블록 복제 수준이다. 단 Safari의 credentialless 지원 상황은 실측 검증 항목으로 남긴다.
- 결론: 스레드는 켜지 않는다 (현행 Godot와 동일 조건). 필요해지면 별도 과제로 격리 실측부터 한다.

### 5.2 CSP

현행 무대 CSP (`/godot-space/*` 전용): `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'`, `worker-src 'self' blob:`, `connect-src 'self'` + 실시간 오리진 2곳 등.
- Unity 프레임워크 JS는 wasm 컴파일에 `wasm-unsafe-eval`, 생성된 index.html의 인라인 로더에 `unsafe-inline`이 필요 — 현행 무대 CSP 범위 안에서 성립한다. Unity 로더가 blob 워커를 쓰는 경우도 `worker-src blob:`로 커버된다.
- 배경 GLB·카탈로그 fetch는 동일 오리진이라 `connect-src 'self'`로 충분하다 (현행과 동일).

### 5.3 빌드 크기·로딩

- 현행 Godot 실측 (GODOT_CONFIG.fileSizes): `index.wasm` 43,699,190B(약 41.7MiB) + `index.pck` 448,624B. 전송 압축과 별개로 원본이 이 크기다.
- Unity WebGL은 엔진 wasm + `.data`(빌드에 포함한 에셋)가 크기 대부분을 차지한다. 이 설계에서는 배경 GLB·카탈로그를 빌드에 넣지 않고 지금처럼 외부 파일/URL로 로드하므로, 빌드는 "무대 코드 + 기본 아바타/소품 에셋"만 담는다. 실제 총량은 첫 빌드에서 실측하기 전에는 단정할 수 없다 (NOTES에 검증 항목으로 명시).
- 압축: Unity 빌드의 Brotli(`.br`) 산출물은 서버가 `Content-Encoding: br`을 붙여야 하고, 아니면 gzip 또는 Unity의 "Decompression Fallback"(JS 내장 해제) 옵션을 써야 한다. 현행 정적 서빙(Cloudflare 정적 규칙)에 인코딩 규칙이 있는지는 이번 조사 범위 밖 — 빌드 확보 단계에서 결정한다. 무압축은 로딩 회귀 위험이 있어 채택하지 않는다.
- 캐시: 현행 무대 정적 파일은 86400초 캐시 + index.html no-cache. Unity도 같은 규칙을 복제하되, 빌드 파일명에 해시가 없으므로 무대 교체 시 index.html no-cache가 전파 경로가 된다 (현행과 동일 운용).

### 5.4 스레딩·성능 모델

- 양쪽 다 단일 스레드 전제. Unity의 JS 인터op(SendMessage·jslib)은 메인 스레드 큐를 타므로, 고빈도 통지(위치)는 §4.3처럼 빈도를 현행 수준으로 제한하는 것이 계약의 일부다.
- Unity WebGL은 WebGL2 기반 (현행 Godot 웹 익스포트도 WebGL2) — 브라우저 지원 범위는 동등하다.

### 5.5 GLB 런타임 로드 (검증기 금지 목록의 근거가 바뀐다)

- 현행 업로드 금지 확장은 **Godot GLTFDocument 기준**이다. Unity 무대는 런타임 glTF 임포터(예: glTFast — Apache-2.0, 상업 사용 가능)를 번들해야 하며, 임포터가 읽는 확장 집합이 다르다 (Draco·KTX2 등은 선택 컴포넌트로 지원 가능).
- 전환 초기에는 **현행 금지 목록을 그대로 유지**해 "지금 올라가 있는 배경이 전부 로드된다"는 동등성을 먼저 확보한다. 목록 완화는 임포터 실측 후 별도 과제로 한다.
- 주의: `EXT_texture_webp`는 Godot에서 허용 실측이 있지만, 선택한 Unity 임포터·컴포넌트 구성에서 읽히는지는 첫 빌드에서 카탈로그 배경 전수로 실측해야 한다 (기존 카탈로그 배경 `spaces/*.glb`와 업로드 배경이 전부 대상).

### 5.6 모바일

- 현행 무대 페이지: `user-scalable=no`, `touch-action: none`, 44MB급 wasm — 이미 모바일에서 가볍지 않다.
- Unity WebGL은 모바일 브라우저에서 메모리 사용량이 크고 iOS Safari의 wasm 메모리 상한에 닿기 쉽다. 대응: 캔버스 해상도 상한(devicePixelRatio 제한), 텍스처 상한을 무대 설정으로 두고, 실기기 검증을 전환 게이트(§7 3단계)에 포함한다. 셸에는 이미 "기존 스페이스로 돌아가기"(클래식) 동선이 있어, 모바일 폴백 표면 자체는 존재한다.

### 5.7 그 밖의 대조

- 오디오: Godot 산출물에는 오디오 워크릿 파일(`index.audio.worklet.js` 등)이 포함돼 있다. Unity WebGL 오디오는 프레임워크 내장이라 별도 워크릿 파일이 없다. 셸 소유의 앰비언트 오디오 등 무대 밖 기능은 무관.
- 전체화면: iframe `allow`에 이미 fullscreen이 있다. Unity의 전체화면 API 호출은 페이지 안에서 처리한다.

## 6. 웹·API 파일별 변경 지도

원칙: 파일 개명은 "이름에 godot가 박힌 것"만, 동작 변경은 경로·글루에 한정한다. 개명은 최종 정리 단계(§7-5)에서 일괄하고, 전환기에는 구 파일을 유지한 채 Unity 경로를 병행하는 것이 안전하다 (아래는 최종 상태 기준).

### 6.1 웹 — 무대 정적 자산

| 현행 | 최종 | 구분 |
|---|---|---|
| `apps/web/public/godot-space/` (index.html, index.js, index.wasm, index.pck, 아이콘·스플래시, 오디오 워크릿, spaces.json, spaces/*.glb) | `apps/web/public/unity-space/` (Unity 빌드 산출물 + spaces.json + spaces/*.glb 복사) | 신규 → 전환 완료 후 구 디렉터리 삭제 |
| `config/http-response-headers.json`의 `/godot-space`, `/godot-space/*` 규칙 (+ 생성물 `apps/web/public/_headers`) | `/unity-space`, `/unity-space/*` 규칙 복제 (COOP/COEP/CORP/CSP/캐시 동일) | 신규 추가 → 완료 후 구 규칙 삭제 |

### 6.2 웹 — 셸 코드 (`apps/web/src/domains/creator/virtual-space/`)

| 현행 파일 | 최종 파일 | 구분·변경 내용 |
|---|---|---|
| `StudioGodotSpaceEmbed.tsx` | `StudioUnitySpaceEmbed.tsx` | 개명. `GODOT_SPACE_EMBED_PATH` → `/unity-space/index.html`, `__godotBgState` 폴링 → `__tsvsBgState`(전환기 병행 수용), iframe title·상태 문구의 "Godot" 표기 정리, sessionId 폴백 접두사. 티켓·워치독·레이아웃·회의 동선 로직 무변경 |
| `studio-godot-host-bridge.ts` | `studio-unity-host-bridge.ts` | 개명. `createGodotHostBridge` → `createUnityHostBridge`. 핸들러 본문 무변경 (`window.__tsvsHost` 이름 유지) |
| `studio-godot-space-embed-support.ts` | `studio-unity-space-embed-support.ts` | 개명. `TsvsGodotFrameWindow` → `TsvsUnityFrameWindow`, `GODOT_EMOTE_BAR/GLYPHS`, `GODOT_INTERACT_LABELS`, `GODOT_PRESENCE_CAPABILITIES` 등 상수명 정리. **capability 문자열 값 자체는 서버 계약이라 무변경**. `__tsvs_requestReconnect` 선언은 이 단계에서 제거 |
| `studio-godot-space.ts` | `studio-unity-space.ts` | 개명. zod 스키마·API 클라이언트 무변경. `GODOT_STAGE_BASE_PATH` 값 `/godot-space/` → `/unity-space/`, 카탈로그 fetch 경로 변경 |
| `studio-godot-meeting-session.ts` | `studio-unity-meeting-session.ts` | 개명. 본문 무변경. `peerConnectionId` 접두사 `godot-meeting-` → `unity-meeting-`. 메시 세션 id `"p2p-mesh-v1"`는 Worker 채널 계약이라 **값 유지** |
| `StudioGodotMeetingPanel.tsx` | `StudioUnityMeetingPanel.tsx` | 개명만 (props·본문 무변경 — 순수 셸 UI) |
| `StudioGodotLayoutPanel.tsx` | `StudioUnityLayoutPanel.tsx` | 개명. 안내 문구의 "Godot 무대" 표기만 교체. 명령 타입·폼 로직 무변경 |
| 테스트 4종 (`StudioGodotSpaceEmbed.test.tsx`, `StudioGodotLayoutPanel.test.tsx`, `studio-godot-space.test.ts`, `studio-godot-meeting-session.test.ts`) | 대응 개명 | 경로·문자열·모의 무대 전역명 단언 갱신 |

### 6.3 API (`apps/api/src/modules/studio-godot-space-layout/`)

| 대상 | 최종 | 구분·변경 내용 |
|---|---|---|
| 모듈 디렉터리·클래스명 (`StudioGodotSpaceLayoutModule` 등) | `studio-unity-space-layout/` 등 Unity 명칭 | 내부 개명만. **라우트 경로는 유지**: `creator/works/:workId/godot-space-layouts`, `.../godot-space-backgrounds`는 셸 클라이언트·저장 참조와 묶인 공개 계약이라 이번 교체에서 바꾸지 않는다 (바꾸려면 구 경로 병행 기간이 필요한 별도 과제) |
| DB 테이블 (`studioGodotSpaceLayouts`, 배경 테이블; 마이그레이션 0106·0107) | 유지 | 개명은 마이그레이션 리스크만 만든다. 후속 정리 과제로 분리 |
| `studio-godot-background-glb.ts` (GLB 검증기) | `studio-unity-background-glb.ts` | 개명 + 판정 근거 교체 (Godot GLTFDocument → Unity 임포터). 금지 확장 목록은 초기 유지 (§5.5) |
| 배경 content 서빙·업로드·목록·삭제, 레이아웃 조회·저장 서비스 | 무변경 | 엔진 중립 |

### 6.4 Unity 프로젝트 (신규)

| 대상 | 내용 |
|---|---|
| `unity/VirtualStudio/` (신규 디렉터리) | Unity 프로젝트 소스: 무대 장면, `TsvsBridge.cs`(§4.2 SendMessage 수신 + 상태 기계), `TsvsHost.jslib`(§4.3), glTF 런타임 임포터 패키지, 번들 에셋(EmaceArt·RG Poly)의 서비스 내 전용 투입분 |
| 빌드 산출물 | `apps/web/public/unity-space/`로 복사되는 결과물만 웹이 소비 |

Godot는 프로젝트 소스가 레포에 없어 이번 교체에서 변환식 검증이 불가능했다. Unity는 **소스를 레포에 두는 것**을 원칙으로 한다 (같은 함정 반복 방지).

### 6.5 번들 에셋 활용 지점 (사용자 지시 반영)

- 에셋 전제: 서비스 내 사용 전용 구조 — 파일 다운로드·내보내기 없음, 장면은 참조로 저장, 결과물은 렌더 이미지만. 현행 배경 content 서빙(assetId capability URL, 인증 없는 대신 UUID 비공개)이 이미 이 구조이며, 번들 에셋도 같은 경로로만 투입한다.
- 가상스튜디오: 번들의 환경·소품 팩을 무대 기본 소품/배경 카탈로그로 — `spaces/*.glb` 정적 배경과 prop kind 확장이 투입 지점이다. prop kind는 zod enum(12종)이 상한이라, 신규 소품 종류를 넣으려면 셸·API 스키마 동시 확장이 필요하다 (별도 명세로 분리).
- bg3d: 같은 GLB 투입 파이프라인(업로드 검증기·content 서빙)을 bg3d 확장이 공유한다. Unity 임포터 기준으로 검증기를 교체할 때 bg3d 소비분도 같은 실측 대상에 넣는다.

## 7. Unity 빌드 산출물 확보 경로와 단계적 전환

### 7.1 빌드 확보 경로

| 경로 | 내용 | 비고 |
|---|---|---|
| 로컬 에디터 빌드 (초기 채택) | Unity 에디터 + WebGL Build Support 모듈로 빌드 → 산출물을 `apps/web/public/unity-space/`에 복사·커밋 | 현행 Godot 산출물 운용 방식과 동일. 러너 비용 0 |
| CI 빌드 (후속) | game-ci/unity-builder (GitHub Actions) | 라이선스 활성화 정보(시크릿) 등록이 필요하고, 무료 라이선스의 CI 활성화는 Unity의 라이선스 반환·재발급 절차를 타야 해 초기 경로로는 무겁다. 빌드가 잦아지면 전환 |

- 라이선스: Unity Personal은 최근 12개월 매출+펀딩 합산 $200,000 미만이면 상업용 WebGL 빌드 포함 무료이고, Unity 6에서는 스플래시가 선택 사항이며 런타임 피는 폐지됐다 (2026-10-20 확인 — 사용자 현재 규모는 상한에 닿지 않아 비용 장애물 없음). 초과 시에만 Pro(1석 연 $2,310)가 강제되므로, 전환 자체에 플랜 결정은 필요 없다.
- 에디터 버전은 LTS로 고정하고 프로젝트에 버전을 명시한다 (빌드 재현성).

### 7.2 단계적 전환 순서

| 단계 | 내용 | 완료 조건 |
|---|---|---|
| 0. 계약 동결 | 본 설계 확정. 셸 계약(§2)은 동결하고 Unity는 여기에 맞춘다 | 본 문서 승인 |
| 1. 스켈레톤 | Unity 프로젝트 + `TsvsBridge`/`TsvsHost.jslib` 골격 + 빈 무대 빌드 → `/unity-space/` 배치, 헤더 규칙 복제. 셸에 엔진 선택 플래그(환경변수/쿼리)로 Unity 임베드 병행 (기본은 Godot 유지) | 빈 무대에서 onGodotReady→세션 주입→onConnectionState(connected) 왕복 |
| 2. 프레즌스·이동 | 세션·구역·근접·말풍선·이모트·상호작용·위치 저장/복원 (§2.2의 1–8, §2.3의 1–10) | 2개 계정 동시 접속 실측 (기존 동시 드로잉 실측과 같은 방식의 운영 확인) |
| 3. 배치·배경 | applyLayout/layoutCommand/selection/changed/remote + 배경 GLB 로드 + `__tsvsBgState` 표기. 기존 저장 레이아웃 전수로 A/B (door·spawn·zone 위치, §3.3 변환 확정). 카탈로그 배경 GLB 전수 로드 실측 (§5.5). 모바일 실기기 확인 | 저장본 레이아웃이 Godot와 같은 배치로 렌더됨 |
| 4. 회의·번들 | 신호 중계 (onSignal/sendSignal) + 회의 패널 연결. 번들 에셋을 배경·소품 카탈로그로 투입 (서비스 내 전용 구조 유지) | 회의 구역에서 화상 성립, 번들 배경 지정·저장·재접속 유지 |
| 5. 전환·정리 | 기본 엔진을 Unity로 반전. `/godot-space` 정적 자산·헤더 규칙 제거, §6의 파일 개명 일괄, `cuts-godot` 등 다른 Godot 표면은 별도 과제로 분리 (이번 범위 밖) | main CI 통과 + 운영 실측 |

- 롤백: 4단계까지는 플래그로 즉시 Godot 복귀 가능. 저장 데이터가 엔진 중립(§3.1)이라 롤백에 데이터 변환이 필요 없다 — 이게 이층 구조를 유지하는 가장 큰 이유다.
