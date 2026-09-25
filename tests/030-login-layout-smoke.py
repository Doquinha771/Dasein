"""Regressão da nova autenticação (mock da saúde da API e login, sem dados reais)."""
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
import re
root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text(encoding='utf-8')
html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
html = re.sub(r'<link rel="stylesheet"[^>]*>', '<style>' + (root/'assets/css/style.css').read_text(encoding='utf-8') + '</style>', html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
    html = re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^\"]*"></script>',
        lambda _: '<script>'+(root/'assets/js'/f'{name}.js').read_text(encoding='utf-8').replace('</script>','<\\/script>')+'</script>',html)
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    for width, height in [(320,700),(390,844),(768,1024),(1280,800),(1750,920)]:
        page = browser.new_page(viewport={'width':width,'height':height})
        errors=[]; calls=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        def handler(route):
            path=urlparse(route.request.url).path
            calls.append(path)
            if path=='/auth/v1/health': route.fulfill(status=200,content_type='application/json',body='{"status":"ok"}')
            else: route.fulfill(status=400,content_type='application/json',body='{"message":"Credenciais incorretas"}')
        page.route('**/*.supabase.co/**',handler)
        page.set_content(html, wait_until='domcontentloaded')
        page.locator('#login-form').wait_for(timeout=5000)
        page.wait_for_timeout(100)
        assert page.locator('#login-form').is_visible()
        assert not page.locator('#signup-form').is_visible()
        assert 'equipamentos escolares' in page.locator('.auth-brand-copy h1').inner_text().lower()
        assert page.locator('.auth-brand').is_visible() == (width>820)
        assert page.locator('#app').evaluate('(el) => el.scrollWidth <= document.documentElement.clientWidth + 1'), f'horizontal overflow {width}'
        assert page.locator('#login-email').is_visible() and page.locator('#login-password').is_visible()
        assert page.locator('#auth-card').evaluate('(el) => {const r=el.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1;}')
        page.locator('#login-password').fill('supersegura!')
        page.locator('[data-password-toggle="login-password"]').click()
        assert page.locator('#login-password').get_attribute('type')=='text'
        page.locator('[data-password-toggle="login-password"]').click()
        assert page.locator('#login-password').get_attribute('type')=='password'
        page.locator('[data-tab="signup"]').click()
        assert page.locator('#signup-form').is_visible() and not page.locator('#login-form').is_visible()
        assert page.locator('#signup-terms').count()==1
        page.locator('[data-tab="login"]').click()
        assert page.locator('#login-form').is_visible() and not page.locator('#signup-form').is_visible()
        page.evaluate('document.documentElement.dataset.theme="dark"')
        bg = page.locator('#auth-card').evaluate('(el) => getComputedStyle(el).backgroundColor')
        field_bg = page.locator('.auth-input-wrap').first.evaluate('(el) => getComputedStyle(el).backgroundColor')
        assert bg != 'rgb(255, 255, 255)' and field_bg != 'rgb(255, 255, 255)', (width,bg,field_bg)
        page.evaluate('document.documentElement.dataset.theme="light"')
        if width==1750:
            print('MEASURE', page.evaluate('''() => {let c=getComputedStyle(document.querySelector('.auth-card')); return {display:c.display,gap:c.gap,padding:c.padding,width:c.width,height:c.height}}'''))
            page.screenshot(path='/mnt/data/equipa_login_028/login_desktop_QA.png',full_page=True)
        if width==390:
            page.screenshot(path='/mnt/data/equipa_login_028/login_mobile_QA.png',full_page=True)
        assert not errors,(width,errors)
        assert all(path=='/auth/v1/health' for path in calls),calls
        print(f'PASS {width}px: login responsivo, campo de senha, cadastro, tema claro/escuro, sem overflow nem erros JS')
        page.close()
    browser.close()
