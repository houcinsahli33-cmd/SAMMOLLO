(()=>{
  const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const loginPanel=$('#loginPanel'), appPanel=$('#appPanel'), viewContent=$('#viewContent');
  const title=$('#viewTitle'), subtitle=$('#viewSubtitle'), contentTitle=$('#contentTitle'), contentKicker=$('#contentKicker');
  const loginForm=$('#loginForm'), loginStatus=$('#loginStatus'), loginSubmit=$('#loginSubmit');
  const passwordInput=$('#adminPassword'), togglePassword=$('#togglePassword');
  const logoutModal=$('#logoutModal'), credentialsModal=$('#credentialsModal'), orderDetailModal=$('#orderDetailModal');
  let current='dashboard';

  const statusLabels={pending:'En attente',confirmed:'Confirmée',preparing:'En préparation',ready:'Prête',completed:'Terminée',cancelled:'Annulée'};
  const paymentLabels={unpaid:'Non payé',pending:'En attente',paid:'Payé',failed:'Échoué',refunded:'Remboursé'};
  const messageLabels={new:'Nouveau',read:'Lu',replied:'Répondu',archived:'Archivé'};
  const viewMeta={
    dashboard:{title:'Tableau de bord',subtitle:"Vue générale de l'activité du restaurant.",kicker:'ACTIVITÉ',content:'Vue d’ensemble'},
    orders:{title:'Commandes',subtitle:'Confirmez les demandes et suivez chaque commande.',kicker:'COMMANDES',content:'Gestion des commandes'},
    payments:{title:'Paiements',subtitle:'Suivez les paiements en ligne et leur état.',kicker:'PAIEMENTS',content:'Transactions'},
    messages:{title:'Messages',subtitle:'Consultez et classez les demandes du formulaire Contact.',kicker:'CONTACT',content:'Messages reçus'},
    menu:{title:'Carte & produits',subtitle:'Modifiez les produits visibles sur la carte.',kicker:'CARTE',content:'Produits du menu'},
    events:{title:'Événements',subtitle:'Gérez les événements publiés sur le site SAMMOLLO.',kicker:'ÉVÉNEMENTS',content:'Programmation'}
  };

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=n=>new Intl.NumberFormat('fr-DZ').format(Number(n)||0)+' DA';
  const dt=v=>v?new Date(v).toLocaleString('fr-FR'):'—';
  const badge=(text,kind='')=>`<span class="badge ${kind}">${esc(text)}</span>`;
  const empty=t=>`<div class="empty-state"><span class="empty-state-mark">S</span><strong>${esc(t)}</strong></div>`;

  async function api(url,opts={}){
    const r=await fetch(url,{...opts,credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})}});
    const j=await r.json().catch(()=>({}));
    if(r.status===401){showLogin();throw new Error(j.message||'Session expirée.');}
    if(!r.ok) throw new Error(j.message||'Erreur serveur.');
    return j;
  }

  function showLogin(){appPanel.hidden=true;loginPanel.hidden=false;document.body.classList.remove('admin-authenticated');closeModal(logoutModal);closeModal(orderDetailModal);setTimeout(()=>$('#adminEmail')?.focus(),60);}
  function showApp(){loginPanel.hidden=true;appPanel.hidden=false;document.body.classList.add('admin-authenticated');}
  function openModal(m){m.hidden=false;document.body.classList.add('modal-open');}
  function closeModal(m){if(!m)return;m.hidden=true;if([logoutModal,credentialsModal,orderDetailModal].every(x=>x.hidden))document.body.classList.remove('modal-open');}
  function setMeta(view){const m=viewMeta[view]||viewMeta.dashboard;title.textContent=m.title;subtitle.textContent=m.subtitle;contentKicker.textContent=m.kicker;contentTitle.textContent=m.content;}

  async function metrics(){
    const d=await api('/api/admin/dashboard');
    $('#metricMessages').textContent=d.newMessages; $('#metricOrders').textContent=d.pendingOrders; $('#metricRevenue').textContent=money(d.todayRevenue); $('#metricItems').textContent=d.availableItems;
    const od=$('#pendingOrderDot'), md=$('#newMessageDot');
    od.textContent=d.pendingOrders; od.hidden=!d.pendingOrders; md.textContent=d.newMessages; md.hidden=!d.newMessages;
    return d;
  }

  async function setOrderStatus(id,status){await api(`/api/admin/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});await metrics();await render('orders');}

  async function showOrderDetails(id){
    openModal(orderDetailModal); $('#orderDetailBody').innerHTML='<div class="loading-state"><span></span><p>Chargement…</p></div>';
    try{
      const o=await api(`/api/admin/orders/${id}`);
      $('#orderDetailTitle').textContent=`Commande ${String(o.public_id).slice(0,8).toUpperCase()}`;
      $('#orderDetailBody').innerHTML=`
        <div class="detail-grid">
          <div><span>Client</span><strong>${esc(o.customer_name)}</strong></div><div><span>Téléphone</span><strong>${esc(o.customer_phone)}</strong></div>
          <div><span>Email</span><strong>${esc(o.customer_email||'—')}</strong></div><div><span>Type</span><strong>${o.order_type==='dine_in'?'Sur place':'À emporter'}</strong></div>
          <div><span>Statut</span><strong>${statusLabels[o.status]||o.status}</strong></div><div><span>Paiement</span><strong>${paymentLabels[o.payment_status]||o.payment_status}</strong></div>
        </div>
        <div class="detail-section"><h3>Produits</h3>${o.items.map(i=>`<div class="detail-line"><span>${esc(i.item_name)} × ${i.quantity}</span><strong>${money(i.line_total)}</strong></div>`).join('')}</div>
        ${o.notes?`<div class="detail-section"><h3>Note client</h3><p>${esc(o.notes)}</p></div>`:''}
        <div class="detail-total"><span>Total</span><strong>${money(o.total)}</strong></div>
        ${o.receipt?`<div class="receipt-box"><span>Reçu</span><strong>${esc(o.receipt.receipt_number)}</strong></div>`:''}
        <div class="detail-actions"><button class="secondary-btn" data-detail-status="confirmed">Confirmer</button><button class="secondary-btn" data-detail-status="preparing">Préparation</button><button class="secondary-btn" data-detail-status="ready">Prête</button><button class="secondary-btn" data-detail-status="completed">Terminer</button><button class="danger-btn" data-detail-status="cancelled">Annuler</button></div>`;
      $$('[data-detail-status]',$('#orderDetailBody')).forEach(b=>b.addEventListener('click',async()=>{await api(`/api/admin/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status:b.dataset.detailStatus})});closeModal(orderDetailModal);await metrics();await render('orders');}));
    }catch(e){$('#orderDetailBody').innerHTML=`<p class="empty error-text">${esc(e.message)}</p>`;}
  }

  async function render(view=current){
    current=view; $$('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); setMeta(view);
    viewContent.innerHTML='<div class="loading-state"><span></span><p>Chargement des données…</p></div>';

    if(view==='dashboard'){
      const d=await metrics();
      viewContent.innerHTML=`<div class="dashboard-welcome"><div><p class="kicker">SYSTÈME OPÉRATIONNEL</p><h3>Bienvenue dans votre espace SAMMOLLO.</h3><p>Vous pouvez confirmer les commandes, suivre les paiements, consulter les messages, mettre à jour la carte et gérer les événements depuis un seul espace.</p></div><div class="system-status"><i></i><span>TiDB / MySQL connecté</span></div></div><div class="dashboard-mini"><article><span>Commandes aujourd’hui</span><strong>${d.todayOrders}</strong></article><article><span>Commandes actives</span><strong>${d.activeOrders}</strong></article><article><span>Paiements reçus aujourd’hui</span><strong>${d.paidPayments}</strong></article></div>`;
      return;
    }

    if(view==='orders'){
      const rows=await api('/api/admin/orders'); if(!rows.length){viewContent.innerHTML=empty('Aucune commande pour le moment.');return;}
      viewContent.innerHTML=`<table class="data-table orders-table"><thead><tr><th>Date</th><th>Réf.</th><th>Client</th><th>Total</th><th>Paiement</th><th>Statut</th><th>Actions</th></tr></thead><tbody>${rows.map(o=>`<tr class="${o.status==='pending'?'row-highlight':''}"><td>${dt(o.created_at)}</td><td><code>${esc(o.public_id).slice(0,8).toUpperCase()}</code></td><td><strong>${esc(o.customer_name)}</strong><small>${esc(o.customer_phone)}</small></td><td><strong>${money(o.total)}</strong></td><td>${badge(paymentLabels[o.payment_status]||o.payment_status,o.payment_status==='paid'?'success':o.payment_status==='failed'?'danger':'')}</td><td><select class="status-select" data-order-status="${o.id}">${Object.entries(statusLabels).map(([k,v])=>`<option value="${k}" ${k===o.status?'selected':''}>${v}</option>`).join('')}</select></td><td><div class="action-group">${o.status==='pending'?`<button class="mini-btn success" data-confirm="${o.id}">Confirmer</button><button class="mini-btn danger" data-cancel="${o.id}">Refuser</button>`:''}<button class="mini-btn" data-details="${o.id}">Détails</button></div></td></tr>`).join('')}</tbody></table>`;
      $$('[data-order-status]').forEach(s=>s.addEventListener('change',()=>setOrderStatus(s.dataset.orderStatus,s.value).catch(e=>alert(e.message))));
      $$('[data-confirm]').forEach(b=>b.addEventListener('click',()=>setOrderStatus(b.dataset.confirm,'confirmed').catch(e=>alert(e.message))));
      $$('[data-cancel]').forEach(b=>b.addEventListener('click',()=>setOrderStatus(b.dataset.cancel,'cancelled').catch(e=>alert(e.message))));
      $$('[data-details]').forEach(b=>b.addEventListener('click',()=>showOrderDetails(b.dataset.details)));
      return;
    }

    if(view==='payments'){
      const rows=await api('/api/admin/payments'); if(!rows.length){viewContent.innerHTML=empty('Aucun paiement en ligne pour le moment.');return;}
      viewContent.innerHTML=`<div class="inline-note">Le statut <strong>Payé</strong> est mis à jour automatiquement par le webhook du prestataire de paiement.</div><table class="data-table"><thead><tr><th>Date</th><th>Commande</th><th>Client</th><th>Prestataire</th><th>Montant</th><th>Statut</th><th>Référence</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${dt(p.created_at)}</td><td><code>${esc(p.public_id).slice(0,8).toUpperCase()}</code></td><td><strong>${esc(p.customer_name)}</strong></td><td>${esc(p.provider)}</td><td><strong>${money(p.amount)}</strong></td><td>${badge(paymentLabels[p.status]||p.status,p.status==='paid'?'success':p.status==='failed'?'danger':'')}</td><td class="payment-ref">${esc(p.provider_reference||'—')}</td></tr>`).join('')}</tbody></table>`;
      return;
    }

    if(view==='messages'){
      const rows=await api('/api/admin/messages'); if(!rows.length){viewContent.innerHTML=empty('Aucun message pour le moment.');return;}
      viewContent.innerHTML=`<table class="data-table"><thead><tr><th>Date</th><th>Client</th><th>Email</th><th>Objet</th><th>Message</th><th>Statut</th></tr></thead><tbody>${rows.map(m=>`<tr class="${m.status==='new'?'row-highlight':''}"><td>${dt(m.created_at)}</td><td><strong>${esc(m.name)}</strong></td><td><a class="table-link" href="mailto:${esc(m.email)}">${esc(m.email)}</a></td><td>${esc(m.subject)}</td><td class="message-cell">${esc(m.message).slice(0,180)}</td><td><select class="status-select" data-message-status="${m.id}">${Object.entries(messageLabels).map(([k,v])=>`<option value="${k}" ${k===m.status?'selected':''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
      $$('[data-message-status]').forEach(s=>s.addEventListener('change',async()=>{await api(`/api/admin/messages/${s.dataset.messageStatus}/status`,{method:'PATCH',body:JSON.stringify({status:s.value})});await metrics();}));
      return;
    }

    if(view==='menu'){
      const rows=await api('/api/menu'); if(!rows.length){viewContent.innerHTML=empty('Aucun produit enregistré.');return;}
      viewContent.innerHTML=`<div class="inline-note">Les changements sont enregistrés directement dans TiDB / MySQL.</div>${rows.map(x=>`<div class="menu-edit" data-id="${x.id}"><input aria-label="Nom" data-f="name" value="${esc(x.name)}"><input aria-label="Description" data-f="description" value="${esc(x.description)}"><input aria-label="Prix" data-f="price" type="number" min="0" value="${x.price}"><label class="availability"><input data-f="available" type="checkbox" ${x.available?'checked':''}><span>Disponible</span></label><button type="button">Enregistrer</button></div>`).join('')}`;
      $$('.menu-edit').forEach(row=>row.querySelector('button').addEventListener('click',async()=>{const v=f=>row.querySelector(`[data-f="${f}"]`);await api(`/api/admin/menu/${row.dataset.id}`,{method:'PATCH',body:JSON.stringify({name:v('name').value,description:v('description').value,price:Number(v('price').value),available:v('available').checked,featured:false,badge:''})});const b=row.querySelector('button');b.textContent='Enregistré ✓';setTimeout(()=>b.textContent='Enregistrer',1200);})); return;
    }

    if(view==='events'){
      const rows=await api('/api/admin/events'); if(!rows.length){viewContent.innerHTML=empty('Aucun événement enregistré.');return;}
      viewContent.innerHTML=`<div class="inline-note">Les événements publiés alimentent directement la page Événements.</div>${rows.map(x=>`<div class="menu-edit event-edit" data-event="${x.id}"><input data-f="title" value="${esc(x.title)}"><input data-f="summary" value="${esc(x.summary)}"><input data-f="recurrence" value="${esc(x.recurrence_label||'')}"><select data-f="status"><option value="published" ${x.status==='published'?'selected':''}>Publié</option><option value="draft" ${x.status==='draft'?'selected':''}>Brouillon</option><option value="archived" ${x.status==='archived'?'selected':''}>Archivé</option></select><button type="button">Enregistrer</button></div>`).join('')}`;
      $$('[data-event]').forEach(row=>row.querySelector('button').addEventListener('click',async()=>{const v=f=>row.querySelector(`[data-f="${f}"]`),c=rows.find(x=>x.id===Number(row.dataset.event));await api(`/api/admin/events/${row.dataset.event}`,{method:'PATCH',body:JSON.stringify({title:v('title').value,summary:v('summary').value,recurrenceLabel:v('recurrence').value,status:v('status').value,imagePath:c.image_path,eventDate:c.event_date,featured:c.featured})});const b=row.querySelector('button');b.textContent='Enregistré ✓';setTimeout(()=>b.textContent='Enregistrer',1200);}));
    }
  }

  togglePassword.addEventListener('click',()=>{const show=passwordInput.type==='password';passwordInput.type=show?'text':'password';togglePassword.setAttribute('aria-pressed',String(show));togglePassword.setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe');togglePassword.classList.toggle('is-visible',show);passwordInput.focus();});
  loginForm.addEventListener('submit',async e=>{e.preventDefault();loginStatus.textContent='Connexion en cours…';loginStatus.classList.remove('error');loginSubmit.disabled=true;try{const data=Object.fromEntries(new FormData(e.currentTarget));const r=await api('/api/admin/login',{method:'POST',body:JSON.stringify(data)});$('#adminName').textContent=r.admin.displayName;showApp();loginStatus.textContent='';e.currentTarget.reset();passwordInput.type='password';await render('dashboard');}catch(err){loginStatus.textContent=err.message;loginStatus.classList.add('error');}finally{loginSubmit.disabled=false;}});
  $$('.side-link').forEach(b=>b.addEventListener('click',()=>render(b.dataset.view).catch(e=>viewContent.innerHTML=`<p class="empty error-text">${esc(e.message)}</p>`)));
  $('#refreshBtn').addEventListener('click',()=>render(current).catch(e=>viewContent.innerHTML=`<p class="empty error-text">${esc(e.message)}</p>`));

  $('#logoutBtn').addEventListener('click',()=>openModal(logoutModal)); $('#cancelLogout').addEventListener('click',()=>closeModal(logoutModal)); $('#logoutClose').addEventListener('click',()=>closeModal(logoutModal));
  $('#confirmLogout').addEventListener('click',async()=>{const b=$('#confirmLogout');b.disabled=true;b.textContent='Déconnexion…';try{await api('/api/admin/logout',{method:'POST',body:'{}'});}catch{}finally{b.disabled=false;b.textContent='Se déconnecter';closeModal(logoutModal);showLogin();}});

  $('#forgotCredentials').addEventListener('click',()=>openModal(credentialsModal)); $('#credentialsClose').addEventListener('click',()=>closeModal(credentialsModal)); $('#credentialsOk').addEventListener('click',()=>closeModal(credentialsModal));
  $('#orderDetailClose').addEventListener('click',()=>closeModal(orderDetailModal));
  [logoutModal,credentialsModal,orderDetailModal].forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m);}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){[logoutModal,credentialsModal,orderDetailModal].forEach(closeModal);}});

  (async()=>{try{await metrics();showApp();await render('dashboard');}catch{showLogin();}})();
})();
