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
    // si el navegador no deja, no pasa nada
  }
}

// match bonito
function sfxCombo() {
  playTone(520, 0.11, 0.28);
  setTimeout(() => playTone(610, 0.11, 0.25), 90);
  setTimeout(() => playTone(720, 0.12, 0.22), 180);
}

// subir nivel
function sfxLevelUp() {
  playTone(420, 0.12, 0.28, "triangle");
  setTimeout(() => playTone(560, 0.14, 0.25, "triangle"), 120);
  setTimeout(() => playTone(720, 0.16, 0.22, "triangle"), 240);
}

// movimiento correcto
function sfxMoveOk() {
  playTone(340, 0.08, 0.22, "square");
}

// movimiento malo
function sfxMoveBad() {
  playTone(200, 0.12, 0.25, "sawtooth");
  setTimeout(() => playTone(130, 0.12, 0.2, "sine"), 80);
}

// =====================================================
// ====== ELEMENTOS DEL DOM ============================
// =====================================================
const board = document.getElementById("board");
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
// ====== CONFIG =======================================
// =====================================================
// emojis cute que pediste 🧸, perrito, tulipán, pintura, corazón, nota musical
const emojis = ["🧸", "🐶", "🌷", "🎨", "❤️", "🎵"];
const rows = 8;
const cols = 8;
const candyTypes = emojis.length;

// =====================================================
// ====== ESTADO =======================================
// =====================================================
// IMPORTANTE: arrancamos leyendo lo que trajo Flask
let score = Number(scoreEl?.textContent || 0);
let level = Number(levelEl?.textContent || 1);
let lastSentScore = score; // para no disparar /api/score apenas arranca

let grid = [];
let tiles = [];
let dragged = null;
let target = null;

// =====================================================
// ====== UTILS UI =====================================
// =====================================================
function playSafe(audioEl, fallbackFn) {
  if (audioEl) {
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {
      if (fallbackFn) fallbackFn();
    });
  } else if (fallbackFn) {
    fallbackFn();
  }
}

function showCelebrate() {
  if (!celebrateEl) return;
  celebrateEl.classList.remove("hidden");
  setTimeout(() => {
    celebrateEl.classList.add("hidden");
  }, 900);
}

function showLevelToastUI(lvl) {
  if (!levelToast) return;
  levelToastText.textContent = `Nivel ${lvl} 💗`;
  levelToast.classList.remove("hidden");
  setTimeout(() => {
    levelToast.classList.add("hidden");
  }, 1400);
}

// =====================================================
// ====== NIVELES ======================================
// =====================================================
function getLevelByScore(points) {
  // puedes modificar las metas aquí
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
    // sonido de nivel (intenta audio <audio>, si no, web audio)
    playSafe(sfxLevel, sfxLevelUp);
    showLevelToastUI(level);
    // guardamos el progreso porque subió de nivel
    saveProgress(score, level);
  }
}

// =====================================================
// ====== PROGRESO (guardar en backend) ================
// =====================================================
async function saveProgress(score, level) {
  try {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, level }),
    });
  } catch (err) {
    console.log("No se pudo guardar progreso:", err);
  }
}

// =====================================================
// ====== SCORE (ranking) ==============================
// =====================================================
async function sendScore(points) {
  try {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
    const data = await res.json();
    // si tu backend está en modo "solo guardo si es mejor"
    if (data.saved && bestEl) {
      bestEl.textContent = points;
    }
  } catch (err) {
    console.log("No se pudo enviar puntaje (offline?):", err);
  }
}

// =====================================================
// ====== TABLERO ======================================
// =====================================================
function randomCandy() {
  return Math.floor(Math.random() * candyTypes);
}

function createTile(r, c, val) {
  const div = document.createElement("div");
  div.className = `tile b-${val} fall`;
  div.dataset.row = r;
  div.dataset.col = c;
  div.dataset.val = val;
  div.draggable = true;
  div.textContent = emojis[val];

  div.addEventListener("dragstart", onDragStart);
  div.addEventListener("dragover", onDragOver);
  div.addEventListener("drop", onDrop);
  div.addEventListener("dragend", onDragEnd);

  return div;
}

function createBoard() {
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
// ====== DRAG & DROP ==================================
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
    // movimiento malo
    playSafe(sfxInvalid, sfxMoveBad);
    dragged = null;
    target = null;
    return;
  }

  swap(r1, c1, r2, c2);

  const matched = findMatches();
  if (matched.length === 0) {
    // no sirvió, lo regreso
    swap(r1, c1, r2, c2);
    playSafe(sfxInvalid, sfxMoveBad);
  } else {
    // movimiento correcto
    sfxMoveOk();
    removeMatches();
  }

  dragged = null;
  target = null;
}

function swap(r1, c1, r2, c2) {
  // datos
  [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];

  // DOM
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
// ====== MATCHES ======================================
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

function removeMatches() {
  const matches = findMatches();
  if (matches.length === 0) return;

  // sonido de match (usa <audio> o web audio)
  playSafe(sfxMatch, sfxCombo);

  // festejo si es un combo grande
  if (matches.length >= 4) {
    showCelebrate();
  }

  // sumamos puntos
  score += matches.length * 10;
  if (scoreEl) scoreEl.textContent = score;

  // checar nivel
  maybeLevelUp();

  // guardar progreso SIEMPRE que sumemos puntos
  saveProgress(score, level);

  // mandar al ranking solo cada 100 pts para no spamear
  if (score - lastSentScore >= 100) {
    sendScore(score);
    lastSentScore = score;
  }

  // marcar como null y animar
  matches.forEach(({ r, c }) => {
    grid[r][c] = null;
    const tile = tiles[r][c];
    tile.classList.add("boom");
  });

  setTimeout(() => {
    collapseAndRefill();
    // por si se generan nuevos matches
    setTimeout(removeMatches, 160);
  }, 260);
}

// =====================================================
// ====== COLAPSO / REFILL =============================
// =====================================================
function collapseAndRefill() {
  for (let c = 0; c < cols; c++) {
    const col = [];
    // recolectar de abajo hacia arriba
    for (let r = rows - 1; r >= 0; r--) {
      if (grid[r][c] !== null) {
        col.push(grid[r][c]);
      }
    }

    let rIdx = rows - 1;
    // poner los que sí había
    for (let v of col) {
      grid[rIdx][c] = v;
      const tile = tiles[rIdx][c];
      tile.className = `tile b-${v}`;
      tile.textContent = emojis[v];
      tile.style.opacity = "1";
      rIdx--;
    }

    // rellenar lo que falta
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
// ====== INIT =========================================
// =====================================================
createBoard();
