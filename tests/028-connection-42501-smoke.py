"""Regressão 42501: login anônimo não consulta tabela protegida; diagnóstico continua disponível via API interna."""
from pathlib import Path
from urllib.parse import urlparse
import re
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf-8')
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
html=re.sub(r'<link rel="stylesheet"[^>]*>', '<style>'+(root/'assets/css/style.css').read_text(encoding='utf-8')+'</style>', html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
    html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^\"]*"></script>',
        lambda _: '<script>'+(root/'assets/js'/f'{name}.js').read_text(encoding='utf-8').replace('</script>','<\\/script>')+'</script>',html)
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for scenario in ('anonymous','authenticated','forbidden_authenticated'):
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[];observed=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        def handler(route):
            request=route.request
            path=urlparse(request.url).path
            observed.append({'path':path,'auth':request.headers.get('authorization'),
                             'key_ok':request.headers.get('apikey','').startswith('sb_publishable_')})
            if path=='/auth/v1/health':
                route.fulfill(status=200,content_type='application/json',body='{"status":"ok"}')
            elif path=='/rest/v1/equipments':
                if scenario=='forbidden_authenticated':
                    route.fulfill(status=403,content_type='application/json',body='{"code":"42501","message":"permission denied for table equipments"}')
                else:route.fulfill(status=200,content_type='application/json',body='[]')
            else: route.fulfill(status=404,content_type='application/json',body='{}')
        page.route('**/*.supabase.co/**',handler)
        page.set_content(html,wait_until='domcontentloaded')
        page.locator('#login-form').wait_for(timeout=7000)
        if scenario in ('authenticated','forbidden_authenticated'):
            page.evaluate('''() => { window.EquipaSupabase.supabase.auth.getSession = async()=>({
                data:{session:{access_token:'fake-browser-test-token'}},error:null
              });}''')
        info=page.evaluate('async()=>await window.EquipaSupabase.supabase.diagnoseConnection()')
        expected={'anonymous':'login_required','authenticated':'connected','forbidden_authenticated':'restricted'}[scenario]
        assert info['status']==expected,info
        equipment_requests=[x for x in observed if x['path']=='/rest/v1/equipments']
        if scenario=='anonymous':
            assert not equipment_requests,'O visitante não pode consultar a tabela protegida'
        else:
            assert equipment_requests and equipment_requests[-1]['auth']=='Bearer fake-browser-test-token'
        assert not errors,errors
        print(f'PASS {scenario}: estado interno={expected}; testes no inventário={len(equipment_requests)}; erros JS=0')
        page.close()
    browser.close()
