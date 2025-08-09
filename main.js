// ===== 配置与初始化 =====
if(!window.APP_CONFIG){ alert("缺少 config/config.js 配置"); }
const { SUPABASE_URL, SUPABASE_ANON_KEY, VERSION, ENV } = window.APP_CONFIG;
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== DOM =====
const $ = (s)=>document.querySelector(s);
const statusBar = $("#status");
const authSection = $("#auth-section");
const appSection  = $("#app-section");
const buildInfo   = $("#build-info");
const userEmailEl = $("#user-email");

// tabs
const tabs = document.querySelectorAll(".tab");
const panes = document.querySelectorAll(".tabpane");
tabs.forEach(btn=>btn.addEventListener("click", ()=>{
  tabs.forEach(b=>b.classList.remove("active"));
  panes.forEach(p=>p.classList.remove("show"));
  btn.classList.add("active");
  const id = "tab-" + btn.dataset.tab;
  const pane = document.getElementById(id);
  if(pane) pane.classList.add("show");
}));

function say(msg, ok=true){
  statusBar.textContent = msg;
  statusBar.style.background = ok ? "#122" : "#2a1111";
  statusBar.style.color = ok ? "#9fd" : "#f6b";
}

buildInfo.textContent = `版本: ${VERSION} | 环境: ${ENV}`;

// ===== Boot：处理恢复链接与登录状态 =====
async function boot(){
  await handleRecoveryIfNeeded();
  const { data: { user } } = await supabase.auth.getUser();
  if(user){
    userEmailEl.textContent = user.email || "";
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

// ===== 登录 =====
const loginForm = $("#login-form");
loginForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  if(!email || !password){ say("邮箱/密码不能为空", false); return; }
  $("#login-btn").disabled = true;
  say("登录中…");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  $("#login-btn").disabled = false;
  if(error){ say("登录失败：" + error.message, false); return; }
  say("登录成功。"); boot();
});

// ===== 注册 =====
const regForm = $("#register-form");
regForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#reg-email").value.trim();
  const password = $("#reg-password").value;
  if(!email || !password){ say("邮箱/密码不能为空", false); return; }
  $("#reg-btn").disabled = true;
  say("注册中…");
  // 注册（如果开启邮件确认，会要求去邮箱确认）
  const redirectTo = location.origin + location.pathname; // 允许在 Supabase → Auth → URL 配置里加入此回调
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
  $("#reg-btn").disabled = false;
  if(error){ say("注册失败：" + error.message, false); return; }
  say("注册成功。若启用邮箱确认，请到邮箱点击确认链接后再登录。");
});

// ===== 忘记密码：发送重置邮件 =====
const forgotForm = $("#forgot-form");
forgotForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#forgot-email").value.trim();
  if(!email){ say("请输入邮箱。", false); return; }
  const redirectTo = location.origin + location.pathname; // 回到本页进行重置
  say("发送重置邮件中…");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if(error){ say("发送失败：" + error.message, false); return; }
  say("已发送重置邮件，请查收。");
});

// ===== 重置密码：如果 URL 是 recovery，就显示设置新密码 UI 并更新密码 =====
async function handleRecoveryIfNeeded(){
  const hash = location.hash || "";
  if(hash.includes("type=recovery")){
    // 显示重置 pane
    document.getElementById("recovery-pane").classList.remove("hidden");
    document.getElementById("recovery-pane").classList.add("show");
    document.querySelector('[data-tab="login"]').classList.remove("active");
    document.querySelector('[data-tab="register"]').classList.remove("active");
    document.querySelector('[data-tab="forgot"]').classList.remove("active");
  }
}
const recoveryForm = $("#recovery-form");
if(recoveryForm){
  recoveryForm.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const newPw = $("#recovery-password").value;
    if(!newPw){ say("请输入新密码。", false); return; }
    say("更新密码中…");
    const { data, error } = await supabase.auth.updateUser({ password: newPw });
    if(error){ say("更新失败：" + error.message, false); return; }
    say("密码已更新，请使用新密码登录。");
    // 清理 URL hash
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

// ===== 交易表单与列表（沿用基座） =====
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
