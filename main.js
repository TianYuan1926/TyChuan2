// ===== 0) 读取配置并初始化 Supabase =====
(function(){
  if(!window.APP_CONFIG){ alert("缺少 config/config.js 配置"); return; }
})();

const { SUPABASE_URL, SUPABASE_ANON_KEY, VERSION, ENV } = window.APP_CONFIG;
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== 1) DOM 引用与小工具 =====
const $ = (s)=>document.querySelector(s);
const statusBar = $("#status");
const authSection = $("#auth-section");
const appSection  = $("#app-section");
const loginForm   = $("#login-form");
const logoutBtn   = $("#logout-btn");
const tradeForm   = $("#trade-form");
const refreshBtn  = $("#refresh-btn");
const exportBtn   = $("#export-btn");
const tbody       = $("#tx-tbody");
const userEmailEl = $("#user-email");
const buildInfo   = $("#build-info");

function say(msg, ok=true){
  statusBar.textContent = msg;
  statusBar.style.background = ok ? "#122" : "#2a1111";
  statusBar.style.color = ok ? "#9fd" : "#f6b";
}

buildInfo.textContent = `版本: ${VERSION} | 环境: ${ENV}`;

// ===== 2) 启动：检查登录状态 =====
async function boot(){
  say("检查登录状态…");
  const { data: { user } } = await supabase.auth.getUser();
  if (user){
    userEmailEl.textContent = user.email || "";
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    say("已登录，加载数据中…");
    await loadTable();
  } else {
    authSection.classList.remove("hidden");
    appSection.classList.add("hidden");
    say("请先登录。");
  }
}
boot();

// ===== 3) 登录/登出 =====
loginForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#email").value.trim();
  const password = $("#password").value;
  if(!email || !password){ say("邮箱/密码不能为空", false); return; }
  $("#login-btn").disabled = true;
  say("登录中…");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  $("#login-btn").disabled = false;
  if(error){ say("登录失败：" + error.message, false); return; }
  say("登录成功。");
  await boot();
});

logoutBtn.addEventListener("click", async ()=>{
  await supabase.auth.signOut();
  tbody.innerHTML = "";
  appSection.classList.add("hidden");
  authSection.classList.remove("hidden");
  say("已退出登录。");
});

// ===== 4) 表单：自动计算 amount =====
function recalcAmount(){
  const qty   = parseFloat($("#qty").value)   || 0;
  const price = parseFloat($("#price").value) || 0;
  const fee   = parseFloat($("#fee").value)   || 0;
  const amount = qty * price + fee;
  $("#amount").value = amount ? amount.toFixed(8) : "";
}
["qty","price","fee"].forEach(id => $("#"+id).addEventListener("input", recalcAmount));

// ===== 5) 保存交易 =====
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
  // 清理部分字段
  $("#qty").value = "";
  $("#price").value = "";
  $("#fee").value = "0";
  $("#amount").value = "";
  $("#notes").value = "";
  await loadTable();
});

// ===== 6) 读取 & 渲染表格 =====
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

  // 绑定删除
  [...document.querySelectorAll("button.del")].forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-id");
      if(!confirm("确定删除这条记录吗？")) return;
      btn.disabled = true;
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      btn.disabled = false;
      if(error){ say("删除失败：" + error.message, false); return; }
      say("已删除。");
      await loadTable();
    });
  });

  say(`共 ${data?.length || 0} 条记录。`);
}
refreshBtn.addEventListener("click", loadTable);

// ===== 7) 导出 CSV =====
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
