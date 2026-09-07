(()=>{
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];

  const loginPanel = $('#loginPanel');
  const appPanel = $('#appPanel');
  const viewContent = $('#viewContent');
  const title = $('#viewTitle');
  const subtitle = $('#viewSubtitle');
  const contentTitle = $('#contentTitle');
  const contentKicker = $('#contentKicker');
  const loginForm = $('#loginForm');
  const loginStatus = $('#loginStatus');
  const loginSubmit = $('#loginSubmit');
  const passwordInput = $('#adminPassword');
  const togglePassword = $('#togglePassword');
  const logoutModal = $('#logoutModal');

  let current = 'dashboard';

  const viewMeta = {
    dashboard: {title:'Tableau de bord', subtitle:"Vue générale de l'activité du restaurant.", kicker:'ACTIVITÉ', content:'Vue d’ensemble'},
    orders: {title:'Commandes', subtitle:'Suivez les commandes et mettez à jour leur statut.', kicker:'COMMANDES', content:'Gestion des commandes'},
    messages: {title:'Messages', subtitle:'Consultez les demandes envoyées depuis le formulaire de contact.', kicker:'CONTACT', content:'Messages reçus'},
    menu: {title:'Carte & produits', subtitle:'Modifiez rapidement les produits visibles sur la carte.', kicker:'CARTE', content:'Produits du menu'},
    events: {title:'Événements', subtitle:'Gérez les événements publiés sur le site SAMMOLLO.', kicker:'ÉVÉNEMENTS', content:'Programmation'}
  };

  async function api(url, opts={}) {
    const response = await fetch(url, {
      ...opts,
      credentials:'same-origin',
      headers:{'Content-Type':'application/json', ...(opts.headers||{})}
    });
    const data = await response.json().catch(()=>({}));
    if (response.status === 401) {
      showLogin();
      throw new Error(data.message || 'Session expirée.');
    }
    if (!response.ok) throw new Error(data.message || 'Erreur serveur.');
    return data;
  }

  function showLogin() {
    appPanel.hidden = true;
    loginPanel.hidden = false;
    document.body.classList.remove('admin-authenticated');
    closeLogoutModal();
    window.setTimeout(()=>$('#adminEmail')?.focus(), 60);
  }

  function showApp() {
    loginPanel.hidden = true;
    appPanel.hidden = false;
    document.body.classList.add('admin-authenticated');
  }

  function setMeta(view) {
    const meta = viewMeta[view] || viewMeta.dashboard;
    title.textContent = meta.title;
    subtitle.textContent = meta.subtitle;
    contentKicker.textContent = meta.kicker;
    contentTitle.textContent = meta.content;
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function emptyState(text) {
    return `<div class="empty-state"><span class="empty-state-mark">S</span><strong>${esc(text)}</strong></div>`;
  }

  async function metrics() {
    const d = await api('/api/admin/dashboard');
    $('#metricMessages').textContent = d.newMessages;
    $('#metricOrders').textContent = d.todayOrders;
    $('#metricRevenue').textContent = `${d.todayRevenue} DA`;
    $('#metricItems').textContent = d.availableItems;
  }

  async function render(view=current) {
    current = view;
    $$('.side-link').forEach(b=>b.classList.toggle('active', b.dataset.view === view));
    setMeta(view);
    viewContent.innerHTML = '<div class="loading-state"><span></span><p>Chargement des données…</p></div>';

    if (view === 'dashboard') {
      await metrics();
      viewContent.innerHTML = `
        <div class="dashboard-welcome">
          <div>
            <p class="kicker">SYSTÈME OPÉRATIONNEL</p>
            <h3>Bienvenue dans votre espace SAMMOLLO.</h3>
            <p>Utilisez le menu de gauche pour gérer les commandes, consulter les messages, mettre à jour les produits et administrer les événements. Les données sont synchronisées avec votre base TiDB / MySQL.</p>
          </div>
          <div class="system-status"><i></i><span>Base de données connectée</span></div>
        </div>`;
      return;
    }

    if (view === 'messages') {
      const rows = await api('/api/admin/messages');
      if (!rows.length) { viewContent.innerHTML = emptyState('Aucun message pour le moment.'); return; }
      viewContent.innerHTML = `<table class="data-table"><thead><tr><th>Date</th><th>Client</th><th>Email</th><th>Objet</th><th>Message</th><th>Statut</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('fr-FR')}</td><td><strong>${esc(x.name)}</strong></td><td>${esc(x.email)}</td><td>${esc(x.subject)}</td><td class="message-cell">${esc(x.message).slice(0,150)}</td><td><span class="badge gold">${esc(x.status)}</span></td></tr>`).join('')}</tbody></table>`;
      return;
    }

    if (view === 'orders') {
      const rows = await api('/api/admin/orders');
      if (!rows.length) { viewContent.innerHTML = emptyState('Aucune commande pour le moment.'); return; }
      viewContent.innerHTML = `<table class="data-table"><thead><tr><th>Date</th><th>Référence</th><th>Client</th><th>Téléphone</th><th>Total</th><th>Paiement</th><th>Statut</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('fr-FR')}</td><td><code>${esc(x.public_id).slice(0,8)}</code></td><td><strong>${esc(x.customer_name)}</strong></td><td>${esc(x.customer_phone)}</td><td><strong>${x.total} DA</strong></td><td><span class="badge">${esc(x.payment_status)}</span></td><td class="row-actions"><select data-order="${x.id}">${['pending','confirmed','preparing','ready','completed','cancelled'].map(s=>`<option ${s===x.status?'selected':''} value="${s}">${s}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
      viewContent.querySelectorAll('[data-order]').forEach(sel=>sel.addEventListener('change', async()=>{
        await api(`/api/admin/orders/${sel.dataset.order}/status`, {method:'PATCH', body:JSON.stringify({status:sel.value})});
      }));
      return;
    }

    if (view === 'events') {
      const rows = await api('/api/admin/events');
      if (!rows.length) { viewContent.innerHTML = emptyState('Aucun événement enregistré.'); return; }
      viewContent.innerHTML = `<div class="inline-note">Les événements publiés ici alimentent directement la page Événements du site.</div>${rows.map(x=>`<div class="menu-edit event-edit" data-event="${x.id}"><input aria-label="Titre" data-f="title" value="${esc(x.title)}"><input aria-label="Résumé" data-f="summary" value="${esc(x.summary)}"><input aria-label="Récurrence" data-f="recurrence" value="${esc(x.recurrence_label||'')}"><select aria-label="Statut" data-f="status"><option value="published" ${x.status==='published'?'selected':''}>Publié</option><option value="draft" ${x.status==='draft'?'selected':''}>Brouillon</option><option value="archived" ${x.status==='archived'?'selected':''}>Archivé</option></select><button type="button">Enregistrer</button></div>`).join('')}`;
      viewContent.querySelectorAll('[data-event]').forEach(row=>row.querySelector('button').addEventListener('click', async()=>{
        const val=f=>row.querySelector(`[data-f="${f}"]`);
        const currentRow=rows.find(x=>x.id===Number(row.dataset.event));
        await api(`/api/admin/events/${row.dataset.event}`, {method:'PATCH',body:JSON.stringify({title:val('title').value,summary:val('summary').value,recurrenceLabel:val('recurrence').value,status:val('status').value,imagePath:currentRow.image_path,eventDate:currentRow.event_date,featured:currentRow.featured})});
        const btn=row.querySelector('button'); btn.textContent='Enregistré ✓'; setTimeout(()=>btn.textContent='Enregistrer',1200);
      }));
      return;
    }

    if (view === 'menu') {
      const rows = await api('/api/menu');
      if (!rows.length) { viewContent.innerHTML = emptyState('Aucun produit enregistré.'); return; }
      viewContent.innerHTML = `<div class="inline-note">Modification rapide des produits. Les changements sont enregistrés directement dans la base.</div>${rows.map(x=>`<div class="menu-edit" data-id="${x.id}"><input aria-label="Nom" data-f="name" value="${esc(x.name)}"><input aria-label="Description" data-f="description" value="${esc(x.description)}"><input aria-label="Prix" data-f="price" type="number" min="0" value="${x.price}"><label class="availability"><input data-f="available" type="checkbox" ${x.available?'checked':''}><span>Disponible</span></label><button type="button">Enregistrer</button></div>`).join('')}`;
      viewContent.querySelectorAll('.menu-edit').forEach(row=>row.querySelector('button').addEventListener('click', async()=>{
        const val=f=>row.querySelector(`[data-f="${f}"]`);
        await api(`/api/admin/menu/${row.dataset.id}`, {method:'PATCH',body:JSON.stringify({name:val('name').value,description:val('description').value,price:Number(val('price').value),available:val('available').checked,featured:false,badge:''})});
        const btn=row.querySelector('button'); btn.textContent='Enregistré ✓'; setTimeout(()=>btn.textContent='Enregistrer',1200);
      }));
    }
  }

  function openLogoutModal() {
    logoutModal.hidden = false;
    document.body.classList.add('modal-open');
    $('#confirmLogout').focus();
  }

  function closeLogoutModal() {
    logoutModal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  togglePassword.addEventListener('click', ()=>{
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    togglePassword.setAttribute('aria-pressed', String(show));
    togglePassword.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    togglePassword.classList.toggle('is-visible', show);
    passwordInput.focus();
  });

  loginForm.addEventListener('submit', async e=>{
    e.preventDefault();
    loginStatus.textContent='Connexion en cours…';
    loginStatus.classList.remove('error');
    loginSubmit.disabled=true;
    try {
      const data=Object.fromEntries(new FormData(e.currentTarget));
      const result=await api('/api/admin/login',{method:'POST',body:JSON.stringify(data)});
      $('#adminName').textContent=result.admin.displayName;
      showApp();
      loginStatus.textContent='';
      e.currentTarget.reset();
      passwordInput.type='password';
      togglePassword.classList.remove('is-visible');
      await render('dashboard');
    } catch(err) {
      loginStatus.textContent=err.message;
      loginStatus.classList.add('error');
    } finally {
      loginSubmit.disabled=false;
    }
  });

  $$('.side-link').forEach(b=>b.addEventListener('click', ()=>render(b.dataset.view).catch(e=>viewContent.innerHTML=`<p class="empty error-text">${esc(e.message)}</p>`)));
  $('#refreshBtn').addEventListener('click', ()=>render(current).catch(e=>viewContent.innerHTML=`<p class="empty error-text">${esc(e.message)}</p>`));
  $('#logoutBtn').addEventListener('click', openLogoutModal);
  $('#cancelLogout').addEventListener('click', closeLogoutModal);
  $('#logoutClose').addEventListener('click', closeLogoutModal);
  logoutModal.addEventListener('click', e=>{ if(e.target===logoutModal) closeLogoutModal(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !logoutModal.hidden) closeLogoutModal(); });

  $('#confirmLogout').addEventListener('click', async()=>{
    const button=$('#confirmLogout');
    button.disabled=true;
    button.textContent='Déconnexion…';
    try { await api('/api/admin/logout',{method:'POST',body:'{}'}); } catch {}
    finally {
      button.disabled=false;
      button.textContent='Se déconnecter';
      closeLogoutModal();
      showLogin();
    }
  });

  (async()=>{
    try {
      const d=await api('/api/admin/dashboard');
      showApp();
      $('#metricMessages').textContent=d.newMessages;
      $('#metricOrders').textContent=d.todayOrders;
      $('#metricRevenue').textContent=`${d.todayRevenue} DA`;
      $('#metricItems').textContent=d.availableItems;
      await render('dashboard');
    } catch {
      showLogin();
    }
  })();
})();
