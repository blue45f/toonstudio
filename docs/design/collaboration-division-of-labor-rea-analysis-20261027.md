# 협업·분업화(Division of Labor) 특화 16대 서비스 REA 역공학 분석 및 ToonStudio 내재화·고도화 설계서 (2026-10-27)

- **문서 상태**: `current` (2026-10-27 REA 16대 서비스 역공학 분석 및 12대 클린룸 모듈 내재화·고도화 완료)
- **증거 원장**: [`docs/evidence/rea-collaboration-division-of-labor-20261027.json`](../evidence/rea-collaboration-division-of-labor-20261027.json)
- **분석 도구**: `rea` (`reverse-engineer-anything` MCP 서버 — `capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`, `export_evidence_bundle`)

---

## 1. 목적 및 배경

웹툰·디지털 코믹스 스튜디오 및 창작 크루는 단일 작가 체계에서 **8단계 공정(글콘티 → 그림콘티 → 3D배경/소품 → 선화/펜선 → 밑색 → 명암/채색 → 후보정/이펙트 → 식자/최종 검수)** 및 **17개 세부 직무**가 동시에 맞물리는 고밀도 분업 파이프라인으로 진화했다.

본 문서는 글로벌·국내 대표 협업 및 분업화 특화 플랫폼 16종(**Linear**, **Frame.io**, **Figma**, **크몽(Kmong)**, **Miro**, **ClickUp**, **숨고(Soomgo)**, **위시켓(Wishket)**, **Notion**, **Asana**, **아트머그(Artmug)**, **라우드소싱(Loudsourcing)**, **Trello**, **Monday.com**, **Loom**, **포스타입(Postype)**)을 REA 도구체인으로 직접 캡처·역공학(총 **2,356,711개 AST 노드**, **15,120건 정적 분석 Finding**, **611개 추출 스크립트**, **209개 REA 세션 Evidence 레코드**)한 증거를 기록하고, 이를 ToonStudio의 핵심 스튜디오·프로덕션·협업·채용·공동집필 서피스 12곳에 클린룸 내재화·고도화한 아키텍처를 정의한다.

---

## 2. REA 역공학 증거 요약 (Observed Facts / Inferences / Unknowns)

### 2.1 대상별 REA 정적·동적 캡처 메트릭 (Wave 1 + Wave 2 + Wave 3 + Wave 4 총 16대 서비스)

| 분석 대상 | `capture_browser_scenario` Evidence ID | `export_web_scripts` Evidence ID | `analyze_javascript_application` Parent / Summary ID | 추출 스크립트 (Bytes) | 방문 AST 노드 / Findings | 핵심 Semantic Relations |
| --- | --- | --- | --- | --- | --- | --- |
| **Linear** (`https://linear.app/`) | `ev_f9d2e8ef642ee7614237f8887bf8d5bd0d6823e0ee33470348746515882be875` | `ev_968699f791f4614bc86f827fa47033e254ca14bc0ead297d6918ee9b91eb6844` | Parent: `ev_a9ba83bd45b33525ecd900e89154c461bc40b1c126865775e33f3bc0cf3b3560`<br/>Summary: `ev_1a0767916ccd345cf27bf77a2cd11acf76697f2eb9d006e04d6c05c3e7584be6` | 189 / 250개 (985,839 B) | **194,408 노드** / 2,680건 | `data-flow`: 87,809, `object-flow`: 8,064, `closure`: 7,576, `call-flow`: 5,193 |
| **Frame.io** (`https://frame.io/`) | `ev_ca7ea51fab576e4a7cf8fb19add5318ca436fb97008374d4e75e2c5b43d8212e` | `ev_25c3fcf8987c1e3101e709708b1dd43ab1eba7cc6f710df3fc80c25366ddeb07` | Parent: `ev_9cf80745bef9c8fb5710db8e8e6987cae8408a138e866a6409e494eeb14be84b`<br/>Summary: `ev_6e1be2c6fe414d1bc1b796460035f810ade397e372aaf9fc1d47b686cad6182f` | 19 / 34개 (528,852 B) | **153,234 노드** / 1,074건 | `data-flow`: 79,431, `object-flow`: 7,207, `closure`: 4,936, `promise-ownership`: 551 |
| **Figma** (`https://www.figma.com/`) | `ev_274345ca8f8511df4e8b903db915ccc3ef4cc10028fa190e088a52368a38d43b` | `ev_4be57205de61cc21bc5caca8514773bf2c2e02562c7f347d1cbcaabe6e02698d` | Parent: `ev_cbc65765a208f4eab4970f761400b18e4ba6d81e9becf89821ad52aa48ead382`<br/>Summary: `ev_a80571a33b32a20a10c311f732617d28a87a580fea1b50898be743fc6a921357` | 41 / 88개 (916,842 B) | **289,544 노드** / 1,289건 | `data-flow`: 62,948, `call-flow`: 11,657, `object-flow`: 7,933, `boundary`: 331 |
| **크몽 (Kmong)** (`https://kmong.com/`) | `ev_c98ec296a0b874d335f3f8ae58c2b12a512c89c3e28dfd8e090bd79587570514` | `ev_f25eda577544a4589a23c61826147db75641c6823f2edd9509b1f9a303ceef17` | Parent: `ev_1b85a521ff54446e57b7f6da6ed2a99d620a3e78f7f2e33b78e2e245c7f1f610`<br/>Summary: `ev_2a801e736626b7d913f64e6c4a27d8e169a0784de4a11ed0052e3882a7ad907b` | 35 / 59개 (1,110,689 B) | **264,841 노드** / 354건 | `data-flow`: 69,987, `object-flow`: 6,711, `closure`: 4,400, `call-flow`: 3,785 |
| **Miro** (`https://miro.com/`) | `ev_e23e40bfa38a3b273d31882febb0cc6b5ac5434f81286606f7607f3b34e09a21` | `ev_bc5339df924aaacbd0d4172b6dd69738582668bbec6c19f74100e5646895365a` | Parent: `ev_9cb347a263e8c10869d63c0064ce63b4b1572b66f2a8ed6234030211242b0bc2`<br/>Summary: `ev_09c0ecca15f3fa0058b34030edd7f571885c1b8f5377fa093d411b8792f2aa66` | 12 / 55개 (313,054 B) | **59,796 노드** / 471건 | `data-flow`: 44,251, `closure`: 4,445, `call-flow`: 2,887, `object-flow`: 2,854 |
| **ClickUp** (`https://clickup.com/`) | `ev_548ee1cfa869325174d8bff08aaf0fcc862f6e6350aa21010d6bf0a07dfe9344` | `ev_176a122fff9e85db54c40f53cf343b36c0f9593324de0f56448a17c9f9cac1eb` | Parent: `ev_a1657be0a6ae3a404ce33b320a38df2ab0d7066c099db67bdd2a4ae17e50b9a0`<br/>Summary: `ev_219f3160b7e0eb5807f9b1868e787d9911157cbec169ff92223131259537238b` | 24 / 50개 (676,653 B) | **166,433 노드** / 1,076건 | `data-flow`: 55,805, `object-flow`: 5,036, `closure`: 3,634, `call-flow`: 1,848 |
| **숨고 (Soomgo)** (`https://soomgo.com/`) | `ev_1c7658a2bbc76c3936dd3dcdf892ca6cbf26fcd7c74cd00018dd1c04485f7490` | `ev_301edc86d7f4f7295822bee0509045d3b5578972098eb0a1130e47fda3048267` | Parent: `ev_ded0c49dbc09eef52b4824a471e0306097e38bdf51fd9e9048a09355cd45b81d`<br/>Summary: `ev_b1b1e5d459b74c9ea77826c57d49eb0570a48bf9373f2c172f79cf43c7703794` | 25 / 51개 (471,402 B) | **99,296 노드** / 873건 | `data-flow`: 53,840, `object-flow`: 4,560, `closure`: 3,706, `call-flow`: 2,286 |
| **위시켓 (Wishket)** (`https://www.wishket.com/`) | `ev_e7229ce61c2690e50b7dae607da2d0a52b6435180bb3f43997108a2eb3587765` | `ev_7a5b3d1b8b6dcf8467ad22fba02ef990c3f9c6f43ec80e4a56f74e688c5df3a5` | Parent: `ev_1bc528214eda099e91c4628cbc4a874c0f509e8027c81c8d0b70f588605aed1c`<br/>Summary: `ev_5349f3be63bd7585acd4a48d1076d329b208dc0642347803c55f104d679a7f6f` | 18 / 31개 (247,786 B) | **50,153 노드** / 41건 | `data-flow`: 29,222, `call-flow`: 3,576, `object-flow`: 2,878, `event`: 58 |
| **Notion** (`https://www.notion.com/`) | `ev_9a41d9f3ce446c5c3a3d6994bc1958d0a2ff3fc2a5a929fed96d60ae6157971f` | `ev_c63aee7099ebf7fc82ee762c39f304251c056f58bd50ce6820c96805f565cc52` | Parent: `ev_9c1fe9f307fab4a776a3f5b003d22c83836de889a4791d143eebc6aa84f2f7a8`<br/>Summary: `ev_61519886a6fc85077570ffe2e75f72a1fc0b97e46e7cbb77598f464a048bfcf9` | 24 / 53개 (692,598 B) | **175,219 노드** / 176건 | `data-flow`: 58,332, `object-flow`: 5,745, `closure`: 3,297, `call-flow`: 2,614 |
| **Asana** (`https://asana.com/`) | `ev_1e36166f9555a8630e139cf365d71a13029f9db9e0e707fd0858d628dc7a9009` | `ev_78fcc9a379952d707598d6ba7c8e8b14ca56d7e37e6cf45f207d6a97a4d41686` | Parent: `ev_a246de3154967483500e152e9f8ae0d2c3d012975149d280e86a8141bf554d4a`<br/>Summary: `ev_19fb242eaa5f7a5689c4fdc6e00f3e63eba1fe3d4abe7da929f58fe76db8a17c` | 66 / 123개 (830,954 B) | **179,224 노드** / 1,396건 | `data-flow`: 39,694, `object-flow`: 3,771, `closure`: 2,632, `call-flow`: 1,272 |
| **아트머그 (Artmug)** (`https://artmug.kr/`) | `ev_c6273c7f6f28017fb115d6d02a58f81f16a01801079f156f7857099f6ed8122d` | `ev_bb61fb95b93d6c44c5ae78722db139edb043dddfeeab3a2e4bf80adcc56a58e9` | Parent: `ev_ca6dba26cbaca6c2677428d1cd92eca57c0ac920da923a250193a44b96df5640`<br/>Summary: `ev_96caabb22e940a61e8eee52e18aee5397ed1bbb1cd6a4a632e46b10be96ee041` | 10 / 15개 (166,761 B) | **39,450 노드** / 38건 | `data-flow`: 20,988, `call-flow`: 2,616, `closure`: 2,436, `boundary`: 70 |
| **라우드소싱 (Loudsourcing)** (`https://www.loud.kr/`) | `ev_9b4a78c0a73a2121c89f87511310bd5ebaae4037e42b7c0b706d8b2df4ef96d7` | `ev_d24ec0c394ed2200258223ebd9b93094b7acdcbf95927ad56ab5ffbccb5a03d8` | Parent: `ev_5e29c631ad5118111293c2419150e49fa0cbec8264ffb41fbb186037572ca1a8`<br/>Summary: `ev_b7a7442db7846367a664924dc531568f259a4fe578a2e935e0abf9430d75986e` | 42 / 56개 (472,458 B) | **101,917 노드** / 555건 | `data-flow`: 32,677, `call-flow`: 5,298, `closure`: 3,372, `object-flow`: 3,009 |
| **Trello** (`https://trello.com/`) | `ev_a6290a6f2604e641fd3c0d33db6a20ab5ae56ca90d8233ededda04bff5c4b40e` | `ev_65261eac5dcb248239a1aa6a4361e20bc9f02348ef6e68b6db7b36ee0b742439` | Parent: `ev_d50e8168ddd9ff202f0a9c84a6f6680422466e1e8214efbb5ba957f3914e70a8`<br/>Summary: `ev_3aaa6e525b67b1208fd87971a1f3d1a070a2108d15f6969d18080f257ed64fcf` | 14 / 23개 (295,711 B) | **77,599 노드** / 515건 | `data-flow`: 75,534, `object-flow`: 5,884, `closure`: 4,941, `call-flow`: 2,919 |
| **Monday.com** (`https://monday.com/`) | `ev_8605ebe0e3dc0a041104ecd0ef97445eca10e8fe3b6fe22b387e303900b8bf96` | `ev_dd74a7418cf5e5d232d65604ac864ec80bc8f9cff81cbfa7147d3dc46aed23b8` | Parent: `ev_9c5f9d73e58bda16c4084541a06eca32becc3d432cbed7055d7c986b1eb833ed`<br/>Summary: `ev_095c1d4126a37583d8b7c3d2f5f026e21af18d5d96e862473125c9f16f5349bb` | 12 / 37개 (137,875 B) | **44,260 노드** / 133건 | `data-flow`: 32,363, `closure`: 3,378, `call-flow`: 3,144, `object-flow`: 2,835 |
| **Loom** (`https://www.loom.com/`) | `ev_036c1d2eda88b63422a55b26ca4893a45cc8ec3fa4d1792098fc339064f158b7` | `ev_c5089c8c295e17e604c4d41fd0e0f8629cfbff224a786a1a78b46954168ca892` | Parent: `ev_76aad1f37a573e6161564d04c766195b619e984603b278794e230dbdd2d04fd5`<br/>Summary: `ev_f62d89dbaa9af0df9d85b670198bb412f0bdcb1c3d4102d32411151f57c974fb` | 28 / 61개 (554,642 B) | **136,267 노드** / 1,332건 | `data-flow`: 84,804, `object-flow`: 6,638, `closure`: 4,882, `promise-ownership`: 103 |
| **포스타입 (Postype)** (`https://www.postype.com/`) | `ev_43a1ce3a5b2166f16af3903e8bba7559aa6da4cd1c86635ad006dcf5893e0c54` | `ev_716719f952e332fb039c8c07be1bff072fb71d533d042d078acbc581d9623cd7` | Parent: `ev_f493c645df108c0a6355e444ec9c48e43ce26b292d77878fed5f4628c746f4c7`<br/>Summary: `ev_1658697c3873a26ba941c5c1cd68ff985aa5a3e181633a377f953121af72cc87` | 52 / 82개 (1,253,546 B) | **325,070 노드** / 3,117건 | `data-flow`: 68,242, `object-flow`: 6,734, `closure`: 5,346, `call-flow`: 1,695 |

### 2.2 Observed Facts (관찰된 사실)

1. **Linear (`ev_732d7d7541cabf9a852c363f78cced6581131d45f6d3c3337f86e0fe998d8628`)**:
   - 정적 라우트 테이블에서 `/intake` (Triage 인박스), `/asks` (부서 간 요청 접수), `/plan` (사이클 및 마일스톤), `/build` (분업 실행), `/quality` (품질 검증), `/insights` (병목·리드타임 분석), `/agents` (자동화 라우팅 에이전트), `/customer-requests` 등 36개 라우트가 확인되었다.
   - `static.linear.app/web/_next/static/chunks/*` 번들(루트 아티팩트 SHA-256 `f47b365a530120a1fa441422119520fb668ff9d7ce9036342b76d0ca08ccb961`)에서 87,809건의 `data-flow`와 8,064건의 `object-flow`가 추출되었으며, `GlobalSidePanel`과 `LayoutContent` 분리를 통해 목록/칸반 상태와 우측 인스펙터 컨텍스트를 동시에 유지한다.
2. **Frame.io (`ev_6e1be2c6fe414d1bc1b796460035f810ade397e372aaf9fc1d47b686cad6182f`)**:
   - 19개 스크립트 청크(루트 아티팩트 SHA-256 `3d6e14c5e654302bd30c4c08e25341006846a50ddd960eedf3e1a0b1f63b44d6`, 288개 모듈)에서 551건의 `promise-ownership` 및 18건의 `request` 관계가 관찰되었으며, 미디어 애셋 스트리밍과 프레임/버전 기반 비동기 상태 동기화를 수행한다.
3. **Figma (`ev_a80571a33b32a20a10c311f732617d28a87a580fea1b50898be743fc6a921357`)**:
   - 초기 부트스트랩 시 `GET https://www.figma.com/api/user` (HTTP 202) 세션 프로브를 수행하며, 41개 스크립트 청크(루트 아티팩트 SHA-256 `8353ea6ba3eacc88c52b09053d8c5823b2fb9eae173d0d54b5c497925d0d16da`, 289,544 AST 노드)에서 331건의 `boundary` 검증(JSON/스키마 파싱 경계)과 11,657건의 `call-flow`가 관찰되었다.
4. **크몽 Kmong (`ev_dac8146bc7028892d3268c8307ea637a4f18429b5b4a81af88aed9967bcca09f`)**:
   - Turbopack 기반 `_next-market-desktop` 번들(루트 아티팩트 SHA-256 `7fe4505989e65df6a0128fc8302cac3651ac728d7703480adced384b0bc1d394`, 264,841 AST 노드)에서 36개 라우트가 복원되었다 (`/buyer/order-list`, `/seller/order-list`, `/enterprise/projects/new`, `/enterprise/simple-apply/gate`, `/kmongbiz/biz-postpaid/histories`).
5. **Miro (`ev_09c0ecca15f3fa0058b34030edd7f571885c1b8f5377fa093d411b8792f2aa66`)**:
   - `mirostatic.com/website/static/production-eu/framer-code-components/shared/event-hub-irBlRqb4.esm.js` 및 `web-tracker.esm.js` 등 12개 스크립트(59,796 AST 노드)에서 44,251건의 `data-flow`와 4,445건의 `closure`가 관찰되었으며, 무한 캔버스 보드 내 이벤트 허브 기반 상태 브로드캐스트 구조를 갖는다.
6. **ClickUp (`ev_cbd420a8a66aa0d54c6033bf81db7eb5d8d33a6726d36676644fc2e75ec05eb2`)**:
   - 24개 스크립트(230개 모듈, 166,433 AST 노드)에서 **105개 정적 라우트**가 복원되었다:
     - 시간 추정·트래킹·간트·화이트보드: `/features/time-estimates`, `/features/project-time-tracking`, `/features/gantt-chart-view`, `/features/whiteboards`, `/features/kanban-board`, `/features/sync-up`, `/features/automations`
     - 에이전트 협업 및 애니메이션 스튜디오 레퍼런스: `/brain/agents`, `/brain/ambient-agents`, `/customers/cartoon-network`
7. **숨고 Soomgo (`ev_e70b953af984e6038a3a462b27d8a942b6e82612a6ad23d600529c395791d73c`)**:
   - 25개 스크립트(158개 모듈, 99,296 AST 노드)에서 `/search/globals/[keyword]`, `/search/pro` (전문 고수 탐색·견적 매칭), `/store` (마켓 상품), `/profile`, `/setting/notification` 등 7개 핵심 라우트와 53,840건의 `data-flow`가 복원되었다.
8. **위시켓 Wishket (`ev_5349f3be63bd7585acd4a48d1076d329b208dc0642347803c55f104d679a7f6f`)**:
   - 18개 스크립트(`wishket_utility.js`, `wishket_component.js`, `wishket-multiselect.js`, `wishket_guide.js` 등 50,153 AST 노드)에서 58건의 DOM/컴포넌트 `event` 바인딩과 3,576건의 `call-flow`가 확인되었다.
9. **Notion (`ev_61519886a6fc85077570ffe2e75f72a1fc0b97e46e7cbb77598f464a048bfcf9`)**:
   - 24개 스크립트(루트 아티팩트 SHA-256 `5c3c3fed972a7017a983653d7d215db4e109905b90034023e30d69d81a5683d2`, 175,219 AST 노드)에서 54개 라우트와 58,332건의 `data-flow`, 5,745건의 `object-flow`가 추출되었으며, 블록 단위 동기화(Synced Blocks)와 워크스페이스·서브페이지 권한 격리 구조를 갖는다.
10. **Asana (`ev_19fb242eaa5f7a5689c4fdc6e00f3e63eba1fe3d4abe7da929f58fe76db8a17c`)**:
    - 66개 스크립트(루트 아티팩트 SHA-256 `c0363d32e34488dcfec9bb6081fe6cac8f8fb903346c5fa974772181c769a284`, 197개 모듈, 179,224 AST 노드)에서 1,396건의 Finding과 39,694건의 `data-flow`가 확인되었으며, 단일 태스크를 여러 프로젝트 보드에 복제 없이 동시 귀속하는 멀티호밍(Multi-Homing) 그래프 구조를 사용한다.
11. **아트머그 Artmug (`ev_96caabb22e940a61e8eee52e18aee5397ed1bbb1cd6a4a632e46b10be96ee041`)**:
    - `lib.Function.js`, `lib.lightBox.js`, `lib.popupBox.js`, `lib.messageBox.js`, `lib.ckForm.js`, `lib.ajax.js` 등 10개 핵심 번들(39,450 AST 노드)에서 20,988건의 `data-flow`와 70건의 폼·모달 `boundary` 검증이 확인되었다.
12. **라우드소싱 Loudsourcing (`ev_b7a7442db7846367a664924dc531568f259a4fe578a2e935e0abf9430d75986e`)**:
    - `SearchDesignerSlider.BK6Z8GW8.chunk.js`, `ExpertCard.DHAP_Lt5.chunk.js`, `_recommend.evxQjwjx.chunk.js` 등 42개 Nuxt/Vite 청크(101,917 AST 노드)에서 32,677건의 `data-flow`와 5,298건의 `call-flow`가 확인되었다.
13. **Trello (`ev_3aaa6e525b67b1208fd87971a1f3d1a070a2108d15f6969d18080f257ed64fcf`)**:
    - 14개 추출 스크립트(루트 아티팩트 SHA-256 `8cabad7a61fb57445186c2401eed4d189b5b1535c2b646b1d84c7ace4badbbc2`, 77,599 AST 노드, 134개 모듈)에서 75,534건의 `data-flow`, 5,884건의 `object-flow`, 4,941건의 `closure`, 53건의 `promise-ownership`이 관찰되었으며, 카드 체크리스트·리스트 이동 트리거 기반 Butler 자동화 규칙 구조를 갖는다.
14. **Monday.com (`ev_095c1d4126a37583d8b7c3d2f5f026e21af18d5d96e862473125c9f16f5349bb`)**:
    - 12개 추출 스크립트(루트 아티팩트 SHA-256 `1b33774e1b878ce164e7f0b78c5e3338392c144c4f24f34bbfc2243f262dc6e4`, 44,260 AST 노드, 34개 모듈)에서 32,363건의 `data-flow`, 3,378건의 `closure`, 3,144건의 `call-flow`, 2,835건의 `object-flow`가 관찰되었으며, 보드 간 연결 컬럼(Mirror Column)과 상태 비율 배터리 게이지(Status Battery Gauge) 집계 패턴을 사용한다.
15. **Loom (`ev_f62d89dbaa9af0df9d85b670198bb412f0bdcb1c3d4102d32411151f57c974fb`)**:
    - 28개 추출 스크립트(루트 아티팩트 SHA-256 `10512be80418e493b0894e186b589abcfea93c0615b630a0d22ef6541581e1b6`, 136,267 AST 노드, 346개 모듈)에서 `/connect/[slug]`, `/connect/enterprise`, `/pricing` 등 5개 라우트(`ev_2b802492a23fc50b4ebffa7e0dc660943bc561dd25d518876f564feca8178443`)와 84,804건의 `data-flow`, 6,638건의 `object-flow`, 103건의 `promise-ownership`이 관찰되었으며, 타임스탬프 기반 비동기 비디오 워크스루·챕터·트랜스크립트 액션 아이템 추출 및 이모지 리액션 동기화 구조를 갖는다.
16. **포스타입 Postype (`ev_1658697c3873a26ba941c5c1cd68ff985aa5a3e181633a377f953121af72cc87`)**:
    - 52개 추출 스크립트(루트 아티팩트 SHA-256 `8030fa9b860e17a696f3497e30669bf4ab12102b41304538ccdd2be7fa3d25e8`, 325,070 AST 노드, 643개 모듈)에서 3,117건의 정적 분석 Finding과 68,242건의 `data-flow`, 6,734건의 `object-flow`, 5,346건의 `closure`, 46건의 `boundary` 검증이 관찰되었으며, 공동 창작 시리즈(웹툰·웹소설·일러스트북) 유료 에피소드 코인/포인트 판매·후원·멤버십 수익 배분 및 채널 에디터 분업 구조를 갖는다.

### 2.3 Inferences (역공학 추론 및 도메인 결합 원리)

1. **인계 게이트(Handoff Gate) + Triage 인박스 결합 (Linear `/intake` + `/asks` + Figma `Ready for Dev` / `Branch & Merge`)**:
   - 8단계 공정 전환마다 **자동 프리플라이트 체크리스트 + SLA 타이머 + 인계 패킷(Handoff Packet)**을 강제한다.
2. **프레임/컷 단위 드로오버 합의 및 버전 스택 비교 (Frame.io Review + SyncSketch/ftrack Stage-Gate)**:
   - 컷 번호·좌표(`x, y`) 기반 **드로오버(Draw-Over) 어노테이션 핀**, 버전 스택(`v1 → v2 → v3`) 비교, 그리고 **5대 데스크 다자 승인 쿼럼(Quorum)**을 결합한다.
3. **분업 외주 에스크로·무료 수정 횟수 가드·세금/원천징수 정산기 (크몽 `/buyer/order-list`, `/kmongbiz/biz-postpaid/histories`)**:
   - **무료 수정 횟수 초과 시 할증 가드(Scope Creep Guard)**와 **3.3% 사업소득 원천징수 vs 10% 부가세 세금계산서** 자동 정산 원장을 제공한다.
4. **실시간 에디터 레이어 분업 좌석 배정(Layer Seat Lease) 및 인계/직권 회수 (Figma Multiplayer + V18 §11/§12 Layer Seat Model)**:
   - 인계 서피스(`ProductionHandoffSurface`) 및 라이브 레이어 좌석 모델(`studio-layer-seat-model.ts`)에서 레이어별 분업 모드(`exclusive`, `shared-strokes`, `shared-elements`, `review-only`)와 편집 의도(`paint`, `erase`, `transform`, `text`, `filter`, `merge`)를 Fail-Closed로 검증하고, 실시간 좌석 점유·인계 요청·PD 직권 회수(Takeover)를 제어한다.
5. **즉시 견적 비교·유료 파일럿 테스트 3컷·저작권 귀속 조건 매칭 (숨고 `/search/pro` + 위시켓 `wishket-multiselect`)**:
   - 협업 보드(`/collaborate`)에서 목표 공정·컷 수·납기·저작권 조건(매절 양도 vs 연재 독점 이용허락 vs 공동저작)·유료 파일럿 3컷 여부를 설정하면 적정 시장 단가 범위와 검증된 전문 파트너 3인의 맞춤 견적서를 즉시 비교·채택한다.
6. **컷·장면 공정 의존성 화이트보드 & 시간 추정(Time Estimates) 크리티컬 패스 분석기 (Miro + ClickUp `/features/time-estimates`, `/features/gantt-chart-view`)**:
   - 기획 서피스(`ProductionPlanningSurface`)에서 선행·후행 공정 의존성 그래프의 최장 경로(Critical Path)와 여유 시간(Slack Hours), 추정 시간 대비 실측 시간을 계산하고 팀원 클러스터 투표(`Dot Voting`)와 병렬 버퍼 재배치를 지원한다.
7. **크루 가용성(Workload Capacity) & 표준 계약·크레딧·2차적저작물 권리 보호 매트릭스 (ClickUp `/features/sync-up` + 위시켓 계약 보호)**:
   - 팀 서피스(`ProductionTeamSurface`)에서 참여자별 주간 가용 시간 대비 배정 부하율(85% 경고·100% 과부하 차단)과 표준 계약서·크레딧 표기·2차적저작물 별도 정산 합의 상태를 한눈에 점검하고 과부하 컷을 여유 인원에게 즉시 재배정한다.
8. **4단계 컨펌(러프→선화→밑색→마감) 이전 공정 역주행(Upstream Rollback) 할증 가드 & 원본 PSD/CLIP 납품 규격 검수 (아트머그 + 라우드소싱 + Notion)**:
   - 채용·지원 서피스(`HiringPositionsPage`, `HiringWorkspacePage`)에서 단계별 컨펌 잠금 이후 이전 공정(예: 채색 단계에서 선화/콘티 수정) 역주행 요청 시 자동 할증 비용을 산출하고, 원본 PSD/CLIP 레이어 분리·해상도·컬러 프로파일 5대 규격 및 유급 샘플 3컷 테스트를 게이트로 강제한다.
9. **공고 ↔ 채용 ↔ 프로덕션 ↔ 스튜디오 좌석 멀티호밍(Multi-Homing) 브리프 동기화 & 최소 권한 원고 격리 (Asana + Notion)**:
   - 구인·의뢰 상세 페이지(`CollaborationPostPage`)에서 합의된 브리프 블록을 복제 없이 4개 보드(`/collaborate/:id`, `/team/recruiting`, `/production`, `/studio`)에 동시 귀속(Multi-Home)하되, 전체 비공개 원고 대신 담당 레이어 좌석(`layer:p1:<role>`)만 최소 권한으로 개방한다.
10. **비동기 컷·레이어 비디오 워크스루(Loom) & Butler 공정 자동 전이 규칙 엔진(Trello)**:
    - 리뷰 서피스(`ProductionReviewSurface`)에서 PD·감독의 비동기 화면 녹화 워크스루 클립 타임스탬프(`00:18`, `01:05` 등)와 컷·레이어(`layer:p1:lighting-fx` 등) 액션 아이템을 1:1 바인딩하고, 모든 필수 수정 액션 아이템 완료 시 Trello Butler 규칙에 따라 카드를 차기 공정 리스트로 자동 이동·담당자 멘션·인계 체크리스트 자동 생성까지 무중단 수행한다.
11. **공동 창작 시리즈 유료 수익 정산 원장(포스타입 Postype) & 교차 보드 미러 컬럼·배터리 게이지(Monday.com)**:
    - 공동집필·공고 에디터(`CollaborationEditorPage`)에서 스토리/콘티·선화·배경·채색/식자 공동 창작자의 MG(미니멈 개런티) 우선 공제 후 순수익 RS 지분(합계 100% 불변량 검증)과 3.3% 원천징수 실수령액을 시뮬레이션하고, 4대 분리 보드(시나리오·작화·채색·식자/유통)의 미러 컬럼과 Monday.com 스타일 배터리 게이지를 실시간 동기화한다.

### 2.4 Explicit Unknowns (명시적 미확정 영역)

- 인증 세션 이후의 서버 측 비공개 Mutation 페이로드(Linear 내부 동기화 델타, Frame.io C2PA 서명 키 교환, 크몽/숨고/위시켓/아트머그/라우드소싱/포스타입 내부 에스크로·정산 PG 웹훅, Miro/ClickUp/Notion/Asana/Trello/Monday.com/Loom 비공개 워크스페이스 소켓 프레임)는 공개 캡처 범위에서 실행되지 않았으므로 `unknown`으로 분리 기록하며, ToonStudio 내재화 시에는 자체 클린룸 결정론적 TypeScript 도메인 모델로 구현한다.

---

## 3. ToonStudio 클린룸 내재화·고도화 아키텍처 (총 12대 모듈)

| 모듈 | 도메인 모델 | UI 컴포넌트 스위트 | 마운트 서피스 (라우트) |
| --- | --- | --- | --- |
| **Module 1: 다단계 분업 핸드오프·트리아지·브랜치 병합 스위트** | `apps/web/src/domains/creator/production-hub/production-division-handoff-triage-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionDivisionHandoffTriageSuite.tsx` | `ProductionHandoffSurface.tsx` (`/production/projects/:projectId/handoff`) |
| **Module 2: 컷/프레임 드로오버 리뷰·버전 스택·다자 승인 합의 스위트** | `apps/web/src/domains/creator/production-hub/production-creative-review-consensus-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionCreativeReviewConsensusSuite.tsx` | `ProductionReviewSurface.tsx` (`/production/projects/:projectId/review`) |
| **Module 3: 웹툰 외주 분업 에스크로·수정 횟수 가드·정산 원장 스위트** | `apps/web/src/domains/creator/production-hub/production-outsourcing-settlement-guard-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionOutsourcingSettlementGuardSuite.tsx` | `ProductionCommercialSurfaces.tsx` (`/production/projects/:projectId/procurement`) |
| **Module 4: 웹툰 6대 공정 크루 분업 시뮬레이터 및 배턴 플래너** | `apps/web/src/domains/collaboration/collaboration-crew-division-planner-model.ts` | `apps/web/src/domains/collaboration/CollaborationCrewDivisionPlanner.tsx` | `CollaborationBoardPage.tsx` (`/collaborate`) |
| **Module 5: 실시간 캔버스 레이어 분업 좌석 배정(Layer Seat Lease) 워크벤치** | `apps/web/src/domains/creator/live/studio-layer-seat-model.ts` | `apps/web/src/domains/creator/live/StudioLiveLayerSeatDivisionBench.tsx` | `ProductionHandoffSurface.tsx` (`/production/projects/:projectId/handoff`) |
| **Module 6: 공정별 즉시 견적 비교·유료 파일럿 테스트·저작권 조건 매칭 스위트** | `apps/web/src/domains/collaboration/collaboration-instant-quote-matcher-model.ts` | `apps/web/src/domains/collaboration/CollaborationInstantQuoteMatcherSuite.tsx` | `CollaborationBoardPage.tsx` (`/collaborate`) |
| **Module 7: 컷·장면 공정 의존성 화이트보드 & 시간 추정 크리티컬 패스 분석기** | `apps/web/src/domains/creator/production-hub/production-cut-dependency-time-estimator-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionCutDependencyTimeEstimatorSuite.tsx` | `ProductionPlanningSurface.tsx` (`/production/projects/:projectId/planning`) |
| **Module 8: 스튜디오 크루 가용성(Workload) & 표준 계약·크레딧·권리 보호 매트릭스** | `apps/web/src/domains/creator/production-hub/production-crew-workload-contract-matrix-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionCrewWorkloadContractMatrixSuite.tsx` | `ProductionTeamSurface.tsx` (`/production/projects/:projectId/team`) |
| **Module 9: 4단계 컨펌(러프·선화·밑색·마감) 역주행 할증 가드 & PSD/CLIP 규격 검수 스위트** | `apps/web/src/domains/collaboration/hiring/collaboration-step-confirm-spec-model.ts` | `apps/web/src/domains/collaboration/hiring/CollaborationStepConfirmSpecSuite.tsx` | `HiringPositionsPage.tsx`, `HiringWorkspacePage.tsx` (`/collaborate/:id/positions`, `/team/recruiting`) |
| **Module 10: 멀티호밍(Multi-Homing) 브리프 4대 보드 동기화 & 최소 권한 원고 격리 스위트** | `apps/web/src/domains/collaboration/collaboration-multi-homing-brief-model.ts` | `apps/web/src/domains/collaboration/CollaborationMultiHomingBriefSuite.tsx` | `CollaborationPostPage.tsx` (`/collaborate/:id`) |
| **Module 11: 비동기 컷·레이어 비디오 워크스루(Loom) & Butler 공정 자동 전이 규칙 스위트(Trello)** | `apps/web/src/domains/creator/production-hub/production-async-walkthrough-butler-model.ts` | `apps/web/src/domains/creator/production-hub/ProductionAsyncWalkthroughButlerSuite.tsx` | `ProductionReviewSurface.tsx` (`/production/projects/:projectId/review`) |
| **Module 12: 공동 창작 시리즈 유료 수익 정산 원장(Postype) & 교차 보드 미러 컬럼·배터리 게이지 스위트(Monday.com)** | `apps/web/src/domains/collaboration/collaboration-coauthor-revenue-mirror-model.ts` | `apps/web/src/domains/collaboration/CollaborationCoauthorRevenueMirrorSuite.tsx` | `CollaborationEditorPage.tsx` (`/collaborate/new`, `/collaborate/:id/edit`) |
