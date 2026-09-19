"""Smoke test sem acessar o Supabase de producao."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
html = (root/'index.html').read_text()
html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
html = re.sub(r'<link rel="stylesheet"[^>]*>', '<style>'+(root/'assets/css/style.css').read_text()+'</style>', html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
    html = re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^"]*"></script>',
                  lambda _: '<script>'+(root/'assets/js'/f'{name}.js').read_text().replace('</script>','<\\/script>')+'</script>',html)
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for width,height in ((390,844),(320,640),(1280,800)):
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        page.route('**/*.supabase.co/**',lambda route: route.abort())
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.set_content(html,wait_until='domcontentloaded')
        page.locator('#login-form').wait_for(timeout=8000)
        assert page.locator('.boot').count()==0, f'loading persisted {width}'
        assert page.locator('#login-email').is_visible(),f'login hidden {width}'
        metrics=page.evaluate('''() => ({scroll:document.documentElement.scrollWidth,viewport:innerWidth,inputFont:getComputedStyle(document.querySelector('#login-email')).fontSize})''')
        
        if metrics['scroll'] > metrics['viewport'] + 1:
            print('OVERFLOW',page.evaluate('''() => [...document.querySelectorAll('*')].map(e=>({tag:e.tagName,cl:e.className,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width,scroll:e.scrollWidth})).filter(e=>e.right>innerWidth+1||e.x < -1).slice(0,25)'''))
        assert metrics['scroll'] <= metrics['viewport'] + 1, f'horizontal overflow at {width}: {metrics}'
        if width<821: assert float(metrics['inputFont'][:-2])>=16,metrics
        assert not errors,f'JS error at {width}: {errors}'
        if width==390: page.screenshot(path='/mnt/data/aloca_mobile_smoke.png',full_page=True)
        print(f'PASS viewport={width}x{height}, no loading, no overflow, input={metrics["inputFont"]}, js_errors=0')
        page.close()
    browser.close()

