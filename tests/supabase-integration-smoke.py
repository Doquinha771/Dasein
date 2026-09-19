"""Teste do caminho real do cliente HTTP no navegador com API simulada.
Nao conecta, nao modifica e nao armazena dados do Supabase de producao.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
import re

root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>', '<style>'+(root/'assets/css/style.css').read_text()+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
    html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^"]*"></script>',
                lambda _: '<script>'+(root/'assets/js'/f'{name}.js').read_text().replace('</script>','<\\/script>')+'</script>',html)

project='oxcfbsrukzfnzkivatsn'
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for scenario in ('healthy','missing_table','network_offline'):
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[]; observed=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        def handler(route):
            request=route.request
            observed.append({'url':request.url,'key_ok':request.headers.get('apikey','').startswith('sb_publishable_')})
            parsed=urlparse(request.url)
            if scenario=='network_offline': route.abort('failed'); return
            if parsed.path == '/auth/v1/health':
                route.fulfill(status=200,content_type='application/json',body='{"status":"ok"}');return
            if parsed.path == '/rest/v1/equipments':
                if scenario=='missing_table':
                    route.fulfill(status=404,content_type='application/json',body='{"code":"PGRST205","message":"Table missing"}')
                else: route.fulfill(status=200,content_type='application/json',body='[]')
                return
            if parsed.path == '/rest/v1/rpc/equipa_access_allowed':
                route.fulfill(status=200,content_type='application/json',body='true');return
            if parsed.path == '/auth/v1/token':
                route.fulfill(status=400,content_type='application/json',body='{"message":"Mock: login bloqueado no teste"}');return
            route.fulfill(status=404,content_type='application/json',body='{"message":"Rota de teste nao implementada"}')
        page.route('**/*.supabase.co/**',handler)
        page.set_content(html,wait_until='domcontentloaded')
        page.locator('#login-form').wait_for(timeout=7000)
        page.locator('#supabase-connection').wait_for(state='visible',timeout=7000)
        expected={'healthy':'connected','missing_table':'schema','network_offline':'offline'}[scenario]
        page.wait_for_function('expected => document.querySelector("#supabase-connection")?.dataset.state === expected',arg=expected,timeout=15000)
        assert page.locator('#supabase-recheck').is_visible()
        if scenario=='healthy':
            reply=page.evaluate('''async () => {
              const client=window.EquipaSupabase.supabase;
              const access=await client.rpc('equipa_access_allowed');
              const login=await client.auth.signInWithPassword({email:'teste@exemplo.com',password:'senha-teste'});
              return {access:access.data,accessError:access.error?.message,loginError:login.error?.message};
            }''')
            assert reply['access'] is True and not reply['accessError'],reply
            assert 'Mock:' in reply['loginError'],reply
        for req in observed:
            assert urlparse(req['url']).hostname==f'{project}.supabase.co','Request to wrong project'
            assert req['key_ok'],'Missing public API key'
        assert not errors,errors
        print(f'PASS {scenario}: UI state={expected}; requests={len(observed)}; correct project, publishable key, no JS errors')
        page.close()
    browser.close()
