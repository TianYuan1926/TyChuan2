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
  });
});

// 渲染 hCaptcha
let captchaLoginId=null, captchaRegId=null, captchaForgotId=null;
function renderCaptchas(){
  if(window.hcaptcha){
    const sitekey = cfg.HCAPTCHA_SITEKEY || "";
    if($("#captcha-login")){
      $("#captcha-login").setAttribute("data-sitekey", sitekey);
      captchaLoginId = window.hcaptcha.render("captcha-login");
    }
    if($("#captcha-register")){
      $("#captcha-register").setAttribute("data-sitekey", sitekey);
      captchaRegId = window.hcaptcha.render("captcha-register");
    }
    if($("#captcha-forgot")){
      $("#captcha-forgot").setAttribute("data-sitekey", sitekey);
      captchaForgotId = window.hcaptcha.render("captcha-forgot");
    }
  }
}
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

// ===== 登录（带 captcha + 2FA 挑战） =====
const loginForm = $("#login-form");
const mfaChallengeForm = $("#mfa-challenge-form");
let mfaChallengeState = null;
loginForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  if(!email || !password){ say("邮箱/密码不能为空", false); return; }

  let captchaToken = "";
  if(window.hcaptcha && captchaLoginId!==null){
    captchaToken = window.hcaptcha.getResponse(captchaLoginId);
    if(!captchaToken){ say("请先完成验证码。", false); return; }
  }

  say("登录中…");
  const { data, error } = await supabase.auth.signInWithPassword({
    email, password,
    options: { captchaToken }
  });

  // 需要 2FA 的情形（mfa_required）
  if(error && error.message && error.message.toLowerCase().includes("mfa")){
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
  say("登录成功。");
  await boot();
});

mfaChallengeForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  if(!mfaChallengeState){ say("没有待验证的挑战。", false); return; }
  const code = $("#mfa-code").value.trim();
  if(!code){ say("请输入验证码。", false); return; }
  const { error } = await supabase.auth.mfa.verify({
    factorId: mfaChallengeState.factorId,
    challengeId: mfaChallengeState.challengeId,
    code
  });
  if(error){ say("二步验证失败：" + error.message, false); return; }
  say("登录成功。");
  mfaChallengeState = null;
  await boot();
});

// ===== 注册（带 captcha） =====
const regForm = $("#register-form");
regForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#reg-email").value.trim();
  const password = $("#reg-password").value;
  if(!email || !password){ say("请输入邮箱和密码。", false); return; }

  let captchaToken = "";
  if(window.hcaptcha && captchaRegId!==null){
    captchaToken = window.hcaptcha.getResponse(captchaRegId);
    if(!captchaToken){ say("请先完成验证码。", false); return; }
  }

  const redirectTo = location.origin + location.pathname;
  say("注册中…");
  const { error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: redirectTo, captchaToken }
  });
  if(error){ say("注册失败：" + error.message, false); return; }
  say("注册成功。若启用邮箱确认，请到邮箱点击确认链接后登录。");
});

// ===== 忘记密码（带 captcha） =====
const forgotForm = $("#forgot-form");
forgotForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#forgot-email").value.trim();
  if(!email){ say("请输入邮箱。", false); return; }

  let captchaToken = "";
  if(window.hcaptcha && captchaForgotId!==null){
    captchaToken = window.hcaptcha.getResponse(captchaForgotId);
    if(!captchaToken){ say("请先完成验证码。", false); return; }
  }

  const redirectTo = location.origin + location.pathname;
  say("发送重置邮件中…");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken });
  if(error){ say("发送失败：" + error.message, false); return; }
  say("已发送重置邮件，请查收。");
});

// ===== 登出 =====
$("#logout-btn").addEventListener("click", async ()=>{
  await supabase.auth.signOut();
  say("已退出登录。"); boot();
});

// ===== 交易记录基础读写 =====
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
  const payload = {
    user_id: user.id,
    trade_time: new Date(ts).toISOString(),
    symbol: $("#symbol").value.trim().toUpperCase(),
    side: $("#side").value,
    qty: parseFloat($("#qty").value),
    price: parseFloat($("#price").value),
    fee: parseFloat($("#fee").value||"0"),
    amount: parseFloat($("#amount").value||"0"),
    notes: $("#notes").value.trim()
  };
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
