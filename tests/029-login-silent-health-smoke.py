"""Tela de login: saúde silenciosa, erro somente com API indisponível, sem 42501."""
from pathlib import Path
from urllib.parse import urlparse
import re
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text(encoding='utf-8')
html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
html = re.sub(r'<link rel="stylesheet"[^>]*>', '<style>'+(root/'assets/css/style.css').read_text(encoding='utf-8')+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
    html = re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^"]*"></script>',
        lambda _: '<script>'+(root/'assets/js'/f'{name}.js').read_text(encoding='utf-8').replace('</script>','<\\/script>')+'</script>',html)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for width in (390,1280):
        for initial_online in (True, False):
            page = browser.new_page(viewport={'width':width,'height':844})
            js_errors=[];health_requests=[];unexpected=[];online=[initial_online]
            page.on('pageerror', lambda error: js_errors.append(str(error)))
            def handler(route):
                path=urlparse(route.request.url).path
                if path=='/auth/v1/health':
                    health_requests.append(path)
                    if online[0]: route.fulfill(status=200,content_type='application/json',body='{"status":"ok"}')
                    else: route.abort('failed')
                else:
                    unexpected.append(path)
                    route.fulfill(status=403,content_type='application/json',body='{"code":"42501","message":"permission denied"}')
            page.route('**/*.supabase.co/**',handler)
            page.set_content(html,wait_until='domcontentloaded')
            if initial_online:
                page.locator('#login-form').wait_for(timeout=7000)
                page.wait_for_function('()=>document.querySelector("#auth-card") !== null && document.querySelector(".boot-error") === null')
                page.wait_for_timeout(500)
                assert page.locator('#login-email').is_visible()
                assert page.locator('#login-password').is_visible()
                assert not page.locator('#supabase-recheck, #supabase-connection, #startup-test-connection').count()
                assert not page.get_by_text('Supabase disponível. Entre com sua conta para acessar os equipamentos.').count()
                assert not page.get_by_text('Testar conexão').count()
                assert not page.locator('.boot-error').count()
                print(f'PASS login silencioso {width}px: formulário visível sem teste nem status positivo')
            else:
                page.locator('#availability-retry').wait_for(timeout=11000)
                assert not page.locator('#login-form').count()
                assert page.locator('.boot-error[role="alert"], .boot-error [role="alert"]').count()
                assert not page.get_by_text('Testar conexão').count()
                online[0]=True
                page.locator('#availability-retry').click()
                page.locator('#login-form').wait_for(timeout=8000)
                page.wait_for_timeout(500)
                assert not page.locator('.boot-error').count()
                assert not page.get_by_text('Supabase disponível. Entre com sua conta para acessar os equipamentos.').count()
                print(f'PASS recuperação {width}px: erro de indisponibilidade e retry abre login silenciosamente')
            assert health_requests, 'Disponibilidade deve ser verificada em segundo plano'
            assert not unexpected, 'Não consultar inventário protegido no login: '+str(unexpected)
            assert not js_errors, js_errors
            page.close()
    browser.close()
