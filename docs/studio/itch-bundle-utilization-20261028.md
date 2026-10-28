# itch.io 구매 번들 활용 설계와 수신 확인 — 2026-10-28

상태: **current + migration + target**. 로컬 수신 사실은 아래 `current` 실측을 따른다. 권리 판정은 [팩별 권리 원장](../../config/creator-bundle-pack-rights.json)과 [2026-10-28 권리 검토](./itch-bundle-license-review-20261028.md)가 정본이다. 파생 파일·소비 코드·해시·화면 검증이 모두 확인된 항목만 서비스 적용 완료로 집계한다.

## current — 구매 목록과 로컬 실물

2026-10-28 로그인된 itch.io 구매 목록을 끝까지 불러와 공용 프로젝트 URL 85개를 확인했다. 구매 영수증·다운로드 권한 링크·이메일·결제 정보는 저장소에 넣지 않는다. 구매 확인은 `local-private:itch-purchase-library-observation-20261028`로 참조하고, 감사 입력에는 공용 프로젝트 URL과 로컬 팩 식별자만 사용한다.

로컬 정리본 `~/3d-asset-library/_catalog/packs.json`과 각 팩의 실제 파일을 [감사 CLI](../../scripts/audit-itch-purchased-library.mjs)로 대조했다. 기존 원본 `bundle/`와 정리본은 보존하며, 원본 모델을 Web의 `public/`로 복사하지 않는다.

| 확인 항목 | 2026-10-28 실측 | 의미 |
| --- | --- | --- |
| 로그인 구매 목록 | 공용 프로젝트 URL 85개 | 구매 상품 수이며 모델 수가 아니다 |
| 로컬 팩 | 85개 | 무료판·본편·합본을 로컬 분류 규칙으로 묶은 수 |
| 로컬 파일 | 122,128개 | 모델 형식 변형·엔진 파일·사본을 포함 |
| 로컬 바이트 | 41,833,271,347바이트, 약 38.96GiB | 팩 영역 실파일 합계, `_catalog`·`_private` 제외 |
| GLB / FBX | 35,019 / 40,982개 | 개별 파일 수이며 고유 모델 수가 아니다 |
| glTF / OBJ / blend | 5,181 / 4,791 / 91개 | 변환·렌더 입력 후보 |
| unitypackage | 78개 | 브라우저가 직접 사용하는 형식이 아니다 |
| 색인 파일 수·바이트 불일치 | 0건 | 팩별 색인과 실물 통계 대조 결과 |
| 명시 매핑 후 연결 / 자료 존재 | 85 / 85품목 | 구매만·로컬만 남은 항목 0개 |
| 바이트 동일 중복 | 4,336그룹·잉여 사본 9,428개 | SHA256 대조, 원본 사본을 삭제하지 않음 |
| 중복 잉여 바이트 | 1,694,788,955바이트 | 동일 파일의 추가 사본 합계, 형상 중복과 구분 |

구매 상품과 로컬 팩은 단순한 1:1 관계가 아니다. `food-pack` 한 상품은 `food-pack-full`·`food-pack-small` 두 로컬 팩으로 나뉘고, 겨울 무료판과 본편 두 상품은 `winter-atolls-pack-3d-voxel-environment-kit-mega-pack` 한 팩 안에 있다. 공개 상품 slug와 로컬 `packs.json`·`SOURCES.tsv`를 대조한 `localSlug`/`localSlugs` 명시 매핑을 사용한다. `swamp-builder`는 architecture, `swampia`는 nature에 대응하며, 각각의 Godot 압축본 매핑으로 확인했다.

제목만 구두점 제외 완전 일치로 비교한 첫 실행에서는 22개만 연결됐고 63개가 연결 확인 대기였다. 이를 미다운로드 63개로 해석하지 않는다. 상품명·에디션명이 로컬 팩 이름과 달라 생긴 결과다. 명시 매핑을 적용한 최종 감사에서는 85개 상품 전부에 대응하는 로컬 자료가 있고 구매만·로컬만 남는 항목과 색인·모델 형식·실물 통계 문제는 0건이었다. 폴더·파일이 있다는 사실은 상품별 모든 플랫폼 파일과 최신 버전을 받았다는 보증이 아니다.

## current — 기존 서비스 경로와 권리

기존에 BG3D 번들 매니페스트·생성기·배포 플래너·[테마 팩 패널](../../apps/web/src/domains/creator/bg3d/StudioBg3dBundleThemePackPanel.tsx)이 있다. 드로잉에는 [번들 렌더 소재 패널](../../apps/web/src/domains/creator/StudioBundleAssetLibraryPanel.tsx)과 [전달 검증기](../../apps/web/src/domains/creator/studio-bundle-asset-delivery.ts)가 있다. 새 소재 기능을 별도로 만들기보다 이 동선에 검수된 파생 이미지를 넣는다.

조사 시작 시점 `bundle-renders-v1`은 파일·해시가 없는 예시 슬롯 4개뿐이었다. 또한 과거 `theme-packs.json`에 나열된 14,928개 모델은 실제 제공 중인 수나 권리 허용 수가 아니었다. [2026-10-28 권리 검토](./itch-bundle-license-review-20261028.md)에 따라 공식 CC0 증빙이 확인된 12개 팩만 연다. 기본 판정은 `hold`이고 서면 확인이 필요한 팩의 판정은 유지한다.

Cute Dungeon의 GLB 320개와 Cute Park의 GLB 103개를 검사해 외부 buffers/images URI가 없는 자기완결 파일임을 확인했다. Dungeon 내부에는 책·그릇·테이블·의자·책장·촛불·식물·크리스털이 있고, Park에는 벤치·가로등·분수·나무·꽃·휴지통·오리가 있다. Park에 들어 있는 `License.txt`는 Dungeon 문서의 복사본이므로 공식 Park 페이지의 CC0 증빙을 별도로 사용한다.

### current — 구현 브랜치의 실제 렌더 소재

`bundle-renders-v1`에 검수된 투명 소재 **144종**과 슬롯별 384px 미리보기를 넣었다.
기존 예시 초안 4개는 그대로 보존하고 전달하지 않는다. 본 이미지는 **1536×1536 무손실
WebP**이며 PNG 원본과 디코딩한 RGBA 픽셀을 전수 대조했다. 공개 폴더는 매니페스트 1개와
이미지 288개뿐이며, 모델·텍스처 원본을 포함하지 않는다. 파일 합계는 62,551,189바이트다.

| 실제 사용한 팩 | 소재 수 | 대표 용도 |
| --- | ---: | --- |
| Cute Park | 24 | 벤치·나무·꽃·가로등·공원 장식 |
| Cute Dungeon | 32 | 책·책장·탁자·양초·물약·보물 소품 |
| RG Poly Food | 24 | 음식·접시·잔·조리 도구 |
| Cartoon City | 5 | 커피머신·의자·휴지통·우편함 |
| Nature Extended | 6 | 바위·식물·버섯·건초 |
| Farm Land | 7 | 헛간·농작물·닭·급수탑 |
| Pirate Island | 6 | 보트·닻·야자수·보물 상자 |
| Aztec Jungle | 8 | 유적·석상·문·정글 소품 |
| Characters 1 | 6 | 캐릭터 후면 의상 참고 |
| Cute Graveyard | 14 | 예배당·묘비·호박·관·울타리 |
| Medieval Weapons | 12 | 활·방패·검·도끼·지팡이 |

기존 그리기 소재 메뉴의 **번들 렌더 소품** 패널이 이 매니페스트를 읽고, 검색·확대 미리보기·
해시 검증 후 이미지 삽입과 개인 라이브러리 저장을 제공한다. 저장 시 같은 이미지 해시뿐 아니라 동일한 권리·출처인 경우에만 기존 개인 소재를 재사용한다. `bundleSourceCredit`는 정식 공유 계약을 통해 개인 SQLite/OPFS·실제 삽입·프로젝트·보관 파일·게시 권리 검사에 전달한다. 한국어 소재명과 검색어를 함께 등록했다. CC0는 실제
원장·공식 deed가 일치할 때만 허용하며 패널에서도 CC0의 이용·수정·재배포 권리를 정확히
표시한다. `studioRuntimeVerified`는 실제 편집기 저장·재로드까지 검증했다는 의미로 올리지 않았다.

처음 렌더한 120개 중 식별이 어려운 관목과 파일명·메시가 맞지 않는 풀 2개는 선정 설정의
`rejected`에 사유를 남겼고 공개 파일로 넣지 않았다. Characters 2는 이번 렌더에 넣지 않았으며,
재질·리그와 완전한 렌더 입력 검증을 마친 뒤 추가한다. 후속 후보 28개 중 식별성이 낮은 박쥐와 뒤쪽 두개골 위주의 해골 2개도 제외했다. 3D 쪽은 Park 103개·Dungeon 320개·Graveyard 253개·Weapons 32개, 합계
708개의 자기완결 GLB 메타데이터를 재생성했다. 기존 장르 프리셋 연결은 Park·Dungeon 423개이며 원본 업로드·3D 서빙 완료를 뜻하지 않는다.

이는 **구현 브랜치의 적용 상태**다. 원격 필수 CI와 병합·운영 배포 완료는 별도 증거로 확인한다.

### 실제 브라우저 검수 — 2026-10-28

[전용 검수 화면](../../apps/web/tools/browser-harnesses/bundle-renders-runtime.html)에 실제 소재
패널과 전달 함수를 마운트하고 [브라우저 검증기](../../scripts/verify-creator-bundle-renders.mjs)로
검사했다. [결과 JSON](../evidence/itch-bundle-renders-20261028/runtime-review.json)과
[데스크톱 화면](../evidence/itch-bundle-renders-20261028/desktop-library.png),
[390px 화면](../evidence/itch-bundle-renders-20261028/mobile-canvas.png)을 보존했다.

- 144개 전부 실제 fetch·SHA256·바이트 수·1536px 디코딩 검사 통과, 실패 0개.
- 기본 목록 24개와 6페이지, 한국어 `물약` 검색 3개·`벤치` 검색 2개 확인.
- 확대 미리보기의 실제 이미지 치수와 Escape 닫기 확인.
- 벤치·물약·모바일 벤치 3회 실제 canvas 삽입 후 알파 픽셀·해시·CC0 권리 표시 확인.
- 390×844 화면의 가로 넘침 없음, 브라우저 예외 0개.
- 패널의 실제 개인 저장 → 페이지 새로고침 → `listAssets()` 재조회 후 OPFS에서 복원한 이미지의 SHA256과 출처 기록 일치. `databasePersistenceVerified: true`는 이 로컬 SQLite/OPFS 왕복 범위를 뜻한다.

검수 서버는 앱 전체의 의존성 탐색과 분리한 loopback Vite 서버를 사용했다. 실제 사용자 계정이나
운영 API에 접근하지 않았다. 이 결과는 로그인된 편집기의 문서 저장·재로드·내보내기나 운영
배포의 검증이 아니다. 로컬 개인 소재 저장과 원격 프로젝트 저장을 구분한다.

### current — 완성 배경과 가상 장소 장식

[완성 배경 레시피](../../config/creator-bundle-scene-recipes.json)는 Park 정원 산책길과 Dungeon 판타지 서재 2개다. 원본 모델 인스턴스 33개를 바닥·건축·카메라·조명과 배치하고 **2048×1152 불투명 배경**으로 렌더했다. 모델/배치/렌더러 해시를 레시피 증명에 묶고 PNG→WebP RGBA 무손실 왕복을 확인했다. `bundle-scenes-v1`은 본문 2장·512×288 미리보기 2장·manifest, 합계 2,918,281바이트다.

[실제 2D 선택기 adapter](../../apps/web/src/domains/creator/catalog/studio-bundle-backgrounds.ts)는 `creator-bundle-cc0` 출처와 `stylized-low-poly` 화풍을 명시한다. 큰 원본·실내외·장르·인물/문자 없음 필터를 사용할 수 있고 기존 `addBgScene`의 선택 컷/모든 컷/캔버스 배경 동선을 따른다. [브라우저 기록](../evidence/itch-bundle-scenes-20261028/runtime-review.json)은 두 배경의 2048px 미리보기·720×405 실제 배치·출처 보존·불투명 canvas와 390px 화면을 확인한다. 원격 프로젝트 저장 성공을 의미하지 않는다.

가상 장소의 [고정 장식 helper](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-bundle-decor.ts)는 garden·tree-library·creator-cafe에 각각 장식 2개를 기존 `assetUrl → imageUrl` 캐시로 전달한다. 검수된 나무·관목 화단·꽃 3종만 사용한다. 1536px 원본을 보존하고 리사이즈 없이 알파 경계만 자른 바닥 고정 파생물 3개와 manifest는 800,020바이트다. 매니페스트에 원본/파생 SHA256·알파 bbox·권리·anchor를 남긴다.

[장식 화면 기록](../evidence/itch-bundle-decor-20261028/runtime-review.json)은 세 장소의 1100/390px 6가지 경우에서 실제 Canvas·장소별 이미지 2개 로딩·반복 그리기·이동·작업대 선택·가로 넘침 없음·예외 0개를 확인한다. 기존 손그림 장소와 로우폴리의 화풍 차이를 고려해 전경의 소수 장식으로 배치했다. HQ·사용자 custom 장식과 아바타 런타임은 이 적용 범위에 포함하지 않는다.

### 텍스처가 생략된 GLB의 파생 복구

Farm 7개·Pirate 6개·Aztec 8개 선별 모델은 GLB의 머티리얼 이름은 남았지만 이미지 참조가 없어 초기 렌더가 흰색 또는 검게 보였다. [렌더 선택 설정](../../config/creator-bundle-render-selection.json)에 각 모델의 실제 Godot `Materials/<materialName>.tres`가 가리키는 `albedo_texture`만 `textureBindings`로 연결했다. GLB 원본과 해시는 유지한다.

| 팩 | 원래 Godot 머티리얼 | 실제 albedo 이미지(라이브러리 상대 경로) |
| --- | --- | --- |
| Farm Land | `M_Atlas_Farm`, `M_Metalic_1_Farm` | `03-nature/farm-land/engine/godot/Textures/farm_atlas.png` |
| Pirate Island | `M_Atlas_1_TI`, `M_Atlas_2_TI`, `M_Atlas_3_TI`, `M_Atlas_Met_1_TI` | `03-nature/pirate-island/engine/godot/PirateIsland/Textures/T_Atlas_TI.png` |
| Aztec Jungle | `M_Atlas_1`, `M_Metalic_1` | `03-nature/aztec-jungle/engine/godot/AztecJungle/Textures/T_Atlas_Gradient_1.png` |

세 이미지의 SHA256을 설정에 고정하고 해당 모델에 실제 존재하는 머티리얼 이름만 연결한다. Farm의 Godot판 GLB에 남아 있는 `../../Textures/farm_atlas.png` 참조도 같은 이미지로 해석되는 것을 대조했다. 이미지 바인딩 뒤의 파생 해시·색·실루엣·알파는 다시 렌더해 검수하며, 설정 연결만으로 검수 상태를 올리지 않는다.

## migration — 적용 순서와 제품 동선

| 우선순위 | 팩·소재 | 서비스 동선 | 완료 기준 |
| --- | --- | --- | --- |
| P0 | CC0 12팩의 음식·공원·가구·책·자연 소품 | 드로잉 통합 소재 도구 → 구매 번들 렌더 소품 → 캔버스/레퍼런스 보드 | 투명 고해상도 렌더·썸네일·모델/이미지 해시·권리 스탬프·실제 삽입 검증 |
| P0 | 같은 팩의 선별된 공간 장식 | 가상 스튜디오의 기존 장식 렌더 경로 | 프레임마다 새 fetch 없이 캐시 사용, 이동·충돌·작업대 선택 동작 보존, 모바일 화면 확인 |
| P1 | City·Nature·Farm·Pirate·Aztec 환경 | 완성 배경/씬 프리셋, 컷 밑그림과 레퍼런스 | 장르·실내외·시간대·카메라별 큐레이션, 실제 배경 삽입과 저장/재로드 검증 |
| P1 | CC0 Characters 1·2 | 가상 스튜디오 아바타/군중용 렌더 sprite, 포즈 레퍼런스 | 텍스처·스켈레톤·방향·보행 프레임·모바일 성능 확인; 기존 아바타 정책과 선택 동선 준수 |
| P2 | EmaceArt 환경·캐릭터, Restaurant·Medieval·Small Props | 권리 확인 후 앞선 렌더 경로로 확장 | 원장이 요구하는 웹 서비스 호스팅·하위 사용자·상충 문구에 관한 서면 증빙 확보 |
| target | Godot/Unity 셰이더·에디터 도구 | DCC 오프라인 제작 또는 향후 엔진 어댑터 | 라이선스와 엔진 차이를 별도 검토하고 필요한 기능을 실제 구현·검증한 뒤 편입 |

소재의 수를 늘리기 위해 같은 모델의 포맷 변형을 별도 소재로 노출하지 않는다. 사용자가 고를 수 있는 카테고리·검색어·썸네일을 먼저 갖추고, 소품은 투명 이미지, 환경은 장면 배경, 캐릭터는 행동/포즈 변형으로 구분한다. 드로잉 결과물에는 팩별 권리와 출처 메타데이터를 연결한다.

## migration — 파생 제작 계약

1. **로컬 입력**: 구매 목록·로컬 색인·실파일을 감사한다. 경로를 추측해 다운로드하거나 기존 원본을 덮어쓰지 않는다. 별도 수신이 필요하면 구매 화면의 실제 파일 목록과 보유 압축본을 비교한다.
2. **권리**: 공용 팩 페이지 증빙·실물 라이선스·구매 확인을 원장에 연결한다. `hold`에서 파생된 결과는 매니페스트와 서비스 노출에서 제외한다. 모델 바이트가 브라우저로 전달되는 경로와 오프라인 렌더 이미지 경로를 각각 검토한다.
3. **무결성**: 모델 해시와 텍스처 참조를 확인한다. 외부 URI가 있는 GLB/glTF는 텍스처를 해석해 로컬 파생본으로 만들며, 폴더 이동으로 상대 경로를 깨뜨리지 않는다.
4. **렌더**: 투명 소품은 기존 1536×1536 규격, 썸네일은 384 규격을 기준으로 한다. 카메라·조명·배경·알파·실루엣을 고정하고 원본과 파생 이미지 해시를 기록한다. 원본 텍스처·프로젝트 파일은 서비스 소재로 복사하지 않는다.
5. **검수**: 컨택트시트에서 방향·재질·클리핑·빈 이미지·중복 변형을 확인한다. 컨택트시트 확인은 실제 캔버스 삽입·레이어 저장·재로드·내보내기 성공을 대신하지 않는다.
6. **등록**: `bundle-renders-v1`에 bytes·SHA256·치수·`derivedFromPack`·원본 모델 해시·검수 상태를 적고 권리 스탬프를 동기화한다. 기존 검증기를 약화하거나 CC0 전용 매니페스트에 상용 팩을 섞지 않는다.
7. **화면 검증**: 드로잉 소재 선택/삽입과 가상 공간 데스크톱·모바일 화면을 확인한다. 소비 코드가 없는 파일은 적용 완료로 집계하지 않는다.

비용 최적화는 같은 화질·기능·편의성을 보존하는 범위에서 적용한다. 원본 폴더의 사본을 삭제하거나 해상도를 낮추는 대신, 내용 해시 재사용·요청 캐시·명시적 지연 로딩·필요한 파생 결과만 제공하는 방식을 쓴다. 구매한 재질과 모델은 렌더 품질을 높이는 입력이며 자동 유료 추론으로 대체하지 않는다.

## 감사 CLI와 검증 범위

실행 위치는 저장소 루트다. 입력 구매 JSON은 배열 또는 다음 구조다. 상품 URL은 공용 프로젝트 주소만 허용하고 계정·구매·다운로드 주소와 쿼리·프래그먼트·자격증명은 거부한다. `localSlugs`는 합본/무료판 관계를 직접 검토했을 때만 사용한다.

아래 명령은 조사 때 만든 로컬 매핑 입력 `/tmp/toonstudio-itch-purchases-mapped-20261028.json`이 있는 환경에서 재현한다. 다른 환경에서는 공개 URL과 팩 관계를 다시 확인해 같은 스키마의 입력을 만들고 `--purchases` 경로를 바꾼다. `/tmp` 보고서와 구매 목록은 커밋하지 않는다.

```json
{
  "schema": "toonstudio.itch-purchases.v1",
  "capturedOn": "2026-10-28",
  "purchases": [
    {
      "title": "Cute Dungeon Megapack",
      "url": "https://rg-poly.itch.io/cute-dungeon-megapack",
      "localSlug": "cute-dungeon-megapack"
    }
  ]
}
```

```bash
node scripts/audit-itch-purchased-library.mjs \
  --library-root "$HOME/3d-asset-library" \
  --purchases /tmp/toonstudio-itch-purchases-mapped-20261028.json \
  --out /tmp/toonstudio-itch-library-audit.json \
  --dry-run

node scripts/audit-itch-purchased-library.mjs \
  --library-root "$HOME/3d-asset-library" \
  --purchases /tmp/toonstudio-itch-purchases-mapped-20261028.json \
  --out /tmp/toonstudio-itch-library-audit.json \
  --hash-duplicates

node --test scripts/audit-itch-purchased-library.test.mjs
```

`--dry-run`은 보고서도 쓰지 않는다. 일반 실행에서 쓰는 파일은 명시된 JSON 보고서 하나뿐이며 라이브러리 안 출력과 심볼릭 링크 출력은 거부한다. 팩 경로 탈출·심볼릭 링크를 따라가지 않는다. 종료 코드 0은 조사 완료·불일치 없음, 1은 실물/색인/매핑 문제, 2는 입력·경로·읽기 실패다. 구매만 존재하는 상품은 연결 확인 대기로 따로 기록하며 그 자체로 실패나 미수신 확정으로 처리하지 않는다.

기본 실행은 파일 수·바이트·확장자·모델 형식 수·라이선스 파일 위치·색인 밖 팩·구매/로컬 연결을 검사한다. `--hash-duplicates`를 준 경우에만 크기가 같은 비어 있지 않은 파일을 스트리밍 SHA256으로 비교해 실제 바이트 동일 중복을 집계한다. 해시를 생략한 보고서는 `duplicateFiles.checked: false`로 명시한다. 같은 형상이거나 같은 이름인 모델은 바이트 동일 중복으로 간주하지 않는다.

### 2026-10-28 실행 기록

- Node 단위/CLI 회귀 테스트 6개 통과: 정상 통계·명시적 다대다 매핑·누락/불일치·공용 URL 보안·경로/심볼릭 링크·실제 해시 중복·dry-run·종료 코드 확인.
- 제목 기반 첫 전체 감사 종료 코드 0: 로컬 85팩, 122,128파일, 41,833,271,347바이트, 구매 85품목, 연결 22품목, 연결 확인 대기 63품목, 실물/색인 문제 0건.
- 명시 매핑·SHA256 중복 감사 종료 코드 0: 구매 85품목 전부 연결·자료 존재, 구매만 0, 로컬만 0, 문제 0. 중복 4,336그룹·잉여 사본 9,428개·1,694,788,955바이트. 로컬 보고서는 `/tmp/toonstudio-itch-audit-mapped-20261028.json`이며 원본 에셋과 구매 입력을 수정하지 않았다.

## legacy exception과 남은 범위

2026-10-20~22 문서의 “미수신”·“배치 가능”·“전부 hold”는 당시 스냅샷이다. 현재 실물, 권리 원장, 검증 결과보다 우선하지 않는다. `_derived/glb-embedded`의 11,794개 파생 파일은 2026-10-23 소유자 지시로 삭제됐으며, 재생성 도구와 기대 해시만 남아 있다. 존재하지 않는 파생 경로를 그대로 제품 입력으로 삼지 않는다.

Unity/Godot 프로젝트와 셰이더는 Web의 Three.js/Canvas 런타임에서 직접 동작하지 않는다. 런타임을 추가했다고 가정하지 않고 소재·효과의 재현 가능성, 원본 라이선스, 기존 엔진 경계를 검토한 뒤 별도 변경으로 연결한다. 한국 교실·편의점·한옥·한글 간판 등 번들에 없는 소재는 기존 CC0/자체 제작 카탈로그로 보완한다.

이 문서는 구매 자산의 조사·적용 설계이며 운영 배포 완료 기록이 아니다. 커밋·PR·병합·배포 상태와 실제 제공 수는 최종 변경 및 배포 증거로 별도 보고한다.

## 구현 브랜치 검증과 운영 전환 조건

2026-10-28 최종 구현 상태에서 `pnpm test:creator-bundle-rights`는 Node 153개와 Vitest 9파일 139개, Python 렌더 파이프라인은 26개가 통과했다. 별도 SQLite/OPFS·Web/API canonical·프로젝트 archive 관련 8파일 162개, 마지막 parser/source-match 관련 3파일 46개가 통과했다. 가상 장소의 이동·충돌·작업대 관련 48개도 통과했다. 중복 실행한 테스트 수는 합산하지 않는다.

`pnpm validate:architecture`, 하네스 구조 검사, lockfile 검증, 라이선스 감사가 통과했다. creator 루트 파일은 2506/2506, source-size 위반은 0개이며 Studio eager graph는 19.18MiB/최대 19.34MiB다. 이전 첫 구현을 대상으로 오래 실행하던 타입 검사는 변경 범위 확장 후 종료했고, 최종 상태의 `pnpm harness:verify`는 새로 시작했다. 그 명령의 종료 전에는 전체 통과로 집계하지 않는다.

필수 보안 감사에서 기존 전이 의존성 `qs 6.16.0`의 공식 수정판 6.16.1만 적용하고 공개 PoC·API Express 소비·기존 직렬화 호환을 검증했다. `deepmerge 4.3.1`의 GHSA-gcqx-w48m-w2h4는 공식 수정 릴리스가 없고 보안 감사가 low 1건으로 실패한다. 감사 제외·검증 우회·임의 대체 의존성은 추가하지 않았다. 이 변경과 별개로 원격 main `40179e94698323384e4804bad4a4ef473abc3794`의 필수 core/verify는 GitHub 계정 결제/사용 한도 문제로 job 자체가 시작되지 않은 상태다. 이 조건들을 해결하지 않고 병합·배포하지 않는다.

이번 출처 보존은 API canonical 계약에도 optional 필드를 추가한다. 운영 전환 시 검증된 API 이미지를 먼저 반영하고 새 Web을 이어서 반영해, 기존 서버가 새 출처 필드를 거부하지 않게 해야 한다. DB migration·환경변수 변경은 필요하지 않다. onpod API 이미지 교체는 [인프라 지도 3절](../operations/infrastructure-map.md#3-승인과-정책-위치)의 별도 명시 승인 대상이며, 현재 작업에서 운영 이미지를 교체하지 않았다.

일반 변형·필터처럼 원본 바이트를 유지하는 편집은 출처를 보존한다. 픽셀을 굳혀 이미지 바이트가 달라진 문서도 저장·재열기를 허용하고 원래 출처를 기록하지만, 원본과 다른 바이트를 같은 해시로 간주하지 않으므로 게시 권리 투영은 `unknown`으로 닫힌다. 새 바이트의 파생 관계를 입증하는 별도 계약은 아직 구현하지 않았다.
