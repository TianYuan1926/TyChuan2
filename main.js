
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = (s)=>document.querySelector(s);
const statusBar = $("#status");
const buildInfo = $("#build-info");
buildInfo.textContent = `版本: ${cfg.VERSION} | 环境: ${cfg.ENV}`;

function say(msg, ok=true){ statusBar.textContent=msg; statusBar.style.background= ok?'#122':'#2a1111'; statusBar.style.color=ok?'#9fd':'#f6b'; }

// tabs
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tabpane").forEach(p=>p.classList.remove("show"));
    btn.classList.add("active");
    $("#tab-"+btn.dataset.tab).classList.add("show");
    setTimeout(renderCaptchas,0);
  });
});

// hCaptcha 显式渲染
let widgetIds={}, hLoaded=false;
window.hcaptchaOnLoad = ()=>{ hLoaded=true; renderCaptchas(); };
function renderOne(id){
  if(!hLoaded||!window.hcaptcha) return;
  const el=document.getElementById(id); if(!el) return;
  if(widgetIds[id]!==undefined){ try{window.hcaptcha.reset(widgetIds[id]);}catch{} return; }
  if(el.offsetParent===null || el.clientHeight===0){ setTimeout(()=>renderOne(id),200); return; }
  el.setAttribute('data-sitekey', cfg.HCAPTCHA_SITEKEY||'');
  widgetIds[id]=window.hcaptcha.render(id);
}
function renderCaptchas(){ ['captcha-login','captcha-register','captcha-forgot'].forEach(renderOne); }

// 登录
$("#login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  let token=hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-login']):'';
  if(!token) return say('请先完成验证码', false);
  const email=$("#login-email").value.trim();
  const password=$("#login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token }});
  if(error) return say('登录失败：'+error.message, false);
  say('登录成功'); boot();
});

// 注册
$("#register-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  let token=hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-register']):'';
  if(!token) return say('请先完成验证码', false);
  const email=$("#reg-email").value.trim();
  const p1=$("#reg-password").value, p2=$("#reg-password2").value;
  if(p1!==p2) return say('两次密码不一致', false);
  const redirectTo=location.origin+location.pathname;
  const { error } = await supabase.auth.signUp({ email, password:p1, options:{ emailRedirectTo: redirectTo, captchaToken: token }});
  if(error) return say('注册失败：'+error.message, false);
  say('注册成功。请到邮箱完成验证后再登录。');
});

// 忘记密码
$("#forgot-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  let token=hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-forgot']):'';
  if(!token) return say('请先完成验证码', false);
  const email=$("#forgot-email").value.trim();
  const redirectTo=location.origin+location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
  if(error) return say('发送失败：'+error.message, false);
  say('已发送重置邮件，请查收。');
});

// 应用
async function boot(){
  const { data:{ user } } = await supabase.auth.getUser();
  if(user){
    $("#auth-section").classList.add("hidden");
    $("#app-section").classList.remove("hidden");
    $("#user-email").textContent = user.email||'';
    const unverified = !user.email_confirmed_at;
    $("#verify-banner").classList.toggle("hidden", !unverified);
    if(unverified){
      setupResend(user.email);
    }
    await loadTable();
    say('已登录');
  }else{
    $("#app-section").classList.add("hidden");
    $("#auth-section").classList.remove("hidden");
    say('请先登录或注册');
  }
}
boot();

// 重发验证邮件（带60s冷却）
function setupResend(email){
  const btn=$("#resend-btn"), tip=$("#resend-tip");
  let remain = parseInt(localStorage.getItem("tj_resend_cooldown")||"0",10);
  const tick = ()=>{
    if(remain>0){ btn.disabled=true; tip.textContent=`${remain}s 后可再次发送`; remain--; localStorage.setItem("tj_resend_cooldown", remain); setTimeout(tick,1000); }
    else { btn.disabled=false; tip.textContent=''; localStorage.removeItem("tj_resend_cooldown"); }
  };
  tick();
  btn.onclick = async ()=>{
    if(btn.disabled) return;
    try{
      const { error } = await supabase.auth.resend({ type: 'signup', email, options:{ emailRedirectTo: location.origin+location.pathname } });
      if(error) throw error;
      say('已发送验证邮件，请查收');
      remain=60; tick();
    }catch(err){
      say('发送失败：'+err.message, false);
    }
  };
}

// 交易示例（只读列表，避免未验证用户写入失败）
async function loadTable(){
  const { data:{ user } } = await supabase.auth.getUser();
  if(!user) return;
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('trade_time',{ascending:false});
  if(error) return say('加载失败：'+error.message, false);
  const tbody=$("#tx-tbody"); tbody.innerHTML='';
  (data||[]).forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${new Date(r.trade_time).toLocaleString()}</td><td>${r.symbol}</td><td>${r.side}</td><td>${r.qty}</td><td>${r.price}</td><td>${r.fee}</td><td>${r.amount}</td><td>${r.notes||''}</td>`;
    tbody.appendChild(tr);
  });
}

$("#logout-btn").addEventListener("click", async ()=>{ await supabase.auth.signOut(); say('已退出'); boot(); });
