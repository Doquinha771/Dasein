"""Smoke de UI isolado: simulação de inventário/retiradas, sem tocar em dados reais do Supabase."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','<style>'+(root/'assets/css/style.css').read_text()+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
 html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^"]*"></script>',lambda _:'<script>'+(root/'assets/js'/f'{name}.js').read_text().replace('</script>','<\\/script>')+'</script>',html)
setup='''async () => {
 state.profile={id:'00000000-0000-4000-8000-000000000001',full_name:'Maria Santos',role:'admin',is_active:true};
 state.session={user:{id:state.profile.id}};
 const equip=[
 {id:'a',code:'NOTE-001',status:'in_use',is_active:true,brand:'Positivo',model:'Motion',location_text:'Sala 12',updated_at:new Date().toISOString()},
 {id:'b',code:'NOTE-002',status:'available',is_active:true,brand:'Dell',model:'Inspiron',location_text:'Sala 10',updated_at:new Date().toISOString()},
 {id:'c',code:'NOTE-003',status:'maintenance',is_active:true,brand:'Lenovo',model:'ThinkPad',location_text:'Laboratório',updated_at:new Date().toISOString()},
 {id:'d',code:'NOTE-004',status:'in_use',is_active:true,brand:'Positivo',model:'Motion',location_text:'Sala 7',updated_at:new Date().toISOString()},
 ];
 const now=new Date();const past=new Date(now.getTime()-3600*1000).toISOString();const later=new Date(now.getTime()+3600*1000).toISOString();
 const withdrawal=[
 {id:17,requested_by:state.profile.id,class_name:'3A',destination:'Sala 12',responsible_name:'Maria Santos',student_name:'João',status:'open',withdrawn_at:past,due_at:later,recorded_by_name:'Maria Santos',custodian_name:'João Silva',custodian_role:'student',custody_mode:'delegate',checkout_purpose:'lesson',purpose_details:'Programação',withdrawal_items:[{equipment_id:'a',returned_at:null}]},
 {id:18,requested_by:state.profile.id,class_name:'3B',destination:'Sala 7',responsible_name:'Maria Santos',status:'open',withdrawn_at:past,due_at:past,recorded_by_name:'Maria Santos',custodian_name:'Pedro',custodian_role:'teacher',custody_mode:'self',checkout_purpose:'project',withdrawal_items:[{equipment_id:'d',returned_at:null}]},
 ];
 window.__mockEquipment=equip;window.__mockWithdrawal=withdrawal;window.__rpcCalls=[];
 supabase.from=(table)=>{
  let rows=table==='equipments'?equip:table==='withdrawals'?withdrawal:table==='profiles'?[state.profile]:[];
  const o={select(){return this},eq(){return this},in(){return this},order(){return this},range(){return this},limit(){return this},single(){this._single=true;return this},then(ok,fail){return Promise.resolve({data:this._single?rows[0]:rows,error:null}).then(ok,fail)}};
  return o;
 };
 supabase.rpc=async (name,params)=>{window.__rpcCalls.push({name,params});return {data:name==='home_withdrawals'?[{withdrawal_id:17,class_name:'3A',destination:'Sala 12',status:'open',pending_count:1,total_count:1,withdrawn_at:past,responsible_name:'Maria Santos'}]:name==='overdue_withdrawals_count'?1:'ok',error:null}};
 await renderWithdrawals();
}'''
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in ((320,640),(390,844),(1280,800)):
  page=browser.new_page(viewport={'width':width,'height':height})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*.supabase.co/**',lambda route:route.abort())
  page.set_content(html,wait_until='domcontentloaded');page.locator('#login-form').wait_for(timeout=8000)
  page.evaluate("Object.defineProperty(window.crypto,'randomUUID',{configurable:true,value:()=>'00000000-0000-4000-8000-000000000003'})")
  page.evaluate(setup)
  page.locator('.ops-table-row').first.wait_for(timeout=6000)
  assert page.locator('.ops-table-row').count()==4
  assert page.get_by_text('João Silva').count()>0
  assert page.locator('.ops-badge.overdue').count()==1
  assert page.locator('.ops-badge.maintenance').count()==1
  assert page.locator('.ops-badge.available').count()==1
  assert not page.locator('nav').get_by_text('Reservas').count()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'overflow {width}'
  page.locator('#ops-status').select_option('available')
  page.locator('.ops-table-row').first.wait_for(timeout=5000)
  assert page.locator('.ops-table-row').count()==1 and 'NOTE-002' in page.locator('.ops-table-row').first.inner_text()
  page.locator('#ops-status').select_option('')
  page.locator('#withdrawal-search').fill('not')
  page.locator('.ops-search .smart-suggestions button').first.wait_for(timeout=5000)
  assert 'NOTE-001' in page.locator('.ops-search .smart-suggestions').inner_text()
  page.locator('.ops-search .smart-suggestions button').filter(has_text='NOTE-002').first.click()
  page.wait_for_timeout(350)
  assert page.locator('.ops-table-row').count()==1 and 'NOTE-002' in page.locator('.ops-table-row').first.inner_text()
  page.locator('#withdrawal-search').fill('João')
  page.wait_for_timeout(400)
  assert page.locator('.ops-table-row').count()==1
  page.locator('#withdrawal-search').fill('')
  page.wait_for_timeout(400)
  page.locator('#topbar-theme').click()
  assert page.evaluate("document.documentElement.dataset.theme==='dark'")
  for selector in ('.ops-heading','.ops-stat','.ops-search-panel','.ops-results','.ops-table-row'):
   color=page.locator(selector).first.evaluate('e=>getComputedStyle(e).backgroundColor')
   assert color not in ('rgb(255, 255, 255)','rgb(248, 250, 255)'), (width,selector,color)
  if width==390:
   page.evaluate('renderDashboard()')
   page.locator('.delivery-journey').first.wait_for(timeout=6000)
   mobile_background=page.locator('.mobile-dashboard-organic').evaluate('e=>getComputedStyle(e).backgroundColor')
   assert mobile_background not in ('rgb(255, 255, 255)','rgb(248, 250, 255)'),mobile_background
   popup_background=page.locator('.delivery-journey').first.evaluate('e=>getComputedStyle(e).backgroundColor')
   assert popup_background not in ('rgb(255, 255, 255)','rgb(248, 250, 255)'),popup_background
   assert page.locator('.delivery-steps li').count()>=3
   assert 'Prevista para' in page.locator('.delivery-journey').first.inner_text()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'timeline overflow'
  assert not errors,errors
  print(f'PASS {width}x{height}: tabela e estados, filtros, busca, dark mode, timeline mobile; JS errors=0')
  page.close()
 browser.close()
