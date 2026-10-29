# Krita 문서 읽기 코덱 (.kra .krz) (2026-10-29)

- **상태**: `current` — 구현, 합성 단위 테스트 641종, 변이 시험 481종, 실제 Krita 5.2.2가 저장한 문서 78개를 Krita 자신이 읽어 준 정답(마스크는 다시 열어 읽은 값)과 대조, 독립 검토(적대적 입력·정확성·테스트 허점) 2회(읽기 코덱, 마스크)와 그 지적 반영까지 완료. 검증 범위는 3절에 구분해 적었다.
- **작성일**: 2026-10-29
- **구현 모듈**: [`kra-document.ts`](../../packages/studio-format-gateway/src/kra-document.ts)(가져오기 진입점, ZIP·진단·레이어 픽셀 조립), [`kra-maindoc.ts`](../../packages/studio-format-gateway/src/kra-maindoc.ts)(`maindoc.xml`), [`kra-nodes.ts`](../../packages/studio-format-gateway/src/kra-nodes.ts)(레이어·마스크 트리), [`kra-tiles.ts`](../../packages/studio-format-gateway/src/kra-tiles.ts)(타일 파일, LZF, 레이어·마스크 조립), [`kra-masks.ts`](../../packages/studio-format-gateway/src/kra-masks.ts)(마스크 값 해석 규칙, 투명도 마스크 적용), [`kra-colorspace.ts`](../../packages/studio-format-gateway/src/kra-colorspace.ts)(색 공간 → RGBA8), [`kra-composite-ops.ts`](../../packages/studio-format-gateway/src/kra-composite-ops.ts)(관찰한 합성 연산 id), [`kra-issues.ts`](../../packages/studio-format-gateway/src/kra-issues.ts)(진단 목록), [`kra-types.ts`](../../packages/studio-format-gateway/src/kra-types.ts)(타입·오류·한도). 공용 ZIP 읽기 [`bounded-zip.ts`](../../packages/studio-format-gateway/src/bounded-zip.ts)에는 `pathPolicy: "memory"` 옵션(기본값은 기존 `portable`)을 더했다. 경로 검증 코드는 소스 파일 크기 상한 때문에 [`bounded-zip-path.ts`](../../packages/studio-format-gateway/src/bounded-zip-path.ts)로 옮겼고(`portable`의 동작은 그대로), `bounded-zip.ts`는 옮기며 줄었다.
- **테스트**: [`kra-tiles.test.ts`](../../packages/studio-format-gateway/src/__tests__/kra-tiles.test.ts) 84, [`kra-colorspace.test.ts`](../../packages/studio-format-gateway/src/__tests__/kra-colorspace.test.ts) 107, [`kra-maindoc.test.ts`](../../packages/studio-format-gateway/src/__tests__/kra-maindoc.test.ts) 23, [`kra-nodes.test.ts`](../../packages/studio-format-gateway/src/__tests__/kra-nodes.test.ts) 21, [`kra-document.test.ts`](../../packages/studio-format-gateway/src/__tests__/kra-document.test.ts) 163, [`kra-real-tiles.test.ts`](../../packages/studio-format-gateway/src/__tests__/kra-real-tiles.test.ts) 61, [`kra-robustness.test.ts`](../../packages/studio-format-gateway/src/__tests__/kra-robustness.test.ts) 9(타일 파일과 마스크 값 파일의 전 길이 절단과 무작위 변조 각 4000건, `maindoc.xml` 변조 1500건, ZIP 바이트 변조 300건, **ZIP을 다시 만들어 CRC를 맞춘 항목 내용 변조 600건**, 마스크 항목(값 파일·기본값·`maindoc.xml`·레이어 데이터)을 변조해 다시 만든 600건, 압축하지 않은 항목의 변조: 정해진 오류 외의 예외가 없음), [`bounded-zip-path-policy.test.ts`](../../packages/studio-format-gateway/src/__tests__/bounded-zip-path-policy.test.ts) 61(두 경로 정책과 경로 검사 세부), [`kra-masks.test.ts`](../../packages/studio-format-gateway/src/__tests__/kra-masks.test.ts) 97(마스크 조립·적용·가져오기), [`kra-real-masks.test.ts`](../../packages/studio-format-gateway/src/__tests__/kra-real-masks.test.ts) 15(실제 Krita 마스크 타일). 합성 빌더는 [`kra-fixtures.ts`](../../tests/corpus/formats/kra-fixtures.ts), 실제 Krita가 저장한 타일 페이로드 벡터는 [`kra-real-tile-vectors.ts`](../../tests/corpus/formats/kra-real-tile-vectors.ts)(레이어)와 [`kra-real-mask-vectors.ts`](../../tests/corpus/formats/kra-real-mask-vectors.ts)(마스크), 오라클 도구는 [`krita-oracle/`](../../tests/corpus/formats/krita-oracle/README.md), 로컬 실샘플 검사는 [`local-samples-corpus.test.ts`](../../tests/format-gateway/local-samples-corpus.test.ts)
- **관련 문서**: [XCF 읽기 코덱](xcf-reader-public-spec-2026-10-29.md), [Aseprite 읽기 코덱](aseprite-sprite-reader-public-spec-2026-10-29.md), [GIMP 브러시 계열 읽기 코덱](gimp-brush-formats-reader-public-spec-2026-10-29.md)(같은 방식의 선행 사례). Krita 리소스 번들(`.bundle`)은 [`krita-bundle.ts`](../../packages/studio-format-gateway/src/krita-bundle.ts)가 따로 다룬다.

---

## 1. 목적

창작자가 보유한 Krita 문서(`.kra`, `.krz`)를 읽어 레이어 트리와 속성, 래스터 레이어의 픽셀, Krita가 저장해 둔 합성 이미지·미리보기·ICC 프로파일을 얻을 수 있게 한다.

범위는 **읽기**다.

- 하는 것: ZIP 컨테이너 검증, `maindoc.xml`의 이미지·레이어·마스크 속성, 래스터 레이어 타일의 LZF 해제와 sRGB 부호화 RGBA8(직선 알파) 조립, 투명도·선택·필터 마스크의 값(`.pixelselection`) 읽기와 **투명도 마스크를 레이어 알파에 곱하는 순수 함수**(`applyKraTransparencyMasks`), 합성 이미지·미리보기·ICC 프로파일 원본 바이트 반환, 읽지 못한 레이어·마스크·색 공간의 진단.
- 하지 않는 것: 레이어 합성과 블렌드 모드 계산, 필터 마스크의 효과와 변형·색칠 마스크, 그룹 레이어 마스크의 적용, 필터·복제·벡터·파일·채우기 레이어 실행, ICC 색 변환, 애니메이션, 쓰기. `importKra`가 돌려주는 `layer.pixels`는 마스크를 적용하지 않은 레이어 자체의 픽셀이다.
- 진단의 범위: 읽지 않은 **레이어·마스크·색 공간**은 `unsupported`에 이유와 위치(레이어는 `layer[인덱스]`, 마스크는 `layer[인덱스].masks[순번]`)를 남긴다. 문서 수준의 부속 항목(`documentinfo.xml`, `animation/index.xml`, 레이어별 `.icc`, ICC 외의 `annotations/*`)은 읽지 않으며 **진단도 하지 않는다**.

---

## 2. 출처와 이용 조건

| 자료 | 이용 조건 | 사용 방식 |
| --- | --- | --- |
| Krita 5.2.2 실행 파일(Ubuntu 패키지 `krita` 5.2.2+dfsg-2build8) | GPL-3.0-or-later | **블랙박스로 실행**했다. 이 저장소의 스크립트(`kritarunner`)로 합성 문서를 만들어 저장하고, 저장된 파일과 Krita가 읽어 준 값만 관찰했다. Krita 소스를 읽지 않았고 실행 파일을 분해하거나 코드를 꺼내지 않았다. |
| KDE 커뮤니티 위키 "Krita/Tile Data Format" | CC BY-SA 4.0 | 타일 파일 헤더 필드 이름과 레코드 형식이라는 **사실만** 자체 표현으로 구현했다. 문구를 복사하지 않았다. |
| liblzf의 LZF 압축 형식 설명 | BSD-2-Clause(소스), 형식 자체는 공개 | 제어 바이트의 의미(리터럴, 길이, 거리)만 사용했다. 소스를 읽지 않았고 구현은 이 설명과 Krita가 저장한 타일(모든 색 공간에서 정답 픽셀과 일치)로 검증했다. |

ADR-0008 §4는 GPL 핵심을 reference-only로 두고 포맷의 관찰과 문서 기반 재구현을 허용한다. 이 구현은 그 운용을 따른다. "사실만 자체 표현으로 옮긴다"는 운용이 충분한지는 앱에 연결하기 전에 소유자·법무가 확인하는 것이 바람직하며, 이 문서는 법적 결론이 아니다.

**블랙박스 관찰의 한계(투명성)**: 오라클 스크립트의 합성 연산 id 후보 목록(`gen_corpus.py`, `gen_corpus2.py`)과 `d06` 노드 종류 이름은 Krita 소스를 읽지 않고 작성자의 사전 지식과 공개 자료에서 적은 문자열이다. 그중에는 블랙박스 관찰만으로는 알 수 없는 이름(예: `fhyrd`, `easy_dodge`, `src_atop`, `alphadarken`, `bumpmap`, 채우기 레이어의 `generatorlayer`)이 있다. **구현이 쓰는 목록(`kra-composite-ops.ts`)은 후보가 아니라 Krita가 실제로 저장한 id 98종뿐**이고, 채우기 레이어는 파일을 관찰하지 못해 구현이 이름을 알지 못한다. `kra_ref.py`의 LZF는 공개된 제어 바이트 설명을 직접 구현했는데 liblzf와 연산 순서가 같다(공개 형식을 따르면 같아진다).

**실표본의 출처**: 검증에 쓴 문서 78개(`.kra` 77, `.krz` 1)는 모두 이 저장소의 스크립트가 만든 합성 문서이며 사용자 콘텐츠가 없다. 다만 Krita가 문서마다 ICC 프로파일과 썸네일을 넣고 그 프로파일의 재배포 조건을 확인하지 못했으므로 **문서는 커밋하지 않는다**. 대신 (1) 생성·대조 스크립트와 입력 이미지(`tests/corpus/formats/krita-oracle/`), (2) 문서에서 타일 하나를 그대로 떼어 낸 페이로드 22개(레이어 15개 `kra-real-tile-vectors.ts`, 마스크 7개 `kra-real-mask-vectors.ts`, 프로파일·썸네일을 담지 않는다)를 커밋한다.

---

## 3. 근거 수준

### 3.1 실제 Krita 5.2.2로 검증한 것

Krita가 저장한 문서 78개를 `importKra`와 Krita 자신의 읽기(`Node.pixelData`, 원본 PNG, Krita의 프로파일 변환 결과, Krita가 저장한 합성 이미지, 마스크는 문서를 **다시 열어** 읽은 `Selection.pixelData`와 투영)로 비교했다. 정답은 우리가 넣은 값이 아니라 Krita가 읽어 준 값이다.

| 항목 | 관찰 |
| --- | --- |
| 컨테이너 | ZIP. `mimetype`이 첫 항목이고 압축하지 않았으며 내용은 `application/x-krita`. 나머지는 DEFLATE. `.krz`도 같은 구조에서 `mergedimage.png`만 없었다. 한글 이름은 UTF-8 플래그(비트 11) 없이 UTF-8 바이트 그대로 쓴다. |
| 파일 구성 | `maindoc.xml`, `documentinfo.xml`, `preview.png`, `mergedimage.png`, `<이미지 이름>/layers/<filename>`(+ `.defaultpixel`, `.icc`), `<이미지 이름>/annotations/icc`, `<이미지 이름>/animation/index.xml`. 그룹 레이어는 데이터 파일이 없다. |
| `maindoc.xml` | `<?xml?>`, `<!DOCTYPE DOC PUBLIC '-//KDE//DTD krita 2.0//EN' '…'>` 한 줄, 루트 `DOC`(`kritaVersion`, `syntaxVersion="2.0"`, `editor="Krita"`), `IMAGE`(`name`, `width`, `height`, `colorspacename`, `profile`, `x-res`, `y-res`, `description`), 그 안의 `layers > layer`가 **위에서 아래** 순서. 그룹은 `layer` 안에 `layers`를 중첩하고 마스크는 `layer > masks > mask`다. 속성 순서는 저장할 때마다 다르다. |
| 노드 종류(`nodetype`) | `paintlayer`, `grouplayer`, `clonelayer`, `shapelayer`(벡터), `filelayer`, `adjustmentlayer`(필터 레이어), 마스크 `transparencymask`·`selectionmask`·`filtermask`·`colorizemask`·`transformmask`. |
| 속성 값 | 불리언은 `"0"`/`"1"`, `opacity`는 0~255 정수, `x`·`y`는 레이어 오프셋, `compositeop`은 문자열 id, `colorlabel`은 정수. |
| 타일 파일 | 텍스트 헤더 다섯 줄(`VERSION 2`, `TILEWIDTH 64`, `TILEHEIGHT 64`, `PIXELSIZE n`, `DATA 타일수`) 다음에 타일마다 `x,y,LZF,크기\n`과 페이로드. 문서 51개(실수형 문서를 더하기 전의 코퍼스)의 래스터 레이어 타일 262개의 압축 이름이 모두 `LZF`였고, 실수형 문서 10개의 타일도 같았다. |
| 페이로드 | 첫 바이트는 플래그: 1이면 LZF 스트림(218개), 0이면 압축하지 않은 원본(44개, 잡음 같은 압축이 안 되는 타일). |
| 픽셀 배치 | **LZF로 푼 데이터는 바이트 평면**(평면 k = 모든 픽셀의 k번째 바이트). **비압축(플래그 0) 타일은 평면으로 바꾸기 전의 원본, 곧 픽셀을 하나씩 이어 붙인 배치**다. 8비트 RGBA의 픽셀 바이트는 B, G, R, A, 회색은 회색, 알파. 16비트는 같은 순서의 리틀 엔디언 샘플. |
| 좌표 | 타일 좌표는 레이어 로컬 픽셀 좌표이고 타일 크기(64)의 배수이며 음수도 있다(6개). 레이어의 이미지 좌표 원점은 `x`·`y` 속성이다. 오프셋이 64의 배수가 아니어도(37, -70, 63 …) 같다. |
| 기본 픽셀 | `.defaultpixel`은 픽셀 하나(색 공간의 네이티브 바이트). 타일이 없는 곳은 이 값이다. 새 문서의 `Background`는 타일이 0개이고 기본 픽셀이 불투명 흰색이다. |
| 16비트 값의 의미 | 문서 프로파일이 정한다. 같은 8비트 PNG를 `sRGB-elle-V2-srgbtrc.icc`(감마) 16비트 문서로 바꿔 저장하면 8비트 값은 `round(v / 257)`, `sRGB-elle-V2-g10.icc`(선형)이면 sRGB 전달 함수를 거친 값과 일치했다(원본 PNG와 전 픽셀 일치). |
| 실수 형식(`RGBAF16`·`RGBAF32`·`GRAYAF16`·`GRAYAF32`) | 타일 배치는 정수 형식과 같다(LZF로 푼 데이터는 바이트 평면, 샘플은 리틀 엔디언). 다른 점은 **채널 순서가 R, G, B, A**라는 것이다(정수 `RGBA`는 B, G, R, A). 회색은 회색, 알파다. 값은 부동소수(0~1이 기준)이고 알파는 직선 알파다. `createDocument`가 기본으로 붙이는 회색 프로파일은 `Gray-D50-elle-V2-g10.icc`(선형)였다. 프로파일이 `g10`이면 sRGB 전달 함수를 거친 값이, `srgbtrc`이면 값 그대로가 Krita가 저장한 합성 이미지와 1단계 이내로 일치했고 알파는 정확히 일치했다. |
| 마스크 값 파일 | `transparencymask`·`selectionmask`·`filtermask`는 `<마스크 filename>.pixelselection`(레이어 타일 파일과 같은 형식, `PIXELSIZE 1`)과 `<…>.pixelselection.defaultpixel`(1바이트)을 갖는다. `filtermask`는 `.filterconfig`도, `transformmask`는 `.transformconfig`만, `colorizemask`는 `<filename>.colorizemask/` 폴더만 갖는다(필터 레이어는 `<filename>.pixelselection`과 `.filterconfig`를 갖지만 마스크가 아니라 읽지 않는다). 값 파일 21개(마스크 타일 129개: LZF 128, 비압축 1 — 압축이 안 되는 잡음 마스크)의 기본값은 0이 18개, 255가 3개(선택을 뒤집은 마스크)였다. **선택을 한 번도 주지 않은 새 투명도 마스크는 값 파일이 없고** Krita가 읽어 준 값은 전부 0이며 그 레이어를 전부 숨긴다. 아무것도 고르지 않은 선택을 뒤집은 마스크(전부 선택)는 타일 0개에 기본값 255인 값 파일(56바이트)이 생기고 레이어를 숨기지 않는다. |
| 마스크 좌표 | 타일 좌표는 마스크 로컬이고 **이미지 좌표 = 타일 좌표 + `<mask>`의 `x`·`y`**다(마스크 노드를 `(10, 7)` 옮긴 문서를 Krita로 다시 열어 읽은 값과 창 전체 65,664픽셀이 모두 일치). 부모 레이어를 옮겨도(마스크를 단 뒤에 옮겨도) 마스크의 좌표와 속성은 그대로여서 마스크는 부모를 따라 움직이지 않는다. 마스크 오프셋은 `(0, 0)`과 `(10, 7)`만 관찰했다. |
| 투명도 마스크의 적용 | 보이는 투명도 마스크는 레이어 알파에 `round(알파 * 마스크 / 255)`를 곱한다: RGBA8·GRAYA8에서 (알파, 마스크) 256×256 조합 65,536개가 Krita의 투영과 **모두 같다**. 마스크가 여럿이면 `masks` 목록(파일 순서, 위→아래)의 **끝부터** 차례로 곱한다(순서를 바꾸면 반올림이 달라 380픽셀이 Krita와 달랐다). 숨긴 마스크(`visible="0"`)는 적용되지 않고 선택 마스크는 합성에 영향이 없다. 알파가 0이 되면 Krita는 색도 0으로 만든다. 직선 색은 미리 곱한 알파로 계산해서 달라진다(예: `(48,216,48,100)` × 마스크 20 → `(32,223,32,8)`: 알파가 작을수록 크다). 미리 곱한 색은 1단계 이내였다(마스크 둘이면 2단계). 16비트 정수 레이어의 알파는 `floor(알파16 * 마스크 / 255)`로 곱해진다(65,536개 모두 일치). |
| 캔버스 밖 | Krita의 투영은 캔버스 밖에서 마스크를 적용하지 않았다(캔버스 밖에 걸친 레이어의 그 부분은 마스크 전의 값). |
| 8비트 정수 문서의 선형 프로파일 | 8비트 RGBA·GRAYA 문서도 프로파일이 `g10`(선형)이면 샘플이 선형 값이다. 같은 내용을 Krita의 프로파일 변환(`g10` → `srgbtrc`)에 맡겨 얻은 값은 sRGB 전달 함수를 거친 값과 **최대 1단계 차이**로 일치했다(6,144픽셀). 이 코덱은 출력을 항상 sRGB 부호화 RGBA8로 맞춘다. 참고: Krita가 저장하는 `mergedimage.png`는 RGBA 8비트 선형 문서에서 값을 변환하지 않고 프로파일만 붙이므로(회색은 변환한다) 이 경우의 정답으로 쓸 수 없다. |
| 합성 연산 id | 코퍼스에 저장된 id 98종(`kra-composite-ops.ts`). Krita가 받아들이지 않는 문자열은 `normal`로 저장한다. Python API의 `blendingMode()`는 요청한 문자열을 그대로 돌려주므로 정답으로 쓸 수 없고 **파일에 저장된 id가 정답**이다. 예를 들어 같은 연산이 API 이름으로는 `color_burn`·`color_dodge`·`difference`·`luminosity`이고 파일에서는 `burn`·`dodge`·`diff`·`luminize`다. |
| 이미지 이름과 경로 | 레이어 데이터 경로에 이미지 이름이 그대로 들어간다. Krita는 `:`, `?`, 따옴표, 앞뒤 공백, 한글, 300자 이름도 그대로 폴더 이름으로 저장한다. `..` 구간이나 탭이 든 이름도 저장은 된다(그런 문서는 거부한다, 6절). |

| 검증 | 결과 |
| --- | --- |
| 전 문서 가져오기 | 78개 중 76개 성공. 실패 2개는 의도한 안전하지 않은 이름 문서(`n02` `../evil`, `n03` 탭)이며 모두 `unsafe-archive-path`. 큰따옴표(`n04`)·앞뒤 공백(`n05`) 이름 문서는 읽힌다. |
| 레이어 속성(이름, uuid, 종류, 불투명도, 보임, 잠금, 접힘, 색 라벨, 합성 연산, 마스크 이름·종류, 형제 순서) | Krita API 값과 전부 일치 |
| 래스터 레이어 픽셀 | 지원하는 색 공간의 레이어 104개를 캔버스 둘레 64픽셀을 더한 창 전체(2,902,968픽셀)에서 대조: **불일치 0**. 정수 형식은 Krita의 `pixelData`와, 실수 형식 레이어 8개(d05)는 Krita가 읽어 준 네이티브 바이트에 문서화한 환원식을 독립 구현으로 적용한 값과 같다. 지원하지 않는 색 공간 레이어 14개는 픽셀이 없고 `unsupported` 진단이 있음을 확인. |
| 비압축·압축 타일이 섞인 잡음 문서 | 정수 네 색 공간을 덮는 문서 5개(RGBA8, RGBA16 sRGB 감마·선형, GRAYA8, GRAYAU16, 문서당 레이어 2개)와 8비트 잡음 문서 1개를 Krita가 읽어 준 픽셀과 대조: **불일치 0** |
| 옮긴 레이어(오프셋·음수 좌표·캔버스 밖) | 4개 레이어를 700×600 창에서 대조: **불일치 0** |
| PNG 오라클 | 원본 PNG(RGBA, 회색)를 가져와 8비트·16비트(감마·선형)로 저장한 문서 5개의 모든 픽셀이 원본 PNG와 일치 |
| 실수 형식 문서 10개(d14) | RGBAF16·RGBAF32·GRAYAF16·GRAYAF32 × (선형 프로파일, sRGB 감마 프로파일, 알파가 변하는 문서). (1) 환원식과 정확히 같음(네이티브 바이트는 Krita가 읽어 준 `pixelData`), (2) Krita가 저장한 합성 이미지와 **최대 1단계 차이**(색, 알파 모두; 1단계 차이는 문서당 0~3픽셀)이고 알파가 0인 픽셀은 색을 보지 않았다 |
| 8비트 선형 문서 | RGBA8·GRAYA8 문서 2개 6,144픽셀이 Krita가 변환한 sRGB 값과 색은 최대 1단계, 알파는 정확히 일치 |
| 마스크 문서 17개(d15) | 투명도 마스크(기본, 선택을 뒤집은 것, 타일 없는 전체 선택, 부모 레이어를 옮긴 것, 마스크를 단 뒤 옮긴 것, 마스크 노드를 옮긴 것, 둘, 숨긴 것, 선택을 주지 않은 새 마스크, 잡음), 선택 마스크, 필터 마스크, 그룹 안팎의 마스크, 256×256 (알파, 마스크) 전 조합 격자(RGBA8·GRAYA8·RGBA16·RGBAF32). **Krita가 문서를 다시 열어 읽은** 마스크 값과 `importKra`의 마스크 값이 창 전체(문서당 최대 65,664픽셀)에서 모두 일치했다. 투명도 마스크를 적용한 결과는 다시 연 문서의 투영(8비트 정수)과 알파는 정확히, 미리 곱한 색은 1단계(마스크 둘이면 2단계) 이내로 같았고, 16비트 정수·실수는 저장한 합성 이미지와 알파 1단계, 미리 곱한 색 2단계 이내로 같았다. 숨긴 마스크·선택 마스크는 적용하지 않은 결과가, 필터 마스크는 알파 전체와 마스크 값이 0인 곳의 색이 투영과 같았다. 값 항목이 둘 다 없는 새 투명도 마스크(`d15-tm-empty`)는 Krita가 다시 열어 읽은 대로 빈 선택(전부 0)으로 해석하고 경고하며, 그 밖에 값 항목이 일부만 없거나 깨진 마스크는 값을 알 수 없다고 보고했다. |
| 합성 연산 id | 구현의 관찰 목록과 코퍼스에 저장된 id 집합이 정확히 같음(98종) |
| 부속 항목 | `mergedimage.png`, `preview.png`, `annotations/icc`의 SHA-256이 ZIP 안 원본과 일치 |

### 3.2 공개 문서나 첫 구현과 실제 파일이 달랐던 곳

1. **헤더 필드**: 위키의 옛 설명에 있는 `TILESNUMBER`는 관찰되지 않았고 5.2.2는 `DATA`를 쓴다.
2. **비압축 타일의 배치**: 첫 구현은 LZF 타일과 비압축 타일을 같은 바이트 평면 배치로 읽었다. 잡음 문서를 Krita의 `pixelData`와 대조하자 비압축 타일 2개(8192픽셀)가 어긋났고, 비압축 타일이 픽셀을 이어 붙인 원본임을 확인해 평면으로 바꾸도록 고쳤다. 이 결함은 단위 테스트가 아니라 **실제 Krita와의 대조에서만** 드러났다(합성 테스트는 같은 오해를 공유한다). 지원하는 모든 색 공간의 비압축 타일을 다시 대조해 일반화가 맞음을 확인했고, 독립 검토가 지적한 대로 실제 비압축 페이로드 3개(회색 8비트, RGBA 8비트, 회색 16비트)를 알려진 정답 벡터에 더했다.
3. **합성 연산 정답**: 위 표대로 API가 돌려주는 값은 정답이 아니다.
4. **형제 순서**: 파일은 위에서 아래, Krita Python API의 `childNodes()`는 아래에서 위다.
5. **ZIP 이름 플래그**: Krita는 UTF-8 이름에 언어 인코딩 플래그를 세우지 않는다(Python `zipfile`은 이를 cp437로 읽어 한글 경로를 찾지 못했다). 이 저장소의 ZIP 읽기는 UTF-8로 읽어 문제가 없다.
6. **이미지 이름 정책**: 첫 구현은 공용 ZIP 읽기의 `portable` 경로 정책(어느 운영체제에 풀어도 안전한 이름만)을 그대로 써서 `1화: 시작`, `뭐?`, 앞뒤 공백, 분해형 한글(macOS 파일 이름 유래) 같은 평범한 제목의 문서를 컨테이너째 거부했다. 독립 검토가 지적했다. 파일로 풀지 않는 읽기 전용 용도의 `memory` 정책을 `bounded-zip.ts`에 옵트인으로 더해 고쳤다(기본값은 그대로 `portable`).
7. **8비트 선형 문서와 프로파일 이름 판정**: 첫 구현은 8비트 문서의 값을 프로파일과 무관하게 그대로 옮겨 같은 선형 내용이 16비트 문서와 다른 값이 됐고, `g10`을 부분 문자열로 찾아 `g100`·`Canon_G100.icc`를 선형으로, `...-srgbtrc.icc`의 `srgbtrc`(전달 함수 이름)를 원색으로 오인해 `Rec2020-elle-V4-srgbtrc.icc`에 원색 경고를 하지 않았다. 단어 단위 판정과 8비트 선형 환원으로 고쳤다.
8. **실수 형식의 채널 순서**: 정수 `RGBA`의 픽셀 바이트가 B, G, R, A인 것과 달리 실수 `RGBAF16`·`RGBAF32`는 R, G, B, A 순서다. 구현에 앞서 관찰로 확인해 결함으로 이어지지는 않았다(정수 형식 순서를 그대로 쓰면 R과 B가 바뀐다).
9. **편집 세션의 투영**: 마스크의 정답을 저장 직전의 편집 세션(`Node.projectionPixelData`)에서 얻으면 틀린다. 마스크 노드를 `move`한 문서(`d15-tm-maskmove`)에서는 저장 직전의 투영이 마스크를 옮기기 전 위치로 적용돼 있어 다시 연 문서의 투영과 캔버스 안 5,110픽셀이 달랐고, 마스크를 단 뒤 레이어를 `move`한 문서(`d15-tm-moved2`)도 캔버스 안 4,778픽셀이 달랐다. 다시 연 문서의 투영은 두 문서 모두 파일에 저장된 마스크 위치(타일 좌표 + `x`·`y`)로 읽은 마스크 값을 곱한 결과와 모든 픽셀에서 일치했다. 그래서 마스크의 정답은 문서를 **다시 열어** 읽은 값이다(`reopen_dump.py`). 파일의 의미를 판정할 때는 저장 직전 세션의 값이 아니라 그 파일을 읽은 Krita의 값이 정답이다.

### 3.3 합성 테스트로만 확인한 것

- 속성이 없을 때의 기본값(보임, 잠금 없음, 불투명, 색 라벨 0, 오프셋 0)과 값이 틀렸을 때의 처리(경고 후 기본값, 오프셋은 레이어 픽셀을 배치하지 않음).
- 깨진 LZF, 타일 헤더, 좌표 정렬·중복, 부속 항목 CRC 오류, 한도 초과, 중단 신호 등 모든 오류 경로.
- 5.2.2가 아닌 Krita(4.x 이하, 5.3 이후): 한 버전만 관찰했다. 다른 버전의 차이는 모른다.
- **통과(pass-through) 그룹**: `setPassThroughMode(True)`가 저장에 반영되지 않아 61개 문서 모두 `passthrough="0"`이었다. `passThrough: true`로 읽는 경로는 관찰한 적이 없다.
- 실수 형식에서 범위를 벗어난 값(HDR, 음수, NaN, 무한대): 0~1로 자른다(음수·NaN은 0). Krita가 어떻게 그리는지는 관찰하지 않았다.
- 실수 값을 16비트로 양자화한 뒤 줄이는 근사(정확한 식 `round(255 * OETF(값))`과 8비트 단계의 0.03 이내): 단위 테스트가 정확한 식과의 차이를 0.53 이내로 확인하고, 실제 Krita 합성 이미지와는 1단계 이내임을 d14로 확인했다.
- 마스크 `x`·`y` 오프셋의 일반적인 값: `(0, 0)`과 `(10, 7)`만 관찰했다. 음수·큰 오프셋은 레이어 오프셋과 같은 규칙으로 가정하고 단위 테스트로만 확인했다.
- 16비트 정수·실수 레이어에 투명도 마스크를 적용하는 근사: 레이어를 먼저 RGBA8로 줄이고 곱한다(Krita는 16비트 알파에 곱하고 줄인다). 합성 이미지와 알파 1단계 이내임을 관찰했다(RGBA16 격자 65,536픽셀 중 8,003픽셀이 1단계 달랐다).
- 선택 마스크의 `active` 속성(현재 선택으로 쓰이는지)의 의미와 그룹 레이어 마스크의 적용 결과(그룹 합성): 값만 읽는다.
- 한 문서 안에서 레이어마다 색 공간이 다른 경우: 관찰하지 못했다. 레이어의 `colorspacename`을 따르되 전달 함수는 이미지 프로파일로 가정하고 `kra-layer-colorspace-differs`로 경고한다.

### 3.4 확인하지 못했거나 읽지 않는 것

- CMYK, Lab, XYZ, YCbCr 레이어의 픽셀: 타일 배치는 관찰했지만 RGBA8로 환원하는 색 관리 규칙(ICC 변환)을 구현하지 않았다. `kra-colorspace-unsupported`로 보고한다.
- 필터 마스크의 효과와 설정(`.filterconfig`), 변형 마스크(`.transformconfig`), 색칠 마스크(`colorizemask/…`), 벡터 레이어의 `content.svg`, 복제 레이어의 대상, 파일 레이어의 원본 경로, 채우기 레이어, 필터 레이어의 선택(`<filename>.pixelselection`): 노드 속성만 읽는다(`unsupported`로 보고). 투명도·선택·필터 마스크의 **값**은 읽지만 레이어 픽셀에는 적용하지 않고, 투명도 마스크만 `applyKraTransparencyMasks`로 적용할 수 있다. 채우기 레이어는 만들다가 Krita가 종료되어 파일을 관찰하지 못했다.
- 애니메이션: `animation/index.xml`과 프레임 파일. 헤드리스 Krita에서 애니메이션 레이어를 만들 수 없어(이미지 시퀀스 가져오기가 비정상 종료) 프레임 저장 방식을 관찰하지 못했다. 진단하지 않는다.
- `documentinfo.xml`(제목·작성자 등), 레이어 스타일, 가이드, 팔레트: 읽지 않고 진단하지 않는다.
- 레이어별 ICC(`layerN.icc`)와 임베디드 곡선: 전달 함수는 **이미지 프로파일의 이름**으로만 판정한다(단어 `g10`·`linear`는 선형, `srgbtrc`·`sRGB built-in`은 감마). 이름으로 알 수 없으면 sRGB 감마로 가정하고 경고한다. 원색(primaries)은 변환하지 않는다.
- 쓰기.

---

## 4. API

```ts
import { applyKraTransparencyMasks, importKra, inspectKraSignature, KraError, KRA_LIMITS } from "@toonstudio/studio-format-gateway";

inspectKraSignature(bytes): "kra" | "unknown";
importKra(source: Blob | Uint8Array | ArrayBuffer, options?: KraImportOptions): Promise<KraImportResult>;
applyKraTransparencyMasks(layer: Pick<KraLayer, "extent" | "pixels" | "masks">, options?: KraMaskApplyOptions): KraMaskApplyResult;
```

- `inspectKraSignature`는 첫 ZIP 로컬 항목이 압축하지 않은 `mimetype`이고 내용이 `application/x-krita`인지 본다. OpenRaster 같은 다른 ZIP 기반 포맷과 가르는 가벼운 판별이며 구조 검증은 `importKra`가 한다.
- `KraImportOptions`: `limits`(낮추기만), `zipLimits`(낮추기만), `inflateRaw`(DEFLATE 어댑터), `signal`, `decodePixels`(false면 구조만). JS 호출자가 `null`을 넘겨도 `TypeError` 없이 기본값으로 읽는다.
- 결과 `KraImportResult`: `format: "krita-kra"`, `specProfile: "krita-kra-observed"`, `mimetype`, `document`(편집기·Krita 버전·구문 버전), `image`(이름, 크기, 색 공간, 프로파일 이름, 해상도, 설명), `layers`, `mergedImagePng`·`previewPng`·`iccProfile`(원본 바이트 또는 null), `warnings`, `unsupported`, `source`(길이와 SHA-256).
- 레이어(`KraLayer`)는 파일 순서(깊이 우선, 0이 최상단)의 평면 목록이다. `parentIndex`·`depth`·`kind`(`raster`/`group`/`other`)·`nodeType`·`name`·`uuid`·`filename`·`visible`·`effectiveVisible`(조상 그룹까지 합침)·`locked`·`collapsed`·`passThrough`·`opacity`(0~1)·`opacityRaw`(0~255)·`compositeOp`·`compositeOpKnown`·`colorLabel`·`inTimeline`·`offsetX`·`offsetY`·`colorSpace`·`masks`·`attributes`(원본 속성 전부). 래스터 레이어는 `extent`(이미지 좌표 사각형), `defaultPixel`, `tileCount`, `pixels`(직선 알파 sRGB 부호화 RGBA8, 가로 우선)를 갖는다. 기본 픽셀이 불투명이면 `extent`가 캔버스를 포함한다. `extent` 좌표는 레이어 오프셋(±2³¹)과 타일 좌표(±2³¹)의 합이라 32비트 정수 범위를 넘을 수 있다(32비트 정수로 받는 소비자는 확인해야 한다).
- 마스크(`KraMask`)는 `nodeType`·`name`·`uuid`·`visible`·`locked`·`filename`·`offsetX`·`offsetY`(마스크 `x`·`y` 속성)·`attributes`에 더해, 값 파일을 읽었다면 `values`(마스크 값 0~255, 가로 우선, 1바이트/픽셀), `extent`(`values`가 덮는 이미지 좌표 사각형: 타일 사각형의 합집합), `defaultValue`(타일이 없는 곳의 값. 선택을 뒤집은 마스크는 255), `tileCount`를 갖는다. 값을 읽지 않았거나(`transformmask`·`colorizemask`, `decodePixels: false`) 읽지 못했으면(값 항목이 일부만 없음, 깨짐, 한도) `defaultValue`와 `values`가 null이고 이때 **마스크의 값은 알 수 없다**. 예외는 값 파일과 `.defaultpixel`이 **둘 다** 없는 투명도 마스크 하나다: 선택을 한 번도 주지 않은 새 마스크가 이렇게 저장되고, Krita가 그 문서를 다시 열면 빈 선택(전부 0)으로 읽어 레이어를 숨기므로(3.1절) 같은 값(`defaultValue` 0, 타일 없음)으로 해석하고 `kra-mask-data-missing` 경고를 남긴다. 선택·필터 마스크는 이 예외가 아니다. 타일이 없는 마스크(`DATA 0`)는 `values`·`extent`가 null이고 `defaultValue`만 의미가 있다.
- `applyKraTransparencyMasks(layer, options?)`는 레이어의 **보이는 투명도 마스크**를 `masks`의 끝에서부터 알파에 곱하고, 결과를 `status`로 구분한 값으로 돌려준다. `applied`는 `{ extent, pixels, appliedMasks }`(새 RGBA8: 색은 그대로 두고 알파가 0이 되면 색도 0으로 만든다), `no-pixels`는 곱할 픽셀이 없는 경우(그룹, 래스터가 아닌 레이어, 읽지 않았거나 읽지 못한 레이어, 타일이 없고 기본 픽셀이 투명한 빈 레이어), `mask-unreadable`은 보이는 투명도 마스크 중 값을 읽지 못한 것이 있는 경우(`maskIndex`)다. 마지막 경우를 `no-pixels`와 나눈 것은 호출자가 `결과?.pixels ?? layer.pixels` 같은 식으로 마스크를 조용히 건너뛰어 틀린 그림을 그리지 못하게 하려는 것이다(독립 검토 지적). 숨긴 마스크, 선택·필터·변형·색칠 마스크는 건너뛴다. 작업량(픽셀 수 × 값이 있거나 기본값이 255가 아닌 마스크 수)이 `KRA_MASK_APPLY_MAX_PIXEL_OPS`(2²⁸)를 넘으면 `KraError("limit-exceeded")`로 던지고, `options.maxPixelOps`로 이 상한을 낮출 수 있다(범위 밖이면 `limit-invalid`). 입력은 바꾸지 않는다.
- 오류 `KraError.code`: `aborted`, `source-invalid`, `source-too-large`, `container-invalid`, `unsafe-archive-path`, `maindoc-invalid`, `limit-exceeded`, `limit-invalid`.

---

## 5. 진단 코드

`unsupported`(의미가 손실되는 것):

| 코드 | 뜻 |
| --- | --- |
| `kra-node-unsupported` | 래스터·그룹이 아닌 레이어(복제, 벡터, 파일, 필터 …). 속성만 보존 |
| `kra-mask-unsupported` | 마스크는 레이어 픽셀에 적용하지 않음. 투명도·선택·필터 마스크는 값을 읽고 `applyKraTransparencyMasks`로 투명도 마스크를 적용할 수 있으며, 변형·색칠 마스크와 종류를 모르는 마스크는 속성만 읽음 |
| `kra-mask-data-missing` | 마스크의 값 항목(`.pixelselection`, `.defaultpixel`) 중 하나만 ZIP에 없거나, 선택·필터 마스크의 값 항목이 둘 다 없거나, `filename`이 없음. 파일이 깨졌거나 만든 도구가 다른 것일 수 있어 **값을 알 수 없다고만** 보고한다. 값 항목이 둘 다 없는 투명도 마스크는 아래 경고 표 |
| `kra-mask-filename-invalid` · `kra-mask-data-shared` · `kra-mask-read-failed` · `kra-mask-decode-failed` · `kra-mask-limit-exceeded` | 레이어의 같은 이름 코드와 뜻이 같다(마스크의 값 항목에 대해). `.defaultpixel`이 1바이트가 아니거나 타일 헤더의 픽셀 크기가 1이 아니면 `decode-failed` |
| `kra-mask-offset-invalid` | 값 파일을 가진 마스크의 `x`·`y`가 ±2³¹ 안의 정수가 아님(마스크 하나에 진단 하나, 마스크 이름과 틀린 속성을 메시지에 담는다). 그 마스크의 값을 배치하지 않음. 값 파일이 없는 마스크(`transformmask`·`colorizemask`)는 읽을 값이 없으므로 진단 없이 틀린 값을 0으로 본다 |
| `kra-colorspace-unsupported` | 읽는 여덟 색 공간(RGBA·RGBA16·GRAYA·GRAYAU16·RGBAF16·RGBAF32·GRAYAF16·GRAYAF32)이 아닌 색 공간 |
| `kra-layer-data-missing` | 레이어 데이터 항목이 ZIP에 없거나 `filename`이 없음 |
| `kra-layer-filename-invalid` | `filename`에 경로 구분자·제어 문자 |
| `kra-layer-data-shared` | 앞선 레이어가 이미 쓴 데이터 항목을 가리킴(관찰한 파일은 레이어마다 고유). 해제를 되풀이시키는 파일을 막으려고 읽지 않음 |
| `kra-layer-read-failed` | 항목을 읽지 못함(CRC 불일치 등) |
| `kra-layer-decode-failed` | 타일 파일·LZF·기본 픽셀이 올바르지 않음. 타일 하나라도 풀리지 않으면 그 레이어의 픽셀 전체를 포기(일부만 채운 레이어는 틀린 그림이다) |
| `kra-layer-limit-exceeded` | 레이어 출력 픽셀 한도, 전체 출력 바이트 예산 초과 또는 출력 버퍼를 만들 수 없음(메모리 부족) |
| `kra-layer-offset-invalid` | `x`·`y`가 ±2³¹ 안의 정수가 아님. 엉뚱한 곳에 그리지 않으려고 그 레이어의 픽셀을 건너뜀 |

`warnings`(보존되지만 확인이 필요한 것):

| 코드 | 뜻 |
| --- | --- |
| `kra-attribute-invalid` | 불리언·정수·불투명도 속성 값이 틀려 기본값으로 봄 |
| `kra-composite-op-unknown` | 관찰하지 못한 합성 연산 id(id는 그대로 보존) |
| `kra-mimetype-missing` · `kra-mimetype-not-first` · `kra-mimetype-unexpected` | `mimetype` 항목이 관찰한 Krita 파일과 다름 |
| `kra-default-pixel-missing` | `.defaultpixel`이 없어 투명으로 봄 |
| `kra-tile-trailing-bytes` | 타일 파일(레이어, 마스크 값 파일) 끝에 해석하지 않은 바이트 |
| `kra-mask-data-missing` | 투명도 마스크의 값 항목이 둘 다 없음: 선택을 한 번도 주지 않은 새 마스크로 보고, Krita가 다시 열어 읽는 대로 빈 선택(어디서나 0)으로 해석했다. 이 마스크가 보이면 레이어가 전부 숨는다 |
| `kra-profile-transfer-assumed` | 프로파일 이름으로 전달 함수를 알 수 없어 sRGB 감마로 가정(16비트 정수와 16·32비트 실수일 때만 알린다: 8비트에서는 값이 그대로다) |
| `kra-profile-primaries-unconverted` | 프로파일 이름이 `sRGB`·`Gray`로 시작하지 않거나 없는데 원색을 변환하지 않음 |
| `kra-layer-colorspace-differs` | 레이어의 색 공간이 이미지와 달라 전달 함수를 이미지 프로파일로 가정(import당 한 번) |
| `kra-resource-read-failed` · `kra-png-signature-invalid` | 합성 이미지·미리보기·ICC를 읽지 못함 또는 PNG가 아님 |
| `kra-issues-truncated` | 진단이 한도(`maxIssues`)를 넘어 잘림(어느 목록에나 붙을 수 있음) |

---

## 6. 안전 한도와 자원 회계

호출자는 한도를 **낮추기만** 할 수 있다(`limits`·`zipLimits`). 값이 올바르지 않거나 이름이 틀리면 조용히 무시하지 않고 `limit-invalid`로 거부한다.

| 한도 | 기본값 | 대상 |
| --- | --- | --- |
| `maxMaindocCharacters` | 8,000,000 | `maindoc.xml` 문자 수 |
| `maxNodes` | 20,000 | 레이어와 마스크 합계 |
| `maxGroupDepth` | 64 | 그룹 중첩 |
| `maxCanvasDimension` | 262,144 | 캔버스 한 변 |
| `maxTileSide` | 1,024 | 타일 한 변 |
| `maxPixelBytes` | 32 | 픽셀 하나 |
| `maxTilesPerLayer` | 65,536 | 레이어 또는 마스크 하나의 타일 수. `maxLayerPixels` 안에서 64×64 타일은 16,384개가 최대라 4배의 여유다 |
| `maxLayerPixels` | 67,108,864 | 레이어 하나의 RGBA8 출력 픽셀, 마스크 하나의 값 픽셀 |
| `maxDecodedBytes` | 1,073,741,824 | 모든 레이어의 RGBA8 출력 바이트와 모든 마스크 값 바이트의 합 |
| `maxIssues` | 500 | 진단 목록 하나 |

ZIP은 `bounded-zip.ts`의 고정 한도(입력 520MB, 항목 2,048개, 항목당 256MB, 압축비 100 …)를 그대로 쓴다. Krita는 래스터 레이어마다 항목을 3개(`layerN`, `layerN.defaultpixel`, `layerN.icc`), 값 파일을 가진 마스크마다 2개(`maskN.pixelselection`, `….defaultpixel`) 쓰므로 이 항목 수 한도 때문에 **래스터 레이어가 약 680개(마스크가 있으면 더 적게)를 넘는 문서는 `limit-exceeded`로 거부**된다(고정 한도는 올릴 수 없다).

**경로 정책**: 항목을 파일로 풀지 않고 메모리에서 이름으로만 찾으므로 `memory` 정책으로 연다. 이 정책은 올바르지 않은 UTF-8·유니코드, 제어 문자(탭, 줄바꿈, NUL, DEL), 절대 경로, 빈·`.`·`..` 구간, 경로 길이 초과를 거부하고(`unsafe-archive-path`), 운영체제 이식성 검사(NFKC, Windows 금지 문자·예약 이름, 끝 점·공백, 방향 제어 문자)는 하지 않으며 중복은 대소문자를 구분해 정확히 같은 경로만 본다. 결과에는 경로를 담지 않는다. 기본 정책(`portable`)은 바뀌지 않았다.

**자원 회계**(독립 검토가 실제 입력으로 재현해 고친 것들):

- 출력 버퍼는 만들기 **전에** 전체 출력 예산(`maxDecodedBytes`)에 청구하고 환불하지 않는다. 중간에 깨져 포기한 레이어도 예산을 쓰므로, 큰 버퍼만 만들고 버리는 파일을 되풀이해도 총 작업량은 예산으로 한정된다.
- 모든 타일 레코드의 구조(압축 이름, 플래그, 비압축 길이)를 버퍼를 만들기 **전에** 검사한다. LZF 스트림 자체는 풀어 봐야 알 수 있으므로 마지막 타일만 깨진 레이어는 그 레이어의 청구까지는 치른다(예산 안에서만).
- 출력 버퍼를 만들지 못하면(`RangeError`) 문서 전체가 실패하지 않고 그 레이어만 `kra-layer-limit-exceeded`로 포기한다.
- 마스크 값의 출력 버퍼(1바이트/픽셀)도 같은 예산(`maxDecodedBytes`)에 만들기 전에 청구하고 환불하지 않으며, 한 마스크의 출력은 `maxLayerPixels`를 넘을 수 없고, 마스크마다 이벤트 루프 양보를 확인한다(레이어 하나에 마스크가 수천 개여도 중단 신호가 실행된다). **레이어 픽셀을 모두 먼저 풀고 마스크 값은 그 뒤에 푼다.** 둘이 같은 예산을 쓰므로 노드 순서대로 풀면 앞선 노드의 마스크(적용되지 않는 선택 마스크 포함)가 뒤쪽 레이어의 픽셀을 밀어내, 마스크를 읽기 전에는 모두 풀리던 문서가 일부 레이어를 잃는다(독립 검토가 재현했다). 예산이 모자라면 줄어드는 쪽은 마스크 값이다.
- 투명도 마스크 적용은 호출자가 부르는 순수 함수라 `importKra`의 예산 밖이다. 대신 작업량 상한(`KRA_MASK_APPLY_MAX_PIXEL_OPS` = 2²⁸, 픽셀 수 × 실제로 곱하는 마스크 수. 호출자는 `maxPixelOps`로 낮출 수만 있다)을 버퍼를 복사하기 전에 검사해 마스크가 수천 개인 문서가 큰 레이어를 오래 붙잡지 못하게 한다. 곱셈은 64KiB 표 조회 한 번이라 1회에 대략 2~3ns로, 상한에서 1초 안팎이다(표 이전의 클로저 방식은 1회에 9~12ns여서 이전 상한 2³⁰에서 10초를 넘겼다). 동기 함수라 그 시간 동안은 호출자의 스레드를 붙잡는다.
- 마스크 하나의 타일 수는 `maxTilesPerLayer`(65,536)로 한정한다. 상한이 1,048,576이던 때는 1×1 타일 1,048,576개를 선언한 마스크 하나가 `importKra`를 약 5초 붙잡고 중단 신호를 그만큼 늦췄다(독립 검토가 재현했다).
- 같은 데이터 항목을 가리키는 두 번째 레이어는 읽지 않는다(`kra-layer-data-shared`). 마스크의 값 항목도 같다(`kra-mask-data-shared`). 서로 다른 항목은 ZIP 전체 해제 한도로 한정된다.
- 레이어마다 되풀이되는 문자열 비용: 진단 메시지는 앞쪽 몇십 글자만 훑어 자르고(`clipForMessage`는 문자열 길이와 무관), `IMAGE`의 `name`·`colorspacename`·`profile`은 1,024자까지만 받으며(이름은 ZIP 경로 한도 안에서만 의미가 있다), 프로파일 판정은 import당 한 번만 한다. (수정 전에는 6백만 자 `colorspacename` + 레이어 1,000개가 94초 걸렸다.)
- 오류 메시지(`KraError.message`)에 싣는 파일 유래 문자열도 자른다.
- SHA-256은 ZIP 구조 검증이 끝난 뒤에 플랫폼의 `crypto.subtle`(비동기)로 계산하고, 없으면 순수 구현으로 돌아간다. 쓰레기 입력에는 해시 비용을 쓰지 않는다.
- 단일 스레드에서 오래 도는 일이 중단 신호에 응답하도록 25ms마다 이벤트 루프에 양보한다. 한 레이어나 한 마스크를 푸는 동안(최대 6,700만 픽셀, 대략 0.3~0.5초)에는 양보하지 않는다.
- 호출자가 넘긴 `zipLimits.maxArchiveBytes`가 올바르지 않으면 입력을 읽기 전에 `limit-invalid`로 거부한다.

`maindoc.xml`은 안전 XML 파서가 읽는다: Krita의 `DOCTYPE` 한 줄(공개·시스템 식별자만 있고 내부 부분집합이 없으며 문서 첫머리에 있는 것)만 떼고, 그 밖의 `DOCTYPE`·`ENTITY`는 거부한다. 기본 한도는 브라우저에는 크다(예산 1GiB). 낮춰서 쓴다. `mergedImagePng`·`previewPng`·`iccProfile`은 출력 예산 밖이며 ZIP 전체 해제 한도(512MB)로 한정된다.

---

## 7. 검증

| 검증 | 내용 |
| --- | --- |
| 단위 테스트 641종 | 마스크: 조립(오프셋·합집합 범위·기본값 채움·비정사각 타일·청구·한도·할당 실패·중단, 타일 좌표와 오프셋의 합이 ±2³¹을 넘는 경우), 투명도 마스크 적용(256×256 전 조합, 알려진 Krita 값, 색 보존·0 처리, 여러 마스크의 순서, 숨긴·다른 종류 마스크, 읽지 못한 마스크의 상태 값, 마스크 사각형 정렬·자르기(레이어보다 크거나 겹치지 않는 마스크, 2³² 떨어진 마스크, 가로로만 떨어진 마스크), 바깥 값이 255가 아닌 모든 분기, 작업량 상한·`maxPixelOps`와 경계, 느린 기준 구현과의 무작위 대조 200건), 가져오기(값·범위·기본값·오프셋·그룹·종류별·읽지 못하는 모든 경우·값 항목이 둘 다 없는 투명도 마스크의 해석·호출자가 낮춘 한도의 전달·예산 순서·레이어와 마스크의 항목 공유 방지·중단·양보 간격과 신호 확인 횟수), 마스크 값 경로의 변조 퍼징(전 길이 절단, 무작위 변조 4000건, 항목 변조 600건). 레이어: LZF(리터럴, 겹치는 참조, 길이 확장, 먼 거리, 모든 손상 경로, 압축기 왕복), 타일 파일 파서(헤더·레코드·한도 경계·정렬·중복), 두 타일 배치, 타일 레코드 사전 검증·출력 예산 청구·할당 실패, 레이어 조립(오프셋·음수 좌표·기본 픽셀·중단), 정수 네 가지와 실수 네 가지 색 공간(반정밀도 해석·표·범위 밖 값·무작위 비트 패턴 포함)과 8비트 선형, 프로파일 이름 판정, `maindoc.xml`(적대적 DOCTYPE·엔티티 폭발·한도·메시지 길이), 노드 트리(가시성·마스크·값 오류), 가져오기 전체(그룹, 부속 항목, mimetype, 한도, 중단·양보, 이름 특수 사례와 경로 정책, 해시 폴백, 옵션 방어, 같은 데이터 항목 되풀이 방지), 손상 입력, ZIP 경로 정책 두 가지 |
| 알려진 정답 벡터 22개 | 실제 Krita가 저장한 타일 페이로드를 풀어 독립 Python 해석기의 해시와 비교한다. 레이어 15개(LZF 12개, 비압축 3개)는 원본 PNG 또는 Krita가 읽어 준 픽셀과 `importKra` 결과를 비교하고(여덟 색 공간 모두) 실수 형식 6개는 Krita가 합성 이미지로 그린 값과도 1단계 이내로 비교한다. 마스크 7개(LZF 6개, 비압축 1개; 오프셋 0과 `(10, 7)`, 기본값 0과 255)는 Krita가 다시 열어 읽은 마스크 값과 조립 결과를 비교한다 |
| 변이 시험 481종 | 손으로 쓴 변이(경계 비교, 연산자, 인덱스, 상수, 분기 반전, 검사 제거)를 하나씩 넣어 단위 테스트가 잡는지 확인했다. **468종을 잡았고 13종은 동등 변이로 판단했다.** 마스크 코드는 독립 검토의 지적을 반영한 최종 코드에서 새로 만든 188종(값 파일을 갖는 종류 집합, 곱셈 식과 표, 색 0 처리, 마스크 순서와 종류·가시성 분기, 작업량 계산과 옵션 검증, 사각형 자르기·정렬·32비트 절단, 바깥 값 분기, 타일 합집합·채움·복사 위치·무한대 초기값, 오프셋 속성, 값 항목 확인과 빈 투명도 마스크 규칙, 예산 청구와 두 번 훑기, 항목 공유 확인, 진단 코드·위치, 타일 수 상한)에서 185종을 잡았다. 동등 변이 3종: 알파가 이미 0인 픽셀은 곱셈 결과가 같아 앞의 `scaled === alpha`에서 반환하므로 색을 0으로 만드는 분기의 조건에 `알파 ≠ 0`을 더해도 같고(1종), 값 항목이 디렉터리 항목인지 보는 방어 검사 2종은 `getEntry(경로)`가 디렉터리 항목(경로가 `/`로 끝난다)에 닿지 않아 도달할 수 없다(레이어의 같은 검사와 같다). 검토 전 코드를 시험했을 때(134종) 살아남은 변이와 독립 검토가 찾은 생존 변이(마스크의 `uuid`·`filename`·`attributes` 전달, 호출자가 낮춘 한도의 무시, 레이어와 마스크의 항목 공유 확인, 타일 좌표 합의 32비트 절단, 바깥 값 254 분기)는 테스트를 더해 잡았다. `importKra`의 신호 확인 3곳(노드·마스크마다의 확인, 양보에서 돌아온 직후의 확인, 양보 시각 갱신)은 읽기 코덱 때부터 약했는데(양보 직후의 확인은 동등 변이로 분류했었다) 신호를 읽은 횟수를 세는 시험 2개로 잡았다. 한 변이(마스크가 가로로 떨어진 경우의 행 분기)는 처음에는 끝나지 않는 반복 때문에 시간 초과로만 잡혀서 빠르게 실패하는 사례를 앞에 두었다. 이전 코드의 변이 293종(타일·LZF·색 공간·`maindoc.xml`·가져오기·ZIP 경로·실수형)도 이번 변경 뒤의 최종 코드에서 다시 돌려 **283종을 잡았고 10종은 동등 변이다**(리팩터링으로 위치가 바뀐 변이 6종은 새 위치로 옮겼고, 레이어 조립과 마스크 조립 양쪽에 같은 줄이 생긴 변이 12종은 레이어 쪽에만 적용했다). 첫 시험(238종)에서 살아남은 변이 21종 중 15종은 테스트를 더해 잡았는데, 그중에는 약한 테스트도 있었다(예: 중단 신호 시험이 이벤트 루프 양보가 아니라 WebCrypto 해시의 대기에서 먼저 잡혀, 양보를 지워도 통과했다). 실수형을 더한 뒤에는 그 코드의 변이 55종(반정밀도 해석, 양자화, 표, 채널·바이트 위치, 형식 표, 경고 조건)을 새로 만들어 53종을 잡았다. 동등 변이 10종: 도달할 수 없는 방어 검사 3종(`maindoc.xml` 디렉터리 항목 확인, `SOURCE_INVALID` 오류 매핑, 올바른 UTF-8에는 짝 없는 서로게이트가 없음), 바로 다음 검사가 같은 결과를 내는 중복 3종(읽기·해시 직후의 중단 확인 2종은 달라지는 것이 레이어 하나를 더 푸는 시간뿐이고, `maindoc.xml` 바이트 상한 4배↔3배는 UTF-8이 UTF-16 코드 유닛당 최대 3바이트라 둘 사이의 입력이 어느 쪽이든 같은 `limit-exceeded`), 오류 메시지만 달라지는 중복 2종(절대 경로 접두 검사와 빈 경로 검사는 뒤의 빈 구간 검사도 같은 `PATH_INVALID`로 거부한다), 실수 양자화의 경계 2종(값이 정확히 1이면 `Math.round`로도 65,535이고, 0과 NaN은 `>`와 `>=` 어느 쪽이든 0) |
| 차분 검증 | 위 3.1의 대조. 재현 방법은 [`krita-oracle/README.md`](../../tests/corpus/formats/krita-oracle/README.md) |
| 독립 검토 | 코드를 모르는 검토자가 적대적 입력·정확성·테스트 허점을 실제로 실행해 찾았다. **읽기 코덱(1회)**: 확정 결함 7건(자원 회계 2건, 취소·해시·옵션, 이름 정책, 할당 실패, 프로파일 판정, 메시지 길이)과 문서 불일치를 이 문서와 코드에 반영했다. 결함 없이 확인된 것: 픽셀 정확성(타일·오프셋·extent·LZF 20,000개 경계·당시 지원하던 네 색 공간), 입력 별칭 없음, 극단 XML. **마스크(1회)**: 마스크 값의 배치·적용 식·순서·가시성·캔버스 밖에서 정확성 결함은 없었다(무작위 문서 160개·마스크 309개·픽셀 3,788,800개를 독립 브루트포스와 대조해 불일치 0, 실제 Krita 마스크 문서 17개 재대조 일치). 자원·설계 지적과 테스트 허점을 이 문서와 코드에 반영했다: (1) 마스크 값이 노드 순서대로 같은 예산을 써서 뒤쪽 레이어의 픽셀을 밀어냄 → 레이어를 먼저 풀고 마스크 값은 뒤에 푼다, (2) 적용 함수가 호출자의 스레드를 최대 10초 붙잡음 → 곱셈 표와 작업량 상한 2²⁸, `maxPixelOps`(분할 비동기 변형은 만들지 않았다), (3) 1×1 타일 100만 개짜리 마스크 하나가 가져오기를 약 5초 붙잡음 → 타일 수 상한 65,536, (4) null 반환이 '픽셀 없음'과 '마스크를 읽지 못함'을 구분하지 못해 호출자가 마스크 없는 그림을 그릴 수 있음 → `status` 값으로 구분하고, 값 항목이 둘 다 없는 투명도 마스크는 Krita가 다시 열어 읽는 대로 빈 선택으로 해석, (5) 마스크 진단의 위치·식별 불일치 → `layer[i].masks[k]`와 마스크 이름, (6) 한도 표와 '단위 테스트로 확인했다'는 서술이 사실과 다름 → 고침, (7) 생존 변이와 마스크 값 경로의 퍼징 부재 → 테스트 추가 |
| 로컬 실샘플 | 사용자가 `tests/corpus/formats/local-samples/`에 둔 `.kra`/`.krz`의 구조 진단 없음, 그룹 부모, 픽셀 크기 확인(샘플이 없으면 등록되지 않음) |

---

## 8. 한계와 후속

- 래스터 레이어가 약 680개를 넘는 문서는 ZIP 항목 수 고정 한도에 걸려 읽지 못한다(6절). 큰 만화 프로젝트 문서에 해당할 수 있다. 한도를 올리려면 `bounded-zip.ts`의 공용 안전 한도를 바꾸는 별도 결정이 필요하다.
- 5.2.2 한 버전과 합성 문서만 관찰했다. 다른 Krita 버전의 파일, 외부 도구가 만든 `.kra`, 아주 큰 문서는 검증하지 못했다. 사용자의 실제 `.kra`를 `local-samples/`에 두고 로컬 코퍼스 테스트를 돌리면 구조 가정을 더 확인할 수 있다.
- 한 레이어나 한 마스크를 푸는 동안에는 중단 신호가 실행되지 못한다(최대 약 0.5초). `applyKraTransparencyMasks`는 동기 함수라 큰 레이어는 상한에서 1초 안팎 호출자의 스레드를 붙잡는다. 중단 신호를 받는 분할 비동기 변형은 만들지 않았다.
- 마스크: 필터 마스크의 효과, 변형·색칠 마스크, 그룹 레이어 마스크의 적용은 하지 않는다. `layer.pixels`는 마스크를 적용하지 않은 값이라 마스크가 있는 문서를 보이는 대로 그리려면 소비자가 `applyKraTransparencyMasks`를 불러야 한다. 값 항목이 둘 다 없는 투명도 마스크(Krita가 선택을 한 번도 주지 않은 새 마스크)는 Krita가 그 문서를 다시 열어 읽는 대로 빈 선택(전부 0)으로 해석하고 `kra-mask-data-missing` 경고를 남긴다. 이 마스크가 보이면 레이어가 전부 숨는다(관찰). 이 해석은 5.2.2에서 다시 연 문서로만 확인했다.
- 후속 후보: CMYK·Lab 등 색 공간 환원(색 관리 규칙 필요), 필터 마스크 효과·변형 마스크·색칠 마스크, `documentinfo.xml` 메타데이터, 애니메이션(프레임 저장 방식 관찰 필요), 레이어별 ICC 판정, 채우기 레이어 관찰.
- 레이어 합성이나 앱 레이어 모델로의 변환은 이 모듈의 범위가 아니다. 합성 연산 id의 의미(공식)와 앱 블렌드 모드로의 대응은 별도 작업이다.
