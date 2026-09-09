(()=>{
  'use strict';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  const loginPanel=$('#loginPanel');
  const appPanel=$('#appPanel');
  const viewContent=$('#viewContent');
  const metricsPanel=$('#metricsPanel');
  const primaryActionBtn=$('#primaryActionBtn');
  const logoutModal=$('#logoutModal');
  const credentialsModal=$('#credentialsModal');
  const orderDetailModal=$('#orderDetailModal');
  const messageModal=$('#messageModal');
  const productModal=$('#productModal');
  const categoryModal=$('#categoryModal');
  const eventModal=$('#eventModal');
  const confirmModal=$('#confirmModal');

  let currentView='dashboard';
  let currentAdmin={displayName:'Administrateur',email:''};
  let productsCache=[];
  let categoriesCache=[];
  let eventsCache=[];
  let ordersCache=[];
  let messagesCache=[];
  let confirmResolver=null;

  const statusLabels={
    pending:'En attente',
    confirmed:'Confirmée',
    preparing:'En préparation',
    ready:'Prête',
    completed:'Terminée',
    cancelled:'Annulée'
  };

  const messageLabels={new:'Nouveau',read:'Lu',replied:'Répondu',archived:'Archivé'};
  const eventLabels={published:'Publié',draft:'Brouillon',archived:'Archivé'};

  const viewMeta={
    dashboard:{title:'Tableau de bord',subtitle:'Vue générale et actions prioritaires du restaurant.',kicker:'ACTIVITÉ',content:'Centre de contrôle'},
    orders:{title:'Commandes',subtitle:'Confirmez, préparez et clôturez les commandes clients.',kicker:'GESTION',content:'Commandes clients'},
    messages:{title:'Messages',subtitle:'Consultez, classez et supprimez les demandes reçues.',kicker:'CONTACT',content:'Messages reçus'},
    menu:{title:'Carte & produits',subtitle:'Ajoutez, modifiez, publiez et supprimez les produits de la carte.',kicker:'CARTE',content:'Produits du menu'},
    categories:{title:'Catégories',subtitle:'Organisez les familles de produits et leur ordre d’affichage.',kicker:'CARTE',content:'Catégories du menu'},
    events:{title:'Événements',subtitle:'Créez, modifiez, publiez ou archivez les événements.',kicker:'CONTENU',content:'Événements SAMMOLLO'},
    profile:{title:'Profil',subtitle:'Gérez les informations et la sécurité du compte administrateur.',kicker:'COMPTE',content:'Mon profil'}
  };

  function esc(value){
    return String(value??'').replace(/[&<>'"]/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[c]));
  }

  function money(value){
    return `${new Intl.NumberFormat('fr-DZ').format(Number(value)||0)} DA`;
  }

  function dt(value){
    if(!value)return '—';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '—';
    return new Intl.DateTimeFormat('fr-DZ',{dateStyle:'short',timeStyle:'short'}).format(d);
  }

  function dateOnly(value){
    if(!value)return 'Sans date';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return 'Sans date';
    return new Intl.DateTimeFormat('fr-DZ',{dateStyle:'medium',timeStyle:'short'}).format(d);
  }

  function assetUrl(value){
    const s=String(value||'').trim();
    if(!s)return '';
    if(/^https?:\/\//i.test(s)||s.startsWith('/'))return s;
    return `/${s.replace(/^\/+/, '')}`;
  }

  function initials(name){
    const parts=String(name||'S').trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0,2).map(x=>x[0]).join('')||'S').toUpperCase();
  }

  function slugify(value){
    return String(value||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }

  function toDatetimeLocal(value){
    if(!value)return '';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '';
    const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  }

  async function api(url,options={}){
    const opts={...options,headers:{...(options.headers||{})}};
    if(opts.body && !(opts.body instanceof Blob) && !(opts.body instanceof FormData) && !opts.headers['Content-Type']){
      opts.headers['Content-Type']='application/json';
    }
    const response=await fetch(url,opts);
    const text=await response.text();
    let data={};
    if(text){
      try{data=JSON.parse(text);}catch{data={message:text};}
    }
    if(!response.ok){
      const err=new Error(data.message||`Erreur ${response.status}`);
      err.status=response.status;
      throw err;
    }
    return data;
  }

  async function uploadImage(endpoint,file){
    if(!file)throw new Error('Sélectionnez une image.');
    if(file.size>4*1024*1024)throw new Error('La photo dépasse 4 Mo.');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
      throw new Error('Utilisez une image JPG, PNG ou WebP.');
    }

    const response=await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)},
      body:file
    });
    const text=await response.text();
    let data={};
    try{data=text?JSON.parse(text):{};}catch{}
    if(!response.ok)throw new Error(data.message||"Impossible d'envoyer l'image.");
    return data;
  }

  function emptyState(icon,title,text){
    return `<div class="empty-state"><span class="empty-icon">${esc(icon)}</span><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  }

  function loading(){
    viewContent.innerHTML='<div class="loading-state"><span></span><p>Chargement…</p></div>';
  }

  function statusBadge(label,tone=''){
    return `<span class="status-badge ${tone}">${esc(label)}</span>`;
  }

  function orderTone(status){
    if(status==='pending')return 'gold';
    if(['confirmed','preparing'].includes(status))return 'blue';
    if(['ready','completed'].includes(status))return 'green';
    if(status==='cancelled')return 'red';
    return '';
  }

  function eventTone(status){
    if(status==='published')return 'green';
    if(status==='draft')return 'gold';
    return '';
  }

  function messageTone(status){
    if(status==='new')return 'gold';
    if(status==='replied')return 'green';
    if(status==='archived')return '';
    return 'blue';
  }

  function actionLabel(action){
    const map={
      'auth.logout':'Déconnexion administrateur',
      'profile.update':'Profil administrateur modifié',
      'profile.password.change':'Mot de passe administrateur modifié',
      'order.status.update':'Statut d’une commande modifié',
      'order.delete':'Commande supprimée',
      'message.status.update':'Statut d’un message modifié',
      'message.delete':'Message supprimé',
      'menu.create':'Produit ajouté',
      'menu.update':'Produit modifié',
      'menu.delete':'Produit supprimé',
      'menu.image.upload':'Photo produit envoyée',
      'category.create':'Catégorie ajoutée',
      'category.update':'Catégorie modifiée',
      'category.delete':'Catégorie supprimée',
      'event.create':'Événement ajouté',
      'event.update':'Événement modifié',
      'event.delete':'Événement supprimé',
      'event.image.upload':'Photo événement envoyée'
    };
    return map[action]||String(action||'Activité administrateur');
  }

  function openModal(modal){
    if(!modal)return;
    modal.hidden=false;
    document.body.style.overflow='hidden';
  }

  function closeModal(modal){
    if(!modal)return;
    modal.hidden=true;
    if(!$$('.dialog-backdrop:not([hidden])').length)document.body.style.overflow='';
  }

  function toast(title,message='',type='success'){
    const box=document.createElement('div');
    box.className=`toast ${type==='error'?'error':''}`;
    box.innerHTML=`<span class="toast-icon">${type==='error'?'!':'✓'}</span><div><strong>${esc(title)}</strong>${message?`<p>${esc(message)}</p>`:''}</div><button type="button" aria-label="Fermer">×</button>`;
    $('#toastContainer').appendChild(box);
    const remove=()=>box.remove();
    box.querySelector('button').addEventListener('click',remove);
    setTimeout(remove,4200);
  }

  function askConfirm(title,message,label='Confirmer'){
    if(confirmResolver){confirmResolver(false);confirmResolver=null;}
    $('#confirmTitle').textContent=title;
    $('#confirmMessage').textContent=message;
    $('#confirmAccept').textContent=label;
    openModal(confirmModal);
    return new Promise(resolve=>{confirmResolver=resolve;});
  }

  function resolveConfirm(value){
    if(confirmResolver){
      const fn=confirmResolver;
      confirmResolver=null;
      closeModal(confirmModal);
      fn(value);
    }else closeModal(confirmModal);
  }

  function showLogin(){
    appPanel.hidden=true;
    loginPanel.hidden=false;
    document.body.classList.remove('sidebar-open');
    $('#adminPassword')?.focus();
  }

  function showApp(){
    loginPanel.hidden=true;
    appPanel.hidden=false;
    updateAdminHeader();
  }

  function updateAdminHeader(){
    $('#adminName').textContent=currentAdmin.displayName||'Administrateur';
    $('.admin-avatar').textContent=initials(currentAdmin.displayName);
  }

  function updateClock(){
    const now=new Date();
    $('#adminDate').textContent=new Intl.DateTimeFormat('fr-DZ',{weekday:'long',day:'2-digit',month:'short'}).format(now);
    $('#adminTime').textContent=new Intl.DateTimeFormat('fr-DZ',{hour:'2-digit',minute:'2-digit'}).format(now);
  }

  function setPrimaryAction(view){
    const cfg={
      menu:{label:'+ Ajouter un produit',action:'product'},
      categories:{label:'+ Ajouter une catégorie',action:'category'},
      events:{label:'+ Ajouter un événement',action:'event'}
    }[view];
    if(!cfg){
      primaryActionBtn.hidden=true;
      primaryActionBtn.dataset.action='';
      return;
    }
    primaryActionBtn.hidden=false;
    primaryActionBtn.textContent=cfg.label;
    primaryActionBtn.dataset.action=cfg.action;
  }

  async function loadMetrics(){
    const data=await api('/api/admin/dashboard');
    $('#metricTodayOrders').textContent=data.todayOrders;
    $('#metricOrders').textContent=data.pendingOrders;
    $('#metricMessages').textContent=data.newMessages;
    $('#metricItems').textContent=data.availableItems;
    const orderDot=$('#pendingOrderDot');
    const msgDot=$('#newMessageDot');
    orderDot.textContent=data.pendingOrders;
    orderDot.hidden=!data.pendingOrders;
    msgDot.textContent=data.newMessages;
    msgDot.hidden=!data.newMessages;
    return data;
  }

  async function render(view){
    currentView=view;
    const meta=viewMeta[view]||viewMeta.dashboard;
    $('#viewTitle').textContent=meta.title;
    $('#viewSubtitle').textContent=meta.subtitle;
    $('#contentKicker').textContent=meta.kicker;
    $('#contentTitle').textContent=meta.content;
    metricsPanel.hidden=view!=='dashboard';
    setPrimaryAction(view);
    $$('.side-link').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view));
    document.body.classList.remove('sidebar-open');
    $('#sideOverlay').hidden=true;
    loading();

    try{
      if(view==='dashboard')return await renderDashboard();
      if(view==='orders')return await renderOrders();
      if(view==='messages')return await renderMessages();
      if(view==='menu')return await renderProducts();
      if(view==='categories')return await renderCategories();
      if(view==='events')return await renderEvents();
      if(view==='profile')return await renderProfile();
    }catch(err){
      if(err.status===401){showLogin();return;}
      viewContent.innerHTML=emptyState('!','Impossible de charger cette section',err.message);
    }
  }

  // =====================================================
  // DASHBOARD
  // =====================================================
  async function renderDashboard(){
    const [stats,orders,messages,activity]=await Promise.all([
      loadMetrics(),
      api('/api/admin/orders'),
      api('/api/admin/messages'),
      api('/api/admin/activity').catch(()=>[])
    ]);
    ordersCache=orders;
    messagesCache=messages;

    const recentOrders=orders.slice(0,6);
    const recentActivity=activity.slice(0,8);

    viewContent.innerHTML=`
      <div class="dashboard-v4">
        <section class="dashboard-hero">
          <div>
            <p class="kicker">PILOTAGE DU RESTAURANT</p>
            <h3>Tout ce qui demande votre attention, au même endroit.</h3>
            <p>Traitez les nouvelles commandes, consultez les messages et gardez la carte SAMMOLLO à jour sans toucher au code ni à la base de données.</p>
          </div>
          <span class="dashboard-hero-state"><i></i> Administration opérationnelle</span>
        </section>

        <div class="dashboard-grid">
          <div class="dash-panel">
            <div class="dash-panel-head">
              <div><h3>À traiter maintenant</h3><p>Accès rapide aux éléments prioritaires.</p></div>
            </div>
            <div class="attention-grid">
              <button class="attention-card" data-go="orders" type="button"><small>Commandes</small><strong>${stats.pendingOrders}</strong><span>En attente de confirmation</span></button>
              <button class="attention-card" data-go="messages" type="button"><small>Messages</small><strong>${stats.newMessages}</strong><span>Nouveaux messages</span></button>
              <button class="attention-card" data-go="orders" type="button"><small>En cours</small><strong>${stats.activeOrders}</strong><span>Confirmées / préparation / prêtes</span></button>
            </div>

            <div class="dash-panel-head">
              <div><h3>Commandes récentes</h3><p>Les dernières commandes enregistrées.</p></div>
              <button class="panel-link" data-go="orders" type="button">Voir toutes →</button>
            </div>
            <div class="recent-list">
              ${recentOrders.length?recentOrders.map(o=>`
                <div class="recent-row">
                  <div class="recent-main"><strong>${esc(o.customer_name)}</strong><small>${dt(o.created_at)} · ${esc(o.customer_phone)}</small></div>
                  <span class="recent-ref">#${esc(String(o.public_id).slice(0,8).toUpperCase())}</span>
                  <span class="recent-total">${money(o.total)}</span>
                  ${statusBadge(statusLabels[o.status]||o.status,orderTone(o.status))}
                </div>`).join(''):emptyState('▣','Aucune commande','Les nouvelles commandes apparaîtront ici.')}
            </div>
          </div>

          <div class="dash-panel">
            <div class="dash-panel-head">
              <div><h3>Activité récente</h3><p>Dernières actions effectuées dans l’administration.</p></div>
            </div>
            <div class="activity-list">
              ${recentActivity.length?recentActivity.map(a=>`
                <div class="activity-row">
                  <span class="activity-dot">•</span>
                  <div class="activity-copy"><strong>${esc(actionLabel(a.action))}</strong><small>${dt(a.created_at)}</small></div>
                </div>`).join(''):`<div class="empty-state"><strong>Aucune activité récente</strong><p>Les modifications administratives apparaîtront ici.</p></div>`}
            </div>
          </div>
        </div>
      </div>`;

    $$('[data-go]',viewContent).forEach(btn=>btn.addEventListener('click',()=>render(btn.dataset.go)));
  }

  // =====================================================
  // COMMANDES
  // =====================================================
  async function renderOrders(){
    ordersCache=await api('/api/admin/orders');
    viewContent.innerHTML=`
      <div class="toolbar">
        <label class="toolbar-search"><span>⌕</span><input id="ordersSearch" type="search" placeholder="Client, téléphone, email ou référence…"></label>
        <select id="ordersStatusFilter">
          <option value="">Tous les statuts</option>
          ${Object.entries(statusLabels).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}
        </select>
        <span id="ordersCount" class="toolbar-count"></span>
      </div>
      <div id="ordersTable" class="table-wrap"></div>`;

    $('#ordersSearch').addEventListener('input',drawOrders);
    $('#ordersStatusFilter').addEventListener('change',drawOrders);
    drawOrders();
  }

  function drawOrders(){
    const q=String($('#ordersSearch')?.value||'').trim().toLowerCase();
    const status=$('#ordersStatusFilter')?.value||'';
    const rows=ordersCache.filter(o=>{
      const hay=[o.customer_name,o.customer_email,o.customer_phone,o.public_id].join(' ').toLowerCase();
      return (!q||hay.includes(q))&&(!status||o.status===status);
    });
    $('#ordersCount').textContent=`${rows.length} commande${rows.length>1?'s':''}`;

    if(!rows.length){
      $('#ordersTable').innerHTML=emptyState('▣','Aucune commande trouvée','Modifiez les filtres ou attendez une nouvelle commande.');
      return;
    }

    $('#ordersTable').innerHTML=`<table class="data-table"><thead><tr><th>Date</th><th>Référence</th><th>Client</th><th>Total</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
      ${rows.map(o=>`<tr>
        <td>${dt(o.created_at)}</td>
        <td><code>${esc(String(o.public_id).slice(0,8).toUpperCase())}</code></td>
        <td><strong>${esc(o.customer_name)}</strong><small>${esc(o.customer_phone)} · ${esc(o.customer_email||'')}</small></td>
        <td><strong>${money(o.total)}</strong></td>
        <td><select class="status-select" data-order-status="${o.id}">${Object.entries(statusLabels).map(([k,v])=>`<option value="${k}" ${o.status===k?'selected':''}>${esc(v)}</option>`).join('')}</select></td>
        <td><div class="action-group"><button class="mini-btn" data-order-details="${o.id}" type="button">Détails</button>${['completed','cancelled'].includes(o.status)?`<button class="mini-btn danger" data-order-delete="${o.id}" type="button">Supprimer</button>`:''}</div></td>
      </tr>`).join('')}
    </tbody></table>`;

    $$('[data-order-status]',viewContent).forEach(select=>select.addEventListener('change',async()=>{
      const before=ordersCache.find(o=>o.id===Number(select.dataset.orderStatus))?.status;
      select.disabled=true;
      try{
        await api(`/api/admin/orders/${select.dataset.orderStatus}/status`,{method:'PATCH',body:JSON.stringify({status:select.value})});
        const item=ordersCache.find(o=>o.id===Number(select.dataset.orderStatus));
        if(item)item.status=select.value;
        toast('Commande mise à jour',statusLabels[select.value]||select.value);
        await loadMetrics();
        drawOrders();
      }catch(err){select.value=before||'pending';toast('Modification impossible',err.message,'error');}
      finally{select.disabled=false;}
    }));

    $$('[data-order-details]',viewContent).forEach(btn=>btn.addEventListener('click',()=>showOrderDetails(btn.dataset.orderDetails)));
    $$('[data-order-delete]',viewContent).forEach(btn=>btn.addEventListener('click',()=>deleteOrder(btn.dataset.orderDelete)));
  }

  async function showOrderDetails(id){
    openModal(orderDetailModal);
    $('#orderDetailBody').innerHTML='<div class="loading-state"><span></span><p>Chargement…</p></div>';
    try{
      const o=await api(`/api/admin/orders/${id}`);
      const rating=String(o.notes||'').match(/([1-5])\s*\/\s*5/);
      const stars=rating?'★'.repeat(Number(rating[1]))+'☆'.repeat(5-Number(rating[1])):'—';
      $('#orderDetailTitle').textContent=`Commande #${String(o.public_id).slice(0,8).toUpperCase()}`;
      $('#orderDetailBody').innerHTML=`
        <div class="order-detail-grid">
          <div class="detail-box"><span>Client</span><strong>${esc(o.customer_name)}</strong></div>
          <div class="detail-box"><span>Téléphone</span><strong>${esc(o.customer_phone)}</strong></div>
          <div class="detail-box"><span>Email vérifié</span><strong>${esc(o.customer_email||'—')}</strong></div>
          <div class="detail-box"><span>Type</span><strong>${o.order_type==='dine_in'?'Sur place':'À emporter'}</strong></div>
          <div class="detail-box"><span>Statut</span><strong>${esc(statusLabels[o.status]||o.status)}</strong></div>
          <div class="detail-box"><span>Total</span><strong>${money(o.total)}</strong></div>
        </div>
        <div class="detail-section"><h3>Produits</h3><div class="order-items">${(o.items||[]).map(i=>`<div class="order-item"><strong>${esc(i.item_name)}</strong><span>x${i.quantity}</span><span>${money(i.line_total)}</span></div>`).join('')}</div></div>
        <div class="detail-section"><h3>Évaluation client</h3><div class="stars-view">${stars}</div></div>
        <div class="detail-section"><h3>Créée le</h3><div class="detail-box"><strong>${dt(o.created_at)}</strong></div></div>`;
    }catch(err){$('#orderDetailBody').innerHTML=emptyState('!','Commande indisponible',err.message);}
  }

  async function deleteOrder(id){
    const ok=await askConfirm('Supprimer cette commande ?','La commande et ses lignes seront définitivement supprimées. Cette action est réservée aux commandes terminées ou annulées.','Supprimer');
    if(!ok)return;
    try{
      await api(`/api/admin/orders/${id}`,{method:'DELETE'});
      ordersCache=ordersCache.filter(o=>o.id!==Number(id));
      toast('Commande supprimée');
      await loadMetrics();
      drawOrders();
    }catch(err){toast('Suppression impossible',err.message,'error');}
  }

  // =====================================================
  // MESSAGES
  // =====================================================
  async function renderMessages(){
    messagesCache=await api('/api/admin/messages');
    viewContent.innerHTML=`
      <div class="toolbar">
        <label class="toolbar-search"><span>⌕</span><input id="messagesSearch" type="search" placeholder="Nom, email, objet ou contenu…"></label>
        <select id="messagesStatusFilter"><option value="">Tous les statuts</option>${Object.entries(messageLabels).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select>
        <span id="messagesCount" class="toolbar-count"></span>
      </div>
      <div id="messagesList" class="message-list"></div>`;
    $('#messagesSearch').addEventListener('input',drawMessages);
    $('#messagesStatusFilter').addEventListener('change',drawMessages);
    drawMessages();
  }

  function drawMessages(){
    const q=String($('#messagesSearch')?.value||'').trim().toLowerCase();
    const status=$('#messagesStatusFilter')?.value||'';
    const rows=messagesCache.filter(m=>{
      const hay=[m.name,m.email,m.subject,m.message].join(' ').toLowerCase();
      return (!q||hay.includes(q))&&(!status||m.status===status);
    });
    $('#messagesCount').textContent=`${rows.length} message${rows.length>1?'s':''}`;
    if(!rows.length){$('#messagesList').innerHTML=emptyState('✉','Aucun message trouvé','Les nouveaux messages du formulaire Contact apparaîtront ici.');return;}

    $('#messagesList').innerHTML=rows.map(m=>`
      <div class="message-row">
        <div class="message-avatar">${esc(initials(m.name))}</div>
        <div class="message-who"><strong>${esc(m.name)}</strong><small>${esc(m.email)}</small></div>
        <div class="message-subject"><strong>${esc(m.subject)}</strong><small>${esc(m.message).slice(0,105)}</small></div>
        ${statusBadge(messageLabels[m.status]||m.status,messageTone(m.status))}
        <div class="message-actions"><button class="mini-btn" data-message-open="${m.id}" type="button">Ouvrir</button><button class="mini-btn danger" data-message-delete="${m.id}" type="button">Supprimer</button></div>
      </div>`).join('');

    $$('[data-message-open]',viewContent).forEach(btn=>btn.addEventListener('click',()=>openMessage(btn.dataset.messageOpen)));
    $$('[data-message-delete]',viewContent).forEach(btn=>btn.addEventListener('click',()=>deleteMessage(btn.dataset.messageDelete)));
  }

  async function openMessage(id){
    const m=messagesCache.find(x=>x.id===Number(id));
    if(!m)return;
    $('#messageTitle').textContent=m.subject||'Message';
    $('#messageBody').innerHTML=`
      <div class="message-detail-head">
        <div class="detail-box"><span>Expéditeur</span><strong>${esc(m.name)}</strong></div>
        <div class="detail-box"><span>Email</span><strong>${esc(m.email)}</strong></div>
        <div class="detail-box"><span>Reçu le</span><strong>${dt(m.created_at)}</strong></div>
        <div class="detail-box"><span>Statut</span><strong>${esc(messageLabels[m.status]||m.status)}</strong></div>
      </div>
      <div class="message-text">${esc(m.message)}</div>
      <div class="dialog-actions">
        <a class="secondary-btn" style="display:grid;place-items:center;text-decoration:none" href="mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Re: '+m.subject)}">Répondre par email</a>
        <select id="messageModalStatus" class="status-select">${Object.entries(messageLabels).map(([k,v])=>`<option value="${k}" ${m.status===k?'selected':''}>${esc(v)}</option>`).join('')}</select>
      </div>`;
    openModal(messageModal);
    if(m.status==='new'){
      try{await updateMessageStatus(m.id,'read',false);m.status='read';}catch{}
    }
    $('#messageModalStatus').addEventListener('change',async e=>{
      try{await updateMessageStatus(m.id,e.target.value,true);m.status=e.target.value;drawMessages();}catch(err){toast('Modification impossible',err.message,'error');}
    });
  }

  async function updateMessageStatus(id,status,notify=true){
    await api(`/api/admin/messages/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});
    const m=messagesCache.find(x=>x.id===Number(id));
    if(m)m.status=status;
    await loadMetrics();
    if(notify)toast('Message mis à jour',messageLabels[status]||status);
  }

  async function deleteMessage(id){
    const ok=await askConfirm('Supprimer ce message ?','Le message sera définitivement supprimé de la base de données.','Supprimer');
    if(!ok)return;
    try{
      await api(`/api/admin/messages/${id}`,{method:'DELETE'});
      messagesCache=messagesCache.filter(m=>m.id!==Number(id));
      toast('Message supprimé');
      await loadMetrics();
      drawMessages();
    }catch(err){toast('Suppression impossible',err.message,'error');}
  }

  // =====================================================
  // PRODUITS
  // =====================================================
  async function ensureCategories(){
    categoriesCache=await api('/api/admin/categories');
    return categoriesCache;
  }

  async function renderProducts(){
    const [products,categories]=await Promise.all([api('/api/admin/menu'),api('/api/admin/categories')]);
    productsCache=products;
    categoriesCache=categories;
    viewContent.innerHTML=`
      <div class="toolbar">
        <label class="toolbar-search"><span>⌕</span><input id="productsSearch" type="search" placeholder="Rechercher un produit…"></label>
        <select id="productsCategoryFilter"><option value="">Toutes les catégories</option>${categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        <select id="productsAvailabilityFilter"><option value="">Tous</option><option value="available">Disponibles</option><option value="unavailable">Indisponibles</option></select>
        <span id="productsCount" class="toolbar-count"></span>
      </div>
      <div id="productGrid" class="product-grid"></div>`;
    $('#productsSearch').addEventListener('input',drawProducts);
    $('#productsCategoryFilter').addEventListener('change',drawProducts);
    $('#productsAvailabilityFilter').addEventListener('change',drawProducts);
    drawProducts();
  }

  function drawProducts(){
    const q=String($('#productsSearch')?.value||'').trim().toLowerCase();
    const cat=Number($('#productsCategoryFilter')?.value||0);
    const avail=$('#productsAvailabilityFilter')?.value||'';
    const rows=productsCache.filter(p=>{
      const hay=[p.name,p.description,p.category,p.badge].join(' ').toLowerCase();
      const okAvail=!avail||(avail==='available'?Number(p.available)===1:Number(p.available)===0);
      return (!q||hay.includes(q))&&(!cat||Number(p.category_id)===cat)&&okAvail;
    });
    $('#productsCount').textContent=`${rows.length} produit${rows.length>1?'s':''}`;
    if(!rows.length){$('#productGrid').innerHTML=emptyState('◇','Aucun produit trouvé','Ajoutez un produit ou modifiez les filtres.');return;}

    $('#productGrid').innerHTML=rows.map(p=>{
      const img=assetUrl(p.image_path);
      return `<article class="product-card">
        <div class="product-visual">${img?`<img src="${esc(img)}" alt="${esc(p.name)}">`:'<div class="product-no-image">◇</div>'}${statusBadge(Number(p.available)?'Disponible':'Indisponible',Number(p.available)?'green':'red')}</div>
        <div class="product-content">
          <div class="product-meta"><span class="product-category">${esc(p.category)}</span><span class="product-price">${money(p.price)}</span></div>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description||'Aucune description.')}</p>
          <div class="product-flags">${p.badge?statusBadge(p.badge,'gold'):''}${Number(p.featured)?statusBadge('Mis en avant','blue'):''}</div>
          <div class="product-actions">
            <button class="mini-btn" data-product-edit="${p.id}" type="button">Modifier</button>
            <button class="mini-btn ${Number(p.available)?'':'success'}" data-product-toggle="${p.id}" type="button">${Number(p.available)?'Rendre indisponible':'Rendre disponible'}</button>
            <button class="mini-btn danger" data-product-delete="${p.id}" type="button">Supprimer</button>
          </div>
        </div>
      </article>`;
    }).join('');

    $$('[data-product-edit]',viewContent).forEach(btn=>btn.addEventListener('click',()=>openProductDialog(productsCache.find(p=>p.id===Number(btn.dataset.productEdit)))));
    $$('[data-product-toggle]',viewContent).forEach(btn=>btn.addEventListener('click',()=>toggleProduct(btn.dataset.productToggle)));
    $$('[data-product-delete]',viewContent).forEach(btn=>btn.addEventListener('click',()=>deleteProduct(btn.dataset.productDelete)));
  }

  async function openProductDialog(product=null){
    if(!categoriesCache.length)await ensureCategories();
    if(!categoriesCache.length){toast('Aucune catégorie','Créez d’abord une catégorie.','error');return;}

    $('#productId').value=product?.id||'';
    $('#productCurrentImage').value=product?.image_path||'';
    $('#productModalTitle').textContent=product?'Modifier le produit':'Ajouter un produit';
    $('#productModalDescription').textContent=product?'Modifiez les informations ou changez la photo du produit.':'Créez un produit et publiez-le directement sur la carte.';
    $('#saveProduct').textContent=product?'Enregistrer les modifications':'Ajouter le produit';
    $('#productCategory').innerHTML=categoriesCache.map(c=>`<option value="${c.id}" ${Number(product?.category_id)===Number(c.id)?'selected':''}>${esc(c.name)}</option>`).join('');
    $('#productName').value=product?.name||'';
    $('#productDescription').value=product?.description||'';
    $('#productPrice').value=product?.price??'';
    $('#productBadge').value=product?.badge||'';
    $('#productSortOrder').value=product?.sort_order??0;
    $('#productAvailable').checked=product?Boolean(Number(product.available)):true;
    $('#productFeatured').checked=Boolean(Number(product?.featured||0));
    $('#productImage').value='';
    $('#productFormStatus').textContent='';
    const img=assetUrl(product?.image_path);
    $('#productImagePreview').innerHTML=img?`<img src="${esc(img)}" alt="Aperçu">`:'<span>Aucune photo</span>';
    openModal(productModal);
    setTimeout(()=>$('#productName').focus(),50);
  }

  async function toggleProduct(id){
    const item=productsCache.find(p=>p.id===Number(id));
    if(!item)return;
    try{
      const next=!Boolean(Number(item.available));
      await api(`/api/admin/menu/${id}`,{method:'PATCH',body:JSON.stringify({available:next})});
      item.available=next?1:0;
      toast(next?'Produit disponible':'Produit indisponible');
      await loadMetrics();
      drawProducts();
    }catch(err){toast('Modification impossible',err.message,'error');}
  }

  async function deleteProduct(id){
    const item=productsCache.find(p=>p.id===Number(id));
    const ok=await askConfirm('Supprimer ce produit ?',`« ${item?.name||'Ce produit'} » sera retiré définitivement de la carte.`,'Supprimer');
    if(!ok)return;
    try{
      await api(`/api/admin/menu/${id}`,{method:'DELETE'});
      productsCache=productsCache.filter(p=>p.id!==Number(id));
      toast('Produit supprimé');
      await loadMetrics();
      drawProducts();
    }catch(err){toast('Suppression impossible',err.message,'error');}
  }

  // =====================================================
  // CATÉGORIES
  // =====================================================
  async function renderCategories(){
    categoriesCache=await api('/api/admin/categories');
    viewContent.innerHTML='<div id="categoryGrid" class="category-grid"></div>';
    drawCategories();
  }

  function drawCategories(){
    if(!categoriesCache.length){$('#categoryGrid').innerHTML=emptyState('⊞','Aucune catégorie','Ajoutez une première catégorie pour organiser la carte.');return;}
    $('#categoryGrid').innerHTML=categoriesCache.map((c,index)=>`
      <article class="category-card">
        <div class="category-card-top"><span class="category-number">${String(index+1).padStart(2,'0')}</span>${statusBadge(Number(c.active)?'Active':'Masquée',Number(c.active)?'green':'red')}</div>
        <h3>${esc(c.name)}</h3>
        <p>Slug : ${esc(c.slug)} · ordre ${Number(c.sort_order)||0}</p>
        <div class="category-stats"><span>Produits rattachés</span><strong>${Number(c.item_count)||0}</strong></div>
        <div class="category-actions"><button class="mini-btn" data-category-edit="${c.id}" type="button">Modifier</button><button class="mini-btn" data-category-toggle="${c.id}" type="button">${Number(c.active)?'Masquer':'Activer'}</button><button class="mini-btn danger" data-category-delete="${c.id}" type="button">Supprimer</button></div>
      </article>`).join('');

    $$('[data-category-edit]',viewContent).forEach(btn=>btn.addEventListener('click',()=>openCategoryDialog(categoriesCache.find(c=>c.id===Number(btn.dataset.categoryEdit)))));
    $$('[data-category-toggle]',viewContent).forEach(btn=>btn.addEventListener('click',()=>toggleCategory(btn.dataset.categoryToggle)));
    $$('[data-category-delete]',viewContent).forEach(btn=>btn.addEventListener('click',()=>deleteCategory(btn.dataset.categoryDelete)));
  }

  function openCategoryDialog(category=null){
    $('#categoryId').value=category?.id||'';
    $('#categoryModalTitle').textContent=category?'Modifier la catégorie':'Ajouter une catégorie';
    $('#saveCategory').textContent=category?'Enregistrer les modifications':'Ajouter la catégorie';
    $('#categoryName').value=category?.name||'';
    $('#categorySortOrder').value=category?.sort_order??0;
    $('#categoryActive').checked=category?Boolean(Number(category.active)):true;
    $('#categoryFormStatus').textContent='';
    openModal(categoryModal);
    setTimeout(()=>$('#categoryName').focus(),50);
  }

  async function toggleCategory(id){
    const c=categoriesCache.find(x=>x.id===Number(id));
    if(!c)return;
    try{
      const next=!Boolean(Number(c.active));
      await api(`/api/admin/categories/${id}`,{method:'PATCH',body:JSON.stringify({name:c.name,slug:c.slug,sortOrder:Number(c.sort_order)||0,active:next})});
      c.active=next?1:0;
      toast(next?'Catégorie activée':'Catégorie masquée');
      drawCategories();
    }catch(err){toast('Modification impossible',err.message,'error');}
  }

  async function deleteCategory(id){
    const c=categoriesCache.find(x=>x.id===Number(id));
    const ok=await askConfirm('Supprimer cette catégorie ?',`La catégorie « ${c?.name||''} » ne peut être supprimée que si elle ne contient aucun produit.`,'Supprimer');
    if(!ok)return;
    try{
      await api(`/api/admin/categories/${id}`,{method:'DELETE'});
      categoriesCache=categoriesCache.filter(x=>x.id!==Number(id));
      toast('Catégorie supprimée');
      drawCategories();
    }catch(err){toast('Suppression impossible',err.message,'error');}
  }

  // =====================================================
  // ÉVÉNEMENTS
  // =====================================================
  async function renderEvents(){
    eventsCache=await api('/api/admin/events');
    viewContent.innerHTML='<div id="eventGrid" class="event-grid"></div>';
    drawEvents();
  }

  function drawEvents(){
    if(!eventsCache.length){$('#eventGrid').innerHTML=emptyState('☆','Aucun événement','Ajoutez un événement pour l’afficher sur le site.');return;}
    $('#eventGrid').innerHTML=eventsCache.map(e=>{
      const img=assetUrl(e.image_path);
      return `<article class="event-card">
        <div class="event-visual">${img?`<img src="${esc(img)}" alt="${esc(e.title)}">`:'<div class="event-no-image">☆</div>'}</div>
        <div class="event-content">
          <div class="event-header"><h3>${esc(e.title)}</h3>${statusBadge(eventLabels[e.status]||e.status,eventTone(e.status))}</div>
          <p>${esc(e.summary||'Aucune description.')}</p>
          <div class="event-info"><span><b>Date :</b> ${esc(dateOnly(e.event_date))}</span><span><b>Indication :</b> ${esc(e.recurrence_label||'—')}</span>${Number(e.featured)?'<span><b>Mis en avant</b></span>':''}</div>
          <div class="event-actions"><button class="mini-btn" data-event-edit="${e.id}" type="button">Modifier</button><button class="mini-btn" data-event-toggle="${e.id}" type="button">${e.status==='published'?'Passer en brouillon':'Publier'}</button><button class="mini-btn danger" data-event-delete="${e.id}" type="button">Supprimer</button></div>
        </div>
      </article>`;
    }).join('');

    $$('[data-event-edit]',viewContent).forEach(btn=>btn.addEventListener('click',()=>openEventDialog(eventsCache.find(e=>e.id===Number(btn.dataset.eventEdit)))));
    $$('[data-event-toggle]',viewContent).forEach(btn=>btn.addEventListener('click',()=>toggleEvent(btn.dataset.eventToggle)));
    $$('[data-event-delete]',viewContent).forEach(btn=>btn.addEventListener('click',()=>deleteEvent(btn.dataset.eventDelete)));
  }

  function openEventDialog(event=null){
    $('#eventId').value=event?.id||'';
    $('#eventCurrentImage').value=event?.image_path||'';
    $('#eventModalTitle').textContent=event?'Modifier l’événement':'Ajouter un événement';
    $('#saveEvent').textContent=event?'Enregistrer les modifications':'Ajouter l’événement';
    $('#eventTitle').value=event?.title||'';
    $('#eventSummary').value=event?.summary||'';
    $('#eventDate').value=toDatetimeLocal(event?.event_date);
    $('#eventRecurrence').value=event?.recurrence_label||'';
    $('#eventStatus').value=event?.status||'published';
    $('#eventSortOrder').value=event?.sort_order??0;
    $('#eventFeatured').checked=Boolean(Number(event?.featured||0));
    $('#eventImage').value='';
    $('#eventFormStatus').textContent='';
    const img=assetUrl(event?.image_path);
    $('#eventImagePreview').innerHTML=img?`<img src="${esc(img)}" alt="Aperçu">`:'<span>Aucune photo</span>';
    openModal(eventModal);
    setTimeout(()=>$('#eventTitle').focus(),50);
  }

  async function toggleEvent(id){
    const e=eventsCache.find(x=>x.id===Number(id));
    if(!e)return;
    const next=e.status==='published'?'draft':'published';
    try{
      await api(`/api/admin/events/${id}`,{method:'PATCH',body:JSON.stringify({status:next})});
      e.status=next;
      toast(next==='published'?'Événement publié':'Événement passé en brouillon');
      drawEvents();
    }catch(err){toast('Modification impossible',err.message,'error');}
  }

  async function deleteEvent(id){
    const e=eventsCache.find(x=>x.id===Number(id));
    const ok=await askConfirm('Supprimer cet événement ?',`« ${e?.title||'Cet événement'} » sera supprimé du site et de la base de données.`,'Supprimer');
    if(!ok)return;
    try{
      await api(`/api/admin/events/${id}`,{method:'DELETE'});
      eventsCache=eventsCache.filter(x=>x.id!==Number(id));
      toast('Événement supprimé');
      drawEvents();
    }catch(err){toast('Suppression impossible',err.message,'error');}
  }

  // =====================================================
  // PROFIL
  // =====================================================
  async function renderProfile(){
    const profile=await api('/api/admin/profile');
    currentAdmin={displayName:profile.displayName||'Administrateur',email:profile.email||''};
    updateAdminHeader();
    const initial=initials(profile.displayName);

    viewContent.innerHTML=`
      <div class="profile-layout">
        <aside class="profile-summary">
          <div class="profile-big-avatar">${esc(initial)}</div>
          <h3>${esc(profile.displayName)}</h3>
          <p>Administrateur SAMMOLLO</p>
          <div class="profile-facts">
            <div class="profile-fact"><span>Email</span><strong>${esc(profile.email)}</strong></div>
            <div class="profile-fact"><span>Rôle</span><strong>Administrateur</strong></div>
            <div class="profile-fact"><span>Dernière connexion</span><strong>${dt(profile.lastLoginAt)}</strong></div>
            <div class="profile-fact"><span>Compte créé</span><strong>${dt(profile.createdAt)}</strong></div>
          </div>
        </aside>
        <div class="profile-forms">
          <section class="profile-panel">
            <h3>Informations du profil</h3>
            <p>Le mot de passe actuel est demandé uniquement si vous changez l’adresse email.</p>
            <form id="profileInfoForm" class="entity-form">
              <div class="form-grid">
                <div class="form-field"><label for="profileName">Nom</label><input id="profileName" type="text" maxlength="100" value="${esc(profile.displayName)}" required></div>
                <div class="form-field"><label for="profileEmail">Email</label><input id="profileEmail" type="email" maxlength="180" value="${esc(profile.email)}" required></div>
                <div class="form-field form-field-full"><label for="profileCurrentPassword">Mot de passe actuel si changement d’email</label><input id="profileCurrentPassword" type="password" autocomplete="current-password"></div>
              </div>
              <p id="profileInfoStatus" class="form-message"></p>
              <div class="dialog-actions"><button class="admin-btn" type="submit">Enregistrer le profil</button></div>
            </form>
          </section>

          <section class="profile-panel">
            <h3>Changer le mot de passe</h3>
            <p>Utilisez un mot de passe unique d’au moins 12 caractères.</p>
            <form id="profilePasswordForm" class="entity-form">
              <div class="form-grid">
                <div class="form-field form-field-full"><label for="passwordCurrent">Mot de passe actuel</label><input id="passwordCurrent" type="password" autocomplete="current-password" required></div>
                <div class="form-field"><label for="passwordNew">Nouveau mot de passe</label><input id="passwordNew" type="password" autocomplete="new-password" minlength="12" required></div>
                <div class="form-field"><label for="passwordConfirm">Confirmer</label><input id="passwordConfirm" type="password" autocomplete="new-password" minlength="12" required></div>
              </div>
              <p id="profilePasswordStatus" class="form-message"></p>
              <div class="dialog-actions"><button class="admin-btn" type="submit">Changer le mot de passe</button></div>
            </form>
          </section>
        </div>
      </div>`;

    $('#profileInfoForm').addEventListener('submit',saveProfileInfo);
    $('#profilePasswordForm').addEventListener('submit',changeProfilePassword);
  }

  async function saveProfileInfo(e){
    e.preventDefault();
    const form=e.currentTarget;
    const button=form.querySelector('button[type="submit"]');
    const status=$('#profileInfoStatus');
    button.disabled=true;status.textContent='Enregistrement…';status.className='form-message';
    try{
      const result=await api('/api/admin/profile',{method:'PATCH',body:JSON.stringify({
        displayName:$('#profileName').value.trim(),
        email:$('#profileEmail').value.trim(),
        currentPassword:$('#profileCurrentPassword').value
      })});
      currentAdmin={displayName:result.admin.displayName,email:result.admin.email};
      updateAdminHeader();
      status.textContent='Profil mis à jour ✓';status.classList.add('success');
      $('#profileCurrentPassword').value='';
      toast('Profil mis à jour');
      setTimeout(()=>renderProfile(),500);
    }catch(err){status.textContent=err.message;status.classList.add('error');}
    finally{button.disabled=false;}
  }

  async function changeProfilePassword(e){
    e.preventDefault();
    const form=e.currentTarget;
    const button=form.querySelector('button[type="submit"]');
    const status=$('#profilePasswordStatus');
    const next=$('#passwordNew').value;
    const confirm=$('#passwordConfirm').value;
    status.className='form-message';
    if(next!==confirm){status.textContent='Les deux nouveaux mots de passe ne correspondent pas.';status.classList.add('error');return;}
    if(next.length<12){status.textContent='Le nouveau mot de passe doit contenir au moins 12 caractères.';status.classList.add('error');return;}
    button.disabled=true;status.textContent='Modification…';
    try{
      const result=await api('/api/admin/profile/password',{method:'PATCH',body:JSON.stringify({currentPassword:$('#passwordCurrent').value,newPassword:next})});
      status.textContent=result.message||'Mot de passe modifié ✓';status.classList.add('success');
      form.reset();
      toast('Mot de passe modifié','Utilisez le nouveau mot de passe lors de votre prochaine connexion.');
    }catch(err){status.textContent=err.message;status.classList.add('error');}
    finally{button.disabled=false;}
  }

  // =====================================================
  // FORMULAIRES PRODUIT / CATÉGORIE / ÉVÉNEMENT
  // =====================================================
  $('#productForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const id=$('#productId').value;
    const save=$('#saveProduct');
    const status=$('#productFormStatus');
    save.disabled=true;status.className='form-message';status.textContent='Enregistrement…';
    try{
      let imagePath=$('#productCurrentImage').value||undefined;
      const file=$('#productImage').files?.[0];
      if(file){status.textContent='Envoi de la photo…';imagePath=(await uploadImage('/api/admin/uploads/product-image',file)).url;}
      const payload={
        categoryId:Number($('#productCategory').value),
        name:$('#productName').value.trim(),
        description:$('#productDescription').value.trim(),
        price:Number($('#productPrice').value),
        badge:$('#productBadge').value.trim(),
        sortOrder:Number($('#productSortOrder').value)||0,
        available:$('#productAvailable').checked,
        featured:$('#productFeatured').checked
      };
      if(imagePath!==undefined)payload.imagePath=imagePath;
      if(!id)payload.slug=slugify(payload.name);

      await api(id?`/api/admin/menu/${id}`:'/api/admin/menu',{method:id?'PATCH':'POST',body:JSON.stringify(payload)});
      status.textContent=id?'Produit modifié ✓':'Produit ajouté ✓';status.classList.add('success');
      toast(id?'Produit modifié':'Produit ajouté');
      await loadMetrics();
      closeModal(productModal);
      if(currentView==='menu')await renderProducts();
    }catch(err){status.textContent=err.message;status.classList.add('error');}
    finally{save.disabled=false;}
  });

  $('#categoryForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const id=$('#categoryId').value;
    const save=$('#saveCategory');
    const status=$('#categoryFormStatus');
    save.disabled=true;status.className='form-message';status.textContent='Enregistrement…';
    try{
      const name=$('#categoryName').value.trim();
      const payload={name,slug:slugify(name),sortOrder:Number($('#categorySortOrder').value)||0,active:$('#categoryActive').checked};
      await api(id?`/api/admin/categories/${id}`:'/api/admin/categories',{method:id?'PATCH':'POST',body:JSON.stringify(payload)});
      toast(id?'Catégorie modifiée':'Catégorie ajoutée');
      closeModal(categoryModal);
      if(currentView==='categories')await renderCategories();
      else categoriesCache=[];
    }catch(err){status.textContent=err.message;status.classList.add('error');}
    finally{save.disabled=false;}
  });

  $('#eventForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const id=$('#eventId').value;
    const save=$('#saveEvent');
    const status=$('#eventFormStatus');
    save.disabled=true;status.className='form-message';status.textContent='Enregistrement…';
    try{
      let imagePath=$('#eventCurrentImage').value||undefined;
      const file=$('#eventImage').files?.[0];
      if(file){status.textContent='Envoi de la photo…';imagePath=(await uploadImage('/api/admin/uploads/event-image',file)).url;}
      const payload={
        title:$('#eventTitle').value.trim(),
        summary:$('#eventSummary').value.trim(),
        eventDate:$('#eventDate').value||null,
        recurrenceLabel:$('#eventRecurrence').value.trim(),
        status:$('#eventStatus').value,
        sortOrder:Number($('#eventSortOrder').value)||0,
        featured:$('#eventFeatured').checked
      };
      if(imagePath!==undefined)payload.imagePath=imagePath;
      if(!id)payload.slug=slugify(payload.title);
      await api(id?`/api/admin/events/${id}`:'/api/admin/events',{method:id?'PATCH':'POST',body:JSON.stringify(payload)});
      toast(id?'Événement modifié':'Événement ajouté');
      closeModal(eventModal);
      if(currentView==='events')await renderEvents();
    }catch(err){status.textContent=err.message;status.classList.add('error');}
    finally{save.disabled=false;}
  });

  function previewFile(input,preview){
    const file=input.files?.[0];
    if(!file)return;
    if(file.size>4*1024*1024){input.value='';toast('Photo trop volumineuse','Maximum 4 Mo.','error');return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){input.value='';toast('Format non autorisé','Utilisez JPG, PNG ou WebP.','error');return;}
    const url=URL.createObjectURL(file);
    preview.innerHTML=`<img src="${url}" alt="Aperçu">`;
  }

  // =====================================================
  // ÉVÉNEMENTS STATIQUES
  // =====================================================
  $('#togglePassword').addEventListener('click',()=>{
    const input=$('#adminPassword');
    const show=input.type==='password';
    input.type=show?'text':'password';
    $('#togglePassword').setAttribute('aria-pressed',String(show));
    $('#togglePassword').setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe');
    input.focus();
  });

  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const status=$('#loginStatus');
    const button=$('#loginSubmit');
    status.className='form-message';status.textContent='Connexion en cours…';button.disabled=true;
    try{
      const data=Object.fromEntries(new FormData(e.currentTarget));
      const result=await api('/api/admin/login',{method:'POST',body:JSON.stringify(data)});
      currentAdmin={displayName:result.admin.displayName||'Administrateur',email:result.admin.email||''};
      e.currentTarget.reset();
      $('#adminPassword').type='password';
      status.textContent='';
      showApp();
      await render('dashboard');
    }catch(err){status.textContent=err.message;status.classList.add('error');}
    finally{button.disabled=false;}
  });

  $$('.side-link').forEach(btn=>btn.addEventListener('click',()=>render(btn.dataset.view)));
  $('#refreshBtn').addEventListener('click',()=>render(currentView));
  $('#profileShortcut').addEventListener('click',()=>render('profile'));
  primaryActionBtn.addEventListener('click',()=>{
    if(primaryActionBtn.dataset.action==='product')openProductDialog();
    if(primaryActionBtn.dataset.action==='category')openCategoryDialog();
    if(primaryActionBtn.dataset.action==='event')openEventDialog();
  });

  $('#mobileMenuBtn').addEventListener('click',()=>{
    document.body.classList.add('sidebar-open');
    $('#sideOverlay').hidden=false;
  });
  $('#sideOverlay').addEventListener('click',()=>{
    document.body.classList.remove('sidebar-open');
    $('#sideOverlay').hidden=true;
  });

  $('#logoutBtn').addEventListener('click',()=>openModal(logoutModal));
  $('#cancelLogout').addEventListener('click',()=>closeModal(logoutModal));
  $('#logoutClose').addEventListener('click',()=>closeModal(logoutModal));
  $('#confirmLogout').addEventListener('click',async()=>{
    const button=$('#confirmLogout');
    button.disabled=true;button.textContent='Déconnexion…';
    try{await api('/api/admin/logout',{method:'POST',body:'{}'});}catch{}
    finally{
      button.disabled=false;button.textContent='Se déconnecter';
      closeModal(logoutModal);showLogin();
    }
  });

  $('#forgotCredentials').addEventListener('click',()=>openModal(credentialsModal));
  $('#credentialsClose').addEventListener('click',()=>closeModal(credentialsModal));
  $('#credentialsOk').addEventListener('click',()=>closeModal(credentialsModal));

  $('#orderDetailClose').addEventListener('click',()=>closeModal(orderDetailModal));
  $('#messageClose').addEventListener('click',()=>closeModal(messageModal));
  $('#productModalClose').addEventListener('click',()=>closeModal(productModal));
  $('#cancelProduct').addEventListener('click',()=>closeModal(productModal));
  $('#categoryModalClose').addEventListener('click',()=>closeModal(categoryModal));
  $('#cancelCategory').addEventListener('click',()=>closeModal(categoryModal));
  $('#eventModalClose').addEventListener('click',()=>closeModal(eventModal));
  $('#cancelEvent').addEventListener('click',()=>closeModal(eventModal));

  $('#confirmClose').addEventListener('click',()=>resolveConfirm(false));
  $('#confirmCancel').addEventListener('click',()=>resolveConfirm(false));
  $('#confirmAccept').addEventListener('click',()=>resolveConfirm(true));

  $('#productImage').addEventListener('change',()=>previewFile($('#productImage'),$('#productImagePreview')));
  $('#eventImage').addEventListener('change',()=>previewFile($('#eventImage'),$('#eventImagePreview')));

  [logoutModal,credentialsModal,orderDetailModal,messageModal,productModal,categoryModal,eventModal,confirmModal].forEach(modal=>{
    modal.addEventListener('click',e=>{
      if(e.target!==modal)return;
      if(modal===confirmModal)resolveConfirm(false);
      else closeModal(modal);
    });
  });

  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(!confirmModal.hidden){resolveConfirm(false);return;}
    [logoutModal,credentialsModal,orderDetailModal,messageModal,productModal,categoryModal,eventModal].forEach(modal=>{
      if(!modal.hidden)closeModal(modal);
    });
    document.body.classList.remove('sidebar-open');
    $('#sideOverlay').hidden=true;
  });

  updateClock();
  setInterval(updateClock,30000);

  (async()=>{
    try{
      const profile=await api('/api/admin/profile');
      currentAdmin={displayName:profile.displayName||'Administrateur',email:profile.email||''};
      showApp();
      await render('dashboard');
    }catch{
      showLogin();
    }
  })();
})();
