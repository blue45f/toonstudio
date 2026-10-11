# ToonStudio 캐릭터 키트 v1 — 출처와 라이선스 고지

이 파일은 `tools/blender/character_kit`가 `kit.json`과 함께 만든 사람용 요약입니다. 기준은 `kit.json`의 `provenance`입니다.
생성일 2026-10-11, 도구 `tools/blender/character_kit`, Blender(bpy) 5.2.2.

## 원천 1 — Blender Foundation Human Base Meshes Bundle v1.4.1 (CC0 1.0)

- 사용한 에셋: `GEO-body_female_realistic`(몸, 저자 Dan Ulrich)와 그 눈 구(`.eye.L/.eye.R`). 번들 `human_base_meshes_bundle.blend`에서 추출했다.
- 내려받기: https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip
- 번들 zip SHA-256: `811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515` (내려받은 파일과 일치함을 확인했다)
- 라이선스: CC0 1.0. 근거 — 번들 README("All provided assets are public domain under the CC0 license"), 번들 안 에셋 메타데이터
  25개 전부 `license = CC0`, Blender 공식 데모 파일 페이지의 라이선스 표기.
- **번들 안의 불일치 1건(그대로 적는다)**: 번들의 `License` 텍스트 데이터블록에는 "The Rain Rig is released under the Creative Commons
  Attribution 4.0 license"라는 문장이 있다. 번들에는 아마추어(리그) 오브젝트가 없고(오브젝트는 메시 382개와 카메라 25개뿐) 이름에
  `rain`/`rig`가 들어간 오브젝트도 없다. 그래서 이 문장은 이 번들에 들어 있지 않은 다른 배포물의 문구가 남은 것으로 **추정**한다
  (추정이며 확인하지 못했다). 이 키트는 Rain Rig를 쓰지 않는다 — 스켈레톤은 이 저장소에서 새로 만든 68 joint다.
- 가공 내용: GEO-body_female_realistic 사용. 멀티레스 레벨 1 적용, 목에서 몸/머리 분할, A-포즈에서 T-포즈로 변환, 68 joint 리깅과 스킨 웨이트, UV 재전개와 텍스처 새로 제작, 체형·얼굴·표정 morph 추가, 속옷·구강 내부(치아·혀)·속눈썹·눈썹 추가, 눈 메시 재구성(공막과 홍채 분리).

## 원천 2 — ToonStudio 원본 (license: original)

- 속옷·구강 내부(치아·잇몸·혀)·속눈썹·눈썹·홍채·캐치라이트의 지오메트리와 몸 쪽 텍스처(피부·눈·치아·혀·속옷·속눈썹·눈썹·홍채)는
  `tools/blender/character_kit`가 절차 생성했다. 이 항목들에는 외부 이미지·스캔·사진을 쓰지 않았다.

## 원천 3 — Hyper3D(Rodin Gen-2.5) 생성물의 파생 파츠 (license: hyper3d-rodin-output)

- 이 파츠 33종은 Hyper3D(Rodin) 구독 플랜으로 생성한 결과물을 이 저장소에서 리타깃·재베이크한 **파생물**이다.
- **`hyper3d-rodin-output` 값은 법적 허용을 뜻하지 않는다.** 구독 약관의 상업 이용·소유권·수정·공개 호스팅 조항과 약관상 닫히지 않은 점은
  반입 기록 `apps/character-lab/docs/hyper3d-terms-record.md`에 있다. 이 값은 그 기록과 생성 id 없이는 반입하지 못하게 하는 장치일 뿐이다(계약 `KIT_ALLOWED_LICENSES`).
- Hyper3D가 돌려준 **원본 GLB는 저장소에 없다**(커밋하지 않았다). 아래 SHA-256은 그 원본 파일의 해시이고, 결과 페이지가 계속 열리는지는 확인하지 않았다.

### hair/short-layered (`hyper3d-hair-short-layered`)

- 생성 id: `f63e1379-d77f-4351-9a6d-74ff796ff91a`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/f63e1379-d77f-4351-9a6d-74ff796ff91a
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `f0856ff722688fc43049c261ac940f8ae116eae1811b7c192351a822b4ac4acb`
- 가공 내용: 청크형(저폴리 5,000 설정) 숏 레이어드 헤어 흉상 생성물(옆으로 쓸어 넘긴 앞머리)을 BANG으로 분리한 겉 껍데기·안쪽 조각 두 덩어리를 합쳐 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(5,000/2,700/1,400 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### hair/soft-bob (`hyper3d-hair-soft-bob`)

- 생성 id: `f2ef0164-fae1-41ac-b321-2b6dd346cb21`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/f2ef0164-fae1-41ac-b321-2b6dd346cb21
- 등급: Gen-2.5-Medium
- 원본 GLB SHA-256: `33e6cd66dd06fe243d534679b137d3076609868c70d10353b25a83ca6600680e`
- 가공 내용: 청크형(저폴리 3,000 설정) 보브 헤어 흉상 생성물을 BANG으로 분리한 헤어 파츠를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(3,300/1,800/950 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### hair/romance-long (`hyper3d-hair-romance-long`)

- 생성 id: `832d34d6-59d9-449c-8bfd-d490eb472e44`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/832d34d6-59d9-449c-8bfd-d490eb472e44
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `544ade474b9becea64d90fd90329025da9f65cc73c1832b353378b7d8ff9327d`
- 가공 내용: 청크형(저폴리 5,000 설정) 가운데 가르마 긴 생머리 흉상 생성물을 BANG으로 분리한 헤어 파츠를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(4,500/2,400/1,300 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### hair/action-pony (`hyper3d-hair-action-pony`)

- 생성 id: `49c429e4-3e07-42ac-8382-8adb611bf1b7`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/49c429e4-3e07-42ac-8382-8adb611bf1b7
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `68407efd1a80cc99fe30caeb213b2fe03e749bf8f1076d33ba94a0ab76a4e3b9`
- 가공 내용: 청크형(저폴리 5,000 설정) 하이 포니테일 헤어 흉상 생성물을 BANG으로 분리한 헤어 파츠(정수리 묶음 + 긴 꼬리)를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(5,000/2,700/1,400 삼각형), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### hair/hime-cut (`hyper3d-hair-hime-cut`)

- 생성 id: `555ced0b-d341-4401-ad26-50824a80b2e1`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/555ced0b-d341-4401-ad26-50824a80b2e1
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `8f6c9a6f28dbc4c92ea1af3b44ea5b3ae5c1228b31c42d2874d5d0b10f6c6e55`
- 가공 내용: 청크형(저폴리 5,000 설정) 히메컷 헤어 흉상 생성물(블런트 뱅·볼 옆 머리)을 BANG으로 분리한 헤어 파츠를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(5,200/2,800/1,500 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### hair/wolf-layered (`hyper3d-hair-wolf-layered`)

- 생성 id: `579b60ac-dff8-42a9-a39e-0b4fa99878c8`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/579b60ac-dff8-42a9-a39e-0b4fa99878c8
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `30f85d4bf4f61ec45040a6fb3d5ad3f20c4462ce9f163d65f9bd1f0607fdd272`
- 가공 내용: 청크형(저폴리 5,000 설정) 울프 컷 헤어 흉상 생성물(커튼 뱅 레이어드)을 BANG으로 분리한 겉 껍데기·뒤쪽 조각 두 덩어리를 합쳐 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, 앞머리를 눈썹 위로 올림, LOD 3단(6,000/3,200/1,700 삼각형), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### hair/twin-tail (`hyper3d-hair-twin-tail`)

- 생성 id: `ee5b4422-7df7-4fb8-842b-0385146cafab`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/ee5b4422-7df7-4fb8-842b-0385146cafab
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `90ce5579422168feb15138c64ee68cf9ffe56069854bca542881faaefe28b8f9`
- 가공 내용: 청크형(저폴리 5,000 설정) 트윈테일 헤어 흉상 생성물을 BANG으로 분리한 헤어 파츠(양쪽 높은 묶음 + 꼬리 둘)를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, 두개골 폭에 맞춘 배율이 꼬리를 머리에 붙은 단발로 만들어 묶음 아래 꼬리를 아래로 1.7배·바깥으로 4 cm 늘림, LOD 3단(5,000/2,700/1,400 삼각형), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### top/tee (`hyper3d-top-tee`)

- 생성 id: `82698064-e736-4b1e-ac56-67f6569bd364`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/82698064-e736-4b1e-ac56-67f6569bd364
- 등급: Gen-2.5-Medium
- 원본 GLB SHA-256: `1c60f00ef7f96785525d133fd3dad94fd4a49743709534f216a6277160235a5b`
- 가공 내용: 옷만 요청한 티셔츠 생성물에서 마네킹 목 조각을 지우고, 베이스 T-포즈 몸에 맞춰 리타깃(정렬·충돌 해소·웹툰풍 스무딩·표면 결합), 6,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### top/hoodie (`hyper3d-top-hoodie`)

- 생성 id: `4949cb5c-98d3-4842-9f05-02dbcf651c61`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/4949cb5c-98d3-4842-9f05-02dbcf651c61
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `7a1e25483a0788d2eaea025fb6a3a67e9ff9a37e368ea715448300f16411de16`
- 가공 내용: 베이스 T-포즈 몸에 캥거루 주머니·목 둘레 접힘을 입체로 넣은 프록시 후디(앞·뒤·옆 3장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 후디 몸통 파츠를 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 6,500 삼각형으로 축소, 앞·뒤 중앙이 V자로 처진 밑단을 옆면 높이로 수평하게 자르고, 텍스처를 상대색 JPEG로 재베이크. 생성 모델이 모든 시도에서 후드 볼륨을 만들지 못해(칼라로 읽거나 BANG이 머리 파츠에 붙였다) 후드(목 둘레 접힘 토러스 + 등에 늘어진 주머니)는 이 저장소가 맞춰진 셸 위에 직접 만들어 붙인다(원본 Hyper3D 형상이 아님).

### top/shirt (`hyper3d-top-shirt`)

- 생성 id: `66101633-05ce-4898-8dd9-8c2dec747424`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/66101633-05ce-4898-8dd9-8c2dec747424
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `f24e20697b76ec3ef0ffa050b2ceb2b865529eea38329bc14b5f3b697baa56cb`
- 가공 내용: 베이스 T-포즈 몸에 뾰족한 칼라·칼라 스탠드·앞단을 입체로 넣은 프록시 셔츠(앞·뒤 2장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 긴팔 셔츠 파츠를 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 6,500 삼각형으로 축소, 앞·뒤 중앙이 V자로 처진 밑단을 옆면 높이로 수평하게 자르고, 텍스처를 상대색 JPEG로 재베이크. 남성 베이스는 남성 프록시로 따로 생성한 셔츠를 쓴다.

### top/blazer (`hyper3d-top-blazer`)

- 생성 id: `268c6adf-bb7f-4755-b550-c6aa2bd9bd38`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/268c6adf-bb7f-4755-b550-c6aa2bd9bd38
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `354e0d61d88104870416d3474be7abb2d8472063c5f1e86c1617ae4b0077429d`
- 가공 내용: 베이스 T-포즈 몸에 노치 라펠·가슴 주머니·플랩 주머니·단추를 입체로 넣은 프록시 블레이저(앞·뒤 2장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 블레이저 파츠와 안쪽 셔츠 칼라 조각을 합쳐 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 8,000 삼각형으로 축소, 앞·뒤 중앙이 V자로 처진 밑단을 옆면 높이로 수평하게 자르고, 텍스처를 상대색 JPEG로 재베이크. 남성 베이스는 남성 프록시로 따로 생성한 블레이저를 쓴다.

### top/sailor (`hyper3d-top-sailor`)

- 생성 id: `039a2bba-a235-45b7-9bde-296cff7cafcf`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/039a2bba-a235-45b7-9bde-296cff7cafcf
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `dc177fdced911819a1d1aedd2d033ab4882010fe326b16cc3f914b655fce8788`
- 가공 내용: 베이스 T-포즈 몸에 앞 V 칼라·뒤 사각 칼라·스카프 매듭을 입체로 넣은 프록시 세일러 상의(앞·뒤 2장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 몸통·칼라 조각·소매단을 합쳐 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 8,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크(네이비 칼라·빨간 스카프는 휘도 영역과 입체 지오메트리로 남는다). 남성 베이스는 BANG이 손등까지 소매 천을 남겨 손목에 찢긴 조각이 걸리므로 손목 관절 평면에서 소매 끝을 자른다.

### bottom/jeans (`hyper3d-bottom-jeans`)

- 생성 id: `cb5a2e39-ecf4-4f99-9380-89267264053b`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/cb5a2e39-ecf4-4f99-9380-89267264053b
- 등급: Gen-2.5-Medium
- 원본 GLB SHA-256: `9bda1b6ef110bca7bc562de844508cc74bce9cb862b3068ecc346fd2496b7a92`
- 가공 내용: 옷만 요청한 청바지 생성물에서 마네킹 허리·발목·신발 조각을 지우고, 베이스 T-포즈 몸에 맞춰 리타깃(정렬·충돌 해소·웹툰풍 스무딩·표면 결합), 6,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### bottom/shorts (`hyper3d-bottom-shorts`)

- 생성 id: `454cee0f-eefa-40d1-a59d-56d944c6394a`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/454cee0f-eefa-40d1-a59d-56d944c6394a
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `8b17242680c860a8cefb87aee1869ad3e6a29e5415c35049a19d53516db57a1a`
- 가공 내용: 반바지만 요청했지만 마네킹 몸이 함께 나온 생성물을 BANG으로 분리한 반바지 파츠를 베이스 T-포즈 몸에 허리선 기준으로 맞춰 리타깃, 웹툰풍 스무딩, 4,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### bottom/pleated-skirt (`hyper3d-bottom-pleated-skirt`)

- 생성 id: `f12ea410-75bf-4475-a213-198746431395`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/f12ea410-75bf-4475-a213-198746431395
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `17b43e7a36c950a65ce3739b807dda77ad0ddfa91ef27b586f63e46278a24437`
- 가공 내용: 교복 여학생 전신 생성물을 BANG으로 분리한 주름치마 파츠를 베이스 T-포즈 몸에 맞춰 리타깃(퍼짐과 주름을 유지하도록 약한 스무딩·충돌 해소만), 8,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### bottom/long-skirt (`hyper3d-bottom-long-skirt`)

- 생성 id: `e68a0738-cbb4-49c6-8c63-e8e137b8bd32`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/e68a0738-cbb4-49c6-8c63-e8e137b8bd32
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `c1599ff9e0d4a2a08f0ae9611d520bc258cdd0a6216d1060dd2bb14dbd17e6b1`
- 가공 내용: 롱스커트 여성 전신 생성물을 BANG으로 분리한 A라인 롱스커트 파츠를 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 8,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### bottom/slacks (`hyper3d-bottom-slacks`)

- 생성 id: `cfda62fb-19a3-4e4a-992f-1c4c52dd68ae`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/cfda62fb-19a3-4e4a-992f-1c4c52dd68ae
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `0d0096d382eaaa9c4adb85864a5ebe0fc0af4e0d8fee0a15cfcc48b33b5293c2`
- 가공 내용: 바지만 요청했지만 마네킹 몸이 함께 나온 생성물을 BANG으로 분리한 바지 파츠를 베이스 T-포즈 몸에 허리선 기준으로 맞춰 리타깃, 웹툰풍 스무딩, 6,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### shoes/sneakers (`hyper3d-shoes-sneakers`)

- 생성 id: `d6cd1b50-7e9f-401e-a4b4-87bf45b0e336`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/d6cd1b50-7e9f-401e-a4b4-87bf45b0e336
- 등급: Gen-2.5-Medium
- 원본 GLB SHA-256: `9ea818e7d93792da0ae1727faf9c9f1d018b2d4c3a3afffeb281b4def66a1684`
- 가공 내용: 스니커즈 한 켤레 생성물을 그대로 쓰되 베이스 발 길이에 맞춰 리타깃, 5,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### shoes/loafers (`hyper3d-shoes-loafers`)

- 생성 id: `347f643a-9d8d-4f13-9b11-4d07305d28ff`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/347f643a-9d8d-4f13-9b11-4d07305d28ff
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `9cd581dea9323c82b13c262e51cbc8f7d693b5652c0f402e01b6a5f9af904802`
- 가공 내용: 로퍼 한 켤레 생성물을 그대로 쓰되 베이스 발 길이에 맞춰 리타깃, 5,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### shoes/boots (`hyper3d-shoes-boots`)

- 생성 id: `b793c25d-6247-43d9-a040-1be2d82252f8`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/b793c25d-6247-43d9-a040-1be2d82252f8
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `0a3178d360d5c68237dd3fcd7fac64fe308de647fd1ac2c410706e5e9e20fb6e`
- 가공 내용: 끈 달린 앵클부츠 한 켤레 생성물을 그대로 쓰되 베이스 발 길이에 맞춰 리타깃, 5,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### shoes/sandals (`hyper3d-shoes-sandals`)

- 생성 id: `2a7df564-2bd6-49c9-ae0c-e5bdcece8c4f`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/2a7df564-2bd6-49c9-ae0c-e5bdcece8c4f
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `0bd7dc6589e37869701bf0da4484e4a992eccd9820829f5b665689b70dc512e7`
- 가공 내용: 스트랩 샌들 한 켤레 생성물을 그대로 쓰되 베이스 발 길이에 맞춰 리타깃, 5,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### accessory/ribbon (`hyper3d-accessory-ribbon`)

- 생성 id: `43d44c7c-1c5d-4f31-83b5-dbc584859567`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/43d44c7c-1c5d-4f31-83b5-dbc584859567
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `ce78392f5698c2bdde87b9556444497b7fe47960d2ee1247f3614b07bf23d1be`
- 가공 내용: 헤어 리본 생성물을 너비 7.5 cm로 줄여 머리 왼쪽 위(귀 위쪽)에 얹도록 리타깃, 2,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### accessory/cap (`hyper3d-accessory-cap`)

- 생성 id: `da32af22-d1e3-4103-a160-002557e24c2a`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/da32af22-d1e3-4103-a160-002557e24c2a
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `c21ae6296e992cc8df293d2eddbada0119c9e1afa498206b286e707306608eb8`
- 가공 내용: 야구모자 생성물을 베이스 머리 너비에 맞춰 정수리 위에 얹도록 리타깃, 3,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### accessory/headphones (`hyper3d-accessory-headphones`)

- 생성 id: `ca9c78df-affa-4329-b12e-87ba46bd29b6`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/ca9c78df-affa-4329-b12e-87ba46bd29b6
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `17e61967d64aa85b1c7d1edbe3c605f52a24f92dccf060ea5a7eeb68f395f00b`
- 가공 내용: 헤드폰 생성물을 베이스 머리 너비에 맞춰 귀 바깥에 오도록 리타깃, 3,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.

### top/shirt@male (`hyper3d-top-shirt-male`)

- 생성 id: `eeaa0eeb-f4fa-4cb5-88a4-d3909bfb8fd3`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/eeaa0eeb-f4fa-4cb5-88a4-d3909bfb8fd3
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `1f6658386e8cf9f629062c7c3c982d948e519f6655cb0e1a84e5268d29637ef0`
- 가공 내용: 베이스 T-포즈 몸에 뾰족한 칼라·칼라 스탠드·앞단을 입체로 넣은 프록시 셔츠(앞·뒤 2장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 긴팔 셔츠 파츠를 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 6,500 삼각형으로 축소, 앞·뒤 중앙이 V자로 처진 밑단을 옆면 높이로 수평하게 자르고, 텍스처를 상대색 JPEG로 재베이크. 남성 베이스는 남성 프록시로 따로 생성한 셔츠를 쓴다.

### top/sailor@male (`hyper3d-top-sailor-male`)

- 생성 id: `9aa9c672-bae8-4562-b01d-cc52aec04a52`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/9aa9c672-bae8-4562-b01d-cc52aec04a52
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `3a01b879ebba02aa53c109ccdcfa15e7cc90b301340cdc8e62504ac8e430cf63`
- 가공 내용: 베이스 T-포즈 몸에 앞 V 칼라·뒤 사각 칼라·스카프 매듭을 입체로 넣은 프록시 세일러 상의(앞·뒤 2장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 몸통·칼라 조각·소매단을 합쳐 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 8,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크(네이비 칼라·빨간 스카프는 휘도 영역과 입체 지오메트리로 남는다). 남성 베이스는 BANG이 손등까지 소매 천을 남겨 손목에 찢긴 조각이 걸리므로 손목 관절 평면에서 소매 끝을 자른다.

### top/blazer@male (`hyper3d-top-blazer-male`)

- 생성 id: `c5fc147c-860d-4fd6-be08-ad44753ce3c4`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/c5fc147c-860d-4fd6-be08-ad44753ce3c4
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `5c7bde8e187d7a44602ba5036288a98c5b036fff60f8fc217f439c530397ba0c`
- 가공 내용: 베이스 T-포즈 몸에 노치 라펠·가슴 주머니·플랩 주머니·단추를 입체로 넣은 프록시 블레이저(앞·뒤 2장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 블레이저 파츠와 안쪽 셔츠 칼라 조각을 합쳐 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 8,000 삼각형으로 축소, 앞·뒤 중앙이 V자로 처진 밑단을 옆면 높이로 수평하게 자르고, 텍스처를 상대색 JPEG로 재베이크. 남성 베이스는 남성 프록시로 따로 생성한 블레이저를 쓴다.

### top/hoodie@male (`hyper3d-top-hoodie-male`)

- 생성 id: `116ca34c-27df-4bd5-8de1-7bf76c24825c`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/116ca34c-27df-4bd5-8de1-7bf76c24825c
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `1a14042c43c10ba29d437cae8c599013891881bada90fa4f265b1cf3c5a64c2d`
- 가공 내용: 베이스 T-포즈 몸에 캥거루 주머니·목 둘레 접힘을 입체로 넣은 프록시 후디(앞·뒤·옆 3장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 후디 몸통 파츠를 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 6,500 삼각형으로 축소, 앞·뒤 중앙이 V자로 처진 밑단을 옆면 높이로 수평하게 자르고, 텍스처를 상대색 JPEG로 재베이크. 생성 모델이 모든 시도에서 후드 볼륨을 만들지 못해(칼라로 읽거나 BANG이 머리 파츠에 붙였다) 후드(목 둘레 접힘 토러스 + 등에 늘어진 주머니)는 이 저장소가 맞춰진 셸 위에 직접 만들어 붙인다(원본 Hyper3D 형상이 아님).

### hair/soft-bob@male (`hyper3d-hair-soft-bob-male`)

- 생성 id: `6eec895d-0347-468c-a3be-0d0086f1dedb`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/6eec895d-0347-468c-a3be-0d0086f1dedb
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `31915c605a2683805c0b6861e28a98f9c77216c5ac557350e30111c46df6b09e`
- 가공 내용: 청크형(저폴리 3,000 설정) 보브 헤어 흉상 생성물을 BANG으로 분리한 헤어 파츠를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(3,300/1,800/950 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### hair/short-layered@male (`hyper3d-hair-short-layered-male`)

- 생성 id: `f821fc5a-0d1a-4e84-84a4-8793a1ee2c3d`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/f821fc5a-0d1a-4e84-84a4-8793a1ee2c3d
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `a1c3144ccfde518bf550cdb929230fc569fb4aeb4c0880f25cfa426783264f57`
- 가공 내용: 청크형(저폴리 5,000 설정) 숏 레이어드 헤어 흉상 생성물(옆으로 쓸어 넘긴 앞머리)을 BANG으로 분리한 겉 껍데기·안쪽 조각 두 덩어리를 합쳐 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(5,000/2,700/1,400 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### hair/wolf-layered@male (`hyper3d-hair-wolf-layered-male`)

- 생성 id: `65af7240-df63-4931-8ac1-0d0826328eac`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/65af7240-df63-4931-8ac1-0d0826328eac
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `0d788088242a8f65b10ac6315565d3a524c3d75306b8d524387b52c16d3f92c4`
- 가공 내용: 청크형(저폴리 5,000 설정) 울프 컷 헤어 흉상 생성물(커튼 뱅 레이어드)을 BANG으로 분리한 겉 껍데기·뒤쪽 조각 두 덩어리를 합쳐 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, 앞머리를 눈썹 위로 올림, LOD 3단(6,000/3,200/1,700 삼각형), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### hair/action-pony@male (`hyper3d-hair-action-pony-male`)

- 생성 id: `122f0174-fcc0-4a20-83a6-0745481be836`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/122f0174-fcc0-4a20-83a6-0745481be836
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `ce69ae0ef8032e470390e5082cb4a1b00f7f64dacb151d1ae26109f5847c9ebc`
- 가공 내용: 청크형(저폴리 5,000 설정) 하이 포니테일 헤어 흉상 생성물을 BANG으로 분리한 헤어 파츠(정수리 묶음 + 긴 꼬리)를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(5,000/2,700/1,400 삼각형), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

### hair/romance-long@male (`hyper3d-hair-romance-long-male`)

- 생성 id: `02dac44e-f730-453f-aefe-4eb25ddf83f1`
- 결과 페이지: https://hyper3d.ai/workspace/rodin/02dac44e-f730-453f-aefe-4eb25ddf83f1
- 등급: Gen-2.5-High
- 원본 GLB SHA-256: `a7c55980d24b76370c85126f3e06d534be0af9d02f02dc745e650cd5b7a2df97`
- 가공 내용: 청크형(저폴리 5,000 설정) 가운데 가르마 긴 생머리 흉상 생성물을 BANG으로 분리한 헤어 파츠를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(4,500/2,400/1,300 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.

## 쓰지 않은 것

- 상용 제품 에셋과 라이선스가 불명확한 에셋은 이 키트에 들어 있지 않다. Hyper3D(Rodin) 생성물은 위 원천 3에 적은 파생 파츠만 들어 있다.
  이 키트에 쓰인 라이선스 값은 `CC0-1.0`, `original`, `hyper3d-rodin-output`이다(마지막 값은 법적 허용을 뜻하지 않는다).

## 들어 있는 파일

- 베이스: `bases/female.glb` (남성 베이스는 이번 빌드에서 만들지 않았다.)
- 파츠: accessory/cap, accessory/choker, accessory/earrings, accessory/glasses, accessory/headphones, accessory/ribbon, bottom/jeans, bottom/long-skirt, bottom/pleated-skirt, bottom/shorts, bottom/slacks, hair/action-pony, hair/hime-cut, hair/romance-long, hair/short-layered, hair/soft-bob, hair/twin-tail, hair/wolf-layered, irises/cat, irises/round-large, irises/round-small, irises/soft-gradient, irises/star-highlight, shoes/boots, shoes/loafers, shoes/sandals, shoes/sneakers, top/blazer, top/hoodie, top/sailor, top/shirt, top/tee
- 아직 없는 프리셋은 `kit.json`의 `parts[].unavailable`에 한글 사유가 있다.

## 재현

```text
pnpm exec tsx scripts/blender/dump-kit-contract.mjs --out <contract.json>
<venv>/bin/python -I tools/blender/character_kit/build_base.py --contract <contract.json> ...
<venv>/bin/python -I tools/blender/character_kit/build_irises.py ...
<venv>/bin/python -I tools/blender/character_kit/build_kit_json.py ...
pnpm exec tsx scripts/verify-character-kit.mjs --root <키트 폴더> --base female
```
