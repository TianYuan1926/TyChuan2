
/**
 * P10-AuthNavFinal
 * - 不改 HTML/CSS/后端
 * - 修复：登录后仍停在登录页、侧栏“日志/安全”点击无响应
 * - 保持：hCaptcha 显式渲染、未登录不报错的状态条
 */

(function () {
  const cfg = (window.APP_CONFIG || {});
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  // ---------- DOM helpers ----------
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const byId = (id)=>document.getElementById(id);
  const hasText = (el, words)=>{
    const t = (el.innerText || el.textContent || '').trim();
    return words.some(w=> t.includes(w));
  };

  // ---------- Status Banner (quiet) ----------
  const statusBar = byId("status");
  function banner(msg, ok=true){
    if(!statusBar) return;
    statusBar.textContent = msg;
    statusBar.style.background = ok ? '#122' : '#2a1111';
    statusBar.style.color = ok ? '#9fd' : '#f6b';
  }
  function bannerQuiet(msg){
    banner(msg,true);
    // 1.5s 后淡出（不影响后续 toast）
    setTimeout(()=>{
      if(!statusBar) return;
      statusBar.style.transition = "opacity .35s ease";
      statusBar.style.opacity = "0";
      setTimeout(()=>{ if(statusBar){ statusBar.textContent=''; statusBar.style.opacity='1'; statusBar.style.transition=''; } }, 450);
    }, 1500);
  }

  // ---------- Sections & Panels ----------
  const authSection = byId('auth-section');
  const appSection  = byId('app-section');
  function showAuth(){
    if(appSection) appSection.classList.add('hidden');
    if(authSection) authSection.classList.remove('hidden');
    bannerQuiet('请先登录');
  }
  function showApp(){
    if(authSection) authSection.classList.add('hidden');
    if(appSection) appSection.classList.remove('hidden');
    bannerQuiet('已登录');
  }

  // 多种选择器兼容：journal/security 面板
  const journalSelectors = ['#panel-journal','#journal','[data-view-panel="journal"]','[data-panel="journal"]','#tab-journal'];
  const securitySelectors = ['#panel-security','#security','[data-view-panel="security"]','[data-panel="security"]','#tab-security'];
  function firstExisting(selList){
    for(const sel of selList){
      const el = $(sel);
      if(el) return el;
    }
    return null;
  }
  function switchPanel(name){
    const isJournal = (name === 'journal');
    const journal = firstExisting(journalSelectors);
    const security = firstExisting(securitySelectors);
    if(!journal && !security) return; // 沉默失败，不影响其他逻辑

    // 隐藏所有可能面板
    [...new Set([...journalSelectors, ...securitySelectors])]
      .forEach(sel=> $$(sel).forEach(el=> el.classList.add('hidden')));

    if(isJournal && journal) journal.classList.remove('hidden');
    if(!isJournal && security) security.classList.remove('hidden');
    try{ localStorage.setItem('tj_last_panel', isJournal?'journal':'security'); }catch{}
  }

  // ---------- Tabs (login/register/forgot) 显示策略：默认只显示登录 ----------
  function activateAuthTab(tab){ // 'login'|'register'|'forgot'|'mfa'
    $$('.tab').forEach(b=>b.classList.remove('active'));
    $$('.tabpane').forEach(p=>p.classList.remove('show'));
    const btn = $(`.tab[data-tab="${tab}"]`);
    const pane = byId(`tab-${tab}`);
    if(btn) btn.classList.add('active');
    if(pane) pane.classList.add('show');
    // 切换后确保 captcha 渲染
    setTimeout(renderCaptchas, 80);
  }
  // 隐藏顶部 tab 按钮，改为底部小字切换（不改 HTML 结构，仅控制显示）
  function installAuthLinks(){
    const loginPane = byId('tab-login');
    const registerPane = byId('tab-register');
    if(loginPane && !loginPane.querySelector('.swap-to-register')){
      const p = document.createElement('p');
      p.className = 'muted small swap-to-register';
      p.style.marginTop = '8px';
      p.innerHTML = '没有账号？<a href="#" id="go-register">去注册</a>';
      loginPane.appendChild(p);
    }
    if(registerPane && !registerPane.querySelector('.swap-to-login')){
      const p = document.createElement('p');
      p.className = 'muted small swap-to-login';
      p.style.marginTop = '8px';
      p.innerHTML = '已有账号？<a href="#" id="go-login">去登录</a>';
      registerPane.appendChild(p);
    }
  }

  // ---------- hCaptcha 显式渲染（保持现有 SiteKey 用法） ----------
  const HKEY = (cfg && cfg.HCAPTCHA_SITEKEY) || '';
  let widgetIds = {}, hLoaded = false;
  window.hcaptchaOnLoad = function(){
    hLoaded = true;
    renderCaptchas();
  };
  function renderOne(id){
    // 只在可见时渲染；已渲染则 reset
    if(!hLoaded || !window.hcaptcha) return;
    const el = byId(id);
    if(!el) return;
    if(el.offsetParent === null || el.clientHeight === 0){
      setTimeout(()=>renderOne(id), 120);
      return;
    }
    el.setAttribute('data-sitekey', HKEY);
    if(widgetIds[id] != null){
      try { window.hcaptcha.reset(widgetIds[id]); } catch {}
      return;
    }
    try{
      widgetIds[id] = window.hcaptcha.render(id);
    }catch{ /* ignore */ }
  }
  function renderCaptchas(){
    ['captcha-login','captcha-register','captcha-forgot'].forEach(renderOne);
  }

  // ---------- Auth flows ----------
  async function boot(){
    try{
      const { data: { user } } = await supabase.auth.getUser();
      if(user){
        showApp();
        // 打开最近一次面板（默认 journal）
        let last = 'journal';
        try{ last = localStorage.getItem('tj_last_panel') || 'journal'; }catch{}
        switchPanel(last);
      }else{
        showAuth();
        activateAuthTab('login');
      }
    }catch(e){
      // 真异常才报红
      banner('初始化失败：'+(e.message||'未知'), false);
    }
  }

  // Auth 状态监听 + 兜底轮询
  supabase.auth.onAuthStateChange((ev, session)=>{
    if(ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED'){
      showApp();
      switchPanel('journal');
    }
    if(ev === 'SIGNED_OUT'){
      showAuth();
      activateAuthTab('login');
    }
  });
  // 兜底：短暂轮询，确保登录后一定切换
  (function ensureBootAfterSignIn(){
    let tries = 0;
    const t = setInterval(async ()=>{
      tries++;
      const { data: { user } } = await supabase.auth.getUser();
      if(user){ clearInterval(t); showApp(); switchPanel('journal'); }
      if(tries > 10) clearInterval(t); // 最多约15秒
    }, 1500);
  })();

  // ---------- Global Click Delegation ----------
  document.addEventListener('click', (e)=>{
    const a = e.target.closest('a,button,[role="button"],.tab,[data-nav],[data-view],[data-panel]');
    if(!a) return;

    // 认证区切换（小链接）
    if(a.id === 'go-register'){ e.preventDefault(); activateAuthTab('register'); return; }
    if(a.id === 'go-login'){ e.preventDefault(); activateAuthTab('login'); return; }

    // 顶部 tab（如果仍保留）
    if(a.classList.contains('tab') && a.dataset.tab){
      e.preventDefault();
      activateAuthTab(a.dataset.tab);
      return;
    }

    // 侧栏导航：日志/安全
    const navKey = (a.getAttribute('data-view') || a.getAttribute('data-panel') || a.id || '').toLowerCase();
    let targetName = null;
    if(navKey.includes('journal')) targetName = 'journal';
    else if(navKey.includes('security') || navKey.includes('safe')) targetName = 'security';
    else if(hasText(a, ['日志'])) targetName = 'journal';
    else if(hasText(a, ['安全'])) targetName = 'security';

    if(targetName){
      e.preventDefault();
      // 未登录不允许切换业务面板
      supabase.auth.getUser().then(({data:{user}})=>{
        if(!user){ bannerQuiet('请先登录'); activateAuthTab('login'); return; }
        switchPanel(targetName);
      });
    }
  });

  // ---------- Forms (登录/注册/忘记) ----------
  function captchaToken(id){
    if(!hLoaded || !window.hcaptcha || widgetIds[id]==null) return '';
    return window.hcaptcha.getResponse(widgetIds[id]);
  }

  const loginForm = byId('login-form');
  if(loginForm){
    loginForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const token = captchaToken('captcha-login');
      if(!token){ banner('请先完成验证码', false); return; }
      const email = byId('login-email')?.value?.trim();
      const password = byId('login-password')?.value;
      const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token } });
      if(error){ banner('登录失败：'+error.message, false); return; }
      // 立即切换，另有 onAuthStateChange/轮询双保险
      showApp(); switchPanel('journal');
    });
  }

  const regForm = byId('register-form');
  if(regForm){
    regForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const token = captchaToken('captcha-register');
      if(!token){ banner('请先完成验证码', false); return; }
      const email = byId('reg-email')?.value?.trim();
      const p1 = byId('reg-password')?.value;
      const p2 = byId('reg-password2')?.value;
      if(p1 !== p2){ banner('两次密码不一致', false); return; }
      const redirectTo = location.origin + location.pathname;
      const { error } = await supabase.auth.signUp({ email, password: p1, options:{ emailRedirectTo: redirectTo, captchaToken: token } });
      if(error){ banner('注册失败：'+error.message, false); return; }
      bannerQuiet('注册成功，请到邮箱完成验证');
      activateAuthTab('login');
    });
  }

  const forgotForm = byId('forgot-form');
  if(forgotForm){
    forgotForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const token = captchaToken('captcha-forgot');
      if(!token){ banner('请先完成验证码', false); return; }
      const email = byId('forgot-email')?.value?.trim();
      const redirectTo = location.origin + location.pathname;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
      if(error){ banner('发送失败：'+error.message, false); return; }
      bannerQuiet('已发送重置密码邮件');
    });
  }

  // ---------- Kickoff ----------
  // 初始默认显示登录（未登录）
  activateAuthTab('login');
  installAuthLinks();

  // Captcha onload handled by global callback; add timeout fallback
  setTimeout(()=>{ if(!hLoaded) renderCaptchas(); }, 1200);

  // 初始 quiet 提示；2.5s 兜底从“初始化中”切换
  setTimeout(()=>{
    bannerQuiet('请先登录');
  }, 2500);

  // 首次启动
  boot();
})();
