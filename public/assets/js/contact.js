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
})();
