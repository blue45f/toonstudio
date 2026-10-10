# Hyper3D 생성물 반입 검토와 도구 가용성 기록 (hyper3d-intake-review)

상태: **current (2026-10-10)** — 키트 파츠를 Hyper3D로 생성해 반입하려는 시도의 사전 점검 기록이다.
이 문서는 **법률 자문이 아니다.** 약관 인용은 웹 페이지 추출 도구가 요약·발췌한 결과라 원문과 글자가 다를 수 있으므로,
반입을 결정하기 전에 §3의 URL 원문과 대조하고 그 시점의 약관 스냅샷을 따로 보관해야 한다.
키트 계약의 정본은 `authored-kit-spec.md`이며 이 문서는 그 계약을 바꾸지 않는다.

## 1. 결론 요약

| 항목 | 결과 |
| --- | --- |
| Hyper3D / Blender / Sketchfab / Poly Haven MCP 도구 | 이 세션에는 **하나도 없다**(§2). 따라서 "Hyper3D 도구 목록"은 비어 있다 |
| 파이프라인(생성 → 베이스 리타깃 → 검증기) 실행 | **하지 못했다.** 생성 수단(MCP 또는 API 키), Blender 실행기, 베이스 바디 에셋이 모두 없다 |
| Hyper3D 상업 이용 | 약관상 **구독 플랜에 따라** 허용된다. 무료(ChatAvatar)는 상업 이용 금지(§3) |
| Hyper3D 소유권 | 약관에서 **소유권 귀속을 명시한 조항을 찾지 못했다.** 구매는 "라이선스 부여이지 권리 이전이 아니다"로 적혀 있다 |
| 현재 키트 계약과의 정합 | **충돌한다.** 검증기 V4는 `provenance.license ∈ {CC0-1.0, original}`만 통과시키고, Hyper3D 산출물은 둘 중 어느 것으로도 정직하게 표기하기 어렵다(§4) |

## 2. 도구 가용성 (2026-10-10 세션 실측)

| 확인 대상 | 방법 | 결과 |
| --- | --- | --- |
| Hyper3D MCP | 도구 검색 `hyper3d`, `rodin 3d model generation` | 일치 도구 없음 |
| Blender MCP | 도구 검색 `+blender`, `blender sketchfab polyhaven` | 일치 도구 없음 |
| Sketchfab·Poly Haven MCP | 위와 같은 검색 | 일치 도구 없음 |
| MCP 리소스 | 리소스 목록에서 hyper3d, rodin, blender, sketchfab, polyhaven 검색 | 0건(스킬 리소스뿐) |
| 재확인(사용자 재질문 후) | 이름 기준 도구 검색 `+hyper3d`·`+blender`·`+sketchfab`·`+polyhaven` | 4건 모두 일치 없음. 연결 실패 서버 목록에도 해당 이름이 없다 |
| claude.ai 커넥터 | 커넥터 목록 조회(키워드 hyper3d, blender, 3d, sketchfab, polyhaven, rodin) | 0건 |
| MCP 레지스트리 | 레지스트리 검색(hyper3d, blender, 3d model, sketchfab, poly haven) | 해당 항목 없음. 3D 관련으로는 Trimble SketchUp(미설치, SketchUp 전용)만 나온다 |
| 저장소의 Blender MCP | `tools/blender/toonstudio_blender_kit/mcp.py` | 허용 명령 7개(`inspect_character`·`build_authored_hair`·`create_semantic_face_shapes`·`render_quality_views`·`validate_character`·`export_character_package`·`run_pipeline`). README가 "asset download, package install" 불가·network permission 미요청이라고 명시한다. **Hyper3D 대체가 아니다** |
| Blender 실행기 | `which blender` | 없음 |
| `bpy` 모듈 | `pip index versions bpy` | 5.2.2 등 휠이 조회됨. **설치·실행은 하지 않았다(미검증)** |
| 자격증명 | 환경변수 이름 검색(`hyper3d`·`rodin`·`sketchfab`·`polyhaven`·`blender`), `.env.infrastructure.local` 존재 여부 | 둘 다 없음 |
| Poly Haven REST | `GET https://api.polyhaven.com/types` 등 | 200. 모델 521개, 카테고리에 의류 없음(`c=clothes` 결과 0건), `rigged` 15개 |
| Sketchfab 공개 검색 | `GET https://api.sketchfab.com/v3/search?type=models&q=jacket&downloadable=true` | 200. 응답의 `license.label`로 CC0 표기 모델이 존재함을 확인. **다운로드 API의 인증 요건은 이 세션에서 확인하지 않았다** |
| Hyper3D 사이트 | `GET https://hyper3d.ai/` | 200 |
| 베이스 바디 원본 | `HEAD` Blender Foundation Human Base Meshes Bundle v1.4.1 zip(`authored-kit-spec.md` 3.8절 출처) | 200, 50,643,039 B. **내려받지 않았고 SHA-256 대조도 하지 않았다** |

재현: 위 `GET`/`HEAD`는 프록시 환경(`HTTPS_PROXY`, CA `/root/.ccr/ca-bundle.crt`)에서 `curl -sS`로 실행했다.

## 3. Hyper3D 약관 검토

출처(2026-10-10 조회, 개정일 미표기):

- 이용약관: <https://hyper3d.ai/legal/terms> — 페이지에 "Current version"만 있고 개정일이 없다. 푸터는 "© 2026 Deemos Corporation".
- 저작권 라이선스: <https://hyper3d.ai/legal/copyright-license> — `[Price]`·`[Term]`·`[module]` 같은 **빈 자리표시자가 남아 있다.**
- 요금: <https://hyper3d.ai/pricing>, API: <https://hyper3d.ai/features/api> (이번에는 조회하지 않았다)

발췌(추출 도구 인용, 원문 대조 필요):

| 주제 | 조항 | 내용(발췌) |
| --- | --- | --- |
| 상업 이용 | 이용약관 §2 | "export such Content for private or commercial use depending on your subscription plan" |
| 무료 사용자 | §5(a) ChatAvatar | "for your personal entertainment use" / "Users shall not use the Content for commercial purpose" |
| 유료 구매 | §5(a) | 구매한 Output과 파생물을 "promotional, advertising, commercial" 용도로 쓸 수 있다 |
| Rodin Output | §5(b) | "we will not limit your use of such Output, subject to any restrictions set forth in these Agreements" |
| 상업 이용 제한 | §6.3 | "sell, resell or commercially use the Content, except as expressly permitted by us or our licensors" |
| 소유권 | — | **소유권 귀속 문장을 찾지 못했다.** §5(a)는 비독점·개인·제한·취소 가능·양도 불가·재허락 불가 라이선스를 말한다 |
| 구매의 성격 | 저작권 라이선스 §2.2 | "Each purchase constitutes a grant of a license, not a transfer of title." |
| 구매 라이선스 범위 | 저작권 라이선스 §2.1 | 전 세계·비재허락·비독점, 판매·재배포·수정·게시 가능, 단 경쟁 서비스 제작 금지 |
| 저작권성 | §5 | "we make no representations, warranties or undertakings of any kind as to the copyrightability of any Output" |
| 회사의 사용 | §5 "Our Right to Prompts and Output" | 서비스 제공·개선·연구에 사용, 자동/수동 검토·제3자 업체 처리. 비공개 Output은 "apart from displaying it in your Account" 외에는 쓰지 않는다 |
| AI 학습 금지 | §6.3, 저작권 라이선스 §2.3 | 경쟁·유사 AI 모델 학습·개선에 쓰는 것을 금지 |
| 제3자 권리 | §5, §9 | 침해 책임은 사용자 부담("We take no responsibility for any infringement of third party rights"), 사용자가 면책 의무 |
| 환불 | §4.4 | AI 서비스는 환불되지 않는다 |
| 준거법 | 저작권 라이선스 §7.4 | 중화인민공화국 법 |
| API 전용 조항 | — | 이용약관에서 **찾지 못했다** |

해석상 열려 있는 것(확정하지 못했다):

1. 어느 플랜부터 상업 이용이 되는지, API(MCP) 호출분이 같은 권리를 받는지는 요금 페이지·계정 플랜으로 확인해야 한다.
2. 저작권 라이선스 페이지가 Rodin 산출물에 적용되는지, 빈 자리표시자가 있는 상태에서 효력이 있는지 불명확하다.
3. 소유권이 사용자에게 귀속되는지 문서로 확인되지 않았다. 확인되지 않은 것을 "소유"로 기록하지 않는다.

## 4. 현재 키트 계약과의 충돌

- 검증기 V4: `license ∈ {CC0-1.0, original}`, 다운로드 소스는 `https` URL + `zipSha256` (`authored-kit-spec.md` 9절).
- 앱 규칙: 상업 이용 가능 라이선스는 MIT/Apache-2.0/BSD/ISC/Zlib/CC0만, 모든 프리셋은 `license: "original"` (`apps/character-lab/AGENTS.md` §4).
- Hyper3D 산출물은 CC0가 아니고, 소유권이 명시되지 않은 사유 라이선스(플랜 조건부)라서 `original`로 적으면 사실과 다를 수 있다.

따라서 Hyper3D 산출물을 키트에 넣으려면 **사람의 결정**이 먼저 필요하다. 필요한 것:

1. 상업 이용을 허용하는 유료 플랜 증빙(플랜명·결제 기록)과 생성 시점의 약관 스냅샷 보관 위치.
2. `KIT_ALLOWED_LICENSES`·V4·`kit.json` provenance에 해당 라이선스 종류를 추가할지 결정(core의 `contracts/` 변경이며 이 문서의 범위 밖).
3. 위 결정이 나기 전에는 Hyper3D 산출물을 `public/assets/characters/**`에 커밋하지 않는다.

## 5. 기술 적합성 (검증기 기준)

Hyper3D(Rodin)로 만든 의상 후보가 키트 파츠가 되려면 아래를 충족해야 한다. **Rodin 산출물이 실제로 어떤 구조인지는 이 세션에서 생성해 보지 못해 확인하지 않았다.**
정적 메시 + 구워진 텍스처로 나오는 것이 일반적이라고 알려져 있으나 미검증이며, 그 경우 아래 항목 대부분이 리타깃 단계의 작업이 된다.

| 검증기 | 요구 | 리타깃 단계에서 필요한 작업 |
| --- | --- | --- |
| V6·V8 | 모든 GLB의 `skin.joints`가 68개 이름 배열과 동일, 정점당 영향 ≤ 4, 가중치 합 1 | 베이스 스켈레톤에 스킨 웨이트 전이 |
| V9 | 의상 정점이 몸 체형·얼굴 morph를 따라감(경고 5 mm / 오류 15 mm), `KIT_MORPH_COVERAGE` 충족 | 베이스 morph를 의상에 전이 |
| V10·V16 | `bodyRegions`·`hides`·필수 프리셋 | 가릴 몸 영역 선언 |
| V11 | 상의·하의 각 ≤ 25,000 삼각형, 파츠 GLB ≤ 1.5 MiB | 리메시·텍스처 축소 |
| V13 | recolor 재질: `baseColorFactor ≈ [1,1,1,1]`, 텍스처 평균 휘도 ≥ 0.75, ORM 텍스처 없음 | 텍스처를 "상대색"으로 재베이크 |
| V15 | `_Outline` 접미 메시 없음 | — |

선행 조건: `public/assets/characters/toonstudio-kit-v1/`가 아직 없으므로 **베이스 바디(리깅된 68 joint) 자체가 먼저 필요**하다.
베이스 소스는 계약상 Blender Foundation Human Base Meshes Bundle v1.4.1(CC0)이며 내려받기는 가능하다(§2).

## 6. 진행 선택지 (사용자 결정 대기)

| 안 | 내용 | 필요한 것 |
| --- | --- | --- |
| A | Hyper3D·Blender MCP를 연결한 **새 세션**에서 이어간다 | <https://claude.ai/customize/connectors>에서 연결(커넥터는 세션 시작 시 읽히므로 새 세션이 필요). 유료 플랜 증빙, §4의 라이선스 결정. 로컬 Blender에 붙는 형태의 MCP는 클라우드 컨테이너에서 닿지 않을 수 있다(일반적 구조이며 이 세션에서 확인하지 않았다) — 그 경우 로컬 세션에서 하거나 컨테이너에 headless Blender를 설치해야 한다 |
| B | CC0 원천만 사용: Human Base Meshes(CC0)로 베이스를 다시 만들고, Sketchfab CC0 의상 후보(다운로드 토큰 필요)로 리타깃 파이프라인을 검증한다. Poly Haven은 의상이 없어 HDRI·소품 용도에 한정된다 | 클라우드 환경 설정(Network secrets 또는 환경변수)에 읽기 전용 토큰 저장 — 이 문서는 `SKETCHFAB_API_TOKEN`, `HYPER3D_API_KEY` 이름을 읽는 것으로 가정한다. **토큰을 채팅에 붙여넣지 않는다.** 새 세션부터 반영된다. `bpy` 설치 가능 여부는 별도 확인 |
| C | 이전처럼 절차 생성(`license: original`)으로 의상을 만들고 Hyper3D는 참고 이미지 생성 등 비산출물 용도로만 쓴다 | 없음(계약과 정합) |

## 7. 이번 세션에서 하지 않은 것

- Hyper3D·Sketchfab·Poly Haven 어느 쪽으로도 모델을 생성하거나 내려받지 않았다.
- Blender·`bpy`를 설치하거나 실행하지 않았다.
- `public/assets/**`, 계약(`src/contracts/**`), 검증기를 수정하지 않았다.
- `pnpm run verify:character-kit`은 대상 에셋이 없어 실행하지 않았다.
