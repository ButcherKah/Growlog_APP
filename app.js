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

    // Toggles
    UI.resetToggle('tgl-water', 'water-fields');
    UI.resetToggle('tgl-nut',   'nut-fields');

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
      if (e.water) chips.push(`<span class="chip blue">💧 ${e.water}ml</span>`);
      if (e.ph)    chips.push(`<span class="chip">pH ${e.ph}</span>`);
      if (e.ec)    chips.push(`<span class="chip amber">EC ${e.ec}</span>`);
      if (e.ppfd)  chips.push(`<span class="chip green">⚡ ${e.ppfd} PPFD</span>`);
      if (e.dli)   chips.push(`<span class="chip green">DLI ${e.dli}</span>`);
      if (e.lux)   chips.push(`<span class="chip">${Number(e.lux).toLocaleString('pt-BR')} lux</span>`);

      const stage   = e.stage || 'vegetativo';
      const dateStr = e.date ? new Date(e.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';
      const dayBadge = e.daysAlive !== undefined ? `D${e.daysAlive}` : '';

      return `
      <div class="entry-card" onclick="Modals.openEntryDetail('${e.id}')">
        <div class="entry-head">
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

    document.getElementById('mp-title').textContent = plant ? 'Editar Planta' : 'Nova Planta';
    document.getElementById('mp-name').value  = plant?.name      || '';
    document.getElementById('mp-date').value  = plant?.startDate || Utils.today();
    document.getElementById('mp-obs').value   = plant?.obs       || '';
    document.getElementById('mp-cycle').value = plant?.cycle     || '2-1';
    UI.setPill('mp-type-group', plant?.type || 'auto');

    open('modal-plant');
    setTimeout(() => document.getElementById('mp-name').focus(), 150);
  }

  function savePlant() {
    const name = document.getElementById('mp-name').value.trim();
    if (!name) { UI.toast('Informe o nome da planta.'); return; }

    const type      = UI.getPill('mp-type-group') || 'auto';
    const startDate = document.getElementById('mp-date').value || Utils.today();
    const cycle     = document.getElementById('mp-cycle').value;
    const obs       = document.getElementById('mp-obs').value.trim();

    if (_editPlantId) {
      const plant = DB.getPlant(_editPlantId);
      if (plant) {
        Object.assign(plant, { name, type, startDate, cycle, obs });
        DB.upsertPlant(plant);
      }
    } else {
      DB.upsertPlant({
        id:         Utils.uid(),
        name, type, startDate, cycle, obs,
        stage:      'vegetativo',
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

    plant.stage = newStage || plant.stage;

    if (!isNaN(dOv) && dOv >= 0) plant.daysOverride  = dOv;
    else delete plant.daysOverride;

    if (!isNaN(wOv) && wOv >= 1) plant.weeksOverride = wOv;
    else delete plant.weeksOverride;

    DB.upsertPlant(plant);
    close('modal-stage');
    Render.detail(plant);
    Render.home();
    UI.toast('Estágio atualizado.');
  }

  // ── REGISTRO ──────────────────────────────────
  function openEntry(preset) {
    _editEntryId = null;
    document.getElementById('me-title').textContent = 'Novo Registro';

    Entry.reset(App.activePlantId());

    if (preset === 'water') {
      setTimeout(() => UI.toggle('tgl-water', 'water-fields'), 80);
    }

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

    const entry = {
      id:         _editEntryId || Utils.uid(),
      date,
      time:       document.getElementById('ef-time').value || null,
      stage:      UI.getPill('entry-stage-group') || plant.stage,
      daysAlive:  Utils.daysAlive(plant, date),
      weekInStage: Utils.weekInStage(plant, date),
      temp:       parseFloat(document.getElementById('ef-temp').value)    || null,
      ur:         parseFloat(document.getElementById('ef-ur').value)      || null,
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
   INIT
═══════════════════════════════════════════════ */
(function init() {
  DB.load();

  // Inicializa listeners de pills
  ['mp-type-group', 'stage-pill-group', 'entry-stage-group'].forEach(id => UI.initPills(id));

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
