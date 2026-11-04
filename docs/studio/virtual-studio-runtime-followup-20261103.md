# 가상 스튜디오 실제 엔진 후속 검수 — 2026-11-03

상태: current. 클라우드 브라우저에서 확인한 결과다. [1차 테마 원장과 단계별 계획](virtual-studio-theme-review-20261103.md)을 보완한다. 전체 기능·테마 고도화 완료를 의미하지 않는다.

## PR #2672 Actions의 실제 결과

[실행 41690750375](https://github.com/blue45f/toonstudio/actions/runs/41690750375)는 실제 GitHub runner를 배정받고 checkout·테스트를 실행했다. `Core regression shard / studio-character`, `Core regression shard / studio-editing`은 success다. 나머지 core 작업과 집계 core·verify는 cancelled로 끝났다. 취소 주체·이유는 이 조회로 확인하지 못했으므로 결제 실패나 코드 실패로 추정하지 않는다. 과거 main의 결제 차단과 이 실행을 구분한다. CodeQL의 actions 분석은 별도 실행에서 success를 확인했다. 전체 CI 통과로 기록하지 않는다.

## 재현하고 수정한 NPC 불일치

기본 2D 로비의 컨시어지에게 걸어가 E로 대화하면, 월드에는 갈색 머리·노란 상의의 사람이 서 있는데 근접 카드와 대화창에는 로봇 얼굴이 표시됐다. 월드는 `office2dCharacterForNpc("npc-concierge")`의 writer 원본을 사용하고, HUD는 별도 experience-v8 NPC 원본을 사용하기 때문이다.

- 기본 2D 근접 카드와 대화창에 현재 렌더러 종류를 전달한다.
- 같은 `office2dCharacterForNpc` 직군 배정과 atlas 정면 프레임을 흉상으로 잘라 표시한다.
- 기존 사용자 아바타도 같은 프레임 표시 컴포넌트를 공유한다.
- Phaser·3D 경로의 기존 초상화는 유지한다. 3D NPC와 초상화의 일치 여부는 아직 미검증이다.
- 실제 개인 작업실에서 같은 컨시어지와 다시 대화해 월드·근접 카드·대화창의 사람 모습이 일치함을 확인했다.

브라우저 증거: `/tmp/virtual-npc-baseline.png`(수정 전), `/tmp/virtual-npc-before.png`(파일명은 원래 probe 이름이며 현재 내용은 수정 후). Git에 임시 이미지를 추가하지 않는다.

## 실제 2D 엔진 검증 화면

`/tools/browser-harnesses/virtual-studio-runtime-review.html`은 실제 `StudioOffice2dCanvas`, 본사 manifest, 기존 이미지·물리 엔진을 사용한다. presence만 합성 로컬 상태이며 서버 권한·실시간 협업·회의를 흉내 내는 성공 증거로 사용하지 않는다.

- 본사 엔진에서 공간 테마 13종을 차례로 적용해 모두 ready, 브라우저 pageerror 없음 확인.
- 방향키 오른쪽 입력으로 실제 위치 x가 336에서 420으로 이동했다.
- 텍스트 입력에 `wasdh123`과 왼쪽 방향키를 입력해도 위치는 (420,1470)으로 유지됐다.
- 한글 IME 조합·모든 단축키·채팅 전송·회의 중 입력은 이 브라우저 시나리오에 포함하지 않았다.
- 13개 화면은 `/tmp/virtual-runtime-themes/<theme-key>.png`에 생성했다. 마지막 3종도 같은 본사 엔진에서 테마 아트를 확인한 것이며, 각각의 전용 사무실 manifest 배치·좌석·충돌을 검증한 것은 아니다.

## 테마가 비슷하거나 예상과 다른 원인

실제 본사 화면에서는 13종 모두 가구·벽·NPC 직군 배치가 공통이며, 바닥 안쪽의 아트 영역과 외곽색이 주로 바뀐다. `paintOffice2dRoomFloorBackdrops`는 원화를 24% 알파로 바닥에 합성한다. 따라서 독립된 건축·소품·캐스트가 바뀌는 테마라는 기대와 현재 동작은 차이가 크다. 이 후속 수정에서는 배경·충돌·가구를 변경하지 않았다.

선택 카드와 실제 엔진은 별도 이미지 목록이라 다음 불일치도 확인했다. 이는 다음에 범위를 나눠 고칠 후보다.

| 테마 | 카드 이미지 | 실제 본사 엔진 이미지 |
| --- | --- | --- |
| modern-office | seoul-editorial-hq | global-ip-pitch-boardroom |
| webtoon-atelier | studio-theme-floor-panorama | seoul-editorial-hq |
| celestial-observatory | magic-academy-astral-library | scifi-orbital-command |
| garden-terrace | hanok-botanical-atelier | murim-bamboo-pavilion |
| library | abyssal-bioluminescent-worldlab | magic-academy-astral-library |
| sunset-harbor | dolby-sound-dubbing-studio | rooftop-sunset-screening-stage |

권장 다음 변경은 작은 공유 테마 아트 원장으로 카드·렌더러 URL을 맞추는 것이다. 독립 공간 개편은 별도 테마 manifest에 배경·소품·좌석·충돌·NPC를 함께 정의하고, 각 테마별 이동·앉기·대화·업무 진입 왕복을 검증하는 범위로 나눈다.

## 원고 편집기 지연 조사

일러스트 프로젝트 생성 → 기획 소개·대본 입력 → 새로고침 후 보존 → Writer Room JSON 출력·파싱·대본 포함을 다시 확인했다.

- 원고 편집기 진입 20초 시점에는 `Studio 편집기를 여는 중...`과 지연 안내가 남았다.
- 같은 탭에서 45초 더 대기한 약 65초 시점에는 실제 편집기·캔버스·레이어 패널·첫 장면 UI가 표시됐다. 브라우저 pageerror는 없었다.
- 지연 구간은 `StudioEditorRoute`가 `studio-legacy-editor-adapter`를 lazy import하는 Suspense 경계다. 정적 진입 그래프는 약 19.4MiB·1,654 모듈이며 개발 서버의 큰 모듈 그래프 로딩이 유력하다. 모듈별 네트워크 타이밍을 기록한 정밀 프로파일은 아직 없으므로 단일 원인을 확정하지 않는다.
- 개발 서버는 API 127.0.0.1:4001의 auth/session·health 요청에서 ECONNREFUSED를 기록한다. 이것은 서버 연결 표시의 근거이며, API 부재만으로 편집기 import 지연을 설명한다고 단정하지 않는다.
- 실제 드로잉·실행 취소·원고 정식 저장·재열기·이미지 출력은 아직 왕복 검증하지 않았다. 기획 JSON 출력과 혼동하지 않는다.

## 사운드·회의와 다음 순서

기본 2D 음소거 토글·로컬 저장 상태·WebAudio cue 호출을 독립 엔진 화면에서 확인했다. 음소거 상태는 새로고침 후 유지됐고, 명시적으로 다시 켰을 때 AudioContext가 한 번 생성됐다. 실제 청음과 마이크 송출·상대방 수신 품질은 별도다. 개인 공간은 미디어 버튼이 비활성이고 팀 프로젝트 연결 필요 문구를 표시하는 것을 확인했다. API·다른 참가자가 없는 환경에서 회의 연결 성공을 주장할 수 없다.

후속 우선순위는 ① 테마 카드·렌더러 원장 일치 ② 편집기 모듈 로딩 프로파일과 원고 왕복 ③ 전용 테마 공간별 좌석·충돌·NPC 검증 ④ 두 브라우저의 실제 API 연결을 갖춘 회의·음량 감쇠·화면 공유·재접속이다. 운영 배포·유료 자산 구매·결제 설정·보호 설정 변경은 수행하지 않는다. 이전에 403으로 거부된 main 보호 설정 조회도 재시도하지 않았다.

## 실행 검증 기록

NPC·아바타·대화창 Vitest 3파일 33개와 RTC 진단·근접 미디어 Vitest 3파일 27개가 통과했다. ESLint·문서 링크·diff 공백 검사도 통과했다. 전체 TypeScript와 푸시 전 필수 검증 결과는 PR의 실행 기록에 별도로 남긴다.
