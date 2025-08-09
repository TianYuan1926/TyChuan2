// ===== 配置与初始化 =====
if(!window.APP_CONFIG){ alert("缺少 config/config.js 配置"); }
const { SUPABASE_URL, SUPABASE_ANON_KEY, VERSION, ENV, AUTH } = window.APP_CONFIG;
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: AUTH || { persistSession: true } });

// ===== DOM =====
const $ = (s)=>document.querySelector(s);
const statusBar = $("#status");
const authSection = $("#auth-section");
const appSection  = $("#app-section");
const buildInfo   = $("#build-info");
const userEmailEl = $("#user-email");
const sndOk  = $("#snd-ok");
const sndErr = $("#snd-err");

// Tabs
const tabs = document.querySelectorAll(".tab");
const panes = document.querySelectorAll(".tabpane");
tabs.forEach(btn=>btn.addEventListener("click", ()=>{
  tabs.forEach(b=>b.classList.remove("active"));
  panes.forEach(p=>p.classList.remove("show"));
  btn.classList.add("active");
  const pane = document.getElementById("tab-" + btn.dataset.tab);
  if(pane) pane.classList.add("show");
}));

function beep(ok=true){ try{ (ok?sndOk:sndErr).currentTime=0; (ok?sndOk:sndErr).play(); }catch(e){} }
function say(msg, ok=true){
  statusBar.textContent = msg;
  statusBar.style.background = ok ? "#122" : "#2a1111";
  statusBar.style.color = ok ? "#9fd" : "#f6b";
  beep(ok);
}
buildInfo.textContent = `版本: ${VERSION} | 环境: ${ENV}`;

// ===== Boot：处理 recovery + 自动登录 =====
async function boot(){
  await handleRecoveryIfNeeded();
  const { data: { user } } = await supabase.auth.getUser();
  if(user){
    userEmailEl.textContent = user.email || (user.phone ? `手机 ${user.phone}` : "");
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    say("已登录，加载数据…");
    await loadTable();
  }else{
    appSection.classList.add("hidden");
    authSection.classList.remove("hidden");
    say("请先登录或注册。");
  }
}
document.addEventListener("DOMContentLoaded", boot);

// ===== 登录（邮箱+密码） =====
const loginForm = $("#login-form");
const rememberMe = $("#remember-me");
loginForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  if(!email || !password){ say("邮箱/密码不能为空", false); return; }
  // persistSession 开关（记住我）
  await supabase.auth.update({
    persistSession: !!rememberMe.checked
  });
  $("#login-btn").disabled = true;
  say("登录中…");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  $("#login-btn").disabled = false;
  if(error){ say("登录失败：" + error.message, false); return; }
  say("登录成功。"); boot();
});

// ===== 注册（邮箱+密码） + 密码强度提示 =====
const regPw = $("#reg-password");
const pwStrength = $("#pw-strength");
regPw.addEventListener("input", ()=>{
  const v = regPw.value;
  let score = 0;
  if(v.length>=8) score++;
  if(/[A-Z]/.test(v)) score++;
  if(/[a-z]/.test(v)) score++;
  if(/[0-9]/.test(v)) score++;
  if(/[^A-Za-z0-9]/.test(v)) score++;
  const labels=["极弱","较弱","一般","良好","较强","很强"];
  pwStrength.textContent = "密码强度：" + labels[score];
});
const regForm = $("#register-form");
regForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#reg-email").value.trim();
  const password = $("#reg-password").value;
  if(!email || !password){ say("邮箱/密码不能为空", false); return; }
  if(password.length < 8){ say("密码至少 8 位。", false); return; }
  say("注册中…");
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
  if(error){ say("注册失败：" + error.message, false); return; }
  say("注册成功。若启用邮箱确认，请到邮箱点击确认链接后再登录。");
});

// ===== 忘记密码（发送重置邮件） =====
const forgotForm = $("#forgot-form");
forgotForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#forgot-email").value.trim();
  if(!email){ say("请输入邮箱。", false); return; }
  const redirectTo = location.origin + location.pathname;
  say("发送重置邮件中…");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if(error){ say("发送失败：" + error.message, false); return; }
  say("已发送重置邮件，请查收。");
});

// ===== 手机号 OTP 登录/注册 =====
const phoneSendBtn = $("#phone-send");
const phoneRegion = $("#phone-region");
const phoneNumber = $("#phone-number");
const phoneRemember = $("#phone-remember");
const otpForm = $("#otp-form");
const otpCode = $("#otp-code");

phoneSendBtn.addEventListener("click", async ()=>{
  const fullPhone = (phoneRegion.value || "") + (phoneNumber.value || "").replace(/\s+/g,"");
  if(!/^[+][0-9]{6,20}$/.test(fullPhone)){ say("请输入正确的手机号（含区号）", false); return; }
  await supabase.auth.update({ persistSession: !!phoneRemember.checked });
  say("发送验证码中…");
  const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
  if(error){ say("发送失败：" + error.message, false); return; }
  say("验证码已发送。");
  otpForm.classList.remove("hidden");
});

otpForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const fullPhone = (phoneRegion.value || "") + (phoneNumber.value || "").replace(/\s+/g,"");
  const token = (otpCode.value || "").trim();
  if(!token){ say("请输入验证码。", false); return; }
  say("验证中…");
  const { error } = await supabase.auth.verifyOtp({ phone: fullPhone, token, type: "sms" });
  if(error){ say("验证失败：" + error.message, false); return; }
  say("登录成功。"); boot();
});

// ===== Recovery：设置新密码 =====
async function handleRecoveryIfNeeded(){
  const hash = location.hash || "";
  if(hash.includes("type=recovery")){
    const pane = document.getElementById("recovery-pane");
    pane.classList.remove("hidden");
    pane.classList.add("show");
  }
}
const recoveryForm = $("#recovery-form");
if(recoveryForm){
  recoveryForm.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const newPw = $("#recovery-password").value;
    if(!newPw){ say("请输入新密码。", false); return; }
    say("更新密码中…");
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if(error){ say("更新失败：" + error.message, false); return; }
    say("密码已更新，请使用新密码登录。");
    history.replaceState(null, "", location.pathname + location.search);
  });
}

// ===== 修改密码（登录态内） =====
const pwDialog = $("#pw-dialog");
const changePwBtn = $("#change-pw-btn");
const pwForm = $("#pw-form");
changePwBtn.addEventListener("click", ()=>{ pwDialog.showModal(); });
pwForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const newPw = $("#pw-new").value;
  if(!newPw){ say("请输入新密码。", false); return; }
  if(newPw.length < 8){ say("密码至少 8 位。", false); return; }
  say("修改中…");
  const { error } = await supabase.auth.updateUser({ password: newPw });
  if(error){ say("修改失败：" + error.message, false); return; }
  say("密码已修改。"); pwDialog.close();
});

// ===== 退出 =====
const logoutBtn = $("#logout-btn");
logoutBtn.addEventListener("click", async ()=>{
  await supabase.auth.signOut();
  document.getElementById("tx-tbody").innerHTML = "";
  appSection.classList.add("hidden");
  authSection.classList.remove("hidden");
  say("已退出登录。");
});

// ===== 交易：自动金额/保存/渲染/导出 =====
const tradeForm = $("#trade-form");
const refreshBtn  = $("#refresh-btn");
const exportBtn   = $("#export-btn");
const tbody       = $("#tx-tbody");

function recalcAmount(){
  const qty   = parseFloat($("#qty").value)   || 0;
  const price = parseFloat($("#price").value) || 0;
  const fee   = parseFloat($("#fee").value)   || 0;
  const amount = qty * price + fee;
  $("#amount").value = amount ? amount.toFixed(8) : "";
}
["qty","price","fee"].forEach(id => $("#"+id).addEventListener("input", recalcAmount));

tradeForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){ say("未登录，无法保存。", false); return; }

  const tsLocal = $("#trade_time").value;
  if(!tsLocal){ say("请填写交易时间。", false); return; }
  const trade_time = new Date(tsLocal);
  if(isNaN(trade_time.getTime())){ say("交易时间格式不正确。", false); return; }

  const payload = {
    user_id: user.id,
    trade_time: trade_time.toISOString(),
    symbol: $("#symbol").value.trim().toUpperCase(),
    side: $("#side").value,
    qty: parseFloat($("#qty").value),
    price: parseFloat($("#price").value),
    fee: parseFloat($("#fee").value || "0"),
    amount: parseFloat($("#amount").value || "0"),
    notes: $("#notes").value.trim()
  };

  if(!payload.symbol || !payload.qty || !payload.price){
    say("请完整填写币种/数量/价格。", false); return;
  }

  $("#save-btn").disabled = true;
  say("保存中…");
  const { error } = await supabase.from("transactions").insert(payload);
  $("#save-btn").disabled = false;
  if(error){ say("❌ 提交失败：" + error.message, false); return; }

  say("✅ 已保存。");
  $("#qty").value = ""; $("#price").value = ""; $("#fee").value = "0";
  $("#amount").value = ""; $("#notes").value = "";
  await loadTable();
});

async function loadTable(){
  const { data: { user } } = await supabase.auth.getUser();
  if(!user) return;
  say("读取数据…");
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("trade_time", { ascending: false });
  if(error){ say("加载失败：" + error.message, false); return; }

  tbody.innerHTML = "";
  (data || []).forEach(row=>{
    const tr = document.createElement("tr");
    const time = new Date(row.trade_time).toLocaleString();
    tr.innerHTML = `
      <td>${time}</td>
      <td>${row.symbol}</td>
      <td>${row.side}</td>
      <td>${row.qty}</td>
      <td>${row.price}</td>
      <td>${row.fee}</td>
      <td>${row.amount}</td>
      <td>${row.notes ? row.notes.replaceAll("<","&lt;") : ""}</td>
      <td><button data-id="${row.id}" class="del">删除</button></td>
    `;
    tbody.appendChild(tr);
  });

  [...document.querySelectorAll("button.del")].forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-id");
      if(!confirm("确定删除这条记录吗？")) return;
      btn.disabled = true;
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      btn.disabled = false;
      if(error){ say("删除失败：" + error.message, false); return; }
      say("已删除。"); await loadTable();
    });
  });

  say(`共 ${data?.length || 0} 条记录。`);
}
refreshBtn.addEventListener("click", loadTable);

exportBtn.addEventListener("click", async ()=>{
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){ say("未登录。", false); return; }
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("trade_time", { ascending: false });
  if(error){ say("导出失败：" + error.message, false); return; }

  const header = ["trade_time","symbol","side","qty","price","fee","amount","notes"];
  const lines = [header.join(",")];
  (data || []).forEach(r=>{
    const row = [
      new Date(r.trade_time).toISOString(),
      r.symbol, r.side, r.qty, r.price, r.fee, r.amount,
      (r.notes || "").replaceAll('"','""')
    ].map(v=>{
      const s = `${v ?? ""}`;
      return /[",\n]/.test(s) ? `"${s}"` : s;
    });
    lines.push(row.join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "transactions.csv"; a.click();
  URL.revokeObjectURL(url);
  say("已导出 CSV。");
});
