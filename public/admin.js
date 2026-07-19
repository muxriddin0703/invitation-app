let selectedLang = 'uz';

// ─── Read Telegram chat ID from URL ───────────────────────
const urlParams = new URLSearchParams(window.location.search);
const TG_CHAT_ID = urlParams.get('tg_id') || null;

if (TG_CHAT_ID) {
  document.getElementById('tgNotice').style.display = 'block';
}

// ─── Telegram WebApp integration ──────────────────────────
if (window.Telegram && window.Telegram.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

// ─── Password gate ─────────────────────────────────────────
async function ensurePassword() {
  if (TG_CHAT_ID) return;
  let pw = localStorage.getItem('adminPassword');
  if (pw === null) {
    pw = prompt('Admin parolini kiriting:') || '';
  }
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('adminPassword', pw);
  } else {
    alert('Parol noto\'g\'ri!');
    localStorage.removeItem('adminPassword');
    setTimeout(ensurePassword, 500);
  }
}
ensurePassword();

// ─── Language switch ───────────────────────────────────────
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedLang = btn.dataset.lang;
  });
});

// ─── Message chips (with show more/less) ──────────────────
(function setupMessageChips() {
  const fullTexts = [
    "Sizni ko'rgan kunimdan beri qalbimda iliqlik paydo bo'ldi. Agar ruxsat bersangiz, birga chiroyli lahzalarni baham ko'rishni istardim.",
    "Har bir kun Siz bilan yanada mazmunli bo'lardi. Birga choy ichib, dunyoni unutib gaplashishni istardim.",
    "Sizning tabassumingiz menga ilhom beradi. Shu tabassumni yaqindan ko'rish uchun bir imkoniyat so'ramoqchiman.",
    "Siz bilan tanishganimdan beri hayotimga yangi rang qo'shildi. Shu rangni birga bo'yashni istardim.",
    "Har safar ko'rganimda nima deyishni bilmasdim — endi bilaman: birga bo'lishni istayman.",
    "Sizni ko'p o'yladim. Belki bir kuni birga kulgimiz, bir kuni birga sukut saqlarmiz — ikkalasi ham yaxshi."
  ];

  const previewTexts = [
    "Sizni ko'rgan kunimdan beri...",
    "Har bir kun Siz bilan...",
    "Sizning tabassumingiz...",
    "Siz bilan tanishganimdan beri...",
    "Har safar ko'rganimda...",
    "Sizni ko'p o'yladim..."
  ];

  const VISIBLE_COUNT = 3;
  const container = document.getElementById('messageChips');
  const messageInput = document.getElementById('message');
  if (!container || !messageInput) return;

  container.innerHTML = '';

  fullTexts.forEach((full, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip' + (i >= VISIBLE_COUNT ? ' hidden-chip' : '');
    chip.textContent = previewTexts[i];
    chip.title = full;

    chip.addEventListener('click', () => {
      messageInput.value = full;
      messageInput.focus();
      container.querySelectorAll('.chip:not(.show-more-btn)').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });

    container.appendChild(chip);
  });

  // Show more / less button
  const btn = document.createElement('span');
  btn.className = 'chip show-more-btn';
  btn.textContent = "+ Ko'proq";
  let expanded = false;

  btn.addEventListener('click', () => {
    expanded = !expanded;
    container.querySelectorAll('.hidden-chip').forEach(c => {
      c.classList.toggle('visible', expanded);
    });
    btn.textContent = expanded ? '− Kamroq' : "+ Ko'proq";
  });

  container.appendChild(btn);
})();

// ─── Question chips ────────────────────────────────────────
document.querySelectorAll('#questionChips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('question').value = chip.textContent.trim();
    document.querySelectorAll('#questionChips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// ─── Place option chips (toggle) ──────────────────────────
document.querySelectorAll('#placeOptions .chip').forEach(chip => {
  chip.addEventListener('click', () => chip.classList.toggle('active'));
});

// ─── Style boxes ───────────────────────────────────────────
document.querySelectorAll('.style-box').forEach(box => {
  box.addEventListener('click', () => {
    document.querySelectorAll('.style-box').forEach(b => b.classList.remove('selected'));
    box.classList.add('selected');
  });
});

// ─── Color dots ────────────────────────────────────────────
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
  });
});

// ─── Gather form data ──────────────────────────────────────
function gatherData() {
  const selectedPlaces = [
    ...document.querySelectorAll('#placeOptions .chip.active')
  ].map(c => c.textContent.trim());

  const timeOptions = document.getElementById('timeOptions').value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  return {
    from:     document.getElementById('from').value.trim()     || 'Kimdir',
    to:       document.getElementById('to').value.trim()       || "Do'stim",
    message:  document.getElementById('message').value.trim(),
    question: document.getElementById('question').value.trim(),
    time:     document.getElementById('time').value.trim(),
    place:    document.getElementById('place').value.trim(),
    allowNo:  document.getElementById('allowNo').checked,
    language: selectedLang,
    tgChatId: TG_CHAT_ID,
    locationTimeSelection: {
      enabled:      document.getElementById('ltsEnabled').checked,
      placeOptions: selectedPlaces,
      timeOptions
    },
    style: {
      theme: document.querySelector('.style-box.selected')?.dataset.theme  || 'romantik',
      color: document.querySelector('.color-dot.selected')?.dataset.color  || '#c2185b'
    }
  };
}

// ─── Preview ───────────────────────────────────────────────
document.getElementById('previewBtn').addEventListener('click', () => {
  const data = gatherData();
  const t = translations[data.language] || translations.uz;

  document.documentElement.style.setProperty('--accent', data.style.color);

  document.getElementById('previewContent').innerHTML = `
    <div class="invite-card theme-${data.style.theme}">
      <span class="mini-label">✦ TAKLIFNOMA ✦</span>
      <h1 class="invite-title">${data.to}</h1>
      <p class="invite-from">${data.from} ${t.fromLabel}</p>
      <div class="invite-divider"><span class="invite-divider-icon">💗</span></div>
      <p class="invite-message">${data.message}</p>
      <p class="invite-question">${data.question}</p>
      <div class="answer-buttons">
        <button class="btn-yes">✨ ${t.yes}</button>
        <button class="btn-no">${t.no}</button>
      </div>
    </div>`;

  document.getElementById('previewModal').style.display = 'flex';
});

function closePreview() {
  document.getElementById('previewModal').style.display = 'none';
}

// ─── Create ────────────────────────────────────────────────
document.getElementById('createBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createBtn');
  btn.disabled = true;
  btn.innerHTML = '<span style="opacity:.7">⏳ Yaratilmoqda...</span>';

  const data = gatherData();
  const headers = { 'Content-Type': 'application/json' };
  if (!TG_CHAT_ID) {
    headers['x-admin-password'] = localStorage.getItem('adminPassword') || '';
  }

  try {
    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error('server error');

    const result = await res.json();

    document.getElementById('resultUrl').value  = result.url;
    document.getElementById('adminUrl').value   = result.adminUrl;
    document.getElementById('qrImg').src =
      `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(result.url)}`;

    const resultBox = document.getElementById('resultBox');
    resultBox.style.display = 'block';
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (TG_CHAT_ID) {
      document.getElementById('tgSentNotice').style.display = 'block';
    }

    // Save to local history
    const history = JSON.parse(localStorage.getItem('myInvitations') || '[]');
    history.unshift({
      to:       data.to,
      url:      result.url,
      adminUrl: result.adminUrl,
      date:     new Date().toLocaleString()
    });
    localStorage.setItem('myInvitations', JSON.stringify(history.slice(0, 20)));
    renderHistory();

  } catch (e) {
    alert("Xatolik yuz berdi. Qayta urinib ko'ring.");
  } finally {
    btn.disabled  = false;
    btn.innerHTML = 'Yaratish ✨';
  }
});

// ─── Copy to clipboard ─────────────────────────────────────
function copyText(id) {
  const input = document.getElementById(id);

  // Modern clipboard API with fallback
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(input.value).catch(() => legacyCopy(input));
  } else {
    legacyCopy(input);
  }

  const btn = input.nextElementSibling;
  const orig = btn.textContent;
  btn.textContent = '✅ Nusxalandi';
  btn.style.background = '#27ae60';
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.background = '';
  }, 1800);
}

function legacyCopy(input) {
  input.select();
  input.setSelectionRange(0, 99999);
  document.execCommand('copy');
}

// ─── Render history ────────────────────────────────────────
function renderHistory() {
  const history = JSON.parse(localStorage.getItem('myInvitations') || '[]');
  if (!history.length) return;

  document.getElementById('historyBox').style.display = 'block';
  document.getElementById('historyList').innerHTML = history.map(h => `
    <div class="history-item">
      <b>${h.to}</b>
      <span style="color:var(--muted);font-size:11px;margin-left:6px">${h.date}</span><br>
      <a href="${h.url}" target="_blank">🔗 Taklif</a>
      &nbsp;·&nbsp;
      <a href="${h.adminUrl}" target="_blank">📊 Javoblar</a>
    </div>
  `).join('');
}
renderHistory();
