# 가상 스튜디오 2D 재구축용 REA 역공학 벤치마크 (2026-10-28)

- 문서 상태: `target` (재구축 설계 입력용 리서치. 여기의 권고는 아직 구현되지 않았다)
- 작성일: `2026-10-28` / 조사 시각: `2026-10-27T17:10Z`~`17:30Z` (UTC)
- 기준 커밋: `origin/main` = `a166b435a9e0642c785e6e809d1ee6ff9485c3d9` (2026-10-27)
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
