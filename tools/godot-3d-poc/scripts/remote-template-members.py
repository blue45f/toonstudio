"""공식 Godot 내보내기 템플릿 아카이브(.tpz, 약 1.2GB)에서 지정한 멤버만 HTTP Range 요청으로 읽어 저장한다.

용도: 버전 사이 wasm 크기 비교(보고서 §7.1)에서 아카이브 전체를 내려받지 않고 `templates/web_*.zip` 두 개만 얻는다.
한계: zip 멤버의 CRC32만 검증한다(`zipfile`이 자동 검증). 아카이브 전체의 SHA512는 검증하지 못하므로
      운영에 쓰는 버전은 이 스크립트가 아니라 `fetch-engine.sh`(전체 다운로드 + SHA512 검증)를 써야 한다.

사용(저장소 루트, 인터프리터는 -I 로 격리 실행):
  python3 -I tools/godot-3d-poc/scripts/remote-template-members.py \
    https://github.com/godotengine/godot/releases/download/4.5.1-stable/Godot_v4.5.1-stable_export_templates.tpz \
    <새 빈 출력 폴더> templates/web_nothreads_release.zip templates/web_release.zip
그다음 각 zip 에서 godot.wasm / godot.js 를 풀고 `node tools/godot-3d-poc/measure/sizes.mjs 4.5.1=<풀린 폴더>` 로 크기를 잰다.
내려받은 데이터는 신뢰할 수 없는 입력이므로 출력 폴더는 비어 있는 새 폴더여야 하고 그 안에서 스크립트를 실행하지 않는다.
네트워크 요청은 `curl` 하위 프로세스가 수행한다(프록시 설정 등 호스트 환경을 그대로 따른다).
"""

import hashlib
import io
import os
import subprocess
import sys
import zipfile


def content_length(url):
    result = subprocess.run(["curl", "-sS", "-I", "-L", url], capture_output=True, text=True, check=True)
    size = None
    for line in result.stdout.splitlines():
        if line.lower().startswith("content-length:"):
            size = int(line.split(":")[1].strip())  # 리다이렉트를 따라가므로 마지막 값을 쓴다
    if size is None:
        raise SystemExit("Content-Length 를 얻지 못했습니다")
    return size


class RemoteFile(io.RawIOBase):
    """HTTP Range 로 읽는 읽기 전용 파일 객체. zipfile 이 필요한 구간만 요청한다."""

    def __init__(self, url):
        self.url = url
        self.size = content_length(url)
        self.pos = 0
        self.calls = 0
        self.fetched = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        if whence == 0:
            self.pos = offset
        elif whence == 1:
            self.pos += offset
        else:
            self.pos = self.size + offset
        return self.pos

    def read(self, n=-1):
        if n < 0:
            n = self.size - self.pos
        n = min(n, self.size - self.pos)
        if n <= 0:
            return b""
        end = self.pos + n - 1
        result = subprocess.run(["curl", "-sS", "-L", "-r", f"{self.pos}-{end}", self.url], capture_output=True, check=True)
        data = result.stdout
        self.calls += 1
        self.fetched += len(data)
        self.pos += len(data)
        return data

    def readinto(self, buffer):
        data = self.read(len(buffer))
        buffer[: len(data)] = data
        return len(data)


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    url, out_dir, members = sys.argv[1], sys.argv[2], sys.argv[3:]
    if os.path.exists(out_dir) and os.listdir(out_dir):
        raise SystemExit(f"출력 폴더는 비어 있어야 합니다: {out_dir}")
    os.makedirs(out_dir, exist_ok=True)
    remote = RemoteFile(url)
    archive = zipfile.ZipFile(io.BufferedReader(remote, buffer_size=1 << 20))
    for member in members:
        if not member.startswith("templates/") or ".." in member:
            raise SystemExit(f"templates/ 아래 멤버만 허용합니다: {member}")
        data = archive.read(member)  # zipfile 이 CRC32 를 검증한다
        target = os.path.join(out_dir, os.path.basename(member))
        with open(target, "wb") as handle:
            handle.write(data)
        print(f"{member}\t{len(data)} B\tsha256={hashlib.sha256(data).hexdigest()}")
    print(f"range calls={remote.calls} fetchedBytes={remote.fetched} archiveSize={remote.size}")


if __name__ == "__main__":
    main()
