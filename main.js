
/* P9f – Auth UI Plan A (Login-first, no simultaneous forms)
 * - Hide tab buttons; show only one form at a time (default: login)
 * - Footer link to switch between login <-> register
 * - Keep forgot/MFA accessible via small links but not co-displayed
 * - hCaptcha explicit render per visible form
 * - Auth guard: app only after login
 */
(function(){
  const cfg = window.APP_CONFIG || {};
  const supabase = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession:true, autoRefreshToken:true } })
    : null;

  const $ = (s)=>document.querySelector(s);
  const statusBar = $("#status");

  function say(msg, ok=true){
    if(!statusBar) return;
    statusBar.textContent = msg;
    statusBar.style.background = ok ? '#122' : '#2a1111';
    statusBar.style.color = ok ? '#9fd' : '#f6b';
    // auto hide gentle
    clearTimeout(say._t);
    say._t = setTimeout(()=>{ statusBar.style.opacity='0.9'; }, 800);
  }

  // --- Auth-only app guard ---
  async function boot(){
    if(!supabase){ say('配置未就绪（缺少 Supabase）', false); return; }
    const { data:{ user }} = await supabase.auth.getUser();
    const authSec = $("#auth-section"), appSec = $("#app-section");
    if(user){
      if(authSec) authSec.classList.add("hidden");
      if(appSec) appSec.classList.remove("hidden");
      const emailEl = $("#user-email"); if(emailEl) emailEl.textContent = user.email || '';
      const unverified = !user.email_confirmed_at;
      const vb = $("#verify-banner"); if(vb) vb.classList.toggle("hidden", !unverified);
      say('已登录');
    }else{
      if(appSec) appSec.classList.add("hidden");
      if(authSec) authSec.classList.remove("hidden");
      showPane('login'); // enforce login-first
      say('请先登录');
    }
  }

  // ---- Plan A: login-only visible; small link to switch ----
  const tabsBar = document.querySelector("#auth-section .tabs");
  const panes = {
    login: $("#tab-login"),
    register: $("#tab-register"),
    forgot: $("#tab-forgot"),
    mfa: $("#tab-mfa")
  };

  function ensureSwitchLinks(){
    // Hide the original tab buttons
    if(tabsBar){ tabsBar.style.display = 'none'; }

    // Inject switch footer beneath forms if not present
    // Login footer
    if(panes.login && !panes.login.querySelector('.switch-footer')){
      const div = document.createElement('div');
      div.className = 'switch-footer muted small';
      div.style.marginTop = '8px';
      div.innerHTML = `没有账号？<a href="#" id="lnk-to-register">去注册</a>`;
      panes.login.appendChild(div);
      div.querySelector('#lnk-to-register').addEventListener('click', (e)=>{ e.preventDefault(); showPane('register'); });
    }
    // Register footer
    if(panes.register && !panes.register.querySelector('.switch-footer')){
      const div = document.createElement('div');
      div.className = 'switch-footer muted small';
      div.style.marginTop = '8px';
      div.innerHTML = `已有账号？<a href="#" id="lnk-to-login">去登录</a>`;
      panes.register.appendChild(div);
      div.querySelector('#lnk-to-login').addEventListener('click', (e)=>{ e.preventDefault(); showPane('login'); });
    }
  }

  // ---- hCaptcha explicit render (per visible pane) ----
  let hLoaded = false, widgetIds = {};
  window.hcaptchaOnLoad = function(){
    hLoaded = true;
    renderVisibleCaptcha();
  };

  function resetAllCaptchas(){
    if(!window.hcaptcha || !hLoaded) return;
    for(const k in widgetIds){
      try{ window.hcaptcha.reset(widgetIds[k]); }catch{}
    }
  }
  function renderOne(id){
    const el = document.getElementById(id);
    if(!el) return;
    const visible = !!(el.offsetParent || el.getClientRects().length);
    if(!visible) return; // render only if visible
    if(widgetIds[id]!==undefined){
      try{ window.hcaptcha.reset(widgetIds[id]); }catch{}
      return;
    }
    el.setAttribute('data-sitekey', (cfg && cfg.HCAPTCHA_SITEKEY) || '');
    widgetIds[id] = window.hcaptcha.render(id);
  }
  function renderVisibleCaptcha(){
    if(!window.hcaptcha || !hLoaded) return;
    // render only the visible pane's captcha
    ['captcha-login','captcha-register','captcha-forgot'].forEach(id=>renderOne(id));
  }

  function showPane(name){
    // hide all
    Object.values(panes).forEach(p=>{ if(p){ p.classList.remove('show'); p.style.display='none'; } });
    // show chosen
    const p = panes[name];
    if(p){ p.style.display='block'; p.classList.add('show'); }

    // after DOM visible, (re)render captcha for this pane only
    setTimeout(()=>{
      if(window.hcaptcha){ renderVisibleCaptcha(); }
    }, 80);

    // focus first input
    const first = p && p.querySelector('input,select,button');
    if(first) try{ first.focus(); }catch{}
  }

  // --- Event handling: submit handlers ---
  function getCaptcha(id){
    try{
      if(!hLoaded || !window.hcaptcha) return '';
      const wid = widgetIds[id];
      if(wid===undefined) return '';
      return window.hcaptcha.getResponse(wid) || '';
    }catch{ return ''; }
  }

  // Login submit
  const loginForm = $("#login-form");
  if(loginForm){
    loginForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const token = getCaptcha('captcha-login');
      if(!token) return say('请先完成验证码', false);
      const email = $("#login-email").value.trim();
      const password = $("#login-password").value;
      const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token }});
      if(error) return say('登录失败：'+error.message, false);
      say('登录成功');
      boot();
    });
  }

  // Register submit
  const regForm = $("#register-form");
  if(regForm){
    regForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const token = getCaptcha('captcha-register');
      if(!token) return say('请先完成验证码', false);
      const email = $("#reg-email").value.trim();
      const p1 = $("#reg-password").value;
      const p2 = $("#reg-password2").value;
      if(p1 !== p2) return say('两次密码不一致', false);
      const redirectTo = location.origin + location.pathname;
      const { error } = await supabase.auth.signUp({ email, password: p1, options:{ emailRedirectTo: redirectTo, captchaToken: token }});
      if(error) return say('注册失败：'+error.message, false);
      say('注册成功，去邮箱完成验证');
      showPane('login');
    });
  }

  // Forgot submit
  const forgotForm = $("#forgot-form");
  if(forgotForm){
    forgotForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const token = getCaptcha('captcha-forgot');
      if(!token) return say('请先完成验证码', false);
      const email = $("#forgot-email").value.trim();
      const redirectTo = location.origin + location.pathname;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
      if(error) return say('发送失败：'+error.message, false);
      say('已发送重置邮件');
      showPane('login');
    });
  }

  // Logout
  const logoutBtn = $("#logout-btn");
  if(logoutBtn){
    logoutBtn.addEventListener('click', async ()=>{
      await supabase.auth.signOut();
      say('已退出');
      boot();
    });
  }

  // Initial
  ensureSwitchLinks();
  showPane('login'); // default
  boot();

  // Fallback: if still "初始化中..." after 3s, replace
  setTimeout(()=>{
    if(statusBar && /初始化中/.test(statusBar.textContent||'')) say('请先登录');
  }, 3000);

  // Expose for debug
  window.__AuthUIPlanA = { showPane, renderVisibleCaptcha };
})();
