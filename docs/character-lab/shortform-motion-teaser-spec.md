# 9:16 숏폼 모션 코믹 티저(WebM) · 다국어 WebVTT 자막 · 단행본 출판 조판 · 에피소드 일괄 배치 명세서

## 1. 개요 및 목적
주간 연재 웹툰 작가와 스튜디오가 단일 4컷 디렉터 세션 및 회차 큐시트(`EpisodeCutsheetStore`)에서 **세로 스크롤 웹툰 원고(4컷 및 장편 `4×N`컷 PNG)**, **5단 투명 분리 후보정 원본(PSD)**, **쪽번호(`Folio`)·책등 제본 여백·재단선 포함 단행본 출판 페이지(Tankobon PNG)**, **효과음 + 무드별 앰비언트 화성 BGM 패드가 믹싱된 9:16 숏폼 모션 코믹 비디오(단일 및 연속 에피소드 WebM)**, **타임코드 동기화 다국어 자막(`WebVTT .vtt`)**, **협업용 스토리보드 연출 큐시트(`.storyboard.md`)**까지 원소스 멀티유즈(OSMU)로 동시 출고하도록 설계된 완결형 파이프라인 명세입니다.

## 2. 아키텍처 경계 및 결정성 계약
1. **순수 도메인 스케줄러·합성기 (`src/export/**`)**
   - `webtoon-motion-teaser.ts`: `Math.random`, `document`, `MediaRecorder`, `AudioContext` 의존성 없이 Node·브라우저 어디서나 동일한 입력에 100% 동일한 프레임 스케줄(`planMotionTeaserSchedule`), 컷 진입 말풍선 팝인(`computeCutKineticMotionState`), 9:16 쌍선형 RGBA 프레임(`renderMotionTeaserFrameRgba`), 결정적 2채널 오디오 믹서(`synthesizeMotionTeaserAudioPcm`), 다국어 `WebVTT` 자막(`buildMotionTeaserWebVtt`)을 생성합니다.
   - `webtoon-tankobon-page.ts`: B5/A5(`1 : 1.414`) 판형 비례, 재단선(Crop/Trim Marks), 우→좌(`rtl-tankobon`) 및 좌→우(`ltr-manhwa`) 2×2 배열, 홀수/짝수 쪽 책등 제본 여백(`bindingSide`: `odd-recto` / `even-verso`), 결정적 3×5 비트맵 쪽번호(`P.01`..`P.999`) 인쇄를 수행합니다.
   - `webtoon-episode-cutsheet.ts`: 최대 32비트(`128컷`)의 다중 4컷 디렉터 스냅샷을 `toonstudio.character-lab.episode-cutsheet/1` 스키마로 직렬화·검증하고, `localStorage` 안전 초안 자동 보존(`try/catch` 격리)을 지원합니다.
   - `webtoon-episode-batch.ts`: 큐시트에 적재된 `N`개 비트를 순회해 단일 PNG 최대 해상도(`4096px`) 자동 클램프 장편 원고(`exportEpisodeCutsheetLongStripPng`), 비트 간 오디오 크로스페이드가 적용된 연속 `9:16` 에피소드 WebM(`exportEpisodeCutsheetMotionWebm`), 누적 타임코드 통합 자막(`exportEpisodeCutsheetWebVtt`), 제작진 공유용 마크다운 리포트(`exportEpisodeStoryboardMarkdown`)를 생성합니다.
2. **브라우저 인코딩 및 리소스 해제 가드 (`webtoon-motion-teaser.browser.ts`)**
   - `HTMLCanvasElement.captureStream` + `AudioContext.createMediaStreamDestination` + `MediaRecorder`(`vp9,opus` / `vp8,opus` / `video/webm`)로 비디오·오디오 스트림을 멀티플렉싱합니다.
   - 완료 또는 예외 발생 시 `finally` 블록에서 `audioSource.stop()`, `audioCtx.close()`, `stream.getTracks().forEach(t => t.stop())`, 모든 임시 캔버스 `width = height = 0` 초기화를 강제해 GPU·오디오 리소스 누수를 차단합니다.

## 3. 핵심 연출·자막 및 2채널 오디오 합성 사양
- **스크롤 여백 호흡 연동 타이밍 (`gutterPaces`)**: `compact`(`0.58×`), `standard`(`1.0×`), `dramatic-pause`(`1.75×` + 체류 `+200ms`), `cliffhanger`(`2.35×` + 체류 `+360ms`) 배율이 모바일 오토패닝 뷰어, 9:16 WebM 프레임 스케줄, `WebVTT` 자막 큐 시각에 동일하게 적용됩니다.
- **무드 연동 절차적 앰비언트 BGM 패드 (`MOOD_AMBIENT_CHORD_HZ`)**:
  - `daylight-paper`: `Fmaj7` (`174.61 / 220.0 / 261.63 / 329.63 Hz`) 포근한 한낮 어쿠스틱 패드
  - `twilight-amber`: `Dm9` (`146.83 / 220.0 / 261.63 / 329.63 Hz`) 노을빛 서정 패드
  - `midnight-noir`: `Cm(maj7)` (`130.81 / 155.56 / 196.0 / 246.94 Hz`) 느와르 미스터리 패드
  - `backlit-awakening`: `Asus2/A5` (`110.0 / 164.81 / 220.0 / 246.94 Hz`) 역광 각성 에테르 패드
  - `-18 dB` 배경 레벨 + 코사인 페이드 인/아웃 + `Math.tanh` 소프트 리미터(`<= 0.95`)로 6종 효과음(`두근`, `스릉`, `쿠구궁`, `팟`, `싸아`, `번쩍`)과 클리핑 없이 믹싱됩니다.
- **다국어 `WebVTT (.vtt)` 접근성 자막**: 한국어(`<v 주연>`, `<v 상대역>`, `<v 내레이션>`), 영어(`<v Lead>`, `<v Partner>`, `<v Narration>`), 일본어(`<v 主演>`, `<v 相手役>`, `<v モノローグ>`) 보이스 태그와 현지화된 효과음 캡션을 생성합니다.
- **스튜디오 단축키**: `Ctrl/Cmd+Shift+Q`(2×2 종합 설정시트 PNG), `Ctrl/Cmd+Shift+M`(9:16 숏폼 WebM 모션 티저), `Ctrl/Cmd+Shift+B`(단행본 4컷 출판 페이지 PNG).

## 4. Blender 5.3 40종 경량 웹툰 3D 에셋(`16,876` tris) 및 12대 완결 장르 씬 디렉터(`12/12 = 100%`)
- **손 소품 13종 (`webtoon-hand-props-v1`, `4,200` tris)**: `smartphone`, `coffee-cup`, `case-folder`, `aether-blade`, `imperial-scroll`, `jade-folding-fan`, `calling-card-rose`, `medical-chart-clipboard`, `idol-prism-lightstick`, `varsity-basketball`, `tactical-medkit-radio`(`132` tris), `artisan-drip-kettle`(`220` tris), `sacred-chalice-wand`(`536` tris).
- **머리 액세서리 8종 (`webtoon-head-props-v1`, `5,384` tris)**: `wire-glasses`, `rofan-tiara`, `tactical-headset`, `pearl-earrings-pin`, `studio-headphones`, `silver-monocle`, `tactical-visor-goggles`(`340` tris), `saintess-halo-crown`(`864` tris).
- **배경 스테이지 13종 (`webtoon-stage-props-v1`, `5,412` tris)**: `cafe-bistro-table`, `academy-desk`, `murim-sword-aura`, `rofan-throne-dais`, `noir-interrogation-lamp`, `rooftop-safety-railing`, `velvet-display-pedestal`, `courtroom-gavel-podium`, `concert-spotlight-mic-stand`, `court-hoop-stanchion`, `apocalypse-supply-barricade`(`88` tris), `atelier-drip-counter`(`164` tris), `sanctuary-altar-pedestal`(`872` tris).
- **3D 효과음 스탬프 6종 (`webtoon-sfx-stamps-v1`, `1,880` tris)**: `seureung`, `dugeun`, `kugugung`, `pat`, `ssaa`, `beonjjeok`.
- **12대 플래그십 캐릭터 100% 매칭 씬 디렉터**: 로판 대관식 · 느와르 취조실 · 캠퍼스 카페 · 무협 각성 · 옥상 황혼 독대 · 괴도 달빛 예고장 · 법정/메디컬 진실 공방 · 아이돌 앙코르 무대 · 학원 코트 결승 라이벌전 · **생존자 전초기지(`director-apocalypse-outpost`)** · **힐링 로스터리 공방(`director-healing-barista-atelier`)** · **신전 성녀 신탁식(`director-sanctuary-oracle`)**.
