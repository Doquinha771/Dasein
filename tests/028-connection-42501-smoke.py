"""Browser regression tests for anonymous 42501 false alarm and signed-in permission errors."""
from pathlib import Path
from urllib.parse import urlparse
import re
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf-8')
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
html=re.sub(r'<link rel="stylesheet"[^>]*>', '<style>'+(root/'assets/css/style.css').read_text(encoding='utf-8')+'</style>', html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
    html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^"]*"></script>',
        lambda _: '<script>'+(root/'assets/js'/f'{name}.js').read_text(encoding='utf-8').replace('</script>','<\\/script>')+'</script>',html)

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for scenario in ('anonymous','authenticated','forbidden_authenticated','offline'):
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[];observed=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        def handler(route):
            request=route.request
            parsed=urlparse(request.url)
            observed.append({'path':parsed.path,'auth':request.headers.get('authorization'),
                             'key_ok':request.headers.get('apikey','').startswith('sb_publishable_'),
                             'host_ok':parsed.hostname=='oxcfbsrukzfnzkivatsn.supabase.co'})
            if scenario=='offline':route.abort('failed');return
            if parsed.path=='/auth/v1/health':
                route.fulfill(status=200,content_type='application/json',body='{"status":"ok"}');return
            if parsed.path=='/rest/v1/equipments':
                if scenario=='forbidden_authenticated':
                    route.fulfill(status=403,content_type='application/json',body='{"code":"42501","message":"permission denied for table equipments"}')
                else:route.fulfill(status=200,content_type='application/json',body='[]')
                return
            route.fulfill(status=404,content_type='application/json',body='{"message":"Mock route not implemented"}')
        page.route('**/*.supabase.co/**',handler)
        page.set_content(html,wait_until='domcontentloaded')
        page.locator('#login-form').wait_for(timeout=7000)
        if scenario in ('authenticated','forbidden_authenticated'):
            page.evaluate('''() => { window.EquipaSupabase.supabase.auth.getSession = async()=>({
                data:{session:{access_token:'fake-browser-test-token'}},error:null
              });}''')
            page.locator('#supabase-recheck').click()
        expected={'anonymous':'login_required','authenticated':'connected',
                  'forbidden_authenticated':'restricted','offline':'offline'}[scenario]
        page.wait_for_function('status=>document.querySelector("#supabase-connection")?.dataset.state===status',arg=expected,timeout=15000)
        message=page.locator('#supabase-connection').inner_text()
        equipment_requests=[x for x in observed if x['path']=='/rest/v1/equipments']
        if scenario=='anonymous':
            assert not equipment_requests,'Anonymous diagnostic must not query protected equipments table'
            assert 'Entre com sua conta' in message and '42501' not in message,message
        if scenario=='authenticated':
            assert equipment_requests and equipment_requests[-1]['auth']=='Bearer fake-browser-test-token'
        if scenario=='forbidden_authenticated':
            assert equipment_requests and '42501' in message,message
        if scenario!='offline':
            assert all(x['key_ok'] and x['host_ok'] for x in observed),observed
        assert not errors,errors
        print(f'PASS {scenario}: state={expected}; inventory_checks={len(equipment_requests)}; JS errors=0')
        page.close()
    browser.close()
