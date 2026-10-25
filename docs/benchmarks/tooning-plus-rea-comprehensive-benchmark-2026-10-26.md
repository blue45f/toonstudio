# Tooning Plus (`https://plus.tooning.io/`) REA 전 제품군 역공학 분석 및 ToonStudio 통합 (2026-10-26)

- 문서 상태: `current`
- 작성일: `2026-10-26`
- 분석 대상: `https://plus.tooning.io/` (`CM`, `TG`, `TD`, `ED`, `MG`, `DV`, `TB`) 및 `https://3dasset.tooning.io/kr`

## 1. REA 증거 번들 (Evidence IDs)

REA(`reverse-engineer-anything`) 런타임 브라우저 시나리오 캡처, 스크립트 추출 및 AST 정적 분석을 통해 확보한 증거 ID 목록이다.

- `ev_e803f42b9f2d1ca2b0853014b7e424c05c06392386fc9cd3c4499d1172a06a0b`: `https://plus.tooning.io/` 초기 런타임 시나리오 캡처 (`capture_browser_scenario`)
- `ev_bc0026c3172b56c02e1ebc6872d131ce2daeb1aeb6ce06979ec991a66918ab16`: `export_web_scripts`를 통한 프론트엔드 번들 추출 및 5단계 의존성 체인(총 318개 JS 청크) 확보
- `ev_f5b87625a11045ef722f24111c8cf259063ad4c1de03613f53b8546c8ccf25f8` (상위 `ev_3909f6b67fc3690f0a2b31b2a5e20928c178af8a40e77fb01bffa8008507cd24`): `analyze_javascript_application` 배치 1 (24개 라우트·기능 청크, 157,728 AST 노드, 2,721건 발견)
- `ev_e72742d447a04315f49311ab1fd849136e0fa3fae0c1f6f240660d0114814aae` (상위 `ev_877550123e61bfbf22986f0da67bbc002ca114e22dbc7e850727ce9ccd824c10`): `analyze_javascript_application` 배치 2 (에디터·3D·챗·캐릭터 4대 핵심 번들, 329,183 AST 노드, 1,311건 발견)
- `ev_988771d4333532519f53e82dc0e5ea029253a5f55b625ed9b5861054e76cf0b1`: `https://plus.tooning.io/stories/explore` 런타임 캡처
- `ev_a86d7145b5e038bcb1ac0a0298b1a19c5910ec280fbc6f06ef589542108f40f9`: `https://plus.tooning.io/stories/explore/11` (캔버스 + 노하우 프롬프트 탭 및 리메이크 플로우) 런타임 캡처
- `ev_255e579ac79d33c16026873427ee113213651e25c21fe69932171e7872b405ce`: `https://3dasset.tooning.io/kr` 3D 에셋 스토어 5종 카테고리(`씬`, `공간`, `요소`, `포즈`, `기타`) 런타임 캡처

## 2. 관측 사실(Observations) · 추론(Inferences) · 한계(Limitations)

### 관측 사실 (Observed directly from shipped bundles & live runtime)

1. **`StudioService` 7대 제품군 열거형 (`chunk-JK5D3P6U.js`)**:
   - `CM` (`공통`), `TG` (`투닝 스토리`), `TD` (`투닝 3D 스튜디오`), `ED` (`투닝 에디터`), `MG` (`투닝 매직`), `DV` (`디브 AI 캐릭터 챗`), `TB` (`툰비 웹툰/웹소설 플랫폼`).
2. **투닝 스토리 (`TG`, `gpt.component-ZELFMKXT.js`, `gpt-agent.component-UTOKGNJ7.js`)**:
   - 3종 AI 스토리 에이전트(`웹툰`, `웹소설`, `영화`), 설정 빌더(`TgConceptType`: `OnlyInput`, `DropDownAndInput`, `TgConceptRecommendType` 0~4 성별 맞춤 추천, `maxConceptAddCnt` 다중 항목 추가).
   - AI 전개 제안 배너(`ReceiveSuggestion`), 3개 후속 질문 추천, 응답 평가(`Good`/`Bad`).
   - 8,000자 상한·3,000ms 자동 저장 스토리 캔버스, 인라인 `<cut-marker data-cut-index="N">C#N</cut-marker>` 배지, `==하이라이트==` 문법, 9종 한글 서체, 3종 커버 이미지 프리셋(`Abstract`, `Person`, `Color`, `844×264`).
   - 컷 분할기(`CutSplit` `360×640`, 구분자 `-----`, 컷별 지문 편집·원복), **3D 스튜디오 직결 연동(`TgToTdLinkage` / `generateCutDetails`: 컷당 5 크레딧, `/3d-studio?storyId=` 딥링크)**, 4종 파일 내보내기(`PDF`, `Docx`, `Html` UTF-8 BOM, `Txt` UTF-8 BOM) 및 탐색(`OnlyOne` 캔버스 단독 vs `Multiple` 캔버스+노하우 프롬프트).
3. **투닝 3D 스튜디오 (`TD`, `three-editor.component-6Y3KTJFB.js`, `chunk-HD34WGWT.js`, `chunk-PVUG2CCY.js`)**:
   - `TdWork -> TdScene -> TdCut` 계층과 8종 오브젝트(`Character`, `Background`, `Element` 10종 기본 도형, `Camera`, `Light` 3종/4096 섀도우맵, `CustomElement`, `GlobalCustomElement`, `Group`).
   - 5-탭 캐릭터 인스펙터: `Style` (7종 파츠 `HairFront`·`HairSide`·`HairBack`·`SetOutfit`·`Top`·`Bottom`·`Shoes`, `isKeepMainColor`, `applyCharacterStyleToScene`), `Body Type` (**21종 본 슬라이더 `-100..+100`**), `Action` (`Motion` `0..100` `playTime` 프레임 고정 스크러버, `Pose`, `Hand`, MediaPipe 웹캠 리타겟팅 `LANDMARK_Z_SCALE=0.2`, `Slerp=0.5`), `Expression` (**비대칭 5영역 `leftEyebrow`·`rightEyebrow`·`leftEye`·`rightEye`·`mouth` + 9방향 3×3 시선 그리드 `isDirectionLink`**), `Bookmark` (포즈 `516` 썸네일).
   - **23종 카메라 구도 프리셋**: `ShotSize` 7종(`ExtremeCloseUp`..`LongShot`), `Angle` 5종(`BirdEyesAngle -60°`..`WormsEyeAngle +60°`), `Position` 8방위(`0°..330°`), `Lens` 3종(`Telephoto 7°`, `Standard 40°`, `WideAngle 100°`).
4. **투닝 에디터 (`ED`) & 투닝 매직 (`MG`, `chunk-GW25CCKC.js`, `chunk-7OFZV2K7.js`)**:
   - 9종 대지 프리셋(`Webtoon 700×2000`, `Naver 690×2000`, `Kakao 720×2000` 등), 최대 20페이지.
   - 절차적 말풍선 6종(`Rectangle`, `Ellipse`, `Thought`, `Shout`, `SelfTalk`, `Squircle`) + 7종 감정 + **2~5개 말풍선 불리언 병합(`grouped-speech-bubble`, `Ctrl+E`)**, 가변 다각형 컷(`editableCut` 꼭짓점 코너 라운드), **16파츠 2D 스마트 캐릭터(`smart-character`)**.
   - 3D 마네킹 포즈 팝업(19개 Mixamo 관절 + 10개 손가락 컬 `0..1`), 다각도 카메라 팝업(`<sks> <azimuth> <elevation> <distance>` 8방위×5고도×3거리), AI 보이스 TTS/클로닝(11개 언어), AI 엑스포 웹캠 7종 화풍 변환, 이미지 필터 `±5` 영점 스냅.
   - 투닝 매직(`MG`): `InhouseStyle`/`OutsideStyle`/`MyStyle`(B-LoRA `3600s` 학습), 5종 종횡비, 후처리 비트마스크 `(face?4:0)+(rmbg?2:0)+(color?1:0)+1`, 최대 5장 참조 멀티 이미지 AI 리터치(`NanoBanana`, `NanoBanana2`, `NanoBananaPro`, `Seedream`, `QwenImageEdit`).
5. **디브 (`DV`) & 툰비 (`TB`)**:
   - 디브: 6단계 캐릭터 생성 위저드(`Profile`, `Settings`, `First`, `Media`, `Lorebook`, `Register`), 키워드 발동 로어북(최대 50항목), 17종 `ShChatMode` 챗 모드, 4섹션 장기 기억, 대화 중 5종 이미지 재생성(`expression`, `pose`, `background`, `outfit`, `closer`).
   - 툰비: 10종 작가 크레딧 역할(`TbUserWorkType`), 웹툰 회차 원고 검증기(`image/jpeg` 전용, 가로 최대 `700px`, 파일당 `5MB`, 회차당 `50MB`), 웹소설 에디터(`15,000자` 상한) 및 뷰어(`scroll`/`tap`, 4종 서체, 4단계 글자 크기 `SS`/`SM`/`MB`/`BB`).

### 추론 및 한계 (Inferences & Limitations)

- 비공개 백엔드 추론 워커(`apip.tooning.io`)의 내부 모델 가중치는 클라이언트 번들에 포함되지 않으므로, ToonStudio에서는 동일한 입력·검증·파라미터·기하 계산·프롬프트/비트마스크 계약을 로컬 결정론적 엔진과 BYOK/서버 AI 파이프라인에 결합해 동작하도록 설계했다.

## 3. ToonStudio 구현 및 UI 연동 매핑

| 제품군 | ToonStudio 도메인 엔진 | 연결된 Studio UI 컴포넌트 | 검증 테스트 |
| --- | --- | --- | --- |
| `TG` · `CM` | `apps/web/src/domains/creator/ai/tooning-stories-suite.ts` | `StudioTooningPlusSuitePanel.tsx` (`StudioWebtoonMasterPipelineCard.tsx` 내장) | `apps/web/src/domains/creator/ai/__tests__/tooning-plus-suite.test.tsx` |
| `TD` · `3dasset` | `apps/web/src/domains/creator/scene-3d/studio-3d-tooning-plus-suite.ts` | `StudioTooning3DStudioInspectorPanel.tsx` (`StudioBg3dShaperTooningStudioPanel.tsx` 내장) | `apps/web/src/domains/creator/scene-3d/__tests__/studio-3d-tooning-plus-suite.test.tsx` |
| `ED` · `MG` | `apps/web/src/domains/creator/lettering/studio-tooning-editor-magic-suite.ts` | `StudioTooningEditorBubbleCharacterPanel.tsx` (`StudioBubbleToolPopoverBody.tsx` 내장) & `StudioTooningPlusSuitePanel.tsx` | `apps/web/src/domains/creator/lettering/__tests__/studio-tooning-editor-magic-suite.test.tsx` |
| `DV` · `TB` | `apps/web/src/domains/creator/ai/tooning-deev-toonbe-suite.ts` | `StudioTooningPlusSuitePanel.tsx` | `apps/web/src/domains/creator/ai/__tests__/tooning-plus-suite.test.tsx` |
