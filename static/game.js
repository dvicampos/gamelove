// =====================================================
// ====== SONIDOS SUAVES (Web Audio + fallback) ========
// =====================================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  return audioCtx;
}

function playTone(freq = 440, duration = 0.15, volume = 0.25, type = "sine") {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    // navegador no deja
  }
}

function sfxCombo() {
  playTone(520, 0.11, 0.28);
  setTimeout(() => playTone(610, 0.11, 0.25), 90);
  setTimeout(() => playTone(720, 0.12, 0.22), 180);
}

function sfxLevelUp() {
  playTone(420, 0.12, 0.28, "triangle");
  setTimeout(() => playTone(560, 0.14, 0.25, "triangle"), 120);
  setTimeout(() => playTone(720, 0.16, 0.22, "triangle"), 240);
}

function sfxMoveOk() {
  playTone(340, 0.08, 0.22, "square");
}

function sfxMoveBad() {
  playTone(200, 0.12, 0.25, "sawtooth");
  setTimeout(() => playTone(130, 0.12, 0.2, "sine"), 80);
}

// =====================================================
// DOM
// =====================================================
const board = document.getElementById("board");
if (!board) {
  console.warn("No hay #board en este template");
}

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const bestEl = document.getElementById("best");
const levelBox = document.getElementById("level-box");

const sfxMatch = document.getElementById("sfx-match");
const sfxInvalid = document.getElementById("sfx-invalid");
const sfxLevel = document.getElementById("sfx-level");

const celebrateEl = document.getElementById("celebrate");
const levelToast = document.getElementById("level-toast");
const levelToastText = document.getElementById("level-toast-text");

// =====================================================
// CONFIG
// =====================================================
const emojis = ["🧸", "🐶", "🌷", "🎨", "❤️", "🎵"];
const rows = 8;
const cols = 8;
const candyTypes = emojis.length;

// estado
let score = Number(scoreEl?.textContent || 0);
let level = Number(levelEl?.textContent || 1);
let lastSentScore = score;

let grid = [];
let tiles = [];
let dragged = null;
let target = null;

// =====================================================
// UTILS UI
// =====================================================
function playSafe(audioEl, fallbackFn) {
  if (audioEl) {
    audioEl.currentTime = 0;
    audioEl.play().catch(() => fallbackFn && fallbackFn());
  } else if (fallbackFn) {
    fallbackFn();
  }
}

function showCelebrate() {
  if (!celebrateEl) return;
  celebrateEl.classList.remove("hidden");
  setTimeout(() => celebrateEl.classList.add("hidden"), 900);
}

function showLevelToastUI(lvl) {
  if (!levelToast) return;
  levelToastText.textContent = `Nivel ${lvl} 💗`;
  levelToast.classList.remove("hidden");
  setTimeout(() => levelToast.classList.add("hidden"), 1400);
}

// =====================================================
// NIVELES
// =====================================================
function getLevelByScore(points) {
  if (points >= 1500) return 5;
  if (points >= 1000) return 4;
  if (points >= 600) return 3;
  if (points >= 300) return 2;
  return 1;
}

function maybeLevelUp() {
  const newLevel = getLevelByScore(score);
  if (newLevel !== level) {
    level = newLevel;
    if (levelEl) levelEl.textContent = level;
    if (levelBox) {
      levelBox.classList.remove("level-pop");
      void levelBox.offsetWidth;
      levelBox.classList.add("level-pop");
    }
    playSafe(sfxLevel, sfxLevelUp);
    showLevelToastUI(level);
    saveProgress(score, level);
  }
}

// =====================================================
// PROGRESO BACKEND (tolerante)
// =====================================================
async function saveProgress(score, level) {
  try {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, level }),
    });
  } catch (err) {
    // si no existe ruta, no pasa nada
  }
}

async function sendScore(points) {
  try {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
    const data = await res.json();
    if (data.saved && bestEl) {
      bestEl.textContent = points;
    }
  } catch (err) {
    console.log("No se pudo enviar puntaje:", err);
  }
}

// =====================================================
// TABLERO
// =====================================================
function randomCandy() {
  return Math.floor(Math.random() * candyTypes);
}

function attachTouch(tile) {
  let startX = 0, startY = 0;

  tile.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    dragged = tile;
    tile.classList.add("is-dragging");
  }, { passive: true });

  tile.addEventListener("touchend", (e) => {
    tile.classList.remove("is-dragging");
    if (!dragged) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    let targetRow = Number(tile.dataset.row);
    let targetCol = Number(tile.dataset.col);

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 15) targetCol += 1;
      else if (dx < -15) targetCol -= 1;
    } else {
      if (dy > 15) targetRow += 1;
      else if (dy < -15) targetRow -= 1;
    }

    if (
      targetRow >= 0 && targetRow < rows &&
      targetCol >= 0 && targetCol < cols
    ) {
      target = tiles[targetRow][targetCol];
      onDragEnd({}); // reusar lógica
    } else {
      playSafe(sfxInvalid, sfxMoveBad);
      dragged = null;
      target = null;
    }
  });
}

function createTile(r, c, val) {
  const div = document.createElement("div");
  div.className = `tile b-${val} fall`;
  div.dataset.row = r;
  div.dataset.col = c;
  div.dataset.val = val;
  div.draggable = true;
  div.textContent = emojis[val];

  // drag
  div.addEventListener("dragstart", onDragStart);
  div.addEventListener("dragover", onDragOver);
  div.addEventListener("drop", onDrop);
  div.addEventListener("dragend", onDragEnd);

  // touch
  attachTouch(div);

  return div;
}

function createBoard() {
  if (!board) return;
  board.innerHTML = "";
  grid = new Array(rows);
  tiles = new Array(rows);

  for (let r = 0; r < rows; r++) {
    grid[r] = new Array(cols);
    tiles[r] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      const val = randomCandy();
      grid[r][c] = val;
      const tile = createTile(r, c, val);
      board.appendChild(tile);
      tiles[r][c] = tile;
    }
  }

  // limpiar matches iniciales
  setTimeout(removeMatches, 150);
}

// =====================================================
// DRAG & DROP
// =====================================================
function onDragStart(e) {
  dragged = e.target;
  dragged.classList.add("is-dragging");
}
function onDragOver(e) {
  e.preventDefault();
}
function onDrop(e) {
  target = e.target;
}
function onDragEnd(e) {
  if (dragged) dragged.classList.remove("is-dragging");
  if (!dragged || !target) {
    dragged = null;
    target = null;
    return;
  }

  const r1 = +dragged.dataset.row;
  const c1 = +dragged.dataset.col;
  const r2 = +target.dataset.row;
  const c2 = +target.dataset.col;

  const isAdjacent =
    (r1 === r2 && Math.abs(c1 - c2) === 1) ||
    (c1 === c2 && Math.abs(r1 - r2) === 1);

  if (!isAdjacent) {
    playSafe(sfxInvalid, sfxMoveBad);
    dragged = null;
    target = null;
    return;
  }

  swap(r1, c1, r2, c2);

  const matched = findMatches();
  if (matched.length === 0) {
    swap(r1, c1, r2, c2);
    playSafe(sfxInvalid, sfxMoveBad);
  } else {
    sfxMoveOk();
    removeMatches();
  }

  dragged = null;
  target = null;
}

// =====================================================
// SWAP
// =====================================================
function swap(r1, c1, r2, c2) {
  [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];

  const t1 = tiles[r1][c1];
  const t2 = tiles[r2][c2];

  const val1 = grid[r1][c1];
  const val2 = grid[r2][c2];

  t1.className = `tile b-${val1}`;
  t1.textContent = emojis[val1];
  t1.dataset.val = val1;

  t2.className = `tile b-${val2}`;
  t2.textContent = emojis[val2];
  t2.dataset.val = val2;
}

// =====================================================
// BUSCAR MATCHES
// =====================================================
function findMatches() {
  const toRemove = [];

  // filas
  for (let r = 0; r < rows; r++) {
    let count = 1;
    for (let c = 1; c < cols; c++) {
      if (grid[r][c] === grid[r][c - 1]) {
        count++;
      } else {
        if (count >= 3) {
          for (let k = 0; k < count; k++) {
            toRemove.push({ r, c: c - 1 - k });
          }
        }
        count = 1;
      }
    }
    if (count >= 3) {
      for (let k = 0; k < count; k++) {
        toRemove.push({ r, c: cols - 1 - k });
      }
    }
  }

  // columnas
  for (let c = 0; c < cols; c++) {
    let count = 1;
    for (let r = 1; r < rows; r++) {
      if (grid[r][c] === grid[r - 1][c]) {
        count++;
      } else {
        if (count >= 3) {
          for (let k = 0; k < count; k++) {
            toRemove.push({ r: r - 1 - k, c });
          }
        }
        count = 1;
      }
    }
    if (count >= 3) {
      for (let k = 0; k < count; k++) {
        toRemove.push({ r: rows - 1 - k, c });
      }
    }
  }

  return toRemove;
}

// =====================================================
// ELIMINAR MATCHES
// =====================================================
function removeMatches() {
  const matches = findMatches();
  if (matches.length === 0) return;

  playSafe(sfxMatch, sfxCombo);

  if (matches.length >= 4) {
    showCelebrate();
  }

  // sumar puntos
  score += matches.length * 10;
  if (scoreEl) scoreEl.textContent = score;

  maybeLevelUp();
  saveProgress(score, level);

  if (score - lastSentScore >= 100) {
    sendScore(score);
    lastSentScore = score;
  }

  // animación escalonada
  matches.forEach(({ r, c }, idx) => {
    grid[r][c] = null;
    const tile = tiles[r][c];
    tile.style.animationDelay = (idx * 25) + "ms";
    tile.classList.add("boom");
  });

  setTimeout(() => {
    collapseAndRefill();

    // checar si se generaron nuevos matches
    setTimeout(() => {
      const more = findMatches();
      if (more.length > 0) {
        removeMatches();
      }
    }, 160);

  }, 260);
}

// =====================================================
// COLAPSO / REFILL
// =====================================================
function collapseAndRefill() {
  for (let c = 0; c < cols; c++) {
    const col = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (grid[r][c] !== null) {
        col.push(grid[r][c]);
      }
    }

    let rIdx = rows - 1;
    for (let v of col) {
      grid[rIdx][c] = v;
      const tile = tiles[rIdx][c];
      tile.className = `tile b-${v}`;
      tile.textContent = emojis[v];
      tile.style.opacity = "1";
      rIdx--;
    }

    while (rIdx >= 0) {
      const newVal = randomCandy();
      grid[rIdx][c] = newVal;
      const tile = tiles[rIdx][c];
      tile.className = `tile b-${newVal} fall`;
      tile.textContent = emojis[newVal];
      tile.style.opacity = "1";
      rIdx--;
    }
  }
}

// =====================================================
// INIT
// =====================================================
if (board) {
  createBoard();
}
