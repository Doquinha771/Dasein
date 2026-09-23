const { supabase, config } = window.EquipaSupabase || {};
if (!supabase || !config) throw new Error("Cliente Supabase não inicializado.");

const app = document.querySelector("#app");
const EQUIPA_THEME_KEY = "equipa-visual-theme";
try { document.documentElement.dataset.theme = localStorage.getItem(EQUIPA_THEME_KEY) === "dark" ? "dark" : "light"; }
catch { document.documentElement.dataset.theme = "light"; }
function setEquipaTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111c2e" : "#f5f8fd");
  const toggle = qs("#topbar-theme");
  if (toggle) {
    toggle.innerHTML = uiIcon(dark ? "moon" : "sun",21);
    toggle.setAttribute("aria-label", dark ? "Ativar modo claro" : "Ativar modo escuro");
    toggle.title = dark ? "Modo claro" : "Modo escuro";
    toggle.setAttribute("aria-pressed",String(dark));
  }
  try { localStorage.setItem(EQUIPA_THEME_KEY,dark ? "dark" : "light"); } catch {}
}

const state = {
  session: null,
  profile: null,
  view: "dashboard",
  equipmentPage: 0,
  equipmentSearch: "",
  equipmentFilters: { status: "", active: "active", group: "", location:"", model:"" },
  withdrawalsSearch: "",
  withdrawalsStatus: "",
  withdrawalsSort: "priority",
  withdrawalsDue: new Map(),
  maintenanceSearch: "",
  maintenanceStatus: "",
  cartSearch: "",
  cartPage: 0,
  historyFiltersOpen: false,
  historySearch: "",
  auditSearch: "",
  auditAction: "",
  auditEntity: "",
  auditPage: 0,
  adminUserPage: 0,
  adminUserSearch: "",
  pendingScan: null
};

const qs = (s, root = document) => root.querySelector(s);
const qsa = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v = "") => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const uid = () => crypto.randomUUID();
const loadedScripts = new Map();
function loadScriptOnce(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if (loadedScripts.has(src)) return loadedScripts.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(globalName ? window[globalName] : true);
    script.onerror = () => { loadedScripts.delete(src); reject(new Error("Não foi possível carregar um recurso necessário.")); };
    document.head.append(script);
  });
  loadedScripts.set(src, promise);
  return promise;
}
const ensureQRCodeLib = () => loadScriptOnce("https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js", "QRCode");
const ensureXLSXLib = () => loadScriptOnce("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", "XLSX");
const ensureJsQRLib = () => loadScriptOnce("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js", "jsQR");
const ensureJSZipLib = () => loadScriptOnce("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "JSZip");

function dt(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}
function dateOnly(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}
function statusLabel(v) {
  return ({
    available: "Disponível", in_use: "Em uso", maintenance: "Manutenção", unavailable: "Indisponível",
    open: "Em aberto", returned: "Devolvida", cancelled: "Cancelada", confirmed: "Confirmada",
    fulfilled: "Utilizada", expired: "Expirada", resolved: "Resolvida",
    damaged: "Avaria", missing: "Não localizado", pending: "Pendente"
  })[v] ?? v ?? "—";
}
function roleLabel(v) { return ({ student: "Aluno", teacher: "Professor", admin: "Administrador" })[v] ?? v ?? "Usuário"; }
function schoolGroupLabel(v) { return ({chromebook:"Chromebook",positivo_novo:"Positivo novo",positivo_tecnico:"Positivo técnico",positivo_antigo:"Positivo antigo",thinkpad_lenovo:"ThinkPad Lenovo",tablet:"Tablet",outro:"Outro"})[v] ?? v ?? "Não definido"; }
function schoolGroupOptions(selected=""){return [["chromebook","Chromebook"],["positivo_novo","Positivo novo"],["positivo_tecnico","Positivo técnico"],["positivo_antigo","Positivo antigo"],["thinkpad_lenovo","ThinkPad Lenovo"],["tablet","Tablet"],["outro","Outro"]].map(([v,l])=>`<option value="${v}" ${selected===v?"selected":""}>${l}</option>`).join("");}
function maskEmail(v = "") {
  const [name, domain] = String(v).split("@");
  if (!domain) return "—";
  return `${name.slice(0, Math.min(2, name.length))}${"*".repeat(Math.min(5, Math.max(2, name.length - 2)))}@${domain}`;
}
function errText(error) {
  const raw = error?.message || String(error || "Erro inesperado");
  if (/failed to fetch|networkerror|network request failed|tempo limite|timeout|aborterror/i.test(raw))
    return "Sem resposta do servidor. Verifique a conexão e o estado do projeto Supabase; seus dados locais de sessão foram preservados.";
  if (/PGRST202|PGRST204|PGRST205|PGRST200|PGRST106|PGRST116|42703|42P01|42883|schema cache|could not find the function|does not exist/i.test(`${error?.code || ""} ${raw}`))
    return "O site e o banco estão com versões incompatíveis ou faltam permissões/tabelas. A administração deve verificar as migrations e o diagnóstico SQL do pacote.";
  if (/read.only|read only|25006|exceeded.*quota/i.test(`${error?.code || ""} ${raw}`))
    return "O banco está em modo somente leitura ou perto do limite. Verifique a capacidade no painel Supabase; nenhuma informação operacional será apagada.";
  if (/foreign key constraint|violates foreign key|23503/i.test(raw))
    return "Este registro possui histórico relacionado. Desative o equipamento em vez de excluí-lo.";
  if (/EQUIPA_RETURN_BEFORE_DEACTIVATE/.test(raw))
    return "Equipamento em uso. Registre a devolução antes de desativá-lo.";
  if (/EQUIPA_ADMIN_REQUIRED/.test(raw))
    return "Apenas a administração pode executar esta ação.";
  const code = raw.match(/(ALOCA|DASEIN|EQUIPA)_[A-Z0-9_]+/)?.[0];
  const map = {
    ALOCA_NOT_AUTHENTICATED: "Sua sessão expirou.", ALOCA_ADMIN_REQUIRED: "Esta ação exige administrador.",
    ALOCA_PROFILE_NOT_FOUND: "Perfil não encontrado.", ALOCA_CLASS_REQUIRED: "Informe a turma.",
    ALOCA_DESTINATION_REQUIRED: "Informe o destino.", ALOCA_EQUIPMENT_NOT_FOUND: "Equipamento não encontrado.",
    ALOCA_EQUIPMENT_UNAVAILABLE: "Equipamento indisponível.", ALOCA_EQUIPMENT_MAINTENANCE: "Equipamento em manutenção.",
    ALOCA_ALREADY_IN_USE: "Este equipamento já está em uso.", ALOCA_NOT_AVAILABLE: "Este equipamento não está disponível.",
    ALOCA_NOT_IN_USE_OR_FORBIDDEN: "Não há retirada aberta para você devolver este equipamento.",
    ALOCA_BATCH_IN_USE: "O lote contém equipamento em uso.", ALOCA_BATCH_MAINTENANCE: "O lote contém equipamento em manutenção.",
    ALOCA_BATCH_UNAVAILABLE: "O lote contém equipamento indisponível.", ALOCA_BATCH_CONFLICT: "Outro usuário alterou um dos equipamentos ao mesmo tempo.",
    ALOCA_CART_DUPLICATE_NUMBER_OR_EQUIPMENT: "Número do carrinho ou equipamento já está vinculado a outro carrinho.",
    DASEIN_NOT_AUTHENTICATED: "Sua sessão expirou.", DASEIN_ADMIN_REQUIRED: "Esta ação exige administrador.",
    DASEIN_PROFILE_NOT_FOUND: "Perfil não encontrado.", DASEIN_CLASS_REQUIRED: "Informe a turma.",
    DASEIN_DESTINATION_REQUIRED: "Informe o destino.", DASEIN_RESERVATION_TIME_INVALID: "O horário final precisa ser depois do inicial.",
    DASEIN_RESERVATION_PAST: "Não é possível reservar um horário que já passou.", DASEIN_RESERVATION_CONFLICT: "Esse equipamento já possui reserva nesse intervalo.",
    DASEIN_EQUIPMENT_NOT_FOUND: "Equipamento não encontrado.", DASEIN_EQUIPMENT_UNAVAILABLE: "Equipamento indisponível.",
    DASEIN_EQUIPMENT_MAINTENANCE: "Equipamento em manutenção.", DASEIN_RESERVATION_TOO_EARLY: "A retirada só é liberada 30 minutos antes da reserva.",
    DASEIN_RESERVATION_EXPIRED: "O horário dessa reserva já terminou.", DASEIN_RESERVATION_OWNER_REQUIRED: "A retirada desta reserva deve ser feita pelo responsável que a criou.",
    DASEIN_MAINTENANCE_ALREADY_OPEN: "Já existe uma manutenção aberta para este equipamento.", DASEIN_EQUIPMENT_IN_USE: "Devolva o equipamento antes de colocá-lo em manutenção.",
    EQUIPA_ACCOUNT_DISABLED: "Esta conta está aguardando aprovação ou teve o acesso removido.", EQUIPA_LEGAL_VERSION_INVALID: "Versão dos documentos legais inválida.",
    EQUIPA_RETURN_BEFORE_DELETE: "Registre a devolução antes de apagar o equipamento.", EQUIPA_CLOSE_MAINTENANCE_FIRST: "Conclua a manutenção antes de apagar o equipamento.",
    EQUIPA_DUE_DATE_INVALID: "Escolha um prazo posterior ao atual e de até 30 dias.",
    EQUIPA_DUE_AFTER_SCHOOL_CLOSE: "A devolução deve ser prevista até 21h15, no horário da escola.",
    EQUIPA_RESERVATION_CONFLICT: "Há uma reserva confirmada durante o período desta retirada. Ajuste o prazo ou utilize a reserva existente.",
    EQUIPA_BATCH_SIZE_INVALID: "Selecione de 1 a 60 equipamentos.",
    EQUIPA_CUSTODY_INVALID: "Informe quem receberá o equipamento e o vínculo com a escola.",
    EQUIPA_CUSTODY_SELF_REQUIRED: "A retirada em nome de outra pessoa exige um professor ou administrador autenticado.",
    EQUIPA_PURPOSE_REQUIRED: "Informe o motivo da retirada e detalhe o objetivo quando selecionar Outro.",
  };
  Object.assign(map, {
    EQUIPA_INSUFFICIENT_STOCK: "Não há equipamentos suficientes para todas as datas solicitadas.",
    EQUIPA_AVAILABILITY_CHANGED: "A disponibilidade mudou. Atualize a consulta e tente novamente.",
    EQUIPA_RESERVATION_CONFLICT: "O horário foi reservado por outra pessoa. Escolha outro período.",
    EQUIPA_QUANTITY_INVALID: "Informe de 1 a 60 equipamentos.",
    EQUIPA_OCCURRENCES_INVALID: "Confira as datas: até 12 ocorrências, 90 dias de antecedência e 8 horas por reserva.",
    EQUIPA_CHECKIN_WINDOW: "O check-in abre 30 minutos antes da reserva e fecha 15 minutos após o início.",
    EQUIPA_CHECKIN_EXPIRED: "O prazo para retirar essa reserva terminou.",
    EQUIPA_BOOKING_STATE_INVALID: "A reserva mudou de estado. Atualize a agenda.",
    EQUIPA_RESERVATION_NOT_ACTIVE: "Esta reserva não está mais ativa.",
    EQUIPA_RESERVATION_NOT_FOUND: "Reserva não encontrada.",
    EQUIPA_FORBIDDEN: "Sua conta não tem permissão para realizar esta operação.",
    EQUIPA_ITEM_ALREADY_RETURNED: "Este equipamento já foi devolvido.",
    EQUIPA_RETURN_ITEMS_INVALID: "Selecione os equipamentos e suas condições corretamente.",
    EQUIPA_ITEM_NOT_IN_WITHDRAWAL: "Um dos equipamentos não pertence a esta retirada.",
    EQUIPA_WITHDRAWAL_NOT_ACTIVE: "Esta retirada já foi concluída.",
    EQUIPA_REPORT_RANGE_INVALID: "Selecione um intervalo de até 370 dias.",
  });
  if (map[code]) return map[code];
  if (error?.code || /constraint|permission denied|syntax error|invalid input|does not exist|schema cache/i.test(raw)) {
    console.warn("Equipa: operação rejeitada pelo servidor", error?.code || "server");
    return "Não foi possível concluir. Atualize a página e tente novamente ou procure a administração.";
  }
  return raw.length > 220 ? "Não foi possível concluir a operação. Tente novamente." : raw;
}
function notify(message, type = "info") {
  const host = qs("#toast-host");
  if (!host) return;
  const titles = { success: "Concluído", error: "Não foi possível concluir", warning: "Atenção", info: "Equipa" };
  const marks = { success: "✓", error: "!", warning: "!", info: "i" };
  const el = document.createElement("section");
  el.className = `dasein-infobox ${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = `<span class="infobox-mark" aria-hidden="true">${marks[type] || "i"}</span><div class="infobox-copy"><strong>${esc(titles[type] || "Equipa")}</strong><p>${esc(message)}</p></div><button class="infobox-close" type="button" aria-label="Fechar aviso">×</button><span class="infobox-timer" aria-hidden="true"></span>`;
  host.prepend(el);
  while (host.children.length > 4) host.lastElementChild?.remove();
  const remove = () => { el.classList.add("leaving"); setTimeout(() => el.remove(), 190); };
  qs(".infobox-close", el)?.addEventListener("click", remove);
  setTimeout(remove, type === "error" ? 7000 : 5000);
}
function confirmAction({ title = "Confirmar ação", message, confirmText = "Confirmar", cancelText = "Voltar", danger = false } = {}) {
  return new Promise(resolve => {
    const modal = makeModal(`<div class="confirm-box"><span class="confirm-symbol ${danger ? "danger" : ""}">${danger ? "!" : "?"}</span><div><span class="eyebrow">Equipa</span><h2>${esc(title)}</h2><p>${esc(message || "Confirme para continuar.")}</p></div></div><div class="modal-actions confirm-actions"><button class="button" type="button" data-confirm-no>${esc(cancelText)}</button><button class="button ${danger ? "danger-solid" : "primary"}" type="button" data-confirm-yes>${esc(confirmText)}</button></div>`);
    let settled = false;
    const finish = value => { if (settled) return; settled = true; modal.remove(); resolve(value); };
    qs("[data-confirm-no]", modal)?.addEventListener("click", () => finish(false));
    qs("[data-confirm-yes]", modal)?.addEventListener("click", () => finish(true));
    modal.addEventListener("click", e => { if (e.target === modal) finish(false); });
  });
}
function setBusy(button, busy, text = "Aguarde…") {
  if (!button) return;
  if (busy) { button.dataset.old = button.textContent; button.textContent = text; button.disabled = true; }
  else { button.textContent = button.dataset.old || button.textContent; button.disabled = false; }
}
function closeModal(modal) { modal?.remove(); }
function makeModal(html, wide = false) {
  const back = document.createElement("div");
  back.className = "modal-backdrop";
  back.innerHTML = `<section class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</section>`;
  qsa('.panel-head > [data-close],.ref-modal-top > [data-close],.modal-head > [data-close]',back).forEach(el=>el.remove());
  const closeButton=document.createElement('button');
  closeButton.type='button';closeButton.className='modal-close-control';closeButton.dataset.close='';
  closeButton.setAttribute('aria-label','Fechar janela');closeButton.title='Fechar janela';
  closeButton.textContent='×';qs('.modal',back).prepend(closeButton);
  document.body.append(back);
  qsa("[data-close]", back).forEach(b => b.addEventListener("click", () => closeModal(back)));
  back.addEventListener("click", e => { if (e.target === back) closeModal(back); });
  return back;
}
function detail(label, value) { return `<div class="detail"><span>${esc(label)}</span><strong>${esc(value || "—")}</strong></div>`; }
function qrUrl(token) {
  const url = new URL(location.href);
  url.search = ""; url.hash = "";
  url.searchParams.set("qr", token);
  return url.toString();
}
function scanTokenFromUrl() {
  const params = new URLSearchParams(location.search);
  const token = params.get("qr") || params.get("e");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token || "") ? token : null;
}
async function scanPublic(token) {
  if (!token) return null;
  const { data, error } = await supabase.rpc("scan_qr", { p_token: token });
  if (error) return null;
  return Array.isArray(data) ? data[0] || null : data;
}

// A saúde da API é verificada em silêncio. O inventário continua protegido
// pelo login; nunca mostrar mensagens de sucesso ou testar tabelas como anon.
let availabilityCheckGeneration = 0;
function renderAvailabilityError(info) {
  window.__equipaBootReady?.();
  app.innerHTML = `<main class="boot boot-error"><div class="startup-error-card" role="alert"><strong>O Equipa está indisponível.</strong><span>${esc(info.detail || "Não foi possível acessar o servidor. Verifique sua conexão e tente novamente.")}</span><div class="startup-error-actions"><button class="button primary" id="availability-retry" type="button">Tentar novamente</button></div></div></main>`;
  qs("#availability-retry")?.addEventListener("click", () => { showBootLoader(); void boot(); });
}
async function checkAvailabilitySilently() {
  const check = ++availabilityCheckGeneration;
  const info = await supabase.checkAvailability();
  // A tela pode ter mudado enquanto a rede respondia: não interromper o login.
  if (check !== availabilityCheckGeneration || !qs("#auth-card")) return;
  if (!info.ok) renderAvailabilityError(info);
}
function renderAuth(scan = null) {
  app.innerHTML = `
  <main class="auth-shell">
    <section class="auth-brand">
      <div class="brandline"><strong class="equipa-wordmark">Equipa</strong></div>
      <div class="auth-brand-copy"><span class="eyebrow" style="color:rgba(255,255,255,.65)">Equipamentos escolares</span><h1>Um lugar para saber onde cada equipamento está.</h1><p>Retiradas, devoluções, carrinhos, QR Codes, manutenção e histórico em um único ambiente escolar.</p></div>
      <span class="auth-version">Equipa ${esc(config.version)} · Web</span>
    </section>
    <section class="auth-side">
      <div class="auth-card" id="auth-card">
        <span class="eyebrow">Acesso</span><h2>Entrar no Equipa</h2><p>Use sua conta escolar cadastrada.</p>
        ${scan ? `<div class="scan-preview"><span>QR reconhecido · ${esc(scan.kind === "cart" ? "Carrinho" : "Equipamento")}</span><strong>${esc(scan.display_name)}</strong><span>${scan.model ? `${esc(scan.brand || "")} ${esc(scan.model)}` : `${Number(scan.item_count || 0)} equipamento(s)`}</span>${scan.status ? `<span class="status status-${esc(scan.status)}">${esc(statusLabel(scan.status))}</span>` : ""}</div>` : ""}
        <div class="auth-tabs"><button class="auth-tab active" data-tab="login" type="button">Entrar</button><button class="auth-tab" data-tab="signup" type="button">Criar conta</button></div>
        <form id="login-form" class="auth-form">
          <label>E-mail<input id="login-email" type="email" autocomplete="email" required></label>
          <label>Senha<input id="login-password" type="password" autocomplete="current-password" minlength="6" required></label>
          <button class="button primary full" type="submit">Entrar</button>
          <button class="link-button" id="forgot" type="button">Esqueci minha senha</button>
        </form>
        <form id="signup-form" class="auth-form hidden">
          <label>Nome completo<input id="signup-name" type="text" autocomplete="name" minlength="3" maxlength="120" required></label>
          <label>E-mail<input id="signup-email" type="email" autocomplete="email" required></label>
          <label>Senha<input id="signup-password" type="password" autocomplete="new-password" minlength="8" required></label>
          <label class="check"><input id="signup-terms" type="checkbox" required><span>Li os <button class="link-button" data-legal="terms" type="button">Termos de Uso</button> e a <button class="link-button" data-legal="privacy" type="button">Política de Privacidade</button>.</span></label>
          <button class="button primary full" type="submit">Criar conta</button>
        </form>
        <div class="auth-footer">Dados operacionais são usados apenas para gerenciar equipamentos e movimentações da escola. O painel evita usar e-mail como identificação principal.</div>
      </div><footer class="equipa-watermark auth-watermark">feito pela equipe da coordenação da escola e 3-A do ensino médio</footer>
    </section>
  </main>`;

  void checkAvailabilitySilently();
  qsa("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
    const card = qs("#auth-card");
    card?.classList.remove("switching");
    void card?.offsetWidth;
    card?.classList.add("switching");
    qsa("[data-tab]").forEach(x => x.classList.toggle("active", x === btn));
    qs("#login-form").classList.toggle("hidden", btn.dataset.tab !== "login");
    qs("#signup-form").classList.toggle("hidden", btn.dataset.tab !== "signup");
    setTimeout(() => card?.classList.remove("switching"), 220);
  }));
  qsa("[data-legal]").forEach(btn => btn.addEventListener("click", () => openLegal(btn.dataset.legal)));

  qs("#login-form").addEventListener("submit", async e => {
    e.preventDefault(); const b = qs('button[type="submit"]', e.currentTarget); setBusy(b, true, "Entrando…");
    const { error } = await supabase.auth.signInWithPassword({ email: qs("#login-email").value.trim(), password: qs("#login-password").value });
    setBusy(b, false); if (error) notify(errText(error), "error");
  });
  qs("#signup-form").addEventListener("submit", async e => {
    e.preventDefault(); const b = qs('button[type="submit"]', e.currentTarget); setBusy(b, true, "Criando…");
    const { data, error } = await supabase.auth.signUp({ email: qs("#signup-email").value.trim(), password: qs("#signup-password").value, options: { data: { full_name: qs("#signup-name").value.trim() } } });
    setBusy(b, false); if (error) return notify(errText(error), "error");
    if (data.session) await supabase.rpc("accept_legal_documents", { p_terms_version: config.legalTermsVersion, p_privacy_version: config.privacyVersion });
    notify(data.session ? "Conta criada." : "Conta criada. Confirme o e-mail para entrar.", "success");
    if (!data.session) qs('[data-tab="login"]').click();
  });
  qs("#forgot").addEventListener("click", async () => {
    const email = qs("#login-email").value.trim(); if (!email) return notify("Digite seu e-mail primeiro.", "warning");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}` });
    notify(error ? errText(error) : "Instruções de recuperação enviadas.", error ? "error" : "success");
  });
}
function legalDocument(kind) {
  const terms = kind === "terms";
  if (terms) return `<div class="legal-doc contract-doc">
    <p class="legal-lead"><strong>TERMO DE USO E RESPONSABILIDADE DO EQUIPA</strong><br>Versão ${esc(config.legalTermsVersion)}. Este documento disciplina o uso da plataforma Equipa no ambiente escolar e integra as regras administrativas de controle do patrimônio tecnológico da unidade.</p>
    <h3>1. Finalidade institucional</h3><p>O Equipa é destinado exclusivamente ao inventário, retirada, devolução, manutenção, localização e auditoria de equipamentos da escola. O uso fora dessas finalidades, inclusive para testar acessos não autorizados ou alterar registros sem motivo administrativo, é vedado.</p>
    <h3>2. Acesso e autorização</h3><p>O acesso depende de conta individual e, quando exigido pela escola, aprovação administrativa. As permissões variam conforme o perfil atribuído. O usuário não adquire qualquer direito de administração por conhecer endereços, QR Codes, código-fonte público ou identificadores técnicos da plataforma.</p>
    <h3>3. Credenciais e segurança</h3><p>Senha, sessão e dispositivo autenticado são de uso pessoal. O usuário deve encerrar a sessão em equipamento compartilhado e comunicar imediatamente suspeita de invasão, perda de credencial ou operação registrada em seu nome que não reconheça.</p>
    <h3>4. Retiradas e devoluções</h3><p>Ao registrar uma retirada, o usuário declara que a movimentação corresponde à realidade. O equipamento permanece vinculado à retirada até que a devolução seja efetivamente registrada no Equipa. Data e horário de retirada e devolução compõem o histórico administrativo. Divergências devem ser comunicadas à coordenação para correção ou apuração.</p>
    <h3>5. Responsabilidade sobre equipamentos</h3><p>Durante a retirada, o usuário deve observar as regras internas de guarda e utilização do patrimônio. O registro no Equipa não cria, por si só, responsabilidade financeira automática por dano, perda ou defeito. Eventuais responsabilidades serão apuradas pela escola conforme normas aplicáveis, circunstâncias do fato e direito de manifestação do envolvido.</p>
    <h3>6. QR Codes e carrinhos</h3><p>QR Codes são identificadores operacionais. Fotografar, copiar ou conhecer um QR não concede autorização para retirar, devolver, editar ou administrar qualquer item. As ações continuam submetidas à autenticação, às permissões da conta e às regras do banco de dados.</p>
    <h3>7. Integridade dos registros</h3><p>É proibido falsificar nomes, turmas, destinos, horários, estados de equipamento, manutenção ou devolução; remover registros com a intenção de eliminar rastreabilidade; utilizar conta de terceiro; ou tentar contornar controles de acesso. A escola pode bloquear contas, preservar evidências e revisar registros quando necessário à segurança e à gestão patrimonial.</p>
    <h3>8. Auditoria</h3><p>Operações administrativas e movimentações relevantes podem gerar registros de auditoria contendo usuário, data, tipo de ação, entidade afetada e dados necessários à investigação. A auditoria existe para segurança, prestação de contas e correção de inconsistências.</p>
    <h3>9. Disponibilidade e manutenção</h3><p>A escola pode suspender temporariamente o Equipa, alterar fluxos, corrigir informações e realizar manutenção quando necessário. Falhas técnicas devem ser comunicadas e não autorizam o usuário a criar registros fictícios ou ignorar procedimentos administrativos alternativos definidos pela escola.</p>
    <h3>10. Suspensão e encerramento de acesso</h3><p>Contas podem ser aprovadas, suspensas, banidas ou ter o acesso removido pela administração quando houver desligamento, mudança de função, risco de segurança, uso incompatível com estes termos ou necessidade administrativa. O histórico já existente poderá ser preservado para manter a integridade dos registros escolares.</p>
    <h3>11. Alterações</h3><p>O documento pode ser atualizado para acompanhar mudanças legais, técnicas ou administrativas. Alterações relevantes geram nova versão e podem exigir nova ciência e aceite antes de continuar usando a plataforma.</p>
    <h3>12. Contato</h3><p>Dúvidas, contestação de registros ou solicitações relacionadas ao uso do Equipa devem ser encaminhadas pelo ${esc(config.privacyContact)}.</p>
    <h3>13. Aceite eletrônico e vigência</h3><p>Ao marcar a opção de ciência e continuar, o usuário registra eletronicamente o aceite da versão indicada destes Termos. O Equipa guarda a identificação da conta, a versão e a data do aceite para comprovação administrativa. O registro eletrônico não elimina o direito de questionar dados incorretos nem substitui procedimentos disciplinares ou patrimoniais previstos pela escola.</p>
    <p class="legal-note">O aceite confirma ciência das regras de uso da plataforma. Ele não substitui normas escolares, legislação aplicável nem autorizações específicas que possam ser exigidas em situações determinadas.</p>
  </div>`;
  return `<div class="legal-doc contract-doc">
    <p class="legal-lead"><strong>AVISO E POLÍTICA DE PRIVACIDADE DO EQUIPA</strong><br>Versão ${esc(config.privacyVersion)}. Este documento informa como dados pessoais são tratados na operação escolar do Equipa, em conformidade com a Lei nº 13.709/2018 (LGPD) e com as regras aplicáveis ao ambiente educacional.</p>
    <h3>1. Responsabilidade pelo tratamento</h3><p>${esc(config.controllerName)} define as finalidades administrativas do tratamento realizado no Equipa. O ${esc(config.privacyContact)} é o canal indicado para dúvidas, exercício de direitos e comunicação de incidentes relacionados à plataforma.</p>
    <h3>2. Dados necessários</h3><p>O sistema pode tratar nome, e-mail de autenticação, perfil de acesso, identificador de conta, turma, destino, registros de retirada e devolução, manutenção, ações administrativas e informações de auditoria. Dados técnicos dos equipamentos, como patrimônio, número de série, modelo, grupo e localização, não são dados pessoais por si só, mas podem ser associados a movimentações de usuários.</p>
    <h3>3. Dados que o Equipa procura não coletar</h3><p>A plataforma não necessita armazenar imagem da câmera usada para leitura de QR, contatos do aparelho, localização GPS, conteúdo pessoal do dispositivo ou senhas dos usuários. A câmera é usada apenas durante a leitura do código quando autorizada pelo navegador.</p>
    <h3>4. Finalidades</h3><p>Os dados são usados para autenticação, autorização, gestão do inventário, responsabilização administrativa por movimentações, devoluções, manutenção, prevenção de conflito, segurança, investigação de inconsistências, continuidade do serviço e prestação de contas da unidade escolar.</p>
    <h3>5. Bases legais</h3><p>O tratamento deve se apoiar nas hipóteses legais adequadas à atuação da unidade escolar, como cumprimento de obrigações legais ou regulatórias, execução de políticas públicas e procedimentos administrativos, proteção do patrimônio e outras bases aplicáveis ao caso concreto. A mera aceitação desta política não transforma consentimento em base legal universal.</p>
    <h3>6. Crianças e adolescentes</h3><p>Quando houver tratamento de dados de crianças ou adolescentes, a escola deve observar seu melhor interesse, limitar a coleta ao necessário e adotar salvaguardas compatíveis com o contexto educacional e com a legislação aplicável.</p>
    <h3>7. Acesso e compartilhamento</h3><p>Os dados ficam acessíveis conforme o perfil e a necessidade funcional. Administradores podem acessar informações adicionais indispensáveis à gestão e auditoria. Prestadores de infraestrutura podem processar dados estritamente para hospedagem, autenticação, banco de dados e segurança, de acordo com os serviços contratados.</p>
    <h3>8. Segurança</h3><p>O Equipa utiliza autenticação, controle de acesso por função, Row Level Security, operações administrativas executadas no servidor, QR Codes sem dados pessoais embutidos e registro de auditoria. Nenhum sistema é imune a incidentes; por isso, suspeitas devem ser comunicadas imediatamente para contenção e análise.</p>
    <h3>9. Retenção</h3><p>Dados pessoais e históricos operacionais devem ser mantidos apenas pelo período necessário às finalidades escolares, à segurança, à prestação de contas e às obrigações legais. O encerramento de uma conta não implica apagamento automático de registros cuja preservação seja necessária para manter a integridade do histórico patrimonial.</p>
    <h3>10. Direitos dos titulares</h3><p>Nos termos da LGPD, o titular pode solicitar informações e, quando aplicável, confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação, informações sobre compartilhamento e revisão de questões relacionadas ao tratamento. O atendimento observará a legislação e hipóteses legítimas de conservação.</p>
    <h3>11. Correção de registros</h3><p>Quando um usuário identificar movimentação incorreta, dado pessoal desatualizado ou registro atribuído indevidamente, deve comunicar a escola. A correção deve preservar, quando necessário, a trilha de auditoria para que a alteração não seja confundida com ocultação do histórico.</p>
    <h3>12. Incidentes</h3><p>Suspeitas de vazamento, acesso indevido ou uso abusivo devem ser encaminhadas imediatamente ao canal responsável. A unidade escolar avaliará o evento e adotará as providências administrativas e legais cabíveis, inclusive comunicações exigidas pela legislação.</p>
    <h3>13. Atualizações</h3><p>Esta política pode ser atualizada. Mudanças relevantes serão identificadas por nova versão e poderão exigir nova ciência antes da continuidade do uso.</p>
    <p class="legal-note">A ciência desta política registra que o usuário recebeu as informações sobre o tratamento. Direitos previstos em lei não são renunciados pelo aceite.</p>
  </div>`;
}
function openLegal(kind) {
  const terms = kind === "terms";
  const legalBack = makeModal(`<div class="panel-head"><div><span class="eyebrow">Equipa · LGPD</span><h2>${terms ? "Termos de Uso" : "Política de Privacidade"}</h2></div><button class="icon-button" data-close>×</button></div><div class="modal-body legal-modal-body">${legalDocument(kind)}</div>`, true);
  legalBack.classList.add("legal-document-backdrop");
}
async function hasCurrentLegalAcceptance() {
  const { data, error } = await supabase.rpc("has_current_legal_acceptance", { p_terms_version: config.legalTermsVersion, p_privacy_version: config.privacyVersion });
  if (error) { console.warn("Legal acceptance check unavailable", error); return false; }
  return data === true;
}
function requestLegalAcceptance() {
  return new Promise(resolve => {
    const back = document.createElement("div");
    back.className = "modal-backdrop legal-gate-backdrop";
    back.innerHTML = `<section class="modal wide legal-gate" role="dialog" aria-modal="true"><div class="panel-head"><div><span class="eyebrow">Privacidade e uso responsável</span><h2>Antes de continuar no Equipa</h2></div></div><div class="modal-body"><p class="legal-gate-intro">Leia os documentos institucionais antes de continuar. O Equipa registra apenas a versão aceita, a conta e a data, mantendo a rastreabilidade exigida para o uso escolar.</p><div class="legal-gate-links"><button class="button" type="button" data-read-terms>Termos de Uso</button><button class="button" type="button" data-read-privacy>Política de Privacidade</button></div><label class="check legal-check"><input type="checkbox" id="legal-accept-check"><span>Li, compreendi e aceito as regras dos Termos de Uso e declaro ciência da Política de Privacidade, versões ${esc(config.legalTermsVersion)} e ${esc(config.privacyVersion)}.</span></label><div class="modal-actions"><button class="button ghost" type="button" data-legal-exit>Sair</button><button class="button primary" type="button" data-legal-accept disabled>Continuar</button></div></div></section>`;
    document.body.append(back);
    const check=qs("#legal-accept-check",back), accept=qs("[data-legal-accept]",back);
    check.addEventListener("change",()=>{accept.disabled=!check.checked});
    qs("[data-read-terms]",back).addEventListener("click",()=>openLegal("terms"));
    qs("[data-read-privacy]",back).addEventListener("click",()=>openLegal("privacy"));
    qs("[data-legal-exit]",back).addEventListener("click",async()=>{back.remove();await supabase.auth.signOut();resolve(false)});
    accept.addEventListener("click",async()=>{setBusy(accept,true,"Registrando…");const {error}=await supabase.rpc("accept_legal_documents",{p_terms_version:config.legalTermsVersion,p_privacy_version:config.privacyVersion});setBusy(accept,false);if(error)return notify(errText(error),"error");back.remove();notify("Preferências legais registradas.","success");resolve(true)});
  });
}
async function ensureLegalAcceptance(){if(await hasCurrentLegalAcceptance())return true;return requestLegalAcceptance();}

async function loadProfile() {
  const { data, error } = await supabase.from("profiles").select("id,full_name,role,is_active,disabled_at,created_at,updated_at").eq("id", state.session.user.id).single();
  if (error) throw error;
  state.profile = data;
}
function pageTitle() {
  return ({ dashboard: "Visão geral", equipment: "Equipamentos", withdrawals: "Retiradas", history: "Histórico", carts: "Carrinhos", maintenance: "Manutenção", reports: "Relatórios", admin: "Administração", audit: "Auditoria" })[state.view] || "Equipa";
}
function firstName() { return (state.profile?.full_name || "Usuário").trim().split(/\s+/)[0] || "Usuário"; }
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
const UI_GLYPHS = {
  qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3m-3 3h3m0-3v3M14 20v1"/>',
 dashboard:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
 equipment:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
 withdrawals:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
 reservations:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
 history:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 carts:'<path d="M3 4h2l2.5 12h11l2-9H6M9 20h.01M17 20h.01"/>',
 maintenance:'<path d="M14 6a5 5 0 0 0-6 6l-5 5a2 2 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4z"/>',
 reports:'<path d="M4 20V11m5 9V4m5 16v-7m5 7V8"/>',
 audit:'<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6zM12 8v5m0 3h.01"/>',
 admin:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l-2 2a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1 1.64h-2.8a1.8 1.8 0 0 0-1-1.64 1.8 1.8 0 0 0-2 .36l-2-2a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 4.7 14H3v-4h1.7a1.8 1.8 0 0 0 1.64-1 1.8 1.8 0 0 0-.36-2l2-2a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 11 3.7h2.8a1.8 1.8 0 0 0 1 1.64 1.8 1.8 0 0 0 2-.36l2 2a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 20 10h1v4h-1a1.8 1.8 0 0 0-1.6 1z"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l1.5 1.5M18.5 18.5 20 20M20 4l-1.5 1.5M5.5 18.5 4 20"/>',
 moon:'<path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.7 8.7 0 1 0 10.7 10.7z"/>',
 school:'<path d="M3 21V8l9-5 9 5v13M2 21h20M7 11h2m6 0h2m-10 4h2m6 0h2M10 21v-5h4v5"/>',
 filter:'<path d="M4 5h16l-6.5 8v6l-3 2v-8z"/>',
 tag:'<path d="M20 13 12 21 3 12V3h9zM7.5 7.5h.01"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
 plus:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 arrow:'<path d="m9 5 7 7-7 7"/>',
 rotate:'<path d="M20 7v5h-5M4 17v-5h5M5 9a8 8 0 0 1 14-2M19 15a8 8 0 0 1-14 2"/>',
 pie:'<path d="M12 3v9h9a9 9 0 1 1-9-9M15 2a9 9 0 0 1 7 7h-7z"/>',
 inbox:'<path d="M4 5h16l2 11v5H2v-5zM2 16h6l2 3h4l2-3h6"/>',
 warning:'<path d="m12 3 10 18H2zM12 9v5m0 3h.01"/>',
 lightning:'<path d="m13 2-9 11h7l-1 9 10-12h-7z"/>',
 check:'<path d="M5 12l5 5L20 7"/>',
 logout:'<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 7l5 5-5 5M9 12h10"/>'
};
function uiIcon(name, size=19) { const p=UI_GLYPHS[name]||UI_GLYPHS.grid;return `<svg class="ui-icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`; }
function icon(name){return uiIcon(name);}

function cleanupTransientUi(){closeContextMenu?.();qs("#filter-mobile-shade")?.remove();closeEquipaNotifications();qsa("body > .filter-drawer").forEach(el=>el.remove());document.body.classList.remove("filter-sheet-open","mobile-overlay-open","mobile-sidebar-open");}
function renderPendingApproval(){app.innerHTML=`<main class="pending-access"><div class="pending-card"><span class="eyebrow">Equipa</span><h1>Acesso indisponível</h1><p>Esta conta está aguardando aprovação, suspensa ou teve o acesso removido pela administração da escola. Nenhum inventário ou histórico fica disponível enquanto o acesso não estiver liberado.</p><button class="button primary" id="pending-signout" type="button">Sair da conta</button></div><footer class="equipa-watermark standalone">feito pela equipe da coordenação da escola e 3-A do ensino médio</footer></main>`;qs("#pending-signout")?.addEventListener("click",()=>supabase.auth.signOut());}
let equipaShellAbort=new AbortController();
function shell(content) {
  equipaShellAbort.abort();
  equipaShellAbort=new AbortController();
  cleanupTransientUi();
  const admin = state.profile?.role === "admin";
  const mobileMoreItems = `${nav("history","Histórico")}${nav("carts","Carrinhos")}${admin ? nav("maintenance","Manutenção") + nav("reports","Relatórios") + nav("audit","Auditoria") + nav("admin","Administração") : ""}`;
  app.innerHTML = `<div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand" title="Equipa"><div class="brand-copy"><strong>Equipa</strong><span>Gestão escolar</span></div></div>
      <nav class="nav" aria-label="Navegação principal">
        ${nav("dashboard","Início")}${nav("equipment","Equipamentos")}${nav("withdrawals","Retiradas")}${nav("history","Histórico")}${nav("carts","Carrinhos")}${admin ? nav("maintenance","Manutenção") + nav("reports","Relatórios") + nav("audit","Auditoria") + nav("admin","Administração") : ""}
      </nav>
      <div class="sidebar-user"><div class="sidebar-user-avatar" aria-hidden="true">${esc(firstName().slice(0,1).toUpperCase())}</div><div class="sidebar-user-copy"><strong>${esc(state.profile?.full_name||"Usuário")}</strong><span>${esc(roleLabel(state.profile?.role))}</span></div></div><button class="logout-button" id="logout" title="Sair da conta" aria-label="Sair">${uiIcon("logout",18)}<span>Sair</span></button>
    </aside>
    <button type="button" class="mobile-sidebar-shade" id="mobile-sidebar-shade" aria-label="Fechar menu lateral" tabindex="-1"></button>
    <section class="main">
      <header class="topbar">
        
        <form class="global-search" id="global-search-form" role="search">${uiIcon("search",18)}<input id="global-search" type="search" value="${esc(currentGlobalSearchValue())}" placeholder="Pesquisar equipamento, turma, aluno ou manutenção..." autocomplete="off"><kbd>Ctrl K</kbd></form>
        <div class="topbar-right"><button type="button" class="topbar-tool" id="topbar-alerts" aria-label="Abrir notificações" aria-haspopup="dialog" aria-expanded="false">${uiIcon("bell",21)}<i hidden></i></button><button type="button" class="topbar-tool" id="topbar-theme" aria-label="Alternar tema">${uiIcon(document.documentElement.dataset.theme === "dark" ? "moon" : "sun",21)}</button><div class="topbar-divider"></div><div class="school-identification"><span>${uiIcon("school",23)}</span><div><strong>E.E. Amador e Catharina</strong><small>Equipa · Gestão escolar</small></div></div></div>
      </header>
      <main class="content view-${esc(state.view)}" aria-label="${esc(pageTitle())}">${content}</main><footer class="equipa-watermark">feito pela equipe da coordenação da escola e 3-A do ensino médio</footer>
    </section>
    <nav class="mobile-tabbar" aria-label="Navegação do aplicativo">
      ${mobileNav("dashboard","Início")}${mobileNav("equipment","Equipamentos")}<button class="mobile-nav-item mobile-qr-action" id="mobile-qr-scan" type="button" aria-label="Ler QR Code"><span class="mobile-qr-icon">${uiIcon("qr",20)}</span><small>Ler QR</small></button>${mobileNav("withdrawals","Retiradas")}<button class="mobile-nav-item mobile-more-action ${["history","carts","maintenance","reports","audit","admin"].includes(state.view)?"active":""}" id="mobile-more" type="button" aria-haspopup="dialog" aria-expanded="false">${uiIcon("grid",20)}<small>Mais</small></button>
    </nav>
    <div class="mobile-more-backdrop" id="mobile-more-backdrop"><section class="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="Outras páginas"><div class="mobile-sheet-handle"></div><div class="mobile-sheet-head"><div><span>Mais opções</span><strong>Equipa</strong></div><button class="icon-button" id="mobile-more-close" type="button">×</button></div><div class="mobile-more-list">${mobileMoreItems}</div><button class="mobile-sheet-theme" id="mobile-sheet-theme" type="button" aria-label="Alternar tema visual">${uiIcon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon",20)}<span>${document.documentElement.dataset.theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}</span></button><button class="mobile-sheet-logout" id="mobile-sheet-logout" type="button"><span>Sair da conta</span></button></section></div>
  </div>`;
  qsa("[data-view]").forEach(b => b.addEventListener("click", () => navigate(b.dataset.view)));
  const setMobileSidebar = (open) => {
    qs("#sidebar")?.classList.toggle("open",open);
    document.body.classList.toggle("mobile-sidebar-open",open);
    qs("#menu")?.setAttribute("aria-expanded",String(open));
  };
  qs("#menu")?.addEventListener("click", () => setMobileSidebar(!qs("#sidebar")?.classList.contains("open")));
  qs("#mobile-sidebar-shade")?.addEventListener("click",()=>setMobileSidebar(false));
  qs("#logout")?.addEventListener("click", () => supabase.auth.signOut());
  qs("#mobile-sheet-logout")?.addEventListener("click", () => supabase.auth.signOut());
  qs("#mobile-qr-scan")?.addEventListener("click", openMobileQrScanner);
  qs("#topbar-alerts")?.addEventListener("click",toggleEquipaNotifications);
  qs("#topbar-theme")?.addEventListener("click",()=>setEquipaTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  qs("#topbar-theme")?.setAttribute("aria-pressed",String(document.documentElement.dataset.theme === "dark"));
  refreshEquipaNotificationBadge().catch(()=>{});
  const closeMobileMore = () => {qs("#mobile-more-backdrop")?.classList.remove("open");document.body.classList.remove("mobile-overlay-open");qs("#mobile-more")?.setAttribute("aria-expanded","false")};
  qs("#mobile-more")?.addEventListener("click", () => {qs("#mobile-more-backdrop")?.classList.add("open");document.body.classList.add("mobile-overlay-open");qs("#mobile-more")?.setAttribute("aria-expanded","true")});
  qs("#mobile-sheet-theme")?.addEventListener("click", () => {
    setEquipaTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    const themeButton = qs("#mobile-sheet-theme");
    if (themeButton) {
      const dark = document.documentElement.dataset.theme === "dark";
      themeButton.innerHTML = `${uiIcon(dark ? "sun" : "moon",20)}<span>${dark ? "Ativar modo claro" : "Ativar modo escuro"}</span>`;
    }
  });
  qs("#mobile-more-close")?.addEventListener("click", closeMobileMore);
  qs("#mobile-more-backdrop")?.addEventListener("click", e => { if (e.target?.id === "mobile-more-backdrop") closeMobileMore(); });
  document.addEventListener("keydown", function mobileShellEscape(e){
    if(e.key!=="Escape" || !qs(".app-shell")){document.removeEventListener("keydown",mobileShellEscape);return}
    if(qs("#mobile-more-backdrop")?.classList.contains("open")){closeMobileMore();return}
    if(qs("#sidebar")?.classList.contains("open"))setMobileSidebar(false);
  },{signal:equipaShellAbort.signal});
  qsa("#mobile-more-backdrop [data-view]").forEach(b => b.addEventListener("click", closeMobileMore));
  setupSmartInputs(app);
  const globalSearchInput=qs("#global-search");
  globalSearchInput?.addEventListener("input", e=>{
    if(!mobilePrincipalSearchActive())return;
    applyMobilePrincipalSearch(e.target.value);
  });
  qs("#global-search-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const term = globalSearchInput?.value.trim() || "";
    if(mobilePrincipalSearchActive())return applyMobilePrincipalSearch(term,{commit:true});
    if (!term) return;
    runSmartGlobalSearch(term);
  });
}
// Avisos operacionais do banco, sem misturar estado de filtros com a central de notificações.
let schoolActivityCache={at:0,viewer:null,data:null,pending:null};
async function getSchoolActivity(force=false){
 const viewer=state.session?.user?.id||null;
 if(!viewer)return {events:[],occupancy:[]};
 if(schoolActivityCache.viewer!==viewer)schoolActivityCache={at:0,viewer,data:null,pending:null};
 if(!force&&schoolActivityCache.data&&Date.now()-schoolActivityCache.at<20000)return schoolActivityCache.data;
 if(schoolActivityCache.pending)return schoolActivityCache.pending;
 schoolActivityCache.pending=(async()=>{
   const {data,error}=await supabase.rpc('equipa_school_activity',{p_limit:30});
   if(error)throw error;
   const safe={events:Array.isArray(data?.events)?data.events:[],occupancy:Array.isArray(data?.occupancy)?data.occupancy:[]};
   if(schoolActivityCache.viewer===viewer){schoolActivityCache.data=safe;schoolActivityCache.at=Date.now();}
   return safe;
 })().finally(()=>{schoolActivityCache.pending=null});
 return schoolActivityCache.pending;
}
function invalidateEquipaActivity(){
 schoolActivityCache.at=0;equipaNoticeCache.at=0;
 refreshEquipaNotificationBadge().catch(()=>{});
}
function noticeSeenKey(){return `equipa-notices-seen:${state.session?.user?.id||'guest'}`;}
function recentUnseen(items){
 let seen=0;try{seen=Number(localStorage.getItem(noticeSeenKey())||0)}catch{}
 return items.some(x=>x.kind==='activity'&&new Date(x.eventAt).getTime()>seen);
}
function markActivityNoticesRead(items){
 const latest=Math.max(0,...items.filter(x=>x.kind==='activity').map(x=>new Date(x.eventAt).getTime()||0));
 if(latest)try{localStorage.setItem(noticeSeenKey(),String(latest))}catch{}
}
let equipaNoticeCache = {at:0, items:[]};
let equipaNoticePromise = null;
let equipaNoticeAbort = null;
async function getEquipaNotices(force=false) {
  if (!force && Date.now()-equipaNoticeCache.at<20000) return equipaNoticeCache.items;
  if (equipaNoticePromise) return equipaNoticePromise;
  equipaNoticePromise = (async()=>{
    const now = new Date();
        const tasks = [
      {kind:'activity',name:'Movimentações',go:'withdrawals',query:()=>getSchoolActivity(force).then(data=>({data:data.events}))},
      {kind:"withdrawals",name:"Devolução atrasada",description:"Retirada com prazo de devolução vencido",go:"withdrawals",query:()=>supabase.from("withdrawals").select("id,class_name,destination,due_at").eq("status","open").lt("due_at",now.toISOString()).order("due_at").limit(8)}
    ];
    if(state.profile?.role === "admin") tasks.push({kind:"maintenance",name:"Manutenção aberta",description:"Aguardando conferência técnica",go:"maintenance",query:()=>supabase.from("maintenance_events").select("id,title,opened_at").eq("status","open").order("opened_at",{ascending:false}).limit(8)});
    const replies=await Promise.all(tasks.map(x=>Promise.resolve().then(x.query).catch(error=>({data:[],error}))));
    const items=[];const failures=[];
    replies.forEach((reply,index)=>{
      const item=tasks[index];
      if(reply?.error){failures.push(item.name);return;}
      for(const r of reply?.data||[]) {
        if(item.kind==='activity'){
          items.push({kind:'activity',eventAt:r.event_at,eventId:r.event_id,go:'withdrawals',
            name:r.event_type==='return'?'Equipamento devolvido':'Equipamento retirado',
            description:`${r.equipment_code||'Equipamento'} · ${r.event_type==='return'?'Devolução registrada':'Em posse de '+(r.holder_name||'não identificado')}${r.event_type==='checkout'&&r.declared?' (identidade declarada)':''} · ${dt(r.event_at)}`});
          continue;
        }
        const description=item.kind==="withdrawals" ? `${r.class_name||"Turma não informada"} · ${r.destination||"Sem destino"} · prazo ${dt(r.due_at)}` : `${r.title||"Equipamento em manutenção"} · ${dt(r.opened_at)}`;
        items.push({kind:item.kind,name:item.name,description,go:item.go});
      }
    });
    equipaNoticeCache={at:Date.now(),items,failures};
    return items;
  })().finally(()=>{equipaNoticePromise=null});
  return equipaNoticePromise;
}
async function refreshEquipaNotificationBadge(){
  if(!state.session) return;
  const items=await getEquipaNotices();
  const badge=qs("#topbar-alerts i");
  if(badge) badge.hidden = !items.some(x=>x.kind!=='activity')&&!recentUnseen(items);
}
function closeEquipaNotifications(){
  equipaNoticeAbort?.abort();equipaNoticeAbort=null;
  qs("#equipa-notification-panel")?.remove();
  qs("#topbar-alerts")?.setAttribute("aria-expanded","false");
}
async function toggleEquipaNotifications(){
  if(qs("#equipa-notification-panel")) {closeEquipaNotifications();return;}
  const button=qs("#topbar-alerts");if(!button)return;
  const notificationAbort = new AbortController();equipaNoticeAbort = notificationAbort;
  const panel=document.createElement("section");
  panel.id="equipa-notification-panel";panel.className="equipa-notification-panel";
  panel.setAttribute("role","dialog");panel.setAttribute("aria-label","Notificações do Equipa");
  panel.innerHTML=`<div class="equipa-notification-head"><div><strong>Notificações</strong><span>Informações atuais da escola</span></div><button type="button" class="equipa-notice-close" aria-label="Fechar notificações">×</button></div><div class="equipa-notification-list" id="equipa-notice-list"><p class="equipa-notice-empty">Consultando avisos…</p></div><div class="equipa-notice-foot"><button type="button" id="equipa-notice-refresh">Atualizar avisos</button></div>`;
  document.body.append(panel);button.setAttribute("aria-expanded","true");
  const position=()=>{
    const b=qs("#topbar-alerts")?.getBoundingClientRect();
    if(!b || !panel.isConnected)return;
    panel.style.top=`${Math.max(8,b.bottom+8)}px`;
    panel.style.left=`${Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,b.right-panel.offsetWidth))}px`;
  };
  position();
  const paint=async(force=false)=>{
    const list=qs("#equipa-notice-list",panel);if(!list)return;
    list.innerHTML='<p class="equipa-notice-empty">Consultando avisos…</p>';
    try {
      const items=await getEquipaNotices(force);
      if(!panel.isConnected)return;
      const failed=equipaNoticeCache.failures||[];
      list.innerHTML=`${failed.length?'<p class="equipa-notice-warning">Alguns avisos não puderam ser consultados. Tente atualizar.</p>':''}${items.length?items.map((x,index)=>`<button class="equipa-notice-item" type="button" data-notice-index="${index}"><strong>${esc(x.name)}</strong><span>${esc(x.description)}</span><small>Abrir ${esc(x.go==="withdrawals"?"Retiradas":"Manutenção")}</small></button>`).join(''):'<p class="equipa-notice-empty">Nenhum aviso operacional no momento.</p>'}`;
      list.querySelectorAll("[data-notice-index]").forEach(el=>el.addEventListener("click",()=>{
        const notice=items[Number(el.dataset.noticeIndex)];if(!notice)return;
        closeEquipaNotifications();navigate(notice.go);
      }));
      markActivityNoticesRead(items);
      const badge=qs("#topbar-alerts i");if(badge)badge.hidden=!items.some(x=>x.kind!=='activity');
    }catch(error){if(panel.isConnected)list.innerHTML=`<p class="equipa-notice-warning">Não foi possível consultar os avisos. ${esc(errText(error))}</p>`;}
  };
  qs(".equipa-notice-close",panel)?.addEventListener("click",closeEquipaNotifications);
  qs("#equipa-notice-refresh",panel)?.addEventListener("click",()=>paint(true));
  document.addEventListener("pointerdown",event=>{
    if(!panel.contains(event.target) && !button.contains(event.target))closeEquipaNotifications();
  },{signal:notificationAbort.signal});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeEquipaNotifications();},{signal:notificationAbort.signal});
  window.addEventListener("resize",position,{signal:notificationAbort.signal});
  await paint();
}

function nav(view, label) { return `<button type="button" class="nav-button ${state.view === view ? "active" : ""}" data-view="${view}" title="${esc(label)}" aria-label="${esc(label)}"><span class="nav-symbol">${uiIcon(view,20)}</span><span class="nav-label">${esc(label)}</span></button>`; }
function mobileNav(view,label){return `<button type="button" class="mobile-nav-item ${state.view===view?"active":""}" data-view="${view}">${uiIcon(view,19)}<small>${esc(label)}</small></button>`;}
async function navigate(view) {
  state.view = view; qs("#sidebar")?.classList.remove("open");document.body.classList.remove("mobile-sidebar-open","mobile-overlay-open");
  if (view === "equipment") {await renderEquipment();setupSmartInputs(app);return;}
  if (view === "withdrawals") {await renderWithdrawals();setupSmartInputs(app);return;}
  if (view === "reservations") view = "withdrawals";
  if (view === "history") {await renderHistory();setupSmartInputs(app);return;}
  if (view === "carts") {await renderCarts();setupSmartInputs(app);return;}
  if (view === "maintenance") {await renderMaintenance();setupSmartInputs(app);return;}
  if (view === "audit") {await renderAudit();setupSmartInputs(app);return;}
  if (view === "reports") {await renderReports();setupSmartInputs(app);return;}
  if (view === "admin") {await renderAdmin();setupSmartInputs(app);return;}
  await renderDashboard();setupSmartInputs(app);
}
function metric(label, value, view) { return `<button class="metric" type="button" data-go="${view}"><span>${esc(label)}</span><strong>${Number(value || 0).toLocaleString("pt-BR")}</strong><small>Abrir detalhes</small></button>`; }

function renderDashboardMovementRows(rows){
 if(!rows?.length)return '<div class="ops-empty">Nenhuma retirada recente.</div>';
 return `<div class="withdrawal-list">${rows.map(r=>{const status=withdrawalStatus(r),info=withdrawalSummary(r);return `<button type="button" class="withdrawal-card ${status==='overdue'?'late':status==='returned'?'returned':'open'}" data-withdrawal-id="${esc(r.withdrawal_id)}"><span class="withdrawal-card-top"><strong>${esc(r.class_name||"Sem turma")}</strong><span class="withdrawal-card-status ${status==='overdue'?'late':status==='returned'?'returned':'open'}">${esc(status==='overdue'?"Atrasada":statusLabel(r.status))}</span></span><span class="withdrawal-card-details"><span><small>EM POSSE DE</small><b>${esc(info.receiver)}</b></span><span><small>DESTINO</small><b>${esc(r.destination||"Não informado")}</b></span><span><small>MOTIVO</small><b>${esc(info.reason)}</b></span></span><span class="withdrawal-card-foot">${esc(r.returned_at?`Devolvida em ${dt(r.returned_at)}`:r.due_at?`Prevista para ${dt(r.due_at)}`:`Retirada em ${dt(r.withdrawn_at)}`)}</span></button>`}).join("")}</div>`;
}
function renderMobileMovementJourney(r){
  const returned=r.status==="returned" || Boolean(r.returned_at);
  const overdue=!returned && r.due_at && new Date(r.due_at).getTime()<Date.now();
  const owner=r.custodian_name||r.responsible_name||"Recebedor não identificado";
  const reason=r.checkout_purpose?withdrawalPurposeLabel(r.checkout_purpose):"Motivo não informado";
  const progress=returned?"complete":overdue?"late":"active";
  return `<article class="delivery-journey ${progress}"><header><div><small>RETIRADA #${esc(r.withdrawal_id)}</small><strong>${esc(r.class_name||"Turma não informada")} · ${esc(r.destination||"Destino não informado")}</strong></div><span class="journey-pill ${progress}">${returned?"Devolvida":overdue?"Atrasada":"Em uso"}</span></header>
    <ol class="delivery-steps"><li class="done"><i aria-hidden="true"></i><div><strong>Retirada registrada</strong><small>${esc(dt(r.withdrawn_at))} · ${esc(r.recorded_by_name||r.responsible_name||"Conta responsável")}</small></div></li>
    <li class="${returned?"done":"current"}"><i aria-hidden="true"></i><div><strong>${returned?"Equipamento utilizado":"Com o responsável"}</strong><small>${esc(owner)} · ${esc(reason)} · ${Number(r.pending_count||0)} de ${Number(r.total_count||0)} pendente(s)</small></div></li>
    <li class="${returned?"done":overdue?"late":"upcoming"}"><i aria-hidden="true"></i><div><strong>${returned?"Devolução concluída":overdue?"Devolução atrasada":"Próxima etapa: devolução"}</strong><small>${esc(returned?dt(r.returned_at):r.due_at?`Prevista para ${dt(r.due_at)}`:"Sem prazo informado no registro antigo")}</small></div></li></ol>
    <button class="journey-detail" type="button" data-withdrawal-id="${esc(r.withdrawal_id)}">Ver detalhes e equipamentos ${uiIcon("arrow",16)}</button></article>`;
}
async function renderDashboard() {
  state.view = "dashboard";
  shell(`<div class="loading">Carregando indicadores…</div>`);

  const admin = state.profile.role === "admin";
  const base = [
    supabase.from("equipments").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("equipments").select("id", { count: "exact", head: true }).eq("is_active", true).eq("status", "available"),
    supabase.from("equipments").select("id", { count: "exact", head: true }).eq("status", "in_use"),
    supabase.from("equipments").select("id", { count: "exact", head: true }).eq("status", "maintenance")
  ];
  const [total, available, inUse, maintenance] = (await Promise.all(base)).map(x => x.count || 0);
  const [{data:current},{data:overdueTotal}]=await Promise.all([
    supabase.rpc("home_withdrawals",{p_query:null}),
    supabase.rpc("overdue_withdrawals_count")
  ]);
  const overdue=Number(overdueTotal||0);
  const pendingReturns = (current || []).reduce((sum, row) => sum + Number(row.pending_count || 0), 0);
  const safeTotal = Math.max(total,1);
  const availablePct = Math.round(available/safeTotal*100);
  const inUsePct = Math.round(inUse/safeTotal*100);
  const maintenancePct = Math.round(maintenance/safeTotal*100);
  const today = new Intl.DateTimeFormat("pt-BR", { weekday:"long", day:"2-digit", month:"long" }).format(new Date());

  const recentIds=[...new Set((current||[]).map(x=>x.withdrawal_id).filter(Boolean))].slice(0,30);
  const recentExtra=recentIds.length ? await supabase.from("withdrawals").select("id,due_at,custodian_name,custodian_role,recorded_by_name,checkout_purpose,purpose_details").in("id",recentIds) : {data:[]};
  const recentDetails=new Map((recentExtra.data||[]).map(x=>[String(x.id),x]));
  const recentMobile = (current || []).slice(0,4).map(x=>({...x,...(recentDetails.get(String(x.withdrawal_id))||{})}));
  shell(`<section class="equipa-ref-home desktop-dashboard">
    <header class="ref-welcome"><div class="ref-welcome-main"><div class="ref-welcome-title"><span aria-hidden="true" class="ref-wave">👋</span><div><h1>Olá, ${esc(state.profile?.full_name||firstName())}</h1></div></div></div><div class="ref-welcome-date"><strong>${esc(new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}).format(new Date()))}</strong></div></header>
    <section class="ref-kpi-grid" aria-label="Indicadores da escola">
      <button class="ref-kpi ref-kpi-green" data-go="equipment" type="button"><div class="ref-kpi-head"><span class="ref-kpi-icon">${uiIcon("equipment",23)}</span><span class="ref-kpi-change">↗ ${availablePct}%</span></div><strong class="ref-kpi-number">${Number(available).toLocaleString("pt-BR")}</strong><b>Disponíveis</b><small>${availablePct}% do inventário</small></button>
      <button class="ref-kpi ref-kpi-blue" data-go="withdrawals" type="button"><div class="ref-kpi-head"><span class="ref-kpi-icon">${uiIcon("carts",23)}</span><span class="ref-kpi-change">${pendingReturns} pendente(s)</span></div><strong class="ref-kpi-number">${Number(inUse).toLocaleString("pt-BR")}</strong><b>Em uso</b><small>Equipamentos atualmente retirados</small></button>
      <button class="ref-kpi ref-kpi-orange" data-go="${admin?"maintenance":"equipment"}" type="button"><div class="ref-kpi-head"><span class="ref-kpi-icon">${uiIcon("maintenance",23)}</span><span class="ref-kpi-change">${maintenancePct}%</span></div><strong class="ref-kpi-number">${Number(maintenance).toLocaleString("pt-BR")}</strong><b>Manutenção</b><small>Equipamentos em manutenção</small></button>
    </section>
    ${overdue?`<button class="logistics-overdue" type="button" data-overdue-alert><strong>${overdue} retirada(s) atrasada(s)</strong><span>Consultar devoluções pendentes ${uiIcon("arrow",16)}</span></button>`:""}
    <div class="ref-data-grid">
      <section class="ref-panel ref-movements"><div class="ref-panel-title"><span class="ref-panel-icon">${uiIcon("history",21)}</span><div><h2>Movimentações recentes</h2><p>Últimas ações realizadas no sistema</p></div><button class="ref-outline-action" data-open="withdrawals" type="button">Ver todas ${uiIcon("arrow",15)}</button></div><div class="ref-movement-body">${(current||[]).length?renderDashboardMovementRows((current||[]).slice(0,5)):`<div class="ref-empty-movements"><span class="ref-empty-icon">${uiIcon("inbox",48)}</span><strong>Nenhuma retirada encontrada.</strong><p>As movimentações compatíveis com seu perfil aparecem aqui.</p><button type="button" data-open="equipment" class="ref-dark-action">Registrar movimentação ${uiIcon("arrow",15)}</button></div>`}</div></section>
      <section class="ref-panel ref-distribution"><div class="ref-panel-title"><span class="ref-panel-icon">${uiIcon("pie",21)}</span><div><h2>Situação dos equipamentos</h2><p>Visão geral do inventário</p></div><button class="ref-outline-action" data-open="equipment" type="button">Abrir inventário</button></div><div class="ref-distribution-body"><div class="ref-ring" role="img" aria-label="${availablePct}% disponíveis, ${inUsePct}% em uso, ${maintenancePct}% em manutenção" style="--ring-available:${availablePct}%;--ring-use:${availablePct+inUsePct}%;--ring-maint:${availablePct+inUsePct+maintenancePct}%"><div class="ref-ring-center"><strong>${Number(total).toLocaleString("pt-BR")}</strong><span>total</span></div></div><div class="ref-ring-legend"><div><i class="legend-green"></i><span>Disponíveis</span><b>${available}</b><small>${availablePct}%</small></div><div><i class="legend-blue"></i><span>Em uso</span><b>${inUse}</b><small>${inUsePct}%</small></div><div><i class="legend-yellow"></i><span>Atrasadas</span><b>${overdue}</b><small>atenção</small></div><div><i class="legend-red"></i><span>Manutenção</span><b>${maintenance}</b><small>${maintenancePct}%</small></div></div></div></section>
      <section class="ref-panel ref-actions"><div class="ref-panel-title"><span class="ref-panel-icon">${uiIcon("lightning",21)}</span><div><h2>Ações rápidas</h2><p>Acesse as principais funções do sistema</p></div></div><div class="ref-actions-grid">${admin?`<button type="button" class="ref-action ref-action-blue" id="ref-add-equipment"><span>${uiIcon("equipment",21)}</span><strong>Adicionar equipamento</strong><small>Cadastrar novo dispositivo</small>${uiIcon("arrow",15)}</button>`:""}<button type="button" class="ref-action ref-action-green" data-open="equipment"><span>${uiIcon("withdrawals",21)}</span><strong>Registrar retirada</strong><small>Iniciar uma nova retirada</small>${uiIcon("arrow",15)}</button>${admin?`<button type="button" class="ref-action ref-action-orange" data-open="maintenance"><span>${uiIcon("maintenance",21)}</span><strong>Abrir manutenção</strong><small>Registrar manutenção</small>${uiIcon("arrow",15)}</button>`:""}</div></section>
      <section class="ref-panel ref-alerts"><div class="ref-panel-title"><span class="ref-panel-icon icon-alert">${uiIcon("bell",21)}</span><div><h2>Alertas e lembretes</h2><p>Fique atento às pendências</p></div></div><div class="ref-alerts-body">${overdue?`<button class="ref-alert-action" type="button" data-overdue-alert>${uiIcon("warning",27)}<strong>${overdue} retirada(s) atrasada(s)</strong><span>Consulte as devoluções pendentes</span></button>`:`<div class="ref-no-alert">${uiIcon("bell",28)}<strong>Nenhum alerta no momento.</strong><span>Tudo certo por aqui!</span></div>`}</div></section>
    </div>
  </section>

  <section class="mobile-dashboard-organic" aria-label="Visão geral mobile">
    <header class="mobile-home-hero">
      <div class="mobile-home-eyebrow"><span>Hoje</span><small>${esc(today)}</small></div>
      <div class="mobile-home-greeting"><h1>Olá, ${esc(firstName())}</h1><span>${esc(roleLabel(state.profile.role))}</span></div>
      <div class="mobile-home-health">
        <div class="mobile-health-copy"><strong>${Number(available).toLocaleString("pt-BR")}</strong><span>disponíveis de ${Number(total).toLocaleString("pt-BR")}</span><small>${availablePct}% do inventário pronto para uso</small></div>
        <div class="mobile-health-ring" style="--health:${availablePct * 3.6}deg"><div><strong>${availablePct}%</strong><span>livre</span></div></div>
      </div>
      <div class="mobile-home-progress" aria-hidden="true"><i style="width:${availablePct}%"></i><i class="use" style="width:${inUsePct}%"></i><i class="maint" style="width:${maintenancePct}%"></i></div>
    </header>

    ${overdue?`<button class="logistics-overdue" type="button" data-overdue-alert><strong>${overdue} retirada(s) atrasada(s)</strong><span>Consultar pendências</span></button>`:""}
    <section class="mobile-flow-section mobile-now">
      <div class="mobile-section-title"><div><span>AGORA</span><h2>O que está acontecendo</h2></div></div>
      <div class="mobile-stat-flow">
        <button class="mobile-stat-pill" data-go="withdrawals" type="button"><span class="mobile-stat-icon">${icon("withdrawals")}</span><div><strong>${Number(inUse).toLocaleString("pt-BR")}</strong><span>Em uso</span><small>${pendingReturns} para devolver</small></div></button>
        <button class="mobile-stat-pill ${maintenance ? 'attention' : ''}" data-go="${admin?"maintenance":"equipment"}" type="button"><span class="mobile-stat-icon">${icon("maintenance")}</span><div><strong>${Number(maintenance).toLocaleString("pt-BR")}</strong><span>Manutenção</span><small>${maintenance ? 'Exigem atenção' : 'Tudo certo'}</small></div></button>
      </div>
    </section>

    <section class="mobile-flow-section mobile-activity-feed">
      <div class="mobile-section-title"><div><span>ATIVIDADE</span><h2>Movimentações recentes</h2></div><button type="button" data-open="withdrawals">Ver todas</button></div>
      <div class="mobile-activity-list">
        ${recentMobile.length ? recentMobile.map(renderMobileMovementJourney).join("") : `<div class="mobile-empty-state"><span>${icon("history")}</span><strong>Nenhuma movimentação agora</strong><small>As próximas retiradas vão aparecer aqui.</small></div>`}
      </div>
    </section>
  </section>`);

  qsa("[data-go],[data-open]").forEach(b => b.addEventListener("click", () => navigate(b.dataset.go || b.dataset.open)));
  qsa("[data-withdrawal-id]").forEach(b=>b.addEventListener("click",()=>openWithdrawalDetail(b.dataset.withdrawalId)));
  qs("#ref-add-equipment")?.addEventListener("click",()=>window.EquipaInventory?.openHub("individual"));
}
function closeContextMenu(){qs("#equipa-context-menu")?.remove()}
function openContextMenu(x,y,items=[]){
  closeContextMenu();if(!items.length)return;
  const menu=document.createElement("div");menu.id="equipa-context-menu";menu.className="context-menu";
  menu.innerHTML=items.map((item,i)=>item.separator?`<div class="context-separator"></div>`:`<button type="button" data-context-index="${i}" class="${item.danger?'danger':''}"><span class="context-icon">${contextActionIcon(item.icon||'view')}</span><div><strong>${esc(item.label)}</strong><small>${esc(item.hint||'')}</small></div></button>`).join("");
  document.body.append(menu);const rect=menu.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(x,innerWidth-rect.width-10))}px`;menu.style.top=`${Math.max(8,Math.min(y,innerHeight-rect.height-10))}px`;
  qsa("[data-context-index]",menu).forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();const item=items[Number(b.dataset.contextIndex)];closeContextMenu();item?.action?.()}));
  const outside=e=>{if(menu.contains(e.target))return;document.removeEventListener("pointerdown",outside,true);closeContextMenu()};
  setTimeout(()=>document.addEventListener("pointerdown",outside,true),0);
}
async function deleteEquipment(id){
  if(state.profile?.role!=="admin")return notify("Somente o administrador pode remover equipamentos.","error");
  let item;
  try { item=await getEquipment(id); }
  catch(error){ return notify(errText(error),"error"); }
  const ok=await confirmAction({
    title:"Apagar equipamento do inventário?",
    message:`${item.label||item.code}: um cadastro novo, sem vínculos, será excluído definitivamente. Se já possui histórico escolar, sairá do inventário ativo e o histórico será mantido. Retiradas e manutenções abertas devem ser encerradas antes.`,
    confirmText:"Apagar do inventário",danger:true
  });
  if(!ok)return;
  let data,error;
  try { ({data,error}=await supabase.rpc("remove_equipment",{p_equipment_id:id})); }
  catch(failure){error=failure;}
  if(error)return notify(errText(error),"error");
  notify(data?.mode==="deleted"?"Cadastro sem histórico excluído definitivamente.":"Equipamento retirado do inventário ativo; histórico escolar preservado.","success");
  state.equipmentPage=0;
  return renderEquipment();
}
function contextActionIcon(name){
  const paths={
    view:'<circle cx="11" cy="11" r="3"/><path d="M2 11s3.6-7 9-7 9 7 9 7-3.6 7-9 7-9-7-9-7Z"/>',
    edit:'<path d="m15 5 4 4M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/>',
    delete:'<path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/>',
    reserve:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h8"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>'
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7">${paths[name]||paths.view}</svg>`;
}
function bindEquipmentContextMenus(){ /* contexto tratado por delegação global */ }
function equipmentRows(rows) {
  if(!rows.length)return `<div class="empty ref-inventory-empty">${uiIcon("inbox",34)}<strong>Nenhum equipamento encontrado.</strong><span>Altere os filtros para consultar o inventário.</span></div>`;
  return `<div class="ref-inventory-table-wrap"><table class="ref-inventory-table"><thead><tr><th><input type="checkbox" id="equip-select-all" aria-label="Selecionar equipamentos desta página"></th><th>CÓDIGO</th><th>PATRIMÔNIO</th><th>MODELO</th><th>LOCALIZAÇÃO</th><th>SITUAÇÃO</th><th>ÚLTIMA ATIVIDADE</th><th>AÇÕES</th></tr></thead><tbody>${rows.map(e=>`<tr class="equipment-row" data-equipment="${esc(e.id)}" tabindex="0"><td><input type="checkbox" class="equip-row-select" value="${esc(e.id)}" aria-label="Selecionar ${esc(e.code)}"></td><td><div class="ref-equipment-cell"><span class="ref-equipment-icon">${uiIcon("equipment",19)}</span><div><strong>${esc(e.code)}</strong><small>${esc(e.label||schoolGroupLabel(e.school_group))}</small></div></div></td><td>${e.asset_tag?`<span class="ref-patrimony">${esc(e.asset_tag)}</span>`:`<span class="ref-patrimony ref-none">Não definido</span>`}</td><td>${esc(e.model||"Não informado")}</td><td><span class="ref-location">${uiIcon("tag",14)}${esc(e.location_text||"Não informada")}</span></td><td><span class="ref-state ref-state-${esc(e.status)}"><i></i>${esc(statusLabel(e.status))}</span></td><td>${esc(dt(e.updated_at))}</td><td><button type="button" class="ref-row-more" data-item-menu="${esc(e.id)}" aria-label="Ações de ${esc(e.code)}">···</button></td></tr>`).join("")}</tbody></table></div>`;
}

function bindEquipmentRowClicks(root = document) { qsa("[data-equipment]", root).forEach(r => {r.addEventListener("click",e=>{if(e.target.closest("input,[data-item-menu]"))return;openEquipment(r.dataset.equipment)});r.addEventListener("keydown",e=>{if(e.target===r&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openEquipment(r.dataset.equipment)}})}); bindEquipmentContextMenus(root); }
document.addEventListener("click",e=>{if(e.target.closest?.("[data-overdue-alert]")){state.withdrawalsStatus="overdue";navigate("withdrawals");}});
function installGlobalContextMenus(){
  if(document.documentElement.dataset.contextReady)return;
  document.documentElement.dataset.contextReady="1";
  document.addEventListener("contextmenu",e=>{
    if(!state.profile)return;
    const admin=state.profile.role==="admin";
    const equipment=e.target.closest?.("[data-equipment]");
    if(equipment){
      e.preventDefault();e.stopPropagation();const id=equipment.dataset.equipment;
      const items=[{icon:"view",label:"Ver equipamento",hint:"Dados e disponibilidade",action:()=>openEquipment(id)}];
      if(admin){
        items.push({icon:"edit",label:"Editar",hint:"Atualizar o cadastro",action:async()=>{try{openEquipmentForm(await getEquipment(id))}catch(error){notify(errText(error),"error")}}});
        items.push({icon:"delete",label:"Apagar",hint:"Excluir cadastro ou retirar do inventário",danger:true,action:()=>deleteEquipment(id)});
      }else{
      }
      openContextMenu(e.clientX,e.clientY,items);return;
    }
    const cart=e.target.closest?.("[data-cart-record]");
    if(cart){
      e.preventDefault();e.stopPropagation();let record={};try{record=JSON.parse(cart.dataset.cartRecord||"{}")}catch{}
      const items=[{icon:"view",label:"Abrir carrinho",hint:"Ver e selecionar equipamentos",action:()=>openCart(record.qr_token)}];
      if(admin){
        items.push({icon:"edit",label:"Editar",hint:"Alterar dados e itens",action:()=>openCartForm(record)});
        items.push({icon:"delete",label:"Desativar",hint:"Retirar da operação",danger:true,action:()=>deactivateCart(record)});
      }
      openContextMenu(e.clientX,e.clientY,items);return;
    }
    const user=e.target.closest?.("[data-user]");
    if(user&&admin){
      e.preventDefault();e.stopPropagation();let record={};try{record=JSON.parse(user.dataset.user||"{}")}catch{}
      openContextMenu(e.clientX,e.clientY,[
        {icon:"edit",label:"Editar usuário",hint:"Nome e cargo",action:()=>openUserForm(record)},
        {icon:record.is_active?"delete":"unlock",label:record.is_active?"Remover acesso":"Restaurar acesso",hint:"Gerenciar permissão",danger:record.is_active,action:()=>adminUserAction(record,record.is_active?"remove":"restore")},
        {icon:record.is_banned?"unlock":"lock",label:record.is_banned?"Desbanir":"Banir",hint:"Gerenciar bloqueio",danger:!record.is_banned,action:()=>record.is_banned?adminUserAction(record,"unban"):openBanUser(record)}
      ]);
    }
  },true);
}
function bindCommittedSearch(input,onCommit){
 if(!input)return;
 let last=String(input.value||''),composing=false;
 const commit=()=>{if(composing)return;const value=String(input.value||'');if(value===last)return;last=value;onCommit(value)};
 input.addEventListener('compositionstart',()=>composing=true);
 input.addEventListener('compositionend',()=>composing=false);
 input.addEventListener('change',commit);
 input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){
   event.preventDefault();commit();input.blur();
 }});
}
function cleanSearch(value) { return String(value || "").replace(/[,%()]/g, " ").trim().slice(0,80); }
function normalizeSearchText(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function searchTokens(value = "") { return normalizeSearchText(value).split(/\s+/).filter(Boolean).slice(0, 8); }
function smartScore(fields, query) {
  const normalizedFields = fields.map(normalizeSearchText).filter(Boolean);
  const joined = normalizedFields.join(" ");
  const normalizedQuery = normalizeSearchText(query);
  const tokens = searchTokens(query);
  if (!tokens.length) return 1;
  let score = 0;
  for (const token of tokens) {
    let tokenScore = 0;
    for (const field of normalizedFields) {
      if (!field) continue;
      if (field === token) tokenScore = Math.max(tokenScore, 120);
      else if (field.startsWith(token)) tokenScore = Math.max(tokenScore, 90);
      else if (field.includes(` ${token}`)) tokenScore = Math.max(tokenScore, 62);
      else if (field.includes(token)) tokenScore = Math.max(tokenScore, 42);
    }
    if (!tokenScore && joined.includes(token)) tokenScore = 26;
    if (!tokenScore) return 0;
    score += tokenScore;
  }
  if (normalizedQuery && joined === normalizedQuery) score += 110;
  else if (normalizedQuery && joined.startsWith(normalizedQuery)) score += 45;
  return score;
}
function smartFilter(rows, query, fieldsGetter) {
  const q = cleanSearch(query || "");
  if (!q) return rows;
  return rows.map(row => ({ row, score: smartScore(fieldsGetter(row), q) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.row);
}
function activeFilterCount(values = []) { return values.filter(v => v !== null && v !== undefined && String(v).trim() !== "").length; }
function filterBadge(count) { return count ? `<span class="filter-count">${count}</span>` : ""; }
function wireFilterToggle(toggleId, panelId) {
  const btn = qs(`#${toggleId}`); const panel = qs(`#${panelId}`);
  if (!btn || !panel) return;
  if (!qs(".filter-sheet-head",panel)) panel.insertAdjacentHTML("afterbegin",`<div class="filter-sheet-head"><div><span>Filtros</span><strong>Refine os resultados</strong></div><button type="button" class="filter-sheet-close" aria-label="Fechar filtros" title="Fechar filtros">×</button></div>`);
  const marker=document.createComment(`equipa-filter-${panelId}`);
  const restorePanel=()=>{ if(marker.parentNode){ marker.parentNode.insertBefore(panel,marker); marker.remove(); } };
  const removeShade=()=>{const shade=qs("#filter-mobile-shade");shade?.remove();document.body.classList.remove("filter-sheet-open")};
  const setOpen=open=>{
    const mobile=matchMedia("(max-width:820px)").matches;
    if(open&&mobile){
      if(!marker.parentNode) panel.parentNode?.insertBefore(marker,panel);
      document.body.append(panel);
      qs("#filter-mobile-shade")?.remove();
      const shade=document.createElement("button");shade.type="button";shade.id="filter-mobile-shade";shade.className="filter-mobile-shade";shade.setAttribute("aria-label","Fechar filtros");document.body.append(shade);shade.addEventListener("click",()=>setOpen(false));document.body.classList.add("filter-sheet-open");
      panel.classList.add("open");btn.classList.add("active");btn.setAttribute("aria-expanded","true");requestAnimationFrame(()=>shade.classList.add("open"));return;
    }
    panel.classList.toggle("open",open);btn.classList.toggle("active",open);btn.setAttribute("aria-expanded",open?"true":"false");
    if(!open){removeShade();restorePanel()}
  };
  btn.addEventListener("click",()=>setOpen(!panel.classList.contains("open")));
  qs(".filter-sheet-close",panel)?.addEventListener("click",()=>setOpen(false));
  panel.querySelectorAll("[id$='filter-apply'],[id$='filter-clear'],#history-filter,#history-filter-clear,#audit-apply,#audit-clear").forEach(x=>x.addEventListener("click",()=>setOpen(false)));
}
function currentGlobalSearchValue() { return ({
  equipment: state.equipmentSearch,
  withdrawals: state.withdrawalsSearch,
  history: state.historySearch,
  maintenance: state.maintenanceSearch,
  carts: state.cartSearch,
  audit: state.auditSearch,
  admin: state.adminUserSearch
})[state.view] || ""; }
function mobilePrincipalSearchActive(){ return window.matchMedia?.("(max-width: 820px)")?.matches === true; }
let mobilePrincipalSearchTimer=0;
function applyMobilePrincipalSearch(value,{commit=false}={}){
  const term=cleanSearch(value||"");
  clearTimeout(mobilePrincipalSearchTimer);
  const run=()=>{
    if(state.view==="equipment"){ state.equipmentSearch=term;state.equipmentPage=0;return refreshEquipmentSearch(); }
    if(state.view==="withdrawals"){ state.withdrawalsSearch=term;return paintOperationalSnapshot(); }
    if(state.view==="history"){ state.historySearch=term;return loadHistory(term); }
    if(state.view==="audit"){ state.auditSearch=term;state.auditPage=0;return loadAudit(); }
    if(state.view==="admin"){ state.adminUserSearch=term;state.adminUserPage=0;return loadAdminUsers(); }
    if(state.view==="carts"){
      state.cartSearch=term;state.cartPage=0;
      if(commit){ const local=qs("#cart-search");if(local){local.value=term;local.dispatchEvent(new Event("change",{bubbles:true}));} }
      return;
    }
    if(state.view==="maintenance"){
      state.maintenanceSearch=term;
      if(commit){ const local=qs("#maintenance-search");if(local){local.value=term;local.dispatchEvent(new Event("change",{bubbles:true}));} }
      return;
    }
    if(commit&&term)runSmartGlobalSearch(term);
  };
  if(commit)return run();
  mobilePrincipalSearchTimer=setTimeout(run,220);
}

function routeFromSearch(query) {
  const q = normalizeSearchText(query);
  if (!q) return "equipment";
  if (/carrinho|lote|qr/.test(q)) return "carts";
  if (/manut|oficina|conserto/.test(q)) return "maintenance";
  if ((/usuario|usuário|cargo|banco|capacidade/.test(q)) && state.profile?.role === "admin") return "admin";
  if (/retirada|devolu|turma|aluno|destino|responsavel/.test(q)) return "withdrawals";
  return "equipment";
}
function runSmartGlobalSearch(query) {
  const term = cleanSearch(query || "");
  const view = routeFromSearch(term);
  if (view === "equipment") { state.equipmentSearch = term; state.equipmentPage = 0; }
  else if (view === "withdrawals") state.withdrawalsSearch = term;
  else if (view === "maintenance") state.maintenanceSearch = term;
  else if (view === "carts") state.cartSearch = term;
  navigate(view);
}
let smartCatalogCache={at:0,viewer:null,entries:[],pending:null};
async function getSmartCatalog(){
 const viewer=String(state.session?.user?.id||"")+":"+String(state.profile?.role||"");
 if(smartCatalogCache.viewer!==viewer)smartCatalogCache={at:0,viewer,entries:[],pending:null};
 if(smartCatalogCache.entries.length&&Date.now()-smartCatalogCache.at<120000)return smartCatalogCache.entries;
 if(smartCatalogCache.pending)return smartCatalogCache.pending;
 smartCatalogCache.pending=(async()=>{
  const [devices,groups,people]=await Promise.all([
   supabase.from("equipments").select("code,label,brand,model,asset_tag,location_text").eq("is_active",true).order("code").limit(300),
   supabase.from("withdrawals").select("class_name,destination,custodian_name,recorded_by_name,student_name").order("created_at",{ascending:false}).limit(100),
   state.profile?.role==="admin"?supabase.from("profiles").select("full_name,role").eq("is_active",true).limit(100):Promise.resolve({data:[]})
  ]);
  const options=[];
  for(const e of devices.data||[]){options.push({kind:"Equipamento",value:e.code,description:[e.brand,e.model,e.label,e.asset_tag].filter(Boolean).join(" · "),target:"equipment"});if(e.location_text)options.push({kind:"Local",value:e.location_text,description:"Localização do equipamento",target:"withdrawals"});}
  for(const e of devices.data||[])if(e.model)options.push({kind:"Modelo",value:e.model,description:e.brand||"Modelo cadastrado",target:"equipment"});
  for(const g of groups.data||[]){
   if(g.class_name)options.push({kind:"Turma",value:g.class_name,description:"Turma de uma retirada acessível",target:"withdrawals"});
   if(g.destination)options.push({kind:"Local",value:g.destination,description:"Destino de retirada",target:"withdrawals"});
   for(const name of [g.custodian_name,g.recorded_by_name,g.student_name])if(name)options.push({kind:"Pessoa",value:name,description:"Pessoa citada em retirada acessível · identidade não verificada nesta busca",target:"withdrawals"});
  }
  for(const p of people.data||[])if(p.full_name)options.push({kind:"Pessoa",value:p.full_name,role:p.role,description:withdrawalRoleLabel(p.role),target:"withdrawals"});
  const seen=new Set();const visible=options.filter(o=>{const key=o.kind+normalizeSearchText(o.value);if(seen.has(key))return false;seen.add(key);return true;});
  if(smartCatalogCache.viewer===viewer){smartCatalogCache.entries=visible;smartCatalogCache.at=Date.now();}return smartCatalogCache.viewer===viewer?visible:[];
 })().finally(()=>{smartCatalogCache.pending=null;});return smartCatalogCache.pending;
}
function bindSmartSearch(input,{onSelect,kind}={}){
 if(!input||input.dataset.smartBound||input.type==="password"||input.type==="email")return;
 input.dataset.smartBound="1";input.setAttribute("autocomplete","off");
 const box=document.createElement("div");box.className="smart-suggestions";box.id="smart-"+uid();box.hidden=true;box.setAttribute("role","listbox");input.setAttribute("aria-controls",box.id);input.setAttribute("aria-expanded","false");
 const wrap=document.createElement("div");wrap.className="smart-anchor";input.parentNode.insertBefore(wrap,input);wrap.append(input,box);
 let generation=0;
 const close=()=>{box.hidden=true;input.setAttribute("aria-expanded","false")};
 const show=async()=>{
  const q=input.value.trim();const seq=++generation;if(q.length<2){close();return;}
  const expectedViewer=String(state.session?.user?.id||"")+":"+String(state.profile?.role||"");const entries=await getSmartCatalog();if(seq!==generation||!input.isConnected||document.activeElement!==input||expectedViewer!==String(state.session?.user?.id||"")+":"+String(state.profile?.role||""))return;
  const matched=entries.map(x=>({x,score:smartScore([x.value,x.description,x.kind],q)})).filter(y=>y.score>0&&(!kind||kind===y.x.kind)).sort((a,b)=>b.score-a.score).slice(0,7);
  if(!matched.length){close();return;}
  box.innerHTML=matched.map(({x},i)=>`<button type="button" role="option" id="${box.id}-item-${i}" data-smart-index="${i}"><b>${esc(x.value)}</b><small>${esc(x.kind)} · ${esc(x.description)}</small></button>`).join("");
  box.hidden=false;input.setAttribute("aria-expanded","true");
  qsa("[data-smart-index]",box).forEach(b=>b.addEventListener("pointerdown",ev=>ev.preventDefault()));
  qsa("[data-smart-index]",box).forEach(b=>b.addEventListener("click",()=>{const entry=matched[Number(b.dataset.smartIndex)]?.x;if(!entry)return;input.value=entry.value;close();input.dispatchEvent(new Event("change",{bubbles:true}));input.dispatchEvent(new Event("input",{bubbles:true}));onSelect?.(entry);}));
 };
 let timer;input.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(show,240)});
 input.addEventListener("focus",show);input.addEventListener("keydown",e=>{if(e.key==="Escape")close();});
 input.addEventListener("blur",()=>setTimeout(close,110));
}
function setupSmartInputs(root=document){
 qsa('input[type="search"],input.search,input[id$="-search"],input[id$="-smart"],input[id^="h-"],input[name="class_name"],input[name="destination"],input[name="holder_name"],#equipment-location,#equipment-model-filter',root).forEach(input=>{
  if(input.closest('.auth-shell')||input.type==="password"||input.type==="email")return;
  const kind=input.name==="class_name"||input.id==="h-class"?"Turma":input.name==="destination"||input.id==="equipment-location"?"Local":input.name==="holder_name"||["h-person","h-student"].includes(input.id)?"Pessoa":input.id==="h-equipment"||input.id==="withdrawal-pick-search"?"Equipamento":input.id==="equipment-model-filter"?"Modelo":null;
  bindSmartSearch(input,{kind,onSelect:entry=>{
   if(input.id==="global-search"){
    if(mobilePrincipalSearchActive()){
      applyMobilePrincipalSearch(entry.value,{commit:true});
    }else{
      if(entry.target==="equipment")state.equipmentSearch=entry.value;
      if(entry.target==="withdrawals")state.withdrawalsSearch=entry.value;
      navigate(entry.target||routeFromSearch(entry.value));
    }
   }
   if(input.name==="holder_name"&&entry.kind==="Pessoa"){
    const field=input.closest("form")?.elements.holder_role;
    const targetRole=entry.role;
    if(field&&["student","teacher","staff"].includes(targetRole))field.value=targetRole;
   }
  }});
 });
}
let equipmentSearchGeneration=0;
async function refreshEquipmentSearch(){
 const host=qs('#equipment-results'),counter=qs('#equipment-count');if(!host||state.view!=='equipment')return;
 const generation=++equipmentSearchGeneration;
 const from=state.equipmentPage*config.pageSize,to=from+config.pageSize-1;
 let query=supabase.from('equipments').select('id,code,asset_tag,brand,model,label,school_group,serial_number,location_text,notes,status,is_active,created_at,updated_at,qr_token',{count:'exact'});
 if(state.equipmentFilters.active==='active')query=query.eq('is_active',true);
 if(state.equipmentFilters.active==='inactive')query=query.eq('is_active',false);
 if(state.equipmentFilters.status)query=query.eq('status',state.equipmentFilters.status);
 if(state.equipmentFilters.group)query=query.eq('school_group',state.equipmentFilters.group);
 if(state.equipmentFilters.location)query=query.ilike('location_text',`*${state.equipmentFilters.location.replace(/[%*,()]/g,' ').trim()}*`);
 if(state.equipmentFilters.model)query=query.ilike('model',`*${state.equipmentFilters.model.replace(/[%*,()]/g,' ').trim()}*`);
 const search=cleanSearch(state.equipmentSearch).replace(/[.,()'":;%*\\]/g,' ').trim();
 if(search)query=query.or(['code','asset_tag','label','brand','model','serial_number','location_text'].map(column=>`${column}.ilike.*${search}*`).join(','));
 const result=await (state.equipmentSort==='recent'?query.order('updated_at',{ascending:false}):query.order('code')).range(from,to);
 if(generation!==equipmentSearchGeneration||state.view!=='equipment'||!host.isConnected)return;
 const rows=result.data||[],count=result.count||0;
 if(counter)counter.textContent=`${count} equipamento${count===1?' encontrado':'s encontrados'}`;
 if(result.error){host.innerHTML=`<div class="empty"><strong>Não foi possível buscar.</strong><span>${esc(errText(result.error))}</span></div>`;return;}
 host.innerHTML=`${equipmentRows(rows)}<div class="pagination"><span>Exibindo ${count===0?0:from+1} a ${Math.min(count,to+1)} de ${count} equipamento${count===1?'':'s'}</span><div><button class="button small" id="prev" ${state.equipmentPage===0?'disabled':''}>‹</button><span class="ref-pagination-current">${state.equipmentPage+1}</span><button class="button small" id="next" ${to+1>=count?'disabled':''}>›</button></div></div>`;
 bindEquipmentRowClicks(host);
 qs('#prev',host)?.addEventListener('click',()=>{state.equipmentPage--;refreshEquipmentSearch()});
 qs('#next',host)?.addEventListener('click',()=>{state.equipmentPage++;refreshEquipmentSearch()});
 qsa('.equip-row-select',host).forEach(cb=>cb.addEventListener('click',e=>e.stopPropagation()));
 qsa('[data-item-menu]',host).forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const row=btn.closest('[data-equipment]');row?.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:btn.getBoundingClientRect().right-8,clientY:btn.getBoundingClientRect().bottom+2}))}));
 const selectAll=qs('#equip-select-all',host);
 selectAll?.addEventListener('change',e=>qsa('.equip-row-select',host).forEach(cb=>cb.checked=e.target.checked));
 const update=()=>{const selected=qsa('.equip-row-select:checked',host),btn=qs('#equipment-label-selected');if(btn){btn.hidden=!selected.length;btn.textContent=`PDF dos selecionados (${selected.length})`}};
 qsa('.equip-row-select',host).forEach(cb=>cb.addEventListener('change',update));selectAll?.addEventListener('change',update);
 const oldLabels=qs('#equipment-label-selected');oldLabels?.replaceWith(oldLabels.cloneNode(true));
 qs('#equipment-label-selected')?.addEventListener('click',()=>{const ids=new Set(qsa('.equip-row-select:checked',host).map(cb=>cb.value));const chosen=rows.filter(row=>ids.has(row.id));if(chosen.length)window.EquipaInventory?.downloadLabels(chosen,'Equipa-etiquetas-selecionadas')},{once:true});
}
async function renderEquipment() {
  ++equipmentSearchGeneration;
  state.view = "equipment";
  const admin = state.profile.role === "admin";
  const from = state.equipmentPage * config.pageSize;
  const to = from + config.pageSize - 1;
  const filterCount = activeFilterCount([state.equipmentFilters.status, state.equipmentFilters.active==="active" ? "" : state.equipmentFilters.active, state.equipmentFilters.group]);
  shell(`<section class="ref-equipment-page"><div class="ref-page-heading compact-page-actions"><h1 class="visually-hidden">Equipamentos</h1><div class="ref-heading-actions">${admin?`<button class="ref-outline-action" id="inventory-labels">${uiIcon("tag",18)} Etiquetas PDF</button><button class="ref-outline-action" id="import-equipment">${uiIcon("upload",18)} Importar</button><button class="ref-primary-action" id="new-equipment">${uiIcon("plus",19)} Cadastrar equipamento</button>`:""}</div></div>
  <div class="ref-search-panel"><div class="ref-search-line"><label class="ref-search-control">${uiIcon("search",20)}<input class="search" id="equipment-search" type="search" value="${esc(state.equipmentSearch)}" placeholder="Buscar por código, patrimônio, modelo, localização ou situação..."></label><button type="button" class="ref-outline-action" id="equipment-reset">${uiIcon("rotate",17)} Limpar filtros</button><button class="ref-filter-action" id="equipment-filter-toggle" type="button" aria-expanded="true">${uiIcon("filter",17)} Filtros ${filterBadge(filterCount)}</button></div><div class="filter-drawer ref-equipment-filters" id="equipment-filter-panel"><div class="filter-grid"><label>Situação<select id="equipment-status"><option value="">Todas</option><option value="available" ${state.equipmentFilters.status==='available'?'selected':''}>Disponível</option><option value="in_use" ${state.equipmentFilters.status==='in_use'?'selected':''}>Em uso</option><option value="maintenance" ${state.equipmentFilters.status==='maintenance'?'selected':''}>Manutenção</option><option value="unavailable" ${state.equipmentFilters.status==='unavailable'?'selected':''}>Indisponível</option></select></label><label>Tipo<select id="equipment-group"><option value="">Todos</option>${schoolGroupOptions(state.equipmentFilters.group)}</select></label><label>Localização<input id="equipment-location" value="${esc(state.equipmentFilters.location||"")}" placeholder="Todas as localizações"></label><label>Modelo<input id="equipment-model-filter" value="${esc(state.equipmentFilters.model||"")}" placeholder="Todos os modelos"></label><label class="ref-hidden-active">Catálogo<select id="equipment-active"><option value="active" ${state.equipmentFilters.active==='active'?'selected':''}>Ativos</option><option value="">Todos</option><option value="inactive" ${state.equipmentFilters.active==='inactive'?'selected':''}>Inativos</option></select></label></div><div class="filter-actions"><button type="button" class="button small ghost" id="equipment-filter-clear">Limpar</button><button type="button" class="button small primary" id="equipment-filter-apply">Aplicar filtros</button></div></div></div>
  <section class="ref-results-panel"><header class="ref-results-heading"><strong id="equipment-count">Consultando equipamentos...</strong><div class="ref-display-controls"><button id="equipment-label-selected" type="button" class="ref-outline-action" hidden>PDF dos selecionados</button><button type="button" class="ref-display-button active" id="equip-list-view" aria-label="Visualização em lista">${uiIcon("list",19)}</button><button type="button" class="ref-display-button" id="equip-grid-view" aria-label="Visualização em grade">${uiIcon("grid",19)}</button><select id="equipment-sort" aria-label="Ordenar equipamentos"><option value="code">Código</option><option value="recent">Mais recentes</option></select></div></header><div id="equipment-results"><div class="loading">Carregando equipamentos…</div></div></section></section>`);
  const host = qs("#equipment-results");
  const search = cleanSearch(state.equipmentSearch);
  const fields="id,code,asset_tag,brand,model,label,school_group,serial_number,location_text,notes,status,is_active,created_at,updated_at,qr_token";
  let query=supabase.from("equipments").select(fields,{count:"exact"});
  if(state.equipmentFilters.active==="active")query=query.eq("is_active",true);
  if(state.equipmentFilters.active==="inactive")query=query.eq("is_active",false);
  if(state.equipmentFilters.status)query=query.eq("status",state.equipmentFilters.status);
  if(state.equipmentFilters.group)query=query.eq("school_group",state.equipmentFilters.group);
  if(state.equipmentFilters.location)query=query.ilike("location_text",`*${state.equipmentFilters.location.replace(/[%*,()]/g," ").trim()}*`);
  if(state.equipmentFilters.model)query=query.ilike("model",`*${state.equipmentFilters.model.replace(/[%*,()]/g," ").trim()}*`);
  if(search){
    const q=search.replace(/[.,()'":;%*\\]/g," ").trim();
    if(q){
      const columns=["code","asset_tag","label","brand","model","serial_number","location_text"];
      query=query.or(columns.map(column=>`${column}.ilike.*${q}*`).join(","));
    }
  }
  const result=await (state.equipmentSort==="recent"?query.order("updated_at",{ascending:false}):query.order("code")).range(from,to);
  const rows=result.data||[];
  const count=result.count||0;
  const error=result.error;
  qs("#equipment-count").textContent = `${count} equipamento${count===1?" encontrado":"s encontrados"}`;
  if (error) host.innerHTML = `<div class="empty"><strong>Não foi possível carregar.</strong><span>${esc(errText(error))}</span></div>`;
  else host.innerHTML = `${equipmentRows(rows || [])}<div class="pagination"><span>Exibindo ${count===0?0:from+1} a ${Math.min(count,to+1)} de ${count} equipamento${count===1?"":"s"}</span><div><button class="button small" id="prev" ${state.equipmentPage===0?"disabled":""}>‹</button><span class="ref-pagination-current">${state.equipmentPage+1}</span><button class="button small" id="next" ${to+1>=(count||0)?"disabled":""}>›</button></div></div>`;
  bindEquipmentRowClicks(host);
  qs("#prev")?.addEventListener("click",()=>{state.equipmentPage--;renderEquipment()});
  qs("#next")?.addEventListener("click",()=>{state.equipmentPage++;renderEquipment()});
  let timer;
  qs("#equipment-search")?.addEventListener("input", e => {
    clearTimeout(timer);state.equipmentSearch=e.target.value;state.equipmentPage=0;
    timer=setTimeout(refreshEquipmentSearch,430);
  });
  if(matchMedia("(min-width:821px)").matches) qs("#equipment-filter-panel")?.classList.add("open");
  wireFilterToggle("equipment-filter-toggle", "equipment-filter-panel");
  const applyRefFilters=()=>{state.equipmentFilters.status=qs("#equipment-status")?.value||"";state.equipmentFilters.active=qs("#equipment-active")?.value||"";state.equipmentFilters.group=qs("#equipment-group")?.value||"";state.equipmentFilters.location=qs("#equipment-location")?.value.trim()||"";state.equipmentFilters.model=qs("#equipment-model-filter")?.value.trim()||"";state.equipmentPage=0;renderEquipment()};
  qs("#equipment-filter-apply")?.addEventListener("click",applyRefFilters);
  ["#equipment-status","#equipment-group","#equipment-active","#equipment-location","#equipment-model-filter"].forEach(sel=>qs(sel)?.addEventListener("change",()=>{if(matchMedia("(min-width:821px)").matches)applyRefFilters()}));
  ["#equipment-location","#equipment-model-filter"].forEach(sel=>qs(sel)?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();applyRefFilters()}}));
  const clearRefFilters=()=>{state.equipmentFilters={status:"",active:"active",group:"",location:"",model:""};state.equipmentSearch="";state.equipmentPage=0;renderEquipment()};
  qs("#equipment-filter-clear")?.addEventListener("click",clearRefFilters);
  qs("#equipment-reset")?.addEventListener("click",clearRefFilters);
  qs("#equipment-sort").value=state.equipmentSort||"code";
  qs("#equipment-sort")?.addEventListener("change",e=>{state.equipmentSort=e.target.value;state.equipmentPage=0;renderEquipment()});
  qs("#equip-grid-view")?.addEventListener("click",()=>{qs(".ref-inventory-table-wrap")?.classList.add("ref-compact-grid");qs("#equip-grid-view")?.classList.add("active");qs("#equip-list-view")?.classList.remove("active")});
  qs("#equip-list-view")?.addEventListener("click",()=>{qs(".ref-inventory-table-wrap")?.classList.remove("ref-compact-grid");qs("#equip-list-view")?.classList.add("active");qs("#equip-grid-view")?.classList.remove("active")});
  qs("#equip-select-all")?.addEventListener("change",e=>qsa(".equip-row-select",host).forEach(cb=>cb.checked=e.target.checked));
  const updateSelectedLabels=()=>{const selected=qsa(".equip-row-select:checked",host);const btn=qs("#equipment-label-selected");if(btn){btn.hidden=!selected.length;btn.textContent=`PDF dos selecionados (${selected.length})`}};
  qsa(".equip-row-select",host).forEach(cb=>{cb.addEventListener("click",e=>e.stopPropagation());cb.addEventListener("change",updateSelectedLabels)});
  qs("#equip-select-all")?.addEventListener("change",updateSelectedLabels);
  qs("#equipment-label-selected")?.addEventListener("click",()=>{const ids=new Set(qsa(".equip-row-select:checked",host).map(cb=>cb.value));const chosen=rows.filter(row=>ids.has(row.id));if(chosen.length)window.EquipaInventory?.downloadLabels(chosen,"Equipa-etiquetas-selecionadas")});
  qsa("[data-item-menu]",host).forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const row=btn.closest("[data-equipment]");row?.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:btn.getBoundingClientRect().right-8,clientY:btn.getBoundingClientRect().bottom+2}))}));
  qs("#new-equipment")?.addEventListener("click",()=>window.EquipaInventory.openHub("individual"));
  qs("#inventory-labels")?.addEventListener("click",()=>window.EquipaInventory.chooseLabels());
  qs("#import-equipment")?.addEventListener("click",()=>window.EquipaInventory.openHub("import"));
}
async function getEquipment(id) { const { data, error } = await supabase.from("equipments").select("*").eq("id",id).single(); if(error) throw error; return data; }
async function openEquipment(id) {
  let e; try { e = await getEquipment(id); } catch(error) { return notify(errText(error),"error"); }
  const admin = state.profile.role === "admin";
  const modal = makeModal(`<div class="panel-head"><div><span class="eyebrow">${esc(e.code)}</span><h2>${esc(e.label || `${e.brand} ${e.model}`)}</h2></div><button class="icon-button" data-close>×</button></div><div class="modal-body"><div class="detail-grid">${detail("Estado",statusLabel(e.status))}${detail("Grupo",schoolGroupLabel(e.school_group))}${detail("Patrimônio",e.asset_tag)}${detail("Número de série",e.serial_number)}${detail("Marca",e.brand)}${detail("Modelo",e.model)}${detail("Local",e.location_text)}${detail("Atualizado",dt(e.updated_at))}</div>${e.notes?`<div class="equipment-notes"><span>Observações</span><p>${esc(e.notes)}</p></div>`:""}<div class="modal-actions"><button class="button ghost" data-qr>QR Code</button>${e.status==="available"&&e.is_active?`<button class="button primary" data-checkout>Retirar</button>`:""}${e.status==="in_use"?`<button class="button primary" data-return>Registrar devolução</button>`:""}${admin && !["in_use","maintenance"].includes(e.status)?`<button class="button ghost" data-maintenance>Manutenção</button>`:""}${admin?`<button class="button ghost" data-edit>Editar</button><button class="button danger-solid" data-delete type="button">Apagar</button>`:""}</div></div>`, true);
  qs("[data-qr]",modal)?.addEventListener("click",()=>openQrModal(e.qr_token,e.label||e.code,`${schoolGroupLabel(e.school_group)} · ${e.brand} ${e.model}`));
  qs("[data-checkout]",modal)?.addEventListener("click",()=>{modal.remove();openCheckoutModal([e])});
  qs("[data-return]",modal)?.addEventListener("click",async()=>{const b=qs("[data-return]",modal);setBusy(b,true,"Registrando…");const {error}=await supabase.rpc("return_equipment",{p_equipment_id:e.id,p_client_action_id:uid()});setBusy(b,false);if(error)return notify(errText(error),"error");invalidateEquipaActivity();notify("Devolução registrada com data e horário.","success");modal.remove();navigate("withdrawals")});
  qs("[data-maintenance]",modal)?.addEventListener("click",()=>{modal.remove();openMaintenanceModal(e)});
  qs("[data-edit]",modal)?.addEventListener("click",()=>{modal.remove();openEquipmentForm(e)});
  qs("[data-delete]",modal)?.addEventListener("click",()=>{modal.remove();deleteEquipment(e.id)});
}
function openEquipmentForm(item=null) {
  const m = makeModal(`<div class="panel-head"><div><span class="eyebrow">Administração</span><h2>${item?"Editar":"Novo"} equipamento</h2></div><button class="icon-button" data-close>×</button></div><div class="modal-body"><form id="equipment-form" class="form-grid"><label>Número / código<input name="code" required maxlength="80" value="${esc(item?.code||"")}"></label><label>Patrimônio<input name="asset_tag" maxlength="80" value="${esc(item?.asset_tag||"")}"></label><label>Grupo<select name="school_group"><option value="">Não definido</option>${schoolGroupOptions(item?.school_group||"")}</select></label><label>Número de série<input name="serial_number" maxlength="120" value="${esc(item?.serial_number||"")}"></label><label>Nome opcional<input name="label" maxlength="120" value="${esc(item?.label||"")}"></label><label>Localização<input name="location_text" maxlength="160" value="${esc(item?.location_text||"")}" placeholder="Ex.: Sala 12 / Carrinho 3"></label><label>Modelo<input name="model" required maxlength="120" value="${esc(item?.model||"")}"></label><label>Marca<input name="brand" maxlength="100" value="${esc(item?.brand||"")}" placeholder="Não informado"></label><label>Processador<input name="processor" maxlength="120" value="${esc(item?.processor||"")}"></label><label>RAM (GB)<input name="ram_gb" type="number" min="1" max="1024" value="${esc(item?.ram_gb??"")}"></label><label>Armazenamento (GB)<input name="storage_gb" type="number" min="1" max="1048576" value="${esc(item?.storage_gb??"")}"></label><label>Sistema operacional<input name="operating_system" maxlength="120" value="${esc(item?.operating_system||"")}"></label><label>Estado<select name="status">${["available","in_use","maintenance","unavailable"].map(s=>`<option value="${s}" ${item?.status===s?"selected":""}>${statusLabel(s)}</option>`).join("")}</select></label><label class="span-2">Observações<textarea name="notes" maxlength="1200" placeholder="Condição, acessórios ou informação útil">${esc(item?.notes||"")}</textarea></label><label class="check span-2"><input name="is_active" type="checkbox" ${item?.is_active!==false?"checked":""}><span>Equipamento ativo no catálogo</span></label><div class="modal-actions span-2"><button class="button" data-close type="button">Cancelar</button><button class="button primary" type="submit">Salvar</button></div></form></div>`, true);
  qs("#equipment-form",m).addEventListener("submit",async ev=>{ev.preventDefault();const b=qs('button[type="submit"]',ev.currentTarget);setBusy(b,true,"Salvando…");const f=new FormData(ev.currentTarget);if(f.get("status")==="in_use" && item?.status!=="in_use") {setBusy(b,false);return notify("Para colocar um equipamento em uso, registre uma retirada.","warning");}
    if(item && item.status==="in_use" && f.get("status")!=="in_use") { setBusy(b,false);return notify("Registre a devolução para alterar o estado de um equipamento em uso.","warning"); }
    if(f.get("status")==="maintenance" && item?.status!=="maintenance") {setBusy(b,false);return notify("Para colocar em manutenção, abra uma ocorrência técnica.","warning");}
    if(item && item.status==="maintenance" && f.get("status")!=="maintenance") { setBusy(b,false);return notify("Conclua a manutenção antes de alterar o estado.","warning"); }
    const payload={code:f.get("code").trim(),asset_tag:f.get("asset_tag").trim()||null,school_group:f.get("school_group")||null,serial_number:f.get("serial_number").trim()||null,label:f.get("label").trim()||null,location_text:f.get("location_text").trim()||null,model:f.get("model").trim(),brand:f.get("brand").trim()||"Não informado",notes:f.get("notes").trim()||null,processor:f.get("processor").trim()||null,ram_gb:f.get("ram_gb")?Number(f.get("ram_gb")):null,storage_gb:f.get("storage_gb")?Number(f.get("storage_gb")):null,operating_system:f.get("operating_system").trim()||null,status:f.get("status"),is_active:f.get("is_active")==="on"};if(!item)payload.created_by=state.profile.id;const req=item?supabase.from("equipments").update(payload).eq("id",item.id):supabase.from("equipments").insert(payload);const {error}=await req;setBusy(b,false);if(error)return notify(errText(error),"error");notify(item?"Equipamento atualizado.":"Equipamento criado.","success");m.remove();renderEquipment()});
}
function localDateTimeValue(date){
  const pad=n=>String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function custodyFormFields(options={}) {
  const name=state.profile?.full_name||"Usuário autenticado";
  const currentRole=roleLabel(state.profile?.role);
  const canDelegate=state.profile?.role!=="student";
  return `<section class="custody-block span-2" aria-label="Quem está retirando"><div class="custody-heading"><span class="custody-step">1</span><div><strong>Quem ficará com o equipamento?</strong><small>Separe quem registra de quem recebe fisicamente.</small></div></div>
    <div class="custody-actor"><span>${uiIcon("admin",19)}</span><div><small>Registro feito pela conta autenticada</small><strong>${esc(name)} · ${esc(currentRole)}</strong></div></div>
    <fieldset class="custody-choice"><legend>Quem receberá os equipamentos?</legend><label><input type="radio" name="holder_mode" value="self" checked><span>Eu mesmo <small>O material ficará comigo.</small></span></label>${canDelegate?`<label><input type="radio" name="holder_mode" value="delegate"><span>Outra pessoa <small>Vou entregar a um aluno ou funcionário.</small></span></label>`:""}</fieldset>
    <div class="custody-delegate" hidden><label>Nome completo de quem vai receber<input name="holder_name" maxlength="120" autocomplete="off" placeholder="Ex.: João Pedro da Silva Santos"></label><label>Vínculo com a escola<select name="holder_role"><option value="">Selecione</option><option value="student">Aluno</option><option value="teacher">Professor</option><option value="staff">Funcionário</option></select></label><p class="custody-note">O nome informado pelo registrador não equivale à identificação por login. O histórico indicará “identidade declarada”.</p></div>
  </section>
  <section class="custody-block span-2" aria-label="Finalidade da retirada"><div class="custody-heading"><span class="custody-step">2</span><div><strong>Para onde e por quê?</strong><small>Estas informações serão salvas no histórico da retirada.</small></div></div>
    <div class="custody-destination"><label>Turma ou setor<input name="class_name" required maxlength="120" placeholder="Ex.: 3º A ou Secretaria" value="${esc(options.class_name||"")}" ${options.fixed?'readonly':''}></label><label>Destino real<input name="destination" required maxlength="160" placeholder="Ex.: Sala 12, laboratório de TI" value="${esc(options.destination||"")}" ${options.fixed?'readonly':''}></label></div>
    <label>Motivo da retirada<select name="purpose" required><option value="">Selecione a finalidade</option><option value="lesson">Aula</option><option value="assessment">Avaliação</option><option value="project">Projeto ou atividade</option><option value="support">Suporte técnico</option><option value="other">Outro motivo</option></select></label>
    <label class="custody-purpose-detail" hidden>Explique a finalidade<textarea name="purpose_details" maxlength="240" rows="2" placeholder="Descreva em poucas palavras o que será feito com os equipamentos"></textarea></label>
  </section>`;
}
function bindCustodyForm(form) {
  const refresh=()=>{
    const delegated=form.elements.holder_mode?.value==="delegate";
    const holder=qs(".custody-delegate",form);
    if(holder)holder.hidden=!delegated;
    const recipient=form.elements.holder_name, role=form.elements.holder_role;
    if(recipient)recipient.required=delegated;
    if(role)role.required=delegated;
    const other=form.elements.purpose?.value==="other";
    const detail=qs(".custody-purpose-detail",form);
    if(detail)detail.hidden=!other;
    if(form.elements.purpose_details)form.elements.purpose_details.required=other;
  };
  qsa('input[name="holder_mode"]',form).forEach(input=>input.addEventListener("change",refresh));
  form.elements.purpose?.addEventListener("change",refresh);
  refresh();
}
function custodyPayload(form) {
  const f=new FormData(form);
  const holderMode=String(f.get("holder_mode")||"self");
  const role=holderMode==="delegate"?String(f.get("holder_role")||""):null;
  const name=holderMode==="delegate"?String(f.get("holder_name")||"").trim():null;
  const purpose=String(f.get("purpose")||"");
  const details=String(f.get("purpose_details")||"").trim();
  if(holderMode==="delegate" && (name.length<3||!role))throw new Error("Informe o nome completo e o vínculo de quem receberá os equipamentos.");
  if(!purpose || (purpose==="other" && details.length<8))throw new Error("Selecione o motivo e, se for Outro, descreva a finalidade.");
  return {p_holder_mode:holderMode,p_holder_name:name,p_holder_role:role,p_purpose:purpose,p_purpose_details:details||null};
}
function schoolDeadlineLocal(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const today=`${parts.year}-${parts.month}-${parts.day}`;
  const todayDeadline=`${today}T21:15`;
  // Após o fechamento, a próxima data útil deve ser escolhida explicitamente.
  const afterClose=`${parts.hour}:${parts.minute}`>='21:10';
  return {today,todayDeadline,afterClose};
}
function openCheckoutModal(items) {
  const school=schoolDeadlineLocal();
  const maxDue=new Date(Date.now()+30*24*60*60*1000);
  const names=items.slice(0,3).map(x=>x.label||x.code||x.cart_number||"Equipamento").join(", ");
  const m=makeModal(`<div class="panel-head"><div><span class="eyebrow">Nova retirada · ${items.length} equipamento(s)</span><h2>Confirmar entrega</h2><p>${esc(names)}${items.length>3?` e mais ${items.length-3}`:""}</p></div><button class="icon-button" data-close aria-label="Fechar">×</button></div><div class="modal-body"><form id="checkout-form" class="form-grid custody-form">
    ${custodyFormFields()}
    <section class="custody-block span-2"><div class="custody-heading"><span class="custody-step">3</span><div><strong>Quando será devolvido?</strong><small>O prazo precisa ser posterior ao horário atual.</small></div></div><label>Previsão de devolução (até 21h15)<input name="due_at" type="datetime-local" required min="${localDateTimeValue(new Date(Date.now()+6*60*1000))}" max="${localDateTimeValue(maxDue)}" value="${school.todayDeadline}" data-school-cutoff="21:15"></label><small class="school-deadline-hint">${school.afterClose?'O prazo de hoje já encerrou; escolha outra data.':'Preenchido com hoje às 21h15. A escola encerra as retiradas às 21h15.'}</small></section>
    <p class="custody-note span-2">O registro identifica sua conta, a pessoa que recebeu e a finalidade. A disponibilidade dos equipamentos é confirmada no servidor.</p><div class="modal-actions span-2"><button class="button" data-close type="button">Cancelar</button><button class="button primary" type="submit">Confirmar ${items.length} retirada${items.length>1?"s":""}</button></div></form></div>`,true);
  const form=qs("#checkout-form",m);bindCustodyForm(form);setupSmartInputs(m);
  const action=uid();
  form.addEventListener("submit",async ev=>{
    ev.preventDefault();const b=qs('button[type="submit"]',form);
    let context;try{context=custodyPayload(form);}catch(error){return notify(error.message,"warning");}
    const f=new FormData(form),dueValue=String(f.get('due_at')||''),due=new Date(`${dueValue}:00-03:00`);
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueValue)||dueValue.slice(11)>'21:15')
      return notify('O horário máximo de devolução é 21h15, no horário de São Paulo.','warning');
    if(!Number.isFinite(due.getTime())||due.getTime()<=Date.now()+5*60*1000||due.getTime()>Date.now()+30*24*60*60*1000)
      return notify('Escolha uma previsão futura válida, de até 30 dias, antes das 21h15.','warning');
    setBusy(b,true,"Registrando…");
    let result;
    try{result=await supabase.rpc("equipa_checkout_with_context",{
      p_equipment_ids:items.map(x=>x.equipment_id||x.id),
      p_class_name:String(f.get("class_name")||"").trim(),
      p_destination:String(f.get("destination")||"").trim(),
      p_due_at:due.toISOString(),p_client_action_id:action,...context
    });}catch(error){result={error};}
    setBusy(b,false);
    if(result.error)return notify(errText(result.error),"error");
    invalidateEquipaActivity();
    notify("Retirada registrada com responsável, destino e finalidade.","success");
    m.remove();navigate("withdrawals");
  });
}
function openMaintenanceModal(e) {
  const m=makeModal(`<div class="panel-head"><div><span class="eyebrow">Manutenção</span><h2>${esc(e.label||e.code)}</h2></div><button class="icon-button" data-close>×</button></div><div class="modal-body"><form id="maintenance-form" class="auth-form"><label>Motivo<input name="title" required maxlength="160" placeholder="Ex.: teclado com falha"></label><label>Observações<textarea name="notes" maxlength="1200"></textarea></label><div class="modal-actions"><button class="button" data-close type="button">Cancelar</button><button class="button primary" type="submit">Abrir manutenção</button></div></form></div>`);
  qs("#maintenance-form",m).addEventListener("submit",async ev=>{ev.preventDefault();const b=qs('button[type="submit"]',ev.currentTarget);setBusy(b,true,"Abrindo…");const f=new FormData(ev.currentTarget);const {error}=await supabase.rpc("open_maintenance",{p_equipment_id:e.id,p_title:f.get("title").trim(),p_notes:f.get("notes").trim()||null,p_client_action_id:uid()});setBusy(b,false);if(error)return notify(errText(error),"error");notify("Equipamento enviado para manutenção.","success");m.remove();navigate("maintenance")});
}
async function openQrModal(token,title,subtitle="") {
  try { await ensureQRCodeLib(); } catch (error) { return notify(error.message,"error"); }
  const m=makeModal(`<div class="printable"><div class="panel-head"><div><span class="eyebrow">QR permanente</span><h2>${esc(title)}</h2></div><button class="icon-button" data-close>×</button></div><div class="qr-card"><div id="qr-code"></div><strong>${esc(title)}</strong><small>${esc(subtitle)}</small><span>${esc(qrUrl(token))}</span><div class="modal-actions"><button class="button ghost" id="copy-qr">Copiar link</button><button class="button primary" id="print-qr">Imprimir</button></div></div></div>`);
  new window.QRCode(qs("#qr-code",m),{text:qrUrl(token),width:210,height:210,correctLevel:window.QRCode.CorrectLevel.M});
  qs("#copy-qr",m).addEventListener("click",async()=>{await navigator.clipboard.writeText(qrUrl(token));notify("Link copiado.","success")});qs("#print-qr",m).addEventListener("click",()=>window.print());
}

function withdrawalStatus(r) {
  return r.status==="open"&&r.due_at&&new Date(r.due_at).getTime()<Date.now()?"overdue":r.status;
}
function withdrawalPurposeLabel(v){return({lesson:"Aula",assessment:"Avaliação",project:"Projeto ou atividade",support:"Suporte técnico",other:"Outro motivo"})[v]||"Não informado no registro antigo";}
function withdrawalRoleLabel(v){return ({student:"Aluno",teacher:"Professor",admin:"Administrador",staff:"Funcionário"})[v]||"Vínculo não informado";}
function withdrawalSummary(r){
  const receiver=r.custodian_name||r.responsible_name||"Não identificado";
  const receiverRole=r.custodian_role?` · ${withdrawalRoleLabel(r.custodian_role)}`:"";
  const reason=r.checkout_purpose?withdrawalPurposeLabel(r.checkout_purpose):("checkout_purpose" in r?"Motivo não registrado":"Consultar motivo nos detalhes");
  return {receiver,receiverRole,reason};
}
async function renderWithdrawals(){
  state.view="withdrawals";
  shell(`<section class="operations-page" aria-label="Situação atual dos equipamentos">
    <header class="ops-heading ops-heading-compact"><h1 class="visually-hidden">Retiradas</h1><button class="button primary ops-create" id="withdrawal-new-desktop" type="button">${uiIcon("plus",18)} Nova retirada</button></header>
    <section class="ops-summary" id="withdrawal-overview" aria-label="Situação do inventário" aria-live="polite"><div class="loading">Carregando situação…</div></section>
    <section class="ops-search-panel"><label class="ops-search">${uiIcon("search",19)}<input id="withdrawal-search" type="search" value="${esc(state.withdrawalsSearch)}" autocomplete="off" placeholder="Buscar equipamento, pessoa, turma, destino ou patrimônio" aria-label="Buscar equipamentos e retiradas"></label>
      <div class="ops-filters"><label>Situação<select id="ops-status"><option value="" ${!state.withdrawalsStatus?'selected':''}>Todos</option><option value="attention" ${state.withdrawalsStatus==='attention'?'selected':''}>Precisam de atenção</option><option value="in_use" ${state.withdrawalsStatus==='in_use'?'selected':''}>Em uso (inclui atrasadas)</option><option value="not_in_use" ${state.withdrawalsStatus==='not_in_use'?'selected':''}>Não em uso</option><option value="available" ${state.withdrawalsStatus==='available'?'selected':''}>Disponíveis</option><option value="overdue" ${state.withdrawalsStatus==='overdue'?'selected':''}>Atrasadas</option><option value="maintenance" ${state.withdrawalsStatus==='maintenance'?'selected':''}>Manutenção</option><option value="unavailable" ${state.withdrawalsStatus==='unavailable'?'selected':''}>Indisponíveis</option></select></label>
      <label>Ordenar por<select id="withdrawal-sort"><option value="priority" ${state.withdrawalsSort==='priority'?'selected':''}>Pendências primeiro</option><option value="recent" ${state.withdrawalsSort==='recent'?'selected':''}>Mais recentes</option><option value="code" ${state.withdrawalsSort==='code'?'selected':''}>Código do equipamento</option></select></label></div></section>
    <div class="ops-quick-tabs" role="group" aria-label="Filtrar situação"><button type="button" data-ops-quick="" class="${!state.withdrawalsStatus?'selected':''}">Todos</button><button type="button" data-ops-quick="in_use" class="${state.withdrawalsStatus==='in_use'?'selected':''}">Em uso</button><button type="button" data-ops-quick="not_in_use" class="${state.withdrawalsStatus==='not_in_use'?'selected':''}">Não em uso</button><button type="button" data-ops-quick="available" class="${state.withdrawalsStatus==='available'?'selected':''}">Disponíveis</button><button type="button" data-ops-quick="attention" class="${state.withdrawalsStatus==='attention'?'selected':''}">Atenção</button></div>
    <div id="withdrawals" class="ops-results" aria-live="polite"><div class="loading">Consultando equipamentos…</div></div>
    <button class="withdrawal-mobile-cta" id="withdrawal-new-mobile" type="button">${uiIcon("plus",19)} Nova retirada</button>
  </section>`);
  const openPicker=()=>openCheckoutEquipmentPicker();
  qs("#withdrawal-new-desktop")?.addEventListener("click",openPicker);
  qs("#withdrawal-new-mobile")?.addEventListener("click",openPicker);
  qs("#ops-status")?.addEventListener("change",e=>{state.withdrawalsStatus=e.target.value;paintOperationalSnapshot();});
  qsa("[data-ops-quick]").forEach(b=>b.addEventListener("click",()=>{state.withdrawalsStatus=b.dataset.opsQuick;qs("#ops-status").value=state.withdrawalsStatus;qsa("[data-ops-quick]").forEach(x=>x.classList.toggle("selected",x===b));paintOperationalSnapshot();}));
  qs("#withdrawal-sort")?.addEventListener("change",e=>{state.withdrawalsSort=e.target.value;paintOperationalSnapshot();});
  let timer;qs("#withdrawal-search")?.addEventListener("input",e=>{clearTimeout(timer);state.withdrawalsSearch=e.target.value;timer=setTimeout(paintOperationalSnapshot,130);});
  setupSmartInputs(app);
  await loadWithdrawals();
}
async function openCheckoutEquipmentPicker(){
  const m=makeModal(`<div class="panel-head"><div><span class="eyebrow">Nova retirada</span><h2>Selecione um equipamento</h2><p>Escolha um computador disponível. Para vários equipamentos, utilize a seleção no inventário.</p></div><button class="icon-button" data-close aria-label="Fechar">×</button></div><div class="modal-body"><label>Buscar por número ou modelo<input type="search" id="withdrawal-pick-search" placeholder="Ex.: NOTE-001" autocomplete="off"></label><div class="withdrawal-pick-list" id="withdrawal-pick-list"><div class="loading">Carregando equipamentos…</div></div><div class="modal-actions"><button class="button ghost" id="withdrawal-go-inventory" type="button">Selecionar vários no inventário</button></div></div>`,true);
  qs("#withdrawal-go-inventory",m)?.addEventListener("click",()=>{m.remove();navigate("equipment");});
  const {data,error}=await supabase.from("equipments").select("id,code,label,brand,model,school_group,location_text").eq("is_active",true).eq("status","available").order("code").limit(100);
  const host=qs("#withdrawal-pick-list",m);if(!host)return;
  if(error){host.innerHTML=`<div class="empty"><strong>Não foi possível buscar os equipamentos.</strong><span>${esc(errText(error))}</span></div>`;return;}
  const rows=data||[];
  const render=()=>{const q=(qs("#withdrawal-pick-search",m)?.value||"").toLocaleLowerCase("pt-BR").trim();const filtered=rows.filter(x=>[x.code,x.label,x.model,x.brand,x.location_text].join(" ").toLocaleLowerCase("pt-BR").includes(q));host.innerHTML=filtered.length?filtered.map(x=>`<button type="button" class="withdrawal-pick-item" data-pick="${esc(x.id)}"><span>${uiIcon("equipment",21)}</span><span><strong>${esc(x.label||x.code)}</strong><small>${esc(x.code)} · ${esc(x.brand||"")} ${esc(x.model||"")}${x.location_text?` · ${esc(x.location_text)}`:""}</small></span>${uiIcon("arrow",17)}</button>`).join(""):`<div class="empty"><strong>Nenhum equipamento disponível encontrado.</strong><span>Confira o inventário ou tente outra busca.</span></div>`;qsa("[data-pick]",host).forEach(b=>b.addEventListener("click",()=>{const selected=rows.find(x=>x.id===b.dataset.pick);m.remove();if(selected)openCheckoutModal([selected]);}));};
  qs("#withdrawal-pick-search",m)?.addEventListener("input",render);render();
}
const opsStatusPriority={overdue:0,maintenance:1,unavailable:2,in_use:3,available:4};
function operationalState(e){
 if(!e.is_active||e.status==="unavailable")return "unavailable";
 if(e.status==="maintenance")return "maintenance";
 if(e.status==="in_use")return e.due_at && new Date(e.due_at).getTime()<Date.now()?"overdue":"in_use";
 return "available";
}
function opsStatusLabel(st){return({overdue:"Atrasada",maintenance:"Manutenção",unavailable:"Indisponível",in_use:"Em uso",available:"Disponível"})[st]||"Verificar";}
function opsCondition(st){return st==="overdue"?"Atenção":st==="maintenance"||st==="unavailable"?"Problema":"OK";}
function renderOpsRows(rows){
 if(!rows.length)return `<div class="ops-empty">${uiIcon("inbox",30)}<strong>Nenhum equipamento encontrado.</strong><p>Confira a busca ou os filtros selecionados.</p></div>`;
 const cells=rows.map(e=>{
  const st=operationalState(e),active=st==="in_use"||st==="overdue",condition=opsCondition(st);
  const person=active?e.custodian_name||e.responsible_name||"Não identificado":"—";
  const operator=active?e.recorded_by_name||e.responsible_name||"Não identificado":"—";
  const location=active?e.destination||"Não informado":e.location_text||"Não informado";
  const reason=active?e.checkout_purpose?withdrawalPurposeLabel(e.checkout_purpose):"Motivo não informado":st==="maintenance"?"Em manutenção":"—";
  const when=active?(e.due_at?`Previsão: ${dt(e.due_at)}`:"Prazo não informado"):(e.updated_at?`Atualizado ${dt(e.updated_at)}`:"Sem movimentação recente");
  const opens=Boolean(e.withdrawal_id)&&active;
  const action=opens?`<button type="button" data-withdrawal-id="${esc(e.withdrawal_id)}" aria-label="Abrir retirada de ${esc(e.code)}">Detalhes ${uiIcon("arrow",15)}</button>`:`<button type="button" data-ops-equipment="${esc(e.id)}" aria-label="Abrir equipamento ${esc(e.code)}">${st==="available"?"Retirar":"Detalhes"} ${uiIcon("arrow",15)}</button>`;
  return `<tr class="ops-table-row" data-condition="${condition.toLowerCase()}"><td data-label="Equipamento"><strong>${esc(e.code)}</strong><small>${esc([e.brand,e.model].filter(Boolean).join(" ")||e.label||"Equipamento")}</small></td><td data-label="Situação"><span class="ops-badge ${st}">${esc(opsStatusLabel(st))}</span><span class="ops-health ${condition.toLowerCase()}">${esc(condition)}</span></td><td data-label="Registrado por">${esc(operator)}</td><td data-label="Em posse de">${esc(person)}${active&&e.custodian_role?`<small>${esc(withdrawalRoleLabel(e.custodian_role))}${e.custody_mode==="delegate"?" · declarado":""}</small>`:""}</td><td data-label="Turma / Local">${active&&e.class_name?`<strong>${esc(e.class_name)}</strong>`:""}<small>${esc(location)}</small></td><td data-label="Motivo">${esc(reason)}</td><td data-label="Previsão">${esc(when)}</td><td data-label="Ações">${action}</td></tr>`;
 }).join("");
 return `<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Equipamento</th><th>Situação</th><th>Registrado por</th><th>Em posse de</th><th>Turma / Local</th><th>Motivo</th><th>Previsão / atualização</th><th>Ações</th></tr></thead><tbody>${cells}</tbody></table></div><div class="ops-table-foot">${rows.length} equipamento(s) exibido(s)</div>`;
}
let operationsSnapshot=null;
function paintOperationalSnapshot(){
 const snapshot=operationsSnapshot,host=qs('#withdrawals'),overview=qs('#withdrawal-overview');
 if(!snapshot||!host||state.view!=='withdrawals')return;
 const {inventory,activeError}=snapshot;
 let rows=snapshot.rows.slice();
 const counts={in_use:0,available:0,overdue:0,maintenance:0,unavailable:0};for(const r of rows)counts[operationalState(r)]++;
 if(overview)overview.innerHTML=`${[['in_use','Em uso','Equipamentos em circulação'],['available','Disponíveis','Prontos para retirada'],['overdue','Atrasadas','Devoluções fora do prazo'],['maintenance','Manutenção','Precisam de reparo']].map(([code,title,sub])=>`<button class="ops-stat ${code}" data-ops-stat="${code}" type="button"><span class="ops-stat-title">${esc(title)}</span><strong>${code==='in_use'?counts.in_use+counts.overdue:counts[code]}</strong><small>${esc(sub)}</small></button>`).join('')}${counts.unavailable?`<p class="ops-disabled-count">${counts.unavailable} equipamento(s) indisponível(is)</p>`:''}`;
 qsa('[data-ops-stat]').forEach(b=>b.addEventListener('click',()=>{state.withdrawalsStatus=b.dataset.opsStat;qs('#ops-status').value=state.withdrawalsStatus;qsa('[data-ops-quick]').forEach(x=>x.classList.toggle('selected',x.dataset.opsQuick===state.withdrawalsStatus));paintOperationalSnapshot();}));
 if(state.withdrawalsStatus==='attention')rows=rows.filter(e=>['overdue','maintenance','unavailable'].includes(operationalState(e)));
 else if(state.withdrawalsStatus==='not_in_use')rows=rows.filter(e=>['available','maintenance','unavailable'].includes(operationalState(e)));
 else if(state.withdrawalsStatus==='in_use')rows=rows.filter(e=>['in_use','overdue'].includes(operationalState(e)));
 else if(state.withdrawalsStatus)rows=rows.filter(e=>operationalState(e)===state.withdrawalsStatus);
 rows=smartFilter(rows,state.withdrawalsSearch,e=>[e.code,e.asset_tag,e.label,e.brand,e.model,e.location_text,e.class_name,e.destination,e.custodian_name,e.responsible_name,e.recorded_by_name,e.student_name,e.checkout_purpose,withdrawalPurposeLabel(e.checkout_purpose),operationalState(e),opsStatusLabel(operationalState(e))]);
 rows.sort((a,b)=>state.withdrawalsSort==='code'?String(a.code).localeCompare(String(b.code),'pt-BR',{numeric:true}):state.withdrawalsSort==='recent'?new Date(b.withdrawn_at||b.updated_at||0)-new Date(a.withdrawn_at||a.updated_at||0):opsStatusPriority[operationalState(a)]-opsStatusPriority[operationalState(b)]||String(a.code).localeCompare(String(b.code),'pt-BR',{numeric:true}));
 host.innerHTML=renderOpsRows(rows);
 qsa('[data-withdrawal-id]',host).forEach(b=>b.addEventListener('click',()=>openWithdrawalDetail(b.dataset.withdrawalId)));
 qsa('[data-ops-equipment]',host).forEach(b=>b.addEventListener('click',async()=>{const item=inventory.find(x=>x.id===b.dataset.opsEquipment);if(!item)return;if(item.status==='available')openCheckoutModal([item]);else openEquipment(item.id)}));
 if(activeError&&state.profile?.role!=='student')notify('Alguns detalhes de posse não estão disponíveis para esta conta.','warning');
}
async function loadWithdrawals(){
 const host=qs("#withdrawals"),overview=qs("#withdrawal-overview");if(!host)return;
 const marker=Symbol();state.opsRequest=marker;
 // Read visible equipment inventory in bounded pages; never treat a single 100-row API page as the complete school.
 let inventory=[],equipmentError=null;
 for(let offset=0;offset<10000;offset+=500){
  const {data,error}=await supabase.from("equipments").select("id,code,asset_tag,label,brand,model,status,is_active,location_text,updated_at").eq("is_active",true).order("code").range(offset,offset+499);
  if(state.opsRequest!==marker||!host.isConnected)return;
  if(error){equipmentError=error;break;}
  inventory.push(...(data||[]));if((data||[]).length<500)break;
 }
 if(equipmentError){host.innerHTML=`<div class="ops-empty"><strong>Não foi possível carregar os equipamentos.</strong><p>${esc(errText(equipmentError))}</p><button type="button" class="button" id="ops-retry">Tentar novamente</button></div>`;qs("#ops-retry")?.addEventListener("click",loadWithdrawals);return;}
 // RLS controls which withdrawal details a user may see. Show inventory status without leaking other users' custody data.
 const active=await supabase.from("withdrawals").select("id,requested_by,class_name,destination,responsible_name,student_name,withdrawn_at,due_at,recorded_by_name,custodian_name,custodian_role,custody_mode,checkout_purpose,purpose_details,withdrawal_items(equipment_id,returned_at)").eq("status","open").order("withdrawn_at",{ascending:false}).limit(1000);
 if(state.opsRequest!==marker||!host.isConnected)return;
 const byEquipment=new Map();
 if(!active.error)for(const r of active.data||[])for(const item of r.withdrawal_items||[])if(!item.returned_at&&!byEquipment.has(String(item.equipment_id)))byEquipment.set(String(item.equipment_id),{...r,withdrawal_id:r.id});
 if(state.profile?.role==='student'){
   try {
     const feed=await getSchoolActivity();
     if(state.opsRequest!==marker||!host.isConnected)return;
     for(const item of feed.occupancy||[]){
       if(!byEquipment.has(String(item.equipment_id)))byEquipment.set(String(item.equipment_id),{
         custodian_name:item.holder_name,custodian_role:item.holder_role,
         custody_mode:item.declared?'delegate':'self',recorded_by_name:'Consulta escolar',withdrawal_id:null
       });
     }
   }catch(error){notify('Não foi possível consultar quem está com os equipamentos em uso.','warning');}
 }
 let rows=inventory.map(e=>{const active=byEquipment.get(String(e.id));if(!active)return e;const {id:withdrawalRowId,status:withdrawalRowStatus,...detail}=active;return {...e,...detail};});
 operationsSnapshot={inventory,rows,activeError:active.error};
 paintOperationalSnapshot();
}
async function openWithdrawalDetail(withdrawalId) {
  const [{data:w,error:we},{data:items,error:ie}]=await Promise.all([
    supabase.from("withdrawals").select("id,class_name,destination,responsible_name,student_name,status,withdrawn_at,returned_at,due_at,checkout_purpose,purpose_details,custodian_name,custodian_role,custody_mode,recorded_by_name,recorded_by_role").eq("id",withdrawalId).single(),
    supabase.from("withdrawal_items").select("id,equipment_id,created_at,returned_at,return_condition,equipments(id,code,label,brand,model,school_group)").eq("withdrawal_id",withdrawalId).order("id")
  ]);
  if(we||ie)return notify(errText(we||ie),"error");
  const pending=(items||[]).filter(x=>!x.returned_at);
  const received=w.custodian_name||w.responsible_name||"Não identificado";
  const actor=w.recorded_by_name||w.responsible_name||"Conta não identificada";
  const actorRole=w.recorded_by_role?` · ${withdrawalRoleLabel(w.recorded_by_role)}`:"";
  const m=makeModal(`<div class="panel-head"><div><span class="eyebrow">Retirada ${esc(withdrawalId)}</span><h2>${esc(w.class_name||"Sem turma")} · ${esc(w.destination||"Sem destino")}</h2></div><button class="icon-button" data-close aria-label="Fechar">×</button></div>
  <div class="modal-body"><section class="withdrawal-detail-person"><span>${uiIcon("admin",23)}</span><div><small>Quem está com o equipamento</small><strong>${esc(received)}${w.custodian_role?` · ${esc(withdrawalRoleLabel(w.custodian_role))}`:""}</strong><small>${w.custody_mode==="delegate"?"Identidade declarada por quem registrou; não validada por login":w.custody_mode==="self"?"Recebedor identificado pela conta autenticada":"Recebedor não identificado separadamente neste registro antigo"}</small></div></section>
  <div class="withdrawal-detail-grid">${detail("Registrado por",actor+actorRole)}${detail("Turma ou setor",w.class_name)}${detail("Local de destino",w.destination)}${detail("Motivo",withdrawalPurposeLabel(w.checkout_purpose))}${w.purpose_details?detail("Detalhes da finalidade",w.purpose_details):""}${detail("Data da retirada",dt(w.withdrawn_at))}${detail("Previsão de devolução",dt(w.due_at))}${w.returned_at?detail("Devolvida em",dt(w.returned_at)):""}</div>
  <h3 class="withdrawal-items-title">Equipamentos (${items?.length||0})</h3><p class="muted">Confira os itens individualmente. Os não localizados permanecem pendentes até a conferência.</p>
  <div class="return-list">${(items||[]).map(i=>`<div class="return-item"><div><strong>${esc(i.equipments?.label||i.equipments?.code||"Equipamento")}</strong><span>${esc(schoolGroupLabel(i.equipments?.school_group))} · ${esc(i.equipments?.code||"")}</span></div>${i.returned_at?`<span class="return-date">${i.return_condition==='damaged'?'Avaria registrada':'Devolvido'} em ${esc(dt(i.returned_at))}</span>`:`<label class="return-choice">Situação<select data-return-equipment="${esc(i.equipment_id)}"><option value="pending" ${i.return_condition!=='missing'?'selected':''}>Pendente</option><option value="returned">Devolvido normalmente</option><option value="damaged">Devolvido com avaria</option><option value="missing" ${i.return_condition==='missing'?'selected':''}>Não localizado</option></select></label>`}</div>`).join("")}</div>
  ${pending.length?`<div class="modal-actions"><button class="button" type="button" data-close>Voltar</button><button class="button primary" id="return-batch">Confirmar conferência</button></div>`:'<p class="muted">Todos os itens desta retirada foram conferidos.</p>'}</div>`,true);
  const action=uid();
  qs("#return-batch",m)?.addEventListener("click",async()=>{
    const entries=qsa("[data-return-equipment]",m).map(sel=>({equipment_id:sel.dataset.returnEquipment,condition:sel.value}));
    if(!entries.some(x=>x.condition!=="pending"))return notify("Selecione ao menos uma devolução, avaria ou item não localizado.","warning");
    const button=qs("#return-batch",m);setBusy(button,true,"Registrando…");
    const {data,error}=await supabase.rpc("equipa_return_items",{p_withdrawal_id:Number(withdrawalId),p_items:entries,p_client_action_id:action});setBusy(button,false);
    if(error)return notify(errText(error),"error");
    invalidateEquipaActivity();
    notify(data?.complete?"Retirada encerrada após conferência.":`${data?.pending??"?"} equipamento(s) ainda pendente(s).`,"success");
    m.remove();await loadWithdrawals();openWithdrawalDetail(withdrawalId);
  });
}
async function renderHistory() {
  state.view="history";
  shell(`<section class="panel workspace-panel"><h1 class="visually-hidden">Histórico</h1><div class="toolbar workspace-toolbar"><div class="toolbar-cluster"><input id="history-smart" class="search" type="search" placeholder="Buscar equipamento, pessoa, turma ou destino"><button class="filter-button ${state.historyFiltersOpen ? 'active' : ''}" id="history-filter-toggle" type="button" aria-expanded="${state.historyFiltersOpen ? 'true' : 'false'}"><span>Filtros</span></button></div></div><div class="filter-drawer ${state.historyFiltersOpen ? 'open' : ''}" id="history-filter-panel"><div class="filter-grid"><label>Equipamento ou patrimônio<input id="h-equipment" placeholder="Ex.: CB-042"></label><label>Pessoa<input id="h-person" placeholder="Aluno ou responsável"></label><label>Aluno<input id="h-student" placeholder="Nome do aluno"></label><label>Turma<input id="h-class" placeholder="Ex.: 3º A"></label><label>Status<select id="h-status"><option value="">Todos os estados</option><option value="open">Em aberto</option><option value="returned">Devolvido</option><option value="cancelled">Cancelado</option></select></label></div><div class="filter-actions"><span class="muted">Ao informar uma pessoa, a consulta amplia o limite para localizar o histórico dela.</span><div><button class="button small ghost" id="history-filter-clear" type="button">Limpar</button><button class="button primary small" id="history-filter" type="button">Aplicar filtros</button></div></div></div><div id="history"><div class="loading">Carregando histórico…</div></div></section>`);
  wireFilterToggle("history-filter-toggle", "history-filter-panel");
  qs("#history-filter-toggle")?.addEventListener("click", ()=>{ state.historyFiltersOpen = qs("#history-filter-panel")?.classList.contains("open"); });
  qs("#history-filter")?.addEventListener("click", ()=>loadHistory());
  qs("#history-filter-clear")?.addEventListener("click", ()=>{ state.historySearch=""; ["#h-equipment", "#h-person", "#h-student", "#h-class", "#h-status", "#history-smart"].forEach(sel => { const el = qs(sel); if (el) el.value = ""; }); const global=qs("#global-search");if(global&&mobilePrincipalSearchActive())global.value=""; loadHistory(); });
  let timer; qs("#history-smart")?.addEventListener("input", e=>{ clearTimeout(timer); state.historySearch=e.target.value;timer=setTimeout(()=>loadHistory(e.target.value),420); });
  await loadHistory(state.historySearch);
}
async function loadHistory(smartQuery=""){
  const person=qs("#h-person")?.value.trim()||"";
  const p={p_from:null,p_to:null,p_equipment:qs("#h-equipment")?.value.trim()||null,p_label:null,p_student:qs("#h-student")?.value.trim()||null,p_professor:null,p_class_name:qs("#h-class")?.value.trim()||null,p_destination:null,p_status:qs("#h-status")?.value||null,p_equipment_id:null,p_limit:person?5000:config.historyLimit};
  const {data,error}=await supabase.rpc("history_events",p);const h=qs("#history");if(!h)return;
  if(error){h.innerHTML=`<div class="empty"><strong>Erro ao carregar histórico.</strong><span>${esc(errText(error))}</span></div>`;return}
  let rows=data||[];
  if(person)rows=smartFilter(rows,person,x=>[x.student_name,x.responsible_name]);
  rows=smartFilter(rows, smartQuery || state.historySearch || qs("#history-smart")?.value || "", x=>[x.label,x.code,x.brand,x.model,x.class_name,x.destination,x.student_name,x.responsible_name,x.status,statusLabel(x.status)]);
  if(!rows.length){h.innerHTML=`<div class="empty"><strong>Nenhum evento.</strong><span>Altere os filtros ou aguarde novas movimentações.</span></div>`;return}
  h.innerHTML=`<div class="data-list">${rows.map(x=>`<div class="data-row"><div class="data-main"><strong>${esc(x.label||x.code)} · ${esc(x.brand)} ${esc(x.model)}</strong><span>${esc(x.class_name||"Sem turma")} · ${esc(x.destination||"Sem destino")}${x.student_name?` · Aluno: ${esc(x.student_name)}`:""}${x.responsible_name?` · Responsável: ${esc(x.responsible_name)}`:""}</span></div><span class="status status-${esc(x.status)}">${esc(statusLabel(x.status))}</span><span class="data-date">${x.returned_at?`Devolvido ${esc(dt(x.returned_at))}`:esc(dt(x.withdrawn_at))}</span></div>`).join("")}</div>`;
}

async function renderCarts() {
  state.view="carts";
  const admin=state.profile.role==="admin";
  shell(`<section class="panel workspace-panel"><div class="compact-workspace-actions"><h1 class="visually-hidden">Carrinhos</h1>${admin?`<button class="button primary" id="new-cart">Novo carrinho</button>`:""}</div><div class="toolbar workspace-toolbar"><div class="toolbar-cluster"><input id="cart-search" class="search" type="search" value="${esc(state.cartSearch)}" placeholder="Buscar número, nome, local ou equipamento"></div></div><div id="carts"><div class="loading">Carregando carrinhos…</div></div></section>`);
  qs("#new-cart")?.addEventListener("click",()=>openCartForm());
  const {data,error}=await supabase.rpc("cart_scan_catalog_v2");
  const h=qs("#carts"); if(error){h.innerHTML=`<div class="empty"><strong>Erro ao carregar.</strong><span>${esc(errText(error))}</span></div>`;return}
  let rows=smartFilter(data||[],state.cartSearch,c=>[c.cart_name,`carrinho ${c.cart_number}`,c.location_text,c.notes,(c.equipment_codes||[]).join(" "),`${c.item_count} equipamentos`]);
  if(!rows.length){h.innerHTML=`<div class="empty"><strong>Nenhum carrinho encontrado.</strong><span>O administrador pode cadastrar os lotes usados pela escola.</span></div>`;return}
  const perPage=50,total=rows.length,maxPage=Math.max(0,Math.ceil(total/perPage)-1);state.cartPage=Math.min(state.cartPage,maxPage);const from=state.cartPage*perPage;const page=rows.slice(from,from+perPage);
  h.innerHTML=`<div class="data-list">${page.map(c=>{const record={id:c.cart_id,number:c.cart_number,name:c.cart_name||"",qr_token:c.qr_token,location_text:c.location_text||"",capacity:c.capacity||null,notes:c.notes||"",equipment_codes:c.equipment_codes||[],is_active:c.is_active};return `<button class="data-row cart-row" type="button" data-cart-token="${esc(c.qr_token)}" data-cart-record='${esc(JSON.stringify(record))}'><div class="data-main"><strong>${esc(c.cart_name||`Carrinho ${c.cart_number}`)}</strong><span>${Number(c.item_count||0)} equipamento(s)${c.capacity?` de ${Number(c.capacity)} vagas`:""}${c.location_text?` · ${esc(c.location_text)}`:""}</span></div><span class="status status-available">Ativo</span><span class="data-date">#${c.cart_number}</span></button>`}).join("")}</div><div class="pagination"><span>${total} carrinho(s)</span><div><button class="button small" id="cart-prev" ${state.cartPage===0?'disabled':''}>Anterior</button><button class="button small" id="cart-next" ${state.cartPage>=maxPage?'disabled':''}>Próxima</button></div></div>`;
  bindCommittedSearch(qs('#cart-search'),value=>{state.cartSearch=value;state.cartPage=0;renderCarts()});
  qs("#cart-prev")?.addEventListener("click",()=>{state.cartPage--;renderCarts()});qs("#cart-next")?.addEventListener("click",()=>{state.cartPage++;renderCarts()});
  qsa("[data-cart-token]").forEach(b=>b.addEventListener("click",()=>openCart(b.dataset.cartToken)));
}
async function openCart(token) {
  const {data,error}=await supabase.rpc("cart_scan_equipment_list_v2",{p_qr_token:token});if(error)return notify(errText(error),"error");const items=data||[];if(!items.length)return notify("Carrinho vazio ou indisponível.","warning");
  const available=items.filter(x=>x.is_active&&x.status==="available");
  const title=items[0].cart_name||`Carrinho ${items[0].cart_number}`;
  const m=makeModal(`<div class="panel-head"><div><span class="eyebrow">Carrinho ${items[0].cart_number}</span><h2>${esc(title)}</h2><p>${esc(items[0].cart_location||"Local não informado")} · ${items.length}${items[0].cart_capacity?`/${items[0].cart_capacity}`:""} equipamento(s)</p></div><button class="icon-button" data-close>×</button></div><div class="modal-body"><div class="cart-select-toolbar"><label>Quantidade para selecionar<input id="cart-qty" type="number" min="0" max="${Math.min(60,available.length)}" value="${Math.min(available.length,60)}"></label><div><button class="button small" id="cart-none" type="button">Limpar</button><button class="button small" id="cart-all" type="button">Selecionar disponíveis</button></div></div><div class="cart-select-list">${items.map(i=>`<label class="cart-select-row ${i.status!=="available"||!i.is_active?'disabled':''}"><input type="checkbox" data-cart-select value="${esc(i.equipment_id)}" ${i.status==="available"&&i.is_active?(available.findIndex(x=>x.equipment_id===i.equipment_id)<60?'checked':''):'disabled'}><div><strong>${esc(i.label||i.code)}</strong><span>${esc(schoolGroupLabel(i.school_group))} · ${esc(i.brand)} ${esc(i.model)}${i.location_text?` · ${esc(i.location_text)}`:""}</span></div><span class="status status-${esc(i.status)}">${esc(statusLabel(i.status))}</span></label>`).join("")}</div>${items[0].cart_notes?`<p class="cart-note">${esc(items[0].cart_notes)}</p>`:""}<div class="modal-actions"><button class="button ghost" data-cart-qr type="button">QR do carrinho</button><button class="button ghost" data-cart-qrs type="button">Baixar QRs do carrinho</button>${available.length?`<button class="button primary" data-batch type="button">Retirar selecionados</button>`:""}</div></div>`,true);
  const checks=()=>qsa("[data-cart-select]",m).filter(x=>!x.disabled);
  const applyQty=n=>checks().forEach((c,i)=>c.checked=i<n);
  checks().forEach(c=>c.addEventListener("change",()=>{qs("#cart-qty",m).value=checks().filter(x=>x.checked).length}));
  qs("#cart-qty",m)?.addEventListener("input",e=>applyQty(Math.max(0,Math.min(60,Number(e.target.value||0)))));
  qs("#cart-none",m)?.addEventListener("click",()=>{checks().forEach(c=>c.checked=false);qs("#cart-qty",m).value=0});
  qs("#cart-all",m)?.addEventListener("click",()=>{const n=Math.min(60,checks().length);applyQty(n);qs("#cart-qty",m).value=n;if(checks().length>60)notify("Uma retirada em lote aceita até 60 equipamentos por vez.","warning")});
  qs("[data-cart-qr]",m)?.addEventListener("click",()=>openQrModal(token,title,`${items.length} equipamentos`));
  qs("[data-cart-qrs]",m)?.addEventListener("click",()=>downloadCartQrZip(token,title,items));
  qs("[data-batch]",m)?.addEventListener("click",()=>{const selected=new Set(checks().filter(c=>c.checked).map(c=>c.value));const chosen=items.filter(i=>selected.has(i.equipment_id));if(!chosen.length)return notify("Selecione ao menos um equipamento.","warning");if(chosen.length>60)return notify("Selecione no máximo 60 equipamentos por retirada.","warning");m.remove();openCheckoutModal(chosen)});
}
async function openCartForm(item=null){
  let record=item;
  if(item?.qr_token && (!item.equipment_codes || !item.equipment_codes.length)){
    const {data}=await supabase.rpc("cart_scan_equipment_list_v2",{p_qr_token:item.qr_token});
    record={...item,equipment_codes:(data||[]).map(x=>x.code)}
  }
  const codeValue=esc((record?.equipment_codes||[]).join("\n"));
  const m=makeModal(`<div class="ref-modal-shell ref-cart-modal"><aside class="ref-modal-nav"><div class="ref-modal-nav-head"><span class="eyebrow">Lotes · Carrinhos</span><h2>${record?"Editar carrinho":"Novo carrinho"}</h2><p>Organize equipamentos por conjunto, com localização e capacidade.</p></div><div class="ref-modal-nav-list"><button class="ref-modal-nav-item active" type="button"><span>${uiIcon("carts",18)}</span><div><strong>Dados do carrinho</strong><small>Número, nome e local</small></div></button><button class="ref-modal-nav-item" type="button" disabled><span>${uiIcon("equipment",18)}</span><div><strong>Equipamentos</strong><small>Lista por código</small></div></button></div><div class="ref-modal-tip"><strong>Dica</strong><p>Separe os códigos linha por linha. Isso evita confusão, o hobby favorito de qualquer inventário mal feito.</p></div></aside><div class="ref-modal-content"><div class="ref-modal-top"><div><span class="eyebrow">Administração</span><h2>${record?"Editar carrinho":"Cadastrar carrinho"}</h2><p>Cadastre um carrinho para retirada seletiva por QR Code.</p></div><button class="button ghost" data-close type="button">Fechar</button></div><div class="ref-modal-banner"><span class="report-mini-icon">${uiIcon("carts",20)}</span><div><strong>Cadastro de carrinho</strong><p>Defina estrutura, capacidade e composição do lote.</p></div></div><div class="modal-body ref-modal-body"><form id="cart-form" class="form-grid ref-form-grid"><div class="ref-section-title span-2">Informações básicas</div><label>Número *<input name="number" type="number" min="1" required value="${esc(record?.number||"")}" placeholder="Ex.: 1"></label><label>Nome<input name="name" maxlength="120" value="${esc(record?.name||"")}" placeholder="Ex.: Carrinho 1"></label><label>Localização<input name="location_text" maxlength="160" value="${esc(record?.location_text||"")}" placeholder="Ex.: Sala maker"></label><label>Capacidade<input name="capacity" type="number" min="1" max="200" value="${esc(record?.capacity||"")}" placeholder="Ex.: 36"></label><div class="ref-section-title span-2">Composição do carrinho</div><label class="span-2">Códigos dos equipamentos<textarea name="codes" required placeholder="CB-001&#10;CB-002&#10;CB-003">${codeValue}</textarea></label><label class="span-2">Observações<textarea name="notes" maxlength="1200" placeholder="Informações operacionais do carrinho">${esc(record?.notes||"")}</textarea></label><div class="modal-actions span-2 ref-form-actions"><button class="button ghost" data-close type="button">Cancelar</button><button class="button primary" type="submit">Salvar carrinho</button></div></form></div></div></div>`,true);
  qs("#cart-form",m).addEventListener("submit",async e=>{
    e.preventDefault();
    const b=qs('button[type="submit"]',e.currentTarget);
    setBusy(b,true,"Salvando…");
    const f=new FormData(e.currentTarget);
    const codes=[...new Set(String(f.get("codes")||"").split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean))];
    const {error}=await supabase.rpc("save_equipment_cart_v2",{p_cart_id:record?.id?Number(record.id):null,p_number:Number(f.get("number")),p_name:f.get("name").trim()||null,p_equipment_codes:codes,p_location_text:f.get("location_text").trim()||null,p_capacity:f.get("capacity")?Number(f.get("capacity")):null,p_notes:f.get("notes").trim()||null});
    setBusy(b,false);
    if(error)return notify(errText(error),"error");
    notify(record?"Carrinho atualizado.":"Carrinho criado.","success");
    m.remove();
    renderCarts()
  })
}

async function deactivateCart(record){const ok=await confirmAction({title:"Desativar carrinho?",message:`${record.name||`Carrinho ${record.number}`} deixará de aparecer para operação, mas o histórico será preservado.`,confirmText:"Desativar",danger:true});if(!ok)return;const {error}=await supabase.from("equipment_carts").update({is_active:false}).eq("id",Number(record.id));if(error)return notify(errText(error),"error");notify("Carrinho desativado.","success");renderCarts()}

async function renderMaintenance(){if(state.profile.role!=="admin")return navigate("dashboard");state.view="maintenance";const filterCount=activeFilterCount([state.maintenanceStatus]);shell(`<section class="panel workspace-panel"><h1 class="visually-hidden">Manutenção</h1><div class="toolbar workspace-toolbar"><div class="toolbar-cluster"><input id="maintenance-search" class="search" type="search" value="${esc(state.maintenanceSearch)}" placeholder="Buscar equipamento, título ou observação"><button class="filter-button ${filterCount ? 'has-active active' : ''}" id="maintenance-filter-toggle" type="button" aria-expanded="${filterCount ? 'true' : 'false'}">${icon("filter")}<span>Filtros</span>${filterBadge(filterCount)}</button></div></div><div class="filter-drawer" id="maintenance-filter-panel"><div class="filter-grid"><label>Status<select id="maintenance-status"><option value="">Todos</option><option value="open" ${state.maintenanceStatus==='open'?'selected':''}>Aberta</option><option value="resolved" ${state.maintenanceStatus==='resolved'?'selected':''}>Resolvida</option></select></label></div><div class="filter-actions"><button class="button small ghost" id="maintenance-filter-clear" type="button">Limpar filtros</button><button class="button primary small" id="maintenance-filter-apply" type="button">Aplicar</button></div></div><div id="maintenance"><div class="loading">Carregando…</div></div></section>`);const {data,error}=await supabase.from("maintenance_events").select("id,equipment_id,title,notes,resolution,status,opened_at,closed_at,equipments(code,label,brand,model)").order("opened_at",{ascending:false}).limit(300);const h=qs("#maintenance");if(error){h.innerHTML=`<div class="empty"><strong>Erro.</strong><span>${esc(errText(error))}</span></div>`;return}let rows=data||[];rows=smartFilter(rows,state.maintenanceSearch,x=>[x.title,x.notes,x.resolution,x.equipments?.label,x.equipments?.code,x.equipments?.brand,x.equipments?.model,statusLabel(x.status)]);if(state.maintenanceStatus)rows=rows.filter(x=>x.status===state.maintenanceStatus);if(!rows.length){h.innerHTML=`<div class="empty"><strong>Nenhuma manutenção registrada.</strong><span>Abra um equipamento e escolha Manutenção.</span></div>`;}else{h.innerHTML=`<div class="data-list">${rows.map(x=>`<div class="data-row"><div class="data-main"><strong>${esc(x.equipments?.label||x.equipments?.code)} · ${esc(x.title)}</strong><span>${esc(x.equipments?.brand||"")} ${esc(x.equipments?.model||"")} · aberta ${esc(dt(x.opened_at))}</span></div><span class="status status-${esc(x.status)}">${esc(statusLabel(x.status))}</span><div class="row-actions">${x.status==="open"?`<button class="button primary small" data-resolve="${x.id}">Concluir</button>`:""}</div></div>`).join("")}</div>`;qsa("[data-resolve]").forEach(b=>b.addEventListener("click",()=>resolveMaintenance(Number(b.dataset.resolve))));}bindCommittedSearch(qs('#maintenance-search'),value=>{state.maintenanceSearch=value;renderMaintenance()});wireFilterToggle("maintenance-filter-toggle", "maintenance-filter-panel");qs("#maintenance-filter-apply")?.addEventListener("click",()=>{state.maintenanceStatus=qs("#maintenance-status")?.value||"";renderMaintenance()});qs("#maintenance-filter-clear")?.addEventListener("click",()=>{state.maintenanceStatus="";renderMaintenance()});}
function resolveMaintenance(id){const m=makeModal(`<div class="panel-head"><div><span class="eyebrow">Manutenção</span><h2>Concluir manutenção</h2></div><button class="icon-button" data-close>×</button></div><div class="modal-body"><form id="resolve-form" class="auth-form"><label>Resolução<textarea name="resolution" maxlength="1200" placeholder="O que foi feito"></textarea></label><div class="modal-actions"><button class="button" data-close type="button">Cancelar</button><button class="button primary" type="submit">Concluir</button></div></form></div>`);qs("#resolve-form",m).addEventListener("submit",async e=>{e.preventDefault();const b=qs('button[type="submit"]',e.currentTarget);setBusy(b,true,"Concluindo…");const f=new FormData(e.currentTarget);const {error}=await supabase.rpc("resolve_maintenance",{p_event_id:id,p_resolution:f.get("resolution").trim()||null});setBusy(b,false);if(error)return notify(errText(error),"error");notify("Manutenção concluída.","success");m.remove();renderMaintenance()})}


async function renderReports() {
  if(state.profile.role!=="admin") return navigate("dashboard");
  state.view="reports";
  const end=new Date();
  const from=new Date(Date.now()-30*86400000);
  shell(`<section class="panel workspace-panel reports-workspace"><div class="compact-workspace-actions"><h1 class="visually-hidden">Relatórios</h1><div class="report-head-actions"><button class="button ghost" id="report-export" type="button">${uiIcon("upload",18)}<span>Exportar relatório</span></button></div></div>
    <div class="report-filter-strip">
      <label><span>Período</span><input id="report-from" type="date" value="${from.toISOString().slice(0,10)}"></label>
      <label><span>Até</span><input id="report-to" type="date" value="${end.toISOString().slice(0,10)}"></label>
      <label><span>Turma</span><input id="report-class" type="text" placeholder="Todas"></label>
      <label><span>Tipo de equipamento</span><select id="report-group"><option value="">Todos</option>${schoolGroupOptions()}</select></label>
      <label><span>Situação</span><select id="report-status"><option value="">Todas</option><option value="available">Disponível</option><option value="in_use">Em uso</option><option value="maintenance">Manutenção</option><option value="unavailable">Indisponível</option></select></label>
      <button class="button primary" id="report-apply" type="button">${uiIcon("rotate",18)}<span>Atualizar</span></button>
    </div>
    <div id="report-results"><div class="loading">Calculando indicadores…</div></div></section>`);
  qs("#report-apply")?.addEventListener("click",loadReports);
  qs("#report-export")?.addEventListener("click",exportCurrentReport);
  await loadReports();
}
let equipaReportRequest=0;
async function loadReports() {
  const host=qs("#report-results");if(!host)return;
  const request=++equipaReportRequest;
  const start=qs("#report-from")?.value;
  const finish=qs("#report-to")?.value;
  const className=(qs("#report-class")?.value||"").trim().toLowerCase();
  const group=qs("#report-group")?.value||"";
  const status=qs("#report-status")?.value||"";
  const button=qs("#report-apply");
  const setMessage=(title,msg)=>{if(host.isConnected&&request===equipaReportRequest)host.innerHTML=`<div class="empty report-error"><strong>${esc(title)}</strong><span>${esc(msg)}</span><button class="button" id="retry-reports" type="button">Tentar novamente</button></div>`;qs("#retry-reports")?.addEventListener("click",loadReports);};
  if(!start||!finish||start>finish){setMessage("Período inválido","Confira as datas de início e fim.");return;}
  const startDate=new Date(start+"T00:00:00");
  const endDate=new Date(finish+"T00:00:00");endDate.setDate(endDate.getDate()+1);
  if((endDate-startDate)/86400000>370){setMessage("Período muito longo","Selecione até 370 dias.");return;}
  host.innerHTML='<div class="loading" role="status">Atualizando relatório…</div>';
  if(button)button.disabled=true;
  try {
    const report=await supabase.rpc("equipa_admin_report_dashboard",{p_from:startDate.toISOString(),p_to:endDate.toISOString(),p_class:className||null,p_group:group||null,p_status:status||null});
    if(report.error)throw report.error;
    if(!report.data)throw new Error("O servidor não retornou indicadores para este período.");
    if(!host.isConnected||request!==equipaReportRequest)return;
    const inventory=report.data.inventory||{};
    const totals={available:Number(inventory.available||0),in_use:Number(inventory.in_use||0),maintenance:Number(inventory.maintenance||0),unavailable:Number(inventory.unavailable||0)};
    const total=Number(inventory.total||0);
    // Limite explícito para não despejar todos os registros da escola no navegador.
    const chartDays=Math.min(60,Math.round((endDate-startDate)/86400000));
    const chartStart=new Date(endDate.getTime()-chartDays*86400000);
    const byDay=new Map((report.data.activity_days||[]).map(x=>[String(x.day),Number(x.total||0)]));
    const days=Array.from({length:chartDays},(_,i)=>new Date(chartStart.getTime()+i*86400000).toISOString().slice(0,10));
    const maxDay=Math.max(1,...byDay.values());
    const percent=v=>total?Math.round(v*100/total):0;
    const top=Array.isArray(report.data.top_equipment)?report.data.top_equipment.slice(0,8):[];
    const avg=report.data.avg_minutes==null?null:Number(report.data.avg_minutes);
    const note='Indicadores históricos consideram o período; grupo e situação filtram a distribuição atual. Turma e grupo filtram o gráfico, agregado no servidor.';
    host.innerHTML=`<p class="report-scope-note">${esc(note)}</p><div class="report-dashboard-grid">
      <section class="report-card report-usage-card"><div class="report-card-head"><span class="report-mini-icon">${uiIcon("equipment",20)}</span><div><h3>Uso dos equipamentos</h3><p>Distribuição atual do inventário</p></div></div><div class="report-usage-body"><div class="report-donut" style="--p1:${percent(totals.in_use)}%;--p2:${percent(totals.in_use+totals.available)}%;--p3:${percent(totals.in_use+totals.available+totals.unavailable)}%"><div class="report-donut-center"><strong>${total}</strong><span>total</span></div></div><div class="report-legend"><div><i class="legend-green"></i><span>Em uso</span><b>${totals.in_use}</b><small>${percent(totals.in_use)}%</small></div><div><i class="legend-blue"></i><span>Disponíveis</span><b>${totals.available}</b><small>${percent(totals.available)}%</small></div><div><i class="legend-slate"></i><span>Indisponíveis</span><b>${totals.unavailable+totals.maintenance}</b><small>${percent(totals.unavailable+totals.maintenance)}%</small></div></div></div></section>
      <section class="report-card report-maint-card"><div class="report-card-head"><span class="report-mini-icon">${uiIcon("maintenance",20)}</span><div><h3>Manutenções</h3><p>Pendências técnicas atuais</p></div></div><div class="report-center-metric"><strong>${Number(report.data.maintenance_open||0)}</strong><span>manutenções abertas</span></div><button class="report-inline-action" type="button" data-go-report-maint>Ver manutenções ${uiIcon("arrow",17)}</button></section>
      <section class="report-card report-time-card"><div class="report-card-head"><span class="report-mini-icon">${uiIcon("history",20)}</span><div><h3>Tempo médio de uso</h3><p>Retiradas finalizadas no período</p></div></div><div class="report-center-metric"><strong>${Number.isFinite(avg)&&avg!==null?`${Math.round(avg)} min`:'—'}</strong><span>por equipamento devolvido</span></div><div class="report-note">Calculado com as devoluções registradas no período.</div></section>
      <section class="report-card report-table-card"><div class="report-card-head"><span class="report-mini-icon">${uiIcon("reports",20)}</span><div><h3>Equipamentos mais utilizados</h3><p>Retiradas registradas no período</p></div></div><div class="report-table-wrap"><table class="report-table"><thead><tr><th>#</th><th>Equipamento</th><th>Retiradas</th></tr></thead><tbody>${top.length?top.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.code||"Não informado")}</td><td>${Number(x.uses||0)}</td></tr>`).join(""):'<tr><td colspan="3" class="report-empty-cell">Sem movimentações no período.</td></tr>'}</tbody></table></div></section>
      <section class="report-card report-chart-card"><div class="report-card-head"><span class="report-mini-icon">${uiIcon("calendar",20)}</span><div><h3>Atividades por dia</h3><p>Retiradas e atividades · últimos ${chartDays} dias do intervalo</p></div></div><div class="report-bars">${days.map(day=>{const n=byDay.get(day)||0;return `<div class="report-bar-col"><div class="report-bar-track"><div class="report-bar-fill" style="height:${n?Math.max(6,Math.round(n/maxDay*100)):0}%"></div></div><span>${day.slice(8,10)}/${day.slice(5,7)}</span></div>`}).join("")}</div><p class="report-chart-note">Valores consolidados no PostgreSQL.</p></section></div>`;
    qs("[data-go-report-maint]")?.addEventListener("click",()=>navigate("maintenance"));
  }catch(error){console.warn("Falha ao carregar relatórios:",error);setMessage("Relatório indisponível",errText(error));}
  finally{if(button?.isConnected && request===equipaReportRequest)button.disabled=false;}
}

async function exportCurrentReport(){
  const start=qs("#report-from")?.value||new Date().toISOString().slice(0,10);
  const finish=qs("#report-to")?.value||start;
  try {
    const from=new Date(start+"T00:00:00");const to=new Date(finish+"T23:59:59");
    const {data,error}=await supabase.rpc("equipa_admin_reports",{p_from:from.toISOString(),p_to:to.toISOString()});
    if(error) throw error;
    const lines=[['Métrica','Valor'],['Retiradas',data?.withdrawals??0],['Equipamentos utilizados',data?.used_equipment??0],['Itens devolvidos',data?.returned??0],['Com avaria',data?.damaged??0],['Retiradas atrasadas em aberto',data?.late_open??0],['Manutenções abertas',data?.maintenance_open??0],['Duração média (min)',data?.avg_minutes??'']];
    const csv=lines.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');
    downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8;'}),`Equipa-relatorio-${start}-${finish}.csv`);
    notify('Relatório exportado.','success');
  } catch(error){ notify(errText(error),'error'); }
}

// Painel de administração: estatísticas reais, perfil mínimo e consulta sob demanda.
let equipaAdminUsers = [];
let equipaAdminRoleFilter = "";
let equipaAdminUserMeta = {total:0,active:0,roles:0,pages:1};
function equipaAdminUserStatus(u) {
  if (!u.is_active) return {label:"Acesso pendente/inativo",kind:"pending"};
  if (u.banned_until && new Date(u.banned_until).getTime()>Date.now()) return {label:"Banido",kind:"banned"};
  return {label:"Ativo",kind:"active"};
}
function equipaAdminRenderUserRows() {
  const host=qs("#admin-users-table-body");if(!host)return;
  const users=equipaAdminUsers.filter(u=>!equipaAdminRoleFilter||u.role===equipaAdminRoleFilter);
  if(!users.length) {
    host.innerHTML=`<tr><td colspan="6" class="ea-empty">Nenhum usuário encontrado.</td></tr>`;
    return;
  }
  host.innerHTML=users.map(u=>{
    const index=equipaAdminUsers.indexOf(u);
    const status=equipaAdminUserStatus(u);
    return `<tr><td><div class="ea-name-cell"><span class="ea-avatar">${esc((u.full_name||"U").trim().slice(0,1).toUpperCase())}</span><div><strong>${esc(u.full_name||"Usuário")}</strong><small>${esc(roleLabel(u.role))}</small></div></div></td>
    <td class="ea-email">${esc(u.masked_email||"—")}</td><td><span class="ea-role">${esc(roleLabel(u.role))}</span></td>
    <td><span class="ea-status ea-status-${status.kind}">${esc(status.label)}</span></td>
    <td class="ea-date" title="O painel atual não possui campo confiável de último acesso">Não disponível</td>
    <td><button class="ea-action-button" type="button" data-admin-user="${index}" aria-label="Gerenciar ${esc(u.full_name||"usuário")}" title="Gerenciar usuário">${uiIcon("grid",16)}</button></td></tr>`;
  }).join("");
  qsa("[data-admin-user]",host).forEach(button=>button.addEventListener("click",()=>{
    const user=equipaAdminUsers[Number(button.dataset.adminUser)];
    if(user)openUserForm(user);
  }));
}
function equipaAdminRenderUserSummary(){
  const usersCount=qs("#ea-users-count"),rolesCount=qs("#ea-roles-count"),userDescription=qs("#ea-users-subtitle"),status=qs("#ea-users-caption");
  if(usersCount)usersCount.textContent=String(equipaAdminUserMeta.total);
  if(rolesCount)rolesCount.textContent=String(equipaAdminUserMeta.roles);
  if(userDescription)userDescription.textContent=`${equipaAdminUserMeta.active} ativo(s) · ${Math.max(0,equipaAdminUserMeta.total-equipaAdminUserMeta.active)} pendente(s), inativo(s) ou banido(s)`;
  if(status)status.textContent=`${equipaAdminUserMeta.total} conta(s) cadastrada(s)`;
}
async function renderAdmin(){
  if(state.profile.role!=="admin")return navigate("dashboard");
  state.view="admin";equipaAdminRoleFilter="";
  shell(`<section class="admin-workspace ea-admin" aria-label="Central administrativa">
    <h1 class="visually-hidden">Administração</h1>
    <div class="ea-stats" aria-label="Resumo da administração">
      <section class="ea-stat ea-stat-blue"><span class="ea-stat-icon">${uiIcon("admin",25)}</span><div class="ea-stat-info"><h2>Usuários</h2><strong id="ea-users-count" aria-live="polite">—</strong><p id="ea-users-subtitle">Carregando contas…</p></div><button type="button" id="ea-manage-users">Gerenciar usuários ${uiIcon("arrow",16)}</button></section>
      <section class="ea-stat ea-stat-purple"><span class="ea-stat-icon">${uiIcon("audit",25)}</span><div class="ea-stat-info"><h2>Cargos e permissões</h2><strong id="ea-roles-count" aria-live="polite">—</strong><p>Cargos encontrados nas contas cadastradas</p></div><button type="button" id="ea-manage-roles">Gerenciar cargos ${uiIcon("arrow",16)}</button></section>
      <section class="ea-stat ea-stat-green"><span class="ea-stat-icon">${uiIcon("equipment",25)}</span><div class="ea-stat-info"><h2>Dados do sistema</h2><strong id="ea-equipment-count" aria-live="polite">—</strong><p>Equipamentos cadastrados</p></div><button type="button" id="ea-go-equipment">Ver inventário ${uiIcon("arrow",16)}</button></section>
      <section class="ea-stat ea-stat-orange"><span class="ea-stat-icon">${uiIcon("pie",25)}</span><div class="ea-stat-info"><h2>Armazenamento</h2><strong id="ea-db-usage" aria-live="polite">—</strong><div class="ea-storage-track"><div id="ea-db-fill" class="ea-storage-fill" style="width:0%"></div></div><p id="ea-db-subtitle">Consultando capacidade…</p></div><button type="button" id="ea-storage-details">Ver armazenamento ${uiIcon("arrow",16)}</button></section>
    </div>
    <div class="ea-main-grid"><section class="ea-card ea-users-panel" id="ea-users-section"><header class="ea-card-head"><span class="ea-head-icon">${uiIcon("admin",21)}</span><div><h2>Usuários e acessos</h2><p id="ea-users-caption">Contas cadastradas no sistema.</p></div><button class="button ghost ea-head-button" id="ea-see-all" type="button">Ver todos</button></header>
    <div class="ea-user-controls"><label for="ea-user-search">Buscar usuário</label><input class="search" id="ea-user-search" value="${esc(state.adminUserSearch)}" maxlength="80" placeholder="Nome do usuário"><label for="ea-role-filter">Filtrar por cargo</label><select id="ea-role-filter"><option value="">Todos os cargos</option><option value="student">Alunos</option><option value="teacher">Professores</option><option value="admin">Administradores</option></select></div>
    <div class="ea-table-scroller"><table class="ea-users-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Cargo</th><th>Status</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody id="admin-users-table-body"><tr><td colspan="6" class="ea-empty">Carregando usuários…</td></tr></tbody></table></div><div class="pagination" id="ea-user-pagination"></div>
    </section><div class="ea-right-col"><section class="ea-card"><header class="ea-card-head"><span class="ea-head-icon">${uiIcon("maintenance",21)}</span><div><h2>Ferramentas rápidas</h2><p>Acesse as principais funcionalidades da administração.</p></div></header>
    <div class="ea-tools"><button type="button" id="ea-import">${uiIcon("upload",22)}<span><strong>Importar planilha</strong><small>CSV, Excel ou tabela Word</small></span>${uiIcon("arrow",15)}</button><button type="button" id="ea-export">${uiIcon("upload",22)}<span><strong>Exportar inventário</strong><small>Planilha do cadastro atual</small></span>${uiIcon("arrow",15)}</button><button type="button" id="ea-qrs">${uiIcon("grid",22)}<span><strong>QRs para impressão</strong><small>Etiquetas dos equipamentos</small></span>${uiIcon("arrow",15)}</button><button type="button" id="ea-audit">${uiIcon("audit",22)}<span><strong>Abrir auditoria</strong><small>Consulte operações registradas</small></span>${uiIcon("arrow",15)}</button></div></section>
    <section class="ea-card"><header class="ea-card-head"><span class="ea-head-icon">${uiIcon("history",21)}</span><div><h2>Atividade recente</h2><p>Últimas operações registradas na auditoria.</p></div><button class="ea-activity-link" id="ea-all-activity" type="button">Ver todas</button></header><div id="ea-activity" class="ea-activity"><p class="ea-muted">Carregando atividades…</p></div></section></div></div>
    </section>`);
  const go=(id,cb)=>qs(id)?.addEventListener("click",cb);
  go("#ea-manage-users",()=>qs("#ea-users-section")?.scrollIntoView({block:"start",behavior:"smooth"}));
  go("#ea-manage-roles",()=>{qs("#ea-users-section")?.scrollIntoView({block:"start",behavior:"smooth"});qs("#ea-role-filter")?.focus()});
  go("#ea-see-all",()=>{equipaAdminRoleFilter="";state.adminUserSearch="";state.adminUserPage=0;qs("#ea-role-filter").value="";qs("#ea-user-search").value="";loadAdminUsers()});
  qs("#ea-role-filter")?.addEventListener("change",e=>{equipaAdminRoleFilter=e.target.value;state.adminUserPage=0;loadAdminUsers()});
  let userSearchTimer;qs("#ea-user-search")?.addEventListener("input",e=>{clearTimeout(userSearchTimer);userSearchTimer=setTimeout(()=>{state.adminUserSearch=e.target.value.trim();state.adminUserPage=0;loadAdminUsers()},420)});
  go("#ea-go-equipment",()=>navigate("equipment"));
  go("#ea-storage-details",()=>{
    const summary=qs("#ea-db-usage")?.textContent||"Indisponível";
    const info=qs("#ea-db-subtitle")?.textContent||"";
    makeModal(`<div class="panel-head"><div><span class="eyebrow">Armazenamento</span><h2>Capacidade do banco</h2></div><button class="icon-button" data-close aria-label="Fechar">×</button></div><div class="modal-body"><p><strong>Banco de dados: ${esc(summary)}</strong></p><p class="muted">${esc(info)}</p><p class="muted">A limpeza automática, quando ativada no Supabase Cron, remove somente auditorias com mais de 30 dias caso o banco alcance o limite preventivo. Equipamentos, QR Codes, retiradas e históricos de uso são preservados; reservas históricas continuam arquivadas. Excluir registros não reduz necessariamente o tamanho físico antes do autovacuum.</p><div class="modal-actions"><button class="button primary" type="button" data-close>Entendi</button></div></div>`);
  });
  go("#ea-import",()=>window.EquipaInventory?.openHub("import"));
  go("#ea-export",exportEquipments);
  go("#ea-qrs",()=>window.EquipaInventory?.chooseLabels());
  go("#ea-audit",()=>navigate("audit"));
  go("#ea-all-activity",()=>navigate("audit"));
  await Promise.allSettled([loadAdminUsers(),equipaAdminLoadCapacity(),equipaAdminLoadEquipmentCount(),equipaAdminLoadRecentActivity()]);
}
async function loadAdminUsers(){
  const pageSize=20;
  const {data,error}=await supabase.rpc("equipa_admin_user_page",{p_page:state.adminUserPage,p_page_size:pageSize,p_role:equipaAdminRoleFilter||null,p_search:state.adminUserSearch||null});
  const host=qs("#admin-users-table-body");if(!host)return;
  if(error){host.innerHTML=`<tr><td colspan="6" class="ea-empty">Não foi possível carregar usuários: ${esc(errText(error))}</td></tr>`;return}
  const payload=Array.isArray(data)?data[0]:data||{};
  equipaAdminUsers=(payload.rows||[]).map(u=>({id:u.id,full_name:u.full_name,role:u.role,masked_email:u.masked_email,is_active:u.is_active,is_banned:!!(u.banned_until&&new Date(u.banned_until).getTime()>Date.now()),banned_until:u.banned_until}));
  equipaAdminUserMeta={total:Number(payload.total||0),active:Number(payload.active||0),roles:Number(payload.roles||0),pages:Math.max(1,Math.ceil(Number(payload.filtered_total||0)/pageSize))};
  if(state.adminUserPage>=equipaAdminUserMeta.pages){state.adminUserPage=Math.max(0,equipaAdminUserMeta.pages-1);return loadAdminUsers()}
  equipaAdminRenderUserSummary();equipaAdminRenderUserRows();
  const pager=qs("#ea-user-pagination");if(pager){pager.innerHTML=`<span>Página ${state.adminUserPage+1} de ${equipaAdminUserMeta.pages} · ${Number(payload.filtered_total||0)} resultado(s)</span><div><button class="button small" id="ea-user-prev" ${state.adminUserPage===0?'disabled':''}>Anterior</button><button class="button small" id="ea-user-next" ${state.adminUserPage+1>=equipaAdminUserMeta.pages?'disabled':''}>Próxima</button></div>`;qs("#ea-user-prev")?.addEventListener("click",()=>{state.adminUserPage--;loadAdminUsers()});qs("#ea-user-next")?.addEventListener("click",()=>{state.adminUserPage++;loadAdminUsers()})}
}
async function equipaAdminLoadCapacity(){
  let {data,error}=await supabase.rpc("equipa_admin_capacity");
  let legacy=false;
  if(error){legacy=true;({data,error}=await supabase.rpc("admin_capacity_status"));}
  const value=qs("#ea-db-usage"),fill=qs("#ea-db-fill"),subtitle=qs("#ea-db-subtitle");
  if(!value)return;
  if(error){value.textContent="Indisponível";if(subtitle)subtitle.textContent="O servidor não respondeu. Verifique a migration de capacidade.";return}
  const x=Array.isArray(data)?data[0]:data;
  const mb=legacy?Number(x?.database_mb):Number(x?.database_bytes)/1000000;
  const limit=legacy?Number(x?.free_limit_mb):500;
  if(!Number.isFinite(mb)){value.textContent="Indisponível";return}
  const percent=limit>0?100*mb/limit:0;
  value.textContent=`${mb.toLocaleString("pt-BR",{maximumFractionDigits:2})} MB`;
  if(fill)fill.style.width=`${Math.max(0,Math.min(100,percent))}%`;
  if(subtitle)subtitle.textContent=legacy?`${percent.toLocaleString("pt-BR",{maximumFractionDigits:1})}% de ${limit} MB · atualizar migration de capacidade`:`${percent.toLocaleString("pt-BR",{maximumFractionDigits:1})}% de 500 MB · auditorias ${(Number(x.audit_bytes||0)/1000000).toFixed(1)} MB · limpeza ${x.auto_cleanup_enabled?'ativa':'não agendada'}${x.warning?' · atenção ao limite':''}`;
}
async function equipaAdminLoadEquipmentCount(){
  const target=qs("#ea-equipment-count");if(!target)return;
  const {count,error}=await supabase.from("equipments").select("id",{count:"exact",head:true});
  target.textContent=error?"Indisponível":Number(count||0).toLocaleString("pt-BR");
}
async function equipaAdminLoadRecentActivity(){
  const host=qs("#ea-activity");if(!host)return;
  const {data,error}=await supabase.from("audit_events").select("id,occurred_at,actor_name,action,entity_type,summary").order("occurred_at",{ascending:false}).limit(4);
  if(error){host.innerHTML=`<p class="ea-muted">Não foi possível carregar a atividade recente.</p>`;return}
  if(!data?.length){host.innerHTML=`<p class="ea-muted">Nenhuma atividade administrativa registrada.</p>`;return}
  host.innerHTML=data.map(x=>`<div class="ea-event"><span class="ea-event-dot" aria-hidden="true"></span><div><strong>${esc(auditActionLabel(x.action))} · ${esc(auditEntityLabel(x.entity_type))}</strong><small>${esc(x.actor_name||"Sistema")}</small></div><time>${esc(dt(x.occurred_at))}</time></div>`).join("");
}
function openUserForm(u){const m=makeModal(`<div class="panel-head"><div><span class="eyebrow">Usuário</span><h2>${esc(u.full_name)}</h2><p>${esc(u.masked_email||"")}</p></div><button class="icon-button" data-close>×</button></div><div class="modal-body"><form id="user-form" class="auth-form"><label>Nome<input name="full_name" required maxlength="120" value="${esc(u.full_name)}"></label><label>Cargo<select name="role">${["student","teacher","admin"].map(r=>`<option value="${r}" ${u.role===r?"selected":""}>${roleLabel(r)}</option>`).join("")}</select></label><div class="user-access-actions">${!u.is_active?`<button class="button primary" type="button" data-user-action="approve">Aprovar/restaurar acesso</button>`:`<button class="button danger" type="button" data-user-action="remove">Remover acesso</button>`}${u.is_banned?`<button class="button" type="button" data-user-action="unban">Remover banimento</button>`:`<button class="button danger" type="button" data-user-ban>Banir temporariamente</button>`}</div><div class="modal-actions"><button class="button" data-close type="button">Cancelar</button><button class="button primary" type="submit">Salvar nome e cargo</button></div></form></div>`);
  qs("#user-form",m).addEventListener("submit",async e=>{e.preventDefault();const b=qs('button[type="submit"]',e.currentTarget);setBusy(b,true,"Salvando…");const f=new FormData(e.currentTarget);const {error}=await supabase.rpc("admin_update_user",{p_user_id:u.id,p_full_name:f.get("full_name").trim(),p_role:f.get("role")});setBusy(b,false);if(error)return notify(errText(error),"error");notify("Usuário atualizado.","success");m.remove();loadAdminUsers()});
  qs('[data-user-action="approve"]',m)?.addEventListener("click",()=>{m.remove();adminUserAction(u,"approve")});qs('[data-user-action="remove"]',m)?.addEventListener("click",()=>{m.remove();adminUserAction(u,"remove")});qs('[data-user-action="unban"]',m)?.addEventListener("click",()=>{m.remove();adminUserAction(u,"unban")});qs('[data-user-ban]',m)?.addEventListener("click",()=>{m.remove();openBanUser(u)});
}
async function adminUserAction(u,action,hours=null){const labels={approve:"aprovar o acesso",restore:"restaurar o acesso",remove:"remover o acesso",ban:"banir a conta",unban:"remover o banimento"};if(["remove","ban"].includes(action)){const ok=await confirmAction({title:"Confirmar ação administrativa?",message:`Deseja ${labels[action]} de ${u.full_name}? O evento ficará registrado na auditoria.`,confirmText:"Confirmar",danger:true});if(!ok)return}const {data,error}=await supabase.functions.invoke("equipa-admin-users",{body:{action,userId:u.id,hours}});if(error||data?.error)return notify(data?.error||errText(error),"error");notify("Acesso do usuário atualizado.","success");loadAdminUsers()}
function openBanUser(u){const m=makeModal(`<div class="panel-head"><div><span class="eyebrow">Controle de acesso</span><h2>Banir ${esc(u.full_name)}</h2></div><button class="icon-button" data-close>×</button></div><div class="modal-body"><p class="muted">O banimento bloqueia novas autenticações pelo período escolhido. O histórico do usuário é preservado.</p><label>Duração<select id="ban-hours"><option value="24">24 horas</option><option value="168" selected>7 dias</option><option value="720">30 dias</option><option value="876000">Indeterminado</option></select></label><div class="modal-actions"><button class="button" data-close type="button">Cancelar</button><button class="button danger-solid" id="confirm-ban" type="button">Banir usuário</button></div></div>`);qs("#confirm-ban",m)?.addEventListener("click",()=>{const hours=Number(qs("#ban-hours",m).value);m.remove();adminUserAction(u,"ban",hours)})}

async function renderAudit(){if(state.profile.role!=="admin")return navigate("dashboard");state.view="audit";shell(`<section class="panel workspace-panel"><h1 class="visually-hidden">Auditoria</h1><div class="toolbar workspace-toolbar"><div class="toolbar-cluster"><input class="search" id="audit-search" value="${esc(state.auditSearch)}" placeholder="Buscar pessoa, resumo ou registro"><button class="filter-button" id="audit-filter-toggle" type="button"><span>Filtros</span></button></div></div><div class="filter-drawer" id="audit-filter-panel"><div class="filter-grid"><label>Tipo<select id="audit-entity"><option value="">Todos</option><option value="equipments">Equipamentos</option><option value="withdrawals">Retiradas</option><option value="withdrawal_items">Itens de retirada</option><option value="equipment_carts">Carrinhos</option><option value="maintenance_events">Manutenção</option><option value="profiles">Usuários</option><option value="user_access">Acesso de usuários</option><option value="legal_acceptances">Aceites legais</option></select></label><label>Ação<select id="audit-action"><option value="">Todas</option><option value="insert">Criação</option><option value="update">Alteração</option><option value="delete">Exclusão</option><option value="approve">Aprovação</option><option value="remove">Remoção de acesso</option><option value="ban">Banimento</option><option value="unban">Desbanimento</option></select></label></div><div class="filter-actions"><button class="button small ghost" id="audit-clear">Limpar</button><button class="button primary small" id="audit-apply">Aplicar</button></div></div><div id="audit-results"><div class="loading">Carregando auditoria…</div></div></section>`);wireFilterToggle("audit-filter-toggle","audit-filter-panel");qs("#audit-entity").value=state.auditEntity;qs("#audit-action").value=state.auditAction;qs("#audit-apply")?.addEventListener("click",()=>{state.auditEntity=qs("#audit-entity").value;state.auditAction=qs("#audit-action").value;loadAudit()});qs("#audit-clear")?.addEventListener("click",()=>{state.auditEntity="";state.auditAction="";state.auditSearch="";renderAudit()});let timer;qs("#audit-search")?.addEventListener("input",e=>{clearTimeout(timer);timer=setTimeout(()=>{state.auditSearch=e.target.value;loadAudit()},420)});await loadAudit()}
async function loadAudit(){const pageSize=25;const {data,error}=await supabase.rpc("equipa_admin_audit_page",{p_page:state.auditPage,p_page_size:pageSize,p_entity:state.auditEntity||null,p_action:state.auditAction||null,p_search:state.auditSearch||null});const h=qs("#audit-results");if(!h)return;if(error){h.innerHTML=`<div class="empty"><strong>Erro ao carregar auditoria.</strong><span>${esc(errText(error))}</span><button class="button" id="audit-retry">Tentar novamente</button></div>`;qs("#audit-retry")?.addEventListener("click",loadAudit);return}const payload=Array.isArray(data)?data[0]:data||{};const rows=payload.rows||[];const total=Number(payload.total||0);const pages=Math.max(1,Math.ceil(total/pageSize));if(state.auditPage>=pages){state.auditPage=Math.max(0,pages-1);return loadAudit()}if(!rows.length){h.innerHTML=`<div class="empty"><strong>Nenhum evento.</strong><span>Não há registros compatíveis com os filtros.</span></div>`;return}h.innerHTML=`<div class="data-list">${rows.map(x=>`<button class="data-row" type="button" data-audit='${esc(JSON.stringify(x))}'><div class="data-main"><strong>${esc(x.actor_name||"Sistema")} · ${esc(auditActionLabel(x.action))}</strong><span>${esc(auditEntityLabel(x.entity_type))}${x.entity_id?` · ${esc(x.entity_id)}`:""} · ${esc(x.summary||"")}</span></div><span class="status">${esc(auditActionLabel(x.action))}</span><span class="data-date">${esc(dt(x.occurred_at))}</span></button>`).join("")}</div><div class="pagination"><span>Página ${state.auditPage+1} de ${pages} · ${total} evento(s)</span><div><button class="button small" id="audit-prev" ${state.auditPage===0?'disabled':''}>Anterior</button><button class="button small" id="audit-next" ${state.auditPage+1>=pages?'disabled':''}>Próxima</button></div></div>`;qsa("[data-audit]").forEach(b=>b.addEventListener("click",()=>openAuditDetail(JSON.parse(b.dataset.audit))));qs("#audit-prev")?.addEventListener("click",()=>{state.auditPage--;loadAudit()});qs("#audit-next")?.addEventListener("click",()=>{state.auditPage++;loadAudit()})}
function auditActionLabel(v){return({insert:"Criado",update:"Alterado",delete:"Excluído",approve:"Aprovado",restore:"Restaurado",remove:"Acesso removido",deactivate:"Desativado",ban:"Banido",unban:"Desbanido"})[v]||v||"Evento"}
function auditEntityLabel(v){return({equipments:"Equipamento",withdrawals:"Retirada",withdrawal_items:"Item de retirada",equipment_carts:"Carrinho",equipment_cart_items:"Item do carrinho",maintenance_events:"Manutenção",profiles:"Usuário",user_access:"Acesso de usuário",legal_acceptances:"Aceite legal"})[v]||v||"Registro"}
function openAuditDetail(x){const safe=JSON.stringify(x.details||{},null,2);makeModal(`<div class="panel-head"><div><span class="eyebrow">Auditoria</span><h2>${esc(auditActionLabel(x.action))} · ${esc(auditEntityLabel(x.entity_type))}</h2></div><button class="icon-button" data-close>×</button></div><div class="modal-body"><div class="detail-grid">${detail("Responsável",x.actor_name)}${detail("Data",dt(x.occurred_at))}${detail("Registro",x.entity_id)}${detail("Resumo",x.summary)}</div><details class="audit-details"><summary>Detalhes técnicos</summary><pre>${esc(safe)}</pre></details></div>`,true)}

async function loadCapacity(){const {data,error}=await supabase.rpc("admin_capacity_status");const h=qs("#capacity");if(!h)return;if(error){h.innerHTML=`<div class="empty"><strong>Não foi possível medir.</strong><span>${esc(errText(error))}</span></div>`;return}const x=Array.isArray(data)?data[0]:data;h.innerHTML=`<div class="capacity"><div class="capacity-top"><div><span class="eyebrow">Uso atual</span><strong>${Number(x.database_mb).toLocaleString("pt-BR",{maximumFractionDigits:2})} MB</strong></div><span class="status status-${x.policy_state==='normal'?'available':'maintenance'}">${esc(x.policy_state)}</span></div><div class="capacity-track"><div class="capacity-fill" style="width:${Math.min(100,Number(x.percent_of_free_limit))}%"></div></div><small>${Number(x.percent_of_free_limit).toFixed(2)}% de ${x.free_limit_mb} MB · preparar em ${x.prepare_mb} MB · arquivar em ${x.archive_mb} MB · limpeza em ${x.purge_mb} MB</small></div>`;}

function normalizeHeader(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/\s+/g,"_")}
function fieldFromRow(row, names){for(const n of names){const key=Object.keys(row).find(k=>normalizeHeader(k)===n);if(key!==undefined&&String(row[key]??"").trim()!=="")return String(row[key]).trim()}return ""}
function mapImportRows(raw){const seen=new Set();return raw.map((r,i)=>{const code=fieldFromRow(r,["numero","codigo","code","n","id"]);const asset=fieldFromRow(r,["patrimonio","asset_tag","asset"]);const model=fieldFromRow(r,["modelo","model"]);const label=fieldFromRow(r,["nome","label","rotulo"]);const brand=fieldFromRow(r,["marca","brand","fabricante"])||"Não informado";const serial=fieldFromRow(r,["numero_de_serie","numero_serie","serial","serial_number"]);const location=fieldFromRow(r,["local","localizacao","location","location_text"]);const notes=fieldFromRow(r,["observacao","observacoes","notes"]);let group=normalizeHeader(fieldFromRow(r,["tipo","grupo","categoria","school_group"]));group=({chromebook:"chromebook",positivo_novo:"positivo_novo",positivos_novos:"positivo_novo",positivo_tecnico:"positivo_tecnico",positivos_tecnico:"positivo_tecnico",positivo_antigo:"positivo_antigo",positivos_antigos:"positivo_antigo",thinkpad:"thinkpad_lenovo",thinkpad_lenovo:"thinkpad_lenovo",lenovo:"thinkpad_lenovo",tablet:"tablet",tablete:"tablet",tabletes:"tablet"})[group]||group||null;if(group&&!['chromebook','positivo_novo','positivo_tecnico','positivo_antigo','thinkpad_lenovo','tablet','outro'].includes(group))group='outro';let status=normalizeHeader(fieldFromRow(r,["estado","status"])||"available");status=({disponivel:"available",em_uso:"in_use",manutencao:"maintenance",indisponivel:"unavailable"})[status]||status;if(!["available","in_use","maintenance","unavailable"].includes(status))status="available";const errors=[];if(!code)errors.push("Número/código obrigatório");if(!model)errors.push("Modelo obrigatório");if(code&&seen.has(code.toLowerCase()))errors.push("Código duplicado no arquivo");if(code)seen.add(code.toLowerCase());return{line:i+2,code,asset_tag:asset||null,brand,model,label:label||null,school_group:group,serial_number:serial||null,location_text:location||null,notes:notes||null,status,is_active:true,errors}})}
function openImportModal(){return window.EquipaInventory.openHub("import");}
async function fetchAllEquipments(limit=10000){const all=[];for(let from=0;from<limit;from+=500){const {data,error}=await supabase.from("equipments").select("code,asset_tag,brand,model,label,school_group,serial_number,location_text,notes,status,is_active,qr_token,created_at,updated_at").order("code").range(from,from+499);if(error)throw error;all.push(...(data||[]));if((data||[]).length<500)break}return all}
async function exportEquipments(){try{await ensureXLSXLib();const rows=await fetchAllEquipments();const sheet=window.XLSX.utils.json_to_sheet(rows.map(x=>({Numero:x.code,Patrimonio:x.asset_tag||"",Grupo:schoolGroupLabel(x.school_group),Marca:x.brand,Modelo:x.model,Nome:x.label||"",NumeroSerie:x.serial_number||"",Localizacao:x.location_text||"",Observacoes:x.notes||"",Estado:statusLabel(x.status),Ativo:x.is_active?"Sim":"Não",QR:x.qr_token,Criado:x.created_at,Atualizado:x.updated_at})));const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,sheet,"Equipamentos");window.XLSX.writeFile(wb,`Equipa-equipamentos-${new Date().toISOString().slice(0,10)}.xlsx`)}catch(error){notify(errText(error),"error")}}
function safeFileName(v="qr"){return String(v||"qr").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9._-]+/gi,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,90)||"qr"}
async function qrPngBlob(text,size=420){await ensureQRCodeLib();const holder=document.createElement("div");holder.style.cssText="position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden";document.body.append(holder);new window.QRCode(holder,{text,width:size,height:size,correctLevel:window.QRCode.CorrectLevel.M});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const canvas=holder.querySelector("canvas");const img=holder.querySelector("img");let blob;if(canvas)blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Falha ao gerar QR")),"image/png"));else if(img?.src){blob=await (await fetch(img.src)).blob()}holder.remove();return blob}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function downloadQrZip(entries,fileName){if(!entries?.length)return notify("Nenhum QR disponível.","warning");await ensureJSZipLib();const zip=new window.JSZip();const folder=zip.folder("QR-Codes");for(let i=0;i<entries.length;i++){const e=entries[i];folder.file(`${safeFileName(e.name)}.png`,await qrPngBlob(e.url));if(i%15===0)await new Promise(r=>setTimeout(r,0))}const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});downloadBlob(blob,`${safeFileName(fileName)}.zip`);notify(`${entries.length} QR Code(s) preparados.`,"success")}
async function downloadAllEquipmentQrs(){const rows=(await fetchAllEquipments()).filter(x=>x.is_active&&x.qr_token);await downloadQrZip(rows.map(x=>({name:`${x.code}-${x.label||x.model}`,url:qrUrl(x.qr_token)})),`Equipa-QRs-equipamentos-${new Date().toISOString().slice(0,10)}`)}
async function downloadCartQrZip(token,title,items){const entries=[{name:`Carrinho-${title}`,url:qrUrl(token)},...items.filter(x=>x.qr_token).map(x=>({name:`${x.code}-${x.label||x.model}`,url:qrUrl(x.qr_token)}))];await downloadQrZip(entries,`Equipa-QRs-${title}`)}
async function printQrBatch(){return window.EquipaInventory.chooseLabels();}

function parseQrToken(raw = "") {
  const value = String(raw || "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(value)) return value;
  try {
    const url = new URL(value);
    const token = url.searchParams.get("qr") || url.searchParams.get("e");
    return uuidPattern.test(token || "") ? token : null;
  } catch { return null; }
}
async function openScannedToken(token) {
  const scan = await scanPublic(token);
  if (!scan) return notify("QR inválido, inativo ou não reconhecido pelo Equipa.", "error");
  if (scan.kind === "cart") {
    state.view = "carts";
    await renderCarts();
    return openCart(token);
  }
  const { data, error } = await supabase.from("equipments").select("id").eq("qr_token", token).maybeSingle();
  if (error || !data) return notify("Equipamento não encontrado.", "error");
  state.view = "equipment";
  await renderEquipment();
  return openEquipment(data.id);
}
async function openMobileQrScanner() {
  let jsQR;
  try { jsQR = await ensureJsQRLib(); }
  catch (error) { return notify(error.message, "error"); }
  if (!navigator.mediaDevices?.getUserMedia) return notify("Este navegador não oferece acesso à câmera para leitura de QR.", "error");
  const back = document.createElement("div");
  back.className = "modal-backdrop scanner-backdrop";
  back.innerHTML = `<section class="mobile-scanner" role="dialog" aria-modal="true"><header class="scanner-head"><div><span class="eyebrow">Leitor Equipa</span><h2>Aponte para o QR Code</h2></div><button class="scanner-close" type="button" aria-label="Fechar">×</button></header><div class="scanner-stage"><video class="scanner-video" autoplay muted playsinline></video><canvas class="scanner-canvas" aria-hidden="true"></canvas><div class="scanner-frame"><i></i><i></i><i></i><i></i></div><div class="scanner-line"></div></div><p class="scanner-help">Mantenha o código dentro da área marcada. A leitura acontece automaticamente.</p></section>`;
  document.body.append(back);
  const video = qs(".scanner-video", back);
  const canvas = qs(".scanner-canvas", back);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let stream = null;
  let raf = 0;
  let stopped = false;
  let lastScan = 0;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach(track => track.stop());
    back.remove();
  };
  qs(".scanner-close", back)?.addEventListener("click", cleanup);
  back.addEventListener("click", e => { if (e.target === back) cleanup(); });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    cleanup();
    return notify("Não foi possível acessar a câmera. Verifique a permissão do navegador.", "error");
  }
  const tick = async now => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    if (now - lastScan < 120 || video.readyState < 2) return;
    lastScan = now;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const maxW = 720;
    const scale = Math.min(1, maxW / vw);
    canvas.width = Math.max(1, Math.floor(vw * scale));
    canvas.height = Math.max(1, Math.floor(vh * scale));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
    const token = result?.data ? parseQrToken(result.data) : null;
    if (!token) return;
    if (navigator.vibrate) navigator.vibrate(45);
    cleanup();
    await openScannedToken(token);
  };
  raf = requestAnimationFrame(tick);
}

async function handleScanAfterLogin(){const token=scanTokenFromUrl();if(!token)return false;const scan=await scanPublic(token);if(!scan){notify("QR inválido ou inativo.","error");return false}state.pendingScan=scan;if(scan.kind==="cart"){state.view="carts";await renderCarts();await openCart(token);return true}const {data,error}=await supabase.from("equipments").select("id").eq("qr_token",token).maybeSingle();if(error||!data)return false;state.view="equipment";await renderEquipment();await openEquipment(data.id);return true}
const STARTUP_TIMEOUT_MS = 12000;
let authInitGeneration = 0;
let authSubscription = null;
let bootRunning = false;

function withTimeout(promise, ms = STARTUP_TIMEOUT_MS, label = "operação") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tempo limite excedido ao carregar ${label}.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function showBootLoader() {
  app.innerHTML = `<main class="boot" aria-label="Carregando"><div class="iphone-loader"><i></i></div></main>`;
}

function renderStartupError(error) {
  console.error("Equipa startup:", error);
  window.__equipaBootReady?.();
  const code = /^[A-Z0-9_]{3,32}$/.test(String(error?.code || "")) ? error.code : "SEM_CODIGO";
  app.innerHTML = `<main class="boot boot-error"><div class="startup-error-card" role="alert"><span class="eyebrow">Diagnóstico de inicialização</span><strong>Não foi possível carregar o painel.</strong><span>${esc(errText(error))}</span><small class="startup-diagnostic">Código: ${esc(code)}. Envie esse código à administração, sem compartilhar sua senha.</small><div class="startup-error-actions"><button class="button primary" id="startup-retry" type="button">Tentar novamente</button><button class="button ghost" id="startup-signout" type="button">Abrir login</button></div></div></main>`;
  qs("#startup-retry")?.addEventListener("click", () => boot());
  qs("#startup-signout")?.addEventListener("click", async () => {
    try { await withTimeout(supabase.auth.signOut(), 6000, "saída da conta"); } catch {}
    state.session = null;
    state.profile = null;
    renderAuth(null);
    window.__equipaBootReady?.();
  });
}

async function initSession(session) {
  if (!session?.user?.id) throw new Error("Sessão inválida. Entre novamente.");
  state.session = session;
  try {
    await withTimeout(loadProfile(), STARTUP_TIMEOUT_MS, "perfil escolar");
  } catch (error) {
    const message = String(error?.message || error || "");
    // Uma policy RLS ausente tambem pode produzir 0 linhas. Nao destruir a sessao
    // nem declarar o usuario inexistente enquanto o banco estiver quebrado.
    if (error?.code === "PGRST116" || /0 rows|no rows/i.test(message)) {
      throw Object.assign(new Error("Perfil escolar indisponível. Confirme se o cadastro existe e se as permissões do banco estão ativas."), { code: "EQUIPA_PROFILE_UNAVAILABLE" });
    }
    throw error;
  }

  const { data: allowed, error: accessError } = await withTimeout(
    supabase.rpc("equipa_access_allowed"), STARTUP_TIMEOUT_MS, "permissões da conta"
  );
  if (accessError) throw accessError;
  if (allowed !== true) {
    renderPendingApproval();
    window.__equipaBootReady?.();
    return;
  }

  // Não aplicamos timeout enquanto o usuário está lendo/aceitando os documentos.
  if (!(await ensureLegalAcceptance())) {
    window.__equipaBootReady?.();
    return;
  }

  const handledScan = await withTimeout(handleScanAfterLogin(), STARTUP_TIMEOUT_MS, "QR Code inicial");
  if (!handledScan) await withTimeout(renderDashboard(), STARTUP_TIMEOUT_MS, "visão geral");
  window.__equipaBootReady?.();
}

function scheduleSessionInit(sessionNow) {
  const generation = ++authInitGeneration;
  setTimeout(() => {
    if (generation !== authInitGeneration) return;
    showBootLoader();
    initSession(sessionNow).catch(renderStartupError);
  }, 0);
}

function installAuthListener() {
  authSubscription?.unsubscribe?.();
  const result = supabase.auth.onAuthStateChange((event, sessionNow) => {
    if (event === "TOKEN_REFRESHED" && sessionNow) {
      state.session = sessionNow;
      return;
    }
    if (event === "SIGNED_OUT" || !sessionNow) {
      authInitGeneration++;
      state.session = null;
      state.profile = null;
      renderAuth(null);
      window.__equipaBootReady?.();
      return;
    }
    if (event === "SIGNED_IN" && (!state.session || state.session.user?.id !== sessionNow.user?.id)) {
      scheduleSessionInit(sessionNow);
    }
  });
  authSubscription = result?.data?.subscription || result?.subscription || null;
}

async function boot() {
  if (bootRunning) return;
  bootRunning = true;
  try {
    installGlobalContextMenus();

    // O login nasce localmente; a rede nunca é requisito para sair do loading inicial.
    renderAuth(null);
    window.__equipaBootReady?.();
    installAuthListener();

    const { data, error } = await withTimeout(supabase.auth.getSession(), 8000, "sessão");
    if (error) {
      console.warn("Não foi possível restaurar a sessão; mantendo tela de login.", error);
      notify("Não foi possível restaurar a sessão anterior. Entre novamente.", "warning");
      return;
    }

    const session = data?.session || null;
    if (!session) return;

    showBootLoader();
    await initSession(session);
  } catch (error) {
    renderStartupError(error);
  } finally {
    bootRunning = false;
  }
}

boot();
setInterval(()=>{if(state.session&&state.profile&&document.visibilityState==='visible')refreshEquipaNotificationBadge().catch(()=>{});},45000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.session)refreshEquipaNotificationBadge().catch(()=>{});});
