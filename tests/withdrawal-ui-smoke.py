"""Verifica a jornada de retirada sem tocar no Supabase de producao."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>','',html)
html=re.sub(r'<link rel="stylesheet"[^>]*>','<style>'+(root/'assets/css/style.css').read_text()+'</style>',html)
for name in ('config','boot-guard','supabase','app','inventory-021'):
  html=re.sub(r'<script defer src="\./assets/js/'+name+r'\.js[^"]*"></script>',lambda _:'<script>'+(root/'assets/js'/f'{name}.js').read_text().replace('</script>','<\\/script>')+'</script>',html)
mock='''async () => {
state.profile={id:'00000000-0000-4000-8000-000000000001',full_name:'Maria Santos',role:'teacher',is_active:true};
state.session={user:{id:state.profile.id}};
const rows=[{withdrawal_id:17,class_name:'3A · 2',destination:'Sala de informática',responsible_name:'Maria Santos',student_name:'João',status:'open',pending_count:1,total_count:1,withdrawn_at:new Date().toISOString(),returned_at:null}];
const more=[{id:17,due_at:new Date(Date.now()+3600000).toISOString(),checkout_purpose:'lesson',purpose_details:'Aula de programação',custodian_name:'João Silva',custodian_role:'student',custody_mode:'delegate',recorded_by_name:'Maria Santos',recorded_by_role:'teacher',student_name:'João'}];
window.__rpcCalls=[];supabase.rpc=async (name,params)=>{window.__rpcCalls.push({name,params});return {data:name==='home_withdrawals'?rows:'ok',error:null}};
supabase.from=(table)=>{
  const result=table==='withdrawals'?more:table==='equipments'?[{id:'00000000-0000-4000-8000-000000000002',code:'NOTE-001',label:'Notebook 001',model:'Série T',brand:'Positivo',location_text:'Sala 2'}]:[];
  const builder={_single:false,select(){return this},eq(){return this},in(){return this},order(){return this},limit(){return this},single(){this._single=true;return this},then(ok,fail){return Promise.resolve({data:this._single?result[0]:result,error:null}).then(ok,fail)}};
  return builder;
};
await renderWithdrawals();
}'''
with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  for width,height in ((320,640),(390,844),(1280,800)):
    page=browser.new_page(viewport={'width':width,'height':height})
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/*.supabase.co/**',lambda route:route.abort())
    page.set_content(html,wait_until='domcontentloaded')
    page.locator('#login-form').wait_for(timeout=8000)
    page.evaluate("Object.defineProperty(window.crypto, 'randomUUID', {configurable:true, value:()=>'00000000-0000-4000-8000-000000000003'})")
    page.evaluate(mock)
    page.locator('.withdrawal-card').wait_for(timeout=5000)
    assert 'João Silva' in page.locator('.withdrawal-card').inner_text()
    assert 'Aula' in page.locator('.withdrawal-card').inner_text()
    assert page.locator('.withdrawal-mobile-cta').is_visible()==(width<821)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),f'page overflow {width}'
    if width==390:page.screenshot(path='/mnt/data/equipa_0_2_2_retiradas_mobile.png',full_page=True)
    page.locator('.withdrawal-card').click()
    page.locator('.withdrawal-detail-person').wait_for(timeout=4000)
    assert 'Maria Santos' in page.locator('.withdrawal-detail-grid').inner_text()
    assert 'declarada' in page.locator('.withdrawal-detail-person').inner_text()
    page.locator('.modal [data-close]').first.click()
    page.locator('#withdrawal-new-mobile' if width<821 else '#withdrawal-new-desktop').click()
    page.locator('#withdrawal-pick-list [data-pick]').first.click()
    page.locator('#checkout-form').wait_for(timeout=4000)
    page.locator('input[name="holder_mode"][value="delegate"]').check()
    assert page.locator('input[name="holder_name"]').is_visible()
    page.locator('input[name="holder_name"]').fill('João Silva')
    page.locator('select[name="holder_role"]').select_option('student')
    page.locator('select[name="purpose"]').select_option('other')
    assert page.locator('textarea[name="purpose_details"]').is_visible()
    page.locator('textarea[name="purpose_details"]').fill('Aula de programação no laboratório')
    page.locator('input[name="class_name"]').fill('3º A')
    page.locator('input[name="destination"]').fill('Laboratório de informática')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),f'modal overflow {width}'
    page.locator('#checkout-form button[type="submit"]').click()
    page.wait_for_function("window.__rpcCalls.some(x => x.name === 'equipa_checkout_with_context')")
    call=page.evaluate("window.__rpcCalls.find(x => x.name === 'equipa_checkout_with_context').params")
    assert call['p_holder_mode']=='delegate' and call['p_holder_name']=='João Silva' and call['p_holder_role']=='student',call
    assert call['p_purpose']=='other' and len(call['p_purpose_details'])>=8 and call['p_destination']=='Laboratório de informática',call
    page.evaluate("openBookingCustodyModal(42,{class_name:'3º A',destination:'Sala 12'})")
    page.locator('#booking-custody-form').wait_for()
    page.locator('#booking-custody-form select[name="purpose"]').select_option('lesson')
    page.locator('#booking-custody-form button[type="submit"]').click()
    page.wait_for_function("window.__rpcCalls.some(x => x.name === 'equipa_checkout_booking_with_context')")
    booking=page.evaluate("window.__rpcCalls.find(x => x.name === 'equipa_checkout_booking_with_context').params")
    assert booking['p_reservation_id']==42 and booking['p_holder_mode']=='self' and booking['p_purpose']=='lesson',booking
    assert not errors,errors
    print(f'PASS {width}x{height}: lista, pessoa + motivo, detalhes, modal e responsavel alternativo; errors=0')
    page.close()
  browser.close()
