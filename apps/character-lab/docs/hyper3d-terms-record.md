# Hyper3D(Rodin) 약관 확인 기록과 반입 조건 (hyper3d-terms-record)

상태: **current (2026-10-11)** — 키트 파츠를 Hyper3D로 생성해 반입하기 **전에** 상업적 이용·소유권 조항을 확인하고 남기는 기록이다.
**법률 자문이 아니다.** 아래 영문 발췌는 수집한 페이지 텍스트에서 시작·끝 문구로 기계 추출한 원문이며(단어·철자·부호 그대로, 문단 안의 줄바꿈만 공백으로 합침),
조항 번호는 원문 번호다. 문서가 정하지 않은 것을 정했다고 쓰지 않는다. 계약(`authored-kit-spec.md`)은 이 문서가 바꾸지 않는다.
사전 점검 기록은 [`hyper3d-intake-review.md`](hyper3d-intake-review.md), 에셋 레인 구현 상태는 [`../../../tools/blender/character_kit/README.md`](../../../tools/blender/character_kit/README.md)다.

## 1. 결론 (한눈에)

| 질문 | 확인 결과 | 근거 |
| --- | --- | --- |
| 상업적으로 쓸 수 있는가 | **플랜에 따라 가능**하다. 가격표의 "Unlimited export and any use"는 Free ✗, Creator·Business·Enterprise ✓. 어느 플랜인지, 법인·사업자의 상용 제품 배포까지 포함하는지는 문서로 닫히지 않는다 | ToS §2, 가격표(§3) |
| 소유권이 사용자에게 있는가 | **ToS에 소유권 귀속 문장이 없다.** 마케팅 FAQ만 "You own what you create."라 하고, 구매를 "a grant of a license, not a transfer of title"로 적은 문서(Copyright License §2.2)는 Rodin에 적용되는지 불명이다. 그래서 이 저장소는 **소유가 아니라 이용권**으로 기록한다 | §4 |
| 수정·파생물(리타깃·리메시·텍스처 재베이크)이 되는가 | **문서가 충돌하거나 불명.** ToS §6.3은 수정·파생물을 명시 허가 없이는 금지하고, Copyright License §2.1은 "modify"를 허용한다 | §4 |
| 공개 저장소·정적 웹 에셋으로 내려받게 해도 되는가 | **이를 직접 다룬 문장이 없다.** §6.3의 복제·배포·공개 전시 금지와 재판매·이전 시 수령자 고지 책임이 걸릴 수 있다 | §4 |
| 출처 표기가 필요한가 | 요구하는 문장을 찾지 못했다(표지 제거 금지 문장만 있다) | §4 |
| 사용자의 유료 구독 | 2026-10-10 사용자가 "유료 구독 중이라 상업 사용이 가능한 상태"라고 진술(`hyper3d-intake-review.md` §1). 2026-10-11 03:43 KST 같은 취지로 재확인: "유료 구독이니 상업적 사용 가능할것으로 보여". 둘 다 **사용자 진술이며 플랜명·결제 증빙은 보관돼 있지 않다** | 진술 |

**반입 결정(이 브랜치): 사용자 진술을 근거로 생성·파생·로컬 커밋을 진행한다.** 다만 약관상 닫히지 않은 두 가지(수정·파생물 §6.3 R1/R2, 공개 저장소 서빙)는 남아 있어
**공개 저장소(`blue45f/toonstudio`는 PUBLIC)로의 push·병합은 사용자의 별도 지시로만 한다.** 그 시점에 §6의 확인(플랜 증빙, 계정 보유자와 발행 주체 일치, 서면 확인)을 함께 점검한다.

## 2. 수집 증거

2026-10-10T17:58~18:22Z(= 2026-10-11 02:58~03:22 KST)에 로그인 없이 읽히는 공개 페이지를 `curl -sSL -A 'Mozilla/5.0 (Macintosh)'`로 받았다(필수 4종은 Playwright 렌더 DOM과도 대조).
계정·결제·크레딧은 건드리지 않았다. 개정일은 영어판에 없다("Current version"만, 중국어판만 2025-10-16). Wayback 캡처 11건(2026-06-05~10-06)과 오늘 수집본의 영어 ToS 본문 해시가 같다.

| 문서 | URL | raw SHA-256 | 수집(UTC) |
| --- | --- | --- | --- |
| 이용약관(ToS) | <https://hyper3d.ai/legal/terms> | `998ec0c7a038e7d18a34bbc1da6186f68f1879a9b12e955849ad9d8d116221f5` | 2026-10-10T17:58:24Z |
| 저작권 라이선스(Copyright License) | <https://hyper3d.ai/legal/copyright-license> | `9a27c19693762621aa749f51bae03e113b4703478be3bbc74de53c95d1104646` | 2026-10-10T17:58:24Z |
| 가격 | <https://hyper3d.ai/pricing> | `48b5262d4a457b417f833b8f601df1eddccb07e26e5fd2be8507e30ad359723f` | 2026-10-10T17:58:24Z |
| API | <https://hyper3d.ai/features/api> | `44d512d6d3eedf8ebdf4e1d4df997498bc3bbb77a168c4052b3fdc0a4b4989c5` | 2026-10-10T17:58:24Z |
| 이미지→3D(마케팅 FAQ) | <https://hyper3d.ai/features/image-to-3d> | `56dce8722fb4cb1f0d0aaa292a79fbe48d6072e053f7bfb33291a3348911d406` | 2026-10-10T18:02:29Z |

전체 스냅샷(원문 HTML 66건, 추출 텍스트, MANIFEST, 분석 본문)은 **저장소 밖**에 압축 보관했다: `~/.cache/toonstudio-kit/hyper3d-terms-snapshot-2026-10-11.tar.gz`
(SHA-256 `3d4c0b6b8267f858cf34a3d3d6211a4ce9b297ccf3b94b674260c809c92f5f8e`, 4,512,141 B). 제3자 약관 전문을 공개 저장소에 복제하지 않으려는 의도다. 약관이 개정되면 새로 수집해 이 표를 갱신한다.

## 3. 상업 이용 — 원문과 가격표

> Users are allowed to do following things through the Service on the Sites: Generate 3D Content, by uploading texts and/or images and export such Content for private or commercial use depending on your subscription plan; …
>
> — ToS §2 Use of Our Services

> If you use Rodin to generate Output, we will not limit your use of such Output, subject to any restrictions set forth in these Agreements, the Applicable Laws and any third-party terms and conditions applicable to such Output or Services.
>
> — ToS §5 (b) Rodin

- 비상업 문구("Users shall not use the Content for commercial purpose")는 **ChatAvatar** 기본 라이선스(§5 (a))에만 붙어 있고 Rodin(§5 (b))에는 없다. 반면 Rodin에는 **권리를 부여하는 문장도 없다**("will not limit your use … subject to any restrictions").
- 가격표 `Unlimited export and any use` 행: Free —, Creator ✓, Business ✓, Enterprise ✓. `API access` 행: Free —, Creator —, Business "Full access", Enterprise "Custom".
- 가격 FAQ: "Paid plans include broader export and usage rights. … Review the current terms before using assets in regulated or high-risk contexts."
- 해석(확정 아님): 유료 플랜에서 만든 Rodin 산출물을 앱 안에서 상업적으로 쓰는 것은 의도된 사용처로 읽힌다. Free 산출물은 상업 이용 가능으로 쓰지 않는다. §5(b)의 "subject to any restrictions set forth in these Agreements"가 §6.3을 다시 끌어오는지는 문서가 말하지 않는다.

## 4. 소유권·라이선스 범위 — 원문

> Except as expressly set out in these Agreements, all IP contained in the Content (for the avoidance of doubt, excluding any Prompts and Output, the arrangement of which shall be subject to Section 5 of these Terms) or Service is our property or third-party licensors' property, …
>
> — ToS §6.1 Intellectual Property Rights

> Please note that we make no representations, warranties or undertakings of any kind as to the copyrightability of any Output or the availability of Intellectual Property Rights … We take no responsibility for any breach of any Applicable Laws and third-party terms and conditions applicable to such Output or Services and/or any infringement of third party rights resulting from your use of such Output.
>
> — ToS §5 (b) Rodin

> … sell, resell or commercially use the Content, except as expressly permitted by us or our licensors; copy, reproduce, distribute, publicly perform or publicly display all or portions of the Content, except as expressly permitted by us or our licensors; modify the Content, remove any proprietary rights notices or markings, or otherwise make any derivative works based upon the Content; using the Services to train, improve, enhance, or otherwise develop any AI models and services same, similar or competing with the Services provided by us; …
>
> — ToS §6.3 Restrictions

> For any permitted sell, resell, transfer or disposal in any form of any Content under the Agreements, Users shall notify the receiving party of the Content the restrictions set forth in these Agreements and take best efforts to procure the receiving party to comply with such restrictions as if such receiving party were the User. The Users shall be responsible for any breach of these Agreements by such receiving party.
>
> — ToS §6.3 (마지막 문단)

> Subject to Your compliance of the terms and conditions of this License, the Licensor hereby grants You a worldwide, non-sublicensable, non-exclusive license to exercise the Licensed Rights in the Licensed Product to sell, redistribute, modify, publish, or sublicense the purchased content, but this content may not be used to create a competing service with Hyperhuman.ai products or services.
>
> — Copyright License §2.1

> Each purchase constitutes a grant of a license, not a transfer of title. Under the license You may not: attempt to decompile or reverse engineer any software or any aspects of the Licensed Product; remove any copyright or other proprietary notations; or transfer the content to another person without permission or mirror any part of the Licensed Product.
>
> — Copyright License §2.2

> Who owns the models, and can I use them commercially? You own what you create. Paid plans include commercial licensing so you can use your image-generated 3D models in games, products, and client work — see our terms for full details.
>
> — 이미지→3D 페이지 FAQ(마케팅, 계약 아님)

해석(확정 아님, 읽는 법이 갈린다):

1. **소유권**: ToS는 Output의 소유를 사용자에게 귀속한다는 문장이 없다. "소유"라고 말하는 문서는 마케팅 FAQ뿐이고 ToS §15는 계약 밖 진술에 의존하지 않는다고 한다. → **이용권으로 기록**하고 "소유"라고 쓰지 않는다. 저작권성은 §5(b)가 무보증이다.
2. **수정·파생물**: (R1) §5(b)가 Rodin Output의 개별 규정이라 §6.3 금지는 적용되지 않거나 §2·가격표("any use")가 명시 허가다. (R2) §5(b)에 "subject to any restrictions …"가 달려 있어 §6.3이 살아 있고, 수정·파생·배포는 명시 허가가 있을 때만 된다. 문서로 확정할 수 없다.
3. **공개 저장소·정적 호스팅**: 직접 문장이 없다. 이 저장소가 공개라서 파일을 누구나 내려받는다. §6.3 말미(수령자 고지·준수·책임)와 Copyright License §2.2("mirror")가 불리하게 읽힐 소지가 있다.
4. **Copyright License 자체가 미완성**이다: `[module]`·`[Price]`·`[Term]` 미채움, 라이선서가 ToS의 Deemos Corporation과 다른 "Deemos Technology (Shanghai) Co., Ltd.", 레거시 브랜드 "Hyperhuman.ai", §2.1 안에서 "non-sublicensable"과 "sublicense"가 충돌한다. ToS는 이 문서를 언급하지 않는다.
5. **권리는 개인(계정 보유자)에 붙는다**(ToS §3·§13, Copyright License §5.6). 상용 제품의 발행 주체와 생성 계정의 보유자를 일치시키고 증빙을 남기는 편이 문면과 맞는다.
6. 출처 표기를 요구하는 문장은 없다. 다만 표지 제거는 금지다(ToS §6.3, Copyright License §2.2).

## 5. 이 저장소의 반입 정책 (이 브랜치에서 적용하는 것)

1. **생성 경로**: 로컬 Claude Code의 `hyper3d` MCP(OAuth, 계정 인증). Blender 애드온의 free trial key 경로는 쓰지 않았다.
2. **원본(Rodin GLB 약 8~10 MB)은 저장소에 커밋하지 않는다.** 원본은 `~/.cache/toonstudio-kit/hyper3d-raw/`에 보관하고 SHA-256과 `generation_id`만 §7 표에 남긴다.
   서명 다운로드 URL은 7일 뒤 만료되고(Data Retention Policy, API 산출물 7일 보관) 비밀로 취급해 어디에도 적지 않는다.
3. **저장소에 들어가는 것은 파생 파츠 GLB(파일당 ≤ 1.5 MiB)와 생성 스크립트, 이 기록뿐**이다. 파츠 GLB는 리타깃·리메시·텍스처 재베이크를 거친 **수정·파생물**이므로 §4의 R1/R2가 그대로 적용된다.
4. **계약 표기**: 키트 계약은 `provenance.license ∈ {CC0-1.0, original}`만 허용한다(V4). Hyper3D 파생물을 이 둘 중 하나로 적으면 사실과 다르다. 그래서 별도 라이선스 값을 계약에 추가하고(§8), 그 값이 쓰인 키트는 **이 기록을 가리키는 증빙 경로와 생성 id**를 `provenance`에 반드시 싣게 했다.
5. **push·병합은 사용자의 별도 지시로만**(점검 항목은 §6). 이 브랜치의 커밋은 로컬 소실 방지용이다.

## 6. 반입(push·병합) 전에 사람이 닫아야 하는 것

1. **플랜 증빙**: 플랜명(Creator/Business/…)과 결제 기록의 보관 위치. 가격표상 MCP/API 경유는 Business가 "Full access"라, 이 계정의 플랜이 상업 이용·MCP를 모두 포함하는지 확인한다.
2. **계정 보유자 = 발행 주체**: 에이치준랩스(개인사업자) 명의 계정인지 확인하고 증빙한다.
3. **서면 확인**(hello@deemos.com — ToS §7·§17이 안내하는 연락처). 답변은 약관 개정으로 바뀔 수 있으므로 받은 메일 원문과 날짜를 이 기록에 첨부한다. 후보 질문:
   1. Rodin 산출물에 Copyright License가 적용됩니까? `[module]`·`[Price]`·`[Term]`은 어떤 값이고 계약 당사자는 어느 법인입니까?
   2. Creator의 "Unlimited export and any use"는 법인/사업자가 상용 제품에 포함해 배포하는 경우까지 포함합니까? Business가 필요한 경우는 언제입니까?
   3. 산출물을 수정(리타깃·리메시·텍스처 재베이크)하고 앱에 포함해 최종 사용자에게 제공하는 것이 ToS §6.3에도 불구하고 허용됩니까?
   4. 공개 저장소에 산출물(및 파생물)을 커밋·서빙해 불특정 다수가 내려받게 하는 것이 허용됩니까? §6.3 말미의 수령자 고지는 어떤 형태로 하면 됩니까?
   5. MCP(OAuth, billing workspace) 경유 생성물은 API와 같은 권리를 받습니까?
   6. 구독 해지·만료 후 이미 내려받은 산출물의 사용권은 유지됩니까? 약관 개정은 기존 산출물에 소급됩니까?
   7. 산출물의 소유권은 누구에게 있습니까? 마케팅 FAQ의 "You own what you create."는 계약상 유효한 진술입니까?
4. 위 3번의 3·4가 부정적이면 Hyper3D 파생 파츠는 공개 저장소에서 빼고(비공개 저장소·배포 시 주입), 키트는 CC0/original 파츠만으로 구성한다.

**2026-10-11 반입 결정 기록**: 사용자(계정 보유자)가 Hyper3D 유료 플랜(상업 이용 가능)임을 직접 확인했다고 알리고 키트 에셋 전체를 공개 저장소에 올리라고 지시해
`apps/character-lab/public/assets/characters/toonstudio-kit-v1/`에 반입했다. 위 1~3번 가운데 **서면 확인(3)은 받지 않았다** — 특히 질문 4(공개 저장소 호스팅·수령자 고지, ToS §6.3)는 답이 없는 상태이고,
이 위험은 사용자가 수용했다. 약관이 개정되거나 서면 답변이 부정적이면 4번의 대안(Hyper3D 파생 파츠 제외)으로 돌아간다. 반입된 파츠별 생성 id·판정은 `hyper3d_generations.json`·`hyper3d_sources.json`과 키트 `NOTICE.md`에 있다.

## 7. 생성 기록

**전체 기록은 `tools/blender/character_kit/hyper3d_generations.json`이다**(2026-10-11 현재 110건: 생성 67건 + BANG 분리 43건; id·프롬프트·BANG 지시문·원본 SHA-256·결과 판정). 아래 표는 그 가운데 최초 파일럿 4건의 상세이고, 이후 건은 다음이 다르다.

- 등급: `tier=Gen-2.5-High`(`quality_override` 3,000~40,000), `mesh_mode=Raw`. 전신 한 벌·흉상을 BANG(`rodin_generate_bang`)으로 분리해 파츠를 얻었다.
- **참조 이미지(2026-10-11 이후 T-포즈 상의 4건 `g11-*-proxy`)**: Rodin은 글 프롬프트의 T-포즈를 따르지 않아, 베이스 T-포즈 몸에 프록시 상의·바지를 입힌 정면 렌더(`tools/blender/character_kit/proxy_reference.py`가 베이스 메시를 그린 자체 렌더 1장)를 `rodin_create_uploads` 사전서명 PUT으로 올려 `reference_upload_ids`로 줬다. **입력 이미지는 이 저장소 자체 산출물뿐**이며 외부 이미지·다른 모델의 출력은 쓰지 않았다(약관의 "내가 권리를 가진 입력" 요건). 항목에는 `referenceImages`에 입력 설명을 적었다.
- 얼굴 흉상 6건(`head-*`, `fig-anime-*`): 베이스 머리 모양 정합 실험용이다. 실험이 미완성이라 키트 파츠·베이스에는 쓰이지 않았다(`face_register` 모듈 docstring 참조).
- 안경·귀걸이·초커(`accessory/glasses`·`accessory/earrings`·`accessory/choker`)는 Hyper3D 생성물이 아니라 `tools/blender/character_kit/proc_accessories.py`가 베이스의 눈·귀·목 위치에서 계산한 원본이다(license `original`, 크레딧 없음). 후디의 후드(`garment_extras.hood_down`)도 이 저장소가 직접 만든 형상이고, 후디 몸통만 Hyper3D 생성물이다(프록시 참조 이미지로도 후드 볼륨이 나오지 않았다). 키트에서 빠진 프리셋은 없다.
- **청크형 헤어(2026-10-11 오후)**: `quality_override` 30,000은 가닥 시트를, 3,000~5,000은 매끈한 청크형 헤어를 냈다(Extreme-Low 등급은 저폴리가 아니었다: 정점 18.8k). 흉상 정면·뒷면(·옆면) 참조 이미지(베이스 자체 렌더)로 헤어 흉상을 만들고 BANG(strength 3, explode 0, Basic)으로 헤어·머리·몸통을 분리한다. 남성 울프는 BANG 요청이 `INSUFFICIENT_BALANCE`로 거절됐고, 남성 롱은 BANG이 헤어를 파편 여섯 개로 쪼개 쓸 수 없어 두 경우 모두 원본 생성물에서 색으로 헤어를 분리해 썼다(`hair-wolf3m`, `hair-long3m`).
- **크레딧**: 마지막 시도(남성 울프 BANG, 초커 생성, 남성 청바지 생성; Gen-2.5-Extreme-Low 포함)가 모두 `INSUFFICIENT_BALANCE`를 돌려줬다. 사용자 안내 기준 남은 포인트가 0.5 이하였고 MCP에는 잔액 조회 도구가 없어 실제 소모량은 Hyper3D Mine에서 확인해야 한다. 이후 새 생성 없이 로컬 보정(`garment_extras`)으로 마무리했다.
- 스튜디오·작품 이름은 프롬프트에 쓰지 않는다. 사용자가 보낸 Hyper3D 공개 페이지(다른 사용자의 에셋)는 화면으로 분위기만 참고했고 내려받거나 키트에 쓰지 않았다.

최초 파일럿 4건 공통: 도구 `mcp__hyper3d__rodin_generate`(로컬 Claude Code, 인증된 계정), `tier=Gen-2.5-Medium`, `mesh_mode=Quad`, `texture_delight=true`, `geometry_file_format=glb`, 참조 이미지 없음.
산출 파일은 `base_basic_pbr.glb`(PBR). 크레딧은 공식 docs 기준 호출당 0.5(문서 간 충돌 있음: API 랜딩 "From 1 credit"), 4건 합계 약 2.0 크레딧이다. MCP에는 잔액 조회 도구가 없어 실제 소모는 Hyper3D Mine에서 확인해야 한다.

| 용도 | generation_id | quality_override | 결과 수신(UTC) | raw SHA-256 | 원본 크기 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| `top/tee` | `82698064-e736-4b1e-ac56-67f6569bd364` | 15000 | 2026-10-10T18:00Z | `1c60f00ef7f96785525d133fd3dad94fd4a49743709534f216a6277160235a5b` | 8,083,808 B | 28,824 tri. 마네킹 목 조각 동반 |
| `bottom/jeans` | `cb5a2e39-ecf4-4f99-9380-89267264053b` | 10000 | 2026-10-10T18:04Z | `9bda1b6ef110bca7bc562de844508cc74bce9cb862b3068ecc346fd2496b7a92` | 8,722,340 B | 20,084 tri. 마네킹 허리·신발 동반 |
| `shoes/sneakers` | `d6cd1b50-7e9f-401e-a4b4-87bf45b0e336` | 8000 | 2026-10-10T18:15Z | `9ea818e7d93792da0ae1727faf9c9f1d018b2d4c3a3afffeb281b4def66a1684` | 8,985,804 B | 16,130 tri. 한 켤레 |
| `hair/soft-bob` | `3f1040da-6127-4402-98e2-2692cccb2a3d` | 15000 | 2026-10-10T18:16Z | `5fde2b1a24c57ea4242af8ade849795a8b0d6e40342b6a3356e5ad30ceabf4ad` | 9,764,060 B | 27,524 tri. 흉상 동반 |

`display_url`은 `https://hyper3d.ai/workspace/rodin/<generation_id>`이다(로그인한 계정에서만 열린다). 프롬프트 원문과 정리 규칙은 `tools/blender/character_kit/README.md`와 각 스크립트에 있다.

## 8. 남은 저장소 쪽 작업

- 계약 확장(허용 라이선스 값 추가)은 계약·검증기·문서·테스트를 함께 바꾼다. 변경 위치와 근거는 같은 커밋의 본문에 적는다. 값이 늘어도 **법적 허용을 의미하지 않는다** — 증빙 경로와 생성 id가 있어야 V4가 통과하게 해서 이 기록을 건너뛰지 못하게 하는 것이 목적이다.
- 약관이 개정되면 §2의 해시를 갱신하고 §3~§4를 다시 대조한다.

## 9. 파생 파츠 33종 정리 — 증빙 첨부 현황과 격리 결정 (2026-10-14)

라이선스 감사(문제 4) 후속 정리다. 대상은 키트 `provenance.sources` 중 `license="hyper3d-rodin-output"`인 **33종 전부**이며, 전수 목록은 아래 표와 키트 `provenance.hyper3dClearance`(count=33)가 정본이다.

**결정: 증빙을 지어내지 않는다.** 현재 첨부된 것은 사용자 진술(§1·§6 반입 결정 기록)뿐이고, 아래 3종은 **미첨부**다. 그래서 33종을 삭제·교체하지도, 상업 사용 확정으로 표기하지도 않고 **pending-evidence(격리)** 로 표기한다. 키트의 각 source에는 `evidenceStatus="statement-only-pending-evidence"`를, `provenance`에는 `hyper3dClearance.commercialUseCleared=false`를 넣었다.

| # | 증빙 항목 (§6) | 상태 | 첨부 위치·형식 (첨부 시 채울 것) |
| --- | --- | --- | --- |
| 1 | 플랜 증빙: 플랜명 + 결제 기록 보관 위치 | **미첨부** | 플랜명: ____ / 보관 위치: ____ / 확인일: ____ |
| 2 | 계정 보유자 = 발행 주체(에이치준랩스) 일치 | **미확인** | 확인 방법: ____ / 확인일: ____ |
| 3 | 서면 확인(Deemos): 질문 3(수정·파생)·4(공개 호스팅) 포함 | **미수신** | 수신일: ____ / 원문 보관 위치: ____ / 답변 요지: ____ |

**닫는 법(둘 중 하나면 이 항목은 종료된다):**
- (A) 위 1~3이 모두 첨부되면: 이 표의 상태를 갱신하고, 키트 `hyper3dClearance.status`를 `evidence-attached`, `commercialUseCleared`를 답변 범위에 맞게, 각 source의 `evidenceStatus`를 `evidence-attached`로 바꾼다.
- (B) 서면 답변이 부정적이거나 증빙을 얻을 수 없으면: §6-4대로 33종의 GLB를 공개 저장소에서 제거하고 original/CC0 파츠로 교체하며, 키트에서 `hyper3d-rodin-output` 항목을 0개로 만든다. 이때 `defaults`(hair/soft-bob·top/tee·bottom/jeans·shoes/sneakers)가 이 33종을 가리키므로 기본값도 교체 파츠로 함께 바꾼다.

### 9.1 대상 33종 전수 목록

| source id | generationId | evidenceStatus |
| --- | --- | --- |
| `hyper3d-hair-short-layered` | `f63e1379-d77f-4351-9a6d-74ff796ff91a` | statement-only-pending-evidence |
| `hyper3d-hair-soft-bob` | `f2ef0164-fae1-41ac-b321-2b6dd346cb21` | statement-only-pending-evidence |
| `hyper3d-hair-romance-long` | `832d34d6-59d9-449c-8bfd-d490eb472e44` | statement-only-pending-evidence |
| `hyper3d-hair-action-pony` | `49c429e4-3e07-42ac-8382-8adb611bf1b7` | statement-only-pending-evidence |
| `hyper3d-hair-hime-cut` | `555ced0b-d341-4401-ad26-50824a80b2e1` | statement-only-pending-evidence |
| `hyper3d-hair-wolf-layered` | `579b60ac-dff8-42a9-a39e-0b4fa99878c8` | statement-only-pending-evidence |
| `hyper3d-hair-twin-tail` | `ee5b4422-7df7-4fb8-842b-0385146cafab` | statement-only-pending-evidence |
| `hyper3d-top-tee` | `82698064-e736-4b1e-ac56-67f6569bd364` | statement-only-pending-evidence |
| `hyper3d-top-hoodie` | `4949cb5c-98d3-4842-9f05-02dbcf651c61` | statement-only-pending-evidence |
| `hyper3d-top-shirt` | `66101633-05ce-4898-8dd9-8c2dec747424` | statement-only-pending-evidence |
| `hyper3d-top-blazer` | `268c6adf-bb7f-4755-b550-c6aa2bd9bd38` | statement-only-pending-evidence |
| `hyper3d-top-sailor` | `039a2bba-a235-45b7-9bde-296cff7cafcf` | statement-only-pending-evidence |
| `hyper3d-bottom-jeans` | `cb5a2e39-ecf4-4f99-9380-89267264053b` | statement-only-pending-evidence |
| `hyper3d-bottom-shorts` | `454cee0f-eefa-40d1-a59d-56d944c6394a` | statement-only-pending-evidence |
| `hyper3d-bottom-pleated-skirt` | `f12ea410-75bf-4475-a213-198746431395` | statement-only-pending-evidence |
| `hyper3d-bottom-long-skirt` | `e68a0738-cbb4-49c6-8c63-e8e137b8bd32` | statement-only-pending-evidence |
| `hyper3d-bottom-slacks` | `cfda62fb-19a3-4e4a-992f-1c4c52dd68ae` | statement-only-pending-evidence |
| `hyper3d-shoes-sneakers` | `d6cd1b50-7e9f-401e-a4b4-87bf45b0e336` | statement-only-pending-evidence |
| `hyper3d-shoes-loafers` | `347f643a-9d8d-4f13-9b11-4d07305d28ff` | statement-only-pending-evidence |
| `hyper3d-shoes-boots` | `b793c25d-6247-43d9-a040-1be2d82252f8` | statement-only-pending-evidence |
| `hyper3d-shoes-sandals` | `2a7df564-2bd6-49c9-ae0c-e5bdcece8c4f` | statement-only-pending-evidence |
| `hyper3d-accessory-ribbon` | `43d44c7c-1c5d-4f31-83b5-dbc584859567` | statement-only-pending-evidence |
| `hyper3d-accessory-cap` | `da32af22-d1e3-4103-a160-002557e24c2a` | statement-only-pending-evidence |
| `hyper3d-accessory-headphones` | `ca9c78df-affa-4329-b12e-87ba46bd29b6` | statement-only-pending-evidence |
| `hyper3d-top-shirt-male` | `eeaa0eeb-f4fa-4cb5-88a4-d3909bfb8fd3` | statement-only-pending-evidence |
| `hyper3d-top-sailor-male` | `9aa9c672-bae8-4562-b01d-cc52aec04a52` | statement-only-pending-evidence |
| `hyper3d-top-blazer-male` | `c5fc147c-860d-4fd6-be08-ad44753ce3c4` | statement-only-pending-evidence |
| `hyper3d-top-hoodie-male` | `116ca34c-27df-4bd5-8de1-7bf76c24825c` | statement-only-pending-evidence |
| `hyper3d-hair-soft-bob-male` | `6eec895d-0347-468c-a3be-0d0086f1dedb` | statement-only-pending-evidence |
| `hyper3d-hair-short-layered-male` | `f821fc5a-0d1a-4e84-84a4-8793a1ee2c3d` | statement-only-pending-evidence |
| `hyper3d-hair-wolf-layered-male` | `65af7240-df63-4931-8ac1-0d0826328eac` | statement-only-pending-evidence |
| `hyper3d-hair-action-pony-male` | `122f0174-fcc0-4a20-83a6-0745481be836` | statement-only-pending-evidence |
| `hyper3d-hair-romance-long-male` | `02dac44e-f730-453f-aefe-4eb25ddf83f1` | statement-only-pending-evidence |

## 10. 파생 파츠 33종 제외 실행 (2026-10-14)

§9의 정리 갈래 중 (B) 제외를 실행했다. 증빙 3종(생성 당시 유료 플랜 결제 기록, 계정 보유자와 운영 주체의 동일성, Deemos의 서면 확인)은 이 날까지도 확보되지 않았고, 상업 운영 전제에서 증빙 없는 파생 에셋을 계속 싣지 않기로 했다.

실행 내용:

- `kit.json`: provenance.sources에서 `hyper3d-rodin-output` 출처 33개를 제거했다(남은 출처는 CC0-1.0 1개·original 1개). 파생 변형 33개를 제거하고 해당 베이스는 `unavailable` 한글 사유("상업 이용 증빙이 확정되지 않아 제외")로 선언했다. `defaults.slots`의 hair·top·bottom·shoes는 null로, `slotCapabilities`는 베이스별 partial/unavailable + `unavailablePresets`로 갱신했다.
- `kit.json`의 `hyper3dClearance` 키와 출처별 `evidenceStatus` 키는 함께 제거했다. 이 두 키는 계약 스키마(`kitProvenanceSchema`·`kitSourceSchema`, strict)에 선언되지 않아, 편집 전 main의 `kit.json`은 `parseKitManifest` 검증을 통과하지 못하는 상태였다(실측: unrecognized key 34건). 격리 표기의 이력은 이 문서 §9와 이 절이 대신 보존한다.
- `src/contracts/character-kit.ts`: `KIT_REQUIRED_PRESETS`에서 파생 기본 파츠 4종(hair/soft-bob·top/tee·bottom/jeans·shoes/sneakers)을 빼고 `irises/round-large`만 남겼다(검증기가 필수 프리셋의 변형 존재를 강제하므로, 상수를 그대로 두면 파츠 제외 자체가 불가능했다). `KIT_DEFAULT_SLOTS`의 해당 4슬롯은 null로 바꿨다. 관련 테스트 기대값(`character-kit.test.ts` 4곳)도 같은 변경으로 맞췄다.
- 파생 GLB 파일 33개를 저장소에서 삭제한다(아래 목록). 폴더를 순회해 manifest와 대조하는 `scripts/verify-character-kit.mjs` 정합을 위해 파일 삭제는 manifest 변경과 같은 커밋에 넣어야 한다.
- 검증(2026-10-14, main 실물 기준 하네스): 편집본 `kit.json`은 스키마·교차검증을 통과했다(`parseKitManifest` ok). contracts 테스트 94건·appearance-presets 테스트 8건이 전부 통과했다.

삭제하는 파일:

- `parts/female/hair/short-layered.glb`
- `parts/male/hair/short-layered.glb`
- `parts/female/hair/soft-bob.glb`
- `parts/male/hair/soft-bob.glb`
- `parts/female/hair/romance-long.glb`
- `parts/male/hair/romance-long.glb`
- `parts/female/hair/action-pony.glb`
- `parts/male/hair/action-pony.glb`
- `parts/female/hair/hime-cut.glb`
- `parts/female/hair/wolf-layered.glb`
- `parts/male/hair/wolf-layered.glb`
- `parts/female/hair/twin-tail.glb`
- `parts/female/top/tee.glb`
- `parts/female/top/hoodie.glb`
- `parts/male/top/hoodie.glb`
- `parts/female/top/shirt.glb`
- `parts/male/top/shirt.glb`
- `parts/female/top/blazer.glb`
- `parts/male/top/blazer.glb`
- `parts/female/top/sailor.glb`
- `parts/male/top/sailor.glb`
- `parts/female/bottom/jeans.glb`
- `parts/female/bottom/shorts.glb`
- `parts/female/bottom/pleated-skirt.glb`
- `parts/female/bottom/long-skirt.glb`
- `parts/female/bottom/slacks.glb`
- `parts/female/shoes/sneakers.glb`
- `parts/female/shoes/loafers.glb`
- `parts/female/shoes/boots.glb`
- `parts/female/shoes/sandals.glb`
- `parts/female/accessory/ribbon.glb`
- `parts/female/accessory/cap.glb`
- `parts/female/accessory/headphones.glb`

복원 절차: §9의 증빙 3종을 같은 문서에 첨부한 뒤, 이 절의 변경을 되돌린다(출처 33개와 변형 33개 복원, 기본값·필수 집합 복원, GLB 재반입). 생성 id와 원본 해시는 §9 표와 키트 폴더 `NOTICE.md` 원천 3 기록에 보존돼 있다.

남은 확인 사항: `-male` 출처 항목이 없는 남성 변형 15개(hair/hime-cut·hair/twin-tail, top/tee, bottom 5종, shoes 4종, accessory/ribbon·cap·headphones의 남성 변형)는 키트 회계상 33종에 포함되지 않아 이번 제외에서 남겼다. 다만 §7의 기록(남성 청바지 생성 시도 실패 후 로컬 보정 등)상 여성용 파생물을 남성 베이스로 리타깃한 것일 가능성을 배제할 수 없으므로, 소유자가 생성 경위를 확인해 파생으로 판명되면 같은 방식으로 제외할 것을 권한다.
