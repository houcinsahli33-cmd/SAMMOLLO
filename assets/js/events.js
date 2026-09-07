(()=>{
  const list=document.getElementById('eventsList'); if(!list)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function load(){
    try{
      const r=await fetch('/api/events'); if(!r.ok)throw new Error(); const rows=await r.json();
      if(!rows.length){list.innerHTML='<p class="menu-loading">Aucun événement publié pour le moment.</p>';return}
      list.innerHTML=rows.map((x,i)=>`<article class="event-large ${i%2?'reverse':''}"><img src="${esc(x.image_path||'image/party.jpg')}" alt="${esc(x.title)}" loading="lazy"><div><span class="event-tag">${esc(x.recurrence_label||'Événement Sammollo')}</span><h3>${esc(x.title)}</h3><p>${esc(x.summary)}</p><a class="text-link" href="contact.html">Nous contacter →</a></div></article>`).join('');
    }catch{list.innerHTML='<div class="menu-error"><strong>Événements momentanément indisponibles.</strong><p>Le serveur n’a pas pu charger les événements.</p></div>'}
  }
  load();
})();
