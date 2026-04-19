/* ═══════════════════════════════════════════════════
   GROWLOG — app.js
   Módulos: DB · Utils · Light · Entry · Modals · App · UI
═══════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════
   DB — persistência localStorage
═══════════════════════════════════════════════ */
const DB = (() => {
  const KEY = 'growlog_v1';
  let _data = { plants: [] };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) _data = JSON.parse(raw);
      if (!Array.isArray(_data.plants)) _data.plants = [];
    } catch (e) {
      _data = { plants: [] };
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(_data));
    } catch (e) {
      UI.toast('⚠️ Erro ao salvar dados.');
    }
  }

  function get() { return _data; }

  function getPlant(id) {
    return _data.plants.find(p => p.id === id) || null;
  }

  function upsertPlant(plant) {
    const idx = _data.plants.findIndex(p => p.id === plant.id);
    if (idx >= 0) _data.plants[idx] = plant;
    else _data.plants.push(plant);
    save();
  }

  function deletePlant(id) {
    _data.plants = _data.plants.filter(p => p.id !== id);
    save();
  }

  function replaceFull(newData) {
    _data = newData;
    save();
  }

  return { load, save, get, getPlant, upsertPlant, deletePlant, replaceFull };
})();


/* ═══════════════════════════════════════════════
   UTILS — helpers gerais
═══════════════════════════════════════════════ */
const Utils = (() => {

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function nowTime() {
    return new Date().toTimeString().slice(0, 5);
  }

  // Dias entre duas datas ISO (YYYY-MM-DD), resultado >= 0
  function daysBetween(startIso, endIso) {
    const a = new Date(startIso + 'T00:00:00');
    const b = new Date(endIso + 'T00:00:00');
    return Math.max(0, Math.round((b - a) / 86_400_000));
  }

  // Dias de vida da planta até uma data de referência (default: hoje)
  function daysAlive(plant, asOf) {
    if (!plant.startDate) return 0;
    return daysBetween(plant.startDate, asOf || today());
  }

  // Semana dentro do estágio atual (reseta ao mudar de estágio)
  function weekInStage(plant, asOf) {
    const ref = asOf || today();
    const stageStart = plant.stageStartDate || plant.startDate;
    if (!stageStart) return 1;
    return Math.max(1, Math.floor(daysBetween(stageStart, ref) / 7) + 1);
  }

  // Formata data ISO para exibição pt-BR
  function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  // Escapa HTML
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Cria e clica link de download
  function download(content, filename, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Labels de estágio
  const STAGE_LABELS = {
    germinacao: 'Germinação',
    plantula:   'Plântula',
    vegetativo: 'Vegetativo',
    floracao:   'Floração',
    colheita:   'Colheita',
  };

  const STAGE_EMOJI = {
    germinacao: '🌰',
    plantula:   '🌱',
    vegetativo: '🍃',
    floracao:   '🌸',
    colheita:   '✂️',
  };

  function stageLabel(s) { return STAGE_LABELS[s] || s || '—'; }
  function stageEmoji(s) { return STAGE_EMOJI[s] || '🌿'; }

  return { uid, today, nowTime, daysBetween, daysAlive, weekInStage, fmtDate, esc, download, stageLabel, stageEmoji };
})();


/* ═══════════════════════════════════════════════
   LIGHT — cálculos de luz (Lux → PPFD → DLI)
═══════════════════════════════════════════════ */
const Light = (() => {
  // Fator de conversão Lux → PPFD para LED full-spectrum
  // Range típico: 0.013–0.022. 0.0185 é o valor médio recomendado.
  const LUX_PPFD_FACTOR = 0.0185;

  function luxToPPFD(lux) {
    return Math.round(lux * LUX_PPFD_FACTOR);
  }

  function calcDLI(ppfd, hoursOn) {
    // DLI (mol/m²/d) = PPFD × horas × 3600 / 1.000.000
    return parseFloat(((ppfd * hoursOn * 3600) / 1_000_000).toFixed(2));
  }

  function parseTimeHours(t) {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h + m / 60;
  }

  function photoperiodHours(onTime, offTime) {
    const on  = parseTimeHours(onTime);
    const off = parseTimeHours(offTime);
    if (on === null || off === null) return null;
    let h = off - on;
    if (h <= 0) h += 24; // ciclo overnight
    return h;
  }

  // Chamado a cada input de lux / horários no modal de registro
  function recalc() {
    const luxVal  = parseFloat(document.getElementById('ef-lux').value);
    const onTime  = document.getElementById('ef-ledon').value;
    const offTime = document.getElementById('ef-ledoff').value;

    const ppfdEl     = document.getElementById('ef-ppfd-auto');
    const dliEl      = document.getElementById('ef-dli-auto');
    const feedbackEl = document.getElementById('light-feedback');

    let ppfd  = null;
    let dli   = null;
    const lines = [];

    if (!isNaN(luxVal) && luxVal > 0) {
      ppfd = luxToPPFD(luxVal);
      ppfdEl.textContent = ppfd + ' µmol/m²/s';
      ppfdEl.classList.remove('dim');
      lines.push(`✅ PPFD estimado: <strong>${ppfd} µmol/m²/s</strong> (Lux × 0.0185)`);
    } else {
      ppfdEl.textContent = '— preencha Lux';
      ppfdEl.classList.add('dim');
    }

    const hours = photoperiodHours(onTime, offTime);
    if (ppfd !== null && hours !== null) {
      dli = calcDLI(ppfd, hours);
      dliEl.textContent = dli + ' mol/m²/d';
      dliEl.classList.remove('dim');
      lines.push(`📅 Fotoperíodo: <strong>${hours.toFixed(1)}h</strong> → DLI: <strong>${dli} mol/m²/d</strong>`);
    } else if (ppfd !== null) {
      dliEl.textContent = '— preencha horários';
      dliEl.classList.add('dim');
    } else {
      dliEl.textContent = '— preencha horas';
      dliEl.classList.add('dim');
    }

    if (lines.length > 0) {
      feedbackEl.innerHTML = lines.join('<br>');
      feedbackEl.classList.remove('hidden');
    } else {
      feedbackEl.classList.add('hidden');
    }

    // Retorna os valores calculados para uso no saveEntry
    return { ppfd, dli };
  }

  return { luxToPPFD, calcDLI, photoperiodHours, recalc };
})();


/* ═══════════════════════════════════════════════
   VPD — Vapour Pressure Deficit
   Fórmula: VPD = SVP × (1 - RH/100)
   SVP (kPa) = 0.6108 × e^(17.27 × T / (T + 237.3))
═══════════════════════════════════════════════ */
const VPD = (() => {

  function calcSVP(tempC) {
    return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  }

  function calc(tempC, rh) {
    const svp = calcSVP(tempC);
    return parseFloat((svp * (1 - rh / 100)).toFixed(2));
  }

  // Retorna zona e cor para um valor de VPD e estágio
  function zone(vpd, stage) {
    // Zonas por estágio (kPa)
    const zones = {
      germinacao: { low: 0.4,  high: 0.8  },
      plantula:   { low: 0.4,  high: 0.8  },
      vegetativo: { low: 0.8,  high: 1.2  },
      floracao:   { low: 1.2,  high: 1.6  },
      colheita:   { low: 1.2,  high: 1.6  },
    };
    const z = zones[stage] || zones.vegetativo;

    if (vpd < z.low - 0.1)  return { label: '🔵 Muito baixo', cls: 'vpd-low',  color: '#5ca8e0' };
    if (vpd < z.low)        return { label: '🟢 Abaixo do ideal', cls: 'vpd-ok-low', color: '#3ddc6a' };
    if (vpd <= z.high)      return { label: '✅ Zona ideal', cls: 'vpd-ideal', color: '#3ddc6a' };
    if (vpd <= z.high + 0.2) return { label: '🟡 Acima do ideal', cls: 'vpd-ok-high', color: '#f5a623' };
    return { label: '🔴 Muito alto', cls: 'vpd-high', color: '#e05c5c' };
  }

  // Chamado a cada input de temperatura/UR no formulário
  function recalc() {
    const temp = parseFloat(document.getElementById('ef-temp').value);
    const rh   = parseFloat(document.getElementById('ef-ur').value);
    const vpdEl  = document.getElementById('ef-vpd-auto');
    const zoneEl = document.getElementById('ef-vpd-zone');

    if (isNaN(temp) || isNaN(rh)) {
      vpdEl.textContent  = '— preencha T° e UR';
      vpdEl.classList.add('dim');
      zoneEl.textContent = '—';
      zoneEl.classList.add('dim');
      return;
    }

    const vpd      = calc(temp, rh);
    const plant    = DB.getPlant(App.activePlantId());
    const stage    = UI.getPill('entry-stage-group') || plant?.stage || 'vegetativo';
    const zoneInfo = zone(vpd, stage);

    vpdEl.textContent  = vpd + ' kPa';
    vpdEl.classList.remove('dim');
    vpdEl.style.color  = zoneInfo.color;

    zoneEl.textContent = zoneInfo.label;
    zoneEl.classList.remove('dim');
    zoneEl.style.color = zoneInfo.color;
  }

  return { calc, zone };
})();


/* ═══════════════════════════════════════════════
   COUNTDOWN — estimativa de colheita
═══════════════════════════════════════════════ */
const Countdown = (() => {

  // Calcula e renderiza o card de countdown na tela de detalhe
  function render(plant) {
    const card = document.getElementById('countdown-card');
    const veg  = parseInt(plant.vegWeeks)    || 0;
    const flor = parseInt(plant.flowerWeeks) || 0;

    if (!veg && !flor || !plant.startDate) {
      card.classList.add('hidden');
      return;
    }

    const totalDays     = (veg + flor) * 7;
    const daysLived     = Utils.daysAlive(plant);
    const daysRemaining = Math.max(0, totalDays - daysLived);
    const pct           = Math.min(100, Math.round((daysLived / totalDays) * 100));

    // Data estimada
    const harvestDate = new Date(plant.startDate + 'T00:00:00');
    harvestDate.setDate(harvestDate.getDate() + totalDays);
    const dateStr = harvestDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

    document.getElementById('countdown-date').textContent = dateStr;
    document.getElementById('countdown-days').textContent = daysRemaining;
    document.getElementById('countdown-unit').textContent = daysRemaining === 1 ? 'dia' : 'dias';
    document.getElementById('countdown-bar').style.width  = pct + '%';

    // Muda cor conforme proximidade
    const bar = document.getElementById('countdown-bar');
    if (pct >= 90)      bar.style.background = '#e05c5c';  // vermelho — quase na hora
    else if (pct >= 70) bar.style.background = '#f5a623';  // âmbar
    else                bar.style.background = '#3ddc6a';  // verde

    card.classList.remove('hidden');
  }

  return { render };
})();


/* ═══════════════════════════════════════════════
   ACTION TYPE — seletor e visibilidade de seções
═══════════════════════════════════════════════ */
const ActionType = (() => {

  // Quais seções do formulário mostrar por tipo de ação
  // Cada entrada: [ids de fsec a mostrar além de data/progresso/obs]
  const SECTION_MAP = {
    geral:       ['ef-ambiente', 'ef-luz', 'ef-rega'],
    rega:        ['ef-ambiente', 'ef-rega'],
    clima:       ['ef-ambiente', 'ef-luz'],
    luz:         ['ef-luz'],
    poda:        ['af-poda'],
    lst:         ['af-lst'],
    defoliacao:  ['af-poda'],
    transplante: ['af-transplante'],
    flush:       ['af-flush', 'ef-rega'],
    runoff:      ['af-runoff'],
  };

  // Todos os IDs de seção controláveis
  const ALL_SECTIONS = ['ef-ambiente', 'ef-luz', 'ef-rega', 'af-poda', 'af-lst', 'af-transplante', 'af-flush', 'af-runoff'];

  function select(btn) {
    // Toggle botão ativo
    document.querySelectorAll('#action-type-grid .atype-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const type = btn.dataset.v;

    // Defoliação reusa a seção de poda, mas preseleciona a pill correta
    if (type === 'defoliacao') {
      UI.setPill('af-poda-type', 'defoliacao');
    } else if (type === 'poda') {
      UI.setPill('af-poda-type', 'topping');
    }

    // Mostra/oculta seções
    const visible = SECTION_MAP[type] || SECTION_MAP.geral;
    ALL_SECTIONS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('hidden', !visible.includes(id));
    });

    // Atualiza título do modal
    const labels = {
      geral: 'Novo Registro', rega: '💧 Rega', clima: '🌡️ Clima',
      luz: '💡 Luz', poda: '✂️ Poda', lst: '🪢 LST',
      defoliacao: '🍃 Defoliação', transplante: '🪴 Transplante',
      flush: '🚿 Flush', runoff: '🧪 Runoff',
    };
    document.getElementById('me-title').textContent = labels[type] || 'Novo Registro';
  }

  function getSelected() {
    return document.querySelector('#action-type-grid .atype-btn.active')?.dataset.v || 'geral';
  }

  function reset() {
    // Seleciona "Geral" e mostra todas as seções padrão
    const btn = document.querySelector('#action-type-grid .atype-btn[data-v="geral"]');
    if (btn) select(btn);
  }

  // Pré-seleciona um tipo ao abrir o modal via atalho
  function preset(type) {
    const btn = document.querySelector(`#action-type-grid .atype-btn[data-v="${type}"]`);
    if (btn) select(btn);
  }

  // Lê os campos específicos da ação selecionada
  function getActionData(type) {
    switch (type) {
      case 'poda':
      case 'defoliacao':
        return {
          podaTecnica: UI.getPill('af-poda-type'),
          podaNodes:   parseInt(document.getElementById('af-poda-nodes').value) || null,
        };
      case 'lst':
        return {
          lstTecnica: UI.getPill('af-lst-type'),
          lstDesc:    document.getElementById('af-lst-desc').value.trim() || null,
        };
      case 'transplante':
        return {
          tpFrom:      parseFloat(document.getElementById('af-tp-from').value)  || null,
          tpTo:        parseFloat(document.getElementById('af-tp-to').value)    || null,
          tpSubstrate: document.getElementById('af-tp-substrate').value.trim()  || null,
        };
      case 'flush':
        return {
          flushVol: parseFloat(document.getElementById('af-flush-vol').value) || null,
          flushPh:  parseFloat(document.getElementById('af-flush-ph').value)  || null,
        };
      case 'runoff':
        return {
          roPh: parseFloat(document.getElementById('af-ro-ph').value) || null,
          roEc: parseFloat(document.getElementById('af-ro-ec').value) || null,
        };
      default:
        return {};
    }
  }

  // Limpa campos específicos
  function clearActionFields() {
    ['af-poda-nodes', 'af-lst-desc', 'af-tp-from', 'af-tp-to',
     'af-tp-substrate', 'af-flush-vol', 'af-flush-ph', 'af-ro-ph', 'af-ro-ec']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    UI.initPills('af-poda-type');
    UI.initPills('af-lst-type');
  }

  return { select, getSelected, reset, preset, getActionData, clearActionFields };
})();


/* ═══════════════════════════════════════════════
   ENTRY — lógica do formulário de registro
═══════════════════════════════════════════════ */
const Entry = (() => {
  let _nutrients = [];

  // Preenche dias/semana automaticamente ao mudar a data
  function autoProgress() {
    const plant = DB.getPlant(App.activePlantId());
    if (!plant) return;
    const date = document.getElementById('ef-date').value;
    if (!date) return;

    const days  = Utils.daysAlive(plant, date);
    const weeks = Utils.weekInStage(plant, date);

    document.getElementById('ef-days-auto').textContent  = days + ' dias';
    document.getElementById('ef-weeks-auto').textContent = 'Sem. ' + weeks;
  }

  function addNutrient() {
    const name = document.getElementById('nut-name').value.trim();
    const qty  = parseFloat(document.getElementById('nut-qty').value) || null;
    if (!name) return;
    _nutrients.push({ name, qty });
    document.getElementById('nut-name').value = '';
    document.getElementById('nut-qty').value  = '';
    _renderNutTags();
  }

  function removeNutrient(idx) {
    _nutrients.splice(idx, 1);
    _renderNutTags();
  }

  function _renderNutTags() {
    document.getElementById('nut-tags').innerHTML = _nutrients
      .map((n, i) => `
        <span class="nut-tag">
          ${Utils.esc(n.name)}${n.qty ? ' ' + n.qty + ' ml/L' : ''}
          <span class="nut-tag-rm" onclick="Entry.removeNutrient(${i})">✕</span>
        </span>`)
      .join('');
  }

  function reset(plantId) {
    _nutrients = [];
    const plant = DB.getPlant(plantId);
    const dateStr = Utils.today();

    document.getElementById('ef-date').value = dateStr;
    document.getElementById('ef-time').value = Utils.nowTime();
    document.getElementById('ef-temp').value    = '';
    document.getElementById('ef-ur').value      = '';
    document.getElementById('ef-lux').value     = '';
    document.getElementById('ef-dimmer').value  = '';
    document.getElementById('ef-dist').value    = '';
    document.getElementById('ef-ledon').value   = '';
    document.getElementById('ef-ledoff').value  = '';
    document.getElementById('ef-water').value   = '';
    document.getElementById('ef-ec').value      = '';
    document.getElementById('ef-ph').value      = '';
    document.getElementById('ef-obs').value     = '';
    document.getElementById('nut-name').value   = '';
    document.getElementById('nut-qty').value    = '';
    document.getElementById('nut-tags').innerHTML = '';

    // Computed fields reset
    document.getElementById('ef-ppfd-auto').textContent = '— preencha Lux';
    document.getElementById('ef-ppfd-auto').classList.add('dim');
    document.getElementById('ef-dli-auto').textContent  = '— preencha horas';
    document.getElementById('ef-dli-auto').classList.add('dim');
    document.getElementById('light-feedback').classList.add('hidden');

    // VPD reset
    const vpdEl  = document.getElementById('ef-vpd-auto');
    const zoneEl = document.getElementById('ef-vpd-zone');
    vpdEl.textContent  = '— preencha T° e UR';
    vpdEl.classList.add('dim');
    vpdEl.style.color  = '';
    zoneEl.textContent = '—';
    zoneEl.classList.add('dim');
    zoneEl.style.color = '';

    // Toggles
    UI.resetToggle('tgl-water', 'water-fields');
    UI.resetToggle('tgl-nut',   'nut-fields');

    // Action type — volta para "Geral" e limpa campos específicos
    ActionType.reset();
    ActionType.clearActionFields();

    // Estágio padrão = estágio atual da planta
    const stage = (plant && plant.stage) || 'vegetativo';
    UI.setPill('entry-stage-group', stage);

    // Progress auto
    if (plant) {
      const days  = Utils.daysAlive(plant, dateStr);
      const weeks = Utils.weekInStage(plant, dateStr);
      document.getElementById('ef-days-auto').textContent  = days + ' dias';
      document.getElementById('ef-weeks-auto').textContent = 'Sem. ' + weeks;
    } else {
      document.getElementById('ef-days-auto').textContent  = '—';
      document.getElementById('ef-weeks-auto').textContent = '—';
    }
  }

  function getNutrients() { return [..._nutrients]; }

  return { autoProgress, addNutrient, removeNutrient, reset, getNutrients };
})();


/* ═══════════════════════════════════════════════
   UI — utilitários de interface
═══════════════════════════════════════════════ */
const UI = (() => {
  let _confirmResolve = null;
  let _toastTimer     = null;

  // ── Pills (type / stage selectors) ──────────
  function setPill(groupId, value) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.pill').forEach(p => {
      p.classList.toggle('active', p.dataset.v === value);
    });
  }

  function getPill(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return '';
    return group.querySelector('.pill.active')?.dataset.v || '';
  }

  // Inicializa listeners de pills em um grupo
  function initPills(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.pill').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  // ── Toggle (rega / nutrientes) ───────────────
  function toggle(btnId, sectionId) {
    const btn = document.getElementById(btnId);
    const sec = document.getElementById(sectionId);
    if (!btn || !sec) return;
    const on = !btn.classList.contains('on');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', String(on));
    sec.classList.toggle('open', on);
  }

  function resetToggle(btnId, sectionId) {
    const btn = document.getElementById(btnId);
    const sec = document.getElementById(sectionId);
    if (!btn || !sec) return;
    btn.classList.remove('on');
    btn.setAttribute('aria-checked', 'false');
    sec.classList.remove('open');
  }

  // ── Toast ────────────────────────────────────
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ── Confirm ──────────────────────────────────
  function confirm(title, msg) {
    return new Promise(resolve => {
      _confirmResolve = resolve;
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-msg').textContent   = msg;
      Modals.open('modal-confirm');
    });
  }

  function resolveConfirm(ok) {
    Modals.close('modal-confirm');
    if (_confirmResolve) { _confirmResolve(ok); _confirmResolve = null; }
  }

  // ── Screen helpers ───────────────────────────
  function setActive(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('screen-' + screenName);
    if (target) target.classList.add('active');

    document.querySelectorAll('.bnav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.screen === screenName);
    });
  }

  return { setPill, getPill, initPills, toggle, resetToggle, toast, confirm, resolveConfirm, setActive };
})();


/* ═══════════════════════════════════════════════
   DETAIL TABS — alterna entre Timeline e Lista
═══════════════════════════════════════════════ */
const DetailTabs = (() => {
  function switchTab(tab) {
    document.querySelectorAll('.dtab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.detail-tab-content').forEach(c =>
      c.classList.toggle('active', c.id === 'tab-' + tab));
  }

  // Exposto globalmente para o onclick do HTML
  return { switch: switchTab };
})();


/* ═══════════════════════════════════════════════
   TIMELINE — linha do tempo visual do ciclo
═══════════════════════════════════════════════ */
const Timeline = (() => {

  // Ícone por tipo de ação
  const ACTION_ICON = {
    geral: '📋', rega: '💧', clima: '🌡️', luz: '💡',
    poda: '✂️', lst: '🪢', defoliacao: '🍃',
    transplante: '🪴', flush: '🚿', runoff: '🧪',
  };

  // Cor do nó por tipo
  const ACTION_COLOR = {
    geral: 'var(--border-3)', rega: 'var(--blue)', clima: '#94a3b8',
    luz: '#fde047', poda: 'var(--red)', lst: '#a78bfa',
    defoliacao: '#86efac', transplante: 'var(--amber)',
    flush: 'var(--blue)', runoff: '#34d399',
  };

  function render(plant, entries) {
    const el = document.getElementById('cycle-timeline');
    if (!entries || entries.length === 0) {
      el.innerHTML = '<div class="empty-hint">Adicione registros para ver a timeline.</div>';
      return;
    }

    // Ordena por data
    const sorted = [...entries].sort((a, b) => {
      const da = a.date + (a.time || '00:00');
      const db = b.date + (b.time || '00:00');
      return da.localeCompare(db);
    });

    // Agrupa por data para evitar repetição
    const byDate = {};
    sorted.forEach(e => {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });

    const totalDays = Utils.daysAlive(plant);

    // Marcos fixos: início do ciclo + mudanças de estágio
    const milestones = _buildMilestones(plant, sorted);

    // Monta HTML
    const html = Object.entries(byDate).reverse().map(([date, dayEntries]) => {
      const dateObj  = new Date(date + 'T00:00:00');
      const dayLabel = dateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
      const daysNum  = Utils.daysBetween(plant.startDate, date);

      // Marcos do dia
      const dayMilestones = milestones.filter(m => m.date === date);

      const entriesHtml = dayEntries.map(e => _entryNode(e)).join('');
      const msHtml = dayMilestones.map(m => _milestoneNode(m)).join('');

      return `
        <div class="tl-day">
          <div class="tl-day-header">
            <span class="tl-day-label">${dayLabel}</span>
            <span class="tl-day-num">D${daysNum}</span>
          </div>
          ${msHtml}
          <div class="tl-entries">${entriesHtml}</div>
        </div>`;
    }).join('');

    // Nó de início do ciclo (sempre no fim — mais antigo)
    const startNode = `
      <div class="tl-start-node">
        <span class="tl-start-dot">🌱</span>
        <span class="tl-start-label">Início do ciclo · ${Utils.fmtDate(plant.startDate)}</span>
      </div>`;

    el.innerHTML = html + startNode;
  }

  function _entryNode(e) {
    const type  = e.actionType || 'geral';
    const icon  = ACTION_ICON[type] || '📋';
    const color = ACTION_COLOR[type] || 'var(--border-3)';

    // Chips compactos
    const chips = [];
    if (e.temp && e.ur) chips.push(`${e.temp}°C · ${e.ur}%`);
    if (e.vpd)   chips.push(`VPD ${e.vpd}`);
    if (e.water) chips.push(`💧 ${e.water}ml`);
    if (e.ph)    chips.push(`pH ${e.ph}`);
    if (e.ppfd)  chips.push(`⚡${e.ppfd}`);
    if (e.podaTecnica) chips.push(e.podaTecnica);
    if (e.lstTecnica)  chips.push(e.lstTecnica);
    if (e.tpTo)  chips.push(`🪴 → ${e.tpTo}L`);

    const chipsHtml = chips.length
      ? `<div class="tl-chips">${chips.map(c => `<span class="tl-chip">${Utils.esc(c)}</span>`).join('')}</div>`
      : '';

    const obsHtml = e.obs
      ? `<div class="tl-obs">${Utils.esc(e.obs).substring(0, 100)}${e.obs.length > 100 ? '…' : ''}</div>`
      : '';

    return `
      <div class="tl-node" onclick="Modals.openEntryDetail('${e.id}')">
        <div class="tl-node-dot" style="background:${color}; border-color:${color}"></div>
        <div class="tl-node-body">
          <div class="tl-node-head">
            <span class="tl-node-icon">${icon}</span>
            <span class="tl-node-type">${_actionLabel(type, e)}</span>
            ${e.time ? `<span class="tl-node-time">${e.time}</span>` : ''}
          </div>
          ${chipsHtml}
          ${obsHtml}
        </div>
      </div>`;
  }

  function _milestoneNode(m) {
    return `
      <div class="tl-milestone">
        <span class="tl-milestone-icon">${m.icon}</span>
        <span class="tl-milestone-label">${Utils.esc(m.label)}</span>
      </div>`;
  }

  function _buildMilestones(plant, sorted) {
    const ms = [];
    // Mudanças de estágio
    let lastStage = null;
    sorted.forEach(e => {
      if (e.stage && e.stage !== lastStage) {
        if (lastStage !== null) { // não marca o primeiro (início já está no startNode)
          ms.push({
            date: e.date,
            icon: Utils.stageEmoji(e.stage),
            label: `Entrou em ${Utils.stageLabel(e.stage)}`,
          });
        }
        lastStage = e.stage;
      }
    });
    // Transplantes
    sorted.filter(e => e.actionType === 'transplante' && e.tpTo).forEach(e => {
      ms.push({ date: e.date, icon: '🪴', label: `Transplante → ${e.tpTo}L` });
    });
    return ms;
  }

  function _actionLabel(type, e) {
    const map = {
      geral: 'Registro geral', rega: 'Rega', clima: 'Clima',
      luz: 'Luz', poda: e.podaTecnica || 'Poda',
      lst: e.lstTecnica || 'LST', defoliacao: 'Defoliação',
      transplante: 'Transplante', flush: 'Flush', runoff: 'Runoff',
    };
    return map[type] || type;
  }

  return { render };
})();


/* ═══════════════════════════════════════════════
   RENDER — renderização das telas
═══════════════════════════════════════════════ */
const Render = (() => {

  // ── HOME ─────────────────────────────────────
  function home() {
    const { plants } = DB.get();
    const totalLogs  = plants.reduce((a, p) => a + (p.entries || []).length, 0);
    const maxDays    = plants.reduce((a, p) => Math.max(a, Utils.daysAlive(p)), 0);

    // KPIs
    document.getElementById('kpi-plants').textContent = plants.length;
    document.getElementById('kpi-logs').textContent   = totalLogs;
    document.getElementById('kpi-days').textContent   = plants.length ? maxDays : '—';

    // Banner dinâmico
    if (plants.length > 0) {
      const active = plants[plants.length - 1];
      document.getElementById('banner-title').textContent = active.name;
      document.getElementById('banner-sub').textContent   =
        Utils.stageLabel(active.stage) + ' · ' + Utils.daysAlive(active) + ' dias de vida';
    } else {
      document.getElementById('banner-title').textContent = 'Painel';
      document.getElementById('banner-sub').textContent   = 'Adicione sua primeira planta.';
    }

    // Alertas
    _renderAlerts(plants);

    // Lista de plantas
    _renderPlantList(plants);
  }

  function _renderAlerts(plants) {
    const el = document.getElementById('alert-list');
    if (plants.length === 0) {
      el.innerHTML = '<div class="empty-hint">Adicione plantas para ver alertas aqui.</div>';
      return;
    }

    const items = [];
    plants.forEach(p => {
      const last = (p.entries || []).slice(-1)[0];
      if (!last) {
        items.push({ cls: 'warn', dot: 'dot-warn', text: `"${Utils.esc(p.name)}" — sem registros ainda` });
        return;
      }
      const diff = Math.round((Date.now() - new Date(last.date)) / 86_400_000);
      if (diff >= 2) {
        items.push({ cls: 'warn', dot: 'dot-warn', text: `"${Utils.esc(p.name)}" — último registro há ${diff} dias` });
      } else {
        items.push({ cls: 'ok', dot: 'dot-ok', text: `"${Utils.esc(p.name)}" — registrado recentemente` });
      }
    });

    el.innerHTML = items.map(i => `
      <div class="alert-item ${i.cls}">
        <span class="alert-dot ${i.dot}"></span>
        <span>${i.text}</span>
      </div>`).join('');
  }

  function _renderPlantList(plants) {
    const el = document.getElementById('plant-list');
    if (plants.length === 0) {
      el.innerHTML = '<div class="empty-hint">Nenhuma planta cadastrada ainda.</div>';
      return;
    }
    el.innerHTML = plants.map(p => {
      const days  = Utils.daysAlive(p);
      const weeks = Utils.weekInStage(p);
      const stage = p.stage || 'vegetativo';
      return `
      <div class="plant-card" onclick="App.openPlant('${p.id}')">
        <div class="plant-avatar">${Utils.stageEmoji(stage)}</div>
        <div class="plant-info">
          <div class="plant-name">${Utils.esc(p.name)}</div>
          <div class="plant-meta">
            <span class="stage-tag stage-${stage}">${Utils.stageLabel(stage)}</span>
            <span>${p.type === 'foto' ? 'Fotoperiodo' : 'Automática'}</span>
          </div>
        </div>
        <div class="plant-counter">
          <div class="plant-days-num">${days}</div>
          <div class="plant-days-lbl">d / sem.${weeks}</div>
        </div>
      </div>`;
    }).join('');
  }

  // ── DETAIL ───────────────────────────────────
  function detail(plant) {
    const days  = plant.daysOverride  !== undefined ? plant.daysOverride  : Utils.daysAlive(plant);
    const weeks = plant.weeksOverride !== undefined ? plant.weeksOverride : Utils.weekInStage(plant);
    const stage = plant.stage || 'vegetativo';
    const entries = plant.entries || [];

    // Header
    document.getElementById('header-title').textContent = plant.name;

    // Ribbon
    document.getElementById('ribbon-stage').textContent = Utils.stageLabel(stage);
    document.getElementById('ribbon-days').textContent  = days;
    document.getElementById('ribbon-weeks').textContent = weeks;

    // Stage class no ribbon
    const ribbon = document.getElementById('stage-ribbon');
    ribbon.className = 'stage-ribbon'; // reset
    ribbon.classList.add('stage-bg-' + stage);

    // Alert
    const alertEl = document.getElementById('detail-alert');
    const last = entries.slice(-1)[0];
    if (!last) {
      alertEl.textContent = 'Nenhum registro ainda. Use os botões abaixo para começar.';
      alertEl.className   = 'detail-alert';
      alertEl.classList.remove('hidden');
    } else {
      const diff = Math.round((Date.now() - new Date(last.date)) / 86_400_000);
      if (diff >= 2) {
        alertEl.innerHTML = `⚠️ Último registro há <strong>${diff} dias</strong>. Hora de atualizar?`;
        alertEl.className = 'detail-alert';
        alertEl.classList.remove('hidden');
      } else {
        alertEl.innerHTML = `✅ Último registro: <strong>${Utils.fmtDate(last.date)}</strong>`;
        alertEl.className = 'detail-alert ok';
        alertEl.classList.remove('hidden');
      }
    }

    // Entries
    _renderEntries(entries);

    // Timeline
    Timeline.render(plant, entries);

    // Countdown de colheita
    Countdown.render(plant);

    // VPD do último registro
    _renderVpdCard(entries, stage);
  }

  function _renderVpdCard(entries, stage) {
    const card = document.getElementById('vpd-card');
    const last  = [...entries].reverse().find(e => e.temp && e.ur);
    if (!last) { card.classList.add('hidden'); return; }

    const vpd      = VPD.calc(last.temp, last.ur);
    const zoneInfo = VPD.zone(vpd, stage);

    document.getElementById('vpd-val').textContent  = vpd;
    document.getElementById('vpd-zone').textContent = zoneInfo.label;
    document.getElementById('vpd-zone').style.color = zoneInfo.color;
    card.classList.remove('hidden');
  }

  function _renderEntries(entries) {
    const el = document.getElementById('entries-list');
    if (entries.length === 0) {
      el.innerHTML = '<div class="empty-hint">Nenhum registro ainda. Use os botões acima.</div>';
      return;
    }

    el.innerHTML = [...entries].reverse().map(e => {
      const chips = [];
      if (e.temp)  chips.push(`<span class="chip">${e.temp}°C</span>`);
      if (e.ur)    chips.push(`<span class="chip">${e.ur}%UR</span>`);
      if (e.vpd)   chips.push(`<span class="chip" style="color:var(--accent)">VPD ${e.vpd}</span>`);
      if (e.water) chips.push(`<span class="chip blue">💧 ${e.water}ml</span>`);
      if (e.ph)    chips.push(`<span class="chip">pH ${e.ph}</span>`);
      if (e.ec)    chips.push(`<span class="chip amber">EC ${e.ec}</span>`);
      if (e.ppfd)  chips.push(`<span class="chip green">⚡ ${e.ppfd} PPFD</span>`);
      if (e.dli)   chips.push(`<span class="chip green">DLI ${e.dli}</span>`);
      if (e.lux)   chips.push(`<span class="chip">${Number(e.lux).toLocaleString('pt-BR')} lux</span>`);

      const stage    = e.stage || 'vegetativo';
      const dateStr  = e.date ? new Date(e.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';
      const dayBadge = e.daysAlive !== undefined ? `D${e.daysAlive}` : '';
      const actionLabels = {
        geral:'📋', rega:'💧', clima:'🌡️', luz:'💡',
        poda:'✂️', lst:'🪢', defoliacao:'🍃', transplante:'🪴',
        flush:'🚿', runoff:'🧪',
      };
      const aIcon = actionLabels[e.actionType] || '📋';

      return `
      <div class="entry-card" onclick="Modals.openEntryDetail('${e.id}')">
        <div class="entry-head">
          <span class="entry-action-icon">${aIcon}</span>
          <span class="entry-date">${dateStr}${e.time ? ' · ' + e.time : ''}</span>
          <span class="stage-tag stage-${stage}">${Utils.stageLabel(stage)}</span>
          <span class="entry-day-badge">${dayBadge}</span>
        </div>
        ${chips.length ? `<div class="entry-chips">${chips.join('')}</div>` : ''}
        ${e.obs ? `<div class="entry-obs">${Utils.esc(e.obs).substring(0, 140)}${e.obs.length > 140 ? '…' : ''}</div>` : ''}
      </div>`;
    }).join('');
  }

  // ── STATS ────────────────────────────────────
  function stats() {
    const { plants } = DB.get();
    const wrap = document.getElementById('stats-wrap');

    if (plants.length === 0) {
      wrap.innerHTML = '<div class="empty-hint">Sem dados ainda.</div>';
      return;
    }

    const allEntries  = plants.flatMap(p => p.entries || []);
    const totalLogs   = allEntries.length;
    const waterTotal  = allEntries.reduce((a, e) => a + (e.water || 0), 0);
    const tempsArr    = allEntries.filter(e => e.temp).map(e => e.temp);
    const tempAvg     = tempsArr.length ? (tempsArr.reduce((a, v) => a + v, 0) / tempsArr.length).toFixed(1) : null;

    const globalGrid = `
      <div class="stats-grid">
        ${_statCard('🌱', plants.length,          'Plantas')}
        ${_statCard('📋', totalLogs,              'Registros')}
        ${_statCard('💧', waterTotal > 0 ? (waterTotal / 1000).toFixed(1) + 'L' : '—', 'Água total')}
        ${_statCard('🌡️', tempAvg ? tempAvg + '°C' : '—', 'Temp. média')}
      </div>`;

    const perPlant = plants.map(p => {
      const entries  = p.entries || [];
      const water    = entries.reduce((a, e) => a + (e.water || 0), 0);
      const days     = Utils.daysAlive(p);
      const weeks    = Utils.weekInStage(p);
      return `
      <div class="stats-plant-block">
        <div class="stats-plant-name">${Utils.stageEmoji(p.stage)} ${Utils.esc(p.name)}</div>
        ${_statsRow('Estágio',      Utils.stageLabel(p.stage), true)}
        ${_statsRow('Início',       Utils.fmtDate(p.startDate))}
        ${_statsRow('Dias de vida', days + ' dias',  true)}
        ${_statsRow('Semana',       'Sem. ' + weeks)}
        ${_statsRow('Tipo',         p.type === 'foto' ? 'Fotoperiodo' : 'Automática')}
        ${_statsRow('Registros',    entries.length,  true)}
        ${_statsRow('Água total',   water > 0 ? (water / 1000).toFixed(1) + 'L' : '—')}
      </div>`;
    }).join('');

    wrap.innerHTML = globalGrid + perPlant;
  }

  function _statCard(icon, val, lbl) {
    return `
    <div class="stat-card">
      <span class="stat-icon">${icon}</span>
      <div class="stat-val">${val}</div>
      <div class="stat-lbl">${lbl}</div>
    </div>`;
  }

  function _statsRow(lbl, val, accent = false) {
    return `
    <div class="stats-row">
      <span class="stats-row-lbl">${lbl}</span>
      <span class="stats-row-val${accent ? ' accent' : ''}">${val}</span>
    </div>`;
  }

  return { home, detail, stats };
})();


/* ═══════════════════════════════════════════════
   MODALS — abertura, fechamento e salvamento
═══════════════════════════════════════════════ */
const Modals = (() => {
  let _editPlantId  = null;
  let _editEntryId  = null;

  // ── Helpers ──────────────────────────────────
  function open(id)  { document.getElementById(id)?.classList.add('open'); }
  function close(id) { document.getElementById(id)?.classList.remove('open'); }

  // ── PLANTA ───────────────────────────────────
  function openPlant(plantId) {
    _editPlantId = plantId || null;
    const plant  = plantId ? DB.getPlant(plantId) : null;

    document.getElementById('mp-title').textContent       = plant ? 'Editar Planta' : 'Nova Planta';
    document.getElementById('mp-name').value              = plant?.name        || '';
    document.getElementById('mp-date').value              = plant?.startDate   || Utils.today();
    document.getElementById('mp-obs').value               = plant?.obs         || '';
    document.getElementById('mp-cycle').value             = plant?.cycle       || '2-1';
    document.getElementById('mp-veg-weeks').value         = plant?.vegWeeks    || '';
    document.getElementById('mp-flower-weeks').value      = plant?.flowerWeeks || '';
    UI.setPill('mp-type-group', plant?.type || 'auto');

    open('modal-plant');
    setTimeout(() => document.getElementById('mp-name').focus(), 150);
  }

  function savePlant() {
    const name = document.getElementById('mp-name').value.trim();
    if (!name) { UI.toast('Informe o nome da planta.'); return; }

    const type        = UI.getPill('mp-type-group') || 'auto';
    const startDate   = document.getElementById('mp-date').value || Utils.today();
    const cycle       = document.getElementById('mp-cycle').value;
    const obs         = document.getElementById('mp-obs').value.trim();
    const vegWeeks    = parseInt(document.getElementById('mp-veg-weeks').value)    || null;
    const flowerWeeks = parseInt(document.getElementById('mp-flower-weeks').value) || null;

    if (_editPlantId) {
      const plant = DB.getPlant(_editPlantId);
      if (plant) {
        Object.assign(plant, { name, type, startDate, cycle, obs, vegWeeks, flowerWeeks });
        DB.upsertPlant(plant);
      }
    } else {
      DB.upsertPlant({
        id:  Utils.uid(),
        name, type, startDate, cycle, obs, vegWeeks, flowerWeeks,
        stage:   'vegetativo',
        entries:    [],
      });
    }

    close('modal-plant');
    Render.home();
    UI.toast(_editPlantId ? 'Planta atualizada. ✏️' : 'Planta adicionada! 🌱');
  }

  // ── ESTÁGIO ───────────────────────────────────
  function openStage() {
    const plant = DB.getPlant(App.activePlantId());
    if (!plant) return;

    UI.setPill('stage-pill-group', plant.stage || 'vegetativo');
    document.getElementById('ms-days').value  = '';
    document.getElementById('ms-weeks').value = '';

    open('modal-stage');
  }

  function saveStage() {
    const plant = DB.getPlant(App.activePlantId());
    if (!plant) return;

    const newStage = UI.getPill('stage-pill-group');
    const dOv      = parseInt(document.getElementById('ms-days').value);
    const wOv      = parseInt(document.getElementById('ms-weeks').value);

    // Ao mudar de estágio, reseta a data de início do estágio
    if (newStage && newStage !== plant.stage) {
      plant.stageStartDate = Utils.today();
    }

    const prevStage = plant.stage;
    plant.stage = newStage || plant.stage;

    if (!isNaN(dOv) && dOv >= 0) plant.daysOverride  = dOv;
    else delete plant.daysOverride;

    if (!isNaN(wOv) && wOv >= 1) plant.weeksOverride = wOv;
    else delete plant.weeksOverride;

    DB.upsertPlant(plant);
    close('modal-stage');
    Render.detail(plant);
    Render.home();

    // Abre relatório de colheita automaticamente ao marcar como Colheita
    if (newStage === 'colheita' && prevStage !== 'colheita') {
      setTimeout(() => HarvestReport.open(plant.id), 350);
      return;
    }

    UI.toast('Estágio atualizado.');
  }

  // ── REGISTRO ──────────────────────────────────
  function openEntry(preset) {
    _editEntryId = null;
    document.getElementById('me-title').textContent = 'Novo Registro';

    Entry.reset(App.activePlantId());

    if (preset === 'water')   setTimeout(() => ActionType.preset('rega'),   80);
    if (preset === 'climate') setTimeout(() => ActionType.preset('clima'),  80);

    open('modal-entry');
  }

  function saveEntry() {
    const plant = DB.getPlant(App.activePlantId());
    if (!plant) { UI.toast('Nenhuma planta selecionada.'); return; }

    const date = document.getElementById('ef-date').value;
    if (!date) { UI.toast('Informe a data do registro.'); return; }

    const luxVal  = parseFloat(document.getElementById('ef-lux').value)     || null;
    const onTime  = document.getElementById('ef-ledon').value  || null;
    const offTime = document.getElementById('ef-ledoff').value || null;
    const ppfd    = luxVal ? Light.luxToPPFD(luxVal) : null;
    const hours   = Light.photoperiodHours(onTime, offTime);
    const dli     = (ppfd && hours) ? Light.calcDLI(ppfd, hours) : null;

    const tempVal = parseFloat(document.getElementById('ef-temp').value) || null;
    const urVal   = parseFloat(document.getElementById('ef-ur').value)   || null;
    const vpd     = (tempVal && urVal) ? VPD.calc(tempVal, urVal) : null;

    const actionType = ActionType.getSelected();
    const actionData = ActionType.getActionData(actionType);

    const entry = {
      id:         _editEntryId || Utils.uid(),
      date,
      time:       document.getElementById('ef-time').value || null,
      actionType,
      ...actionData,
      stage:      UI.getPill('entry-stage-group') || plant.stage,
      daysAlive:  Utils.daysAlive(plant, date),
      weekInStage: Utils.weekInStage(plant, date),
      temp:       tempVal,
      ur:         urVal,
      vpd,
      lux:        luxVal,
      dimmer:     parseFloat(document.getElementById('ef-dimmer').value)  || null,
      dist:       parseFloat(document.getElementById('ef-dist').value)    || null,
      ledon:      onTime,
      ledoff:     offTime,
      ppfd,
      dli,
      water:      parseFloat(document.getElementById('ef-water').value)   || null,
      ec:         parseFloat(document.getElementById('ef-ec').value)      || null,
      ph:         parseFloat(document.getElementById('ef-ph').value)      || null,
      nutrients:  Entry.getNutrients(),
      obs:        document.getElementById('ef-obs').value.trim() || null,
    };

    if (!plant.entries) plant.entries = [];

    if (_editEntryId) {
      const idx = plant.entries.findIndex(e => e.id === _editEntryId);
      if (idx >= 0) plant.entries[idx] = entry;
    } else {
      plant.entries.push(entry);
    }

    DB.upsertPlant(plant);
    close('modal-entry');
    Render.detail(plant);
    Render.home();
    UI.toast('Registro salvo! ✅');
  }

  // ── DETALHES DO REGISTRO ──────────────────────
  function openEntryDetail(entryId) {
    const plant = DB.getPlant(App.activePlantId());
    if (!plant) return;
    const entry = (plant.entries || []).find(e => e.id === entryId);
    if (!entry) return;

    const rows = [
      ['Data',          Utils.fmtDate(entry.date)],
      ['Hora',          entry.time              || '—'],
      ['Estágio',       Utils.stageLabel(entry.stage)],
      ['Dias de vida',  entry.daysAlive !== undefined ? entry.daysAlive + ' dias' : '—'],
      ['Semana',        entry.weekInStage ? 'Sem. ' + entry.weekInStage : '—'],
      ['Temperatura',   entry.temp  ? entry.temp  + ' °C' : '—'],
      ['Umidade',       entry.ur    ? entry.ur    + ' %'  : '—'],
      ['Lux',           entry.lux   ? Number(entry.lux).toLocaleString('pt-BR') : '—'],
      ['PPFD',          entry.ppfd  ? entry.ppfd  + ' µmol/m²/s' : '—'],
      ['DLI',           entry.dli   ? entry.dli   + ' mol/m²/d'  : '—'],
      ['Fotoperíodo',   (entry.ledon && entry.ledoff) ? entry.ledon + ' – ' + entry.ledoff : '—'],
      ['Dimmer',        entry.dimmer ? entry.dimmer + ' %' : '—'],
      ['Distância',     entry.dist   ? entry.dist   + ' cm' : '—'],
      ['Água',          entry.water  ? entry.water  + ' ml' : '—'],
      ['pH',            entry.ph     || '—'],
      ['EC / ppm',      entry.ec     || '—'],
      ['Nutrientes',    entry.nutrients?.length
        ? entry.nutrients.map(n => Utils.esc(n.name) + (n.qty ? ' ' + n.qty + 'ml/L' : '')).join(', ')
        : '—'],
      ['Observações',   entry.obs ? Utils.esc(entry.obs) : '—'],
    ];

    document.getElementById('entry-detail-body').innerHTML = `
      <table class="detail-table">
        <tbody>
          ${rows.map(([l, v]) => `<tr><td>${l}</td><td>${v}</td></tr>`).join('')}
        </tbody>
      </table>`;

    document.getElementById('entry-detail-del').onclick = () => _deleteEntry(entryId);
    open('modal-entry-detail');
  }

  function _deleteEntry(entryId) {
    const plant = DB.getPlant(App.activePlantId());
    if (!plant) return;
    UI.confirm('Excluir registro', 'Este registro será removido permanentemente.').then(ok => {
      if (!ok) return;
      plant.entries = (plant.entries || []).filter(e => e.id !== entryId);
      DB.upsertPlant(plant);
      close('modal-entry-detail');
      Render.detail(plant);
      Render.home();
      UI.toast('Registro excluído.');
    });
  }

  // ── IMPORT / EXPORT ───────────────────────────
  function openImportExport() {
    open('modal-ie');
  }

  return {
    open, close,
    openPlant, savePlant,
    openStage, saveStage,
    openEntry, saveEntry,
    openEntryDetail,
    openImportExport,
  };
})();


/* ═══════════════════════════════════════════════
   APP — navegação e export/import
═══════════════════════════════════════════════ */
const App = (() => {
  let _activePlantId = null;
  let _prevScreen    = 'home';
  let _curScreen     = 'home';

  function activePlantId() { return _activePlantId; }

  function goTo(screen) {
    if (screen === 'detail' && !_activePlantId) return;
    _prevScreen = _curScreen;
    _curScreen  = screen;
    UI.setActive(screen);
    _updateHeader(screen);

    if (screen === 'stats') Render.stats();
    if (screen === 'home')  Render.home();
  }

  function goBack() {
    goTo(_prevScreen === _curScreen ? 'home' : _prevScreen);
  }

  function openPlant(id) {
    _activePlantId = id;
    const plant = DB.getPlant(id);
    if (!plant) return;

    // Mostra botão de planta no nav
    document.getElementById('bnav-detail').style.display = '';

    Render.detail(plant);
    goTo('detail');
  }

  function openLastPlant() {
    const { plants } = DB.get();
    if (plants.length === 0) { UI.toast('Nenhuma planta cadastrada ainda.'); return; }
    openPlant(plants[plants.length - 1].id);
  }

  function deletePlant(id) {
    UI.confirm('Excluir planta', 'Todos os registros desta planta serão removidos permanentemente.').then(ok => {
      if (!ok) return;
      DB.deletePlant(id);
      _activePlantId = null;
      document.getElementById('bnav-detail').style.display = 'none';
      goTo('home');
      UI.toast('Planta excluída.');
    });
  }

  function _updateHeader(screen) {
    const logoEl   = document.getElementById('header-logo');
    const titleEl  = document.getElementById('header-title');
    const backBtn  = document.getElementById('back-btn');
    const actionsEl = document.getElementById('header-actions');

    // Reset
    logoEl.classList.remove('hidden');
    titleEl.classList.add('hidden');
    backBtn.classList.add('hidden');
    actionsEl.innerHTML = '';

    if (screen === 'detail') {
      const plant = DB.getPlant(_activePlantId);
      logoEl.classList.add('hidden');
      titleEl.textContent = plant ? plant.name : '—';
      titleEl.classList.remove('hidden');
      backBtn.classList.remove('hidden');

      // Ações no header: editar e excluir planta
      actionsEl.innerHTML = `
        <button class="hdr-btn" onclick="Modals.openPlant('${_activePlantId}')" title="Editar planta">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="hdr-btn" onclick="App.deletePlant('${_activePlantId}')" title="Excluir planta" style="color:var(--red)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>`;
    }
  }

  // ── EXPORT / IMPORT ───────────────────────────
  function exportAll() {
    const { plants } = DB.get();
    if (plants.length === 0) { UI.toast('Nenhum dado para exportar.'); return; }

    const header = 'Planta,Data,Hora,Estágio,Dias,Semana,Temp(°C),UR(%),Lux,PPFD,DLI,Água(ml),pH,EC,Obs';
    const rows   = [header];

    plants.forEach(p => {
      (p.entries || []).forEach(e => {
        rows.push([
          `"${p.name}"`,
          e.date || '',
          e.time || '',
          Utils.stageLabel(e.stage),
          e.daysAlive   ?? '',
          e.weekInStage ?? '',
          e.temp  ?? '',
          e.ur    ?? '',
          e.lux   ?? '',
          e.ppfd  ?? '',
          e.dli   ?? '',
          e.water ?? '',
          e.ph    ?? '',
          e.ec    ?? '',
          `"${(e.obs || '').replace(/"/g, '""')}"`,
        ].join(','));
      });
    });

    Utils.download(rows.join('\n'), 'growlog_export.csv', 'text/csv;charset=utf-8');
    Modals.close('modal-ie');
    UI.toast('CSV exportado! 📤');
  }

  function exportPlantCSV() {
    const plant = DB.getPlant(_activePlantId);
    if (!plant) return;

    const header = 'Data,Hora,Estágio,Dias,Semana,Temp(°C),UR(%),Lux,PPFD,DLI,Água(ml),pH,EC,Obs';
    const rows   = [header];

    (plant.entries || []).forEach(e => {
      rows.push([
        e.date || '',
        e.time || '',
        Utils.stageLabel(e.stage),
        e.daysAlive   ?? '',
        e.weekInStage ?? '',
        e.temp  ?? '',
        e.ur    ?? '',
        e.lux   ?? '',
        e.ppfd  ?? '',
        e.dli   ?? '',
        e.water ?? '',
        e.ph    ?? '',
        e.ec    ?? '',
        `"${(e.obs || '').replace(/"/g, '""')}"`,
      ].join(','));
    });

    Utils.download(rows.join('\n'), plant.name.replace(/\s+/g, '_') + '_log.csv', 'text/csv;charset=utf-8');
    UI.toast('CSV da planta exportado! 📊');
  }

  function exportBackup() {
    Utils.download(JSON.stringify(DB.get(), null, 2), 'growlog_backup.json', 'application/json');
    Modals.close('modal-ie');
    UI.toast('Backup salvo! 💾');
  }

  function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.plants) { UI.toast('Arquivo inválido.'); return; }
        UI.confirm('Importar backup', 'Isso substituirá todos os dados atuais. Continuar?').then(ok => {
          if (!ok) return;
          DB.replaceFull(parsed);
          _activePlantId = null;
          document.getElementById('bnav-detail').style.display = 'none';
          Render.home();
          Modals.close('modal-ie');
          goTo('home');
          UI.toast('Backup importado com sucesso! ✅');
        });
      } catch {
        UI.toast('Erro ao ler o arquivo JSON.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  return { activePlantId, goTo, goBack, openPlant, openLastPlant, deletePlant, exportAll, exportPlantCSV, exportBackup, importBackup };
})();


/* ═══════════════════════════════════════════════
   HARVEST REPORT — relatório automático de colheita
═══════════════════════════════════════════════ */
const HarvestReport = (() => {
  let _plantId = null;

  function open(plantId) {
    _plantId = plantId;
    const plant   = DB.getPlant(plantId);
    if (!plant) return;
    const entries = plant.entries || [];

    // Cabeçalho
    document.getElementById('hr-plant-name').textContent = plant.name;

    // Limpa campos manuais (pode já ter relatório salvo)
    const saved = plant.harvestReport || {};
    document.getElementById('hr-yield-wet').value  = saved.yieldWet  || '';
    document.getElementById('hr-yield-dry').value  = saved.yieldDry  || '';
    document.getElementById('hr-notes').value      = saved.notes     || '';
    UI.setPill('hr-rating-group', saved.rating ? String(saved.rating) : '4');

    // Resumo do ciclo
    _renderSummary(plant, entries);

    // Médias ambientais
    _renderAverages(entries);

    // Linha do tempo de estágios
    _renderTimeline(plant, entries);

    Modals.open('modal-harvest');
  }

  function _renderSummary(plant, entries) {
    const totalDays  = Utils.daysAlive(plant);
    const waterTotal = entries.reduce((a, e) => a + (e.water || 0), 0);
    const waterLogs  = entries.filter(e => e.water).length;
    const actionCounts = {};
    entries.forEach(e => {
      const t = e.actionType || 'geral';
      actionCounts[t] = (actionCounts[t] || 0) + 1;
    });

    // Contagem de técnicas de treinamento
    const trainings = entries
      .filter(e => ['poda','lst','defoliacao'].includes(e.actionType))
      .map(e => e.podaTecnica || e.lstTecnica || e.actionType)
      .filter(Boolean);

    const rows = [
      ['Início do ciclo',   Utils.fmtDate(plant.startDate)],
      ['Data de colheita',  Utils.fmtDate(Utils.today())],
      ['Duração total',     totalDays + ' dias'],
      ['Total de registros', entries.length],
      ['Regas registradas', waterLogs],
      ['Água total',        waterTotal > 0 ? (waterTotal / 1000).toFixed(2) + ' L' : '—'],
      ['Treinamentos',      trainings.length > 0 ? trainings.join(', ') : '—'],
      ['Transplantes',      actionCounts['transplante'] || 0],
      ['Flushes',           actionCounts['flush'] || 0],
    ];

    document.getElementById('hr-summary').innerHTML = rows
      .map(([l, v]) => `
        <div class="stats-row">
          <span class="stats-row-lbl">${l}</span>
          <span class="stats-row-val">${Utils.esc(String(v))}</span>
        </div>`).join('');
  }

  function _renderAverages(entries) {
    const avg = (arr) => arr.length ? (arr.reduce((a, v) => a + v, 0) / arr.length).toFixed(1) : '—';

    const temps  = entries.filter(e => e.temp).map(e => e.temp);
    const urs    = entries.filter(e => e.ur).map(e => e.ur);
    const phs    = entries.filter(e => e.ph).map(e => e.ph);
    const ecs    = entries.filter(e => e.ec).map(e => e.ec);
    const vpds   = entries.filter(e => e.vpd).map(e => e.vpd);
    const ppfds  = entries.filter(e => e.ppfd).map(e => e.ppfd);

    const rows = [
      ['Temperatura média',  temps.length  ? avg(temps)  + ' °C'  : '—'],
      ['Umidade média',      urs.length    ? avg(urs)    + ' %'   : '—'],
      ['VPD médio',          vpds.length   ? avg(vpds)   + ' kPa' : '—'],
      ['pH médio',           phs.length    ? avg(phs)            : '—'],
      ['EC médio',           ecs.length    ? avg(ecs)            : '—'],
      ['PPFD médio',         ppfds.length  ? Math.round(ppfds.reduce((a,v)=>a+v,0)/ppfds.length) + ' µmol/m²/s' : '—'],
    ];

    document.getElementById('hr-averages').innerHTML = rows
      .map(([l, v]) => `
        <div class="stats-row">
          <span class="stats-row-lbl">${l}</span>
          <span class="stats-row-val accent">${Utils.esc(String(v))}</span>
        </div>`).join('');
  }

  function _renderTimeline(plant, entries) {
    // Reconstrói mudanças de estágio a partir dos registros
    const stageChanges = [];
    let lastStage = null;
    [...entries].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      if (e.stage && e.stage !== lastStage) {
        stageChanges.push({ stage: e.stage, date: e.date });
        lastStage = e.stage;
      }
    });

    if (stageChanges.length === 0) {
      document.getElementById('hr-timeline').innerHTML = '<p class="empty-hint">Sem dados de estágio nos registros.</p>';
      return;
    }

    const items = stageChanges.map((sc, i) => {
      const next     = stageChanges[i + 1];
      const endDate  = next ? next.date : Utils.today();
      const duration = Utils.daysBetween(sc.date, endDate);
      return `
        <div class="timeline-item">
          <div class="timeline-dot stage-dot-${sc.stage}"></div>
          <div class="timeline-body">
            <span class="timeline-stage">${Utils.stageEmoji(sc.stage)} ${Utils.stageLabel(sc.stage)}</span>
            <span class="timeline-date">${Utils.fmtDate(sc.date)}</span>
            <span class="timeline-dur">${duration} dias</span>
          </div>
        </div>`;
    });

    document.getElementById('hr-timeline').innerHTML = `<div class="timeline">${items.join('')}</div>`;
  }

  function save() {
    const plant = DB.getPlant(_plantId);
    if (!plant) return;

    const yieldWet = parseFloat(document.getElementById('hr-yield-wet').value) || null;
    const yieldDry = parseFloat(document.getElementById('hr-yield-dry').value) || null;
    const rating   = parseInt(UI.getPill('hr-rating-group')) || 4;
    const notes    = document.getElementById('hr-notes').value.trim() || null;

    plant.harvestReport = {
      date: Utils.today(),
      yieldWet,
      yieldDry,
      rating,
      notes,
    };

    DB.upsertPlant(plant);
    Modals.close('modal-harvest');
    Render.detail(plant);
    UI.toast('Relatório salvo! 🏆');
  }

  function exportCSV() {
    const plant = DB.getPlant(_plantId);
    if (!plant) return;
    const entries = plant.entries || [];
    const report  = plant.harvestReport || {};

    const lines = [
      '=== RELATÓRIO DE COLHEITA ===',
      `Planta,${plant.name}`,
      `Início,${plant.startDate || '—'}`,
      `Colheita,${Utils.today()}`,
      `Duração,${Utils.daysAlive(plant)} dias`,
      `Peso úmido,${report.yieldWet || '—'} g`,
      `Peso seco,${report.yieldDry || '—'} g`,
      `Avaliação,${report.rating || '—'} estrelas`,
      `Notas,"${(report.notes || '').replace(/"/g,'""')}"`,
      '',
      '=== REGISTROS ===',
      'Data,Hora,Tipo,Estágio,Dias,Temp,UR,VPD,Lux,PPFD,DLI,Água(ml),pH,EC,Obs',
      ...entries.map(e => [
        e.date, e.time||'', e.actionType||'geral', Utils.stageLabel(e.stage),
        e.daysAlive||'', e.temp||'', e.ur||'', e.vpd||'',
        e.lux||'', e.ppfd||'', e.dli||'',
        e.water||'', e.ph||'', e.ec||'',
        `"${(e.obs||'').replace(/"/g,'""')}"`,
      ].join(',')),
    ];

    Utils.download(lines.join('\n'), plant.name.replace(/\s+/g,'_') + '_harvest_report.csv', 'text/csv;charset=utf-8');
    UI.toast('Relatório exportado! 📤');
  }

  return { open, save, exportCSV };
})();


/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
(function init() {
  DB.load();

  // Inicializa listeners de pills
  ['mp-type-group', 'stage-pill-group', 'entry-stage-group',
   'af-poda-type', 'af-lst-type', 'hr-rating-group'].forEach(id => UI.initPills(id));

  // Fecha overlay ao clicar no backdrop
  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target === ov) {
        ov.classList.remove('open');
        // Se era o confirm, rejeita
        if (ov.id === 'modal-confirm') UI.resolveConfirm(false);
      }
    });
  });

  // Render inicial
  Render.home();

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
