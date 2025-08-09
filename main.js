
/* P9g-NavClickFix: restore side-menu click actions without changing HTML/CSS.
   - Works even if menu items are plain divs/spans. 
   - Guards: only after login; no effect on auth screens.
   - Zero side-effects to captcha / forms.
*/
(function(){
  const READY = () => document.readyState === 'complete' || document.readyState === 'interactive';
  const onReady = (fn)=> { if(READY()) fn(); else document.addEventListener('DOMContentLoaded', fn); };

  function isLoggedIn(){
    try {
      const s = JSON.parse(localStorage.getItem('supabase.auth.token'));
      return !!(s && s.currentSession && s.currentSession.access_token);
    } catch { return false; }
  }

  // Generic show/hide for panels. We support multiple possible selectors for compatibility.
  const PANEL_SELECTORS = {
    journal: ['#panel-journal', '#panel-log', '#journal', '[data-view-panel="journal"]', '#tx-section', '.view-journal'],
    security:['#panel-security', '#security', '[data-view-panel="security"]', '#security-events', '.view-security']
  };
  function qsAny(selectors){
    for (const s of selectors){ const el = document.querySelector(s); if(el) return el; }
    return null;
  }
  function showPanel(which){
    const journal = qsAny(PANEL_SELECTORS.journal);
    const security = qsAny(PANEL_SELECTORS.security);
    if(!journal && !security) return; // nothing to switch, fail silently
    if(which === 'security'){
      if(security){ security.style.display=''; security.hidden=false; }
      if(journal){ journal.style.display='none'; journal.hidden=true; }
      localStorage.setItem('tj_active_panel','security');
    }else{
      if(journal){ journal.style.display=''; journal.hidden=false; }
      if(security){ security.style.display='none'; security.hidden=true; }
      localStorage.setItem('tj_active_panel','journal');
    }
  }
  function getTargetPanel(el){
    if(!el) return null;
    const text = (el.textContent||'').trim();
    const mapText = (t)=>{
      if(!t) return null;
      if(/安全/.test(t) || /security/i.test(t)) return 'security';
      if(/日志/.test(t) || /journal|log/i.test(t)) return 'journal';
      return null;
    };
    if(el.dataset){
      if(el.dataset.nav || el.dataset.view || el.dataset.panel){
        return el.dataset.nav || el.dataset.view || el.dataset.panel;
      }
      if(el.hasAttribute('data-nav-security')) return 'security';
      if(el.hasAttribute('data-nav-journal')) return 'journal';
    }
    if(el.matches && el.matches('a[href^="#"]')){
      const h = el.getAttribute('href').toLowerCase();
      if(h.includes('security')) return 'security';
      if(h.includes('journal') || h.includes('log')) return 'journal';
    }
    const r = mapText(text);
    if(r) return r;
    const parent = el.parentElement;
    return parent ? getTargetPanel(parent) : null;
  }

  onReady(function(){
    // Restore last panel
    const last = localStorage.getItem('tj_active_panel');
    if(isLoggedIn()){ showPanel(last==='security'?'security':'journal'); }

    // Global click delegation
    document.addEventListener('click', function(e){
      const el = e.target;
      const which = getTargetPanel(el);
      if(!which) return;
      if(!isLoggedIn()) return; // must login first
      e.preventDefault();
      showPanel(which);
    }, true);
  });
})();
