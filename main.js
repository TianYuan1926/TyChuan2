// ===== 配置与初始化 =====
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = (s)=>document.querySelector(s);
const statusBar = $("#status");
const buildInfo = $("#build-info");
const authSection = $("#auth-section");
const appSection = $("#app-section");
buildInfo.textContent = `版本: ${cfg.VERSION} | 环境: ${cfg.ENV}`;
function say(msg, ok=true){ statusBar.textContent = msg; statusBar.style.background = ok ? "#122" : "#2a1111"; statusBar.style.color = ok ? "#9fd" : "#f6b"; }

// ---- hCaptcha 稳定渲染逻辑 ----
let captchaWidgets = { login:null, register:null, forgot:null };
let hcaptchaReady = false;
window.hcaptchaOnLoad = function(){ hcaptchaReady = true; initAllCaptchasWithRetry(); };

function renderOneCaptcha(elId, key){
  if(!hcaptchaReady) return null;
  const el = document.getElementById(elId);
  if(!el) return null;
  // 已渲染则 reset
  const current = el.getAttribute("data-widget-id");
  if(current){ try{ window.hcaptcha.reset(current); return current; }catch(e){} }
  // 仅当容器可见且有尺寸时渲染
  const rect = el.getBoundingClientRect();
  if(rect.width === 0 || rect.height === 0){
    return null;
  }
  const id = window.hcaptcha.render(el, { sitekey:key });
  el.setAttribute("data-widget-id", id);
  return id;
}

function initAllCaptchas(){
  captchaWidgets.login = renderOneCaptcha("captcha-login", cfg.HCAPTCHA_SITEKEY) || captchaWidgets.login;
  captchaWidgets.register = renderOneCaptcha("captcha-register", cfg.HCAPTCHA_SITEKEY) || captchaWidgets.register;
  captchaWidgets.forgot = renderOneCaptcha("captcha-forgot", cfg.HCAPTCHA_SITEKEY) || captchaWidgets.forgot;
}

function initAllCaptchasWithRetry(retry=10){
  initAllCaptchas();
  if(retry>0 && (!captchaWidgets.login || !captchaWidgets.register || !captchaWidgets.forgot)){
    // 有任何一个未渲染成功 → 200ms 后重试（处理 Tab 切换/隐藏尺寸为0 的情况）
    setTimeout(()=>initAllCaptchasWithRetry(retry-1), 200);
  }
}

// 切换 Tab 时尝试渲染/重置当前 Tab 的验证码
document.addEventListener("click",(e)=>{
  const btn = e.target.closest(".tab");
  if(!btn) return;
  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".tabpane").forEach(p=>p.classList.remove("show"));
  btn.classList.add("active");
  const pane = document.getElementById("tab-"+btn.dataset.tab);
  if(pane) pane.classList.add("show");
  initAllCaptchasWithRetry();
});

// ---- 页面启动 ----
async function boot(){
  const { data: { user } } = await supabase.auth.getUser();
  if(user){
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    say("已登录。");
  }else{
    appSection.classList.add("hidden");
    authSection.classList.remove("hidden");
    say("请先登录或注册。");
  }
  initAllCaptchasWithRetry();
}
boot();

// 获取 captcha token 的安全方法（根据 widgetId）
function getCaptchaToken(widgetId){
  try{
    if(window.hcaptcha && widgetId!=null){
      const token = window.hcaptcha.getResponse(widgetId);
      return token || "";
    }
  }catch(e){}
  return "";
}

// ===== 登录（带 captcha + 2FA 挑战） =====
const loginForm = $("#login-form");
const mfaChallengeForm = $("#mfa-challenge-form");
let mfaChallengeState = null;
loginForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  if(!email || !password){ say("邮箱/密码不能为空", false); return; }

  const token = getCaptchaToken(captchaWidgets.login);
  if(!token){ say("请先完成验证码。", false); return; }

  say("登录中…");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token } });

  if(error && (error.message||'').toLowerCase().includes("mfa")){
    const factors = (error?.cause?.mfa?.factors) || (data?.mfa?.factors) || [];
    if(!factors.length){ say("需要二步验证，但未找到因子。", false); return; }
    const factorId = factors[0].id;
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if(chErr){ say("发起二步验证失败：" + chErr.message, false); return; }
    mfaChallengeState = { factorId, challengeId: ch.id };
    mfaChallengeForm.classList.remove("hidden");
    say("请输入二步验证码。");
    return;
  }
  if(error){ say("登录失败：" + error.message, false); return; }
  mfaChallengeForm.classList.add("hidden");
  say("登录成功。"); await boot();
});

mfaChallengeForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  if(!mfaChallengeState){ say("没有待验证的挑战。", false); return; }
  const code = $("#mfa-code").value.trim();
  if(!code){ say("请输入验证码。", false); return; }
  const { error } = await supabase.auth.mfa.verify({ factorId: mfaChallengeState.factorId, challengeId: mfaChallengeState.challengeId, code });
  if(error){ say("二步验证失败：" + error.message, false); return; }
  say("登录成功。"); mfaChallengeState = null; await boot();
});

// ===== 注册/忘记密码（带 captcha） =====
$("#register-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#reg-email").value.trim();
  const password = $("#reg-password").value;
  if(!email || !password){ say("请输入邮箱和密码。", false); return; }
  const token = getCaptchaToken(captchaWidgets.register);
  if(!token){ say("请先完成验证码。", false); return; }
  const redirectTo = location.origin + location.pathname;
  say("注册中…");
  const { error } = await supabase.auth.signUp({ email, password, options:{ emailRedirectTo: redirectTo, captchaToken: token } });
  if(error){ say("注册失败：" + error.message, false); return; }
  say("注册成功。若启用邮箱确认，请到邮箱点击确认链接后登录。");
});

$("#forgot-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#forgot-email").value.trim();
  if(!email){ say("请输入邮箱。", false); return; }
  const token = getCaptchaToken(captchaWidgets.forgot);
  if(!token){ say("请先完成验证码。", false); return; }
  const redirectTo = location.origin + location.pathname;
  say("发送重置邮件中…");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
  if(error){ say("发送失败：" + error.message, false); return; }
  say("已发送重置邮件，请查收。");
});

// ===== 登出 =====
$("#logout-btn").addEventListener("click", async ()=>{ await supabase.auth.signOut(); say("已退出登录。"); boot(); });
