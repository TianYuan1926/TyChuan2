// ===== 配置与初始化 =====
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const $ = (s)=>document.querySelector(s);
const statusBar = $("#status");
const buildInfo = $("#build-info");
const authSection = $("#auth-section");
const appSection = $("#app-section");
buildInfo.textContent = `版本: ${cfg.VERSION} | 环境: ${cfg.ENV}`;

function say(msg, ok=true){
  statusBar.textContent = msg;
  statusBar.style.background = ok ? "#122" : "#2a1111";
  statusBar.style.color = ok ? "#9fd" : "#f6b";
}

// tabs
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tabpane").forEach(p=>p.classList.remove("show"));
    btn.classList.add("active");
    $("#tab-"+btn.dataset.tab).classList.add("show");
    // tab切换时重置可见 pane 中的验证码
    setTimeout(renderCaptchas, 0);
  });
});

// ===== hCaptcha 稳定渲染（显式 + 重试 + reset） =====
let widgets = {};
function canRender(id){
  const el = document.getElementById(id);
  if(!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height >= 40; // 有尺寸且可见
}
function renderOne(id){
  if(!window.hcaptcha) return false;
  if(!canRender(id)) return false;
  const sitekey = cfg.HCAPTCHA_SITEKEY || "";
  try{
    if(widgets[id] !== undefined){
      window.hcaptcha.reset(widgets[id]);
      return true;
    }
    const wid = window.hcaptcha.render(id, { sitekey });
    widgets[id] = wid;
    return true;
  }catch(e){ return false; }
}
function renderCaptchas(){
  const ids = ["captcha-login","captcha-register","captcha-forgot","captcha-phone"];
  ids.forEach((id)=>{
    let tries = 0;
    const tick = ()=>{
      if(renderOne(id)) return;
      if(++tries<=10) setTimeout(tick, 200);
    };
    tick();
  });
}
window.__renderCaptchas = renderCaptchas;
window.addEventListener("load", renderCaptchas);

// ===== 启动：检查登录状态 =====
async function boot(){
  const { data: { user } } = await supabase.auth.getUser();
  if(user){
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    $("#user-email").textContent = user.email || user.phone || "";
    await loadTable();
    say("已登录。");
  }else{
    appSection.classList.add("hidden");
    authSection.classList.remove("hidden");
    say("请先登录或注册。");
  }
}
boot();

// ===== Email 登录（带 captcha + 2FA） =====
const loginForm = $("#login-form");
const mfaChallengeForm = $("#mfa-challenge-form");
let mfaChallengeState = null;
loginForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  if(!email || !password){ say("邮箱/密码不能为空", false); return; }
  let captchaToken = "";
  if(window.hcaptcha && widgets["captcha-login"]!==undefined){
    captchaToken = window.hcaptcha.getResponse(widgets["captcha-login"]);
    if(!captchaToken){ say("请先完成验证码。", false); return; }
  }
  say("登录中…");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken }});
  if(error && (error.message || '').toLowerCase().includes("mfa")){
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
  say("登录成功。"); mfaChallengeState=null; await boot();
});

// ===== Email 注册/忘记密码（带 captcha） =====
$("#register-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#reg-email").value.trim();
  const password = $("#reg-password").value;
  if(!email||!password){ say("请输入邮箱和密码。", false); return; }
  let captchaToken = "";
  if(window.hcaptcha && widgets["captcha-register"]!==undefined){
    captchaToken = window.hcaptcha.getResponse(widgets["captcha-register"]);
    if(!captchaToken){ say("请先完成验证码。", false); return; }
  }
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, captchaToken } });
  if(error){ say("注册失败：" + error.message, false); return; }
  say("注册成功。若启用邮箱确认，请到邮箱点击确认链接后登录。");
});
$("#forgot-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#forgot-email").value.trim();
  if(!email){ say("请输入邮箱。", false); return; }
  let captchaToken = "";
  if(window.hcaptcha && widgets["captcha-forgot"]!==undefined){
    captchaToken = window.hcaptcha.getResponse(widgets["captcha-forgot"]);
    if(!captchaToken){ say("请先完成验证码。", false); return; }
  }
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken });
  if(error){ say("发送失败：" + error.message, false); return; }
  say("已发送重置密码邮件，请查收。");
});

// ===== 工具：E.164 构造 & 校验 =====
function toE164(code, num){
  const clean = (num||"").replace(/\D+/g,"");
  const e164 = (code||"") + clean;
  // 6~15 位总长度（去掉+号后）
  if(!/^\+[1-9]\d{5,14}$/.test(e164)) return null;
  return e164;
}

// ===== 手机登录/注册：发送验证码（冷却 + 倒计时 + captcha） =====
const phoneSendBtn = $("#phone-send");
const phoneRegion = $("#phone-region");
const phoneNumber = $("#phone-number");
const otpForm = $("#otp-form");
const otpCode = $("#otp-code");
let cooldownTimer = null;

function startCooldown(key, seconds=60){
  const end = Date.now() + seconds*1000;
  localStorage.setItem(key, String(end));
  phoneSendBtn.disabled = true;
  const tick = ()=>{
    const left = Math.max(0, Math.ceil((parseInt(localStorage.getItem(key)||"0") - Date.now())/1000));
    if(left<=0){
      phoneSendBtn.textContent = "发送验证码";
      phoneSendBtn.disabled = false;
      localStorage.removeItem(key);
      if(cooldownTimer) clearInterval(cooldownTimer);
      return;
    }
    phoneSendBtn.textContent = `重发 (${left}s)`;
  };
  if(cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(tick, 500);
  tick();
}

function resumeCooldownIfAny(key){
  const end = parseInt(localStorage.getItem(key)||"0");
  if(end && end>Date.now()){
    startCooldown(key, Math.ceil((end-Date.now())/1000));
  }
}

const cooldownKey = "otpCooldown-phone";
resumeCooldownIfAny(cooldownKey);

phoneSendBtn.addEventListener("click", async ()=>{
  const e164 = toE164(phoneRegion.value, phoneNumber.value);
  if(!e164){ say("请输入正确的手机号（仅数字，不含0前缀），并选择正确区号。", false); return; }

  let captchaToken = "";
  if(window.hcaptcha && widgets["captcha-phone"]!==undefined){
    captchaToken = window.hcaptcha.getResponse(widgets["captcha-phone"]);
    if(!captchaToken){ say("请先完成验证码。", false); return; }
  }

  say("发送验证码中…");
  phoneSendBtn.disabled = true;
  const { error } = await supabase.auth.signInWithOtp({ phone: e164, options: { captchaToken } });
  phoneSendBtn.disabled = false;
  if(error){ say("发送失败：" + error.message, false); return; }
  say("验证码已发送。");
  otpForm.classList.remove("hidden");
  startCooldown(cooldownKey, 60);
});

otpForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const e164 = toE164(phoneRegion.value, phoneNumber.value);
  const token = otpCode.value.trim();
  if(!e164 || !token){ say("请填写手机号与验证码。", false); return; }
  say("验证中…");
  const { error } = await supabase.auth.verifyOtp({ phone: e164, token, type: "sms" });
  if(error){ say("验证失败：" + error.message, false); return; }
  say("登录成功。"); await boot();
});

// ===== 绑定/更换手机到当前账号（账号合并） =====
const bindSendBtn = $("#bind-send");
const bindRegion = $("#bind-region");
const bindNumber = $("#bind-number");
const bindVerifyForm = $("#bind-verify-form");
const bindCode = $("#bind-code");
const bindCooldownKey = "otpCooldown-bind";

function resumeBindCooldown(){ resumeCooldownIfAny(bindCooldownKey); }
resumeBindCooldown();

bindSendBtn.addEventListener("click", async ()=>{
  const e164 = toE164(bindRegion.value, bindNumber.value);
  if(!e164){ say("请输入正确的手机号并选择区号。", false); return; }
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){ say("请先登录后再绑定手机。", false); return; }
  say("发送绑定验证码中…");
  bindSendBtn.disabled = true;
  // 这会触发“变更手机”流程：向新手机发送验证码
  const { error } = await supabase.auth.updateUser({ phone: e164 });
  bindSendBtn.disabled = false;
  if(error){ say("发送失败：" + error.message, false); return; }
  say("验证码已发送到新手机号。");
  bindVerifyForm.classList.remove("hidden");
  startCooldown(bindCooldownKey, 60);
});

bindVerifyForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const e164 = toE164(bindRegion.value, bindNumber.value);
  const token = bindCode.value.trim();
  if(!e164 || !token){ say("请填写手机号与验证码。", false); return; }
  say("验证中…");
  // 验证手机变更
  const { error } = await supabase.auth.verifyOtp({ phone: e164, token, type: "phone_change" });
  if(error){ say("验证失败：" + error.message, false); return; }
  say("手机已绑定到当前账号。");
  await boot();
});

// ===== 基础交易读写 =====
function recalcAmount(){
  const qty = parseFloat($("#qty").value)||0;
  const price = parseFloat($("#price").value)||0;
  const fee = parseFloat($("#fee").value)||0;
  $("#amount").value = qty*price + fee || "";
}
["qty","price","fee"].forEach(id=>$("#"+id).addEventListener("input", recalcAmount));

$("#trade-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){ say("未登录。", false); return; }
  const ts = $("#trade_time").value;
  if(!ts){ say("请填写交易时间。", false); return; }
  const payload = { user_id:user.id, trade_time:new Date(ts).toISOString(), symbol:$("#symbol").value.trim().toUpperCase(),
    side:$("#side").value, qty:parseFloat($("#qty").value), price:parseFloat($("#price").value), fee:parseFloat($("#fee").value||"0"),
    amount:parseFloat($("#amount").value||"0"), notes:$("#notes").value.trim() };
  const { error } = await supabase.from("transactions").insert(payload);
  if(error){ say("保存失败：" + error.message, false); return; }
  say("已保存。"); await loadTable();
});

const tbody = $("#tx-tbody");
async function loadTable(){
  const { data: { user } } = await supabase.auth.getUser();
  if(!user) return;
  const { data, error } = await supabase.from("transactions").select("*").eq("user_id", user.id).order("trade_time",{ascending:false});
  if(error){ say("加载失败：" + error.message, false); return; }
  tbody.innerHTML = "";
  (data||[]).forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(r.trade_time).toLocaleString()}</td>
      <td>${r.symbol}</td>
      <td>${r.side}</td>
      <td>${r.qty}</td>
      <td>${r.price}</td>
      <td>${r.fee}</td>
      <td>${r.amount}</td>
      <td>${r.notes||""}</td>
      <td><button class="del" data-id="${r.id}">删除</button></td>`;
    tbody.appendChild(tr);
  });
  [...document.querySelectorAll("button.del")].forEach(btn=>btn.addEventListener("click", async ()=>{
    const id = btn.dataset.id;
    if(!confirm("确定删除？")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if(error){ say("删除失败：" + error.message, false); return; }
    say("已删除。"); await loadTable();
  }));
}

$("#refresh-btn").addEventListener("click", loadTable);

$("#export-btn").addEventListener("click", async ()=>{
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){ say("未登录。", false); return; }
  const { data, error } = await supabase.from("transactions").select("*").eq("user_id", user.id).order("trade_time",{ascending:false});
  if(error){ say("导出失败：" + error.message, false); return; }
  const header = ["trade_time","symbol","side","qty","price","fee","amount","notes"];
  const lines = [header.join(",")];
  (data||[]).forEach(r=>{
    const row=[new Date(r.trade_time).toISOString(),r.symbol,r.side,r.qty,r.price,r.fee,r.amount,(r.notes||"").replaceAll('"','""')]
      .map(v=>{const s=`${v??""}`;return /[",\n]/.test(s)?`"${s}"`:s;});
    lines.push(row.join(","));
  });
  const blob = new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download="transactions.csv"; a.click();
  URL.revokeObjectURL(url);
  say("已导出 CSV。");
});
