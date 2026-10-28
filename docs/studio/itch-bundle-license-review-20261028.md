# itch.io 구매 번들 서비스 활용 권리 확인 — 2026-10-28

상태: **current** — 팩별 권리 원장과 공개 라이선스 증빙의 판정이다. 원본 수신·변환, 화면 연결, 정적 산출물 배포와 운영 스모크는 별도 검증이며 이 문서의 allow만으로 완료되지 않는다.

## 승인과 확인 범위

저장소 소유자가 2026-10-28 대화에서 구매한 번들의 다운로드 상태를 확인하고, 활용 방법을 계획·설계해 서비스에 최대한 적용하도록 요청했다. 이 요청에 따라 공식 판매 페이지에서 CC0가 확인되고 기존 증빙 게이트를 충족한 팩의 서비스 활용을 원장에서 연다. 1차 판정은 10개였으며, 같은 날짜의 후속 대조로 Cute Graveyard와 Medieval Weapons를 추가했다. 추가 활용 감사에서 Cargo·차량과 한 행에 묶였던 Blue Base·Cartoon Car Megapack·Cartoon Cars 2·Army Pack을 정식 팩 ID로 분리해 **현재 16개**다. 게이트의 요구 증빙 표나 분류 기준은 바꾸지 않는다.

공개 라이선스는 로그인 쿠키 없이 판매자의 팩 페이지를 직접 조회했다. [공개 증빙 목록](../evidence/itch-licenses-20261028/index.json)에 원장 팩 ID, URL, 조회일, 보관 경로, 바이트 수와 SHA-256을 기록했다. HTML 파일은 실제 응답에서 제목과 라이선스 표 행 또는 CC0 본문 부분만 그대로 발췌한 것이다. 외부 원문의 증빙이라 HTML 안 영어 문구는 번역하지 않고 보존한다. 전체 페이지의 요청별 익명 CSRF 값과 판매 설명·댓글은 보관하지 않으며, SHA-256은 보관된 발췌 파일을 대상으로 한다.

구매 사실은 로그인된 소유자의 구매 목록과 Creator Bundle: Volume 1 구매 확인 화면에서 별도로 대조했다. 비공개 확인 기록은 로컬 전용 `local-private:itch-purchase-library-observation-20261028`로 참조한다. 구매 링크·다운로드 권한 토큰·계정 이메일·결제 정보는 저장소에 넣지 않는다. 코드의 ref 검증은 보관 위치의 형식만 검사하므로 구매 기록의 실물 확인을 대신하지 않는다.

## 원장 판정

[팩별 권리 원장](../../config/creator-bundle-pack-rights.json)의 `defaultServe`는 계속 `hold`다. 현재 연 팩은 다음 16개이며, `grant`는 `public-domain / CC0-1.0 / commercialUse: true / attributionRequired: false`다. 표의 처음 10개는 1차 판정, 다음 2개는 첫 후속 대조, 마지막 4개는 결합 보류 행을 팩별로 분리한 추가 활용 결과다.

| 팩 | 원장 분류 | 새로 보관한 공개 근거 | 판정에 사용한 증빙 |
| --- | --- | --- | --- |
| Cartoon City Massive Pack | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/cartoon-city-massive-pack1), [HTML](../evidence/itch-licenses-20261028/cartoon-city.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Nature Megapack - Extended | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/nature-megapack-low-poly-refreshed-unity-urp), [HTML](../evidence/itch-licenses-20261028/nature-extended.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Farm Land | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/farmland), [HTML](../evidence/itch-licenses-20261028/farmland.html) | 팩 본문 CC0 표기 + 구매 확인 |
| Pirate Island | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/pirate-island), [HTML](../evidence/itch-licenses-20261028/pirate-island.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Aztec Jungle | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/aztec-jungle-megapack-low-poly-refreshed-unity-urp), [HTML](../evidence/itch-licenses-20261028/aztec-jungle.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Food Pack | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/food-pack), [HTML](../evidence/itch-licenses-20261028/food-pack.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Characters 1 | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/cartoon-city-massive-pack-characters), [HTML](../evidence/itch-licenses-20261028/characters-1.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Characters 2 | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/characters-2), [HTML](../evidence/itch-licenses-20261028/characters-2.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Cute Park Pack | `cc0-text-copied` | [공식 페이지](https://rg-poly.itch.io/cute-park-pack), [HTML](../evidence/itch-licenses-20261028/cute-park.html) | 로컬 문서의 팩 제목 불일치를 공식 팩 페이지 CC0 표기로 대조 |
| Cute Dungeon Megapack | `cc0-explicit` | [공식 페이지](https://rg-poly.itch.io/cute-dungeon-megapack), [HTML](../evidence/itch-licenses-20261028/cute-dungeon.html) | 기존 팩 내부 CC0 문서 해시 재검증 + 공식 팩 페이지 대조 |
| Cute Graveyard — 추가 | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/cute-graveyard-hallowen-pack), [HTML](../evidence/itch-licenses-20261028/cute-graveyard.html) | 팩 페이지 CC0 표기 + 구매 확인 + 자기완결 GLB 253개 대조 |
| Medieval Weapons — 추가 | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/medieval-weapons-small-low-poly-pack), [HTML](../evidence/itch-licenses-20261028/medieval-weapons.html) | 팩 본문 CC0 표기 + 구매 확인 + 원본 수신 기록·공식 파일명·모델 수 대조 |
| Sci-Fi Arena: Blue Base — 분리 추가 | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/sci-fi-arena-blue-base), [HTML](../evidence/itch-licenses-20261028/sci-fi-blue-base.html) | 팩 본문 CC0 표기 + 구매·SC 1.zip 수신 귀속 + 자기완결 GLB 114개 |
| Cartoon Car Megapack — 분리 추가 | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/cartoon-car-megapack), [HTML](../evidence/itch-licenses-20261028/cartoon-car-megapack.html) | 판매자 라이선스 표의 CC0 + 구매·Cars Megapack.zip 수신 귀속 + 자기완결 GLB 180개 |
| Cartoon Cars 2 — 분리 추가 | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/cars-2-low-poly-cute), [HTML](../evidence/itch-licenses-20261028/cartoon-cars-2.html) | 판매자 라이선스 표의 CC0 + 구매·Cars 2 수신 귀속 + 공식 453모델과 native GLB 453개 일치 |
| Army Pack — 분리 추가 | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/army-pack-cute-series), [HTML](../evidence/itch-licenses-20261028/army-pack.html) | 팩 본문 CC0 표기 + 구매·Army Pack.zip 수신 귀속 + 자기완결 GLB 309개 |

CC0는 상업 목적의 복제·수정·배포를 허용한다. [Creative Commons 공식 설명](https://creativecommons.org/publicdomain/zero/1.0/)을 기준으로 위 팩의 렌더 이미지, 투명 소품, 가상 스튜디오 시각 자산에 같은 권리 판정을 적용한다. 기존 서비스의 원본 파일 다운로드 제한과 팩별 해시·경로 검증은 유지한다.

Cute Park와 Cute Dungeon은 1차 판정에서, Cute Graveyard는 후속 대조에서 원장의 `pending`에서 `pack`으로 옮겼다. 원본·텍스처 실물을 확인한 뒤 수신 팩으로 편입하기 위한 판정이다. 변환된 모델의 무결성·텍스처·실제 화면 사용 여부는 생성기와 소비자 검증 결과로 별도 판정한다.

Weapons의 귀속은 폴더 이름만으로 추정하지 않았다. 로컬 `_catalog/SOURCES.tsv`는 `Weapons`를 `02-medieval-fantasy/free-medieval-weapons-small-low-poly-pack/models/mixed`에 `clone`으로 기록하고, `Weapons.zip`을 같은 폴더의 동일 콘텐츠 원본으로 기록한다. 원본 압축파일의 기록 크기는 44,366,722바이트(약 42.31MiB)로 공식 판매파일 `Weapons.zip`의 42MB 표기와 크기 범위가 부합하고, 공식 본문의 모델 32개와 실제 GLB 32개도 일치한다. 해당 GLB는 모두 메시·이미지·재질을 내장하며 외부 URI가 없고, 이 팩 안에는 상충하는 별도 라이선스 문서가 발견되지 않았다. Small Props의 상충 라이선스를 Weapons에 대신 적용하거나 반대로 Weapons의 CC0를 Small Props에 적용하지 않는다.

추가 2개 팩은 합계 GLB 285개를 전수 검사했다(Cute Graveyard 253, Weapons 32). 모두 GLB 헤더·청크·외부 URI 검사를 통과하고 이미지와 재질을 내장했다. 이 기술 대조는 렌더 산출물의 시각 품질 검수를 대신하지 않는다.

추가 활용 4팩은 공식 구매 목록 85개에서 공개 URL과 로컬 팩이 일대일로 명시된 항목을 확인하고, `_catalog/SOURCES.tsv`의 원본 수신 기록과 팩 전체의 조건 문서를 대조했다. 다음 native 입력만 권리 행과 연결한다.

| 정식 catalog ID와 원장 ID | native GLB 경로(라이브러리 루트 상대) | 수신 귀속과 확인 범위 |
| --- | --- | --- |
| `cbv1-053-scifi-arena-blue-base` | `06-scifi/sci-fi-arena-blue-base/models/mixed/gLTF` | `SC 1`과 `SC 1.zip`이 같은 팩에 명시된다. ZIP 158,569,097바이트(약 151.22MiB)는 공식 `SC 1.zip` 151MB와 부합한다. GLB 114개가 자기완결이다. 공식 전체 모델 설명의 124개와 로컬 native GLB 114개를 같은 수로 표현하지 않으며, 확인한 114개만 편입한다. |
| `cbv1-081-cartoon-car-megapack` | `20-vehicles/cartoon-car-megapack/models/mixed/gLTF` | `cARS`와 `Cars Megapack.zip`이 같은 팩에 명시된다. ZIP 437,616,693바이트(약 417.34MiB)는 공식 417MB와 부합한다. GLB 180개만 대상으로 하며 중간 신뢰도의 별도 `Free` 폴더는 제외한다. |
| `cbv1-017-cartoon-cars-2` | `20-vehicles/cartoon-cars-2/models/mixed/Gltf` | `Cars 2`·`Cars.zip` native 수신 기록과 공식 453모델이 일치한다. 별도 `Cars_2_Godot.zip` 60,925,362바이트(약 58.10MiB)도 공식 58MB와 부합하지만, 해당 Godot GLB 453개는 외부 텍스처 참조라 이 native 입력에서 제외한다. |
| `cbv1-018-army-pack` | `30-props/army-pack/models/mixed/gLTF` | `Army Pack 2`·`Army Pack.zip`이 같은 native 팩에 명시된다. ZIP 216,617,119바이트(약 206.58MiB)는 공식 206MB와 부합한다. 자기완결 GLB 309개만 대상으로 하며 Godot 변형 309개는 외부 참조라 제외한다. |

추가 활용 4팩의 native GLB **1,056개**를 전수 검사했다. 모두 GLB 헤더·청크·메시·이미지·재질·baseColorTexture가 확인됐고 외부 buffer/image URI가 없다. Blue Base와 Cartoon Car Megapack에는 별도 조건 문서가 없었고, Cars 2와 Army Pack의 Godot README는 모델·텍스처 연결 설명으로 상충 라이선스를 담지 않았다. 이 대조는 렌더 결과의 시각 검수·장면 사용 검증을 대신하지 않는다.

현재 원장 집계는 **65행, allow 16 / hold 49**, 묶음은 **pack 49 / crowd 5 / pending 11**다. 기존 결합 행 2개를 Cargo·Cars 1 보류 2행과 개방한 팩 4행으로 나눠 행 수가 늘었다. 과거 결합 ID나 다른 팩의 catalog ID를 재사용해 범위를 넓히지 않았고, 공식 catalog ID와 `libraryPacks`를 팩별로 한 owner에만 연결했다. 앞선 `allow 12 / hold 49`, `pack 45 / crowd 5 / pending 11` 및 1차의 `allow 10 / hold 51`과 2026-10-22의 `61개 전부 hold`는 각각 당시 상태다.

## hold를 유지하는 범위

Restaurant Megapack은 공식 팩 페이지의 CC0 메타데이터와 로컬 독자 라이선스 문구가 다르다. Medieval Village / Megapack과 Small Props Pack은 로컬 문서에 CC0와 독립 다운로드·재배포 금지가 함께 있다. 이 3개 팩의 `reviewRecommendedHold`와 제작사 서면 확인 요구를 유지한다. 공개 페이지의 메타데이터만으로 상충하는 로컬 문서를 지우거나 분류를 낮추지 않는다.

EmaceArt 팩의 개인·상업 프로젝트 사용 허용과 독립 파일 재배포 제한도 그대로 기록한다. [Harboria 공식 문구](https://emaceart.itch.io/harboria)는 자기 프로젝트에서의 사용을 허용하지만, 이 서비스의 다중 사용자 소재 제공·웹 호스팅을 별도로 다루지 않는다. 현행 원장이 요구하는 `web-service-hosting` 범위의 제작사 서면 확인을 새로 얻었다고 간주하지 않는다. 따라서 이번에 해당 팩의 hold를 해제하지 않는다.

제작사에 연락하거나 원본 파일을 외부로 업로드하는 행위는 이번 공개 페이지 조회에 포함하지 않았다. 아직 증빙이 없는 다른 팩도 기존 hold를 유지한다.

Cargo와 Cars 1은 결합 보류 행에서 분리한 뒤 각각 기존 `hold`를 유지한다. Cargo는 공식 CC0 표기가 있으나 이번 개방 범위에는 포함하지 않으며 로컬 Unity 패키지에서 모델·재질 회수와 검증이 남았다. Cars 1은 외부 텍스처를 참조하는 GLB 464개의 연결 해소와 검증이 남았다. 한 팩의 허용을 다른 팩으로 확장하지 않는다.

## 검증과 재현

실행 위치는 저장소 루트다. 다음 검증은 읽기 전용이며, 로컬 라이브러리가 같은 경로에 있어야 라이선스 실물까지 대조한다.

```bash
node scripts/verify-creator-bundle-pack-rights.mjs \
  --library-root "$HOME/3d-asset-library"
```

공개 HTML 증빙은 `index.json`의 각 `path` 파일을 읽어 바이트 수·SHA-256이 기록과 같은지 확인할 수 있다. 현재 판매 페이지는 갱신될 수 있으므로 새 조회를 기존 파일 위에 덮어쓰지 말고, 조회일을 구분한 증빙으로 추가한다.

원장 allow는 배포·장면 삽입 성공의 증거가 아니다. 생성기 정의, `theme-packs.json`, 렌더 매니페스트 권리 스탬프, 배포 플래너, 웹 로더를 같은 판정으로 맞춘 뒤 관련 테스트와 실제 화면을 검증해야 한다. 운영 배포는 저장소 배포 정책의 별도 게이트를 따른다.

2026-10-28의 1차 10팩 검증과 후속 2팩 추가 뒤의 재검증에서 위 원장 검증 명령은 모두 종료 코드 0으로 끝났고, 로컬 라이선스 문서 96건의 해시가 모두 일치했다. 당시 생성기의 묶음 정의는 `pack 45 / crowd 5 / pending 11`이었고, 공개 HTML 발췌 12개의 바이트 수·SHA-256 및 변경 파일 Secretlint도 통과했다.

추가 활용 4팩을 분리한 뒤 같은 원장 검증 명령도 종료 코드 0으로 끝났고, 집계 `65행 / allow 16 / hold 49 / pack 49 / crowd 5 / pending 11`과 로컬 라이선스 96건의 해시 불일치 0건을 확인했다. 공개 HTML 발췌 16개의 바이트 수·SHA-256이 모두 일치하며, 새 정식 catalog ID 4개의 owner는 각각 하나다. Cargo와 Cars 1의 보류, 변경한 원장·공개 증빙·이 문서의 Secretlint 및 diff 공백 검사도 통과했다. 생성기 메타데이터와 렌더 결과의 검증은 각 변경을 반영한 뒤 별도로 수행하며, 이 기록은 원장·증빙의 검증 범위다.
