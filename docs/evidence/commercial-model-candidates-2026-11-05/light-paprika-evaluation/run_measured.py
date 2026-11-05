import sys,subprocess,time,resource,json,pathlib
label=sys.argv[1];start=time.perf_counter();result=subprocess.run(sys.argv[2:]);used=resource.getrusage(resource.RUSAGE_CHILDREN)
record={'command':sys.argv[2:],'exit_code':result.returncode,'wall_seconds':time.perf_counter()-start,'max_rss_kib':used.ru_maxrss,'user_seconds':used.ru_utime,'system_seconds':used.ru_stime}
pathlib.Path('/tmp/toonstudio-light-paprika-evaluation/'+label+'-measurement.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True);sys.exit(result.returncode)
