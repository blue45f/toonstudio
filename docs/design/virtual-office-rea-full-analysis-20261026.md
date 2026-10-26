# 28대 글로벌·국내 가상 오피스 · 원격 페어링 · 공간 XR · 딥워크 플랫폼 REA 전수 역공학 분석 및 툰스튜디오 내재화 설계서 (2026-10-26)

- **문서 상태**: `current` (2026-10-26 Wave 1 13종 + Wave 2 8종 + Wave 3 7종 = 총 28종 구현 및 테스트 완료)
- **증거 원장**: [`docs/evidence/rea-virtual-office-benchmark-20261026.json`](../evidence/rea-virtual-office-benchmark-20261026.json)
- **기존 벤치마크 연계**: [`docs/studio/virtual-studio-office-collaboration-benchmark-20260927.md`](../studio/virtual-studio-office-collaboration-benchmark-20260927.md)

---

## 1. 목적 및 분석 범위

본 문서는 REA(Reverse Engineer Anything) MCP 도구 체인(`capture_browser_scenario` → `export_web_scripts` → `analyze_javascript_application` → `inspect_analysis_view`)을 사용해 글로벌 및 국내 대표 가상 오피스·원격 페어링·공간 XR·포모도로 딥워크 협업 플랫폼 **28종**의 클라이언트 번들과 AST·라우트·상호작용 계약을 역공학 분석하고, 그 결과를 **클린룸(Clean-Room) 순수 TypeScript 도메인 모델 및 React UI 스위트**로 툰스튜디오(`apps/web/src/domains/creator/virtual-space/`)에 전수 내재화한 기록이다.

---

## 2. 관측 사실(Observed Facts) — 28개 플랫폼 REA 증거 요약

| # | 플랫폼 | 대상 URL | 주요 REA Evidence ID (`capture` / `ast`) | JS 파일 / AST 노드 / Findings | 핵심 역공학 추출 기능 |
| --- | --- | --- | --- | --- | --- |
| 1 | **Gather (Gather Town / 2.0)** | `https://app.gather.town/app` | `ev_5664ce8e...` / `ev_a1b67f4c...` | 58파일 / 675,717노드 / 14,915건 | 근접 버블·귓속말, Private Zone, Spotlight 방송, `x`키 통합 상호작용, 아바타 Follow, Locate 가이드선 |
| 2 | **WorkAdventure** | `https://play.workadventu.re/` | `ev_c3af1063...` / `ev_e0e0a907...` | 19파일 / 67,062노드 / 858건 | 4인 근접 버블 + LiveKit 회의실 전환, Silent/Meeting 타일 트리거, `WA.*` iframe 맵 스크립트 API |
| 3 | **ZEP** | `https://zep.us/` | `ev_de7bb017...` / `ev_d0a45fae...` | 11파일 / 65,312노드 / 293건 | 미니앱 스토어, 스페이스 클론, 호스트 관제(전원 소환·일괄 음소거·이동 잠금·룰렛·출석) |
| 4 | **oVice** | `https://www.ovice.com/` | `ev_9329459c...` / `ev_5817729b...` | 12파일 / 53,163노드 / 450건 | 아바타 시선 방향 지향성 음성 콘(Directional Voice Cone), 방 잠금·노크, 어깨 톡(Shoulder Tap), 메가폰 |
| 5 | **Topia** | `https://topia.io/` | `ev_6de2875f...` / `ev_3a5b20ef...` | 8파일 / 12,480노드 / 64건 | 공간 거리·방향 오디오 감쇠, 캔버스 미디어 존 브로드캐스트 |
| 6 | **Kumospace** | `https://www.kumospace.com/` | `ev_114afc71...` / `ev_f7cfcc9d...` | 15파일 / 18,350노드 / 46건 | 다층(Multi-floor) 엘리베이터 구조, Room/Floor/Broadcast 3단계 채팅 스코프, 다중 화면 공유 |
| 7 | **SoWork** | `https://www.sowork.com/` | `ev_514c3cb1...` / `ev_abf7e241...` | 20파일 / 83,302노드 / 731건 | 6대 기둥(`01 Office`, `02 Memory`, `03 Messaging`, `04 Insights`, `05 MCP/API`, `06 Agents`), Sophia 회의 봇, MCP 오피스 쿼리, 상주 AI 에이전트 데스크 |
| 8 | **Roam (`ro.am`)** | `https://ro.am/` | `ev_6b337a77...` / `ev_2ebb7726...` | 8파일 / 58,196노드 / 178건 | Cloud HQ 다층 조감도, 잠긴 방 Knock-to-Enter 승인 흐름, Aikido 비동기 데스크 비디오/보이스 드롭, Magic Minutes |
| 9 | **SpatialChat** | `https://spatial.chat/` | `ev_6e984816...` / `ev_97ddfac2...` | 39파일 / 106,351노드 / 575건 | 공간 캔버스 다중 미디어 핀 고정(Pin/Lock Media), Stage vs Breakout 룸, 다중 스트림 비교 |
| 10 | **Teamflow** | `https://www.teamflowhq.com/` | `ev_c06e65e1...` / `ev_7e75688d...` | 6파일 / 50,421노드 / 109건 | 전원 퇴실 후에도 회의실 테이블 위 문서·보드·타이머가 유지되는 Persistent Room Table State |
| 11 | **Tandem** | `https://tandem.chat/` | `ev_5f355855...` / `ev_d8735b27...` | 12파일 / 56,789노드 / 170건 | 작업 앱 실시간 컨텍스트 프레즌스(활성 DCC 툴·문서 노출 및 프라이버시 마스킹), 원클릭 허들 |
| 12 | **Spot Virtual** | `https://www.spotvirtual.com/` | `ev_4ca17baa...` / `ev_5eb0d1a0...` | 15파일 / 72,782노드 / 427건 | 라우트 `/ai-agents`, `/docs/openclaw`, `/docs/api` 기반 AI 에이전트 상주 책상 및 OpenClaw/API 브리지 |
| 13 | **Cosmos Video** | `https://www.cosmos.video/` | `ev_8ca68275...` / `ev_56072ce9...` | 27파일 / 96,420노드 / 629건 | 라우트 `/product/features/call-recording--ai-cosmos-replay`, `/product/features/true-statuses`, `/solutions/remote-vfx-game-studio` |
| 14 | **Teemyco** | `https://www.teemyco.com/` | `ev_6061ac93...` / `ev_f4cf169d...` | 28파일 / 139,426노드 / 955건 | 아바타 시각 상태 모자(Status Hats: 초집중 헬멧·페어링 베레모·리뷰 크라운) 착용 및 방해금지 연동, 마감 칭찬 Kudos 샤우트아웃 월 |
| 15 | **Sococo** | `https://www.sococo.com/` | `ev_78ba4612...` / `ev_07701dbc...` | 8파일 / 2,637노드 / 6건 | 플로어플랜 룸별 실시간 미디어 활성 인디케이터 매트릭스(마이크·캠·듀얼 화면), `Get Teammate` 즉시 호출, 외부 게스트 리셉션 로비 큐 |
| 16 | **Nooks** | `https://www.nooks.ai/` | `ev_45d8d558...` / `ev_c2284173...` | 10파일 / 165,174노드 / 758건 | AI 가상 플로어 Call-Along 섀도잉(신입 어시 참관), PD 귓속말 코칭(Whisper Director Coaching), AI 배틀카드 프롬프트 |
| 17 | **Tuple** | `https://tuple.app/` | `ev_83d0e498...` / `ev_72542a57...` | 26파일 / 224,282노드 / 350건 | 5K 60fps 초저지연 페어 드로잉, 자동 소멸 레이저 잉크(Fading Laser Ink, 3.5s TTL) 대 영구 레드라인 주석 분리 |
| 18 | **Virbela** | `https://www.virbela.com/` | `ev_5f8cca16...` / `ev_c876cf15...` | 6파일 / 57,444노드 / 651건 | 대규모 캠퍼스 오디토리움 스테이지 카메라 프리셋 전환(`stage-wide`, `presenter-closeup`, `pedestal-macro-orbit`, `audience-qna-split`) |
| 19 | **Frame VR** | `https://learn.framevr.io/` | `ev_e73d8298...` / `ev_b2cc903c...` | 9파일 / 82,289노드 / 127건 | 브라우저 WebXR 3D GLB/VRM 에셋 페데스탈(Pedestal) 턴테이블 각도 동기화 회전 및 3D 공간 핀 노트 |
| 20 | **Arthur Digital** | `https://www.arthur.digital/` | `ev_43772a39...` / `ev_eeef58bd...` | 15파일 / 145,702노드 / 347건 | XR 공간 프레젠테이션 보드, 3D 공간 오디오 존, AI 회의 요약 핸드오프 |
| 21 | **Pop** | `https://pop.com/` | `ev_a3a79b45...` / `ev_c0965471...` | 75파일 / 104,889노드 / 1,319건 | 멀티유저 화면 위 실시간 드로잉 및 원격 마우스·펜 제어권 즉각 교대(`handoffRemoteAppControlDriver`) |
| 22 | **Remo** | `https://remo.co/` | `ev_ad223a2c...` / `ev_301afb9a...` | 9파일 / 225,046노드 / 916건 | 컷별 스피드 품평 테이블 순환 로테이션(`rotateSpeedCritiqueTables`) 및 실시간 Q&A 업보트 정렬 보드 |
| 23 | **Spatial.io** | `https://www.spatial.io/` | `ev_19ef4a20...` / `ev_fb089614...` | 6파일 / 11,143노드 / 150건 | 3D 갤러리 월드 간 즉시 이동하는 크로스-월드 포털 텔레포터(`traverseSpatialPortal`) 및 3D 전시 프레임 |
| 24 | **ENGAGE XR** | `https://engagevr.io/` | `ev_2fbf6cd7...` / `ev_7530f4e1...` | 2파일 / 16,622노드 / 16건 | 3D 공간 내 아바타 동선·음성·소품 홀로그램 고스트 녹화·재생(`recordNewSpatialGhostClip`, `setSpatialGhostPlaybackState`) |
| 25 | **Airmeet** | `https://www.airmeet.com/` | `ev_5ce60fa3...` / `ev_02c3b94f...` | 33파일 / 235,843노드 / 1,153건 | 본무대 송출 전 마이크·캠·콘티덱 동기화 점검 그린룸 백스테이지(`toggleGreenRoomDeviceCheck`, `promoteGreenRoomPresenterToMainStage`) |
| 26 | **Bramble** | `https://www.bramble.live/` | `ev_eb4a75ae...` / `ev_0d86e127...` | 6파일 / 25,396노드 / 57건 | 유체 공간 구역별 앰비언트 사운드스케이프(`lofi-atelier`, `rainy-rooftop`, `cafe-murmur`, `cathedral-reverb`) 및 보이스 더킹 |
| 27 | **Focusmate** | `https://www.focusmate.com/` | `ev_2b07c111...` / `ev_3ba19aea...` | 13파일 / 221,232노드 / 1,037건 | 25/50/75분 구조화 책임감 스프린트(목표 선언 Check-in → 무언 딥드로잉 → 종료 회고, `advanceFocusSprintPhase`) |
| 28 | **Flow Club** | `https://www.flow.club/` | `ev_663eb2af...` / `ev_2e9f3c50...` | 10파일 / 148,178노드 / 858건 | 호스트 플레이북 기반 포모도로 세션, 동기화 Lo-Fi 음악 스트림, 참가자 목표 체크리스트(`toggleFocusSprintIntentionCompleted`) |

### 미해결 경계 (Unknowns / Boundaries)
- **Butter (`https://www.butter.us/`) & Welo (`https://www.welospaces.com/`)**: 헤드리스 브라우저 시나리오 캡처 시 각각 `net::ERR_CONNECTION_TIMED_OUT` 및 `net::ERR_NAME_NOT_RESOLVED`가 발생하여 번들 추출에서 제외하고 네트워크 경계로 기록했다.
- **인증 내부 WebSocket 바이너리 프레임**: 각 상용 서비스의 유료 워크스페이스 로그인 이후 WebRTC SFU 제어 패킷은 무인증 공개 캡처 범위 밖이므로, 공개 번들 AST의 모듈·라우트·상태 머신 정의를 기반으로 클린룸 재구현했다.

---

## 3. 툰스튜디오 내재화 아키텍처 매핑

28개 플랫폼에서 도출한 핵심 기능을 웹툰·애니메이션 스튜디오 제작 공정(콘티 → 선화 → 3D 배경 → 채색/조명 → 식자/검수)에 맞춰 다음 7개 핵심 모듈로 내재화했다.

1. [`studio-virtual-office-spatial-floors-model.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-office-spatial-floors-model.ts)
   - **다층 빌딩 엘리베이터 (`1F 로비·타운홀`, `2F 작화·3D배경·채색 아틀리에`, `3F 콘티·편집검수·AI관제실`)**: 층간 이동, 잠긴 방 입장 통제, Room/Floor/Building 3단계 스코프 채팅 라우팅.
   - **방음 회의실 잠금 & Knock-to-Enter & Shoulder Tap**: 스포일러 보안 콘티실 잠금, 노크 요청(`approved` / `wait-5m` / `declined`), 상대방 상태(`available` / `focusing` / `dnd`)와 긴급도에 따른 어깨 톡 전달 분기.
   - **Teamflow 영구 회의실 테이블 앱 (`StudioPersistentRoomTableApp`)**: 전원 퇴실(`occupantCount === 0`) 후에도 테이블 위에 고정된 원고 리테이크 시트·컬러 스크립트·검수표 보존.
   - **oVice 지향성 음성 콘 (`computeDirectionalVoiceConeGain`)**: 화자 시선 방향(heading)과 청자 방위각 차이에 따른 정면 콘(100%) vs 후방 감쇠(`rearGainFloor`) 및 방음 룸 격리·메가폰 방송 계산.
2. [`studio-virtual-office-ai-agents-memory-model.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-office-ai-agents-memory-model.ts)
   - **Spot Virtual `/ai-agents` & SoWork `06 Agents` 상주 AI 에이전트 데스크**: 소피아 회의록·메모리 봇(`3F-AI-01`), 식자·말풍선 검수 에이전트(`3F-AI-02`), 선화·레이어 무결성 감사 봇(`2F-AI-03`), 3D 배경·렌더 보조 에이전트(`2F-AI-04`) 태스크 배정 및 산출물 누적.
   - **SoWork `02 Memory` & Cosmos `AI Replay` 회의 메모리**: 결정사항·액션아이템·하이라이트 타임스탬프 구조화 및 시맨틱 검색.
   - **SoWork `05 MCP/API` & Spot `OpenClaw` 오피스 컨텍스트 브리지 (`executeVirtualOfficeMcpQuery`)**: `who-is-around`, `last-meeting-decisions`, `active-bottlenecks`, `agent-desk-status` 4종 인텐트에 대한 프로토콜 응답(`toonstudio-office-mcp/1.0`).
   - **Tandem & Cosmos `True Statuses` 실시간 DCC 앱 프레즌스**: `Clip Studio Paint EX`, `Blender 4.2 LTS`, `Adobe Photoshop`, `SketchUp Pro`, `ToonStudio 콘티 보드` 활성 파일명 표시 및 스포일러 보안 마스킹.
   - **Roam `Aikido` 비동기 데스크 노트 & 4화면 동시 공유 그리드 & ZEP 호스트 관제 & SoWork 주간 인사이트**.
3. [`studio-virtual-office-pairing-xr-floor-model.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-office-pairing-xr-floor-model.ts)
   - **Teemyco 상태 모자(`equipStudioMemberStatusHat`) & 마감 칭찬 Kudos 샤우트아웃 월(`postStudioKudosShoutout`, `reactToStudioKudosShoutout`)**: 초집중 원고 헬멧/마감 스퍼트 머리띠 착용 시 직접 호출 자동 보류 연동.
   - **Sococo 플로어플랜 미디어 매트릭스 · `Get Teammate` 호출(`summonTeammateToStudioRoom`, `respondToTeammateSummon`) · 외부 게스트 리셉션 로비(`resolveReceptionLobbyGuest`)**.
   - **Tuple & Pop 5K 초저지연 페어 드로잉 · 자동소멸 레이저 잉크(`addStudioScreenInkStroke`, `pruneExpiredFadingInkStrokes`) · 원격 앱 제어권 교대(`handoffRemoteAppControlDriver`)**.
   - **Nooks AI 플로어 섀도잉(`joinFloorShadowingSession`) & PD 귓속말 코칭(`sendDirectorWhisperDirective`) + Virbela · Frame VR · Arthur 3D 에셋 페데스탈 턴테이블(`update3dAssetPedestalInspection`)**.
4. [`studio-virtual-office-stage-sprint-holo-model.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-office-stage-sprint-holo-model.ts) & [`StudioVirtualOfficeStageSprintHoloPanel.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualOfficeStageSprintHoloPanel.tsx)
   - **Airmeet 그린룸 백스테이지(`toggleGreenRoomDeviceCheck`, `promoteGreenRoomPresenterToMainStage`) & Remo 컷별 스피드 품평 테이블 순환 로테이션(`rotateSpeedCritiqueTables`) · 실시간 Q&A 업보트 보드(`upvoteStageQnaItem`)**.
   - **ENGAGE XR 3D 고스트 아바타 홀로그램 공간 녹화/재생(`recordNewSpatialGhostClip`, `setSpatialGhostPlaybackState`) & Spatial.io 크로스-월드 포털 텔레포터(`traverseSpatialPortal`)**.
   - **Focusmate & Flow Club 호스트 플레이북 기반 작화 딥워크 스프린트(`advanceFocusSprintPhase`, `toggleFocusSprintIntentionCompleted`, `addFocusSprintIntention`) & Bramble 유체 공간 사운드스케이프 존(`updateAmbientSoundscapeZone`)**.
5. [`StudioVirtualOfficePairingXrPanel.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualOfficePairingXrPanel.tsx) & [`StudioVirtualOfficeEnterpriseSuite.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualOfficeEnterpriseSuite.tsx)
   - [`StudioVirtualSpaceCollaborationHub.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceCollaborationHub.tsx)의 `"13대 가상오피스 통합관제"` 탭 및 [`StudioVirtualSpaceTownProgramPanel.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceTownProgramPanel.tsx)의 `"가상오피스"`(`"Office suite"`) 탭에 6대 통합 탭으로 연결 완료.
