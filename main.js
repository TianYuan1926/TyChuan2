
/* ===== App Front Bridge: Auth + Trades (safe, overwrite main.js) ===== */
(function(){
  const log = (...a)=>console.log('[APP]',...a);
  const err = (...a)=>console.error('[APP]',...a);
  const APP = window.APP_CONFIG||{};

  function toast(msg, kind='info'){
    const el = document.getElementById('status');
    if(!el) return;
    el.textContent = msg||'';
    el.classList.remove('ok','err');
    if(kind==='ok') el.classList.add('ok');
    if(kind==='err') el.classList.add('err');
    clearTimeout(toast._t);
    toast._t=setTimeout(()=>{ el.textContent=''; }, 2500);
  }

  // ---- Supabase init ----
  if(!(window.supabase&&window.supabase.createClient)){
    err('supabase-js missing. Make sure the CDN <script> is in index.html');
    return;
  }
  if(!(APP.SUPABASE_URL && APP.SUPABASE_ANON_KEY)){
    err('APP_CONFIG missing SUPABASE_URL / SUPABASE_ANON_KEY');
    return;
  }
  const SB = window.supabase.createClient(APP.SUPABASE_URL, APP.SUPABASE_ANON_KEY);
  window.__SB = SB;

  // ---- Section gate: only show app after login ----
  function setGate(user){
    const auth = document.getElementById('auth-section');
    const app  = document.getElementById('app-section') || document.getElementById('panel-journal')?.closest('section,main,article,div');
    if(auth){ auth.style.display = user? 'none' : ''; }
    if(app){  app.style.display  = user? '' : 'none'; }
  }

  // ---- Optional hCaptcha token reader ----
  async function getCaptchaToken(){
    try{
      if(window.hcaptcha){
        // if explicit render, get first widget id
        const ids = window.hcaptcha.getRespKey ? Object.keys(window.hcaptcha.getRespKey()) : [];
        if(ids && ids.length){
          const t = window.hcaptcha.getResponse(ids[0]);
          if(t) return t;
        }
        // fallback: try execute() on first .h-captcha
        if(window.hcaptcha.execute) {
          const t = await window.hcaptcha.execute();
          if(t) return t;
        }
      }
    }catch(e){ /* ignore */ }
    return undefined;
  }

  // ---- Auth API ----
  const AuthUI = {
    async currentUser(){
      const {data, error:e} = await SB.auth.getUser();
      if(e){ err(e); return null; }
      return data.user||null;
    },
    async signIn(email, password){
      const opts = { email, password, options:{} };
      const ct = await getCaptchaToken();
      if(ct) opts.options.captchaToken = ct;
      const {data, error:e} = await SB.auth.signInWithPassword(opts);
      if(e){ toast(e.message||'登录失败', 'err'); throw e; }
      toast('登录成功', 'ok');
      return data.user;
    },
    async signUp(email, password){
      const opts = { email, password, options:{} };
      const ct = await getCaptchaToken();
      if(ct) opts.options.captchaToken = ct;
      const {data, error:e} = await SB.auth.signUp(opts);
      if(e){ toast(e.message||'注册失败', 'err'); throw e; }
      toast('注册成功，请验证邮箱', 'ok');
      return data.user;
    },
    async resetPassword(email){
      const ct = await getCaptchaToken();
      const { data, error:e } = await SB.auth.resetPasswordForEmail(email, { captchaToken: ct });
      if(e){ toast(e.message||'发送失败', 'err'); throw e; }
      toast('重置邮件已发送', 'ok');
      return data;
    },
    async signOut(){
      const {error:e} = await SB.auth.signOut();
      if(e){ toast(e.message||'退出失败','err'); throw e; }
      toast('已退出','ok');
    }
  };
  window.AuthUI = AuthUI;

  // ---- Trades API (same as before) ----
  function renderTable(rows){
    const table = document.getElementById('tx-table');
    if(!table) return;
    if(!table.tHead){
      const thead = table.createTHead();
      const tr = thead.insertRow();
      ['时间','币种','方向','数量','价格','手续费','备注',''].forEach((h,i)=>{
        const th=document.createElement('th');
        th.textContent=h;
        if(i===3||i===4) th.className='num';
        tr.appendChild(th);
      });
    }
    let tbody = table.tBodies[0]; if(!tbody) tbody = table.createTBody();
    tbody.innerHTML='';
    (rows||[]).forEach(r=>{
      const tr=document.createElement('tr');
      const cells=[ new Date(r.ts).toLocaleString(), r.symbol||'', r.side||'',
                    String(r.qty??''), String(r.price??''), String(r.fee??''), r.note||'' ];
      cells.forEach((c,i)=>{ const td=document.createElement('td'); td.textContent=c; if(i===3||i===4) td.className='num'; tr.appendChild(td); });
      const tdOp=document.createElement('td');
      const btn=document.createElement('button'); btn.textContent='删除';
      btn.addEventListener('click', async()=>{ try{ await TradesAPI.deleteTrade(r.id); toast('已删除','ok'); await TradesAPI.loadTrades(); }catch(e){ err(e); toast('删除失败','err'); } });
      tdOp.appendChild(btn); tr.appendChild(tdOp); tbody.appendChild(tr);
    });
  }

  const TradesAPI = {
    async loadTrades(){
      const {data:u} = await SB.auth.getUser(); if(!u.user){ toast('请先登录','err'); setGate(null); return []; }
      const { data, error:e } = await SB.from('trades').select('*').order('ts', {ascending:false});
      if(e){ err(e); toast('加载失败','err'); return []; }
      renderTable(data||[]); setGate(u.user); return data||[];
    },
    async saveTrade(payload){
      const {data:u} = await SB.auth.getUser(); if(!u.user) throw new Error('未登录');
      const row={ user_id:u.user.id, ts: payload.ts ? new Date(payload.ts).toISOString() : new Date().toISOString(),
        symbol:payload.symbol||'', side:payload.side||'buy', qty:Number(payload.qty||0), price:Number(payload.price||0),
        fee:Number(payload.fee||0), note:payload.note||'' };
      const {error:e}=await SB.from('trades').insert(row);
      if(e) throw e; toast('已保存','ok');
    },
    async deleteTrade(id){
      const {data:u} = await SB.auth.getUser(); if(!u.user) throw new Error('未登录');
      const {error:e}=await SB.from('trades').delete().eq('id', id);
      if(e) throw e;
    }
  };
  window.TradesAPI = TradesAPI;

  // ---- Bind forms if present ----
  document.addEventListener('DOMContentLoaded', async ()=>{
    // gate on load
    const u = (await SB.auth.getUser()).data.user; setGate(u);

    const loginForm = document.getElementById('login-form');
    if(loginForm){
      log('hook login-form');
      loginForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const email = (loginForm.querySelector('#login-email')||{}).value || '';
        const pass  = (loginForm.querySelector('#login-password')||{}).value || '';
        try{ await AuthUI.signIn(email, pass); setGate((await SB.auth.getUser()).data.user); await TradesAPI.loadTrades(); }
        catch(e){ err(e); }
      });
    }
    const regForm = document.getElementById('register-form');
    if(regForm){
      log('hook register-form');
      regForm.addEventListener('submit', async(e)=>{
        e.preventDefault();
        const email=(regForm.querySelector('#register-email')||{}).value||'';
        const pass=(regForm.querySelector('#register-password')||{}).value||'';
        try{ await AuthUI.signUp(email, pass); } catch(e){ err(e); }
      });
    }
    const forgotForm = document.getElementById('forgot-form');
    if(forgotForm){
      log('hook forgot-form');
      forgotForm.addEventListener('submit', async(e)=>{
        e.preventDefault();
        const email=(forgotForm.querySelector('#forgot-email')||{}).value||'';
        try{ await AuthUI.resetPassword(email); } catch(e){ err(e); }
      });
    }
    const logoutBtn = document.getElementById('btn-logout');
    if(logoutBtn){
      logoutBtn.addEventListener('click', async()=>{ try{ await AuthUI.signOut(); setGate(null); }catch(e){ err(e); } });
    }
    // trades form
    const form = document.getElementById('tx-form');
    if(form){
      form.addEventListener('submit', async(e)=>{
        e.preventDefault();
        const v = id => (form.querySelector('#'+id)||{}).value || '';
        const payload = { ts:v('tx-ts'), symbol:v('tx-symbol'), side:v('tx-side'),
                          qty:v('tx-qty'), price:v('tx-price'), fee:v('tx-fee'), note:v('tx-note') };
        try{ await TradesAPI.saveTrade(payload); await TradesAPI.loadTrades(); form.reset(); }
        catch(e){ err(e); toast('保存失败','err'); }
      });
    }
    // auto load
    if(document.getElementById('tx-table')){ TradesAPI.loadTrades().catch(err); }

    // auth state change
    SB.auth.onAuthStateChange((_evt, session)=>{
      setGate(session?.user||null);
      if(session?.user) TradesAPI.loadTrades().catch(()=>{});
    });

    log('INIT OK: Auth + Trades wired.');
  });
})();
