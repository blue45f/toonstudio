"""검증된 렌더의 알파 경계를 무손실로 자른다. 입력·출력은 생성기 내부 JSON이다."""
import base64
import io
import json
import sys

from PIL import Image


def trim(job):
    with Image.open(job["sourcePath"]) as source:
        image = source.convert("RGBA")
    if list(image.size) != job["sourceSize"]:
        raise ValueError("렌더 실물 치수가 매니페스트와 다릅니다: " + job["id"])
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("알파가 모두 빈 렌더는 장식으로 만들 수 없습니다: " + job["id"])
    cropped = image.crop(bbox)
    output = io.BytesIO()
    cropped.save(output, format="WEBP", lossless=True, method=6, exact=True)
    encoded = output.getvalue()
    with Image.open(io.BytesIO(encoded)) as decoded:
        if decoded.convert("RGBA").tobytes() != cropped.tobytes():
            raise ValueError("무손실 crop 왕복 검증에 실패했습니다: " + job["id"])
    return {"id": job["id"], "trimBbox": list(bbox), "width": cropped.width,
            "height": cropped.height, "body": base64.b64encode(encoded).decode("ascii")}


if __name__ == "__main__":
    try:
        print(json.dumps([trim(job) for job in json.load(sys.stdin)]))
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit("장식 crop 실패: " + str(error)) from error
