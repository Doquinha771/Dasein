"""Regression: mobile keeps one principal page search and routes it to the active area."""
from pathlib import Path
import re, ast
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','<style>'+(root/'assets/css/style.css').read_text()+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
    html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^"]*"></script>',lambda _:'<script>'+(root/'assets/js'/f'{name}.js').read_text().replace('</script>','<\\/script>')+'</script>',html)
mock_file=(root/'tests/compact-unified-smoke.py').read_text()
setup=ast.literal_eval("'''"+mock_file.split("setup='''",1)[1].split("'''",1)[0]+"'''")
with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for width in (320,390,768,820):
        p=b.new_page(viewport={'width':width,'height':844},timezone_id='America/Sao_Paulo')
        errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
        p.route('**/*.supabase.co/**',lambda r:r.fulfill(status=200,content_type='application/json',body='{"status":"ok"}') if r.request.url.split('/auth/v1/health')[0].endswith('.supabase.co') and r.request.url.endswith('/auth/v1/health') else r.abort())
        p.set_content(html,wait_until='domcontentloaded')
        p.locator('#login-form').wait_for(timeout=8000)
        p.evaluate("Object.defineProperty(window.crypto,'randomUUID',{configurable:true,value:()=>'00000000-0000-4000-8000-000000000003'})")
        p.evaluate(setup)
        p.locator('#global-search').wait_for(timeout=8000)
        checks=[
            ('equipment','renderEquipment','#equipment-search'),
            ('withdrawals','renderWithdrawals','#withdrawal-search'),
            ('history','renderHistory','#history-smart'),
            ('carts','renderCarts','#cart-search'),
            ('maintenance','renderMaintenance','#maintenance-search'),
            ('admin','renderAdmin','#ea-user-search'),
            ('audit','renderAudit','#audit-search'),
        ]
        for view,fn,local in checks:
            p.evaluate(f'async()=>await {fn}()')
            p.wait_for_timeout(80)
            assert p.locator('#global-search').is_visible(),(width,view,'principal hidden')
            assert p.locator(local).count()==1,(width,view,'local field missing')
            assert not p.locator(local).is_visible(),(width,view,'duplicate local search visible')
            assert p.locator('.topbar input[type="search"]:visible').count()==1,(width,view,'topbar search count')
        p.evaluate('async()=>await renderWithdrawals()')
        g=p.locator('#global-search');g.fill('João');p.wait_for_timeout(350)
        assert p.evaluate('state.withdrawalsSearch')=='João',(width,'global did not feed withdrawals')
        assert not errors,(width,errors[:4])
        print(f'PASS {width}px: one principal mobile search across all workspaces')
        p.close()
    b.close()
