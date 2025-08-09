
// Quiet init banner + hCaptcha restore (P9c)
(function(){
  const cfg = window.APP_CONFIG || {};
  const $ = (s)=>document.querySelector(s);
  const statusBar = document.getElementById('status');

  function banner(msg, type='info'){
    if(!statusBar) return;
    statusBar.textContent = msg;
    statusBar.style.background = type==='error' ? '#2a1111' : '#122';
    statusBar.style.color = type==='error' ? '#f6b' : '#9fd';
  }
  function bannerOk(msg){ banner(msg||'就绪'); setTimeout(()=>{ if(statusBar){ statusBar.style.opacity='0.0'; } }, 1500); }
  function bannerErr(msg){ banner(msg||'出错', 'error'); }

  // Guard: need config and supabase
  if(!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY){
    bannerErr('配置未就绪（缺少 config/config.js）'); return;
  }
  if(!(window.supabase && window.supabase.createClient)){
    bannerErr('SDK 未加载'); return;
  }

  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  // ---------- hCaptcha: stable explicit rendering ----------
  let widgetIds = {}, hLoaded = false;
  window.hcaptchaOnLoad = function(){ hLoaded = true; renderCaptchas(); };
  function renderOne(id){
    const el = document.getElementById(id);
    if(!el) return;
    if(!hLoaded || !window.hcaptcha){
      // try again later
      setTimeout(()=>renderOne(id), 250);
      return;
    }
    // if already rendered, reset to keep it alive across tab switches
    if(widgetIds[id] !== undefined){
      try{ window.hcaptcha.reset(widgetIds[id]); }catch(e){}
      return;
    }
    // ensure sitekey present
    el.setAttribute('data-sitekey', cfg.HCAPTCHA_SITEKEY || '');
    // avoid rendering on hidden pane
    if(el.offsetParent === null || el.clientHeight === 0){
      setTimeout(()=>renderOne(id), 250);
      return;
    }
    try{
      widgetIds[id] = window.hcaptcha.render(id, {});
    }catch(e){
      // try once more
      setTimeout(()=>{
        try{ widgetIds[id] = window.hcaptcha.render(id, {});}catch(_){}
      }, 300);
    }
  }
  function renderCaptchas(){
    ['captcha-login','captcha-register','captcha-forgot'].forEach(renderOne);
  }
  // re-render on tab click
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=> setTimeout(renderCaptchas, 50));
  });

  // ---------- Auth forms (require captcha token) ----------
  const loginForm = document.getElementById('login-form');
  if(loginForm){
    loginForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const wid = widgetIds['captcha-login'];
      const token = (hLoaded && window.hcaptcha) ? window.hcaptcha.getResponse(wid) : '';
      if(!token){ banner('请先完成验证码', 'error'); return; }
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token } });
      if(error){ bannerErr('登录失败：'+error.message); return; }
      bannerOk('登录成功'); boot();
    });
  }

  const regForm = document.getElementById('register-form');
  if(regForm){
    regForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const wid = widgetIds['captcha-register'];
      const token = (hLoaded && window.hcaptcha) ? window.hcaptcha.getResponse(wid) : '';
      if(!token){ banner('请先完成验证码', 'error'); return; }
      const email = document.getElementById('reg-email').value.trim();
      const p1 = document.getElementById('reg-password').value;
      const p2 = document.getElementById('reg-password2').value;
      if(p1!==p2){ bannerErr('两次密码不一致'); return; }
      const redirectTo = location.origin + location.pathname;
      const { error } = await supabase.auth.signUp({ email, password: p1, options:{ emailRedirectTo: redirectTo, captchaToken: token } });
      if(error){ bannerErr('注册失败：'+error.message); return; }
      bannerOk('注册成功，请到邮箱验证');
    });
  }

  const forgotForm = document.getElementById('forgot-form');
  if(forgotForm){
    forgotForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const wid = widgetIds['captcha-forgot'];
      const token = (hLoaded && window.hcaptcha) ? window.hcaptcha.getResponse(wid) : '';
      if(!token){ banner('请先完成验证码', 'error'); return; }
      const email = document.getElementById('forgot-email').value.trim();
      const redirectTo = location.origin + location.pathname;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
      if(error){ bannerErr('发送失败：'+error.message); return; }
      bannerOk('已发送重置邮件');
    });
  }

  // ---------- Boot: quiet when not logged in ----------
  async function boot(){
    const { data:{ user }, error } = await supabase.auth.getUser();
    const authSec = document.getElementById('auth-section');
    const appSec = document.getElementById('app-section');
    if(user){
      if(authSec) authSec.classList.add('hidden');
      if(appSec) appSec.classList.remove('hidden');
      bannerOk('已登录');
    }else{
      if(appSec) appSec.classList.add('hidden');
      if(authSec) authSec.classList.remove('hidden');
      bannerOk('请先登录');
    }
  }
  // initial render captcha soon
  setTimeout(renderCaptchas, 100);
  boot();
})();
