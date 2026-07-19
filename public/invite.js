const id = window.location.pathname.split('/').pop();
let invitation = null;
let t = translations.uz;
let noDodgeCount = 0;

async function load() {
  const res = await fetch(`/api/invitations/${id}`);
  if (!res.ok) {
    document.getElementById('app').innerHTML = `
      <div class="invite-card">
        <span class="not-found">
          <span class="big">💔</span>
          Taklifnoma topilmadi
        </span>
      </div>`;
    return;
  }
  invitation = await res.json();
  t = translations[invitation.language] || translations.uz;
  render();
}

function escapeHtml(str = '') {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function render() {
  document.documentElement.style.setProperty('--accent', invitation.style?.color || '#c2185b');
  document.title = `${invitation.to} ga taklifnoma 💗`;

  document.getElementById('app').innerHTML = `
    <span class="invite-bg-heart tl">💗</span>
    <span class="invite-bg-heart br">💗</span>
    <div class="invite-card theme-${invitation.style?.theme || 'romantik'}">
      <span class="mini-label">✦ TAKLIFNOMA ✦</span>
      <h1 class="invite-title">${escapeHtml(invitation.to)}</h1>
      <p class="invite-from">${escapeHtml(invitation.from)} ${t.fromLabel}</p>

      <div class="invite-divider"><span class="invite-divider-icon">💗</span></div>

      <p class="invite-message">${escapeHtml(invitation.message)}</p>
      <p class="invite-question">${escapeHtml(invitation.question)}</p>

      <div class="answer-buttons" id="answerButtons">
        <button id="btnYes" class="btn-yes">✨ ${t.yes}</button>
        <button id="btnNo"  class="btn-no">${t.no}</button>
      </div>
      <div id="followUp"></div>
    </div>
  `;

  document.getElementById('btnYes').onclick = onYes;
  const btnNo = document.getElementById('btnNo');
  if (invitation.allowNo) {
    btnNo.onclick = onNo;
  } else {
    setupDodge(btnNo);
  }
}

function setupDodge(btn) {
  const container = document.getElementById('answerButtons');
  container.style.position = 'relative';
  container.style.minHeight = '100px';
  btn.style.position = 'absolute';
  btn.style.right = '0';
  btn.style.top = '10px';

  const moveAway = () => {
    noDodgeCount++;
    const cw = container.offsetWidth;
    const ch = container.offsetHeight;
    const bw = btn.offsetWidth;
    const bh = btn.offsetHeight;
    const x = Math.random() * Math.max(cw - bw, 10);
    const y = Math.random() * Math.max(ch - bh, 10);
    btn.style.left = x + 'px';
    btn.style.top  = y + 'px';
    btn.style.right = 'auto';
  };
  btn.addEventListener('mouseenter', moveAway);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); moveAway(); });
  btn.addEventListener('click', (e) => { e.preventDefault(); moveAway(); });
}

function onYes() {
  const lts = invitation.locationTimeSelection;
  if (lts && lts.enabled && lts.placeOptions?.length) {
    const places = lts.placeOptions.map(p =>
      `<span class="chip select-place">${escapeHtml(p)}</span>`).join('');
    const times = lts.timeOptions?.map(tm =>
      `<span class="chip select-time">${escapeHtml(tm)}</span>`).join('') || '';

    document.getElementById('followUp').innerHTML = `
      ${places ? `<p class="follow-label">📍 ${t.choosePlace}</p><div class="chips">${places}</div>` : ''}
      ${times  ? `<p class="follow-label">🕐 ${t.chooseTime}</p><div class="chips">${times}</div>` : ''}
      <button id="confirmBtn" class="btn-confirm">💗 ${t.confirm}</button>
    `;

    let chosenPlace = '', chosenTime = '';
    document.querySelectorAll('.select-place').forEach(el => el.onclick = () => {
      document.querySelectorAll('.select-place').forEach(e => e.classList.remove('active'));
      el.classList.add('active'); chosenPlace = el.textContent;
    });
    document.querySelectorAll('.select-time').forEach(el => el.onclick = () => {
      document.querySelectorAll('.select-time').forEach(e => e.classList.remove('active'));
      el.classList.add('active'); chosenTime = el.textContent;
    });
    document.getElementById('confirmBtn').onclick = () => {
      if (!chosenPlace && lts.placeOptions?.length) { alert(t.selectBoth); return; }
      if (!chosenTime && lts.timeOptions?.length)   { alert(t.selectBoth); return; }
      submit('ha', chosenPlace, chosenTime);
    };
  } else {
    submit('ha', invitation.place || '', invitation.time || '');
  }
}

function onNo() { submit('yoq', '', ''); }

async function submit(answer, place, time) {
  // Disable buttons to prevent double submit
  document.querySelectorAll('.btn-yes,.btn-no,.btn-confirm').forEach(b => b.disabled = true);

  await fetch(`/api/invitations/${id}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer, place, time, noAttempts: noDodgeCount })
  });

  const isYes = answer === 'ha';
  const icon  = isYes ? '🥰' : '💙';
  const msg   = isYes ? t.thanksYes : t.thanksNo;
  const sub   = isYes
    ? (place ? `📍 ${place}${time ? '  🕐 ' + time : ''}` : '')
    : '';

  document.getElementById('app').innerHTML = `
    <span class="invite-bg-heart tl">💗</span>
    <span class="invite-bg-heart br">💗</span>
    <div class="invite-card">
      <div class="thanks-wrap">
        <span class="thanks-icon">${icon}</span>
        <p class="thanks">${msg}</p>
        ${sub ? `<p class="thanks-sub">${sub}</p>` : ''}
      </div>
    </div>
  `;
}

load();
