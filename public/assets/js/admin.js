(()=>{
  const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const loginPanel=$('#loginPanel'), appPanel=$('#appPanel'), viewContent=$('#viewContent'), metricsPanel=$('#metricsPanel');
  const title=$('#viewTitle'), subtitle=$('#viewSubtitle'), contentTitle=$('#contentTitle'), contentKicker=$('#contentKicker');
  const loginForm=$('#loginForm'), loginStatus=$('#loginStatus'), loginSubmit=$('#loginSubmit');
  const passwordInput=$('#adminPassword'), togglePassword=$('#togglePassword');
  const logoutModal=$('#logoutModal'), credentialsModal=$('#credentialsModal'), orderDetailModal=$('#orderDetailModal');
  const productModal=$('#productModal'), productForm=$('#productForm'), productImage=$('#productImage'), productImagePreview=$('#productImagePreview');
  const openProductModalBtn=$('#openProductModal');
  let current='dashboard';
  let currentAdmin={displayName:'Administrateur',email:''};

  const statusLabels={pending:'En attente',confirmed:'Confirmée',preparing:'En préparation',ready:'Prête',completed:'Terminée',cancelled:'Annulée'};
  const paymentLabels={unpaid:'Non payé',pending:'En attente',paid:'Payé',failed:'Échoué',refunded:'Remboursé'};
  const messageLabels={new:'Nouveau',read:'Lu',replied:'Répondu',archived:'Archivé'};
  const viewMeta={
    dashboard:{title:'Tableau de bord',subtitle:"Pilotez l’activité SAMMOLLO depuis un seul espace.",kicker:'ACTIVITÉ',content:'Centre de contrôle'},
    orders:{title:'Commandes',subtitle:'Confirmez les demandes et suivez chaque commande.',kicker:'COMMANDES',content:'Gestion des commandes'},
    payments:{title:'Paiements',subtitle:'Suivez les paiements en ligne et leur état.',kicker:'PAIEMENTS',content:'Transactions'},
    messages:{title:'Messages',subtitle:'Consultez et classez les demandes du formulaire Contact.',kicker:'CONTACT',content:'Messages reçus'},
    menu:{title:'Carte & produits',subtitle:'Modifiez les produits visibles sur la carte.',kicker:'CARTE',content:'Gestion du menu'},
    events:{title:'Événements',subtitle:'Gérez les événements publiés sur le site SAMMOLLO.',kicker:'ÉVÉNEMENTS',content:'Programmation'},
    profile:{title:'Profil administrateur',subtitle:'Gérez votre nom, votre email et votre mot de passe.',kicker:'COMPTE',content:'Mon profil'}
  };

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=n=>new Intl.NumberFormat('fr-DZ').format(Number(n)||0)+' DA';
  const dt=v=>v?new Date(v).toLocaleString('fr-FR'):'—';
  const shortDate=v=>v?new Date(v).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
  const shortTime=v=>v?new Date(v).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'—';
  const badge=(text,kind='')=>`<span class="badge ${kind}">${esc(text)}</span>`;
  const empty=t=>`<div class="empty-state"><span class="empty-state-mark">S</span><strong>${esc(t)}</strong></div>`;
  const slugify=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

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
  function closeModal(m){if(!m)return;m.hidden=true;if([logoutModal,credentialsModal,orderDetailModal,productModal].filter(Boolean).every(x=>x.hidden))document.body.classList.remove('modal-open');}
  function setMeta(view){const m=viewMeta[view]||viewMeta.dashboard;title.textContent=m.title;subtitle.textContent=m.subtitle;contentKicker.textContent=m.kicker;contentTitle.textContent=m.content;metricsPanel.hidden=view!=='dashboard';if(openProductModalBtn)openProductModalBtn.hidden=view!=='menu';}

  function updateClock(){
    const now=new Date();
    const dateEl=$('#adminDate'), timeEl=$('#adminTime');
    if(dateEl)dateEl.textContent=now.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short'}).replace('.','');
    if(timeEl)timeEl.textContent=now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  }
  updateClock(); setInterval(updateClock,30000);

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

  function bindJumpButtons(root=document){
    $$('[data-jump]',root).forEach(b=>b.addEventListener('click',()=>render(b.dataset.jump).catch(e=>viewContent.innerHTML=`<p class="empty error-text">${esc(e.message)}</p>`)));
  }

  async function renderDashboard(){
    const [d,orders,payments,messages]=await Promise.all([metrics(),api('/api/admin/orders'),api('/api/admin/payments'),api('/api/admin/messages')]);
    const totalOrders=orders.length||1;
    const counts={pending:0,confirmed:0,preparing:0,ready:0,completed:0,cancelled:0};
    orders.forEach(o=>{if(counts[o.status]!==undefined)counts[o.status]++;});
    const recent=orders.slice(0,5);
    const paidToday=payments.filter(p=>p.status==='paid'&&new Date(p.updated_at||p.created_at).toDateString()===new Date().toDateString()).length;
    const newMessages=messages.filter(m=>m.status==='new').length;
    const pct=n=>Math.max(0,Math.min(100,Math.round((n/totalOrders)*100)));
    const updatedAt=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});

    viewContent.innerHTML=`
      <div class="dashboard-v3">
        <section class="dashboard-hero-v3">
          <div>
            <p class="kicker">CENTRE DE CONTRÔLE</p>
            <h3>Bienvenue dans votre espace SAMMOLLO.</h3>
            <p class="dashboard-copy">Suivez les commandes, paiements et messages importants, puis accédez rapidement aux actions qui nécessitent votre attention.</p>
          </div>
          <div class="dashboard-hero-meta">
            <span class="system-pill"><i></i> TiDB / MySQL connecté</span>
            <span class="sync-pill">Dernière actualisation · ${updatedAt}</span>
          </div>
        </section>

        <div class="dashboard-grid-v3">
          <div class="dashboard-col">
            <section class="dash-panel">
              <div class="dash-panel-head"><div><h3>À traiter maintenant</h3><p>Les éléments qui demandent votre attention.</p></div></div>
              <div class="attention-grid">
                <button class="attention-card urgent" type="button" data-jump="orders"><span class="attention-top">Commandes <b class="attention-arrow">→</b></span><strong class="attention-count">${d.pendingOrders}</strong><span class="attention-label">à confirmer</span></button>
                <button class="attention-card" type="button" data-jump="messages"><span class="attention-top">Messages <b class="attention-arrow">→</b></span><strong class="attention-count">${newMessages}</strong><span class="attention-label">nouveaux messages</span></button>
                <button class="attention-card successful" type="button" data-jump="payments"><span class="attention-top">Paiements <b class="attention-arrow">→</b></span><strong class="attention-count">${paidToday}</strong><span class="attention-label">reçus aujourd’hui</span></button>
              </div>
            </section>

            <section class="dash-panel">
              <div class="dash-panel-head"><div><h3>Commandes récentes</h3><p>Les cinq dernières demandes enregistrées.</p></div><button class="panel-link" type="button" data-jump="orders">Voir toutes →</button></div>
              <div class="recent-list">
                ${recent.length?recent.map(o=>`<div class="recent-order"><div class="recent-client"><strong>${esc(o.customer_name)}</strong><small>${shortDate(o.created_at)} · ${shortTime(o.created_at)}</small></div><div class="recent-ref"><code>${esc(o.public_id).slice(0,8).toUpperCase()}</code><small>${statusLabels[o.status]||esc(o.status)}</small></div><div class="recent-total">${money(o.total)}</div><div class="recent-actions"><button class="mini-btn" type="button" data-dashboard-details="${o.id}">Détails</button></div></div>`).join(''):empty('Aucune commande pour le moment.')}
              </div>
            </section>
          </div>

          <div class="dashboard-col side">
            <section class="dash-panel">
              <div class="dash-panel-head"><div><h3>État des commandes</h3><p>Répartition des 100 dernières commandes.</p></div></div>
              <div class="status-list">
                <div class="status-row"><span>En attente</span><div class="status-track"><div class="status-fill" style="width:${pct(counts.pending)}%"></div></div><strong>${counts.pending}</strong></div>
                <div class="status-row"><span>Confirmées</span><div class="status-track"><div class="status-fill" style="width:${pct(counts.confirmed)}%"></div></div><strong>${counts.confirmed}</strong></div>
                <div class="status-row"><span>Préparation</span><div class="status-track"><div class="status-fill green" style="width:${pct(counts.preparing)}%"></div></div><strong>${counts.preparing}</strong></div>
                <div class="status-row"><span>Prêtes</span><div class="status-track"><div class="status-fill green" style="width:${pct(counts.ready)}%"></div></div><strong>${counts.ready}</strong></div>
                <div class="status-row"><span>Terminées</span><div class="status-track"><div class="status-fill gray" style="width:${pct(counts.completed)}%"></div></div><strong>${counts.completed}</strong></div>
                <div class="status-row"><span>Annulées</span><div class="status-track"><div class="status-fill red" style="width:${pct(counts.cancelled)}%"></div></div><strong>${counts.cancelled}</strong></div>
              </div>
            </section>

            <section class="dash-panel">
              <div class="dash-panel-head"><div><h3>Raccourcis</h3><p>Accédez rapidement aux outils courants.</p></div></div>
              <div class="quick-actions">
                <button class="quick-action" type="button" data-jump="orders"><b>01</b><strong>Commandes</strong><span>Confirmer et suivre</span></button>
                <button class="quick-action" type="button" data-jump="menu"><b>02</b><strong>Carte</strong><span>Prix et disponibilité</span></button>
                <button class="quick-action" type="button" data-jump="messages"><b>03</b><strong>Messages</strong><span>Consulter les demandes</span></button>
                <button class="quick-action" type="button" data-jump="events"><b>04</b><strong>Événements</strong><span>Gérer les publications</span></button>
              </div>
            </section>
          </div>
        </div>
      </div>`;
    bindJumpButtons(viewContent);
    $$('[data-dashboard-details]',viewContent).forEach(b=>b.addEventListener('click',()=>showOrderDetails(b.dataset.dashboardDetails)));
  }

  async function renderMenu(){
    const rows=await api('/api/menu'); if(!rows.length){viewContent.innerHTML=empty('Aucun produit enregistré.');return;}
    const categories=[...new Set(rows.map(x=>x.category).filter(Boolean))];
    viewContent.innerHTML=`<div class="menu-manager">
      <div class="menu-toolbar">
        <input id="menuSearch" class="menu-search" type="search" placeholder="Rechercher un produit…" aria-label="Rechercher un produit">
        <select id="menuCategoryFilter" class="menu-filter" aria-label="Filtrer par catégorie"><option value="">Toutes les catégories</option>${categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
        <select id="menuAvailabilityFilter" class="menu-filter" aria-label="Filtrer par disponibilité"><option value="">Tous les produits</option><option value="available">Disponibles</option><option value="unavailable">Indisponibles</option></select>
        <span id="menuCount" class="menu-count">${rows.length} produits</span>
      </div>
      <div class="menu-editor-head"><span>Catégorie</span><span>Produit</span><span>Description</span><span>Prix</span><span>Disponibilité</span><span>Action</span></div>
      <div id="menuEditorList">${rows.map(x=>`<div class="menu-edit-v3" data-id="${x.id}" data-name="${esc(String(x.name).toLowerCase())}" data-category="${esc(x.category||'')}" data-available="${x.available?'available':'unavailable'}"><span class="product-category">${esc(x.category||'Sans catégorie')}</span><input aria-label="Nom" data-f="name" type="text" value="${esc(x.name)}"><input aria-label="Description" data-f="description" type="text" value="${esc(x.description)}"><input aria-label="Prix" data-f="price" type="number" min="0" value="${x.price}"><label class="availability"><input data-f="available" type="checkbox" ${x.available?'checked':''}><span>Disponible</span></label><button class="save-product" type="button">Enregistrer</button></div>`).join('')}</div>
    </div>`;

    const search=$('#menuSearch'), category=$('#menuCategoryFilter'), availability=$('#menuAvailabilityFilter'), count=$('#menuCount');
    const applyFilters=()=>{
      const q=search.value.trim().toLowerCase(), cat=category.value, av=availability.value; let visible=0;
      $$('.menu-edit-v3',viewContent).forEach(row=>{const show=(!q||row.dataset.name.includes(q))&&(!cat||row.dataset.category===cat)&&(!av||row.dataset.available===av);row.hidden=!show;if(show)visible++;});
      count.textContent=`${visible} produit${visible>1?'s':''}`;
    };
    [search,category,availability].forEach(el=>el.addEventListener(el===search?'input':'change',applyFilters));

    $$('.menu-edit-v3',viewContent).forEach(row=>{
      const availableInput=row.querySelector('[data-f="available"]');
      availableInput.addEventListener('change',()=>{row.dataset.available=availableInput.checked?'available':'unavailable';applyFilters();});
      row.querySelector('button').addEventListener('click',async()=>{
        const v=f=>row.querySelector(`[data-f="${f}"]`), b=row.querySelector('button');
        b.disabled=true;b.textContent='Enregistrement…';
        try{
          await api(`/api/admin/menu/${row.dataset.id}`,{method:'PATCH',body:JSON.stringify({name:v('name').value,description:v('description').value,price:Number(v('price').value),available:v('available').checked,featured:false,badge:''})});
          row.dataset.name=v('name').value.toLowerCase();row.dataset.available=v('available').checked?'available':'unavailable';b.classList.add('saved');b.textContent='Enregistré ✓';setTimeout(()=>{b.classList.remove('saved');b.textContent='Enregistrer';},1400);
        }catch(e){b.textContent='Erreur';setTimeout(()=>b.textContent='Enregistrer',1400);alert(e.message);}
        finally{b.disabled=false;}
      });
    });
  }


  async function loadProductCategories(){
    const select=$('#productCategory');
    if(!select)return;
    const categories=await api('/api/admin/categories');
    select.innerHTML='<option value="">Sélectionner une catégorie</option>'+categories.filter(c=>c.active!==0).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }

  function resetProductForm(){
    if(!productForm)return;
    productForm.reset();
    $('#productImageUrl').value='';
    $('#productAvailable').checked=true;
    $('#productFormStatus').textContent='';
    $('#productFormStatus').classList.remove('error','success');
    if(productImagePreview)productImagePreview.innerHTML='<span>Aucune photo sélectionnée</span>';
  }

  async function openProductDialog(){
    resetProductForm();
    try{await loadProductCategories();openModal(productModal);setTimeout(()=>$('#productCategory')?.focus(),50);}
    catch(e){alert(e.message);}
  }

  async function uploadProductImage(file){
    if(!file)throw new Error('Choisissez une photo.');
    const allowed=['image/jpeg','image/png','image/webp'];
    if(!allowed.includes(file.type))throw new Error('Format non autorisé. Utilisez JPG, PNG ou WebP.');
    if(file.size>5*1024*1024)throw new Error('La photo dépasse 5 Mo.');
    const r=await fetch('/api/admin/uploads/product-image',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type,'X-File-Name':file.name},body:file
    });
    const j=await r.json().catch(()=>({}));
    if(r.status===401){showLogin();throw new Error(j.message||'Session expirée.');}
    if(!r.ok)throw new Error(j.message||"Impossible d'envoyer la photo.");
    return j;
  }

  async function renderProfile(){
    let profile=currentAdmin;
    try{profile=await api('/api/admin/profile');currentAdmin={...currentAdmin,...profile};}catch(e){if(e.message!=='Endpoint introuvable.')throw e;}
    viewContent.innerHTML=`
      <div class="profile-grid-admin">
        <section class="profile-card-admin">
          <p class="kicker">INFORMATIONS</p>
          <h3>Profil administrateur</h3>
          <form id="profileInfoForm" class="profile-form-admin">
            <label>Nom affiché<input id="profileDisplayName" type="text" maxlength="120" value="${esc(currentAdmin.displayName||currentAdmin.display_name||'Administrateur')}" required></label>
            <label>Adresse email<input id="profileEmail" type="email" maxlength="180" value="${esc(currentAdmin.email||'')}" required></label>
            <label>Mot de passe actuel<input id="profileCurrentPassword" type="password" autocomplete="current-password" placeholder="Requis pour changer l’email"></label>
            <button class="admin-btn" type="submit">Enregistrer le profil</button>
            <p id="profileInfoStatus" class="form-message" role="status"></p>
          </form>
        </section>
        <section class="profile-card-admin">
          <p class="kicker">SÉCURITÉ</p>
          <h3>Changer le mot de passe</h3>
          <form id="profilePasswordForm" class="profile-form-admin">
            <label>Mot de passe actuel<div class="profile-password-wrap"><input id="oldPassword" type="password" autocomplete="current-password" required><button type="button" data-toggle-profile-password="oldPassword" aria-label="Afficher le mot de passe">◉</button></div></label>
            <label>Nouveau mot de passe<div class="profile-password-wrap"><input id="newPassword" type="password" autocomplete="new-password" minlength="12" required><button type="button" data-toggle-profile-password="newPassword" aria-label="Afficher le mot de passe">◉</button></div></label>
            <label>Confirmer le nouveau mot de passe<div class="profile-password-wrap"><input id="confirmPassword" type="password" autocomplete="new-password" minlength="12" required><button type="button" data-toggle-profile-password="confirmPassword" aria-label="Afficher le mot de passe">◉</button></div></label>
            <button class="admin-btn" type="submit">Changer le mot de passe</button>
            <p id="profilePasswordStatus" class="form-message" role="status"></p>
          </form>
        </section>
      </div>`;

    $$('[data-toggle-profile-password]',viewContent).forEach(b=>b.addEventListener('click',()=>{const input=$('#'+b.dataset.toggleProfilePassword);if(!input)return;const show=input.type==='password';input.type=show?'text':'password';b.textContent=show?'⊘':'◉';b.setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe');}));

    $('#profileInfoForm')?.addEventListener('submit',async e=>{e.preventDefault();const st=$('#profileInfoStatus');st.textContent='Enregistrement…';st.classList.remove('error','success');try{const body={displayName:$('#profileDisplayName').value.trim(),email:$('#profileEmail').value.trim(),currentPassword:$('#profileCurrentPassword').value};const r=await api('/api/admin/profile',{method:'PATCH',body:JSON.stringify(body)});currentAdmin={...currentAdmin,...r.admin,displayName:r.admin?.displayName||body.displayName,email:r.admin?.email||body.email};$('#adminName').textContent=currentAdmin.displayName||'Administrateur';st.textContent='Profil mis à jour ✓';st.classList.add('success');$('#profileCurrentPassword').value='';}catch(err){st.textContent=err.message;st.classList.add('error');}});

    $('#profilePasswordForm')?.addEventListener('submit',async e=>{e.preventDefault();const st=$('#profilePasswordStatus'),oldPassword=$('#oldPassword').value,newPassword=$('#newPassword').value,confirmPassword=$('#confirmPassword').value;st.classList.remove('error','success');if(newPassword!==confirmPassword){st.textContent='Les deux nouveaux mots de passe ne correspondent pas.';st.classList.add('error');return;}st.textContent='Modification…';try{await api('/api/admin/profile/password',{method:'PATCH',body:JSON.stringify({currentPassword:oldPassword,newPassword})});e.currentTarget.reset();st.textContent='Mot de passe modifié ✓';st.classList.add('success');}catch(err){st.textContent=err.message;st.classList.add('error');}});
  }

  async function render(view=current){
    current=view; $$('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); setMeta(view);
    viewContent.innerHTML='<div class="loading-state"><span></span><p>Chargement des données…</p></div>';

    if(view==='dashboard'){await renderDashboard();return;}

    if(view==='orders'){
      await metrics();
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

    if(view==='menu'){await renderMenu();return;}
    if(view==='profile'){await renderProfile();return;}

    if(view==='events'){
      const rows=await api('/api/admin/events'); if(!rows.length){viewContent.innerHTML=empty('Aucun événement enregistré.');return;}
      viewContent.innerHTML=`<div class="inline-note">Les événements publiés alimentent directement la page Événements.</div>${rows.map(x=>`<div class="menu-edit event-edit" data-event="${x.id}"><input data-f="title" value="${esc(x.title)}"><input data-f="summary" value="${esc(x.summary)}"><input data-f="recurrence" value="${esc(x.recurrence_label||'')}"><select data-f="status"><option value="published" ${x.status==='published'?'selected':''}>Publié</option><option value="draft" ${x.status==='draft'?'selected':''}>Brouillon</option><option value="archived" ${x.status==='archived'?'selected':''}>Archivé</option></select><button type="button">Enregistrer</button></div>`).join('')}`;
      $$('[data-event]').forEach(row=>row.querySelector('button').addEventListener('click',async()=>{const v=f=>row.querySelector(`[data-f="${f}"]`),c=rows.find(x=>x.id===Number(row.dataset.event));await api(`/api/admin/events/${row.dataset.event}`,{method:'PATCH',body:JSON.stringify({title:v('title').value,summary:v('summary').value,recurrenceLabel:v('recurrence').value,status:v('status').value,imagePath:c.image_path,eventDate:c.event_date,featured:c.featured})});const b=row.querySelector('button');b.textContent='Enregistré ✓';setTimeout(()=>b.textContent='Enregistrer',1200);}));
    }
  }

  togglePassword.addEventListener('click',()=>{const show=passwordInput.type==='password';passwordInput.type=show?'text':'password';togglePassword.setAttribute('aria-pressed',String(show));togglePassword.setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe');togglePassword.classList.toggle('is-visible',show);passwordInput.focus();});
  loginForm.addEventListener('submit',async e=>{e.preventDefault();loginStatus.textContent='Connexion en cours…';loginStatus.classList.remove('error');loginSubmit.disabled=true;try{const data=Object.fromEntries(new FormData(e.currentTarget));const r=await api('/api/admin/login',{method:'POST',body:JSON.stringify(data)});currentAdmin={displayName:r.admin.displayName||'Administrateur',email:r.admin.email||''};$('#adminName').textContent=currentAdmin.displayName;showApp();loginStatus.textContent='';e.currentTarget.reset();passwordInput.type='password';await render('dashboard');}catch(err){loginStatus.textContent=err.message;loginStatus.classList.add('error');}finally{loginSubmit.disabled=false;}});
  $$('.side-link').forEach(b=>b.addEventListener('click',()=>render(b.dataset.view).catch(e=>viewContent.innerHTML=`<p class="empty error-text">${esc(e.message)}</p>`)));
  $('#refreshBtn').addEventListener('click',()=>render(current).catch(e=>viewContent.innerHTML=`<p class="empty error-text">${esc(e.message)}</p>`));
  $('#profileShortcut')?.addEventListener('click',()=>render('profile').catch(e=>viewContent.innerHTML=`<p class="empty error-text">${esc(e.message)}</p>`));
  openProductModalBtn?.addEventListener('click',()=>openProductDialog());
  $('#productModalClose')?.addEventListener('click',()=>closeModal(productModal));
  $('#cancelProduct')?.addEventListener('click',()=>closeModal(productModal));
  productImage?.addEventListener('change',()=>{const file=productImage.files?.[0];if(!file){productImagePreview.innerHTML='<span>Aucune photo sélectionnée</span>';return;}if(file.size>5*1024*1024){productImage.value='';productImagePreview.innerHTML='<span>Photo trop volumineuse (max. 5 Mo)</span>';return;}const url=URL.createObjectURL(file);productImagePreview.innerHTML=`<img src="${url}" alt="Aperçu du produit">`;});
  productForm?.addEventListener('submit',async e=>{e.preventDefault();const status=$('#productFormStatus'),save=$('#saveProduct'),file=productImage.files?.[0];status.classList.remove('error','success');save.disabled=true;save.textContent='Ajout en cours…';try{status.textContent='Envoi de la photo…';const uploaded=await uploadProductImage(file);$('#productImageUrl').value=uploaded.url;status.textContent='Création du produit…';const name=$('#productName').value.trim();await api('/api/admin/menu',{method:'POST',body:JSON.stringify({categoryId:Number($('#productCategory').value),name,slug:slugify(name)+'-'+Date.now().toString(36),description:$('#productDescription').value.trim(),price:Number($('#productPrice').value),imagePath:uploaded.url,available:$('#productAvailable').checked,featured:false,badge:''})});status.textContent='Produit ajouté avec succès ✓';status.classList.add('success');await metrics();setTimeout(async()=>{closeModal(productModal);resetProductForm();if(current==='menu')await renderMenu();},650);}catch(err){status.textContent=err.message;status.classList.add('error');}finally{save.disabled=false;save.textContent='+ Ajouter le produit';}});

  $('#logoutBtn').addEventListener('click',()=>openModal(logoutModal)); $('#cancelLogout').addEventListener('click',()=>closeModal(logoutModal)); $('#logoutClose').addEventListener('click',()=>closeModal(logoutModal));
  $('#confirmLogout').addEventListener('click',async()=>{const b=$('#confirmLogout');b.disabled=true;b.textContent='Déconnexion…';try{await api('/api/admin/logout',{method:'POST',body:'{}'});}catch{}finally{b.disabled=false;b.textContent='Se déconnecter';closeModal(logoutModal);showLogin();}});

  $('#forgotCredentials').addEventListener('click',()=>openModal(credentialsModal)); $('#credentialsClose').addEventListener('click',()=>closeModal(credentialsModal)); $('#credentialsOk').addEventListener('click',()=>closeModal(credentialsModal));
  $('#orderDetailClose').addEventListener('click',()=>closeModal(orderDetailModal));
  [logoutModal,credentialsModal,orderDetailModal,productModal].filter(Boolean).forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m);}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){[logoutModal,credentialsModal,orderDetailModal,productModal].filter(Boolean).forEach(closeModal);}});

  (async()=>{try{await metrics();showApp();await render('dashboard');}catch{showLogin();}})();
})();
