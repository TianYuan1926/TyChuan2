
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

// ===== 指纹生成（本地稳定） =====
function genFingerprint(){
  const key = 'tj_device_fp';
  let fp = localStorage.getItem(key);
  if(!fp){
    const seed = [
      navigator.userAgent||'',
      navigator.platform||'',
      navigator.language||'',
      Math.random().toString(36).slice(2)
    ].join('|');
    // 简单hash
    let h=0; for(let i=0;i<seed.length;i++){ h=((h<<5)-h)+seed.charCodeAt(i); h|=0; }
    fp = 'fp_'+Math.abs(h);
    localStorage.setItem(key, fp);
  }
  return fp;
}
function deviceName(){ return (navigator.userAgent||'').slice(0,80); }

// ===== 登录流程 =====
$("#login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  let token=hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-login']):'';
  if(!token) return say('请先完成验证码', false);
  const email=$("#login-email").value.trim();
  const password=$("#login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token }});
  if(error) return say('登录失败：'+error.message, false);
  say('登录成功'); await afterLogin(); boot();
});

$("#btn-magic").addEventListener("click", async ()=>{
  const email = prompt("输入邮箱（将发送登录链接）");
  if(!email) return;
  const redirectTo=location.origin+location.pathname;
  const { error } = await supabase.auth.signInWithOtp({ email, options:{ emailRedirectTo: redirectTo } });
  if(error) return say('发送失败：'+error.message, false);
  say('已发送登录链接，请查收');
});

// 登录后调用：记录指纹并拉取通知
async function afterLogin(){
  try{
    const fp = genFingerprint();
    const dev = deviceName();
    // 无外部API：IP 留空字符串
    await supabase.rpc('record_login', { p_fingerprint: fp, p_device: dev, p_ip: '' });
  }catch(e){ /*ignore*/ }
  await refreshNotifications();
}

// 应用
async function boot(){
  const { data:{ user } } = await supabase.auth.getUser();
  if(user){
    $("#auth-section").classList.add("hidden");
    $("#app-section").classList.remove("hidden");
    $("#user-email").textContent = user.email||'';
    await refreshNotifications();
  }else{
    $("#app-section").classList.add("hidden");
    $("#auth-section").classList.remove("hidden");
  }
}
boot();

// 通知中心
async function refreshNotifications(){
  const badge=$("#notify-badge");
  const panel=$("#notify-panel");
  const tbody=$("#notify-tbody");
  const { data, error } = await supabase.rpc('get_notifications', { p_limit: 50 });
  if(error){ say('加载通知失败：'+error.message, false); return; }
  const unread = (data||[]).filter(n=>!n.read_at).length;
  if(unread>0){ badge.textContent=unread; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
  tbody.innerHTML='';
  (data||[]).forEach(n=>{
    const tr=document.createElement('tr');
    const st = n.read_at? '已读':'未读';
    tr.innerHTML = `<td>${new Date(n.created_at).toLocaleString()}</td>
      <td>${n.type}</td><td>${n.title}</td><td>${n.body||''}</td><td>${st}</td>
      <td>${n.read_at? '' : '<button class="ghost small" data-id="'+n.id+'">标记已读</button>'}</td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('button[data-id]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await supabase.rpc('mark_notification_read', { p_id: btn.getAttribute('data-id') });
      await refreshNotifications();
    });
  });
}
$("#btn-notify").addEventListener("click", ()=>{ $("#notify-panel").classList.toggle('hidden'); });
$("#btn-close-panel").addEventListener("click", ()=>{ $("#notify-panel").classList.add('hidden'); });
$("#btn-mark-all").addEventListener("click", async ()=>{ await supabase.rpc('mark_all_read'); await refreshNotifications(); });

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
