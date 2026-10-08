# ToonStudio WebRTC 실시간 미디어 설계와 벤치마크

- 기준일: 2026-09-25 (2026-10-07 정정: 시그널링 3겹, TURN 자격 세 갈래, 벤치마크 제품 서술과 깨진 인용 링크 8곳)
- 범위: Virtual Studio huddle, 음성·카메라·화면 공유, ICE 정책, 권한·수신자 표시
- 상태: 소규모 P2P 경로는 구현·브라우저 검증, WAN·대규모 방송은 별도 검증 필요

## 1. 문제 정의

실시간 협업 화면에서 다음 기능은 가까워 보이지만 같은 시스템이 아니다.

- 문서 변경과 저장
- 참가자 presence
- 통화 참가 승인과 시그널링
- 직접 데이터 메시지
- 음성·카메라·화면 media track
- 장기 보관되는 채팅·검수 기록

ToonStudio는 이를 하나의 `realtime=true` 상태로 묶지 않는다. 각 데이터에 하나의 권위를 두고, 공간상 거리나 방 모양보다 실제 recipient scope와 권한 revision을 우선한다.

## 2. 권위 매트릭스

| 관심사 | 권위 | 주요 기술 | 내구성 |
|---|---|---|---|
| 작품 문서 | Studio document / CRDT | Yjs, command journal | 영속 |
| room admission | 서버 membership | 방 서버(기본 Cloudflare Durable Objects, 선택형 Socket.IO 폴백), ACL | 세션·원장 |
| presence | room awareness | 방 서버 / direct port | 일시적 |
| WebRTC signaling | 대상 지정 envelope | 허들 SDP·ICE는 DataChannel `studio-direct-v1` 직접 레인, 메시 부트스트랩·화면 공유 신호는 방 서버 | 일시적 |
| 직접 chat·reaction | P2P direct port | bounded JSON packet | 메모리 |
| 음성·영상·화면 | peer connection | RTP media tracks | 일시적 |
| TURN credential | 인증된 ICE policy lease | short-lived username/credential | TTL |
| review voice note | project graph API | MediaRecorder + object storage | 영속 |
## 3. 실제 연결 흐름

```text
room 참가 승인
→ 대상 peer와 immutable conversation scope 확정
→ direct port로 state announce
→ media가 필요할 때만 RTCPeerConnection 생성
→ offer/answer와 ICE candidate를 대상 session에 전송
→ getUserMedia/getDisplayMedia 권한 응답
→ session generation·authority revision 재검증
→ sender.replaceTrack()
→ connection state와 실제 recipient 표시
```

통화 화면을 열었다고 마이크나 카메라 권한을 요청하지 않는다. 사용자가 명시적으로 장치를 켠 뒤에만 capture를 요청하며, 브라우저 권한 창이 열려 있는 동안 방·역할·대화 scope가 바뀌면 늦게 도착한 stream을 즉시 중지한다.

## 4. 협상과 충돌 처리

P2P huddle은 perfect-negotiation 계열 규칙을 사용한다.

- 각 peer link는 `makingOffer`, `ignoreOffer`, `settingAnswer` 상태를 가진다.
- 동시에 offer가 생긴 glare 상황에서 session identity로 polite/impolite 역할을 결정한다.
- remote description 전에 도착한 ICE candidate는 제한된 queue에 보관한다.
- SDP, ICE candidate, pending signal 개수와 chat rate를 제한한다.
- peer epoch가 달라진 signal은 폐기한다.

이 구조는 늦은 offer·answer나 이전 세션의 ICE가 새 연결에 적용되는 것을 막는다.

## 5. 네트워크 변경과 ICE 복구

연결이 `failed` 또는 `disconnected`가 되면 즉시 무한 재접속하지 않는다.

- 최소 재시도 간격을 둔다.
- 자동 ICE restart 횟수를 제한한다.
- `restartIce()`가 있으면 사용하고, 없으면 `iceRestart: true` offer를 생성한다.
- 자동 복구 한도를 넘으면 사용자에게 재참여 경로를 안내한다.
- 새 ICE policy가 도착하면 기존 peer에 `setConfiguration()`을 적용한다.
## 6. STUN, TURN과 운영 모드

### 소규모 huddle 기본 경로

현재 P2P huddle protocol의 기본 설정은 공개 STUN을 사용하는 작은 mesh다.

- 원격 peer 최대 3명
- `bundlePolicy: max-bundle`
- `rtcpMuxPolicy: require`
- TURN은 Worker가 발급한 단기 자격이 있을 때만 쓰고(아래 ICE 서버 정보 세 갈래 참고), 없으면 STUN 전용으로 시작한다. 유료 fallback을 자동으로 켜지 않는다.

따라서 이 경로는 제한 NAT와 기업망에서 항상 성공한다고 주장하지 않는다.

### 인증된 TURN 정책 경로

별도 voice ICE policy lease는 서버가 검증한 `stun` 또는 `turn` 설정을 받는다.

- TURN username·credential은 짧은 TTL로 발급한다.
- 만료 전에 비례 lead time으로 갱신한다.
- 갱신 실패는 exponential backoff와 jitter를 사용한다.
- 만료된 TURN credential로 새 peer를 만들지 않는다.
- 구성 변경을 기존 peer에도 반영한다.

현재 ICE 서버 정보는 세 갈래로 받는다.

- 허들·직통 데이터: 브라우저의 공유 캐시가 실시간 Worker의 `POST /v1/turn/credentials`에서 Cloudflare TURN 단기 자격증명(TTL 4시간)을 받는다. 없거나 실패하면 STUN 전용으로 시작한다.
- 화면 공유: Nest API의 `GET /creator/works/:id/screen-share/ice`가 coturn REST 방식(HMAC-SHA1) 자격증명을 발급한다(기본 TTL 900초, 설정 범위 300–86,400초). TURN 설정이 없으면 STUN 또는 direct 정책을 돌려준다.
- 로컬 모드: ICE 서버 없이 같은 브라우저 안에서만 동작한다.

TURN 자격이 만료된 뒤의 갱신과 메시 신호가 방 서버의 접근 규칙(ACL)을 통과하는지는 운영 환경에서 확인한 증거가 아직 없다(미확인).

STUN은 연결 후보를 찾는 보조 서버이며 media relay가 아니다. TURN은 직접 연결이 실패할 때 media를 중계하므로 대역폭 비용과 자격 증명 운영이 필요하다.

## 7. 화면 공유의 양방향 동의

화면 공유는 host가 시작했다는 이유만으로 모든 room 참가자에게 전달되지 않는다.

```text
host가 화면 capture 시작
→ share announcement
→ viewer가 특정 share 요청
→ host가 특정 viewer 승인
→ 그 viewer를 위한 peer connection과 offer 생성
→ media track 전달
```

- viewer request와 host approval은 session을 대상으로 한다.
- host는 현재 viewer 목록을 볼 수 있다.
- local mode에서는 제3자 STUN/TURN을 자동 호출하지 않는다.
- 최대 viewer와 pending request, pending ICE를 제한한다.
- 브라우저의 native sharing 종료 버튼도 track cleanup으로 연결한다.
## 8. 벤치마크에서 확인한 제품 패턴

공식 도움말과 제품 문서를 2026-10-07에 다시 열어 확인했고 깨진 인용 주소 8곳을 바로잡았다. 이 표는 기능과 UX 패턴을 비교한 것이며, 독립 성능 시험이나 보안 인증 결과가 아니다.

| 제품 | 공식 자료에서 확인한 패턴 | ToonStudio에 적용한 원칙 |
|---|---|---|
| Gather 2.0 | 근처 사람과의 대화, 잠글 수 있는 미팅룸, 여러 명이 동시에 올릴 수 있는 화면 공유를 구분해 안내(room-wide Spotlight는 이전 Classic 도움말 주소에서만 인용됐고 현행 2.0 도움말에서는 찾지 못함) | 근접 UI와 broadcast transport를 하나로 취급하지 않음 |
| WorkAdventure | meeting, silent, restricted, personal, lockable, max-user area와 room/world megaphone를 map contract로 제공 | 공간 metadata와 실제 media·access policy를 분리 |
| Kumospace | audio range, room audio, closed room, floor/all-floor broadcast와 recording scope를 구분 | recipient와 recording 범위를 화면에 명시 |
| Magma | 캔버스 안의 voice/video/screenshare를 창작 흐름에 연결하고, 캔버스 소유자·관리자가 Admin 메뉴의 Listen·Talk 권한으로 음성 통화를 제한 | 문서 collaboration과 media 권한을 별도 capability로 모델링 |

### Gather

- 현행 Gather 2.0 도움말(Meeting Overview)은 근처 사람과의 즉석 대화, Lock으로 잠그는 미팅룸, 여러 명이 동시에 올리는 화면 공유를 구분한다.
- room 전체 발표용 Spotlight는 이전(Classic) 도움말 주소에서만 인용됐고 현행 2.0 도움말에서는 찾지 못했다(미확인). Classic과 2.0의 동작을 섞어 쓰지 않는다.
- 이전 문서에 있던 Mini Mode·annotation 서술은 현행 2.0 도움말에서 확인하지 못해 비교 근거에서 뺐다.

### WorkAdventure

- 공간의 area에 meeting·silent·restricted·personal·lockable 같은 의미를 부여한다.
- 큰 회의는 일반 근접 mesh 대신 podium·megaphone 같은 별도 발표 경로를 권장한다.
- 방 또는 world 단위 broadcast가 일반 대화와 분리되어 있다.

### Kumospace

- spatial audio와 room audio를 구분한다.
- closed room은 카메라와 화면 공유 recipient 범위에도 영향을 준다.
- recording 시작 시 참가자에게 알리고 recording 범위를 audio range 또는 room으로 제한한다.

### Magma

- 문서 캔버스와 통화·화면 공유가 같은 작업 표면에 있다.
- 음성 통화 권한(Admin 메뉴의 Listen·Talk)은 캔버스 소유자·관리자가 따로 조절하며 문서 협업 권한과 같지 않다. 요금제별 미디어 제한은 공식 도움말에서 확인하지 못했다(미확인).
- 화면 안에 미디어가 있다는 사실만으로 내구 문서·권한·복구 parity를 의미하지 않는다.
## 9. 비교에서 가져오지 않는 주장

- 공식 도움말의 동시 사용자 수는 동일 장치·네트워크·codec 조건의 독립 benchmark가 아니다.
- 한 브라우저의 loopback 성공은 서로 다른 NAT와 WAN 연결 성공을 증명하지 않는다.
- P2P mesh의 소규모 성공은 SFU 기반 대규모 회의와 방송 품질을 증명하지 않는다.
- 화면상의 거리와 벽은 실제 track recipient 권한의 대체물이 아니다.
- WebRTC 사용 자체는 E2E 암호화 제품 정책, 접근성 또는 recording 정책을 자동 보장하지 않는다.

## 10. 현재 검증 단계

| 단계 | 상태 | 의미 |
|---|---|---|
| protocol unit test | 구현 | 잘못된 packet, queue, epoch, rate 제한 검증 |
| fake peer integration | 구현 | offer·answer·ICE·track lifecycle 검증 |
| single Chromium loopback | 구현 | 실제 browser API와 recipient edge 검증 |
| physical multi-device LAN | 추가 증거 필요 | 실제 카메라·마이크·device switch |
| different NAT / WAN | 추가 증거 필요 | STUN direct와 TURN relay 비교 |
| restrictive enterprise network | 추가 증거 필요 | UDP 차단·TCP/TLS relay |
| large meeting / broadcast | 현재 범위 아님 | SFU topology와 운영 capacity 필요 |

## 11. 다른 프로젝트에 재사용하는 순서

1. identity, admission, conversation, recipient, signaling, direct data, media와 durable state를 분리한다.
2. 사용자에게 실제 recipient와 recording 상태를 보여 준다.
3. device permission은 사용자 동작 뒤 요청하고 늦은 응답을 revision으로 폐기한다.
4. SDP·ICE·chat·peer·viewer·retry·TTL에 명시적 예산을 둔다.
5. peer generation과 conversation identity로 이전 세션 signal을 폐기한다.
6. network change, restart, credential refresh와 teardown을 독립 상태로 테스트한다.
7. loopback, LAN, WAN, TURN과 SFU 증거를 같은 ‘지원 완료’ 상태로 합치지 않는다.

## 12. 저장소 근거

- `apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts`
- `apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts`
- `apps/web/src/domains/creator/studio-screen-share.ts`
- `apps/web/src/domains/creator/studio-voice-ice-policy.ts`
- `apps/web/src/domains/creator/virtual-space/studio-virtual-space-rtc-diagnostics.ts`
- `docs/studio-p2p-huddle.md`
- `docs/studio/virtual-studio-completion-acceptance-20260920.md`
## 13. 외부 참고 자료

### 표준·브라우저

- W3C WebRTC Recommendation: <https://www.w3.org/TR/webrtc/>
- W3C WebRTC Statistics: <https://www.w3.org/TR/webrtc-stats/>
- MDN WebRTC connectivity: <https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity>
- MDN `restartIce()`: <https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce>

### 제품 공식 문서

- Gather 2.0 Meeting Overview(Screen Sharing 절 포함): <https://support.help.gather.town/articles/4462418552-meeting-overview>
- WorkAdventure areas: <https://docs.workadventu.re/map-building/inline-editor/area-editor/>
- WorkAdventure megaphone: <https://docs.workadventu.re/map-building/inline-editor/megaphone>
- Kumospace spatial and room audio: <https://www.kumospace.com/help/spatial-and-room-audio>
- Kumospace presenting and broadcast: <https://www.kumospace.com/help/present-views>, <https://www.kumospace.com/help/broadcast>
- Kumospace recording: <https://www.kumospace.com/help/recording>
- Magma voice and video call permissions: <https://help.magma.com/en/articles/9479415-voice-and-video-call-permissions>
- Magma camera and screenshare: <https://help.magma.com/en/articles/8601241-camera-and-screenshare>
- (삭제) 이전 Gather Spotlight·Screen sharing, WorkAdventure 구 경로, Kumospace 구 경로, Magma `6712005-audio-video` 주소는 모두 404라 더 이상 인용하지 않는다.

외부 제품의 UI와 정책은 변경될 수 있다. 발표나 의사결정에 다시 사용할 때는 열람 날짜, 요금제와 공식 문서의 최신 상태를 다시 확인한다.
