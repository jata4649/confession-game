(() => {
  const app = document.querySelector('#app');
  const sessionKey = 'kotoba-kokuhaku-session';
  let session = JSON.parse(localStorage.getItem(sessionKey) || 'null');
  let state = null;
  let selected = [];
  let timer, socket, socketRoom, reconnectTimer;
  const audioPrefsKey = 'kotoba-kokuhaku-audio';
  let audioPrefs = JSON.parse(localStorage.getItem(audioPrefsKey) || '{"se":0.65,"bgm":0.22}');
  let audioContext, bgmTimer, bgmGain;

  const template = id => document.querySelector(`#${id}`).content.cloneNode(true);
  const escape = value => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const message = text => `<div class="toast">${escape(text)}</div>`;
  const api = async (url, options = {}) => {
    const response = await fetch(url, {headers: {'Content-Type':'application/json'}, ...options});
    if (!response.ok) { const text = await response.text(); let detail; try { detail = JSON.parse(text).detail; } catch (_) {} const error = new Error(detail || '通信に失敗しました。'); error.status = response.status; throw error; }
    return response.status === 204 ? null : response.json();
  };
  const saveSession = data => { session = data; localStorage.setItem(sessionKey, JSON.stringify(data)); };
  const action = (label, callback) => `<button class="button ${label.kind || 'primary'}" data-command="${label.command || ''}">${label.text}</button>`;

  function ensureAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
  }
  function tone(frequency, duration = .08, volume = audioPrefs.se, type = 'sine') {
    if (!volume || !window.AudioContext && !window.webkitAudioContext) return;
    ensureAudio(); const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0, audioContext.currentTime); gain.gain.linearRampToValueAtTime(volume * .12, audioContext.currentTime + .01); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + duration + .02);
  }
  function playSe(kind = 'tap') { if (kind === 'success') { tone(659,.07); setTimeout(() => tone(880,.13), 75); } else if (kind === 'reveal') { tone(523,.08); setTimeout(() => tone(659,.08), 90); setTimeout(() => tone(784,.15), 180); } else tone(440,.045,.65 * audioPrefs.se,'triangle'); }
  function stopBgm() { clearInterval(bgmTimer); bgmTimer = null; if (bgmGain) { bgmGain.gain.cancelScheduledValues(audioContext?.currentTime || 0); bgmGain = null; } }
  function setBgm(shouldPlay) {
    if (!shouldPlay || !audioPrefs.bgm) return stopBgm();
    ensureAudio(); if (bgmTimer) return; bgmGain = audioContext.createGain(); bgmGain.gain.value = audioPrefs.bgm * .045; bgmGain.connect(audioContext.destination);
    const notes = [261.63,329.63,392,329.63,293.66,349.23,440,349.23]; let index = 0;
    const playNote = () => { const oscillator=audioContext.createOscillator(); const gain=audioContext.createGain(); oscillator.type='sine'; oscillator.frequency.value=notes[index++ % notes.length]; gain.gain.setValueAtTime(.001,audioContext.currentTime); gain.gain.linearRampToValueAtTime(1,audioContext.currentTime+.05); gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.65); oscillator.connect(gain).connect(bgmGain); oscillator.start(); oscillator.stop(audioContext.currentTime+.7); };
    playNote(); bgmTimer = setInterval(playNote, 760);
  }
  function saveAudioPrefs() { localStorage.setItem(audioPrefsKey, JSON.stringify(audioPrefs)); setBgm(state?.phase === 'READING'); }
  function disconnectRealtime() {
    clearTimeout(reconnectTimer); socketRoom = null;
    if (socket) { socket.onclose = null; socket.close(); socket = null; }
  }
  function connectRealtime() {
    if (!session || !('WebSocket' in window)) return;
    if (socketRoom === session.roomId && socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    if (socket) socket.close(); socketRoom = session.roomId;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${scheme}://${location.host}/ws/room?roomId=${encodeURIComponent(session.roomId)}`);
    socket.onopen = () => refresh();
    socket.onmessage = () => refresh();
    socket.onclose = () => { if (session?.roomId === socketRoom) reconnectTimer = setTimeout(connectRealtime, 1800); };
  }
  function showScreen(name) { clearInterval(timer); disconnectRealtime(); stopBgm(); state = null; app.innerHTML = ''; app.append(template(`${name}-template`)); }
  function toast(text) { app.insertAdjacentHTML('beforeend', message(text)); setTimeout(() => app.querySelector('.toast')?.remove(), 3500); }

  async function createRoom() {
    const name = document.querySelector('#create-name').value;
    const data = await api('/api/rooms', {method:'POST', body: JSON.stringify({name, maxPlayers: document.querySelector('#max-players').value, rounds: document.querySelector('#rounds').value, cardCount: document.querySelector('#card-count').value})});
    saveSession(data); await refresh();
  }
  async function joinRoom() {
    const roomId = document.querySelector('#join-room').value.trim(); const name = document.querySelector('#join-name').value;
    const data = await api(`/api/rooms/${roomId}/join`, {method:'POST', body: JSON.stringify({name})}); saveSession(data); await refresh();
  }
  async function command(path, body = {}) { await api(`/api/rooms/${session.roomId}/${path}`, {method:'POST', body:JSON.stringify({...body, playerId:session.playerId})}); await refresh(); }
  async function refresh() {
    if (!session) return showScreen('landing');
    try { state = await api(`/api/rooms/${session.roomId}?playerId=${session.playerId}`); connectRealtime(); renderRoom(); }
    catch (error) {
      if (error.status === 403 || error.status === 404) { localStorage.removeItem(sessionKey); session = null; showScreen('landing'); toast(error.message); return; }
      toast('通信を再接続中です…');
      clearInterval(timer); timer = setInterval(refresh, 1800);
    }
  }

  function playerRows() { return state.players.map(p => `<li><span class="presence ${p.connected ? '' : 'offline'}"></span><b>${escape(p.name)}</b>${p.host ? '<em>HOST</em>' : ''}<span class="score">${p.points} pt</span>${state.phase === 'COMPOSING' ? `<small>${p.submitted ? '提出済み' : p.connected ? '作成中' : '通信切断中'}</small>` : ''}${state.isHost && p.canSkip ? `<button class="skip" data-skip="${p.id}">スキップ</button>` : ''}</li>`).join(''); }
  function roomHeader() { return `<header class="room-top"><div><p class="eyebrow">ROOM ${state.roomId}</p><h2>ことばの告白</h2></div><div class="header-actions"><button class="icon-button" data-action="audio" aria-label="サウンド設定">♪</button><button class="icon-button" data-action="leave" aria-label="退出">×</button></div></header>`; }
  function audioPanel() { return `<aside class="audio-panel" id="audio-panel"><div><b>サウンド設定</b><button data-action="close-audio" aria-label="閉じる">×</button></div><label>SE <output>${Math.round(audioPrefs.se * 100)}%</output><input type="range" min="0" max="1" step="0.05" value="${audioPrefs.se}" data-volume="se"></label><label>BGM <output>${Math.round(audioPrefs.bgm * 100)}%</output><input type="range" min="0" max="1" step="0.05" value="${audioPrefs.bgm}" data-volume="bgm"></label><p>端末ごとに音量を保存します。</p></aside>`; }
  function renderRoom() {
    clearInterval(timer); app.innerHTML = `<section class="room">${roomHeader()}<div id="phase"></div></section>`;
    const phase = app.querySelector('#phase');
    if (state.phase === 'WAITING') phase.innerHTML = waitingView();
    if (state.phase === 'COMPOSING') phase.innerHTML = composingView();
    if (state.phase === 'READING') phase.innerHTML = readingView();
    if (state.phase === 'JUDGING') phase.innerHTML = judgingView();
    if (state.phase === 'ROUND_RESULT') phase.innerHTML = resultView(false);
    if (state.phase === 'GAME_RESULT') phase.innerHTML = resultView(true);
    app.insertAdjacentHTML('beforeend', audioPanel());
    setBgm(state.phase === 'READING');
    timer = setInterval(refresh, socket?.readyState === WebSocket.OPEN ? 15000 : 1300);
  }
  function waitingView() { return `<div class="hero-card"><div class="room-code"><span>招待コード</span><strong>${state.roomId}</strong><button class="copy" data-action="copy">コピー</button></div><p>参加者がそろったら、ホストがゲームを開始します。</p></div><section class="section"><div class="section-head"><h3>参加者 ${state.players.length}人</h3><span class="status-dot">同期中</span></div><ul class="players">${playerRows()}</ul></section>${state.isHost ? action({text:'ゲームを開始する', command:'start'}) : '<p class="waiting-note">ホストの開始を待っています…</p>'}`; }
  function composingView() {
    if (state.isRecipient) return `<div class="role-banner recipient"><span>♡</span><div><small>ROUND ${state.round} / ${state.totalRounds}</small><h3>今回は告白される人です</h3><p>みんなが文章を作成中。内容はまだ秘密です。</p></div></div><section class="section"><h3>提出状況</h3><ul class="players">${playerRows()}</ul></section>`;
    const cards = state.hand.map((card, i) => `<button class="word-card ${selected.includes(card) ? 'picked' : ''}" data-card="${i}"><span>${selected.includes(card) ? '✓ 選択中' : 'MESSAGE'}</span>${escape(card)}</button>`).join('');
    const preview = selected.length ? selected.map((card, i) => `<li draggable="true" data-drag="${i}"><span>☰</span>${escape(card)}<button data-remove="${i}" aria-label="削除">×</button></li>`).join('') : '<li class="empty">カードを選んで、告白を組み立てよう。</li>';
    return `<div class="role-banner composer"><span>✦</span><div><small>ROUND ${state.round} / ${state.totalRounds}</small><h3>${escape(state.recipientName)}さんへ告白をつくる</h3><p>カードは最大${state.cardLimit}枚まで。順番は長押しで入れ替えできます。</p></div></div><section class="section"><div class="section-head"><h3>あなたの手札</h3><span>${selected.length} / ${state.cardLimit}</span></div><div class="card-grid">${cards}</div></section><section class="section"><div class="section-head"><h3>作成中の告白</h3><span>読み上げ順</span></div><ol class="sentence-list">${preview}</ol></section>${action({text:'この内容で提出する', command:'submit', kind:'primary'})}<section class="section compact"><h3>提出状況</h3><ul class="players">${playerRows()}</ul></section>`;
  }
  function readingView() { const isLast = state.sentenceNumber === state.sentenceTotal; return `<div class="reading-stage"><p class="eyebrow">${escape(state.readerName)} さんの告白</p><div class="progress"><span>${state.sentenceNumber} / ${state.sentenceTotal}</span><i style="width:${(state.sentenceNumber / state.sentenceTotal) * 100}%"></i></div><div class="spoken-line">${escape(state.currentSentence)}</div><p>${isLast ? 'これで告白は終了です。' : '続きを読み上げたら、次の文へ。'}</p>${state.canAdvance ? action({text:isLast ? '告白を終了する' : '次の文へ', command:'next', kind:'primary'}) : '<div class="waiting-note">${escape(state.readerName)}さんが読み上げ中です…</div>'}</div>`; }
  function judgingView() { const list = state.candidates.map(c => `<button class="candidate" data-winner="${c.id}"><span>${escape(c.name)}</span><p>${c.lines.map(escape).join('<br>')}</p><b>この告白を選ぶ</b></button>`).join(''); return state.isRecipient ? `<div class="role-banner recipient"><span>♡</span><div><small>JUDGMENT</small><h3>いちばん心に響いたのは？</h3><p>選んだ相手に1ポイントが入ります。</p></div></div><div class="candidate-list">${list}</div>` : `<div class="waiting-note large">${escape(state.recipientName)}さんが選んでいます…<br><small>投票結果はまもなく全員に届きます。</small></div>`; }
  function resultView(final) { const winner = state.players.find(p => p.id === state.winnerId); const ranked = [...state.players].sort((a,b) => b.points-a.points).map((p,i) => `<li class="${i===0 ? 'top' : ''}"><b>${i+1}</b><span>${escape(p.name)}</span><strong>${p.points} pt</strong></li>`).join(''); return `<div class="result"><p class="eyebrow">${final ? 'FINAL RESULT' : 'ROUND RESULT'}</p><div class="winner-mark">♡</div><h3>${final ? 'ゲーム終了！' : `${escape(winner?.name || '')} さんの告白が選ばれました`}</h3>${!final ? '<p>+1 point</p>' : '<p>今夜のベスト告白、おつかれさまでした。</p>'}<section class="ranking"><h3>${final ? '最終順位' : '現在の順位'}</h3><ol>${ranked}</ol></section>${final ? '<button class="button ghost" data-action="leave">タイトルへ戻る</button>' : state.isHost ? action({text:'次のラウンドへ', command:'next-round'}) : '<div class="waiting-note">ホストが次のラウンドを開始します…</div>'}</div>`; }

  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-action], [data-command], [data-card], [data-remove], [data-winner]'); if (!target) return;
    try {
      ensureAudio();
      if (target.dataset.action === 'home') return showScreen('landing'); if (target.dataset.action === 'show-create') return showScreen('create'); if (target.dataset.action === 'show-join') return showScreen('join');
      if (target.dataset.action === 'audio') return document.querySelector('#audio-panel').classList.toggle('open'); if (target.dataset.action === 'close-audio') return document.querySelector('#audio-panel').classList.remove('open');
      if (target.dataset.action === 'create') return await createRoom(); if (target.dataset.action === 'join') return await joinRoom();
      if (target.dataset.action === 'leave') { clearInterval(timer); disconnectRealtime(); localStorage.removeItem(sessionKey); session=null; return showScreen('landing'); }
      if (target.dataset.action === 'copy') { await navigator.clipboard.writeText(state.roomId); return toast('招待コードをコピーしました'); }
      if (target.dataset.card !== undefined) { const card = state.hand[Number(target.dataset.card)]; selected = selected.includes(card) ? selected.filter(x => x !== card) : selected.length < state.cardLimit ? [...selected, card] : selected; return renderRoom(); }
      if (target.dataset.remove !== undefined) { selected.splice(Number(target.dataset.remove), 1); return renderRoom(); }
      if (target.dataset.skip) { if (confirm('通信切断中のプレイヤーをスキップしますか？')) { playSe('tap'); return await command('skip', {playerIdToSkip:target.dataset.skip}); } return; }
      if (target.dataset.winner) { playSe('success'); return await command('winner', {winnerId:target.dataset.winner}); }
      const commands = {start:'start', submit:'submit', next:'next', 'next-round':'next-round'}; if (target.dataset.command) { playSe(target.dataset.command === 'next' ? 'reveal' : 'tap'); return await command(commands[target.dataset.command], target.dataset.command === 'submit' ? {cards:selected} : target.dataset.command === 'next' ? {version:state.version} : {}); }
    } catch (error) { toast(error.message); }
  });
  document.addEventListener('input', event => { if (!event.target.dataset.volume) return; audioPrefs[event.target.dataset.volume] = Number(event.target.value); event.target.previousElementSibling.value = `${Math.round(Number(event.target.value) * 100)}%`; saveAudioPrefs(); if (event.target.dataset.volume === 'se') tone(659,.06); });
  let dragged;
  document.addEventListener('dragstart', e => { const item=e.target.closest('[data-drag]'); if (item) dragged=Number(item.dataset.drag); });
  document.addEventListener('dragover', e => { if (e.target.closest('[data-drag]')) e.preventDefault(); });
  document.addEventListener('drop', e => { const item=e.target.closest('[data-drag]'); if (!item || dragged === undefined) return; const to=Number(item.dataset.drag); const [card]=selected.splice(dragged,1); selected.splice(to,0,card); dragged=undefined; renderRoom(); });
  session ? refresh() : showScreen('landing');
})();
