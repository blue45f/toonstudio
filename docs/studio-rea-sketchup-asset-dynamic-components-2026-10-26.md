# 기성 웹툰 3D 스케치업(.skp) 소재 시장 및 동적 구성 요소(Dynamic Components) REA 역공학 분석 및 내재화 보고서 (2026-10-26)

- **작성일**: 2026-10-26
- **문서 상태**: `current`
- **증거 원장**: [`docs/evidence/rea-sketchup-asset-marketplace-20261026.json`](evidence/rea-sketchup-asset-marketplace-20261026.json)
- **연관 기능 문서**: [`docs/features/skp-import.md`](features/skp-import.md), [`docs/features/bg3d-components-tags-scenes.md`](features/bg3d-components-tags-scenes.md), [`docs/acon-authorized-asset-intake.md`](acon-authorized-asset-intake.md)

---

## 1. 개요 및 목적

본 문서는 `reverse-engineer-anything`(REA MCP) 정적·런타임 분석 도구를 활용하여 다음 두 가지 핵심 도메인을 증거 기반으로 역공학 분석하고, ToonStudio 웹/데스크톱 3D 배경 스튜디오(`bg3d` 및 `scene-3d`)에 클린룸(clean-room) 방식으로 완전히 내재화한 결과를 기록한다.

1. **기성 웹툰 소재 시장의 활성화**: 텀블벅(Tumblbug), 에이콘3D(ACON3D), 픽셀(Pixel) 등에서 유통되는 **`'판타지 황실'`**, **`'현대 고등학교 교실'`**, **`'주인공 자취방'`**, **`'조선시대 저막'`** 등 웹툰 3D 스케치업(`.skp`) 배경 세트의 구조·태그·장면·라이선스 반입 아키타입과 마켓플레이스 검색 카탈로그 내재화.
2. **동적 구성 요소(SketchUp Dynamic Components) 및 실시간 연출 인터랙션**: 문을 클릭하면 열리거나, 서랍이 열리고, 조선시대 저막의 들어열개 들창이 들어올려지거나 병풍이 펼쳐지는 등 `.skp` 내부에 심겨 있는 `dynamic_attributes`(`OnClick`: `ANIMATE`, `ANIMATESLOW`, `ANIMATEFAST`, `ANIMATECUSTOM`, `SET`) 수식을 파싱·추론하여 컷 연출에 맞춰 실시간으로 배경을 조작하는 엔진 및 UI 워크벤치 내재화.

---

## 2. REA 정적·런타임 분석 결과 (Epistemic Separation)

### 2.1 OpenSKP 1.3.0 (`.skp` 파서 및 `dynamic_attributes` 추출기)

- **분석 대상**: `/Users/hjunkim/WebstormProjects/toonstudio/node_modules/.pnpm/openskp@1.3.0/node_modules/openskp`
- **루트 아티팩트 SHA-256**: `513f2eeaa30e1b5b0543b036125459340921a0dded17b281c523c6095e479c10`
- **번들 엔트리(`dist/index.js`) SHA-256**: `3b4a418e320920083aefa7551a924954b336e5addd0182971c7c66aeab575c2d`
- **REA Evidence IDs**:
  - 부모 정적 분석(`analyze_javascript_application`): `ev_0f24f2f8e5746952ee7c4c873e83a2333f45b14f0e9ad3b8f74d5a859909fe93`
  - 요약 뷰(`inspect_analysis_view` / `summary`): `ev_e2d072adff7b5653114dc1671e934cfa0df9bfc646499ed8ec34b1d4e0440fc8`
  - 모듈 페이지 뷰(`inspect_analysis_view` / `modules`): `ev_e44f751250dc81161f58637e4574e4c6f7863c27ac2ca729ebb652be460f0e00`
  - 모듈 상세 뷰(`inspect_analysis_view` / `dist/index.js`): `ev_bd9df5f3a66982c01544f727a3deefa2c16a412e54c5a4646cb9efce55b7e388`

#### 관측된 사실 (Observed Facts)
1. `openskp` 1.3.0 패키지에서 총 5개 관련 파일(4개 JS 파일, 1,047,986 바이트), 149,279개 AST 노드, 395개 정적 finding, 3,975개 호출 흐름(call-flow), 21,826개 데이터 흐름(data-flow), 2,825개 클로저 관계가 관측되었다.
2. `dist/index.js` 2652~2671행에서 `DYNAMIC_ATTRIBUTES_DICT_NAME = "dynamic_attributes"` 상수를 정의하고, 레거시 SketchUp 파일(v3~v2020)의 `CDictionary` 엔트리 중 `value.name === "dynamic_attributes"`인 항목을 `extractLegacyDynamicProperties(attrs)`로 읽어 `Instance.properties: Record<string, string>`에 문자열 키-값 맵으로 저장한다.
3. `dist/index.js` 2033~2046행 및 2073~2099행에서 SketchUp 2021+ VFF 포맷 인스턴스의 `D007` 청크를 `extractDynamicProperties(d007, options)`와 `extractAttributeDictionaries(d007, options)`로 파싱하여 `sceneHierarchy`(`InstanceNode`) 및 `instanceTree`(`InstancedNode`)의 `properties` 필드에 `dynamic_attributes`(`onclick`, `rotx`, `roty`, `rotz`, `x`, `y`, `z`, `lenx`, `leny`, `lenz`, `_name`, `summary`, `description` 등)를 보존한다.
4. `dist/index.js` 13270~13271행에서 `.skp` 내보내기 시에도 `inst.properties`가 비어 있지 않으면 `attributeDictName: "dynamic_attributes"`로 기록하여 동적 구성 요소 속성을 양방향 보존한다.

#### 추론 (Inferences)
- 기존 ToonStudio의 `studio-bg3d-skp-model-summary.ts`는 `sceneHierarchy`에서 컴포넌트·태그·장면의 이름 문자열만 수집하고 `node.properties`를 버리고 있었으나, OpenSKP가 이미 파싱해 둔 `node.properties`의 `onclick` 수식과 한·영 컴포넌트/레이어 명명 규칙을 결합하면 `eval` 없이 안전하게 SketchUp 동적 구성 요소를 `DynamicComponentState`로 변환해 브라우저에서 실시간 조작할 수 있다.

#### 미확정 영역 (Unknowns)
- 정적 그래프 분석의 파일당 시맨틱 노드 보존 상한(`max_semantic_nodes_per_file=20000`)으로 인해 부모 증거에 31,708개의 semantic graph unknown이 남아 있으며, 표준 `dynamic_attributes` 밖의 서드파티 SketchUp Ruby 확장 스크립트가 런타임에 동적 생성하는 속성은 정적 `.skp` 바이트만으로 확정할 수 없다.

---

### 2.2 기성 웹툰 3D 소재 플랫폼 (에이콘3D · 텀블벅 · 픽셀) 런타임 표면 분석

- **REA Evidence IDs**:
  - 에이콘3D(`https://www.acon3d.com/ko`, `capture_browser_scenario`): `ev_b852ff1361da15c0a051f7c94facc8d8e81aedcbcad7cce7353cb50d3b3faa8f` (시나리오 SHA-256: `844c018e0154127048d1e1a371408feb6a40e3e00b10edafe20fc7b50b432783`)
  - 텀블벅(`https://tumblbug.com/`, `capture_browser_scenario`): `ev_114e14c6182079be767bbed019f37e815d32ae28ea51bec0d53577b2787d807d` (시나리오 SHA-256: `a3993c008f031c0da3d2df965bf351ef255bdc214dce06831c05c27e7438ccb0`)
  - 픽셀(`https://pixel.sc/`, `capture_browser_scenario`): `partial_observation` (`net::ERR_NAME_NOT_RESOLVED`)

#### 관측된 사실 (Observed Facts)
1. **에이콘3D(ACON3D)**: `https://www.acon3d.com/ko` 접속 시 HTTP `307 Temporary Redirect`를 통해 웹툰 전용 스토어 경로인 `https://www.acon3d.com/ko/toon`으로 즉시 이동하며, 비인증 헤드리스 브라우저에 대해 Cloudflare Turnstile Managed Challenge(`HTTP 403`, 응답 SHA-256 `a286dcda637b1f5d0431ab232d5ccc0d9b1c6a6cb612672266605c3027d970f9`)를 포함한 70개 네트워크 이벤트가 관측되었다.
2. **텀블벅(Tumblbug)**: `https://tumblbug.com/` 접속 시 AWS CloudFront WAF가 작동하여 헤드리스 브라우저 요청에 `HTTP 403`(응답 SHA-256 `81f571ea4c2429bc5b2f78d46d8ab53ea55a7c444fe9c558c999bbbd0d9537b9`)을 반환하였다.
3. **픽셀(Pixel)**: 초기 웹툰 스케치업 배경 마켓이었던 `https://pixel.sc/`는 현재 공개 DNS에서 `net::ERR_NAME_NOT_RESOLVED`로 관측된다.

#### 추론 (Inferences)
- 외부 마켓플레이스는 봇 차단(Cloudflare Turnstile, CloudFront WAF)이 엄격하게 적용되어 있거나(에이콘3D, 텀블벅) 도메인이 종료(픽셀)되었으므로, 웹툰 작가가 정당하게 후원·구매하여 보유한 로컬 `.skp` 자산 반입 파이프라인(`studio-bg3d-skp-conversion-core.ts`, `scripts/import-acon-assets.mjs`)과 4대 핵심 배경 아키타입(`판타지 황실`, `현대 고등학교 교실`, `주인공 자취방`, `조선시대 저막`) 장면 팩 및 동적 구성 요소 복원 엔진을 ToonStudio에 내재화하는 것이 가장 안전하고 지속 가능한 아키텍처다.

#### 미확정 영역 (Unknowns)
- 에이콘3D 및 텀블벅의 로그인 세션 내부 결제·다운로드 API 응답 본문은 비인증 캡처 범위에 포함되지 않는다.

---

## 3. 내재화(Internalization) 아키텍처 및 구현 명세

| 영역 | 구현 파일 | 검증 테스트 파일 | 핵심 내재화 내용 |
| --- | --- | --- | --- |
| **동적 구성 요소 엔진 & SketchUp `OnClick` 파서** | [`studio-3d-dynamic-components.ts`](../apps/web/src/domains/creator/scene-3d/studio-3d-dynamic-components.ts) | [`studio-3d-dynamic-components.test.ts`](../apps/web/src/domains/creator/scene-3d/studio-3d-dynamic-components.test.ts) | • 14종 동적 구성 요소 프리셋(`door-single-swing`, `door-double-swing`, `door-sliding`, `window-sliding`, `window-lift-up`(조선 들창), `furniture-drawer`, `folding-screen`(병풍), `locker-cabinet-door`(사물함·찬장·옷장), `secret-passage`(황실 비밀통로), `treasure-chest`, `book-open-close`, `light-switchable`, `hearth-lantern`(호롱불·아궁이·샹들리에), `vehicle-wheel-turn`)<br>• `parseSketchUpOnClickFormula`: `ANIMATE`, `ANIMATESLOW`, `ANIMATEFAST`, `ANIMATECUSTOM`, `SET` 수식을 `eval` 없이 파싱 및 다단계(`stepValues`) 상태 순환(`stepDynamicComponentOnClick`) 지원<br>• `inferDynamicComponentFromSkpNode`: OpenSKP `properties` 및 한·영 노드/레이어 이름에서 동적 구성 요소 자동 추론 |
| **기성 웹툰 4대 배경 아키타입 & 컷 연출 프리셋** | [`studio-3d-webtoon-archetype-packs.ts`](../apps/web/src/domains/creator/scene-3d/studio-3d-webtoon-archetype-packs.ts) | [`studio-3d-dynamic-components.test.ts`](../apps/web/src/domains/creator/scene-3d/studio-3d-dynamic-components.test.ts) | • 마켓 플랫폼 메타데이터(`tumblbug`, `acon3d`, `pixel`, `internal-bundle`)<br>• 4대 대표 웹툰 배경 아키타입 팩 내재화:<br>  1. **`판타지 황실`** (`fantasy-imperial-palace`): 대형 양개문, 옥좌 비밀 통로, 테라스 여닫이창, 수정 샹들리에, 성물 보물함 + 3종 컷 연출 프리셋<br>  2. **`현대 고등학교 교실`** (`modern-high-school-classroom`): 복도 앞·뒷문 미닫이, 운동장 미닫이창, 교탁 서랍, 학생 사물함, 천장 형광등 + 3종 컷 연출 프리셋<br>  3. **`주인공 자취방`** (`protagonist-studio-apartment`): 현관 방화문, 책상 서랍, 붙박이 옷장, 베란다 이중창, 독서 스탠드 + 3종 컷 연출 프리셋<br>  4. **`조선시대 저막`** (`joseon-dynasty-tavern`): 싸리문 대문, 대청 들어열개 들창, 한식 격자 미닫이 방문, 산수화 6폭 병풍, 부엌 찬장 서랍, 처마 청사초롱 + 3종 컷 연출 프리셋 |
| **OpenSKP `sceneHierarchy` 및 사이드카 브리지** | [`studio-bg3d-skp-dynamic-attributes.ts`](../apps/web/src/domains/creator/bg3d/studio-bg3d-skp-dynamic-attributes.ts) | [`studio-bg3d-skp-dynamic-attributes.test.ts`](../apps/web/src/domains/creator/bg3d/studio-bg3d-skp-dynamic-attributes.test.ts) | • `extractDynamicComponentsFromOpenSkpHierarchy`: OpenSKP `InstanceNode` 트리에서 `properties`(`dynamic_attributes`)와 이름을 전위 순회해 최대 64개 동적 구성 요소 추출<br>• `inferWebtoonArchetypeFromSkpMetadata` & `inferDynamicComponentsFromSkpSidecar`: 정규화 GLB 변환 후 남은 `StudioBg3dSkpSidecar` 기록만으로 4대 웹툰 아키타입 및 동적 구성 요소 자동 복원 |
| **3D 워크벤치 UI 패널** | [`StudioBg3dDynamicComponentsPanel.tsx`](../apps/web/src/domains/creator/bg3d/StudioBg3dDynamicComponentsPanel.tsx) | [`StudioBg3dDynamicComponentsPanel.test.tsx`](../apps/web/src/domains/creator/bg3d/StudioBg3dDynamicComponentsPanel.test.tsx) | • 마켓 플랫폼 필터(`텀블벅`, `에이콘3D`, `픽셀 호환`) 및 4대 아키타입 선택 카드<br>• 아키타입별 원클릭 **컷 연출 프리셋** 일괄 적용 버튼<br>• 장면 내 동적 구성 요소별 SketchUp `OnClick` 수식 표시 및 다단계 클릭 조작 버튼, 전체 개방/닫기 제어 |
| **마켓플레이스 검색 카탈로그** | [`studio-marketplace-search.ts`](../apps/web/src/domains/creator/studio-marketplace-search.ts) | [`studio-marketplace-search.test.ts`](../apps/web/src/domains/creator/studio-marketplace-search.test.ts) | • `STUDIO_WEBTOON_SKP_MARKETPLACE_CATALOG`: `'판타지 황실'`, `'현대 고등학교 교실'`, `'주인공 자취방'`, `'조선시대 저막'` 4대 아키타입의 권리 검증·검색 호환 카탈로그 내장 |
