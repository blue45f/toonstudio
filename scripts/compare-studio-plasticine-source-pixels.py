# -*- coding: utf-8 -*-
"""원본을 수정하지 않고 한 장씩 디코딩해 표본 지문을 비교한다."""
import argparse, datetime, gc, hashlib, json, platform, resource, signal, sys, time
from pathlib import Path

def metadata(p):
    s=p.lstat()
    return dict(bytes=s.st_size,mode=s.st_mode,mtimeNs=s.st_mtime_ns,inode=s.st_ino,device=s.st_dev,nlink=s.st_nlink)

def file_sha(p):
    h=hashlib.sha256()
    with p.open("rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b:break
            h.update(b)
    return h.hexdigest()

def high_water():
    n=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(n if platform.system()=="Darwin" else n*1024)

def timeout_handler(signum, frame):
    raise TimeoutError("원본 픽셀 비교의 55초 실행 한도 초과")

ap=argparse.ArgumentParser()
ap.add_argument("--plan",required=True)
ap.add_argument("--output",required=True)
ap.add_argument("--execute",action="store_true")
args=ap.parse_args()
plan_raw=Path(args.plan).read_bytes()
plan=json.loads(plan_raw)
if not args.execute:
    print(json.dumps(dict(status="prepared-not-executed",inputs=len(plan["inputs"]))))
    sys.exit(0)
output=Path(args.output)
if output.exists():raise FileExistsError("결과 경로가 이미 존재합니다.")
started=time.monotonic()
signal.signal(signal.SIGALRM,timeout_handler)
signal.alarm(55)
result=dict(schema="toonstudio.free-plasticine-pixel-comparison.v1",startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),planSha256=hashlib.sha256(plan_raw).hexdigest(),status="running",images=[],comparisons=[],resampled=False,sourceModified=False,renderEquivalentProven=False,hardMemoryLimitEnforced=False)
exit_code=1
try:
    if file_sha(Path(plan["catalogPath"]))!=plan["catalogSha256"]:
        raise RuntimeError("비교 대상 카탈로그 지문 변경")
    from PIL import Image, ImageFile, __version__ as pillow_version
    if ImageFile.LOAD_TRUNCATED_IMAGES:
        raise RuntimeError("잘린 이미지 허용 설정을 사용하지 않습니다.")
    result["pillowVersion"]=pillow_version
    for item in plan["inputs"]:
        p=Path(item["path"])
        if p.is_symlink() or metadata(p)!=item["metadata"]:
            raise RuntimeError("디코딩 전 원본 파일 정보 변경")
        if file_sha(p)!=item["sha256"]:raise RuntimeError("원본 지문 불일치")
        with Image.open(p) as check:
            if check.format!="PNG":raise RuntimeError("PNG가 아닌 원본")
            check.verify()
        with Image.open(p) as im:
            if im.size!=(8192,8192) or im.mode not in ("RGB","L"):
                raise RuntimeError("예상 범위를 벗어난 이미지 모드")
            info=dict(iccSha256=hashlib.sha256(im.info["icc_profile"]).hexdigest() if im.info.get("icc_profile") else None,srgb=im.info.get("srgb"),gamma=im.info.get("gamma"),chromaticity=im.info.get("chromaticity"))
            im.load()
            raw=hashlib.sha256((im.mode+":"+str(im.size)).encode("ascii"))
            samples=hashlib.sha256((item["channel"]+":"+str(im.size)).encode("ascii"))
            for y in range(0,im.height,64):
                tile=im.crop((0,y,im.width,min(y+64,im.height)))
                sample=None
                try:
                    raw.update(tile.tobytes())
                    if item["channel"]=="roughness":
                        sample=tile if tile.mode=="L" else tile.getchannel("G")
                    else:
                        sample=tile if tile.mode=="RGB" else tile.convert("RGB")
                    samples.update(sample.tobytes())
                finally:
                    if sample is not None and sample is not tile:sample.close()
                    tile.close()
            row=dict(family=item["family"],channel=item["channel"],path=str(p),fileSha256=item["sha256"],mode=im.mode,width=im.width,height=im.height,decodedRawSha256=raw.hexdigest(),channelSampleSha256=samples.hexdigest(),colorMetadata=info,pillowVerifyReturnedNormally=True)
        if metadata(p)!=item["metadata"]:raise RuntimeError("디코딩 후 원본 파일 정보 변경")
        result["images"].append(row)
        gc.collect()
        if high_water()>plan["observedRssCeilingBytes"]:
            raise RuntimeError("관측된 최대 RSS가 계획 범위를 초과")
    for channel in ("baseColor","normal","roughness"):
        a=next(x for x in result["images"] if x["family"]=="free" and x["channel"]==channel)
        b=next(x for x in result["images"] if x["family"]=="paid" and x["channel"]==channel)
        result["comparisons"].append(dict(channel=channel,sameOriginalDecodedMode=a["mode"]==b["mode"],sameDecodedRaw=a["decodedRawSha256"]==b["decodedRawSha256"],sameChannelSamples=a["channelSampleSha256"]==b["channelSampleSha256"],sameColorMetadata=a["colorMetadata"]==b["colorMetadata"]))
    for item in plan["inputs"]:
        if metadata(Path(item["path"]))!=item["metadata"]:raise RuntimeError("완료 시 원본 파일 정보 변경")
    result["status"]="passed"
    result["allSourceMetadataUnchanged"]=True
    exit_code=0
except BaseException as exc:
    result["status"]="failed"
    result["errorType"]=type(exc).__name__
    result["error"]=str(exc)
finally:
    signal.alarm(0)
    result["elapsedSeconds"]=time.monotonic()-started
    result["maxRssBytes"]=high_water()
    result["actualExit"]=exit_code
    result["finishedAt"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with output.open("x",encoding="utf-8") as f:
        json.dump(result,f,ensure_ascii=False,indent=2)
        f.write("\n")
print(json.dumps(dict(status=result["status"],actualExit=exit_code,output=str(output),elapsedSeconds=result["elapsedSeconds"],maxRssBytes=result["maxRssBytes"]),ensure_ascii=False))
sys.exit(exit_code)
