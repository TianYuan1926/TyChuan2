/* config.js - store Supabase URL/KEY in localStorage and provide client factory */
(function(){
  const K_URL='sp_url', K_KEY='sp_key';
  function setSupabaseConfig(url,key){ localStorage.setItem(K_URL,url); localStorage.setItem(K_KEY,key); }
  function getSupabaseConfig(){ return { url: localStorage.getItem(K_URL)||'', key: localStorage.getItem(K_KEY)||'' }; }
  function getSupabase(){
    const {url,key}=getSupabaseConfig();
    if(!url||!key){
      if(!location.pathname.endsWith('/config.html')){
        const next = encodeURIComponent(location.pathname.split('/').pop() || 'app.html');
        location.href = 'config.html?next='+next;
      }
      throw new Error('Supabase 未配置');
    }
    return window.supabase.createClient(url, key);
  }
  async function requireAuth(){
    const sb = getSupabase();
    const { data:{ session } } = await sb.auth.getSession();
    return session?.user || null;
  }
  window.sbConfig = { setSupabaseConfig, getSupabaseConfig, getSupabase, requireAuth };
})();
