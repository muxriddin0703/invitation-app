const id = window.location.pathname.split('/').pop();
let invitation = null;
let t = translations.uz;
let noDodgeCount = 0;

async function load() {
  try {
    const res = await fetch(`/api/invitations/${id}`);
    if (!res.ok) throw new Error('not found');
    invitation = await res.json();
    t = translations[invitation.language] || translations.uz;
    render();
  } catch (e) {
    document.getElementById('app').innerHTML = `
      <div class="invite-card">
        <span class="big" style="display:block;text-align:center;font-size:48px;margin-bottom:12px">💔</span>
        <p style="text-align:center;color:#999">Taklifnoma topilmadi</p>
      </div>`;
  }
}

function escapeHtml(str = '') {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function render() {
  const color = invitation.style?.color || '#c2185b';
  document.documentElement.style.setProperty('--accent', color);
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
      <div id="mainButtons" class="answer-buttons">
        <button id="btnYes" class="btn-yes">✨ ${t.yes}</button>
        <button id="btnNo"  class="btn-no">${t.no}</button>
      </div>
      <div id="followUp"></div>
    </div>
  `;

  document.getElementById('btnYes').onclick = onYes;
  const btnNo = document.getElementById('btnNo');

  if (invitation.allowNo) {
    btnNo.style.position = 'static';
    btnNo.style.left = '';
    btnNo.style.top = '';
    btnNo.style.right = '';
    btnNo.onclick = onNo;
  } else {
    setupDodge(btnNo);
  }
}

function setupDodge(btn) {
  const container = document.getElementById('mainButtons');
  container.style.position = 'relative';
  container.style.minHeight = '100px';

  btn.style.position = 'absolute';
  btn.style.right = '0';
  btn.style.left = 'auto';
  btn.style.top = '10px';

  const moveAway = () => {
    noDodgeCount++;
    const cw = container.offsetWidth;
    const ch = Math.max(container.offsetHeight, 100);
    const bw = btn.offsetWidth;
    const bh = btn.offsetHeight;

    const maxLeft = Math.max(cw - bw, 10);
    const maxTop = Math.max(ch - bh, 10);

    const newLeft = Math.random() * maxLeft;
    const newTop = Math.random() * maxTop;

    btn.style.right = 'auto';
    btn.style.left = `${newLeft}px`;
    btn.style.top = `${newTop}px`;
  };

  btn.addEventListener('mouseenter', moveAway);
  btn.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      moveAway();
    },
    { passive: false }
  );
}

function onYes() {
  const lts = invitation.locationTimeSelection;
  const hasPlaces = lts && lts.enabled && lts.placeOptions && lts.placeOptions.length > 0;
  const hasTimes = lts && lts.enabled && lts.timeOptions && lts.timeOptions.length > 0;

  if (!hasPlaces && !hasTimes) {
    submit('ha', invitation.place || '', invitation.time || '');
    return;
  }

  document.getElementById('mainButtons').style.display = 'none';

  let html = '';

  if (hasPlaces) {
    html += `<p class="follow-label">📍 ${t.choosePlace}</p><div class="chips" id="placeChips">`;
    lts.placeOptions.forEach((p, i) => {
      html += `<span class="chip" data-index="${i}" data-type="place">${escapeHtml(p)}</span>`;
    });
    html += `</div>`;
  }

  if (hasTimes) {
    html += `<p class="follow-label">🕐 ${t.chooseTime}</p><div class="chips" id="timeChips">`;
    lts.timeOptions.forEach((tm, i) => {
      html += `<span class="chip" data-index="${i}" data-type="time">${escapeHtml(tm)}</span>`;
    });
    html += `</div>`;
  }

  html += `<button id="confirmBtn" class="btn-confirm">💗 ${t.confirm}</button>`;
  html += `<button id="backBtn" style="display:block;width:100%;margin-top:10px;background:none;border:none;color:#aaa;font-size:13px;cursor:pointer;font-family:inherit">← ${t.back || 'Orqaga'}</button>`;

  document.getElementById('followUp').innerHTML = html;

  let chosenPlace = '';
  let chosenTime = '';

  document.querySelectorAll('[data-type="place"]').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('[data-type="place"]').forEach((e) => e.classList.remove('active'));
      el.classList.add('active');
      chosenPlace = el.textContent.trim();
    });
  });

  document.querySelectorAll('[data-type="time"]').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('[data-type="time"]').forEach((e) => e.classList.remove('active'));
      el.classList.add('active');
      chosenTime = el.textContent.trim();
    });
  });

  document.getElementById('confirmBtn').addEventListener('click', () => {
    if (hasPlaces && !chosenPlace) {
      alert('Iltimos, joy tanlang 📍');
      return;
    }
    if (hasTimes && !chosenTime) {
      alert('Iltimos, vaqt tanlang 🕐');
      return;
    }
    submit('ha', chosenPlace, chosenTime);
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    document.getElementById('followUp').innerHTML = '';
    document.getElementById('mainButtons').style.display = 'flex';
  });
}

function onNo() {
  submit('yoq', '', '');
}

async function submit(answer, place, time) {
  document.querySelectorAll('button').forEach((b) => {
    b.disabled = true;
    b.style.opacity = '0.6';
    b.style.pointerEvents = 'none';
  });

  try {
    await fetch(`/api/invitations/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer, place, time, noAttempts: noDodgeCount }),
    });
  } catch (e) {}

  const isYes = answer === 'ha';
  const icon = isYes ? '🥰' : '💙';
  const msg = isYes ? t.thanksYes : t.thanksNo;
  let sub = '';

  if (isYes && place) sub += `📍 ${place}`;
  if (isYes && time) sub += (sub ? '&nbsp;&nbsp;' : '') + `🕐 ${time}`;

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
