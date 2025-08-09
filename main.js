// ===== 初始化 =====
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = (s)=>document.querySelector(s);
const statusBar = $("#status");
const buildInfo = $("#build-info");
if(buildInfo){ buildInfo.textContent = `版本: ${cfg.VERSION} | 环境: ${cfg.ENV}`; }

function say(msg, ok=true){ statusBar.textContent=msg; statusBar.style.background= ok?'#122':'#2a1111'; statusBar.style.color=ok?'#9fd':'#f6b'; }

// 密码显示切换
document.addEventListener("click", (e)=>{
  const t = e.target.closest(".pw-toggle");
  if(!t) return;
  const id = t.getAttribute("data-target");
  const input = document.getElementById(id);
  if(!input) return;
  input.type = (input.type==='password')?'text':'password';
  t.textContent = (input.type==='password')?'显示':'隐藏';
});

// tabs
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tabpane").forEach(p=>p.classList.remove("show"));
    btn.classList.add("active");
    document.getElementById("tab-"+btn.dataset.tab).classList.add("show");
    setTimeout(renderCaptchas, 0);
  });
});

// hCaptcha 稳定渲染
let widgetIds = {}, hLoaded = false;
window.hcaptchaOnLoad = ()=>{ hLoaded = true; renderCaptchas(); };
function renderOne(id){
  if(!hLoaded || !window.hcaptcha) return;
  const el = document.getElementById(id);
  if(!el) return;
  if(widgetIds[id]!==undefined){ try{ window.hcaptcha.reset(widgetIds[id]); }catch{} return; }
  if(el.offsetParent===null || el.clientHeight===0){ setTimeout(()=>renderOne(id), 200); return; }
  el.setAttribute('data-sitekey', cfg.HCAPTCHA_SITEKEY||'');
  widgetIds[id] = window.hcaptcha.render(id);
}
function renderCaptchas(){ ['captcha-login','captcha-register','captcha-forgot'].forEach(renderOne); }

// 登录
const loginForm = document.getElementById("login-form");
loginForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  let token = hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-login']):'';
  if(!token) return say('请先完成验证码', false);
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: token } });
  if(error) return say('登录失败：'+error.message, false);
  say('登录成功'); boot();
});

// 注册 —— 密码策略
const POLICY = cfg.PASSWORD_POLICY || {};
const COMMON = new Set(["123456", "123456789", "12345678", "12345", "qwerty", "abc123", "password", "111111", "123123", "qwerty123", "1q2w3e4r", "admin", "iloveyou", "000000", "password1", "1234abcd", "dragon", "sunshine", "princess", "letmein", "football", "monkey"]);
const pw = document.getElementById("reg-password"), pw2 = document.getElementById("reg-password2");
const meter = document.querySelector("#pw-meter>div");
const minLenText = document.getElementById('minLenText'); minLenText.textContent = POLICY.MIN_LENGTH||10;

function evalPolicy(v){ 
  const rules = {
    len: (v.length >= (POLICY.MIN_LENGTH||10)),
    upper: !POLICY.REQUIRE_UPPER || /[A-Z]/.test(v),
    lower: !POLICY.REQUIRE_LOWER || /[a-z]/.test(v),
    digit: !POLICY.REQUIRE_DIGIT || /\d/.test(v),
    symbol: !POLICY.REQUIRE_SYMBOL || /[^A-Za-z0-9]/.test(v),
    blacklist: !COMMON.has(v)
  };
  let score = 0; Object.keys(rules).forEach(k=>{ if(rules[k]) score++; });
  return {rules, score};
}
function renderPolicy(v, ulScope='#tab-register'){ 
  const {rules, score} = evalPolicy(v);
  if(meter) meter.style.width = Math.min(100, score/6*100)+'%';
  document.querySelectorAll(ulScope+' .pw-reqs li').forEach(li=>{ const key=li.getAttribute('data-req'); li.classList.toggle('ok', !!rules[key]); });
  return rules;
}
pw.addEventListener('input', ()=> renderPolicy(pw.value));

document.getElementById('btn-hibp-check').addEventListener('click', async ()=>{ 
  if(!cfg.PASSWORD_POLICY.ENABLE_HIBP) return say('已关闭泄露检查（保持纯 GitHub+Supabase）', false);
  const v = pw.value.trim(); if(!v) return say('请先输入密码', false);
  const sha1 = await sha1Hex(v); const prefix = sha1.slice(0,5); const suffix = sha1.slice(5).toUpperCase();
  const res = await fetch('https://api.pwnedpasswords.com/range/'+prefix); const txt = await res.text();
  const found = txt.split('\n').some(line=> line.startsWith(suffix+':'));
  const hibpLi = document.querySelector('#tab-register .pw-reqs li[data-req="hibp"]');
  hibpLi.classList.toggle('ok', !found);
  say(found? '⚠ 该密码出现在泄露库，建议更换':'未发现泄露记录');
});

document.getElementById("register-form").addEventListener("submit", async (e)=>{ 
  e.preventDefault();
  let token = hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-register']):'';
  if(!token) return say('请先完成验证码', false);
  const email = document.getElementById("reg-email").value.trim();
  const v1 = pw.value, v2 = pw2.value;
  if(v1!==v2) return say('两次密码不一致', false);
  const rules = evalPolicy(v1).rules;
  const must = ['len','upper','lower','digit','symbol','blacklist'];
  const passed = must.every(k=>rules[k]);
  if(!passed) return say('密码不符合策略要求', false);
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase.auth.signUp({ email, password: v1, options: { emailRedirectTo: redirectTo, captchaToken: token } });
  if(error) return say('注册失败：'+error.message, false);
  say('注册成功。若启用邮箱确认，请到邮箱点击确认链接后再登录。');
});

// 忘记密码
document.getElementById("forgot-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  let token = hLoaded? window.hcaptcha.getResponse(widgetIds['captcha-forgot']):'';
  if(!token) return say('请先完成验证码', false);
  const email = document.getElementById("forgot-email").value.trim();
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: token });
  if(error) return say('发送失败：'+error.message, false);
  say('已发送重置邮件，请查收。');
});

// 修改密码（需验证旧密码）
const pwDlg = document.getElementById('pw-dialog');
document.getElementById('change-pw-btn').addEventListener('click', ()=> pwDlg.showModal());
const pwNew = document.getElementById('pw-new'), pwNew2 = document.getElementById('pw-new2');
const meter2 = document.querySelector('#pw-meter2>div');
document.getElementById('minLenText2').textContent = POLICY.MIN_LENGTH||10;
pwNew.addEventListener('input', ()=> renderPolicy(pwNew.value, '#pw-dialog'));
document.getElementById('btn-hibp-check2').addEventListener('click', async ()=>{ 
  if(!cfg.PASSWORD_POLICY.ENABLE_HIBP) return say('已关闭泄露检查（保持纯 GitHub+Supabase）', false);
  const v = pwNew.value.trim(); if(!v) return say('请先输入新密码', false);
  const sha1 = await sha1Hex(v); const prefix = sha1.slice(0,5); const suffix = sha1.slice(5).toUpperCase();
  const res = await fetch('https://api.pwnedpasswords.com/range/'+prefix); const txt = await res.text();
  const found = txt.split('\n').some(line=> line.startsWith(suffix+':'));
  document.querySelector('#pw-dialog .pw-reqs li[data-req="hibp"]').classList.toggle('ok', !found);
  say(found? '⚠ 该密码出现在泄露库，建议更换':'未发现泄露记录');
});

document.getElementById('pw-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const oldPw = document.getElementById('pw-old').value;
  const newPw = pwNew.value, newPw2 = pwNew2.value;
  if(newPw!==newPw2) return say('两次新密码不一致', false);
  const rules = evalPolicy(newPw).rules;
  const must = ['len','upper','lower','digit','symbol','blacklist'];
  const passed = must.every(k=>rules[k]);
  if(!passed) return say('新密码不符合策略', false);
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email;
  if(!email) return say('仅邮箱账号支持改密', false);
  const { error: checkErr } = await supabase.auth.signInWithPassword({ email, password: oldPw });
  if(checkErr) return say('当前密码不正确', false);
  const { error } = await supabase.auth.updateUser({ password: newPw });
  if(error) return say('修改失败：'+error.message, false);
  say('密码已修改'); pwDlg.close();
});

// 交易记录
async function boot(){
  const { data: { user } } = await supabase.auth.getUser();
  if(user){
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    document.getElementById('user-email').textContent = user.email||'';
    const needVerify = !user.email_confirmed_at;
    document.getElementById('verify-banner').classList.toggle('hidden', !needVerify);
    await loadTable();
    say('已登录');
  }else{
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    say('请先登录或注册');
  }
}
boot();

function recalcAmount(){
  const qty=parseFloat(document.getElementById('qty').value)||0;
  const price=parseFloat(document.getElementById('price').value)||0;
  const fee=parseFloat(document.getElementById('fee').value)||0;
  document.getElementById('amount').value = ((qty*price)+fee)||'';
}
['qty','price','fee'].forEach(id=>document.getElementById(id).addEventListener('input', recalcAmount));

document.getElementById('trade-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const { data: { user } } = await supabase.auth.getUser();
  if(!user) return say('未登录', false);
  const ts = document.getElementById('trade_time').value;
  if(!ts) return say('请填写时间', false);
  const payload = {
    user_id: user.id,
    trade_time: new Date(ts).toISOString(),
    symbol: document.getElementById('symbol').value.trim().toUpperCase(),
    side: document.getElementById('side').value,
    qty: parseFloat(document.getElementById('qty').value),
    price: parseFloat(document.getElementById('price').value),
    fee: parseFloat(document.getElementById('fee').value||'0'),
    amount: parseFloat(document.getElementById('amount').value||'0'),
    notes: document.getElementById('notes').value.trim()
  };
  const { error } = await supabase.from('transactions').insert(payload);
  if(error) return say('保存失败：'+error.message, false);
  say('已保存'); await loadTable();
});

const tbody = document.getElementById('tx-tbody');
async function loadTable(){
  const { data: { user } } = await supabase.auth.getUser();
  if(!user) return;
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('trade_time',{ascending:false});
  if(error) return say('加载失败：'+error.message, false);
  tbody.innerHTML = '';
  (data||[]).forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${new Date(r.trade_time).toLocaleString()}</td><td>${r.symbol}</td><td>${r.side}</td><td>${r.qty}</td><td>${r.price}</td><td>${r.fee}</td><td>${r.amount}</td><td>${r.notes||''}</td><td><button class="del" data-id="${r.id}">删除</button></td>`;
    tbody.appendChild(tr);
  });
  [...document.querySelectorAll('button.del')].forEach(btn=>btn.addEventListener('click', async ()=>{
    const id = btn.dataset.id;
    if(!confirm('确定删除？')) return;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if(error) return say('删除失败：'+error.message, false);
    say('已删除'); await loadTable();
  }));
}

document.getElementById('refresh-btn').addEventListener('click', loadTable);
document.getElementById('export-btn').addEventListener('click', async ()=>{
  const { data: { user } } = await supabase.auth.getUser();
  if(!user) return say('未登录', false);
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('trade_time',{ascending:false});
  if(error) return say('导出失败：'+error.message, false);
  const header = ['trade_time','symbol','side','qty','price','fee','amount','notes'];
  const lines = [header.join(',')];
  (data||[]).forEach(r=>{ const row=[new Date(r.trade_time).toISOString(),r.symbol,r.side,r.qty,r.price,r.fee,r.amount,(r.notes||'').replaceAll('"','""')].map(s=>{s=`${s??''}`; return /[",\n]/.test(s)?`"${s}"`:s;}); lines.push(row.join(',')); });
  const blob = new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='transactions.csv'; a.click(); URL.revokeObjectURL(url);
  say('已导出 CSV');
});

document.getElementById('logout-btn').addEventListener('click', async ()=>{ await supabase.auth.signOut(); say('已退出'); boot(); });

// SHA1（用于 HIBP 可选）
async function sha1Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-1', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}
