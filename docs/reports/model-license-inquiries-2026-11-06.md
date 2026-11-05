# ToonStudio 모델 상용 이용·재배포 허가 문의문

작성·확인일: 2026-11-06 (KST)  
상태: current / 검토용 초안 / 미발송 / 허가 미확인

이 문서는 원저자별 한국어·영어 대안 초안이다. 같은 원저자에게 두 언어를 각각 보내는 두 건의 문의가 아니다. 언어 하나를 선택해 한 스레드에서 처리한다. 실제 발송·메일 초안 생성·라이선스 구매·모델 교체·운영 배포를 수행하지 않았다. 최초 문의문 작성 단계에서는 제품 소스·모델·사용자 데이터를 변경하지 않았다.

## 1. 대조 결과와 중복 문의 확인

- [PR #2724](https://github.com/blue45f/toonstudio/pull/2724)는 확인 시점에 병합 완료 상태다. head는 `fc3866de7d7ad2ed7028a9aeed2660b165ab6327`, merge commit은 `7c5ed4db7d739449312793ee3bc471131420f434`다. 보고서의 draft/병합 대기 표현은 작성 당시 기록이며 현재 PR 상태와 구분한다.
- [PR #2722](https://github.com/blue45f/toonstudio/pull/2722)도 병합 완료 상태다. Mixbox 제거는 아래 모델 권리를 부여하지 않는다.
- [지정 권리 보고서](https://github.com/blue45f/toonstudio/blob/fc3866de7d7ad2ed7028a9aeed2660b165ab6327/docs/reports/commercial-license-pr-readiness-2026-11-05.md)와 main의 같은 보고서, 모델별 후속 보고서를 대조했다. 기록된 `audit:restricted-models`는 exit 1, Tag2Pix·Paprika 차단 2개, FacePaint 검토 1개다. 이번 문서 작성에서 감사를 재실행한 결과는 아니다.
- 로컬 checkout은 최신 main보다 뒤처져 있었고 구형 MIT 설명이 남아 있어, 권리 판단에는 최신 PR·main의 정정된 고지와 공식 원문을 사용했다.
- 저장소의 관련 파일·보고서·증거 JSON, PR #2724 대화, 연결된 Gmail(보낸편지·초안·스팸·휴지통을 포함한 검색), Google Drive, 검색 가능한 저장 문서에서 기존 허가서 또는 진행 중인 문의를 발견하지 못했다. Gmail은 모델명·저장소명·가중치 파일명·확인한 이메일 주소로 검색했다. Drive는 Tag2Pix·AnimeGAN·Paprika, 저장 문서는 해당 모델명 및 라이선스 관련 제목·내용으로 검색했다.
- 위 미발견은 비공개 계약이나 다른 계정·저장소의 문의가 없다는 증명이 아니다. Paprika 후속 보고서는 해당 조사에서 저자에게 메시지를 보내지 않았다고 명시한다. 기존 스레드가 나중에 확인되면 아래 신규 초안을 별도 발송하지 말고 그 스레드와 허가 범위를 먼저 확인한다.

## 2. 공식 연락 경로

| 대상 | 제안 수신처 | 근거와 한계 |
| --- | --- | --- |
| Tag2Pix | Ho Young Jhoo(주호영), `hoyoung.jhoo@sf.snu.ac.kr` | [공식 릴리스](https://github.com/blandocs/Tag2Pix/releases)의 게시자 MerHS → [본인 GitHub 프로필](https://github.com/MerHS) → [SNU 연구실 개인 페이지](https://sf.snu.ac.kr/hoyoung.jhoo/). 페이지에 이메일과 Tag2Pix 공동 저자 정보가 공개돼 있다. FuriosaAI 이동 표기도 있어 실제 수신 가능 여부는 미검증이다. 상용 라이선스 전담 창구 또는 단독 허가 권한이 확인된 것은 아니다. |
| Paprika / AnimeGANv2 | Asher Chan / AnimeGAN 라이선스 담당자, `asher_chan@foxmail.com` | [AnimeGANv2 License](https://github.com/TachibanaYoshino/AnimeGANv2#license)는 상용 이용 시 이메일로 허가서를 요청하도록 안내한다. 주소는 동일 소유자 TachibanaYoshino의 [AnimeGANv3 Author](https://github.com/TachibanaYoshino/AnimeGANv3#-author)에 공개돼 있다. v2 README의 저자 표기는 Xin Chen이므로, 해당 주소가 v2 Paprika도 담당하는지 및 허가 권한을 먼저 확인해야 한다. 수신 가능 여부 미검증. |

Tag2Pix의 예비 경로는 [원저자 논문](https://arxiv.org/pdf/1908.05840)에 기재된 Ho Young Jhoo의 `mersshs@gmail.com`, 공동 1저자 Hyunsu Kim의 `gustnxodjs@gmail.com`이다. 2019년 공개 연락처이므로 현재 유효성은 미검증이다. 최초에는 위 제안 수신처 한 곳에만 보내고, 반송 또는 담당자 안내가 있을 때 같은 이력을 인용해 예비 경로를 검토한다. 여러 주소로 병렬 신규 문의를 보내지 않는다.

## 3. Tag2Pix — 한국어 문의문

수신: 주호영 님 / Tag2Pix 라이선스 담당자  
이메일: hoyoung.jhoo@sf.snu.ac.kr  
제목: ToonStudio의 Tag2Pix ONNX 상용 이용·브라우저 재배포 허가 문의

안녕하세요, 주호영 님. 웹 기반 웹툰 제작 서비스 ToonStudio를 개발하는 김희준입니다.

Tag2Pix의 코드 MIT 라이선스와 배포 가중치의 비상업·재배포 제한을 구분해 확인했으며, 별도 서면 허가를 문의드립니다. 프로젝트에는 공식 릴리스의 `tag2pix_512.pkl`과 `model.pth`를 결합·변환한 `tag2pix.onnx`가 포함돼 있습니다.

허가받고자 하는 범위는 상용 웹 서비스의 선화·색상 태그 기반 채색입니다. 저희 호스팅/CDN에서 ONNX를 사용자 브라우저로 다운로드하고, 기기에서 추론하며 모델을 저장·캐시해 오프라인으로 실행하는 방식입니다. 모델 파일이 이용자 기기에 전달되는 구조를 포함해 다음을 확인 부탁드립니다.

1. 두 원본 가중치와 해당 ONNX에 대해 귀하가 상용 이용·재배포를 허가할 권한이 있는지, 공동 저자·소속기관 등 다른 권리자의 동의가 필요한지요?
2. 무료·유료 이용자 대상 상업적 추론, 구독·유료 기능·기업 이용, 이용자의 결과물 저장·공개·상업적 활용을 허용할 수 있나요?
3. 원본 가중치의 결합·ONNX 변환과 추론 최적화·양자화 등 변경을 허용하나요? 허용되는 변경 범위를 알려주세요.
4. 호스팅/CDN 복제·전송, 브라우저 다운로드·저장·캐시·오프라인 실행을 포함한 재배포를 명시적으로 허용하나요? 이용자의 모델 파일 재전달 제한, 공개 소스 저장소·릴리스에 모델을 포함할 경우의 별도 조건도 알려주세요.
5. 저작권·라이선스·논문 인용·변경 표시의 필수 문구와 표시 위치, 소스 공개 또는 이용자 약관 반영 의무는 무엇인가요?
6. 허가 대상 개인/법인·서비스/도메인·지역·사용자/다운로드 한도, 허가 기간·갱신·해지 및 종료 후 이미 다운로드된 모델·캐시의 처리 조건은 무엇인가요?
7. 일회성·정기 비용, 로열티·최소 금액 및 견적에 필요한 정보는 무엇인가요? 학습자료 등 제3자 권리와 관련해 허가에 포함되는 범위와 별도로 확인할 범위도 안내 부탁드립니다.

가능하시다면 두 체크포인트와 변환 ONNX를 식별하는 허가서 또는 계약안을 부탁드립니다. 모델 식별 해시와 기술 설명을 제공할 수 있습니다. 귀하가 담당자가 아니라면 적절한 권리 담당자를 안내해 주시면 감사하겠습니다. ToonStudio 또는 제 명의로 기존 허가·문의가 있다면 해당 기록에 연결해 처리하고 싶습니다.

감사합니다.  
김희준  
ToonStudio · https://toonstudio.cloud

## 4. Tag2Pix — English inquiry

To: Ho Young Jhoo / Tag2Pix licensing contact  
Email: hoyoung.jhoo@sf.snu.ac.kr  
Subject: Commercial use and browser redistribution permission for Tag2Pix ONNX in ToonStudio

Dear Ho Young Jhoo,

I am Hee-jun Kim (김희준), developing ToonStudio, a web-based webtoon creation service.

We have reviewed the distinction between Tag2Pix’s MIT code license and the non-commercial and redistribution restrictions on its released weights. We would like to request separate written permission. Our project contains `tag2pix.onnx`, converted by combining the official release’s `tag2pix_512.pkl` and `model.pth`.

The requested scope is line-art colorization with color tags in a commercial web service. Our hosting/CDN would deliver the ONNX file to users’ browsers for on-device inference, with local storage/caching and offline execution. This involves delivery of the model file to end users.

Could you please confirm:

1. Are you authorized to permit commercial use and redistribution of both original weights and this ONNX conversion, or must co-authors, an institution or other rightsholders also consent?
2. May we offer commercial inference to free and paying users, subscriptions, paid features and business users, and allow users to save, publish and commercially use outputs?
3. May we combine and convert the weights to ONNX and make inference optimizations, including quantization? What changes are permitted?
4. May we copy and serve the weights through hosting/CDN and redistribute them through browser downloads, local storage/caching and offline execution? Please specify downstream sharing restrictions and any separate conditions for including model files in public source repositories or releases.
5. What copyright, license, paper citation and modification notices, placement, source-disclosure or end-user terms obligations apply?
6. What licensee, service/domain, territory, user/download limits, term, renewal, termination and post-termination downloaded-model/cache conditions apply?
7. What upfront or recurring fees, royalties or minimum charges apply, and what information is needed for a quote? Which third-party rights, including training-material rights, are covered or require separate clearance?

Please provide, if available, an authorization letter or agreement identifying both checkpoints and the converted ONNX model. We can provide hashes and technical details. If another party handles licensing, please direct us to them. If permission or an inquiry already exists under ToonStudio or my name, we would like to continue that record.

Best regards,  
Hee-jun Kim (김희준)  
ToonStudio · https://toonstudio.cloud

## 5. Paprika — 한국어 문의문

수신: Asher Chan 님 / AnimeGAN 라이선스 담당자  
이메일: asher_chan@foxmail.com  
제목: ToonStudio의 AnimeGANv2 Paprika ONNX 상용 이용·브라우저 재배포 허가 문의

안녕하세요. 웹 기반 웹툰 제작 서비스 ToonStudio를 개발하는 김희준입니다.

AnimeGANv2의 비상업 이용 조건과 상용 허가서 문의 안내를 확인했습니다. 프로젝트에는 `bryandlee/animegan2-pytorch`의 `weights/paprika.pt`에서 변환한 `animegan2-paprika.onnx`가 포함돼 있습니다. 포트의 MIT 표기나 ONNX 변환을 원본 Paprika 가중치의 상용 허가로 간주하지 않고, 별도 서면 허가를 문의드립니다.

허가받고자 하는 범위는 상용 웹 서비스의 사진·이미지 애니메이션풍 변환입니다. 저희 호스팅/CDN에서 ONNX를 사용자 브라우저로 다운로드하고, 기기에서 추론하며 모델을 저장·캐시해 오프라인으로 실행하는 방식입니다.

다음 사항을 확인 부탁드립니다.

1. AnimeGANv2 Paprika 원본 가중치와 위 PyTorch 경유 ONNX 변환본의 상용 이용·재배포 허가를 귀하가 담당하고 부여할 권한이 있나요? 다른 저자·기관 등의 동의가 필요하다면 담당자를 안내해 주세요.
2. 무료·유료 이용자 대상 상업적 추론, 구독·유료 기능·기업 이용, 이용자의 결과물 저장·공개·상업적 활용을 허용할 수 있나요?
3. 원본→PyTorch→ONNX 변환과 추론 최적화·양자화 등 변경을 허용하나요? 허용되는 변경 범위를 알려주세요.
4. 호스팅/CDN 복제·전송, 브라우저 다운로드·저장·캐시·오프라인 실행을 포함한 재배포를 명시적으로 허용하나요? 이용자의 모델 파일 재전달 제한, 공개 소스 저장소·릴리스에 모델을 포함할 경우의 별도 조건도 알려주세요.
5. 원본과 PyTorch 포트의 저작권·라이선스·논문 인용·변경 표시의 필수 문구와 표시 위치, 소스 공개 또는 이용자 약관 반영 의무는 무엇인가요?
6. 허가 대상 개인/법인·서비스/도메인·지역·사용자/다운로드 한도, 허가 기간·갱신·해지 및 종료 후 이미 다운로드된 모델·캐시의 처리 조건은 무엇인가요?
7. 일회성·정기 비용, 로열티·최소 금액 및 견적에 필요한 정보는 무엇인가요? Paprika 영화 프레임 등 학습자료·관련 명칭에 관한 제3자 권리 중 허가에 포함되는 범위와 별도로 확인할 범위도 안내 부탁드립니다.

가능하시다면 정확한 Paprika 체크포인트와 변환 ONNX를 식별하는 허가서 또는 계약안을 부탁드립니다. 변환본 해시와 기술 설명을 제공할 수 있으며, 필요한 원본 버전 식별도 함께 확인하고 싶습니다. ToonStudio 또는 제 명의로 기존 허가·문의가 있다면 해당 기록에 연결해 처리하고 싶습니다.

감사합니다.  
김희준  
ToonStudio · https://toonstudio.cloud

## 6. Paprika — English inquiry

To: Asher Chan / AnimeGAN licensing contact  
Email: asher_chan@foxmail.com  
Subject: Commercial use and browser redistribution permission for AnimeGANv2 Paprika ONNX in ToonStudio

Dear Asher Chan / AnimeGAN licensing team,

I am Hee-jun Kim (김희준), developing ToonStudio, a web-based webtoon creation service.

We reviewed AnimeGANv2’s non-commercial terms and invitation to request a commercial authorization letter. Our project contains `animegan2-paprika.onnx`, converted from `weights/paprika.pt` in `bryandlee/animegan2-pytorch`. We do not treat the port’s MIT notice or ONNX conversion as commercial permission for the original Paprika weights and would like to request separate written permission.

The requested scope is photo/image stylization in a commercial web service. Our hosting/CDN would deliver the ONNX file to users’ browsers for on-device inference, with local storage/caching and offline execution.

Could you please confirm:

1. Do you handle and have authority to grant commercial use and redistribution permission for AnimeGANv2 Paprika and this conversion through PyTorch to ONNX? If other authors or institutions must consent, please identify the appropriate contact.
2. May we offer commercial inference to free and paying users, subscriptions, paid features and business users, and allow users to save, publish and commercially use outputs?
3. May we convert the original weights through PyTorch to ONNX and make inference optimizations, including quantization? What changes are permitted?
4. May we copy and serve the weights through hosting/CDN and redistribute them through browser downloads, local storage/caching and offline execution? Please specify downstream sharing restrictions and any separate conditions for including model files in public source repositories or releases.
5. What original-project and PyTorch-port copyright, license, paper citation and modification notices, placement, source-disclosure or end-user terms obligations apply?
6. What licensee, service/domain, territory, user/download limits, term, renewal, termination and post-termination downloaded-model/cache conditions apply?
7. What upfront or recurring fees, royalties or minimum charges apply, and what information is needed for a quote? Which third-party rights relating to training material, including Paprika film frames, or associated names are covered or require separate clearance?

Please provide, if available, an authorization letter or agreement identifying the covered Paprika checkpoint and converted ONNX model. We can provide conversion hashes and technical details and would appreciate help identifying the precise original checkpoint. If permission or an inquiry already exists under ToonStudio or my name, we would like to continue that record.

Best regards,  
Hee-jun Kim (김희준)  
ToonStudio · https://toonstudio.cloud

## 7. 허가 범위 대조용 모델 식별자

문의에 가중치 바이너리나 사용자 이미지를 첨부하지 않는다. 아래 식별자는 허가서가 정확한 자산을 지목하는지 검토할 때 사용한다. 기존 보고서·고지에 기록된 값이며, 이번 작성에서 바이너리를 재다운로드·재변환하거나 전량 tensor 동등성을 재검증하지 않았다.

| 대상 | 식별 정보 |
| --- | --- |
| Tag2Pix 원본 생성망 | `tag2pix_512.pkl`, SHA-256 `f929bba53e16992097fff82d2a42fbb7bc611d6170b6cac81b37bf940340cf59` |
| Tag2Pix 원본 특징망 | `model.pth`, SHA-256 `e59efdfa6e4fe883acfb3fe7e5a6abd0da6363554d67fe8f526e143d64a960df` |
| Tag2Pix 제품 ONNX | `tag2pix.onnx`, 79,269,994 bytes, SHA-256 `ae01698835b99a009533ebbcf840d416a32bee0c0f4c9be060c21ab2084491cc` |
| Paprika PyTorch 경유 자산 | `weights/paprika.pt`, 8,603,556 bytes, 기록된 SHA-256 `3eaba1b6d01e88ea32b16a6006b04eb3f60327c1dcc841de640d3196898da344`; 포트 고정 commit `25d7b017267208dfaf34026aa3425e518372aa2f` |
| Paprika 제품 ONNX | `animegan2-paprika.onnx`, 8,702,673 bytes, SHA-256 `7cb5bf08d7778a8f4e25f1e654fdc24d56dc9b6cbb9c1db42e4f9d0425e7fe62` |

Paprika 원본 TensorFlow 저장소의 기록에 `Paprika-54.ckpt`가 등장하지만, 위 포트가 정확히 그 epoch에서 변환됐다고 이번 조사에서 입증하지 않았다. 허가서 작성 시 원저자와 정확한 범위를 확인한다. FacePaint v2는 이번 허가 문의의 대상에 포함하지 않는다.

## 8. 공식 권리 근거와 확인 한계

| 근거 | 확인한 내용 |
| --- | --- |
| [Tag2Pix README — LICENSE](https://github.com/blandocs/Tag2Pix#license) | 학습·테스트 코드는 MIT, release의 학습 가중치·network dump는 비상업 목적이며 재배포를 제한한다. |
| [Tag2Pix 공식 릴리스](https://github.com/blandocs/Tag2Pix/releases) | `model.pth`, `tag2pix_512.pkl`를 구분하고 가중치 제한을 반복한다. |
| [AnimeGANv2 README — License](https://github.com/TachibanaYoshino/AnimeGANv2#license) | 비상업 목적 제공 및 상용 이용의 별도 이메일 허가서 경로를 명시한다. |
| [AnimeGANv2 공식 프로젝트 페이지](https://tachibanayoshino.github.io/AnimeGANv2/) | Paprika 학습 스타일 자료가 영화 BDRip 프레임 1,284장이라고 설명한다. 모델 저자의 허가가 제3자 자료 권리를 전부 해결한다는 근거로 사용하지 않는다. |
| [PyTorch 포트 변환 안내](https://github.com/bryandlee/animegan2-pytorch#weight-conversion-from-the-original-repo-tensorflow) | 원본 TensorFlow 가중치의 변환 절차와 converted Paprika 결과를 설명한다. |
| [포트 LICENSE](https://github.com/bryandlee/animegan2-pytorch/blob/main/LICENSE) | Bryan Lee의 MIT 선언. 그 자체에서 원본 Paprika 가중치의 별도 상용 허가 증거를 확인하지 못했다. |
| [Tag2Pix 후속 보고서](https://github.com/blue45f/toonstudio/blob/7c5ed4db7d739449312793ee3bc471131420f434/docs/reports/tag2pix-rights-followup-2026-11-05.md) | 115개 의미 태그·기기 내 실행 등 동등 대체 미검증과 허가 증거 미발견 범위를 구분한다. |
| [Paprika 후속 보고서](https://github.com/blue45f/toonstudio/blob/7c5ed4db7d739449312793ee3bc471131420f434/docs/reports/paprika-rights-followup-2026-11-05.md) | 포트·ONNX 계보와 상용 권한 미확인, 원본 epoch 검증 한계를 구분하며 해당 조사에서 저자에게 메시지를 보내지 않았다고 명시한다. |

허가 기간·가격·상용 예외·브라우저 재배포 허용은 공개 안내에서 확인되지 않아 질문으로 남겼다. 공개 연락처의 존재는 현재 수신 가능성, 담당자 권한 또는 허가 획득을 뜻하지 않는다. 답변이 단순히 상용 추론만 허용한다면 모델 변환·브라우저 전달·재배포까지 허용됐다고 확대 해석하지 않는다.

## 9. 완료 범위

원저자별 한국어·영어 문의문 4개와 제안 수신처·근거·모델 식별자를 작성했다. 문의문 수·주소·필수 항목 자동 검사와 한영 범위의 독립 검토를 통과했다.

검증 결과:

- `node scripts/agent-harness.mjs check`: exit 0, 하네스 무결성 검사 통과.
- 설치된 Secretlint CLI에 문서 1개를 직접 전달한 검사: exit 0.
- 저장소의 `scanGitHubSecretScanningContent`로 같은 문서를 검사: exit 0, 추가 패턴 위반 0건.
- 최초 `pnpm harness:check`와 `secretlint-files.mjs`의 pnpm 경유 실행은 의존성 재설치 확인에 TTY가 없어 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`로 exit 1이었다. 의존성 삭제·재설치를 승인하거나 설정을 바꾸지 않고, 위와 같이 실제 검사 진입점과 설치된 CLI를 직접 실행했다. 최초 명령 자체가 통과했다고 기록하지 않는다.

제품 동작을 변경하지 않아 추론·빌드·통합 테스트와 `audit:restricted-models`는 실행하지 않았다. 최초 문의문 작성 단계에서 발송·구매·모델 교체·배포는 수행하지 않았다. 문서의 저장소 반영·PR·병합 결과는 해당 PR 기록을 따른다.
