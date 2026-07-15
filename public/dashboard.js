const pathParts = window.location.pathname.split('/');
const id = pathParts[pathParts.length - 1];
const key = new URLSearchParams(window.location.search).get('key');

async function load() {
  if (!key) {
    document.getElementById('summary').innerHTML = '<p style="color:red">❌ Kirish kaliti yo\'q. To\'g\'ri havola orqali kiring.</p>';
    return;
  }

  const res = await fetch(`/api/invitations/${id}/responses?key=${key}`);
  if (!res.ok) {
    document.getElementById('summary').innerHTML = '<p style="color:red">❌ Ruxsat yo\'q yoki taklifnoma topilmadi.</p>';
    return;
  }

  const data = await res.json();
  renderSummary(data);
  renderStats(data);
  renderResponses(data.responses || []);

  // Auto-refresh every 15 seconds
  setTimeout(load, 15000);
}

function renderSummary(data) {
  const date = new Date(data.createdAt).toLocaleDateString('uz-UZ', {
    year:'numeric', month:'long', day:'numeric'
  });
  document.getElementById('summary').innerHTML = `
    <p style="margin:0; font-size:13px; color:#999;">📅 ${date}</p>
    <h2 style="margin:8px 0 4px;">${data.from || ''} → ${data.to || ''}</h2>
    <p style="color:#666; margin:0; font-size:14px;">${data.question || ''}</p>
  `;
}

function renderStats(data) {
  const responses = data.responses || [];
  const yesCount = responses.filter(r => r.answer === 'ha').length;
  const noCount  = responses.filter(r => r.answer === 'yoq').length;

  const statsEl = document.getElementById('stats');
  statsEl.style.display = 'flex';
  statsEl.innerHTML = `
    <div class="stat-box">
      <div class="stat-num" style="color:#27ae60">${yesCount}</div>
      <div class="stat-label">✅ Ha</div>
    </div>
    <div class="stat-box">
      <div class="stat-num" style="color:#e74c3c">${noCount}</div>
      <div class="stat-label">❌ Yo'q</div>
    </div>
    <div class="stat-box">
      <div class="stat-num">${responses.length}</div>
      <div class="stat-label">💬 Jami</div>
    </div>
  `;
  if (data.noAttempts > 0) {
    statsEl.innerHTML += `
      <div class="stat-box">
        <div class="stat-num" style="color:#f39c12">${data.noAttempts}</div>
        <div class="stat-label">😅 Qochdi</div>
      </div>
    `;
  }
}

function renderResponses(responses) {
  const el = document.getElementById('responsesList');
  if (!responses.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="big">📭</div>
        <p>Hali javob yo'q.<br>Havolani do'stingizga yuboring!</p>
        <p style="font-size:12px;color:#ddd;">Sahifa 15 soniyada yangilanadi...</p>
      </div>`;
    return;
  }

  el.innerHTML = responses.slice().reverse().map((r, i) => {
    const isYes = r.answer === 'ha';
    const date = new Date(r.respondedAt).toLocaleString('uz-UZ');
    let detail = '';
    if (r.place) detail += `📍 ${r.place}`;
    if (r.time)  detail += `&nbsp;&nbsp;🕐 ${r.time}`;
    return `
      <div class="resp-card">
        <div class="resp-answer ${isYes ? 'yes' : 'no'}">
          ${isYes ? '✅ Ha!' : '❌ Yo\'q'}
        </div>
        ${detail ? `<div class="resp-detail">${detail}</div>` : ''}
        <div class="resp-meta">${date}</div>
      </div>
    `;
  }).join('');
}

load();
