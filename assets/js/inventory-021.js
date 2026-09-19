/* Equipa 0.2.1 Alpha — inventory intake; browser validates for UX, SQL owns the commit. */
(() => {
  'use strict';
  const MAX = 200;
  const FIELDS = ['code','label','asset_tag','school_group','location_text','brand','model','serial_number','processor','ram_gb','storage_gb','operating_system','notes'];
  const EDITABLE = ['code','label','asset_tag','location_text','brand','model','serial_number','processor','ram_gb','storage_gb','operating_system'];
  const $ = (s,root=document) => root.querySelector(s);
  const escape = v => esc(v == null ? '' : String(v));
  const clean = v => String(v ?? '').trim();
  const norm = v => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const numeric = (v, min, max) => v === '' || v == null ? null : Number.isInteger(Number(v)) && Number(v)>=min && Number(v)<=max ? Number(v) : NaN;
  const groupOptions = () => `<option value="">Selecionar grupo</option>${schoolGroupOptions()}`;
  const registerError = error => {
    const raw = String(error?.message || error || 'Erro desconhecido');
    if (/EQUIPA_EQUIPMENT_DUPLICATE|duplicate key|23505/i.test(raw)) return 'Já existe um equipamento com este código, patrimônio ou número de série. Revise a prévia e tente novamente. Nenhum registro deste lote foi criado.';
    if (/EQUIPA_DUPLICATE_IN_BATCH/.test(raw)) return 'O lote possui códigos, patrimônios ou números de série repetidos. Corrija a prévia.';
    if (/EQUIPA_INVALID_ROW_(\d+)/.test(raw)) return `A linha ${raw.match(/EQUIPA_INVALID_ROW_(\d+)/)[1]} contém um campo inválido. Revise o cadastro.`;
    if (/EQUIPA_BATCH_ACTION_CONFLICT/.test(raw)) return 'A confirmação foi alterada após o envio. Gere uma nova prévia e confirme novamente.';
    if (/EQUIPA_MODEL_NOT_FOUND/.test(raw)) return 'O modelo escolhido não está mais disponível. Selecione outro modelo.';
    return errText(error);
  };
  async function loadModels() {
    const {data,error} = await supabase.from('equipment_models').select('id,name,manufacturer,school_group,processor,ram_gb,storage_gb,operating_system').order('name').limit(300);
    if (error) throw error;
    return data || [];
  }
  function modelControl(models) {
    return `<label>Modelo cadastrado (opcional)<select name="template_id" data-model-picker><option value="">Informar modelo manualmente</option>${models.map(m=>`<option value="${m.id}">${escape(m.name)} · ${escape(m.manufacturer)}</option>`).join('')}</select></label>`;
  }
  function editableFields(models, mode) {
    const batch = mode === 'batch';
    return `<form id="eq-intake-form" class="form-grid">
      ${batch ? `<label>Prefixo do número (opcional)<input name="prefix" maxlength="30" placeholder="Ex.: NOTE-"></label><label>Número inicial<input name="start" inputmode="numeric" pattern="[0-9]+" required maxlength="8" placeholder="001"></label><label>Número final<input name="end" inputmode="numeric" pattern="[0-9]+" required maxlength="8" placeholder="030"></label><label>Quantidade gerada<input name="quantity" readonly value="0"><small class="eq-help">Intervalo inclusivo, de 1 a 200 equipamentos.</small></label>` : `<label>Código / número<input name="code" required maxlength="80" placeholder="Ex.: NOTE-001"></label><label>Patrimônio (opcional)<input name="asset_tag" maxlength="80"></label>`}
      ${modelControl(models)}
      <label>Grupo<select name="school_group">${groupOptions()}</select></label>
      <label>Fabricante<input name="brand" required maxlength="100" placeholder="Ex.: Lenovo"></label>
      <label>Modelo<input name="model" required maxlength="120" placeholder="Ex.: ThinkPad L14"></label>
      <label>Processador<input name="processor" maxlength="120" placeholder="Ex.: Intel Core i5"></label>
      <label>RAM (GB)<input name="ram_gb" type="number" min="1" max="1024" step="1" placeholder="8"></label>
      <label>Armazenamento (GB)<input name="storage_gb" type="number" min="1" max="1048576" step="1" placeholder="128"></label>
      <label>Sistema operacional<input name="operating_system" maxlength="120" placeholder="ChromeOS, Windows..."></label>
      <label>Localização<input name="location_text" maxlength="160" placeholder="Laboratório / sala / armário"></label>
      <label>Nome personalizado (opcional)<input name="label" maxlength="120" placeholder="${batch?'Ex.: Computador do laboratório':'Ex.: Chromebook azul'}"></label>
      ${batch?'':`<label>Número de série (opcional)<input name="serial_number" maxlength="120"></label>`}
      <label class="span-2">Observações<input name="notes" maxlength="1200" placeholder="Somente informação operacional"></label>
      <div class="modal-actions span-2"><button type="submit" class="button primary">Gerar prévia</button></div>
    </form>`;
  }
  function validateRows(rows,existing = new Set()) {
    const codes = new Set(), tags = new Set(), serials = new Set();
    return rows.map((row,index) => {
      const problems=[];
      const code=clean(row.code); const model=clean(row.model); const brand=clean(row.brand);
      if (!code || code.length>80) problems.push('Código obrigatório (até 80 caracteres)');
      if (code && existing.has(norm(code))) problems.push('Código já cadastrado no inventário');
      if (!model || model.length>120) problems.push('Modelo obrigatório');
      if (!brand || brand.length>100) problems.push('Fabricante obrigatório');
      for (const [name,max] of [['asset_tag',80],['serial_number',120],['label',120],['location_text',160],['processor',120],['operating_system',120],['notes',1200]]) {
        if (clean(row[name]).length>max) problems.push(`${name}: máximo ${max} caracteres`);
      }
      if (row.school_group && !['chromebook','positivo_novo','positivo_tecnico','positivo_antigo','thinkpad_lenovo','tablet','outro'].includes(row.school_group)) problems.push('Grupo inválido');
      if (Number.isNaN(numeric(row.ram_gb,1,1024))) problems.push('RAM inválida');
      if (Number.isNaN(numeric(row.storage_gb,1,1048576))) problems.push('Armazenamento inválido');
      for (const [name,set] of [['code',codes],['asset_tag',tags],['serial_number',serials]]) {
        const value=norm(row[name]);
        if (!value) continue;
        if (set.has(value)) problems.push(`${name==='code'?'Código':name==='asset_tag'?'Patrimônio':'Série'} repetido na prévia`);
        set.add(value);
      }
      if (row.source_status && row.source_status !== 'available') problems.push('Importação: cadastre como disponível e registre movimentação/manutenção separadamente');
      return {line:row.line || index+1,problems};
    });
  }
  function modelSelection(form,models) {
    const picker=$('[data-model-picker]',form);
    const fill=()=>{
      const tpl=models.find(m=>String(m.id)===picker.value);
      for (const k of ['brand','model','school_group','processor','ram_gb','storage_gb','operating_system']) {
        const field=form.elements.namedItem(k); if (!field) continue;
        if (tpl) field.value = tpl[({brand:'manufacturer',model:'name'})[k]||k] ?? '';
        field.readOnly = !!tpl && k !== 'school_group';
        if (k==='school_group') field.disabled=!!tpl;
      }
    };
    picker.addEventListener('change',fill);
  }
  function formRows(form,mode) {
    const f=new FormData(form);
    const shared={
      brand:clean(f.get('brand')),model:clean(f.get('model')),
      school_group:clean(f.get('school_group')) || null,
      processor:clean(f.get('processor'))||null,
      ram_gb:clean(f.get('ram_gb'))||null,storage_gb:clean(f.get('storage_gb'))||null,
      operating_system:clean(f.get('operating_system'))||null,
      location_text:clean(f.get('location_text'))||null,
      notes:clean(f.get('notes'))||null,
      template_id:clean(f.get('template_id')) || null
    };
    if (mode==='individual') return [{...shared,code:clean(f.get('code')),asset_tag:clean(f.get('asset_tag'))||null,serial_number:clean(f.get('serial_number'))||null,label:clean(f.get('label'))||null}];
    const startString=clean(f.get('start')),endString=clean(f.get('end'));
    const start=Number(startString),end=Number(endString),prefix=clean(f.get('prefix'));
    if (!/^\d{1,8}$/.test(startString)||!/^\d{1,8}$/.test(endString)||start>end||end-start+1>MAX||end-start+1<1||prefix.length>30) throw new Error('Use um intervalo de 1 a 200 números válidos. O número final deve ser maior ou igual ao inicial.');
    const digits=Math.max(startString.length,endString.length);
    return Array.from({length:end-start+1},(_,i)=>{
      const code=`${prefix}${String(start+i).padStart(digits,'0')}`;
      return {...shared,code,label:clean(f.get('label')) ? `${clean(f.get('label'))} ${code}`.slice(0,120) : null,asset_tag:null,serial_number:null};
    });
  }
  function previewTable(modal,ctx) {
    const host=$('#eq-intake-workspace',modal);
    ctx.existing ||= new Set();
    const errors=validateRows(ctx.rows,ctx.existing);const invalid=errors.filter(x=>x.problems.length).length;
    const columns=EDITABLE;
    host.innerHTML=`<div class="eq-intake-review"><div class="eq-intake-review-head"><strong>Prévia: ${ctx.rows.length} equipamento(s)</strong><span class="muted">${invalid?`${invalid} linha(s) para corrigir`:'Revise os códigos antes de confirmar.'}</span></div>
      <div class="eq-intake-table-wrap"><table class="eq-intake-table"><thead><tr><th>#</th>${columns.map(k=>`<th>${({code:'Número',label:'Nome',asset_tag:'Patrimônio',location_text:'Localização',brand:'Fabricante',model:'Modelo',serial_number:'Série',processor:'Processador',ram_gb:'RAM GB',storage_gb:'Armazenamento GB',operating_system:'Sistema'})[k]}</th>`).join('')}<th>Validação</th></tr></thead><tbody>
      ${ctx.rows.map((r,i)=>`<tr class="${errors[i].problems.length?'eq-intake-invalid':''}"><td>${escape(r.line || i+1)}</td>${columns.map(k=>`<td><input data-row="${i}" data-field="${k}" aria-label="${k} da linha ${i+1}" maxlength="${({code:80,label:120,asset_tag:80,location_text:160,brand:100,model:120,serial_number:120,processor:120,ram_gb:5,storage_gb:8,operating_system:120})[k]}" value="${escape(r[k])}" ${r.template_id&&['brand','model','processor','ram_gb','storage_gb','operating_system'].includes(k)?'readonly title="Troque o modelo no formulário para editar"':''}></td>`).join('')}<td data-valid="${i}">${escape(errors[i].problems.join('; ') || 'OK')}</td></tr>`).join('')}</tbody></table></div>
      <div class="eq-intake-actions"><button type="button" class="button ghost" id="eq-back">Recomeçar prévia</button><button type="button" class="button primary" id="eq-confirm" ${invalid?'disabled':''}>Confirmar ${ctx.rows.length} cadastro(s)</button></div></div>`;
    host.oninput=e=>{
      const field=e.target.closest('[data-row][data-field]');if (!field) return;
      ctx.rows[Number(field.dataset.row)][field.dataset.field]=field.value;
      ctx.actionId=null;
      const checks=validateRows(ctx.rows,ctx.existing);const errorsCount=checks.filter(x=>x.problems.length).length;
      checks.forEach((row,i)=>{const el=$(`[data-valid="${i}"]`,host); if (el) {el.textContent=row.problems.join('; ')||'OK';el.closest('tr')?.classList.toggle('eq-intake-invalid',!!row.problems.length);}});
      const confirm=$('#eq-confirm',host); if(confirm) {confirm.disabled=errorsCount>0;confirm.textContent=errorsCount?`${errorsCount} linha(s) com erro`:`Confirmar ${ctx.rows.length} cadastro(s)`;}
    };
    $('#eq-back',host).addEventListener('click',()=>renderMode(modal,ctx,ctx.mode));
    $('#eq-confirm',host).addEventListener('click',()=>commit(modal,ctx));
    let checkTimer;
    const checkExisting=async()=>{
      const codes=ctx.rows.map(r=>clean(r.code)).filter(Boolean);
      const confirm=$('#eq-confirm',host);
      if(!confirm||!codes.length)return;
      confirm.disabled=true;confirm.textContent='Verificando inventário…';
      const {data,error}=await supabase.rpc('equipa_existing_codes',{p_codes:codes});
      if(!host.isConnected)return;
      if(error){confirm.textContent='Não foi possível verificar duplicados';notify(registerError(error),'error');return;}
      ctx.existing=new Set((data||[]).map(norm));
      const checks=validateRows(ctx.rows,ctx.existing);
      checks.forEach((row,i)=>{const el=$(`[data-valid="${i}"]`,host);if(el){el.textContent=row.problems.join('; ')||'OK';el.closest('tr')?.classList.toggle('eq-intake-invalid',!!row.problems.length);}});
      const invalid=checks.filter(x=>x.problems.length).length;
      confirm.disabled=invalid>0;confirm.textContent=invalid?`${invalid} linha(s) com erro`:`Confirmar ${ctx.rows.length} cadastro(s)`;
    };
    host.addEventListener('input',event=>{
      if(!event.target.closest('[data-row][data-field]'))return;
      clearTimeout(checkTimer);checkTimer=setTimeout(checkExisting,300);
    },{once:false});
    checkExisting();
  }
  async function commit(modal,ctx) {
    const b=$('#eq-confirm',modal);
    if (validateRows(ctx.rows,ctx.existing).some(x=>x.problems.length)) return notify('Corrija todas as linhas antes de confirmar.','warning');
    // Stable request id during retry; new id after editing the preview.
    ctx.actionId ||= crypto.randomUUID();
    b.disabled=true;b.textContent='Registrando no banco…';
    try {
      const payload=ctx.rows.map(row=>Object.fromEntries(FIELDS.map(k=>[k,row[k] ?? null]).concat([['template_id',row.template_id || null]])));
      const {data,error}=await supabase.rpc('equipa_register_equipment_batch',{p_items:payload,p_action_id:ctx.actionId});
      if(error) throw error;
      if(!Array.isArray(data) || data.length!==ctx.rows.length) throw new Error('A confirmação retornou um resultado inesperado. Consulte o inventário antes de tentar novamente.');
      ctx.created=data;
      $('#eq-intake-workspace',modal).innerHTML=`<div class="eq-intake-success"><strong>${data.length} equipamento(s) registrado(s).</strong><p>O PostgreSQL confirmou todos os cadastros. Cada equipamento possui seu próprio UUID e QR permanente.</p><div class="eq-intake-actions"><button class="button ghost" id="eq-show-inventory">Abrir inventário</button><button class="button primary" id="eq-labels-created">Baixar etiquetas em PDF</button></div></div>`;
      $('#eq-labels-created',modal).addEventListener('click',()=>downloadLabels(data,'Equipa-etiquetas-novas'));
      $('#eq-show-inventory',modal).addEventListener('click',()=>{modal.remove();renderEquipment();});
      notify(`${data.length} equipamento(s) registrados no Supabase.`, 'success');
    } catch(error) {b.disabled=false;b.textContent='Tentar novamente';notify(registerError(error),'error');}
  }
  async function importFile(file) {
    if(!file) throw new Error('Selecione um arquivo.');
    if(file.size>config.importMaxBytes) throw new Error('Arquivo maior que o limite de 5 MB.');
    const suffix=file.name.toLowerCase().split('.').pop();
    let raw;
    if(suffix==='docx') {
      await ensureJSZipLib();const archive=await window.JSZip.loadAsync(await file.arrayBuffer());
      const content=archive.file('word/document.xml');if(!content) throw new Error('O arquivo não contém uma tabela Word válida.');
      const xml=new DOMParser().parseFromString(await content.async('string'),'application/xml');
      if(xml.querySelector('parsererror')) throw new Error('A tabela Word está malformada.');
      const tables=[...xml.getElementsByTagNameNS('*','tbl')];
      raw=[];
      for(const table of tables) {
        const trs=[...table.children].filter(n=>n.localName==='tr');
        const matrix=trs.map(tr=>[...tr.children].filter(n=>n.localName==='tc').map(cell=>[...cell.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join(' ').trim()));
        if(matrix.length<2)continue;
        const keys=matrix[0].map(v=>v.trim());
        if(!keys.some(k=>['numero','codigo','code'].includes(normalizeHeader(k)))) continue;
        for(const row of matrix.slice(1)) {
          if(!row.some(Boolean))continue;
          raw.push(Object.fromEntries(keys.map((key,i)=>[key,row[i]||''])));
        }
      }
      if(!raw.length) throw new Error('Nenhuma tabela estruturada de inventário foi encontrada no Word. Use uma tabela com cabeçalhos como Número, Modelo e Marca.');
    } else if(['csv','xlsx'].includes(suffix)) {
      await ensureXLSXLib();
      const wb=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,raw:false});
      const sheet=wb.Sheets[wb.SheetNames[0]];
      raw=window.XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
    } else throw new Error('Formato não aceito. Use CSV, XLSX ou DOCX com tabela.');
    if(!raw.length||raw.length>MAX) throw new Error('O arquivo precisa conter de 1 a 200 equipamentos por confirmação. Separe arquivos maiores por laboratório.');
    const parsed=mapImportRows(raw);
    return parsed.map((row,i)=>({
      ...row,
      processor:fieldFromRow(raw[i],['processador','processor','cpu']) || null,
      ram_gb:fieldFromRow(raw[i],['ram','ram_gb','memoria','memoria_ram']) || null,
      storage_gb:fieldFromRow(raw[i],['armazenamento','storage','storage_gb','disco']) || null,
      operating_system:fieldFromRow(raw[i],['sistema_operacional','sistema','so','operating_system']) || null,
      source_status:row.status,errors:undefined
    }));
  }
  function renderMode(modal,ctx,mode) {
    ctx.mode=mode;ctx.rows=[];ctx.existing=new Set();ctx.actionId=null;
    modal.querySelectorAll('[data-intake-mode]').forEach(x=>x.classList.toggle('active',x.dataset.intakeMode===mode));
    const host=$('#eq-intake-workspace',modal);
    const intros={
      individual:{title:'Cadastro individual',desc:'Preencha as informações do equipamento. Campos marcados com * são obrigatórios.'},
      batch:{title:'Cadastro em lote',desc:'Cadastre um laboratório inteiro em poucos minutos com geração sequencial dos números.'},
      import:{title:'Importar arquivo',desc:'Envie CSV, XLSX ou DOCX com tabela. O arquivo é validado antes da confirmação.'}
    };
    const header=`<div class="ref-mode-banner"><span class="report-mini-icon">${uiIcon(mode==='import'?'download':mode==='batch'?'stack':'equipment',20)}</span><div><strong>${intros[mode].title}</strong><p>${intros[mode].desc}</p></div></div>`;
    if(mode==='import') {
      host.innerHTML=header+`<div class="eq-import-start"><p>CSV, XLSX ou DOCX com tabelas. O arquivo é processado no navegador e descartado após a prévia. Até ${MAX} linhas por confirmação.</p><label>Arquivo de inventário<input id="eq-intake-file" type="file" accept=".csv,.xlsx,.docx"></label><p class="muted">Cabeçalhos esperados: Número/Código, Modelo, Marca, Localização, Patrimônio e outros campos opcionais. A importação não cria cadastros parciais.</p></div>`;
      $('#eq-intake-file',host).addEventListener('change',async e=>{
        const input=e.currentTarget; input.disabled=true;
        try {ctx.rows=await importFile(input.files?.[0]);previewTable(modal,ctx);}
        catch(error){input.disabled=false;notify(error.message||registerError(error),'error');}
      });
      return;
    }
    host.innerHTML=header+editableFields(ctx.models,mode);
    const form=$('#eq-intake-form',host);
    modelSelection(form,ctx.models);
    if(mode==='batch') {
      const update=()=>{const a=clean(form.elements.start.value),b=clean(form.elements.end.value);
        form.elements.quantity.value=/^\d+$/.test(a)&&/^\d+$/.test(b)&&Number(b)>=Number(a)?String(Number(b)-Number(a)+1):'0';};
      form.elements.start.addEventListener('input',update);
      form.elements.end.addEventListener('input',update);
    }
    form.addEventListener('submit',event=>{
      event.preventDefault();
      try {ctx.rows=formRows(form,mode);ctx.actionId=null;previewTable(modal,ctx);}
      catch(error){notify(error.message,'warning');}
    });
  }
  async function openHub(initial='individual') {
    if(state.profile?.role!=='admin') return notify('Apenas administradores podem cadastrar equipamentos.','error');
    const modal=makeModal(`<div class="ref-modal-shell ref-register-modal"><aside class="ref-modal-nav"><div class="ref-modal-nav-head"><span class="eyebrow">Inventário · Cadastro</span><h2>Cadastrar equipamentos</h2><p>Adicione um novo equipamento ao inventário da escola.</p></div><div class="ref-modal-nav-list"><button class="ref-modal-nav-item" type="button" data-intake-mode="individual"><span>${uiIcon('equipment',18)}</span><div><strong>Individual</strong><small>Cadastrar um único equipamento</small></div></button><button class="ref-modal-nav-item" type="button" data-intake-mode="batch"><span>${uiIcon('grid',18)}</span><div><strong>Em lote</strong><small>Cadastrar vários equipamentos</small></div></button><button class="ref-modal-nav-item" type="button" data-intake-mode="import"><span>${uiIcon('upload',18)}</span><div><strong>Importar arquivo</strong><small>Excel, CSV ou planilha</small></div></button><button class="ref-modal-nav-item ghost-alt" type="button" id="eq-manage-models"><span>${uiIcon('admin',18)}</span><div><strong>Modelos técnicos</strong><small>Usar modelos pré-cadastrados</small></div></button></div><div class="ref-modal-tip"><strong>Dica</strong><p>Preencha apenas as informações que souber. Os campos opcionais podem ser completados depois.</p></div></aside><div class="ref-modal-content"><div class="ref-modal-top"><div><span class="eyebrow">Inventário · Cadastro</span><h2>Cadastrar equipamentos</h2><p>Adicione um novo equipamento ao inventário da escola.</p></div><button class="button ghost" data-close type="button">Fechar</button></div><div id="eq-intake-workspace" class="ref-register-workspace"><p class="muted">Carregando modelos…</p></div></div></div>`,true);
    const ctx={models:[],mode:initial,rows:[],actionId:null};
    try{ctx.models=await loadModels();}catch(error){notify(registerError(error),'error');modal.remove();return;}
    modal.querySelectorAll('[data-intake-mode]').forEach(b=>b.addEventListener('click',()=>renderMode(modal,ctx,b.dataset.intakeMode)));
    $('#eq-manage-models',modal).addEventListener('click',()=>openModelManager(modal,ctx));
    renderMode(modal,ctx,initial);
  }
  function openModelManager(parent,ctx) {
    const modal=makeModal(`<div class="panel-head"><div><span class="eyebrow">Catálogo técnico</span><h2>Salvar modelo reutilizável</h2></div><button class="icon-button" data-close aria-label="Fechar">×</button></div><div class="modal-body"><form id="eq-model-form" class="form-grid"><label>Nome/modelo<input name="name" maxlength="120" required placeholder="ThinkPad L14"></label><label>Fabricante<input name="manufacturer" maxlength="100" required placeholder="Lenovo"></label><label>Grupo<select name="school_group">${groupOptions()}</select></label><label>Processador<input name="processor" maxlength="120"></label><label>RAM (GB)<input name="ram_gb" type="number" min="1" max="1024" step="1"></label><label>Armazenamento (GB)<input name="storage_gb" type="number" min="1" max="1048576" step="1"></label><label>Sistema operacional<input name="operating_system" maxlength="120"></label><div class="modal-actions span-2"><button class="button primary" type="submit">Salvar modelo</button></div></form><div id="eq-saved-models" class="eq-saved-models"></div></div>`,true);
    const refresh=()=>{$('#eq-saved-models',modal).innerHTML=`<strong>Modelos cadastrados</strong><div class="eq-model-list">${ctx.models.map(m=>`<div><strong>${escape(m.name)}</strong><small>${escape(m.manufacturer)} · ${escape(schoolGroupLabel(m.school_group))} · ${m.ram_gb ?? '—'} GB RAM · ${m.storage_gb??'—'} GB armazenamento</small></div>`).join('')||'<p>Nenhum modelo cadastrado.</p>'}</div>`;};
    refresh();
    $('#eq-model-form',modal).addEventListener('submit',async event=>{
      event.preventDefault();const f=new FormData(event.currentTarget);
      const payload={name:clean(f.get('name')),manufacturer:clean(f.get('manufacturer')),school_group:clean(f.get('school_group'))||null,processor:clean(f.get('processor'))||null,ram_gb:numeric(clean(f.get('ram_gb')),1,1024),storage_gb:numeric(clean(f.get('storage_gb')),1,1048576),operating_system:clean(f.get('operating_system'))||null,created_by:state.profile.id};
      if(Number.isNaN(payload.ram_gb)||Number.isNaN(payload.storage_gb))return notify('RAM ou armazenamento inválidos.','warning');
      const button=event.currentTarget.querySelector('[type="submit"]');button.disabled=true;
      try {const {error}=await supabase.from('equipment_models').insert(payload);if(error) throw error;ctx.models=await loadModels();refresh();event.currentTarget.reset();notify('Modelo técnico salvo.','success');
       if(ctx.mode!=='import'&&!ctx.rows.length) renderMode(parent,ctx,ctx.mode);
      } catch(error){notify(registerError(error),'error');}finally{button.disabled=false;}
    });
  }
  const ensureJsPDF = () => loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js','jspdf');
  async function qrDataURL(url) {
    await ensureQRCodeLib();
    const el=document.createElement('div');el.style.cssText='position:fixed;left:-10000px;top:0';document.body.append(el);
    try {
      new window.QRCode(el,{text:url,width:144,height:144,correctLevel:window.QRCode.CorrectLevel.M});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const canvas=el.querySelector('canvas');const img=el.querySelector('img');
      if(canvas) return canvas.toDataURL('image/png');
      if(img?.src) return img.src;
      throw new Error('Não foi possível gerar o QR Code.');
    } finally {el.remove();}
  }
  async function makeLabelsDocument(items) {
    await ensureJsPDF(); await ensureQRCodeLib();
    const doc=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
    const W=63,H=42,startX=10,startY=12,cols=3,rows=6,perPage=cols*rows;
    for(let i=0;i<items.length;i++) {
      if(i && i%perPage===0) doc.addPage();
      const p=i%perPage,x=startX+(p%cols)*W,y=startY+Math.floor(p/cols)*H;
      const item=items[i];const code=clean(item.code).slice(0,40);
      doc.setDrawColor(208,214,221);doc.roundedRect(x,y,W-2,H-2,1.5,1.5);
      doc.addImage(await qrDataURL(qrUrl(item.qr_token)),'PNG',x+3,y+5,29,29);
      doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('EQUIPA',x+35,y+10);
      doc.setFontSize(8);doc.text(code.slice(0,14),x+35,y+17,{maxWidth:23});
      doc.setFont('helvetica','normal');doc.setFontSize(6);doc.text('Patrimonio escolar',x+35,y+22,{maxWidth:23});
      if(i%12===0) await new Promise(resolve=>setTimeout(resolve,0));
    }
    return doc;
  }
  async function downloadLabels(items,filename='Equipa-etiquetas') {
    if(!items?.length) return notify('Selecione equipamentos para gerar as etiquetas.','warning');
    if(items.length>2000) return notify('Selecione até 2.000 etiquetas por PDF; para o inventário inteiro utilize o ZIP de PDFs.','warning');
    try {
      const doc=await makeLabelsDocument(items);
      doc.save(`${safeFileName(filename)}.pdf`);
      notify(`${items.length} etiqueta(s) gerada(s) em PDF.`,'success');
    }catch(error){notify(registerError(error),'error');}
  }
  async function downloadWholeInventory(location,count,button) {
    if(count>20000) return notify('Inventário muito extenso. Gere por localização para não sobrecarregar o celular.','warning');
    button.disabled=true;
    try {
      await ensureJSZipLib();
      const zip=new window.JSZip();
      for(let from=0;from<count;from+=1000) {
        let query=supabase.from('equipments').select('id,code,qr_token,location_text').eq('is_active',true).order('code').range(from,Math.min(from+999,count-1));
        if(location)query=query.ilike('location_text',location);
        const {data,error}=await query;if(error)throw error;
        if(!data?.length)break;
        button.textContent=`Gerando PDF ${Math.floor(from/1000)+1}…`;
        const doc=await makeLabelsDocument(data);
        zip.file(`etiquetas-${String(Math.floor(from/1000)+1).padStart(3,'0')}.pdf`,doc.output('blob'));
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      button.textContent='Compactando etiquetas…';
      const blob=await zip.generateAsync({type:'blob',compression:'STORE'});
      downloadBlob(blob,`Equipa-etiquetas-${safeFileName(location||'inventario')}.zip`);
      notify(`${count} etiquetas divididas em PDFs para impressão.`,'success');
    }catch(error){notify(registerError(error),'error');}
    finally{button.disabled=false;button.textContent='Baixar inventário completo (ZIP de PDFs)';}
  }
  async function chooseLabels() {
    if(state.profile?.role!=='admin')return;
    const modal=makeModal(`<div class="panel-head"><div><span class="eyebrow">Etiquetas permanentes</span><h2>Gerar QR Codes em PDF</h2></div><button class="icon-button" data-close aria-label="Fechar">×</button></div><div class="modal-body"><p>Escolha uma sala ou laboratório para imprimir as etiquetas. Se não informar localização, será considerado o inventário ativo inteiro. Até 2.000 etiquetas por PDF.</p><label>Localização (opcional)<input id="eq-label-location" maxlength="160" placeholder="Ex.: Laboratório 1"></label><div class="modal-actions"><button class="button primary" id="eq-label-load">Consultar equipamentos</button></div><div id="eq-label-result"></div></div>`,true);
    $('#eq-label-load',modal).addEventListener('click',async()=>{
      const location=clean($('#eq-label-location',modal).value);
      const result=$('#eq-label-result',modal);result.textContent='Consultando inventário…';
      try{
        let query=supabase.from('equipments').select('id,code,qr_token,location_text',{count:'exact'}).eq('is_active',true).order('code').limit(2001);
        if(location) query=query.ilike('location_text',location);
        const {data,error,count}=await query;if(error)throw error;
        if(count>2000){
          result.innerHTML=`<p>Há ${count} equipamentos neste inventário. As etiquetas serão organizadas em vários PDFs dentro de um único ZIP, para não travar o navegador.</p><div class="modal-actions"><button class="button primary" id="eq-label-full">Baixar inventário completo (ZIP de PDFs)</button></div>`;
          $('#eq-label-full',result).addEventListener('click',event=>downloadWholeInventory(location,count,event.currentTarget));
          return;
        }
        const rows=data||[];
        result.innerHTML=`<p>${rows.length} equipamento(s) encontrado(s). Desmarque aqueles que não deseja imprimir.</p><div class="eq-label-list">${rows.map((r,i)=>`<label><input data-label-row="${i}" type="checkbox" checked> ${escape(r.code)} ${r.location_text?`· ${escape(r.location_text)}`:''}</label>`).join('')}</div><div class="modal-actions"><button class="button primary" id="eq-label-export">Baixar PDF dos selecionados</button></div>`;
        $('#eq-label-export',result).addEventListener('click',()=>{
          const chosen=rows.filter((r,i)=>$(`[data-label-row="${i}"]`,result)?.checked);
          downloadLabels(chosen,`Equipa-etiquetas-${location||'inventario'}`);
        });
      }catch(error){result.textContent=registerError(error);}
    });
  }
  window.EquipaInventory={openHub,openModelManager,chooseLabels,downloadLabels,validateRows,importFile,formRows};
})();
