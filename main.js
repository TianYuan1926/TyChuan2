// M2-Front CRUD Pack — safe attach, no HTML changes required.
// Uses window.APP_CONFIG.{SUPABASE_URL,SUPABASE_ANON_KEY}.
// Graceful if DOM nodes are missing.

(() => {
  const log = (...a)=>console.log('[M2-Front]', ...a);
  const err = (...a)=>console.error('[M2-Front]', ...a);

  // 1) Init Supabase
  const APP = window.APP_CONFIG || {};
  if (!APP.SUPABASE_URL || !APP.SUPABASE_ANON_KEY) {
    err('Missing APP_CONFIG.SUPABASE_URL or SUPABASE_ANON_KEY');
    return;
  }
  const SB = window.supabase?.createClient(APP.SUPABASE_URL, APP.SUPABASE_ANON_KEY);
  if (!SB) { err('Supabase JS not loaded'); return; }
  window.__SB = SB; // expose for debugging

  // 2) Minimal helpers
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const byId = id => document.getElementById(id);

  const ui = {
    table: byId('tx-table') || $('table#tx-table'),
    tbody: $('#tx-table tbody'),
    form: byId('tx-form') || $('form#tx-form'),
    inputs: {
      symbol: byId('tx-symbol'),
      side: byId('tx-side'),
      qty: byId('tx-qty'),
      price: byId('tx-price'),
      fee: byId('tx-fee'),
      note: byId('tx-note'),
      ts: byId('tx-ts')
    },
    saveBtn: byId('save-btn'),
    status: byId('status') || $('.banner')
  };

  const toast = (msg, ok=true) => {
    if (ui.status) {
      ui.status.textContent = msg;
      ui.status.style.opacity = 1;
      ui.status.style.color = ok ? '#25d695' : '#ff5d7a';
      setTimeout(()=>{ ui.status.style.opacity = 0.9; }, 1800);
    } else {
      ok ? log(msg) : err(msg);
    }
  };

  // 3) Auth guard
  async function getUser() {
    const { data: { user }, error } = await SB.auth.getUser();
    if (error) { err('auth.getUser error', error); }
    return user || null;
  }

  // 4) CRUD
  async function loadTrades(limit=200) {
    const user = await getUser();
    if (!user) { toast('请先登录。', false); return []; }
    const { data, error } = await SB
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('ts', { ascending: false })
      .limit(limit);
    if (error) { err('loadTrades', error); toast('加载交易失败', false); return []; }
    renderTable(data||[]);
    return data||[];
  }

  async function saveTrade(payload) {
    const user = await getUser();
    if (!user) { toast('未登录，无法保存。', false); return; }
    const row = Object.assign({
      user_id: user.id,
      ts: new Date().toISOString(),
      symbol: '',
      side: 'buy',
      qty: 0,
      price: 0,
      fee: 0,
      note: ''
    }, payload||{});
    const { error } = await SB.from('trades').insert(row);
    if (error) { err('saveTrade', error); toast('保存失败：'+error.message, false); return; }
    toast('已保存');
    await loadTrades();
  }

  async function deleteTrade(id) {
    const user = await getUser();
    if (!user) { toast('未登录，无法删除。', false); return; }
    const { error } = await SB
      .from('trades')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) { err('deleteTrade', error); toast('删除失败：'+error.message, false); return; }
    toast('已删除');
    if (ui.tbody) {
      const tr = ui.tbody.querySelector(`tr[data-id="${id}"]`);
      if (tr) tr.remove();
    } else {
      await loadTrades();
    }
  }

  // 5) Render
  function renderTable(rows) {
    if (!ui.table) return;
    if (!ui.tbody) {
      // Create a tbody if missing
      const tb = document.createElement('tbody');
      ui.table.appendChild(tb);
      ui.tbody = tb;
    }
    ui.tbody.innerHTML = '';
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 8;
      td.textContent = '暂无记录';
      tr.appendChild(td);
      ui.tbody.appendChild(tr);
      return;
    }
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      tr.innerHTML = `
        <td>${new Date(r.ts).toLocaleString()}</td>
        <td>${r.symbol||''}</td>
        <td>${r.side||''}</td>
        <td class="num">${Number(r.qty||0).toFixed(6)}</td>
        <td class="num">${Number(r.price||0).toFixed(2)}</td>
        <td class="num">${Number(r.fee||0).toFixed(6)}</td>
        <td>${r.note||''}</td>
        <td><button class="btn btn-del" data-id="${r.id}">删除</button></td>
      `.trim();
      ui.tbody.appendChild(tr);
    }
    // bind delete
    $$('.btn-del', ui.tbody).forEach(b=>{
      b.addEventListener('click', e=>{
        const id = b.getAttribute('data-id');
        if (id) deleteTrade(id);
      });
    });
  }

  // 6) Hook form if exists
  function attachForm() {
    if (!ui.form) return;
    ui.form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const v = k => ui.inputs[k] && ui.inputs[k].value;
      const payload = {
        ts: v('ts') ? new Date(v('ts')).toISOString() : new Date().toISOString(),
        symbol: (v('symbol')||'').trim().toUpperCase(),
        side: (v('side')||'buy').toLowerCase(),
        qty: Number(v('qty')||0),
        price: Number(v('price')||0),
        fee: Number(v('fee')||0),
        note: v('note')||''
      };
      await saveTrade(payload);
      // reset minimal
      if (ui.form.reset) ui.form.reset();
    });
  }

  // 7) Initial kick
  window.TradesAPI = { loadTrades, saveTrade, deleteTrade }; // for debugging
  attachForm();
  // Try autoload on login state present
  getUser().then(u => { if (u) loadTrades(); });

  log('initialized');
})();
