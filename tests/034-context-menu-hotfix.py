"""Offline UI test: equipment actions, right click, viewport fit and re-render. Does not access production."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
import re
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text('utf8')
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','<style>'+(root/'assets/css/style.css').read_text('utf8')+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
  html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^\"]*"></script>',lambda _: '<script>'+(root/'assets/js'/f'{name}.js').read_text('utf8').replace('</script>','<\\/script>')+'</script>',html)
record={'id':'00000000-0000-4000-8000-000000000031','code':'NOTE-031','model':'Positivo Motion','brand':'Positivo','status':'available','is_active':True,'updated_at':'2026-09-25T10:00:00Z'}
with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  for width,height in ((280,440),(320,560),(390,680),(768,650),(1024,720),(1280,760)):
    page=browser.new_page(viewport={'width':width,'height':height})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/*.supabase.co/**',lambda r:r.fulfill(status=200,content_type='application/json',body='{"status":"ok"}') if urlparse(r.request.url).path=='/auth/v1/health' else r.abort())
    page.set_content(html,wait_until='domcontentloaded')
    page.locator('#login-form').wait_for(timeout=8000)
    page.evaluate('''(item) => {
      state.profile={id:'00000000-0000-4000-8000-000000000001',role:'admin',full_name:'Admin',is_active:true};
      state.view='equipment';
      window.__opened=[];
      openEquipment=(id)=>{window.__opened.push(id);};
      window.__fixtureItem=item;
      window.__renderFixture=()=>{
        app.innerHTML=`<main id="fixture" style="width:${innerWidth>820?'calc(100% - 220px)':'calc(100% - 20px)'}; margin-left:${innerWidth>820?'220px':'10px'}"><div class="ref-results-panel">${equipmentRows([window.__fixtureItem])}</div></main>`;
        bindEquipmentRowClicks(app);
      };
      window.__renderFixture();
    }''',record)
    more=page.locator('[data-item-menu]')
    more.wait_for()
    b=more.bounding_box()
    assert b and b['x']>=0 and b['x']+b['width']<=width+1, f'3 dots out of viewport {width}: {b}'
    more.click(timeout=3000)
    menu=page.locator('#equipa-context-menu')
    menu.wait_for(state='visible',timeout=3000)
    assert menu.get_attribute('role')=='menu'
    rect=menu.bounding_box()
    assert rect and rect['x']>=-1 and rect['x']+rect['width']<=width+1 and rect['y']>=-1 and rect['y']+rect['height']<=height+1, f'menu out of viewport {width}: {rect}'
    assert menu.locator('[role=menuitem]').count()==3
    more.click()
    assert menu.count()==0,'second tap must close the same menu'
    more.click()
    menu.get_by_role('menuitem',name='Ver equipamento').click()
    assert page.evaluate('window.__opened')==[record['id']], 'action must execute'
    assert menu.count()==0,'action must close menu'
    page.evaluate('window.__renderFixture()')
    page.locator('[data-item-menu]').click()
    assert menu.is_visible(),'3 dots must work after rerender'
    page.keyboard.press('Escape')
    assert menu.count()==0,'Escape must close menu'
    page.evaluate('''() => {
      const row=document.querySelector('[data-equipment]');
      row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:innerWidth-2,clientY:innerHeight-2}));
    }''')
    menu.wait_for(state='visible')
    rect=menu.bounding_box()
    assert rect and rect['x']>=-1 and rect['x']+rect['width']<=width+1 and rect['y']>=-1 and rect['y']+rect['height']<=height+1, f'right click clipped {width}: {rect}'
    assert menu.get_by_role('menuitem',name='Apagar').is_visible()
    page.evaluate("document.documentElement.dataset.theme='dark'")
    bg=menu.evaluate('e=>getComputedStyle(e).backgroundColor')
    assert bg not in ('rgb(255, 255, 255)','rgba(250, 249, 247, 0.98)'),f'dark menu was light {bg}'
    assert not errors,errors
    print(f'PASS {width}x{height}: três pontos dentro da tela, menu acessível, abrir/fechar/ação, re-render, botão direito, modo escuro; JS sem erros')
    page.close()
  browser.close()
