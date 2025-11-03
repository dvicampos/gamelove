const board = document.getElementById("board");
const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const levelBox = document.getElementById("level-box");

const sfxMatch = document.getElementById("sfx-match");
const sfxInvalid = document.getElementById("sfx-invalid");
const sfxLevel = document.getElementById("sfx-level");

const celebrateEl = document.getElementById("celebrate");
const levelToast = document.getElementById("level-toast");
const levelToastText = document.getElementById("level-toast-text");

// emojis cute
const emojis = ["🧸", "🐶", "🌷", "🎨", "❤️", "🎵"];
const rows = 8;
const cols = 8;
const candyTypes = emojis.length;

let grid = [];
let tiles = [];
let score = 0;
let level = 1;
let lastSentScore = 0;
let dragged = null;
let target = null;

// ----- helpers UI -----
function playSafe(audio) {
  if (!audio) return;
  audio.play().catch(() => {});
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

// ----- niveles -----
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
    levelEl.textContent = level;
    if (levelBox) {
      levelBox.classList.remove("level-pop");
      void levelBox.offsetWidth;
      levelBox.classList.add("level-pop");
    }
    playSafe(sfxLevel);
    showLevelToastUI(level);
  }
}

// ----- tablero -----
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

  setTimeout(removeMatches, 150);
}

// ----- drag & drop -----
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
    playSafe(sfxInvalid);
    dragged = null;
    target = null;
    return;
  }

  swap(r1, c1, r2, c2);

  const matched = findMatches();
  if (matched.length === 0) {
    // revert
    swap(r1, c1, r2, c2);
    playSafe(sfxInvalid);
  } else {
    removeMatches();
  }

  dragged = null;
  target = null;
}

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

// ----- matches -----
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

  // sonido match
  playSafe(sfxMatch);

  // si es un buen combo (4 o más) hacemos festejo
  if (matches.length >= 4) {
    showCelebrate();
  }

  score += matches.length * 10;
  scoreEl.textContent = score;
  maybeLevelUp();

  if (score - lastSentScore >= 100) {
    sendScore(score);
    lastSentScore = score;
  }

  // marcar como null en grid + animar
  matches.forEach(({ r, c }) => {
    grid[r][c] = null;
    const tile = tiles[r][c];
    tile.classList.add("boom");
  });

  setTimeout(() => {
    collapseAndRefill();
    setTimeout(removeMatches, 160);
  }, 260);
}

// colapso por columna (bueno)
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

async function sendScore(points) {
  try {
    await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
  } catch (err) {
    console.log("No se pudo enviar puntaje:", err);
  }
}

createBoard();
