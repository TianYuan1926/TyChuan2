// P10b Full Integration (single-file JS, zero side-effects to HTML/CSS/DB)
;(function(){
  const cfg = (window.APP_CONFIG||{});
  // --- Status banner helpers (quiet by default) ---
  const statusEl = document.getElementById('status');
  function banner(msg, ok=true, autoHideMs=1500){
    if(!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.background = ok ? '#122' : '#2a1111';
    statusEl.style.color = ok ? '#9fd' : '#f6b';
    if(autoHideMs>0){
      clearTimeout(banner._t); banner._t = setTimeout(()=>{ statusEl.textContent=''; }, autoHideMs);
    }
  }

  // --- Single supabase client (avoid multiple instances) ---
  try{
    if(!window.SB){
      if(!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY){
        banner('配置未就绪，请刷新或检查 config/config.js', false, 4000);
      }else{
        window.SB = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true }
        });
      }
    }
  }catch(e){ console.error('createClient failed', e); }

  const SB = window.SB;

  // --- Find containers (robust selectors) ---
  function getAuthBox(){
    // Prefer parent of #login-form; fallback to panel-auth / tab-login etc.
    const lf = document.getElementById('login-form');
    if(lf){ const box = lf.closest('section,form,div,article,main'); if(box) return box; }
    const byId = document.querySelector('#panel-auth, #auth-section, #tab-login, [id*="auth" i]');
    if(byId) return byId.closest('section,div,main,article') || byId;
    // last resort: the first form that contains email+password
    const email = document.querySelector('input[type="email"], input[name*="email" i]');
    const pass  = document.querySelector('input[type="password"], input[name*="pass" i]');
    if(email && pass){ return email.closest('section,form,div,article,main'); }
    return null;
  }

  function getPanels(){
    const j = document.getElementById('panel-journal') || document.querySelector('[data-panel="journal"], [data-view="journal"], #journal');
    const s = document.getElementById('panel-security') || document.querySelector('[data-panel="security"], [data-view="security"], #security');
    return { j, s };
  }
  function getAppBox(){
    const {j,s} = getPanels();
    if(j && s){
      // common parent
      const jp = j.closest('section,div,main,article')||j.parentElement;
      const sp = s.closest('section,div,main,article')||s.parentElement;
      return jp===sp ? jp : (jp || sp);
    }
    // fallback to any table area
    const table = document.getElementById('tx-table') || document.querySelector('.table-wrap table, table');
    if(table){ return table.closest('section,div,main,article'); }
    return null;
  }

  function showAuth(){
    const a = getAuthBox(); const app = getAppBox();
    if(a){ a.classList.remove('hidden'); if(a.style) a.style.display=''; }
    if(app){ app.classList.add('hidden'); if(app.style) app.style.display='none'; }
    banner('请先登录');
  }
  function showApp(){
    const a = getAuthBox(); const app = getAppBox();
    if(app){ app.classList.remove('hidden'); if(app.style) app.style.display=''; }
    if(a){ a.classList.add('hidden'); if(a.style) a.style.display='none'; }
    banner('已登录', true);
  }
  function switchPanel(key){
    const {j,s} = getPanels(); if(!j && !s) return;
    const map = {journal:j, security:s};
    Object.entries(map).forEach(([k,el])=>{
      if(!el) return;
      const show = (k===key);
      el.classList.toggle('hidden', !show);
      if(el.style){ el.style.display = show ? '' : 'none'; }
    });
  }

  // --- hCaptcha explicit rendering (stable) ---
  let hLoaded=false, widgetIds={};
  window.hcaptchaOnLoad = function(){ hLoaded=true; renderCaptchas(); };
  function renderOne(id){
    const el = document.getElementById(id); if(!el) return;
    if(!hLoaded || !window.hcaptcha){ setTimeout(()=>renderOne(id), 120); return; }
    if(el.offsetParent===null || el.clientHeight===0){ setTimeout(()=>renderOne(id), 120); return; }
    try{
      if(widgetIds[id]!==undefined){
        window.hcaptcha.reset(widgetIds[id]);
      }else{
        if(cfg.HCAPTCHA_SITEKEY) el.setAttribute('data-sitekey', cfg.HCAPTCHA_SITEKEY);
        widgetIds[id] = window.hcaptcha.render(id);
      }
    }catch(e){ console.warn('captcha render fail', id, e); }
  }
  function renderCaptchas(){ ['captcha-login','captcha-register','captcha-forgot'].forEach(renderOne); }
  function getCaptchaToken(id){
    if(!hLoaded || !window.hcaptcha) return '';
    const wid = widgetIds[id]; if(wid===undefined) return '';
    return window.hcaptcha.getResponse(wid)||'';
  }
  // re-check on tab/link navigations
  setTimeout(renderCaptchas, 80);

  // --- Auth flows: login/register/forgot (if forms exist) ---
  function tryBindAuthForms(){
    const loginForm = document.getElementById('login-form');
    if(loginForm && !loginForm._bound){
      loginForm._bound = true;
      loginForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        if(!SB) return banner('配置未就绪', false, 3000);
        const token = getCaptchaToken('captcha-login');
        if(!token) return banner('请先完成验证码', false, 2000);
        const email = (document.getElementById('login-email')||{}).value||'';
        const password = (document.getElementById('login-password')||{}).value||'';
        const { error } = await SB.auth.signInWithPassword({ email, password, options:{ captchaToken: token }});
        if(error){ banner('登录失败：'+error.message, false, 3000); return; }
        // immediate UI switch
        showApp(); switchPanel('journal');
      });
    }
    const regForm = document.getElementById('register-form');
    if(regForm && !regForm._bound){
      regForm._bound = true;
      regForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        if(!SB) return banner('配置未就绪', false, 3000);
        const token = getCaptchaToken('captcha-register');
        if(!token) return banner('请先完成验证码', false, 2000);
        const email = (document.getElementById('reg-email')||{}).value||'';
        const p1 = (document.getElementById('reg-password')||{}).value||'';
        const p2 = (document.getElementById('reg-password2')||{}).value||'';
        if(p1!==p2) return banner('两次密码不一致', false, 2000);
        const redirectTo = location.origin + location.pathname;
        const { error } = await SB.auth.signUp({ email, password:p1, options:{ emailRedirectTo: redirectTo, captchaToken: token }});
        if(error) return banner('注册失败：'+error.message, false, 3000);
        banner('注册成功，请到邮箱完成验证后再登录。', true, 3000);
      });
    }
    const forgotForm = document.getElementById('forgot-form');
    if(forgotForm && !forgotForm._bound){
      forgotForm._bound = true;
      forgotForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        if(!SB) return banner('配置未就绪', false, 3000);
        const token = getCaptchaToken('captcha-forgot');
        if(!token) return banner('请先完成验证码', false, 2000);
        const email = (document.getElementById('forgot-email')||{}).value||'';
        const redirectTo = location.origin + location.pathname;
        const { error } = await SB.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
        if(error) return banner('发送失败：'+error.message, false, 3000);
        banner('已发送重置密码邮件，请查收。', true, 2000);
      });
    }
  }
  tryBindAuthForms();

  // --- Global navigation delegation (sidebar + tabs) ---
  document.addEventListener('click', async (e)=>{
    const t = e.target.closest('[data-view],[data-panel],#nav-journal,#nav-security,.nav-item,a,button,div,li,span');
    if(!t) return;
    const text = (t.textContent||'').trim();
    let key = (t.dataset.view||t.dataset.panel||t.id||'').toLowerCase();
    if(!/journal|security/.test(key)){
      if(/日志/.test(text)) key='journal';
      else if(/安全/.test(text)) key='security';
      else return;
    }
    // require login
    if(SB){
      const { data:{ user } } = await SB.auth.getUser();
      if(!user){ banner('请先登录', true, 1500); showAuth(); return; }
    }
    showApp(); switchPanel(key);
  }, {capture:true});

  // --- Auth state & boot with triple guarantees ---
  async function boot(){
    if(!SB){ showAuth(); return; }
    const { data:{ user } } = await SB.auth.getUser();
    if(user){ showApp(); switchPanel('journal'); }
    else { showAuth(); }
    // render captchas after visibility changes
    setTimeout(renderCaptchas, 100);
  }

  // on state change
  if(SB && !window.__onAuthBound){
    window.__onAuthBound = true;
    SB.auth.onAuthStateChange((ev)=>{
      if(ev==='SIGNED_IN'){ showApp(); switchPanel('journal'); }
      if(ev==='SIGNED_OUT'){ showAuth(); }
    });
  }

  // fallback: poll until user detected (max ~12s)
  (function poll(i=0){
    if(i>24) return; // 24 * 500ms = 12s
    if(!SB){ setTimeout(()=>poll(i+1), 500); return; }
    SB.auth.getUser().then(({data:{user}})=>{
      if(user){ showApp(); switchPanel('journal'); }
      else if(i===0){ showAuth(); }
      if(!user) setTimeout(()=>poll(i+1), 500);
    }).catch(()=> setTimeout(()=>poll(i+1), 500));
  })();

  // initial kick
  setTimeout(boot, 50);

  // --- small utilities ---
  // Compute amount auto (if inputs exist)
  ['qty','price','fee'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && !el._bound){
      el._bound = true;
      el.addEventListener('input', ()=>{
        const q = parseFloat((document.getElementById('qty')||{}).value)||0;
        const p = parseFloat((document.getElementById('price')||{}).value)||0;
        const f = parseFloat((document.getElementById('fee')||{}).value)||0;
        const out = document.getElementById('amount'); if(out) out.value = (q*p+f)||'';
      });
    }
  });

})();