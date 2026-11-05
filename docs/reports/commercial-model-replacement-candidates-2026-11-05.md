# 제한 모델의 상용 호환 대체 후보 조사 — 2026-11-05

상태: **current / 후보 조사·경량 모델 격리 1차 평가 완료, 제품 대체·기능 동등성 검증 미완료**.
기준 HEAD는 `8d315c85d6fde4a3a30255612c756d3e299a95b0`이다. 이 문서는 기존 감사 변경과
모델 기능·가중치를 보존한다. Mixbox는 조사·수정 범위에서 제외한다.

## 현재 결론

Tag2Pix와 Paprika를 바로 바꿀 수 있는 **가중치 권리·입력 의미·품질·브라우저 실행이 함께 확인된
checkpoint는 찾지 못했다**. 아래 후보는 채택 완료 목록이 아니다. 제한 가중치를 추출·복제·증류하거나
대체 학습의 teacher/target으로 쓰지 않았다. 신규 model adapter나 성공처럼 보이는 placeholder도 만들지 않았다.

| 후보 | 코드 / 가중치 근거 | 기존 기능과의 차이·배포 경계 | 결정 |
| --- | --- | --- | --- |
| Cobra | 공식 코드 Apache-2.0, 공식 HF model card도 Apache-2.0. base는 PixArt-XL OpenRAIL++ | reference/hint 기반 CUDA DiT, 원문 앱은 semantic tag 입력 없음. image encoder 하나가 2.53 GB이며 base와 추가 weights도 필요 | 상용 조건 검토 가능한 서버 실험 후보. 115 tag/browser offline 대체로 채택 불가 |
| PaintsTensorFlow | 코드 MIT. 공식 README에서 draft·colorization ONNX 제공. Drive checkpoint의 별도 grant·immutable hash 미확보 | raster color hint 입력. 115개 의미 태그→해당 부위 색 배치 기능 없음. 70만 장 학습 자료의 출처·권리 미기록 | 작은 ONNX라는 이유만으로 채택하지 않음 |
| CartoonGan-tensorflow의 `light_*` | Apache-2.0 저장소에 저자 자체 학습 checkpoint가 직접 포함되며 해당 경로의 weight 제외 조건을 찾지 못함 | 작은 generator 및 TFJS export는 기술적으로 유망. corpus 출처 미기록은 별도 확인 공백이며 자동 NC 판정 사유가 아님 | `light_paprika`만 `/tmp` 격리 1차 평가 완료. browser parity·품질 수락 미통과로 제품 교체 보류 |
| CartoonGan-tensorflow의 `style_transfer/cartoongan/pretrained_weights/*` | 같은 README가 원저자 Torch weights를 추출·변환한 별도 경로라고 명시 | `light_*` 자체 학습 경로와 출처가 다름 | Apache 저장소라는 이유로 전체 weight를 통합하지 않음 |
| MangaNinja | 공식 ali-vilab 저장소 LICENSE가 CC-BY-NC-4.0. HF 미러 apache 메타데이터와 충돌 | reference 기반 diffusion이며 기존 tag API와 다름 | 비상업 대체 후보에서 제외 |
| AnimeGANv3 / White-box Cartoonization | 공식 원본이 각각 비상업 조건 / CC-BY-NC-SA-4.0 명시 | 기술적 유사성으로 권리 제한 해소 불가 | 제외 |
| HF `vumichien/AnimeGANv2_Shinkai` | 상단 Apache 메타데이터와 본문의 비상업·상용 별도 허가가 충돌 | 원본 AnimeGAN weights의 재배포 경로 | 제외 |
| Style2Paints V3/V4/V5 | 공식 root README가 코드 Apache-2.0과 pretrained models/binary releases 권리 유보를 구분. V3 README도 모든 모델 권리 유보 | 생성 결과물의 상용 이용 허용은 checkpoint 배포 허가와 다름. V5는 preview 상태 | 공개 코드 라이선스만으로 번들 weight 교체 불가 |
| PaintsChainer | 공식 README에 source MIT / pretrained model All Rights Reserved를 분리 명시 | hint 기반 기능도 semantic tag 입력과 다름 | 공개 weight의 상용·재배포 grant 미확보 |
| `mattmdjaga/segformer_b2_clothes` | 공식 model card가 NVIDIA SegFormer LICENSE로 연결. §3.3이 연구·평가 목적의 비상업 사용으로 제한 | 18개 human parsing class이며 기존 세부 의상/눈/리본 구분도 부족 | 다른 NC 모델로 교체하지 않음 |
| Anime-Face-Segmentation | MIT 저장소에 6,428,741-byte 자체 checkpoint 포함, weight carveout 미발견 | RGB face input → background/hair/eye/mouth/face/skin/clothes 7개 mask. 선화 domain과 115 tags 전부의 세부 영역 대응 미검증 | 작은 semantic mask 평가 후보이며 전체 tag 대체 아님 |
| CLIPSeg | 공식 CIDAS HF card Apache-2.0과 원본 LICENSE의 weight 제외·저자의 연구용 공개 설명이 충돌 | arbitrary text mask는 가능하지만 세부 선화 영역 품질 미검증. 공개 ONNX의 최소 q4f16 파일도 115,520,184 bytes | NC로 단정하지 않음. 상용 재배포 grant 충돌 미해소, 다운로드하지 않음 |

이 조사에서 학습 데이터 grant가 확인되지 않았다는 것은 **확인 공백**이다. 모든 후보 가중치에
법적으로 비상업 조건이 적용된다고 판정한 것이 아니다. 반대로 코드의 permissive LICENSE나
HF 메타데이터만으로 원본 checkpoint의 권리 문제가 해결됐다고도 판정하지 않는다.

## 정확한 revision과 크기

| 저장소 | 확인한 revision | 근거 |
| --- | --- | --- |
| `zhuang2002/Cobra` | `48d6168838e05fbb707f393441219069aa33733b` | README·LICENSE·공식 inference source |
| `JunhaoZhuang/Cobra` | `ed677418ceb4fada6d1a369139bd7e8a3a13433d` | 공식 HF model card와 blob metadata |
| `PixArt-alpha/PixArt-XL-2-1024-MS` | `b89adadeccd9ead2adcb9fa2825d3fabec48d404` | base model card와 blob metadata |
| `rapidrabbit76/PaintsTensorFlow` | `41860c76ac98e4f054b4c255856ed9229309b610` | README·LICENSE |
| `mnicnc404/CartoonGan-tensorflow` | `2f26a525f8b604b8e98fb84ebad0af5aef727944` | README·LICENSE·tree metadata |

Cobra의 `image_encoder/pytorch_model.bin`은 2,528,481,905 bytes,
`LE/erika.pth`는 172,789,563 bytes다. line/shadow ControlNet·LoRA·GSRP도 별도다.
PixArt base metadata에는 transformer 2,447,431,856 bytes, VAE 334,643,268 bytes,
text encoder shards 합계 19,049,269,720 bytes가 있다. 이 수치는 전체 파일 목록이며,
모든 파일을 반드시 로드한다는 실측도, 메모리 사용량도 아니다. 적어도 현재 제품의
약 79 MB 단일 Tag2Pix ONNX를 같은 방식으로 바로 교환하는 후보는 아니다.

CartoonGAN 자체 학습 `light_paprika_ckpt/generator.data-00000-of-00001`은
3,643,727 bytes, `generator.index`는 15,265 bytes다. 2026-11-05에 위 고정 revision의 두 파일과
저자 제공 `exported_models/light_paprika_SavedModel`을 `/tmp/toonstudio-light-paprika-evaluation/`에
격리 다운로드했다. 제품 asset/import/의존성에는 추가하지 않았다. data SHA-256은
`044774f6ba811cd738a2b73ea65d71cdbc3756df68117b4a1c98cc18dceedceb`, index는
`954d2b57795f9c6cd9b31497b36e494c90e236584e08dbd084f28bb4d39013c1`이다.
같은 저장소의 44 MB대 원저자 변환 weight 경로는 다운로드하지 않았다.

공식 `train.py`는 light generator를 생성하고 자체 checkpoint가 없으면 scratch pretraining을 한다.
원저자 변환 weights를 가져오는 `cartoonize.py` 경로와 다르다. 코드의 입력은 NHWC RGB float32
`[-1, 1]`, 출력은 같은 크기의 tanh RGB다. 기존 NCHW 512² adapter로 연결하려면 축 변환과
stride/resize 검증이 필요하다. `keras_contrib` instance norm 및 오래된 TF 2.0 alpha API 의존성은
저자가 함께 제공한 SavedModel을 우선 검사하여 회피할 수 있다. 변환·실측은 별도 게이트다.

저장소 전체의 Apache 문구와 저자 자체 학습·checked-in checkpoint는 **격리 평가의 권리 근거**다.
특정 checkpoint의 별도 상용 허가문이나 corpus source manifest는 찾지 못했다. [상용 질문 Issue #41](https://github.com/mnicnc404/CartoonGan-tensorflow/issues/41)은
열린 상태이며 댓글 0개다. 존재하지 않는 저자 답변을 허가 근거로 삼지 않는다. 원문 download
hash·URL은 `cartoongan-light-evaluation-downloads.json`에 보존한다.

## `light_paprika` 격리 평가 결과

저자 Apache 저장소의 고정 revision에 있는 **자체 학습 SavedModel**을 변환했다. 원본 CartoonGAN
변환 weight, 제한된 제품 Paprika/Tag2Pix weight 또는 그 출력은 평가·학습에 사용하지 않았다.
제품 source·asset·runtime 의존성은 이 실험에서 변경하지 않았다.

| 항목 | 실제 결과 | 판정 |
| --- | --- | --- |
| ONNX 변환·정적 검사 | tf2onnx 1.16.1 / TF CPU 2.16.2 / ONNX 1.16.2, opset 13, checker 통과 | 통과 |
| 기존 tensor shape/name | `image` → `anime`, 양쪽 float32 `[1,3,512,512]`, RGB `[-1,1]` | 격리 모델 계약 통과 |
| ONNX artifact | 3,824,883 bytes, SHA-256 `431f2b1c7a3ab31fbee32fcae193e4e65b2304484e0a646a481d1a61351a17a8` | `/tmp`에만 보존, 제품 미추가 |
| TF↔CPU ONNX 수치 일치 | public-domain 풍경 / 자체 도시 그림 max abs error 각각 0.00156891 / 0.00216296 | 기준 `2/255` 미만 통과 |
| CPU ONNX 실측 | ORT 1.20.1 single thread, warm 3회 중앙값 각각 1.96524 / 1.96804 s | 해당 환경·두 입력의 실측 |
| 브라우저 WASM 실행 | ORT Web 1.30.0, Chromium 154 headless, single thread, photo 3회 4.53577 / 4.21377 / 4.22852 s, load 517.04 ms | 실행·finite·shape 통과 |
| 브라우저↔CPU 수치 일치 | max abs error 0.0437966, mean 0.00717923, 3회 동일 | **기준 `2/255` 초과, 실패** |
| 육안 품질 | 두 입력에서 노란/갈색 색조, 세부 흐림, grid·경계 artifact 관찰 | **제품 품질 동등성 미통과, 채택 보류** |
| 통합 기능·WebGPU | 실제 제품 adapter 경유 alpha/odd-size/취소/fallback/lazy-load/WebGPU | 미실행 |

CPU ORT **1.20.1**과 browser ORT **1.30.0**은 버전이 다르다. provider·최적화·reduction 수치 차이를
분리하지 않았으므로 실패를 모델 자체 오류로 단정하지 않는다. 수치 기준을 완화하여 통과 처리하지도
않는다. 풍경 사진은 [USGS Mountain Lake](https://www.usgs.gov/media/images/mountain-lake)이며
[USGS gallery의 public-domain 원칙](https://www.usgs.gov/products/multimedia-gallery)과 이미지 페이지의
별도 제한 부재를 확인했다. 두 번째 그림은 이 평가를 위해 직접 만든 합성 도시다. 학습에는 쓰지 않았다.

원문 inference source와 평가 코드를 대조했다. 양쪽 모두 PIL RGB → float32 `/127.5 - 1`을 **한 번**
적용하며, 평가 wrapper가 NCHW→NHWC→NCHW 축만 변환한다. BGR 또는 double normalization 경로는
없다. 구조를 임의 재구현하지 않고 저자 SavedModel을 그대로 로드했다. 해당 graph와 ONNX의 CPU
출력이 수치 기준 이내여서 큰 channel-order/변환 오류 가능성은 낮다. TF를 import하지 않는 추가 정적
검사에서 ONNX의 Conv kernel 44개(합계 3,511,872 bytes)를 HWIO/depthwise 원래 축으로 되돌리면,
**44개 전부가 raw light checkpoint와 SavedModel variables 양쪽에 byte 단위로 동일하게 존재**했다.
이는 다른 모델의 주 kernel을 잘못 읽었다는 가설에 반하는 근거다. 다만 scalar/norm/metadata를 포함한
모든 변수의 완전 일치는 아직 확인하지 않았다. TF 2.0 alpha 산출물을 TF 2.16.2에서
읽을 때 `OBJECT_CONFIG_JSON` metadata 경고가 있었으므로 이를 누락 변수 검증을 마친 증거로 삼지 않는다.

실측 child-process `ru_maxrss`는 conversion 1,138,884 KiB / 19.1548 s, CPU 평가
1,637,628 KiB / 17.5310 s다. browser wrapper의 132,264 KiB는 전체 Chromium peak를 보장하지 않아
브라우저 총 메모리 수치로 사용하지 않는다. 무거운 작업은 순차 실행하고 끝낸 뒤 다른 type 검사에
환경을 반환했다. 설치·변환은 `/tmp` venv에 한정했으며 공식 PyPI wheel URL/hash 및 45개 resolved
package의 version/license metadata는 `evaluation-toolchain.json`에 기록했다.

실패·복구도 구분한다. `/usr/bin/time` 부재로 첫 측정 명령은 exit 127로 실행되지 않아 Python
`resource` wrapper로 측정했다. CPU 평가 첫 시도는 sandbox mount의 일시적 `ENOSPC` exit 101로
실행 전에 중단됐다. 디스크 여유 4.39 GB를 확인하고 이 실험의 재생성 가능한 pip wheel cache
337,788,886 bytes만 정리한 뒤 한 번 재시도하여 성공했다. 브라우저 첫 실행은 Playwright 기본
Chromium 경로 부재로 실패했고, 기존 `/usr/bin/chromium`으로 실행 경로만 바꾸었다.

재현 코드·입력·visual PNG·통과/실패 영수증은
`docs/evidence/commercial-model-candidates-2026-11-05/light-paprika-evaluation/`에 보존한다.
원본 weight와 ONNX binary는 repository에 추가하지 않았다. 실행 디렉터리는
`/workspace/toonstudio`, 아래 명령은 위 `/tmp` download manifest 및 pinned venv가 있다는 전제다.

코드·원본 Apache LICENSE·저자 자체 checkpoint/SavedModel·후보 ONNX·PD 증명·PNG·영수증을 묶은
검토 artifact는 `/workspace/scratch/toonstudio-light-paprika-evaluation-artifacts.tar.gz`다.
52개 파일, 12,388,496 bytes, SHA-256
`f06f13e944518a8e01150ff1db7f317442adfe634b9fbe821c7f2e8873bb5253`이며 내부 manifest와
각 파일 hash를 다시 검사했다. venv·pip cache·설치된 TF/ORT 도구·큰 중간 tensor와 제한된 제품
weights는 제외했다. 제품 번들 또는 공개 배포 artifact로 채택한 것이 아니다.

```sh
python /tmp/toonstudio-light-paprika-evaluation/run_measured.py conversion /tmp/toonstudio-light-paprika-evaluation/venv/bin/python /tmp/toonstudio-light-paprika-evaluation/inspect_convert.py
python /tmp/toonstudio-light-paprika-evaluation/run_measured.py cpu /tmp/toonstudio-light-paprika-evaluation/venv/bin/python /tmp/toonstudio-light-paprika-evaluation/evaluate_onnx.py
python /tmp/toonstudio-light-paprika-evaluation/serve_evaluation.py
# 별도 terminal: 실제 실행에서는 수치 gate 실패 exit 1이다.
python /tmp/toonstudio-light-paprika-evaluation/run_measured.py browser node /tmp/toonstudio-light-paprika-evaluation/browser_receipt.mjs
```

이 두 입력만으로 style 품질 동등성·권리 최종 승인을 선언할 수 없다. 다음 단계는 동일 ORT 버전에서
provider 수치 차이를 분리하고 raw/SavedModel 변수 일치를 확인한 뒤, 승인된 풍경·일반 컷 corpus와
art reviewer의 수락을 받는 것이다. **현재 제한 제품 모델을 제거할 조건은 충족되지 않았다.**

## 의미 태그에서 mask·hint로 연결하는 경로

현재 115개 tag는 색상 변형을 묶으면 legwear/footwear/panties/skirt/denim/shirt/gloves/neckwear/
jacket/bra/dress/ribbon/skin/bikini/blush/eyes/eyewear/hair/hat/bow/background의 21개 그룹이다.
따라서 각 색마다 신경망을 호출할 필요는 없고, 의미 mask를 얻은 뒤 색 hint로 변환하는 pipeline은
기술적으로 가능하다. 그러나 7-class 얼굴 model은 모든 의상을 하나로 합치며, 18-class 옷 model도
홍채·장갑·속옷·브라·비키니·bow/ribbon을 모두 구분하지 않는다. `denim`, `blush`, `shiny_skin`,
`gradient_background`는 단순 단색 mask 이상의 처리다. 흑백 선화·겹친 의상·작은 눈과 소품에서
mask의 실제 정확도와 이후 colorizer의 hint 준수·경계 누출을 평가해야 한다.

CLIPSeg의 [원저자 답변](https://github.com/timojl/clipseg/issues/35#issuecomment-1580579019)은 weight
라이선스를 지정하지 않았고 연구 목적으로 공개했다고 설명한다. HF Apache 메타데이터와의
충돌을 ONNX 변환이나 tokenizer 교체로 해결할 수는 없다. iColoriT는 코드 MIT에 weight 제외
문구를 찾지 못한 추가 후보지만 외부 Drive checkpoint의 별도 grant·exact size를 확보하지 못했다.
또한 224px local hint 입력이므로 현재 512px semantic tag API와 같은 기능으로 기록하지 않는다.

## 반드시 보존해야 할 계약

- Tag2Pix: grayscale 512×512 line tensor와 115개 semantic color tag의 다중핫 조건.
  hair/eyes/shirt/background 등 태그가 서로 다른 실제 부위의 색으로 반영돼야 한다.
  native-resolution 선화 합성, 중단·실패·offline BYOK fallback, lazy asset load와 입력 검증을 보존한다.
- Paprika: 풍경·일반 컷의 neural photo→anime 변환, 인물 전용 Face Paint와의 구분,
  RGB -1..1 입력과 512×512 출력, alpha 처리·확대 합성·WASM/WebGPU 실패 경로를 보존한다.
- reference 이미지, 수동 color hint 또는 서버 업로드가 필수인 모델로 바꾸면 지금의 의미 태그·offline
  계약에 추가 요구를 부과한다. 공개 API shape만 맞춘 adapter를 동등 대체라고 하지 않는다.
- 단순 색 필터, 고정 부위 좌표 칠하기, random/untrained weights 또는 제한 weights의 distillation은
  이 동등성 조건을 충족하지 않는다.

## 독립 학습·검증의 구체적 다음 단계

현재 가장 확실한 독립 경로는 출처가 입증된 자체 그림/위탁 계약/CC0 corpus로 작은 conditional
image transform network를 새로 학습하는 것이다. 확인된 라이선스의 범위 안에서 표준 U-Net/잔차망과
일반적인 reconstruction/adversarial loss를 사용할 수 있지만, 기존 제한 checkpoint를 초기화나
teacher로 사용하지 않는다. 코드·weights·훈련 데이터·검증 데이터 권리를 각각 기록해야 한다.

실행 순서는 다음과 같다.

1. 각 이미지의 source·author·grant·SHA-256·사용 허용 범위를 가진 training manifest를 확보한다.
   보유 CC0 3D 자산의 합성 렌더는 보조 데이터 후보이며 손그림 영역 품질을 보장하지 않는다.
2. Tag2Pix는 115개 태그의 각 class와 동시 조합, 부위 mask와 색 label을 확보한다.
   train/validation/test는 캐릭터·원저작물·작가·스타일 단위로 분리해 누수를 막는다.
3. Paprika는 일반 풍경·일반 컷 스타일을 포함한 권리 입증 target art를 확보한다.
   특정 영화 프레임을 무단 수집해 데이터 공백을 채우지 않는다.
4. 독립 checkpoint를 hash/revision으로 고정하고 ONNX로 변환해 tensor·opset·WASM/WebGPU
   실제 inference, peak memory·latency·취소·재시도·alpha 및 odd-size 합성을 측정한다.
5. 색 태그 준수율, 선화 보존, 모델 간 처리 실패율과 art reviewer의 블라인드 품질 평가를 기록한다.
   기존 제한 모델을 새로 구동해 테스트 corpus를 생산하지 않는다. 기존 적법한 관찰·공개 예제는
   제품 요구를 이해하는 참고이며 학습 target으로 복사하지 않는다.
6. 사용 기능·품질 수락을 만족한 뒤 adapter를 교체하고, 마지막에 제한 weights·고지·잔재 import를
   제거한 다음 번들에서 exact hash·파일명이 사라짐을 확인한다.

위 단계의 필수 입력인 **권리가 입증된 실제 그림 corpus, semantic annotation, 독립 checkpoint,
GPU/브라우저 품질·성능 측정 결과가 아직 없다**. 이 조사에서 그 공백을 완료로 바꾸어 기록하지 않는다.
제품 모델은 유지되며 현재 상용 출시 차단 사유가 해결된 것은 아니다. 자체 학습 small checkpoint
평가는 이 독립 학습 경로와 병행하며, 단순한 dataset 정보 미확인만으로 유망 후보를 금지하지 않는다.

## 원문과 증거

`docs/evidence/commercial-model-candidates-2026-11-05/`에는 weights를 추가하지 않고 metadata·LICENSE·
README·실행 코드·평가 입력/visual PNG·영수증을 보존한다. `sources.json`은 고정 revision URL·취득
날짜·SHA-256을 보존한다. 모델 binary는 위 별도 scratch archive에서만 검토한다.

- [Cobra 공식 코드](https://github.com/zhuang2002/Cobra), [공식 모델](https://huggingface.co/JunhaoZhuang/Cobra), [base model](https://huggingface.co/PixArt-alpha/PixArt-XL-2-1024-MS)
- [PaintsTensorFlow](https://github.com/rapidrabbit76/PaintsTensorFlow)
- [CartoonGAN 자체 학습 경로](https://github.com/mnicnc404/CartoonGan-tensorflow#inference-with-trained-checkpoint)
- [MangaNinja 공식 LICENSE](https://github.com/ali-vilab/MangaNinjia/blob/main/LICENSE)
- [AnimeGANv3 조건](https://github.com/TachibanaYoshino/AnimeGANv3#-license)
- [White-box Cartoonization 조건](https://github.com/SystemErrorWang/White-box-Cartoonization#license)
- [Shinkai 미러의 본문 조건](https://huggingface.co/vumichien/AnimeGANv2_Shinkai#license)
- [Style2Paints 공식 조건](https://github.com/lllyasviel/style2paints#lisence), [V3 model 조건](https://github.com/lllyasviel/style2paints/tree/master/V3#models)
- [PaintsChainer 공식 조건](https://github.com/taizan/PaintsChainer#license)
- [SegFormer clothes 카드](https://huggingface.co/mattmdjaga/segformer_b2_clothes#license), [NVIDIA 원문](https://github.com/NVlabs/SegFormer/blob/master/LICENSE)
- [Anime face segmentation](https://github.com/siyeong0/Anime-Face-Segmentation), [CLIPSeg 원문](https://github.com/timojl/clipseg#weights), [CIDAS 카드](https://huggingface.co/CIDAS/clipseg-rd64-refined)
