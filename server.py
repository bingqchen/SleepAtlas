#!/usr/bin/env python3
"""Run with python3 server.py. Standard library only; OCR uses macOS Vision."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
from http.cookies import SimpleCookie
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
import storage
from analysis_engine import CATALOG, DEFAULT_SETTINGS, analyze, parse_ocr

ROOT=Path(__file__).resolve().parent
RUNTIME=ROOT/'.runtime'
OCR_LOCK=threading.Lock()
OCR_BINARY=RUNTIME/'sleep-atlas-ocr'
TOKEN=None
MAX_BODY=140*1024*1024

def mobile_access_code():
    """Keep pairing valid across restarts without putting secrets in the source tree."""
    path=storage.DATA/'mobile-access-code'
    storage.DATA.mkdir(parents=True,exist_ok=True)
    try:
        with open(path,'x',opener=lambda p,flags:os.open(p,flags,0o600)) as file:
            file.write(secrets.token_hex(8))
    except FileExistsError:
        pass
    os.chmod(path,0o600)
    value=path.read_text().strip()
    if not re.fullmatch(r'[a-f0-9]{16}',value):
        raise ValueError('Invalid mobile-access-code file. Restore it or remove it to pair devices again.')
    return value

def session_value():
    return hmac.new(TOKEN.encode(),b'sleep-atlas-phone-session-v1',hashlib.sha256).hexdigest() if TOKEN else ''

def phone_urls(port):
    urls=[]
    if sys.platform=='darwin':
        for command,kind in [(['/usr/sbin/scutil','--get','LocalHostName'],'name'),(['/usr/sbin/ipconfig','getifaddr','en0'],'ip')]:
            try:
                result=subprocess.run(command,capture_output=True,text=True,timeout=3)
                value=result.stdout.strip()
                if result.returncode==0 and value and re.fullmatch(r'[A-Za-z0-9.-]+',value):
                    if kind=='name':value+='.local'
                    urls.append(f'http://{value}:{port}/')
            except (OSError,subprocess.TimeoutExpired):
                pass
    return urls

def prepare_ocr():
    if sys.platform!='darwin':return False
    RUNTIME.mkdir(exist_ok=True)
    source=ROOT/'scripts/ocr.swift'
    if OCR_BINARY.exists() and OCR_BINARY.stat().st_mtime>=source.stat().st_mtime:return True
    compiler=shutil.which('swiftc')
    if not compiler:return False
    result=subprocess.run([compiler,str(source),'-o',str(OCR_BINARY),'-module-cache-path',str(RUNTIME/'swift-cache')],capture_output=True,text=True,timeout=120)
    if result.returncode:print('Screenshot recognition unavailable: '+result.stderr[-1200:],file=sys.stderr)
    return result.returncode==0

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'web'),**kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        self.send_header('Cache-Control','no-store' if self.path.startswith('/api/') else 'no-cache')
        super().end_headers()

    def send_json(self,data,status=200):
        payload=json.dumps(data,allow_nan=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)

    def local_admin(self):
        return self.client_address[0] in ('127.0.0.1','::1') and self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}')

    def same_origin(self):
        origin=self.headers.get('Origin')
        if origin and origin not in [f'http://{self.headers.get("Host","")}',f'https://{self.headers.get("Host","")}']:
            self.send_json({'error':'Cross-origin request rejected.'},403);return False
        return True

    def authorized(self):
        host=self.headers.get('Host','')
        if self.server.server_address[0]=='127.0.0.1' and host not in [f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}']:
            self.send_json({'error':'Invalid host.'},403);return False
        cookie=SimpleCookie()
        try:cookie.load(self.headers.get('Cookie',''))
        except Exception:pass
        paired=cookie.get('atlas_session')
        if TOKEN and not self.local_admin() and not (
            secrets.compare_digest(self.headers.get('Authorization',''),'Bearer '+TOKEN) or
            (paired and secrets.compare_digest(paired.value,session_value()))
        ):
            self.send_json({'error':'Enter the access code from Add to Home Screen on your Mac.'},401);return False
        if self.command in ('POST','PUT','DELETE') and not self.same_origin():return False
        return True

    def body(self):
        size=int(self.headers.get('Content-Length','0'))
        if size<=0 or size>MAX_BODY:raise ValueError('Request is empty or exceeds 140 MB.')
        if 'application/json' not in self.headers.get('Content-Type',''):raise ValueError('Expected JSON.')
        return json.loads(self.rfile.read(size))

    def do_GET(self):
        path=urlparse(self.path).path
        if not path.startswith('/api/'):return super().do_GET()
        if not self.authorized():return
        try:
            if path=='/api/installation':
                if not self.local_admin():return self.send_json({'phoneEnabled':bool(TOKEN)})
                return self.send_json({'phoneEnabled':bool(TOKEN),'urls':phone_urls(self.server.server_port),'accessCode':TOKEN})
            if path=='/api/catalog':return self.send_json({**CATALOG,'defaults':DEFAULT_SETTINGS,'ocrAvailable':OCR_BINARY.exists()})
            if path=='/api/pokemon':return self.send_json(storage.list_pokemon())
            if path=='/api/backup':
                data=json.dumps(storage.backup()).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Disposition','attachment; filename="sleep-atlas-backup.json"');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
            if path.startswith('/api/pokemon/'):
                item=storage.get_pokemon(path.split('/')[-1]);return self.send_json(item if item else {'error':'Pokémon not found.'},200 if item else 404)
            if path.startswith('/api/screenshots/'):
                with storage.connect() as db:pic=db.execute('SELECT mime,image FROM screenshots WHERE id=?',(path.split('/')[-1],)).fetchone()
                if not pic:return self.send_json({'error':'Screenshot not found.'},404)
                self.send_response(200);self.send_header('Content-Type',pic['mime']);self.send_header('Content-Length',str(len(pic['image'])));self.end_headers();self.wfile.write(pic['image']);return
            self.send_json({'error':'Not found.'},404)
        except Exception as e:
            print(type(e).__name__,str(e),file=sys.stderr);self.send_json({'error':'Could not read the local database.'},500)

    def do_POST(self):
        if urlparse(self.path).path=='/api/session':
            if not self.same_origin():return
            try:
                body=self.body()
                code=body.get('code','') if isinstance(body,dict) else ''
                if not isinstance(code,str) or not TOKEN or not secrets.compare_digest(code.strip().lower(),TOKEN):
                    return self.send_json({'error':'That access code does not match. Check the code on your Mac.'},401)
                self.send_response(200)
                self.send_header('Set-Cookie',f'atlas_session={session_value()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7776000')
                payload=b'{"paired":true}'
                self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
            except (ValueError,TypeError):self.send_json({'error':'Enter a valid access code.'},400)
            return
        if not self.authorized():return
        try:
            path=urlparse(self.path).path;body=self.body()
            if not isinstance(body,dict):raise ValueError('Expected an object.')
            if path=='/api/analyze':return self.send_json(analyze(body.get('build',body)))
            if path=='/api/pokemon':
                if body.get('reviewed') is not True:raise ValueError('Confirm that you reviewed the details before saving.')
                pid=storage.save(body.get('build'),body.get('imageIds'),body.get('id'));return self.send_json(storage.get_pokemon(pid),201)
            if path=='/api/restore':return self.send_json(storage.restore(body))
            if path=='/api/ocr':return self.recognize(body)
            self.send_json({'error':'Not found.'},404)
        except (ValueError,TypeError,KeyError) as e:self.send_json({'error':str(e)},400)
        except subprocess.TimeoutExpired:self.send_json({'error':'Screenshot recognition timed out. Try a smaller image.'},422)
        except Exception as e:
            print(type(e).__name__,str(e),file=sys.stderr);self.send_json({'error':'The operation failed. Your existing collection is unchanged.'},500)

    def do_DELETE(self):
        if not self.authorized():return
        path=urlparse(self.path).path
        if not path.startswith('/api/pokemon/'):return self.send_json({'error':'Not found.'},404)
        with storage.connect() as db:cursor=db.execute('DELETE FROM pokemon WHERE id=?',(path.split('/')[-1],))
        self.send_json({'deleted':bool(cursor.rowcount)})

    def recognize(self,body):
        images=body.get('images')
        if not isinstance(images,list) or not 1<=len(images)<=8:raise ValueError('Choose 1–8 screenshots for one Pokémon.')
        if not OCR_BINARY.exists():return self.send_json({'error':'Screenshot recognition requires macOS and Swift Command Line Tools. Manual entry is available.'},503)
        results=[];pending=[]
        with OCR_LOCK:
            for img in images:
                if not isinstance(img,dict):raise ValueError('Invalid image.')
                data=base64.b64decode(img.get('data',''),validate=True)
                if not data or len(data)>12*1024*1024:raise ValueError('Each screenshot must be under 12 MB.')
                mime=img.get('mime','')
                if mime not in ['image/png','image/jpeg','image/webp','image/heic','image/heif']:raise ValueError('Choose PNG, JPG, HEIC or WebP screenshots.')
                with tempfile.NamedTemporaryFile(suffix='.image') as file:
                    file.write(data);file.flush()
                    result=subprocess.run([str(OCR_BINARY),file.name],capture_output=True,text=True,timeout=45)
                if result.returncode:raise ValueError('Could not read this image. Try a PNG or JPG screenshot. '+result.stderr.strip()[:200])
                parsed=json.loads(result.stdout);results.append(parsed)
                iid=str(uuid.uuid4());pending.append((iid,None,str(img.get('name','screenshot'))[:200],mime,data,json.dumps(parsed),storage.now()))
            with storage.connect() as db:db.executemany('INSERT INTO screenshots VALUES(?,?,?,?,?,?,?)',pending)
        return self.send_json({**parse_ocr(results),'imageIds':[p[0] for p in pending]})

def main():
    global TOKEN
    parser=argparse.ArgumentParser(description='Sleep Atlas local Pokémon Sleep analyzer')
    parser.add_argument('--host',default='127.0.0.1',help='Use 0.0.0.0 to allow a phone on your trusted local network.')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--phone',action='store_true',help='Enable authenticated local Wi-Fi access for the home-screen app.')
    args=parser.parse_args()
    if args.phone:args.host='0.0.0.0'
    storage.initialize()
    if args.host not in ('127.0.0.1','localhost'):
        TOKEN=mobile_access_code()
        print('Phone access enabled. Open Add to Home Screen on this Mac to view the address and pairing code.',flush=True)
    try:ready=prepare_ocr()
    except Exception as e:print('OCR setup:',e);ready=False
    print(f'OCR: {"ready (on-device)" if ready else "unavailable; manual entry works"}',flush=True)
    print(f'Sleep Atlas: http://127.0.0.1:{args.port}',flush=True)
    if TOKEN:
        for url in phone_urls(args.port):print(f'Phone address: {url}',flush=True)
    print(f'Database: {storage.DB}',flush=True)
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()

if __name__=='__main__':main()
