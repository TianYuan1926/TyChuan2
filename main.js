const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = s=>document.querySelector(s); const say=(m,ok=true)=>{ const b=$("#status"); b.textContent=m; b.style.background=ok?"#122":"#2a1111"; b.style.color=ok?"#9fd":"#f6b"; };
$("#build-info").textContent = `版本: ${cfg.VERSION} | 环境: ${cfg.ENV}`;

// tabs + hCaptcha minimal
let widgetIds={},hLoaded=false; window.hcaptchaOnLoad=()=>{hLoaded=true; render();};
function render(){ ["captcha-login","captcha-register","captcha-forgot"].forEach(id=>{ const el=document.getElementById(id); if(!el||!window.hcaptcha) return; if(widgetIds[id]!==undefined){ try{window.hcaptcha.reset(widgetIds[id]);}catch{} return; } if(el.offsetParent===null||el.clientHeight===0){ setTimeout(render,200); return;} el.setAttribute("data-sitekey", cfg.HCAPTCHA_SITEKEY||""); widgetIds[id]=window.hcaptcha.render(id); }); }

document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{ document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active")); document.querySelectorAll(".tabpane").forEach(p=>p.classList.remove("show")); btn.classList.add("active"); $("#tab-"+btn.dataset.tab).classList.add("show"); setTimeout(render,0); }));

// ----- Local session id (per device) -----
function loadOrCreateLocalSessionId(){
  let sid = localStorage.getItem("tj_session_id");
  if(!sid){ sid = crypto.randomUUID(); localStorage.setItem("tj_session_id", sid); }
  return sid;
}
const CURRENT_SESSION_ID = loadOrCreateLocalSessionId();
$("#current-session-id").textContent = CURRENT_SESSION_ID;

// ----- Auth flow -----
$("#login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const token = hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-login']):'';
  if(!token) return say("请先完成验证码", false);
  const email = $("#login-email").value.trim(); const password=$("#login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token } });
  if(error) return say("登录失败："+error.message, false);
  say("登录成功"); await boot();
});
$("#register-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const token = hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-register']):'';
  if(!token) return say("请先完成验证码", false);
  const email=$("#reg-email").value.trim(); const p1=$("#reg-password").value; const p2=$("#reg-password2").value;
  if(p1!==p2) return say("两次密码不一致", false);
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase.auth.signUp({ email, password: p1, options:{ emailRedirectTo: redirectTo, captchaToken: token } });
  if(error) return say("注册失败："+error.message, false);
  say("注册成功，请前往邮箱确认后再登录");
});
$("#forgot-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const token = hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-forgot']):'';
  if(!token) return say("请先完成验证码", false);
  const email=$("#forgot-email").value.trim(); const redirectTo=location.origin+location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email,{ redirectTo, captchaToken: token });
  if(error) return say("发送失败："+error.message, false);
  say("已发送重置邮件");
});

$("#logout-btn").addEventListener("click", async ()=>{ await supabase.auth.signOut(); say("已退出"); boot(); });

// ----- Session APIs -----
async function upsertSession(){
  const info = navigator.userAgent;
  const { error, data } = await supabase.rpc("upsert_session", { p_session_id: CURRENT_SESSION_ID, p_device_name: info, p_ip: null });
  if(error){ console.warn(error); }
}
async function touchSession(){
  const { error } = await supabase.rpc("touch_session", { p_session_id: CURRENT_SESSION_ID });
  if(error){ console.warn(error); }
}
async function loadSessions(){
  const { data, error } = await supabase.from("user_sessions").select("*").order("last_active", { ascending:false });
  if(error){ say("加载会话失败："+error.message, false); return; }
  const tbody = $("#session-tbody"); tbody.innerHTML="";
  (data||[]).forEach(row=>{
    const tr=document.createElement("tr");
    const state = row.is_active? "活跃":"已下线";
    const mine = (row.id===CURRENT_SESSION_ID) ? "（当前）" : "";
    tr.innerHTML = `<td>${row.device_name||"-"}${mine}</td><td>${row.ip_address||"-"}</td><td>${new Date(row.last_active).toLocaleString()}</td><td>${state}</td>
      <td>${ row.id===CURRENT_SESSION_ID ? "-" : `<button data-id="${row.id}" class="kick">下线</button>`}</td>`;
    tbody.appendChild(tr);
  });
  [...document.querySelectorAll("button.kick")].forEach(btn=>btn.addEventListener("click", async ()=>{
    const id = btn.getAttribute("data-id");
    const { error } = await supabase.rpc("kick_session", { session_id: id });
    if(error) return say("下线失败："+error.message, false);
    say("已下线该设备"); loadSessions();
  }));
}
$("#refresh-sessions").addEventListener("click", loadSessions);
$("#kick-others").addEventListener("click", async ()=>{
  const { data, error } = await supabase.from("user_sessions").select("id").neq("id", CURRENT_SESSION_ID);
  if(error) return say("查询失败："+error.message, false);
  for(const r of (data||[])){
    await supabase.rpc("kick_session", { session_id: r.id });
  }
  say("已下线其它设备"); loadSessions();
});

// ----- App boot -----
async function boot(){
  const { data: { user } } = await supabase.auth.getUser();
  if(user){
    $("#auth-section").classList.add("hidden"); $("#app-section").classList.remove("hidden");
    $("#user-email").textContent = user.email||"";
    await upsertSession(); await loadSessions();
    say("已登录");
    // heartbeat 每 60s 更新活跃时间
    if(window.__hb) clearInterval(window.__hb);
    window.__hb = setInterval(touchSession, 60000);
  }else{
    $("#app-section").classList.add("hidden"); $("#auth-section").classList.remove("hidden");
    say("请先登录或注册");
    if(window.__hb) clearInterval(window.__hb);
  }
}
boot();

// ----- Trade form (write via secure RPC requiring active session) -----
function recalc(){ const q=parseFloat($("#qty").value)||0; const p=parseFloat($("#price").value)||0; const f=parseFloat($("#fee").value)||0; $("#amount").value=(q*p+f)||""; }
["qty","price","fee"].forEach(id=>$("#"+id).addEventListener("input", recalc));
$("#trade-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const ts = $("#trade_time").value; if(!ts) return say("请填写时间", false);
  const payload = {
    session_id: CURRENT_SESSION_ID,
    trade_time: new Date(ts).toISOString(),
    symbol: $("#symbol").value.trim().toUpperCase(),
    side: $("#side").value,
    qty: parseFloat($("#qty").value),
    price: parseFloat($("#price").value),
    fee: parseFloat($("#fee").value||"0"),
    amount: parseFloat($("#amount").value||"0"),
    notes: $("#notes").value.trim()
  };
  const { error } = await supabase.rpc("insert_transaction_secure_session", payload);
  if(error) return say("保存失败："+error.message, false);
  say("已保存"); await loadTx();
});
async function loadTx(){
  const { data, error } = await supabase.from("transactions").select("*").order("trade_time",{ascending:false}).limit(100);
  if(error){ say("加载失败："+error.message, false); return; }
  const tbody = $("#tx-tbody"); tbody.innerHTML="";
  (data||[]).forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${new Date(r.trade_time).toLocaleString()}</td><td>${r.symbol}</td><td>${r.side}</td><td>${r.qty}</td><td>${r.price}</td><td>${r.fee}</td><td>${r.amount}</td><td>${r.notes||""}</td>
    <td><button class="del" data-id="${r.id}">删除</button></td>`;
    tbody.appendChild(tr);
  });
  [...document.querySelectorAll("button.del")].forEach(btn=>btn.addEventListener("click", async ()=>{
    const id = btn.getAttribute("data-id");
    const { error } = await supabase.rpc("delete_transaction_secure_session", { session_id: CURRENT_SESSION_ID, p_id: id });
    if(error) return say("删除失败："+error.message, false);
    say("已删除"); loadTx();
  }));
}
