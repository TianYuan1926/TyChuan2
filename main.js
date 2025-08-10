
// === Stable Minimal: Auth + Trades + hCaptcha (Invisible) ===
(function(){
  const APP = window.APP_CONFIG || {};
  const SITEKEY = APP.HCAPTCHA_SITEKEY || '92d48fee-72fc-481a-a0e6-690084662786';
  const hasSB = !!(window.supabase && window.supabase.createClient);
  if(!hasSB){ console.error('supabase-js 未加载'); return; }
  if(!(APP.SUPABASE_URL && APP.SUPABASE_ANON_KEY)){ console.warn('APP_CONFIG 未设置，前端将无法调用 Supabase'); }
  const SB = window.supabase.createClient(APP.SUPABASE_URL||'', APP.SUPABASE_ANON_KEY||'');
  window.__SB = SB;

  const $ = (sel,root=document)=>root.querySelector(sel);

  function toast(msg, kind='info'){
    const el = $('#status'); if(!el) return;
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(toast._t); toast._t = setTimeout(()=>{el.style.opacity=.85;},1800);
  }

  // -------- hCaptcha: dynamic load & invisible widget --------
  async function loadHCaptcha(){
    if (window.hcaptcha && window.hcaptcha.render) return true;
    await new Promise((res,rej)=>{
      const s=document.createElement('script'); s.src='https://hcaptcha.com/1/api.js?render=explicit';
      s.async=true; s.defer=true; s.onload=res; s.onerror=rej; document.head.appendChild(s);
    }).catch(e=>console.error('hCaptcha 脚本加载失败', e));
    return !!(window.hcaptcha && window.hcaptcha.render);
  }
  let wid=null;
  async function ensureWidget(){
    const ok=await loadHCaptcha(); if(!ok) return null;
    if (wid!==null) return wid;
    const box=document.createElement('div'); box.id='captcha-box-hidden';
    box.style.cssText='position:fixed;left:-9999px;bottom:0;opacity:0;pointer-events:none;';
    document.body.appendChild(box);
    try{ wid=window.hcaptcha.render(box,{sitekey:SITEKEY,size:'invisible'}); }catch(e){ console.error('渲染 hCaptcha 失败',e);}
    return wid;
  }
  async function getCaptchaToken(){
    const id=await ensureWidget(); if(id===null) return null;
    try{ const t=await window.hcaptcha.execute(id,{async:true}); return t||null; }catch(e){ return null; }
  }

  // 认证动作（带 captchaToken）
  const AuthUI = {
    async login(email, password){
      const captchaToken = await getCaptchaToken();
      const { data, error } = await SB.auth.signInWithPassword({ email, password, options:{ captchaToken } });
      if (error) throw error; return data;
    },
    async register(email, password){
      const captchaToken = await getCaptchaToken();
      const { data, error } = await SB.auth.signUp({ email, password, options:{ captchaToken } });
      if (error) throw error; return data;
    },
    async reset(email){
      const captchaToken = await getCaptchaToken();
      const { data, error } = await SB.auth.resetPasswordForEmail(email, { captchaToken });
      if (error) throw error; return data;
    },
    async logout(){ await SB.auth.signOut(); },
    testCaptcha: async()=> await getCaptchaToken()
  };
  window.AuthUI = AuthUI;

  async function requireUser(){
    const { data, error } = await SB.auth.getUser(); if (error) throw error;
    return data.user || null;
  }

  // 交易 API
  function renderTable(rows){
    const table = $('#tx-table'); if (!table) return;
    if (!table.tHead){
      const thead = table.createTHead(); const tr = thead.insertRow();
      ['时间','币种','方向','数量','价格','手续费','备注',''].forEach((h,i)=>{
        const th=document.createElement('th'); th.textContent=h; if (i===3||i===4) th.className='num'; tr.appendChild(th);
      });
    }
    let tbody = table.tBodies[0]; if (!tbody) tbody = table.createTBody();
    tbody.innerHTML='';
    (rows||[]).forEach(r=>{
      const tr=document.createElement('tr');
      const cells=[new Date(r.ts).toLocaleString(), r.symbol||'', r.side||'', String(r.qty??''), String(r.price??''), String(r.fee??''), r.note||''];
      cells.forEach((c,i)=>{ const td=document.createElement('td'); td.textContent=c; if(i===3||i===4) td.className='num'; tr.appendChild(td); });
      const td=document.createElement('td'); const btn=document.createElement('button'); btn.textContent='删除';
      btn.onclick=async()=>{ try{ await TradesAPI.deleteTrade(r.id); toast('已删除'); await TradesAPI.loadTrades(); }catch(e){ toast('删除失败','err'); } };
      td.appendChild(btn); tr.appendChild(td); tbody.appendChild(tr);
    });
  }

  window.TradesAPI = {
    async loadTrades(){
      const u = await requireUser(); if (!u){ toast('请先登录','err'); return []; }
      const { data, error } = await SB.from('trades').select('*').order('ts',{ascending:false});
      if (error){ console.error(error); toast('加载失败','err'); return []; }
      renderTable(data||[]); return data||[];
    },
    async saveTrade(p){
      const u = await requireUser(); if(!u) throw new Error('未登录');
      const row = { user_id:u.id, ts:p.ts?new Date(p.ts).toISOString():new Date().toISOString(),
        symbol:p.symbol||'', side:p.side||'buy', qty:+(p.qty||0), price:+(p.price||0), fee:+(p.fee||0), note:p.note||'' };
      const { error } = await SB.from('trades').insert(row); if (error) throw error; toast('已保存');
    },
    async deleteTrade(id){
      const u = await requireUser(); if(!u) throw new Error('未登录');
      const { error } = await SB.from('trades').delete().eq('id', id); if (error) throw error;
    }
  };

  // 门禁 & 表单接管
  document.addEventListener('DOMContentLoaded', ()=>{
    const authBox = $('#auth-section'), appBox = $('#app-section');
    SB.auth.getUser().then(({data})=>{
      const signed = !!data.user; if(authBox) authBox.style.display = signed? 'none':''; if(appBox) appBox.style.display = signed? '':'none';
      if (signed && $('#tx-table')) { window.TradesAPI.loadTrades(); }
    });

    const login = $('#login-form');
    if (login){
      login.addEventListener('submit', async (e)=>{
        e.preventDefault(); const email=$('#login-email',login).value.trim(); const pwd=$('#login-password',login).value;
        try{ await AuthUI.login(email,pwd); toast('登录成功'); location.reload(); }catch(ex){ toast(ex.message||'登录失败','err'); }
      });
    }
    const reg = $('#register-form');
    if (reg){
      reg.addEventListener('submit', async (e)=>{
        e.preventDefault(); const email=$('#register-email',reg).value.trim(); const pwd=$('#register-password',reg).value;
        try{ await AuthUI.register(email,pwd); toast('注册成功，请查收验证邮件'); }catch(ex){ toast(ex.message||'注册失败','err'); }
      });
    }
    const forgot = $('#forgot-form');
    if (forgot){
      forgot.addEventListener('submit', async (e)=>{
        e.preventDefault(); const email=$('#forgot-email',forgot).value.trim();
        try{ await AuthUI.reset(email); toast('重置邮件已发送'); }catch(ex){ toast(ex.message||'发送失败','err'); }
      });
    }
    const btnLogout = $('#btn-logout');
    if (btnLogout){ btnLogout.addEventListener('click', async ()=>{ await AuthUI.logout(); location.reload(); }); }

    const form = $('#tx-form');
    if (form){
      form.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const v=id=>$('#'+id,form)?.value||'';
        const p={ ts:v('tx-ts'), symbol:v('tx-symbol'), side:v('tx-side'), qty:v('tx-qty'), price:v('tx-price'), fee:v('tx-fee'), note:v('tx-note') };
        try{ await window.TradesAPI.saveTrade(p); await window.TradesAPI.loadTrades(); form.reset(); }catch(ex){ toast(ex.message||'保存失败','err'); }
      });
    }
  });
})();
