# 글로벌 GitHub 오픈소스·웹 드로잉·상용 페인팅 브러시 생태계 REA 역공학 및 ToonStudio 전수 내재화 보고서 (2026-10-26)

- **작성일**: `2026-10-26`
- **상태**: `current` (Wave 21 구현 및 검증 완료)
- **관련 모듈**:
  - `apps/web/src/domains/creator/drawing/studio-universal-brush-taxonomy-engine.ts`
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

---

## 2. 역공학 관찰 및 수학적 행동 계약 (Observations & Inferences)

### 2.1 `mrdoob/harmony` 11종 절차적 브러시 스위트 (Observation)
- `harmony-sketchy.js`, `harmony-shaded.js`, `harmony-chrome.js`, `harmony-fur.js`, `harmony-longfur.js`, `harmony-web.js`, `harmony-ribbon.js`, `harmony-squares.js`, `harmony-grid.js`, `harmony-circles.js`, `harmony-simple.js` 11개 파일의 AST 및 소스에서 다음 수식이 직접 관찰되었다:
  - **`sketchy`**: 현재 점 $p_c$와 히스토리 점 $p_i$ 사이의 거리 제곱 $d^2 = \Delta x^2 + \Delta y^2 < 4000$이고 난수 $u > d^2 / 2000$일 때, 양 끝점을 $0.3\Delta$만큼 내측으로 수축한 현 $[p_c + 0.3\Delta, p_i - 0.3\Delta]$을 $\alpha = 0.05p$로 연결한다.
  - **`shaded`**: $d^2 < 1000$인 모든 히스토리 점에 대해 거리 제곱에 반비례하는 불투명도 $\alpha = (1 - d^2/1000) \cdot 0.1p$로 현을 그린다.
  - **`chrome`**: $d^2 < 1000$일 때 $[p_c + 0.2\Delta, p_i - 0.2\Delta]$ 현을 그리되 RGB 각 채널에 독립 난수를 곱해 금속성 색수차 광택을 만든다.
  - **`fur` / `longfur`**: `fur`는 $d^2 < 2000$에서 $[p_c + 0.5\Delta, p_c - 0.5\Delta]$ 대칭 털 가닥을 방출하고, `longfur`는 음수 난수 스케일 $s = -u$와 $d^2 < 4000$ 조건으로 비대칭 장모를 방출한다.
  - **`ribbon`**: 50개(모바일/웹 실시간 프리뷰 최적화 시 16~50개)의 스프링-댐퍼 서브 페인터가 $a_{t+1} = (a_t + (p_t - m_t) \cdot 0.1) \cdot \text{ease}$ 방정식으로 포인터를 추종한다.

### 2.2 `acamposuribe/p5.brush` 11종 프리셋·7종 벡터장·다각형 수채 번짐 (Observation)
- `p5-brush.js` 정적 분석(`ev_65fa507705d8e84f227eda0e5097e313ea7de54220f7fc174f116a98120e40b0`)에서 11종 프리셋 테이블 `vr`(`pen`, `rotring`, `2B`, `HB`, `2H`, `cpencil`, `pastel`, `crayon`, `charcoal`, `spray`, `marker`)의 12개 속성(`weight`, `scatter`, `sharpness`, `grain`, `opacity`, `spacing`, `pressure`, `type`, `tip`, `rotate`, `markerTip`, `noise`)과 7종 벡터장(`hand`, `curved`, `zigzag`, `waves`, `seabed`, `spiral`, `columns`) 생성 함수 `Lt(...)`가 직접 확인되었다.

### 2.3 JS Paint (`jspaint.app`) 비트맵 브러시 및 에어브러시 (Observation)
- `export_web_scripts`(`ev_c2e6127c08c529c0db1d93e038ea2126dd3605fea7b6829f769bc1be2509d1cd`)로 복원된 `src/tools.js` 및 `src/image-manipulation.js`에서 `bresenham_dense_line`, `render_brush`, `get_circumference_points_for_brush`, `stamp_brush_canvas`가 확인되었으며, `circle`·`square`·`diagonal`·`reverse_diagonal` 4종 브러시 형태가 픽셀 단위로 합성됨을 확인했다.

### 2.4 상용 웹툰·페인팅 앱 브러시 커널 (Inference & Clean-Room Behavioral Modeling)
- **ibisPaint X & MediBang Paint**: 웹툰 제작에서 가장 널리 쓰이는 벚꽃잎·구름·반짝이·나뭇잎·사슬·레이스·망점 리본·집중선 브러시는 접선 정렬(`alignToTangent`)과 다중 노즐 순환(`nozzleCycleCount`)으로 모델링되며, QR 브러시 공유는 FNV-1a 체크섬이 포함된 JSON 페이로드로 안전하게 내재화했다.
- **Photopea / Photoshop Mixer Brush & SAI Ver.2**: Mixer Brush는 `wet01`·`load01`·`mix01`·`flow01` 4변수 저수조 양방향 전이로, SAI Ver.2 수채화는 저필압(`p <= blurPressureThreshold01`) 블러 전용 구간과 고필압 안료 착색 구간의 분리로 정확히 재현된다.

---

## 3. 한계 및 미확정 영역 (Limitations & Unknowns)

- 상용 네이티브 앱(ibisPaint 모바일 바이너리, Paint Tool SAI Ver.2 Windows 실행 파일)의 비공개 서버/네이티브 GPU 셰이더는 본 웹 세션에서 직접 실행하지 않고, 공개된 웹 포털 캡처(`ev_a516d528...`, `ev_331ca47f...`)와 문서화된 파라미터 사양을 기반으로 클린룸 수학 모델로 재구성했다.
- `apps/brush-lab`의 엄격한 라이선스 게이트(`license-policy.test.ts`, `boundary.test.ts`)에 따라 CC BY-NC(`mixbox`), Prosperity(`lygia`), GPL 원본 코드는 단 한 줄도 참조하거나 복사하지 않았으며, 모든 연산은 결정론적 `Pcg32` 난수와 `kmMixRgb` Kubelka-Munk 색공간 위에서 독립 구현했다.
