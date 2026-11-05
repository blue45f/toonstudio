from pathlib import Path
import json
import sys
from PIL import Image, ImageOps

work = Path('/tmp/toonstudio-native-resize-same-environment')
evidence = Path('/workspace/toonstudio/docs/evidence/commercial-model-rights-2026-11-05/native-resize-comparison')
original = Path('/tmp/toonstudio-light-paprika-evaluation/inputs/usgs-mountain-lake-original.jpg')
mode = sys.argv[1] if len(sys.argv) > 1 else '--auto'
if mode == '--prepare' or (mode == '--auto' and not (evidence/'comparison.json').exists()):
    # 공개 도메인 원본을 정사각 중앙 crop 후 Pillow Lanczos로 크기만 맞춘다.
    source = Image.open(original).convert('RGBA')
    prepared = ImageOps.fit(source, (2048, 2048), method=Image.Resampling.LANCZOS, centering=(.5, .5))
    (work/'usgs-2048.rgba').write_bytes(prepared.tobytes())
    prepared.save(evidence/'usgs-input-2048.png')
else:
    report = json.loads((evidence/'comparison.json').read_text())
    for case in report['cases']:
        sheet = Image.new('RGB',(case['tw']*2,case['th']*2),(255,255,255))
        for provider in ('native','formerWasmVips'):
            raw=(work/f"{case['id']}-{provider}.rgba").read_bytes()
            image=Image.frombytes('RGBA',(case['tw'],case['th']),raw)
            image.save(evidence/f"{case['id']}-{provider}.png")
            for row,color in enumerate((0,255)):
                composite=Image.new('RGBA',image.size,(color,color,color,255))
                composite.alpha_composite(image)
                sheet.paste(composite.convert('RGB'),(0 if provider=='native' else case['tw'],row*case['th']))
        sheet.save(evidence/f"{case['id']}-composite-comparison.png")
