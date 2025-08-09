
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = (s)=>document.querySelector(s);
const statusBar = $("#status"); const buildInfo=$("#build-info");
if(buildInfo){ buildInfo.textContent = `版本: ${cfg.VERSION} | 环境: ${cfg.ENV}`; }
function say(msg, ok=true){ statusBar.textContent=msg; statusBar.style.background= ok?'#122':'#2a1111'; statusBar.style.color=ok?'#9fd':'#f6b'; toast(ok?'成功':'出错', msg, ok?'ok':'err'); playSound(ok?'ok':'err'); }

// WebAudio 提示音（无外部文件）
let audioCtx;
function playSound(type='ok'){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    const now = audioCtx.currentTime;
    if(type==='ok'){ o.frequency.setValueAtTime(880, now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.04, now+0.01); g.gain.exponentialRampToValueAtTime(0.0001, now+0.2); }
    else { o.frequency.setValueAtTime(220, now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.06, now+0.01); g.gain.exponentialRampToValueAtTime(0.0001, now+0.35); }
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(now + (type==='ok'?0.22:0.4));
  }catch{}
}

// Toast
function toast(title, msg, type='ok'){
  const wrap = $("#toasts");
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<span class="t-close" aria-label="关闭">×</span><div class="t-title">${title}</div><div class="t-msg">${msg}</div>`;
  wrap.appendChild(div);
  const killer = setTimeout(()=>{ div.remove(); }, 3500);
  div.querySelector('.t-close').onclick = ()=>{ clearTimeout(killer); div.remove(); };
}

// Tabs
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tabpane").forEach(p=>p.classList.remove("show"));
    btn.classList.add("active");
    $("#tab-"+btn.dataset.tab).classList.add("show");
    setTimeout(renderCaptchas,0);
  });
});

// hCaptcha 稳定渲染
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

// 按钮 loading 装饰器
function withLoading(btn, fn){
  return async (...args)=>{
    btn.classList.add('loading'); btn.disabled=true;
    try{ await fn(...args); } finally { btn.classList.remove('loading'); btn.disabled=false; }
  };
}

// 登录
const loginBtn = $("#login-btn");
$("#login-form").addEventListener("submit", withLoading(loginBtn, async (e)=>{
  e.preventDefault();
  let token=hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-login']):'';
  if(!token) return say('请先完成验证码', false);
  const email=$("#login-email").value.trim();
  const password=$("#login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password, options:{ captchaToken: token }});
  if(error) return say('登录失败：'+error.message, false);
  say('登录成功'); boot();
}));

// 魔法链接
$("#btn-magic").addEventListener("click", async ()=>{
  const email = prompt("输入邮箱（将发送登录链接）");
  if(!email) return;
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if(error) return say('发送失败：'+error.message, false);
  say('已发送登录链接，请查收邮件');
});

// 注册
const regBtn = $("#reg-btn");
$("#register-form").addEventListener("submit", withLoading(regBtn, async (e)=>{
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
}));

// 忘记密码
const forgotBtn = $("#forgot-btn");
$("#forgot-form").addEventListener("submit", withLoading(forgotBtn, async (e)=>{
  e.preventDefault();
  let token=hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-forgot']):'';
  if(!token) return say('请先完成验证码', false);
  const email=$("#forgot-email").value.trim();
  const redirectTo=location.origin+location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
  if(error) return say('发送失败：'+error.message, false);
  say('已发送重置密码邮件，请查收。');
}));

// App
async function boot(){
  const { data:{ user } } = await supabase.auth.getUser();
  if(user){
    $("#auth-section").classList.add("hidden");
    $("#app-section").classList.remove("hidden");
    $("#user-email").textContent = user.email||'';
    const unverified = !user.email_confirmed_at;
    $("#verify-banner").classList.toggle("hidden", !unverified);
    loadTable();
  }else{
    $("#app-section").classList.add("hidden");
    $("#auth-section").classList.remove("hidden");
  }
}
boot();

// 表单计算
function recalc(){ const q=parseFloat($("#qty").value)||0, p=parseFloat($("#price").value)||0, f=parseFloat($("#fee").value)||0; $("#amount").value=(q*p+f)||''; }
['qty','price','fee'].forEach(id=>$("#"+id).addEventListener('input', recalc));

// 保存记录
const saveBtn = $("#save-btn");
$("#trade-form").addEventListener("submit", withLoading(saveBtn, async (e)=>{
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
  say('已保存'); await loadTable();
}));

// 刷新 + 导出
$("#refresh-btn").addEventListener("click", ()=>loadTable());
$("#export-btn").addEventListener("click", async ()=>{
  const { data:{ user } } = await supabase.auth.getUser();
  if(!user) return say('未登录', false);
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('trade_time',{ascending:false});
  if(error) return say('导出失败：'+error.message, false);
  const header=['trade_time','symbol','side','qty','price','fee','amount','notes'];
  const lines=[header.join(',')];
  (data||[]).forEach(r=>{ const row=[new Date(r.trade_time).toISOString(),r.symbol,r.side,r.qty,r.price,r.fee,r.amount,(r.notes||'').replaceAll('\"','\"\"')].map(s=>{s=`${s??''}`; return /[\",\n]/.test(s)?`\"${s}\"`:s;}); lines.push(row.join(',')); });
  const blob=new Blob([lines.join('\\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='transactions.csv'; a.click(); URL.revokeObjectURL(url);
  say('已导出 CSV');
});

// 导入
const importDlg = $("#import-dialog");
$("#btn-open-import").addEventListener("click", ()=>importDlg.showModal());
$("#import-go").addEventListener("click", async (e)=>{
  e.preventDefault();
  const file = $("#import-file").files?.[0];
  if(!file) return say('请先选择 CSV 文件', false);
  const text = await file.text();
  const rows = text.split(/\r?\n/).filter(Boolean);
  const header = rows.shift();
  let ok=0, fail=0;
  for(const line of rows){
    const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(s=>s.replace(/^"|"$/g,'').replace(/""/g,'"')) || [];
    if(cols.length<8){ fail++; continue; }
    const [t,sym,side,qty,price,fee,amount,notes] = cols;
    const payload = {
      trade_time: new Date(t).toISOString(), symbol: sym.toUpperCase(), side,
      qty: parseFloat(qty), price: parseFloat(price), fee: parseFloat(fee||'0'),
      amount: parseFloat(amount||'0'), notes
    };
    const { data:{ user } } = await supabase.auth.getUser();
    if(!user) break;
    payload.user_id = user.id;
    const { error } = await supabase.from('transactions').insert(payload);
    if(error) fail++; else ok++;
  }
  say(`导入完成：成功 ${ok} 条，失败 ${fail} 条`, fail===0);
  importDlg.close();
});

// 表加载 + 骨架
const tbody = $("#tx-tbody"); const skeleton=$("#table-skeleton");
async function loadTable(){
  const { data:{ user } } = await supabase.auth.getUser(); if(!user) return;
  tbody.innerHTML=''; skeleton.classList.remove('hidden');
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('trade_time',{ascending:false});
  skeleton.classList.add('hidden');
  if(error) return say('加载失败：'+error.message, false);
  (data||[]).forEach(r=>{
    const tr=document.createElement('tr');
    tr.className='rise';
    tr.innerHTML = `<td>${new Date(r.trade_time).toLocaleString()}</td><td>${r.symbol}</td><td>${r.side}</td><td>${r.qty}</td><td>${r.price}</td><td>${r.fee}</td><td>${r.amount}</td><td>${(r.notes||'').replace(/\n/g,'<br>')}</td><td><button class="ghost small del" data-id="${r.id}">删除</button></td>`;
    tbody.appendChild(tr);
  });
  [...document.querySelectorAll('button.del')].forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm('确定删除这条记录？')) return;
    const id = btn.dataset.id;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if(error) return say('删除失败：'+error.message, false);
    say('已删除'); await loadTable();
  }));
}

$("#logout-btn").addEventListener("click", async ()=>{ await supabase.auth.signOut(); say('已退出'); location.reload(); });
