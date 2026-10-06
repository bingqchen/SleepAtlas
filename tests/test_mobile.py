"""Pairing boundaries for a browser that is not the local Mac admin UI."""
import http.client
import json
import stat
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
import server
import storage

class RemoteClientHandler(server.Handler):
    def local_admin(self):return False
    def log_message(self,*args):pass

class PhonePairingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.previous_token=server.TOKEN
        server.TOKEN='0123456789abcdef'
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),RemoteClientHandler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join();server.TOKEN=cls.previous_token
    def request(self,path,body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.http.server_port,timeout=3)
        conn.request('POST' if body is not None else 'GET',path,json.dumps(body) if body is not None else None,{'Content-Type':'application/json',**(headers or {})})
        response=conn.getresponse();result=(response.status,dict(response.getheaders()),json.loads(response.read()));conn.close();return result
    def test_unpaired_device_cannot_read_collection_or_pairing_code(self):
        self.assertEqual(self.request('/api/pokemon')[0],401)
        self.assertEqual(self.request('/api/installation')[0],401)
    def test_invalid_code_does_not_set_cookie(self):
        status,headers,_=self.request('/api/session',{'code':'wrong'})
        self.assertEqual(status,401);self.assertNotIn('Set-Cookie',headers)
    def test_pairing_cookie_survives_requests_and_protects_secret(self):
        status,headers,_=self.request('/api/session',{'code':server.TOKEN})
        self.assertEqual(status,200)
        cookie=headers['Set-Cookie']
        self.assertIn('HttpOnly',cookie);self.assertIn('SameSite=Strict',cookie);self.assertIn('Max-Age=',cookie)
        self.assertNotIn(server.TOKEN,cookie)
        status,_,info=self.request('/api/installation',headers={'Cookie':cookie.split(';')[0]})
        self.assertEqual(status,200);self.assertEqual(info,{'phoneEnabled':True})
    def test_cross_origin_pairing_blocked(self):
        self.assertEqual(self.request('/api/session',{'code':server.TOKEN},{'Origin':'https://untrusted.example'})[0],403)
    def test_random_cookie_does_not_grant_access(self):
        self.assertEqual(self.request('/api/catalog',headers={'Cookie':'atlas_session=made-up'})[0],401)
    def test_pairing_code_is_stable_and_private_on_disk(self):
        previous=storage.DATA
        try:
            with tempfile.TemporaryDirectory() as directory:
                storage.DATA=Path(directory)
                first=server.mobile_access_code()
                self.assertEqual(first,server.mobile_access_code());self.assertEqual(len(first),16)
                self.assertEqual(stat.S_IMODE((storage.DATA/'mobile-access-code').stat().st_mode),0o600)
        finally:storage.DATA=previous

if __name__=='__main__':unittest.main()
