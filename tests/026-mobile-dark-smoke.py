"""UI regression for mobile header/home palette and inherited dark form surfaces; mocked backend."""
from pathlib import Path
import re, ast
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','<style>'+(root/'assets/css/style.css').read_text()+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
    html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^"]*"></script>',lambda _:'<script>'+(root/'assets/js'/f'{name}.js').read_text().replace('</script>','<\\/script>')+'</script>',html)
# Consistent local mock used by the earlier regression suite.
mock_file=(root/'tests/compact-unified-smoke.py').read_text()
setup=ast.literal_eval("'''"+mock_file.split("setup='''",1)[1].split("'''",1)[0]+"'''")
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in (320,390,768,1280):
  page=b.new_page(viewport={'width':width,'height':844},timezone_id='America/Sao_Paulo')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*.supabase.co/**',lambda r:r.abort())
  page.set_content(html,wait_until='domcontentloaded')
  page.locator('#login-form').wait_for(timeout=8000)
  page.evaluate("Object.defineProperty(window.crypto,'randomUUID',{configurable:true,value:()=>'00000000-0000-4000-8000-000000000003'})")
  page.evaluate(setup)
  page.locator('.ops-stat').first.wait_for(timeout=8000)
  if width<=820:
   assert page.locator('#menu').count()==0, (width,'menu was not removed')
   assert page.locator('.topbar .topbar-kicker').count()==0, (width,'mobile Equipa label remains')
   assert page.locator('#global-search').is_visible(),(width,'global search hidden')
   assert page.locator('#topbar-alerts').is_visible(),(width,'alerts hidden')
   assert page.locator('#global-search').bounding_box()['width'] >= 130,(width,'search squeezed')
   page.locator('#mobile-more').click()
   assert page.locator('#mobile-sheet-theme').is_visible(),(width,'theme action absent')
   page.locator('#mobile-sheet-theme').click()
   assert page.evaluate('document.documentElement.dataset.theme')=='dark', (width,'theme did not change')
   assert 'claro' in page.locator('#mobile-sheet-theme').inner_text().lower()
   page.locator('#mobile-more-close').click()
  else:
   page.locator('#topbar-theme').click()
  assert page.evaluate('document.documentElement.dataset.theme')=='dark',(width,'dark theme not on')
  def style(selector):
   return page.locator(selector).first.evaluate('(el)=>({bg:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage,color:getComputedStyle(el).color,border:getComputedStyle(el).borderColor})')
  def dark(selector):
   info=style(selector)
   m=re.match(r'rgba?\((\d+),\s*(\d+),\s*(\d+)',info['bg'])
   assert m and max(map(int,m.groups()))<190,(width,selector,info)
   return info
  dark('.topbar');dark('.ops-results'); dark('.ops-stat')
  if width<=820:
   dark('.mobile-tabbar')
   page.evaluate('async()=>await renderDashboard()')
   page.locator('.mobile-home-hero').wait_for(timeout=8000)
   blue=style('.mobile-home-hero');dark('.mobile-home-hero');dark('.mobile-now')
   page.evaluate("setEquipaTheme('light')")
   light=style('.mobile-home-hero')
   assert light['image']!=blue['image'],(width,'home does not follow theme',light,blue)
   page.evaluate("setEquipaTheme('dark')")
  for view,fn,selector in [('equipment','renderEquipment','.ref-results-panel'),('history','renderHistory','.workspace-panel'),('carts','renderCarts','.workspace-panel'),('maintenance','renderMaintenance','.workspace-panel'),('reports','renderReports','.report-card'),('admin','renderAdmin','.ea-card'),('audit','renderAudit','.workspace-panel')]:
   page.evaluate(f'async()=>await {fn}()')
   page.wait_for_timeout(50)
   visible=page.locator(selector).filter(visible=True)
   if visible.count():dark(selector)
   fields=page.locator('.content input:visible, .content select:visible, .content textarea:visible')
   for idx in range(min(fields.count(),10)):
    el=fields.nth(idx)
    if el.get_attribute('type') in ('checkbox','radio','hidden'):continue
    c=el.evaluate('(e)=>getComputedStyle(e).backgroundColor')
    m=re.match(r'rgba?\((\d+),\s*(\d+),\s*(\d+)',c)
    assert m and max(map(int,m.groups()))<190,(width,view,c,el.get_attribute('id'))
  page.evaluate('async()=>await renderWithdrawals()')
  page.evaluate("openCheckoutModal([{id:'a',code:'NOTE-001'}])")
  modal=page.locator('.modal-backdrop .modal')
  modal.wait_for(timeout=3000)
  dark('.modal'); dark('.modal-actions')
  for e in page.locator('.modal input:visible,.modal select:visible,.modal textarea:visible').all():
   if e.get_attribute('type') in ('radio','checkbox'):continue
   bg=e.evaluate('(el)=>getComputedStyle(el).backgroundColor')
   m=re.match(r'rgba?\((\d+),\s*(\d+),\s*(\d+)',bg)
   assert m and max(map(int,m.groups()))<190,(width,'modal field',bg)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,'overflow')
  assert not errors,(width,errors[:5])
  print(f'PASS {width}px: clean mobile topbar, Mais theme control, blue home, full dark panels/fields, no errors')
  page.close()
 b.close()
