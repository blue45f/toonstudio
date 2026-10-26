# 글로벌 GitHub 오픈소스·웹 드로잉·상용 페인팅 브러시 생태계 REA 역공학 및 ToonStudio 전수 내재화 보고서 (2026-10-26)

- **작성일**: `2026-10-26`
- **상태**: `current` (Wave 21 · Wave 22 · Wave 23 · Wave 24 · Wave 25 전수 구현 및 검증 완료)
- **관련 모듈**:
  - `apps/web/src/domains/creator/drawing/studio-universal-brush-taxonomy-engine.ts`
  - `apps/web/src/domains/creator/drawing/studio-vector-skeletal-pattern-brushes.ts`
  - `apps/web/src/domains/creator/drawing/studio-particle-pixol-brushes.ts`
  - `apps/web/src/domains/creator/drawing/studio-bezier-curve-fit-brushes.ts`
  - `apps/web/src/domains/creator/drawing/studio-mypaint-spectral-boolean-brushes.ts`
  - `apps/web/src/domains/creator/drawing/studio-freehand-rough-spatial-brushes.ts`
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
| **Wave 23 OSS Klecks 6-Brush + MyPaint + Spectral Suite** (`bitbof/klecks`, `libmypaint`, `polygon-clipping`, `spectral.js`, `colormix.js`) | GitHub OSS 시맨틱 | — | `ev_5a5058a8b1e9c6068bf847583f6765e826500678c159276275968696ab6b6498` | `ev_937159dfabc0d0622717008d837dab1785fb85ea95bd8e43660ee3bcd18e1fd6` (`ev_daf2ba14969413fdf609777edfe943394072c96f6047ed14a5d8599f251f06d0`) | `0f2b28c8083d60a19094833592f9b5f236339d5f546e8078dc4fd3a45efa5994` | 40,379 |
| **Kleki Paint Tool Live Web** (`https://kleki.com/`) | 웹 드로잉 앱 | `ev_e18363e6ca16f1021568217f61ca8b0bd0fb8985502a9bb9cf7caa9b89d8489b` | `ev_fea11f72411af055b8c7ad205cf8e396dbc8422791e9e92f09e86283cf7ddfb3` | `ev_0516537b2ec94a9be6d2a5b8ad462f092ccbfb8385dae17119682e25d66ecc0b` (`ev_4f595af8dd54f2b16616eacd326cec6836a7cf487e2ef741942c51ecfc657cbf`) | `729961c419cdfce0d959e266da81e2084f897acd38a1b7d9ed8394584456ba62` | 6,299 |
| **SculptGL Live WebGL App** (`https://stephaneginier.com/sculptgl/`) | 웹 3D 조각 앱 | `ev_36354f8da48307c96490a6867a35c5263751e84667a861d366f6aee5c2ef118c` | `ev_5987f111cacd4a5496b4c58fb7adf164805d0445f40f8be8597942b0d1959979` | `ev_69e649b77cb172c5d3af961306998500a9d2e971b0dc9383d818582a9edbf6ef` (`ev_dc3c4491d9c09949ef98b8c5429d5ee8517e128711bf903d731c9135b369d4fb`) | `8b2a7bdcbd67777df57b81fb0c6b7e036a472a115d845dacf9e5f9d8d54423da` | 12,163 |
| **Wave 25 OSS Freehand·Rough·Spatial Suite** (`steveruizok/perfect-freehand`, `rough-stuff/rough`, `mourner/simplify-js`, `mourner/rbush`) | GitHub OSS 시맨틱 | — | `ev_396f3dc483117865fbe719b384173cdf98ba300894d32c7adbc6f619a93ae485` | `ev_20799b6fe98e9be9b759cc172e64a0dfcfce7d71f377c33b77b96623171e01af` (`ev_f89fe384ed368eddb2cf116d7384604469f217ceb5aa9491f00efad99bda9813`) | `b7ee90dfb1da437134d89a7d31d716850b669c35e462a9a6d6b3ae68d336a8f8` | 19,576 |

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

### 2.6 Wave 23 심층 시맨틱 추적: Schneider 3차 베지어 피팅·Pomax 평행 오프셋·Klecks 6종 브러시·Wick Croquis/갭필 (Observation)
- `trace_javascript_semantics`(`ev_0249f50541a3e6ba75de40cacc096f72ef58e3732ff4a2b758512c0f91fbab21`, `ev_b6695ade9b6a931144c9eaa40e5fc84c1874519aa23b3eac76b448fed446d311`, `ev_2407e4b505a3225eefd4a545d9857ec0c36b57c70dd22a37274af0e8f9060047`, `ev_4582e87f1e836effa76e2d7c4434e9e9e25027a220c09ef1f4ac4d86dca80d11`)로 다음 수식이 직접 관찰되어 `studio-bezier-curve-fit-brushes.ts`에 내재화되었다:
  - **Philip J. Schneider (`fit-curve.js`)**: 현 길이 매개변수화 $u_i$, $2\times2$ Cramer 공분산 행렬 최소자승 제어점 해법($\alpha_l, \alpha_r$)과 Wu/Barsky $\text{segLength}/3$ 폴백, Newton-Raphson 재매개변수화 $u_i' = u_i - \frac{(Q(u_i)-P_i)\cdot Q'(u_i)}{\|Q'(u_i)\|^2 + (Q(u_i)-P_i)\cdot Q''(u_i)}$.
  - **Pomax (`bezier.js`)**: 단위 법선 $\hat{n}(t)$ 오프셋 레일 및 부호 곡률 $\kappa(t) = \frac{x'y'' - y'x''}{(x'^2+y'^2)^{3/2}}$ 기반 첨점($|\kappa(t)\cdot r(t)| > 1$) 감지·억제.
  - **Klecks (`bitbof/klecks`) 6종 브러시**: `PenBrush`(4종 알파 팁·3단계 밉맵·분필 회전 `((x+y)*53123)%(2*PI)`), `BlendBrush`(적응형 스페이싱 `mix(size, size*2/9)`·45% 양방향 픽업·샤프니스 `opacity^2*0.8`), `SmudgeBrush`(자기 덮어쓰기 방지 양방향 스캔라인 복사), `SketchyBrush`(삼각함수 결정론적 PRNG `sin(6324634.2345*cos(++seed*5342.3423))*0.5+0.5`), `ChemyBrush`(4분면 대칭 실루엣), `PixelBrush`(`PixelDiscUnion` 수평 스캔라인 병합).
  - **Wick Editor & Konva**: Croquis 필압 매핑 $[0, 1] \to [0.14, 1.0]$ + 모폴로지 갭필, Konva 현 길이 비례 Cardinal Tension 제어점 확장.

### 2.7 Wave 24 `libmypaint` 46종 설정·18종 입력 동역학 · `spectral.js` 38밴드 KM+OKLCh 가멋 매핑 · `colormix.js` CIE Lab · `polygon-clipping` 2D 불리언 폴리곤 (Observation)
- `inspect_analysis_view`(`ev_bf902cf092d273befdafa0630fd0dbc9b347f97afae41a62ed4b92f508a64699`, `ev_ea7266ced6917ad222f7bfa7cbad6762c27bf51d4c23c95dc512a9916374ae7f`) 및 `trace_javascript_semantics`(`ev_e1dd4fc34488bf77fcdc2ac382abcf14f496ec2311596033942542310bc60f70`, `ev_9272517fe5f92e40682a14229e9d39bb1e8c1c7e2db10ad0be7cc5b7c01c07d8`)를 통해 다음 커널을 `studio-mypaint-spectral-boolean-brushes.ts`에 전수 내재화했다:
  - **`libmypaint` 46종 설정·18종 입력 카탈로그(`brushsettings.json`, SHA-256 `080dac10...`)**: `opaque_linearize`(다중 댑 누적 비선형성 광학 선형화 $\alpha_{\text{dab}} = 1 - (1 - \alpha)^{1/(2 \cdot \text{dabs\_per\_radius})}$), `gridmap_scale`/`gridmap_x`/`gridmap_y`($256 \times 256$ 모듈러 캔버스 텍스처 좌표계), `offset_angle_2`(양방향 대칭 Bilateral 법선 오프셋), `smudge_bucket`(256개 독립 픽업 버킷), `posterize`·`posterize_num`($\lfloor c \cdot L \rfloor / L$ 이산 단계 양자화).
  - **`rvanwijnen/spectral.js` 38밴드(380~750nm) Kubelka-Munk + OKLCh 이진 탐색 가멋 매핑(`spectral.js`, SHA-256 `dbaa1a8b...`)**: CIE 휘도 $Y_i$와 착색력 $\text{tintingStrength}_i^2$을 곱한 가중 농도 $c_i = f_i^2 \cdot T_i^2 \cdot Y_i$, 38밴드 $K/S = (1-R)^2/(2R)$ 및 역변환 $KM(KS) = 1 + KS - \sqrt{KS^2 + 2KS}$, 그리고 OKLCh 채도 $C \in [0, C_0]$ 이진 탐색($\Delta E_{\text{OK}} < 0.03$, $\epsilon = 10^{-4}$) 가멋 매핑.
  - **`colormix.js` CIE XYZ D65 & CIE $L^*a^*b^*$ 혼합(`colormix.js`, SHA-256 `13deb762...`)**: sRGB $\leftrightarrow$ CIE XYZ(D65 `95.047, 100.0, 108.883`) $\leftrightarrow$ CIE $L^*a^*b^*$ 양방향 지각 색공간 혼합.
  - **`mfogel/polygon-clipping` 2D 불리언 폴리곤 클리핑(`polygon-clipping.esm.js`, SHA-256 `766d182d...`)**: 벡터 블롭 브러시 합집합(`union`) 및 벡터 지우개 차집합(`difference`)·교집합(`intersection`)·대칭차(`xor`) 클리핑 및 `StudioUniversalBrushEngineBar` 실시간 다중 레이어 SVG 스트로크 프리뷰(`data-studio-universal-brush-svg-preview="true"`).

### 2.8 Wave 25 `perfect-freehand` 가변 폭 윤곽 · `rough.js` 7종 해칭/이중선 베지어 · `simplify-js` 2단계 RDP · `rbush` OMT 2D 공간 인덱스 (Observation)
- `inspect_analysis_view`(`ev_f89fe384ed368eddb2cf116d7384604469f217ceb5aa9491f00efad99bda9813`, `ev_396f3dc483117865fbe719b384173cdf98ba300894d32c7adbc6f619a93ae485`) 및 4회 `trace_javascript_semantics`(`ev_e3f8614c0111647f896b2027e2af88866cb011403441d28a8ae740dcb298b36c`, `ev_7864c6ccb7eaebc0973d388f38b82cc68973ca16e49aba20ed80d7709d3bace2`, `ev_891b719ae7fceb9376c127e87065355b4b8454199a4340f5d0b33392d4e3136a`, `ev_b59a8b7de407c36f43bf461f28ce223ff4905cff9fd820713bc41dafa6f9d8de`)를 통해 다음 수식을 `studio-freehand-rough-spatial-brushes.ts`에 전수 내재화했다:
  - **`steveruizok/perfect-freehand` (`perfect-freehand.mjs`, SHA-256 `a02e221f...`)**: 스트림라인 저역통과 보간 계수 $s = 0.15 + (1 - \text{streamline}) \cdot 0.85$, 속도 기반 가상 필압 $sp = \min(1, d/\text{size})$, $p = \min(1, p_{\text{prev}} + (\min(1, 1 - sp) - p_{\text{prev}}) \cdot (sp \cdot 0.275))$, 박화(thinning) 반경 $r = \text{size} \cdot (0.5 - \text{thinning} \cdot (0.5 - p))$, 시작/끝 테이퍼 이징(`easeOutQuad` $t(2-t)$, `easeOutCubic` $(t-1)^3+1$), 급회전($\mathbf{v}_i \cdot \mathbf{v}_{i+1} < 0$) 13단계 반원 부채꼴 및 13/29단계 원형·사각 캡.
  - **`rough-stuff/rough` (`rough.esm.js`, SHA-256 `e921535f...`)**: Park-Miller Lehmer LCG PRNG(`seed = Math.imul(48271, seed) & 0x7fffffff`, `next = seed / 2147483648`), 길이 감쇠(`L < 200 -> 1`, `L > 500 -> 0.4`, 그 외 `-0.0016668 * L + 1.233334`), 이중선 휨·거칠기 3차 베지어 오프셋(`bowX`, `bowY`), 회전 활성 에지 테이블(`ymin`, `ymax`, `x`, `islope`) 스캔라인 7종 해칭(`hachure`, `zigzag`, `cross-hatch`, `dots`, `dashed`, `zigzag-line`, `solid`).
  - **`mourner/simplify-js` (`simplify.js`, SHA-256 `e4c7a1a8...`)**: 1단계 방사형 거리 필터($\|\mathbf{p}_i - \mathbf{p}_{\text{prev}}\|^2 > \tau^2$) + 2단계 재귀 Ramer-Douglas-Peucker 수직 제곱 거리 분할.
  - **`mourner/rbush` (`rbush.js`, SHA-256 `cbb358bc...`)**: OMT(Overlap Minimizing Top-down) X-Y 타일 정렬 기반 2D 공간 인덱스 및 벡터 스트로크·지우개 AABB 교차 쿼리.

---

## 3. 한계 및 미확정 영역 (Limitations & Unknowns)

- 상용 네이티브 데스크톱/모바일 앱(Paint Tool SAI Ver.2, Corel Painter, ArtRage Vitae, Adobe Illustrator/Fresco)의 비공개 바이너리 셰이더는 본 웹 세션에서 직접 실행하지 않고, 공개된 웹 포털·오픈소스 AST 증거(`ev_b116ab58...`, `ev_0f42419a...`)와 문서화된 수학 사양을 기반으로 클린룸 모델로 재구성했다.
- `apps/brush-lab`의 엄격한 라이선스 게이트(`license-policy.test.ts`, `boundary.test.ts`)에 따라 CC BY-NC(`mixbox`), Prosperity(`lygia`), GPL 원본 코드는 단 한 줄도 참조하거나 복사하지 않았으며, 모든 연산은 결정론적 `Pcg32` 난수와 `kmMixRgb` Kubelka-Munk 색공간 위에서 독립 구현했다.
