// Init banner fix: ensures '初始化中…' won't stick
(function(){
  const cfg = window.APP_CONFIG || {};
  const supabase = window.supabase?.createClient?.(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = (s)=>document.querySelector(s);
  const banner = $("#status");
  if(!banner){ return; }

  function setBanner(msg, ok=true){
    banner.textContent = msg || '';
    banner.style.background = ok ? '#122' : '#2a1111';
    banner.style.color = ok ? '#9fd' : '#f6b';
  }
  function hideBannerLater(delay=1500){
    setTimeout(()=>{ banner.style.transition='opacity .35s ease'; banner.style.opacity='0'; }, delay);
    setTimeout(()=>{ banner.style.display='none'; }, delay+400);
  }

  // Hard timeout: replace '初始化中…' after 3s even if boot not finished
  setTimeout(()=>{
    if(banner && /初始化中/.test(banner.textContent)){
      setBanner('请先登录或注册');
      hideBannerLater();
    }
  }, 3000);

  async function boot(){
    try{
      if(!supabase){ setBanner('配置未就绪：请检查 config/config.js 是否加载', false); return; }
      const { data:{ user }, error } = await supabase.auth.getUser();
      if(error){ setBanner('初始化失败：'+error.message, false); return; }
      if(user){
        setBanner('已登录');
      }else{
        setBanner('请先登录或注册');
      }
      hideBannerLater();
    }catch(e){
      setBanner('初始化失败', false);
    }
  }

  // run as soon as possible
  boot();

  // also expose for other scripts to call if they want to re-hide later
  window.__INIT_BANNER__ = { setBanner, hideBannerLater };
})();