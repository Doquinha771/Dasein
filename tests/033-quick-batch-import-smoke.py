"""Offline smoke with fake Supabase: never writes to production."""
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
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in (320,390,1280):
  page=browser.new_page(viewport={'width':width,'height':850})
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*.supabase.co/**',lambda r:r.fulfill(status=200,content_type='application/json',body='{"status":"ok"}') if urlparse(r.request.url).path=='/auth/v1/health' else r.abort())
  page.set_content(html,wait_until='domcontentloaded')
  page.locator('#login-form').wait_for(timeout=8000)
  page.evaluate('''() => {
    state.profile={id:'00000000-0000-4000-8000-000000000001',role:'admin',full_name:'Admin',is_active:true};
    window.__calls=[];window.__failSecond=false;window.__id=0;
    Object.defineProperty(window.crypto,'randomUUID',{configurable:true,value:()=>`00000000-0000-4000-8000-${String(++window.__id).padStart(12,'0')}`});
    supabase.rpc=async(name,args)=>{
      window.__calls.push({name,args});
      if(window.__failSecond && window.__calls.filter(x=>x.name==='equipa_register_equipment_batch').length===2){
        window.__failSecond=false;return {data:null,error:{message:'Network error'}};
      }
      if(name==='equipa_quick_register_sequential'){
        return {data:Array.from({length:args.p_quantity},(_,i)=>({id:'e'+i,qr_token:'qr'+i,code:args.p_prefix+String(Number(args.p_start)+i).padStart(args.p_start.length,'0')})),error:null};
      }
      if(name==='equipa_register_equipment_batch')return {data:args.p_items.map((x,i)=>({id:'id'+i,qr_token:'qr'+i,code:x.code})),error:null};
      throw Error('Unexpected RPC '+name);
    };
  }''')
  page.evaluate("window.EquipaInventory.openHub('batch')")
  form=page.locator('#quick-batch-form')
  form.wait_for()
  assert form.locator('[required]').count()==3
  form.locator('[name=prefix]').fill('NOTE-')
  form.locator('[name=start]').fill('001')
  form.locator('[name=quantity]').fill('200')
  form.locator('[name=model]').fill('Positivo Motion')
  assert 'NOTE-001 até NOTE-200' in page.locator('#quick-batch-preview').inner_text()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'batch overflow {width}'
  page.locator('#quick-batch-submit').click()
  page.locator('#quick-batch-result').wait_for(state='visible')
  calls=page.evaluate('window.__calls')
  assert len(calls)==1 and calls[0]['name']=='equipa_quick_register_sequential' and calls[0]['args']['p_quantity']==200,calls
  page.locator('#quick-batch-next').click()
  assert form.locator('[name=start]').input_value()=='201'
  form.locator('[name=quantity]').fill('2')
  form.locator('[name=serial_numbers]').fill('SERIE-A\nSERIE-B\n')
  assert 'Séries individuais incluídas' in page.locator('#quick-batch-preview').inner_text()
  page.locator('#quick-batch-submit').click()
  page.locator('#quick-batch-result').wait_for(state='visible')
  call=page.evaluate('window.__calls.at(-1)')
  assert call['name']=='equipa_register_equipment_batch',call
  assert [x['serial_number'] for x in call['args']['p_items']]==['SERIE-A','SERIE-B']
  assert [x['code'] for x in call['args']['p_items']]==['NOTE-201','NOTE-202']
  page.locator('#quick-batch-next').click()
  assert not form.locator('[name=serial_numbers]').input_value(), 'séries de lote antigo não devem ser reutilizadas'
  form.locator('[name=serial_numbers]').fill('IGUAL\nIGUAL')
  assert page.locator('#quick-batch-submit').is_disabled(), 'séries repetidas devem ser rejeitadas'
  page.locator('.modal-close-control').click()
  page.evaluate('window.__calls=[];window.__failSecond=true')
  page.evaluate("window.EquipaInventory.openHub('import')")
  ip=page.locator('#quick-import-form')
  ip.wait_for()
  assert ip.locator('[required]').count()==1
  ip.locator('[name=model]').fill('Positivo Motion')
  csv='Numero\n'+'\n'.join('PC-'+str(i).zfill(4) for i in range(1,411))+'\n'
  page.evaluate('''() => {
     window.XLSX={read:(buffer)=>({SheetNames:['Sheet1'],Sheets:{Sheet1:new TextDecoder().decode(buffer)}}),utils:{sheet_to_json:(sheet)=>sheet.trim().split('\\n').slice(1).map(code=>({Numero:code}))}};
  }''')
  ip.locator('[name=file]').set_input_files({'name':'inventario.csv','mimeType':'text/csv','buffer':csv.encode()})
  page.locator('#quick-import-preview strong').wait_for()
  assert '410' in page.locator('#quick-import-preview').inner_text()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'import overflow {width}'
  page.locator('#quick-import-submit').click()
  page.locator('#quick-import-error').wait_for(state='visible',timeout=6000)
  assert '200 de 410 confirmados' in page.locator('#quick-import-error').inner_text()
  first=page.evaluate('window.__calls')
  assert [len(x['args']['p_items']) for x in first]==[200,200],[len(x['args']['p_items']) for x in first]
  page.locator('#quick-import-submit').click()
  page.locator('#quick-import-inventory').wait_for(timeout=6000)
  calls=page.evaluate('window.__calls')
  assert [len(x['args']['p_items']) for x in calls]==[200,200,200,10], [len(x['args']['p_items']) for x in calls]
  assert calls[1]['args']['p_action_id']==calls[2]['args']['p_action_id'], 'retry has to reuse idempotency key'
  assert calls[0]['args']['p_action_id']!=calls[1]['args']['p_action_id']
  page.locator('.modal-close-control').click()
  page.evaluate('''() => openEquipmentForm({id:'00000000-0000-4000-8000-000000000005',code:'NOTE-005',model:'Positivo Motion',brand:'Positivo',status:'available',is_active:true})''')
  edit=page.locator('#equipment-form')
  edit.wait_for()
  assert edit.locator('[required]').count()==2
  assert not page.locator('.equipment-edit-optional').evaluate('(el)=>el.open')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'edit overflow {width}'
  page.locator('.equipment-edit-optional summary').click()
  assert page.locator('.equipment-edit-optional').evaluate('(el)=>el.open')
  page.locator('.modal-close-control').click()
  assert not errors,errors
  print(f'PASS {width}px: lote 200 em uma RPC, sequência automática, importação 410 em 3 blocos, falha parcial+retomada, edição compacta, sem overflow/erros JS')
  page.close()
 browser.close()
