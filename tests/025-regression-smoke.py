from pathlib import Path
import re
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','<style>'+(root/'assets/css/style.css').read_text()+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
    html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^"]*"></script>',lambda _:'<script>'+(root/'assets/js'/f'{name}.js').read_text().replace('</script>','<\\/script>')+'</script>',html)
setup=r'''async (role) => {
 state.profile={id:'00000000-0000-4000-8000-000000000001',full_name:role==='student'?'Aluno Teste':'Professora Teste',role,is_active:true};
 state.session={user:{id:state.profile.id}};
 const equipment=[{id:'a',code:'NOTE-001',asset_tag:'PA-1',status:'in_use',is_active:true,label:'NOTE-001',brand:'Positivo',model:'Motion',updated_at:new Date().toISOString(),location_text:'Sala 2'}];
 const withdrawals=[{id:17,requested_by:'different',class_name:'3A',destination:'Sala 2',responsible_name:'Professor Teste',custodian_name:'João Silva',custodian_role:'student',custody_mode:'delegate',status:'open',withdrawn_at:new Date().toISOString(),due_at:new Date(Date.now()+3600000).toISOString(),withdrawal_items:[{equipment_id:'a',returned_at:null}]}];
 const objects={equipments:equipment,withdrawals:role==='student'?[]:withdrawals,profiles:[state.profile],audit_events:[],equipment_carts:[],maintenance_events:[],withdrawal_items:[]};
 supabase.from=(table)=>{
  const rows=objects[table]||[];
  const o={select(){return this},eq(){return this},neq(){return this},in(){return this},is(){return this},ilike(){return this},or(){return this},order(){return this},range(){return this},limit(){return this},maybeSingle(){this._single=true;return this},single(){this._single=true;return this},then(ok,fail){return Promise.resolve({data:this._single?rows[0]||null:rows,error:null,count:rows.length}).then(ok,fail)}};
  return o;
 };
 window.__rpcCalls=[];
 supabase.rpc=async (name,params)=>{
 window.__rpcCalls.push(name);
 if(name==='equipa_school_activity')return {data:{occupancy:[{equipment_id:'a',holder_name:'João Silva',holder_role:'student',declared:true}],events:[{event_id:'out-1',event_type:'checkout',equipment_code:'NOTE-001',holder_name:'João Silva',declared:true,event_at:new Date().toISOString()},{event_id:'back-2',event_type:'return',equipment_code:'NOTE-002',holder_name:'Maria',event_at:new Date().toISOString()}]},error:null};
 if(name==='home_withdrawals')return {data:[],error:null};
 if(name==='overdue_withdrawals_count')return {data:0,error:null};
 return {data:[],error:null};
 };
 await renderWithdrawals();
}'''
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in (320,390,1280):
  page=b.new_page(viewport={'width':width,'height':844},timezone_id='America/Sao_Paulo')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*.supabase.co/**',lambda r:r.abort())
  page.set_content(html,wait_until='domcontentloaded')
  page.locator('#login-form').wait_for(timeout=8000)
  page.evaluate("Object.defineProperty(window.crypto,'randomUUID',{configurable:true,value:()=>'00000000-0000-4000-8000-000000000003'})")
  page.evaluate(setup,'student')
  page.locator('.ops-table-row').wait_for(timeout=8000)
  assert page.locator('.ops-table-row').inner_text().find('João Silva')!=-1,(width,'student not seeing holder')
  assert 'declarado' in page.locator('.ops-table-row').inner_text().lower(),(width,'declaration marker')
  search=page.locator('#withdrawal-search');search.fill('João')
  page.wait_for_timeout(320)
  assert page.evaluate("document.activeElement?.id==='withdrawal-search'"),(width,'withdrawal search stole focus')
  assert page.locator('.ops-table-row').count()==1,(width,'withdrawal search lost results')
  search.fill('inexistente');page.wait_for_timeout(320)
  assert page.locator('.ops-table-row').count()==0,(width,'withdrawal local search not filtering')
  search.fill('João');page.wait_for_timeout(320)
  # First open requires no native OS notification permissions; in-app feed supplies both movements.
  page.locator('#topbar-alerts').click()
  page.locator('.equipa-notice-item').first.wait_for(timeout=6000)
  notices=page.locator('#equipa-notice-list').inner_text()
  assert 'Equipamento retirado' in notices and 'Equipamento devolvido' in notices,(width,notices)
  assert page.locator('.equipa-notice-close').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(198, 40, 40)',(width,'notice close not red')
  page.locator('.equipa-notice-close').click()
  await_placeholder=page.evaluate('''async()=>{openCheckoutModal([{id:'a',code:'NOTE-001'}]);return document.querySelector('#checkout-form input[name="due_at"]').value;}''')
  assert await_placeholder.endswith('T21:15'),(width,await_placeholder)
  button=page.locator('.modal-close-control').last
  assert button.is_visible(),(width,'missing close button')
  assert button.evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(198, 40, 40)',(width,'modal close not red')
  page.evaluate("setEquipaTheme('dark')")
  assert button.evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(180, 35, 35)',(width,'dark modal close not red')
  button.click()
  assert page.locator('.modal-backdrop').count()==0,(width,'modal remained open')
  page.evaluate('async()=>await renderEquipment()')
  eSearch=page.locator('#equipment-search')
  eSearch.fill('NOT')
  page.wait_for_timeout(900)
  assert page.evaluate("document.activeElement?.id==='equipment-search'"),(width,'equipment search stole focus')
  assert page.locator('#equipment-results .loading').count()==0,(width,'equipment result spinner returned')
  assert page.locator('#equipment-search').input_value()=='NOT',(width,'equipment search text changed')
  assert not errors,(width,errors)
  print(f'PASS {width}px: student custody, no search focus loss/spinner, pickup/return notices, 21:15 default and red close buttons')
  page.close()
 b.close()
