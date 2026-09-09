(() => {
  const form = document.getElementById('contactForm');
  const verifyBackdrop = document.getElementById('verifyBackdrop');
  const successBackdrop = document.getElementById('successBackdrop');
  const emailLabel = document.getElementById('verifyEmail');
  const timerText = document.getElementById('timerText');
  const timerRing = document.getElementById('timerRing');
  const verifyStatus = document.getElementById('verifyStatus');
  const formStatus = document.getElementById('formStatus');
  const verifyBtn = document.getElementById('verifyBtn');
  const resendBtn = document.getElementById('resendBtn');
  const otpInputs = [...document.querySelectorAll('.otp-digit')];

  let token = '';
  let timerId = null;
  let remaining = 180;

  function contactRow(label) {
    return [...document.querySelectorAll('.contact-detail-row')].find(row =>
      row.querySelector('strong')?.textContent.trim().toLowerCase() === label.toLowerCase()
    );
  }

  function displayHours(value) {
    return String(value || '').replace(/\s*-\s*/g, ' – ');
  }

  function setSocialLink(label, url, visible) {
    document.querySelectorAll(`a[aria-label="${label}"]`).forEach(link => {
      link.hidden = !visible || !url;
      if (url) {
        link.href = url;
        link.classList.remove('social-disabled');
        link.target = '_blank';
        link.rel = 'noopener';
      }
    });
  }

  async function loadPublicContactSettings() {
    try {
      const response = await fetch('/api/settings/public', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      const restaurant = data.restaurant || {};
      const hours = data.opening_hours || {};
      const contact = data.contact || {};

      const address = contact.address || [restaurant.city, restaurant.wilaya, restaurant.country].filter(Boolean).join(', ') || 'Draâ El Mizan, Tizi-Ouzou, Algérie';
      const phoneDisplay = contact.phoneDisplay || restaurant.phone || '0668 92 94 53';
      const phoneHref = contact.phoneHref || String(phoneDisplay).replace(/[^+\d]/g, '');
      const email = contact.email || restaurant.email || '';

      const addressRow = contactRow('Adresse');
      if (addressRow) {
        addressRow.hidden = contact.showAddress === false;
        const p = addressRow.querySelector('p');
        if (p) p.textContent = address;
      }

      const phoneRow = contactRow('Téléphone');
      if (phoneRow) {
        phoneRow.hidden = contact.showPhone === false;
        const a = phoneRow.querySelector('a');
        if (a) { a.textContent = phoneDisplay; a.href = `tel:${phoneHref}`; }
      }

      const emailRow = contactRow('Email');
      if (emailRow) {
        emailRow.hidden = contact.showEmail === false;
        const a = emailRow.querySelector('a');
        if (a && email) { a.textContent = email; a.href = `mailto:${email}`; }
      }

      const hoursRow = contactRow('Horaires de travail');
      if (hoursRow) {
        hoursRow.hidden = contact.showHours === false;
        const p = hoursRow.querySelector('p');
        if (p) {
          p.textContent = '';
          p.append(document.createTextNode(`Vendredi : ${displayHours(hours.friday || '14:00-01:00')}`));
          p.append(document.createElement('br'));
          p.append(document.createTextNode(`Samedi à jeudi : ${displayHours(hours.saturday_thursday || '08:00-23:00')}`));
        }
      }

      document.querySelectorAll('a[href^="tel:"]').forEach(a => {
        if (phoneHref) a.href = `tel:${phoneHref}`;
        if (a.closest('.contact-detail-row') || a.closest('.footer-contact')) a.textContent = phoneDisplay;
      });
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
        if (!email) return;
        a.href = `mailto:${email}`;
        if (a.closest('.contact-detail-row') || a.closest('.footer-contact')) a.textContent = email;
      });

      const mapFrame = document.querySelector('.contact-map iframe');
      if (mapFrame && contact.mapEmbed) mapFrame.src = contact.mapEmbed;
      const mapAddress = document.querySelector('.map-business p');
      if (mapAddress) mapAddress.textContent = address;
      const footerContact = document.querySelector('.footer-contact');
      if (footerContact) {
        const spans = footerContact.querySelectorAll('span');
        if (spans.length > 1) spans[spans.length - 1].textContent = address.replace(/,\s*/g, ' · ');
      }
      const mapButtons = document.querySelectorAll('.map-buttons a');
      if (mapButtons[0] && contact.mapUrl) mapButtons[0].href = contact.mapUrl;
      if (mapButtons[1] && contact.directionsUrl) mapButtons[1].href = contact.directionsUrl;

      const socialBlock = document.querySelector('.contact-social');
      if (socialBlock) socialBlock.hidden = contact.showSocial === false;
      setSocialLink('Facebook', contact.facebook, contact.showSocial !== false);
      setSocialLink('Instagram', contact.instagram, contact.showSocial !== false);
      setSocialLink('TikTok', contact.tiktok, contact.showSocial !== false);
    } catch (error) {
      console.warn('Paramètres publics de contact indisponibles:', error.message);
    }
  }

  function show(el) {
    el.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function hide(el) {
    el.hidden = true;
    document.body.style.overflow = '';
  }

  function clearOtp() {
    otpInputs.forEach(input => input.value = '');
    otpInputs[0]?.focus();
  }

  function getOtp() {
    return otpInputs.map(input => input.value).join('');
  }

  function renderTimer() {
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const seconds = String(remaining % 60).padStart(2, '0');
    timerText.textContent = `${minutes}:${seconds}`;

    const progress = Math.max(0, (remaining / 180) * 100);
    timerRing?.style.setProperty('--timer-progress', `${progress}%`);
  }

  function startTimer() {
    clearInterval(timerId);
    remaining = 180;
    verifyBtn.disabled = false;
    renderTimer();

    timerId = setInterval(() => {
      remaining -= 1;
      renderTimer();

      if (remaining <= 0) {
        clearInterval(timerId);
        remaining = 0;
        renderTimer();
        verifyBtn.disabled = true;
        verifyStatus.textContent = 'Le code a expiré. Cliquez sur « Renvoyer un code ».';
      }
    }, 1000);
  }

  async function requestCode() {
    const data = Object.fromEntries(new FormData(form));

    formStatus.textContent = 'Envoi du code de vérification…';
    resendBtn.disabled = true;

    try {
      const response = await fetch('/api/contact/request-code', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Impossible d’envoyer le code.');
      }

      token = result.token;
      emailLabel.textContent = data.email;
      formStatus.textContent = '';
      verifyStatus.textContent = 'Vérifiez vos spams si vous ne recevez pas le code.';

      clearOtp();
      show(verifyBackdrop);
      startTimer();

    } catch (error) {
      formStatus.textContent = `${error.message} Vérifiez que le serveur backend est démarré.`;
    } finally {
      resendBtn.disabled = false;
    }
  }

  form?.addEventListener('submit', event => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    requestCode();
  });

  document.getElementById('closeVerify')?.addEventListener('click', () => {
    clearInterval(timerId);
    hide(verifyBackdrop);
  });

  resendBtn?.addEventListener('click', () => {
    requestCode();
  });

  verifyBtn?.addEventListener('click', async () => {
    const code = getOtp();

    if (!/^\d{6}$/.test(code)) {
      verifyStatus.textContent = 'Saisissez les 6 chiffres du code.';
      return;
    }

    if (remaining <= 0) {
      verifyStatus.textContent = 'Le code a expiré. Renvoyez un nouveau code.';
      return;
    }

    verifyStatus.textContent = 'Vérification du code…';
    verifyBtn.disabled = true;

    try {
      const response = await fetch('/api/contact/verify', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({token, code})
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Code incorrect.');
      }

      clearInterval(timerId);
      hide(verifyBackdrop);
      form.reset();
      show(successBackdrop);

    } catch (error) {
      verifyStatus.textContent = error.message;
      verifyBtn.disabled = false;
    }
  });

  document.getElementById('successOk')?.addEventListener('click', () => {
    hide(successBackdrop);
  });

  otpInputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);

      if (input.value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Backspace' && !input.value && index > 0) {
        otpInputs[index - 1].focus();
      }

      if (event.key === 'ArrowLeft' && index > 0) {
        otpInputs[index - 1].focus();
      }

      if (event.key === 'ArrowRight' && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });

    input.addEventListener('paste', event => {
      const digits = event.clipboardData
        .getData('text')
        .replace(/\D/g, '')
        .slice(0, 6);

      if (!digits) return;

      event.preventDefault();

      digits.split('').forEach((digit, digitIndex) => {
        if (otpInputs[digitIndex]) {
          otpInputs[digitIndex].value = digit;
        }
      });

      otpInputs[Math.min(digits.length, 6) - 1]?.focus();
    });
  });

  verifyBackdrop?.addEventListener('click', event => {
    if (event.target === verifyBackdrop) {
      clearInterval(timerId);
      hide(verifyBackdrop);
    }
  });

  successBackdrop?.addEventListener('click', event => {
    if (event.target === successBackdrop) {
      hide(successBackdrop);
    }
  });

  loadPublicContactSettings();
})();
