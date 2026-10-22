# ToonStudio 에셋 인벤토리 (ASSET-INVENTORY)

작성일: 2026-09-30 · 작업 공간: `~/workspace/toonstudio-advance` (브랜치 `advancement/2026-09-29`)
기준: `apps/web/src/domains/creator/` 전체 스캔 + `material-atlas/catalog.json`

## 1. 요약

| 분류 | 위치 | 수량 | 라이선스 | 비고 |
|---|---|---|---|---|
| CC0 소재 카탈로그 (텍스처/HDRI/3D) | `domains/creator-resources/material-atlas/catalog.json` | 192 | CC0-1.0 | Poly Haven 147 + ambientCG 45. 메타데이터 한글화 진행 중 |
| CC0 포토 레퍼런스 배경 | `domains/creator/studio-2d-cc0-scene-manifest.json` | 28 | CC0 (원장 검수) | polyhaven 배경 사진, SOURCE.json provenance |
| 웹툰 배경 (자체 원본 JPG) | `domains/creator/studio-2d-asset-manifest.json` | 9 | 자체 제작물 | `webtoon-*` 9종. review 상태 포함. **손대지 않음** |
| 절차적 SVG 배경 Wave 1 | `studio-generated-2d-backgrounds-{city,genre,interiors}.ts` | 6 | 프로젝트 원본 벡터 | 벚꽃거리/테라스/작업실/복도/마법성/네온골목 |
| 절차적 SVG 배경 Wave 2 | `studio-generated-2d-wave-2.ts` | 11 | 프로젝트 원본 벡터 | 비오는 승강장/루프탑/키친/탐정사무실 등 |
| 절차적 SVG 배경 Wave 3 | `studio-generated-2d-wave-3.ts` | 8 | 프로젝트 원본 벡터 | 일러스트 스타일 환경 8종 |
| 절차적 SVG 배경 Wave 4 (신규) | `studio-generated-2d-wave-4.ts` | 8 | 프로젝트 원본 벡터 | 한국 일상 웹툰 배경 (편의점/지하철/한옥/병원/사무실/카페/PC방/시장) |
| 절차적 캐릭터/소품/가이드 | `studio-generated-2d-{characters,props,guides}.ts` + wave-2 | 14+16+8 | 프로젝트 원본 벡터 | 캐릭터 버스트, 소품, 작법 가이드 |
| 만화 FX 오버레이 | `domains/creator/studio-fx-assets.ts` | 61 | 프로젝트 원본 벡터 | 집중선/스피드선/말풍선/이펙트 |
| 2D 이펙트 텍스처 (신규) | `domains/creator/studio-generated-2d-textures.ts` | 8 | 프로젝트 원본 벡터 | 종이/수채화/필름그레인/빛샘/하프톤 등 타일 텍스처 |
| 스크린톤/톤 | `screentone/`, `studio-tones.ts`, `StudioTonePanel.tsx` | 다수 | 프로젝트 원본 | 도트/선 스크린톤 엔진 |
| 브러시 엔진 | `studio-brush*.ts`, `brush/`, `brush-lab/` | 다수 | 프로젝트 원본 | 별도 브러시 팀 담당 |
| 가상공간 캐릭터 | `virtual-space/studio-virtual-space-character-assets.ts` | 다수 | 프로젝트 원본 | 스프라이트 시스템 연동 |
| Creator Bundle 3D 테마 팩 (2026-10-22 추가) | `apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json` + R2 `bundle-v2` | 팩 42 · 배치 가능 13,597 (원장 이전 스냅샷) | 구매 라이선스(EmaceArt · RG Poly), 팩별 상이 — CC0가 아님 | 서비스 내 전용. 서빙 판정은 팩별 권리 원장(`config/creator-bundle-pack-rights.json`), 기본값 hold. §3 원칙과 충돌하는 현황이며 정책은 미결(§3.1·§3.2, 소유자 결정 대기) |

**합계: 배경 61종(9+28+24+8신규), 소재 192종, FX 61종, 텍스처 8종(신규), 캐릭터/소품/가이드 38종+**

## 2. 상세

### 2.1 CC0 소재 카탈로그 (192)
- 스키마 `toonstudio.material-atlas.v1`, 최대 192개 제한 (`MAX_CATALOG_ASSETS`)
- 종류: texture 95 / hdri 49 / model 48
- 제공처: polyhaven 147 / ambientcg 45
- 모든 항목 `license: "CC0-1.0"`, 썸네일은 제공처 CDN 화이트리스트 검증 (`safeMaterialThumbnail`)
- 한글 검색: `KOREAN_TERMS` 매핑 (나무→wood/tree 등 30여 개)
- **한글화 상태**: 48개 항목 `title`이 이미 한글 (2026-09-30 기준). 나머지 144개는 `titleKo` 필드로 한글 표시명 추가 (원본 `title` 유지, `parseMaterialAsset` 무시 → 안전)

### 2.2 CC0 포토 레퍼런스 배경 (28)
- `studio-2d-cc0-scene-manifest.json` v1, 2026-09-16 검수 완료
- 각 항목: 2048×1152 webp + sha256 + SOURCE.json provenance + review
- label이 이미 한글 ("햇빛 드는 넓은 도심 거리 · CC0 포토 레퍼런스")

### 2.3 웹툰 배경 자체 원본 (9) — 수정 금지
- `webtoon-cafe/classroom/corridor/creator-room/moonlit-forest/neon-alley/palace/rooftop-sunset/street`
- `review.method: full-image`, `status: usable`, 인물/텍스트 포함 여부 명시
- 사용자의 실측 원본 자산이므로 **추가·수정하지 않음**

### 2.4 절차적 SVG 배경 (33 → 41)
- Wave 1 (6): city 2 + genre 2 + interiors 2
- Wave 2 (11): `bg-rain-platform`, `bg-rooftop-garden`, `bg-cozy-kitchen`, `bg-detective-office`, `bg-lantern-street`, `bg-orbital-hangar`, `bg-art-classroom`, `bg-royal-library`, `bg-snow-village`, `bg-sunset-canyon`, `bg-underwater-ruins`
- Wave 3 (8): 일러스트 스타일 환경
- Wave 4 (8, 신규): 한국 웹툰 일상 배경 — 편의점, 지하철 차량 내부, 한옥 마당, 병원 복도, 야근 사무실, 카페 내부, PC방, 전통시장
- 등록: `studio-generated-2d-catalog.ts` → `STUDIO_GENERATED_BG_SCENES` (V3→V2→V1→V4 순서 유지 고려)
- 테스트: `studio-generated-2d-catalog.test.ts`의 PACK_INFO 카운트 업데이트 필요

### 2.5 만화 FX 오버레이 (61)
- `FX_OVERLAYS` + `COMIC_VECTOR_STICKERS`
- 집중선/스피드선/충격/감정(땀/분노/놀람)/자연(벚꽃/불씨/빗방울)/판타지(마법진/오라) 등
- 전부 자체 완결형 standalone SVG, 외부 ref 없음

### 2.6 2D 이펙트 텍스처 (8, 신규)
- `studio-generated-2d-textures.ts`: 타일 가능한 절차적 텍스처
- 종이결 2종, 수채화 번짐 2종, 필름 그레인, 빛샘, 하프톤 도트, 그을음/빈티지
- SVG `<pattern>` 기반, `generatedElement` 카테고리 `texture`로 등록

### 2.7 스크린톤/톤
- `screentone/` 디렉토리 + `studio-tones.ts` + `StudioTonePanel.tsx` + `StudioHalftonePanel.tsx`
- 브러시 팀과 영역 분리 (본 작업에서는 텍스처만 추가)

## 3. 라이선스 준수 원칙
- 외부 에셋은 **CC0-1.0만** 허용. 출처 URL + 저작자 + 라이선스 명시 필수
- 유료/저작권 불명 에셋 무단 사용 금지
- 신규 절차적 에셋은 전부 프로젝트 원본 벡터 (외부 아트/폰트/이모지 없음)
- 사용자의 자체 원본 JPG 9종은 손대지 않음

### 3.1 현황 (2026-10-22): §3과 충돌하는 구매 번들 배선이 이미 코드에 있다
위 §3 원칙(CC0-1.0만 허용)은 바뀌지 않았다. 그런데 저장소에는 itch.io 구매 번들 「Creator Bundle:
Volume 1」(EmaceArt · RG Poly)의 3D 에셋 배선이 이미 있다(`docs/studio/creator-bundle-theme-packs-20261021.md`).
이 번들은 CC0가 아니라 팩별로 다른 구매 라이선스이며, 「서비스 안에서만 사용, 원본 모델 다운로드·내보내기
미제공」 구조로만 쓴다. 이 배선을 §3의 예외로 인정할지는 §3.2의 소유자 결정 사항이고, 그 전까지는 팩별
권리 원장이 서빙을 hold로 닫아 둔다. `THIRD_PARTY_NOTICES.md`(생성 문서)에는 번들 항목이 없다.

팩별 로컬 라이선스 문서 현황(라이브러리 `~/3d-asset-library` 기준, 79개 문서 → sha256 33종):
- EmaceArt: 팩 안 문서는 개인·상업 사용을 허용하고 판매·독립 파일·다른 팩 안 재배포를 금지하거나 부탁한다.
  「앱에 포함해 배포」를 명시한 변형은 The80s·PixelDrift Metro·SlavicWorldFree 계열과 `Blend Textures.zip`
  안 LICENSE 사본 17개다. 같은 팩 폴더의 LICENSE(독립 파일·다른 팩으로 넘기지 말아 달라는 부탁 또는 재배포 금지)와 이 zip 사본이
  함께 있어 서로 다른 문구가 공존하는 팩이 11개 있고(Iowa Covered Bridges·Cemetery Statues·Raft on the Desert
  등), 어느 쪽이 우선하는지는 제작사 서면 확인 대상이다. **웹 서비스 호스팅·하위 사용자는 어느 변형도 허용도
  금지도 하지 않으며**, 일부 변형은 수정본에도 같은 제한을 적어 변환·재압축이 면책이 되지 않는다. 풀팩 문서가
  없고 무료판 문서만 있는 팩이 있다(Slavica 등).
- RG Poly: 이전 인벤토리의 「RG Poly 대형 팩은 로컬 라이선스 없음」은 Restaurant와 Medieval에 한해
  틀렸다. Cute Dungeon은 CC0 문서가 있고, Cute Park의 문서는 Dungeon 것을 복사한 파일이라 귀속
  재확인이 필요하며, Small Props는 CC0 표기와 「독립 항목으로 다운로드 제공 금지」가 함께 있어
  자기모순이다. Restaurant의 `RG POLY License.odt`는 CC0가 아니고 모델의 있는 그대로의 공개 게시·재배포와
  경쟁 라이브러리 제작을 금지하며 완성 프로젝트의 일부로만 배포를 허용한다. Medieval Megapack의
  License.txt는 Small Props 템플릿이다. 반면 City·Nature·Farm·Pirate·Aztec·Characters 등은 로컬 문구가
  없고 itch 팩 페이지의 CC0 표기(2차 조회)에만 기댄다.
- itch 번들 약관과 구매 영수증은 읽지 못했다(확인 필요).

운영 방식: 팩별 서빙 판정은 권리 원장(`config/creator-bundle-pack-rights.json`)의 `serve: hold | allow` 한 줄이며
기본값은 hold다. 증빙(라이선스 문서·itch 팩 페이지 캡처·구매 영수증·제작사 서면 확인)을 요구 표대로 갖춘
팩만 allow가 될 수 있고, 생성기와 배포 플래너가 이를 따른다(Worker는 원장을 읽지 않고 R2에 올라간 객체를
동일 출처 가드로만 제한한다). 로컬 변환·검증·QA 렌더는 어느 팩이든 할 수 있으나 공개 R2 업로드는 팩 단위
게이트를 지난 팩만 한다. 이미 올라간 팩의 권리를 철회하면 R2 객체는 소유자가 직접 삭제해야 한다.

### 3.2 제안 (소유자 결정 대기 — 적용하지 않음)
위 §3의 「CC0-1.0만 허용」을 다음처럼 개정하는 안이다. 소유자가 정하기 전까지 §3 본문은 바꾸지 않는다.
- 외부 에셋은 CC0-1.0, 또는 **팩별 증빙을 갖춘 구매 번들 예외**(서비스 내 전용, 다운로드·내보내기 없음,
  권리 원장 allow)만 허용한다.
- 함께 정할 것: 번들 GLB의 공개 서빙 자체를 허용할지, 서빙을 이 선언에 맞춰 동일 출처·불투명 키로
  제한할지(현재 구현은 후자), `THIRD_PARTY_NOTICES`에 번들 항목을 둘지.

### 3.3 3D 에셋 중복 전수 감사 (2026-10-22)
내용 해시(git 객체 해시는 내용이 같으면 같다)와 GLB/glTF 파싱으로 3D 에셋의 중복을 전수 확인했다. 결론: **저장소에
들어 있는 서비스용 3D 에셋에는 사실상 중복이 없고, 중복은 저장소 밖 로컬 라이브러리(`~/3d-asset-library`)에 있다.**

저장소(추적 파일 36,790개, 기준 `209ebed41`):
- 바이트 동일한 3D 관련 사본은 2그룹뿐이었다. `assets/3d/characters/thumbnails/refined-v1/{kage,froggy}.png`가
  `refined-v2/`의 같은 이름과 내용이 같았다(합 0.6MiB). v1 manifest에는 5개 항목(mega-angel·alicia·rubin·unicorn-person·vivi)뿐이고
  코드는 이 둘을 v2로 참조하므로 어디서도 쓰이지 않는 고아였고, 이 변경에서 지웠다. 지금 3D 관련 바이트 동일 사본은 0그룹이다.
  저장소 전체(3D 외 포함)의 바이트 동일 사본은 157그룹 · 잉여 1,257개 · 27.7MiB이며 이번 범위 밖이다.
- GLB·glTF·VRM 1,439개를 전부 파싱했다(오류 0). 정점·인덱스가 같은 형상 그룹은 5개이고 모두 의도된 것이라 지우지 않는다:
  `studio/cc0-20260906`의 `*-mobile-v1.glb` 3쌍(텍스처 해상도만 다른 모바일 변형)과 `creator-essentials`의 자리표시용 스텁 2묶음
  (`pose-*-3d.glb` 5개, `prop-*.glb` 5개).
- 이미지 참조(내장·외부 합) 1,859건 1,244MiB 중 고유 이미지는 911장 1,033MiB다. 반복분 약 211MiB는 작은 이미지의 재사용이다.

로컬 라이브러리(`~/3d-asset-library`, 파일 133,925개 50.6GiB — 저장소 밖이라 이 문서가 정본이 아니다. 아래는 2026-10-22 스냅샷이고
정본은 `_catalog/DUPLICATES.md`·`TEXTURE-DUPLICATES.md`·`RELATIONS.md`·`ARCHIVES.md`·`LAYOUT.md`·`CONVENTIONS.md`):
- 바이트 동일 사본 4,337그룹 · 잉여 9,429개 · 1.6GiB(3.1%). 한 팩 안의 텍스처가 680MiB, 팩 사이 모델이 437MiB로 가장 크다.
- 가장 큰 중복은 GLB 안에 **내장된 텍스처**다. 외부 텍스처 GLB를 내장 GLB로 재익스포트한 `_derived`(11,794개)는 이미지 참조
  10.5GiB가 고유 이미지 26장(65MiB)의 반복이다. 원본에서 바이트 단위로 똑같이 재생성됨을 확인했다(11,794/11,794).
- 정점·인덱스가 같은 GLB/glTF는 8,804그룹이지만 UV·머티리얼이 다른 변형이 대부분이라 삭제 근거가 아니다.
- 폴더 구조는 바꾸지 않는다. 권리 원장이 증빙 경로 전체와 sha256으로 라이브러리 경로를 참조해 카테고리·슬러그·컨테이너 이름을
  바꾸면 검증기가 어긋난다. 구조 고도화는 `_catalog`의 색인 층(`files.tsv`·`models.tsv`·`RELATIONS.md` 등)으로 했다.
- 소유자 결정 대기(아무것도 지우지 않았다): `_derived` 삭제(약 11.6GiB, 재생성 가능), 같은 팩의 풀린 파일로 완전히 대체되는 zip 5개
  (약 276MiB), 백업·임시 파일 19개(375MiB), 바이트 동일 사본의 클론 합치기(약 1.5GiB, 원본 `bundle/` 삭제 후 효과).

저장소 쪽 재현(스파스 체크아웃에서도 동작):
`git ls-files -s -- apps/web/public | awk '{c[$2]++; p[$2]=p[$2]" "$4} END{for(h in c) if(c[h]>1) print c[h], p[h]}' | grep -E '\.(glb|gltf|vrm|hdr)|assets/3d/'`
(출력이 없으면 3D 관련 바이트 동일 사본이 없다.)

## 4. 남은 작업 (후속)
- [ ] 로컬 3D 라이브러리 정리 후보(§3.3 마지막 항목) 소유자 결정
- [ ] `titleKo`를 UI에 표시 (`MaterialAtlasPage` 등에서 `titleKo ?? title`)
- [ ] Wave 4 카탈로그 테스트 카운트 업데이트
- [ ] 텍스처를 에셋 라이브러리 UI에 노출
- [ ] CC0 카탈로그 192개 상한 도달 시 로테이션 정책
