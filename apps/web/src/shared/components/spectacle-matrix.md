# 테마×표면 스크린샷 매트릭스 (S3-15, BLUEPRINT §6.6)

시각 회귀를 눈이 아니라 격자로 잡기 위한 검수 매트릭스. S3-16~S3-18이 그대로 재사용한다.

## 격자

| 축 | 값 |
|---|---|
| 테마 (9) | aurora · blossom · starlight · dark · light · graphite · midnight · sepia · contrast |
| 표면 셀 (3) | SpectacleHero(아트 없음=스펙트럼 타이포 커버) · CoverCard×5(틴트 슬롯: 장르/경로/단계/카테고리/기본) · 토큰 스와치(gradient·glow·elevation) |
| 뷰포트 (3) | 360×740 (모바일) · 768×1024 (태블릿) · 1440×900 (데스크톱) |
| 상태 | 기본 · forced-colors 에뮬레이션 · prefers-reduced-motion 에뮬레이션 |

총 27장(테마×뷰포트) + 상태 변형은 contrast·starlight 2개 테마만 추가 캡처한다.

## 캡처 절차

1. `spectacle-matrix.html`을 정적 서버로 연다 (레포 루트에서 `python3 -m http.server` 후
   `/apps/web/src/shared/components/spectacle-matrix.html?theme=aurora` 접속 — 상대 경로로 실제
   `unified-theme-contract.css`·`spectacle.css`를 읽으므로 파일 위치를 옮기지 않는다).
2. 테마 9종 × 뷰포트 3종으로 전문(full page) 캡처한다. 파일명: `matrix/<theme>-<width>.png`.
3. 상태 변형: contrast·starlight에서 forced-colors·reduced-motion을 에뮬레이션해 각 1장.

## 판정 기준 (§6.4 경계)

- 아트 위 텍스트 대비: 본문 4.5:1, 큰 글자 3:1 (스크림 토큰 경유).
- 화면당 글로우 CTA 1개, 그라디언트 텍스트는 히어로 강조(em) 1곳만.
- forced-colors에서 아트·글로우·그라디언트가 사라지고 시스템 색으로 대체된다.
- 어떤 테마에서도 토큰 스와치가 비거나(미정의 변수) 레이아웃이 깨지지 않는다.
- 홈 실표면 회귀는 별도로 `/` 홈을 같은 테마·뷰포트로 캡처해 히어로가 부품 교체 전과
  시각 동등(±의도된 개선)인지 대조한다 — 기준 캡처는 PR 전 main 홈이다.
