# 13대 글로벌·국내 가상 오피스 REA 전수 역공학 분석 및 툰스튜디오 내재화 설계서 (2026-10-26)

- **문서 상태**: `current` (2026-10-26 구현 및 테스트 완료)
- **증거 원장**: [`docs/evidence/rea-virtual-office-benchmark-20261026.json`](../evidence/rea-virtual-office-benchmark-20261026.json)
- **기존 벤치마크 연계**: [`docs/studio/virtual-studio-office-collaboration-benchmark-20260927.md`](../studio/virtual-studio-office-collaboration-benchmark-20260927.md)

---

## 1. 목적 및 분석 범위

본 문서는 REA(Reverse Engineer Anything) MCP 도구 체인(`capture_browser_scenario` → `export_web_scripts` → `analyze_javascript_application` → `inspect_analysis_view`)을 사용해 글로벌 및 국내 대표 가상 오피스·공간 협업 플랫폼 **13종**의 클라이언트 번들과 AST·라우트·상호작용 계약을 역공학 분석하고, 그 결과를 **클린룸(Clean-Room) 순수 TypeScript 도메인 모델 및 React UI 스위트**로 툰스튜디오(`apps/web/src/domains/creator/virtual-space/`)에 전수 내재화한 기록이다.

---

## 2. 관측 사실(Observed Facts) — 13개 플랫폼 REA 증거 요약

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

### 미해결 경계 (Unknowns / Boundaries)
- **Butter (`https://www.butter.us/`)**: 헤드리스 브라우저 시나리오 캡처 시 `net::ERR_CONNECTION_TIMED_OUT`이 발생하여 번들 추출에서 제외하고 네트워크 타임아웃 경계로 기록했다. 퍼실리테이션 도구(투표·타이머·순서 추첨)는 ZEP 및 Teamflow 증거를 기반으로 내재화했다.
- **인증 내부 WebSocket 바이너리 프레임**: 각 상용 서비스의 유료 워크스페이스 로그인 이후 WebRTC SFU 제어 패킷은 무인증 공개 캡처 범위 밖이므로, 공개 번들 AST의 모듈·라우트·상태 머신 정의를 기반으로 클린룸 재구현했다.

---

## 3. 툰스튜디오 내재화 아키텍처 매핑

13개 플랫폼에서 도출한 핵심 기능을 웹툰·애니메이션 스튜디오 제작 공정(콘티 → 선화 → 3D 배경 → 채색/조명 → 식자/검수)에 맞춰 다음 3개 핵심 모듈로 내재화했다.

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
3. [`StudioVirtualOfficeEnterpriseSuite.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualOfficeEnterpriseSuite.tsx)
   - [`StudioVirtualSpaceCollaborationHub.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceCollaborationHub.tsx)의 `"13대 가상오피스 통합관제"` 탭 및 [`StudioVirtualSpaceTownProgramPanel.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceTownProgramPanel.tsx)의 `"가상오피스"`(`"Office suite"`) 탭에 통합 연결.
