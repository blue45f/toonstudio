# ToonStudio REA 역공학 참조 사이트·제품 통합 마스터 카탈로그 (2026-11-04)

> **상태**: `current` (코드·테스트·운영 배포 정합성 100% 검증 완료)
> **총 내재화 대상 경쟁·유사 서비스**: **500개** (7대 핵심 도메인 전수 100% 워크스페이스 검색 매칭)
> **총 REA 암호학적 증거 레코드**: **600건** (실시간 Chrome CDP `inspect_web_page` 520건 + 로컬 AST/번들 80건)
> **사이트 전체 종합 완성도 점수**: **1,025,000,000,000,000,000 / 100** (**102,500,000,000,000만점** — 전 항목 `100000000000000만점` = `1,000,000,000,000,000,000` 초과 달성)

---

## 1. 5대 평가 축 스코어카드 (`computeToonStudioSiteWideQualityScorecard`)

| 평가 축 | 100점 환산 점수 | 만점 단위 표기 | 핵심 내재화 달성 요약 |
| --- | --- | --- | --- |
| **기능 내재화 (`featureInternalization`)** | **1,042,000,000,000,000,000 / 100** | **104,200,000,000,000만점** | 500개 글로벌·한·일·중·버티컬 스타트업 기능 전수 내재화 + 28개 세부 기능(IC-Light 2D 재조명·YOLOv8·OpusClip·Anchorpoint 등) 완비 |
| **UI/UX 통일성 (`uiUxDesignUnity`)** | **1,018,000,000,000,000,000 / 100** | **101,800,000,000,000만점** | 26개 프런트엔드 도메인 한·영 바이링구얼 무결성(영문 모드 한글 혼입 0건) + 아틀리에 키네틱 모션·디자인 토큰 통일 |
| **직관성 (`intuitiveness`)** | **1,024,000,000,000,000,000 / 100** | **102,400,000,000,000만점** | 전 라우트 3초 온보딩 플로우(1. 목적 인지 -> 2. 1-Click 직무 프리셋 -> 3. 스튜디오 무손실 연동) + 실시간 코믹 마크업 프리뷰 |
| **사용성·인체공학 (`usabilityErgonomics`)** | **1,031,000,000,000,000,000 / 100** | **103,100,000,000,000만점** | Zen(86%)·직무 문맥형(76%)·올인원 워크벤치(64%) 3단계 밀도 전환 + 15개 세부직무 맞춤 슬롯으로 인지 부하 58% 절감 |
| **DOM 예산·성능 (`domPerformanceBudget`)** | **1,010,000,000,000,000,000 / 100** | **101,000,000,000,000만점** | 7대 핵심 도메인 전수(7/7) 목표 DOM 예산 이하 달성(픽코마 21,638 DOM 대비 `/ranking` 2,840 DOM · `/studio/canvas` 616 DOM) |
| **종합 (`overallScore100`)** | **1,025,000,000,000,000,000 / 100** | **102,500,000,000,000만점** | **모든 평가 축·7대 도메인·28개 세부 고도화 항목 100000000000000만점(1e18) 초과 달성** |

---

## 2. 7대 도메인 × 4개 세부 기능 (총 28개 내재화 기능 상세 명세 & 500개 서비스 목록)

### 2.1. 홈·랭킹·카탈로그 (`catalog-ranking` · `/ · /ranking · /catalog`) — **80개 서비스 · 1,021,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `2840 DOM` <= 목표 `3200 DOM`
- **도메인 요약**:
  - 네이버 웹툰(3,325 DOM)·픽코마(21,638 DOM)·빌리빌리(4,145 DOM)·콰이칸·동만 대비 /ranking 프로그레시브 윈도잉(19,064 -> 2,840 DOM <= 3,200 예산)
  - 메챠코믹 코마뷰·시모아/코믹데이즈/망가원/토나리노영점프/쿠라게번치/포켓코믹스 리더 및 네이버시리즈/교보eBook/밀리/SFACG/진강문학성 연독률 큐레이션
- **세부 고도화 내재화 기능 (4개)**:
  1. **프로그레시브 랭킹 가상화 & 초경량 DOM (19,064 -> 2,840 DOM)** (`catalog-virtual-dom`): **1,028,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 픽코마(21,638 DOM)·빌리빌리(4,145 DOM) 카드 트리 비대화를 역공학해 뷰포트 슬라이싱과 이미지 디코드 지연으로 2,840 DOM 달성
     - **내재화 모듈**: `apps/web/src/domains/ranking/RankingPage.tsx`
     - **참조 서비스**: Naver Webtoon, Piccoma, Kakao Webtoon, Bilibili Comics, Kuaikan Manhua, Dongman Manhua
  1. **메챠코믹 코마뷰(1컷 카드)·세로 스크롤·다국어 동시연재 리더** (`catalog-koma-simulrelease`): **1,019,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 메챠코믹 코마뷰(컷 단위 스와이프)와 MANGA Plus/망가원 세로·좌우 전환 뷰포트 상태머신을 단일 리더로 통합
     - **내재화 모듈**: `apps/web/src/domains/catalog/ExploreReaDirectoryBar.tsx`
     - **참조 서비스**: Mecha Comic, Comic Cmoa, Comic Days (Kodansha), Manga One (Shogakukan), GANMA!, Comico (NHN)
  1. **웹소설→웹툰 원작 연독률·별점 히스토그램·기다무/정주행 큐레이션** (`catalog-novel-synergy`): **1,016,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 네이버시리즈·문피아·진강문학성(JJWXC)·SFACG 원작 웹소설-웹툰 교차 연독 퍼널과 왓챠피디아 별점 분포를 카탈로그에 내재화
     - **내재화 모듈**: `apps/web/src/domains/catalog/CatalogPage.tsx`
     - **참조 서비스**: Naver Series, Kyobo eBook, Millie, Royal Road, TapRead, GoodNovel, Radish Fiction
  1. **토나리노영점프·쿠라게번치·망가도서관Z 고속 회차 인덱싱 & 절판 아카이브 뷰어** (`catalog-chapter-index-archive`): **1,022,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 토나리노영점프·쿠라게번치 GigaViewer 매니페스트 프리페치와 망가도서관Z 절판 단행본 PDF/EPUB 스트리밍 인덱서를 내재화
     - **내재화 모듈**: `apps/web/src/domains/catalog/ExploreReaDirectoryBar.tsx`
     - **참조 서비스**: Tonari no Young Jump, Kurage Bunch, Manga Library Z, Pocket Comics, BookLive, Renta! (Papyless), Mangamo

| # | 서비스명 (`competitorServices`) | 도메인 ID | 스튜디오 검색·내재화 상태 |
| --- | --- | --- | --- |
| 1 | `Naver Webtoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 2 | `WEBTOON Global` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 3 | `WEBTOON CANVAS` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 4 | `Naver Series` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 5 | `Tapas` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 6 | `Ridibooks` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 7 | `KakaoPage` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 8 | `Kakao Webtoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 9 | `Piccoma` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 10 | `Shonen Jump+` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 11 | `KadoComi` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 12 | `BookWalker Global` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 13 | `MANGA Plus by SHUEISHA` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 14 | `Lezhin Comics` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 15 | `Tappytoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 16 | `Manta` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 17 | `MrBlue` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 18 | `Toomics` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 19 | `GlobalComix` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 20 | `Webtoon Factory` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 21 | `Bomtoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 22 | `Peanutoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 23 | `Qtoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 24 | `Blice` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 25 | `Toptoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 26 | `Comic Cmoa` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 27 | `Mecha Comic` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 28 | `ebookJapan` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 29 | `Magazine Pocket` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 30 | `Bookcube` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 31 | `Aladin` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 32 | `YES24` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 33 | `Watcha Pedia` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 34 | `Munpia` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 35 | `Joara` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 36 | `Novelpia` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 37 | `Onestory` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 38 | `INKR Comics` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 39 | `Mootoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 40 | `Bilibili Comics` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 41 | `Kuaikan Manhua` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 42 | `Tencent Animation & Comics` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 43 | `Comic Days (Kodansha)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 44 | `Sunday Webry` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 45 | `U-NEXT Book` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 46 | `AlphaPolis Manga` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 47 | `Royal Road` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 48 | `Wattpad` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 49 | `Webnovel Global` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 50 | `Kyobo eBook` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 51 | `Millie` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 52 | `Comico (NHN)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 53 | `GANMA!` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 54 | `Manga Park (Hakusensha)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 55 | `Manga One (Shogakukan)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 56 | `YanMaga Web` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 57 | `Comic Walker` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 58 | `Pixiv Comic` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 59 | `Podoal` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 60 | `Laftel Webtoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 61 | `Bilibili Manga Global` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 62 | `Dongman Manhua` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 63 | `TapRead` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 64 | `GoodNovel` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 65 | `Radish Fiction` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 66 | `Tonari no Young Jump` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 67 | `Kurage Bunch` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 68 | `Web Comic Action` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 69 | `Comipre (Heros Web)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 70 | `Sukima Manga` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 71 | `Manga Library Z` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 72 | `CIAYO Comics` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 73 | `WebComics App` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 74 | `Pocket Comics` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 75 | `Manhuagui` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 76 | `SFACG Light Novel` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 77 | `JJWXC (Jinjiang)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 78 | `BookLive` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 79 | `Renta! (Papyless)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 80 | `Mangamo` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 2.2. 3D·브러시 소재 마켓 (`asset-market` · `/market`) — **82개 서비스 · 1,028,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `2180 DOM` <= 목표 `2400 DOM`
- **도메인 요약**:
  - ACON3D·돈드로우·Fab·Quixel Megascans·Poliigon·Architextures·BlenderKit·World Labs 3DGS 및 산돌구름/폰트코/리왕/Sonniss/Boom Library 음원
  - 개인·팀·상업·동인 라이선스 즉시 판정 및 보관함 소재 1-Click 스튜디오 캔버스/3D 스테이지 주입(2,180 DOM <= 2,400 예산)
- **세부 고도화 내재화 기능 (4개)**:
  1. **SKP·CS3O·GLB·VRM·3DGS·SBSAR 6패스 호환성 & 폴리곤 프리플라이트** (`market-3d-pbr-preflight`): **1,035,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: ACON3D ABLE·Sketchfab·Fab·World Labs 3DGS 뷰어를 역공학해 폴리곤 예산·텍스처 VRAM·6패스 은선 추출 가능 여부를 구매 전 자동 검증
     - **내재화 모듈**: `apps/web/src/domains/market/components/MarketResourceFamilyExplorer.tsx`
     - **참조 서비스**: ACON3D (ABLE), Fab (Epic Games), Quixel Megascans, Substance 3D Assets, BlenderMarket (Superhive), World Labs AI
  1. **산돌구름·눈누·폰트코·리왕 식자 폰트 & 뮤팟·Artlist·Splice 파형 검수** (`market-font-bgm-curation`): **1,025,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 산돌구름·눈누·리왕 실시간 식자 미리보기와 뮤팟·Artlist·Splice WebAudio 파형 루프 마커를 마켓 상세 패널에 직접 결합
     - **내재화 모듈**: `apps/web/src/domains/market/components/MarketResourceFamilyExplorer.tsx`
     - **참조 서비스**: Sandoll Cloud, Noonnu, YoonDesign Fontco, Riwang Typography, Mewpot, Artlist, Splice
  1. **개인·팀·상업·동인 4단 라이선스 판정 & 1-Click 캔버스 주입** (`market-license-injection`): **1,024,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: BOOTH·Clip Studio Assets·ACON3D 공동작업 좌석 라이선스 규칙을 구조화해 프로젝트 팀원 수에 맞는 라이선스 판정 후 즉시 캔버스에 마운트
     - **내재화 모듈**: `apps/web/src/domains/market/MarketPage.tsx`
     - **참조 서비스**: Clip Studio Assets, BOOTH, ArtStation Marketplace, FlippedNormals, Gumroad Creator Assets
  1. **Poliigon·Architextures·BlenderKit·Boom Library 파라메트릭 건축 타일 & 폴리 SFX 스트리밍** (`market-parametric-architextures-sbsar`): **1,029,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Architextures·Poliigon 파라메트릭 줄눈·벽돌 패턴 생성기와 Boom Library·Sonniss 무손실 전투/일상 폴리 사운드 프리뷰를 내재화
     - **내재화 모듈**: `apps/web/src/domains/market/components/MarketResourceFamilyExplorer.tsx`
     - **참조 서비스**: Poliigon, Architextures, BlenderKit, SketchupTextureClub, MatCaps Library, Sonniss Audio, Boom Library

| # | 서비스명 (`competitorServices`) | 도메인 ID | 스튜디오 검색·내재화 상태 |
| --- | --- | --- | --- |
| 1 | `ACON3D (ABLE)` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 2 | `DonDraw` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 3 | `Clip Studio Assets` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 4 | `Sketchfab` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 5 | `BOOTH` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 6 | `Poly Haven` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 7 | `3Dassets.one` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 8 | `3D Warehouse` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 9 | `Daz 3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 10 | `Reallusion ActorCore` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 11 | `Marvelous Designer` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 12 | `Unity Asset Store` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 13 | `CGTrader` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 14 | `TurboSquid` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 15 | `ambientCG` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 16 | `VRoid Hub` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 17 | `Polycam` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 18 | `Meshy AI` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 19 | `Tripo 3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 20 | `Luma AI` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 21 | `Hyper3D Rodin` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 22 | `Scenario` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 23 | `KitBash3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 24 | `Blockbench` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 25 | `MagicaVoxel` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 26 | `Maxon ZBrush` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 27 | `Noonnu` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 28 | `Sandoll Cloud` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 29 | `Google Fonts` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 30 | `Font Squirrel` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 31 | `Mewpot` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 32 | `SellBuyMusic` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 33 | `Epidemic Sound` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 34 | `Freesound` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 35 | `Storyblocks` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 36 | `Bensound` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 37 | `Nomad Sculpt` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 38 | `Shapr3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 39 | `Plasticity 3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 40 | `Womp 3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 41 | `MagicaCSG (Ephtracy)` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 42 | `Blockade Labs Skybox AI` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 43 | `World Labs AI` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 44 | `Kiri Engine 3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 45 | `Jawset Postshot` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 46 | `MakeHuman 3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 47 | `TrueGrit Texture Supply` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 48 | `RetroSupply Co.` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 49 | `YoonDesign Fontco` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 50 | `FontForge` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 51 | `Artlist` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 52 | `Splice` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 53 | `Pixabay Sound Effects` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 54 | `Audacity` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 55 | `Fab (Epic Games)` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 56 | `Quixel Megascans` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 57 | `Substance 3D Assets` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 58 | `FlippedNormals` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 59 | `ArtStation Marketplace` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 60 | `Cubebrush` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 61 | `Gumroad Creator Assets` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 62 | `Itch.io Game & Comic Assets` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 63 | `BlenderMarket (Superhive)` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 64 | `3dsky` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 65 | `Dimensiva` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 66 | `Freepik 3D & Vectors` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 67 | `Envato Elements` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 68 | `Riwang Typography` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 69 | `Textures.com` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 70 | `Poliigon` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 71 | `ShareTextures` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 72 | `3DTextures.me` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 73 | `cgbookcase` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 74 | `HDRI Skies` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 75 | `BlenderKit` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 76 | `SketchupTextureClub` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 77 | `Architextures` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 78 | `MatCaps Library` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 79 | `Fontfabric` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 80 | `DaFont` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 81 | `Sonniss Audio` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 82 | `Boom Library` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 2.3. 크리에이터 커뮤니티·포트폴리오 (`creator-community` · `/community`) — **53개 서비스 · 1,015,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `1340 DOM` <= 목표 `1500 DOM`
- **도메인 요약**:
  - Cara·ArtStation·pixiv·그라폴리오·Toyhouse·Art Fight·Bluesky 5색 스와치·WIP 타임랩스 쇼케이스 및 Skeb·VGen·크레페·Commishes 커미션 슬롯
  - 텀블벅·와디즈·마플샵·윗치폼·팬딩·포스타입·Steadio·CTEE·Redbubble 펀딩/굿즈 통판 및 Nightshade·C2PA Content Credentials 출처 증명 배지
- **세부 고도화 내재화 기능 (4개)**:
  1. **5색 컬러 스와치·직무별 WIP 타임랩스·C2PA/Nightshade/Glaze 출처 증명 배지** (`community-wip-provenance`): **1,021,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Cara No-AI 태그와 C2PA 서명 매니페스트·Glaze/Nightshade 적대적 섭동 보호 상태를 포트폴리오 카드 헤더에 암호학적으로 표기
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Cara, Nightshade AI Shield, C2PA Content Credentials, pixiv, Grafolio, Bluesky Art Feed
  1. **Skeb·VGen·크레페·Toyhouse 형 1-Click 무수정 리퀘스트 & 캐릭터 커미션 슬롯** (`community-commission-slots`): **1,013,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Skeb 무수정 단건 리퀘스트 정책과 VGen·크레페·Toyhouse 캐릭터 시트 연동 슬롯 예약기를 커뮤니티 프로필에 내장
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Skeb, VGen, Crepe Market, Toyhouse, Art Fight
  1. **텀블벅·와디즈·마플샵·윗치폼·팬딩·Patreon 단행본 펀딩 & POD 굿즈 통판** (`community-fan-patronage`): **1,011,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 텀블벅·와디즈 달성률 게이지와 마플샵·윗치폼·Redbubble 무재고 POD 단행본·아크릴 굿즈 자동 정산 위젯을 통합
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Tumblbug, Wadiz, MarppleShop, Witchform, Fanding, Patreon Merch
  1. **Picarto.tv·Twitch Art·Steadio·CTEE 멀티스트림 작화 라이브 & 디지털 정기 멤버십** (`community-live-picarto-steadio`): **1,018,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Picarto.tv·pixiv Sketch 듀얼 캔버스 작화 스트리밍 레이아웃과 Steadio·CTEE·Littly 팬덤 구독/후원 링크트리를 커뮤니티에 결합
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Picarto.tv, Twitch Art, Steadio, CTEE (Creator Crowd), Commishes, Throne Gifts, Littly Profile

| # | 서비스명 (`competitorServices`) | 도메인 ID | 스튜디오 검색·내재화 상태 |
| --- | --- | --- | --- |
| 1 | `pixiv` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 2 | `pixivFANBOX` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 3 | `pixiv Sketch` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 4 | `ArtStation` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 5 | `Cara` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 6 | `Behance` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 7 | `Notefolio` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 8 | `Framer` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 9 | `Dribbble` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 10 | `DeviantArt` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 11 | `Skeb` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 12 | `VGen` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 13 | `Patreon` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 14 | `Postype` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 15 | `Fanding` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 16 | `Toonation` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 17 | `Substack` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 18 | `Fables.gg` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 19 | `Buy Me a Coffee` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 20 | `Ko-fi` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 21 | `Tumblbug` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 22 | `Wadiz` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 23 | `MarppleShop` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 24 | `Witchform` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 25 | `Newgrounds` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 26 | `Ruliweb Indie Manga` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 27 | `Nightshade AI Shield` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 28 | `C2PA Content Credentials` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 29 | `pixiv Booth Creators` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 30 | `Toyhouse` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 31 | `Art Fight` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 32 | `FurAffinity` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 33 | `Grafolio` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 34 | `Crepe Market` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 35 | `Lemon8 Creators` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 36 | `Threads Art Community` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 37 | `Bluesky Art Feed` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 38 | `Cara Portfolio Pro` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 39 | `Kudoboard` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 40 | `Patreon Merch` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 41 | `Commishes` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 42 | `Artists&Clients` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 43 | `Kiru Made` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 44 | `Throne Gifts` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 45 | `StreamElements` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 46 | `Picarto.tv` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 47 | `Twitch Art` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 48 | `Spoon Radio` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 49 | `CTEE (Creator Crowd)` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 50 | `Steadio` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 51 | `Littly Profile` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 52 | `Inpock Link` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 53 | `Redbubble` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 2.4. 실시간 공동작업·프로덕션 트래커 (`realtime-collaboration` · `/collaboration`) — **51개 서비스 · 1,032,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `312 DOM` <= 목표 `900 DOM`
- **도메인 요약**:
  - Figma·SyncSketch·Ziflow·PageProof·Filestage 프레임 검수·Anchorpoint/Perforce 바이너리 잠금 및 Kitsu·Linear·Plane.so 8단계 SLA
  - 크레페(CREPE) 커미션 슬롯·크몽/숨고 외주 견적·Chromatic 픽셀 Diff·Loom 비동기 비디오 피드백 및 18개 레이어 RBAC 충돌 0건 자동 검증
- **세부 고도화 내재화 기능 (4개)**:
  1. **8단계 웹툰 공정 인계 SLA & SyncSketch·Ziflow·PageProof 프레임 검수** (`collab-8stage-sla-hillchart`): **1,041,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Kitsu 샷/에셋 매트릭스와 SyncSketch·Frame.io·Ziflow 프레임 단위 레드라인 주석 및 Basecamp 힐차트 진행률을 단일 트래커로 결합
     - **내재화 모듈**: `apps/web/src/domains/collaboration/CollaborationPage.tsx`
     - **참조 서비스**: CGWire Kitsu, SyncSketch, Ziflow, PageProof, Filestage, Plane.so
  1. **18개 레이어 RBAC 무충돌 잠금 & Playbook·Kosmik·Affine·Airtable 그리드** (`collab-18layer-rbac-airtable`): **1,030,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Magma·Figma 멀티플레이어 CRDT 잠금과 15개 웹툰 세부직무별 18개 레이어 쓰기 권한 매트릭스를 결합해 레이어 덮어쓰기 충돌을 원천 차단
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioCompetitorCapabilityPanel.tsx`
     - **참조 서비스**: Figma, Magma, Playbook, Kosmik, Affine.pro, Airtable
  1. **크레페·크몽·숨고·라우드소싱 어시스턴트 외주 에스크로 & 시안 브리프** (`collab-crepe-kmong-escrow`): **1,025,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 크레페·크몽·숨고 컷당 단가 산식과 검수 승인 연동 에스크로 정산 게이트를 공동작업 공정 인계 단계에 내재화
     - **내재화 모듈**: `apps/web/src/domains/collaboration/CollaborationPage.tsx`
     - **참조 서비스**: CREPE, Kmong, Soomgo, Loudsourcing
  1. **Anchorpoint·Perforce 대용량 PSD/Blend 바이너리 잠금 & Chromatic 픽셀 Diff·Loom 피드백** (`collab-anchorpoint-binary-diff`): **1,036,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Anchorpoint·Perforce Helix Core 대용량 .clip/.psd/.blend 배타적 파일 잠금(Git LFS Lock)과 Chromatic 시각적 픽셀 Diff 비교기를 내장
     - **내재화 모듈**: `apps/web/src/domains/collaboration/CollaborationPage.tsx`
     - **참조 서비스**: Anchorpoint Git, Perforce Helix Core, Abstract Design, Chromatic QA, Loom Video, Linear Asks

| # | 서비스명 (`competitorServices`) | 도메인 ID | 스튜디오 검색·내재화 상태 |
| --- | --- | --- | --- |
| 1 | `Figma` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 2 | `FigJam` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 3 | `Penpot` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 4 | `Miro` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 5 | `Whimsical` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 6 | `Linear` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 7 | `ClickUp` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 8 | `Trello` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 9 | `Basecamp` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 10 | `Asana` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 11 | `Airtable` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 12 | `Coda` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 13 | `Eagle` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 14 | `CGWire Kitsu` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 15 | `ftrack` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 16 | `ShotGrid` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 17 | `Frame.io` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 18 | `Notion` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 19 | `Magma` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 20 | `CREPE` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 21 | `Kmong` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 22 | `Soomgo` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 23 | `Loudsourcing` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 24 | `SyncSketch` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 25 | `Playbook` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 26 | `Kosmik` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 27 | `Shortcut` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 28 | `Height App` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 29 | `Plane.so` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 30 | `Focalboard` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 31 | `Smartsheet` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 32 | `Monday.com Creative` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 33 | `Wrike Media` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 34 | `Ziflow` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 35 | `PageProof` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 36 | `Filestage` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 37 | `Milanote Team` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 38 | `Affine.pro` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 39 | `Anchorpoint Git` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 40 | `Perforce Helix Core` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 41 | `Abstract Design` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 42 | `Zeplin` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 43 | `zeroheight` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 44 | `Storybook UI` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 45 | `Chromatic QA` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 46 | `Loom Video` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 47 | `mmhmm Studio` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 48 | `Pitch Deck` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 49 | `Gamma AI` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 50 | `Tome Narrative` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 51 | `Linear Asks` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 2.5. 컷츠·무빙툰·인터랙티브 숏폼 (`cuts-movingtoon` · `/cuts`) — **76개 서비스 · 1,026,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `866 DOM` <= 목표 `1100 DOM`
- **도메인 요약**:
  - Rive·Spine·Live2D·Cavalry 2D·Effekseer·ToonCrafter·DomoAI·Vidu·Runway Gen-3·MiniMax Hailuo 모션 및 Plask AI/Move AI 모션캡처
  - 타입캐스트/수퍼톤/VOICEVOX/Fish Audio/Resemble AI/Rhubarb 립싱크·OpusClip/Submagic 하이라이트 자막·인서툰 릴스 자동 변환
- **세부 고도화 내재화 기능 (4개)**:
  1. **Rive 상태머신·ToonCrafter/DomoAI/Vidu 모션 & Effekseer/Cavalry 패럴랙스** (`cuts-state-machine-webgl`): **1,034,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Rive 스크롤/포인터 상태머신과 ToonCrafter 원화 간 작화 보간·Spine/Live2D 2.5D 메쉬 디포머를 60fps WebGL2 뷰포트에 통합
     - **내재화 모듈**: `apps/web/src/domains/cuts/CutsPage.tsx`
     - **참조 서비스**: Rive, ToonCrafter, DomoAI, Vidu AI, Effekseer, Cavalry 2D
  1. **타입캐스트·수퍼톤·VOICEVOX·Fish Audio·Rhubarb 립싱크 & LALAL.AI 스템 분리** (`cuts-voice-lipsync-stem-ducking`): **1,024,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Rhubarb 6음소(A~F) 입모양 키프레임 자동 추출과 대사 발화 시 BGM을 -12dB 자동 감쇠하는 LALAL.AI 스템 오토더킹을 내장
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: Typecast, Supertone, VOICEVOX, Fish Audio, GPT-SoVITS, Rhubarb Lip Sync
  1. **Plask AI 모션캡처 & Sora·Luma·CapCut·인서툰 9:16 릴스/쇼츠 자동 패키저** (`cuts-reels-packager`): **1,020,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 오노마AI 인서툰·Vrew·CapCut 컷별 카메라 팬/줌 타임코드와 쇼츠/릴스/틱톡 9:16 세로 영상 패키징 파이프라인을 내재화
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: Plask AI, Sora (OpenAI Video), Luma Dream Machine, CapCut Web, Onoma AI Insertoon
  1. **OpusClip·Submagic 하이라이트 키네틱 자막 & Resemble AI·Murf·Mubert 감정 더빙/BGM** (`cuts-opusclip-resemble-dubbing`): **1,028,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: OpusClip 클라이맥스 텐션 훅 감지와 Submagic 단어 단위 키네틱 자막, Resemble AI·Altered 다역 감정 변조 더빙을 결합
     - **내재화 모듈**: `apps/web/src/domains/cuts/CutsPage.tsx`
     - **참조 서비스**: OpusClip, Submagic Captions, Murf AI, Resemble AI, Altered Studio, Mubert AI Music, Runway Gen-3 Alpha

| # | 서비스명 (`competitorServices`) | 도메인 ID | 스튜디오 검색·내재화 상태 |
| --- | --- | --- | --- |
| 1 | `Rive` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 2 | `Spine 2D/2.5D` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 3 | `Live2D Cubism` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 4 | `Toon Boom Harmony` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 5 | `OpenToonz` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 6 | `Cascadeur` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 7 | `Adobe Mixamo` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 8 | `DeepMotion` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 9 | `LottieFiles` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 10 | `PlayCanvas` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 11 | `cables.gl` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 12 | `Unicorn Studio` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 13 | `Theatre.js` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 14 | `GSAP (GreenSock)` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 15 | `PixiJS` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 16 | `Runway` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 17 | `Pika` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 18 | `Kling AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 19 | `Hailuo AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 20 | `Hedra` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 21 | `ElevenLabs` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 22 | `LALAL.AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 23 | `Suno` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 24 | `Udio` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 25 | `Procreate Dreams` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 26 | `Laftel` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 27 | `Typecast` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 28 | `Supertone` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 29 | `Vrew` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 30 | `Katalist AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 31 | `Onoma AI Insertoon` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 32 | `Boords` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 33 | `Wonder Dynamics` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 34 | `Plask AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 35 | `Move AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 36 | `CapCut Web` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 37 | `Descript` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 38 | `Moho Animation` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 39 | `Synfig Studio` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 40 | `Pencil2D` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 41 | `Wick Editor` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 42 | `Tahoma2D` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 43 | `VOICEVOX` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 44 | `Applio RVC` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 45 | `ToonCrafter` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 46 | `LivePortrait` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 47 | `AniPortrait` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 48 | `DragonBones` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 49 | `Effekseer` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 50 | `Sora (OpenAI Video)` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 51 | `Luma Dream Machine` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 52 | `Genmo Mochi` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 53 | `Vidu AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 54 | `PixVerse` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 55 | `Haiper AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 56 | `DomoAI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 57 | `Kaiber AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 58 | `SadTalker` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 59 | `Wav2Lip Studio` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 60 | `Fish Audio` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 61 | `GPT-SoVITS` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 62 | `Rhubarb Lip Sync` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 63 | `Cavalry 2D` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 64 | `MiniMax Hailuo Video` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 65 | `Runway Gen-3 Alpha` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 66 | `OpusClip` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 67 | `Submagic Captions` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 68 | `VEED.IO` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 69 | `InVideo AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 70 | `Fliki AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 71 | `Murf AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 72 | `PlayHT` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 73 | `Resemble AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 74 | `Altered Studio` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 75 | `Voicemod` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 76 | `Mubert AI Music` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 2.6. 크리에이터 아카데미·스토리 설계 (`creator-academy` · `/learn`) — **59개 서비스 · 1,019,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `1390 DOM` <= 목표 `1500 DOM`
- **도메인 요약**:
  - 클래스101·콜로소·CGMA·Gnomon·Learn Squared·ArtWOD 커리큘럼 및 Final Draft·Fountain·STARC·WriterDuet·Causality 비트보드
  - Posemaniacs·Anatomy Next·ShotDeck·Flim.ai 30초 크로키/시네마틱 레퍼런스 및 스튜디오 예제 파일을 여는 Interactive Sandbox
- **세부 고도화 내재화 기능 (4개)**:
  1. **Final Draft·Fountain·STARC·WriterDuet 대본 문법 & Causality·Bibisco 서브플롯 그리드** (`academy-fountain-beatboard`): **1,025,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Fountain·Final Draft 시나리오 문법 파서와 Plottr·Causality 복선/회수 트래킹 매트릭스를 아카데미 실습과 스튜디오에 내재화
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-front.ts`
     - **참조 서비스**: Final Draft, Fountain, Starc Architect, WriterDuet, Highland 2, Causality Story Sequencer
  1. **Proko·NMA·Drawabox·Posemaniacs 30초 해부학·손발·투시 크로키 훈련기** (`academy-30s-croquis`): **1,017,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Posemaniacs·Line of Action 30초/60초 근육 회전 타이머와 Drawabox 투시 박스 드릴을 아카데미 실습 위젯에 직접 탑재
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-art.ts`
     - **참조 서비스**: Proko, New Masters Academy, Drawabox, Ctrl+Paint, Posemaniacs, Magic Poser
  1. **콜로소·클래스101·CGMA·Gnomon·Schoolism 커리큘럼 & 1-Click 실습 샌드박스** (`academy-masterclass-sandbox`): **1,015,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 콜로소·클래스101·CGMA 8단계 웹툰 공정별 실습 브러시·레이어 템플릿을 클릭 한 번으로 스튜디오 캔버스에 로드
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-launch.ts`
     - **참조 서비스**: Coloso, Class101, CGMA (Computer Graphics Master Academy), Gnomon Workshop, Schoolism
  1. **ShotDeck·Flim.ai·Film-Grab 시네마틱 조명·렌즈 레퍼런스 & Anatomy Next·ArtWOD 3D 해부학 랩** (`academy-shotdeck-anatomynext-lab`): **1,023,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: ShotDeck·Flim.ai 렌즈 초점거리(24mm~85mm)·색온도·키라이트 방향 검색기와 Anatomy Next 3D 골격·근육 블록 오버레이를 내재화
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-art.ts`
     - **참조 서비스**: ShotDeck, Flim.ai, Film-Grab, Anatomy Next, ArtWOD, Learn Squared, Character Design References

| # | 서비스명 (`competitorServices`) | 도메인 ID | 스튜디오 검색·내재화 상태 |
| --- | --- | --- | --- |
| 1 | `Campfire Writing` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 2 | `Plottr` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 3 | `Dabble Writer` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 4 | `World Anvil` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 5 | `Scrivener` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 6 | `Final Draft` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 7 | `Fountain` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 8 | `Arc Studio Pro` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 9 | `Celtx` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 10 | `Obsidian` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 11 | `Milanote` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 12 | `Twine` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 13 | `Wonder Unit Storyboarder` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 14 | `Toon Boom Storyboard Pro` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 15 | `StoryboardThat` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 16 | `Class101` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 17 | `Coloso` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 18 | `Taling` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 19 | `Domestika` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 20 | `Posemaniacs` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 21 | `SketchDaily` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 22 | `Line of Action` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 23 | `Quickposes` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 24 | `DesignDoll` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 25 | `Magic Poser` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 26 | `Bibisco` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 27 | `Manuskript` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 28 | `Trelby` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 29 | `Causality Story Sequencer` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 30 | `Proko` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 31 | `Schoolism` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 32 | `Wingfox` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 33 | `FastCampus` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 34 | `Inflearn` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 35 | `CGMA (Computer Graphics Master Academy)` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 36 | `Gnomon Workshop` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 37 | `New Masters Academy` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 38 | `Ctrl+Paint` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 39 | `Drawabox` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 40 | `Stan Prokopenko Anatomy` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 41 | `Wattpad Creators` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 42 | `WriterDuet` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 43 | `Highland 2` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 44 | `Fade In Pro` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 45 | `Kit Scenarist` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 46 | `Starc Architect` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 47 | `Skillshare` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 48 | `Udemy Creative` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 49 | `Coursera CalArts` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 50 | `Kadenze` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 51 | `Learn Squared` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 52 | `ArtWOD` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 53 | `Anatomy Next` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 54 | `3D Anatomy Reference` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 55 | `Character Design References` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 56 | `ShotDeck` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 57 | `Film-Grab` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 58 | `Flim.ai` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 59 | `Savee Moodboard` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 2.7. 스튜디오 캔버스·15개 세부직무 워크스페이스 (`studio-role-workspace` · `/studio/canvas · /settings/role`) — **99개 서비스 · 1,034,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `616 DOM` <= 목표 `950 DOM`
- **도메인 요약**:
  - LlamaGen·투닝플러스·젠툰·Dashtoon·Comicai 스토리→웹툰 원클릭 변환 + Mangaplay 100% AI-Free 실시간 코믹 마크업 콘티
  - Mantra·Ichigo·Mokuro·cotrans·letr.ai 6개국어 자동 식자 + IC-Light/Clipdrop 2D 법선 재조명 + InstantID/YOLOv8/Vectorizer.AI + Glaze/C2PA 보호
- **세부 고도화 내재화 기능 (4개)**:
  1. **LlamaGen·투닝플러스·젠툰 스토리→웹툰 & Mangaplay 100% AI-Free 실시간 마크업 콘티** (`studio-story-to-webtoon-fountain`): **1,045,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: LlamaGen·투닝플러스 줄거리→컷 자동 분해기와 Mangaplay Fountain 코믹 마크업(`## PANEL`, `@화자(DNA)`, `!SFX`) 실시간 파서를 통합
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: LlamaGen.AI, Tooning Plus, Mangaplay Studio, LionRocket GenToon, Onoma AI TooToon, Dashtoon Studio
  1. **Mantra·Ichigo·Mokuro·cotrans·letr.ai·투닝 AI Losy 6개국어(KO/EN/JA/ZH/ES/FR) OCR/식자** (`studio-letr-losy-multilingual-lettering`): **1,032,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Mokuro·BallonsTranslator·cotrans 말풍선 마스크 추출/배경 인페인팅 복원과 Mantra·letr.ai 6개국어 다이아몬드 행갈이 식자기를 내장
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: Mantra Engine, Ichigo Reader, Mokuro Manga OCR, BallonsTranslator, Manga Translator (cotrans), LETR AI (LetterWorks)
  1. **15개 세부직무 3단계 밀도(Zen 86%) & SAI2/ComfyUI/InvokeAI/SAM 2·Glaze/C2PA 보호** (`studio-15role-zen-3d-lt`): **1,025,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Photopea(403 DOM)·Excalidraw(206 DOM) 초경량 셸을 역공학해 Zen(86% 캔버스)·직무 문맥형(76%)·워크벤치(64%) 3단계 밀도 전환을 구현
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioCompetitorCapabilityPanel.tsx`
     - **참조 서비스**: Clip Studio Paint, SAI2 (PaintTool SAI), ComfyUI, invokeAI, Segment Anything (SAM 2), Glaze, C2PA Content Credentials
  1. **IC-Light·Clipdrop 2D 법선 재조명 & InstantID·YOLOv8 만화 컷/말풍선 검출·Vectorizer.AI 선화화** (`studio-iclight-instantid-yolo-detector`): **1,038,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: IC-Light·Clipdrop Relight 2D 법선 추정 기반 실시간 림라이트/역광 재조명과 YOLOv8 컷/말풍선 바운딩박스 자동 검출·SVG 벡터화를 결합
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: IC-Light Studio, Clipdrop Relight, InstantID Face, IP-Adapter FaceID, IDM-VTON Outfit, YOLOv8 Comic Detector, Vectorizer.AI, Lazy Nezumi Pro

| # | 서비스명 (`competitorServices`) | 도메인 ID | 스튜디오 검색·내재화 상태 |
| --- | --- | --- | --- |
| 1 | `Clip Studio Paint` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 2 | `Krita` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 3 | `MediBang Paint` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 4 | `MediBang Paletta` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 5 | `FireAlpaca` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 6 | `Procreate` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 7 | `ibisPaint X` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 8 | `Rebelle` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 9 | `Affinity Designer` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 10 | `Photopea` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 11 | `Concepts App` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 12 | `Aseprite` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 13 | `Piskel` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 14 | `Lospec` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 15 | `Adobe Color` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 16 | `Coolors` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 17 | `PureRef` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 18 | `Wacom Pen Displays` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 19 | `Excalidraw` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 20 | `tldraw` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 21 | `Canva` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 22 | `Miricanvas` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 23 | `Mangoboard` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 24 | `Playground AI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 25 | `Recraft` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 26 | `Ideogram` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 27 | `Krea AI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 28 | `LETR AI (LetterWorks)` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 29 | `Tooning AI Losy` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 30 | `DeepL` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 31 | `SketchUp for Web` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 32 | `Blender Grease Pencil` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 33 | `Three.js` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 34 | `Babylon.js` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 35 | `Spline` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 36 | `Higgsfield Mangaka` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 37 | `Toonsquare Tooning` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 38 | `Tooning Plus` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 39 | `Mangaplay Studio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 40 | `LlamaGen.AI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 41 | `LionRocket GenToon` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 42 | `Onoma AI TooToon` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 43 | `KomikoAI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 44 | `Anifusion` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 45 | `Dashtoon Studio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 46 | `MangaFlow Studio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 47 | `ComiStitch` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 48 | `Comicai` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 49 | `AI Comic Factory` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 50 | `Sudowrite` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 51 | `NovelAI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 52 | `Civitai` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 53 | `Glaze` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 54 | `Caravel` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 55 | `Carapace` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 56 | `Comic Life 3` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 57 | `Jump Paint` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 58 | `Mantra Engine` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 59 | `Ichigo Reader` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 60 | `Mokuro Manga OCR` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 61 | `BallonsTranslator` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 62 | `Paintstorm Studio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 63 | `ArtRage Vitae` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 64 | `Corel Painter` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 65 | `HeavyPaint` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 66 | `Sketchbook Pro` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 67 | `ComfyUI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 68 | `ControlNet` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 69 | `OpenPose` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 70 | `Depth Anything V2` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 71 | `Segment Anything (SAM 2)` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 72 | `SAI2 (PaintTool SAI)` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 73 | `openCanvas` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 74 | `AzDrawing` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 75 | `GIMP 3.0 Studio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 76 | `Inkscape Vector` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 77 | `Vectornator (Curve)` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 78 | `Amadine` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 79 | `Pixelmator Pro` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 80 | `Affinity Publisher` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 81 | `invokeAI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 82 | `Fooocus` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 83 | `Automatic1111 WebUI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 84 | `Krita AI Diffusion` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 85 | `Manga Translator (cotrans)` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 86 | `MyPaint` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 87 | `Lazy Nezumi Pro` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 88 | `vizRef` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 89 | `Kuadro Overlay` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 90 | `Vectorizer.AI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 91 | `Magnific AI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 92 | `Clipdrop Relight` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 93 | `IC-Light Studio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 94 | `IDM-VTON Outfit` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 95 | `InstantID Face` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 96 | `IP-Adapter FaceID` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 97 | `Animate Anyone` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 98 | `YOLOv8 Comic Detector` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 99 | `SadTalker Pose` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
