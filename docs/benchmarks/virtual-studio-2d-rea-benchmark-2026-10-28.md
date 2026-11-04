# 가상 스튜디오 2D 재구축용 REA 역공학 벤치마크 (2026-10-28)

- 문서 상태: `current` (현재 작업 브랜치에 구현된 ToonOffice 2D 엔진·HUD·반응형·8직군 스프라이트·고해상도 배경 아트·실시간 앰비언트 이펙트·평면도 뷰·워크스테이션 협업창의 코드 반영 현황)
- 작성일: `2026-10-28` / 1차 조사: `2026-10-27T17:10Z`~`17:30Z`, 2차 UI/UX·스프라이트 조사: `2026-10-28T07:13Z`~`07:30Z`, 3차 오브젝트·평면도·배경 이펙트 조사: `2026-10-28T09:50Z`~`10:15Z` (UTC)
- 작업 기준 커밋: `40179e94698323384e4804bad4a4ef473abc3794` (2026-10-28에 확인한 `origin/main`). 8·9절은 이 커밋 이후 현재 작업 브랜치의 구현도 포함하며, `main` 병합·운영 배포·전체 화면 검증 완료를 의미하지 않는다.
- 대상: WorkAdventure, Gather, ZEP, oVice, Kumospace, SoWork, Teamflow
- 선행 문서: [가상 스튜디오 경쟁 서비스 벤치마크 (2026-10-01)](../../apps/web/src/domains/creator/virtual-space/VIRTUAL_SPACE_BENCHMARK_2026-10-01.md)
  — 기능 비교와 gap 목록은 그 문서에 있다. 이 문서는 **배포 번들에서 관측한 엔진 수준 근거**와
  **웹툰 제작 스튜디오 전용 설계 합성**만 추가한다.

## 0. 범위·방법·경계

- 도구: REA MCP(`rea-cdp-browser` provider v2). `list_browser_targets` → `analyze_web_bundle`
  → `inspect_web_page(include_script_sources)` → `export_evidence_bundle` → `export_web_scripts`
  순서로 공개 페이지가 실제로 로드한 JavaScript를 실행 없이 확보했다. ZEP 게임 클라이언트는 공개
  `_buildManifest.js`에 열거된 정적 청크를 내려받아 `analyze_javascript_application`으로 분석했다.
- 브라우저: 전용 무인 CDP 프로필(`127.0.0.1:9223`). 각 대상은 **탐색(navigate)만** 했고 클릭·입력·로그인은 하지 않았다.
  SoWork 셸이 자동으로 띄운 Google 로그인 팝업 탭은 상호작용 없이 즉시 닫았다.
- 금지 준수: 로그인·인증 우회·봇 차단 우회·비공개 API 호출 없음. 네이티브 분석이 필요하지 않아 Ghidra도
  실행하지 않았다(필요 시 Ghidra 강제, Hopper 미사용 원칙 유지).
- 증거 해석: 아래 "관측(O)"은 **배포 스크립트의 정적 문자열·구성 객체**를 뜻한다. 실행 경로 도달 여부,
  기능 플래그의 실제 활성 여부, 서버 설정값은 관측하지 않았다. "추론(I)"은 관측에서 끌어낸 해석,
  "미확인(U)"은 근거가 없는 항목이다.
- 문자열 검사는 REA `export_web_scripts`가 digest 검증 후 기록한 파일에 대해 수행했으며, 각 사실은
  아래 Evidence ID의 스크립트 집합 안에서만 유효하다.

## 1. REA Evidence 원장

| 대상 | 표면 | 연산 | Evidence ID | 규모 |
| --- | --- | --- | --- | --- |
| 공통 | CDP 대상 목록 | `list_browser_targets` | `ev_76f872d02bd354b5260edf635325bd3e47b000e3bf68fc708e511911ab263647` | 페이지 7개 |
| WorkAdventure | `play.workadventu.re/` | `analyze_web_bundle` | `ev_31140ca19c277b9bcd78cbc2ecb2c636e64bb381e0b436cbe6ca2ccbc80c48e3` | 스크립트 28, 5,555,353B (Vite) |
| WorkAdventure | 동일 | `inspect_web_page` / `export_web_scripts` | `ev_ad3e1f8029ed549458e80d3750863c5086ec8edb32d50afbb2e1c1ba15f48c27` / `ev_09f95ff6bfbcbfd00a74692ff0ab2d83906efe93e54cdab0cf0e29375b0cd0ad` | 28 |
| Gather | `app.gather.town/app` | `analyze_web_bundle` | `ev_4d0fbb4696688b7076b8dba457fe1769e7e1506ced7be0df7bc920fd793c74bd` | 스크립트 15, 10,030,343B |
| Gather | 동일 | `inspect_web_page` / `export_web_scripts` | `ev_4f69e043eda6518d0ee09af91ff24b463064a41d93f5536b7fdc55d3b2a37144` / `ev_6e88127eca1c4852323e362ec4b1d02ebdd745544c8165bddda346d13d024066` | 15 |
| ZEP | `zep.us/` 랜딩 | `analyze_web_bundle` | `ev_a2607307e1926a770e8803cb086d9ca611ec3749e3962bc238b4e4cfa66d79fd` | 스크립트 17, 4,174,896B (Next.js) |
| ZEP | `zep.us/play/_next` 공개 청크 36개 | `analyze_javascript_application` | parent `ev_8ff38afb008af82d36432fa35203b620017f7385c9cabff36c15d46c30c1f441`, view `ev_dcd73dbdea731ccf6b317380661e9250f64a4a137b211df0f7a495073669bcbb` | 트리 SHA-256 `c800062165c4…05d7` |
| oVice | `app.ovice.com/login` | `analyze_web_bundle` | `ev_5f12ff684e392ccf0f454085e68f43ac5d38bd3409334dd35863bd8f3e2bc398` | 스크립트 20, 8,930,938B |
| oVice | `app.ovice.com/lobby` | `inspect_web_page` / `export_web_scripts` | `ev_1ecda6e6c772dc942db59c85aff3418036d4f2a1412639e1350027c1013f4c88` / `ev_e1761516c4112453265dc7b866ff54c0f07d1dd7597a426e199015c213299e89` | 16 |
| Kumospace | `www.kumospace.com/app` | `analyze_web_bundle` | `ev_3bb7d92589afee8aafba9dd748680bc552b7de5daedb07c5ef9f8f6a40822671` | 스크립트 69, 8,358,229B |
| Kumospace | 동일 | `inspect_web_page` / `export_web_scripts` | `ev_04af23cfe2d4fa58fabca7bfab054a4574f02c2283e783fea7f11967dd39b802` / `ev_9203db5a936728efdc2c5bcf5791e299567bc0c1733cba83196b5f6897b686d4` | 69 |
| SoWork | `app.sowork.com/` | `inspect_web_page` / `export_web_scripts` | `ev_c4df1d37113ff8d10bee03ce6e9083afc191e6ba006110f21fb0683bd7225d4c` / `ev_079ecf265025afb4870192e4ee9ac3d33607c6ed6d2a96fe3c956d90df395b1f` | 스크립트 802, 18,980,004B |
| Teamflow | `app.teamflowhq.com/login` | `inspect_web_page` / `export_web_scripts` | `ev_71da95a1f533203f1aa48b4f4720465d96cb0b86f8b38d172f1ab2a23007ce44` / `ev_44ca5767d71b09a129b42966d725cf5a58f0f40d96346eb40057d9bae1f458d2` | 15 (로그인 셸) |

마케팅 사이트(`www.ovice.com` Webflow, `www.kumospace.com` HubSpot, `www.teamflowhq.com` Webflow,
`www.sowork.com` Framer)는 엔진 코드를 싣지 않아 앱 셸만 분석했다. 잔여 미확인은 REA ledger에
`unk_e8a91260…c0b7`(Teamflow), `unk_2e2c634b…c4d`(SoWork WASM), `unk_22488b94…c2a`(oVice 수치)로 기록했다.

## 2. 서비스별 관측 결과

### 2.1 WorkAdventure (오픈소스, 가장 풍부한 근거)

- 렌더링(O): Phaser `VERSION:"4.2.0"`(`LOG_VERSION v402`), `TilemapGPULayer` 사용. 렌더러는 쿼리
  `phaserMode=auto|canvas|webgl|headless`로 선택. `render:{pixelArt:!1,roundPixels:!1,antialias:!1}`.
- 카메라·해상도(O): `getOptimalGameSize`가 최소 권장 게임 픽셀 `640*480`, 절대 최소 `38416`(196²)을
  기준으로 게임 해상도와 `scale.zoom`을 계산한다. 즉 **화면 크기와 무관하게 약 30만 게임 픽셀이 보이도록
  줌을 자동 조정**하는 모델이다(I: HiDPI에서도 월드 가시 범위가 일정).
- 타일(O): 렌더 레이어 오프셋이 `(e.x||0)*32` — 32px 타일. 충돌은 Tiled 속성 `collides`와 별도
  `entitiesCollisionLayer`/`areasCollisionLayer`(가구·영역 충돌을 동적으로 추가하는 숨김 레이어).
- 이동·물리(O): `physics:{default:"arcade"}`. 플레이어 바디 `setSize(16,16)`, `setOffset(0,8)` —
  32×32 스프라이트의 **하단 발 히트박스**. 깊이는 `setDepth(this.y+16)`로 y-정렬.
  키보드 `inputStep`은 축별 ±1에 속도(`Mn*20`, SpeedUp 시 2.5배)를 곱해 **대각선 정규화 없이**
  `setVelocity`한다(I: 대각선이 √2배 빠름). 팔로우·원격 보간은 정규화 벡터, 원격은 속도 상한 256.
  클릭 이동은 EasyStar 격자 경로탐색(`setAcceptableTiles`, `setGrid`).
- 아바타(O): Woka·컴패니언 시트 `frameWidth:32,frameHeight:32`, 4방향(down/left/right/up)×3프레임,
  걷기 `frames:[0,1,2,1]`, `frameRate:10`. 레이어형 Woka(선행 문서 참조).
- 공간 상호작용(O): 영역 속성 스키마에 `focusable{zoom_margin}`, `silent`, `speakerMegaphone`/
  `listenerMegaphone`, `jitsiRoomProperty`, `livekitRoomProperty`, `personalAreaPropertyData`
  `{accessClaimMode: dynamic|static, allowedTags, ownerId}`, `restrictedRightsPropertyData`,
  `maxUsersInAreaPropertyData`, `lockableAreaPropertyData`, `matrixRoomPropertyData`,
  `tooltipPropertyData`, `highlight{opacity,gradientWidth,duration}`, `openWebsite`, `playAudio`,
  `start`/`exit`가 정의되어 있다. 근접 파라미터는 서버 환경변수 `MINIMUM_DISTANCE`, `MAX_PER_GROUP`
  로 주입된다(값은 번들에 없음 — 공개 저장소 기본값은 선행 문서 참조). 말풍선/생각풍선(`SpeechBubble`,
  `ThinkingCloud`), 버블 잠금(`lockBubble`) 온보딩 단계 존재.
- 레이아웃(I): `personalAreaPropertyData`가 **지정석/개인 구역(고정·동적 점유)** 을, `focusable+zoom_margin`이
  회의실 진입 시 카메라 포커스를, megaphone이 발표 무대를 구현한다.

### 2.2 Gather

- 렌더링(O): Phaser `3.80.1`. 게임 구성 `pixelArt:!0`, `mipmapFilter:"NEAREST"`, WebGL2 컨텍스트 우선
  생성, `scale.mode:NONE`, `disablePreFX/PostFX:!0`. 기능 플래그 `UpscaledGather`일 때 배율 4.
- 타일·이동(O): `objectSizes=32`(32px 격자), `worldPositionToGridPosition*` 유틸. 플레이어는
  `initialMovementX → targetX`를 `elapsedMovementTime / (1000/7)`로 `Math.Linear` 보간 — **격자 칸 이동,
  칸당 약 142.9ms(초당 7칸)**. 걷기 애니메이션도 `frameRate:7`로 이동과 동기.
- 물리(O): `physics.default:"matter"`, `gravity:{x:0,y:0}`, `enableSleeping`, `plugin.attractors`.
  기본 파라미터 `AttractiveForce:3e-6`, `RepellingForce:1`, `AirFriction:.1`, `VideoWidth:160`,
  `VideoHeight:120`, 제약(`ConstraintStiffnessDropoff:4` 등). Matter 바디는 `nameTagBodies`,
  `collisionMasks`, `playersHaveVideo`에 쓰인다 — **아바타 이동이 아니라 이름표·비디오 버블이 서로
  밀어내는 UI 소프트 레이아웃** 용도(`LeakyDesksVideoPhysicsManager`, `LeakyDeskUIPhysics`).
- 아바타(O): `{frameWidth:32, frameHeight:64}`, 4방향(s/n/w/e), 걷기 `[1,0,2,0]`·idle 1프레임·`dance`,
  탈것은 32×32 별도 시트, 손에 든 아이템(`carriedItemImage`) 레이어.
- 상호작용(O): 상태 `Available/Busy/DoNotDisturb` + 종료 시각(30분·1시간·2시간·내일). `nook` 모델
  (`nookIsDesk`, `isCoworking`, `restricted`, `nookIsAudioLocked`, `nookAccessRequest*`) — 책상·프라이빗
  영역·입장 요청. `DeskToPlayerMap`, `AssignedDesk`, `claimDesk` 문자열. "Leaky Desk" 기능군:
  `ListeningRangeUI`, `FocusOverBusy`, `DeskPods`, `SideConversations`, `OpenCoworking`,
  `BackgroundOffice/Chatter/ChairSFX`, `AmbientVolumeSlider`. `ghost` 40회 등장(I: 고스트 모드).
- 레이아웃(I): 2024~2026 Gather는 "옆자리 소리가 새는 책상 포드 + 들리는 범위 원 + 사무실 앰비언스"로
  **실제 사무실 소음 모델**을 재현하는 방향이다.

### 2.3 ZEP

- 렌더링(O): Phaser `3.80.1`과 함께 기능 플래그 `PHASER_V4_UPGRADE`("Phaser 3→4 엔진 업그레이드 롤아웃 제어.
  내부 테스터부터 점진적 확대.")가 존재. 구성 `pixelArt:!1`, `antialias:!0`, `powerPreference:"low-power"`,
  `physics:{default:"arcade",arcade:{fixedStep:!1,gravity:{x:0,y:0}}}`.
- 이동(O): A* 격자 경로탐색(맨해튼/대각 휴리스틱, `diagonal` 옵션). 동기화 protobuf에 `posX`, `posY`,
  `direction`, `moveSpeed`, `videoSlotX/Y`; 타일 오브젝트에 `tileX/tileY`, `impassable`, `collide`,
  `npcProperty`, `moveSpeed`. 32px 타일은 공식 문서 근거(번들 상수 미확인).
- 아바타(O): 레이어 합성(`category`, `layers`, `zIndex`, `flipX`, `idleBehavior`는 effect/ride/pet 한정),
  썸네일 합성 프레임 `frameWidth:48, frameHeight:64`, 앵커 `(offsetX-24, offsetY-64)` = **발 중앙 하단**.
  애니메이션 키는 4방향 × `idle/jump/sit/seat/attack`과 방향 기본 키(`down` 등, I: 걷기).
- 분석 범위: REA `analyze_javascript_application`은 게임 청크 `832.*.js`만 선택(`source_paths`)했고,
  위 문자열 검사는 내려받은 36개 청크 전체에 대해 수행했다.
- 상호작용(O): `privateArea`(123), `spotlight`(110), `portal`(42), `impassable`; LiveKit 문자열 52회.

### 2.4 Kumospace

- 렌더링(O): Phaser `3.60.0`. `physics:{default:"arcade",arcade:{fps:5}}`(I: 물리 스텝을 초당 5회로 낮춰
  거의 쓰지 않음), `roundPixels:!0`, `scale.mode:NONE`, `zoom:MAX_ZOOM`, 쿼리로 CANVAS 강제 가능.
- 품질 단계(O): `highQuality{textureScale:1,canvasScale:1,antialias}`, `performance{textureScale:.5}`,
  `batterySaver{textureScale:.5,canvasScale:.5,low-power}`. 걷기 중 FPS를 100샘플 기록(`recordWalkingFps`).
- 오디오(O): Web Audio panner 기본값 `distanceModel:"inverse"`, `panningModel:"HRTF"`,
  `maxDistance:1e4`, `refDistance:1`, `rolloffFactor` (I: Howler 계열 공간 음향 래퍼, 음성 적용 여부 U).
- 상호작용(O): `door-knock`, `door-open`, `door-close`, `nudge` 효과음 — 잠긴 방 노크 흐름.

### 2.5 oVice

- 렌더링(O): `openspace-v2` 청크에 PixiJS `8.18.1`, WebGL2. 미디어 계층 문자열에 mediasoup·Chime.
- 그 외(U): 근접 감쇠 반경, 아바타 규격은 공개 셸에서 미확인(`unk_22488b94…c2a`).

### 2.6 SoWork

- 렌더링(O): 세션 스키마 `gameEngineRenderer: "legacy" | "bevy"`, 플래그 `feat_bevy`, 오류 문구
  `hep-crash-bevy-renderer`(I: Rust Bevy 엔진 WASM 빌드로 전환 중). 지도 투영 `orthographic(top-down)`과
  `isometric` 두 종류 선택.
- 엔진 브리지(O): JS → 엔진 메시지 `config:setMovementMode`, `setClickInputMode`,
  `setMovementOptions{movement_speed, far_distance_threshold, far_distance_speed_multiplier}`,
  `setPhysicsOptions{enable_asset_collisions, enable_local_character_collisions,
  enable_local_character_furniture_collisions}`, `setCameraSmoothing/Offset/Target`.
  (I: 먼 거리 경로이동은 가속 배율로 빨리 도착시키는 정책.)
- 업무 기능 플래그(O, 활성 여부 U): `feat_desks`, `feat_enable_seats`, `feat_auto_sit`, `feat_sit_ground`,
  `feat_work_spots`, `feat_workspot_management`, `feat_neighborhood`, `feat_floors_and_walls`,
  `feat_snap_zones`, `feat_pickable_zones`, `feat_resize_zones`, `feat_meeting_zone_lock`, `feat_door_knock`,
  `feat_native_whiteboards`, `feat_message_board`, `feat_proximity_circle`, `feat_whisper`,
  `feat_follow_person`, `feat_summon_users`, `feat_unstuck`, `feat_away_on_idle`, `feat_schematic`,
  `feat_dynamic_framerate`, `feat_downgrade_fps_on_meeting`, `feat_pause_fps_when_inactive`, `feat_lite_mode`.
  스키마 `DeskAssignmentSchema`, 필드 `deskArrival`, `deskArrivalGrace`, `deskAssignedPercent`.
  한국어 문구 "키보드를 사용하여 이동하려면 월드 뷰로 전환하세요"(schematic 평면도 뷰에서는 WASD 금지),
  "앱 전환 시 마이크·카메라 끄기".

### 2.7 Teamflow

- (U) 공개 표면은 `/login`으로 리다이렉트되는 셸뿐이다. `planck`·`rapier`·`fabric` 문자열은 비밀번호
  사전 데이터 오탐으로 확인되어 엔진 근거에서 제외했다(`unk_e8a91260…c0b7`).

## 3. 엔진 비교 매트릭스

| 항목 | WorkAdventure | Gather | ZEP | Kumospace | oVice | SoWork |
| --- | --- | --- | --- | --- | --- | --- |
| 렌더러 | Phaser 4.2.0 | Phaser 3.80.1 | Phaser 3.80.1 (→4 롤아웃) | Phaser 3.60.0 | PixiJS 8.18.1 | legacy / Bevy(WASM, I) |
| 화풍 설정 | pixelArt 끔 | pixelArt + NEAREST | pixelArt 끔 + AA | roundPixels | U | top-down / 아이소 |
| 타일 | 32px | 32px | 32px(문서) | U | U | U |
| 이동 | 자유(Arcade 속도) | 격자 칸 보간 7칸/s | 자유+A* | Arcade(fps 5) | U | 자유+경로탐색 |
| 대각선 | 비정규화(√2) | 칸 단위 | A* 옵션 | U | U | U |
| 충돌 | 타일 `collides` + 동적 레이어, 16×16 발 박스 | 격자 차단 | `impassable`/`collide` | U | U | 자산·캐릭터·가구 토글 |
| 물리 라이브러리 | Arcade | Matter(UI 버블 전용) | Arcade | Arcade | U | 엔진 내장(U) |
| 아바타 프레임 | 32×32, 4방향×3 | 32×64, 4방향×3 | 48×64 레이어 | U | U | 레이어 스프라이트 |
| 지정석 | personalArea | nook isDesk / DeskToPlayerMap | U | U | U | DeskAssignment + auto_sit |

## 4. 발견 원장 (Findings Ledger)

| # | 주장 | 증거 유형 | Evidence ID / URL | 신뢰도 |
| --- | --- | --- | --- | --- |
| F1 | WA 렌더러는 Phaser 4.2.0, TilemapGPULayer 사용 | O | `ev_09f95ff6…cd0ad` | 높음 |
| F2 | WA는 최소 640×480 게임 픽셀 기준 자동 줌 | O | `ev_09f95ff6…cd0ad` | 높음 |
| F3 | WA 플레이어 바디 16×16, offset(0,8), depth=y+16 | O | `ev_09f95ff6…cd0ad` | 높음 |
| F4 | WA 키보드 대각선 이동은 정규화되지 않음 | O(코드)+I(체감) | `ev_09f95ff6…cd0ad` | 중간 |
| F5 | WA 클릭 이동은 EasyStar 격자 경로탐색 | O | `ev_09f95ff6…cd0ad` | 높음 |
| F6 | WA 아바타 32×32, 4방향×3프레임, 10fps | O | `ev_09f95ff6…cd0ad` | 높음 |
| F7 | WA 영역 속성에 personalArea(ownerId·dynamic/static) 존재 | O | `ev_09f95ff6…cd0ad` | 높음 |
| F8 | WA 근접 거리·그룹 인원은 서버 환경변수 주입 | O | `ev_09f95ff6…cd0ad`, <https://github.com/workadventure/workadventure> | 높음 |
| F9 | Gather 렌더러 Phaser 3.80.1, pixelArt+NEAREST, WebGL2 우선 | O | `ev_6e88127e…4066` | 높음 |
| F10 | Gather 격자 32px, 칸당 1000/7ms 선형 보간 | O | `ev_6e88127e…4066` | 높음 |
| F11 | Gather Matter(무중력)는 이름표·비디오 버블 반발 UI 전용 | O+I | `ev_6e88127e…4066` | 중간 |
| F12 | Gather 아바타 32×64, 4방향, 걷기 [1,0,2,0] 7fps | O | `ev_6e88127e…4066` | 높음 |
| F13 | Gather 상태 3종 + 종료 시각 프리셋 | O | `ev_6e88127e…4066` | 높음 |
| F14 | Gather nook(책상·코워킹·오디오 잠금·입장 요청) | O | `ev_6e88127e…4066` | 높음 |
| F15 | Gather Leaky Desk(들리는 범위 UI·사무실 앰비언스) 기능군 | O(플래그) | `ev_6e88127e…4066` | 중간 |
| F16 | ZEP Phaser 3.80.1 + Phaser 4 업그레이드 롤아웃 플래그 | O | `ev_8ff38afb…c441` | 높음 |
| F17 | ZEP Arcade 무중력, pixelArt 끔, AA 켬 | O | `ev_8ff38afb…c441` | 높음 |
| F18 | ZEP 아바타 레이어 48×64, 발 중앙 앵커 | O | `ev_8ff38afb…c441` | 높음 |
| F19 | ZEP A* 경로탐색(대각 옵션), protobuf에 moveSpeed·videoSlot | O | `ev_8ff38afb…c441` | 높음 |
| F20 | ZEP 타일 32px | 공식 문서(선행 문서) | <https://docs-kr.zep.us> | 중간 |
| F21 | Kumospace Phaser 3.60.0, Arcade fps 5, 품질 3단계 | O | `ev_9203db5a…86d4` | 높음 |
| F22 | Kumospace 노크·문 열림/닫힘 효과음 | O | `ev_9203db5a…86d4` | 높음 |
| F23 | Kumospace HRTF/inverse 공간 음향 래퍼 | O+I | `ev_9203db5a…86d4` | 중간 |
| F24 | oVice openspace-v2는 PixiJS 8.18.1 | O | `ev_e1761516…9e89` | 높음 |
| F25 | SoWork 렌더러 legacy↔Bevy 전환, top-down/아이소 투영 | O+I | `ev_079ecf26…b1f` | 중간 |
| F26 | SoWork 물리 옵션: 자산·캐릭터·가구 충돌 개별 토글 | O | `ev_079ecf26…b1f` | 높음 |
| F27 | SoWork 지정석·자동 앉기·좌석·워크스팟·구역 스냅 플래그 | O(플래그) | `ev_079ecf26…b1f` | 중간 |
| F28 | SoWork 평면도(schematic) 뷰에선 WASD 금지, 클릭 이동만 | O | `ev_079ecf26…b1f` | 높음 |
| F29 | SoWork 회의 중·비활성 시 FPS 하향 정책 | O(플래그) | `ev_079ecf26…b1f` | 중간 |
| F30 | 관측한 2D 오피스 6개 중 4개가 Phaser, 1개 PixiJS, 1개 자체/Bevy | O 집계 | F1·F9·F16·F21·F24·F25 | 높음 |
| F31 | 커스텀 물리 엔진(planck/box2d/rapier)을 아바타 이동에 쓰는 사례 미관측 | 한정된 부정 탐색 | 위 6개 export | 중간 |

## 5. 웹툰 제작 스튜디오 합성

### 5.1 파이프라인 → 공간 구역 매핑

| 단계 | 구역 | 공간 규칙(데이터 속성) | 근거 패턴 |
| --- | --- | --- | --- |
| 기획·시나리오 | 기획실(잠금 회의실) | `lockable`, `maxUsers 6`, 진입 시 `focusable` 카메라, 화이트보드 | WA lockable/focusable, SoWork meeting_zone_lock |
| 콘티 | 콘티 보드룸 | 벽면 보드 오브젝트(패널 썸네일 열), 화면 공유 대형 스크린 | WA openWebsite, Gather 임베드 |
| 스케치·선화·채색 | 작화 데스크 클러스터 | `personalArea{ownerId}` 지정석, 좌석 스냅·자동 앉기, 포드 단위 새는 소리 | WA personalArea, SoWork auto_sit, Gather DeskPods |
| 배경(3D 포함) | 배경 스튜디오 | 2D 데스크 + 3D 뷰어 패널(선택적 임베드), 렌더 대기열 보드 | 3D는 패널로 분리 |
| 식자·말풍선 | 식자 데스크 | 지정석 + 맞춤법/폰트 레퍼런스 오브젝트 | 지정석 패턴 재사용 |
| PD·편집 검수 | 리뷰룸 | 대형 스크린, speaker/listener 무대, 검수 노트 | WA megaphone, Gather spotlight |
| 연재 업로드 | 송고 데스크 | 업로드 체크리스트 오브젝트, 완료 시 알림 방송 | ZEP spotlight 알림 |
| 공통 | 레퍼런스 자료실 | `silent` 구역, 오브젝트 상호작용으로 자료 보드 열기 | WA silent, ZEP 오브젝트 |
| 공통 | 마감 워룸 | 회차별 상태 보드(단계·담당·D-day), 상시 표시 | SoWork message_board |
| 공통 | 집중 부스 | 1인 `maxUsers 1`, `silent`, 진입 시 DND·자동 음소거 | Gather FocusOverBusy, WA silent |
| 공통 | 라운지 | 개방 근접 음성, 앰비언스, 이모트 | Gather background SFX |

현재 코드에는 리뷰 관련 컴포넌트([`StudioPinnedReviewPanel.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioPinnedReviewPanel.tsx) 등)가
이미 있으므로, 리뷰룸 대형 스크린은 신규 엔진 오브젝트가 이 패널을 여는 **진입점**으로 설계하는 것이 재사용에 유리하다(I).

### 5.2 2D 엔진 요구사항 (근거 기반 결정)

1. **렌더러**: Phaser 유지 + Phaser 4 대비 설계(F1·F16·F30). 경쟁 2D 오피스의 다수가 Phaser이며,
   WA는 4.2.0으로 이전 완료, ZEP은 롤아웃 중이다. 신규 코드는 Phaser 3 전용 파이프라인/FX API에 의존하지 않는다.
2. **화풍·해상도**: 웹툰 작가 대상이므로 픽셀아트보다 **HD 일러스트 스프라이트**(ZEP 48×64 계열)를 권장(F17·F18).
   타일은 업계 표준 32px 논리 격자, 자산은 2배(64px) 원본 + `pixelArt:false`. 화면 크기 대응은 WA의
   "최소 게임 픽셀 면적" 자동 줌(F2) + Kumospace식 품질 3단계(F21).
3. **이동**: 자유 이동 + 32px 충돌 격자 + 클릭 시 A*(F5·F19). WA와 달리 **대각선 속도는 정규화**(F4 반면교사).
   평면도(미니맵) 뷰에서는 클릭 이동만 허용(F28). 먼 거리 경로이동 가속 배율(SoWork) 채택.
4. **충돌·물리**: 아바타는 AABB(발 히트박스 16×8~16×16, F3)와 축 분리 슬라이딩으로 충분하다.
   리지드바디 엔진은 아바타 이동에 쓰지 않는다(F31). "물리 소품"(의자 밀기, 공 튕기기, 종이 날리기)과
   이름표/비디오 버블 반발 레이아웃만 선택적으로 Matter(무중력) 또는 경량 자체 솔버를 쓴다(F11).
   충돌 대상은 자산·캐릭터·가구를 개별 토글(F26).
5. **좌석 스냅**: 좌석 오브젝트 = `{anchor, facing, seatId, deskId?}`. 근접 + 상호작용 키(또는 클릭)로
   앵커에 스냅하고 앉기 애니메이션 전환, 지정석은 `ownerId`·`accessClaimMode(dynamic|static)` 데이터(F7·F27).
   도착 유예(`deskArrivalGrace`)로 출근 상태를 판정.
6. **구역 시스템**: WA식 **선언적 영역 속성 스키마**(F7)를 단일 진실 원천으로 둔다:
   `silent`, `focusable`, `lockable`, `maxUsers`, `personalArea`, `stage(speaker/listener)`, `ambience`,
   `autoStatus(DND)`, `autoMute`. 구역 스냅·리사이즈 편집기(SoWork)와 연결.
7. **음성 모델**: 근접 버블(그룹 상한) + 포드 단위 "새는 소리" + 들리는 범위 원 UI(F15) + 집중 부스 자동 음소거.
8. **아바타 시트 규격**: 4방향 × (idle 1, walk 3~4 ping-pong, sit, talk) 최소 세트, 좌우는 flipX 허용 여부를
   자산 단계에서 결정(ZEP flipX 관측, F18). 현재 8방향 자산은 유지하되 신규 레이어형 의상은 4방향 기준.
9. **성능 정책**: 회의 중·탭 비활성 시 FPS 하향, 라이트 모드(F29), 걷기 FPS 텔레메트리(F21).

### 5.3 우선순위 권고

| 우선순위 | 항목 | 이유(근거) |
| --- | --- | --- |
| P0 | 선언적 영역 속성 스키마(+편집기) | 모든 업무 구역이 같은 데이터로 표현됨(F7·F27) |
| P0 | 지정석·좌석 스냅·자동 앉기·출근 판정 | 작화 데스크가 스튜디오의 중심(F7·F14·F27) |
| P0 | 집중 부스(자동 DND·음소거) + 상태 종료 시각 | 작화 몰입 보호(F13·F15) |
| P0 | 32px 충돌 격자 + 정규화 자유 이동 + A* | 업계 표준 + WA 대각선 결함 회피(F4·F5·F19) |
| P1 | 리뷰룸 대형 스크린 → 기존 리뷰 패널 연결 | 기존 자산 재사용(5.1) |
| P1 | 마감 워룸 보드·콘티 보드 오브젝트 | 웹툰 고유 단계 가시화 |
| P1 | 포드 단위 새는 소리·들리는 범위 UI·앰비언스 | Gather 최신 방향(F15) |
| P1 | 품질 3단계·FPS 하향 정책 | 저사양 작업 PC 공존(F21·F29) |
| P2 | Matter 기반 소품·버블 반발 | 연출 가치, 핵심 아님(F11) |
| P2 | 평면도(schematic) 뷰·아이소 투영 옵션 | SoWork 차별화, 2D-first 이후(F25·F28) |
| P2 | 3D 배경 뷰어 패널 | 3D는 선택 사항으로만 |

## 6. 미확인·차단 목록

| 항목 | 상태 | 사유 |
| --- | --- | --- |
| Teamflow 엔진 전부 | 차단 | 로그인 셸만 공개 (`unk_e8a91260fe4c3dc0c1cdd52e02bd3929ff473e75ed77935f361c732e61d4c0b7`) |
| SoWork WASM 내부(타일·충돌·프레임) | 미확인 | 엔진 바이너리 미로드 (`unk_2e2c634bf53ebb5b8cb15057e41b0ee6eca578c659ed4e20a9042622e3585c4d`) |
| oVice 근접 반경·아바타 규격 | 미확인 | 공개 셸 정적 분석 한계 (`unk_22488b9405934726309fa11556437a723a20fb886656a7f119c8a66887badc2a`) |
| Kumospace 이동 모델·타일·아바타 규격 | 미확인 | 셸에 Phaser 구성만 관측 |
| ZEP 타일 크기 번들 상수 | 미확인 | 공식 문서로만 확인 |
| WA 근접 거리 실제 운영값 | 미확인 | 서버 환경변수 |
| Gather 미디어 백엔드(LiveKit/mediasoup/Agora 중 실사용) | 미확인 | 문자열만 공존 |
| 모든 기능 플래그의 실제 활성 여부 | 미확인 | 정적 분석은 실행·롤아웃을 증명하지 않음 |

## 7. 재현 절차 (읽기 전용)

1. 전용 무인 Chrome(`--remote-debugging-port=9223`)에 대상 URL 탭을 연다(탐색만, 로그인 금지).
2. REA `list_browser_targets {cdp_endpoint:"http://127.0.0.1:9223"}`로 `target_id` 확인.
3. `analyze_web_bundle`에 대상·CDN 오리진을 `allowed_origins`로 지정해 청크 그래프 확보.
4. `inspect_web_page {include_script_sources:true}` → 10MiB 초과 시 `export_evidence_bundle`로 기록 후
   해당 레코드를 JSON으로 추출 → `export_web_scripts`로 digest 검증 파일 생성.
5. 내보낸 디렉터리에서 엔진 구성 문자열을 검사하거나 `analyze_javascript_application {detail:"summary"}` 실행.

## 8. 2·3차 REA UI/UX·반응형·스프라이트·배경 이펙트 심화 분석 및 반영 현황 (`current`)

1차 엔진 벤치마크에서 내보낸 스크립트의 SHA-256 해시를 재검증한 뒤, UI/UX·반응형 브레이크포인트·미니맵/이름표 디클러터·줌 UX·품질/FPS 거버너·스프라이트 포즈 폴백·액셔너블 오브젝트·평면도(schematic) 뷰를 핵심 청크 단위 `analyze_javascript_application`으로 추가 분석해 ToonOffice 2D에 직접 반영했다.

### 8.1 2·3차 REA 추가 Evidence 원장

| 대상 | 분석 청크 | 연산 | Evidence ID |
| --- | --- | --- | --- |
| 공통 (2차) | CDP `127.0.0.1:9223` 대상 목록 | `list_browser_targets` | `ev_0f0ff1bc4d8b784b43346f287dcc37f2f7d4403cb3a8a2f80e4386e4e5b4d1d3` |
| WorkAdventure | `assets/GameManager-dVEs68va.js` (줌·HDPI·DOM 이름표·조이스틱·온보딩) | `analyze_javascript_application` | `ev_4c387d0f456df99ce52e07a32d77fee6f89dded715280a2eb760a846ad2b6190` / `ev_70eb05fcca8cdec19da604cfa4d82f4efa34f80279720ad323b1ec5e74bef3c2` |
| Gather | `bundle.91ff4c3541de3f18d4d4.js` (`FPSController`·Matter 이름표 반발·미니맵) | `analyze_javascript_application` | `ev_a993e436a663d9db972b6cf49c08985ceed810c9ad6e58ac1071055468364f23` / `ev_4fbf21ca827b13bce1f705df39dcb9d05d9195ba41d83f75d8b3dfc5dbb9dba6` |
| oVice | `assets/openspace-v2-De91LKT5.js` (헤더 3단 브레이크포인트·DPR 1.5 아틀라스 상한) | `analyze_javascript_application` | `ev_5e06fa8cb696d6cbda68d8d7a6eca69f589d6b3fb70f4a9c9ca70bb830255d37` / `ev_2c7c0fa0f819d1bf24e8717a65230490f295053fb173f012283c566e33a87931` |
| Kumospace | `assets/SpacePage-Bww1d9GS.js` (품질 3단계·detect-gpu·미니맵 클릭 이동) | `analyze_javascript_application` | `ev_5d3d411b905cdd177547f5e16f1373fab47a3a6bb85705086502b0be35edefa8` / `ev_84cf0ac0da46734e08f94991443376b8b8db174915461267c8ed49f82fdff549` |
| SoWork | `static/js/WorldFpsLimiter-L27f2-Pf.js` (가시성·비포커스 FPS 제한·자동 착석) | `analyze_javascript_application` | `ev_ecc48faa3882b20d3b5e5bb9c50b3b547024740c26f7c7ea95ef8597cd5d9199` / `ev_b5e7b9e05aa35be3cc3d2fa262a3bd276e8a3c11f03e0338419ce31dde7e4e0e` |
| 공통 (3차) | CDP `127.0.0.1:9223` 대상 목록 | `list_browser_targets` | `ev_8451648b8997f811dccfc127ae85cd85e5355c1dcf314e44ac6c4f505b65903c` |
| WorkAdventure | `assets/ActionableItem-C08k9GnB.js` (`activationRadiusSquared`·24px 전방 액션 선택·외곽선) | `analyze_javascript_application` | `ev_9115337a17d12f921e2f8472184119345b033f3ac3f631c349d2459b7f72571f` |
| SoWork | `static/js/inWorldMetadata-Mx5I3keo.js` (`workspot_schematic`·문 상태머신 `open/close/knock/force`·`user_workspot`) | `analyze_javascript_application` | `ev_6da4daa4c525180303f41348a68b6d5686f6187e4d1aa2e5d694696f6f82106f` |

### 8.2 심화 발견 및 ToonOffice 2D 코드 반영 매핑 (`current`)

| 영역 | REA 관측 근거 | ToonOffice 2D 반영 내용 (`current`) | 구현 파일 |
| --- | --- | --- | --- |
| **반응형 브레이크포인트 & HUD** | WA `{sm:576, md:768, lg:992, xl:1200}` + `@container`, oVice `1200 / 740`, ZEP `1440 / 1024`, SoWork 높이 쿼리 + `env(safe-area-inset-*)` | `>=1560px` 단일 상단 행, `1200..1559px` 전체 라벨 2단 배치, `1024..1199px` 번호 + 현재 공정명 축약, `<1024px` 스와이프 가능한 공정 레일 + 중복 빠른 작업 카드 접기 + 하단 프롬프트/채팅 버튼 충돌 해소 | [`StudioOffice2dPipelineRail.tsx`](../../apps/web/src/domains/creator/virtual-space/office2d/StudioOffice2dPipelineRail.tsx), [`studio-office2d.css`](../../apps/web/src/domains/creator/virtual-space/office2d/studio-office2d.css), [`space-hud.css`](../../apps/web/src/domains/creator/virtual-space/hud/space-hud.css) |
| **전역 배너 슬롯 도킹** | WA·SoWork 하단 액션바/프롬프트 비침범 원칙 | 전역 `ServiceDegradedBanner`가 하단 상호작용 프롬프트(`E`)를 덮지 않도록 좌상단 `SpaceLocationChip` 아래 전용 슬롯(`SpaceServiceStatusSlot`)으로 도킹 | [`SpaceServiceStatusSlot.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceServiceStatusSlot.tsx), [`SpaceLocationChip.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceLocationChip.tsx) |
| **미니맵 라벨 디클러터 & 동료 클러스터링** | SoWork 기본 라벨 숨김·폭 제한, Kumospace 미니맵 클릭 이동, Gather 클러스터링 및 동료 근처 도착 분산 | 복도 구역은 현재 위치일 때만 라벨 표시, 방 폭에 맞춰 전체 이름 → 축약명(`콘티룸·작화·채색 랩·배경·부스·식자·리뷰룸·워룸·로비`) → 숨김 순으로 충돌 없이 배치. 근접 동료 핀은 `+N` 클러스터 배지로 병합하고 더블클릭 시 `±60px` 오프셋(`spaceMinimapPeerTarget`)으로 이동 | [`space-minimap-labels.ts`](../../apps/web/src/domains/creator/virtual-space/hud/space-minimap-labels.ts), [`SpaceMinimap.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceMinimap.tsx), [`toon-hq-blueprint.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/hq/toon-hq-blueprint.ts) |
| **월드 이름표 충돌 회피 & 벽면 간판 감쇠** | Gather Matter 이름표 반발, WA 이름표 스케일 클램프 및 hover 최상단, ZEP 줌 독립 말풍선 | 화면 좌표계에서 `self > peer > npc > ambient` 우선순위로 이름표 AABB 충돌을 위로 밀어 올리고 리더 라인으로 연결. 원거리 NPC/동료 라벨은 근접·선택 시만 노출하며, 이름표와 겹치는 북쪽 벽 구역 간판은 투명도(`0.22`)로 감쇠 | [`office2d-label-layout.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-label-layout.ts), [`office2d-renderer.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-renderer.ts), [`office2d-overlay.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-overlay.ts) |
| **반응형 기준 줌 & 가로형 줌 바** | WA `getOptimalGameSize` 가시 픽셀 기반 자동 줌 + 버튼·휠·핀치 줌 | 화면 크기에 따라 가시 타일 폭(`가로 12..19칸`, `세로 8..13칸`)과 최소 캐릭터 높이(`56px`)를 함께 만족하는 반응형 기준 줌 적용. 우하단 줌 컨트롤을 가로 알약(`− 100% + \| 60% 100% 130%`)으로 재설계 | [`office2d-camera.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-camera.ts), [`SpaceZoomControls.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceZoomControls.tsx) |
| **FPS 제한 & 동적 DPR 거버너** | Gather `FPSController`(`BlurredPSM`), SoWork `WorldFpsLimiter`(`background→pause`, `inactive→15fps`), Kumospace 품질 단계, oVice DPR 상한 | `document.visibilityState === "hidden"` 시 렌더 루프 즉시 일시정지, 창 비포커스 시 `15fps` 제한, 프레임 시간 상승 시 캔버스 DPR을 `2 → 1.5 → 1.25 → 1` 단계로 자동 하향/복구하는 `Office2dResolutionGovernor` 도입 | [`office2d-quality.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-quality.ts), [`StudioOffice2dCanvas.tsx`](../../apps/web/src/domains/creator/virtual-space/office2d/StudioOffice2dCanvas.tsx) |
| **8직군 캐릭터 & 착석·제스처 스프라이트** | ZEP `idle/walk/sit/dance` 폴백 체인, SoWork `feat_auto_sit`·좌석 스냅, WA 프리팹 depth 보정 | 웹툰 스튜디오 8직군(`artist`, `pd`, `writer`, `colorist`, `bgartist`, `letterer`, `modeler`, `editor`) 보행 시트(9×4) 및 작업·제스처 전용 시트(`work/*.webp`, 4×3: 뒷모습 타블렛 드로잉/타이핑 루프, 앞모습 착석 대기·대화·커피, 서서 손 흔들기·응원·따봉·고민) 구축. 각 공정실 데스크에 상주 동료 배치 및 플레이어 접근 시 자동 양보·자동 착석 | [`office2d-sprite-catalog.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-sprite-catalog.ts), [`office2d-poses.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-poses.ts), [`office2d-coworkers.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-coworkers.ts), [`office2d-avatar-role.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-avatar-role.ts), [`office2d-runtime.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-runtime.ts) |
| **고해상도 배경 아트 카펫 · 벽면 액자 · 실시간 공간 이펙트** | Gather/Kumospace 고해상도 배경 레이어 + WA `ActionableItem` 전방 24px 하이라이트 + SoWork 문 상태머신(`open/close/knock`) | 13개 구역마다 `nano-banana-v10..v14` 고해상도 WebP 배경 아트 러그/벽면 액자 뮤럴/2.5D 피처 소품 연동, 구역별 실시간 앰비언트 이펙트(기획실 별자리 오라클 링·작화실 시안 스포트라이트·채색 랩 프리즘 오라·배경실 회전 3D 와이어프레임 큐브·식자실 이퀄라이저 파형·워룸 레이더 스윕), 키 큰 가구 뒤 캐릭터 반투명 오클루전(`alpha: 0.44`), 전방 24px 오브젝트 골드 브래킷 하이라이트, 문턱 노크/정숙 파동 및 빈 좌석 착석 프리뷰 링 구현 | [`office2d-backdrop-art.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-backdrop-art.ts), [`office2d-renderer.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-renderer.ts) |
| **웹툰 효과음(Onomatopoeia) 버스트 · 평면도(Schematic) 뷰 · 실시간 협업창** | SoWork `workspot_schematic` 평면도 뷰(`ev_6da4daa4…106f`), ZEP/Gather 오브젝트 인터랙션 모달 | 가구·공정 상호작용 및 VFX 이벤트 시 웹툰 의성어/의태어 코믹 스탬프(`두근!`, `반짝!`, `집중!`, `번쩍!`, `승인!`, `촥!`, `바스락!`, `호록!`) 방사형 버스트 연출, 상단 레일 `평면도` 토글로 구역 청사진·워크스팟 그리드·인원 배지를 한눈에 보는 Schematic 오버레이 제공, 상단 레일 `협업창` 버튼 및 오브젝트/단축키 연동으로 6종 실시간 워크스테이션 모달(`StudioVirtualSpaceWorkstationLiveModal`)을 2D 캔버스에서 직접 실행 | [`office2d-backdrop-art.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-backdrop-art.ts), [`StudioOffice2dCanvas.tsx`](../../apps/web/src/domains/creator/virtual-space/office2d/StudioOffice2dCanvas.tsx), [`StudioOffice2dPipelineRail.tsx`](../../apps/web/src/domains/creator/virtual-space/office2d/StudioOffice2dPipelineRail.tsx) |
| **월드 건축 바닥 디테일 & 실시간 소품 애니메이션** | Gather `nook`/문턱 경계, WA 영역 속성, ZEP 오브젝트 반응 | 바닥 512px 청크 캐시에 복도 황동 유도선, 방 내부 몰딩, 문턱 매트(`회의·보안` / `정숙·몰입` / `STEP 01..07`) 반영. 북쪽 벽 시계 실시간 바늘, 네온 말풍선 맥동, 벽걸이 TV 대시보드, 비 오는 날 창문 빗줄기, 리뷰 스크린 3컷 프리뷰, 콘티 월 하이라이트, 칸반 포스트잇, 집중 부스 `집중 중 · ON AIR` 배지, 가구 상호작용 상태 배지(`☕ 커피 추출 중…`, `💡 스탠드 조명 켜짐`, `📌 보드 동기화됨`, `🖨 교정지 출력 완료`) 및 창작 노트(`note`) 파티클 구현 | [`office2d-world-details.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-world-details.ts), [`office2d-particles.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-particles.ts), [`toon-hq-blueprint.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/hq/toon-hq-blueprint.ts) |
| **공간 오라(Desk Pod · 정숙 보호막 · 청취 범위)** | Gather `DeskPods` · `FocusOverBusy` · `ListeningRangeUI`, WA `personalArea` | 작업대 착석 시 `내 작업 포드`(`ACTIVE DESK POD`) 경계 하이라이트, 정숙 구역(`silent`) 진입 시 에메랄드 몰입 실드 링, 근접 대화 파트너 존재 시 청취 범위 링 표시 | [`office2d-world-details.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-world-details.ts), [`office2d-renderer.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-renderer.ts) |
| **원거리 경로 가속 · 카메라 팬/핀치 · 스테이지 확장** | SoWork `far_distance_speed_multiplier`, WA/Gather 드래그 팬·핀치 줌, ZEP 타일 이펙트 | 320px 초과 경로 이동 시 최대 `1.45x` 가속 및 도착 감속, 캔버스 드래그 팬·2손가락 핀치 줌·`Space+WASD` 둘러보기(`StudioCameraPanRuntime`) 및 `"시점을 옮겨 둘러보는 중 — 내 위치로 돌아오기"` HUD 복귀 칩 연동, 타일 이펙트(`tileEffects`)·빌드 고정물(`placedFixtures`)·꾸미기(`decorations`)·손 흔들기(`waveActorIds`)·가이드 투어(`guideTourRequest`)·공간 테마(`spaceTheme`) 2D 스테이지 완전 연결 | [`office2d-stage-extensions.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-stage-extensions.ts), [`office2d-runtime.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-runtime.ts), [`StudioOffice2dCanvas.tsx`](../../apps/web/src/domains/creator/virtual-space/office2d/StudioOffice2dCanvas.tsx) |
| **HUD 점진적 공개(Progressive Disclosure) & 가로형 모바일** | Gather/SoWork 단일 주 CTA 원칙, 모바일 가로 뷰포트 가시성 확보 | 개인 공간 중복 구역 바(`SpaceZoneWorkbar`) 및 중복 아틀리에 펄스 버튼 자동 숨김, 하단 프롬프트(`E` 상호작용·시점 복귀·따라가기) 활성 시 수동 `Enter 말풍선 채팅` 힌트 자동 접기, 가로형 모바일(`max-height: 520px`) 도크·조이스틱·상단 슬롯 압축 | [`space-hud.css`](../../apps/web/src/domains/creator/virtual-space/hud/space-hud.css), [`studio-office2d.css`](../../apps/web/src/domains/creator/virtual-space/office2d/studio-office2d.css) |


## 9. 4차 REA — 개인 지정석·공간 음향·평면도 이동·빠른 이모트 (`current`)

> 상태 구분: 이 절의 표는 2026-10-28 기준 현재 작업 브랜치에 구현된 **현재 상태(`current`)**를 적는다. `main` 병합·운영 배포 여부는 별도로 확인해야 한다.
> 서버 동기화(다른 참가자에게 지정석 공유), 실제 음성 채널 발화 감지 기반 더킹은 **목표(`target`)**이며 아직 구현하지 않았다.

### 9.1 4차 REA 추가 Evidence 원장

| 서비스 | 분석 대상 번들 | REA 도구 | Evidence ID (parent / view) |
| --- | --- | --- | --- |
| WorkAdventure | `assets/EmoteStore-Bto8d_ae.js`, `assets/AudioGlobalMessage-CR5g7H6E.js`, `assets/PropertyEditorBase-C1eW72tM.js` (`emojiFavorite` 1~6 슬롯·`decreaseAudioPlayerVolumeWhileTalking`·`RequestedStatus`) | `analyze_javascript_application` | `ev_51d0a18f2efb8187d608fe08db1520266148dfa3d632d67771e18314e0cd9927` / `ev_c8d860997d323ec4867d5045d3b27de93aae1243d4408e9ac765f0183128aba1` |
| SoWork | `static/js/emoteCommand-DBTSHdqF.js`, `useGoToZone-CO8EdtDz.js`, `SetMyWorkSpotModal-XEiR0QEy.js`, `presenceMeetingZones-tlABOveQ.js`, `QuickStatusList-DA4n2Ia4.js`, `AudioPool-C8nl4POq.js` (`setMyWorkSpot`·`useGoToZone`·상태 지속 프리셋 `15/30/60/120/240/until_tomorrow`·`AudioPool`) | `analyze_javascript_application` | `ev_6f262cb6b96505092082fbba2213bb654e836d9377dbde1469bbdbcf73092946` / `ev_be107c29b31826bb2d1ebde802c3a8ce25bdc24175d840708e067024df404525` |
| Kumospace | `assets/StatusIndicator-DJ-H8Uj-.js`, `assets/SharedSettingsModal-Bgo8ja3V.js` (상태 표시·공유 설정 모달) | `analyze_javascript_application` | `ev_74e013f2a30a1e4ecf38951bb970057cd9ff2216e8cef8f3c9bf43900c8b02ff` / `ev_2c2e4138eaab17a27494ffbc2100f9820a261be0f535faeea571dd68f77d1e8d` |

### 9.2 반영 매핑 (`current`)

| 영역 | REA 관측 근거 | ToonOffice 2D 반영 내용 (`current`) | 구현 파일 |
| --- | --- | --- | --- |
| **내 지정석(Assigned Desk)** | SoWork `SetMyWorkSpotModal`(`ev_be107c29…4525`), WA `personalAreaPropertyData`, Gather `AssignedDesk` | 공정 레일 `📌 내 자리` 버튼과 `H` 단축키. 다른 좌석에 앉아 있으면 그 좌석을 지정석으로 저장(브라우저 `localStorage`, 키 `toonstudio:office2d:my-seat-v1`), 아니면 지정석으로 이동(먼 방은 기존 런타임 규칙대로 순간 이동). 월드에는 보라색 `★ 내 지정석` 비콘, 평면도에는 보라색 좌석 마커 | [`StudioOffice2dCanvas.tsx`](../../apps/web/src/domains/creator/virtual-space/office2d/StudioOffice2dCanvas.tsx), [`office2d-backdrop-art.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-backdrop-art.ts), [`office2d-stage-extensions.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-stage-extensions.ts) |
| **평면도 클릭 이동** | SoWork `useGoToZone`·`workspot_schematic`(`ev_be107c29…4525`) | 평면도 모드에서 좌석 28px 안을 누르면 그 좌석, 방 안을 누르면 방 스폰 지점으로 이동(`resolveOffice2dSchematicClickTarget`). 상단 안내 배너(`office2d-schematic-banner`)와 닫기 버튼, 방 카드에 `클릭 이동` 안내 | [`office2d-backdrop-art.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-backdrop-art.ts), [`StudioOffice2dCanvas.tsx`](../../apps/web/src/domains/creator/virtual-space/office2d/StudioOffice2dCanvas.tsx) |
| **공간 음향 큐** | Gather `LeakyDesks`, WA `decreaseAudioPlayerVolumeWhileTalking`(`ev_c8d86099…aba1`), SoWork `AudioPool` | 방마다 다른 2음 화음의 짧은 WebAudio 큐(방 입장·착석·지정석 저장·평면도·이모트). 레일 `🔊 공간음 / 🔇 음소거` 토글은 `localStorage`에 저장. `talking` 옵션은 볼륨을 1/4로 낮추는 더킹을 지원하지만, 실제 발화 감지와의 연결은 `target` | [`office2d-stage-extensions.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-stage-extensions.ts), [`StudioOffice2dPipelineRail.tsx`](../../apps/web/src/domains/creator/virtual-space/office2d/StudioOffice2dPipelineRail.tsx) |
| **1~6 빠른 이모트 의성어** | WA `EmoteStore` `emojiFavorite` 1~6(`ev_c8d86099…aba1`) | 이모트 전송은 기존 페이지 이모트 키맵(1~9·Z·F)이 그대로 맡고, 2D 캔버스는 같은 키에 웹툰 의성어 팝업(`반가워요—!!`, `마감 버닝—!!` 등)과 효과음만 덧붙여 중복 전송이 없다 | [`StudioOffice2dCanvas.tsx`](../../apps/web/src/domains/creator/virtual-space/office2d/StudioOffice2dCanvas.tsx), [`office2d-stage-extensions.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-stage-extensions.ts) |
| **창 채광(볼류메트릭 라이트 샤프트)** | Gather·ZEP 방 분위기 조명, 3차 배경 이펙트 연장 | 각 HQ 방 북쪽 창에서 바닥으로 떨어지는 방 액센트색 대각선 빛줄기 | [`office2d-backdrop-art.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-backdrop-art.ts) |


## 10. 5차 REA — 고품질 스프라이트 · 생체역학 보행(방향 피벗·착석 안착·잔상·눈 깜빡임) · 12종 멀티레이어 VFX (`current`)

> 상태 구분: 이 절은 2026-11-04 기준 REA 정적·시맨틱 그래프 분석(`analyze_javascript_application`, `inspect_analysis_view`, `trace_javascript_semantics`)으로 도출한 레거시 Phaser 파이프라인 대비 Office2D·Dynamic Sprite 간극을 해소한 **현재 상태(`current`)**를 기록한다.

### 10.1 5차 REA Evidence 원장

| 대상 | 분석 범위 | REA 연산 | Evidence ID |
| --- | --- | --- | --- |
| CDP 브라우저 세션 | `http://127.0.0.1:9223` 활성 타깃 검증 | `list_browser_targets` | `ev_24b5776ad0a3407b329c8b326e7e24ac0310676b405606a8b73d22c0980faba9` |
| Office2D 핵심 14모듈 | `office2d/*` + `studio-virtual-space-dynamic-sprite-*` | `analyze_javascript_application` / `inspect_analysis_view` | `ev_b2ed7ccbc68d2489ff571d5a1ffd500e0bb8af65bacd03e7bbcac2679477c23c` / `ev_cae7bae68a154895256c2dbd14d750dfa1c1c654f9449b01b4c787e2a3810310` |
| 시맨틱 호출·데이터 흐름 추적 | `office2dActorFrame`, `Office2dParticles` forward-influence | `trace_javascript_semantics` | `ev_de70facdada3f06eff49a6946577f3e27d35fe1a9925237a1aa0f4004365b867` / `ev_da3226c59dd421270752d929e09e7e6aa535b2da7609624bfa88c7d9fcc91a0d` |
| Office2D + Dynamic Sprite 24모듈 | 24 files, 377,888B, 55,774 AST nodes, 1,096 call-flow, 19,689 data-flow | `analyze_javascript_application` | `ev_f30f65423305974582445a36adf677c5c8a9a2ecbc99b76bb3bacfcd26aa8ed8` / `ev_0616a060ddc65a0d83e39622b97054d50c7b495a2c5b20b58971d5bfa6a2759f` |
| HD Sprite · Smoothing · Particle 비교 | `studio-virtual-space-hd-sprite-pipeline.ts` 등 6모듈 | `analyze_javascript_application` | `ev_38b8f1c5a85d9c9f37b28f758072dfc473369338c85ff8b4603c95cc7dc1a478` / `ev_aab179a803650792e9d5440d1fa86b232353e9292a5fc6e2ade2f161c31b546f` |
| 고도화 후 10모듈 사후 검증 | 업그레이드된 Office2D·Dynamic Sprite 10모듈 (parse_failures: 0, 33,447 AST nodes, 11,510 data-flow) | `analyze_javascript_application` | `ev_be97e48929102f7aa2f1f80924a09611a68235af8bb420ce7e577bff65a46c00` / `ev_86517c4294bdfc02603ddadf0455826db106f813729fac50dffc286ea18e16ea` |

### 10.2 5차 고도화 반영 매핑 (`current`)

| 영역 | REA 진단 결과 | 고도화 구현 내용 (`current`) | 구현 파일 |
| --- | --- | --- | --- |
| **생체역학 보행 · 방향 피벗 쿠션 · 착석 안착** | `office2d-actors.ts`가 방향 전환 피벗 쿠션과 착석·기립 전환 안착 스쿼시, 보행 반주기 발걸음 접지 신호를 계산하지 않음(`ev_f30f6542…8ed8`) | 방향 전환 시 `turnTransition` 수평 압축·피벗 홉, 착석·기립 전이 시 `poseTransition` 안착 스쿼시, `HALF_STRIDE(34px)` 돌파 시 좌·우 교차 `footstepTriggered`/`footstepSide` 및 전력 질주(`speed >= 245`) 시 최대 3단 `afterimages` 잔상 버퍼·배우별 고유 위상 눈 깜빡임(`office2dActorBlink`) 구현 | [`office2d-actors.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-actors.ts), [`office2d-runtime.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-runtime.ts) |
| **이중 접지 그림자(Core AO + Penumbra) & 잔상·블링크 렌더** | `office2d-renderer.ts`가 단일 타원 그림자만 그리고 `resolveStudioHdGroundContactSpec`을 호출하지 않음(`ev_38b8f1c5…a478`) | 보행 주기에 반응하는 이중 접지 그림자(외곽 Soft Penumbra + 발밑 Core AO), 전력 질주 시 아틀라스 보행 프레임 기반 반투명 스피드 잔상 트레일, 정면·측면 캐릭터 자연스러운 눈 깜빡임 아이라인 렌더링 연결 | [`office2d-renderer.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-renderer.ts) |
| **12종 고밀도 파티클 & 5종 멀티레이어 콤보 버스트** | `office2d-particles.ts`가 7종 기본 원/사각형 파티클만 지원(`ev_da3226c5…1a0d`) | 4각 다이아몬드 별빛(`starburst`), 흔들리며 낙하하는 꽃잎(`petal`), 속도 정렬 스트릭(`speedline`), 웹툰 먹물 튀김(`ink-splash`), 이중 동심원 충격파(`shockwave`) 추가 및 상황별 5종 `emitComboBurst`(`interaction`, `sprint`, `emote`, `seat`, `awakening`) 구현 | [`office2d-particles.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-particles.ts), [`office2d-stage-extensions.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-stage-extensions.ts) |
| **웹툰 의성어 방사형 집중선 & 전 구역 앰비언트 이펙트** | `paintOffice2dComicBursts`가 정적 알약 배지만 표시하고 일부 방의 중앙 앰비언트 이펙트가 비어 있음(`ev_0616a060…d59f`) | 의성어 팝업 시 탄성 팝인 스케일(`0.72 → 1.14 → 1.0`) + 8방위 만화 집중선 스파이크 연출 추가, `hq-ink-bay`·`hq-review-room`·`hq-publish-desk`·`hq-lounge` 전용 공간 오라 링 확장 | [`office2d-backdrop-art.ts`](../../apps/web/src/domains/creator/virtual-space/office2d/office2d-backdrop-art.ts) |
| **다이내믹 크리에이터 스프라이트 10표정·8헤어·8VFX·2단 잔상** | `renderDynamicCreatorSpriteSvg`가 10종 눈/입 스타일과 8종 VFX 프리셋 중 일부만 분기 렌더링함(`ev_0616a060…d59f`) | 10종 `eyeStyle`·10종 `mouthStyle`·8종 `hairSilhouette`(베레모·사이버 포니테일·트윈테일·AR 바이저·헤드폰·고양이 귀)·8종 `DynamicSpriteVfxId` 전용 벡터 파츠 모듈 분리 및 `StudioVirtualDynamicSpriteAvatar` 2단 모션 트레일 잔상 구현 | [`studio-virtual-space-dynamic-sprite-svg-parts.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-dynamic-sprite-svg-parts.ts), [`studio-virtual-space-dynamic-sprite-engine.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-dynamic-sprite-engine.ts), [`StudioVirtualDynamicSpriteAvatar.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualDynamicSpriteAvatar.tsx) |

