
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = (s)=>document.querySelector(s);
const statusBar = $("#status"); const buildInfo = $("#build-info");
if(buildInfo) buildInfo.textContent = `版本: ${cfg.VERSION} | 环境: ${cfg.ENV}`;
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

// hCaptcha 显式渲染（稳定）
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

// 登录/注册/忘记密码（简化版）
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
  }else{
    $("#app-section").classList.add("hidden");
    $("#auth-section").classList.remove("hidden");
  }
}
boot();

// 交易表单（示例）
function recalc(){ const q=parseFloat($("#qty").value)||0, p=parseFloat($("#price").value)||0, f=parseFloat($("#fee").value)||0; $("#amount").value=(q*p+f)||''; }
['qty','price','fee'].forEach(id=>$("#"+id).addEventListener('input', recalc));
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
  say('已保存');
});

$("#logout-btn").addEventListener("click", async ()=>{ await supabase.auth.signOut(); location.reload(); });

// 账户设置弹窗
const dlg=$("#settings-dialog");
$("#btn-settings").addEventListener("click", async ()=>{
  const { data:{ user } } = await supabase.auth.getUser();
  if(!user) return;
  // 拉取状态
  const { data: prof } = await supabase.from('profiles').select('status').eq('id', user.id).maybeSingle();
  const st = prof?.status || 'active';
  $("#acct-status").textContent = `当前状态：${st}`;
  dlg.showModal();
});

async function reauth(password){
  const { data:{ user } } = await supabase.auth.getUser();
  if(!user?.email) throw new Error('当前仅支持邮箱账号确认');
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if(error) throw new Error('密码不正确');
}

$("#btn-suspend").addEventListener("click", async (e)=>{
  e.preventDefault();
  try{
    const pw=$("#confirm-password").value; if(!pw) return say('请输入当前密码', false);
    await reauth(pw);
    const reason=$("#confirm-reason").value||'';
    const { error } = await supabase.rpc('account_suspend', { reason });
    if(error) throw error;
    say('账号已冻结（可恢复）'); dlg.close(); await supabase.auth.signOut(); location.reload();
  }catch(err){ say(err.message||'冻结失败', false); }
});

$("#btn-delete").addEventListener("click", async (e)=>{
  e.preventDefault();
  if(!confirm('确定要注销账号？这是软删除，可联系管理员恢复。')) return;
  try{
    const pw=$("#confirm-password").value; if(!pw) return say('请输入当前密码', false);
    await reauth(pw);
    const reason=$("#confirm-reason").value||'';
    const { error } = await supabase.rpc('account_delete', { reason });
    if(error) throw error;
    say('账号已注销（软删除）'); dlg.close(); await supabase.auth.signOut(); location.reload();
  }catch(err){ say(err.message||'注销失败', false); }
});
