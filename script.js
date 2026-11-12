const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 420;
canvas.height = 720;

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
}

function playSynthTone(freq, duration = 0.15, type = 'sine') {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e){}
}

const LANE_KEYS = ['d', 'f', 'j', 'k'];
const LANE_COLORS = ['#ff007f', '#00f0ff', '#00f0ff', '#ff007f'];
const NOTE_FREQS = [261.63, 329.63, 392.00, 523.25];

// Konfigurasi Kesulitan termasuk Mode IMPOSSIBLE
const DIFF_SETTINGS = {
    easy: { speed: 5, spawnRate: 45, hitWindow: 70, name: 'EASY' },
    medium: { speed: 8, spawnRate: 30, hitWindow: 50, name: 'MEDIUM' },
    hard: { speed: 12, spawnRate: 20, hitWindow: 35, name: 'HARD' },
    impossible: { speed: 15, spawnRate: 12, hitWindow: 22, name: 'IMPOSSIBLE' }
};

let gameState = 'MENU'; // MENU, PLAYING, PAUSED, RESULT
let score = 0;
let combo = 0;
let maxCombo = 0;
let perfects = 0;
let greats = 0;
let misses = 0;
let totalNotes = 0;
let health = 100;
let notes = [];
let particles = [];
let keyStates = [false, false, false, false];
let keyGlows = [0, 0, 0, 0];
let frameCount = 0;
let currentDiff = 'medium';
let currentSong = 'cyber';
let dynamicSpeed = 8;
let dynamicSpawnRate = 30;
let hitText = { text: '', color: '#fff', alpha: 0, scale: 1 };

const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const resultScreen = document.getElementById('result-screen');
const pauseModal = document.getElementById('pause-modal');
const scoreDisplay = document.getElementById('score-display');
const comboDisplay = document.getElementById('combo-display');
const healthBar = document.getElementById('health-bar');

// Track and Diff Selection Event Handlers
document.querySelectorAll('.track-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.track-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        currentSong = card.getAttribute('data-song');
        updateHighScoreDisplay();
    });
});

document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDiff = btn.getAttribute('data-diff');
        updateHighScoreDisplay();
    });
});

function getHighScoreKey() {
    return `neon_rhythm_hs_${currentSong}_${currentDiff}`;
}

function updateHighScoreDisplay() {
    const hs = localStorage.getItem(getHighScoreKey()) || 0;
    document.getElementById('high-score-val').innerText = hs;
}
updateHighScoreDisplay();

// Navigation Controls
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);
document.getElementById('pause-btn').addEventListener('click', pauseGame);
document.getElementById('resume-btn').addEventListener('click', resumeGame);
document.getElementById('restart-btn').addEventListener('click', () => {
    pauseModal.classList.add('hidden');
    startGame();
});
document.getElementById('quit-btn').addEventListener('click', () => {
    pauseModal.classList.add('hidden');
    showMenu();
});

// Keyboard Control
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    
    if ((key === 'escape' || key === 'p') && (gameState === 'PLAYING' || gameState === 'PAUSED')) {
        if (gameState === 'PLAYING') pauseGame();
        else if (gameState === 'PAUSED') resumeGame();
        return;
    }

    if (gameState !== 'PLAYING') return;
    const laneIndex = LANE_KEYS.indexOf(key);
    if (laneIndex !== -1 && !keyStates[laneIndex]) {
        keyStates[laneIndex] = true;
        keyGlows[laneIndex] = 1.0;
        checkHit(laneIndex);
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    const laneIndex = LANE_KEYS.indexOf(key);
    if (laneIndex !== -1) {
        keyStates[laneIndex] = false;
    }
});

// Touch Screen Support for Mobile
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameState !== 'PLAYING') return;
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < e.touches.length; i++) {
        const touchX = e.touches[i].clientX - rect.left;
        const laneWidth = canvas.width / 4;
        const laneIndex = Math.floor(touchX / laneWidth);
        if (laneIndex >= 0 && laneIndex < 4) {
            keyGlows[laneIndex] = 1.0;
            checkHit(laneIndex);
        }
    }
});

function startGame() {
    initAudio();
    
    score = 0;
    combo = 0;
    maxCombo = 0;
    perfects = 0;
    greats = 0;
    misses = 0;
    health = 100;
    totalNotes = 0;
    notes = [];
    particles = [];
    frameCount = 0;

    const base = DIFF_SETTINGS[currentDiff];
    dynamicSpeed = base.speed;
    dynamicSpawnRate = base.spawnRate;

    healthBar.style.width = '100%';
    healthBar.style.background = 'linear-gradient(90deg, #ff007f, #00f0ff)';

    menuScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    pauseModal.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    gameState = 'PLAYING';
    requestAnimationFrame(gameLoop);
}

function pauseGame() {
    if (gameState !== 'PLAYING') return;
    gameState = 'PAUSED';
    pauseModal.classList.remove('hidden');
}

function resumeGame() {
    if (gameState !== 'PAUSED') return;
    gameState = 'PLAYING';
    pauseModal.classList.add('hidden');
    requestAnimationFrame(gameLoop);
}

function showMenu() {
    gameState = 'MENU';
    resultScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    updateHighScoreDisplay();
}

function spawnNote() {
    const lane = Math.floor(Math.random() * 4);
    notes.push({
        lane: lane,
        y: -60,
        width: canvas.width / 4,
        height: 25,
        hit: false
    });
    totalNotes++;
}

function createParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            size: Math.random() * 5 + 2,
            color: color,
            alpha: 1
        });
    }
}

function triggerHitText(text, color) {
    hitText = { text: text, color: color, alpha: 1.0, scale: 1.4 };
}

function modifyHealth(amount) {
    health = Math.max(0, Math.min(100, health + amount));
    healthBar.style.width = health + '%';
    
    if (health < 30) {
        healthBar.style.background = '#ff3333';
    } else {
        healthBar.style.background = 'linear-gradient(90deg, #ff007f, #00f0ff)';
    }

    if (health <= 0) {
        endGame(true);
    }
}

function checkHit(lane) {
    const hitZoneY = canvas.height - 90;
    const cfg = DIFF_SETTINGS[currentDiff];
    let hitFound = false;

    for (let i = 0; i < notes.length; i++) {
        let note = notes[i];
        if (note.lane === lane && !note.hit) {
            const dist = Math.abs(note.y - hitZoneY);
            
            if (dist < cfg.hitWindow) {
                hitFound = true;
                note.hit = true;
                
                let points = 0;
                if (dist < cfg.hitWindow * 0.35) {
                    points = 300;
                    perfects++;
                    modifyHealth(2);
                    triggerHitText('PERFECT', '#00f0ff');
                    playSynthTone(NOTE_FREQS[lane] * 1.2, 0.1, 'triangle');
                } else {
                    points = 100;
                    greats++;
                    modifyHealth(1);
                    triggerHitText('GREAT', '#ff007f');
                    playSynthTone(NOTE_FREQS[lane], 0.1, 'sine');
                }

                combo++;
                if (combo > maxCombo) maxCombo = combo;
                score += points + (combo * 10);
                
                createParticles((lane + 0.5) * (canvas.width / 4), hitZoneY, LANE_COLORS[lane]);
                break;
            }
        }
    }

    if (!hitFound) {
        playSynthTone(100, 0.2, 'sawtooth');
    }
}

function update() {
    frameCount++;

    // Dynamic Difficulty Scaling (Makin lama makin cepat & padat / adrenalin naik)
    // Setiap 300 frame (~5 detik), kecepatan naik sedikit dan jeda spawn memadat
    if (frameCount % 300 === 0) {
        dynamicSpeed += 0.3;
        if (dynamicSpawnRate > 8) {
            dynamicSpawnRate -= 1;
        }
    }

    if (frameCount % Math.max(8, Math.floor(dynamicSpawnRate)) === 0) {
        spawnNote();
    }

    const hitZoneY = canvas.height - 90;
    const cfg = DIFF_SETTINGS[currentDiff];

    for (let i = notes.length - 1; i >= 0; i--) {
        let note = notes[i];
        note.y += dynamicSpeed; // Menggunakan kecepatan progresif

        if (note.y > hitZoneY + cfg.hitWindow && !note.hit) {
            notes.splice(i, 1);
            combo = 0;
            misses++;
            modifyHealth(-12);
            triggerHitText('MISS', '#ff3333');
            playSynthTone(80, 0.2, 'square');
            continue;
        }

        if (note.hit) {
            notes.splice(i, 1);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.03;
        if (p.alpha <= 0) particles.splice(i, 1);
    }

    for (let i = 0; i < 4; i++) {
        if (keyGlows[i] > 0) keyGlows[i] -= 0.08;
    }

    if (hitText.alpha > 0) {
        hitText.alpha -= 0.03;
        if (hitText.scale > 1.0) hitText.scale -= 0.02;
    }

    scoreDisplay.innerText = score.toString().padStart(6, '0');
    comboDisplay.innerText = combo + 'x Combo';

    if (frameCount > 1800 && notes.length === 0) {
        endGame(false);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const laneW = canvas.width / 4;
    const hitZoneY = canvas.height - 90;

    for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.strokeRect(i * laneW, 0, laneW, canvas.height);

        if (keyGlows[i] > 0) {
            ctx.fillStyle = LANE_COLORS[i];
            ctx.globalAlpha = keyGlows[i] * 0.25;
            ctx.fillRect(i * laneW, 0, laneW, canvas.height);
            ctx.globalAlpha = 1.0;
        }
    }

    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f0ff';
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(0, hitZoneY, canvas.width, 6);
    ctx.shadowBlur = 0;

    for (let note of notes) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = LANE_COLORS[note.lane];
        ctx.fillStyle = LANE_COLORS[note.lane];
        
        const x = note.lane * laneW + 6;
        const w = laneW - 12;
        ctx.beginPath();
        ctx.roundRect(x, note.y, w, note.height, 8);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    for (let p of particles) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    if (hitText.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = hitText.alpha;
        ctx.fillStyle = hitText.color;
        ctx.font = `900 ${28 * hitText.scale}px 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.shadowColor = hitText.color;
        ctx.fillText(hitText.text, canvas.width / 2, canvas.height / 2 - 40);
        ctx.restore();
    }
}

function gameLoop() {
    if (gameState !== 'PLAYING') return;
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function endGame(isFailed = false) {
    gameState = 'RESULT';
    gameScreen.classList.add('hidden');
    resultScreen.classList.remove('hidden');

    const totalHits = perfects + greats + misses;
    const accuracy = totalHits > 0 ? Math.round(((perfects + greats * 0.5) / totalHits) * 100) : 0;

    document.getElementById('res-score').innerText = score;
    document.getElementById('res-combo').innerText = maxCombo + 'x';
    document.getElementById('res-accuracy').innerText = accuracy + '%';
    document.getElementById('res-hits').innerText = `${perfects} / ${greats} / ${misses}`;

    const titleEl = document.getElementById('result-title');
    const gradeEl = document.getElementById('final-grade');

    let grade = 'F';
    let gradeClass = 'grade-f';
    if (accuracy >= 95) { grade = 'S'; gradeClass = 'grade-s'; }
    else if (accuracy >= 85) { grade = 'A'; gradeClass = 'grade-a'; }
    else if (accuracy >= 70) { grade = 'B'; gradeClass = 'grade-b'; }
    else if (accuracy >= 50) { grade = 'C'; gradeClass = 'grade-c'; }

    if (accuracy >= 85) {
        titleEl.innerText = 'PERFORMA GEMILANG!';
        titleEl.style.color = '#00f0ff';
    } else {
        titleEl.innerText = 'TETAP SEMANGAT!';
        titleEl.style.color = '#ff007f';
    }

    gradeEl.innerText = grade;
    gradeEl.className = 'grade ' + gradeClass;

    const hsKey = getHighScoreKey();
    const prevHS = Number(localStorage.getItem(hsKey)) || 0;
    if (score > prevHS) {
        localStorage.setItem(hsKey, score);
    }
    updateHighScoreDisplay();
}