let selectedLang = 'uz';

// ─── Read Telegram chat ID from URL ───────────────────────
const urlParams = new URLSearchParams(window.location.search);
const TG_CHAT_ID = urlParams.get('tg_id') || null;

// Show TG notice if opened from Telegram
if (TG_CHAT_ID) {
  document.getElementById('tgNotice').style.display = 'block';
}

// ─── Telegram WebApp integration ──────────────────────────
if (window.Telegram && window.Telegram.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

// ─── Password gate (skipped if opened from Telegram bot) ──
async function ensurePassword() {
  if (TG_CHAT_ID) return; // No password needed when opened from bot
  let pw = localStorage.getItem('adminPassword');
  if (pw === null) {
    pw = prompt('Admin parolini kiriting:') || '';
  }
  const res = await fetch('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
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

// ─── Chips ────────────────────────────────────────────────
document.querySelectorAll('#messageChips .chip').forEach(chip => {
  chip.addEventListener('click', () => document.getElementById('message').value = chip.textContent.trim());
});
document.querySelectorAll('#questionChips .chip').forEach(chip => {
  chip.addEventListener('click', () => document.getElementById('question').value = chip.textContent.trim());
});
document.querySelectorAll('#placeOptions .chip').forEach(chip => {
  chip.addEventListener('click', () => chip.classList.toggle('active'));
});

// ─── Style + color ─────────────────────────────────────────
document.querySelectorAll('.style-box').forEach(box => {
  box.addEventListener('click', () => {
    document.querySelectorAll('.style-box').forEach(b => b.classList.remove('selected'));
    box.classList.add('selected');
  });
});
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
  });
});

// ─── Gather form data ──────────────────────────────────────
function gatherData() {
  const selectedPlaces = [...document.querySelectorAll('#placeOptions .chip.active')].map(c => c.textContent.trim());
  const timeOptions = document.getElementById('timeOptions').value.split('\n').map(s => s.trim()).filter(Boolean);
  return {
    from: document.getElementById('from').value || 'Kimdir',
    to: document.getElementById('to').value || 'Do\'stim',
    message: document.getElementById('message').value,
    question: document.getElementById('question').value,
    time: document.getElementById('time').value,
    place: document.getElementById('place').value,
    allowNo: document.getElementById('allowNo').checked,
    language: selectedLang,
    tgChatId: TG_CHAT_ID,  // ← pass Telegram chat ID
    locationTimeSelection: {
      enabled: document.getElementById('ltsEnabled').checked,
      placeOptions: selectedPlaces,
      timeOptions
    },
    style: {
      theme: document.querySelector('.style-box.selected').dataset.theme,
      color: document.querySelector('.color-dot.selected').dataset.color
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
      <p class="mini-label">TAKLIFNOMA</p>
      <h1 class="invite-title">${data.to}</h1>
      <p class="invite-from">${data.from} ${t.fromLabel}</p>
      <p class="invite-message">${data.message}</p>
      <p class="invite-question">${data.question}</p>
      <div class="answer-buttons">
        <button class="btn-yes">${t.yes}</button>
        <button class="btn-no">${t.no}</button>
      </div>
    </div>`;
  document.getElementById('previewModal').style.display = 'flex';
});
function closePreview() { document.getElementById('previewModal').style.display = 'none'; }

// ─── Create ────────────────────────────────────────────────
document.getElementById('createBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createBtn');
  btn.disabled = true;
  btn.textContent = 'Yaratilmoqda...';

  const data = gatherData();
  const headers = { 'Content-Type': 'application/json' };
  if (!TG_CHAT_ID) {
    headers['x-admin-password'] = localStorage.getItem('adminPassword') || '';
  }

  const res = await fetch('/api/invitations', {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  btn.disabled = false;
  btn.textContent = 'Yaratish ✨';

  if (!res.ok) { alert('Xatolik yuz berdi. Qayta urinib ko\'ring.'); return; }
  const result = await res.json();

  document.getElementById('resultUrl').value = result.url;
  document.getElementById('adminUrl').value = result.adminUrl;
  document.getElementById('qrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(result.url)}`;
  document.getElementById('resultBox').style.display = 'block';

  if (TG_CHAT_ID) {
    document.getElementById('tgSentNotice').style.display = 'block';
  }

  document.getElementById('resultBox').scrollIntoView({ behavior: 'smooth' });

  // Save to local history
  const history = JSON.parse(localStorage.getItem('myInvitations') || '[]');
  history.unshift({ to: data.to, url: result.url, adminUrl: result.adminUrl, date: new Date().toLocaleString() });
  localStorage.setItem('myInvitations', JSON.stringify(history.slice(0, 20)));
  renderHistory();
});

function copyText(id) {
  const input = document.getElementById(id);
  input.select();
  document.execCommand('copy');

  // Show brief feedback
  const btn = input.nextElementSibling;
  const orig = btn.textContent;
  btn.textContent = '✅';
  setTimeout(() => btn.textContent = orig, 1500);
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem('myInvitations') || '[]');
  if (!history.length) return;
  document.getElementById('historyBox').style.display = 'block';
  document.getElementById('historyList').innerHTML = history.map(h => `
    <div class="history-item">
      <b>${h.to}</b> — ${h.date}<br>
      <a href="${h.url}" target="_blank">Taklif</a> |
      <a href="${h.adminUrl}" target="_blank">Javoblar</a>
    </div>
  `).join('');
}
renderHistory();
