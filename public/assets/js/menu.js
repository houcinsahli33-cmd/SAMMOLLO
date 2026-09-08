(()=>{
  const catalog=document.getElementById('menuCatalog');
  const drawer=document.getElementById('cartDrawer');
  const back=document.getElementById('drawerBackdrop');
  const count=document.getElementById('cartCount');
  const itemsEl=document.getElementById('cartItems');
  const totalEl=document.getElementById('cartTotal');
  const orderBackdrop=document.getElementById('orderBackdrop');
  const orderForm=document.getElementById('orderForm');
  const orderStatus=document.getElementById('orderStatus');
  const cart=[];
  let menu=[];

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=n=>new Intl.NumberFormat('fr-DZ').format(Number(n)||0)+' DA';
  const arrowSvg=direction=>direction==='left'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  function openDrawer(){drawer.classList.add('open');back.classList.add('open');drawer.setAttribute('aria-hidden','false')}
  function closeDrawer(){drawer.classList.remove('open');back.classList.remove('open');drawer.setAttribute('aria-hidden','true')}

  function renderCart(){
    count.textContent=cart.reduce((s,x)=>s+x.qty,0);
    totalEl.textContent=money(cart.reduce((s,x)=>s+x.price*x.qty,0));
    if(!cart.length){
      itemsEl.innerHTML='<div class="cart-empty"><strong>Votre panier est vide</strong><p>Ajoutez un plat depuis le menu.</p></div>';
      return;
    }
    itemsEl.innerHTML=cart.map((x,i)=>`<div class="cart-row"><div><strong>${esc(x.name)}</strong><div class="muted">${x.qty} × ${money(x.price)}</div></div><div class="qty-actions"><button type="button" data-dec="${i}">−</button><span>${x.qty}</span><button type="button" data-inc="${i}">+</button><button type="button" class="remove-line" data-remove="${i}">×</button></div></div>`).join('');
    itemsEl.querySelectorAll('[data-inc]').forEach(b=>b.addEventListener('click',()=>{cart[+b.dataset.inc].qty++;renderCart()}));
    itemsEl.querySelectorAll('[data-dec]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.dec;cart[i].qty--;if(cart[i].qty<=0)cart.splice(i,1);renderCart()}));
    itemsEl.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{cart.splice(+b.dataset.remove,1);renderCart()}));
  }

  function updateArrows(shell){
    const slider=shell.querySelector('[data-slider]');
    const prev=shell.querySelector('.slider-edge.prev');
    const next=shell.querySelector('.slider-edge.next');
    if(!slider||!prev||!next)return;
    const max=Math.max(0,slider.scrollWidth-slider.clientWidth-2);
    prev.disabled=slider.scrollLeft<=4;
    next.disabled=slider.scrollLeft>=max-4;
  }

  function bindSlider(section){
    const shell=section.querySelector('.slider-shell');
    const slider=shell.querySelector('[data-slider]');
    const prev=shell.querySelector('.slider-edge.prev');
    const next=shell.querySelector('.slider-edge.next');
    const move=()=>Math.max(300,Math.min(slider.clientWidth*.82,760));
    prev.addEventListener('click',()=>slider.scrollBy({left:-move(),behavior:'smooth'}));
    next.addEventListener('click',()=>slider.scrollBy({left:move(),behavior:'smooth'}));
    slider.addEventListener('scroll',()=>updateArrows(shell),{passive:true});
    window.addEventListener('resize',()=>updateArrows(shell));
    requestAnimationFrame(()=>updateArrows(shell));
  }

  function renderMenu(){
    const groups=new Map();
    for(const x of menu){
      if(!groups.has(x.category_slug))groups.set(x.category_slug,{name:x.category,items:[]});
      groups.get(x.category_slug).items.push(x);
    }
    catalog.innerHTML=[...groups.values()].map((g,idx)=>`
      <section class="menu-category">
        <div class="category-head">
          <div>
            <p class="eyebrow dark">${idx===0?'NOS SPÉCIALITÉS':'LA CARTE'}</p>
            <h2>${esc(g.name)}</h2>
          </div>
        </div>
        <div class="slider-shell">
          <button class="slider-edge prev" type="button" aria-label="Voir les plats précédents">${arrowSvg('left')}</button>
          <div class="horizontal-cards" data-slider>
            ${g.items.map(x=>`
              <article class="menu-card">
                <div class="menu-card-media">
                  <img src="${esc(x.image_path||'image/food1.png')}" alt="${esc(x.name)}" loading="lazy">
                  ${x.badge?`<span class="product-badge">${esc(x.badge)}</span>`:''}
                  ${!x.available?'<span class="soldout-badge">Indisponible</span>':''}
                </div>
                <div class="menu-card-body">
                  <h3>${esc(x.name)}</h3>
                  <p>${esc(x.description)}</p>
                  <div class="menu-card-foot">
                    <strong>${money(x.price)}</strong>
                    <button class="add-cart" type="button" data-id="${x.id}" ${x.available?'':'disabled'}>${x.available?'Ajouter':'Indisponible'}</button>
                  </div>
                </div>
              </article>`).join('')}
          </div>
          <button class="slider-edge next" type="button" aria-label="Voir les plats suivants">${arrowSvg('right')}</button>
        </div>
      </section>`).join('');

    document.querySelectorAll('.menu-category').forEach(bindSlider);
    document.querySelectorAll('.add-cart').forEach(b=>b.addEventListener('click',()=>{
      const p=menu.find(x=>x.id===Number(b.dataset.id));
      if(!p||!p.available)return;
      const found=cart.find(x=>x.id===p.id);
      found?found.qty++:cart.push({id:p.id,name:p.name,price:Number(p.price),qty:1});
      renderCart();
      openDrawer();
    }));
  }

  async function loadMenu(){
    try{
      const r=await fetch('/api/menu');
      if(!r.ok)throw new Error('Impossible de charger le menu');
      menu=await r.json();
      renderMenu();
    }catch(e){
      catalog.innerHTML='<div class="menu-error"><strong>Menu momentanément indisponible.</strong><p>Le serveur n’a pas pu charger la carte. Vérifiez que Node.js et MySQL sont démarrés.</p></div>';
    }
  }

  document.getElementById('openCart').addEventListener('click',openDrawer);
  document.getElementById('closeCart').addEventListener('click',closeDrawer);
  back.addEventListener('click',closeDrawer);

  const closeOrderButton=document.getElementById('closeOrder');
  const cancelOrderButton=document.getElementById('cancelOrder');
  const phoneInput=document.getElementById('customerPhone');
  const ratingInput=document.getElementById('orderRating');
  const ratingStars=[...document.querySelectorAll('.rating-star')];

  const orderVerifyBackdrop=document.getElementById('orderVerifyBackdrop');
  const closeOrderVerify=document.getElementById('closeOrderVerify');
  const orderVerifyEmail=document.getElementById('orderVerifyEmail');
  const orderVerifyTimer=document.getElementById('orderVerifyTimer');
  const orderVerifyStatus=document.getElementById('orderVerifyStatus');
  const resendOrderCode=document.getElementById('resendOrderCode');
  const verifyOrderCodeBtn=document.getElementById('verifyOrderCodeBtn');
  const backToOrderForm=document.getElementById('backToOrderForm');
  const codeInputs=[...document.querySelectorAll('#orderCodeInputs input')];

  let pendingOrderPayload=null;
  let orderVerificationToken='';
  let orderVerificationEndsAt=0;
  let orderTimerInterval=null;

  function setRating(value){
    const rating=Math.min(5,Math.max(1,Number(value)||5));
    ratingInput.value=String(rating);
    ratingStars.forEach(star=>{
      const active=Number(star.dataset.rating)<=rating;
      star.classList.toggle('active',active);
      star.setAttribute('aria-pressed',Number(star.dataset.rating)===rating?'true':'false');
    });
  }

  function openOrderModal(){
    if(!cart.length)return;
    closeDrawer();
    orderBackdrop.hidden=false;
    document.body.style.overflow='hidden';
    orderStatus.textContent='';
    requestAnimationFrame(()=>orderForm.querySelector('[name="customerName"]')?.focus());
  }

  function closeOrderModal(){
    orderBackdrop.hidden=true;
    document.body.style.overflow='';
    orderStatus.textContent='';
  }

  function clearOrderTimer(){
    if(orderTimerInterval){
      clearInterval(orderTimerInterval);
      orderTimerInterval=null;
    }
  }

  function updateOrderTimer(){
    const seconds=Math.max(0,Math.ceil((orderVerificationEndsAt-Date.now())/1000));
    const minutes=Math.floor(seconds/60);
    const rest=seconds%60;
    orderVerifyTimer.textContent=`${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}`;
    if(seconds<=0){
      clearOrderTimer();
      resendOrderCode.disabled=false;
      verifyOrderCodeBtn.disabled=true;
      orderVerifyStatus.textContent='Le code a expiré. Demandez un nouveau code.';
    }
  }

  function startOrderTimer(seconds=180){
    clearOrderTimer();
    orderVerificationEndsAt=Date.now()+seconds*1000;
    resendOrderCode.disabled=true;
    verifyOrderCodeBtn.disabled=false;
    updateOrderTimer();
    orderTimerInterval=setInterval(updateOrderTimer,1000);
  }

  function resetCodeInputs(){
    codeInputs.forEach(input=>{input.value=''});
  }

  function getOrderCode(){
    return codeInputs.map(input=>input.value).join('');
  }

  function openOrderVerifyModal(email,expiresIn=180){
    orderBackdrop.hidden=true;
    orderVerifyBackdrop.hidden=false;
    document.body.style.overflow='hidden';
    orderVerifyEmail.textContent=email;
    orderVerifyStatus.textContent='';
    resetCodeInputs();
    startOrderTimer(expiresIn);
    requestAnimationFrame(()=>codeInputs[0]?.focus());
  }

  function closeOrderVerifyModal(){
    orderVerifyBackdrop.hidden=true;
    document.body.style.overflow='';
    orderVerifyStatus.textContent='';
    clearOrderTimer();
  }

  function backToOrder(){
    orderVerifyBackdrop.hidden=true;
    clearOrderTimer();
    orderBackdrop.hidden=false;
    document.body.style.overflow='hidden';
    orderStatus.textContent='';
  }

  document.getElementById('checkoutBtn').addEventListener('click',openOrderModal);
  closeOrderButton.addEventListener('click',closeOrderModal);
  cancelOrderButton.addEventListener('click',closeOrderModal);
  closeOrderVerify.addEventListener('click',closeOrderVerifyModal);
  backToOrderForm.addEventListener('click',backToOrder);

  orderBackdrop.addEventListener('click',e=>{
    if(e.target===orderBackdrop)closeOrderModal();
  });

  orderVerifyBackdrop.addEventListener('click',e=>{
    if(e.target===orderVerifyBackdrop)closeOrderVerifyModal();
  });

  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(!orderVerifyBackdrop.hidden)closeOrderVerifyModal();
    else if(!orderBackdrop.hidden)closeOrderModal();
  });

  phoneInput.addEventListener('input',()=>{
    phoneInput.value=phoneInput.value.replace(/\D/g,'').slice(0,10);
  });

  ratingStars.forEach(star=>{
    star.addEventListener('click',()=>setRating(star.dataset.rating));
  });
  setRating(5);

  codeInputs.forEach((input,index)=>{
    input.addEventListener('input',()=>{
      input.value=input.value.replace(/\D/g,'').slice(-1);
      if(input.value&&index<codeInputs.length-1)codeInputs[index+1].focus();
    });

    input.addEventListener('keydown',e=>{
      if(e.key==='Backspace'&&!input.value&&index>0)codeInputs[index-1].focus();
      if(e.key==='ArrowLeft'&&index>0)codeInputs[index-1].focus();
      if(e.key==='ArrowRight'&&index<codeInputs.length-1)codeInputs[index+1].focus();
    });

    input.addEventListener('paste',e=>{
      const digits=String(e.clipboardData?.getData('text')||'').replace(/\D/g,'').slice(0,6);
      if(digits.length){
        e.preventDefault();
        digits.split('').forEach((digit,i)=>{if(codeInputs[i])codeInputs[i].value=digit});
        codeInputs[Math.min(digits.length,6)-1]?.focus();
      }
    });
  });

  function buildOrderPayload(){
    const f=new FormData(orderForm);
    const customerName=String(f.get('customerName')||'').trim();
    const customerPhone=String(f.get('customerPhone')||'').replace(/\D/g,'');
    const customerEmail=String(f.get('customerEmail')||'').trim().toLowerCase();
    const orderType=String(f.get('orderType')||'pickup');
    const rating=Math.min(5,Math.max(1,Number(f.get('rating'))||5));

    if(customerName.length<2){
      throw new Error('Veuillez saisir votre nom et prénom.');
    }
    if(!/^0[5-7]\d{8}$/.test(customerPhone)){
      throw new Error('Numéro algérien invalide : 10 chiffres commençant par 05, 06 ou 07.');
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)){
      throw new Error('Une adresse email valide est obligatoire pour confirmer la commande.');
    }

    return{
      customerName,
      customerPhone,
      customerEmail,
      orderType,
      notes:`Évaluation client : ${rating}/5`,
      items:cart.map(x=>({id:x.id,qty:x.qty}))
    };
  }

  async function requestOrderCode(payload){
    const r=await fetch('/api/orders/request-code',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const data=await r.json();
    if(!r.ok)throw new Error(data.message||'Impossible d’envoyer le code.');
    orderVerificationToken=String(data.token||'');
    if(!orderVerificationToken)throw new Error('Session de vérification invalide.');
    return data;
  }

  orderForm.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!cart.length)return;

    const submit=orderForm.querySelector('button[type="submit"]');

    try{
      pendingOrderPayload=buildOrderPayload();
      orderStatus.textContent='Envoi du code de confirmation…';
      submit.disabled=true;

      const data=await requestOrderCode(pendingOrderPayload);
      orderStatus.textContent='';
      openOrderVerifyModal(pendingOrderPayload.customerEmail,Number(data.expiresIn)||180);
    }catch(err){
      orderStatus.textContent=err.message||'Une erreur est survenue.';
    }finally{
      submit.disabled=false;
    }
  });

  resendOrderCode.addEventListener('click',async()=>{
    if(!pendingOrderPayload)return;
    resendOrderCode.disabled=true;
    orderVerifyStatus.textContent='Envoi d’un nouveau code…';

    try{
      const data=await requestOrderCode(pendingOrderPayload);
      resetCodeInputs();
      orderVerifyStatus.textContent='Un nouveau code vient d’être envoyé.';
      startOrderTimer(Number(data.expiresIn)||180);
      codeInputs[0]?.focus();
    }catch(err){
      orderVerifyStatus.textContent=err.message||'Impossible de renvoyer le code.';
      resendOrderCode.disabled=false;
    }
  });

  verifyOrderCodeBtn.addEventListener('click',async()=>{
    const code=getOrderCode();
    if(!/^\d{6}$/.test(code)){
      orderVerifyStatus.textContent='Saisissez les 6 chiffres du code reçu par email.';
      codeInputs.find(input=>!input.value)?.focus();
      return;
    }

    verifyOrderCodeBtn.disabled=true;
    resendOrderCode.disabled=true;
    orderVerifyStatus.textContent='Vérification du code…';

    try{
      const r=await fetch('/api/orders/verify',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token:orderVerificationToken,code})
      });
      const data=await r.json();
      if(!r.ok)throw new Error(data.message||'Code invalide.');

      const ref=String(data.public_id||'').slice(0,8).toUpperCase();
      clearOrderTimer();
      orderVerifyStatus.textContent=`Commande ${ref} confirmée. Elle est maintenant transmise au restaurant.`;

      cart.splice(0,cart.length);
      renderCart();
      orderForm.reset();
      setRating(5);
      pendingOrderPayload=null;
      orderVerificationToken='';

      setTimeout(closeOrderVerifyModal,1700);
    }catch(err){
      orderVerifyStatus.textContent=err.message||'Une erreur est survenue.';
      verifyOrderCodeBtn.disabled=false;
      if(Date.now()>=orderVerificationEndsAt)resendOrderCode.disabled=false;
    }
  });

  renderCart();
  loadMenu();
})();
