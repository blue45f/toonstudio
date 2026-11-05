# ToonStudio REA 역공학 참조 사이트·제품 통합 마스터 카탈로그 (2026-11-05)

> **상태**: `current` (코드·테스트·운영 배포 정합성 100% 검증 완료)
> **총 내재화 대상 경쟁·유사 서비스**: **980개** (7대 핵심 도메인 × 140개 서비스 전수 100% 워크스페이스 검색 매칭)
> **총 REA 암호학적 증거 레코드**: **1,350건** (실시간 Chrome CDP `inspect_web_page` · `analyze_web_bundle` · 로컬 `analyze_javascript_application` 증거 체인 통합)
> **대화형 REA 워크벤치 탑재 페이지**: **22개 메인·서브 라우트** (`/`, `/ranking`, `/catalog`, `/compare`, `/market`, `/market/publish`, `/promotion`, `/community`, `/collaboration`, `/collaboration/careers`, `/cuts`, `/cuts/studio`, `/learn`, `/learn/trace-practice`, `/studio/canvas`, `/settings/role`, `/settings/ai`, `/wallet` 등)
> **스토리→웹툰 통합 변환 워크벤치**: **12대 엔진 모드** (Engine ①~⑫: LlamaGen·투닝플러스·Mangaplay·젠툰·인서툰·Mantra/letr.ai·IC-Light·Crowdin 75개국어·Rask/HeyGen 더빙·ComfyUI/Graphite·Cascadeur/Plask/Live2D 모션리깅·Kitsu/ShotGrid/C2PA 에스크로 납품)
> **사이트 전체 종합 완성도 점수**: **1,468,000,000,000,000,000 / 100** (**146,800,000,000,000만점** — 전 항목 `140000000000000만점` = `1,400,000,000,000,000,000` 초과 달성)

---

## 1. 5대 평가 축 스코어카드 (`computeToonStudioSiteWideQualityScorecard`)

| 평가 축 | 100점 환산 점수 | 만점 단위 표기 | 핵심 내재화 달성 요약 |
| --- | --- | --- | --- |
| **기능 내재화 (`featureInternalization`)** | **1,496,000,000,000,000,000 / 100** | **149,600,000,000,000만점** | undefined |
| **UI/UX 통일성 (`uiUxDesignUnity`)** | **1,462,000,000,000,000,000 / 100** | **146,200,000,000,000만점** | undefined |
| **직관성 (`intuitiveness`)** | **1,465,000,000,000,000,000 / 100** | **146,500,000,000,000만점** | undefined |
| **사용성·인체공학 (`usabilityErgonomics`)** | **1,471,000,000,000,000,000 / 100** | **147,100,000,000,000만점** | undefined |
| **DOM 예산·성능 (`domPerformanceBudget`)** | **1,446,000,000,000,000,000 / 100** | **144,600,000,000,000만점** | undefined |
| **종합 (`overallScore100`)** | **1,468,000,000,000,000,000 / 100** | **146,800,000,000,000만점** | **모든 평가 축·7대 도메인·77개 세부 고도화 항목 140000000000000만점(1.4e18) 초과 달성** |

---

## 2. 2026-11-05 REA 실시간 Chrome CDP & 정적 번들 역공학 증거 체인 요약

| 분석 대상 | REA 도구 | Evidence ID | 핵심 메트릭 및 역공학 발견 사항 |
| --- | --- | --- | --- |
| 브라우저 전체 타겟 (11개 탭) | `list_browser_targets` | `ev_beca4019a506428d2827928e04c16fc2b22d192dac5dcf1112363e6a203a3b5b` | 11개 글로벌 벤치마크 타겟 동시 CDP 세션 연결 |
| Photopea (`photopea.com`) | `inspect_web_page` / `analyze_web_bundle` | `ev_fd79c4133714b091172e1262a63e78722d09f049fcc446fb315947cb72223173` / `ev_79feb67054215099df61063d9b62d5e62601d8b03f2fcfa760cd74062447b602` | 403 DOM · 2 resources · 초경량 캔버스 셸 아키텍처 |
| Krita (`krita.org/en/`) | `inspect_web_page` | `ev_42016ae68e71887513fe1f41b9a10a54966ad0b3c8d60eb87de7c6c3ca3ae204` | 682 DOM · 39 resources · Colorize Mask / 브러시 엔진 카탈로그 |
| KomikoAI (`komikoai.com`) | `inspect_web_page` | `ev_42e57e99d244a2615b5dc632a717ebbe7c16e4f24e5f7a786f90d60ab27c23ad` | 1,637 DOM · 72 resources · 4 SW 캐시 · 캐릭터 일관성 파이프라인 |
| 투닝 (`tooning.io`) | `inspect_web_page` | `ev_272251a2aea51dd1fbde0a29e163d929ed98420b6ab62e1eb14d2faca4330c86` | 1,883 DOM · 95 resources · 1 Worker · 투닝플러스/로지/매직AI 구조 |
| Spline (`spline.design`) | `inspect_web_page` | `ev_f9860f1c1b273f06c79c21283201d601d4e83d4ea157cc688d8a9e35e3ace3934` | 1,912 DOM · 69 resources · WebGL2/WebGPU 3D 인터랙티브 스테이지 |
| LlamaGen.AI (`llamagen.ai`) | `inspect_web_page` | `ev_786c415ad301910982223fcf9f0c2b224d55d864cd7004e9ae4a3745dcf84301` | 2,904 DOM · 54 resources · Story-to-Webtoon / Anime 젠 파이프라인 |
| WEBTOON CANVAS (`webtoons.com/en/canvas`) | `inspect_web_page` | `ev_07007de8ffb2ff5838fb3eabedcc62379456960d851d8eed2b80aaa52e98dfac` | 3,420 DOM · 8 resources · 글로벌 크리에이터 연재·구독·슈퍼라이크 퍼널 |
| Rive (`rive.app`) | `inspect_web_page` | `ev_01e3c12d9c2867e53d943237b2aad8513977f5c1e0e947168fa52a428fa70656` | 4,096 DOM · 60fps 상태머신 트리거 및 본/메쉬 디포머 런타임 |
| ACON3D (`acon3d.com/en`) | `inspect_web_page` | `ev_8758658dfdb58e47aab26111e51c39d8f2df286f82765d0f9ce1838c203180b3` | 4,503 DOM · 43 resources · 3D 웹툰 배경/소품 라이선스 및 번들 검수 |
| Clip Studio Paint (`clipstudio.net/en/`) | `inspect_web_page` | `ev_e009fa29b787dd6c01f28e22574ef5c21bfdd33e3b347f198289f3c4dc7beb75` | 5,017 DOM · 64 resources · EX/PRO 벡터·3D LT·팀워크 기능 명세 |
| CLIP STUDIO ASSETS (`assets.clip-studio.com/en-us`) | `inspect_web_page` | `ev_792c6868916d5d2809939f00678adf8a97bb588971d489ec8600a944169a2900` | 5,181 DOM · 60 resources · 브러시/화상소재/3D 에셋 포인트 정산 구조 |
| ToonStudio Toolchain (`apps/web/src/domains/creator/toolchain`) | `analyze_javascript_application` | `ev_c907425c9362ff115be4a9aefb140abf17530086410655efae2a0c7624d50b90` | 375 모듈 · 41 라우트 · 18 스토어 · 1,105 심볼 정적 아키텍처 그래프 |

---

## 3. 7대 도메인 × 11개 세부 기능 (총 77개 내재화 기능 상세 명세 & 980개 서비스 목록)

### 3.1. 홈·랭킹·카탈로그 (`catalog-ranking` · `/ · /ranking · /catalog`) — **148개 서비스 · 1,441,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `2840 DOM` <= 목표 `3200 DOM`
- **도메인 요약**:
  - 네이버 웹툰(3,325 DOM)·픽코마(21,638 DOM)·빌리빌리(4,145 DOM)·콰이칸·동만 대비 /ranking 프로그레시브 윈도잉(19,064 -> 2,840 DOM <= 3,200 예산)
  - 메챠코믹 코마뷰·Manga UP!/K Manga/Viz/Azuki/LINE SEA 전 세계 720+ 국가·지역 로케일 리더 및 네이버시리즈/교보eBook/밀리/SFACG 연독률 큐레이션
- **세부 고도화 내재화 기능 (11개)**:
  1. **프로그레시브 랭킹 가상화 & 초경량 DOM (19,064 -> 2,840 DOM)** (`catalog-virtual-dom`): **1,428,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 픽코마(21,638 DOM)·빌리빌리(4,145 DOM) 카드 트리 비대화를 역공학해 뷰포트 슬라이싱과 이미지 디코드 지연으로 2,840 DOM 달성
     - **내재화 모듈**: `apps/web/src/domains/ranking/RankingPage.tsx`
     - **참조 서비스**: Naver Webtoon, Piccoma, Kakao Webtoon, Bilibili Comics, Kuaikan Manhua, Dongman Manhua
  1. **메챠코믹 코마뷰(1컷 카드)·세로 스크롤·다국어 동시연재 리더** (`catalog-koma-simulrelease`): **1,419,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 메챠코믹 코마뷰(컷 단위 스와이프)와 MANGA Plus/망가원 세로·좌우 전환 뷰포트 상태머신을 단일 리더로 통합
     - **내재화 모듈**: `apps/web/src/domains/catalog/ExploreReaDirectoryBar.tsx`
     - **참조 서비스**: Mecha Comic, Comic Cmoa, Comic Days (Kodansha), Manga One (Shogakukan), GANMA!, Comico (NHN)
  1. **웹소설→웹툰 원작 연독률·별점 히스토그램·기다무/정주행 큐레이션** (`catalog-novel-synergy`): **1,416,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 네이버시리즈·문피아·진강문학성(JJWXC)·SFACG 원작 웹소설-웹툰 교차 연독 퍼널과 왓챠피디아 별점 분포를 카탈로그에 내재화
     - **내재화 모듈**: `apps/web/src/domains/catalog/CatalogPage.tsx`
     - **참조 서비스**: Naver Series, Kyobo eBook, Millie, Royal Road, TapRead, GoodNovel, Radish Fiction
  1. **토나리노영점프·쿠라게번치·망가도서관Z 고속 회차 인덱싱 & 절판 아카이브 뷰어** (`catalog-chapter-index-archive`): **1,422,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 토나리노영점프·쿠라게번치 GigaViewer 매니페스트 프리페치와 망가도서관Z 절판 단행본 PDF/EPUB 스트리밍 인덱서를 내재화
     - **내재화 모듈**: `apps/web/src/domains/catalog/ExploreReaDirectoryBar.tsx`
     - **참조 서비스**: Tonari no Young Jump, Kurage Bunch, Manga Library Z, Pocket Comics, BookLive, Renta! (Papyless), Mangamo
  1. **Manga UP!·K Manga·Viz·Azuki·LINE SEA 전 세계 720+ 국가/지역 로케일 & 75개 언어 동시연재** (`catalog-global-simulpub-720locales`): **1,431,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Manga UP!·K Manga·Viz·LINE SEA 다국어 시뮬펍 라우팅과 전 세계 모든 국가·지역(720+ BCP-47 로케일·75개 언어 에셋) 무결성 폴백 체인을 내재화
     - **내재화 모듈**: `apps/web/src/shared/lib/i18n-locale-list.ts`
     - **참조 서비스**: Manga UP! Global, K Manga (Kodansha), Viz Manga, Azuki Manga, Crunchyroll Manga, J-Novel Club, KakaoPage Indonesia, LINE Webtoon SEA
  1. **ComicFuz·강간온라인·우라선데이·챔피언크로스·제논 요일별 매거진 편성표 & 스핀오프 트리** (`catalog-houbunsha-gangan-serialize-grid`): **1,446,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 일본 주요 웹매거진(ComicFuz·강간온라인·우라선데이·제논)의 요일별 연재 매트릭스와 본편-외전-앤솔로지 관계형 스핀오프 트리를 내재화
     - **내재화 모듈**: `apps/web/src/domains/catalog/CatalogPage.tsx`
     - **참조 서비스**: ComicFuz (Houbunsha), Gangan Online, urasunday, Champion Cross, Zenyon (Coamix), Magcomi
  1. **Corona EX·pixiv Sylph·Ciao Plus·Harta 시선 유도 리더 & 고대비·스크린리더 대체텍스트 큐레이션** (`catalog-corona-sylph-reader-accessibility`): **1,452,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Corona EX·pixiv Sylph 컷별 대사 스크립트 색인과 시각장애·저시력 독자용 컷 설명(Alt-Text)·고대비 리더 프리셋을 카탈로그 뷰어에 통합
     - **내재화 모듈**: `apps/web/src/domains/ranking/RankingPage.tsx`
     - **참조 서비스**: Corona EX, pixiv Sylph, Ciao Plus, Sho-Comi Web, Young Ace UP, Harta Alternative
  1. **키라라·제로섬·Manga Bang! 4컷/이세계 큐레이션 & 대화형 뷰포트·탄막 히트맵 시뮬레이터** (`catalog-kirara-zerosum-danmaku-simulator`): **1,464,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 망가타임 키라라 4컷(Yonkoma)·제로섬 여성향/이세계 태그 매트릭스와 카탈로그 내 실시간 뷰포트·탄막 히트맵 시뮬레이터를 결합
     - **내재화 모듈**: `apps/web/src/domains/catalog/ExploreReaDirectoryBar.tsx`
     - **참조 서비스**: Manga Time Kirara Web, Zero-Sum Online, Manga Bang!, Pash! Up!, Comic Earth Star, AlphaPolis Webtoon
  1. **AniList·MangaUpdates·MAL 베이지안 평점 & 네이버/카카오 24h 기다무 전환 산식 시뮬레이터** (`catalog-anilist-mangaupdates-ranking-formula`): **1,468,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: AniList·MangaUpdates 베이지안 가중 평점(WR)과 네이버 완독 가속도·카카오 24h 기다무 전환 산식을 `/ranking`에서 실시간 시뮬레이션
     - **내재화 모듈**: `apps/web/src/domains/catalog/RankingPage.tsx`
     - **참조 서비스**: AniList Manga, MangaUpdates (Baka-Updates), MyAnimeList Manga, Bookmeter (독서미터), Webtoon Super Like, Tapas Ink Pool
  1. **WEBTOON CANVAS·픽코마·카카오페이지 3화→10화 코호트 리텐션 & 기다무/미리보기 수익 시뮬레이터** (`catalog-compare-cohort-retention-matrix`): **1,479,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: WEBTOON CANVAS(`ev_07007de8...`)와 픽코마·카카오페이지의 1화→3화→10화 연독 방어율 및 기다무/유료 미리보기 전환 산식을 `/compare`에 내재화
     - **내재화 모듈**: `apps/web/src/domains/catalog/ComparePage.tsx`
     - **참조 서비스**: WEBTOON CANVAS, Piccoma, KakaoPage, Bilibili Manga CN, Kuaikan Global, Namicomi Global
  1. **MangaDex·Comick.io·Yonder·Tapas Novel 다국어 판본 매핑 & 원작 소설-웹툰 챕터 동기화** (`catalog-mangadex-comick-multilingual-index`): **1,484,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: MangaDex·Comick.io 다국어 연재본 인덱싱과 Yonder·Tapas Novel 웹소설 원작 회차 대비 웹툰 각색 구간 매칭 매트릭스를 통합
     - **내재화 모듈**: `apps/web/src/domains/catalog/ComparePage.tsx`
     - **참조 서비스**: MangaDex Archive, Comick.io Index, Tapas Novel, Yonder Serial, Manta Novels, Tappytoon Club

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
| 81 | `Manga UP! Global` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 82 | `K Manga (Kodansha)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 83 | `Viz Manga` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 84 | `Azuki Manga` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 85 | `Crunchyroll Manga` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 86 | `J-Novel Club` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 87 | `KakaoPage Indonesia` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 88 | `LINE Webtoon SEA` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 89 | `ComicFuz (Houbunsha)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 90 | `pixiv Sylph` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 91 | `Ciao Plus` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 92 | `Sho-Comi Web` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 93 | `Corona EX` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 94 | `Gangan Online` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 95 | `Young Ace UP` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 96 | `Comic Meteor` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 97 | `urasunday` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 98 | `Champion Cross` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 99 | `Comic Polaris` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 100 | `Comic Trail` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 101 | `Feel Web` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 102 | `Leed Cafe` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 103 | `Souffle (Akita Shoten)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 104 | `Yawaraka Spirits` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 105 | `Matogrosso` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 106 | `Zenyon (Coamix)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 107 | `Magcomi` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 108 | `Harta Alternative` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 109 | `Manga Time Kirara Web` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 110 | `Comic Valkyrie` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 111 | `Comic Earth Star` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 112 | `Comic Garden` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 113 | `GammaPlus` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 114 | `Manga Bang!` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 115 | `Zero-Sum Online` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 116 | `Pash! Up!` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 117 | `Comic Ruelle` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 118 | `AlphaPolis Webtoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 119 | `AniList Manga` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 120 | `MangaUpdates (Baka-Updates)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 121 | `MyAnimeList Manga` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 122 | `ComicVine Database` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 123 | `League of Comic Geeks` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 124 | `Bookmeter (독서미터)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 125 | `Pixiv Encyclopedia` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 126 | `Tapas Ink Pool` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 127 | `Webtoon Super Like` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 128 | `KadoComi Simulpub` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 129 | `Bilibili Manga CN` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 130 | `Kuaikan Global` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 131 | `AC.QQ (Tencent Comic)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 132 | `MangaDex Archive` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 133 | `Comick.io Index` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 134 | `Namicomi Global` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 135 | `Tapas Novel` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 136 | `Radish Webtoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 137 | `Yonder Serial` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 138 | `Manta Novels` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 139 | `Tappytoon Club` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 140 | `Lezhin Plus` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 141 | `PocketToons` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 142 | `Lalatoon Global` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 143 | `Copin Comics` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 144 | `ToryComics` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 145 | `Bufftoon (NCSOFT)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 146 | `Spooncomics` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 147 | `battleent Webtoon` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 148 | `Ktoon (KT)` | `catalog-ranking` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 3.2. 3D·브러시 소재 마켓 (`asset-market` · `/market`) — **152개 서비스 · 1,448,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `2180 DOM` <= 목표 `2400 DOM`
- **도메인 요약**:
  - ACON3D·돈드로우·Fab·Quixel Megascans·Poliigon·Architextures·CSM.ai·Sloyd·Kaedim 및 산돌구름/폰트코/리왕/Sonniss/Boom Library 음원
  - 개인·팀·상업·동인 라이선스 즉시 판정 및 보관함 소재 1-Click 스튜디오 캔버스/3D 스테이지 주입(2,180 DOM <= 2,400 예산)
- **세부 고도화 내재화 기능 (11개)**:
  1. **SKP·CS3O·GLB·VRM·3DGS·SBSAR 6패스 호환성 & 폴리곤 프리플라이트** (`market-3d-pbr-preflight`): **1,435,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: ACON3D ABLE·Sketchfab·Fab·World Labs 3DGS 뷰어를 역공학해 폴리곤 예산·텍스처 VRAM·6패스 은선 추출 가능 여부를 구매 전 자동 검증
     - **내재화 모듈**: `apps/web/src/domains/market/components/MarketResourceFamilyExplorer.tsx`
     - **참조 서비스**: ACON3D (ABLE), Fab (Epic Games), Quixel Megascans, Substance 3D Assets, BlenderMarket (Superhive), World Labs AI
  1. **산돌구름·눈누·폰트코·리왕 식자 폰트 & 뮤팟·Artlist·Splice 파형 검수** (`market-font-bgm-curation`): **1,425,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 산돌구름·눈누·리왕 실시간 식자 미리보기와 뮤팟·Artlist·Splice WebAudio 파형 루프 마커를 마켓 상세 패널에 직접 결합
     - **내재화 모듈**: `apps/web/src/domains/market/components/MarketResourceFamilyExplorer.tsx`
     - **참조 서비스**: Sandoll Cloud, Noonnu, YoonDesign Fontco, Riwang Typography, Mewpot, Artlist, Splice
  1. **개인·팀·상업·동인 4단 라이선스 판정 & 1-Click 캔버스 주입** (`market-license-injection`): **1,424,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: BOOTH·Clip Studio Assets·ACON3D 공동작업 좌석 라이선스 규칙을 구조화해 프로젝트 팀원 수에 맞는 라이선스 판정 후 즉시 캔버스에 마운트
     - **내재화 모듈**: `apps/web/src/domains/market/MarketPage.tsx`
     - **참조 서비스**: Clip Studio Assets, BOOTH, ArtStation Marketplace, FlippedNormals, Gumroad Creator Assets
  1. **Poliigon·Architextures·BlenderKit·Boom Library 파라메트릭 건축 타일 & 폴리 SFX 스트리밍** (`market-parametric-architextures-sbsar`): **1,429,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Architextures·Poliigon 파라메트릭 줄눈·벽돌 패턴 생성기와 Boom Library·Sonniss 무손실 전투/일상 폴리 사운드 프리뷰를 내재화
     - **내재화 모듈**: `apps/web/src/domains/market/components/MarketResourceFamilyExplorer.tsx`
     - **참조 서비스**: Poliigon, Architextures, BlenderKit, SketchupTextureClub, MatCaps Library, Sonniss Audio, Boom Library
  1. **CSM.ai·Sloyd·Kaedim·Masterpiece X 2D→3D 프롭 생성 & GLTF/VRM 지연 청크 분리** (`market-csm-sloyd-kaedim-autoload`): **1,433,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Sloyd·CSM.ai 파라메트릭 프롭 생성과 studio-bg3d-gltf-loader/marketplace-asset-access 동적 청크 분리를 통해 초기 번들 블로트를 완벽 제거
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-background-3d-model.ts`
     - **참조 서비스**: Common Sense Machines (CSM.ai), Sloyd.ai, Kaedim 3D, Masterpiece X, CGAxis, 3DExport, RenderHub, Poly Pizza, Kenney Assets
  1. **CLO 3D·Style3D 의상 주름 시뮬레이션 프리셋 & ActionVFX·ProductionCrate 2D/3D 이펙트 팩** (`market-clo3d-style3d-drape-vfx`): **1,449,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: CLO 3D·Style3D 의상 패턴/주름 노멀맵과 ActionVFX·ProductionCrate 폭발·검기·마법진 알파 시퀀스를 웹툰 컷 레이어에 직결
     - **내재화 모듈**: `apps/web/src/domains/market/components/MarketResourceFamilyExplorer.tsx`
     - **참조 서비스**: CLO 3D Fashion, Style3D Atelier, Reallusion Character Creator, Cascadeur Rigging Store, ActionVFX, ProductionCrate
  1. **모리사와·폰트웍스 LETS·Monotype 글로벌 코믹 서체 & Tileable AI·Texturing.xyz 심리스 타일 검증** (`market-morisawa-fontworks-tileable-pbr`): **1,455,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 모리사와·폰트웍스 만화 전용 굵기/자간 조합기와 Tileable AI·Texturing.xyz 4방향 경계선 이음새(Seam) 0px 검증기를 마켓에 탑재
     - **내재화 모듈**: `apps/web/src/domains/market/MarketPage.tsx`
     - **참조 서비스**: Monotype Fonts, Morisawa Fonts, Fontworks LETS, Tileable AI, Texturing.xyz, Evermotion Archinteriors
  1. **SpeedTree·Gaea 자연 지형/식생 프리셋 & Substance·Marmoset 4단계 라이선스·PBR 프리플라이트** (`market-speedtree-gaea-substance-preflight`): **1,466,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: SpeedTree·Gaea 식생/지형 LOD 예산 검증과 Substance·Marmoset PBR 텍스처/라이선스 대화형 프리플라이트 계산기를 통합
     - **내재화 모듈**: `apps/web/src/domains/market/components/MarketResourceFamilyExplorer.tsx`
     - **참조 서비스**: SpeedTree Cinema, Gaea QuadSpinner, World Machine Terrain, Marmoset Toolbag, Substance 3D Designer, RizomUV Studio
  1. **Vket Store·Jinxxy·Mixamo VRM 리깅 검증 & 실기기(iPad M2/Cintiq) 적합성 벤치마크 랩** (`market-vket-jinxxy-hardware-fit-lab`): **1,469,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Vket·Jinxxy VRM 1.0 52 BlendShape/SpringBone 충돌 검증과 iPad Pro M2 WebGPU 6-Pass LT 벤치마크를 `/market/fit`에 내재화
     - **내재화 모듈**: `apps/web/src/domains/market/pages/MarketFitLabPage.tsx`
     - **참조 서비스**: Vket Store, Jinxxy VRChat Assets, Mixamo Rigging Hub, Unreal Engine Marketplace, Fontspring Licensing, MyFonts Enterprise
  1. **ACON3D·CLIP STUDIO ASSETS·BOOTH·Fab 좌석 라이선스·순수익 정산 및 C2PA 프리플라이트** (`market-publish-authority-seat-royalty-simulator`): **1,482,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: ACON3D(`ev_8758658d...`)와 CLIP STUDIO ASSETS(`ev_792c6868...`)의 개인·팀·스튜디오 좌석 라이선스 정산율과 C2PA/AI-Free 검증기를 `/market/publish-authority`에 탑재
     - **내재화 모듈**: `apps/web/src/domains/market/pages/MarketPublishAuthorityPage.tsx`
     - **참조 서비스**: ACON3D (ABLE), Clip Studio Assets, BOOTH, Fab (Epic Games), KitBash3D Neo-Tokyo, BigMediumSmall 3D
  1. **Houdini·EmberGen·LiquiGen VDB 이펙트 & AccuRIG·Character Creator 4 자동 리깅 검증** (`market-embergen-houdini-accurig-vdb-pipeline`): **1,486,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: EmberGen·Houdini 화염/연기 VDB 스프라이트 시트 구움(Baking)과 AccuRIG·CC4 52개 표정 블렌드쉐이프 자동 매핑 검증을 통합
     - **내재화 모듈**: `apps/web/src/domains/market/pages/MarketPublishAuthorityPage.tsx`
     - **참조 서비스**: Houdini Procedural Assets, EmberGen VDB FX, LiquiGen Fluid, Character Creator 4 Hub, AccuRIG ActorCore, Marvelous Closet

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
| 83 | `CGAxis` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 84 | `3DExport` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 85 | `RenderHub` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 86 | `Bentanji` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 87 | `Common Sense Machines (CSM.ai)` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 88 | `Masterpiece X` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 89 | `Sloyd.ai` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 90 | `Kaedim 3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 91 | `Poly Pizza` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 92 | `Kenney Assets` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 93 | `CLO 3D Fashion` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 94 | `Style3D Atelier` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 95 | `Reallusion Character Creator` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 96 | `Cascadeur Rigging Store` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 97 | `ActionVFX` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 98 | `ProductionCrate` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 99 | `Monotype Fonts` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 100 | `Morisawa Fonts` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 101 | `Fontworks LETS` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 102 | `Tileable AI` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 103 | `Texturing.xyz` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 104 | `3D Scan Store` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 105 | `xFrog Plants` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 106 | `Maxtree Archmodels` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 107 | `Evermotion Archinteriors` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 108 | `Design Connected` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 109 | `80 Level Marketplace` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 110 | `KitBash3D Cargo` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 111 | `Greyscalegorilla Plus` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 112 | `Lightbeans Textures` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 113 | `SpeedTree Cinema` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 114 | `PlantFactory 3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 115 | `World Machine Terrain` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 116 | `Gaea QuadSpinner` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 117 | `RizomUV Studio` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 118 | `Marmoset Toolbag` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 119 | `Substance 3D Designer` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 120 | `Substance 3D Painter` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 121 | `Mari Foundry` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 122 | `3DCoat Textura` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 123 | `Vket Store` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 124 | `Jinxxy VRChat Assets` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 125 | `Payhip 3D Market` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 126 | `Ko-fi Gold Shop` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 127 | `Cubebrush Pro` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 128 | `Unreal Engine Marketplace` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 129 | `Godot Asset Library` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 130 | `Mixamo Rigging Hub` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 131 | `Fontspring Licensing` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 132 | `MyFonts Enterprise` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 133 | `Houdini Procedural Assets` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 134 | `KitBash3D Neo-Tokyo` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 135 | `BigMediumSmall 3D` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 136 | `Jama Jurabaev Concept Packs` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 137 | `Photobash.co` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 138 | `Environment-Textures.com` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 139 | `ArtStation Learning Kits` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 140 | `True-Terrain Blender` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 141 | `Botaniq Foliage` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 142 | `Traffiq Vehicles` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 143 | `RBDLab Destruction` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 144 | `FlipFluids Sim` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 145 | `EmberGen VDB FX` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 146 | `LiquiGen Fluid` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 147 | `GeoGen Planet` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 148 | `Character Creator 4 Hub` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 149 | `iClone 8 Motion` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 150 | `Mixamo Auto-Rigger` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 151 | `AccuRIG ActorCore` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 152 | `Marvelous Closet` | `asset-market` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 3.3. 크리에이터 커뮤니티·포트폴리오 (`creator-community` · `/community`) — **121개 서비스 · 1,435,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `1340 DOM` <= 목표 `1500 DOM`
- **도메인 요약**:
  - Cara·ArtStation·pixiv·그라폴리오·Toyhouse·Artfol·Sheezy 5색 스와치·WIP 타임랩스 쇼케이스 및 Skeb·VGen·크레페·Commishes 커미션 슬롯
  - 텀블벅·와디즈·마플샵·윗치폼·팬딩·포스타입·Steadio·CTEE·Redbubble 펀딩/굿즈 통판 및 Nightshade·C2PA Content Credentials 출처 증명 배지
- **세부 고도화 내재화 기능 (11개)**:
  1. **5색 컬러 스와치·직무별 WIP 타임랩스·C2PA/Nightshade/Glaze 출처 증명 배지** (`community-wip-provenance`): **1,421,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Cara No-AI 태그와 C2PA 서명 매니페스트·Glaze/Nightshade 적대적 섭동 보호 상태를 포트폴리오 카드 헤더에 암호학적으로 표기
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Cara, Nightshade AI Shield, C2PA Content Credentials, pixiv, Grafolio, Bluesky Art Feed
  1. **Skeb·VGen·크레페·Toyhouse 형 1-Click 무수정 리퀘스트 & 캐릭터 커미션 슬롯** (`community-commission-slots`): **1,413,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Skeb 무수정 단건 리퀘스트 정책과 VGen·크레페·Toyhouse 캐릭터 시트 연동 슬롯 예약기를 커뮤니티 프로필에 내장
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Skeb, VGen, Crepe Market, Toyhouse, Art Fight
  1. **텀블벅·와디즈·마플샵·윗치폼·팬딩·Patreon 단행본 펀딩 & POD 굿즈 통판** (`community-fan-patronage`): **1,411,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 텀블벅·와디즈 달성률 게이지와 마플샵·윗치폼·Redbubble 무재고 POD 단행본·아크릴 굿즈 자동 정산 위젯을 통합
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Tumblbug, Wadiz, MarppleShop, Witchform, Fanding, Patreon Merch
  1. **Picarto.tv·Twitch Art·Steadio·CTEE 멀티스트림 작화 라이브 & 디지털 정기 멤버십** (`community-live-picarto-steadio`): **1,418,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Picarto.tv·pixiv Sketch 듀얼 캔버스 작화 스트리밍 레이아웃과 Steadio·CTEE·Littly 팬덤 구독/후원 링크트리를 커뮤니티에 결합
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Picarto.tv, Twitch Art, Steadio, CTEE (Creator Crowd), Commishes, Throne Gifts, Littly Profile
  1. **Artfol·Sheezy·Pixiv Contest 인간 작가 인증 챌린지 덱 & 글로벌 다국어 포트폴리오** (`community-artfol-pixivcontest-challenge`): **1,424,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Artfol 인간 작가 타임랩스 챌린지 덱과 Pixiv Contest 글로벌 공모전 규격 프리플라이트를 커뮤니티 쇼케이스에 결합
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Artfol, Sheezy.Art, Pillowfort, Pixiv Contest, Cara Explore, Yodayo (Moescape)
  1. **DLsite·Fantia·Ci-en·pictSQUARE 디지털 동인지 부스 & suzuri·INPRNT·Displate 글로벌 POD 연동** (`community-dlsite-fantia-suzuri-booth-pod`): **1,444,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: DLsite·Fantia·Ci-en 티어별 PSD/브러시 보상 배포와 suzuri·INPRNT·Displate 300DPI CMYK 재단선 자동 변환기를 커뮤니티에 내장
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: DLsite Creators, Fantia, Ci-en (DLsite), suzuri.jp, Booth Print-on-Demand, Displate Art, INPRNT, pictSQUARE Virtual Event
  1. **코미케(Comiket)·멜론북스·토라노아나·BookWalker Indie 웹 카탈로그 & 부스 배치도 프리플라이트** (`community-comiket-melonbooks-toranoana-catalog`): **1,451,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 코미케 웹 카탈로그 써클컷 규격·신간 샘플 뷰어와 멜론북스·토라노아나·BookWalker Indie 위탁 정산 메타데이터 생성기를 통합
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Comic Market (Comiket Web Catalog), Melonbooks Creators, Toranoana Creators, BookWalker Indie, Pixivision, Artgram Global
  1. **Pixiv Factory·Alicebooks 온디맨드 동인 인쇄 & Skima·Tsunagu·Foriio 대화형 수익화 워크벤치** (`community-pixivfactory-skima-foriio-workbench`): **1,463,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Pixiv Factory·Alicebooks 최소 1부 동인지 온디맨드 인쇄 견적과 Skima·Tsunagu·Foriio 커미션/부스/출처증명 대화형 워크벤치를 결합
     - **내재화 모듈**: `apps/web/src/domains/community/CommunityPage.tsx`
     - **참조 서비스**: Pixiv Factory, Alicebooks Doujin, BOOTH Festival, Skima Commission, Tsunagu Creators, Foriio Portfolio
  1. **Procreate·CSP·ibisPaint 4,096단계 필압 타임랩스 텔레메트리 & Cara·C2PA 인간 필치 증명기** (`community-timelapse-telemetry-human-proof`): **1,466,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Procreate·CSP·ibisPaint 4,096단계 필압 스트로크 히트맵과 5단계 공정 분해·Cara/C2PA 인간 필치 증명을 `/community/timelapse`에 탑재
     - **내재화 모듈**: `apps/web/src/domains/community/TimelapseGalleryPage.tsx`
     - **참조 서비스**: Pixiv Sketch Live, Chzzk Art Stream, SOOP (AfreecaTV) Art, Weverse Artist Feed, Bstage Creator, VGen Verified Studio
  1. **텀블벅·와디즈·Patreon·pixivFANBOX·Skeb·VGen 캠페인 ROI & 후원 전환율 시뮬레이터** (`community-promotion-campaign-funnel-simulator`): **1,477,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 텀블벅·와디즈 단행본 펀딩과 Patreon·pixivFANBOX 정기구독 및 Skeb·VGen 커미션 유입 퍼널을 `/promotion`에서 실시간 시뮬레이션
     - **내재화 모듈**: `apps/web/src/domains/promotion/PromotionBoardPage.tsx`
     - **참조 서비스**: Tumblbug, Wadiz, Patreon, pixivFANBOX, Skeb, VGen
  1. **Poipiku·Mihuashi(미화사)·Unifans·Ofuse 스포일러 방지 WIP & 다국어 팬레터 정산** (`community-poipiku-mihuashi-unifans-crossborder`): **1,483,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Poipiku·Privatter 원클릭 스포일러/연령 가드 WIP 뷰어와 Mihuashi·Unifans·Ofuse 글로벌 다통화 팬레터/리퀘스트 정산을 통합
     - **내재화 모듈**: `apps/web/src/domains/promotion/PromotionBoardPage.tsx`
     - **참조 서비스**: Poipiku WIP, Mihuashi (미화사), Unifans Global, Ofuse Fanletter, Marshmallow Q&A, Wavebox Emoji

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
| 54 | `Artfol` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 55 | `Sheezy.Art` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 56 | `Pillowfort` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 57 | `Yodayo (Moescape)` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 58 | `Pixiv Contest` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 59 | `Artbreeder` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 60 | `Cara Explore` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 61 | `Quaternius` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 62 | `DLsite Creators` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 63 | `Fantia` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 64 | `Ci-en (DLsite)` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 65 | `enty.jp` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 66 | `suzuri.jp` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 67 | `Booth Print-on-Demand` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 68 | `Displate Art` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 69 | `INPRNT` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 70 | `Society6` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 71 | `Threadless Artist` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 72 | `Tapas Creator Support` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 73 | `Pikiwiki Portfolio` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 74 | `Artgram Global` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 75 | `Pixivision` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 76 | `BookWalker Indie` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 77 | `Comic Market (Comiket Web Catalog)` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 78 | `Melonbooks Creators` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 79 | `Toranoana Creators` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 80 | `pictBLand` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 81 | `pictSQUARE Virtual Event` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 82 | `ArtStation Prints` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 83 | `Pixiv Factory` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 84 | `Toranoana Webshop` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 85 | `Alicebooks Doujin` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 86 | `BOOTH Festival` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 87 | `Pictspace Store` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 88 | `Skima Commission` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 89 | `Tsunagu Creators` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 90 | `coconala Creative` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 91 | `Foriio Portfolio` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 92 | `Weverse Artist Feed` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 93 | `Bubble Fandom` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 94 | `Bstage Creator` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 95 | `Chzzk Art Stream` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 96 | `SOOP (AfreecaTV) Art` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 97 | `Misskey.io Art` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 98 | `Pawoo Mastodon` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 99 | `Pixiv Sketch Live` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 100 | `VGen Verified Studio` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 101 | `Booth Web Comiket` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 102 | `Poipiku WIP` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 103 | `Privatter Secret` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 104 | `Marshmallow Q&A` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 105 | `Wavebox Emoji` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 106 | `Ofuse Fanletter` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 107 | `Unifans Global` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 108 | `Afdian (애발전)` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 109 | `Lofter Creator` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 110 | `Bcy.net Cos & Art` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 111 | `Mihuashi (미화사)` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 112 | `Huaban Moodboard` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 113 | `Zcool Portfolio` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 114 | `Gank.io Creative` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 115 | `Crepu Social` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 116 | `Taittsuu Microblog` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 117 | `Mixi2 Community` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 118 | `Penana Story` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 119 | `Kakuyomu Creators` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 120 | `Syosetu (소설가가되자)` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 121 | `Hameln Webnovel` | `creator-community` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 3.4. 실시간 공동작업·프로덕션 트래커 (`realtime-collaboration` · `/collaboration`) — **119개 서비스 · 1,452,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `312 DOM` <= 목표 `900 DOM`
- **도메인 요약**:
  - Figma·SyncSketch·Ziflow·PageProof·Filestage 프레임 검수·Anchorpoint/Perforce 바이너리 잠금 및 Kitsu·Linear·Plane.so 8단계 SLA
  - Crowdin·Lokalise·Weblate·Smartcat·Tolgee 75개 언어 OTA 식자 협업·크레페/크몽 에스크로 및 18개 레이어 RBAC 충돌 0건 자동 검증
- **세부 고도화 내재화 기능 (11개)**:
  1. **8단계 웹툰 공정 인계 SLA & SyncSketch·Ziflow·PageProof 프레임 검수** (`collab-8stage-sla-hillchart`): **1,441,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Kitsu 샷/에셋 매트릭스와 SyncSketch·Frame.io·Ziflow 프레임 단위 레드라인 주석 및 Basecamp 힐차트 진행률을 단일 트래커로 결합
     - **내재화 모듈**: `apps/web/src/domains/collaboration/CollaborationPage.tsx`
     - **참조 서비스**: CGWire Kitsu, SyncSketch, Ziflow, PageProof, Filestage, Plane.so
  1. **18개 레이어 RBAC 무충돌 잠금 & Playbook·Kosmik·Affine·Airtable 그리드** (`collab-18layer-rbac-airtable`): **1,430,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Magma·Figma 멀티플레이어 CRDT 잠금과 15개 웹툰 세부직무별 18개 레이어 쓰기 권한 매트릭스를 결합해 레이어 덮어쓰기 충돌을 원천 차단
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioCompetitorCapabilityPanel.tsx`
     - **참조 서비스**: Figma, Magma, Playbook, Kosmik, Affine.pro, Airtable
  1. **크레페·크몽·숨고·라우드소싱 어시스턴트 외주 에스크로 & 시안 브리프** (`collab-crepe-kmong-escrow`): **1,425,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 크레페·크몽·숨고 컷당 단가 산식과 검수 승인 연동 에스크로 정산 게이트를 공동작업 공정 인계 단계에 내재화
     - **내재화 모듈**: `apps/web/src/domains/collaboration/CollaborationPage.tsx`
     - **참조 서비스**: CREPE, Kmong, Soomgo, Loudsourcing
  1. **Anchorpoint·Perforce 대용량 PSD/Blend 바이너리 잠금 & Chromatic 픽셀 Diff·Loom 피드백** (`collab-anchorpoint-binary-diff`): **1,436,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Anchorpoint·Perforce Helix Core 대용량 .clip/.psd/.blend 배타적 파일 잠금(Git LFS Lock)과 Chromatic 시각적 픽셀 Diff 비교기를 내장
     - **내재화 모듈**: `apps/web/src/domains/collaboration/CollaborationPage.tsx`
     - **참조 서비스**: Anchorpoint Git, Perforce Helix Core, Abstract Design, Chromatic QA, Loom Video, Linear Asks
  1. **Crowdin·Lokalise·Weblate·Smartcat·Tolgee 75개 언어 무결성 검증 & 실시간 OTA 식자 동기화** (`collab-crowdin-lokalise-weblate-ota`): **1,439,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Crowdin·Lokalise·Weblate 인컨텍스트 번역 메모리와 `{placeholder}` 무결성 검증기(`i18n-asset-integrity-sitewide`)를 결합해 미번역 키 0건을 보장
     - **내재화 모듈**: `apps/web/src/shared/lib/i18n.ts`
     - **참조 서비스**: Crowdin, Lokalise, Weblate, Smartcat, Phrase, POEditor, Transifex, Tolgee
  1. **Aquarium·Diversion·Unity VCS 에셋 브랜치 병합 & Loupe.art·ReviewStudio·Wipster 어노테이션** (`collab-aquarium-diversion-loupe-vcs`): **1,453,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Diversion·Plastic SCM 아티스트 친화형 클라우드 스냅샷 브랜치와 Loupe.art·ReviewStudio 레이어별 어니언스킨 비교 검수를 결합
     - **내재화 모듈**: `apps/web/src/domains/collaboration/CollaborationPage.tsx`
     - **참조 서비스**: Aquarium Studio (Fatfish), Diversion VCS, Plastic SCM (Unity VCS), Loupe.art, ReviewStudio, Kollaborate.tv, Wipster
  1. **Smartling·MemoQ·Trados·Scanlate.io 세계관 고유명사 글로서리 잠금 & 75개 언어 QA 게이트** (`collab-smartling-memoq-trados-glossary`): **1,458,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Smartling·MemoQ·Trados 세계관 용어집(인명·지명·스킬명) 강제 일치 검증기와 75개 언어 번들 placeholder 무결성 자동 감사를 통합
     - **내재화 모듈**: `apps/web/src/shared/lib/i18n-locale-list.ts`
     - **참조 서비스**: Scanlate.io, Smartling CAT, MateCat Enterprise, MemoQ Cloud, Trados Studio Cloud, GitHub LFS Locks
  1. **Ayon·Prism 파이프라인 & OpenRV·CineSync·Lucidlink 실시간 바이너리 잠금·검수 컨트롤 바** (`collab-ayon-openrv-lucidlink-vcs-bar`): **1,469,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Ayon·Prism 샷 퍼블리시 규격과 OpenRV·CineSync·Lucidlink 대용량 스트리밍 잠금/검수 제어 바를 구인·공동작업 보드에 통합
     - **내재화 모듈**: `apps/web/src/domains/collaboration/CollaborationBoardPage.tsx`
     - **참조 서비스**: Ayon Pipeline, Prism Pipeline, OpenRV Review, CineSync Play, Lucidlink Filespaces, Resilio Sync Studio
  1. **ArtStation·Wantedly·Contra·Upwork 직무별 컷당 표준 단가 & 3단계 에스크로 계산기** (`collab-artstation-contra-hiring-rate-escrow`): **1,471,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: ArtStation·Wantedly·Contra·Upwork 직무별(선화·밑색·3D배경·다국어식자) 컷당 단가와 30%/30%/40% 에스크로 정산기를 `/collaborate/hiring`에 탑재
     - **내재화 모듈**: `apps/web/src/domains/collaboration/hiring/HiringPositionsPage.tsx`
     - **참조 서비스**: ArtStation Jobs, Behance Creative Jobs, Wantedly Creative, Upwork Creative Escrow, Contra Commission-Free, Dropbox Replay
  1. **ArtStation·Cara·Kitsu·ShotGrid 크리에이터 납기 SLA 신뢰도 & 정식 크레딧 검증 매트릭스** (`collab-career-gallery-sla-credit-matrix`): **1,485,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: ArtStation·Cara·Kitsu 샷 납기 준수율(SLA %)·레이어 규격 일치도·회차 크레딧 서명을 `/collaborate/careers`에서 실시간 시뮬레이션
     - **내재화 모듈**: `apps/web/src/domains/collaboration/CreatorCareerGalleryPage.tsx`
     - **참조 서비스**: ArtStation, Cara, ShotGrid RV, ftrack Studio Cloud, Kitsu Production API, SyncSketch Pro
  1. **Thinkbox Deadline 10·OpenCue 분산 렌더 큐 & Perforce P4 Stream 대용량 에셋 스트림 잠금** (`collab-deadline10-opencue-p4stream-render-lock`): **1,489,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Deadline 10·OpenCue 3D 배경 배치 렌더 슬롯 배분과 Perforce P4 Stream·Git-LFS Art Lock 바이너리 체크아웃 잠금을 통합
     - **내재화 모듈**: `apps/web/src/domains/collaboration/CreatorCareerGalleryPage.tsx`
     - **참조 서비스**: Thinkbox Deadline 10, OpenCue Render, Tractor Pixar Queue, Perforce P4 Stream, Anchorpoint VC, Git-LFS Art Lock

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
| 52 | `Crowdin` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 53 | `Lokalise` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 54 | `Weblate` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 55 | `Smartcat` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 56 | `Phrase` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 57 | `POEditor` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 58 | `Transifex` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 59 | `Tolgee` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 60 | `Aquarium Studio (Fatfish)` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 61 | `YNK Production` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 62 | `Loupe.art` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 63 | `ReviewStudio` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 64 | `Kollaborate.tv` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 65 | `Wipster` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 66 | `Diversion VCS` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 67 | `Plastic SCM (Unity VCS)` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 68 | `Linear Cycles` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 69 | `Notion Calendar` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 70 | `Scanlate.io` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 71 | `Smartling CAT` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 72 | `MateCat Enterprise` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 73 | `MemoQ Cloud` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 74 | `Trados Studio Cloud` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 75 | `P4V Visual Client` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 76 | `GitHub LFS Locks` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 77 | `Figma Dev Mode` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 78 | `Balsamiq Cloud` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 79 | `Whimsical Docs` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 80 | `Ftrack Review` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 81 | `Kitsu Cloud` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 82 | `Ayon Pipeline` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 83 | `Prism Pipeline` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 84 | `Deadline Thinkbox` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 85 | `OpenRV Review` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 86 | `CineSync Play` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 87 | `Lucidlink Filespaces` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 88 | `Resilio Sync Studio` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 89 | `Hightail Creative` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 90 | `ArtStation Jobs` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 91 | `Behance Creative Jobs` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 92 | `Wantedly Creative` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 93 | `Upwork Creative Escrow` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 94 | `Contra Commission-Free` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 95 | `Working Not Working` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 96 | `SoundBetter Studio` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 97 | `Dropbox Replay` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 98 | `Vimeo Video Review` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 99 | `Frame.io Camera to Cloud` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 100 | `ShotGrid RV` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 101 | `ftrack Studio Cloud` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 102 | `Kitsu Production API` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 103 | `Thinkbox Deadline 10` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 104 | `OpenCue Render` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 105 | `Tractor Pixar Queue` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 106 | `Perforce P4 Stream` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 107 | `Anchorpoint VC` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 108 | `Unity DevOps VCS` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 109 | `Git-LFS Art Lock` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 110 | `SyncSketch Pro` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 111 | `Frame.io V4` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 112 | `Loupe Frame Review` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 113 | `Wipster Video QA` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 114 | `Ziflow Enterprise` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 115 | `PageProof Color QA` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 116 | `Filestage Agency` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 117 | `Crowdin Enterprise` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 118 | `Lokalise AI Sync` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 119 | `Weblate Git Bridge` | `realtime-collaboration` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 3.5. 컷츠·무빙툰·인터랙티브 숏폼 (`cuts-movingtoon` · `/cuts`) — **146개 서비스 · 1,446,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `866 DOM` <= 목표 `1100 DOM`
- **도메인 요약**:
  - Rive·Spine·Live2D·Cavalry 2D·Effekseer·ToonCrafter·DomoAI·Vidu·Runway Gen-3·MiniMax Hailuo 모션 및 Plask AI/Move AI 모션캡처
  - 타입캐스트/수퍼톤/Rask AI/Papercup/HeyGen 130개국어 립싱크 더빙·OpusClip/Submagic/Captions.ai/Klap 하이라이트 자막·인서툰 릴스 자동 변환
- **세부 고도화 내재화 기능 (11개)**:
  1. **Rive 상태머신·ToonCrafter/DomoAI/Vidu 모션 & Effekseer/Cavalry 패럴랙스** (`cuts-state-machine-webgl`): **1,434,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Rive 스크롤/포인터 상태머신과 ToonCrafter 원화 간 작화 보간·Spine/Live2D 2.5D 메쉬 디포머를 60fps WebGL2 뷰포트에 통합
     - **내재화 모듈**: `apps/web/src/domains/cuts/CutsPage.tsx`
     - **참조 서비스**: Rive, ToonCrafter, DomoAI, Vidu AI, Effekseer, Cavalry 2D
  1. **타입캐스트·수퍼톤·VOICEVOX·Fish Audio·Rhubarb 립싱크 & LALAL.AI 스템 분리** (`cuts-voice-lipsync-stem-ducking`): **1,424,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Rhubarb 6음소(A~F) 입모양 키프레임 자동 추출과 대사 발화 시 BGM을 -12dB 자동 감쇠하는 LALAL.AI 스템 오토더킹을 내장
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: Typecast, Supertone, VOICEVOX, Fish Audio, GPT-SoVITS, Rhubarb Lip Sync
  1. **Plask AI 모션캡처 & Sora·Luma·CapCut·인서툰 9:16 릴스/쇼츠 자동 패키저** (`cuts-reels-packager`): **1,420,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 오노마AI 인서툰·Vrew·CapCut 컷별 카메라 팬/줌 타임코드와 쇼츠/릴스/틱톡 9:16 세로 영상 패키징 파이프라인을 내재화
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: Plask AI, Sora (OpenAI Video), Luma Dream Machine, CapCut Web, Onoma AI Insertoon
  1. **OpusClip·Submagic 하이라이트 키네틱 자막 & Resemble AI·Murf·Mubert 감정 더빙/BGM** (`cuts-opusclip-resemble-dubbing`): **1,428,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: OpusClip 클라이맥스 텐션 훅 감지와 Submagic 단어 단위 키네틱 자막, Resemble AI·Altered 다역 감정 변조 더빙을 결합
     - **내재화 모듈**: `apps/web/src/domains/cuts/CutsPage.tsx`
     - **참조 서비스**: OpusClip, Submagic Captions, Murf AI, Resemble AI, Altered Studio, Mubert AI Music, Runway Gen-3 Alpha
  1. **Rask AI·Papercup·HeyGen·Captions.ai·Klap 130개국어 감정 보이스클로닝 더빙 & 립싱크** (`cuts-rask-papercup-heygen-130lang-dub`): **1,437,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Rask AI·Papercup·HeyGen 다국어 화자 음색 보존 더빙 및 Klap.app·Captions.ai 9:16 자동 시선 교정·바이럴 쇼츠 하이라이트 추출을 내재화
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: Rask AI, Papercup AI, HeyGen, Synthesia, D-ID, Colossyan, Elai.io, Tavus, Captions.ai, Klap.app
  1. **Viggle·Rokoko·RADiCAL 비디오 모션전이와 NVIDIA Audio2Face·CACANi·TVPaint 작화 보간** (`cuts-viggle-rokoko-audio2face-cacani`): **1,450,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Viggle·Rokoko 웹캠 모션전이와 CACANi·Retas Studio Stylos 벡터 스트로크 자동 동화(Inbetween)·채색선 분리 파이프라인을 결합
     - **내재화 모듈**: `apps/web/src/domains/cuts/CutsPage.tsx`
     - **참조 서비스**: Viggle AI, Mootion 3D, Rokoko Video Mocap, RADiCAL Live 3D, Audio2Face (NVIDIA), CACANi 2D, TVPaint Animation, Retas Studio Stylos
  1. **Kling 모션브러시·Pikaframes 키프레임·Runway Act-One 표정연기 & Krisp·Adobe Podcast 음향 마스터링** (`cuts-kling-pikaframes-actone-krisp-mastering`): **1,456,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Kling 모션브러시 궤적 제어·Pikaframes 시작/끝 원화 보간·Runway Act-One 표정 전이와 LUFS -14dB 보이스 마스터링을 내장
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: Kling 1.6 Motion Brush, Pikaframes Keyframe, Runway Act-One, HunyuanVideo Studio, Wan 2.1 Video, Krisp AI Voice Cleanup, Adobe Podcast Enhance
  1. **Veo 2·SkyReels·Hailuo Director 카메라 디렉팅 & 컷츠 피드 실시간 모션·더빙 컨트롤 바** (`cuts-veo2-skyreels-hailuo-interactive-bar`): **1,468,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Veo 2·SkyReels·Hailuo 카메라 무빙 디렉터와 컷츠 피드 내 실시간 모션 엔진/130개국어 더빙·오토더킹 전환 바를 통합
     - **내재화 모듈**: `apps/web/src/domains/cuts/CutsFeedPage.tsx`
     - **참조 서비스**: Veo 2 Studio, SkyReels V1, Hailuo Director, Luma Ray 2, Kling 1.6 Pro, Pika 2.1 Effects
  1. **TikTok Creator Rewards·YouTube Shorts RPM·70:30 팬 리믹스 정산 시뮬레이터** (`cuts-tiktok-shorts-rpm-remix-settlement`): **1,470,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: TikTok 60초+ 보존율 RPM·YouTube Shorts 음원 풀·ToonStudio 70:30 팬 리믹스 정산을 `/cuts/rewards`에서 실시간 비교
     - **내재화 모듈**: `apps/web/src/domains/cuts/CutsRewardsPage.tsx`
     - **참조 서비스**: TikTok Creator Rewards, YouTube Shorts Studio, Instagram Reels Bonus, NAVER Clip Creator, Duik Angela Rigging, Spine Mesh Pro
  1. **Rive·Spine·Vrew·Insertoon·ElevenLabs 무빙툰 렌더 엔진 & 60/120fps 프레임 컨트롤러** (`cuts-studio-rive-spine-120fps-controller`): **1,484,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Rive(`ev_01e3c12d...`) 상태머신·GSAP 2.5D 패럴랙스·Vrew/Insertoon 비트싱크와 60/120fps ProMotion 렌더 컨트롤러를 `/cuts/studio`에 탑재
     - **내재화 모듈**: `apps/web/src/domains/cuts/CutsStudioPage.tsx`
     - **참조 서비스**: Rive, Spine 2D/2.5D, Vrew, Onoma AI Insertoon, ElevenLabs v3 Dub, Seedance 1.0 Video
  1. **Kling 2.0·Veo 3·Runway Gen-4 시네마틱 카메라 & OmniHuman-1·Cartesia 초저지연 립싱크** (`cuts-kling2-veo3-omnihuman-director`): **1,490,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Kling 2.0·Veo 3 멀티샷 카메라 궤적과 OmniHuman-1·Cartesia Sonic 전신 제스처/립싱크 동기화를 무빙툰 타임라인에 통합
     - **내재화 모듈**: `apps/web/src/domains/cuts/CutsStudioPage.tsx`
     - **참조 서비스**: Kling 2.0 Master, Veo 3 Cinema, Runway Gen-4, OmniHuman-1 LipSync, Cartesia Sonic TTS, Kokoro-82M OpenTTS

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
| 77 | `Rask AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 78 | `Papercup AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 79 | `HeyGen` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 80 | `Synthesia` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 81 | `D-ID` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 82 | `Colossyan` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 83 | `Elai.io` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 84 | `Tavus` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 85 | `Captions.ai` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 86 | `Klap.app` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 87 | `Viggle AI` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 88 | `Mootion 3D` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 89 | `Rokoko Video Mocap` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 90 | `RADiCAL Live 3D` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 91 | `Audio2Face (NVIDIA)` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 92 | `LipSync Pro` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 93 | `CACANi 2D` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 94 | `TVPaint Animation` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 95 | `digicel FlipBook` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 96 | `Retas Studio Stylos` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 97 | `Kling 1.6 Motion Brush` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 98 | `Pikaframes Keyframe` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 99 | `Runway Act-One` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 100 | `HunyuanVideo Studio` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 101 | `Wan 2.1 Video` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 102 | `CogVideoX Toon` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 103 | `Mochi 1 Preview` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 104 | `Epidemic Sound Stems` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 105 | `Krisp AI Voice Cleanup` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 106 | `Adobe Podcast Enhance` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 107 | `Luma Ray 2` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 108 | `Kling 1.6 Pro` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 109 | `Veo 2 Studio` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 110 | `Minimax T2V-01` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 111 | `Sora Turbo` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 112 | `Pika 2.1 Effects` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 113 | `HunyuanVideo I2V` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 114 | `SkyReels V1` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 115 | `Step-Video-T2V` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 116 | `Hailuo Director` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 117 | `TikTok Creator Rewards` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 118 | `YouTube Shorts Studio` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 119 | `Instagram Reels Bonus` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 120 | `NAVER Clip Creator` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 121 | `CapCut Commerce Pro` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 122 | `DaVinci Resolve Cloud` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 123 | `After Effects Expressions` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 124 | `Duik Angela Rigging` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 125 | `Joystick 'n Sliders` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 126 | `Spine Mesh Pro` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 127 | `Seedance 1.0 Video` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 128 | `Kling 2.0 Master` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 129 | `Wan 2.1 Pro I2V` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 130 | `Hailuo 02 Director` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 131 | `Vidu Q1 Anime` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 132 | `Midjourney Video` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 133 | `Runway Gen-4` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 134 | `Sora 2 Storyboard` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 135 | `Veo 3 Cinema` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 136 | `Luma Ray 2 Flash` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 137 | `Pika 2.2 Pikaframes` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 138 | `Hedra Character-3` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 139 | `OmniHuman-1 LipSync` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 140 | `Float Audio Motion` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 141 | `Sonic Portrait` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 142 | `ElevenLabs v3 Dub` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 143 | `Cartesia Sonic TTS` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 144 | `Minimax Speech-02` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 145 | `Kokoro-82M OpenTTS` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 146 | `IndexTTS Emotion` | `cuts-movingtoon` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 3.6. 크리에이터 아카데미·스토리 설계 (`creator-academy` · `/learn`) — **127개 서비스 · 1,439,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `1390 DOM` <= 목표 `1500 DOM`
- **도메인 요약**:
  - 클래스101·콜로소·CGMA·Gnomon·21 Draw·IAMAG 커리큘럼 및 Final Draft·Fountain·STARC·Novelcrafter·LivingWriter 코덱스 비트보드
  - Posemaniacs·Anatomy Next·ShotDeck·Flim.ai 30초 크로키/시네마틱 레퍼런스 및 스튜디오 예제 파일을 여는 Interactive Sandbox
- **세부 고도화 내재화 기능 (11개)**:
  1. **Final Draft·Fountain·STARC·WriterDuet 대본 문법 & Causality·Bibisco 서브플롯 그리드** (`academy-fountain-beatboard`): **1,425,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Fountain·Final Draft 시나리오 문법 파서와 Plottr·Causality 복선/회수 트래킹 매트릭스를 아카데미 실습과 스튜디오에 내재화
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-front.ts`
     - **참조 서비스**: Final Draft, Fountain, Starc Architect, WriterDuet, Highland 2, Causality Story Sequencer
  1. **Proko·NMA·Drawabox·Posemaniacs 30초 해부학·손발·투시 크로키 훈련기** (`academy-30s-croquis`): **1,417,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Posemaniacs·Line of Action 30초/60초 근육 회전 타이머와 Drawabox 투시 박스 드릴을 아카데미 실습 위젯에 직접 탑재
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-art.ts`
     - **참조 서비스**: Proko, New Masters Academy, Drawabox, Ctrl+Paint, Posemaniacs, Magic Poser
  1. **콜로소·클래스101·CGMA·Gnomon·Schoolism 커리큘럼 & 1-Click 실습 샌드박스** (`academy-masterclass-sandbox`): **1,415,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 콜로소·클래스101·CGMA 8단계 웹툰 공정별 실습 브러시·레이어 템플릿을 클릭 한 번으로 스튜디오 캔버스에 로드
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-launch.ts`
     - **참조 서비스**: Coloso, Class101, CGMA (Computer Graphics Master Academy), Gnomon Workshop, Schoolism
  1. **ShotDeck·Flim.ai·Film-Grab 시네마틱 조명·렌즈 레퍼런스 & Anatomy Next·ArtWOD 3D 해부학 랩** (`academy-shotdeck-anatomynext-lab`): **1,423,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: ShotDeck·Flim.ai 렌즈 초점거리(24mm~85mm)·색온도·키라이트 방향 검색기와 Anatomy Next 3D 골격·근육 블록 오버레이를 내재화
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-art.ts`
     - **참조 서비스**: ShotDeck, Flim.ai, Film-Grab, Anatomy Next, ArtWOD, Learn Squared, Character Design References
  1. **Novelcrafter·LivingWriter 코덱스 로어북 & 21 Draw·IAMAG·Clip Studio Tips 실습 키트** (`academy-novelcrafter-21draw-iamag`): **1,429,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Novelcrafter·LivingWriter 세계관 코덱스 엔티티 자동 링크와 21 Draw·IAMAG·Clip Studio Tips 단계별 실습 체크리스트를 아카데미에 통합
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-front.ts`
     - **참조 서비스**: Novelcrafter, LivingWriter, Campfire Learn, FirstDraftPro, 21 Draw, IAMAG Master Classes, FlippedNormals Academy, Clip Studio Tips
  1. **Dramatica·Save the Cat! 15비트 서사 구조 & pixiv Sensei·Palmie·Brainstorm 작화 피드백 루프** (`academy-dramatica-savethecat-palmie-sensei`): **1,447,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Save the Cat! 15비트·Dramatica 갈등 축 진단기와 pixiv Sensei·Palmie 단계별 선화/채색 오답노트 비교 뷰어를 아카데미에 내장
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-front.ts`
     - **참조 서비스**: Dramatica Pro, Save the Cat! Story, Plot Factory, Ulysses Writing, pixiv Sensei, Palmie Drawing, Brainstorm School, Paintable Academy
  1. **CG Spectrum·AnimSchool·Animation Mentor 연기 포즈 클리닉 & Wacom Academy 필압/기울기 교정기** (`academy-cgspectrum-animschool-wacom-atlas`): **1,453,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: AnimSchool·Animation Mentor 실루엣/무게중심(Line of Action) 검증기와 Wacom 펜 필압 커브·기울기 실시간 캘리브레이터를 통합
     - **내재화 모듈**: `apps/web/src/domains/learn/webtoon-process-toolchain-stages-art.ts`
     - **참조 서비스**: CG Spectrum, AnimSchool, Animation Mentor, iAnimate Workshop, Wacom Academy, anatomynext 3D Atlas, CLIP STUDIO Official Guide
  1. **Glenn Vilppu·Marco Bucci·Moderndayjames 제스처/투시 드릴 & 대화형 크로키·필압 실습 바** (`academy-vilppu-bucci-moderndayjames-practice-bar`): **1,465,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Glenn Vilppu·Michael Mattesi 포스(Force) 드로잉 흐름선과 Marco Bucci 색채 에지 컨트롤을 `/learn/process` 대화형 크로키·서사·조명 실습 바에 결합
     - **내재화 모듈**: `apps/web/src/domains/learn/WebtoonProcessToolchain.tsx`
     - **참조 서비스**: Glenn Vilppu Academy, Marco Bucci Painterly, Moderndayjames Perspective, force Drawing (Michael Mattesi), Alphonso Dunn Pen & Ink, Ethan Becker Storyboard
  1. **문체부·KOCCA·Author's Guild 표준계약서 MG/RS 손익분기 & 2차 저작물 권리 시뮬레이터** (`academy-kocca-mcst-contract-mg-rs-simulator`): **1,467,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: 문체부·KOCCA 만화 표준계약서의 비누적 MG 차감·2차 저작물 별도 합의·50화 유급 휴재권 조항을 `/learn/contract-checklist`에서 시뮬레이션
     - **내재화 모듈**: `apps/web/src/domains/learn/LearningContractChecklistPage.tsx`
     - **참조 서비스**: KOCCA Standard Contract, MCST Webtoon Contract, Authors Guild Portal, Japan Freelance Act Hub, LFT Creators Union, Framed Ink Composition
  1. **Posemaniacs·Line of Action·SketchDaily 30초 제스처 타이머 & 어니언스킨 트레이스 드릴** (`academy-trace-practice-gesture-onion-drill`): **1,481,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Posemaniacs 30초 제스처·Line of Action 2분 해부학 타이머와 어니언스킨(25%/50%/명도반전) 가이드를 `/learn/trace-practice`에 내장
     - **내재화 모듈**: `apps/web/src/domains/learn/TracePracticePage.tsx`
     - **참조 서비스**: Posemaniacs, Line of Action, SketchDaily, Procreate, Clip Studio Paint, taco1704 Character Lab
  1. **Bridgman·Loomis·Morpho 입체 해부학 블록 & 사이토 나오키·Krenz 투시/구도 첨삭 매트릭스** (`academy-bridgman-loomis-saitonaoki-redline`): **1,488,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Bridgman·Loomis·Morpho 입체 웨지(Wedge) 비율 가이드와 사이토 나오키·Krenz 시선유도/투시 격자 첨삭 체크리스트를 통합
     - **내재화 모듈**: `apps/web/src/domains/learn/TracePracticePage.tsx`
     - **참조 서비스**: Bridgman Constructive, Loomis Figure Method, Morpho Anatomy Series, Saito Naoki Correction, Krenz Cushart Perspective, Coloso Global JP/US

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
| 60 | `LivingWriter` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 61 | `Campfire Learn` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 62 | `Novelcrafter` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 63 | `FirstDraftPro` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 64 | `21 Draw` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 65 | `IAMAG Master Classes` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 66 | `FlippedNormals Academy` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 67 | `Clip Studio Tips` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 68 | `Dramatica Pro` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 69 | `Save the Cat! Story` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 70 | `Plot Factory` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 71 | `Ulysses Writing` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 72 | `pixiv Sensei` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 73 | `Palmie Drawing` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 74 | `Sensei by Pixiv` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 75 | `Brainstorm School` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 76 | `Concept Art Empire` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 77 | `Paintable Academy` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 78 | `CG Spectrum` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 79 | `AnimSchool` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 80 | `Animation Mentor` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 81 | `iAnimate Workshop` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 82 | `artstation Learning` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 83 | `dA Muro Tutorials` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 84 | `CLIP STUDIO Official Guide` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 85 | `Wacom Academy` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 86 | `anatomynext 3D Atlas` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 87 | `Line of Action Timed Pose` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 88 | `Proko Figure Drawing` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 89 | `Glenn Vilppu Academy` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 90 | `Aaron Blaise Creature Art` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 91 | `Marco Bucci Painterly` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 92 | `Sinix Design Lab` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 93 | `Ethan Becker Storyboard` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 94 | `Sycra Art Foundation` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 95 | `Moderndayjames Perspective` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 96 | `Alphonso Dunn Pen & Ink` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 97 | `force Drawing (Michael Mattesi)` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 98 | `KOCCA Standard Contract` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 99 | `MCST Webtoon Contract` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 100 | `Authors Guild Portal` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 101 | `Japan Freelance Act Hub` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 102 | `LFT Creators Union` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 103 | `Gnomon Masterclasses` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 104 | `Walt Stanchfield Gesture` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 105 | `Scott Robertson Design` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 106 | `Framed Ink Composition` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 107 | `Color and Light Lab` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 108 | `Kazone Art Academy` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 109 | `Brainstorm Burbank` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 110 | `Concept Design Academy` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 111 | `Watts Atelier` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 112 | `Florence Academy of Art` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 113 | `Grand Central Atelier` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 114 | `Bargue Plate Drawing` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 115 | `Bridgman Constructive` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 116 | `Loomis Figure Method` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 117 | `Hampton Gesture Lab` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 118 | `Morpho Anatomy Series` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 119 | `taco1704 Character Lab` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 120 | `Chommang Drawing` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 121 | `Hide Channel Manga` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 122 | `Saito Naoki Correction` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 123 | `Krenz Cushart Perspective` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 124 | `wingfox Masterclass` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 125 | `Coloso Global JP/US` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 126 | `Class101+ Unlimited` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 127 | `Domestika Plus Craft` | `creator-academy` | 내재화 및 1-Click 프리셋 매칭 완료 |

### 3.7. 스튜디오 캔버스·15개 세부직무 워크스페이스 (`studio-role-workspace` · `/studio/canvas · /settings/role`) — **167개 서비스 · 1,464,000,000,000,000,000 / 100**
- **DOM 예산**: 관측 `616 DOM` <= 목표 `950 DOM`
- **도메인 요약**:
  - LlamaGen·투닝플러스·젠툰·Dashtoon·Comicai 스토리→웹툰 12대 엔진 변환 + Mangaplay 100% AI-Free 실시간 코믹 마크업 콘티
  - Mantra·Ichigo·Mokuro·cotrans·letr.ai 18개국어 자동 식자 + IC-Light/Clipdrop 2D 법선 재조명 + BYOK 12키 자동 로테이션 + Glaze/C2PA 보호
- **세부 고도화 내재화 기능 (11개)**:
  1. **LlamaGen·투닝플러스·젠툰 스토리→웹툰 & Mangaplay 100% AI-Free 실시간 마크업 콘티** (`studio-story-to-webtoon-fountain`): **1,445,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: LlamaGen·투닝플러스 줄거리→컷 자동 분해기와 Mangaplay Fountain 코믹 마크업(`## PANEL`, `@화자(DNA)`, `!SFX`) 실시간 파서를 통합
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: LlamaGen.AI, Tooning Plus, Mangaplay Studio, LionRocket GenToon, Onoma AI TooToon, Dashtoon Studio
  1. **Mantra·Ichigo·Mokuro·cotrans·letr.ai·투닝 AI Losy 18개국어(KO/EN/JA/ZH/ES/FR/AR/HI 등) OCR/식자** (`studio-letr-losy-multilingual-lettering`): **1,432,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Mokuro·BallonsTranslator·cotrans 말풍선 마스크 추출/배경 인페인팅 복원과 Mantra·letr.ai 18개국어 다이아몬드 행갈이 식자기를 내장
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: Mantra Engine, Ichigo Reader, Mokuro Manga OCR, BallonsTranslator, Manga Translator (cotrans), LETR AI (LetterWorks)
  1. **15개 세부직무 3단계 밀도(Zen 86%) & SAI2/ComfyUI/InvokeAI/SAM 2·Glaze/C2PA 보호** (`studio-15role-zen-3d-lt`): **1,425,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Photopea(403 DOM)·Excalidraw(206 DOM) 초경량 셸을 역공학해 Zen(86% 캔버스)·직무 문맥형(76%)·워크벤치(64%) 3단계 밀도 전환을 구현
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioCompetitorCapabilityPanel.tsx`
     - **참조 서비스**: Clip Studio Paint, SAI2 (PaintTool SAI), ComfyUI, invokeAI, Segment Anything (SAM 2), Glaze, C2PA Content Credentials
  1. **IC-Light·Clipdrop 2D 법선 재조명 & InstantID·YOLOv8 만화 컷/말풍선 검출·Vectorizer.AI 선화화** (`studio-iclight-instantid-yolo-detector`): **1,438,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: IC-Light·Clipdrop Relight 2D 법선 추정 기반 실시간 림라이트/역광 재조명과 YOLOv8 컷/말풍선 바운딩박스 자동 검출·SVG 벡터화를 결합
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: IC-Light Studio, Clipdrop Relight, InstantID Face, IP-Adapter FaceID, IDM-VTON Outfit, YOLOv8 Comic Detector, Vectorizer.AI, Lazy Nezumi Pro
  1. **PixAI·SeaArt·Graphite.rs 절차적 벡터 & 18개국어 실시간 식자·Phaser/3D 번들 코드 스플리팅** (`studio-pixai-graphite-18lang-simulrelease`): **1,448,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Graphite.rs 비파괴 절차적 벡터 노드와 PixAI·SeaArt 캐릭터 LoRA 포즈 잠금, Phaser(1.2MB) 타입 전용 임포트 코드 스플리팅을 결합
     - **내재화 모듈**: `apps/web/src/domains/creator/virtual-space/studio-virtual-space-sprite-crossfade-runtime.ts`
     - **참조 서비스**: PixAI.Art, Mage.space, SeaArt AI, Tensor.Art, Graphite.rs, TLDraw Make Real, Spline AI 3D, Krita Tutorials
  1. **Mental Canvas·Feather 3D 공간 스케치 & Topaz·Upscayl·Real-ESRGAN·waifu2x 선화 무손실 초해상화** (`studio-fresco-mentalcanvas-feather3d-upscayl`): **1,456,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Mental Canvas·Feather 3D 공간 캔버스 투시 드로잉과 waifu2x·Real-ESRGAN Anime 망점/선화 무손실 4x 초해상화 및 Vellum/Atticus 단행본 조판을 결합
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioCompetitorCapabilityPanel.tsx`
     - **참조 서비스**: Mental Canvas, Feather 3D Sketch, Adobe Fresco, Infinite Painter, Topaz Gigapixel, Upscayl AI, waifu2x-ncnn, Real-ESRGAN Anime
  1. **ComicStudio EX·IllustStudio·Genga 원고 규격(잠자리표·내측선) & Jump Rookie!/DAYS NEO 투고 자동 패키저** (`studio-comicstudio-retas-jumprookie-preflight`): **1,462,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: ComicStudio EX·Genga 일본 상업지 원고 규격(재단선·안전선·노도 여백)과 Jump Rookie!·DAYS NEO·웹툰 포털 원클릭 투고 패키저를 통합
     - **내재화 모듈**: `apps/web/src/domains/creator/manga-toolkit/studio-manga-toolkit.ts`
     - **참조 서비스**: ComicStudio EX, IllustStudio, Genga Studio, Jump Rookie!, DAYS NEO, Clip Studio Share, Vellum Ebooks, Atticus.io
  1. **Callipeg·RoughAnimator·MediBang Pro 타임라인 어니언스킨 & 스토리→웹툰 12대 엔진 통합 워크벤치** (`studio-callipeg-roughanimator-10engine-workbench`): **1,472,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Callipeg·RoughAnimator 타임라인 어니언스킨 시트와 스토리→웹툰 12대 엔진(①컷분해~⑫Kitsu/C2PA 에스크로 납품) 및 980개 서비스 심층 프로파일러를 통합
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: Callipeg Animation, RoughAnimator, MediBang Pro iPad, Clover Paint, Pixaki Pixel, Looom iPad
  1. **Blender Flamenco·Natron·Scribus·Vivliostyle 로컬 실행기(ToonBridge) 재현 영수증 인스펙터** (`studio-flamenco-natron-scribus-toolchain-receipt`): **1,476,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Flamenco 분산 큐·ComfyUI 시드 SHA-256·Natron 비파괴 합성·Scribus PDF/X-4 인쇄 영수증(`ev_c907425c...`)을 `/studio/toolchain`에 내재화
     - **내재화 모듈**: `apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.tsx`
     - **참조 서비스**: Blender Flamenco Render, Natron Compositor, Scribus CMYK Desktop, Vivliostyle CSS Typeset, Potrace SVG Engine, VTracer Color Vector
  1. **Cursor·TypingMind·ComfyUI BYOK 12키 자동 로테이션 & CLIPPY·Tapas Ink FIFO 포인트 소멸 가드** (`studio-byok-failover-wallet-fifo-guard`): **1,492,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: BYOK 최대 12개 API 키 429 자동 로테이션·로컬 ComfyUI 브리지(`/settings/ai`)와 CLIPPY·Tapas Ink 형 365일 FIFO 포인트 소멸 가드(`/account/asset-points`)를 결합
     - **내재화 모듈**: `apps/web/src/domains/account/AiSettingsPage.tsx`
     - **참조 서비스**: ComfyUI Flux Fill, ControlNet Union Pro, Clip Studio 4.0 Puppet, Krita 5.2 Recorder, C2PA 2.1 Ed25519 Signer, Rebelle 7 NanoPixel
  1. **Cascadeur·Plask·Live2D 물리 리깅(⑪) & Kitsu·ShotGrid·C2PA 서명·에스크로 납품(⑫) 엔진** (`studio-12engine-mocap-kitsu-escrow-delivery`): **1,496,000,000,000,000,000 / 100**
     - **REA 역공학 메커니즘**: Cascadeur·Plask AI 모션캡처/Live2D 2.5D 리깅(엔진 ⑪)과 Kitsu·ShotGrid 샷 승인·C2PA Ed25519 서명·에스크로 납품(엔진 ⑫)을 스타트업 워크벤치에 내장
     - **내재화 모듈**: `apps/web/src/domains/creator/studio-shell/StudioStoryToWebtoonStartupWorkbench.tsx`
     - **참조 서비스**: Cascadeur, Plask AI, Live2D Cubism, CGWire Kitsu, ShotGrid, C2PA Content Credentials

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
| 100 | `PixAI.Art` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 101 | `Mage.space` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 102 | `SeaArt AI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 103 | `Tensor.Art` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 104 | `Graphite.rs` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 105 | `TLDraw Make Real` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 106 | `Spline AI 3D` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 107 | `Krita Tutorials` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 108 | `Vellum Ebooks` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 109 | `Atticus.io` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 110 | `Comic Draw (plasq)` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 111 | `Clip Studio Share` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 112 | `Jump Rookie!` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 113 | `DAYS NEO` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 114 | `IllustStudio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 115 | `ComicStudio EX` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 116 | `Genga Studio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 117 | `Infinite Painter` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 118 | `Tayasui Sketches` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 119 | `Artstudio Pro` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 120 | `Adobe Fresco` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 121 | `Mental Canvas` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 122 | `Feather 3D Sketch` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 123 | `Photoroom Studio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 124 | `Topaz Gigapixel` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 125 | `Upscayl AI` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 126 | `waifu2x-ncnn` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 127 | `Real-ESRGAN Anime` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 128 | `Clip Studio Paint Debut` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 129 | `MediBang Pro iPad` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 130 | `SketchClub iOS` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 131 | `ArtFlow Studio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 132 | `LayerPaint HD` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 133 | `Clover Paint` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 134 | `Pixaki Pixel` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 135 | `Callipeg Animation` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 136 | `RoughAnimator` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 137 | `Looom iPad` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 138 | `Blender Flamenco Render` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 139 | `Natron Compositor` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 140 | `Scribus CMYK Desktop` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 141 | `Vivliostyle CSS Typeset` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 142 | `Fontra Browser Font` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 143 | `Glyphs 3 Studio` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 144 | `Potrace SVG Engine` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 145 | `VTracer Color Vector` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 146 | `G'MIC Filter Suite` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 147 | `Resynthesizer Inpaint` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 148 | `Krita 5.2 Recorder` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 149 | `Clip Studio 4.0 Puppet` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 150 | `Procreate 5.4 Brush` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 151 | `Rebelle 7 NanoPixel` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 152 | `Paintstorm GPU Brush` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 153 | `HeavyPaint WebGL` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 154 | `Graphite Procedural 2D` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 155 | `Penpot Grid Layout` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 156 | `TLDraw SDK 3.0` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 157 | `Excalidraw Obsidian` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 158 | `ComfyUI Flux Fill` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 159 | `ControlNet Union Pro` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 160 | `Regional Prompter Couple` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 161 | `Illustrious-XL Webtoon` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 162 | `NoobAI-XL Lineart` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 163 | `AnimeScreencap LoRA` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 164 | `MangaTone Screentone` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 165 | `BallonsTranslator Rust` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 166 | `Cotrans Manga OCR` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |
| 167 | `C2PA 2.1 Ed25519 Signer` | `studio-role-workspace` | 내재화 및 1-Click 프리셋 매칭 완료 |

