# 9:16 숏폼 모션 코믹(WebM) · 무손실 WAV · 다국어 WebVTT · 단행본 출판 풀세트 · 에피소드 배치 명세서

## 1. 개요 및 14종 원소스 멀티유즈(OSMU) 출고 범위
주간 연재 웹툰 작가와 스튜디오가 단일 4컷 디렉터 세션 및 회차 큐시트(`EpisodeCutsheetStore`)에서 다음 **14종의 실무 산출물**을 추가 외부 종속성 없이 결정적으로 동시 출고하도록 설계된 완결형 파이프라인 명세입니다.

1. 단일 투명 컷 PNG (`exportTransparentPng`)
2. 4방향 턴어라운드 설정시트 PNG (`exportTurnaroundSheetPng`)
3. 2×2 종합 캐릭터 설정시트 PNG (`exportQuadReferenceSheetPng`, 단축키 `Ctrl/Cmd+Shift+Q`)
4. 세로 4컷 웹툰 원고 스트립 PNG (`exportWebtoonVerticalStripPng`)
5. 회차 전체 장편 `4×N`컷 세로 스크롤 원고 PNG (`exportEpisodeCutsheetLongStripPng`)
6. 단행본 B5 4컷 내지 출판 페이지 PNG (`exportWebtoonTankobonPagePng`, 재단선·책등 여백·쪽번호 `P.XX`, 단축키 `Ctrl/Cmd+Shift+B`)
7. 단행본 B5 권수 표지 PNG (`exportWebtoonTankobonCoverPng`, `VOL.01`..`VOL.99` 배지·할프톤 망점·오비 타이틀/작가·ISBN 바코드)
8. 단행본 B5 목차 내지 PNG (`exportWebtoonTankobonTocPng`, `CONTENTS` 헤더·비네트·점선 리더·챕터별 `P.03`.. 쪽번호)
9. 단행본 B5 표지·목차 양면 펼침면 교정 대지 PNG (`exportWebtoonTankobonSpreadPng`, 센터 책등 접지선 포함, 단축키 `Ctrl/Cmd+Shift+K`)
10. 9:16 숏폼 모션 코믹 비디오 WebM (`exportWebtoonMotionTeaserWebm` 및 `exportEpisodeCutsheetMotionWebm`, 단축키 `Ctrl/Cmd+Shift+M`)
11. 외부 영상 편집기(Premiere·DaVinci·CapCut) 믹싱용 무손실 `16-bit RIFF WAV` 마스터 음원 (`exportWebtoonMotionAudioWav` 및 `exportEpisodeCutsheetAudioWav`)
12. 타임코드·발화자 동기화 다국어 `WebVTT (.vtt)` 자막 (`exportWebtoonMotionTeaserVtt` 및 `exportEpisodeCutsheetWebVtt`)
13. 제작진 협업용 한국어 스토리보드 연출 큐시트 (`.storyboard.md`) 및 에피소드 큐시트 프로젝트 JSON (`.cutsheet.json`)
14. 5단 만화 연출 분리 레이어 PSD (`exportLayeredPsd`), 3D GLB (`exportGlb`), 캐릭터 레시피 v3 (`.character.json`), SHAPER 프리셋 (`.preset`)

## 2. 아키텍처 경계 및 결정성 계약
1. **순수 도메인 스케줄러·합성기 (`src/export/**`)**
   - `webtoon-motion-teaser.ts`: `Math.random`, `document`, `MediaRecorder`, `AudioContext` 의존성 없이 Node·브라우저 어디서나 동일한 입력에 100% 동일한 프레임 스케줄(`planMotionTeaserSchedule`), 컷 진입 말풍선 팝인(`computeCutKineticMotionState`), 9:16 쌍선형 RGBA 프레임(`renderMotionTeaserFrameRgba`), 결정적 2채널 오디오 믹서(`synthesizeMotionTeaserAudioPcm`), 무손실 `16-bit Little-Endian RIFF WAVE` 인코더(`encodeMonoPcm16Wav`), 다국어 `WebVTT` 자막(`buildMotionTeaserWebVtt`)을 생성합니다.
   - `webtoon-tankobon-page.ts` 및 `webtoon-tankobon-booklet.ts`: B5(`1 : 1.414`) 판형 비례, 재단선(Crop/Trim Marks), 우→좌(`rtl-tankobon`) 및 좌→우(`ltr-manhwa`) 배치, 홀수/짝수 쪽 책등 제본 여백(`odd-recto` / `even-verso`), 3×5 비트맵 권수(`VOL.01`..`VOL.99`)·쪽번호(`P.01`..`P.999`) 인쇄, 표지(`Cover`)·목차(`TOC`)·양면 펼침면(`2-Page Facing Spread`, 단일 PNG 최대 규격 `4096px` 이하 자동 폭 클램프)을 수행합니다.
   - `webtoon-episode-cutsheet.ts` 및 `webtoon-episode-templates.ts`: 최대 32비트(`128컷`) 다중 4컷 스냅샷 추가·제자리 덮어쓰기(`updateBeat`)·순서 이동·`localStorage` 자동 초안 보존을 지원하며, 외부 파일 없이 즉시 테스트 가능한 3종의 내장 템플릿(`template-12genre-omnibus-48cuts`, `template-trilogy-climax-12cuts`, `template-ja-tankobon-8cuts`) 및 정적 샘플 에셋(`public/assets/samples/flagship-12genre-48cuts.cutsheet.json`)을 제공합니다.
   - `webtoon-episode-batch.ts`: 큐시트 `N`개 비트를 순회해 장편 원고 PNG, 비트 간 오디오 크로스페이드가 적용된 연속 `9:16` 에피소드 WebM, 무손실 통합 에피소드 `.wav`, 누적 타임코드 통합 `.vtt`, 제작진 공유용 `.storyboard.md`를 생성합니다.
2. **브라우저 인코딩 및 리소스 해제 가드 (`webtoon-motion-teaser.browser.ts`)**
   - `HTMLCanvasElement.captureStream` + `AudioContext.createMediaStreamDestination` + `MediaRecorder`(`vp9,opus` / `vp8,opus` / `video/webm`)로 비디오·오디오 스트림을 멀티플렉싱합니다.
   - 완료 또는 예외 발생 시 `finally` 블록에서 `audioSource.stop()`, `audioCtx.close()`, `stream.getTracks().forEach(t => t.stop())`, 모든 임시 캔버스 `width = height = 0` 초기화를 강제해 GPU·오디오 리소스 누수를 차단합니다.

## 3. 핵심 연출·자막·음원 및 스튜디오 단축키 사양
- **스크롤 여백 호흡 연동 타이밍 (`gutterPaces`)**: `compact`(`0.58×`), `standard`(`1.0×`), `dramatic-pause`(`1.75×` + 체류 `+200ms`), `cliffhanger`(`2.35×` + 체류 `+360ms`) 배율이 모바일 오토패닝 뷰어, 9:16 WebM 프레임 스케줄, 무손실 `.wav` 마스터, `WebVTT` 자막 큐 시각에 동일하게 적용됩니다.
- **무드 연동 절차적 앰비언트 BGM 패드 (`MOOD_AMBIENT_CHORD_HZ`)**:
  - `daylight-paper`: `Fmaj7` (`174.61 / 220.0 / 261.63 / 329.63 Hz`) 포근한 한낮 어쿠스틱 패드
  - `twilight-amber`: `Dm9` (`146.83 / 220.0 / 261.63 / 329.63 Hz`) 노을빛 서정 패드
  - `midnight-noir`: `Cm(maj7)` (`130.81 / 155.56 / 196.0 / 246.94 Hz`) 느와르 미스터리 패드
  - `backlit-awakening`: `Asus2/A5` (`110.0 / 164.81 / 220.0 / 246.94 Hz`) 역광 각성 에테르 패드
  - `-18 dB` 배경 레벨 + 코사인 페이드 인/아웃 + `Math.tanh` 소프트 리미터(`0.95` 이하)로 6종 효과음(`두근`, `스릉`, `쿠구궁`, `팟`, `싸아`, `번쩍`)과 클리핑 없이 믹싱됩니다.
- **스튜디오 단축키**: `Ctrl/Cmd+Shift+Q`(2×2 종합 설정시트 PNG), `Ctrl/Cmd+Shift+M`(9:16 숏폼 WebM 모션 티저), `Ctrl/Cmd+Shift+B`(단행본 4컷 출판 페이지 PNG), `Ctrl/Cmd+Shift+K`(단행본 표지·목차 양면 펼침면 PNG).

## 4. Blender 5.3 40종 경량 웹툰 3D 에셋(`16,876` tris) 및 12대 완결 장르 씬 디렉터(`12/12 = 100%`)
- **손 소품 13종 (`webtoon-hand-props-v1`, `4,200` tris)**: `smartphone`, `coffee-cup`, `case-folder`, `aether-blade`, `imperial-scroll`, `jade-folding-fan`, `calling-card-rose`, `medical-chart-clipboard`, `idol-prism-lightstick`, `varsity-basketball`, `tactical-medkit-radio`(`132` tris), `artisan-drip-kettle`(`220` tris), `sacred-chalice-wand`(`536` tris).
- **머리 액세서리 8종 (`webtoon-head-props-v1`, `5,384` tris)**: `wire-glasses`, `rofan-tiara`, `tactical-headset`, `pearl-earrings-pin`, `studio-headphones`, `silver-monocle`, `tactical-visor-goggles`(`340` tris), `saintess-halo-crown`(`864` tris).
- **배경 스테이지 13종 (`webtoon-stage-props-v1`, `5,412` tris)**: `cafe-bistro-table`, `academy-desk`, `murim-sword-aura`, `rofan-throne-dais`, `noir-interrogation-lamp`, `rooftop-safety-railing`, `velvet-display-pedestal`, `courtroom-gavel-podium`, `concert-spotlight-mic-stand`, `court-hoop-stanchion`, `apocalypse-supply-barricade`(`88` tris), `atelier-drip-counter`(`164` tris), `sanctuary-altar-pedestal`(`872` tris).
- **3D 효과음 스탬프 6종 (`webtoon-sfx-stamps-v1`, `1,880` tris)**: `seureung`, `dugeun`, `kugugung`, `pat`, `ssaa`, `beonjjeok`.
- **12대 플래그십 캐릭터 100% 매칭 씬 디렉터**: 로판 대관식 · 느와르 취조실 · 캠퍼스 카페 · 무협 각성 · 옥상 황혼 독대 · 괴도 달빛 예고장 · 법정/메디컬 진실 공방 · 아이돌 앙코르 무대 · 학원 코트 결승 라이벌전 · 생존자 전초기지(`director-apocalypse-outpost`) · 힐링 로스터리 공방(`director-healing-barista-atelier`) · 신전 성녀 신탁식(`director-sanctuary-oracle`).
