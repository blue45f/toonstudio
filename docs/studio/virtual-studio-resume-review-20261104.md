# 가상 스튜디오 재개 검수 — 2026-11-04

상태: current. 기준 main은 `650beb41c`다. 로컬 개발 화면·시험, GitHub CI, 실제 운영 연결을 구분한다.

## 기존 작업 정합성

- 오디오 PR #2688은 main의 `9522d5a`에 squash 반영됐다. PR과 main 변경의 patch-id가 같다.
- 캐릭터 미리보기 `8feac9392`는 main의 `4911849a8`과 같은 patch-id다. 같은 수정의 PR을 다시 만들지 않는다.
- 최신 main의 오디오·캐릭터·HUD·제안자 선택 관련 9개 파일 112개 시험이 통과했다. 원격 foundation 로그에서도 관련 6개 파일 84개 시험이 통과했다.

## 새로 수정한 H 키 중복 동작

실제 2D 캔버스와 실제 HUD 단축키 훅을 함께 실행했다. 캔버스에 초점을 둔 H 한 번이 캔버스의 로컬 지정석 동작과 페이지 HUD 자리 동작을 각각 한 번씩 실행했다. 두 window listener가 같은 키를 소유한 것이 원인이다.

캔버스 대상의 native listener에서 H를 한 번 처리하고 `preventDefault`를 상위 HUD에도 전달한다. 제품 페이지에서는 HUD와 같은 자리 callback을 호출해 서버 좌석 요청·개인 자리 패널의 기존 의미를 보존한다. 검색 중이거나 월드 준비 전에는 동작하지 않는다. 페이지 callback이 없을 때만 독립 캔버스의 로컬 지정석 동작을 사용한다. 서버 요청 거절이나 검색 중 무동작이 로컬 이동으로 우회되지 않는다.

- HUD 등록 순서, 한글 글쇠, 입력창·외부 HUD, 반복·IME·보조키, 이미 처리한 이벤트와 해제를 검사했다.
- 관련 4개 파일 66개 시험이 통과했다.
- 실제 Chromium에서 페이지 callback 1회·로컬 중복 0회, 일시 중지 후 무동작, callback 갱신, 입력창 격리, 캔버스 밖 HUD와 독립 캔버스 fallback을 확인했다.
- `/tools/browser-harnesses/virtual-studio-runtime-review.html?hud=1`에서 두 입력 소유자를 함께 재현한다. 이는 실제 서버 좌석 lease 권한 검증을 대신하지 않는다.
- 기존 800줄 초과 Page 파일은 줄 수를 늘리지 않았다.

## 현재 화면 재검증

| 범위 | 이번 확인 | 남은 범위 |
| --- | --- | --- |
| 테마 | HQ 엔진에서 13종 선택 후 ready, page error 0 | 독립 테마별 건축·소품·좌석·충돌·캐스트 전수 |
| 캐릭터 | 390/768/1440px와 light/dark/contrast에서 카드·로비·HUD atlas 일치, Enter 선택, 가로 넘침 0 | 여덟 직군을 넘는 독립 캐스트·3D 정합 |
| NPC | 실제 걷기·E로 컨시어지 대화, writer 원본 초상화 확인 | 모든 NPC·3D NPC·업무 왕복 |
| 오디오 | 실제 WebAudio 감쇠·음소거·복귀·저장 음량, 320/1440px 청음 버튼 44px, 자동 재생 없음 | 실제 상대 미디어·장치 변경·화면 공유 |
| 입력 | 실제 이동·텍스트 입력 격리, H 중복 수정과 권한 callback 보존 | 모든 패널·단축키 재배정·보조 장치 조합 |

## 원고 왕복: 성공과 미해결을 구분

기본 개발 설정의 실제 편집기에서 정식 lifecycle 검증기를 사용했다. `/tmp` 실행본은 모듈 경로와 설치된 Chromium 경로만 맞췄고 원래 assertion·품질 기준은 유지했다. 운영 API가 없는 개발 모드다. 경량 공간 하네스용 dependency 검색 제한 설정은 spectral.js 변환을 생략하므로 전체 편집기 검증에는 사용하지 않았다.

첫 실행은 최초 committed 화면과 Redo 화면 사이 1,527픽셀 차이로 실패했다. 실패를 삭제하거나 허용치를 넓히지 않았다. Undo 이전에 수집한 문서 원본 비트맵은 Redo·재열기 화면과 정확히 같았고, 최초 DOM 화면만 달랐다. 데이터 손상이라고 단정하지 않는다.

별도 통제 실행에서 readback 앞뒤 화면을 추가 기록했으며 원래 committed 화면부터 문서 원본과 같았다. 원래 검증의 Undo→빈 화면, committed→Redo, Redo→재열기, PNG 재열기 전후 비교가 모두 0픽셀 차이로 통과했다. 1440×2160 PNG 출력과 기기 저장·복구를 확인했다. 추가된 대기 이전의 원래 화면도 이미 일치하므로 통과 원인을 대기·readback으로 단정하지 않는다. 첫 GPU 표면 게시의 간헐 차이는 후속 원인 분리·production 재검증이 필요하다. 이번 한 획의 Undo는 문서를 비워 GPU 표면을 해제하고 Redo에서 새 표면을 만든다.

## Hosted CI와 실제 연결 차단

기준 main의 필수 CI `41813464885`는 전체 성공이 아니다. migration/bootstrap 개수·depth predicate 실패는 #2699, critical precache 예산 실패는 #2698 담당이다. 같은 파일을 중복 수정하거나 실패를 무시해 병합하지 않는다. 기존 실패 Actions를 재실행하지 않았다.

개발 서버의 API 502는 서버 저장 성공으로 보지 않는다. 현재 관리형 Chromium은 `AudioCaptureAllowed=false`, `VideoCaptureAllowed=false`, `WebRtcIPHandling=disable_non_proxied_udp`다. 실제 통화는 승인된 장치·네트워크 검증 환경이 필요하다. 정책·프록시·TURN·운영 배포·유료 설정은 변경하지 않았다.

## 클라우드 증거

`/tmp/resume-desk-shortcut-red.log`, `/tmp/resume-desk-authority-green.log`, `/tmp/resume-desk-final-unit.log`, `/tmp/virtual-studio-resume-unit.log`, `/tmp/resume-runtime-review.log`, `/tmp/resume-audio-browser.log`, `/tmp/resume-character-browser.log`, `/tmp/resume-npc-review.log`.

최초 원고 실패와 통제 결과는 각각 `/tmp/resume-studio-lifecycle-current/`, `/tmp/resume-studio-lifecycle-control/`에 보존한다. 통제 보고서는 `studio-lifecycle-report.json`이다. 새 수정의 전체 타입·사전 푸시·원격 CI 결과는 PR 실행 기록으로 별도 확인한다.
