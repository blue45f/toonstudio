"""Verify actual native recording packets and the ending, not just a downloaded filename.

Inputs are CI fixtures produced by the existing Chromium/Remotion workflow.
Uses ffprobe/ffmpeg already installed by that workflow; no third-party Python packages.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path
from typing import Any

WIDTH, HEIGHT = 90, 160


def probe(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_packets",
         "-show_entries", "stream=index,codec_type,codec_name,width,height:packet=stream_index,pts_time,duration_time",
         "-of", "json", str(path)],
        check=True, capture_output=True, timeout=40,
    )
    if len(result.stdout) > 32_000_000:
        raise ValueError("Fixture packet report exceeds the 32 MB verification budget")
    return json.loads(result.stdout)


def timing(data: dict[str, Any], seconds: float) -> dict[str, Any]:
    report: dict[str, Any] = {}
    for kind in ("video", "audio"):
        streams = [s for s in data.get("streams", []) if s.get("codec_type") == kind]
        if len(streams) != 1:
            raise ValueError(f"Expected exactly one {kind} stream, got {len(streams)}")
        stream = streams[0]
        packets = [p for p in data.get("packets", []) if p.get("stream_index") == stream["index"] and "pts_time" in p]
        if not packets:
            raise ValueError(f"No real {kind} packets were present")
        spans = [(float(p["pts_time"]), float(p["pts_time"]) + float(p.get("duration_time", 0))) for p in packets]
        if not all(math.isfinite(start) and math.isfinite(end) for start, end in spans):
            raise ValueError(f"Nonfinite {kind} timestamps")
        first = min(start for start, _ in spans)
        last = max(end for _, end in spans)
        report[kind] = {"codec": stream.get("codec_name"), "packets": len(packets), "first_pts": first, "last_end": last}
        # Native real-time recording is not a constant-30fps rendering contract.
        # Nevertheless, both tracks must actually reach the ending near 15 seconds.
        if first < -0.25 or first > 0.25 or not seconds - 0.5 <= last <= seconds + 0.5:
            raise ValueError(f"{kind} track is incomplete or mistimed: first={first:.3f}s, last={last:.3f}s, expected {seconds}s")
    if abs(report["video"]["last_end"] - report["audio"]["last_end"]) > 0.5:
        raise ValueError("Native video/audio endpoint drift exceeds 0.5 seconds")
    return report


# ffmpeg 의 scale 필터는 yuv420p 스트림에 붙은 color_range 태그를 따르지 않고 limited 범위로 가정한다. Chromium 이 full range(pc)·BT.709
# 로 태그해 쓴 녹화를 그대로 RGB 로 바꾸면 어둡게 읽혀(검은색이 눌려) 같은 화면인데도 배경 오차가 12 를 넘는다. 스트림이 선언한 범위와 행렬로
# 변환해야 두 영상을 같은 기준에서 비교한다. 태그가 없으면(unknown) ffmpeg 기본값을 그대로 쓴다.
COLOR_MATRIX = {"bt709": "bt709", "bt470bg": "bt601", "smpte170m": "bt601", "bt2020nc": "bt2020"}
COLOR_RANGE = {"pc": "full", "tv": "limited"}


def scale_color_options(stream: dict[str, Any]) -> str:
    options = []
    value_range = COLOR_RANGE.get(str(stream.get("color_range")))
    if value_range:
        options.append(f"in_range={value_range}")
    matrix = COLOR_MATRIX.get(str(stream.get("color_space")))
    if matrix:
        options.append(f"in_color_matrix={matrix}")
    return ":".join(options)


def video_color_options(path: Path) -> str:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=color_range,color_space", "-of", "json", str(path)],
        check=True, capture_output=True, timeout=40,
    )
    streams = json.loads(result.stdout).get("streams") or [{}]
    return scale_color_options(streams[0])


def ending(path: Path, seconds: float) -> bytes:
    color = video_color_options(path)
    scale = f"scale={WIDTH}:{HEIGHT}:flags=area" + (f":{color}" if color else "")
    result = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-threads", "1", "-i", str(path),
         "-map", "0:v:0", "-an", "-filter_threads", "1", "-vf",
         f"select=gte(t\\,{seconds - 0.5}),{scale},format=rgb24",
         "-fps_mode", "passthrough", "-frames:v", "1", "-f", "rawvideo", "pipe:1"],
        check=True, capture_output=True, timeout=40,
    )
    if len(result.stdout) != WIDTH * HEIGHT * 3:
        raise ValueError("No decodable video frame reaches the final half-second")
    return result.stdout


def compare_ending(actual: bytes, reference: bytes) -> dict[str, float]:
    if len(actual) != WIDTH * HEIGHT * 3 or len(reference) != len(actual):
        raise ValueError("Ending images have invalid decoded dimensions")
    error = sum(abs(a - b) for a, b in zip(actual, reference)) / len(actual)
    # A dark/blank ending could have low global error. Also require the white
    # title/CTA in the reference, with a 1px allowance for rasterization/codec noise.
    foreground = matched = 0
    for y in range(int(HEIGHT * 0.36), int(HEIGHT * 0.86)):
        for x in range(1, WIDTH - 1):
            index = (y * WIDTH + x) * 3
            if min(reference[index:index + 3]) < 180:
                continue
            foreground += 1
            if any(min(actual[(yy * WIDTH + xx) * 3:(yy * WIDTH + xx) * 3 + 3]) >= 100
                   for yy in range(y - 1, y + 2) for xx in range(x - 1, x + 2)):
                matched += 1
    coverage = matched / foreground if foreground else 0.0
    if error > 12 or foreground < 20 or coverage < 0.8:
        raise ValueError(f"Native ending does not match the Remotion CTA: MAE={error:.3f}, foreground={foreground}, coverage={coverage:.3f}")
    return {"pixel_mae_0_to_255": error, "title_cta_coverage": coverage}


def self_test() -> None:
    data = {"streams": [{"index": 0, "codec_type": "video"}, {"index": 1, "codec_type": "audio"}],
            "packets": [{"stream_index": i, "pts_time": str(t), "duration_time": "0.02"} for i in (0, 1) for t in (0, 14.98)]}
    timing(data, 15)
    invalid = json.loads(json.dumps(data))
    invalid["packets"][1]["pts_time"] = "9.969"
    try:
        timing(invalid, 15)
    except ValueError:
        pass
    else:
        raise AssertionError("A 10s video plus 15s audio must fail")
    # 10-second short-form preset: both tracks must reach the 10s ending, and the contracts must not be interchangeable.
    short = {"streams": data["streams"],
             "packets": [{"stream_index": i, "pts_time": str(t), "duration_time": "0.02"} for i in (0, 1) for t in (0, 9.98)]}
    timing(short, 10)
    for recording, contract in ((short, 15), (data, 10)):
        try:
            timing(recording, contract)
        except ValueError:
            pass
        else:
            raise AssertionError(f"A recording that does not match the {contract}s contract must fail")
    reference = bytearray([20] * (WIDTH * HEIGHT * 3))
    for y in range(65, 75):
        for x in range(20, 70):
            index = (y * WIDTH + x) * 3
            reference[index:index + 3] = bytes([255, 255, 255])
    compare_ending(bytes(reference), bytes(reference))
    try:
        compare_ending(bytes([20] * len(reference)), bytes(reference))
    except ValueError:
        pass
    else:
        raise AssertionError("A blank ending must fail even on a matching dark background")
    # 선언된 색 범위·행렬을 변환에 넘기는지(태그를 무시하면 full range 녹화가 어둡게 읽힌다). ffmpeg 없이 확인한다.
    assert scale_color_options({"color_range": "pc", "color_space": "bt709"}) == "in_range=full:in_color_matrix=bt709"
    assert scale_color_options({"color_range": "tv", "color_space": "bt470bg"}) == "in_range=limited:in_color_matrix=bt601"
    assert scale_color_options({"color_range": "unknown"}) == ""
    assert scale_color_options({}) == ""
    print("Native output verifier self-tests passed (valid, truncated, 10s short-form, matching, blank, color tags)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path)
    parser.add_argument("--remotion", type=Path)
    parser.add_argument("--seconds", type=float, default=15)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.results is None or args.remotion is None or not math.isfinite(args.seconds) or args.seconds <= 0:
        parser.error("--results, --remotion and a positive finite duration are required")
    report: dict[str, Any] = {"expected_seconds": args.seconds, "passed": False}
    try:
        candidates = [p for p in args.results.rglob("toonstudio-promo.*") if p.suffix in (".webm", ".mp4")]
        if len(candidates) != 1:
            raise ValueError(f"Expected one original browser download, got {len(candidates)}")
        native = candidates[0]
        report["browser_file"] = str(native)
        packets = probe(native)
        (args.results / "promo-native-packets.json").write_text(json.dumps(packets, indent=2))
        report["timing"] = timing(packets, args.seconds)
        report["ending"] = compare_ending(ending(native, args.seconds), ending(args.remotion, args.seconds))
        report["passed"] = True
        print(json.dumps(report, indent=2))
    except Exception as error:
        report["error"] = str(error)
        raise
    finally:
        args.results.mkdir(parents=True, exist_ok=True)
        (args.results / "promo-native-validation.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
