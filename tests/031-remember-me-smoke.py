"""Verifica o armazenamento de sessão, sem usar contas reais."""
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
import re,base64,json
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf-8')
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>', '<style>'+(root/'assets/css/style.css').read_text()+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
    html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^\"]*"></script>',
        lambda _: '<script>'+(root/'assets/js'/f'{name}.js').read_text().replace('</script>','<\\/script>')+'</script>',html)
fake_storage="""<script>
class FakeStorage {constructor(){this.data={}} getItem(k){return this.data[k]??null}setItem(k,v){this.data[k]=String(v)}removeItem(k){delete this.data[k]}key(n){return Object.keys(this.data)[n]??null}get length(){return Object.keys(this.data).length}}
Object.defineProperty(window,'localStorage',{configurable:true,value:new FakeStorage()});
Object.defineProperty(window,'sessionStorage',{configurable:true,value:new FakeStorage()});
</script>"""
html=html.replace('</head>',fake_storage+'</head>')
def b64(x):return base64.urlsafe_b64encode(json.dumps(x).encode()).rstrip(b'=').decode()
token='.'.join([b64({'alg':'HS256'}),b64({'sub':'00000000-0000-4000-8000-000000000001','email':'test@example.invalid','role':'authenticated'}),'simulated'])
payload=json.dumps({'access_token':token,'refresh_token':'simulated-refresh','expires_in':3600,'token_type':'bearer','user':{'id':'00000000-0000-4000-8000-000000000001','email':'test@example.invalid'}})
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for remember in (False,True):
        page=browser.new_page()
        def handler(route):
            path=urlparse(route.request.url).path
            if path=='/auth/v1/health': route.fulfill(status=200,content_type='application/json',body='{"status":"ok"}')
            elif path=='/auth/v1/token': route.fulfill(status=200,content_type='application/json',body=payload)
            else:route.fulfill(status=403,content_type='application/json',body='{"code":"42501","message":"permission denied"}')
        page.route('**/*.supabase.co/**',handler)
        page.set_content(html,wait_until='domcontentloaded')
        page.locator('#login-form').wait_for(timeout=7000)
        result=page.evaluate('''async ({remember}) => {
          const result=await window.EquipaSupabase.supabase.auth.signInWithPassword({email:'test@example.invalid',password:'fake-password',remember});
          return {err:result.error?.message||null, local:localStorage.length, session:sessionStorage.length};
        }''',{'remember':remember})
        assert result['err'] is None,result
        assert (result['local'],result['session'])==((1,0) if remember else (0,1)),result
        print('PASS lembrar de mim =',remember,': sessão gravada no armazenamento correto')
        page.close()
    browser.close()
