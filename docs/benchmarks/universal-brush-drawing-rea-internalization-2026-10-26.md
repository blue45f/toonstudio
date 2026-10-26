# 글로벌 GitHub 오픈소스·웹 드로잉·상용 페인팅 브러시 생태계 REA 역공학 및 ToonStudio 전수 내재화 보고서 (2026-10-26)

- **작성일**: `2026-10-26`
- **상태**: `current` (Wave 21 & Wave 22 전수 구현 및 검증 완료)
- **관련 모듈**:
  - `apps/web/src/domains/creator/drawing/studio-universal-brush-taxonomy-engine.ts`
  - `apps/web/src/domains/creator/drawing/studio-vector-skeletal-pattern-brushes.ts`
  - `apps/web/src/domains/creator/drawing/studio-particle-pixol-brushes.ts`
  - `apps/web/src/domains/creator/drawing/StudioUniversalBrushEngineBar.tsx`
  - `apps/web/src/domains/creator/drawing/StudioNaturalMediaShowcase.tsx`
  - `apps/web/src/domains/creator/drawing/studio-csp-benchmark-scorecard.ts`
  - `apps/brush-lab/src/engine/brush-engine/universal-brush-suite.ts`

---

## 1. REA 실측 증거 원장 (Observations — Evidence Ledger)

2026-10-26 `rea` MCP 도구(`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`)를 실행하여 확보한 해시·AST·네트워크 증거는 다음과 같다.

| 대상 (Target) | 분류 | 브라우저 캡처 Evidence ID | 스크립트 추출 Evidence ID | 정적 AST 분석 Evidence ID (Parent) | 아티팩트 SHA-256 | 방문 AST 노드 수 |
|---|---|---|---|---|---|---:|
| **GitHub OSS Brush Sources** (`mrdoob/harmony` 11종, `p5.brush`, `rough.js`, `signature_pad`, `atrament.js`, `drauu`) | GitHub OSS | — | — | `ev_65fa507705d8e84f227eda0e5097e313ea7de54220f7fc174f116a98120e40b0` (`ev_5fede536bd56d48bc9ce7e2509cf9bb1252d07508d47c548b19c848b71870e79`) | `1d782c41bc1d732428906f347480ad6c3497b9c406bc311509e1f0bef3a2f295` | 45,055 |
| **Sketchpad 5.1** (`https://sketch.io/sketchpad/`) | 웹 드로잉 앱 | `ev_7e6688ce67d040e9ab482dd4ae3487efa6e1e762835db4092da91e94171422a6` | `ev_265c5085049b9eec690e8761517f7107a37e805cc25fbb0fa37b680df42314c1` | `ev_6b3563eadf2d1858e5af86ff1cb2553192f776348d4fb439c57804f8028c9fd4` (`ev_22383efbcf1b7552d0bcb14a1f25b47cb33b21592272575a731aee9a8cce0dfe`) | `0d4029137ef3f3beb8a06332f06b646485b156a9bd7954401b3a64f979e31eb0` | 10,847 |
| **JS Paint & Pixel Art Suite** (`https://jspaint.app/`) | 웹 픽셀/래스터 앱 | `ev_6fd2d5a3e1fd6f6d9fc0210e17df9c4abd11fc0256201f00e0d7019f71397e68` | `ev_c2e6127c08c529c0db1d93e038ea2126dd3605fea7b6829f769bc1be2509d1cd` | `ev_ccb57ca836a3d3f25ebe9464c91d72df7924325ccdbaaf4b7b646c0371cd62bc` (`ev_3ce3e1e2b7ab82d6db1dee8c87629431d78e3801bdc104ca5d0d6b719f8a6641`) | `dcd0e1649a4cb38db9baf74c0c6ccb3859aaf70e348c9df1db1f5cd16246171b` | 102,956 |
| **ibisPaint X** (`https://ibispaint.com/`) | 상용 웹툰·페인팅 앱 | `ev_a516d528a8f77e80ffe06ead86b37d29d8e637c261023ff8c88e3a9693440f93` | `ev_be3b394af4e52c95c9b50d02948605f0cfa48d5b83fcdaeb1132bb52d1417f9e` | `ev_7caa80e493b3f8cd5ed8c330007d429541002fc4573b69fb50b9be2d80084629` (`ev_58a0d3eb23c5d369893fc5311ddd509139a0ea53fe53f8c8aa07e51700b89139`) | `8e67ed1914d03dc3589232b48b1efd3b478a23031f8c193d4ce815ea466103ee` | 9,176 |
| **MediBang Paint** (`https://medibangpaint.com/en/`) | 상용 웹툰·클라우드 브러시 | `ev_331ca47f8685d449ee8f1725303e04bd48c7187df2f51a73956edfcf5e0e7eb6` | `ev_73109f9ee1937f99d6bea5cd205de36f01af6d810d7e8731db1009509533712e` | `ev_a781ea653ff05d051f2411b5420d870cd38bc9249f092fab76737c4bc574fd97` (`ev_719930d8d7a8e9f0d50b68f0f5447a1fffbb62839d5d0a1786480613bccbe9b2`) | `bd74f0320df8a7dd55bd886d027d1f3b5184375df19052fcee0b66e5951c5665` | 78,366 |
| **Photopea** (`https://www.photopea.com/`) | 웹 래스터·ABR 에디터 | `ev_20b66c56a3a07d89aa27f4486a608ba67f1ec73e3f8d783339bb1802ba595e6b` | `ev_0b3590ceddbfa5e86f4d4a96fb21124d752736bcb6388fa9430910a2bca5bf7a` | `ev_2c7410e9b58c4f01ae624554a7a2be12f78edef48545916effd56e0f06970312` (`ev_7274f767d2399b8ce09969ad8fc486c8be733e05081e48048d70768ab8333831`) | `79c4fff49fec275b640238bf5f81fcbde473235363bf72a882511017cc5af3b5` | 10,137 |
| **Wave 22 OSS Brush·Vector·Sculpt Suite** (`fabric.js`, `piskel`, `sculptgl`, `wick-editor`, `lazy-brush`, `fit-curve`, `bezier.js`, `konva`, `simplify-js`) | GitHub OSS | — | — | `ev_b116ab58b81a3c1b837bf82855bc8b574fefc8c0c8fda21399c1a6ef8a725df1` (`ev_7889f4c77aad850c565c1d5e5b2b9618368d5f94eff95cb2ece35a3771dae667`) | `510a0da4e35bbe61a0d309b737a72d666584d9050085dad6130c7e7a37fa6cae` | 23,390 |
| **Piskel** (`https://www.piskelapp.com/`) | 웹 픽셀·스프라이트 앱 | `ev_31e9df64e7f548071647c690e34cf2f42075cefc7359d7dc19059f64c155e03c` | `ev_6fda2408a20363be44feeef9409982682e3c8425bf5db45f61c6a62a23bcde0e` | `ev_5a75a372d991fc4dde5896b74d6d91b36b78b43d2500f1ebb1ebefa43e8d18f9` (`ev_82b7781c296d130965ced1b9c7271602063fe4a33541a4108242486740727a3d`) | `9154751284c4e63ff06a889631bfbab0c2d33c4acc83ff611231732cacbe7ca5` | 8,929 |
| **Drawpile** (`https://drawpile.net/`) | 협업 페인팅 시스템 | `ev_767fbe775e3da4520ed43966ebe658bdc75d4b867ca6217d62ca253b497211cc` | `ev_4522a94365cee2c024020f69da2fc75bac6018dbe8341d3f0de38a257ebca71e` | `ev_46da1a1c19b0742519ff5d8d880d566ae7a834f7b1857e60d83eed4985791034` (`ev_fe38bbdeace34a459a3480551f85a4df2f524cc685b94988b0422b88f787d03d`) | `fe7723120806a795457f965aea210db1efc942687876f62efdbc1f80456a016c` | 447 |
| **HeavyPaint & Commercial Vector/Particle Suite** (`https://www.heavypaint.com/`) | 상용 그래픽·입자 앱 | `ev_b6f1dfacd4c2abfcf79528fad5a585dce05c631d58530767c14b9787da3c95ba` | `ev_b5d8a9f72f29f17b4b6ce5fb17ceee3f646a25db1ca993667dcc9e0f067ba57d` | `ev_0f42419ab6f9c7b153f1cb23a878d61880dd76e4e70878c6113c9797ac67abb3` (`ev_a871b839aa1210775ae3db8922977f6eb7ac6f530ee6f3ea8dffc4bc9b7d69f9`) | `d0eb89a25893da8ee9b9f652b2d32722c03b7a8bad423690035db8c33ed04442` | 15,666 |

---

## 2. 역공학 관찰 및 수학적 행동 계약 (Observations & Inferences)

### 2.1 `mrdoob/harmony` 11종 절차적 브러시 스위트 (Observation)
- `harmony-sketchy.js`, `harmony-shaded.js`, `harmony-chrome.js`, `harmony-fur.js`, `harmony-longfur.js`, `harmony-web.js`, `harmony-ribbon.js`, `harmony-squares.js`, `harmony-grid.js`, `harmony-circles.js`, `harmony-simple.js` 11개 파일의 AST 및 소스에서 다음 수식이 직접 관찰되었다:
  - **`sketchy`**: 현재 점 $p_c$와 히스토리 점 $p_i$ 사이의 거리 제곱 $d^2 = \Delta x^2 + \Delta y^2 < 4000$이고 난수 $u > d^2 / 2000$일 때, 양 끝점을 $0.3\Delta$만큼 내측으로 수축한 현 $[p_c + 0.3\Delta, p_i - 0.3\Delta]$을 $\alpha = 0.05p$로 연결한다.
  - **`shaded`**: $d^2 < 1000$인 모든 히스토리 점에 대해 거리 제곱에 반비례하는 불투명도 $\alpha = (1 - d^2/1000) \cdot 0.1p$로 현을 그린다.
  - **`chrome`**: $d^2 < 1000$일 때 $[p_c + 0.2\Delta, p_i - 0.2\Delta]$ 현을 그리되 RGB 각 채널에 독립 난수를 곱해 금속성 색수차 광택을 만든다.
  - **`fur` / `longfur`**: `fur`는 $d^2 < 2000$에서 $[p_c + 0.5\Delta, p_c - 0.5\Delta]$ 대칭 털 가닥을 방출하고, `longfur`는 음수 난수 스케일 $s = -u$와 $d^2 < 4000$ 조건으로 비대칭 장모를 방출한다.
  - **`ribbon`**: 스프링-댐퍼 서브 페인터가 $a_{t+1} = (a_t + (p_t - m_t) \cdot 0.1) \cdot \text{ease}$ 방정식으로 포인터를 추종한다.

### 2.2 `acamposuribe/p5.brush` 11종 프리셋·7종 벡터장·다각형 수채 번짐 (Observation)
- `p5-brush.js` 정적 분석(`ev_65fa507705d8e84f227eda0e5097e313ea7de54220f7fc174f116a98120e40b0`)에서 11종 프리셋 테이블 `vr`(`pen`, `rotring`, `2B`, `HB`, `2H`, `cpencil`, `pastel`, `crayon`, `charcoal`, `spray`, `marker`)의 12개 속성과 7종 벡터장(`hand`, `curved`, `zigzag`, `waves`, `seabed`, `spiral`, `columns`) 생성 함수가 직접 확인되었다.

### 2.3 JS Paint (`jspaint.app`) · Piskel (`piskelapp.com`) · Pixelorama 비트맵 브러시 (Observation)
- `export_web_scripts`(`ev_c2e6127c08c529c0db1d93e038ea2126dd3605fea7b6829f769bc1be2509d1cd`)로 복원된 `src/tools.js`에서 `circle`·`square`·`diagonal`·`reverse_diagonal` 4종 브러시 형태가 확인되었고, `piskel-DitheringTool.js` 및 `piskel-Lighten.js`(`ev_b116ab58b81a3c1b837bf82855bc8b574fefc8c0c8fda21399c1a6ef8a725df1`)에서 `(col + row) % 2` 체커보드 디더링과 `oncePerPixel` 멱등 명도 변조가 확인되었다.

### 2.4 SculptGL 2.5D/3D 조각 폴오프 · Fabric.js 스프레이 중복 제거 · Lazy-Brush 원형 마찰 (Observation)
- `sculptgl-Brush.js` 및 `sculptgl-Crease.js`(`ev_b116ab58b81a3c1b837bf82855bc8b574fefc8c0c8fda21399c1a6ef8a725df1`)에서 $d = \|\mathbf{p}-\mathbf{c}\|/R \in [0,1]$에 대한 $C^2$ 4차 다항식 폴오프 $f(d) = 3d^4 - 4d^3 + 1$ 및 Crease 5제곱 날카로운 능선 수식 $f(d)^5$이 직접 확인되었다.
- `fabric-spray_brush.js`에서 `_getOptimizedRects` 정수 격자 좌표 키 중복 제거(`optimizeOverlapping`)가 확인되었고, `lazy-brush.js`에서 원형 마찰 감쇠 $1 - \sqrt{1 - (1 - f)^2}$가 확인되었다.

### 2.5 상용 벡터 골격·5-타일 패턴·입자 물리·다중색 스와치 브러시 (Inference & Clean-Room Behavioral Modeling)
- **Illustrator / Affinity Designer**: 비신축 가이드(`headGuide01`, `tailGuide01`)로 양 끝단 물리 호 길이를 보존하는 `warpSkeletalArtBrushAlongSpine`과 꼭짓점 회전각 $\Delta\theta$로 내·외측 코너 타일을 자동 배치하는 `layoutFiveTileVectorPatternBrush`로 내재화했다.
- **Inkscape / Corel Painter / WeaveSilk / HeavyPaint / ArtRage / Fresco / Milton**: 캘리그라피 펜촉 관성·Spiro 곡률·PowerStroke 폭 보간, 3대 입자 브러시(`spring`/`gravity`/`curl_flow`), WeaveSilk $D_n$ 조화 리본, HeavyPaint 블록인, ArtRage Gloop 점성 방울, Fresco 다중색 스와치, Milton $4\times$ RGSS 해석적 캡슐 SDF를 클린룸 수식으로 통합했다.

---

## 3. 한계 및 미확정 영역 (Limitations & Unknowns)

- 상용 네이티브 데스크톱/모바일 앱(Paint Tool SAI Ver.2, Corel Painter, ArtRage Vitae, Adobe Illustrator/Fresco)의 비공개 바이너리 셰이더는 본 웹 세션에서 직접 실행하지 않고, 공개된 웹 포털·오픈소스 AST 증거(`ev_b116ab58...`, `ev_0f42419a...`)와 문서화된 수학 사양을 기반으로 클린룸 모델로 재구성했다.
- `apps/brush-lab`의 엄격한 라이선스 게이트(`license-policy.test.ts`, `boundary.test.ts`)에 따라 CC BY-NC(`mixbox`), Prosperity(`lygia`), GPL 원본 코드는 단 한 줄도 참조하거나 복사하지 않았으며, 모든 연산은 결정론적 `Pcg32` 난수와 `kmMixRgb` Kubelka-Munk 색공간 위에서 독립 구현했다.
