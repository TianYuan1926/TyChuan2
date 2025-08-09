// ===== 初始化 =====
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: cfg.AUTH });
const $ = (s)=>document.querySelector(s);

const statusBar = $("#status");
const authSection = $("#auth-section");
const appSection  = $("#app-section");
const buildInfo   = $("#build-info");
const userEmailEl = $("#user-email");
const verifyBanner = $("#verify-banner");
const sndOk  = $("#snd-ok");
const sndErr = $("#snd-err");

function beep(ok=true){ try{ (ok?sndOk:sndErr).currentTime=0; (ok?sndOk:sndErr).play(); }catch(e){} }
function say(msg, ok=true){ statusBar.textContent=msg; statusBar.style.background= ok? "#122":"#2a1111"; statusBar.style.color= ok?"#9fd":"#f6b"; beep(ok); }
buildInfo.textContent = `版本: ${cfg.VERSION} | 环境: ${cfg.ENV}`;

// Tabs
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click", ()=>{
  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".tabpane").forEach(p=>p.classList.remove("show"));
  btn.classList.add("active");
  document.getElementById("tab-"+btn.dataset.tab).classList.add("show");
  if(window.__renderCaptchas) setTimeout(window.__renderCaptchas, 50);
}));

// Captcha stable render
let ids = { login:null, register:null, forgot:null, magic:null };
window.__renderCaptchas = function(){
  if(!window.hcaptcha) return;
  const sitekey = cfg.HCAPTCHA_SITEKEY;
  const ensure = (id, elId)=>{
    const el = document.getElementById(elId);
    if(!el) return null;
    const visible = el.offsetParent !== null && el.offsetHeight>0;
    if(!visible) return ids[id];
    try{
      if(ids[id]!==null){ window.hcaptcha.reset(ids[id]); return ids[id]; }
      el.setAttribute("data-sitekey", sitekey);
      ids[id] = window.hcaptcha.render(elId);
      return ids[id];
    }catch(e){ return ids[id]; }
  };
  ensure("login","captcha-login");
  ensure("register","captcha-register");
  ensure("forgot","captcha-forgot");
  ensure("magic","captcha-magic");
};

// Boot
async function boot(){
  const { data: { user } } = await supabase.auth.getUser();
  if(user){
    userEmailEl.textContent = user.email || "";
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    const needVerify = !user.email_confirmed_at;
    verifyBanner.classList.toggle("hidden", !needVerify);
    say("已登录。");
    await loadTable();
  }else{
    appSection.classList.add("hidden");
    authSection.classList.remove("hidden");
    say("请先登录或注册。");
  }
}
window.addEventListener("load", ()=>{ if(window.__renderCaptchas) window.__renderCaptchas(); boot(); });

// 登录
const rememberMe = document.getElementById("remember-me");
document.getElementById("login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  await supabase.auth.update({ persistSession: !!rememberMe.checked });
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  let captchaToken = window.hcaptcha && ids.login!==null ? window.hcaptcha.getResponse(ids.login) : "";
  if(!captchaToken){ say("请先完成验证码。", false); return; }
  say("登录中…");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken } });
  if(error){
    // 处理 2FA 挑战（若开启）
    if(error.message && error.message.toLowerCase().includes("mfa")){
      const factors = (error?.cause?.mfa?.factors) || (data?.mfa?.factors) || [];
      if(!factors.length){ say("需要二步验证，但未找到因子。", false); return; }
      const factorId = factors[0].id;
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if(chErr){ say("发起二步验证失败：" + chErr.message, false); return; }
      const code = prompt("输入 6 位二步验证码：");
      if(!code){ say("已取消。", false); return; }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
      if(vErr){ say("二步验证失败：" + vErr.message, false); return; }
      say("登录成功。"); boot(); return;
    }
    say("登录失败：" + error.message, false); return;
  }
  say("登录成功。"); boot();
});

// 注册 + 强度提示
const regPw = document.getElementById("reg-password");
const pwStrength = document.getElementById("pw-strength");
regPw.addEventListener("input", ()=>{
  const v = regPw.value; let s=0;
  if(v.length>=8) s++; if(/[A-Z]/.test(v)) s++; if(/[a-z]/.test(v)) s++; if(/[0-9]/.test(v)) s++; if(/[^A-Za-z0-9]/.test(v)) s++;
  const labels=["极弱","较弱","一般","良好","较强","很强"]; pwStrength.textContent = "密码强度：" + labels[s];
});
document.getElementById("register-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = document.getElementById("reg-email").value.trim();
  const password = regPw.value;
  if(!document.getElementById("tos").checked){ say("请先勾选条款。", false); return; }
  let captchaToken = window.hcaptcha && ids.register!==null ? window.hcaptcha.getResponse(ids.register) : "";
  if(!captchaToken){ say("请先完成验证码。", false); return; }
  const redirectTo = location.origin + location.pathname;
  say("注册中…");
  const { error } = await supabase.auth.signUp({ email, password, options:{ emailRedirectTo: redirectTo, captchaToken } });
  if(error){ say("注册失败：" + error.message, false); return; }
  say("注册成功。若启用邮箱确认，请到邮箱点击确认链接后登录。");
});

// 忘记密码
document.getElementById("forgot-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = document.getElementById("forgot-email").value.trim();
  let captchaToken = window.hcaptcha && ids.forgot!==null ? window.hcaptcha.getResponse(ids.forgot) : "";
  if(!captchaToken){ say("请先完成验证码。", false); return; }
  const redirectTo = location.origin + location.pathname;
  say("发送重置密码邮件中…");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken });
  if(error){ say("发送失败：" + error.message, false); return; }
  say("已发送重置邮件，请查收。");
});

// 魔法链接（免密登录）
document.getElementById("magic-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = document.getElementById("magic-email").value.trim();
  let captchaToken = window.hcaptcha && ids.magic!==null ? window.hcaptcha.getResponse(ids.magic) : "";
  if(!captchaToken){ say("请先完成验证码。", false); return; }
  const redirectTo = location.origin + location.pathname;
  say("发送登录链接中…");
  const { error } = await supabase.auth.signInWithOtp({ email, options:{ emailRedirectTo: redirectTo, captchaToken } });
  if(error){ say("发送失败：" + error.message, false); return; }
  say("登录链接已发送到邮箱，请在此设备点击链接完成登录。");
});

// 2FA 管理（TOTP）
const mfaEnrollPane = document.getElementById("mfa-enroll-pane");
const mfaManagePane = document.getElementById("mfa-manage-pane");
const mfaEnrollBtn = document.getElementById("mfa-enroll-btn");
const mfaQrWrap = document.getElementById("mfa-qr-wrap");
const mfaQrImg = document.getElementById("mfa-qr");
const mfaSecret = document.getElementById("mfa-secret");
const mfaEnrollVerify = document.getElementById("mfa-enroll-verify");

async function refreshMfaUI(){
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){ mfaEnrollPane.classList.add("hidden"); mfaManagePane.classList.add("hidden"); return; }
  const factors = user?.factors || [];
  if(factors.length){ mfaEnrollPane.classList.add("hidden"); mfaManagePane.classList.remove("hidden"); }
  else{ mfaManagePane.classList.add("hidden"); mfaEnrollPane.classList.remove("hidden"); }
}
document.querySelector('[data-tab="mfa"]').addEventListener("click", refreshMfaUI);

mfaEnrollBtn.addEventListener("click", async ()=>{
  const { data, error } = await supabase.auth.mfa.enroll({ factorType:"totp" });
  if(error){ say("生成二维码失败：" + error.message, false); return; }
  const uri = data?.totp?.uri || ""; const secret = data?.totp?.secret || "";
  if(!uri){ say("未获得二维码 URI。", false); return; }
  mfaQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(uri)}`;
  mfaSecret.textContent = `Secret: ${secret}`;
  mfaQrWrap.classList.remove("hidden");
  mfaEnrollBtn.dataset.factorId = data.id;
});
mfaEnrollVerify.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const id = mfaEnrollBtn.dataset.factorId; const code = document.getElementById("mfa-enroll-code").value.trim();
  if(!id || !code){ say("缺少因子或验证码。", false); return; }
  const { error } = await supabase.auth.mfa.verify({ factorId:id, code });
  if(error){ say("验证失败：" + error.message, false); return; }
  say("二步验证已开启。"); mfaQrWrap.classList.add("hidden"); refreshMfaUI();
});
document.getElementById("mfa-disable-btn").addEventListener("click", async ()=>{
  const { data: { user } } = await supabase.auth.getUser();
  const factor = (user?.factors||[])[0];
  if(!factor){ say("没有可关闭的因子。", false); return; }
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if(error){ say("关闭失败：" + error.message, false); return; }
  say("二步验证已关闭。"); refreshMfaUI();
});

// 退出
document.getElementById("logout-btn").addEventListener("click", async ()=>{
  await supabase.auth.signOut(); say("已退出登录。"); boot();
});

// ===== 交易基础 CRUD =====
const tbody = document.getElementById("tx-tbody");
function recalcAmount(){ const q=parseFloat(document.getElementById("qty").value)||0, p=parseFloat(document.getElementById("price").value)||0, f=parseFloat(document.getElementById("fee").value)||0; document.getElementById("amount").value = q*p+f || ""; }
["qty","price","fee"].forEach(id=>document.getElementById(id).addEventListener("input", recalcAmount));

document.getElementById("trade-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){ say("未登录。", false); return; }
  if(!user.email_confirmed_at){ say("邮箱未验证，后端已拦截写入。", false); return; }
  const ts = document.getElementById("trade_time").value;
  if(!ts){ say("请填写交易时间。", false); return; }
  const payload = {
    user_id: user.id,
    trade_time: new Date(ts).toISOString(),
    symbol: document.getElementById("symbol").value.trim().toUpperCase(),
    side: document.getElementById("side").value,
    qty: parseFloat(document.getElementById("qty").value),
    price: parseFloat(document.getElementById("price").value),
    fee: parseFloat(document.getElementById("fee").value||"0"),
    amount: parseFloat(document.getElementById("amount").value||"0"),
    notes: document.getElementById("notes").value.trim()
  };
  const { error } = await supabase.rpc("insert_transaction_secure", {
    p_trade_time: payload.trade_time,
    p_symbol: payload.symbol,
    p_side: payload.side,
    p_qty: payload.qty,
    p_price: payload.price,
    p_fee: payload.fee,
    p_amount: payload.amount,
    p_notes: payload.notes
  });
  if(error){ say("提交失败：" + error.message, false); return; }
  say("已保存。"); await loadTable();
});

async function loadTable(){
  const { data: { user } } = await supabase.auth.getUser();
  if(!user) return;
  const { data, error } = await supabase.from("transactions").select("*").eq("user_id", user.id).order("trade_time", { ascending:false });
  if(error){ say("加载失败：" + error.message, false); return; }
  tbody.innerHTML = "";
  (data||[]).forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${new Date(r.trade_time).toLocaleString()}</td><td>${r.symbol}</td><td>${r.side}</td><td>${r.qty}</td><td>${r.price}</td><td>${r.fee}</td><td>${r.amount}</td><td>${(r.notes||"").replaceAll("<","&lt;")}</td><td><button class="del" data-id="${r.id}">删除</button></td>`;
    tbody.appendChild(tr);
  });
  [...document.querySelectorAll("button.del")].forEach(b=>b.addEventListener("click", async ()=>{
    const id = b.dataset.id; if(!confirm("确定删除？")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if(error){ say("删除失败：" + error.message, false); return; }
    say("已删除。"); await loadTable();
  }));
}

// ===== 结束 =====
