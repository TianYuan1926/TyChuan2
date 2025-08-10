
// P8 rollback base - stable auth gating + hCaptcha + magic link + verify resend
const cfg = window.APP_CONFIG||{};
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth:{ persistSession:true, autoRefreshToken:true }});
const $ = s=>document.querySelector(s);
const statusBar = $("#status");
function say(msg, ok=true, ms=1500){ if(!statusBar) return; statusBar.textContent=msg; statusBar.style.background= ok?'#122':'#2a1111'; statusBar.style.color=ok?'#9fd':'#f6b'; if(ms){ setTimeout(()=>statusBar.textContent='', ms); }}

// tabs
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tabpane").forEach(p=>p.classList.remove("show"));
    btn.classList.add("active");
    $("#tab-"+btn.dataset.tab).classList.add("show");
    setTimeout(renderCaptchas, 80);
  });
});

// hCaptcha explicit
let widgetIds={}, hLoaded=false;
window.hcaptchaOnLoad=()=>{ hLoaded=true; renderCaptchas(); };
function renderOne(id){
  const el=document.getElementById(id); if(!el) return;
  if(!hLoaded||!window.hcaptcha){ setTimeout(()=>renderOne(id),120); return; }
  if(el.offsetParent===null || el.clientHeight===0){ setTimeout(()=>renderOne(id),120); return; }
  if(widgetIds[id]!==undefined){ try{window.hcaptcha.reset(widgetIds[id]);}catch{} return; }
  if(cfg.HCAPTCHA_SITEKEY) el.setAttribute('data-sitekey', cfg.HCAPTCHA_SITEKEY);
  widgetIds[id]=window.hcaptcha.render(id);
}
function renderCaptchas(){ ['captcha-login','captcha-register','captcha-forgot'].forEach(renderOne); }
function tokenOf(id){ if(!hLoaded||!window.hcaptcha) return ''; const wid=widgetIds[id]; if(wid===undefined) return ''; return window.hcaptcha.getResponse(wid)||''; }

// boot
async function boot(){
  const { data:{ user } } = await supabase.auth.getUser();
  if(user){ $("#auth-section").classList.add("hidden"); $("#app-section").classList.remove("hidden"); $("#user-email").textContent=user.email||''; }
  else { $("#app-section").classList.add("hidden"); $("#auth-section").classList.remove("hidden"); }
  setTimeout(renderCaptchas, 100);
  say(user?'已登录':'请先登录');
}
setTimeout(boot, 50);
supabase.auth.onAuthStateChange((ev)=>{ if(ev==='SIGNED_IN'){ boot(); } if(ev==='SIGNED_OUT'){ boot(); } });

// login
$("#login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const token=tokenOf('captcha-login'); if(!token) return say('请先完成验证码', false, 2000);
  const email=$("#login-email").value.trim(); const password=$("#login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token }});
  if(error) return say('登录失败：'+error.message, false, 3000);
  say('登录成功'); boot();
});

// magic link
document.getElementById('btn-magic').addEventListener('click', async ()=>{
  const email = prompt("输入邮箱（将发送登录链接）"); if(!email) return;
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase.auth.signInWithOtp({ email, options:{ emailRedirectTo: redirectTo }});
  if(error) return say('发送失败：'+error.message, false, 3000);
  say('已发送登录链接，请查收');
});

// register
$("#register-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const token=tokenOf('captcha-register'); if(!token) return say('请先完成验证码', false, 2000);
  const email=$("#reg-email").value.trim();
  const p1=$("#reg-password").value, p2=$("#reg-password2").value;
  if(p1!==p2) return say('两次密码不一致', false, 2000);
  const redirectTo=location.origin+location.pathname;
  const { error } = await supabase.auth.signUp({ email, password:p1, options:{ emailRedirectTo: redirectTo, captchaToken: token }});
  if(error) return say('注册失败：'+error.message, false, 3000);
  say('注册成功，请到邮箱完成验证后再登录。', true, 3000);
});

// forgot
$("#forgot-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const token=tokenOf('captcha-forgot'); if(!token) return say('请先完成验证码', false, 2000);
  const email=$("#forgot-email").value.trim();
  const redirectTo=location.origin+location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
  if(error) return say('发送失败：'+error.message, false, 3000);
  say('已发送重置邮件，请查收。', true, 2000);
});

// verify banner + resend
function setupResend(email){
  const btn=$("#resend-btn"), tip=$("#resend-tip"); if(!btn) return;
  let remain = parseInt(localStorage.getItem("tj_resend_cooldown")||"0",10);
  const tick = ()=>{
    if(remain>0){ btn.disabled=true; tip.textContent=`${remain}s 后可再次发送`; remain--; localStorage.setItem("tj_resend_cooldown", remain); setTimeout(tick,1000); }
    else { btn.disabled=false; tip.textContent=''; localStorage.removeItem("tj_resend_cooldown"); }
  };
  tick();
  btn.onclick = async ()=>{
    if(btn.disabled) return;
    try{
      const { data:{ user } } = await supabase.auth.getUser(); const email=user?.email;
      const { error } = await supabase.auth.resend({ type:'signup', email, options:{ emailRedirectTo: location.origin+location.pathname }});
      if(error) throw error;
      say('已发送验证邮件，请查收'); remain=60; tick();
    }catch(err){ say('发送失败：'+err.message, false, 3000); }
  };
}

document.getElementById('logout-btn').addEventListener('click', async ()=>{
  await supabase.auth.signOut(); say('已退出'); boot();
});

// compute amount
['qty','price','fee'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('input', ()=>{
    const q=parseFloat($("#qty").value)||0, p=parseFloat($("#price").value)||0, f=parseFloat($("#fee").value)||0;
    const out=$("#amount"); if(out) out.value = (q*p+f)||'';
  });
});
