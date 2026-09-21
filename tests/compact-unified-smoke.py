"""Page headings/navigation and blue action system across both layouts, no production calls."""
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
 const equipment=[{id:'a',code:'NOTE-001',status:'available',is_active:true,label:'NOTE-001',brand:'Positivo',model:'Motion',updated_at:new Date().toISOString()}];
 const withdrawals=[{id:17,requested_by:state.profile.id,class_name:'3A',destination:'Sala 12',responsible_name:'Maria Santos',student_name:'João',status:'open',withdrawn_at:new Date().toISOString(),due_at:new Date(Date.now()+3600000).toISOString(),withdrawal_items:[{equipment_id:'a',returned_at:null}]}];
 const objects={equipments:equipment,withdrawals:withdrawals,profiles:[state.profile],audit_events:[],equipment_carts:[],maintenance_events:[],withdrawal_items:[]};
 supabase.from=(table)=>{
 const r=objects[table]||[];
 const o={select(){return this},eq(){return this},neq(){return this},in(){return this},is(){return this},ilike(){return this},order(){return this},range(){return this},limit(){return this},maybeSingle(){this._single=true;return this},single(){this._single=true;return this},then(ok,fail){return Promise.resolve({data:this._single?r[0]||null:r,error:null,count:r.length}).then(ok,fail)}};
 return o;
 };
 supabase.rpc=async (name,params)=>({data:name==='equipa_admin_audit_page'?{rows:[],total:0}:name==='equipa_admin_user_page'?{rows:[],total:0,active:0,roles:0}:name==='home_withdrawals'?[]:name==='overdue_withdrawals_count'?0:[],error:null});
 await renderWithdrawals();
}'''
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in (320,390,768,1280):
  page=browser.new_page(viewport={'width':width,'height':844})
  page.route('**/*.supabase.co/**',lambda r:r.abort())
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded')
  page.locator('#login-form').wait_for(timeout=8000)
  page.evaluate("Object.defineProperty(window.crypto,'randomUUID',{configurable:true,value:()=>'00000000-0000-4000-8000-000000000003'})")
  page.evaluate(setup)
  page.locator('.ops-stat').first.wait_for(timeout=8000)
  assert not page.locator('.ops-breadcrumb,.ops-heading-icon,.topbar .mobile-top-name strong').count(), f'duplicated withdrawals header {width}'
  assert page.locator('main.content[aria-label="Retiradas"]').count()==1
  for view,fn,duplicate in (
   ('equipment','renderEquipment','.ref-page-title'),
   ('history','renderHistory','.workspace-head'),
   ('carts','renderCarts','.workspace-head'),
   ('maintenance','renderMaintenance','.workspace-head'),
   ('reports','renderReports','.report-hero'),
   ('admin','renderAdmin','.ea-intro'),
   ('audit','renderAudit','.workspace-head'),
  ):
   # Allow async loaders to finish (the mock is read-only).
   page.evaluate(f'async () => {{await {fn}()}}')
   assert page.locator(f'main.content.view-{view}').count()==1, (width,view,'missing page')
   assert page.locator('main.content').locator(duplicate).count()==0, (width,view,'repeated page header')
   assert page.locator('nav .nav-button.active').count()==1, (width,view,'selected nav')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,view,'horizontal overflow')
   if view=='equipment':
    if width<821:
     assert page.locator('.ref-page-heading .ref-primary-action').is_visible(),(width,view,'missing registration action')
    assert page.locator('.ref-page-heading .ref-page-symbol').count()==0
   if view=='carts':assert page.locator('#new-cart').count()==1
   if view=='reports':assert page.locator('#report-export').count()==1
  page.evaluate('async () => {await renderWithdrawals()}')
  if width==1280:page.screenshot(path='/mnt/data/equipa_024_desktop_qa.png',full_page=True)
  if width<821:
   # Buttons keep a single blue action identity regardless of host screen.
   colors=page.evaluate('''() => ({cta:getComputedStyle(document.querySelector('.withdrawal-mobile-cta')).backgroundColor,
      qr:getComputedStyle(document.querySelector('.mobile-qr-action>span')).backgroundColor,
      active:getComputedStyle(document.querySelector('.mobile-nav-item.active')).backgroundColor})''')
   assert colors['cta']==colors['qr'],(width,colors)
   page.locator('#topbar-theme').click()
   dark=page.evaluate('''() => ({cta:getComputedStyle(document.querySelector('.withdrawal-mobile-cta')).backgroundColor,
      qr:getComputedStyle(document.querySelector('.mobile-qr-action>span')).backgroundColor})''')
   assert dark['cta']==dark['qr'],(width,dark)
   if width==390:page.screenshot(path='/mnt/data/equipa_024_mobile_qa.png',full_page=True)
  assert not errors,(width,errors[:4])
  print(f'PASS {width}px: 7 navigation views compact, active tab, retained actions, blue buttons, no overflow/JS errors')
  page.close()
 browser.close()
