
// === Auth + Trades + hCaptcha Hotfix (drop-in) ===
(function(){
  const APP = window.APP_CONFIG || {};
  const SITEKEY = APP.HCAPTCHA_SITEKEY || '92d48fee-72fc-481a-a0e6-690084662786'; // 你提供的 sitekey 兜底
  const log = (...a)=>console.log('[HOTFIX]', ...a);
  const err = (...a)=>console.error('[HOTFIX]', ...a);

  // ---------- Status toast ----------
  function toast(msg, kind='info'){
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('ok','err');
    if (kind==='ok') el.classList.add('ok');
    if (kind==='err') el.classList.add('err');
    clearTimeout(toast._t); toast._t=setTimeout(()=>{el.textContent='';}, 2500);
  }

  // ---------- Ensure Supabase ----------
  if(!(window.supabase && window.supabase.createClient)){
    err('supabase-js 未加载'); return;
  }
  if(!(APP.SUPABASE_URL && APP.SUPABASE_ANON_KEY)){
    err('APP_CONFIG 缺少 SUPABASE_URL/ANON_KEY'); return;
  }
  const SB = window.__SB || window.supabase.createClient(APP.SUPABASE_URL, APP.SUPABASE_ANON_KEY);
  window.__SB = SB;

  // ---------- hCaptcha loader & token ----------
  async function loadHCaptcha(){
    if (window.hcaptcha && window.hcaptcha.render) return true;
    // 动态加载脚本
    await new Promise((resolve,reject)=>{
      const s = document.createElement('script');
      s.src = 'https://hcaptcha.com/1/api.js?render=explicit';
      s.async = true; s.defer = true;
      s.onload = ()=>resolve(); s.onerror = (e)=>reject(e);
      document.head.appendChild(s);
    }).catch(e=>{err('加载 hCaptcha 失败', e)});
    return !!(window.hcaptcha && window.hcaptcha.render);
  }

  let widgetId = null;
  async function ensureWidget(){
    const ok = await loadHCaptcha();
    if(!ok) return null;
    if (widgetId!==null) return widgetId;
    // 创建隐藏容器并渲染
    const box = document.createElement('div');
    box.id = 'captcha-box-hidden';
    box.style.cssText = 'position:fixed;left:-9999px;bottom:0;opacity:0;pointer-events:none;';
    document.body.appendChild(box);
    try {
      widgetId = window.hcaptcha.render(box, { sitekey: SITEKEY, size:'invisible' });
      log('hCaptcha widget rendered', widgetId);
      return widgetId;
    } catch(e){
      err('渲染 hCaptcha 失败', e);
      return null;
    }
  }

  async function getCaptchaToken(){
    const wid = await ensureWidget();
    if (wid===null) return null;
    try{
      const token = await window.hcaptcha.execute(wid, { async: true });
      return token || null;
    }catch(e){
      err('获取 captchaToken 失败', e);
      return null;
    }
  }

  // 暴露一个测试函数给自检脚本
  window.AuthUI = window.AuthUI || {};
  window.AuthUI.testCaptcha = async ()=> await getCaptchaToken();

  // ---------- Auth API (with captchaToken) ----------
  window.AuthUI.login = async function(email, password){
    const captchaToken = await getCaptchaToken();
    const { data, error } = await SB.auth.signInWithPassword({ email, password, options:{ captchaToken } });
    if (error) throw error;
    return data;
  };
  window.AuthUI.register = async function(email, password){
    const captchaToken = await getCaptchaToken();
    const { data, error } = await SB.auth.signUp({ email, password, options:{ captchaToken } });
    if (error) throw error;
    return data;
  };
  window.AuthUI.reset = async function(email){
    const captchaToken = await getCaptchaToken();
    const { data, error } = await SB.auth.resetPasswordForEmail(email, { captchaToken });
    if (error) throw error;
    return data;
  };
  window.AuthUI.logout = async function(){
    await SB.auth.signOut();
  };

  // 自动接管页面表单（如果存在）
  document.addEventListener('DOMContentLoaded', ()=>{
    // gate：未登录只显示认证区
    const authBox = document.getElementById('auth-section');
    const appBox  = document.getElementById('app-section');
    SB.auth.getUser().then(({data})=>{
      const signed = !!data.user;
      if (authBox) authBox.style.display = signed ? 'none' : '';
      if (appBox)  appBox.style.display  = signed ? '' : 'none';
    });

    const login = document.getElementById('login-form');
    if (login){
      login.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const email = login.querySelector('#login-email')?.value?.trim()||'';
        const pass  = login.querySelector('#login-password')?.value||'';
        try{
          await window.AuthUI.login(email, pass);
          toast('登录成功','ok');
          location.reload();
        }catch(ex){ err(ex); toast(ex.message||'登录失败','err'); }
      });
    }
    const reg = document.getElementById('register-form');
    if (reg){
      reg.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const email = reg.querySelector('#register-email')?.value?.trim()||'';
        const pass  = reg.querySelector('#register-password')?.value||'';
        try{
          await window.AuthUI.register(email, pass);
          toast('注册成功，请查收验证邮件','ok');
        }catch(ex){ err(ex); toast(ex.message||'注册失败','err'); }
      });
    }
    const forgot = document.getElementById('forgot-form');
    if (forgot){
      forgot.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const email = forgot.querySelector('#forgot-email')?.value?.trim()||'';
        try{
          await window.AuthUI.reset(email);
          toast('找回邮件已发送','ok');
        }catch(ex){ err(ex); toast(ex.message||'发送失败','err'); }
      });
    }
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout){
      btnLogout.addEventListener('click', async ()=>{ await window.AuthUI.logout(); location.reload(); });
    }
  });

  // ---------- Trades API（保持不变） ----------
  function renderTable(rows){
    const table = document.getElementById('tx-table');
    if (!table) return;
    if (!table.tHead){
      const thead = table.createTHead();
      const tr = thead.insertRow();
      ['时间','币种','方向','数量','价格','手续费','备注',''].forEach((h,i)=>{
        const th=document.createElement('th'); th.textContent=h;
        if (i===3||i===4) th.className='num';
        tr.appendChild(th);
      });
    }
    let tbody = table.tBodies[0]; if(!tbody) tbody = table.createTBody();
    tbody.innerHTML='';
    rows.forEach(r=>{
      const tr=document.createElement('tr');
      const cells=[new Date(r.ts).toLocaleString(), r.symbol||'', r.side||'',
        String(r.qty??''), String(r.price??''), String(r.fee??''), r.note||''];
      cells.forEach((c,i)=>{ const td=document.createElement('td'); td.textContent=c; if(i===3||i===4) td.className='num'; tr.appendChild(td); });
      const op=document.createElement('td'); const b=document.createElement('button'); b.textContent='删除';
      b.onclick=async ()=>{ await TradesAPI.deleteTrade(r.id).then(()=>TradesAPI.loadTrades()); };
      op.appendChild(b); tr.appendChild(op); tbody.appendChild(tr);
    });
  }

  async function needUser(){ const {data, error:e}=await SB.auth.getUser(); if(e) throw e; return data.user||null; }

  window.TradesAPI = {
    async loadTrades(){
      const u = await needUser(); if(!u){ toast('请先登录','err'); return []; }
      const { data, error:e } = await SB.from('trades').select('*').order('ts',{ascending:false});
      if (e){ err(e); toast('加载失败','err'); return []; }
      renderTable(data||[]); return data||[];
    },
    async saveTrade(p){
      const u = await needUser(); if(!u) throw new Error('未登录');
      const row = { user_id:u.id, ts:p.ts?new Date(p.ts).toISOString():new Date().toISOString(),
        symbol:p.symbol||'', side:p.side||'buy', qty:+(p.qty||0), price:+(p.price||0), fee:+(p.fee||0), note:p.note||'' };
      const { error:e } = await SB.from('trades').insert(row); if(e) throw e; toast('已保存','ok');
    },
    async deleteTrade(id){
      const u = await needUser(); if(!u) throw new Error('未登录');
      const { error:e } = await SB.from('trades').delete().eq('id', id); if(e) throw e; toast('已删除','ok');
    }
  };

  document.addEventListener('DOMContentLoaded', ()=>{
    if (document.getElementById('tx-table')) { window.TradesAPI.loadTrades().catch(err); }
  });

  log('Hotfix ready');
})();
