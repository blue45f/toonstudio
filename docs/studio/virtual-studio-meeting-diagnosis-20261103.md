# 가상 스튜디오 회의 연결 조사 — 2026-11-03

상태: current. 클라우드의 폐기용 PostgreSQL/API, 합성 검증 계정 두 개와 Chromium 독립 브라우저 컨텍스트를 사용했다. 운영 데이터·실제 사용자의 마이크·카메라를 사용하지 않았다.

## 검증한 구간

정상 로그인과 프로젝트 협업 권한을 거쳐 같은 작업실에 입장했다. 두 계정 모두 서버 연결 ready와 상대 서버 presence를 확인했다. 미디어 동의 버튼을 명시적으로 누른 후 가상 카메라·마이크 트랙은 live였다. 근접 참가자 목록과 원격 미디어 수신은 성립하지 않았다.

브라우저의 RTC API 호출을 추적한 추가 실행에서는 서버를 통한 offer/answer와 setRemoteDescription 완료까지 확인했다. 이후 ICE 상태는 new, 데이터 채널은 connecting으로 남았다. 이전 실행에서는 양쪽이 제안하지 않는 경우도 있었다. 따라서 단일 원인으로 묶지 않는다.

## 제품 코드: 제안자 선택 ID 혼용

`StudioLiveP2pOverlayTransport.ensurePeer`는 자신의 클라이언트 세션 UUID와 상대 서버 연결 ID를 사전순 비교했다. 서로 다른 ID 체계라 두 참가자가 모두 대기하거나 동시에 제안할 수 있다. 이는 연결 ID가 바뀌는 재접속에서도 발생한다.

기존 `transportSessionId` 어댑터로 자신의 현재 서버 연결 ID를 구해 상대 연결 ID와 비교한다. 매핑이 없거나 null인 기존 전송 방식은 세션 ID 비교를 유지한다. 참가자·메시지·권한·서버 ACL·미디어 동의 계약은 바꾸지 않는다.

새 회귀 검사는 실제 오버레이에 서로 다른 클라이언트/서버 ID를 주고, 외부로 발송한 SDP 제안과 대상 ID를 검사한다. 수정 전 3개 실패·2개 통과였으며, 수정 후 제안자는 두 참가자 중 한 명으로 수렴한다. 가짜 RTC를 쓰므로 실제 ICE·음질 검증과 구분한다.

## 환경 차단: 관리형 Chromium UDP 정책

클라우드 `/etc/chromium/policies/managed/misc.json`에 `WebRtcIPHandling` 값 `disable_non_proxied_udp`가 적용돼 있다. 정책과 프록시를 변경하지 않았다.

앱·서버를 제외한 순수 `RTCPeerConnection` 두 개로 대조 시험했다. offer/answer 교환과 ICE gathering complete 후에도 양쪽 ICE는 new, 후보 이벤트는 0회, 데이터 채널은 connecting이었다. 즉 이 환경의 실제 미디어 연결 실패는 제품 코드만으로 판정할 수 없다. TURN 공급자 자격증명·유료 서비스·외부 운영 설정을 추가하지 않았다.

## 증거와 남은 검증

- `/tmp/studio-meeting-instrumented.log`: 합성 두 계정의 로그인·서버 입장, RTC 메서드 호출과 최종 상태. 자격증명·SDP 본문을 출력하지 않는다.
- `/tmp/studio-rtc-control.log`: 앱 없는 RTC 대조 시험, ICE 후보 0회.
- `/tmp/mesh-election-red.log`, `/tmp/mesh-election-green.log`: 수정 전후 회귀 검사.
- `/tmp/studio-meeting-host.png`: 실제 서버 작업실 화면.

UDP 또는 승인된 TURN 경로가 지원되는 검증 환경에서 근접 참가자 반영, 실제 원격 오디오·영상, 음소거·음량 감쇠, 화면 공유·재접속을 추가 검증해야 한다. 이번 변경을 실제 회의 복구 완료로 간주하지 않는다. 관리 정책 해제·운영 배포·유료 서비스 구매는 수행하지 않았다.
