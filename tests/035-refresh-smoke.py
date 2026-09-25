"""Teste offline: o cadastro aparece no inventário sem reload do navegador."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','<style>'+(root/'assets/css/style.css').read_text()+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
 html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^\"]*"></script>',lambda _:'<script>'+(root/'assets/js'/f'{name}.js').read_text().replace('</script>','<\\/script>')+'</script>',html)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in (320,390,1280):
  page=browser.new_page(viewport={'width':width,'height':850})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded')
  page.locator('#login-form').wait_for(timeout=8000)
  page.evaluate('''() => {
   let seq=0;
   Object.defineProperty(window.crypto,'randomUUID',{configurable:true,value:()=>`00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`});
   state.profile={id:crypto.randomUUID(),role:'admin',full_name:'Admin',is_active:true};
   state.view='equipment';window.__rows=[];window.__reads=[];window.__writes=[];
   supabase.from=(name)=>{
     if(name!=='equipments')throw Error('Unexpected table '+name);
     return {select(){return this},eq(){return this},ilike(){return this},or(){return this},
       order(field){this.sort=field;return this},
       async range(start,end){window.__reads.push(this.sort);return {data:window.__rows.slice(start,end+1),count:window.__rows.length,error:null}}};
   };
   supabase.rpc=async(name,args)=>{
     if(name!=='equipa_register_equipment_batch')throw Error('Unexpected RPC '+name);
     window.__writes.push(name);
     const item={id:crypto.randomUUID(),qr_token:crypto.randomUUID(),code:args.p_items[0].code,
       model:args.p_items[0].model,location_text:args.p_items[0].location_text,
       status:'available',is_active:true,updated_at:new Date().toISOString()};
     window.__rows.unshift(item);return {data:[item],error:null};
   };
  }''')
  page.evaluate('renderEquipment()')
  page.locator('#new-equipment').wait_for()
  page.locator('#new-equipment').click()
  assert page.locator('[data-intake-mode="individual"].active').is_visible()
  page.locator('#quick-register-form [name=code]').fill('NOTE-909')
  page.locator('#quick-register-form [name=model]').fill('Positivo Motion')
  page.locator('#quick-register-submit').click()
  page.locator('#equipment-results .equipment-row').wait_for(timeout=5000)
  assert 'NOTE-909' in page.locator('#equipment-results').inner_text()
  assert page.locator('#quick-register-again').is_visible(), 'O modal deve permanecer aberto.'
  assert page.evaluate("state.equipmentSort==='recent'&&state.equipmentPage===0")
  assert page.evaluate("window.__reads.at(-1)==='updated_at'&&window.__writes.length===1")
  page.locator('[data-intake-mode="batch"]').click()
  assert page.locator('#quick-batch-form').is_visible()
  page.locator('[data-intake-mode="import"]').click()
  assert page.locator('#quick-import-form').is_visible()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'overflow {width}'
  assert not errors, errors
  print(f'PASS {width}px: inventário atualizado sem reload, ordem recente e menu com 3 modalidades')
  page.close()
 browser.close()
