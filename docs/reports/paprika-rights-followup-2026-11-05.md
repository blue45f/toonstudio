# Paprika 가중치 권리·독립 대체 후보 후속 조사 — 2026-11-05

상태: **current / 1차 출처 조사 완료, 상용 권리 해소·기능 동등 대체 미완료**. 기준 HEAD는
`8d315c85d6fde4a3a30255612c756d3e299a95b0`이다. 이번 작업은 새 증거 JSON과 이 보고서만
작성했다. 기존 runtime·모델·고지·보고서를 수정하지 않았고, 제한 가중치를 다운로드·추론·학습·증류하지 않았다.

Paprika의 별도 상용 허가 증거는 확보하지 못했다. 구현 포트의 MIT 표기와 ONNX 변환만으로 원저자
가중치 조건을 해소했다고 볼 근거가 없다. 독립 계보의 소형 BSD-3-Clause ONNX 후보를 추가로 확인했지만,
Paprika의 풍경·일반 컷 애니풍 품질과 브라우저 동등성은 미검증이다. **기존 기능을 제거하거나
새 후보를 제품 대체로 채택할 조건은 충족되지 않았다.**

## 현재 자산과 변환 계보

| 확인 대상 | 고정 식별자와 결과 | 증거 수준 |
| --- | --- | --- |
| 로컬 ONNX | 8,702,673 bytes; SHA-256 `7cb5bf08d7778a8f4e25f1e654fdc24d56dc9b6cbb9c1db42e4f9d0425e7fe62`; Git blob `2a61089d9f4232f6058d47683a39241ca7a42ba8` | 실제 파일을 읽어 해시·graph metadata 확인 |
| ONNX 계약 | PyTorch producer 2.14.1, IR 7, opset 13; `image` → `anime`, float32 `[1,3,512,512]`; node 614개; provenance metadata 없음 | metadata 검사만 수행, 추론하지 않음 |
| 저장소 도입 | `19d744abb140d634926a9802e81f24b4378c2eb2`, 2026-10-05 | commit은 공식 .pt의 ONNX 변환과 state_dict 검증을 기록 |
| 기존 변환 고지 | `weights/paprika.pt`, 8,603,556 bytes, 기록된 SHA-256 `3eaba1b6d01e88ea32b16a6006b04eb3f60327c1dcc841de640d3196898da344`; 누락·초과 0, 기존 최대 오차 2.9e-4 | **기존 기록**이며 이번에 .pt hash·수치 일치를 재현하지 않음 |
| PyTorch 포트 | commit `25d7b017267208dfaf34026aa3425e518372aa2f`; paprika.pt blob `58086c9db9fc7a9e5c2876ca31b8079599352643`, 8,603,556 bytes | 공식 디렉터리 metadata만 조회, binary body 미다운로드 |
| 원본 TensorFlow | commit `724b5ce75185c2e838d30c9077dbb967ab034254`; checkpoint 텍스트는 `Paprika-54.ckpt` 선택 | 이것만으로 배포 .pt가 정확히 54 epoch 변환이라고 입증하지 않음 |

로컬 고지와 도입 commit이 주장하는 경로는 **원본 TF → bryandlee의 .pt → 제품 ONNX**다.
[포트의 고정 README](https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/README.md)는
Paprika를 원본 TensorFlow 가중치의 변환 결과로 설명한다.
[변환 코드](https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/convert_weights.py)는
원본 checkpoint를 restore하여 이름·축을 바꾸고 state_dict로 저장하며,
[hubconf.py](https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/hubconf.py)는
paprika 별칭을 해당 .pt에 연결한다. 따라서 문서상 계보의 신뢰도는 높다. 그러나 고정된 상류 epoch,
과거 .pt 다운로드 영수증과 전체 tensor 동등성을 이번 조사에서 독립 재현했다고는 말하지 않는다.

제품의 기존 사용 범위는 사진·스케치·일반 컷의 기기 애니풍 변환이다. 512² RGB를 [-1,1]로 정규화하고
알파는 흰색 위에 합성하며, 출력은 원본 크기로 확대한다. 후보가 단순히 그림을 변환한다는 것만으로
이 범위·세부 구조·시각 품질·취소·fallback·지연 로딩까지 동등하다고 판정할 수 없다.

## 원저자 조건과 MIT 포트의 구분

[원저자 고정 README의 License 절](https://github.com/TachibanaYoshino/AnimeGANv2/blob/724b5ce75185c2e838d30c9077dbb967ab034254/README.md#license)은
비상업 목적 사용을 명시하고, 상업 이용에는 저자에게 연락하여 별도 허가서를 받는 경로를 적는다.
별도 LICENSE 파일이 없다는 사실은 상용 허용 근거가 아니다. 같은 README의 스타일 자료 표는
Paprika BDRip 프레임 1,284장을 기록한다. 학습 자료 권리 확인 공백은 명시적 이용 조건과 별도 항목이다.

[포트 MIT LICENSE](https://github.com/bryandlee/animegan2-pytorch/blob/25d7b017267208dfaf34026aa3425e518372aa2f/LICENSE)는
Bryan Lee 구현의 권리 고지다. 그 문구에서 원저자의 Paprika checkpoint를 별도 상업용으로 재허가받았다는
증거를 찾지 못했다. 포트가 원본 가중치를 변환했다고 직접 설명하므로, 포트의 MIT만 적용해 원본 조건을
없애는 결론은 채택하지 않는다. 이 조사에서 읽은 저장소 기록에 허가서가 없다는 것과, 다른 곳에도
허가서가 절대로 없다는 주장은 다르다. 실제 허가서를 확보한다면 정확한 checkpoint·ONNX·상용 이용·재배포에
적용되는 범위를 확인해야 한다. 저자에게 메시지를 보내지는 않았다.

## 이미 탈락한 light_paprika 평가를 다시 성공으로 취급하지 않음

[기존 후보 보고서](commercial-model-replacement-candidates-2026-11-05.md)와
[브라우저 영수증](../evidence/commercial-model-candidates-2026-11-05/light-paprika-evaluation/browser-wasm-result.json)을
읽었다. CPU와 browser 최대 절대 오차 0.0437966은 기존 기준 2/255보다 컸고, 기존 보고서는 색조 변화·흐림·grid/경계
artifact를 기록했다. ORT CPU 1.20.1과 Web 1.30.0이 달라 원인을 모델 자체로 확정하지는 않는다.
이번에는 해당 모델을 다운로드·변환·실행하지 않았고, 기준을 낮추거나 제품 동등성 통과로 바꾸지 않았다.

## 별도 계보의 추가 후보

### ONNX Model Zoo Fast Neural Style — 격리 평가 가능한 후보

[고정 모델 README](https://github.com/onnx/models/blob/c5cae0f1942c8d7727372c7b1f6b485aa39e4421/validated/vision/style_transfer/fast_neural_style/README.md)는
모델별 BSD-3-Clause를 명시하고 각 checkpoint를 직접 연결한다. 모델별 조건을 저장소 루트의 Apache
표기로 대신하지 않았다. [PyTorch 원 구현](https://github.com/pytorch/examples/blob/acc295dc7b90714f1bf47f06004fc19a7fe235c4/fast_neural_style/README.md)은
COCO 2014 content와 style 이미지로 별도 학습하는 방법을 설명한다.
[그 BSD-3-Clause 고지](https://github.com/pytorch/examples/blob/acc295dc7b90714f1bf47f06004fc19a7fe235c4/LICENSE)는
소스·바이너리 재배포 조건을 제공한다. 상류 고지·조건·면책과 비홍보 조항 보존이 필요하다.

| 고정 후보 | 실제 checkpoint 식별자 | 이번에 받은 것 |
| --- | --- | --- |
| Mosaic opset 9 | 6,728,029 bytes; SHA-256 `fa646dedade881243f8d5a2ceb7de2b93675b21fc24f7482894ac4851a9a0a47` | 공식 Git LFS pointer 텍스트 132 bytes만 조회 |
| Candy opset 9 | 6,728,029 bytes; SHA-256 `9d11a3529d1e547da6ae07201d93484dbab2ec0a3614535752c8f40f0fe2968a` | 공식 Git LFS pointer 텍스트 132 bytes만 조회 |

이 계열은 AnimeGAN 변환과 별도인 학습 경로가 문서로 확인된다. 현재 제품과 달리 RGB [0,255]의
NCHW 입력·출력을 사용해 adapter가 필요하다. 작은 ONNX이므로 기기 평가 후보로 볼 수 있지만,
실제 graph·operator, WASM/WebGPU, 메모리·속도는 측정하지 않았다.
[ORT 공식 문서](https://onnxruntime.ai/docs/tutorials/web/)의 WASM 지원 설명도 특정 후보의 실행 성공 증거는 아니다.

Mosaic·Candy 등은 회화풍 질감·색 변환이다. Paprika 애니풍 색면·윤곽, 풍경·컷·얼굴의 구조 보존
동등성은 확인되지 않았다. COCO 개별 이미지와 원 style 그림의 권리도 전수 확인하지 않았다.
이는 후보 가중치가 자동으로 비상업이라는 결론이 아니라 별도 확인 공백이다. **상용 조건을 검토하며
격리 평가할 다음 후보이지 제품 대체 완료가 아니다.**

### Google Magenta Arbitrary Stylization — exact weight grant 확인이 먼저인 후보

[정확한 TFHub v2 카드](https://github.com/tensorflow/tfhub.dev/blob/c2f2d3b759f6171059f10e1e9f5a30d44d729606/assets/docs/google/models/magenta/arbitrary-image-stylization-v1-256/2.md)와
[원 학습 설명](https://github.com/magenta/magenta/blob/be6558f1a06984faff6d6949234f5fe9ad0ffdb5/magenta/models/arbitrary_image_stylization/README.md),
[공식 브라우저 소스](https://github.com/magenta/magenta-js/blob/96bad8837da43beb53f2e5aaea9f29f3db4bdddb/image/src/arbitrary_stylization/model.ts)를
고정했다. 별도 조사 에이전트는 [Google 모델 가족 카드](https://www.kaggle.com/models/google/arbitrary-image-stylization-v1)의
검색 metadata에서 Apache 2.0을 관찰했다. 정확한 Kaggle v2 변형 본문은 독립적으로 읽지 못했고
고정 v2 카드에는 license 줄이 없다. 코드·튜토리얼의 Apache footer로 정확한 weight 허가를 대신하지 않는다.

원 연구(2017)와 [브라우저 이식 기록](https://magenta.withgoogle.com/blog/2018/12/20/style-transfer-js/)(2018)은
별도 학습·Google 모델 증류 계보를 설명한다. Paprika 계보와 독립이라는 문서상 근거는 강하지만
tensor ancestry 전수 증명은 아니다. Painter by Numbers·DTD·ImageNet 사용이 기록되어 있고,
[DTD 배포 페이지](https://www.robots.ox.ac.uk/~vgg/data/dtd/)는 연구 목적 제공을 명시한다.
그 조건이 공개 Google 가중치에 자동으로 비상업 조건을 부과한다고 단정하지 않는다.

공식 기본 브라우저 manifests와 shard HEAD metadata상 weight는 predictor 9,544,344 +
transformer 7,815,640 = **17,359,984 bytes**다. 별도 경량 데모의 약 12MB 수치·속도를 공식 기본
asset이나 TFHub v2에 적용하지 않는다. JSON에 manifest hash·generation 및 다섯 shard의
size/generation/CRC32C를 보존했다. shard 본문과 모델 archive는 받지 않았다.

공식 TF.js GPU 구현은 있으나 구형 API이고 현재 ORT용 exact ONNX와 provider parity는 미검증이다.
content와 style 두 입력, NHWC RGB [0,1]이 필요하며 권리가 확인된 style reference를 선정해야 한다.
일반 회화 전이는 Paprika 애니풍 품질·구조 보존을 보장하지 않는다. 정확한 weight grant부터 확보해야 한다.

## 이어서 독립적으로 진행할 수 있는 일과 남은 제약

- ONNX 후보는 고정 pointer와 모델별 고지를 기준으로 권리가 확인된 입력만 사용해 격리 평가할 수 있다.
  원 구현·CPU·브라우저의 같은 버전 비교, shape/finite, alpha·odd size, 시간·메모리, 아트 수락을 각각 확인해야 한다.
- Google은 정확한 variant 및 브라우저 checkpoint에 적용되는 모델 grant를 먼저 확인해야 한다.
  데이터·style 참조의 권리는 모델 grant와 따로 기록한다.
- 직접 학습 경로라면 사용 허가가 있는 content/style corpus·손실망 등 모든 pretrained 구성 요소의 권리와
  수락 기준이 먼저 필요하다. 제한 Paprika 가중치나 그 출력을 teacher/target으로 재사용하지 않는다.
- 현재 Paprika의 별도 상용 권한과 후보의 기능·품질·브라우저 동등성이 남아 있다. 기존 기능과 모델은 보존했다.

## 증거와 검증

정확한 URL·commit·blob·LFS hash·로컬 hash·confidence·미검증 항목은
[새 증거 JSON](../evidence/commercial-model-rights-2026-11-05/paprika-rights.json)에 있다.
읽기 전용 검사는 `sha256sum`, `git show`, `git ls-tree`, 기존 격리 venv의 ONNX metadata parser로 수행했다.
metadata parser는 `onnx.load_model_from_string`으로 입력/출력·producer·opset만 읽고 추론하지 않았다.

실행 위치는 `/workspace/toonstudio`다. 문서 검증 결과는 증거 JSON의 `validation`에 기록한다.

```sh
pnpm harness:check
node scripts/secretlint-files.mjs -- docs/evidence/commercial-model-rights-2026-11-05/paprika-rights.json docs/reports/paprika-rights-followup-2026-11-05.md
git diff --check
```

새 후보 다운로드·변환·추론·품질 평가·학습·제품 통합 테스트·전체 typecheck/build는 실행하지 않았다.
commit·PR·merge·push·배포도 수행하지 않았다.


검증 결과: 하네스·새 파일 2개 Secretlint·diff 검사가 통과했고, JSON parse·핵심 사실 불변식도 통과했다.
보호 입력의 전부 불변을 단언한 첫 검사는 runtime 파일 hash 차이를 탐지해 실패했다. 부모는 다른 담당자의
승인된 provenance 상단 주석 갱신이며 본문 hash는 같다고 확인했다. 해당 병행 변경을 되돌리거나 수정하지
않았다. Paprika ONNX·고지·asset loader·기존 후보 보고서의 hash는 시작 시점과 같았다.
정확한 전후 hash와 병행 변경 귀속은 JSON에 남겼다.
