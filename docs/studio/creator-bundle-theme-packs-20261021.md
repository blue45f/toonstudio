# Creator Bundle 테마 팩 — bg3d 제품 배선 (2026-10-21)

상태: current (배포 경로는 migration — 아래 "배포" 절). 대상 표면은 bg3d 에셋 라이브러리와, 같은 권리 원장에 잇는 2D 렌더 이미지 경로(`bundle-renders-v1`, 아래 「렌더 이미지 경로의 권리 연동」)뿐이며 그리기·셰이퍼 등 무관한 표면은 건드리지 않는다.

2026-10-22 정정: 생성기의 배치 가능 판정이 런타임 검증기의 external-resource-uri
거부(buffers/images의 uri 속성)를 반영하지 않아, 외부 텍스처를 참조하는 Godot판
모듈 GLB 9,362개가 배치 가능으로 과대 집계돼 있었다. 생성기에 같은 판정을 넣고
theme-packs.json을 재생성해 배치 가능은 5,303개로, 보류(deferred)는 11,721개로
정정했다. 외부 참조 GLB는 텍스처 임베드 재익스포트가 끝나야 편입할 수 있다.

2026-10-22 정정 2 (권리 게이트): 구매 번들의 서빙 판정을 코드 상수가 아니라 팩별 권리 원장
(`config/creator-bundle-pack-rights.json`)으로 옮겼다. 원장의 기본값은 hold이고, 증빙이 없는
팩은 allow가 될 수 없다. 생성기와 배포 플래너가 같은 원장을 따라 fail-closed로 닫힌다
("팩별 권리 원장" 절). Worker는 원장을 읽지 않고 R2에 올라간 객체를 동일 출처 가드로만 제한한다
("배포" 절). 이 문서의 배치 가능 13,597개(아래 정정 3)는 **원장 이전 스냅샷**이며, 원장을 적용해
theme-packs.json을 재생성하면 허용된 팩만 남는다(아래 "재생성"). 어떤 팩을 열지는 증빙 제출 뒤
저장소 소유자가 정한다.

2026-10-22 정정 3 (5라운드 종결·텍스처 임베드 병합): 인제스션 팩 id가 재부여돼 생성기의 매핑 표를 새 id로 바꾸고
임베드 병합 GLB 8,031개를 반영해 다시 생성했다(커밋 `3344060fa`). 커밋된 theme-packs.json은 이제 팩 42 · 배치 가능
13,597 · 프리셋 9 · 군중 GLB 1,215 · 보류 3,885다. 위 정정의 5,303개·11,721개는 그 이전 시점의 기록이다.

## 구조

- 데이터: `apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json`
  - `scripts/generate-creator-bundle-theme-packs.mjs`가 인제스션 매니페스트 v2
    (`toonstudio.asset-bundle.v2`)와 권리 원장에서 생성한다. 수신 완료·런타임 가능(GLB)이고
    **원장이 allow한** 에셋만 확정 데이터에 들어간다. 회수 중(부분 수신)·귀속 불확정 팩과
    원장 hold·미등록 팩은 `pendingPacks`로만 표기한다(원장 사유는 `reason: "rights-hold"`).
    회수가 끝나거나 원장이 allow로 바뀌면 재생성 한 번으로 편입된다.
  - 허용된 팩의 `packs[].rights`는 원장이 주는 팩별 권리 요약(`serve`, `status`, `licenseName`,
    `commercialUse`, `attributionRequired`)이다. 증빙 경로·사유 같은 내부 기록은 싣지 않는다.
  - 배치 가능 판정은 bg3d 모바일 검증 예산(바이트·노드·삼각형·드로우콜·머티리얼·
    텍스처·애니메이션·스킨)을 GLB 헤더 실측으로 적용한 결과다. 예산 초과·쌍둥이
    GLB 없음(FBX/glTF 단독)은 `deferred`로 집계해 패널에 사유와 함께 보여준다.
  - 프리빌트 프리셋은 단독 병합 GLB(스토어형 변형)만 쓴다. 데모 씬 파일
    (.unity/.tscn)은 런타임에서 읽을 수 없어 프리셋으로 만들지 않는다.
  - 배경 군중 캐릭터 팩은 배치 가능 에셋에 넣지 않고 `crowdPacks`(렌더 전용)로
    분리한다. 셰이퍼 마네킹과 혼합하지 않는다. Characters 1/2의 제작사는 RG Poly이고 id는
    공식 카탈로그의 `cbv1-003-cartoon-characters-1`·`cbv1-007-cartoon-characters-2`다
    (2026-10-22 정정: 생성기가 EmaceArt·`characters-N`으로 적고 있었다).
- 코드:
  - `studio-bg3d-bundle-theme-packs.ts` — 스키마·엄격 파서·캐시 로더·조회.
    파서는 `inServiceOnly: true`/`downloadable: false` 선언이 없거나 다운로드
    동선 필드(`downloadUrl` 등)가 있으면 데이터 전체를 거부한다. `packs[].rights`가 있으면
    `serve: "allow"`인 경우만 받아들인다.
  - `studio-bg3d-bundle-asset-loader.ts` — 배포 바이트 로더 + 검증 레코드 해석.
    검증 준비 함수(`prepareVerifiedBg3dModelRecord`)는 순환 import를 피하려고
    모델 라이브러리가 주입한다.
  - `StudioBg3dBundleThemePackPanel.tsx` — 테마/소품 그룹 칩, 검색, 프리셋,
    에셋 카드, 군중 렌더 전용 뷰, 준비 중 팩 표기. 기존 에셋 라이브러리 패널
    합성(`StudioBg3dAssetLibraryPanelWithPresets`)에 섹션으로 붙는다.
  - `bg3d-model-library.ts` — `getStoredBg3dModelV12`의 환경 팩 미스 분기가
    번들 해석으로 폴백하고, 해시 해석 2곳과 첨부 출처 판정
    (`resolveStudioBg3dModelAttachmentSource` → `"bundled"`)에도 번들을 편입했다.

## 팩별 권리 원장

- 위치·형식: `config/creator-bundle-pack-rights.json` (`toonstudio.creator-bundle-pack-rights.v1`).
  검증·조회는 `scripts/lib/creator-bundle-pack-rights.mjs`가 맡는다.
- 범위: 생성기의 팩 42 · 군중 팩 5 · 보류 팩 14, 모두 61개. 라이선스 문서 79개를 sha256 33종으로
  분류한 표(`licenseTexts`)와 팩별 항목(`packs`)을 가진다. zip 안에 든 사본 17개는
  `archivedFiles`에 따로 적는다.
- 판정: 항목마다 `serve`가 `hold`(기본) 또는 `allow`다. 원장에 없는 팩은 hold와 같다.
- allow 조건: 팩의 라이선스 분류가 요구하는 증빙을 전부 갖춰야 한다. 요구 표는 코드
  (`ALLOW_EVIDENCE_REQUIREMENTS`)에 있고 검증기와 서빙 판정이 같은 함수를 쓴다.

  | 분류 | allow에 필요한 증빙 |
  | --- | --- |
  | `cc0-explicit` | 번들 안 라이선스 문서(`local-license-file`) |
  | `cc0-text-copied` | itch 팩 페이지 캡처 |
  | `cc0-with-standalone-ban`, `proprietary-rg-poly` | 제작사 서면 확인 |
  | `unstated-rg-poly` | itch 팩 페이지 캡처 + 구매 영수증 |
  | `emaceart-local-license` | 구매 영수증 + 제작사 서면 확인 |
  | `unstated-emaceart` | itch 팩 페이지 캡처 + 구매 영수증 + 제작사 서면 확인 |

  제작사 서면 확인은 웹 서비스 안 서빙(`web-service-hosting`)을 다룰 때만 인정한다. 에이전트의 2차
  조회 기록(`secondary-lookup`)은 기록만 남고 어떤 요구도 채우지 못한다. 라이선스 문서 33종
  어느 것도 웹 서비스 호스팅·하위 사용자를 다루지 않는다.

  이 요구 표와 「`web-service-hosting` 한 가지만 다루면 서면 확인으로 인정한다」는 규칙은 **구현 기본값이며
  소유자 결정 대기**다. 서면 확인이 직접 URL 접근(Q2)·변환 파생 GLB(Q3)·유료 멤버십(Q4)·다수 사용자(Q5)까지
  다루는지는 코드가 판정하지 못하고 사람이 문서를 읽어 판단한다. 검토 보고(2026-10-22) §6.3의
  「itch 캡처 후 개방」 표현과 요구 표(예: Fences는 캡처 + 영수증 + 서면 확인)가 다른 부분도 소유자가 정한다.
- 증빙 검사의 한계: 이 게이트는 **형식·일관성 검사**이지 증빙의 진위 판정이 아니다. 거르는 것은 다음이다.
  - 필수 필드와 날짜: 달력에 있고 2013-01-01 이후이며 미래가 아닌 날짜(UTC+14의 오늘까지).
  - itch 주소(`url`): https의 `<제작자>.itch.io/<팩>` 팩 페이지나 `itch.io/b/<번호>/…` 번들 페이지만 받는다.
    닮은 도메인·`www`/`docs`/`api` 같은 서비스 하위 도메인·포트·자격 정보·원문과 정규형이 다른 표기(전각 점, `%2e`
    호스트)·공백/개행이 낀 값·400자 초과를 거부한다. 제작자 하위 도메인이 원장 항목의 제작사와 같은지는 보지 않는다.
  - 보관 위치(`ref`): 보이는 글자가 6자 미만(한글·한자·가나는 두 배로 센다)이거나 서로 다른 글자가 4개 미만이거나
    같은 조각의 반복이거나 글자(문자)가 하나도 없는 값(숫자·기호만 있는 번호는 파일명·폴더 이름을 함께 적게 한다), `TBD`·`TODO`
    같은 낱말이나 `추후`·`준비중` 같은 한글 어간이 든 값, 낱말이 전부 자리표시인 값(`not available`, `todo.pdf`처럼
    확장자만 붙인 것과 전각 표기 포함)을 거부한다. 그럴듯한 문장으로 쓴 거짓 값(`no receipt`)이나 키보드 연타 같은
    값은 형식만으로 가려내지 못한다.
  - 텍스트: 제어·서식 문자(영폭 공백·방향 지정 문자)와 줄/문단 구분자는 거부하고, 변이 선택자·결합 문자·사설 영역·미할당 문자·
    한글 채움 문자만 있는 값은 비었다고 본다. 거부 메시지는 문자 종류(`U+200B`)와 위치를 적는다.
  - `grant.licenseName`: 웹 로더가 조용히 버리는 이름(주소·비밀 낱말 패턴, 160자 초과)은 로더가 권리를 `unknown`으로 낮추므로
    게이트가 같은 규칙으로 먼저 거른다. NFKC 정규형이고 앞뒤·연속 공백이 없어야 한다. 패턴과 상한은 웹 소스와 같아야 하며
    테스트가 소스 텍스트와 대조한다.
  - 로컬 라이선스 문서: 그 해시로 기록된 자기 팩의 파일(`libraryPacks`)이어야 한다. 기록의 `libraryPath`·`member`는 라이브러리 안의
    정규형 상대 경로여야 하고(빈·`.`·`..` 조각, 역슬래시, 절대 경로 거부), `libraryPack`은 `libraryPath`의 팩 폴더
    (`<분류>/<팩>/…`의 두 번째 조각)와 같아야 한다. 라이브러리 팩 폴더를 둘 이상의 항목이 주장하는 것은
    `SHARED_LIBRARY_FOLDERS`(코드)에 올린 3곳(각 항목의 `mappingNote`가 설명)뿐이며, 새 공유는 코드 변경으로만 연다.
  - 키: 카탈로그 번호에 이음 문자(`+`)가 들어 있거나 문자열 배열이 아니면 어떤 팩과도 일치하지 않는다.

  영수증·캡처·서면 확인의 실물은 레포 밖이라 대조하지 않으며, 실물과 대조되는 증빙은 `local-license-file`(sha256)뿐이다.
  그래서 allow 전환은 항상 소유자가 직접 하는 원장 편집이고, 이 게이트는 실수·누락을 막는 안전장치다.
- 증빙 항목 형식(`evidence[]`): 모든 증빙은 `kind`와 `verifiedAt`(YYYY-MM-DD)을 가진다.
  `local-license-file`은 `sha256`·`paths`(zip 안 사본은 `<zip 경로>::<멤버>`), `itch-page-capture`는
  `url`(itch.io 주소)·`retrievedAt`(조회일)·`ref`(캡처 보관 위치), `purchase-receipt`는 `ref`,
  `producer-written-confirmation`은 `ref`·`covers`(`web-service-hosting` 포함)다. `secondary-lookup`은
  `claim`·`source`만 가진다.
- 묶음(`group`) 규칙: allow는 `pack`(배치 가능)과 `crowd`(렌더 전용 군중)만 의미가 있다. `pending`(미수신·보류)
  묶음은 생성기가 `serve`와 무관하게 `pendingPacks`로만 내보내므로 allow가 아무것도 열지 못하고, 검증기가
  pending 묶음의 allow를 거부한다. 수신·편입(`CATALOG_PACKS`)하면서 `group`을 `pack`으로 옮긴 뒤에야 판정 대상이다.
- 팩을 여는 절차(소유자): ① 증빙을 보관하고 `evidence`에 항목 추가 → ② `serve`를 `allow`로 바꾸고
  `holdReason`·`holdLabel`을 지우고 `grant`(`status`·`licenseName`·`commercialUse`·`attributionRequired`)를 추가 →
  ③ `pnpm run verify:creator-bundle-pack-rights`로 검증 → ④ 생성기 재실행과 장르 씬팩 연결 갱신 →
  ⑤ 플래너 `--dry-run`으로 제외·합계 확인 후 승인된 업로드 →
  ⑥ 시드 스냅샷 테스트의 `EXPECTED_ALLOWED_TITLES`(`scripts/creator-bundle-pack-rights.test.mjs`)와 Cute Dungeon·권고 hold
  같은 시드 사실 테스트를 같은 변경에서 갱신한다(팩을 여는 것은 소유자 결정이라 이 테스트들이 일부러 알려 준다).
- 시드(2026-10-22): 61개 전부 hold. Cute Dungeon Megapack은 요구 증빙(CC0 문서)을 이미 갖췄지만 미수신
  (`pending`) 묶음이라 편입 전에는 `serve`를 allow로 바꿔도 아무것도 열리지 않는다(`holdReason: pending-ingest`).
  검토 보고(2026-10-22)는 Restaurant·Medieval·Small Props를 서면 확인 전까지 제외하라고 권고했고(현재 커밋된
  스냅샷 기준 Restaurant는 외부 리소스 보류 1,023개, Medieval은 배치 가능 1,265개, Small Props는 배치 가능 342개), 원장은 이를 `reviewRecommendedHold`로 표시한다. 이 구분은 증빙 상태를 기록한
  것이며 개방·제외 확정은 소유자에게 있다.
- hold 팩의 사용자 노출 문구: 원장 hold 때문에 `pendingPacks`(`rights-hold`)로 가서 패널의 「준비 중인 팩」에 보이는
  `holdLabel`은 모든 hold 팩이 같은 중립 문장(`HOLD_PUBLIC_LABEL`)이다. 미수신 `pending` 묶음 14개의 화면 문구는
  생성기 `PENDING_PACKS`의 기존 사유(회수 상태 등 권리와 무관)가 정하고 그 팩들의 `holdLabel`은 화면에 쓰이지 않는다. 제작사 확인·증빙·충돌 같은 사유와 공개 약속은 쓰지 않고, 사유는 내부 필드
  `holdReason`에만 둔다.
- 상반된 라이선스 문서: 같은 팩 안에 서로 다른 라이선스 문서가 공존하는 팩 11개(LumaGrove, Rocks and Stone,
  TerraToon, CosmoKit, Cemetery Statues, Voxel Summer, Raft on the Desert, Swamp Builder, Iowa Covered Bridges,
  Winter Atolls, Low Poly Food Packaging)는 `mappingNote`에 상충을 적었다. 팩 폴더의 LICENSE와
  `Blend Textures.zip` 안 LICENSE(「앱에 포함해 배포」 명시)의 우선순위는 제작사 서면 확인 대상이다.
- 팩 귀속 주의: 인제스션 id의 원본 파일이 라이브러리에서 다른 팩 폴더로 분류된 팩 5개(Asia Megapack,
  NecroPOLY, Fences and Walls, PixelDrift Metro FREE, Low Poly Tiny Forest)는 두 경로의 증빙을
  합쳐 기록하고 항목의 `mappingNote`에 이유를 적었다. 소유자 확인이 필요하다.
- 증빙 재검증: `pnpm run verify:creator-bundle-pack-rights -- --library-root <라이브러리 루트>`가 원장
  검증, 팩별 부족 증빙 요약, 로컬 라이선스 문서 해시 재대조를 한다.

## 렌더 이미지 경로(bundle-renders-v1)의 권리 연동

2D 렌더 이미지 경로(`apps/web/public/assets/studio/bundle-renders-v1/manifest.json` → `studio-bundle-asset-delivery.ts`)도 같은 원장을 따른다. 이 매니페스트는 슬롯마다 `license`를 스스로 선언하지만 전달 여부와 권리 표기는 선언이 아니라 원장이 정한다. 슬롯의 `derivedFromPack`(공식 81팩 번호)을 원장의 `catalogIds`·`officialCatalogIds`로 조회하고(`findPackRightsByCatalogId` — 한 항목으로 특정되지 않으면 원장에 없는 팩이라 hold), 완성 슬롯(`curationStatus`가 `draft`로 시작하지 않는 슬롯)은 그 팩이 allow이고 증빙·grant·묶음 자격을 채웠을 때(`evaluateServeDecision`)만 전달 대상이다. 웹 로더는 원장을 읽지 않으므로(3D 경로의 `packs[].rights`와 같은 방식) 전달 대상 슬롯에는 `pnpm run sync:creator-bundle-render-rights`가 원장 투영(`packRightsProjection`)에 `ledgerPackId`를 더한 `rights` 블록을 싣고, 로더는 이 블록이 없는 완성 슬롯을 초안처럼 건너뛴다(블록이 있는데 형식이 잘못되면 던지고, 모르는 키는 무시한다). 캔버스 레코드의 라이선스 이름도 이 블록에서 오고, 매니페스트의 `license.id`는 표시용 선언일 뿐이다. `pnpm run verify:creator-bundle-render-rights`(CI 사전 점검 단계)는 닫힌 팩에서 파생한 슬롯이 완성 상태이거나, 블록이 없거나 원장 투영과 다르거나, `license.provider`가 원장 제작사와 다르거나, 경로가 자기 슬롯 폴더를 벗어나거나, 전달 대상이 아닌 파일(닫힌 팩·초안·참조 없는 이미지, 심볼릭 링크)이 공개 폴더에 있으면 실패한다 — 이 폴더는 빌드 때 그대로 공개되므로 매니페스트가 걸러도 이미지 파일이 있으면 서빙되기 때문이고, 파일 목록은 스파스 체크아웃에서도 전체가 보이는 `git ls-files`를 기준으로 한다. 시험(`scripts/creator-bundle-render-rights*.test.mjs`, `studio-bundle-asset-delivery.test.ts`)은 필수 회귀 목록에 있으며, CI 판정과 로더가 같은 슬롯을 전달하는지를 변조 입력 모음으로 대조한다. 시드(2026-10-22)의 4개 슬롯은 모두 초안이고 그 팩들이 hold라 아무것도 전달되지 않는다. 팩을 연 뒤의 순서는 ① 슬롯을 완성으로 올리고 이미지를 넣는다 → ② `sync:creator-bundle-render-rights`로 스탬프한다 → ③ `verify:creator-bundle-render-rights`로 확인한다.

한계: 로더가 믿는 것은 스탬프된 블록이라 진위는 CI의 대조가 지킨다(손으로 고친 블록은 CI에서 걸리지만 로더는 알아보지 못한다). allow는 팩 단위 판정이라 렌더 이미지만 따로 허용하는 구분이 없고, 슬롯이 실제로 그 팩의 모델에서 렌더됐는지와 미리보기 이미지가 바뀌지 않았는지는 코드가 판정하지 못한다(한 슬롯은 한 팩에서만 파생한다고 선언한다). `.gitignore`에 걸리는 이름(`__tmp*`)의 파일은 git이 못 보지만 로컬 빌드는 복사하므로, 배포 직전 빌드 산출물에 `--pack-dir <dist>/assets/studio/bundle-renders-v1 --files fs`로 같은 점검을 돌려야 완전하다(배포 도구에는 아직 연결하지 않았다). 권리를 거둔 뒤(allow → hold)에는 점검이 슬롯을 초안으로 내리고 블록·이미지를 지우도록 막지만, 이미 배포된 이미지는 정적 호스팅에서 소유자가 지워야 한다. 서비스 워커는 이 매니페스트를 캐시하지 않고(`passthrough`, 응답 헤더도 `no-cache`) 철회가 설치된 클라이언트에 바로 닿는다. 이미지는 immutable이라 캐시에 남을 수 있지만 매니페스트가 가리키지 않는 슬롯은 요청되지 않는다.

## 라이선스 구조 (서비스 안에서만 사용)

- 에셋 파일 다운로드/내보내기 경로는 신설하지 않는다. 패널에는 추가(배치)
  동선만 있고, 장면은 에셋 id·콘텐츠 해시 참조로 저장된다. 밖으로 나가는 것은
  렌더된 이미지뿐이다.
- 레코드 권리는 팩별이다. 로더는 `packs[].rights`를 `StudioBg3dAttachmentRights`로 옮기고
  (`status`는 `licensed` 또는 `public-domain`, 라이선스명은 팩별), `rights`가 없는 팩(원장 이전
  스냅샷 데이터)은 `unknown`·`commercialUse: false`로 닫는다. 예전의 전 팩 일괄
  `licensed / commercialUse: true` 상수는 없앴다. (2D 렌더 이미지 경로는 `rights` 블록이 없는 완성 슬롯을 unknown으로 낮추지 않고 전달하지 않는다.)
- GLB 실파일은 매니페스트 v2 서빙 루트(`/assets/studio/bundle-v2/`)에서 참조로 서빙된다. 다포맷 설계의
  매니페스트 v2 디스크립터(`studio-bundle-manifest-v2.ts`)는 아직 원본 경로형 URL을 만들어 sha256 서빙과 맞지
  않는다(프로덕션 소비자가 없고 테스트에서만 쓴다). 소비 경로로 연결할 때 별도 정합이 필요하다.

## 재생성

실행 위치는 레포 루트다. 전제: 인제스션 v2 산출(`manifest-v2.json`과 그 파일 트리)이
로컬에 있어야 한다. 부작용은 출력 파일 1개 교체뿐이며 `--dry-run`으로 쓰지 않고
집계만 확인할 수 있다.

```bash
node scripts/generate-creator-bundle-theme-packs.mjs \
  --manifest-v2 <manifest-v2.json 경로> \
  [--asset-root <파일 트리 루트>] \
  [--themes <bundle-v1 manifest 경로>] \
  [--out <출력 경로>] \
  [--pack-rights <권리 원장 경로>] [--dry-run]
```

`--asset-root` 기본값은 `manifest-v2.json`이 있는 폴더, `--themes`와 `--out`의
기본값은 각각 bundle-v1 `manifest.json`과 같은 폴더의 `theme-packs.json`,
`--pack-rights`의 기본값은 `config/creator-bundle-pack-rights.json`이다.
생성기는 실물 파일의 sha256을 전수 대조해 매니페스트와 어긋나는 에셋을 제외하고,
그 건수를 실행 로그에 남긴다. 원장이 팩 정의를 덮지 못하거나 증빙 없는 allow가 있으면 아무것도
쓰지 않고 종료 코드 2로 닫는다.

원장을 적용한 재생성은 팩 순서를 바꾼다. `packIndex`로 팩을 가리키는 장르 씬팩 연결
(`studio-bg3d-genre-scene-pack-links.ts`)과 그 대조 테스트(배치 가능 13,597 · 연결 합계 1,740)는
같은 변경에서 갱신해야 한다. 이 변경에서는 소유자 트리가 필요한 실데이터 재생성을 하지 않았으므로
커밋된 theme-packs.json은 원장 이전 스냅샷이다(Characters 1/2의 제작사·id만 정정).

시드 상태(61개 전부 hold) 그대로 재생성하면 `packs`·`assets`가 비어 배치 가능이 0이 된다. 재생성은 소유자가
팩을 allow로 연 뒤에야 의미가 있다. 재생성 전에는 업로드하지 않는다(theme-packs가 원장보다 오래되면 플래너가
`--production`을 거부한다). 또한 커밋된 스냅샷은 그때까지 원장이 hold로 둔 팩의 원본 경로와 sha256을 공개 JSON으로
계속 열거한다 — 키를 불투명하게 해도 목록 자체는 공개 데이터에 있다.

## 배포 (bundle-v2 → R2) — migration (2026-10-22 레포 측 완성, 실배포는 소유자 실행 대기)

- 서빙 경로: `/assets/studio/bundle-v2/<sha256>.glb`. 실물은 레포·
  Static Assets가 아니라 R2 버킷 `toonspectrum-public-assets`에만 두고,
  Cloudflare Static Worker가 바인딩(`LARGE_ASSETS`)으로 서빙한다
  (`deploy/cloudflare-static/src/large-static-assets.ts`의 bundle-v2
  디스크립터 + `wrangler.jsonc`의 run_worker_first `/assets/studio/bundle-v2/*`).
- 키는 에셋 sha256의 내용 주소 키다. 원본 폴더·파일명이 URL에 들어가지 않고, 같은 바이트는 한
  객체로 합쳐지며, 내용이 바뀌면 키가 바뀌므로 immutable 1년 캐시가 안전하다. theme-packs.json이
  sha256을 공개하므로 키는 공개 데이터에서 계산된다. 불투명 키는 URL 추측·열거를 어렵게 하는
  핫링크 억제책일 뿐 법적 허락이 아니다. 키 방식 확정은 첫 업로드 전에만 비용이 0이라 소유자
  결정 대기 항목이다. 현재 구현은 sha256 키와 동일 출처 가드가 유일한 방식이며, 되돌리려면 로더·플래너·Worker·
  테스트를 함께 바꿔야 한다. Worker는 소문자 hex 64자 키(`<sha256>.glb`)만 서빙하므로, 원본 경로 키로
  올라간 객체가 R2에 남아 있어도 열리지 않는다(경로형 GLB 요청은 대형 에셋 파이프라인에 매칭되지 않는다).
- Worker 가드: bundle-v2 경로(GLB와 배포 인덱스)에만 교차 출처 CORS를 열지 않는다. 브라우저가
  보낸 `Sec-Fetch-Site`가 `same-origin`이 아니면(`same-site`·`cross-site`·`none` 포함) R2에 닿기
  전에 403 `BUNDLE_ASSET_SAME_ORIGIN_ONLY`로 거부하고, 헤더가 없는 호출(curl·구형 브라우저)은
  허용한다. 응답은 `access-control-allow-origin`을 달지 않고 `Vary: Sec-Fetch-Site`를 붙인다.
  R2에 객체가 없으면 `LARGE_ASSET_ORIGIN` 폴백으로 넘기지 않고 `503 LARGE_ASSET_UNAVAILABLE`로 닫아, 폴백
  원본의 CORS 헤더가 가드 계약을 깨지 못하게 한다. 다른 R2 경로(wasm·onnx·CC0 GLB·투어 영상)의 응답은
  그대로다. 접근 통제가 아니라 브라우저 경유 핫링크·임베드·주소창 직접 열기를 막는 억제책이며,
  헤더를 생략하는 클라이언트는 막지 못한다 — 올라간 팩의 바이트는 사실상 공개라고 보아야 한다. 권리 원장은
  Worker가 아니라 업로드 단계(플래너)에서만 강제된다(bundle-v2 GLB 경로 한정 — 렌더 이미지 경로는 커밋 단계의 `verify:creator-bundle-render-rights`가 강제한다).
- 플래너는 권리 원장에서 allow인 배치 가능 팩(`group: pack`)의 에셋만 계획에 넣는다. hold·미등록 팩, 묶음·제목·
  제작사가 원장과 다른 팩, theme-packs의 `ingestPackIds`가 생성기 팩 정의(`CATALOG_PACKS`)의 인제스션 폴더와 다른
  팩(`ingest-mismatch`), 권리 블록이 원장 투영과 다르거나 없는 팩(`rights-drift`)의 에셋은 실물을 읽지 않고
  제외하며, 제외 에셋이 생기면(theme-packs가 원장보다 오래됨) 경고하고 `--production`을 거부한다. 허용된 에셋이
  하나도 없으면 `--write`·`--production`을 거부한다(종료 코드 1, 매니페스트·업로드 없음). 에셋 경로는 에셋 루트 상대
  경로여야 하고 소속 팩의 `ingestPackIds` 폴더 아래여야 하며(로더와 같은 규칙), 파일 점검은 다음을 본다.
  - 경로가 속한 인제스션 폴더는 에셋 루트 바로 아래의 실제 디렉터리여야 한다(`allowed -> held` 같은 폴더 링크 거부).
  - 심볼릭 링크를 해석한 실제 파일은 그 팩의 인제스션 폴더들 중 하나 안의 일반 파일이어야 한다. 같은 팩의 다른 폴더로
    가는 링크는 허용하고, 다른 팩 폴더·이름이 접두사로 겹치는 형제 폴더·루트 밖·폴더 자신을 가리키는 링크는 거부한다.
  - 생성기 팩 정의의 인제스션 폴더가 서로 겹치면(같은 폴더, 상위·하위, 대소문자·유니코드 정규화만 다른 이름) 파일의
    팩 귀속이 모호하므로 계획 자체를 만들지 않는다. 실제 정의 42개는 서로소다.
  - 하드 링크는 경로로 구분할 수 없다. 내용은 sha256·크기·GLB 헤더로 고정되고 트리 자체는 소유자의 것이라 신뢰한다.
    다른 사람이 쓸 수 있는 트리에서 업로드를 실행하지 않는다.
- 객체 목록 기록: `deploy/cloudflare-static/bundle-v2-deploy-manifest.json`은 2026-10-22 산출
  스냅샷(GLB 13,597개·8,644,055,380바이트 + 배포 인덱스 1개 = 13,598객체·8,644,055,541바이트, 커밋 `3344060fa`가
  원장 이전 계획기로 만들었다)이며 원본 경로 키·hold 팩 객체를 포함하는 **원장 이전 기록**이다. 업로드의 입력이
  아니므로(업로드는 실행 때마다 새 계획을 만든다) 재생성 전까지 참고용으로만 쓴다. 이 기록의 키로는 Worker가
  아무것도 서빙하지 않고, 현재 계획기는 허용된 팩이 없으면 객체를 0개로 계획해 `--write`·`--production`을 거부한다.
  `scripts/plan-creator-bundle-deploy.mjs`가 theme-packs와 실물 트리를 전수 대조(실재·바이트·sha256·
  외부 uri 게이트)해 재생성한다. GLB 중 1개(35.5MiB 프리셋)가 Static Assets 파일 상한(25MiB)을
  넘는 것도 R2 단일 경로를 택한 이유다.
- 완료 신호: 배포 인덱스 `assets/studio/bundle-v2/manifest.json`은 업로드
  마지막 객체로만 올라간다. 패널은 이 인덱스의 files/bytes 합계가 테마 팩
  데이터와 맞을 때만 배치를 열고, 아니면 "배포 미완료" 빈 상태를 보여준다.
  인덱스는 `keyScheme: "sha256"`·`objects`·`objectBytes`도 싣는다.
- 실행 (승인 주체: 저장소 소유자, 입력: 인제스션 v2 산출 트리가 있는 기기와
  wrangler 로그인):

```bash
# 1) 계획 검증 (쓰기·업로드 없음)
pnpm run plan:creator-bundle-deploy -- --asset-root <output-v2 트리>
# 2) 매니페스트 재생성 (theme-packs가 바뀌었을 때만)
pnpm run write:creator-bundle-deploy-manifest -- --asset-root <output-v2 트리>
# 3) 정적 웹 배포로 Worker 경로를 먼저 반영한 뒤 (deploy-cloudflare-static 절차)
# 4) 실업로드 (GLB → 인덱스 순서, 중단 시 같은 명령 재실행으로 이어감)
pnpm run deploy:creator-bundle-assets -- --asset-root <output-v2 트리>
```

- 성공 기준: 업로드 완료 로그 + 패널에서 배포 상태가 "가능"으로 바뀌고 임의
  에셋 1개가 장면에 배치되는 것. 실패 시: 인덱스가 없거나 합계가 어긋나거나 키 방식(`keyScheme`)이 sha256이
  아니면 패널은 자동으로 미배포 상태로 남는다 (부분 업로드·옛 방식 인덱스가 배치 가능으로 오인되지 않는다).
  패널을 닫는 롤백은 인덱스 객체 삭제만으로 된다. 서비스 워커가 인덱스를 영구 캐시하면 이 신호가 사용자에게
  닿지 않으므로 `studio-service-worker-policy.ts`가 인덱스를 `passthrough`(캐시하지 않음)로 분류한다. sha256 키
  GLB는 내용 주소라 `/assets/` immutable 규칙 그대로 둔다.
- 권리 철회(allow → hold)는 인덱스 삭제로 끝나지 않는다. Worker는 인덱스와 무관하게 `<sha256>.glb` 키를 직접
  서빙하므로, 이미 올라간 팩의 권리를 철회하면 해당 R2 객체를 소유자가 직접 삭제해야 한다. 삭제 대상 키는 그
  팩의 `assets[].sha256`로 계산한 `assets/studio/bundle-v2/<sha256>.glb`이고, 재생성 전 theme-packs.json
  스냅샷에서 구한다(서비스 워커·브라우저에 이미 캐시된 사본은 만료되기 전까지 남는다). 플래너는 R2 객체를
  지우지 않으며 이 변경도 삭제 기능을 두지 않았다.
- 배포 후 스모크(Worker 반영 뒤): `Sec-Fetch-Site: cross-site`로 GLB를 요청해 403,
  헤더 없이 요청해 200(ACAO 없음, `Vary: Sec-Fetch-Site` 있음)임을 확인한다.

## 소유자 결정 대기 (이 변경이 정하지 않는 것)

- 제작사 서면 확인 발송 여부와 내용(Q1 웹 서비스 안 GLB 서빙, Q2 직접 URL 접근이 독립 파일
  재배포인지, Q3 변환·WebP 파생 GLB 호스팅, Q4 유료 멤버십 포함, Q5 다수 사용자).
- itch 번들 영수증·약관, 팩 페이지 캡처(조회일 포함) 제공.
- allow 요구 증빙 표(분류별)와 서면 확인 인정 범위(현재 `web-service-hosting` 한 가지). 질문서 초안 작성과 발송.
- hold 팩 최종 확정. 권고는 Restaurant(보류 1,023) · Medieval(배치 가능 1,265) · Small Props(배치 가능 342)를 서면 확인 전까지
  제외하는 것이다.
- R2 키 불투명화 최종 확정, 텍스처 교정 범위와 손실 허용선, theme-packs 캐시 정책, 번들 총량 상한.
- 렌더 이미지(파생물)에만 적용되는 허용 구분이 필요한지(지금은 팩 단위 allow가 렌더 전달의 필요조건이다), 렌더의 출처 모델 해시(`sourceModelSha256`)를 팩과 대조하는 장치를 둘지, 배포 직전 산출물 점검을 배포 도구에 연결할지.
- `ASSET-INVENTORY.md` §3 정책 개정(제안만 기록됨)과 `THIRD_PARTY_NOTICES`의 번들 항목(§3.2 결정 뒤 작업).
