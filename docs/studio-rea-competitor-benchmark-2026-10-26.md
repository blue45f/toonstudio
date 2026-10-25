# ToonStudio 경쟁사 바이너리 역공학(REA) 정밀 벤치마크 및 전 기능 통합 보고서 (2026-10-26)

- 상태: **역사 자료 / 검증 증거 (현재 구현 동기화)**
- 작성일: **2026-10-26**
- 정적 분석 증거 번들: [`docs/evidence/rea-competitor-benchmark-20261026.json`](evidence/rea-competitor-benchmark-20261026.json)
- 연동 문서: [`docs/studio-competitor-features.md`](studio-competitor-features.md)

---

## 1. 개요 및 조사 방법론

본 문서는 `reverse-engineer-anything`(REA MCP) 정적 바이너리·매니지드 어셈블리·번들 리소스 및 웹 런타임 캡처 분석 도구를 사용하여 로컬 워크스테이션 및 웹 환경의 웹툰·드로잉·3D 건축/배경·공간 아이디어 보드 경쟁사 애플리케이션 6종(**NAVER WEBTOON / Studio HORANG `SHAPER` v1.05**, **Goodnotes v7.1.28**, **Muse v9.0**, **SketchUp (`openskp@1.3.0` `.skp` 엔진 · SketchUp for Web · 3D Warehouse)**, **Blender**, **Clip Studio Paint**)을 전수 조사한 정밀 역공학 보고서다.

`reverse-engineer-anything` 분석 원칙에 따라 모든 조사 결과는 다음 세 층위로 엄격히 분리해 기술한다.

1. **Observed Facts (관측 사실)**: 아티팩트 바이트 및 웹 시나리오 캡처에서 직접 추출된 SHA-256 다이제스트, REA `evidence_id`, CLI/PE 모듈 MVID, 메타데이터 테이블 카운트(Types, Fields, Methods, User Strings), JS AST 노드 수, 번들 엔트리 및 `Info.plist`/프레임워크/UTI/TLV 태그 선언.
2. **Inferences (설계 의도 및 알고리즘 구조 추론)**: 관측된 심볼·메서드 시그니처·바이너리 TLV 태그·번들 프레임워크 조합으로부터 도출한 데이터 파이프라인 및 수학적/기하학적 처리 구조. 정적 분석을 런타임 실행 관찰로 과장하지 않는다.
3. **Unknowns (미확정 및 정적 분석 경계 밖 영역)**: 외부 비공개 AI 서버 엔드포인트, 인증이 필요한 클라우드 WASM CAD 커널 내부 심볼, 실시간 네트워크 세션 스케줄링 등 정적 아티팩트 및 비인증 캡처만으로는 확정할 수 없는 영역.

---

## 2. 분석 대상 아티팩트 및 REA 증거 원장 (Observed Artifacts Ledger)

| 대상 제품 | 아티팩트 역할 및 로컬/웹 경로 | SHA-256 다이제스트 | REA `evidence_id` 및 식별자 | 정적/웹 관측 요약 |
| --- | --- | --- | --- | --- |
| **SHAPER v1.05** (`com.StudioHORANG.SHAPER`, Build 9, Unity `6000.0.45f1`) | 런처 앱 번들 (`/Applications/ShaperLauncher.app`) | `aabc7468b19fbb45670160c591c58061513ceaeec3696034d13af8862c276946` | 번들: `ev_547d712461a692d7c287dfde9ceca36c6ce939f1cb7631a77f148d5d5460b54e`<br>`Info.plist`: `ev_f193e72a2d53737aa83790307fcfaab28bdd61eaecb50c2bc8192e7d963ae396` | macOS 런처 번들 및 버전·패키지 메타데이터 |
| **SHAPER v1.05** | 설치 아카이브 (`/Users/hjunkim/Downloads/ShaperInstaller.zip`) | `51eeebe357a2abee41b7489326b6ea0eb983cc0edb7ea00f99a72a78d5cfbd7a` | `ev_cfad1062768ae741e7fd9bfa358d41a9526f684737ef557d627ac3ce93f33231` | Unity `6000.0.45f1` 플레이어 및 Managed DLL 배포판 |
| **SHAPER v1.05** | 코어 매니지드 어셈블리 (`Assembly-CSharp.dll`) | `cfb9e2ad3aee04fe6a7beaf7e27d9ec69abc1bfd54e5adfd0fbfd4144e3c189d` | `ev_e827f1b21d6d3ffeb98e413b528fa6f4369bc578553586a66210e5acfadbf541`<br>`MVID`: `e8c33afa-b619-4099-8781-1550b5efef1f` | **263 types**, **2,049 fields**, **1,770 methods**, **1,225 user strings** |
| **SHAPER v1.05** | IK 매니지드 어셈블리 (`Assembly-CSharp-firstpass.dll`) | `727a6709d24a4b6e430f8e84625a8ba29dd9a8c10295a478f3f467dd364f0f2f` | `ev_05afbfd2088fad00b621358cf76ebe291e4dfb25b9109e32530fa5e4cf7c4328`<br>`MVID`: `1c4a69b8-dea1-422e-a237-95b73a63a1eb` | **325 types** (RootMotion FinalIK 솔버 계층) |
| **SHAPER v1.05** | 로컬 프리셋·모델 라이브러리 (`/Users/hjunkim/Library/Application Support/com.StudioHORANG.SHAPER`) | `00430c2903c90b949b41dfc3c4408d1744ac40d8f8bbf2ecf2ed40dcc2e65ef1` | `ev_49b3f622771d933b42b42b3b6b21e4fed2de067fc93e65f6dcce8a7b7b9b32f7` | **353 entries** (체형·얼굴·헤어·포즈·통합 프리셋 및 에셋) |
| **Goodnotes v7.1.28** (`com.goodnotesapp.x`) | 앱 번들 (`/Applications/Goodnotes.app`) | `7edabaf7283dd1f78f7337c439ba7178937469d61b03d9a279b7743e05756a45` | `ev_ef24d6b378cefd65bbb87b216ae5eeaaef44e8060c26dcb00f1b776f71562a81` | **5,017 entries**, 8개 핵심 필기·동기화·추론 프레임워크 내장 |
| **Muse v9.0** (`com.meta.endo`) | 앱 번들 (`/Applications/Muse.app`) | `8958f759ebbe8ba62881ac0ab2891d42143a67a2216a3f76d40cbf12637048fb` | `ev_122f930c82d3a1cd656b8aae3735288c991df6759b7d49089208c0a9dffcee14` | **353 entries**, `com.meta.prototypes.endo.attachment-reference` UTI |
| **SketchUp `.skp` 엔진** (`openskp@1.3.0`) | `.skp` VFF/CArchive 파서·작성기 패키지 (`node_modules/.pnpm/openskp@1.3.0/node_modules/openskp`, `dist/index.js`) | 패키지: `513f2eeaa30e1b5b0543b036125459340921a0dded17b281c523c6095e479c10`<br>`dist/index.js`: `3b4a418e320920083aefa7551a924954b336e5addd0182971c7c66aeab575c2d` | 부모: `ev_4bcff28953cf3f65fa0e78f7684bb1679839e674fec42c04aa1cd9115e976b6c`<br>요약: `ev_963c8508f0ea01c5400588a48cdf508b99c0f5f642a9591f64bfdeea92d8742f`<br>모듈: `ev_3bd2e3e1c727118d6de6129dda13bfbe634ca7451dc39080e3176ba375c6a59f`<br>`dist/index.js`: `ev_a1d0b81b0db0d09672067f12696131418b183628537ddf7d542d4b8a0211be3a` | **165,303 AST nodes**, **252 symbols**, **67 exports**, VFF(2021+)·MFC CArchive(2013–2020) 파서 및 `SkpBuilder` 작성기 |
| **SketchUp for Web** (`https://app.sketchup.com/app`) | 웹 애플리케이션 시나리오 캡처 및 번들 스크립트 | 시나리오: `086bf14098ce35b64ded78d464a4421e9d3f7372ffac989a6335f6b7c8810bc8`<br>매니페스트: `0a051227f3437d95e912346df69e288830a87cf95c4761c754b0733458b84e53`<br>JS 번들: `b52af02d32fb1c214aafe5fabb4cf469a41b58cc86bcd60e75567d2ce8673b66` | 캡처: `ev_752234ac45258e8b72f1ee5ab0f07944e41e5f6d0f7ec476c01bd9834906bb34`<br>스크립트: `ev_fe055e1d7cc22132e6d1ebae3e7a9317b5e8034d8e1a47c90ca435e39a5263a3`<br>JS 분석: `ev_4abf8ca26ecdb0337e239039d980a0fa3048481430a9d19dccbf07a4e48922ca` / `ev_a297449a22a2155a03b6fb4f59d7e744a20fd193eaa1392d89ee410d9906839f` | **6 parsed JS files**, **30,965 AST nodes**, **211 findings**, Trimble Identity OAuth 게이트 및 엔트리 부트스트랩 |
| **SketchUp 3D Warehouse** (`https://3dwarehouse.sketchup.com/`) | 3D 에셋 카탈로그 웹 시나리오 캡처 및 번들 스크립트 | 시나리오: `3b3b02fdddd8cba5ed76a929c6415ddfba7d34d344ff33c579fcb18331e0babd`<br>매니페스트: `96680f84dc4957b4732116d35190dd7b78a9cb87866db0fc6d84fd46efa17743`<br>JS 번들: `5085d2fabdedb8c65fda7b90df4f7548289ff4f230a4f61675cf5c580e39285c` | 캡처: `ev_779709fd7cf7ee2b8f705e92874a2530f1b3c50f70179bf85cb997234ea3d731`<br>스크립트: `ev_6a073f33c017e2950eaac77c8759d1eb1f5adcc098352f5ff0f340d0a7f938fc`<br>JS 분석: `ev_39ef5b3ec2a1a0e33b9b59f522d37d8eea5c90d3c06ead85284f397e618396a7` / `ev_aaf096b1e5b182d542b7604ecc3fb0c5d78eeda75f7c3eb136da96502f59618d` | **5 parsed JS files**, **15,869 AST nodes**, **95 findings**, 3D 에셋 카탈로그·메타데이터 구조 |
| **Blender** | 앱 번들 (`/Applications/Blender.app`) | `2953cb9ce0fe00a6a013c72367b56234add9b93611daf6172ec0ab030b5cc4a9` | `ev_55cbde6a15c7f2ce78ea73adf6cbf4082156856b4d3427700d81c610b2201819` | 3D NPR/그리스펜슬·카메라·멀티패스 합성 비교 기준선 |
| **Clip Studio Paint** | 지원 디렉터리 (`/Library/Application Support/CELSYS/CLIPStudio`) | `b3b5ccce892de714bf4b078aadbc7fdd435618f1416ac682d6e4dbf83201b1cf` | `ev_30f45051a6f11ff0152d794701d8736f37b6f6088876afd7d2a8051d806f4e4c` | 웹툰 소재·PSD 레이어 호환성 비교 기준선 |

---

## 3. 대상별 정밀 역공학 분석 (Observed Facts / Inferences / Unknowns)

### 3.1 NAVER WEBTOON / Studio HORANG `SHAPER` v1.05 (Build 9, Unity `6000.0.45f1`)

#### A. Observed Facts (관측 사실)
- **번들 및 설치 파일 식별**:
  - `/Applications/ShaperLauncher.app` (`SHA-256: aabc7468b19fbb45670160c591c58061513ceaeec3696034d13af8862c276946`, `evidence_id: ev_547d712461a692d7c287dfde9ceca36c6ce939f1cb7631a77f148d5d5460b54e`, `Info.plist: ev_f193e72a2d53737aa83790307fcfaab28bdd61eaecb50c2bc8192e7d963ae396`)
  - `/Users/hjunkim/Downloads/ShaperInstaller.zip` (`SHA-256: 51eeebe357a2abee41b7489326b6ea0eb983cc0edb7ea00f99a72a78d5cfbd7a`, `evidence_id: ev_cfad1062768ae741e7fd9bfa358d41a9526f684737ef557d627ac3ce93f33231`)
  - 로컬 데이터 저장소 `/Users/hjunkim/Library/Application Support/com.StudioHORANG.SHAPER` (`SHA-256: 00430c2903c90b949b41dfc3c4408d1744ac40d8f8bbf2ecf2ed40dcc2e65ef1`, `evidence_id: ev_49b3f622771d933b42b42b3b6b21e4fed2de067fc93e65f6dcce8a7b7b9b32f7`, 총 `353`개 엔트리)
- **매니지드 어셈블리 메타데이터 테이블**:
  - `Assembly-CSharp.dll` (`SHA-256: cfb9e2ad3aee04fe6a7beaf7e27d9ec69abc1bfd54e5adfd0fbfd4144e3c189d`, `MVID: e8c33afa-b619-4099-8781-1550b5efef1f`, `evidence_id: ev_e827f1b21d6d3ffeb98e413b528fa6f4369bc578553586a66210e5acfadbf541`): 총 **263개 TypeDef**, **2,049개 FieldDef**, **1,770개 MethodDef**, **1,225개 User Strings** 관측.
  - `Assembly-CSharp-firstpass.dll` (`SHA-256: 727a6709d24a4b6e430f8e84625a8ba29dd9a8c10295a478f3f467dd364f0f2f`, `MVID: 1c4a69b8-dea1-422e-a237-95b73a63a1eb`, `evidence_id: ev_05afbfd2088fad00b621358cf76ebe291e4dfb25b9109e32530fa5e4cf7c4328`): `RootMotion.FinalIK` 네임스페이스 산하 **325개 TypeDef**(`FullBodyBipedIK`, `LookAtIK`, `AimIK`, `FABRIK`, `CCDIK`, `RotationLimit*` 등) 관측.

| 서브시스템 분류 | 관측된 핵심 도메인 구조 / 심볼 및 유저 스트링 패턴 (`ev_e827f1b2...`, `ev_49b3f622...`) | 관측된 데이터/연산 특징 |
| --- | --- | --- |
| **네이티브 프리셋 코덱** | `shape_preset`, `hair_preset`, `total_preset`, `pose_preset`, `face_preset` JSON/바이너리 슬롯 구조 및 프리셋 직렬화 필드 | 신체 부위별 모디파이어 키-값, 파츠 슬롯 ID, 색상·재질 파라미터, 버전 헤더 분리 저장 |
| **체형·얼굴 모디파이어** | `SkinnedMeshRenderer` BlendShape 가중치 배열 및 본(`Transform`) 로컬 스케일/위치/회전 오프셋 테이블 | 좌우 대칭(L/R 미러링), 부위별 클램핑, 부모-자식 본 스케일 역보정(Scale Compensation) |
| **두피 헤어 심기 (Hair Planting)** | 두피 콜라이더 레이캐스트 히트 포인트·표면 법선(Normal) 기반 헤어 스트랜드/카드 부착 및 베지어 제어점 | 브러시 반경 내 밀도 제어, 모근 법선 정렬, 중력·컬(Curl)·끝단 테이퍼(Taper) 파라미터 |
| **무게중심 펜선 (Barycentric Pen Line)** | 메쉬 삼각형 인덱스(`triangleIndex`) + 무게중심 좌표(`barycentricCoordinate: u, v, w`) + 법선 오프셋 기반 3D 표면 스트로크 | 블렌드셰이프나 본 회전으로 메쉬가 변형되어도 정점 가중합을 따라 펜선이 표면에 밀착 유지됨 |
| **안구 심 마스크 (Eyeball Seam Mask)** | 안구(`Eyeball`) 메쉬와 안와(`EyeSocket`/꺼풀) 경계 스텐실·거리 기반 심(Seam) 마스킹 및 홍채 투영 | 웹툰 반측면·측면 각도에서 안구 구체가 눈꺼풀 밖으로 튀어나오거나 외곽선이 이중으로 그려지는 현상 억제 |
| **툰 셰이더 & 카메라 컨트롤러** | 셀 셰이딩 램프 임계값, 그림자 색조, 림라이트, 거리 연동 윤곽선 두께, FOV(원근↔직교 근사) 카메라 리그 | 망원 압축(낮은 FOV)으로 웹툰 작화풍 비율을 유지하면서 카메라 거리 변화 시 선 굵기 일정 유지 |
| **멀티패스 PSD 익스포터** | 렌더 타깃 패스 분리(`Line`, `BaseColor`, `Shade`, `Specular`, `RimLight`, `Depth`, `PartMask`) 및 PSD 레이어 합성 | Clip Studio Paint / Photoshop에서 즉시 후보정 가능한 레이어 트리 및 알파 채널 출력 |
| **AI/규칙 기반 본·체형 프리셋** | 캐릭터 아키타입(연령대, 성별, 체격, 장르 태그)과 본 스케일·블렌드셰이프 벡터 간 매핑 테이블 | 슬라이더 수십 개를 개별 조작하기 전에 목표 캐릭터 인상을 즉시 초기화 |

#### B. Inferences (설계 의도 및 알고리즘 구조 추론)
- **3D 메쉬 변형 불변(Deformation-Invariant) 작화 보조선**: 일반 3D 뷰포트 위 2D 화면 공간 오버레이는 카메라를 조금만 회전하거나 표정 블렌드셰이프를 바꾸면 선이 어긋난다. SHAPER가 스트로크 샘플을 `(triangleIndex, barycentric u/v/w, normalOffset, pressureWidth)` 튜플로 저장하는 것은, 변형 후 정점 $(V_0', V_1', V_2')$에 대해 $P' = u V_0' + v V_1' + w V_2' + d \cdot \hat{N}'$로 재평가함으로써 **포즈·표정 변경 후에도 쇄골선·근육선·주름 보조선이 3D 캐릭터 표면에 완전히 고정**되도록 설계한 것이다.
- **안구-안와 비사실적(NPR) 교차 해법**: 웹툰풍 얼굴은 눈이 크고 평면적이어서 구형 안구를 그대로 회전시키면 눈꼬리 틈새(Seam)나 외곽선 겹침이 발생한다. 안구 경계 SDF(부호 거리장) 및 안와 스텐실 마스크를 결합해 안구 외곽선 패스를 선택적으로 감쇠시키는 구조로 추론된다.
- **IK 계층과 도메인 계층의 이중 어셈블리 분리**: `Assembly-CSharp-firstpass.dll`에 325개 FinalIK 타입을 고정하고 `Assembly-CSharp.dll`(263개 타입)에서 캐릭터 모디파이어·프리셋·렌더 패스를 다루어, IK 솔버 연산과 웹툰 작화 UI의 결합도를 낮추었다.

#### C. Unknowns (미확정 영역)
- **외부 비공개 AI 서버 엔드포인트**: 런처 인증 이후 연결될 수 있는 외부 비공개 AI 서버 엔드포인트의 실시간 추론 모델 아키텍처, 서버 측 가중치 및 과금 정책은 로컬 정적 바이너리에 포함되지 않으므로 미확정(Unknown)으로 분류한다.

---

### 3.2 Goodnotes v7.1.28 (`com.goodnotesapp.x`)

#### A. Observed Facts (관측 사실)
- **아티팩트 식별**:
  - `/Applications/Goodnotes.app` (`SHA-256: 7edabaf7283dd1f78f7337c439ba7178937469d61b03d9a279b7743e05756a45`, `evidence_id: ev_ef24d6b378cefd65bbb87b216ae5eeaaef44e8060c26dcb00f1b776f71562a81`, 총 **5,017 entries**).
- **관측된 핵심 내장 프레임워크 (`Contents/Frameworks/`)**:
  1. `BaselineEstimation.framework`
  2. `HandwritingBeautificationCore.framework`
  3. `HandwritingCommon.framework`
  4. `HandwritingSynthesis.framework`
  5. `BeamSearchLibrary.framework`
  6. `GNSVG2PDF.framework`
  7. `gnyjsFFI.framework`
  8. `OnnxRuntimeBindings.framework`

#### B. Inferences (설계 의도 및 알고리즘 구조 추론)
- **기준선 추정(`BaselineEstimation`) + 필기 미화(`HandwritingBeautificationCore`) 2단계 파이프라인**:
  - 사용자가 자유롭게 쓴 손글씨 스트로크 군집에서 먼저 `BaselineEstimation`이 단어/문장 단위의 기준선 기울기(Slope), 행간, 자간 및 x-height 대역을 추정한다.
  - 이어서 `HandwritingBeautificationCore`가 원본 필압과 획 순서를 보존하면서 각 스트로크의 기준선 편차를 줄이고, 획 끝단 떨림(Jitter) 완화 및 자모 크기 균일화를 수행한다.
  - 웹툰 제작에서는 손글씨 대사(일상툰·개그컷 손글씨)와 수작업 효과음(SFX) 레터링 시 작가의 개성 있는 필체는 살리면서 말풍선 안의 줄 맞춤과 가독성을 자동으로 정돈하는 데 직결된다.
- **Yjs FFI(`gnyjsFFI`) 기반 로컬 우선 CRDT 동기화**: ToonStudio가 채택한 Yjs CRDT 문서 권위 구조와 동일한 방향성으로, 대량 벡터 스트로크의 충돌 없는 병합을 네이티브 바인딩으로 처리한다.

#### C. Unknowns (미확정 영역)
- Goodnotes 전용 클라우드 백엔드 API의 비공개 인증 핸드셰이크 및 암호화된 온디바이스 모델의 학습 코퍼스 세부 내역은 정적 번들 인벤토리 범위 밖이다.

---

### 3.3 Muse v9.0 (`com.meta.endo`)

#### A. Observed Facts (관측 사실)
- **아티팩트 식별**:
  - `/Applications/Muse.app` (`SHA-256: 8958f759ebbe8ba62881ac0ab2891d42143a67a2216a3f76d40cbf12637048fb`, `evidence_id: ev_122f930c82d3a1cd656b8aae3735288c991df6759b7d49089208c0a9dffcee14`, 총 **353 entries**).
- **관측된 타입 선언 및 번들 특성**:
  - `Info.plist` 내 `com.meta.prototypes.endo.attachment-reference` UTI(Uniform Type Identifier) 선언 관측.
  - 공간 캔버스 카드, 잉크 스트로크, 첨부 레퍼런스 아이템을 동일 좌표 공간에서 다루는 리소스 구조 확인.

#### B. Inferences (설계 의도 및 알고리즘 구조 추론)
- **자유 올가미(Freeform Lasso) 기반 이종 객체(잉크 + `attachment-reference`) 클러스터링**:
  - Muse의 핵심 UX는 경직된 폴더 트리 대신 2D 공간 보드 위에 레퍼런스 이미지·문서 조각(`attachment-reference`)과 자유 스케치 스트로크를 흩어 놓고, **올가미(Lasso) 폐곡선 안에 들어온 레퍼런스 카드와 필기 주석을 즉시 하나의 공간 클러스터로 묶어 이동·정렬·스냅샷 비교**하는 것이다.
  - 웹툰 콘티·세계관 설정 단계에서 캐릭터 레퍼런스 시트, 배경 사진, 연출 메모 스트로크를 올가미 한 번으로 그룹화·정렬·컷 인계하는 워크플로우에 직접 대응된다.

#### C. Unknowns (미확정 영역)
- Muse 원격 동기화 서버의 멀티 디바이스 세션 중재 프로토콜은 정적 번들 분석 범위 밖이다.

---

### 3.4 Blender & Clip Studio Paint 교차 기준선

#### A. Observed Facts (관측 사실)
- **Blender (`/Applications/Blender.app`)**: `SHA-256: 2953cb9ce0fe00a6a013c72367b56234add9b93611daf6172ec0ab030b5cc4a9`, `evidence_id: ev_55cbde6a15c7f2ce78ea73adf6cbf4082156856b4d3427700d81c610b2201819`.
- **Clip Studio Paint (`/Library/Application Support/CELSYS/CLIPStudio`)**: `SHA-256: b3b5ccce892de714bf4b078aadbc7fdd435618f1416ac682d6e4dbf83201b1cf`, `evidence_id: ev_30f45051a6f11ff0152d794701d8736f37b6f6088876afd7d2a8051d806f4e4c`.

#### B. Inferences (설계 의도 및 알고리즘 구조 추론)
- SHAPER의 멀티패스 PSD 출력과 3D 표면 펜선 구조는 Blender의 Grease Pencil surface projection / NPR Render Passes와 Clip Studio Paint의 웹툰 선화·채색 분리 레이어 관행을 단일 웹툰 캐릭터 특화 파이프라인으로 압축한 형태다.

---

### 3.5 SketchUp (`openskp@1.3.0` `.skp` 바이너리 포맷 엔진 · SketchUp for Web · 3D Warehouse)

#### A. Observed Facts (관측 사실)
- **OpenSKP `1.3.0` `.skp` VFF/CArchive 바이너리 엔진 정적 분석**:
  - 패키지 경로: `node_modules/.pnpm/openskp@1.3.0/node_modules/openskp` (`SHA-256: 513f2eeaa30e1b5b0543b036125459340921a0dded17b281c523c6095e479c10`, 부모 `evidence_id: ev_4bcff28953cf3f65fa0e78f7684bb1679839e674fec42c04aa1cd9115e976b6c`, 요약 뷰: `ev_963c8508f0ea01c5400588a48cdf508b99c0f5f642a9591f64bfdeea92d8742f`, 모듈 뷰: `ev_3bd2e3e1c727118d6de6129dda13bfbe634ca7451dc39080e3176ba375c6a59f`).
  - 번들 엔트리: `dist/index.js` (`SHA-256: 3b4a418e320920083aefa7551a924954b336e5addd0182971c7c66aeab575c2d`, `evidence_id: ev_a1d0b81b0db0d09672067f12696131418b183628537ddf7d542d8a0211be3a` / `ev_a1d0b81b0db0d09672067f12696131418b183628537ddf7d542d4b8a0211be3a`) — **165,303개 AST 노드**, **252개 내부 심볼**, **67개 export 심볼** 관측.
  - 관측된 핵심 바이너리 TLV 태그 및 파서/빌더 구조:
    - **Scene(`Page`) & Camera TLV**: `CA3A`(`camera` eye/target/up/fov/parallel/orthoHeight), `A37A`(`hiddenLayers`), `_parse_pages`를 통해 SketchUp Z-up 인치 좌표계(`eye`, `target`, `up`) 및 투영 모드(`parallel` 평행 투영, `orthoHeight`, `fov`), 씬별 숨김 레이어 목록 복원.
    - **Tag(`Layer`) TLV**: `8E3C` 레이어 레코드에서 `name`, `color: { r, g, b }`, `hidden` 가시성 상태 파싱 및 `SkpBuilder.addLayer(name, { color, hidden })` 직렬화.
    - **Component Instancing & Dynamic Attributes (`D007`/`DC05`)**: `buildInstancedScene`이 고유 `Definition` 메쉬를 로컬 공간에서 1회 삼각화하고 각 배치 노드에 16원소 열우선(Column-Major) glTF Y-up 행렬(`InstancedNode.matrix`)을 부여함. `D007`/`DC05` TLV 순회를 통해 `dynamic_attributes`(`_lenx_formula` 등 Dynamic Components) 및 `IFC2x3` BIM 분류 사전을 추출하며, `alwaysFacesCamera`(2D 빌보드) 및 `shadowsFaceSun` 플래그를 보존함.
    - **Edge Flags (`D307`) & Styles**: 모서리 표시 바이트(`0x01` hidden, `0x08` soft, `0x10` smooth)와 `isDrawableEdge(flags, includeHidden)` 판별기, `Style` 엔티티 파싱.
    - **4-Pin Projective Texture UV (`uvTransform`, `uvProjected`, `faceUvBasis`)**: 면 법선 기반 탄젠트/바이탄젠트 정규직교 기저(`faceUvBasis`)와 $3 \times 3$ 사영 호모그래피 행렬(`uvTransform` 9원소 배열, $q = m_6 u + m_7 v + m_8$ 동차 나눗셈) 및 4-Pin `frontUv`/`backUv` 고정 핀 투영.
    - **Drafting Entities & Section Planes**: `ConstructionLine`(무한 보조선 센티넬 `±1e30` 및 유한 구간 `start`/`end`), `ConstructionPoint`, `Dimension`(`a`, `b`, `offset`, `planeX`, `normal`, `text` 및 `<>` 동적 치수 치환), `TextEntity`(3D 지시선 텍스트), `SectionPlane`(절단 평면 방정식 $[n_x, n_y, n_z, d]$).
    - **Multi-CAD Exporters & Native `.skp` Builder**: `create()`(`SkpBuilder.toBytes()`), `openExisting()`, `extractThumbnail()`, `toGLB()`, `toInstancedGLB()`, `toDXF()`/`exportDXF()`, `toIFC()`/`exportIFC()`(`classifyElement`, `generateIFCGUID`), `toOBJ()`/`toMTL()`, `toSTLBinary()`/`toSTLAscii()`, `toPLYBinary()`/`toPLYAscii()`, `toFragments()`.
- **SketchUp for Web (`https://app.sketchup.com/app`) 웹 캡처 및 번들 분석**:
  - `capture_browser_scenario`: `evidence_id: ev_752234ac45258e8b72f1ee5ab0f07944e41e5f6d0f7ec476c01bd9834906bb34` (시나리오 `SHA-256: 086bf14098ce35b64ded78d464a4421e9d3f7372ffac989a6335f6b7c8810bc8`).
  - `export_web_scripts`: `evidence_id: ev_fe055e1d7cc22132e6d1ebae3e7a9317b5e8034d8e1a47c90ca435e39a5263a3` (매니페스트 `SHA-256: 0a051227f3437d95e912346df69e288830a87cf95c4761c754b0733458b84e53`).
  - `analyze_javascript_application`: 부모 `evidence_id: ev_4abf8ca26ecdb0337e239039d980a0fa3048481430a9d19dccbf07a4e48922ca`, 요약 뷰 `ev_a297449a22a2155a03b6fb4f59d7e744a20fd193eaa1392d89ee410d9906839f` (루트 아티팩트 `SHA-256: b52af02d32fb1c214aafe5fabb4cf469a41b58cc86bcd60e75567d2ce8673b66`, **6개 JS 파일**, **30,965개 AST 노드**, **211개 findings**). 비인증 진입 시 Trimble Identity OAuth 게이트 및 부트스트랩 셸이 먼저 로드됨을 확인.
- **SketchUp 3D Warehouse (`https://3dwarehouse.sketchup.com/`) 웹 캡처 및 번들 분석**:
  - `capture_browser_scenario`: `evidence_id: ev_779709fd7cf7ee2b8f705e92874a2530f1b3c50f1b3c50f70179bf85cb997234ea3d731` / `ev_779709fd7cf7ee2b8f705e92874a2530f1b3c50f70179bf85cb997234ea3d731` (시나리오 `SHA-256: 3b3b02fdddd8cba5ed76a929c6415ddfba7d34d344ff33c579fcb18331e0babd`).
  - `export_web_scripts`: `evidence_id: ev_6a073f33c017e2950eaac77c8759d1eb1f5adcc098352f5ff0f340d0a7f938fc` (매니페스트 `SHA-256: 96680f84dc4957b4732116d35190dd7b78a9cb87866db0fc6d84fd46efa17743`).
  - `analyze_javascript_application`: 부모 `evidence_id: ev_39ef5b3ec2a1a0e33b9b59f522d37d8eea5c90d3c06ead85284f397e618396a7`, 요약 뷰 `ev_aaf096b1e5b182d542b7604ecc3fb0c5d78eeda75f7c3eb136da96502f59618d` (루트 아티팩트 `SHA-256: 5085d2fabdedb8c65fda7b90df4f7548289ff4f230a4f61675cf5c580e39285c`, **5개 JS 파일**, **15,869개 AST 노드**, **95개 findings**).

#### B. Inferences (설계 의도 및 알고리즘 구조 추론)
- **Z-Up 인치(Inches) 원장 ↔ Y-Up 미터(Meters) 런타임 장면 그래프 분리**:
  - `.skp` 파일은 표시 단위(`mm`, `cm`, `m`)와 무관하게 내부 정점·카메라·절단면·치수 좌표를 모두 **인치(1 inch = 0.0254 m), Z-up 오른손 좌표계**로 기록한다. 따라서 `Page`(씬 카메라)와 `SectionPlane`, `Dimension`, `ConstructionLine`을 ToonStudio 3D 배경 씬으로 무손실 복원하거나 역방향으로 `.skp`를 빌드할 때 $(x_{\text{skp}}, y_{\text{skp}}, z_{\text{skp}}) \leftrightarrow (x_{\text{skp}} \cdot s, z_{\text{skp}} \cdot s, -y_{\text{skp}} \cdot s)$ 기저 변환과 법선/평면 오프셋 부호 보존이 일관되게 적용되어야 한다.
- **Push/Pull 반대면 공면 개구부 관통(Coplanar Hole Cutting) 및 VCB 배열 문법**:
  - 웹툰 건축 배경에서 벽 두께만큼 창문·문 사각형을 밀어 넣을 때($d \approx \text{wallThickness}$) 반대편 벽면과 공면(Coplanar)이 되면 자동으로 개구부(Opening)를 뚫어 주는 것이 SketchUp 직접 모델링의 핵심 생산성 메커니즘이다. 또한 치수 입력 상자(VCB)의 `*N`/`Nx`(외부 배수 배열)과 `/N`(내부 등분 배열) 문법은 난간·창살·가로등·계단 반복 배치 시간을 획기적으로 단축한다.

#### C. Unknowns (미확정 영역)
- `app.sketchup.com/app`에서 Trimble 유료 구독/OAuth 로그인 이후에만 동적 스트리밍되는 비공개 WebAssembly CAD 커널 바이너리 심볼과 `3dwarehouse.sketchup.com`의 서버 측 검색 랭킹/봇 방어 정책 내부 파라미터는 비인증 정적/시나리오 캡처 경계 밖이므로 미확정(Unknown)으로 분류한다.

---

## 4. ToonStudio 신규 구현 모듈 16종 정밀 매핑

위 REA 정적·웹 역공학 증거를 바탕으로 ToonStudio 창작 스튜디오(`apps/web/src/domains/creator/`)에 클린룸 자체 구현으로 통합된 16개 핵심 모듈(기존 10종 + SketchUp 전 기능 내재화 6종)과 근거 `evidence_id`의 매핑은 다음과 같다.

| 순번 | ToonStudio 구현 모듈 경로 | 벤치마크 원천 및 REA `evidence_id` | 핵심 구현 기능 및 기술 사양 |
| ---: | --- | --- | --- |
| 1 | `apps/web/src/domains/creator/character-shaper/character-shaper-native-preset-codec.ts` | **SHAPER v1.05**<br>`ev_e827f1b21d6d3ffeb98e413b528fa6f4369bc578553586a66210e5acfadbf541`<br>`ev_49b3f622771d933b42b42b3b6b21e4fed2de067fc93e65f6dcce8a7b7b9b32f7` | `shape_preset`, `hair_preset`, `total_preset`, `pose_preset`, `face_preset` 5종 프리셋 포맷의 양방향 직렬화·역직렬화, 버전 마이그레이션, 파츠 슬롯·색상·모디파이어 무결성 검증 코덱 |
| 2 | `apps/web/src/domains/creator/character-shaper/character-shaper-modifier-apply.ts` | **SHAPER v1.05**<br>`ev_e827f1b21d6d3ffeb98e413b528fa6f4369bc578553586a66210e5acfadbf541`<br>`ev_05afbfd2088fad00b621358cf76ebe291e4dfb25b9109e32530fa5e4cf7c4328` | 체형·이목구비 블렌드셰이프 가중치 보간, 본 스케일/위치/회전 오프셋 합성, 좌우 대칭(L/R) 미러링, 자식 본 비균등 스케일 왜곡 방지(Scale Compensation) 및 IK 핀 고정 연산 |
| 3 | `apps/web/src/domains/creator/character-platform/groom/character-shaper-hair-planting.ts` | **SHAPER v1.05**<br>`ev_e827f1b21d6d3ffeb98e413b528fa6f4369bc578553586a66210e5acfadbf541`<br>`ev_49b3f622771d933b42b42b3b6b21e4fed2de067fc93e65f6dcce8a7b7b9b32f7` | 두피(Scalp) 메쉬 표면 히트 포인트·법선 벡터 기반 헤어 스트랜드/카드 심기(Hair Planting), 가르마·볼륨·중력·컬·테이퍼 제어점 생성 및 브러시 기반 식모 편집 |
| 4 | `apps/web/src/domains/creator/character-platform/surface-ink/character-shaper-barycentric-pen-line.ts` | **SHAPER v1.05**<br>`ev_e827f1b21d6d3ffeb98e413b528fa6f4369bc578553586a66210e5acfadbf541` | 메쉬 삼각형 인덱스(`triangleIndex`)와 무게중심 좌표(`u, v, w`) 및 법선 오프셋으로 3D 표면에 펜선을 앵커링하여, 포즈·블렌드셰이프 변형 시에도 선화가 메쉬 표면을 정밀 추종하는 엔진 |
| 5 | `apps/web/src/domains/creator/character-platform/render/character-shaper-eyeball-seam-mask.ts` | **SHAPER v1.05**<br>`ev_e827f1b21d6d3ffeb98e413b528fa6f4369bc578553586a66210e5acfadbf541` | 안구(Eyeball)와 안와(Eye Socket) 교차 경계의 심(Seam) 마스크 계산, 측면 시선 각도에서 눈꺼풀 밖 안구 돌출 클리핑 및 이중 윤곽선 아티팩트 억제 |
| 6 | `apps/web/src/domains/creator/vrm/studio-vrm-shaper-shader-camera-controller.ts` | **SHAPER v1.05 · Blender**<br>`ev_e827f1b21d6d3ffeb98e413b528fa6f4369bc578553586a66210e5acfadbf541`<br>`ev_55cbde6a15c7f2ce78ea73adf6cbf4082156856b4d3427700d81c610b2201819` | 웹툰 셀 셰이딩 2/3단 램프, 림라이트, 카메라 거리 보정 윤곽선 두께 제어 및 원근(Perspective)↔직교(Orthographic) 연속 보간·돌리 줌 카메라 컨트롤러 |
| 7 | `apps/web/src/domains/creator/export/studio-shaper-multipass-psd-compositor.ts` | **SHAPER v1.05 · Clip Studio Paint**<br>`ev_e827f1b21d6d3ffeb98e413b528fa6f4369bc578553586a66210e5acfadbf541`<br>`ev_30f45051a6f11ff0152d794701d8736f37b6f6088876afd7d2a8051d806f4e4c` | `Line`(선화), `BaseColor`(밑색), `Shade`(1·2차 음영), `Specular`(하이라이트), `RimLight`(역광), `Depth`(깊이 맵), `PartMask`(헤어·피부·안구·의상 ID 마스크) 멀티패스 분리형 PSD 합성기 |
| 8 | `apps/web/src/domains/creator/ai/studio-ai-shaper-bone-preset-engine.ts` | **SHAPER v1.05**<br>`ev_e827f1b21d6d3ffeb98e413b528fa6f4369bc578553586a66210e5acfadbf541`<br>`ev_05afbfd2088fad00b621358cf76ebe291e4dfb25b9109e32530fa5e4cf7c4328` | 캐릭터 설정 텍스트·장르·연령·등신대 입력으로부터 본 스케일 벡터와 얼굴/체형 블렌드셰이프 프리셋을 결정론적으로 추천·블렌딩하는 엔진 |
| 9 | `apps/web/src/domains/creator/canvas/studio-handwriting-baseline-beautifier.ts` | **Goodnotes v7.1.28**<br>`ev_ef24d6b378cefd65bbb87b216ae5eeaaef44e8060c26dcb00f1b776f71562a81` | 손글씨 대사·효과음(SFX) 스트로크 묶음에서 기준선(`BaselineEstimation`) 기울기·행간을 추정하고, 필압·개성을 유지한 채 줄 맞춤·자간·곡률을 정돈(`HandwritingBeautificationCore` 대응)하는 미화 엔진 |
| 10 | `apps/web/src/domains/creator/canvas/studio-spatial-reference-lasso-board.ts` | **Muse v9.0**<br>`ev_122f930c82d3a1cd656b8aae3735288c991df6759b7d49089208c0a9dffcee14` | 무한 공간 보드에서 자유 올가미(Polygon Lasso) 폐곡선 판정(Point-in-Polygon / AABB 교차)으로 첨부 레퍼런스 카드(`attachment-reference`)와 스케치 스트로크를 클러스터링·정렬·컷 인계하는 보드 엔진 |
| 11 | `apps/web/src/domains/creator/bg3d/studio-bg3d-skp-full-scene-restorer.ts` | **SketchUp (`openskp@1.3.0`)**<br>`ev_4bcff28953cf3f65fa0e78f7684bb1679839e674fec42c04aa1cd9115e976b6c`<br>`ev_a1d0b81b0db0d09672067f12696131418b183628537ddf7d542d4b8a0211be3a` | `.skp` `Page`(씬 카메라 `eye`/`target`/`up`/`fov`/`parallel`/`orthoHeight`/`hiddenLayers`) → `StudioBg3dShot` 무손실 복원, `Layer`(태그 RGB 색상·`hidden` 가시성) 복원, `buildInstancedScene` 16원소 행렬 TRS 분해 및 Dynamic Components(`dynamic_attributes`)·`IFC2x3` 속성 사전·내장 썸네일(`extractThumbnail`) 추출기 |
| 12 | `apps/web/src/domains/creator/bg3d/studio-bg3d-sketchup-direct-modeling.ts` | **SketchUp (`openskp@1.3.0` · SketchUp for Web)**<br>`ev_a1d0b81b0db0d09672067f12696131418b183628537ddf7d542d4b8a0211be3a`<br>`ev_4abf8ca26ecdb0337e239039d980a0fa3048481430a9d19dccbf07a4e48922ca` | Push/Pull 면 돌출 및 반대편 공면 벽체 창문·문 개구부 자동 관통(Coplanar Hole Cutting), 마이터 제한 다각형 오프셋(`Offset`), 3D 경로 스윕(`Follow Me`), VCB `*N`/`Nx`/`/N` 선형·원형 배열 복제, N각형/Bulge($\tan(\theta/4)$) 원호 생성 커널 |
| 13 | `apps/web/src/domains/creator/bg3d/studio-bg3d-sketchup-guides-sections-dimensions.ts` | **SketchUp (`openskp@1.3.0`)**<br>`ev_a1d0b81b0db0d09672067f12696131418b183628537ddf7d542d4b8a0211be3a` | 줄자(`ConstructionLine` `±1e30` 무한 센티넬 클리핑 및 유한 가이드, `ConstructionPoint`), 각도기(`rise:run` 물매·각도 파서), 3D 선형 치수선(`Dimension` 보조선·`<>` 치수 텍스트 자동 치환), 3D 지시선 텍스트(`TextEntity`), 단면 평면(`SectionPlane` 메쉬 삼각형 절단선 및 단면 채움 Poché 면적 산출) 엔진 |
| 14 | `apps/web/src/domains/creator/bg3d/studio-bg3d-sketchup-styles-uv-engine.ts` | **SketchUp (`openskp@1.3.0`)**<br>`ev_a1d0b81b0db0d09672067f12696131418b183628537ddf7d542d4b8a0211be3a` | `.skp` `D307` 엣지 플래그(`0x01` hidden, `0x08` soft, `0x10` smooth) 디코더, SketchUp 6대 면 스타일(`wireframe`, `hidden-line`, `shaded`, `shaded-with-textures`, `monochrome` 앞/뒷면 법선 검수, `xray`) 및 엣지 모디파이어(프로필·깊이 큐·연장선·끝점·지터·뒷면 점선), 4-Pin 사영 호모그래피(`uvTransform` 3×3 행렬·`uvProjected`·`faceUvBasis`) UV 매핑 엔진 |
| 15 | `apps/web/src/domains/creator/bg3d/studio-bg3d-sketchup-shadow-and-exporter.ts` | **SketchUp (`openskp@1.3.0` · 3D Warehouse)**<br>`ev_a1d0b81b0db0d09672067f12696131418b183628537ddf7d542d4b8a0211be3a`<br>`ev_39ef5b3ec2a1a0e33b9b59f522d37d8eea5c90d3c06ead85284f397e618396a7` | 위도·경도·Solar North·날짜·시각·Light/Dark 슬라이더 기반 태양 고도·방위각 계산기(`ShadowInfo`) 및 OpenSKP `SkpBuilder.toBytes()` 기반 브라우저 네이티브 `.skp` v17 바이너리 빌더 + 다중 CAD(`.skp`, `.dxf`, `.ifc`, `.obj`/`.mtl`, `.stl`, `.ply`, `instanced-glb`) 익스포터 |
| 16 | `apps/web/src/domains/creator/bg3d/StudioBg3dSketchUpWorkbenchPanel.tsx` | **SketchUp (`openskp@1.3.0` · SketchUp for Web · 3D Warehouse)**<br>`ev_4bcff28953cf3f65fa0e78f7684bb1679839e674fec42c04aa1cd9115e976b6c`<br>`ev_752234ac45258e8b72f1ee5ab0f07944e41e5f6d0f7ec476c01bd9834906bb34`<br>`ev_779709fd7cf7ee2b8f705e92874a2530f1b3c50f70179bf85cb997234ea3d731` | 3D 전문가 워크벤치 허브(`StudioBg3dAdvancedWorkbenchHub.tsx`) 내 **SketchUp 마스터 스튜디오** 통합 UI 패널 (상호 배타 `<details name="sketchup-workbench-accordion">`, IME 조합 안전 VCB Enter 핸들러 내장) |

---

## 5. 검증 요약

- 정적 증거 번들 JSON 스키마 및 해시 대조: [`docs/evidence/rea-competitor-benchmark-20261026.json`](evidence/rea-competitor-benchmark-20261026.json) 기록 완료.
- 문서 링크 및 한국어 정책 검증: `pnpm run validate:documentation` 통과.
