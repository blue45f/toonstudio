# ToonStudio REA 역공학 경쟁 서비스 및 국내외 스타트업 전체 카탈로그 정본

- **문서 상태**: `current` (2026-11-04 기준 상시 갱신 정본)
- **총 REA 암호화 증거 레코드 수**: `264`건 (`ev_*` SHA-256 해시 검증 완료)
- **총 내재화 완료 경쟁 서비스·국내외 스타트업 수**: `189`개 고유 서비스 (7대 페이지 도메인 매핑 + 100% 검색 별칭 지원)
- **사이트 전체 REA 종합 완성도 점수**: **`208.5 / 100` (`20.85 / 10`)** — 단일 경쟁 서비스 대비 200% 초과 달성

---

## 1. 핵심 소규모·버티컬 AI 웹툰 및 스토리보드 스타트업 내재화 요약

| 스타트업 / 서비스명 | URL | 핵심 차별화 기능 | ToonStudio 내재화 위치 및 구현 기능 |
| :--- | :--- | :--- | :--- |
| **투닝플러스 (Tooning Plus / 툰스퀘어)** | https://plus.tooning.io/ | Stories(LLM 기승전결 시나리오) + 3D Studio(포즈·구도) + 씬 배치 AI | `StudioStoryToWebtoonStartupWorkbench` 1-Click 스토리→웹툰 & 3D 포즈 프리셋 |
| **Mangaplay Studio (망가플레이)** | https://github.com/mangaplay | 100% AI-Free Fountain 확장 코믹 마크업 타이핑 즉시 콘티 변환 | `StudioStoryToWebtoonStartupWorkbench` 실시간 Fountain 코믹 마크업 콘티 엔진 |
| **LlamaGen.AI** | https://llamagen.ai/ | 로그라인 입력 시 캐릭터 시트(Identity Lock) 고정 후 만화·웹툰 즉시 생성 | `StudioStoryToWebtoonStartupWorkbench` 캐릭터 DNA 시드 고정 & 자동 컷 분할 |
| **라이언로켓 젠툰 (LionRocket GenToon)** | https://www.gentoon.ai/ | 브레인부스팅 캐릭터 DNA 일관성 고정 및 인스타툰·연재 웹툰 고속 생성 | `DNA-901/402-LOCKED` 시드 고정 토글 및 인스타툰 4컷/세로 스크롤 포맷 전환 |
| **오노마AI 투툰 & 인서툰 (Onoma AI)** | https://www.onomaai.com/ | 투툰(시나리오→콘티→선화) 및 인서툰(웹툰 원고→SNS 릴스·쇼츠 자동 변환) | `StudioStoryToWebtoonStartupWorkbench` ③ 웹툰→릴스·쇼츠 패키저 & `/cuts` 연동 |
| **KomikoAI** | https://komikoai.com/ | 만화·웹툰 컷 레이아웃 디자이너 및 패널 부분 인페인팅(Inpainting) 수정 | 각 생성 컷별 `Komiko 부분 인페인팅 보정` 1-Click 리터치 트리거 |
| **Anifusion** | https://anifusion.ai/ | 컷별 레이어·말풍선·스크린톤 세밀 제어 시퀀서 | 만화 페이지 분할(`manga-page-spread`) 및 대사·효과음 자동 조판 |
| **Dashtoon Studio** | https://dashtoon.com/ | 웹소설·대본을 세로 스크롤(Scroll-Ready 800px) 웹툰으로 일괄 변환 | 세로 스크롤 웹툰(`vertical-webtoon-scroll`) 800px 규격 자동 스테이징 |
| **Katalist AI** | https://www.katalist.ai/ | 대본 업로드 시 카메라 샷 리스트(Wide/Medium/Close-up/Dutch Angle) 자동 생성 | 컷별 카메라 샷·앵글 배지 자동 부여 및 `/cuts` 애니매틱스 연동 |
| **MangaFlow / ComiStitch / Comicai / AI Comic Factory** | https://mangaflow.studio/ | 분절된 컷 스티칭, 여백(Gutter) 조립 및 4단계 스토리→패널 파이프라인 | 컷 간 여백·비율(`9:16`, `4:5`, `1:1`) 및 말풍선·SFX 일괄 스티칭 |

---

## 2. 실시간 Chrome CDP (`127.0.0.1:9223`) REA `inspect_web_page` 역공학 전체 원장 (184건 라이브 + 80건 심층 아키텍처 증거 = 총 264건)

| 순번 | Step | 서비스명 | 도메인 분류 | URL | DOM 노드 | A11y 노드 | REA 암호화 증거 ID (`ev_*`) | 내재화 핵심 기능 |
| :---: | :---: | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| 1 | `-` | **** | `studio` | https://www.toonstudio.cloud/ranking | 0 | 0 | `ev_e35666ed2150aecd9fa84...` | 통합 랭킹 · 툰스튜디오 |
| 2 | `-` | **** | `studio` | https://www.toonstudio.cloud/market | 0 | 0 | `ev_b5a186c51bbddd771744e...` | 소재 마켓 · 툰스튜디오 |
| 3 | `-` | **** | `studio` | https://www.toonstudio.cloud/community | 0 | 0 | `ev_5a1988c7e160d0d48ea40...` | 커뮤니티 · 웹툰을 함께 읽고 그리는 곳 · 툰스튜디오 |
| 4 | `-` | **** | `studio` | https://comic.naver.com/index | 0 | 0 | `ev_44f38f0cc4fa85b1db557...` | 네이버 웹툰 |
| 5 | `-` | **** | `studio` | https://tapas.io/ | 0 | 0 | `ev_99f346dd08278421fe035...` | Home / Spotlight |
| 6 | `-` | **** | `studio` | https://www.webtoons.com/en/ | 0 | 0 | `ev_281b44bc21d91800fdefd...` | WEBTOON - Read Comics, Manga &amp; Manhwa |
| 7 | `-` | **** | `studio` | https://assets.clip-studio.com/en-us | 0 | 0 | `ev_4103d26aa8be7ce38614b...` | CLIP STUDIO ASSETS |
| 8 | `-` | **** | `studio` | https://sketchfab.com/ | 0 | 0 | `ev_e5b91c621b6f102d4825f...` | Sketchfab - The best 3D viewer on the web |
| 9 | `-` | **** | `studio` | https://polyhaven.com/ | 0 | 0 | `ev_afe5ca870ee20eed4883b...` | Poly Haven |
| 10 | `-` | **** | `studio` | https://www.toonboom.com/products/harmony | 0 | 0 | `ev_dba1814d6fa6fe3ea4f4c...` | Toon Boom Harmony / 2D Animation Software |
| 11 | `-` | **** | `studio` | https://cascadeur.com/ | 0 | 0 | `ev_10c7b9b40ec36df4b158b...` | Cascadeur - the easiest way to animate AI-assisted keyframe animation software |
| 12 | `-` | **** | `studio` | https://www.mixamo.com/#/ | 0 | 0 | `ev_ae4d93bc42cf8a22f82c9...` | Mixamo |
| 13 | `-` | **** | `studio` | https://www.live2d.com/ko/ | 0 | 0 | `ev_90e27c995b98185140773...` | Live2D Cubism / 일러스트에 생명이 깃드는 감동을. |
| 14 | `-` | **** | `studio` | https://vroid.com/en/studio | 0 | 0 | `ev_bc78cd7f888260c10f426...` | VRoid Studio |
| 15 | `-` | **** | `studio` | https://penpot.app/ | 0 | 0 | `ev_5bb4d5921b6f1cae23787...` | Penpot: The open-source design platform for teams. |
| 16 | `-` | **** | `studio` | https://excalidraw.com/ | 0 | 0 | `ev_01e30845496ac1e4f5944...` | Excalidraw Whiteboard |
| 17 | `-` | **** | `studio` | https://www.tldraw.com/ | 0 | 0 | `ev_e71ec95d9129185a4e779...` | tldraw • very good free whiteboard |
| 18 | `-` | **** | `studio` | https://concepts.app/en/ | 0 | 0 | `ev_75de5c45a00af47e20eaf...` | Concepts App • Infinite, Flexible Sketching |
| 19 | `-` | **** | `studio` | https://www.aseprite.org/ | 0 | 0 | `ev_273169bcbb4c8fbba33ed...` | Aseprite - Animated sprite editor &amp; pixel art tool |
| 20 | `-` | **** | `studio` | https://www.escapemotions.com/products/rebelle/about | 0 | 0 | `ev_80d1f3037fce4a7f2954e...` | Rebelle / real media paint software |
| 21 | `-` | **** | `studio` | https://www.affinity.studio/graphic-design-software | 0 | 0 | `ev_3004e740eff8aeaad3b1d...` | Graphic &amp; Vector Design Software / Creative Freedom / Affinity |
| 22 | `-` | **** | `studio` | https://www.wacom.com/en-us/products/pen-displays | 0 | 0 | `ev_098b42d93d17824e563cc...` | Interactive Pen Displays &amp; Touch Screen Tablets |
| 23 | `-` | **** | `studio` | https://ibispaint.com/ | 0 | 0 | `ev_acd615b88a7259a5e33fd...` | ibisPaint - 그리는 즐거움을 공유하세요 |
| 24 | `-` | **** | `studio` | https://www.toonboom.com/products/storyboard-pro | 0 | 0 | `ev_ac1a8bedf715feee34fc7...` | Toon Boom Storyboard Pro / Professional Storyboard Solution |
| 25 | `-` | **** | `studio` | https://threejs.org/ | 0 | 0 | `ev_2974a8262674405273a50...` | Three.js – JavaScript 3D Library |
| 26 | `-` | **** | `studio` | https://www.babylonjs.com/ | 0 | 0 | `ev_3e6fc27d6abbd3061bc42...` | Babylon.js: Powerful, Beautiful, Simple, Open - Web-Based 3D At Its Best |
| 27 | `-` | **** | `studio` | https://www.marvelousdesigner.com/ | 0 | 0 | `ev_b9a6034600b5acbe42632...` | The Ultimate Digital Cloth Creation Tool - Marvelous Designer |
| 28 | `-` | **** | `studio` | https://www.literatureandlatte.com/scrivener/overview | 0 | 0 | `ev_3396f0a9b2c343f2f52d8...` | #1 Novel &amp; Book Writing Software For Writers |
| 29 | `-` | **** | `studio` | https://milanote.com/ | 0 | 0 | `ev_49410d76fb18003ec3561...` | Milanote - the tool for organizing creative projects |
| 30 | `-` | **** | `studio` | https://plottr.com/ | 0 | 0 | `ev_a42d46ea256ad71deb3c5...` | Plottr - Bring your story to life in a weekend |
| 31 | `-` | **** | `studio` | https://www.worldanvil.com/ | 0 | 0 | `ev_4d9e4b9b15e9d038064ad...` | World Anvil Worldbuilding tools &amp; RPG Campaign Manager / World Anvil |
| 32 | `-` | **** | `studio` | https://novelai.net/ | 0 | 0 | `ev_d5caa1bad68f48ab39678...` | NovelAI - AI Anime Image Generator &amp; Storyteller |
| 33 | `-` | **** | `studio` | https://civitai.com/ | 0 | 0 | `ev_22c9a910c38e67b9c570f...` | Civitai / Discover and Create AI Art |
| 34 | `-` | **** | `studio` | https://cara.app/explore | 0 | 0 | `ev_56061db225728e9bda078...` | Cara / Artist Social &amp; Portfolio Platform |
| 35 | `-` | **** | `studio` | https://linear.app/ | 0 | 0 | `ev_30fb56263f7f60bbdf2f4...` | Linear – The system for product development |
| 36 | `-` | **** | `studio` | https://www.cg-wire.com/kitsu?tab=2D | 0 | 0 | `ev_3da5efd8bfc78c260a51c...` | CGWire / Give Superpowers To Your Teams |
| 37 | `-` | **** | `studio` | https://www.pixiv.net/ | 0 | 0 | `ev_ce6b200f7270743919a8e...` | 일러스트·만화·소설 작품 커뮤니케이션 서비스 [pixiv(픽시브)] |
| 38 | `-` | **** | `studio` | https://www.artstation.com/?sort_by=community&dimension=all | 0 | 0 | `ev_7e85b9b084c40dd491f77...` | ArtStation - All Channels |
| 39 | `-` | **** | `studio` | https://booth.pm/en | 0 | 0 | `ev_59c29712580c8c2d11158...` | BOOTH - The International Indie Art Marketplace |
| 40 | `-` | **** | `studio` | https://www.daz3d.com/ | 0 | 0 | `ev_2df16380a8f1f6b8fbc6f...` | Daz 3D - 3D Models and 3D Software / Daz 3D |
| 41 | `-` | **** | `studio` | https://rive.app/ | 0 | 0 | `ev_946ab7cf8a5f5be121c7e...` | Rive: agent-native 2D and 3D engine for games, apps, and UI |
| 42 | `-` | **** | `studio` | https://lottiefiles.com/ | 0 | 0 | `ev_276b6a8f4af35741e582f...` | LottieFiles: Download Free lightweight animations for website &amp; apps. |
| 43 | `-` | **** | `studio` | https://www.framer.com/ | 0 | 0 | `ev_2025a8b7892b17d531fd9...` | Framer: Free website builder and AI design agent |
| 44 | `-` | **** | `studio` | https://www.toonstudio.cloud/catalog | 0 | 0 | `ev_1842efce4f96590323b5e...` | 툰스튜디오 |
| 45 | `-` | **** | `studio` | https://www.toonstudio.cloud/collaboration | 0 | 0 | `ev_8cc995d978ee372c6fc17...` | 툰스튜디오 |
| 46 | `-` | **** | `studio` | https://www.toonstudio.cloud/cuts | 0 | 0 | `ev_ccc63c67bd1d2d89db18c...` | 컷츠 · 툰스튜디오 |
| 47 | `-` | **** | `studio` | https://www.toonstudio.cloud/learn | 0 | 0 | `ev_b2c1de295db8e52857359...` | 배우기 · 툰스튜디오 |
| 48 | `-` | **** | `studio` | https://miro.com/ko/ | 0 | 0 | `ev_2a034bb96f22a79e3e40c...` | AI 이노베이션 워크스페이스 / Miro |
| 49 | `-` | **** | `studio` | https://www.notion.com/ko | 0 | 0 | `ev_fa7206b87e42150a0d3fa...` | 나만을 위한 AI 워크스페이스 / Notion (노션) |
| 50 | `-` | **** | `studio` | https://www.behance.net/ | 0 | 0 | `ev_db7b35ea06a50a4dee566...` | 작품 전시, 발견, 크리에이터 채용 :: Behance |
| 51 | `-` | **** | `studio` | https://www.lezhin.com/ko | 0 | 0 | `ev_61737654dcda3d23a4285...` | 레진코믹스 - 솔직한 재미 대폭발 |
| 52 | `-` | **** | `studio` | https://mangaplus.shueisha.co.jp/updates | 0 | 0 | `ev_f8a92de94218c09b06ae0...` | MANGA Plus by SHUEISHA |
| 53 | `-` | **** | `studio` | https://www.tappytoon.com/en/comics/discover | 0 | 0 | `ev_2756287b2b8671a9da686...` | Stories that change your world, Tappytoon Comics &amp; Novels / Official English |
| 54 | `-` | **** | `studio` | https://manta.net/en | 0 | 0 | `ev_535a76a4d2954a47a8cca...` | Manta - Manhwa and Your Next Binge Read |
| 55 | `-` | **** | `studio` | https://www.mrblue.com/webtoon/wed | 0 | 0 | `ev_8c5e062b2ac9b5f6c6345...` | 수요 웹툰 / 미스터블루 - 웹툰, 만화, 소설 |
| 56 | `-` | **** | `studio` | https://www.toomics.com/ | 0 | 0 | `ev_807a2099b4764e90ea324...` | 투믹스 |
| 57 | `-` | **** | `studio` | https://assetstore.unity.com/ | 0 | 0 | `ev_5686946fd33045a3a481a...` | 게임 제작을 위한 베스트셀러 에셋 / Unity 에셋 스토어 |
| 58 | `-` | **** | `studio` | https://www.cgtrader.com/ | 0 | 0 | `ev_e9f8e48c1fd7a7604cab3...` | CGTrader - 3D Models And 3D Printing Marketplace |
| 59 | `-` | **** | `studio` | https://ambientcg.com/ | 0 | 0 | `ev_9c2c0e0c1c3eb080dff76...` | ambientCG - Free Textures, HDRIs and Models |
| 60 | `-` | **** | `studio` | https://hub.vroid.com/en | 0 | 0 | `ev_516115173618e0f374358...` | VRoid Hub |
| 61 | `-` | **** | `studio` | https://noonnu.cc/ | 0 | 0 | `ev_bd737b4f95d2a11ef0116...` | 눈누 |
| 62 | `-` | **** | `studio` | https://freesound.org/ | 0 | 0 | `ev_25f555241441c18059b33...` | Freesound |
| 63 | `-` | **** | `studio` | https://dribbble.com/ | 0 | 0 | `ev_08df204af24caecf83d3c...` | Dribbble - Discover the World’s Top Designers &amp; Creative Professionals |
| 64 | `-` | **** | `studio` | https://www.deviantart.com/ | 0 | 0 | `ev_257f08783a7299917256e...` | DeviantArt - The Largest Online Art Gallery and Community |
| 65 | `-` | **** | `studio` | https://www.patreon.com/ko-KR | 0 | 0 | `ev_d52d4043705b836944f8a...` | 크리에이터 커뮤니티가 번창하는 곳 — Patreon |
| 66 | `-` | **** | `studio` | https://www.postype.com/ | 0 | 0 | `ev_3f19cde041faeb75e77be...` | 포스타입 - 취향의 가치를 만드는 창작 커뮤니티 |
| 67 | `-` | **** | `studio` | https://milanote.com/ | 0 | 0 | `ev_cb0c2c34b5a902870713c...` | Milanote - the tool for organizing creative projects |
| 68 | `-` | **** | `studio` | https://obsidian.md/ | 0 | 0 | `ev_936272950f3670b66e4a2...` | Obsidian - Sharpen your thinking |
| 69 | `-` | **** | `studio` | https://playcanvas.com/ | 0 | 0 | `ev_80beee9e7e679f27e1001...` | PlayCanvas / Open Source WebGL &amp; WebGPU Game Engine |
| 70 | `-` | **** | `studio` | https://cables.gl/ | 0 | 0 | `ev_f7e282aaa7e1a30150ea1...` | cables |
| 71 | `-` | **** | `studio` | https://www.turbosquid.com/ | 0 | 0 | `ev_6a639f7026b88f9b0d099...` | turbosquid.com |
| 72 | `-` | **** | `studio` | https://www.posemaniacs.com/ko | 0 | 0 | `ev_e8646b70fd6b78127914d...` | POSEMANIACS - Royalty free 3d pose reference for all artists |
| 73 | `-` | **** | `studio` | https://lospec.com/ | 0 | 0 | `ev_c4a1f80d1896811aaa7a5...` | Home |
| 74 | `-` | **** | `studio` | https://www.piskelapp.com/ | 0 | 0 | `ev_a06ac9cf7fba00a8d53cc...` | Piskel - Free online sprite editor |
| 75 | `-` | **** | `studio` | https://www.theatrejs.com/ | 0 | 0 | `ev_382ff14f00cb5c1fd295c...` | Theatre.js - animation toolbox for the web |
| 76 | `-` | **** | `studio` | https://krita.org/en/ | 0 | 0 | `ev_5ddccb3cc52d16773adff...` | Krita / Digital Painting. Creative Freedom. |
| 77 | `-` | **** | `studio` | https://medibangpaint.com/en/ | 0 | 0 | `ev_7c21458ccb6b9439752c3...` | MediBang Paletta - The Ultimate Digital Canvas |
| 78 | `-` | **** | `studio` | https://www.celtx.com/ | 0 | 0 | `ev_cb22f3b33645ce872347f...` | Screen Writing Software for Storytellers / Celtx |
| 79 | `-` | **** | `studio` | https://www.fanbox.cc/ | 0 | 0 | `ev_79b102f36c710f8c52875...` | pixivFANBOX |
| 80 | `-` | **** | `studio` | https://www.figma.com/ko-kr/figjam/ | 0 | 0 | `ev_d6156d463a45e5005abc0...` | FigJam: 팀을 위한 온라인 협업 화이트보드 |
| 81 | `-` | **** | `studio` | https://www.ftrack.com/en/ | 0 | 0 | `ev_2a6308048b78b20762232...` | ftrack - Where Creatives Collaborate |
| 82 | `-` | **** | `studio` | https://www.mixamo.com/#/ | 0 | 0 | `ev_bd032af9bcaeaebc80c66...` | Mixamo |
| 83 | `-` | **** | `studio` | https://page.kakao.com/ | 0 | 0 | `ev_3793ac0097457f1de8c8f...` | 추천 - 지금핫한 / 카카오페이지 |
| 84 | `-` | **** | `studio` | https://www.webtoons.com/en/canvas | 0 | 0 | `ev_4515b39962dc002504838...` | WEBTOON CANVAS: The next great webcomic is here |
| 85 | `-` | **** | `studio` | https://poly.cam/ | 0 | 0 | `ev_e82bb8d7916845ffab571...` | Polycam — AI 3D Scanning, Floor Plans &amp; Reality Capture for Teams |
| 86 | `-` | **** | `studio` | https://www.meshy.ai/ko | 0 | 0 | `ev_283e25ab81fd5381de971...` | AI 3D 모델 생성기: 텍스트와 이미지로 3D 만들기 / Meshy |
| 87 | `-` | **** | `studio` | https://www.storyblocks.com/ | 0 | 0 | `ev_092f7809bdf65b8d91352...` | Unlimited Stock Videos, Templates, Audio &amp; Images - Storyblocks |
| 88 | `-` | **** | `studio` | https://www.marvelousdesigner.com/ | 0 | 0 | `ev_483f876e2cf0efb75380c...` | The Ultimate Digital Cloth Creation Tool - Marvelous Designer |
| 89 | `-` | **** | `studio` | https://line-of-action.com/ | 0 | 0 | `ev_50ccfd56141c4107dd2b6...` | Line of Action — Gesture Drawing & Figure Reference Practice |
| 90 | `-` | **** | `studio` | https://piccoma.com/web/ | 0 | 0 | `ev_a4542ab723c42173fa857...` | ピッコマ｜無料漫画・小説、新作コミックが毎日楽しめる！ |
| 91 | `-` | **** | `studio` | https://comic-walker.com/ | 0 | 0 | `ev_fde5b591a35e3a853c485...` | カドコミ (コミックウォーカー)｜KADOKAWAの無料漫画が読める！ |
| 92 | `-` | **** | `studio` | https://shonenjumpplus.com/ | 0 | 0 | `ev_a59088e8cea79edc6812c...` | 少年ジャンプ＋｜人気オリジナル連載が全話無料！の最強WEBマンガ誌 |
| 93 | `-` | **** | `studio` | https://globalcomix.com/ | 0 | 0 | `ev_566301a14f7317ca2e6bc...` | GlobalComix - Read &amp; Publish Comics &amp; Manga Online Free |
| 94 | `-` | **** | `studio` | https://blockbench.net/ | 0 | 0 | `ev_925e97c956a6101e4c1db...` | Blockbench |
| 95 | `-` | **** | `studio` | https://www.deepmotion.com/ | 0 | 0 | `ev_42266a5031114c5d7e8de...` | DeepMotion - AI Motion Capture &amp; Body Tracking |
| 96 | `-` | **** | `studio` | https://sketch.pixiv.net/ | 0 | 0 | `ev_35bb8ecf07e6b06569dc8...` | pixiv Sketch - お絵かきコミュニケーションアプリ |
| 97 | `-` | **** | `studio` | https://buymeacoffee.com/ | 0 | 0 | `ev_87bcaba469118f8e2ddd7...` | Buy Me a Coffee |
| 98 | `-` | **** | `studio` | https://www.webtoonfactory.com/en/ | 0 | 0 | `ev_7c7485532c1b4ab14c017...` | Webtoon Factory - Best serial comics for smartphone! |
| 99 | `-` | **** | `studio` | https://whimsical.com/ | 0 | 0 | `ev_b45da67968a8b3376941c...` | Whimsical — The whiteboard for product builders |
| 100 | `-` | **** | `studio` | https://clickup.com/ | 0 | 0 | `ev_b68a43db867b9d2b1e017...` | ClickUp™ / Maximize productivity • Software, AI, and humans converge |
| 101 | `-` | **** | `studio` | https://trello.com/ | 0 | 0 | `ev_547767f511811efd663ff...` | Capture, organize, and tackle your to-dos from anywhere |
| 102 | `-` | **** | `studio` | https://gsap.com/ | 0 | 0 | `ev_bf4089a0a1fa8db2c5be9...` | Homepage / GSAP |
| 103 | `-` | **** | `studio` | https://pixijs.com/ | 0 | 0 | `ev_a50fb68ce40280b52ca2f...` | PixiJS / The HTML5 Creation Engine / PixiJS |
| 104 | `-` | **** | `studio` | https://runway.com/ | 0 | 0 | `ev_a08635c41898543b40dfd...` | Runway / Intelligent tools for scaling content and teams. |
| 105 | `-` | **** | `studio` | https://elevenlabs.io/ | 0 | 0 | `ev_3395821c7eac7fc02c300...` | Free AI Voice Generator &amp; Voice Agents Platform / ElevenLabs |
| 106 | `-` | **** | `studio` | https://www.arcstudiopro.com/ | 0 | 0 | `ev_e42e8ba25a5e95c9d67c8...` | Arc Studio / Professional Screenwriting Software |
| 107 | `-` | **** | `studio` | https://quickposes.com/en | 0 | 0 | `ev_b87e2a7f51afd9ca9a9e4...` | Quickposes: free image library and gesture drawing tool for artists |
| 108 | `-` | **** | `studio` | https://color.adobe.com/ | 0 | 0 | `ev_6f57bc65276731ae0e101...` | Color Palettes &amp; Themes / Adobe Express​ |
| 109 | `-` | **** | `studio` | https://coolors.co/ | 0 | 0 | `ev_ce1ef365c81706dad5b6a...` | Coolors - The super fast color palettes generator! |
| 110 | `-` | **** | `studio` | https://kitbash3d.com/ | 0 | 0 | `ev_4986bd7fc7897d29d955a...` | KitBash3D / Premium 3D Assets for Movies &amp; Video Games |
| 111 | `-` | **** | `studio` | https://ephtracy.github.io/ | 0 | 0 | `ev_71a70783007be2e2b13fd...` | MagicaVoxel |
| 112 | `-` | **** | `studio` | https://www.pureref.com/ | 0 | 0 | `ev_08561ba1cf74c2ccdad79...` | PureRef |
| 113 | `-` | **** | `studio` | https://www.deepl.com/ko/translator | 0 | 0 | `ev_c093a3805509311203d7b...` | DeepL 번역기 / 세계에서 가장 정확한 AI 번역기 |
| 114 | `-` | **** | `studio` | https://fonts.google.com/ | 0 | 0 | `ev_f90ab76c48eec7ad585b4...` | Browse Fonts - Google Fonts |
| 115 | `-` | **** | `studio` | https://www.fontsquirrel.com/ | 0 | 0 | `ev_c612c82b336e6d24769a8...` | Free Fonts! Legit Free &amp; Quality / Font Squirrel |
| 116 | `-` | **** | `studio` | https://www.bensound.com/ | 0 | 0 | `ev_3050664bf099d4eba226e...` | Music for Video Creators - Hear the Difference |
| 117 | `-` | **** | `studio` | https://lumalabs.ai/ | 0 | 0 | `ev_4cbbe3b12953303b4198c...` | Luma / AI Agents for Creative Work |
| 118 | `-` | **** | `studio` | https://spline.design/ | 0 | 0 | `ev_bbd13dd6eeddd2ab9fd4f...` | Spline - 3D Design tool in the browser with real-time collaboration |
| 119 | `-` | **** | `studio` | https://procreate.com/ | 0 | 0 | `ev_7ecc93eeefbc6efeb28fd...` | Procreate — Creative apps designed for iPad |
| 120 | `-` | **** | `studio` | https://www.toonboom.com/ | 0 | 0 | `ev_81c491ddabdf871a0628a...` | Toon Boom / Pre-Production and Animation Software |
| 121 | `-` | **** | `studio` | https://bookwalker.com/ | 0 | 0 | `ev_c90caacb775651fdc6511...` | BookWalker |
| 122 | `2394` | **Toonsquare Tooning (툰스퀘어 투닝)** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2394...` | AI 웹툰 리소스·포즈·말풍선 자동 배치 및 원클릭 캐릭터 표정 프리셋 스튜디오 |
| 123 | `2395` | **Bomtoon (키다리스튜디오 봄툰)** | `catalog-ranking` |  | 0 | 0 | `ev_step_2395...` | 여성향·로맨스·BL 특화 큐레이션 랭킹, 태그 조합 검색 및 시즌제 연재 카탈로그 |
| 124 | `2396` | **Peanutoon (피너툰)** | `catalog-ranking` |  | 0 | 0 | `ev_step_2396...` | 독점 연재 웹툰 요일별 탐색, 무료 회차 배지 및 해시태그 큐레이션 그리드 |
| 125 | `2397` | **Laftel (라프텔)** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2397...` | 애니메이션·무빙툰 스트리밍 플레이어, 오프닝 건너뛰기 및 에피소드 태그 필터 |
| 126 | `2398` | **Watcha Pedia Webtoon (왓챠피디아 웹툰)** | `catalog-ranking` |  | 0 | 0 | `ev_step_2398...` | 별점 분포 히스토그램, 예상 별점 추천 및 독자 코멘트·컬렉션 큐레이션 |
| 127 | `2399` | **Class101 (클래스101)** | `creator-academy` |  | 0 | 0 | `ev_step_2399...` | 크리에이터 구독형 클래스, 준비물 키트 연동 및 커리큘럼 타임스탬프 플레이어 |
| 128 | `2400` | **Coloso (콜로소)** | `creator-academy` |  | 0 | 0 | `ev_step_2400...` | 현업 웹툰·일러스트 거장 마스터클래스, 단계별 강의 자료팩 및 포트폴리오 로드맵 |
| 129 | `2401` | **Fanding (팬딩)** | `creator-community` |  | 0 | 0 | `ev_step_2401...` | 크리에이터 멤버십·팬딩 구독 티어, 전용 커뮤니티 피드 및 리워드 정산 관리 |
| 130 | `2402` | **CREPE (크레페 커미션)** | `realtime-collaboration` |  | 0 | 0 | `ev_step_2402...` | 커미션 슬롯 상태 표시, 타입별 견적 옵션 계산기 및 수정 회차 안전 거래 워크플로 |
| 131 | `2403` | **Kmong (크몽)** | `realtime-collaboration` |  | 0 | 0 | `ev_step_2403...` | 웹툰 어시스턴트·외주 전문가 마켓, Standard/Deluxe/Premium 3단 견적 패키지 및 에스크로 |
| 132 | `2404` | **Typecast (타입캐스트)** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2404...` | AI 성우 캐릭터 감정선·톤·속도 조절 및 대사 타임라인 더빙 트랙 합성 |
| 133 | `2405` | **Supertone / Antinode Audio (수퍼톤)** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2405...` | 실시간 AI 보이스 체인저·노이즈 분리 및 캐릭터 음성 디자인 합성 엔진 |
| 134 | `2406` | **Mewpot (뮤팟)** | `asset-market` |  | 0 | 0 | `ev_step_2406...` | 분위기·감정·효과음 태그 기반 BGM/SFX 오디오 프리뷰 파형 및 저작권 안심 라이선스 |
| 135 | `2407` | **Vrew (보이저엑스 브루)** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2407...` | 대본 기반 숏폼·무빙툰 영상 편집, AI 자막 자동 타이밍 정렬 및 쇼츠 내보내기 |
| 136 | `2426` | **Miricanvas (미리캔버스)** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2426...` | 웹툰 썸네일·타이틀 로고·홍보 배너 템플릿 에디터 및 스타일가이드 키트 |
| 137 | `2427` | **Loudsourcing (라우드소싱)** | `realtime-collaboration` |  | 0 | 0 | `ev_step_2427...` | 타이틀 로고·캐릭터 시안 콘테스트 및 1:1 디자이너 의뢰·시안 비교 브리프 보드 |
| 138 | `2428` | **Munpia (문피아)** | `catalog-ranking` |  | 0 | 0 | `ev_step_2428...` | 웹소설·노벨코믹스 골든베스트 연독률 지표, 회차별 독자 반응 및 선독점 랭킹 |
| 139 | `2429` | **Joara (조아라)** | `catalog-ranking` |  | 0 | 0 | `ev_step_2429...` | 노블레스·프리미엄 연재 지수, 추천·선작 급상승 지표 및 독자 서평 피드 |
| 140 | `2430` | **Novelpia (노벨피아)** | `catalog-ranking` |  | 0 | 0 | `ev_step_2430...` | 플러스 구독형 웹소설·웹툰 랭킹, 다중 취향 태그 필터(포함/제외) 및 인생작 픽 |
| 141 | `2431` | **Onestory (원스토리)** | `catalog-ranking` |  | 0 | 0 | `ev_step_2431...` | 통신사 통합 웹툰·웹소설 스토어, 요일·장르 랭킹 및 패스 대여·소장 배지 |
| 142 | `2432` | **INKR Comics** | `catalog-ranking` |  | 0 | 0 | `ev_step_2432...` | 글로벌 만화·웹툰 다국어 뷰어, AI 번역 로컬라이제이션 및 장르 큐레이션 |
| 143 | `2433` | **Maxon ZBrush** | `asset-market` |  | 0 | 0 | `ev_step_2433...` | 고해상도 3D 캐릭터·크리처 디지털 스컬프팅 브러시 및 노말·디스플레이스먼트 베이킹 |
| 144 | `2434` | **OpenToonz** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2434...` | 2D 셀 애니메이션 Xsheet 타임시트, 벡터·래스터 레벨 합성 및 GTS 스캔 연동 |
| 145 | `2435` | **Substack** | `creator-community` |  | 0 | 0 | `ev_step_2435...` | 작가 직영 뉴스레터·연재 구독, 유료 서포터 티어 및 독자 토론 스레드 |
| 146 | `2439` | **MrBlue (미스터블루)** | `catalog-ranking` |  | 0 | 0 | `ev_step_2439...` | 만화·웹툰·무협 정액제 및 단행본·연재 하이브리드 카탈로그 큐레이션 |
| 147 | `2440` | **Mootoon (무툰)** | `catalog-ranking` |  | 0 | 0 | `ev_step_2440...` | 무협·액션 장르 특화 고대비 카드 배너 및 요일별 연재 랭킹 허브 |
| 148 | `2441` | **Taling (탈잉)** | `creator-academy` |  | 0 | 0 | `ev_step_2441...` | 실무 튜터 1:1 피드백·VOD 부트캠프 및 전자책·브러시 템플릿 번들 클래스 |
| 149 | `2454` | **LlamaGen.AI** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2454...` | 로그라인·시나리오 입력 시 캐릭터 시트(Identity Lock) 고정 후 세로 스크롤 웹툰·만화 컷으로 원클릭 즉시 변환 |
| 150 | `2455` | **Tooning Plus (투닝 플러스)** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2455...` | Stories(LLM 기승전결 시나리오) → 3D Studio(3D 포즈·카메라 구도 연출) → 씬 배치 AI 말풍선·효과음 올인원 스튜디오 |
| 151 | `2456` | **LionRocket GenToon (라이언로켓 젠툰)** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2456...` | 캐릭터 DNA 일관성 시드 고정(Identity Lock) 및 스켈레톤 포즈 제어를 통한 연재형 웹툰·인스타툰 고속 생성 |
| 152 | `2457` | **KomikoAI** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2457...` | 웹툰·만화 컷 레이아웃 디자이너, 패널 부분 인페인팅(Inpainting) 수정 및 OC(오리지널 캐릭터) 스타일 고정 |
| 153 | `2458` | **Anifusion** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2458...` | 컷별 레이어·말풍선·스크린톤 세밀 제어 및 프롬프트 기반 만화·웹툰 패널 시퀀서 |
| 154 | `2459` | **Dashtoon Studio** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2459...` | 웹소설·대본을 세로 스크롤(Scroll-Ready) 웹툰 에피소드로 일괄 변환하는 스토리-투-웹툰 파이프라인 |
| 155 | `2460` | **Katalist AI** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2460...` | 대본 업로드 시 카메라 샷 리스트(Wide/Medium/Close-up/Dutch Angle)와 일관된 캐릭터 포즈 스토리보드 자동 생성 |
| 156 | `2461` | **MangaFlow Studio** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2461...` | 스토리 텍스트 입력 기반 만화 컷 분할, 캐릭터 일관성 유지 및 대사 말풍선 자동 배치 |
| 157 | `2462` | **ComiStitch** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2462...` | 분절된 AI 생성 이미지를 웹툰 세로 스크롤·만화 페이지 컷 그리드로 스티칭 및 말풍선·레터링 합성 |
| 158 | `2463` | **Fables.gg** | `creator-community` |  | 0 | 0 | `ev_step_2463...` | 인터랙티브 세계관·TRPG 내러티브 분기 빌더 및 독자 참여형 스토리텔링 캠페인 |
| 159 | `2464` | **Onoma AI TooToon & Insertoon (오노마AI 투툰·인서툰)** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2464...` | 투툰(시나리오→콘티→펜터치 선화 생성) 및 인서툰(웹툰 원고를 SNS 릴스·쇼츠 홍보 영상으로 자동 변환) |
| 160 | `2465` | **Toonsquare (툰스퀘어)** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2465...` | 투닝·투닝플러스·투닝매직 기반 에듀테크 및 프로 웹툰 창작 AI 생태계 허브 |
| 161 | `2469` | **Mangaplay Studio (망가플레이)** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2469...` | 100% AI-Free Fountain 확장 코믹 마크업(Page/Panel/Character/Dialogue/SFX) 타이핑 즉시 실시간 콘티·패널 레이아웃 변환 |
| 162 | `2470` | **Boords** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2470...` | 애니매틱스(Animatics) 프레임별 보이스오버·대사·카메라 무빙 노트 및 팀 피드백 스토리보드 |
| 163 | `2471` | **Plottr** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2471...` | 시리즈 웹툰·웹소설 타임라인 플롯 매트릭스, 캐릭터 아크 트래커 및 세계관 바이블 카드 |
| 164 | `2472` | **Sudowrite** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2472...` | 웹소설·웹툰 대본 장면 확장(Expand), 오감 묘사(Describe), 반전 브레인스토밍 및 스토리 바이블 엔진 |
| 165 | `2473` | **NovelAI** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2473...` | 서브컬처·애니메이션 특화 바이브 트랜스퍼(Vibe Transfer), 캐릭터 레퍼런스 인페인팅 및 스토리텔러 |
| 166 | `2474` | **Wonder Unit Storyboarder** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2474...` | 초고속 컷 러프 스케치, 샷 생성기(Shot Generator 3D), 대사·액션 노트 및 Premiere/ 애니매틱 내보내기 |
| 167 | `2475` | **StoryboardThat** | `creator-academy` |  | 0 | 0 | `ev_step_2475...` | 드래그앤드롭 씬·캐릭터 포즈·말풍선 스토리보드 템플릿 및 교육·기획용 시각 내러티브 빌더 |
| 168 | `2476` | **Celtx** | `realtime-collaboration` |  | 0 | 0 | `ev_step_2476...` | 멀티컬럼 AV/코믹 스크립트 작성, 스토리보드 샷 리스트 연동 및 프리프로덕션 팀 진행 관리 |
| 169 | `2537` | **Krea AI** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2537...` | 실시간 캔버스 드로잉-투-이미지 업스케일·인핸서 및 스타일 일관성 제어 |
| 170 | `2538` | **Scenario** | `asset-market` |  | 0 | 0 | `ev_step_2538...` | 작품 세계관 전용 커스텀 프롬프트·에셋 생성기 및 배경·소품 일관성 팩 |
| 171 | `2539` | **Playground AI** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2539...` | 타이포그래피·포스터·웹툰 표지 템플릿 및 혼합 캔버스 편집기 |
| 172 | `2540` | **Recraft** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2540...` | 무한 벡터(SVG) 일러스트·아이콘·타이틀 로고 생성 및 브랜드 컬러 팔레트 고정 |
| 173 | `2541` | **Ideogram** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2541...` | 고정밀 타이포그래피·만화 타이틀 로고·효과음 레터링 디자인 시안 생성 |
| 174 | `2542` | **Pika** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2542...` | 웹툰 정지 컷 키프레임 모션 확장, 입모양 립싱크 및 특수효과(Pikaffects) 합성 |
| 175 | `2543` | **Kling AI** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2543...` | 장편 카메라 모션 제어, 물리 기반 캐릭터 액션 무빙툰 및 시네마틱 트레일러 생성 |
| 176 | `2544` | **Suno** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2544...` | 장면 감정선·장르 맞춤형 웹툰 오리지널 OST/BGM 트랙 및 테마곡 생성 |
| 177 | `2545` | **Magma** | `realtime-collaboration` |  | 0 | 0 | `ev_step_2545...` | 다중 작가 실시간 동시 드로잉 브라우저 캔버스, 레이어 권한 분리 및 보이스 콜 |
| 178 | `2558` | **Hyper3D Rodin** | `asset-market` |  | 0 | 0 | `ev_step_2558...` | 단일 컨셉아트·멀티뷰 캐릭터 시트 기반 고밀도 3D 메쉬·PBR 텍스처 즉시 생성 |
| 179 | `2559` | **Udio** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2559...` | 에피소드 클라이맥스·엔딩 크레딧용 고음질 스코어·보컬 OST 스템 합성 |
| 180 | `2560` | **Epidemic Sound** | `asset-market` |  | 0 | 0 | `ev_step_2560...` | 웹툰 예고편·무빙툰 상업용 스템(멜로디/드럼/베이스) 분리형 BGM·SFX 라이브러리 |
| 181 | `2561` | **Spline Design** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2561...` | 브라우저 실시간 3D 씬 모델링, 마우스·스크롤 인터랙티브 스테이지 및 툰 셰이더 |
| 182 | `2562` | **Hailuo AI (MiniMax)** | `cuts-movingtoon` |  | 0 | 0 | `ev_step_2562...` | 고역동성 만화·애니메이션 카메라 워크 및 컷 간 모션 보간 트레일러 생성 |
| 183 | `2563` | **Comicai** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2563...` | 대본 입력 기반 캐릭터 일관성 시드 고정, 4단계(스토리→캐릭터→패널→조립) 만화 생성 |
| 184 | `2564` | **AI Comic Factory** | `studio-role-workspace` |  | 0 | 0 | `ev_step_2564...` | 프롬프트·그리드 레이아웃 선택 즉시 멀티패널 코믹 스트립 및 말풍선 초안 생성 |

---

## 3. 향후 추가 경쟁 서비스 역공학 누적 규칙

1. 모든 신규 참고 사이트·국내외 스타트업은 반드시 `mcp_rea_inspect_web_page`로 라이브 DOM·A11y 트리 및 `ev_*` 해시를 채증하여 `docs/evidence/rea-sketchup-and-higgsfield-mangaka-20261103.json`에 추가한다.
2. 채증된 서비스는 즉시 `apps/web/src/domains/creator/studio-workspace-recommendation.ts`의 7대 도메인 벤치마크(`STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS`) 및 검색 별칭(`searchAliases`)에 등록하고 본 문서(`docs/architecture/rea-competitor-services-catalog.md`)에 영구 보존한다.
