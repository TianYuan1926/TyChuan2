
/*! P9e IntegratedFix | scope: JS only | keeps UI/CSS intact */
(function(){
  // ---------- Safe helpers ----------
  const $ = (s)=>document.querySelector(s);
  const $$ = (s)=>Array.from(document.querySelectorAll(s));
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
  const now = ()=>new Date().toISOString();
  const statusBar = document.getElementById('status');

  // Quiet banner helpers
  function banner(text, kind='info'){
    if(!statusBar) return;
    statusBar.textContent = text || '';
    if(kind==='error'){ statusBar.style.background = '#2a1111'; statusBar.style.color = '#f6b'; }
    else { statusBar.style.background = '#122'; statusBar.style.color = '#9fd'; }
  }
  let bannerFadeTimer = null;
  function bannerOk(text){
    banner(text||'就绪');
    clearTimeout(bannerFadeTimer);
    bannerFadeTimer = setTimeout(()=>{
      if(!statusBar) return;
      statusBar.style.transition = 'opacity .35s ease';
      statusBar.style.opacity = '0';
      setTimeout(()=>{ statusBar.style.display='none'; }, 400);
    }, 1500);
  }
  function bannerError(text){
    clearTimeout(bannerFadeTimer);
    if(statusBar){ statusBar.style.opacity = '1'; statusBar.style.display='block'; statusBar.style.transition=''; }
    banner(text||'发生错误', 'error');
  }

  // ---------- Config & Supabase client ----------
  if(!window.APP_CONFIG){
    bannerError('配置未就绪（缺少 config/config.js）');
    return;
  }
  const cfg = window.APP_CONFIG;
  if(!window.supabase || !window.supabase.createClient){
    bannerError('依赖未加载（supabase-js）');
    return;
  }
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  // Build stamp (non-UI)
  try{
    const bi = document.getElementById('build-info');
    if(bi) bi.textContent = `版本: ${cfg.VERSION||'dev'}-P9e | 环境: ${cfg.ENV||'dev'}`;
  }catch{}

  // ---------- Tabs: single handler with delegation ----------
  document.addEventListener('click', (ev)=>{
    const tabBtn = ev.target.closest('.tab');
    if(!tabBtn) return;
    const name = tabBtn.dataset.tab;
    if(!name) return;
    // visual
    $$('.tab').forEach(b=>b.classList.remove('active'));
    tabBtn.classList.add('active');
    $$('.tabpane').forEach(p=>p.classList.remove('show'));
    const pane = document.getElementById('tab-'+name);
    if(pane) pane.classList.add('show');
    // ensure captcha render after tab switch
    setTimeout(renderCaptchas, 50);
  });

  // Default to LOGIN tab (no UI change, just state)
  try{
    const loginBtn = document.querySelector('.tab[data-tab="login"]');
    if(loginBtn) loginBtn.click();
  }catch{}

  // ---------- hCaptcha: explicit & stable render ----------
  let widgetIds = {}, hLoaded = false;
  window.hcaptchaOnLoad = function(){ hLoaded = true; renderCaptchas(); };
  function renderOne(id){
    if(!hLoaded || !window.hcaptcha) return;
    const el = document.getElementById(id);
    if(!el) return;
    // don't render while hidden; defer
    if(el.offsetParent === null || el.clientHeight === 0){
      setTimeout(()=>renderOne(id), 200);
      return;
    }
    // set sitekey
    if(cfg.HCAPTCHA_SITEKEY) el.setAttribute('data-sitekey', cfg.HCAPTCHA_SITEKEY);
    // already rendered → reset to avoid stale tokens
    if(widgetIds[id] !== undefined){
      try{ window.hcaptcha.reset(widgetIds[id]); }catch{}
      return;
    }
    try{
      widgetIds[id] = window.hcaptcha.render(id);
    }catch(e){
      // swallow to avoid breaking UX
    }
  }
  function renderCaptchas(){
    ['captcha-login','captcha-register','captcha-forgot'].forEach(renderOne);
  }
  // Fallback: if onload missed (cache/timing), attempt delayed render
  setTimeout(renderCaptchas, 800);

  // token helper
  function getCaptcha(id){
    if(!hLoaded || !window.hcaptcha) return '';
    const wid = widgetIds[id];
    if(wid === undefined) return '';
    try{ return window.hcaptcha.getResponse(wid) || ''; }catch{ return ''; }
  }

  // ---------- Forms: submit handlers (guarded) ----------
  function on(el, ev, fn){ if(el) el.addEventListener(ev, fn); }

  // Login
  on(document.getElementById('login-form'), 'submit', async (e)=>{
    e.preventDefault();
    const token = getCaptcha('captcha-login');
    if(!token){ banner('请先完成验证码'); return; }
    const email = document.getElementById('login-email')?.value?.trim();
    const password = document.getElementById('login-password')?.value;
    if(!email || !password){ banner('请填写邮箱和密码'); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token } });
    if(error){ bannerError('登录失败：'+error.message); return; }
    bannerOk('登录成功');
    await boot(); // refresh view
  });

  // Register
  on(document.getElementById('register-form'), 'submit', async (e)=>{
    e.preventDefault();
    const token = getCaptcha('captcha-register');
    if(!token){ banner('请先完成验证码'); return; }
    const email = document.getElementById('reg-email')?.value?.trim();
    const p1 = document.getElementById('reg-password')?.value;
    const p2 = document.getElementById('reg-password2')?.value;
    if(!email || !p1){ banner('请填写邮箱和密码'); return; }
    if(p1 !== p2){ banner('两次密码不一致'); return; }
    const redirectTo = location.origin + location.pathname;
    const { error } = await supabase.auth.signUp({ email, password: p1, options:{ emailRedirectTo: redirectTo, captchaToken: token } });
    if(error){ bannerError('注册失败：'+error.message); return; }
    banner('注册成功。请到邮箱完成验证后再登录');
    // switch back to login tab for clarity
    const loginBtn = document.querySelector('.tab[data-tab="login"]');
    if(loginBtn) loginBtn.click();
  });

  // Forgot
  on(document.getElementById('forgot-form'), 'submit', async (e)=>{
    e.preventDefault();
    const token = getCaptcha('captcha-forgot');
    if(!token){ banner('请先完成验证码'); return; }
    const email = document.getElementById('forgot-email')?.value?.trim();
    const redirectTo = location.origin + location.pathname;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
    if(error){ bannerError('发送失败：'+error.message); return; }
    banner('已发送重置密码邮件');
  });

  // Logout (if exists)
  on(document.getElementById('logout-btn'), 'click', async ()=>{
    await supabase.auth.signOut();
    banner('已退出');
    await boot();
  });

  // ---------- App boot (quiet when not logged in) ----------
  async function boot(){
    try{
      const { data:{ user } } = await supabase.auth.getUser();
      if(user){
        document.getElementById('auth-section')?.classList.add('hidden');
        document.getElementById('app-section')?.classList.remove('hidden');
        const ue = document.getElementById('user-email'); if(ue) ue.textContent = user.email || '';
        const needVerify = !user.email_confirmed_at;
        const vb = document.getElementById('verify-banner'); if(vb) vb.classList.toggle('hidden', !needVerify);
        bannerOk('已登录');
      }else{
        document.getElementById('app-section')?.classList.add('hidden');
        document.getElementById('auth-section')?.classList.remove('hidden');
        bannerOk('请先登录');
        // ensure login tab
        const loginBtn = document.querySelector('.tab[data-tab="login"]');
        if(loginBtn && !loginBtn.classList.contains('active')) loginBtn.click();
        setTimeout(renderCaptchas, 50);
      }
    }catch(e){
      bannerError('初始化失败：'+(e?.message||e));
    }
  }
  // initial boot
  boot();
  // safety fallback to clear "初始化中..." if anything hangs
  setTimeout(()=>{
    if(!statusBar) return;
    if(statusBar.textContent && /初始化中/.test(statusBar.textContent)){
      bannerOk('请先登录');
    }
  }, 2500);
})();
