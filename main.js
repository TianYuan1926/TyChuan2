// ===== 配置与初始化 =====
const { SUPABASE_URL, SUPABASE_ANON_KEY, VERSION, ENV } = window.APP_CONFIG;
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s)=>document.querySelector(s);
const statusBar = $("#status");
const authSection = $("#auth-section");
const appSection  = $("#app-section");
const userEmailEl = $("#user-email");
const buildInfo = $("#build-info");
const verifyBanner = $("#verify-banner");
buildInfo.textContent = `版本: ${VERSION} | 环境: ${ENV}`;

function say(msg, ok=true){
  statusBar.textContent = msg;
  statusBar.style.background = ok ? "#122" : "#2a1111";
  statusBar.style.color = ok ? "#9fd" : "#f6b";
}

// ===== 启动 =====
async function boot(){
  say("检查登录状态…");
  const { data: { user } } = await supabase.auth.getUser();
  if(user){
    userEmailEl.textContent = user.email || "";
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    // 未验证提醒
    const needVerify = (!user.email_confirmed_at && !user.phone);
    verifyBanner.classList.toggle("hidden", !needVerify);
    say("已登录，加载数据…");
    await loadTable();
  }else{
    authSection.classList.remove("hidden");
    appSection.classList.add("hidden");
    say("请先登录。");
  }
}
boot();

// ===== 登录/退出 =====
document.getElementById("login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if(!email || !password){ say("邮箱/密码不能为空", false); return; }
  say("登录中…");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if(error){ say("登录失败：" + error.message, false); return; }
  say("登录成功。"); boot();
});
document.getElementById("logout-btn").addEventListener("click", async ()=>{
  await supabase.auth.signOut();
  document.getElementById("tx-tbody").innerHTML = "";
  appSection.classList.add("hidden");
  authSection.classList.remove("hidden");
  say("已退出登录。");
});

// ===== 自动计算 amount =====
function recalcAmount(){
  const qty   = parseFloat(document.getElementById("qty").value)   || 0;
  const price = parseFloat(document.getElementById("price").value) || 0;
  const fee   = parseFloat(document.getElementById("fee").value)   || 0;
  const amount = qty * price + fee;
  document.getElementById("amount").value = amount ? amount.toFixed(8) : "";
}
["qty","price","fee"].forEach(id => document.getElementById(id).addEventListener("input", recalcAmount));

// ===== 保存：调用后端 RPC（带验证门禁） =====
document.getElementById("trade-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){ say("未登录，无法保存。", false); return; }

  const tsLocal = document.getElementById("trade_time").value;
  if(!tsLocal){ say("请填写交易时间。", false); return; }
  const trade_time = new Date(tsLocal);
  if(isNaN(trade_time.getTime())){ say("交易时间格式不正确。", false); return; }

  const args = {
    p_trade_time: trade_time.toISOString(),
    p_symbol: document.getElementById("symbol").value.trim().toUpperCase(),
    p_side: document.getElementById("side").value,
    p_qty: parseFloat(document.getElementById("qty").value),
    p_price: parseFloat(document.getElementById("price").value),
    p_fee: parseFloat(document.getElementById("fee").value || "0"),
    p_amount: parseFloat(document.getElementById("amount").value || "0"),
    p_notes: document.getElementById("notes").value.trim()
  };
  if(!args.p_symbol || !args.p_qty || !args.p_price){ say("请完整填写币种/数量/价格。", false); return; }

  say("保存中…");
  const { data, error } = await supabase.rpc("insert_transaction_secure", args);
  if(error){
    say("❌ 提交失败：" + (error.message || "未知错误"), false);
    return;
  }
  say("✅ 已保存。");
  document.getElementById("qty").value = "";
  document.getElementById("price").value = "";
  document.getElementById("fee").value = "0";
  document.getElementById("amount").value = "";
  document.getElementById("notes").value = "";
  await loadTable();
});

// ===== 列表与删除 =====
const tbody = document.getElementById("tx-tbody");
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
  (data||[]).forEach(row=>{
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
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if(error){ say("删除失败：" + error.message, false); return; }
      say("已删除。"); await loadTable();
    });
  });
  say(`共 ${data?.length || 0} 条记录。`);
}
document.getElementById("refresh-btn").addEventListener("click", loadTable);

// ===== 导出 CSV =====
document.getElementById("export-btn").addEventListener("click", async ()=>{
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
  (data||[]).forEach(r=>{
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
