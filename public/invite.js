const id = window.location.pathname.split('/').pop();
let invitation = null;
let t = translations.uz;
let noDodgeCount = 0;

async function load() {
  const res = await fetch(`/api/invitations/${id}`);
  if (!res.ok) {
    document.getElementById('app').innerHTML = `<p class="not-found">${translations.uz.notFound}</p>`;
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
  document.documentElement.style.setProperty('--accent', invitation.style.color);
  document.getElementById('app').innerHTML = `
    <div class="invite-card theme-${invitation.style.theme}">
      <p class="mini-label">TAKLIFNOMA</p>
      <h1 class="invite-title">${escapeHtml(invitation.to)}</h1>
      <p class="invite-from">${escapeHtml(invitation.from)} ${t.fromLabel}</p>
      <p class="invite-message">${escapeHtml(invitation.message)}</p>
      <p class="invite-question">${escapeHtml(invitation.question)}</p>
      <div class="answer-buttons" id="answerButtons">
        <button id="btnYes" class="btn-yes">${t.yes}</button>
        <button id="btnNo" class="btn-no">${t.no}</button>
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
  container.style.minHeight = '90px';
  btn.style.position = 'absolute';
  btn.style.left = '55%';
  btn.style.top = '10px';

  const moveAway = () => {
    noDodgeCount++;
    const cw = container.offsetWidth, ch = container.offsetHeight;
    const bw = btn.offsetWidth, bh = btn.offsetHeight;
    btn.style.left = (Math.random() * Math.max(cw - bw, 10)) + 'px';
    btn.style.top = (Math.random() * Math.max(ch - bh, 10)) + 'px';
  };
  btn.addEventListener('mouseenter', moveAway);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); moveAway(); });
  btn.addEventListener('click', (e) => { e.preventDefault(); moveAway(); });
}

function onYes() {
  if (invitation.locationTimeSelection && invitation.locationTimeSelection.enabled &&
      invitation.locationTimeSelection.placeOptions.length) {
    const places = invitation.locationTimeSelection.placeOptions
      .map(p => `<span class="chip select-place">${escapeHtml(p)}</span>`).join('');
    const times = invitation.locationTimeSelection.timeOptions
      .map(tm => `<span class="chip select-time">${escapeHtml(tm)}</span>`).join('');
    document.getElementById('followUp').innerHTML = `
      <p class="follow-label">${t.choosePlace}</p><div class="chips">${places}</div>
      <p class="follow-label">${t.chooseTime}</p><div class="chips">${times}</div>
      <button id="confirmBtn" class="btn-confirm">${t.confirm}</button>
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
      if (!chosenPlace || !chosenTime) { alert(t.selectBoth); return; }
      submit('ha', chosenPlace, chosenTime);
    };
  } else {
    submit('ha', invitation.place || '', invitation.time || '');
  }
}

function onNo() { submit('yoq', '', ''); }

async function submit(answer, place, time) {
  await fetch(`/api/invitations/${id}/respond`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer, place, time, noAttempts: noDodgeCount })
  });
  const msg = answer === 'ha' ? t.thanksYes : t.thanksNo;
  document.getElementById('app').innerHTML = `<div class="invite-card"><p class="thanks">${msg}</p></div>`;
}

load();