
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const statusBar = $("#status"); const buildInfo=$("#build-info");
if(buildInfo) buildInfo.textContent = `版本: ${cfg.VERSION} | 环境: ${cfg.ENV}`;
function say(msg, ok=true){ statusBar.textContent=msg; statusBar.classList.toggle('error', !ok); }

// 左侧导航切换
$$(".nav-btn").forEach(btn=>btn.addEventListener("click", ()=>{
  $$(".nav-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  const target = btn.dataset.target;
  $$(".panel").forEach(p=>p.classList.remove("show"));
  $("#panel-"+target).classList.add("show");
  // 切换时尝试渲染验证码
  setTimeout(renderCaptchas, 0);
}));

// Captcha 稳定渲染
let widgetIds={}, hLoaded=false;
window.hcaptchaOnLoad = ()=>{ hLoaded=true; renderCaptchas(); };
function renderOne(id){
  if(!hLoaded || !window.hcaptcha) return;
  const el=document.getElementById(id); if(!el) return;
  if(widgetIds[id]!==undefined){ try{window.hcaptcha.reset(widgetIds[id]);}catch{} return; }
  if(el.offsetParent===null || el.clientHeight===0){ setTimeout(()=>renderOne(id),200); return; }
  el.setAttribute('data-sitekey', cfg.HCAPTCHA_SITEKEY||'');
  widgetIds[id] = window.hcaptcha.render(id);
}
function renderCaptchas(){ ['captcha-login','captcha-register','captcha-forgot'].forEach(renderOne); }

// Auth
$("#login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  let token = hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-login']):'';
  if(!token) return say('请先完成验证码', false);
  const email=$("#login-email").value.trim(), password=$("#login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token } });
  if(error) return say('登录失败：'+error.message, false);
  say('登录成功'); boot(); $("#panel-journal").classList.add("show"); $$(".nav-btn").forEach(b=>b.classList.remove("active")); document.querySelector('[data-target="journal"]').classList.add("active");
});
$("#register-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  let token = hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-register']):'';
  if(!token) return say('请先完成验证码', false);
  const email=$("#reg-email").value.trim(), p1=$("#reg-password").value, p2=$("#reg-password2").value;
  if(p1!==p2) return say('两次密码不一致', false);
  const redirectTo=location.origin+location.pathname;
  const { error } = await supabase.auth.signUp({ email, password:p1, options:{ emailRedirectTo: redirectTo, captchaToken: token }});
  if(error) return say('注册失败：'+error.message, false);
  say('注册成功，请到邮箱完成验证后再登录');
});
$("#forgot-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  let token = hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-forgot']):'';
  if(!token) return say('请先完成验证码', false);
  const email=$("#forgot-email").value.trim();
  const redirectTo=location.origin+location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
  if(error) return say('发送失败：'+error.message, false);
  say('已发送重置邮件，请查收');
});

// App boot
async function boot(){
  const { data:{ user } } = await supabase.auth.getUser();
  if(user){
    $("#user-email").textContent = user.email||'';
    const unverified = !user.email_confirmed_at;
    $("#verify-banner").classList.toggle("hidden", !unverified);
    await loadTx(); await loadSec();
  }else{
    $("#user-email").textContent='';
    $$(".panel").forEach(p=>p.classList.remove("show"));
    $("#panel-auth").classList.add("show");
    $$(".nav-btn").forEach(b=>b.classList.remove("active"));
    document.querySelector('[data-target="auth"]').classList.add("active");
  }
}
boot();

// resend verify
function setupResend(email){
  const btn=$("#resend-btn"), tip=$("#resend-tip");
  let remain = parseInt(localStorage.getItem("tj_resend_cooldown")||"0",10);
  const tick = ()=>{
    if(remain>0){ btn.disabled=true; tip.textContent=`${remain}s 后可再次发送`; remain--; localStorage.setItem("tj_resend_cooldown", remain); setTimeout(tick,1000); }
    else { btn.disabled=false; tip.textContent=''; localStorage.removeItem("tj_resend_cooldown"); }
  };
  tick();
  btn.onclick = async ()=>{
    const { data:{ user } } = await supabase.auth.getUser(); if(!user?.email) return;
    const { error } = await supabase.auth.resend({ type:'signup', email: user.email, options:{ emailRedirectTo: location.origin+location.pathname } });
    if(error) return say('发送失败：'+error.message, false);
    say('已发送验证邮件'); remain=60; tick();
  };
}
(async ()=>{ const { data:{ user } } = await supabase.auth.getUser(); if(user && !user.email_confirmed_at){ setupResend(user.email); } })();

// Trade form
function recalc(){ const q=parseFloat($("#qty").value)||0, p=parseFloat($("#price").value)||0, f=parseFloat($("#fee").value)||0; $("#amount").value=(q*p+f)||''; }
["qty","price","fee"].forEach(id=>$("#"+id).addEventListener('input', recalc));
$("#trade-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const { data:{ user } } = await supabase.auth.getUser();
  if(!user) return say('未登录', false);
  const ts=$("#trade_time").value; if(!ts) return say('请填写时间', false);
  const payload={
    user_id:user.id, trade_time:new Date(ts).toISOString(),
    symbol:$("#symbol").value.trim().toUpperCase(),
    side:$("#side").value, qty:parseFloat($("#qty").value),
    price:parseFloat($("#price").value), fee:parseFloat($("#fee").value||'0'),
    amount:parseFloat($("#amount").value||'0'), notes:$("#notes").value.trim()
  };
  const { error } = await supabase.from('transactions').insert(payload);
  if(error) return say('保存失败：'+error.message, false);
  say('已保存'); await loadTx();
});

async function loadTx(){
  const { data:{ user } } = await supabase.auth.getUser(); if(!user) return;
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('trade_time',{ascending:false});
  if(error) return say('加载失败：'+error.message, false);
  const tb=$("#tx-tbody"); tb.innerHTML='';
  (data||[]).forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${new Date(r.trade_time).toLocaleString()}</td>
      <td>${r.symbol}</td><td>${r.side}</td><td>${r.qty}</td><td>${r.price}</td>
      <td>${r.fee}</td><td>${r.amount}</td><td>${(r.notes||'').replace(/</g,'&lt;')}</td>
      <td><button class="btn small ghost del" data-id="${r.id}">删除</button></td>`;
    tb.appendChild(tr);
  });
  $$(".del").forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('确定删除？')) return;
    const { error } = await supabase.from('transactions').delete().eq('id', b.dataset.id);
    if(error) return say('删除失败：'+error.message, false);
    say('已删除'); await loadTx();
  }));
}
$("#refresh-btn").addEventListener("click", loadTx);
$("#export-btn").addEventListener("click", async ()=>{
  const { data:{ user } } = await supabase.auth.getUser(); if(!user) return;
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('trade_time',{ascending:false});
  if(error) return say('导出失败：'+error.message, false);
  const header=['trade_time','symbol','side','qty','price','fee','amount','notes'];
  const lines=[header.join(',')];
  (data||[]).forEach(r=>{ const row=[new Date(r.trade_time).toISOString(),r.symbol,r.side,r.qty,r.price,r.fee,r.amount,(r.notes||'').replaceAll('"','""')].map(s=>{s=`${s??''}`; return /[",\n]/.test(s)?`"${s}"`:s;}); lines.push(row.join(',')); });
  const blob = new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='transactions.csv'; a.click(); URL.revokeObjectURL(url);
  say('已导出 CSV');
});

// Security table (兼容你第5步的数据结构)
async function loadSec(){
  const { data, error } = await supabase.from('security_events').select('created_at,event_type,message').order('created_at',{ascending:false}).limit(100);
  if(error) return; // 安全日志非强制
  const tb=$("#sec-tbody"); tb.innerHTML='';
  (data||[]).forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${new Date(r.created_at).toLocaleString()}</td><td>${r.event_type}</td><td>${r.message||''}</td>`;
    tb.appendChild(tr);
  });
}

$("#logout-btn").addEventListener("click", async ()=>{ await supabase.auth.signOut(); location.reload(); });
