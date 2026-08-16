import {
  LETTER_CHART,
  NUMBER_CHART,
  encodeText,
  decodeMorse,
  splitLetters,
  answerLetters,
  applyPressWith,
  addWordBreak,
  hasPendingWordBreak,
  undoLast,
  undoLastLetter,
  evenTiming,
  farnsworthTiming,
  buildScheduleWith,
  symbolForPress,
  dashThresholdMs,
  letterThresholdMs,
  compareToTarget,
  ECHO_START,
  echoHear,
  echoTap,
  echoSelect,
  echoTiles,
  echoComplete,
  echoClean,
  echoTargetCode,
  echoGiveLetter,
  echoOpenUp,
  echoProgress,
  echoIsDone,
  nextUnsolved,
} from './lib/morse.js';
import { createTone, createPlayer } from './tone.js';
import { load, save } from './store.js';
import { createRelay } from './relay.js';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = load();
state.connected = false;
state.status = 'idle';
state.peers = 0;
state.draft = '';
state.guideText = '';
state.tab = 'key';
state.decodingId = null;
state.lastRelease = null;
state.playing = null;
state.activeLetter = -1;

let counter = state.messages.reduce((top, m) => {
  const n = Number(String(m.id || '').replace(/\D/g, '')) || 0;
  return n > top ? n : top;
}, 0);
const nextId = () => `m${++counter}`;

const timing = () =>
  state.mode === 'farnsworth'
    ? farnsworthTiming(state.charWpm, state.effectiveWpm)
    : evenTiming(state.beginnerWpm);

const tone = createTone();
const player = createPlayer(tone, buildScheduleWith);

const persist = () => save(state);

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

const relay = createRelay({
  onStatus: (status, peers) => {
    state.status = status;
    state.peers = peers;
    render();
  },
  onMorse: ({ symbols, sentAt }) => {
    state.messages.push({
      id: nextId(),
      mine: false,
      symbols,
      at: sentAt,
      echo: { ...ECHO_START },
      delivery: 'none',
    });
    persist();
    render();
  },
  onAck: ({ id, deliveredTo }) => {
    const message = state.messages.find((m) => m.id === id);
    if (!message) return;
    message.delivery = deliveredTo > 0 ? 'delivered' : 'nobody';
    persist();
    render();
  },
  onReady: () => flushQueued(),
});

function flushQueued() {
  let changed = false;
  for (const message of state.messages) {
    if (message.mine && message.delivery === 'queued') {
      if (relay.send(message.id, message.symbols)) {
        message.delivery = 'sending';
        awaitAck(message.id);
        changed = true;
      }
    }
  }
  if (changed) {
    persist();
    render();
  }
}

function join() {
  if (state.room.length < 3) return;
  state.connected = true;
  state.autoJoin = true;
  persist();
  relay.join(state.serverUrl, state.room);
  render();
}

function leave() {
  state.connected = false;
  state.autoJoin = false;
  persist();
  relay.leave();
  render();
}

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

function send() {
  const symbols = state.draft.trim();
  if (symbols.length === 0) return;
  const id = nextId();
  const accepted = relay.send(id, symbols);
  state.messages.push({
    id,
    mine: true,
    symbols,
    at: Date.now(),
    echo: { ...ECHO_START },
    delivery: accepted ? 'sending' : 'queued',
  });
  state.draft = '';
  state.lastRelease = null;
  persist();
  if (accepted) awaitAck(id);
  render();
}

/**
 * The server confirms delivery, but an older one won't. Rather than
 * showing "Sending…" for ever, settle to a plain "Sent" after a while.
 */
/**
 * No confirmation back means the server is an older one that doesn't
 * send them. It does NOT mean the message was lost: the socket took it,
 * so it went out. Resending here would duplicate it on the other phone,
 * so we only stop claiming to be certain.
 */
function awaitAck(id) {
  setTimeout(() => {
    const message = state.messages.find((m) => m.id === id);
    if (message && message.delivery === 'sending') {
      message.delivery = 'sent';
      persist();
      render();
    }
  }, 8000);
}

function playMessage(id, symbols, slow = false) {
  if (state.playing === id) {
    player.stop();
    state.playing = null;
    state.activeLetter = -1;
    render();
    return;
  }
  const base = timing();
  const t = slow
    ? { charUnitMs: base.charUnitMs * 2, letterGapMs: base.letterGapMs * 2, wordGapMs: base.wordGapMs * 2 }
    : base;
  state.playing = id;
  player.play(symbols, t, {
    onLetter: (index) => {
      state.activeLetter = index;
      render();
    },
    onDone: () => {
      state.playing = null;
      state.activeLetter = -1;
      render();
    },
  });
  render();
}

/* ------------------------------------------------------------------ */
/* The key                                                             */
/* ------------------------------------------------------------------ */

let pressStart = 0;
let holdTimer = null;
let held = null;

function keyDown() {
  tone.unlock();
  pressStart = Date.now();
  held = 0;
  tone.on();
  clearInterval(holdTimer);
  holdTimer = setInterval(() => {
    held = Date.now() - pressStart;
    renderKey();
  }, 60);
  renderKey();
}

function keyUp() {
  clearInterval(holdTimer);
  tone.off();
  const now = Date.now();
  const duration = now - pressStart;
  const gapBefore = state.lastRelease === null ? 0 : pressStart - state.lastRelease;
  state.lastRelease = now;
  held = null;

  if (state.decodingId) {
    const message = state.messages.find((m) => m.id === state.decodingId);
    if (message) {
      const before = message.echo.solved.length;
      message.echo = echoTap(message.symbols, message.echo, symbolForPress(duration, timing()));
      const done = echoComplete(message.symbols, message.echo);
      if (done) state.decodingId = null;
      persist();
      render();
      // Finished a letter? Sound the next one automatically.
      if (!done && message.echo.solved.length > before) {
        const code = echoTargetCode(message.symbols, message.echo);
        if (code) {
          message.echo = echoHear(message.echo);
          playMessage(message.id + ':echo', code);
        }
      }
      return;
    }
    render();
    return;
  }

  state.draft = applyPressWith(
    state.draft,
    gapBefore,
    duration,
    timing(),
    state.mode === 'farnsworth'
  );
  render();
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const el = (id) => document.getElementById(id);
const esc = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function statusBadge() {
  if (state.status === 'connected' && state.peers > 0) return { text: 'Partner online', cls: 'good' };
  if (state.status === 'connected') return { text: 'Waiting', cls: 'warn' };
  if (state.status === 'connecting') return { text: 'Connecting', cls: 'warn' };
  if (state.status === 'error') return { text: 'Reconnecting', cls: 'bad' };
  return { text: 'Offline', cls: 'dim' };
}

function renderKey() {
  const key = el('key');
  if (!key) return;
  const t = timing();
  const down = held !== null;
  const isDash = down && held >= dashThresholdMs(t);

  key.className = 'key' + (down ? (isDash ? ' dash' : ' dot') : '');

  // Reuse the same nodes rather than replacing them mid-press.
  let mark = key.querySelector('.mark');
  let label = key.querySelector('.marklabel');
  if (!mark) {
    key.innerHTML = '<div class="mark"></div><div class="marklabel"></div>';
    mark = key.querySelector('.mark');
    label = key.querySelector('.marklabel');
  }
  mark.textContent = down ? (isDash ? '—' : '•') : 'HOLD';
  mark.style.fontSize = down ? '' : '20px';
  mark.style.letterSpacing = down ? '' : '4px';
  mark.style.color = down && isDash ? '#000' : '';
  label.textContent = down ? (isDash ? 'DASH' : 'DOT · keep holding') : '';

  const hint = el('keyhint');
  if (hint) {
    hint.textContent = down
      ? isDash
        ? 'Let go — this is a dash'
        : `Hold ${Math.max(0, Math.round(dashThresholdMs(t) - held))}ms more for a dash`
      : `tap short for a dot, hold ${Math.round(dashThresholdMs(t))}ms for a dash`;
  }
}

function messageHtml(message) {
  const tokens = splitLetters(message.symbols);
  const answer = answerLetters(message.symbols);
  const playing = state.playing === message.id;

  if (message.mine) {
    const tag =
      message.delivery === 'delivered'
        ? '<span class="tag good">Delivered</span>'
        : message.delivery === 'sending'
          ? '<span class="tag">Sending…</span>'
          : message.delivery === 'nobody'
            ? '<span class="tag warn">Nobody there</span>'
            : `<button class="tag bad linkish" data-retry="${message.id}">Not sent · Retry</button>`;

    const tiles = tokens
      .map((token, index) => {
        const active = playing && state.activeLetter === index;
        return `<div class="tile${active ? ' active' : ''}${
          token.startsWord && index > 0 ? ' wordbreak' : ''
        }"><span class="code">${token.code}</span><span class="char">${answer[index]}</span></div>`;
      })
      .join('');

    return `<div class="msg mine">
      <div class="msgtop">
        <button class="pill" data-play="${message.id}">${playing ? '■ Stop' : '▶ Listen'}</button>
        ${tag}
      </div>
      <div class="tiles">${tiles}</div>
      <div class="plain">${esc(decodeMorse(message.symbols))}</div>
    </div>`;
  }

  // Received: decode it by ear, one letter at a time.
  const echo = message.echo || { ...ECHO_START };
  const tiles = echoTiles(message.symbols, echo);
  const done = echoComplete(message.symbols, echo);
  const clean = echoClean(message.symbols, echo);
  const active = state.decodingId === message.id;

  const tileHtml = tokens
    .map((token, index) => {
      const tileState = tiles[index];
      const shown = tileState === 'solved' || tileState === 'given';
      const isCurrent = tileState === 'current';
      // Always show the dots and dashes. The letter is what you earn.
      return `<button class="tile${shown ? ' shown' : ''}${
        tileState === 'solved' ? ' solved' : ''
      }${tileState === 'given' ? ' given' : ''}${isCurrent && active ? ' current' : ''}${
        echo.missed && isCurrent ? ' missed' : ''
      }${token.startsWord && index > 0 ? ' wordbreak' : ''}"
        ${shown || done ? 'disabled' : `data-pick="${message.id}:${index}"`}
      ><span class="code">${token.code}</span><span class="char">${
        shown ? answer[index] : '_'
      }</span></button>`;
    })
    .join('');

  const tag = done
    ? `<span class="tag ${clean ? 'good' : ''}">${
        clean ? 'Decoded · perfect' : `Decoded · ${echo.misses} missed, ${echo.given.length} given`
      }</span>`
    : `<span class="tag">${echoProgress(message.symbols, echo)}/${tokens.length}</span>`;

  const controls = done
    ? `<button class="pill" data-play="${message.id}">${playing ? '■ Stop' : '▶ Replay'}</button>`
    : active
      ? `<button class="pill" data-listen="${message.id}" ${
          echo.current < 0 ? 'disabled' : ''
        }>♪ Hear it again</button>`
      : `<button class="pill" data-decode="${message.id}">Decode this</button>`;

  const instruction = done
    ? `<div class="plain">${esc(plainText(message.symbols))}</div>`
    : active
      ? `<div class="instruction${echo.missed ? ' bad' : ''}">${
          echo.missed
            ? 'Not that one — listen again and retry'
            : echo.current < 0
              ? 'Tap any letter above to work on it'
              : `Tap it back: <b>${esc(echo.tapped || '·')}</b>`
        }</div>
         <div class="row">
           <button class="helper" data-skip="${message.id}" ${
             echo.current < 0 ? 'disabled' : ''
           }>Give me this one</button>
           <button class="helper dim" data-showall="${message.id}">Show all</button>
         </div>`
      : '<div class="instruction dim">A message arrived. Decode it by ear.</div>';

  return `<div class="msg theirs${active ? ' active' : ''}">
    <div class="msgtop">${controls}${tag}</div>
    <div class="tiles">${tileHtml}</div>
    ${instruction}
  </div>`;
}

function plainText(symbols) {
  const tokens = splitLetters(symbols);
  const answer = answerLetters(symbols);
  return tokens
    .map((token, index) => (token.startsWord && index > 0 ? ' ' : '') + answer[index])
    .join('');
}

function guideHtml() {
  const target = encodeText(state.guideText);
  const tokens = splitLetters(target);
  if (tokens.length === 0) {
    return `<input id="guideinput" class="input" placeholder="type what you want to say"
      value="${esc(state.guideText)}" autocapitalize="characters" autocomplete="off">
      <div class="note">Nothing is sent from this box — you still tap it out yourself.</div>`;
  }

  const letters = state.guideText.toUpperCase().replace(/[^A-Z0-9.,?!/@=-]/g, '').split('');
  const progress = compareToTarget(target, state.draft);
  const tiles = tokens
    .map((token, index) => {
      const s = progress.states[index];
      const current = progress.currentIndex === index;
      return `<div class="tile${s === 'done' ? ' done' : ''}${s === 'wrong' ? ' missed' : ''}${
        current && s !== 'wrong' ? ' current' : ''
      }${token.startsWord && index > 0 ? ' wordbreak' : ''}"
      ><span class="char">${letters[index] ?? '?'}</span><span class="code">${token.code}</span></div>`;
    })
    .join('');

  const status = progress.complete
    ? '<span class="good">That’s it — hit Send</span>'
    : progress.offTrack
      ? '<span class="bad">Off track — tap Undo</span>'
      : `Next: <b>${letters[progress.currentIndex] ?? ''}</b> ${
          tokens[progress.currentIndex]?.code ?? ''
        } &nbsp;(${progress.matched}/${tokens.length})`;

  return `<input id="guideinput" class="input" placeholder="type what you want to say"
    value="${esc(state.guideText)}" autocapitalize="characters" autocomplete="off">
    <div class="tiles">${tiles}</div>
    <div class="instruction">${status}</div>`;
}

function chartHtml() {
  const rows = (list) =>
    list
      .map(
        (row) =>
          `<button class="chartrow" data-code="${row.code}"><span class="char">${row.char}</span><span class="code">${row.code}</span><span class="hint">${row.hint}</span></button>`
      )
      .join('');
  return `<div class="note">Tap any row to hear it.</div>
    <div class="card">${rows(LETTER_CHART)}</div>
    <div class="note">Numbers</div>
    <div class="card">${rows(NUMBER_CHART)}</div>`;
}

function settingsHtml() {
  const t = timing();
  const beginner = state.mode === 'beginner';
  return `
    <div class="note">Mode</div>
    <div class="card pad">
      <div class="row">
        <button class="mode${beginner ? ' on' : ''}" data-mode="beginner">Beginner</button>
        <button class="mode${beginner ? '' : ' on'}" data-mode="farnsworth">Farnsworth</button>
      </div>
      <div class="note">${
        beginner
          ? 'One slow speed, and a Space button separates words. Pauses never split a word.'
          : 'Letters at full speed, silences stretched. No Space button — a long pause starts a new word.'
      }</div>
    </div>

    <div class="note">${beginner ? 'Speed' : 'Letter speed'}</div>
    <div class="card pad">
      <div class="stepper">
        <button data-step="${beginner ? 'beginnerWpm' : 'charWpm'}:-1">−</button>
        <div class="stepval">${beginner ? state.beginnerWpm : state.charWpm}<small>words per minute</small></div>
        <button data-step="${beginner ? 'beginnerWpm' : 'charWpm'}:1">+</button>
      </div>
      <div class="note">A dot is ${t.charUnitMs}ms · hold past ${Math.round(
        dashThresholdMs(t)
      )}ms for a dash · a letter closes after ${Math.round(letterThresholdMs(t))}ms of silence.</div>
    </div>

    ${
      beginner
        ? ''
        : `<div class="note">Overall pace</div>
    <div class="card pad">
      <div class="stepper">
        <button data-step="effectiveWpm:-1">−</button>
        <div class="stepval">${state.effectiveWpm}<small>words per minute</small></div>
        <button data-step="effectiveWpm:1">+</button>
      </div>
      <div class="note">Letter gap ${t.letterGapMs}ms · word gap ${t.wordGapMs}ms.</div>
    </div>`
    }

    <div class="note">Sound</div>
    <div class="card pad">
      <button class="mode${state.soundOn ? ' on' : ''}" data-sound="toggle">
        ${state.soundOn ? 'Beep is on' : 'Beep is off'}
      </button>
    </div>

    <div class="note">Server</div>
    <div class="card pad">
      <input id="serverinput" class="input" value="${esc(state.serverUrl)}" autocapitalize="off" autocomplete="off">
      <div class="note">Both devices must use the same server.</div>
    </div>

    <div class="note">History</div>
    <div class="card pad">
      <button class="helper" data-clear="1">${
        state.messages.length === 0
          ? 'No messages stored'
          : `Delete ${state.messages.length} stored message${state.messages.length === 1 ? '' : 's'}`
      }</button>
    </div>

    <div class="version">Morse Tap · web · v025</div>`;
}

function render() {
  const badge = statusBadge();
  el('chip').className = 'chip ' + badge.cls;
  el('chip').textContent = state.room && state.connected ? state.room : badge.text;

  for (const tab of ['key', 'chart', 'settings']) {
    el('tab-' + tab).classList.toggle('on', state.tab === tab);
  }

  el('roompanel').style.display = state.roomOpen ? 'block' : 'none';
  if (state.roomOpen) {
    const input = el('roominput');
    if (input && document.activeElement !== input) input.value = state.room;
    el('joinbtn').textContent = state.connected ? 'Leave' : 'Join';
  }

  el('keyview').style.display = state.tab === 'key' ? 'flex' : 'none';
  el('otherview').style.display = state.tab === 'key' ? 'none' : 'block';

  if (state.tab === 'key') {
    el('log').innerHTML =
      state.messages.length === 0
        ? '<div class="note center">Join a room to message someone. Until then, tap out messages to yourself.</div>'
        : state.messages.map(messageHtml).join('');

    el('decodebanner').style.display = state.decodingId ? 'flex' : 'none';
    el('guide').style.display = state.decodingId ? 'none' : 'block';
    if (!state.decodingId) {
      const input = el('guideinput');
      const focused = document.activeElement === input;
      if (!focused) el('guide').innerHTML = guideHtml();
    }

    el('draft').innerHTML = `<div class="draftmorse">${esc(state.draft || ' ')}</div>
      <div class="note">${
        state.draft.length === 0 ? 'tap the key below' : esc(decodeMorse(state.draft) || '?')
      }</div>`;

    el('spacebtn').style.display = state.mode === 'beginner' ? 'block' : 'none';
    el('spacebtn').classList.toggle('armed', hasPendingWordBreak(state.draft));
    renderKey();
  } else {
    el('otherview').innerHTML = state.tab === 'chart' ? chartHtml() : settingsHtml();
  }
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

const LADDERS = {
  beginnerWpm: [3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20],
  charWpm: [8, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 25],
  effectiveWpm: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15],
};

function step(key, direction) {
  let ladder = LADDERS[key];
  if (key === 'effectiveWpm') ladder = ladder.filter((v) => v <= state.charWpm);
  const closest = ladder.reduce((best, v) =>
    Math.abs(v - state[key]) < Math.abs(best - state[key]) ? v : best
  );
  const index = ladder.indexOf(closest) + direction;
  state[key] = ladder[Math.max(0, Math.min(ladder.length - 1, index))];
  if (state.effectiveWpm > state.charWpm) {
    const allowed = LADDERS.effectiveWpm.filter((v) => v <= state.charWpm);
    state.effectiveWpm = allowed[allowed.length - 1] ?? LADDERS.effectiveWpm[0];
  }
  persist();
  render();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-play],[data-listen],[data-decode],[data-pick],[data-skip],[data-showall],[data-retry],[data-code],[data-mode],[data-step],[data-sound],[data-clear]');
  if (!target) return;
  tone.unlock();
  const d = target.dataset;

  if (d.play) return playMessage(d.play, state.messages.find((m) => m.id === d.play).symbols);
  if (d.code) return playMessage('chart:' + d.code, d.code);

  if (d.decode) {
    state.decodingId = d.decode;
    const message = state.messages.find((m) => m.id === d.decode);
    if (message.echo.current < 0) {
      message.echo = echoSelect(
        message.symbols,
        message.echo,
        nextUnsolved(message.symbols, message.echo)
      );
    }
    const code = echoTargetCode(message.symbols, message.echo);
    if (code) {
      message.echo = echoHear(message.echo);
      playMessage(message.id + ':echo', code);
      persist();
    }
    return render();
  }
  if (d.pick) {
    // Any letter, any order.
    const [id, rawIndex] = d.pick.split(':');
    const message = state.messages.find((m) => m.id === id);
    if (!message) return;
    const selected = echoSelect(message.symbols, message.echo, Number(rawIndex));
    if (selected === message.echo) return;
    state.decodingId = id;
    message.echo = echoHear(selected);
    const code = echoTargetCode(message.symbols, message.echo);
    if (code) playMessage(id + ':echo', code);
    persist();
    return render();
  }
  if (d.listen) {
    const message = state.messages.find((m) => m.id === d.listen);
    const code = echoTargetCode(message.symbols, message.echo);
    if (code) {
      message.echo = echoHear(message.echo);
      playMessage(message.id + ':echo', code);
      persist();
    }
    return render();
  }
  if (d.skip) {
    const message = state.messages.find((m) => m.id === d.skip);
    message.echo = echoGiveLetter(message.symbols, message.echo);
    if (echoComplete(message.symbols, message.echo)) state.decodingId = null;
    persist();
    return render();
  }
  if (d.showall) {
    const message = state.messages.find((m) => m.id === d.showall);
    message.echo = echoOpenUp(message.echo);
    state.decodingId = null;
    persist();
    return render();
  }
  if (d.retry) {
    const message = state.messages.find((m) => m.id === d.retry);
    message.delivery = 'queued';
    flushQueued();
    return render();
  }
  if (d.mode) {
    state.mode = d.mode;
    persist();
    return render();
  }
  if (d.step) {
    const [key, dir] = d.step.split(':');
    return step(key, Number(dir));
  }
  if (d.sound) {
    state.soundOn = !state.soundOn;
    persist();
    return render();
  }
  if (d.clear) {
    state.messages = [];
    state.decodingId = null;
    persist();
    return render();
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'guideinput') {
    state.guideText = event.target.value;
    const tiles = el('guide').querySelector('.tiles');
    if (!tiles) render();
    else el('guide').innerHTML = guideHtml(), el('guideinput').focus();
  }
  if (event.target.id === 'roominput') {
    state.room = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    event.target.value = state.room;
  }
  if (event.target.id === 'serverinput') {
    state.serverUrl = event.target.value.trim();
    persist();
  }
});

function bind() {
  const key = el('key');
  key.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // Hold onto the pointer, so a slight drift off the key still ends
    // the press here rather than somewhere else.
    try {
      key.setPointerCapture(e.pointerId);
    } catch {
      /* not supported, carry on */
    }
    keyDown();
  });
  key.addEventListener('pointerup', (e) => {
    e.preventDefault();
    try {
      key.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (held !== null) keyUp();
  });
  key.addEventListener('pointercancel', () => {
    if (held !== null) keyUp();
  });
  // A press must never be left open if the app is backgrounded mid-tap.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && held !== null) keyUp();
  });
  key.addEventListener('contextmenu', (e) => e.preventDefault());

  el('chip').addEventListener('click', () => {
    state.roomOpen = !state.roomOpen;
    render();
  });
  el('joinbtn').addEventListener('click', () => (state.connected ? leave() : join()));

  for (const tab of ['key', 'chart', 'settings']) {
    el('tab-' + tab).addEventListener('click', () => {
      player.stop();
      state.playing = null;
      state.tab = tab;
      render();
    });
  }

  el('undo').addEventListener('click', () => {
    state.draft = undoLast(state.draft);
    render();
  });
  let undoHold = null;
  el('undo').addEventListener('pointerdown', () => {
    undoHold = setTimeout(() => {
      state.draft = undoLastLetter(state.draft);
      render();
      undoHold = null;
    }, 400);
  });
  el('undo').addEventListener('pointerup', () => clearTimeout(undoHold));

  el('spacebtn').addEventListener('click', () => {
    state.draft = addWordBreak(state.draft);
    render();
  });
  el('clear').addEventListener('click', () => {
    state.draft = '';
    state.lastRelease = null;
    render();
  });
  el('send').addEventListener('click', send);
  el('stopdecode').addEventListener('click', () => {
    state.decodingId = null;
    render();
  });
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

bind();
render();
// Write once on boot, so a first run leaves a record and any older
// stored shape is migrated straight away rather than on next change.
persist();
if (state.autoJoin && state.room.length >= 3) join();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
