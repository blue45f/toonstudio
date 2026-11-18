# 세로 스크롤 호흡 연동 9:16 숏폼 모션 코믹 티저(WebM) 내보내기 기능 명세 및 실행 로드맵

## 1. 기획 배경 및 해결 과제

웹툰 원고의 독자 몰입을 결정짓는 핵심 장치는 단일 컷의 작화 밀도뿐 아니라 **컷과 컷 사이 여백(`gutterPaces`)이 만드는 스크롤 체류 시간**입니다. 그러나 기존 창작 도구에서는 정지된 합본 PNG만 저장할 수 있어 다음 두 가지 병목이 반복되었습니다.

- **스크롤 호흡 사전 검수 단절**: 빠른 템포(`0.58×`), 표준(`1.0×`), 서스펜스(`1.75×`), 클리프행어(`2.35×`) 여백이 스마트폰 화면에서 어떤 리듬으로 읽히는지 파일 저장 후 별도 뷰어로 옮겨야만 확인할 수 있었습니다.
- **홍보용 숏폼 티저 이중 제작 비용**: 신작 공개나 회차 예고용 9:16 세로형 영상(Instagram Reels, YouTube Shorts, TikTok)을 만들기 위해 이미 완성된 4컷 스트립을 영상 편집 툴로 다시 불러와 수동으로 패닝·홀드 키프레임을 찍어야 했습니다.

본 명세는 캐릭터 랩의 **세로 4컷 스트립 합성기(`composeWebtoonVerticalStrip`)**와 **스크롤 호흡 오토패닝 타임라인(`computeStripAutoPanTimeline`)**을 단일 파이프라인으로 결합해, 별도 외부 서버나 영상 편집기 없이 브라우저에서 즉시 **9:16 숏폼 모션 코믹 비디오(`WebM`)**를 생성·저장하는 아키텍처와 단계별 로드맵을 정의합니다.

## 2. 시스템 아키텍처 및 데이터 흐름

파이프라인은 도메인 순수성(`src/architecture.test.ts` 경계 계약)을 지키기 위해 **순수 CPU 프레임 합성 코어(`webtoon-motion-teaser.ts`)**와 **브라우저 스트림 인코더(`webtoon-motion-teaser.browser.ts`)** 2계층으로 분리됩니다.

```
[StripDirectorState]
  ├─ gutterPaces (0.58× / 1.0× / 1.75× / 2.35×)
  ├─ manuscriptMood (daylight-paper / twilight-amber / midnight-noir / backlit-awakening)
  ├─ screentones (45° 할프톤 망점 5종) + mangaFx (KO·EN·JA / 세로쓰기 Tategaki)
  └─ actingArc (4컷 표정·시선·목 회전 연기 시퀀스)
        │
        ▼
1. 4컷 캡처 및 스트립 래스터 합성 (`captureWebtoonVerticalStripRaster`)
   - 4개 카메라 구도(더치 틸트 ±9° 포함) 순차 렌더링 후 basePlan 결정적 복원
        │
        ▼
2. 결정적 프레임 스케줄링 (`planMotionTeaserSchedule`)
   - `computeStripAutoPanTimeline(layout, gutterPaces)` 기반 전체 재생 길이 산출
   - 재생 배속(`0.75×` / `1.0×` / `1.5×`) 및 목표 FPS(`24` 기본, `12..30` 클램프)로 타임스탬프 배열 생성
        │
        ▼
3. 9:16 프레임 합성 (`renderMotionTeaserFrameRgba`)
   - 출력 규격: `540×960` (표준 프리뷰·경량 공유) 또는 `720×1280` (HD 숏폼 규격)
   - `sampleAutoPanScrollState(timeline, elapsedMs)`로 수직 카메라 창(`srcY`) 보간
   - 컷 체류(`dwell`) 구간 내 미세 포커스 호흡 줌(`1.000` → `1.028`) 및 하단 진행 바 합성
        │
        ▼
4. 브라우저 WebM 인코딩 및 리소스 해제 (`encodeMotionTeaserWebmBrowser`)
   - `HTMLCanvasElement.captureStream` + `MediaRecorder` (`vp9` → `vp8` → `video/webm`)
   - EBML 매직 헤더(`0x1A45DFA3`) 검증 후 `.webm` 바이트 반환
   - `finally` 블록에서 트랙 정지 및 `canvas.width = 0; canvas.height = 0` 즉시 해제
```

## 3. 핵심 기술 계약 및 품질 게이트

| 구분 | 설계 규약 | 검증 기준 |
| :--- | :--- | :--- |
| **해상도 규격** | 9:16 세로형 `540×960`(기본) · `720×1280`(HD) | 출력 종횡비 `9:16` 정확 일치 및 원고 여백 색온도(`stripMarginRgb`) 패딩 |
| **결정성 보장** | `Math.random` 무사용, 동일 레시피·여백 입력 시 동일 타임스탬프·RGBA 산출 | `planMotionTeaserSchedule` 및 `renderMotionTeaserFrameRgba` 순수 단위 검증 |
| **메모리·GPU 가드** | 인코딩 종료·실패 즉시 미디어 트랙 종료 및 캔버스 버퍼 `0×0` 축소 | 언마운트·예외 경로에서도 잔류 타이머 및 오프스크린 버퍼 누수 `0`건 |
| **코덱 폴백 및 가시적 실패** | `video/webm;codecs=vp9` → `vp8` → `video/webm` 순차 협상 | 미지원 환경에서 무음 무시 없이 `LabFailure("motion-webm-unsupported")` 반환 |
| **다국어·만화 연출 호환** | 할프톤 망점(`-tone`), 연기 아크(`-acting`), 일본어 세로쓰기(`-ja-tategaki`) 보존 | 출력 파일명(`character-<digest8>-540x960-webtoon-4cut...-teaser.webm`) 자동 태깅 |

## 4. UI/UX 동선 설계

[unslop](https://github.com/heydamir/unslop) (Damir Sokolovsky, CC BY 4.0) 4px 밀도 그리드와 한국어 단어 보존(`word-break: keep-all`) 원칙에 맞춰 두 진입점을 제공합니다.

1. **내보내기 패널 직접 실행 (`data-testid="export-webtoon-motion-webm"`)**: `세로 4컷 웹툰 스트립 PNG 저장` 및 `모바일 스크롤·오토패닝 미리보기` 버튼 바로 옆에서 원클릭으로 9:16 WebM 모션 티저를 렌더링·다운로드합니다.
2. **모바일 오토패닝 뷰어 내부 즉시 저장 (`data-testid="webtoon-reader-export-webm"`)**: 뷰어에서 `0.75×` / `1.0×` / `1.5×` 배속으로 스크롤 호흡을 눈으로 확인한 직후, 현재 선택한 배속 그대로 9:16 WebM 티저를 즉시 추출합니다.

## 5. 단계별 실행 로드맵

- **Phase 1 — 클라이언트 무서버 9:16 WebM 모션 코믹 티저 내보내기 (현재 구현 완료)**:
  - `gutterPaces` 연동 오토패닝 카메라 트랙, 컷 체류 미세 줌, 시간대 색온도 여백 매칭, 하단 진행 게이지, `MediaRecorder` 기반 `.webm` 인코딩 및 모바일 리더 뷰어 배속 연동을 제공합니다.
- **Phase 2 — WebCodecs `VideoEncoder` 고속 비실시간 MP4(H.264) 멀티플렉싱**:
  - 실시간 재생 대기 없이 프레임 배열을 하드웨어 가속 `VideoEncoder`로 고속 인코딩해 iOS Safari 및 모바일 메신저 호환 `.mp4` 컨테이너를 병행 지원합니다.
- **Phase 3 — 효과음(SFX) 오디오 스탬프 싱크 및 다회차 예고편 배치 렌더링**:
  - 각 컷의 오노마토페 스탬프(`스릉`, `두근`, `쿠구궁`, `번쩍`) 진입 시점에 WebAudio 효과음 트랙을 자동 믹싱하고, 여러 4컷 스트립을 이어 붙여 15~30초 분량의 정식 런칭 트레일러를 생성합니다.
