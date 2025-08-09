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

// ===== 审计日志 RPC =====
async function logEvent(type, msg){
  const ua = navigator.userAgent || '';
  // IP 可留空，保持仅 GitHub+Supabase（不依赖外部IP服务）
  try { await supabase.rpc('log_security_event', { p_event_type: type, p_message: msg, p_user_agent: ua, p_ip: '' }); } catch(e){}
}

// 登录
$("#login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  let token=hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-login']):'';
  if(!token) return say('请先完成验证码', false);
  const email=$("#login-email").value.trim();
  const password=$("#login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token }});
  if(error) return say('登录失败：'+error.message, false);
  await logEvent('login', 'password login');
  say('登录成功'); boot();
});

// 魔法链接
$("#btn-magic").addEventListener("click", async ()=>{
  const email = prompt("输入邮箱（将发送登录链接）");
  if(!email) return;
  // 可在这里也加验证码，如需则复用 register 区块
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if(error) return say('发送失败：'+error.message, false);
  say('已发送登录链接，请查收邮件');
  await logEvent('magic_link_send', 'login link sent');
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
  await logEvent('password_reset_send', 'reset email sent');
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
    if(unverified){ setupResend(user.email); }
    await loadSecurityEvents();
    say('已登录');
    // 避免重复记录：仅在本窗口首次 boot 后记录 magic_link_login
    if(!sessionStorage.getItem('logged_once')){
      sessionStorage.setItem('logged_once','1');
      // 判断是否为 magic link 登录：无法直接分辨，这里只记录 boot 登录
      await logEvent('login_boot', 'session restored or magic link');
    }
  }else{
    $("#app-section").classList.add("hidden");
    $("#auth-section").classList.remove("hidden");
    say('请先登录或注册');
  }
}
boot();

// 重发验证
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
      await logEvent('resend_verification', 'resend signup verification');
      remain=60; tick();
    }catch(err){
      say('发送失败：'+err.message, false);
    }
  };
}

// 拉取安全日志
async function loadSecurityEvents(){
  const { data, error } = await supabase
    .from('security_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if(error){ say('加载安全日志失败：'+error.message, false); return; }
  const tbody=$("#sec-tbody"); tbody.innerHTML='';
  (data||[]).forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${new Date(r.created_at).toLocaleString()}</td>
      <td>${r.event_type}</td>
      <td>${r.message||''}</td>
      <td>${(r.user_agent||'').slice(0,60)}</td>
      <td>${r.ip_address||''}</td>`;
    tbody.appendChild(tr);
  });
}
$("#sec-refresh").addEventListener("click", loadSecurityEvents);

// 导出安全日志 CSV
$("#sec-export").addEventListener("click", async ()=>{
  const { data, error } = await supabase
    .from('security_events').select('*').order('created_at', { ascending: false });
  if(error) return say('导出失败：'+error.message, false);
  const header = ['created_at','event_type','message','user_agent','ip_address'];
  const lines = [header.join(',')];
  (data||[]).forEach(r=>{
    const row=[r.created_at, r.event_type, r.message||'', r.user_agent||'', r.ip_address||'']
      .map(v=>{ let s=`${v??''}`; return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s; });
    lines.push(row.join(','));
  });
  const blob = new Blob([lines.join('\\n')],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='security_events.csv'; a.click(); URL.revokeObjectURL(url);
  say('已导出');
});

// 交易保存示例（保持与前版本一致）
document.getElementById('trade-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const { data:{ user } } = await supabase.auth.getUser();
  if(!user) return say('未登录', false);
  const ts = document.getElementById('trade_time').value;
  if(!ts) return say('请填写时间', false);
  const payload = {
    user_id: user.id,
    trade_time: new Date(ts).toISOString(),
    symbol: document.getElementById('symbol').value.trim().toUpperCase(),
    side: document.getElementById('side').value,
    qty: parseFloat(document.getElementById('qty').value),
    price: parseFloat(document.getElementById('price').value),
    fee: parseFloat(document.getElementById('fee').value||'0'),
    amount: parseFloat(document.getElementById('amount').value||'0'),
    notes: document.getElementById('notes').value.trim()
  };
  const { error } = await supabase.from('transactions').insert(payload);
  if(error) return say('保存失败：'+error.message, false);
  say('已保存');
});
document.getElementById('logout-btn').addEventListener('click', async ()=>{
  await logEvent('logout', 'user sign out');
  await supabase.auth.signOut(); 
  say('已退出'); location.reload();
});