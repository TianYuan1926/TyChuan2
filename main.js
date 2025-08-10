/* ===== Trades Frontend Bridge — safe init ===== */
(function () {
  const log = (...args) => console.log('[TRADES]', ...args);
  const error = (...args) => console.error('[TRADES]', ...args);

  // 小提示：顶部 #status.banner 如果存在，就在这里显示提示语
  function toast(msg, kind = 'info') {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('ok', 'err');
    if (kind === 'ok') el.classList.add('ok');
    if (kind === 'err') el.classList.add('err');
    // 2 秒后淡出
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.textContent = ''), 2000);
  }

  // === 1) 初始化 Supabase 客户端 ===
  const APP = window.APP_CONFIG || {};
  const hasSupabase = !!(window.supabase && window.supabase.createClient);
  const hasConfig = !!(APP.SUPABASE_URL && APP.SUPABASE_ANON_KEY);

  if (!hasSupabase) {
    error('supabase-js 未加载：请确认 index.html 中的 <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js..."> 存在');
    return;
  }
  if (!hasConfig) {
    error('APP_CONFIG 缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY');
    return;
  }

  try {
    const SB = window.supabase.createClient(APP.SUPABASE_URL, APP.SUPABASE_ANON_KEY);
    window.__SB = SB; // 供自检脚本与调试使用
    log('Supabase client 初始化完成');
  } catch (e) {
    error('创建 Supabase 客户端失败：', e);
    return;
  }

  const SB = window.__SB;

  // === 2) API 封装（只对当前用户读写） ===
  // 渲染到 #tx-table（如果存在）
  function renderTable(rows) {
    const table = document.getElementById('tx-table');
    if (!table) return; // 页面没有表格，不处理
    // 若表格没有 <thead>/<tbody>，简单创建
    if (!table.tHead) {
      const thead = table.createTHead();
      const tr = thead.insertRow();
      ['时间', '币种', '方向', '数量', '价格', '手续费', '备注', ''].forEach((h, i) => {
        const th = document.createElement('th');
        th.textContent = h;
        if (i === 4 || i === 3) th.className = 'num';
        tr.appendChild(th);
      });
    }
    let tbody = table.tBodies[0];
    if (!tbody) tbody = table.createTBody();
    tbody.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const cells = [
        new Date(r.ts).toLocaleString(),
        r.symbol || '',
        r.side || '',
        String(r.qty ?? ''),
        String(r.price ?? ''),
        String(r.fee ?? ''),
        r.note || '',
      ];
      cells.forEach((c, i) => {
        const td = document.createElement('td');
        td.textContent = c;
        if (i === 3 || i === 4) td.className = 'num';
        tr.appendChild(td);
      });
      // 删除按钮
      const tdOp = document.createElement('td');
      const btn = document.createElement('button');
      btn.textContent = '删除';
      btn.addEventListener('click', async () => {
        try {
          await TradesAPI.deleteTrade(r.id);
          toast('已删除', 'ok');
          await TradesAPI.loadTrades();
        } catch (e) {
          toast('删除失败', 'err');
          error(e);
        }
      });
      tdOp.appendChild(btn);
      tr.appendChild(tdOp);
      tbody.appendChild(tr);
    });
  }

  async function requireUser() {
    const { data, error: err } = await SB.auth.getUser();
    if (err) throw err;
    return data.user || null;
  }

  // 公开 API
  const TradesAPI = {
    // 读取我的交易
    async loadTrades() {
      const u = await requireUser();
      if (!u) {
        toast('请先登录', 'err');
        return [];
      }
      const { data, error: err } = await SB
        .from('trades')
        .select('*')
        .order('ts', { ascending: false });
      if (err) {
        error('加载失败', err);
        toast('加载失败', 'err');
        return [];
      }
      renderTable(data || []);
      log('loadTrades OK，rows=', data?.length ?? 0);
      return data || [];
    },

    // 新增一条
    async saveTrade(payload) {
      const u = await requireUser();
      if (!u) throw new Error('未登录');
      const row = {
        user_id: u.id,
        ts: payload.ts ? new Date(payload.ts).toISOString() : new Date().toISOString(),
        symbol: payload.symbol || '',
        side: payload.side || 'buy',
        qty: Number(payload.qty || 0),
        price: Number(payload.price || 0),
        fee: Number(payload.fee || 0),
        note: payload.note || ''
      };
      const { error: err } = await SB.from('trades').insert(row);
      if (err) throw err;
      log('saveTrade OK');
      toast('已保存', 'ok');
    },

    // 删除一条（仅本人）
    async deleteTrade(id) {
      const u = await requireUser();
      if (!u) throw new Error('未登录');
      const { error: err } = await SB.from('trades').delete().eq('id', id);
      if (err) throw err;
      log('deleteTrade OK');
    }
  };

  // 暴露到全局，便于自检脚本识别
  window.TradesAPI = TradesAPI;

  // === 3) 自动接管 #tx-form（如果存在） ===
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('tx-form');
    if (form) {
      log('检测到 #tx-form，自动接管提交');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = (id) => (form.querySelector(`#${id}`) || {}).value || '';
        const payload = {
          ts: v('tx-ts'),
          symbol: v('tx-symbol'),
          side: v('tx-side'),
          qty: v('tx-qty'),
          price: v('tx-price'),
          fee: v('tx-fee'),
          note: v('tx-note')
        };
        try {
          await TradesAPI.saveTrade(payload);
          await TradesAPI.loadTrades();
          form.reset();
        } catch (err) {
          error('保存失败', err);
          toast('保存失败', 'err');
        }
      });
    }

    // 页面上如果存在 #tx-table，自动加载数据
    if (document.getElementById('tx-table')) {
      TradesAPI.loadTrades().catch(err => error(err));
    }

    // 打印一次初始化状态，便于你用自检脚本观察
    (async () => {
      const u = await SB.auth.getUser();
      log('INIT OK · SB=', !!SB, ' · User=', !!u.data.user, ' · TradesAPI=', !!window.TradesAPI);
    })();
  });
})();
