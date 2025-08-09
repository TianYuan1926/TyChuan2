
/*! P9h Integrated Fix: init banner quiet + stable hCaptcha + tab & sidebar click fix
   - Zero side effects: HTML/CSS and backend untouched
   - Works with pages where auth/app sections exist and optional sidebar items (日志/安全)
*/
(function(){
  const cfg = window.APP_CONFIG || {};
  // Create client with robust options
  const supabase = window.supabase?.createClient
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
      })
    : null;

  const $ = (s,scope=document)=>scope.querySelector(s);
  const $$ = (s,scope=document)=>Array.from(scope.querySelectorAll(s));
  const statusBar = $("#status");

  function bannerSet(msg, type="info"){
    if(!statusBar) return;
    statusBar.textContent = msg;
    if(type==="error"){ statusBar.style.background="#2a1111"; statusBar.style.color="#f6b"; }
    else { statusBar.style.background="#122"; statusBar.style.color="#9fd"; }
  }
  function bannerOk(msg){ bannerSet(msg,"info"); clearTimeout(bannerOk._t); bannerOk._t=setTimeout(()=>{ if(statusBar) statusBar.style.display="none"; },1500); }
  function bannerErr(msg){ bannerSet(msg,"error"); }

  // --- Auth guard: show only auth or app
  async function boot(){
    if(!supabase){ bannerErr("配置未就绪"); return; }
    const { data:{ user }, error } = await supabase.auth.getUser();
    const authSec = $("#auth-section");
    const appSec  = $("#app-section");
    if(user){
      if(authSec) authSec.classList.add("hidden");
      if(appSec)  appSec.classList.remove("hidden");
      bannerOk("已登录");
      // after login, ensure default panel
      ensureSidebar();
    }else{
      if(appSec)  appSec.classList.add("hidden");
      if(authSec) authSec.classList.remove("hidden");
      bannerOk("请先登录");
      // default to login view
      activateAuthView("login");
    }
  }

  // -------- hCaptcha (explicit) ----------
  let hLoaded=false, widgetIds={};
  window.hcaptchaOnLoad = function(){ hLoaded=true; renderCaptchas(); };
  function renderOne(id){
    const el = document.getElementById(id);
    if(!el || !hLoaded || !window.hcaptcha) return;
    // avoid rendering when hidden
    if(el.offsetParent===null || el.clientHeight===0){ setTimeout(()=>renderOne(id),80); return; }
    if(widgetIds[id]!=null){ try{ window.hcaptcha.reset(widgetIds[id]); }catch(e){} return; }
    el.setAttribute("data-sitekey", (cfg && cfg.HCAPTCHA_SITEKEY) || "");
    try{ widgetIds[id] = window.hcaptcha.render(id); }catch(e){}
  }
  function renderCaptchas(){
    ["captcha-login","captcha-register","captcha-forgot"].forEach(renderOne);
  }
  // Fallback: if onload never fires (cache/network), try delayed attempts
  setTimeout(()=>{ if(!hLoaded) renderCaptchas(); }, 1200);

  // -------- Auth forms submit (must complete captcha) ----
  function getCaptchaToken(id){
    if(!hLoaded || !window.hcaptcha || widgetIds[id]==null) return "";
    try{ return window.hcaptcha.getResponse(widgetIds[id]) || ""; }catch(e){ return ""; }
  }
  const on = (el,ev,sel,fn)=>{
    el.addEventListener(ev, e=>{
      const t = e.target.closest(sel);
      if(t) fn(e,t);
    });
  };
  // Tabs: but hide the tab buttons visually if exist; we route via small links.
  on(document,"click",".tab", (e,btn)=>{
    const tab = btn.getAttribute("data-tab"); if(!tab) return;
    switchAuthTab(tab);
  });

  function switchAuthTab(tab){
    $$(".tab").forEach(b=>b.classList.toggle("active", b.getAttribute("data-tab")===tab));
    $$(".tabpane").forEach(p=>p.classList.toggle("show", p.id === "tab-"+tab));
    // after switch, render captcha for visible pane
    setTimeout(renderCaptchas, 80);
  }
  function activateAuthView(tab="login"){
    // Hide tab buttons if design requires only one visible at a time
    // (do not change DOM structure; only switch the pane)
    switchAuthTab(tab);
    // Inject small toggle links if not exist
    ensureAuthLinks();
  }
  function ensureAuthLinks(){
    // login -> small "去注册"; register -> "去登录"
    const loginPane = $("#tab-login");
    const regPane   = $("#tab-register");
    if(loginPane && !loginPane.querySelector(".to-register")){
      const a=document.createElement("div");
      a.className="muted small to-register"; a.style.marginTop="6px";
      a.innerHTML = '没有账号？<a href="#" data-switch-auth="register">去注册</a>';
      loginPane.appendChild(a);
    }
    if(regPane && !regPane.querySelector(".to-login")){
      const a=document.createElement("div");
      a.className="muted small to-login"; a.style.marginTop="6px";
      a.innerHTML = '已有账号？<a href="#" data-switch-auth="login">去登录</a>';
      regPane.appendChild(a);
    }
  }
  on(document,"click",'[data-switch-auth]', (e,a)=>{
    e.preventDefault();
    const tab=a.getAttribute("data-switch-auth"); activateAuthView(tab);
  });

  // Form submits
  const loginForm   = $("#login-form");
  const regForm     = $("#register-form");
  const forgotForm  = $("#forgot-form");

  if(loginForm){
    loginForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const tok = getCaptchaToken("captcha-login"); if(!tok){ bannerErr("请先完成验证码"); return; }
      const email = $("#login-email")?.value?.trim(); const password = $("#login-password")?.value||"";
      try{
        const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: tok }});
        if(error) throw error; bannerOk("登录成功"); boot();
      }catch(err){ bannerErr("登录失败："+(err?.message||"")); }
    });
  }
  if(regForm){
    regForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const tok = getCaptchaToken("captcha-register"); if(!tok){ bannerErr("请先完成验证码"); return; }
      const email = $("#reg-email")?.value?.trim();
      const p1 = $("#reg-password")?.value||"", p2=$("#reg-password2")?.value||"";
      if(p1!==p2){ bannerErr("两次密码不一致"); return; }
      try{
        const redirectTo = location.origin + location.pathname;
        const { error } = await supabase.auth.signUp({ email, password: p1, options:{ emailRedirectTo: redirectTo, captchaToken: tok } });
        if(error) throw error; bannerOk("注册成功，请到邮箱完成验证");
        activateAuthView("login");
      }catch(err){ bannerErr("注册失败："+(err?.message||"")); }
    });
  }
  if(forgotForm){
    forgotForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const tok = getCaptchaToken("captcha-forgot"); if(!tok){ bannerErr("请先完成验证码"); return; }
      const email = $("#forgot-email")?.value?.trim();
      try{
        const redirectTo = location.origin + location.pathname;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: tok });
        if(error) throw error; bannerOk("重置邮件已发送");
      }catch(err){ bannerErr("发送失败："+(err?.message||"")); }
    });
  }

  // -------- Sidebar navigation fix (日志 / 安全) ----------
  function ensureSidebar(){
    // attach once
    if(ensureSidebar._bound) return; ensureSidebar._bound=true;
    document.addEventListener("click", async (e)=>{
      const item = e.target.closest('[data-nav],[data-view],[data-panel],.sidebar-item');
      if(!item) return;
      // Must be logged in to switch
      const { data:{ user } } = await supabase.auth.getUser();
      if(!user){ bannerOk("请先登录"); activateAuthView("login"); return; }
      const text = (item.getAttribute("data-nav")||item.getAttribute("data-view")||item.getAttribute("data-panel")||item.textContent||"").trim();
      let key="";
      if(/日志|journal|log/i.test(text)) key="journal";
      if(/安全|security/i.test(text)) key="security";
      if(!key) return;
      showPanel(key);
    });
  }
  function showPanel(key){
    const map = {
      journal: ['#panel-journal','#journal','[data-view-panel="journal"]'],
      security:['#panel-security','#security','[data-view-panel="security"]']
    };
    Object.keys(map).forEach(k=>{
      const selList = map[k];
      let shown=false;
      selList.forEach(sel=>{
        $$(sel).forEach(el=>{
          el.classList.toggle("hidden", k!==key);
          if(k===key) shown=true;
        });
      });
      // tables or contents might need refresh when shown: emit custom event
      if(shown && k===key){
        document.dispatchEvent(new CustomEvent("panel:shown",{detail:{key}}));
      }
    });
  }

  // ---- Initial flow ----
  // default to login view initially
  activateAuthView("login");
  // Boot after a short delay to allow config load
  setTimeout(()=>boot(), 50);
  // Safety fallback for status banner
  setTimeout(()=>{ if(statusBar && statusBar.textContent.includes("初始化")) bannerOk("请先登录"); }, 2500);
})();
