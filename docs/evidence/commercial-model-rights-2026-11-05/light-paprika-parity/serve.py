import http.server,pathlib,urllib.parse,hashlib,json
root=pathlib.Path('/tmp/toonstudio-light-paprika-parity-followup');old=pathlib.Path('/tmp/toonstudio-light-paprika-evaluation');ort=pathlib.Path('/workspace/toonstudio/node_modules/.pnpm/onnxruntime-web@1.30.0/node_modules/onnxruntime-web/dist')
names=['usgs-mountain-lake-original.jpg','synthetic-city.png']
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  path=urllib.parse.urlparse(self.path).path;target=None;mime='application/octet-stream'
  if path=='/test.html':target=root/'test.html';mime='text/html'
  elif path=='/model.onnx':target=old/'light-paprika-512-evaluation.onnx'
  elif path.startswith('/ort/'):
   name=path.removeprefix('/ort/')
   if '/' not in name and '..' not in name:
    target=ort/name;mime='text/javascript' if name.endswith('.mjs') else 'application/wasm'
  else:
   for name in names:
    if path=='/inputs/'+name+'.f32':target=old/'inputs'/(name+'.f32')
    elif path=='/cpu120/'+name+'.f32':target=old/(name+'.cpu-output.f32')
    elif path=='/cpu130/'+name+'.f32':target=root/(name+'.cpu130-output.f32')
  if target is None or not target.is_file():self.send_error(404);return
  data=target.read_bytes();self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  allowed={('/output/'+n+'.browser130-output.f32'):root/(n+'.browser130-output.f32') for n in names}
  target=allowed.get(self.path);length=int(self.headers.get('Content-Length','0'))
  if target is None or length!=3*512*512*4:self.send_error(400);return
  target.write_bytes(self.rfile.read(length));self.send_response(204);self.end_headers()
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');self.send_header('Cache-Control','no-store');super().end_headers()
 def log_message(self,*args):pass
http.server.ThreadingHTTPServer(('127.0.0.1',8923),Handler).serve_forever()
