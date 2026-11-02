#!/usr/bin/env python3
"""API 빌드에 필요한 Git blob을 계획하고 명시 요청으로만 새 경로에 내보낸다."""
import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import time
from pathlib import Path, PurePosixPath

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATHS = (
    '.github/workflows/api-container-release.yml',
    'package.json',
    'apps/api/package.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'apps/api/tsconfig.json',
    'apps/api/tsconfig.build.json',
    'scripts/verify-production-release-compatibility.mjs',
    'scripts/verify-api-runtime-imports.test.mjs',
    'scripts/verify-api-calendar-runtime.test.mjs',
    'scripts/stage-api-workspace-runtime.test.mjs',
    'scripts/stage-api-workspace-runtime.mjs',
    'scripts/verify-api-runtime-imports.mjs',
    'scripts/verify-legal-policy-runtime.mjs',
    'scripts/prepare-git-hooks.mjs',
    'config/production-migration-baseline.json',
    'deploy/cloudflare-static/wrangler.jsonc',
    'deploy/trust/supabase-prod-ca-2021.crt',
)
HEX40 = re.compile(r'^[a-f0-9]{40}$')
HEX64 = re.compile(r'^[a-f0-9]{64}$')
BLOCKED_COMPONENTS = {'.git','node_modules','dist','.release','.qa','.docker','.ssh','.aws','.config','.cache','.idea','.vscode','.cursor','.claude','.codex','.zed','.fleet','coverage'}
BLOCKED_NAMES = {'.npmrc','.netrc','.gitconfig','.pypirc','.DS_Store'}
API_WEB_PUBLIC_PREFIX = 'apps/web/public/'
API_PREFIX_REASON = 'api-build-web-public-assets-excluded'

class Refused(Exception):
    pass

def check(condition, code):
    if not condition:
        raise Refused(code)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def canonical(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',',':')).encode()

def no_symlink_chain(path):
    path = Path(path)
    check(path.is_absolute(), 'ABSOLUTE_PATH_REQUIRED')
    for part in [path, *path.parents]:
        if part.exists() or part.is_symlink():
            check(not part.is_symlink(), 'SYMLINK_PATH_REFUSED')

def child_env():
    env = {k:v for k,v in os.environ.items() if k in {'PATH','HOME','TMPDIR','LANG','LC_ALL'}}
    env.update({'GIT_OPTIONAL_LOCKS':'0','GIT_NO_LAZY_FETCH':'1','GIT_TERMINAL_PROMPT':'0','GIT_CONFIG_NOSYSTEM':'1'})
    return env

def git(repo, *args, timeout=30):
    command = ['/usr/bin/git','--no-optional-locks','--no-pager','-c','core.fsmonitor=false','-c','core.untrackedCache=false','-C',str(repo),*args]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=child_env(), timeout=timeout)
    check(result.returncode == 0, 'READ_ONLY_GIT_COMMAND_FAILED')
    return result.stdout

def source_gate(repo, expected):
    check(git(repo,'rev-parse','--show-toplevel').decode().strip() == str(repo), 'CANONICAL_REPO_REQUIRED')
    check(git(repo,'rev-parse','--show-object-format').decode().strip() == 'sha1', 'UNSUPPORTED_GIT_OBJECT_FORMAT')
    check(git(repo,'rev-parse','HEAD').decode().strip() == expected, 'HEAD_MISMATCH')
    check(git(repo,'status','--porcelain=v1','--untracked-files=all') == b'', 'SOURCE_NOT_CLEAN')
    return {'sha':expected,'tree':git(repo,'rev-parse',expected+'^{tree}').decode().strip()}

def reason(path):
    parts = PurePosixPath(path).parts
    git_public_asset = path.startswith('public/') or path.startswith('apps/web/public/')
    if any(x in BLOCKED_COMPONENTS and not (git_public_asset and x in {'node_modules','dist'}) for x in parts):
        return 'host-generated-or-personal-directory'
    if any(x in BLOCKED_NAMES for x in parts):
        return 'personal-credential-or-tool-config'
    if any(x == '.env' or x.startswith('.env.') for x in parts):
        return 'environment-file-even-if-template'
    return None

def is_api_web_public(path):
    # 처음부터 고정한 디렉터리 경계만 제외한다. public과 비슷한 이름이나 다른 앱은 유지한다.
    return isinstance(path, str) and path.startswith(API_WEB_PUBLIC_PREFIX)

def api_selection_summary(selected, excluded):
    check(selected, 'EMPTY_API_BUILD_CONTEXT')
    selected_paths = [row['path'] for row in selected]
    check(len(selected_paths) == len(set(selected_paths)), 'DUPLICATE_SELECTED_GIT_PATH')
    check(not any(is_api_web_public(path) for path in selected_paths), 'WEB_PUBLIC_ASSET_IN_API_SELECTION')
    check(set(CONTRACT_PATHS).issubset(set(selected_paths)), 'REQUIRED_BUILD_CONTRACT_EXCLUDED')
    prefix_rows = [row for row in excluded if row.get('reason') == API_PREFIX_REASON]
    check(all(is_api_web_public(row['path']) for row in prefix_rows), 'UNREVIEWED_API_CONTEXT_EXCLUSION')
    # 원 일반 export가 거부하던 다른 public 자산 제외는 이번 승인에 포함하지 않는다.
    check(all('public' not in PurePosixPath(row['path']).parts or is_api_web_public(row['path']) for row in excluded), 'ADDITIONAL_PUBLIC_ASSET_EXCLUSION_REQUIRES_REVIEW')
    return {
        'kind': 'api-build-context',
        'excludedDirectoryPrefix': API_WEB_PUBLIC_PREFIX,
        'prefixMatchMode': 'anchored-directory-prefix-with-trailing-slash',
        'excludedPrefixFiles': len(prefix_rows),
        'excludedPrefixLogicalBytes': sum(row['bytes'] for row in prefix_rows),
        'selectedFiles': len(selected),
        'selectedLogicalBytes': sum(row['bytes'] for row in selected),
        'fullGitEligibleSourceFilesBeforeApiPrefixFilter': len(selected) + len(prefix_rows),
        'fullGitEligibleSourceBytesBeforeApiPrefixFilter': sum(row['bytes'] for row in selected) + sum(row['bytes'] for row in prefix_rows),
        'fullGitTreeEntryCount': len(selected) + len(excluded),
        'allOtherPreviouslyEligibleGitBlobsPreserved': True,
        'manifestMustExactlyMatchSelectedGitBlobs': True,
        'globalProductSourceDeletionClaimed': False,
        'originalWebAssetDeletionPerformed': False,
        'fullGitSourceAndExistingExportsPreservedElsewhere': True,
    }

def validate_export_manifest(manifest, selected):
    check(len(manifest) == len(selected), 'API_MANIFEST_SELECTION_COUNT_MISMATCH')
    check(len({row.get('path') for row in manifest}) == len(manifest), 'API_MANIFEST_DUPLICATE_PATH')
    for actual, expected in zip(manifest, selected):
        check(set(actual) == set(expected) | {'sha256'}, 'API_MANIFEST_FIELD_MISMATCH')
        check(all(actual.get(key) == value for key, value in expected.items()), 'API_MANIFEST_GIT_SELECTION_MISMATCH')
        check(HEX64.fullmatch(actual.get('sha256') or '') is not None, 'API_MANIFEST_FILE_SHA_REQUIRED')
        check(not is_api_web_public(actual['path']), 'API_MANIFEST_WEB_PUBLIC_ASSET_REJECTED')

def tree_entries(repo, expected):
    selected, excluded = [], []
    for row in git(repo,'ls-tree','-r','-l','-z','--full-tree',expected).split(b'\0'):
        if not row:
            continue
        header, rawpath = row.split(b'\t',1)
        mode, kind, oid, size = header.decode('ascii').split()
        path = rawpath.decode('utf8')
        components = PurePosixPath(path).parts
        check(path and not path.startswith('/') and not any(x in {'.','..'} for x in components), 'UNSAFE_GIT_PATH')
        check(not any(ord(x)<32 or ord(x)==127 for x in path) and '\\' not in path, 'UNSUPPORTED_GIT_PATH_CHARACTERS')
        check(kind == 'blob' and mode in {'100644','100755','120000'}, 'SUBMODULE_OR_UNSUPPORTED_TREE_ENTRY')
        check(HEX40.fullmatch(oid) and size.isdigit(), 'TREE_METADATA_INVALID')
        value={'path':path,'mode':mode,'oid':oid,'bytes':int(size)}
        why=reason(path)
        if why is None and is_api_web_public(path):
            why=API_PREFIX_REASON
        if why:
            excluded.append({**value,'reason':why})
        else:
            selected.append(value)
    check(selected, 'EMPTY_SOURCE_TREE')
    return selected, excluded

def public_blob(repo, expected, path):
    check(path in CONTRACT_PATHS, 'UNAPPROVED_CONTRACT_READ')
    return git(repo, 'show', expected + ':' + path)

def verify_contract_manifest(contract_blobs, manifest):
    check(set(contract_blobs) == set(CONTRACT_PATHS), 'CONTRACT_MANIFEST_PATH_SET_MISMATCH')
    by_path = {row['path']: row for row in manifest}
    for name, expected in contract_blobs.items():
        check(by_path.get(name) == expected, 'CONTRACT_MANIFEST_BLOB_MISMATCH')

def write_json_exclusive(path, value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as stream:
        stream.write(json.dumps(value,ensure_ascii=False,indent=2).encode()+b'\n')

def update_own_journal(path, value):
    # 이번 실행이 x-open으로 만든 private journal만 갱신한다. 기존 export는 덮어쓰지 않는다.
    fd=os.open(path,os.O_WRONLY|os.O_TRUNC|os.O_NOFOLLOW)
    with os.fdopen(fd,'wb') as stream:
        stream.write(json.dumps(value,ensure_ascii=False,indent=2).encode()+b'\n')

def batch_process(repo):
    return subprocess.Popen(['/usr/bin/git','--no-optional-locks','--no-pager','-C',str(repo),'cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=child_env())

def read_blob(process, row, stream=None):
    process.stdin.write((row['oid']+'\n').encode());process.stdin.flush()
    header=process.stdout.readline().decode('ascii').strip().split()
    check(header==[row['oid'],'blob',str(row['bytes'])], 'MISSING_OR_CHANGED_LOCAL_BLOB')
    sha256=hashlib.sha256();gitsha=hashlib.sha1(('blob '+str(row['bytes'])+'\0').encode());remaining=row['bytes'];prefix=b'';symlink=bytearray() if row['mode']=='120000' else None
    while remaining:
        chunk=process.stdout.read(min(1024*1024,remaining));check(chunk,'TRUNCATED_BLOB')
        remaining-=len(chunk);sha256.update(chunk);gitsha.update(chunk)
        if len(prefix)<128:prefix=(prefix+chunk)[:128]
        if symlink is not None:
            check(len(symlink)+len(chunk)<=4096,'SYMLINK_TARGET_TOO_LONG');symlink.extend(chunk)
        elif stream is not None:stream.write(chunk)
    check(process.stdout.read(1)==b'\n','BATCH_PROTOCOL_TRAILER')
    check(gitsha.hexdigest()==row['oid'],'GIT_BLOB_DIGEST_MISMATCH')
    check(not prefix.startswith(b'version https://git-lfs.github.com/spec/v1'),'LFS_POINTER_REQUIRES_SEPARATE_REVIEW')
    return sha256.hexdigest(),bytes(symlink) if symlink is not None else None

def link_target(path, target):
    check(target and not target.startswith('/') and '\\' not in target and not any(ord(x)<32 for x in target),'UNSAFE_SOURCE_SYMLINK')
    stack=list(PurePosixPath(path).parent.parts)
    for component in PurePosixPath(target).parts:
        if component in {'','.'}:continue
        if component=='..':
            check(stack,'SOURCE_SYMLINK_ESCAPES');stack.pop()
        else:stack.append(component)
    return '/'.join(stack)

def export_source(repo, args, plan, selected):
    check(plan.get('sourceSelectionKind') == 'api-build-context' and plan.get('fullGitHeadTreeAuthority') == plan['source'], 'API_CONTEXT_GIT_AUTHORITY_REQUIRED')
    check(plan.get('sourceSelection') == api_selection_summary(selected, plan['excluded']), 'API_CONTEXT_SELECTION_PLAN_MISMATCH')
    journal=args.out.parent/(args.out.name+'.export-journal.json')
    check(not journal.exists() and not journal.is_symlink(),'DUPLICATE_SOURCE_EXPORT_REFUSED')
    check(not args.out.exists() and not args.out.is_symlink(),'OUTPUT_ALREADY_EXISTS')
    manifest_path=args.out.parent/(args.out.name+'.manifest.json')
    check(not manifest_path.exists() and not manifest_path.is_symlink(),'MANIFEST_ALREADY_EXISTS')
    record={'status':'exporting','sha':args.expected_sha,'tree':plan['source']['tree'],'planSha256':plan['planSha256'],'sourceBytes':plan['sourceBytes'],'startedAtUnix':time.time(),'context':str(args.out),'sourceSelectionKind':plan['sourceSelectionKind'],'sourceSelection':plan['sourceSelection'],'fullGitHeadTreeAuthority':plan['fullGitHeadTreeAuthority'],'globalProductSourceDeletionClaimed':False,'networkOrNodeExecuted':False}
    write_json_exclusive(journal,record)
    partial=args.out.parent/(args.out.name+'.partial-'+str(os.getpid()))
    process=None
    try:
        partial.mkdir(mode=0o700)
        dirs={''};paths={x['path'] for x in selected};symlinks={};manifest=[]
        for row in selected:
            dirs.update(str(x) for x in PurePosixPath(row['path']).parents if str(x)!='.')
        process=batch_process(repo)
        for row in selected:
            output=partial/row['path'];output.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            if row['mode']=='120000':
                sha256,target=read_blob(process,row);symlinks[row['path']]=target.decode('utf8');manifest.append({**row,'sha256':sha256});continue
            fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o700 if row['mode']=='100755' else 0o600)
            with os.fdopen(fd,'wb') as stream:sha256,_=read_blob(process,row,stream)
            manifest.append({**row,'sha256':sha256})
        for name,target in symlinks.items():
            current=link_target(name,target);seen={name}
            while current in symlinks:
                check(current not in seen,'CYCLIC_SOURCE_SYMLINK');seen.add(current);current=link_target(current,symlinks[current])
            check(current in paths or current in dirs,'SYMLINK_TARGET_NOT_IN_EXPORTED_TREE')
        for name,target in symlinks.items():os.symlink(target,partial/name)
        process.stdin.close();check(process.wait(timeout=10)==0,'BATCH_PROCESS_EXIT_FAILED');process=None
        validate_export_manifest(manifest, selected)
        verify_contract_manifest(plan['contractBlobs'], manifest)
        check(source_gate(repo,args.expected_sha)==plan['source'],'SOURCE_CHANGED_DURING_EXPORT')
        no_symlink_chain(args.out.parent);check(not args.out.exists(),'OUTPUT_RACE')
        os.rename(partial,args.out)
        write_json_exclusive(manifest_path,{'sha':args.expected_sha,'tree':plan['source']['tree'],'planSha256':plan['planSha256'],'context':str(args.out),'files':manifest,'excluded':plan['excluded'],'recipe':plan['recipe'],'contractBlobs':plan['contractBlobs'],'gitObjectsOnly':True,'sourceSelectionKind':plan['sourceSelectionKind'],'sourceSelection':plan['sourceSelection'],'fullGitHeadTreeAuthority':plan['fullGitHeadTreeAuthority'],'globalProductSourceDeletionClaimed':False,'originalWebAssetsPreservedElsewhere':True})
        record.update({'status':'source-exported-not-built','finishedAtUnix':time.time(),'manifest':str(manifest_path),'manifestSha256':digest(manifest_path.read_bytes()),'buildExecuted':False})
        update_own_journal(journal,record)
        print(json.dumps({'status':record['status'],'context':str(args.out),'manifest':str(manifest_path),'manifestSha256':record['manifestSha256'],'qaPass':False}))
    except BaseException:
        if process is not None:
            process.kill();process.wait()
        record.update({'status':'failed-no-retry','partialContext':str(partial),'failureCode':'SOURCE_EXPORT_FAILED','buildExecuted':False})
        update_own_journal(journal,record)
        raise

class KoreanArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        # 알 수 없는 인자에 실수로 비밀값을 넣어도 원문 값을 출력하지 않는다.
        self.exit(2, '오류: 인자 형식을 확인하세요. --help로 사용법을 볼 수 있습니다.\n')

def main():
    parser=KoreanArgumentParser(description='현재 Git HEAD에서 API 빌드용 소스를 계획하거나 새 경로에 내보냅니다.')
    parser.add_argument('--expected-sha',required=True,help='현재 HEAD와 일치해야 하는 40자리 Git SHA')
    parser.add_argument('--out',type=Path,required=True,help='아직 존재하지 않는 출력 디렉터리')
    parser.add_argument('--dockerfile',type=Path,help='선택한 Dockerfile의 내용 지문도 계획에 결속')
    parser.add_argument('--expected-dockerfile-sha256')
    parser.add_argument('--expected-ignore-sha256')
    parser.add_argument('--max-context-bytes',type=int,default=16*1024**3)
    parser.add_argument('--export-context',action='store_true',help='명시한 계획 지문으로 실제 파일 내보내기')
    parser.add_argument('--expected-plan-sha256')
    args=parser.parse_args()
    os.umask(0o077)
    check(HEX40.fullmatch(args.expected_sha),'EXACT_HEAD_SHA_REQUIRED')
    repo=REPOSITORY_ROOT
    no_symlink_chain(repo)
    args.out=args.out.expanduser().absolute()
    no_symlink_chain(args.out)
    args.out=args.out.parent.resolve(strict=True)/args.out.name
    check(args.out.name not in {'.','..'} and not args.out.exists() and not args.out.is_symlink(),'FRESH_OUTPUT_REQUIRED')
    for sibling in [args.out.parent/(args.out.name+'.manifest.json'),args.out.parent/(args.out.name+'.export-journal.json')]:
        check(not sibling.exists() and not sibling.is_symlink(),'EXISTING_EVIDENCE_PRESERVED')
    recipe=None
    if args.dockerfile is not None:
        for value in [args.expected_dockerfile_sha256,args.expected_ignore_sha256]:
            check(isinstance(value,str) and HEX64.fullmatch(value),'RECIPE_PIN_REQUIRED')
        args.dockerfile=args.dockerfile.expanduser().absolute()
        no_symlink_chain(args.dockerfile)
        check(args.dockerfile.is_file(),'DOCKERFILE_REQUIRED')
        ignore=Path(str(args.dockerfile)+'.dockerignore')
        no_symlink_chain(ignore)
        check(ignore.is_file(),'EXPLICIT_RECIPE_IGNORE_REQUIRED')
        check(digest(args.dockerfile.read_bytes())==args.expected_dockerfile_sha256,'DOCKERFILE_PIN_MISMATCH')
        check(digest(ignore.read_bytes())==args.expected_ignore_sha256,'IGNORE_PIN_MISMATCH')
        recipe={'dockerfileSha256':args.expected_dockerfile_sha256,'ignoreSha256':args.expected_ignore_sha256}
    else:
        check(args.expected_dockerfile_sha256 is None and args.expected_ignore_sha256 is None,'DOCKERFILE_REQUIRED_FOR_RECIPE_PINS')
    source=source_gate(repo,args.expected_sha);selected,excluded=tree_entries(repo,args.expected_sha)
    selection=api_selection_summary(selected,excluded)
    selected_paths={x['path'] for x in selected}
    by_path={row['path']:row for row in selected}
    contract_blobs={}
    for name in CONTRACT_PATHS:
        check(name in selected_paths,'REQUIRED_BUILD_CONTRACT_EXCLUDED')
        row=by_path[name]
        check(row['mode'] in {'100644','100755'},'BUILD_CONTRACT_MUST_BE_REGULAR_FILE')
        body=public_blob(repo,args.expected_sha,name)
        check(len(body)==row['bytes'] and hashlib.sha1(('blob '+str(len(body))+'\0').encode()+body).hexdigest()==row['oid'],'BUILD_CONTRACT_GIT_BLOB_MISMATCH')
        contract_blobs[name]={**row,'sha256':digest(body)}
    source_bytes=sum(x['bytes'] for x in selected)
    check(0<source_bytes<=args.max_context_bytes,'CONTEXT_SIZE_REVIEW_REQUIRED')
    plan={'schema':'toonstudio.api-linux-source-context.plan.v1','source':source,'sourceFiles':len(selected),'sourceBytes':source_bytes,'selected':selected,'excluded':excluded,'recipe':recipe,'contractBlobs':contract_blobs,'producerSha256':digest(Path(__file__).read_bytes()),'publicAssetsPruned':any('public' in PurePosixPath(x['path']).parts for x in excluded),'gitMetadataExported':False,'hostNodeModulesOrDistCopied':False,'sourceSecretFileNamesExcluded':True,'completeSecretScanClaimed':False,'networkOrNodeExecuted':False}
    plan.update(sourceSelectionKind='api-build-context',sourceSelection=selection,fullGitHeadTreeAuthority=dict(source),publicAssetsPrunedScope='api-build-context-export-only',fullGitSourceTreeExported=False,globalProductSourceDeletionClaimed=False,originalWebAssetsPreservedElsewhere=True)
    plan['planSha256']=digest(canonical(plan))
    if not args.export_context:
        print(json.dumps({k:v for k,v in plan.items() if k!='selected'},ensure_ascii=False,indent=2));return
    check(HEX64.fullmatch(args.expected_plan_sha256 or '') and args.expected_plan_sha256==plan['planSha256'],'REVIEWED_PLAN_PIN_REQUIRED')
    check(plan['sourceSelectionKind']=='api-build-context' and plan['sourceSelection']==api_selection_summary(selected,excluded),'API_CONTEXT_SELECTION_REQUIRED')
    export_source(repo,args,plan,selected)

if __name__=='__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(json.dumps({'status':'refused-not-built','code':'INTERRUPTED','message':'사용자 요청으로 소스 준비를 중단했습니다. 기존 기록은 보존합니다.','qaPass':False},ensure_ascii=False),file=sys.stderr)
        raise SystemExit(130)
    except (Refused,subprocess.SubprocessError,OSError,UnicodeError,ValueError) as error:
        code=str(error) if isinstance(error,Refused) else 'LOCAL_SOURCE_PREPARATION_ERROR'
        print(json.dumps({'status':'refused-not-built','errorType':type(error).__name__,'code':code,'message':'API 소스 준비를 중단했습니다. 입력과 Git 상태를 확인하세요.','qaPass':False},ensure_ascii=False),file=sys.stderr)
        raise SystemExit(1)
