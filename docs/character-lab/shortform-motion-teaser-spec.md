# 9:16 숏폼 모션 코믹 티저(WebM) · 단행본 출판 조판 · 에피소드 콘티 큐시트 제품 명세서

## 1. 개요 및 목적
주간 연재 웹툰 작가와 스튜디오가 단일 4컷 디렉터 세션에서 **세로 스크롤 웹툰 원고(PNG)**, **5단 투명 분리 후보정 원본(PSD)**, **인쇄 재단선 포함 단행본 출판 페이지(Tankobon PNG)**, **홍보용 9:16 숏폼 모션 코믹 비디오(WebM)**, **회차 단위 다중 4컷 콘티 큐시트(`.cutsheet.json`)**까지 원소스 멀티유즈(OSMU)로 동시 출고하도록 설계된 통합 파이프라인 명세입니다.

## 2. 아키텍처 경계 및 결정성 계약
1. **순수 도메인 스케줄러·합성기 (`src/export/**`)**
   - `webtoon-motion-teaser.ts`: `Math.random`, `document`, `MediaRecorder`, `AudioContext` 의존성 없이 Node·브라우저 어디서나 동일한 입력에 100% 동일한 프레임 스케줄(`planMotionTeaserSchedule`), 컷 진입 말풍선 팝인(`computeCutKineticMotionState`), 9:16 쌍선형 RGBA 프레임(`renderMotionTeaserFrameRgba`), 결정적 모노 PCM 효과음 파형(`synthesizeMotionTeaserAudioPcm`)을 생성합니다.
   - `webtoon-tankobon-page.ts`: B5/A5(`1 : 1.414`) 판형 비례, 재단선(Crop/Trim Marks), 우→좌(`rtl-tankobon`: 1우상·2좌상·3우하·4좌하) 및 좌→우(`ltr-manhwa`) 2×2 출판 페이지 조판을 수행합니다.
   - `webtoon-episode-cutsheet.ts`: 최대 32비트(`128컷`)의 다중 4컷 디렉터 스냅샷을 `toonstudio.character-lab.episode-cutsheet/1` 스키마로 직렬화·검증합니다.
2. **브라우저 인코딩 및 리소스 해제 가드 (`webtoon-motion-teaser.browser.ts`)**
   - `HTMLCanvasElement.captureStream` + `AudioContext.createMediaStreamDestination` + `MediaRecorder`(`vp9,opus` / `vp8,opus` / `video/webm`)로 비디오·오디오 스트림을 멀티플렉싱합니다.
   - 완료 또는 예외 발생 시 `finally` 블록에서 `audioSource.stop()`, `audioCtx.close()`, `stream.getTracks().forEach(t => t.stop())`, 모든 임시 캔버스 `width = height = 0` 초기화를 강제해 GPU·오디오 리소스 누수를 차단합니다.

## 3. 핵심 연출 및 오디오 합성 사양
- **스크롤 여백 호흡 연동 타이밍 (`gutterPaces`)**: `compact`(`0.58×`), `standard`(`1.0×`), `dramatic-pause`(`1.75×` + 체류 `+200ms`), `cliffhanger`(`2.35×` + 체류 `+360ms`) 배율이 모바일 오토패닝 뷰어와 9:16 WebM 프레임 스케줄에 동일하게 적용됩니다.
- **컷 진입 말풍선 팝인 & 가독성 보호**: 패닝 이동 중 아직 도달하지 않은 컷의 말풍선은 불투명도 `0`으로 숨겨 스크롤 잔상을 막고, 각 컷의 `dwellStartMs` 진입 첫 `220ms` 동안 스프링 이징(`0.78 → 1.04 → 1.00`)으로 선명하게 등장합니다.
- **효과음 스탬프 미세 진동 & 절차적 사운드 파형 6종**:
  - `두근`(`dugeun`): 심장 고동 2연타 저역 펄스 + 수직 고동 오프셋
  - `스릉`(`seureung`): 금속성 발도 상향 FM 스윕 + 대각선 슬래시 진동
  - `쿠구궁`(`kugugung`): 저주파 지진 서브베이스 진동 + 2축 감쇠 셰이크(`±3.6px`)
  - `팟`(`pat`): 섬광 하모닉 벨 차임 + 상향 임팩트
  - `싸아`(`ssaa`): 결정적 다중 사인 배음 클러스터 밤바람 + 완만한 수평 드리프트
  - `번쩍`(`beonjjeok`): 각성 전기 처프 스윕 + 고속 감쇠 진동
- **성능 벤치마크 영수증 (`receipt.motion`)**: 내보내기 완료 시 총 프레임 수, 프레임당 평균 인코딩 시간(`ms/f`), 피크 래스터·오디오 버퍼 메모리(`MB`), 합성된 효과음 이벤트 수를 영수증에 투명하게 표기합니다.

## 4. Blender 5.3 32종 경량 웹툰 3D 에셋 및 9대 장르 씬 디렉터
- **손 소품 10종 (`webtoon-hand-props-v1`)**: `smartphone`, `coffee-cup`, `case-folder`, `aether-blade`, `imperial-scroll`, `jade-folding-fan`, `calling-card-rose`, `medical-chart-clipboard`, `idol-prism-lightstick`(`564` tris), `varsity-basketball`(`828` tris).
- **머리 액세서리 6종 (`webtoon-head-props-v1`)**: `wire-glasses`, `rofan-tiara`, `tactical-headset`, `pearl-earrings-pin`, `studio-headphones`, `silver-monocle`.
- **배경 스테이지 10종 (`webtoon-stage-props-v1`)**: `cafe-bistro-table`, `academy-desk`, `murim-sword-aura`, `rofan-throne-dais`, `noir-interrogation-lamp`, `rooftop-safety-railing`, `velvet-display-pedestal`, `courtroom-gavel-podium`, `concert-spotlight-mic-stand`(`712` tris), `court-hoop-stanchion`(`312` tris).
- **3D 효과음 스탬프 6종 (`webtoon-sfx-stamps-v1`)**: `seureung`, `dugeun`, `kugugung`, `pat`, `ssaa`, `beonjjeok`.
- **9대 원클릭 장르 씬 디렉터**: 로판 대관식 · 느와르 취조실 · 캠퍼스 카페 · 무협 각성 · 옥상 황혼 독대 · 괴도 달빛 예고장 · 법정/메디컬 진실 공방 · 아이돌 앙코르 무대(`director-idol-encore-stage`) · 학원 코트 결승 라이벌전(`director-varsity-court-rival`).
