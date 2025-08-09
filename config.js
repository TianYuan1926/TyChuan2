/** config.js - config & Supabase client factory (preloaded with user's URL/KEY) */
(function(){
  const K_URL='sp_url', K_KEY='sp_key';
  const DEFAULT_URL = "https://wbvwdqgkgopjqmxeibrf.supabase.co";
  const DEFAULT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidndkcWdrZ29wanFteGVpYnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NTc4NDEsImV4cCI6MjA3MDMzMzg0MX0.1xotlETbjPA5U8Hn8i0tt79J_djr9Fkldk9kSPSdxa8";

  // On first load, if not set, preload with provided URL/KEY
  if(!localStorage.getItem(K_URL) || !localStorage.getItem(K_KEY)) {
    localStorage.setItem(K_URL, DEFAULT_URL);
    localStorage.setItem(K_KEY, DEFAULT_KEY);
  }

  function setSupabaseConfig(url,key){ localStorage.setItem(K_URL,url); localStorage.setItem(K_KEY,key); }
  function getSupabaseConfig(){ return { url: localStorage.getItem(K_URL)||'', key: localStorage.getItem(K_KEY)||'' }; }
  function hasConfig(){ const {url,key}=getSupabaseConfig(); return !!(url && key); }
  function getSupabase(){
    const {url,key} = getSupabaseConfig();
    if(!url || !key){ if(!location.pathname.endsWith('/config.html')) location.href = 'config.html?next=' + encodeURIComponent(location.pathname.replace(/^\//,'')); throw new Error('Supabase 未配置'); }
    return window.supabase.createClient(url, key);
  }
  async function requireAuth(){
    const sb = getSupabase();
    const { data:{ session } } = await sb.auth.getSession();
    return session?.user || null;
  }
  window.sbConfig = { setSupabaseConfig, getSupabaseConfig, hasConfig, getSupabase, requireAuth };
})();
