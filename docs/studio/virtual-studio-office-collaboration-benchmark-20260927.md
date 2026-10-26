# 가상 사무실 협업 벤치마크와 팀원·검수 흐름 — 2026-09-27

> 2026-10-12 정정: 클래식 공간 클라이언트 제거(본 문서 기록 이후)로 사라진 파일의 링크는 경로 표기로 바꿨다. 본문 서술은 작성 당시의 사실 기록이다.

상태: **migration**. 이 문서는 `codex/virtual-studio-experience-20260927`의 현재 source/tests로 확인한 변경을 기록한다. 제품 목표는 웹툰 제작 업무에 최적화된 가상 사무실이다. 장식·동작은 사람과 업무를 이해하는 데 도움을 주며, 문서 권한과 협업 의사를 대체하지 않는다. 운영 배포, 인증된 다중 사용자 브라우저 검증, 서비스 전체와의 품질 동등성을 주장하지 않는다.

## 공식 자료 비교

아래 자료는 2026-09-27 확인했다. 열람 날짜와 문서 갱신 날짜를 구분한다. 갱신 날짜가 확인되지 않은 자료를 최신 릴리스라고 단정하지 않는다.

| 서비스·공식 근거 | 확인한 패턴 | ToonStudio 적용·경계 |
| --- | --- | --- |
| [Gather Classic 상태 안내](https://support.gather.town/articles/3094704589-set-your-status-available-busy-and-do-not-disturb) — 문서상 2026-01-26 갱신, Classic 안내 | 참여자 목록에서도 대화 가능·바쁨·방해 금지 상태를 파악한다. 상태는 주변 미디어 참여와 연결된다. | 접속 여부와 작업 상태를 분리해 표시한다. 집중·자리비움일 때 기존 초대 차단을 유지하고 이유를 노출한다. Classic의 동작을 Gather의 모든 버전에 대한 주장으로 확장하지 않는다. |
| [WorkAdventure 채팅 안내](https://docs.workadventu.re/user/chat/) | 실제 온라인 사용자 목록에서 회의 초대를 보내며 상대가 수락·거절한다. 일시적인 근접 대화와 지속되는 채팅의 범위를 구분한다. | 실제 presence 목록에서만 검수 초대를 시작한다. 기존 요청·수락 프로토콜과 고정 검수본 검증을 재사용하며 메시지나 참가자를 생성해 표시하지 않는다. |
| [SoWork 공식 릴리스](https://www.sowork.com/whats-new) — 2026-08-01 게시의 7월 업데이트 및 2026-07-01 게시의 6월 업데이트 | 사람의 위치와 현재 회의를 파악하는 대시보드, 상태 표시, 검색 가능한 업무 자료, 모바일 업무 접근을 강조한다. | 위치·작업 상태·접속 권한 역할로 팀원을 찾고 현황을 실제 목록에서 계산한다. 동의 없는 앱 사용 추적이나 가상의 일정·회의 요약은 추가하지 않았다. |
| [Kumospace 상태·가용성 안내](https://www.kumospace.com/help/status) | Available·Away·Focusing을 구분하고 채팅에서도 상태를 볼 수 있다. | 집중·자리비움·원고 검토·대화 가능을 색과 텍스트로 함께 표시한다. 미디어 설정이나 초대 가능 여부를 녹색 점 하나로 추정하지 않는다. |
| [SpatialChat 방 직접 연결 안내](https://how.spatial.chat/help/getting-started/how-to-send-guests-directly-to-a-private-room-in-spatialchat/) | 목적지가 있는 초대는 인증을 거쳐 바로 해당 방으로 연결한다. | 목록의 검수 초대에서 실제 고정 검수본 선택으로 연결한다. 상대 수락이나 원고 접근 권한을 생략하지 않고 현재 서버 검증 경계를 유지한다. |
| [Teamflow 공식 제품 안내](https://www.teamflowhq.com/) | 회의에 관련 문서와 앱을 유지해 다시 자료를 찾는 시간을 줄인다. | 검수 초대에 선택된 원고·검수·리비전의 기존 고정 참조를 유지한다. 일반 최신 편집본으로 바꾸거나 초대만으로 편집 권한을 주지 않는다. 이 근거는 제품 소개이며 세부 구현·현재 모든 플랜의 가용성 검증은 아니다. |

## 확인한 문제와 변경 — current

기존 `StudioVirtualSpaceSocialPanel`은 접속자의 이름 옆에 같은 녹색 점을 표시했다. 실제로는 집중·자리비움 상태여도 목록에서 그 차이를 바로 알 수 없고, 장소와 접속 역할도 나타나지 않았다. 검색은 이름만 지원했다. 검수 초대는 팀원을 선택한 뒤 세부 동작에서 함께 검토를 누르고 검수본을 선택해야 했다. 버튼이 비활성화된 이유와 목록 아래 열린 검수본 선택 화면도 찾기 어려웠다.

현재 구현은 다음과 같다.

- 참여자의 실제 활동, 현재 장소, 접속 권한 역할을 표시한다. 역할은 작품 소유자·관리자·편집 참여자·의견 참여자·보기 전용이다. 확인되지 않은 작가·PD 등의 업무 직책은 추측하지 않는다.
- 팀원·장소 찾기와 팀원 패널에서 이름, 한글·영문 위치, 작업 상태와 역할을 함께 검색한다. NFKC 정규화와 여러 검색어의 교집합을 지원한다.
- 접속 수, 초대 가능한 수, 집중·자리비움 수는 현재 전달받은 실제 참여자에서 계산한다. NPC나 예시 계정을 포함하지 않는다. 초대 가능 필터는 기존 readiness와 차단·진행 중 요청 상태를 반영한다.
- 목록의 검수 초대 버튼으로 기존 `StudioVirtualSpaceReviewPicker`를 연다. 검수본이 있는 경우 기본 선택본을 확인하고 두 번째 클릭으로 초대를 요청할 수 있다. 다른 버전을 선택하는 경우에는 그 선택 과정이 추가된다. 아무 버튼도 누르지 않았을 때 원고 조회나 초대를 시작하지 않는다.
- 집중·자리비움, 차단, 진행 중 요청·함께하기, 연결·공간 접근 준비, 검수 프로토콜 준비 상태의 제한 이유를 보여준다. 실제 요청 시에는 기존 컨트롤러가 조건과 권한을 다시 확인한다.
- 검수 화면을 열면 제목으로 포커스를 옮기고 화면에 보이도록 스크롤한다. 닫으면 시작 버튼으로 복귀하되, 사용자가 이미 다른 컨트롤로 이동했다면 포커스를 빼앗지 않는다.
- 상태를 색만으로 전달하지 않는다. 주요 조작은 최소 44px 영역을 유지하며 좁은 모바일에서는 초대 버튼을 다음 행으로 배치한다.

핵심 소스는 참여자 표시·검색·초대 제한(`../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-teammates.ts`), 팀원 패널(`../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceSocialPanel.tsx`), 작업실 찾기(`../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceDirectory.tsx`), 검수 선택(`../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceReviewPicker.tsx`)이다. 부모 페이지는 팀원 패널의 optional `manifest`에 현재 월드를 전달한다. 미전달 시에도 기존 장소 카탈로그·캠퍼스의 알려진 위치만 표시하며 미확인 위치를 꾸며내지 않는다.

## 캐릭터 정체성과 테마 미리보기 연결 — current

새 테마 캐릭터의 방향 URL은 32개 포즈가 포함된 원본 시트다. 기존 직접 `img` 표시를 그대로 사용하면 여러 캐릭터가 한꺼번에 노출된다. [공통 캐릭터 미리보기](../../apps/web/src/domains/creator/virtual-space/StudioVirtualCharacterPreview.tsx)는 렌더러와 같은 원본 메타데이터를 사용해 한 프레임만 표시한다. 균등 격자의 정수 경계와 검수된 불균등 프레임 영역을 모두 지원하며, `viewBox`와 명시적인 `clipPath`를 함께 사용해 넓은 컨테이너에서도 옆 프레임이 보이지 않게 한다. 검수된 원본의 머리·발 범위를 임의로 줄이지 않으며 기존 단일 이미지와 상태 이미지는 기존 URL을 유지한다.

- 입장 화면, 공간 내 캐릭터 선택, 참여자 표시, NPC 대화, 개인 홈의 캐릭터를 공통 미리보기로 연결했다.
- [여섯 테마 대표 캐릭터 선택](../../apps/web/src/domains/creator/virtual-space/StudioVirtualThemeCharacterPicker.tsx)은 현재 테마에 맞는 캐릭터를 추천하되 기존 선택을 자동 변경하지 않는다. 클릭은 기존 `avatarIndex` 저장·presence 경로를 사용한다. 신규 캐릭터는 자동 배정 후보에 추가하지 않는다.
- 현재 테마의 가구 원본을 목록과 배치 지도에 함께 표시한다. 테마만 변경하면 가구의 위치·회전·크기와 편집 기록을 유지한다.
- 추천 선택 버튼에는 이름, 선택 상태, 텍스트 추천을 표시하며 모바일 2열 배치와 최소 44px 조작 영역을 유지한다.

## 실행한 검증

- `pnpm exec vitest run`으로 `StudioVirtualSpaceSocialPanel.work`, `StudioVirtualSpaceSocialPanel.appearance`, `StudioVirtualSpaceDirectory`, `StudioVirtualSpaceReviewPicker`, `StudioVirtualSpacePage.social`의 **5파일 59테스트 통과**.
- 명시적 두 번의 클릭으로 고정 검수본을 기존 초대 callback에 전달하는 흐름, 6개 준비·차단 조건, 상대 집중·자리비움, 검색·필터·역할 표시, 빈 실제 참여자 목록, 포커스 이동과 복귀를 검증했다.
- 기존 팀원 picker의 모든 버튼 텍스트가 이름뿐이라는 테스트는 메타데이터와 검수 버튼 추가로 실패했다. 선택 버튼의 접근 가능한 이름 목록을 검사하도록 바꿔 NPC가 선택 가능한 팀원에 포함되지 않는 본래 계약을 유지했다.
- 관련 TS/TSX 8파일 ESLint, 이 문서의 Secretlint, `pnpm harness:check`, `git diff --check` 통과. 전체 통합 `harness:verify`, 최종 타입 검사·빌드·CI는 부모 작업의 최종 게이트에서 확인해야 한다.
- 미리보기 연결 후 `StudioVirtualCharacterPreview`, `StudioVirtualThemeCharacterPicker`, `StudioVirtualSpaceEntryLobby`, `StudioVirtualSpaceCustomizationPanel`, `StudioVirtualSpacePage.social`, `StudioWorkspacePage.continuity`, `StudioVirtualSpaceNpcDialoguePanel`의 **7파일 70테스트 통과**. 실제 여섯 테마 등록을 사용해 명시 선택과 배경 테마 변경 시 정체성 유지를 확인했다. 홀수 원본 크기, 균등 셀을 넘는 검수 영역, 손상된 메타데이터, 기존 단일 이미지와 2×2 원본의 여백도 검사했다. 이 결과는 실제 브라우저 화면이나 휴대폰 시각 검증을 대신하지 않는다.

## 남은 검증·목표 — target

- 인증된 실제 두 사용자로 원고 목록 조회, 초대·수락·거절, 검수 권한 변경·연결 종료를 브라우저에서 확인한다. 현재 결과는 컴포넌트·기존 페이지 회귀 테스트이며 실제 통신 성공 증거가 아니다.
- 실제 휴대폰·스크린리더·여러 언어에서 긴 이름, 많은 참여자, 검수 화면의 스크롤과 포커스를 확인한다.
- 서로 다른 장소에 있는 프로젝트 팀원을 통합 조회하는 기능은 서버의 명시적 presence 범위가 필요하다. 현재 패널은 전달받은 현재 연결 범위의 팀원만 보여준다.
- 별도 기능으로 필요한 일정 연동, 지속되는 채팅, 업무 직책·담당 공정, 외부 게스트 초대와 회의 자료 고정은 기존 서버·권한 계약을 확인한 뒤 구현해야 한다. 이번 UI 개선만으로 구현되었다고 표시하지 않는다.

이 작업은 운영 배포를 실행하지 않았다. PR·병합과 배포 승인은 별도이며 [운영 정책](../operations/minimum-cost-deployment-policy.md)을 따른다.

## 첫 작업·동료 접근·내 자리 연결 — migration, 2026-09-27

운영 화면에서 작업 목적과 첫 행동을 파악하기 어렵다는 피드백을 기준으로 Gather 2의 공식 문서를 추가 확인했다. 아래 자료는 앞의 Classic 상태 안내와 구분한다.

| 공식 근거 | 확인한 패턴 | 이번 컴포넌트 변경 |
| --- | --- | --- |
| [Gather 2 시작 안내](https://support.help.gather.town/articles/1982412443-getting-started-guide) | 사람 선택에서 `Wave`, `Meet`, `Go To`로 이어지며 내 자리 복귀를 별도 동작으로 제공한다. 마이크와 카메라는 기본적으로 꺼져 있다. | 팀원 카드와 검색 결과에 명시적인 다가가기 callback을 추가했다. 가까이 도착한 뒤에도 대화 요청은 별도 클릭과 기존 수락이 필요하다. |
| [Gather 2 자리 관리](https://support.help.gather.town/articles/2255130889-desk-management) | 자리 선택·배정은 신규 구성원의 초기 행동이며 협업 빈도가 높은 사람들을 같은 팀 영역에 배치한다. | 자리 기억과 서버가 확인하는 실제 사용을 구분한다. 기억한 자리를 다른 사람이 사용 중이거나 연결을 확인하지 못하면 사용 가능으로 표시하지 않는다. 팀 자리 이동에는 구체적인 pod 좌표와 식별자를 전달한다. |
| [Gather 2 상태와 가용성](https://support.help.gather.town/articles/9785009882-status-availability) | 목록과 프로필에서 대화 가능 여부·집중 상태를 바로 파악한다. | 다가가기에서도 기존 집중·자리비움·차단·연결 준비 제한을 유지한다. 실제 접속 목록 외의 동료를 표시하지 않는다. |

작업 시작 카드(`../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceOfficeStart.tsx`)는 실제 제작 작업 하나와 작업·동료·자리 행동을 제공한다. 현재 프로젝트의 개인 작업함에 포함된 작업을 우선하고, 없으면 팀 작업임을 명시한다. 로딩·실패 중에는 이전 작업을 추천하지 않으며 재확인과 기존 작업함을 제공한다. 개인 로컬 모드는 프로젝트 작업·접속 수를 표시하지 않고 실제 작품 목록과 새 작품 링크를 제공한다. 입장 화면은 캐릭터 선택을 유지하면서 원고 작업·동료·자리의 용도를 먼저 설명한다.

이 절의 컴포넌트 계약은 부모 페이지와 이동 runtime 통합 중이다. `onApproachPeer`는 실제 경로 이동에, `nearbyPeerIds`는 대화 요청 거리 조건에 연결해야 한다. 선호 자리 callback은 선호 저장만 수행하며 실제 사용은 기존 서버 lease 경로로 확인한다. 현재 장소에서 목적지로 걷기, 장소 전환 후 이동, 모바일 주 동작 배치의 최종 브라우저 검증은 별도 통합 단계다.

## `rea` 기반 경쟁사 가상 스튜디오 정밀 역공학 및 기능 통합 — current, 2026-10-26

2026-10-26 `rea`(`Reverse Engineer Anything` MCP 도구)를 사용해 **Gather Town**, **WorkAdventure**, **ZEP**, **oVice**, **Topia** 5개 경쟁사의 웹 번들·AST·런타임 시나리오를 역공학하고, 확인된 핵심 공간 협업·근접 미디어·상태·채팅·소회의실·투표·영역 분포 기능을 ToonStudio 가상 스튜디오(`apps/web/src/domains/creator/virtual-space/`)에 통합했다.

### 1. 경쟁사별 `rea` 역공학 증거(`ev_*`) 요약

| 경쟁사 | 캡처·스크립트 추출 증거 (`ev_*`) | JS/AST 정적 분석 증거 (`ev_*`) | 확인된 핵심 런타임 계약 |
| --- | --- | --- | --- |
| **Gather Town** (`https://app.gather.town/app`) | `ev_5664ce8efda35be40f19bd7da3a9ac4606f10db593b60d797b629b60367fb046` (`capture_browser_scenario`), `ev_583ab26b07860a03ef5eddb26c4057abbd67f86455264c436bd37a8fc090bc05` (`export_web_scripts`) | `ev_a1b67f4c92ee203ca704d0a449bf35488da65dfeb57c9ba2011899935723c10d` / `ev_c276d2ac2803a3a5e78c8c0a8daaf8f67cc4243aa97c2f534c18fd79c6d42dc0` (58 JS 파일, 675,717 AST 노드, 14,915 findings) | `getConversationZoneId` / `isInConversationZone` 비공개 대화 구역 격리, `whisperTargetId` 1:1 귓속말 오디오 버블, `followingTargetId` 아바타 따라가기, `SpaceStatusMenu` 1시간/오늘 만료 프리셋(`statusExpiresAt`), `leading`/`trailing` 링 버블 거리 감쇠(`computeProximityAudioGain`, `RING_BUBBLE_HYSTERESIS_TILES`) |
| **WorkAdventure** (`https://play.workadventu.re/`) | `ev_c3af106320fa7c687e38d525baed890113042e3e7595ced2d6d25d5f964ddd39` (`capture_browser_scenario`), `ev_60335919ec149272a8c990bf93fb354dd8c7a264a7d609833d0ada303198a50b` (`export_web_scripts`) | `ev_e0e0a90737c9dc905bad7b580f6b9481e567ca176e85a429e1fd8a9a0e9c0f8b` / `ev_d354e29a8cfa732b8e8f5bda848771761a29060d5caefc842c87c5baa83558fc` (19 JS 파일, 67,062 AST 노드, 858 findings) | `companion` 동반 펫 선택(`cat`/`dog`/`fox`/`owl`), `ignoreFollowRequests` 따라가기 요청 자동 차단 및 `bubbleSound` 버블 진입 효과음 토글, `ENABLE_SAY` 말풍선(`say`)·생각풍선(`think`) 아바타 머리 위 팝업 브로드캐스트 |
| **ZEP** (`https://zep.us/`) | `ev_de7bb01772d80f66f1cad6ee33567edf2bb68db2a74befc305b04a5024ef8ae6`, `ev_78cf78d8566556870da9af6254f8a190dd19195c0c5aa2f66aca5dd1008d2326` (`capture_browser_scenario`), `ev_4a8e2649a82eb6bb886b1d3d1d6c802f0e889f0c854d5384040e2f1c0b7b4878` (`export_web_scripts`) | `ev_d0a45faef74963481a0868a90ec40b114897e2a97211cb2dfd7a9bb540c60f02` / `ev_eb218b98bc918855bf2a8bd307fb61acf2199a12217b737cabb330b317adb52d` (11 JS 파일, 65,312 AST 노드, 32 webpack 모듈, 293 findings) | `areaGroupId` / `area:*` 접두어로 묶인 복수 비공개 영역 간 근접 미디어 연결(`extractAreaGroupPrefix`, `resolvePeerConversationZoneId`), 원클릭 **OX 퀴즈** 빠른 투표 템플릿 |
| **oVice** (`https://www.ovice.com/`, `https://app.ovice.com/login`) | `ev_9329459c97ee1c176b108859148e5fa961128ed77f5803c159154c77a34a6925`, `ev_f32b324db30502141f756a3c783978c5e46f8af2cf029ee16c1ee8ab7c59d59b` (`capture_browser_scenario`), `ev_83d0e485577f2159e927843426c1c5eb6eea3d85830b56fb57c98ca595086e06` (`export_web_scripts`) | `ev_5817729b10d4fa7dd919e02753d2726b8769bd62e6c56a40a7d6b2ae80454767` / `ev_0ebb9070959cf8e57c6f3f2eccb860eade809178bd9b721f3c06491dace10918` (12 JS 파일, 53,163 AST 노드, 450 findings) | `Customize Status` 긴급도(`normal`/`warning`/`urgent`) 배지, 채팅 메시지 상단 고정/해제(Pin), `@here`/`@all` 그룹 멘션 하이라이트, 채팅 CSV 내보내기, 60%/100%/130% 퀵 줌 프리셋, 소회의실 무작위(Random) 배정 및 카운트다운 타이머(5/10/15/30분) |
| **Topia** (`https://topia.io/`) | `ev_6de2875ffb88dd44589a88907500a608528bbf19b2f7889493e581323c82c1b9` (`capture_browser_scenario`), `ev_3a5b20ef39bfa635b68bdbc33a79cebf4f925a5c320ab368611c17bbd1435677` (`export_web_scripts`) | 번들 추출 및 공간 영역 클러스터 구조 확인 | 참여자 패널 상단 실시간 공간 영역별 밀집도 요약 칩(`StudioVirtualSpaceUserList`) 및 영역 클릭 즉시 필터링 |

### 2. ToonStudio 가상 스튜디오 반영 내역 및 검증

- **근접 오디오·비공개 영역·연결 구역(`area:*`)·귓속말·따라가기·동반 펫**:
  - [`space-proximity-media.ts`](../../apps/web/src/domains/creator/virtual-space/hud/space-proximity-media.ts), [`space-dock-model.ts`](../../apps/web/src/domains/creator/virtual-space/hud/space-dock-model.ts), [`SpaceSelfCard.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceSelfCard.tsx), [`SpaceRequestToast.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceRequestToast.tsx)
- **상태 만료 프리셋·긴급도 배지·근접 환경설정(`ignoreFollowRequests`, `bubbleSound`)**:
  - [`SpaceStatusMenu.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceStatusMenu.tsx), [`SpaceMovementStatus.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceMovementStatus.tsx)
- **채팅 말풍선/생각풍선(`say`/`think`)·메시지 고정(Pin)·`@here`/`@all` 그룹 멘션·CSV 내보내기**:
  - [`studio-virtual-space-chat.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-chat.ts), [`SpaceChatInput.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceChatInput.tsx), [`SpaceChatPanel.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceChatPanel.tsx)
- **퀵 줌 프리셋(60%/100%/130%)·소회의실 무작위 배정 및 타이머·OX 퀴즈 템플릿·영역별 참여자 분포 칩**:
  - [`studio-virtual-space-user-zoom.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-user-zoom.ts), [`SpaceZoomControls.tsx`](../../apps/web/src/domains/creator/virtual-space/hud/SpaceZoomControls.tsx), [`StudioVirtualSpaceConversationPanel.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceConversationPanel.tsx), [`StudioVirtualSpacePoll.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePoll.tsx), [`StudioVirtualSpaceUserList.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceUserList.tsx)
- **단위 테스트 검증**:
  - `space-proximity-media.test.ts`, `space-collab-flows.test.tsx`, `SpaceMovementStatus.test.tsx`, `SpaceChatInput.test.tsx`, `SpaceChatPanel.test.tsx`, `SpaceZoomControls.test.tsx`, `StudioVirtualSpaceConversationPanel.test.tsx`, `StudioVirtualSpacePoll.test.tsx`, `StudioVirtualSpaceUserList.test.tsx`, `StudioVirtualSpacePage.social.test.tsx` 총 **10파일 111테스트 통과**.

## `rea` 기반 13대 글로벌·국내 가상 오피스 전수 역공학 및 엔터프라이즈 스위트 내재화 — current, 2026-10-26

기존 5개 플랫폼(Gather Town, WorkAdventure, ZEP, oVice, Topia)에 더해 **Kumospace**, **SoWork**, **Roam (`ro.am`)**, **SpatialChat**, **Teamflow**, **Tandem**, **Spot Virtual**, **Cosmos Video** 8개 플랫폼을 추가 역공학하여 총 **13개 가상 오피스 플랫폼**의 핵심 엔터프라이즈 아키텍처를 전수 내재화했다(상세 설계서: [`docs/design/virtual-office-rea-full-analysis-20261026.md`](../design/virtual-office-rea-full-analysis-20261026.md), 증거 원장: [`docs/evidence/rea-virtual-office-benchmark-20261026.json`](../evidence/rea-virtual-office-benchmark-20261026.json)).

| 추가 분석 경쟁사 | 캡처·스크립트 추출 증거 (`ev_*`) | JS/AST 정적 분석 증거 (`ev_*`) | 확인된 핵심 런타임 계약 및 내재화 기능 |
| --- | --- | --- | --- |
| **Kumospace** (`https://www.kumospace.com/`) | `ev_114afc71baf189ff105081892a6c401d064974bd4fafc99bc0f5a9827756dd49` (`capture_browser_scenario`), `ev_497feddeaaf46e7cd583c4c9ebcac541e4ecf21297f6bd3d02c3de3e17304dd9` (`export_web_scripts`) | `ev_f7cfcc9da19c4bcd3cdf4581d8fc34691ead224e0471d3a55c5afdfb9294c0bc` (15 JS 파일, 18,350 AST 노드, 46 findings) | 다층 빌딩 엘리베이터(`1F`~`3F`) 이동, `room` / `floor` / `building-announcement` 3단계 채팅 스코프 분리 |
| **SoWork** (`https://www.sowork.com/`) | `ev_514c3cb16052f520c1656a2a19214c4b7ef8154d43ba3db94977d6cfab87d1fa` (`capture_browser_scenario`), `ev_02efac0816afe61b1eabeb70bf9e7e4b20396cc6032d9bb991936c7452e3b85b` (`export_web_scripts`) | `ev_abf7e241c7b7394b19955060f8cf6fe56bd1fbc16b09eb121ffb89538a11d946` (20 JS 파일, 83,302 AST 노드, 731 findings) | 6대 기둥(`01 Office`, `02 Memory`, `03 Messaging`, `04 Insights`, `05 MCP/API`, `06 Agents`), Sophia 회의 봇 요약·검색, MCP 오피스 컨텍스트 쿼리, AI 에이전트 상주 데스크, 주간 딥 포커스 대 회의 비율 인사이트 |
| **Roam (`ro.am`)** (`https://ro.am/`) | `ev_6b337a7796d9f67e39f262693932ca503da90b2598df65daa14aebe7ab16f487` (`capture_browser_scenario`), `ev_d0a5f03e66937b0a3201c26758a67b331422eb44edd6189219a99b6e09b3a08d` (`export_web_scripts`) | `ev_2ebb7726bf3fe3edf3834c838739fc577fcf04d7488fb59e7e293dbe78485201` (8 JS 파일, 58,196 AST 노드, 178 findings) | Cloud HQ 다층 오피스, 잠긴 방 Knock-to-Enter(`approved` / `wait-5m` / `declined`), Aikido 비동기 데스크 비디오/보이스 노트 드롭 |
| **SpatialChat** (`https://spatial.chat/`) | `ev_6e984816b7719b53c4e56a32e149dc2ca35a5a1938a2527889d63bfbd3527577` (`capture_browser_scenario`), `ev_42c32b3b295439a1a524792cc1891e1a9111ed0d6955b3bcf8ad595812da9110` (`export_web_scripts`) | `ev_97ddfac28d25cf96cd94399ee886d8b4b263839f028b914abf8e7f8a68779186` (39 JS 파일, 106,351 AST 노드, 575 findings) | 공간 캔버스 레퍼런스 시트·컬러 파레트 다중 미디어 핀 고정 및 위치 잠금(`pinCanvasReferenceMedia`) |
| **Teamflow** (`https://www.teamflowhq.com/`) | `ev_c06e65e140c37363302b801261cc1e2adce9b213a283b17a0c41d73675454e27` (`capture_browser_scenario`), `ev_69fc4158d89a49d52cee184b19a9ffb3becc2ee2ff9cb759c5dc076ecf48f7e9` (`export_web_scripts`) | `ev_7e75688d019b6f943fd93d2486bb8a3abedcd5d151bbd7f19d59b7f8036413fe` (6 JS 파일, 50,421 AST 노드, 109 findings) | 전원 퇴실 후에도 회의실 테이블 위에 원고·화이트보드·검수표가 유지되는 영구 회의 테이블(`StudioPersistentRoomTableApp`) |
| **Tandem** (`https://tandem.chat/`) | `ev_5f3558559354770186012f646e47373b73224af8a4c19c447e8c70826332ca24` (`capture_browser_scenario`), `ev_54e6b4dd54012e26e24fdb22143a0ce3f7557e4e3a4687dfe121d3e554639480` (`export_web_scripts`) | `ev_d8735b270d51fe11ec0402fbebbeab604b6a02fd51d197558d081dc86e9c79a5` (12 JS 파일, 56,789 AST 노드, 170 findings) | 활성 창작 앱(Clip Studio Paint, Blender, Photoshop 등) 문서 컨텍스트 실시간 공유 및 스포일러 보안 마스킹 |
| **Spot Virtual** (`https://www.spotvirtual.com/`) | `ev_4ca17baabfd9693bf7773f0f8b7e26f3d613716aed59b8221cf11513745be4e1` (`capture_browser_scenario`), `ev_668b1e4007afd650143bf65e94d8d356e122045e4f64144b137807f6c9310bf8` (`export_web_scripts`) | `ev_5eb0d1a0f8e46a3003c53274d366a4eabda2768c4a87f7f58a07ea7b3bf21029` (15 JS 파일, 72,782 AST 노드, 427 findings) | 라우트 `/ai-agents`, `/docs/openclaw`, `/docs/api` 기반 상주 AI 에이전트 전용 책상 및 OpenClaw/MCP 쿼리 연동 |
| **Cosmos Video** (`https://www.cosmos.video/`) | `ev_8ca6827515b79ab11841c9caf5d261a529dede9394e98fec2996f6cd6b154d73` (`capture_browser_scenario`), `ev_9f232eeb80de3ed7d85c80ecd2303573b9e486bcc59875f692b521b3fcbac5a3` (`export_web_scripts`) | `ev_56072ce99ceaff3e6362fdbabdbdbcbded769f011971d013fa6b18e77b58d0d2` (27 JS 파일, 96,420 AST 노드, 629 findings) | `AI Cosmos Replay` 회의 하이라이트, `True Statuses` 작업 상태, 원격 VFX·크리에이티브 스튜디오용 4화면 동시 공유 및 레이저 포인터 |
| **Teemyco** (`https://www.teemyco.com/`) | `ev_6061ac93ef5fccb75c3613ee213535ad82ba242c7af3e4e98d2fea6fc54d28a7` (`capture_browser_scenario`), `ev_c72e0ad41b8070cd70077812e7ce28d97d1040af517de0889d6af6275fe90a01` (`export_web_scripts`) | `ev_f4cf169dc250783e292928913a4a142d163bbcf560dd2ba17996eccfe859842f` (28 JS 파일, 139,426 AST 노드, 955 findings) | 아바타 시각 상태 모자(Status Hats) 착용 및 집중 시 인터럽트 차단, 마감 칭찬 Kudos 샤우트아웃 월 |
| **Sococo** (`https://www.sococo.com/`) | `ev_78ba461207d3da216554f3b8e9c53318eee0609c06656f8560bec0d014a89c18` (`capture_browser_scenario`), `ev_52d8230ee59552e24e96b782c47bd02be6ec3143f0d3176e4837f183575a2e63` (`export_web_scripts`) | `ev_07701dbc09fddede87065e69b27e9bfdfaf60680a23935925b0db9a4268c80a8` (8 JS 파일, 2,637 AST 노드, 6 findings) | 플로어플랜 룸별 실시간 미디어 활성 인디케이터 매트릭스, `Get Teammate` 즉시 호출, 외부 게스트 리셉션 로비 큐 |
| **Nooks** (`https://www.nooks.ai/`) | `ev_45d8d5585d5ba3bdd9998f9d8c09cb8010d3cdc1225c9609bc519ac0d548db2b` (`capture_browser_scenario`), `ev_fc709b48fee125ac8773a406a3066ee9013f8ce088f346cba631063cea042347` (`export_web_scripts`) | `ev_c2284173114bf1324107a883742c19bb04c1e0a2900aeb263467b84fc0a07049` (10 JS 파일, 165,174 AST 노드, 758 findings) | AI 가상 플로어 Call-Along 섀도잉(신입 어시 참관), PD 귓속말 코칭(Whisper Director Coaching), AI 배틀카드 |
| **Tuple** (`https://tuple.app/`) | `ev_83d0e498f681954b3987f9be9849ec998c43a2ac1d584d2ed0618b9a30b3f450` (`capture_browser_scenario`), `ev_68f7a5ce8292e6c0a468e1eea79772698b9480532daabf5bb54648036b10948f` (`export_web_scripts`) | `ev_72542a57b950a41034f3a76bd985eb912f89ac6e9c5b80349cf314837322260e` (26 JS 파일, 224,282 AST 노드, 350 findings) | 5K 60fps 초저지연 페어 드로잉, 자동 소멸 레이저 잉크(Fading Laser Ink, 3.5s TTL) 대 영구 레드라인 주석 분리 |
| **Virbela** (`https://www.virbela.com/`) | `ev_5f8cca16522d9cd4cd1f592a3b08ee1c87504cec0fe03bec3fc972c8ac5b5a9f` (`capture_browser_scenario`), `ev_1ed06cc5b63895f0057e5b0ba9b8f9a24354a48b9573fea40402ea7b1a118b7b` (`export_web_scripts`) | `ev_c876cf15ddd390584d85c3952c4e79784fe27250ec7b754e2f120f46e2a1001e` (6 JS 파일, 57,444 AST 노드, 651 findings) | 오디토리움 스테이지 카메라 프리셋 전환(`stage-wide`, `presenter-closeup`, `pedestal-macro-orbit`, `audience-qna-split`) |
| **Frame VR** (`https://learn.framevr.io/`) | `ev_e73d82982ef5d69ac8d7b64eb3e7452a120e24a5c34973b6eb6e6ee1679d23e8` (`capture_browser_scenario`), `ev_a17a5b3f9db7e0f72b71c423e677fac043a8a384e275e02af1356c88e345ad4a` (`export_web_scripts`) | `ev_b2cc903cd894f4cbfa2bb59288dbcfe827eaff226afcb9aea172bc20b66467eb` (9 JS 파일, 82,289 AST 노드, 127 findings) | 브라우저 WebXR 3D GLB/VRM 에셋 페데스탈(Pedestal) 턴테이블 각도 동기화 회전 및 3D 공간 핀 노트 |
| **Arthur Digital** (`https://www.arthur.digital/`) | `ev_43772a3968806b2b19ac4ba3292f9b3b3e7c569e000511cdde6f693dc505938a` (`capture_browser_scenario`), `ev_ceeb6b538c6c103931ba7f6c0b5491ca7de57669f8cae10267b8e593861365c3` (`export_web_scripts`) | `ev_eeef58bd0380bfc52d5a041f8f36ba5167881c8652880781b9a63c80d909d00b` (15 JS 파일, 145,702 AST 노드, 347 findings) | XR 공간 프레젠테이션 보드, 3D 공간 오디오 존, AI 회의 요약 핸드오프 |
| **Pop** (`https://pop.com/`) | `ev_a3a79b45c50c8c7a19841e546ef1af680e071c41ee8c91c4a331654bcf9797cb` (`capture_browser_scenario`), `ev_2dd60d1b92908465ff28046307fb5baaafb1824b4f4676e0ce3fb0f1db7acab2` (`export_web_scripts`) | `ev_c096547145efb584a2d21a08527feddb558f18aedb39ba6219575b2821bf7c38` (75 JS 파일, 104,889 AST 노드, 1,319 findings) | 멀티유저 화면 위 실시간 드로잉 및 원격 마우스·펜 제어권 즉각 교대(`handoffRemoteAppControlDriver`) |

- **신규 내재화 모듈**:
  - [`studio-virtual-office-spatial-floors-model.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-office-spatial-floors-model.ts)
  - [`studio-virtual-office-ai-agents-memory-model.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-office-ai-agents-memory-model.ts)
  - [`studio-virtual-office-pairing-xr-floor-model.ts`](../../apps/web/src/domains/creator/virtual-space/studio-virtual-office-pairing-xr-floor-model.ts)
  - [`StudioVirtualOfficePairingXrPanel.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualOfficePairingXrPanel.tsx)
  - [`StudioVirtualOfficeEnterpriseSuite.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualOfficeEnterpriseSuite.tsx) (통합 연결: [`StudioVirtualSpaceCollaborationHub.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceCollaborationHub.tsx), [`StudioVirtualSpaceTownProgramPanel.tsx`](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpaceTownProgramPanel.tsx))
