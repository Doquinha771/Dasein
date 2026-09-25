"""Smoke offline: cadastro individual enxuto com API simulada, nenhuma escrita em producao."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
import re
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf-8')
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','<style>'+(root/'assets/css/style.css').read_text(encoding='utf-8')+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
 html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^\"]*"></script>',lambda _:'<script>'+(root/'assets/js'/f'{name}.js').read_text(encoding='utf-8').replace('</script>','<\\/script>')+'</script>',html)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in ((320,700),(390,844),(1280,800)):
  page=browser.new_page(viewport={'width':width,'height':height})
  errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
  page.route('**/*.supabase.co/**',lambda r:r.fulfill(status=200,content_type='application/json',body='{"status":"ok"}') if urlparse(r.request.url).path=='/auth/v1/health' else r.abort())
  page.set_content(html,wait_until='domcontentloaded')
  page.locator('#login-form').wait_for(timeout=8000)
  page.evaluate("""() => {
   state.profile={id:'00000000-0000-4000-8000-000000000001',role:'admin',full_name:'Admin',is_active:true};
   window.__quickCalls=[];
   supabase.rpc=async(name,args)=>{
      window.__quickCalls.push({name,args});
      if(name==='equipa_quick_register_equipment') return {data:{id:'00000000-0000-4000-8000-000000000002',qr_token:'00000000-0000-4000-8000-000000000003',code:args.p_code},error:null};
      throw Error('RPC inesperada '+name);
   };
  }""")
  page.evaluate("Object.defineProperty(window.crypto,'randomUUID',{configurable:true,value:()=>'00000000-0000-4000-8000-000000000007'})")
  page.evaluate("window.EquipaInventory.openHub('individual')")
  page.locator('#quick-register-form').wait_for()
  assert page.locator('#quick-register-form [required]').count()==2
  assert page.locator('#eq-intake-workspace').count()==0
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), f'overflow {width}'
  page.locator('[name=code]').fill('NOTE-701')
  page.locator('[name=model]').fill('Positivo Motion')
  page.locator('[name=location_text]').fill('Sala 02')
  page.locator('#quick-register-submit').click()
  page.locator('#quick-register-result').wait_for(state='visible',timeout=4000)
  calls=page.evaluate('window.__quickCalls')
  assert len(calls)==1 and calls[0]['name']=='equipa_quick_register_equipment',calls
  assert calls[0]['args']['p_code']=='NOTE-701' and calls[0]['args']['p_model']=='Positivo Motion'
  assert calls[0]['args']['p_brand'] is None and calls[0]['args']['p_location_text']=='Sala 02'
  page.locator('#quick-register-again').click()
  assert page.locator('#quick-register-form').is_visible()
  assert page.locator('[name=code]').input_value()==''
  assert page.locator('[name=model]').input_value()=='Positivo Motion'
  assert page.locator('[name=location_text]').input_value()=='Sala 02'
  assert page.locator('.modal-close-control').is_visible()
  page.locator('.modal-close-control').click()
  assert page.locator('#quick-register-form').count()==0
  assert not errors,errors
  print(f'PASS {width}x{height}: cadastro rapido, RPC unica, modelo/local reaproveitados, sem JS errors')
  page.close()
 browser.close()
