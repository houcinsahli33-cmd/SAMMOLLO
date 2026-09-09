(() => {
  // =====================================================
  // NAVIGATION MOBILE
  // =====================================================
  const btn = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');

  if (btn && nav) {
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });

    document.addEventListener('click', (event) => {
      if (
        !nav.contains(event.target) &&
        !btn.contains(event.target) &&
        nav.classList.contains('open')
      ) {
        nav.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // =====================================================
  // PARAMÈTRES PUBLICS — CONTACT + TOUS LES FOOTERS
  // =====================================================
  function text(value) {
    return String(value ?? '').trim();
  }

  function normalizePhoneHref(value) {
    return text(value).replace(/[^+\d]/g, '');
  }

  function setFooterSocial(label, url, visible) {
    document
      .querySelectorAll(`.site-footer a[aria-label="${label}"]`)
      .forEach((link) => {
        const enabled = visible && Boolean(text(url));
        link.hidden = !enabled;

        if (!enabled) return;

        link.href = text(url);
        link.target = '_blank';
        link.rel = 'noopener';
        link.classList.remove('social-disabled');
      });
  }

  function updateFooter(contact, restaurant) {
    const footer = document.querySelector('.site-footer');
    if (!footer) return;

    const footerContact = footer.querySelector('.footer-contact');
    const phoneDisplay =
      text(contact.phoneDisplay) ||
      text(restaurant.phone) ||
      '0668929453';

    const phoneHref =
      text(contact.phoneHref) ||
      normalizePhoneHref(phoneDisplay);

    const email =
      text(contact.email) ||
      text(restaurant.email) ||
      'sammollo.contact.draa@gmail.com';

    const address =
      text(contact.address) ||
      [restaurant.city, restaurant.wilaya, restaurant.country]
        .map(text)
        .filter(Boolean)
        .join(', ') ||
      'Draâ El Mizan, Tizi-Ouzou';

    if (footerContact) {
      const directChildren = [...footerContact.children];

      // 1er bloc = téléphone
      const phoneBlock = directChildren.find((element) =>
        element.querySelector?.('a[href^="tel:"]')
      );
      const phoneLink = footerContact.querySelector('a[href^="tel:"]');

      if (phoneBlock) phoneBlock.hidden = contact.showPhone === false;
      if (phoneLink) {
        phoneLink.href = `tel:${phoneHref}`;
        phoneLink.textContent = phoneDisplay;
      }

      // Email
      const emailLink = footerContact.querySelector('a[href^="mailto:"]');
      if (emailLink) {
        emailLink.hidden = contact.showEmail === false;
        emailLink.href = `mailto:${email}`;
        emailLink.textContent = email;
      }

      // Dernier span = adresse
      const spans = [...footerContact.querySelectorAll(':scope > span')];
      const addressBlock = spans.find((span) => !span.querySelector('a[href^="tel:"]'));
      if (addressBlock) {
        addressBlock.hidden = contact.showAddress === false;
        addressBlock.textContent = address.replace(/,\s*/g, ' · ');
      }
    }

    const showSocial = contact.showSocial !== false;
    const socialContainer = footer.querySelector('.footer-social');
    if (socialContainer) socialContainer.hidden = !showSocial;

    setFooterSocial('Facebook', contact.facebook, showSocial);
    setFooterSocial('Instagram', contact.instagram, showSocial);
    setFooterSocial('TikTok', contact.tiktok, showSocial);
  }

  async function loadPublicSettings() {
    try {
      const response = await fetch('/api/settings/public', {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) return;

      const data = await response.json();
      updateFooter(data.contact || {}, data.restaurant || {});
    } catch (error) {
      console.warn(
        'Impossible de charger les informations publiques SAMMOLLO :',
        error.message
      );
    }
  }

  loadPublicSettings();
})();
