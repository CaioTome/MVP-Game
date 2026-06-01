const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Configuração lógica de resolução interna constante para manter a proporção da física
const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// Estados do Jogo
let gameActive = false;
let leverActivated = false;
let buttonActivated = false;
let doorOpened = false;
let isVictorious = false;

// Estado do Nível e Transições
let currentLevelIndex = 0;
let levelTransitionTimer = 0;
let levelNameToShow = "";
let screenShakeTime = 0;

// Entidades e plataformas físicas carregadas dinamicamente
const platforms = [];
const gates = [];
const boxes = [];
const fans = [];
const spikes = [];
const snakes = [];
let pressurePlate = null;

const waterArea = { x: 0, y: 0, w: 0, h: 0 };
const door = { x: 0, y: 0, w: 0, h: 0, color: '#ef4444' };
const highButton = { x: 0, y: 0, w: 0, h: 0, activated: false };
const waterLever = { x: 0, y: 0, w: 0, h: 0, activated: false };
const PULLED_BOX_OFFSET = 8;
const PULLED_BOX_PICKUP_RANGE = 95;
const PULLED_BOX_FOLLOW_STRENGTH = 0.75;
const CAPYBARA_BUOYANCY = 0.22;
const CAPYBARA_FLOAT_SPEED = 1.6;
const CAPYBARA_SURFACE_DEPTH = 6;

const HUD_CLASSES = {
    doorOpen: "text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30",
    doorClosed: "text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30",
    soundOn: "bg-stone-700 hover:bg-stone-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-md",
    soundOff: "bg-stone-800 hover:bg-stone-750 text-stone-400 text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-inner border border-stone-850"
};

const SIZE_KEYS = {
    width: 'width',
    height: 'height',
    w: 'w',
    h: 'h'
};

function getWidth(entity) {
    return entity[SIZE_KEYS.width] ?? entity[SIZE_KEYS.w];
}

function getHeight(entity) {
    return entity[SIZE_KEYS.height] ?? entity[SIZE_KEYS.h];
}

function getCenter(entity) {
    return {
        x: entity.x + getWidth(entity) / 2,
        y: entity.y + getHeight(entity) / 2
    };
}

function resetArray(target, items) {
    target.length = 0;
    items.forEach(item => target.push(item));
}

function copyRect(target, source) {
    target.x = source.x;
    target.y = source.y;
    target.w = source.w;
    target.h = source.h;
}

function intersects(a, b) {
    return (
        a.x < b.x + getWidth(b) &&
        a.x + getWidth(a) > b.x &&
        a.y < b.y + getHeight(b) &&
        a.y + getHeight(a) > b.y
    );
}

function isNearRect(entity, rect, padding) {
    return (
        entity.x + getWidth(entity) + padding > rect.x &&
        entity.x - padding < rect.x + getWidth(rect) &&
        entity.y + getHeight(entity) + padding > rect.y &&
        entity.y - padding < rect.y + getHeight(rect)
    );
}

function distanceBetweenCenters(a, b) {
    const centerA = getCenter(a);
    const centerB = getCenter(b);
    return Math.hypot(centerA.x - centerB.x, centerA.y - centerB.y);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getPulledBoxTarget(character, box) {
    const targetX = character.x + character.width / 2 - box.w / 2;
    const targetY = character.y + character.height + PULLED_BOX_OFFSET;

    return { x: targetX, y: targetY };
}

function isSpikeActive(spike) {
    return !(spike.disabledByLever && leverActivated);
}

// Estado das teclas de controle de teclado
const keys = {
    // Capivara (WASD)
    w: false, a: false, s: false, d: false, ' ': false,
    // Tuiuiú (Setas)
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    Enter: false
};

// Estado dos botões de toque para dispositivos móveis
const touchState = {
    capyUp: false, capyDown: false, capyLeft: false, capyRight: false,
    tuiUp: false, tuiDown: false, tuiLeft: false, tuiRight: false
};

// Sistema de Efeitos Sonoros Dinâmicos (Web Audio API)
class SoundFX {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    playJump() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(320, this.ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    playFlap() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.12);

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
    }

    playBreak() {
        if (this.muted) return;
        this.init();
        
        const bufferSize = this.ctx.sampleRate * 0.25;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 350;
        filter.Q.value = 1.2;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    playSplash() {
        if (this.muted) return;
        this.init();
        
        const bufferSize = this.ctx.sampleRate * 0.3;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(700, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.3);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    playTrigger() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(550, this.ctx.currentTime);
        osc.frequency.setValueAtTime(850, this.ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    playPlateActivate() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, this.ctx.currentTime);
        osc.frequency.setValueAtTime(294, this.ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    playPlateDeactivate() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(294, this.ctx.currentTime);
        osc.frequency.setValueAtTime(220, this.ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    playVictory() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C Major
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.1);

            gain.gain.setValueAtTime(0.15, now + idx * 0.1);
            gain.gain.setValueAtTime(0.15, now + idx * 0.1 + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.3);

            osc.start(now + idx * 0.1);
            osc.stop(now + idx * 0.1 + 0.3);
        });
    }
}
const soundFX = new SoundFX();

// Função global para mutar o som chamada pelo HTML
function toggleMute() {
    soundFX.muted = !soundFX.muted;
    const btn = document.getElementById('btn-mute');
    if (soundFX.muted) {
        btn.textContent = '🔇 Mudo';
        btn.className = HUD_CLASSES.soundOff;
    } else {
        btn.textContent = '🔊 Som';
        btn.className = HUD_CLASSES.soundOn;
    }
}

// Sistema de Cutscene Inicial
const cutsceneFrames = [
    {
        title: 'Fuga do Pantanal',
        text: 'Uma queimada feroz e uma caçada cruel forçam a Capivara e o Tuiuiú a deixar o lar no Pantanal. Eles correm juntos em busca de um refúgio seguro.',
        hint: 'Atravessar a fumaça e escapar dos caçadores é apenas o início da jornada.'
    },
    {
        title: 'Rumo ao Bioparque',
        text: 'No meio do pântano, os dois encontram uma trilha esquecida que leva ao Bioparque de Campo Grande, MS. É a sua esperança de proteção e cura.',
        hint: 'O caminho não é fácil, mas o refúgio está próximo se vocês se ajudarem.'
    },
    {
        title: 'O Templo Armadilhado',
        text: 'Antes do bioparque, há um templo antigo cheio de armadilhas e mecanismos traiçoeiros para impedir invasores.',
        hint: 'Capivara ativa alavancas e Tuiuiú alcança os botões altos. Trabalho em equipe é a chave.'
    },
    {
        title: 'Proteja o Refúgio',
        text: 'Os caçadores querem invadir o santuário. Vocês precisam resolver as armadilhas, chegar ao bioparque e impedir que o templo seja invadido.',
        hint: 'Juntos, a Capivara e o Tuiuiú podem salvar o bioparque e o Pantanal.'
    }
];
let currentCutsceneIndex = 0;

function showCutsceneFrame(index) {
    const frame = cutsceneFrames[index];
    const titleEl = document.getElementById('cutsceneTitle');
    const textEl = document.getElementById('cutsceneText');
    const hintEl = document.getElementById('cutsceneHint');
    const buttonEl = document.getElementById('cutsceneButton');
    const overlay = document.getElementById('tutorialOverlay');
    if (!frame || !titleEl || !textEl || !hintEl || !buttonEl || !overlay) return;

    // Reiniciar animações CSS brevemente para reaplicar efeitos
    [titleEl, textEl, hintEl].forEach(el => {
        el.style.animation = 'none';
        setTimeout(() => { el.style.animation = ''; }, 10);
    });

    titleEl.textContent = frame.title;
    textEl.textContent = frame.text;
    hintEl.innerHTML = `<strong class="text-amber-300">🎯 Missão:</strong> ${frame.hint}`;
    buttonEl.textContent = index === cutsceneFrames.length - 1 ? 'Começar Desafio 🚀' : 'Avançar';

    // Garantir que o overlay esteja visível
    overlay.classList.remove('hidden');

    // Animar caracteres: capivara da esquerda, tuiuiú da direita
    const capyEl = overlay.querySelector('.cutscene-character.capy');
    const tuiEl = overlay.querySelector('.cutscene-character.tuiu');
    [capyEl, tuiEl].forEach(el => {
        if (!el) return;
        el.classList.remove('move-in-left', 'move-in-right');
        void el.offsetWidth; // forçar reflow
    });
    if (capyEl) capyEl.classList.add('move-in-left');
    if (tuiEl) tuiEl.classList.add('move-in-right');

    // Pulso sutil do overlay para impacto visual
    overlay.classList.remove('overlay-pulse');
    void overlay.offsetWidth;
    overlay.classList.add('overlay-pulse');
    setTimeout(() => overlay.classList.remove('overlay-pulse'), 900);
}

function nextCutscene() {
    if (currentCutsceneIndex < cutsceneFrames.length - 1) {
        currentCutsceneIndex += 1;
        showCutsceneFrame(currentCutsceneIndex);
        return;
    }

    const overlay = document.getElementById('tutorialOverlay');
    if (overlay) overlay.classList.add('hidden');
    gameActive = true;
    loadLevel(0);
}

function skipCutscene() {
    const overlay = document.getElementById('tutorialOverlay');
    if (overlay) overlay.classList.add('hidden');
    gameActive = true;
    loadLevel(0);
}

function initializeCutscene() {
    currentCutsceneIndex = 0;
    const overlay = document.getElementById('tutorialOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
    showCutsceneFrame(0);
    gameActive = false;
}

// Sistema de Partículas (Estética Dinâmica)
const particles = [];
class Particle {
    constructor(x, y, vx, vy, color, size, life, decay, type = 'generic') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.life = life;
        this.decay = decay;
        this.type = type;
        this.angle = Math.random() * Math.PI * 2;
        this.spin = (Math.random() - 0.5) * 0.15;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;

        if (this.type === 'bubble') {
            this.vy -= 0.04; // flutua levemente
            this.vx += Math.sin(Date.now() * 0.005 + this.y) * 0.04; // ondula
        } else if (this.type === 'feather') {
            this.vy += 0.02; // cai devagar
            this.vx = Math.sin(Date.now() * 0.004 + this.y) * 0.25; // flutua
            this.angle += this.spin;
        } else if (this.type === 'wood') {
            this.vy += 0.25; // cai com gravidade
            this.angle += this.spin;
        } else if (this.type === 'dust') {
            this.vx *= 0.95;
            this.vy *= 0.95;
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;

        if (this.type === 'feather' || this.type === 'wood') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            if (this.type === 'feather') {
                ctx.beginPath();
                ctx.ellipse(0, 0, this.size * 2, this.size, 0, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 1.6);
            }
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// Definição dos Personagens
class Character {
    constructor(x, y, color, type, name) {
        this.startX = x;
        this.startY = y;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.width = type === 'capivara' ? 42 : 30;
        this.height = type === 'capivara' ? 30 : 50;
        this.color = color;
        this.type = type; // 'capivara' ou 'tuiuiu'
        this.name = name;
        this.isGrounded = false;
        this.inWater = false;
        this.waterCooldown = 0; // frames before re-entering water after exit
            this.attachedSnake = null;
            this.attachedAngle = 0;
            this.attachedAngularVel = 0;
            this.attachedRopeLength = 0;
        this.facingRight = true;
        this.animationTimer = 0;
    }

    reset() {
        this.x = this.startX;
        this.y = this.startY;
        this.vx = 0;
        this.vy = 0;
        this.isGrounded = false;
        this.inWater = false;
        this.waterCooldown = 0;
        this.attachedSnake = null;
        this.attachedAngle = 0;
        this.attachedAngularVel = 0;
        this.attachedRopeLength = 0;
        this.facingRight = true;
    }

    update() {
        this.animationTimer += 0.15;

        // 0. Modo balanço: se está preso a uma sucuri, aplicar física de pêndulo
        if (this.type === 'capivara' && this.attachedSnake != null) {
            const s = snakes[this.attachedSnake];
            if (!s) {
                this.attachedSnake = null;
            } else {
                const inputDir = (keys.a || touchState.capyLeft ? -1 : 0) + (keys.d || touchState.capyRight ? 1 : 0);
                const L = this.attachedRopeLength || (s.length || 160);
                const g = 0.9;
                const torque = inputDir * 0.035;

                this.attachedAngularVel += ( - (g / L) * Math.sin(this.attachedAngle) + torque );
                this.attachedAngularVel *= 0.995; // damping
                this.attachedAngle += this.attachedAngularVel;

                // Atualizar posição com base no ângulo
                this.x = s.x + L * Math.sin(this.attachedAngle) - this.width / 2;
                this.y = s.y + L * Math.cos(this.attachedAngle) - this.height / 2;
                this.vx = 0; this.vy = 0; this.isGrounded = false;

                // Soltar com espaço (ou botão de ação) — projeta na tangente
                if (keys[' ']) {
                    const v = this.attachedAngularVel * L;
                    this.vx = v * Math.cos(this.attachedAngle);
                    this.vy = -v * Math.sin(this.attachedAngle);
                    this.attachedSnake = null;
                    this.attachedAngularVel = 0;
                    this.waterCooldown = 6;
                }
                return; // pular resto da física enquanto preso
            }
        }

        // 1. Checar se está na água (com histerese para evitar flicker)
        const wasInWater = this.inWater;
        const bottom = this.y + this.height;
        const ENTER_THRESHOLD = 2; // precisa penetrar 2px para entrar
        const EXIT_THRESHOLD = -4; // precisa subir 4px acima para sair

        // defensiva: só considerar água se a área for válida
        const hasWater = waterArea && waterArea.w > 0 && waterArea.h > 0;

        if (this.waterCooldown > 0) {
            this.waterCooldown--;
            this.inWater = false;
        } else if (!hasWater) {
            this.inWater = false;
        } else {
            const waterTop = waterArea.y;
            const waterBottom = waterArea.y + waterArea.h;
            const relative = bottom - waterTop;
            // exigir também alguma sobreposição horizontal para contar como dentro da água
            const centerX = this.x + this.width / 2;
            const horizontallyOver = centerX > waterArea.x && centerX < (waterArea.x + waterArea.w);

            if (wasInWater) {
                if (!horizontallyOver || relative < EXIT_THRESHOLD) this.inWater = false;
                else this.inWater = true;
            } else {
                if (horizontallyOver && relative > ENTER_THRESHOLD && this.y < waterBottom) this.inWater = true;
                else this.inWater = false;
            }
        }

        // Splash quando entra ou sai da água
        if (this.inWater !== wasInWater) {
            soundFX.playSplash();
            for (let i = 0; i < 12; i++) {
                const px = this.x + this.width / 2 + (Math.random() - 0.5) * this.width;
                const py = waterArea.y;
                const vx = (Math.random() - 0.5) * 3.5;
                const vy = -Math.random() * 3 - 1.5;
                particles.push(new Particle(px, py, vx, vy, '#60a5fa', Math.random() * 2.5 + 1.5, 0.9, 0.03, 'bubble'));
            }
        }

        // 2. Aplicar Física apropriada
        if (this.type === 'capivara') {
            if (this.inWater) {
                // Movimentação de nado suave da Capivara com transições mais suaves
                const speed = 2.6;
                const accel = 0.32;
                const wantsToSurface = keys.w || touchState.capyUp;
                const wantsToDive = keys.s || touchState.capyDown;
                const floatSurfaceY = waterArea.y - this.height + CAPYBARA_SURFACE_DEPTH;
                const EXIT_MARGIN = 6; // margem para permitir sair da água

                // Entrada na água: amortecer queda brusca
                if (!wasInWater && this.inWater) {
                    if (this.vy > 0) this.vy *= 0.28;
                    // pequenos respingos já gerados acima
                }

                // Movimento horizontal com inércia reduzida
                if (keys.a || touchState.capyLeft) { this.vx = Math.max(-speed, this.vx - accel); this.facingRight = false; }
                else if (keys.d || touchState.capyRight) { this.vx = Math.min(speed, this.vx + accel); this.facingRight = true; }
                else { this.vx *= 0.88; }

                // Movimento vertical controlado
                if (wantsToSurface) {
                    // quando o jogador pressiona subir, aplique impulso suave para emergir
                    this.vy = Math.max(-speed * 1.6, this.vy - accel);
                } else if (wantsToDive) {
                    this.vy = Math.min(speed, this.vy + accel);
                } else {
                    // flutuação natural para cima (boiamento)
                    this.vy = Math.max(-CAPYBARA_FLOAT_SPEED, this.vy - CAPYBARA_BUOYANCY * 0.8);
                }

                // Suavizar aproximação à superfície em vez de travar a posição
                if (!wantsToSurface && !wantsToDive) {
                    if (this.y < floatSurfaceY) {
                        // aproximação suave (lerp)
                        this.y += (floatSurfaceY - this.y) * 0.22;
                        if (Math.abs(this.y - floatSurfaceY) < 0.6) {
                            this.y = floatSurfaceY;
                            this.vy = Math.max(0, this.vy) * 0.36;
                        }
                    }
                }

                // Permitir saída imediata quando o jogador pressiona subir perto da superfície
                if (wantsToSurface && (this.y + this.height) <= (waterArea.y + EXIT_MARGIN)) {
                    // sair da água: conservar impulso para sair naturalmente
                    this.inWater = false;
                    // garantir que a personagem tenha um pequeno impulso para emergir
                    this.vy = Math.min(this.vy, -3.6);
                    this.isGrounded = false;
                    // efeito de splash ao emergir
                    soundFX.playSplash();
                    for (let i = 0; i < 8; i++) {
                        const px = this.x + this.width / 2 + (Math.random() - 0.5) * this.width;
                        const py = waterArea.y;
                        const vx = (Math.random() - 0.5) * 2.4;
                        const vy = -Math.random() * 2.4 - 0.6;
                        particles.push(new Particle(px, py, vx, vy, '#60a5fa', Math.random() * 2 + 1, 0.9, 0.03, 'bubble'));
                    }
                }

                this.isGrounded = false;

                // Gerar bolhas enquanto nada (menos frequente quando parado)
                if ((Math.abs(this.vx) > 0.4 || Math.abs(this.vy) > 0.4) && Math.random() < 0.22) {
                    particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1, 'rgba(191, 219, 254, 0.7)', Math.random() * 3 + 1, 1.0, 0.02, 'bubble'));
                }
            } else {
                // Movimento terrestre com inércia

                // Tentativa de agarrar uma sucuri: quando o jogador pressiona subir perto do ponto de ancoragem
                if ((keys.w || touchState.capyUp) && !this.inWater && this.attachedSnake == null) {
                    for (let i = 0; i < snakes.length; i++) {
                        const s = snakes[i];
                        const pivotX = s.x;
                        const pivotY = s.y;
                        const cx = this.x + this.width / 2;
                        const cy = this.y + this.height / 2;
                        const dist = Math.hypot(cx - pivotX, cy - pivotY);
                        if (dist < (s.grabRadius || 52)) {
                            this.attachedSnake = i;
                            this.attachedRopeLength = s.length || Math.max(80, Math.floor(dist));
                            this.attachedAngle = Math.atan2(cx - pivotX, cy - pivotY);
                            this.attachedAngularVel = 0;
                            this.vx = 0; this.vy = 0; this.isGrounded = false;
                            soundFX.playGrab?.();
                            break;
                        }
                    }
                }
                const speed = 3.5;
                const accel = 0.5;
                const gravity = 0.4;

                if (keys.a || touchState.capyLeft) { this.vx = Math.max(-speed, this.vx - accel); this.facingRight = false; }
                else if (keys.d || touchState.capyRight) { this.vx = Math.min(speed, this.vx + accel); this.facingRight = true; }
                else { this.vx *= 0.75; }

                this.vy += gravity;

                // Pulo terrestre
                if ((keys.w || touchState.capyUp) && this.isGrounded) {
                    this.vy = -7.5;
                    this.isGrounded = false;
                    soundFX.playJump();
                    // Partículas de poeira no impulso do pulo
                    for (let i = 0; i < 6; i++) {
                        particles.push(new Particle(this.x + this.width / 2, this.y + this.height - 2, (Math.random() - 0.5) * 3, -Math.random() * 1.5, '#78716c', Math.random() * 2 + 1, 0.9, 0.04, 'dust'));
                    }
                }

                // Efeito de poeira ao caminhar na terra
                if (this.isGrounded && Math.abs(this.vx) > 1 && Math.random() < 0.12) {
                    particles.push(new Particle(this.x + this.width / 2, this.y + this.height - 2, -this.vx * 0.2 + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.2 - 0.1, '#78716c', Math.random() * 2, 0.8, 0.05, 'dust'));
                }

                // Ação de quebrar caixa frágil (Espaço)
                if (keys[' ']) {
                    let boxBroken = false;
                    const remainingBoxes = [];
                    
                    boxes.forEach(box => {
                        if (box.type === 'fragile') {
                            if (isNearRect(this, box, 20)) {
                                boxBroken = true;
                                // Criar partículas de madeira
                                for (let i = 0; i < 18; i++) {
                                    const px = box.x + box.w / 2;
                                    const py = box.y + box.h / 2;
                                    const vx = (Math.random() - 0.5) * 6;
                                    const vy = (Math.random() - 0.5) * 6 - 3;
                                    particles.push(new Particle(px, py, vx, vy, '#b45309', Math.random() * 3 + 2, 1.0, 0.02 + Math.random() * 0.015, 'wood'));
                                }
                                return; // Não adiciona à nova lista (destrói)
                            }
                        }
                        remainingBoxes.push(box);
                    });

                    if (boxBroken) {
                        resetArray(boxes, remainingBoxes);
                        soundFX.playBreak();
                        screenShakeTime = 12; // tremor de tela
                        keys[' '] = false; // evita quebra contínua em um frame
                    }
                }
            }
        } else if (this.type === 'tuiuiu') {
            // Tuiuiú flutua no topo da água
            if (this.inWater && this.y + this.height - 10 > waterArea.y) {
                if (!(keys.ArrowUp || touchState.tuiUp)) {
                    this.y = waterArea.y - this.height + 15;
                    this.vy = 0;
                    this.isGrounded = true;
                }
            }

            // Movimento de voo dinâmico com inércia
            const speed = 4.0;
            const accel = 0.5;
            const gravity = 0.22;

            if (keys.ArrowLeft || touchState.tuiLeft) { this.vx = Math.max(-speed, this.vx - accel); this.facingRight = false; }
            else if (keys.ArrowRight || touchState.tuiRight) { this.vx = Math.min(speed, this.vx + accel); this.facingRight = true; }
            else { this.vx *= 0.82; }

            // Bater asas (Flap)
            if (keys.ArrowUp || touchState.tuiUp) {
                this.vy = Math.max(-4.5, this.vy - 0.7);
                // Som de flap sutil
                if (Math.random() < 0.12) soundFX.playFlap();
                // Soltar penas ocasionalmente
                if (Math.random() < 0.15) {
                    const px = this.x + this.width / 2;
                    const py = this.y + this.height - 5;
                    particles.push(new Particle(px, py, (Math.random() - 0.5) * 1.5, Math.random() * 0.8 + 0.2, '#f5f5f5', Math.random() * 2 + 1, 0.9, 0.015, 'feather'));
                }
            } else if (keys.ArrowDown || touchState.tuiDown) {
                this.vy = Math.min(4.0, this.vy + 0.6);
            } else {
                this.vy += gravity;
            }

            // Ação de puxar caixa móvel (Enter)
            if (keys.Enter) {
                boxes.forEach(box => {
                    if (box.type === 'movable') {
                        const dist = distanceBetweenCenters(this, box);
                        if (dist < PULLED_BOX_PICKUP_RANGE || box.pulledBy === this.type) {
                            box.isBeingPulled = true;
                            box.pulledBy = this.type;
                            const target = getPulledBoxTarget(this, box);
                            box.x += (target.x - box.x) * PULLED_BOX_FOLLOW_STRENGTH;
                            box.y += (target.y - box.y) * PULLED_BOX_FOLLOW_STRENGTH;
                            box.vx = this.vx;
                            box.vy = this.vy;
                        }
                    }
                });
            } else {
                boxes.forEach(box => {
                    if (box.type === 'movable') {
                        if (box.isBeingPulled) {
                            box.isBeingPulled = false;
                            box.pulledBy = null;
                            box.vx = 0;
                            box.vy = 0;
                        }
                    }
                });
            }
        }

        fans.forEach(fan => {
            if (intersects(this, fan)) {
                this.vy = Math.max(this.vy - fan.force, -fan.maxSpeed);
                this.vx += ((fan.pushX ?? 0) - this.vx) * 0.03;

                if (Math.random() < 0.22) {
                    const px = fan.x + Math.random() * fan.w;
                    const py = fan.y + fan.h - 6;
                    particles.push(new Particle(px, py, (Math.random() - 0.5) * 0.7, -Math.random() * 2 - 1, 'rgba(186, 230, 253, 0.45)', Math.random() * 2 + 1, 0.7, 0.03, 'bubble'));
                }
            }
        });

        // Limitar velocidades máximas de queda
        if (this.vy > 10) this.vy = 10;

        // Salvar posição anterior para resolver colisões de plataforma
        const prevX = this.x;
        const prevY = this.y;

        // Mover X
        this.x += this.vx;
        this.resolvePlatformCollisions(prevX, prevY, 'x');

        // Mover Y
        this.y += this.vy;
        this.resolvePlatformCollisions(prevX, prevY, 'y');

        // Limites de tela do cenário
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > GAME_WIDTH) this.x = GAME_WIDTH - this.width;
        if (this.y < 0) this.y = 0;
        if (this.y + this.height > GAME_HEIGHT) {
            this.y = GAME_HEIGHT - this.height;
            this.vy = 0;
            this.isGrounded = true;
        }
    }

    resolvePlatformCollisions(prevX, prevY, axis) {
        // Personagens colidem contra plataformas fixas, caixas e portões dinâmicos
        const allSolid = [...platforms, ...boxes, ...gates];
        for (let plat of allSolid) {
            // ignorar colisões com caixas que o tuiuiu está puxando/segurando
            if (this.type === 'tuiuiu' && plat.isBeingPulled && plat.pulledBy === this.type) {
                continue;
            }

            if (!intersects(this, plat)) continue;

            // Tuiuiú passa por baixo de 'water-floor'
            if (this.type === 'tuiuiu' && plat.type === 'water-floor') continue;

            // Determinar de onde veio a colisão usando posição anterior
            const prevRight = prevX + this.width;
            const prevLeft = prevX;
            const prevBottom = prevY + this.height;
            const prevTop = prevY;

            const platRight = plat.x + getWidth(plat);
            const platBottom = plat.y + getHeight(plat);

            const cameFromLeft = prevRight <= plat.x;
            const cameFromRight = prevLeft >= platRight;
            const cameFromTop = prevBottom <= plat.y;
            const cameFromBottom = prevTop >= platBottom;

            if (axis === 'x') {
                if (cameFromLeft) {
                    this.x = plat.x - this.width;
                } else if (cameFromRight) {
                    this.x = plat.x + getWidth(plat);
                } else {
                    // fallback baseado na velocidade
                    if (this.vx > 0) this.x = plat.x - this.width;
                    else if (this.vx < 0) this.x = plat.x + getWidth(plat);
                }
                this.vx = 0;
            } else if (axis === 'y') {
                if (cameFromTop) {
                    this.y = plat.y - this.height;
                    this.isGrounded = true;
                } else if (cameFromBottom) {
                    this.y = plat.y + getHeight(plat);
                } else {
                    // fallback baseado na velocidade
                    if (this.vy > 0) {
                        this.y = plat.y - this.height;
                        this.isGrounded = true;
                    } else if (this.vy < 0) {
                        this.y = plat.y + getHeight(plat);
                    }
                }
                this.vy = 0;
            }
        }
    }

    draw() {
        ctx.save();

        if (this.inWater) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#60a5fa';
        }

        if (this.type === 'capivara') {
            this.drawCapivara();
        } else if (this.type === 'tuiuiu') {
            this.drawTuiuiu();
        }

        ctx.restore();
    }

    drawCapivara() {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const animOffset = Math.sin(this.animationTimer) * 2;

        ctx.fillStyle = '#78350f'; // Castanho escuro capivara

        // Corpo principal (Elipse)
        ctx.beginPath();
        ctx.ellipse(centerX, centerY + (this.inWater ? 0 : animOffset / 2), this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cabeça
        ctx.fillStyle = '#92400e';
        const headX = this.facingRight ? centerX + 12 : centerX - 12;
        const headY = centerY - 5;
        ctx.beginPath();
        ctx.arc(headX, headY, 10, 0, Math.PI * 2);
        ctx.fill();

        // Focinho quadrado típico da Capivara
        ctx.fillStyle = '#78350f';
        const snoutX = this.facingRight ? headX + 3 : headX - 11;
        ctx.fillRect(snoutX, headY - 3, 8, 8);

        // Olho
        ctx.fillStyle = '#000';
        const eyeX = this.facingRight ? headX + 4 : headX - 4;
        ctx.beginPath();
        ctx.arc(eyeX, headY - 3, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Orelhinha arredondada
        ctx.fillStyle = '#451a03';
        const earX = this.facingRight ? headX - 5 : headX + 3;
        ctx.beginPath();
        ctx.arc(earX, headY - 8, 3, 0, Math.PI * 2);
        ctx.fill();

        // Patinhas
        if (!this.inWater && this.isGrounded) {
            ctx.fillStyle = '#451a03';
            const walkCycle = Math.sin(this.animationTimer) * 4;
            ctx.fillRect(centerX - 12, centerY + 10, 4, 6 + walkCycle);
            ctx.fillRect(centerX - 4, centerY + 10, 4, 6 - walkCycle);
            ctx.fillRect(centerX + 4, centerY + 10, 4, 6 + walkCycle);
            ctx.fillRect(centerX + 10, centerY + 10, 4, 6 - walkCycle);
        } else if (this.inWater) {
            // Patinhas nadando
            ctx.strokeStyle = '#451a03';
            ctx.lineWidth = 3;
            const swimCycle = Math.cos(this.animationTimer) * 5;
            ctx.beginPath();
            ctx.moveTo(centerX - 10, centerY + 5);
            ctx.lineTo(centerX - 15 + swimCycle, centerY + 10);
            ctx.moveTo(centerX + 10, centerY + 5);
            ctx.lineTo(centerX + 15 - swimCycle, centerY + 10);
            ctx.stroke();
        }
    }

    drawTuiuiu() {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const flap = Math.sin(this.animationTimer) * 8;
        const beakDirection = this.facingRight ? 1 : -1;

        // Corpo Branco
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY + 8, 12, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pescoço Preto
        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - 4);
        ctx.lineTo(centerX, centerY - 18);
        ctx.stroke();

        // Papo Vermelho (Gola icônica do Tuiuiú)
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(centerX, centerY - 10, 6, 0, Math.PI * 2);
        ctx.fill();

        // Cabeça Preta
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.arc(centerX, centerY - 20, 7, 0, Math.PI * 2);
        ctx.fill();

        // Bico Longo
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - 22);
        ctx.lineTo(centerX + (22 * beakDirection), centerY - 18);
        ctx.lineTo(centerX, centerY - 16);
        ctx.closePath();
        ctx.fill();

        // Olho
        ctx.fillStyle = '#fff';
        const eyeX = this.facingRight ? centerX + 2 : centerX - 4;
        ctx.beginPath();
        ctx.arc(eyeX, centerY - 21, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Pernas Longas
        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 2.5;
        if (this.vy === 0 || this.isGrounded) {
            ctx.beginPath();
            ctx.moveTo(centerX - 4, centerY + 22);
            ctx.lineTo(centerX - 4, centerY + 40);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(centerX + 4, centerY + 22);
            ctx.lineTo(centerX + 4, centerY + 40);
            ctx.stroke();
        } else {
            // Pernas dobradas no voo
            ctx.beginPath();
            ctx.moveTo(centerX - 4, centerY + 22);
            ctx.lineTo(centerX - 8, centerY + 30);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(centerX + 4, centerY + 22);
            ctx.lineTo(centerX, centerY + 30);
            ctx.stroke();
        }

        // Asas
        ctx.fillStyle = '#e5e5e5';
        ctx.strokeStyle = '#737373';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (Math.abs(this.vy) > 0.5 || keys.ArrowUp || touchState.tuiUp) {
            ctx.ellipse(centerX - (8 * beakDirection), centerY + 4, 18, Math.abs(6 + flap), Math.PI / 4 * beakDirection, 0, Math.PI * 2);
        } else {
            ctx.ellipse(centerX - (4 * beakDirection), centerY + 6, 8, 14, -Math.PI / 12 * beakDirection, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
    }
}

// Criação dos personagens
const capivara = new Character(100, 600, '#78350f', 'capivara', 'Capivara');
const tuiuiu = new Character(150, 600, '#ffffff', 'tuiuiu', 'Tuiuiú');

// Sistema de Fases Estruturado
const levels = [
    {
        name: "Fase 1: O Começo",
        platforms: [
            { x: 0, y: 650, w: 820, h: 70, type: 'ground' }, 
            { x: 1100, y: 650, w: 180, h: 70, type: 'ground' }, 
            { x: 820, y: 700, w: 280, h: 20, type: 'water-floor' }, 
            { x: 800, y: 530, w: 20, h: 120, type: 'ground' }, 
            { x: 1100, y: 530, w: 20, h: 120, type: 'ground' }, 
            { x: 0, y: 250, w: 200, h: 20, type: 'platform' }, 
            { x: 250, y: 0, w: 20, h: 450, type: 'ground' }, 
            { x: 350, y: 350, w: 150, h: 20, type: 'platform' }, 
            { x: 650, y: 540, w: 150, h: 20, type: 'platform' }
        ],
        gates: [],
        boxes: [
            { x: 240, y: 450, w: 40, h: 200, type: 'fragile' },
            { x: 400, y: 300, w: 50, h: 50, type: 'movable' }
        ],
        waterArea: { x: 820, y: 530, w: 280, h: 170 },
        door: { x: 1180, y: 580, w: 55, h: 70 },
        highButton: { x: 50, y: 235, w: 30, h: 15 },
        waterLever: { x: 950, y: 660, w: 15, h: 40 },
        pressurePlate: null,
        capyStart: { x: 100, y: 600 },
        tuiStart: { x: 150, y: 600 }
    },
    {
        name: "Fase 2: O Peso da Cooperação",
        platforms: [
            { x: 0, y: 650, w: 900, h: 70, type: 'ground' }, 
            { x: 1120, y: 650, w: 160, h: 70, type: 'ground' }, 
            { x: 0, y: 250, w: 180, h: 20, type: 'platform' }, 
            { x: 700, y: 200, w: 150, h: 20, type: 'platform' }, 
            { x: 900, y: 530, w: 20, h: 120, type: 'ground' }, 
            { x: 1100, y: 530, w: 20, h: 120, type: 'ground' }, 
            { x: 920, y: 700, w: 180, h: 20, type: 'water-floor' },
            { x: 150, y: 430, w: 120, h: 20, type: 'platform' },
            { x: 800, y: 560, w: 100, h: 20, type: 'platform' }
        ],
        gates: [
            { x: 500, y: 450, w: 20, h: 200, activeY: 450, targetY: 650 }
        ],
        boxes: [
            { x: 350, y: 450, w: 40, h: 200, type: 'fragile' },
            { x: 750, y: 150, w: 50, h: 50, type: 'movable' }
        ],
        waterArea: { x: 920, y: 525, w: 180, h: 175 },
        door: { x: 1180, y: 580, w: 55, h: 70 },
        highButton: { x: 50, y: 235, w: 30, h: 15 },
        waterLever: { x: 1000, y: 660, w: 15, h: 40 },
        pressurePlate: { x: 600, y: 640, w: 80, h: 10 },
        capyStart: { x: 80, y: 600 },
        tuiStart: { x: 550, y: 600 }
    },
    {
        name: "Fase 3: O Templo Submerso",
        platforms: [
            { x: 0, y: 650, w: 430, h: 70, type: 'ground' }, 
            { x: 870, y: 650, w: 410, h: 70, type: 'ground' }, 
            { x: 430, y: 530, w: 20, h: 120, type: 'ground' }, 
            { x: 850, y: 530, w: 20, h: 120, type: 'ground' }, 
            { x: 450, y: 650, w: 400, h: 20, type: 'water-floor' }, 
            { x: 1000, y: 250, w: 150, h: 20, type: 'platform' }, 
            { x: 0, y: 170, w: 120, h: 20, type: 'platform' }, 
            { x: 600, y: 250, w: 100, h: 20, type: 'platform' },
            { x: 330, y: 560, w: 100, h: 20, type: 'platform' }
        ],
        gates: [
            { x: 950, y: 350, w: 20, h: 300, activeY: 350, targetY: 650 }
        ],
        boxes: [
            { x: 300, y: 450, w: 50, h: 200, type: 'fragile' },
            { x: 1050, y: 200, w: 50, h: 50, type: 'movable' }
        ],
        waterArea: { x: 450, y: 525, w: 400, h: 125 },
        door: { x: 1180, y: 580, w: 55, h: 70 },
        highButton: { x: 40, y: 155, w: 30, h: 15 },
        waterLever: { x: 650, y: 610, w: 15, h: 40 },
        pressurePlate: { x: 200, y: 640, w: 80, h: 10 },
        capyStart: { x: 100, y: 600 },
        tuiStart: { x: 150, y: 600 }
    },
    {
        name: "Fase 4: Correntes do Buriti",
        platforms: [
            { x: 0, y: 650, w: 360, h: 70, type: 'ground' },
            { x: 960, y: 650, w: 320, h: 70, type: 'ground' },
            { x: 360, y: 530, w: 20, h: 120, type: 'ground' },
            { x: 940, y: 530, w: 20, h: 120, type: 'ground' },
            { x: 380, y: 700, w: 560, h: 20, type: 'water-floor' },
            { x: 120, y: 430, w: 150, h: 20, type: 'platform' },
            { x: 520, y: 340, w: 120, h: 20, type: 'platform' },
            { x: 720, y: 190, w: 140, h: 20, type: 'platform' },
            { x: 995, y: 520, w: 100, h: 20, type: 'platform' }
        ],
        gates: [
            { x: 900, y: 430, w: 20, h: 220, activeY: 430, targetY: 650 }
        ],
        boxes: [
            { x: 240, y: 450, w: 45, h: 200, type: 'fragile' },
            { x: 765, y: 135, w: 50, h: 50, type: 'movable' }
        ],
        fans: [
            { x: 650, y: 310, w: 90, h: 340, force: 0.58, maxSpeed: 6.2 }
        ],
        spikes: [
            { x: 970, y: 632, w: 110, h: 18 }
        ],
        waterArea: { x: 380, y: 525, w: 560, h: 175 },
        door: { x: 1180, y: 580, w: 55, h: 70 },
        highButton: { x: 775, y: 175, w: 30, h: 15 },
        waterLever: { x: 645, y: 660, w: 15, h: 40 },
        pressurePlate: { x: 520, y: 640, w: 90, h: 10 },
        capyStart: { x: 80, y: 600 },
        tuiStart: { x: 140, y: 600 }
    },
    {
        name: "Fase 5: Jardim de Espinhos",
        platforms: [
            { x: 0, y: 650, w: 470, h: 70, type: 'ground' },
            { x: 780, y: 650, w: 500, h: 70, type: 'ground' },
            { x: 470, y: 530, w: 20, h: 120, type: 'ground' },
            { x: 760, y: 530, w: 20, h: 120, type: 'ground' },
            { x: 490, y: 700, w: 270, h: 20, type: 'water-floor' },
            { x: 40, y: 300, w: 160, h: 20, type: 'platform' },
            { x: 300, y: 230, w: 130, h: 20, type: 'platform' },
            { x: 640, y: 330, w: 140, h: 20, type: 'platform' },
            { x: 1010, y: 450, w: 120, h: 20, type: 'platform' }
        ],
        gates: [
            { x: 850, y: 450, w: 20, h: 200, activeY: 450, targetY: 650 }
        ],
        boxes: [
            { x: 420, y: 500, w: 45, h: 150, type: 'fragile' },
            { x: 90, y: 250, w: 50, h: 50, type: 'movable' }
        ],
        fans: [
            { x: 230, y: 310, w: 80, h: 340, force: 0.5, maxSpeed: 5.8 },
            { x: 935, y: 500, w: 70, h: 150, force: 0.42, maxSpeed: 4.8 }
        ],
        spikes: [
            { x: 785, y: 632, w: 105, h: 18 },
            { x: 895, y: 632, w: 120, h: 18 }
        ],
        waterArea: { x: 490, y: 525, w: 270, h: 175 },
        door: { x: 1180, y: 580, w: 55, h: 70 },
        highButton: { x: 340, y: 215, w: 30, h: 15 },
        waterLever: { x: 610, y: 660, w: 15, h: 40 },
        pressurePlate: { x: 1040, y: 640, w: 80, h: 10 },
        capyStart: { x: 80, y: 600 },
        tuiStart: { x: 160, y: 600 }
    },
    {
        name: "Fase 6: Duas Torres",
        platforms: [
            { x: 0, y: 650, w: 300, h: 70, type: 'ground' },
            { x: 560, y: 650, w: 180, h: 70, type: 'ground' },
            { x: 1020, y: 650, w: 260, h: 70, type: 'ground' },
            { x: 300, y: 530, w: 20, h: 120, type: 'ground' },
            { x: 540, y: 530, w: 20, h: 120, type: 'ground' },
            { x: 320, y: 700, w: 220, h: 20, type: 'water-floor' },
            { x: 780, y: 490, w: 20, h: 160, type: 'ground' },
            { x: 950, y: 490, w: 20, h: 160, type: 'ground' },
            { x: 70, y: 430, w: 120, h: 20, type: 'platform' },
            { x: 405, y: 330, w: 100, h: 20, type: 'platform' },
            { x: 760, y: 260, w: 130, h: 20, type: 'platform' },
            { x: 1060, y: 360, w: 120, h: 20, type: 'platform' }
        ],
        gates: [
            { x: 970, y: 400, w: 20, h: 250, activeY: 400, targetY: 650 }
        ],
        boxes: [
            { x: 280, y: 470, w: 40, h: 180, type: 'fragile' },
            { x: 790, y: 210, w: 50, h: 50, type: 'movable' }
        ],
        fans: [
            { x: 665, y: 275, w: 80, h: 375, force: 0.62, maxSpeed: 6.4 },
            { x: 890, y: 450, w: 70, h: 200, force: 0.45, maxSpeed: 5.2 }
        ],
        spikes: [
            { x: 805, y: 632, w: 155, h: 18 }
        ],
        waterArea: { x: 320, y: 525, w: 220, h: 175 },
        door: { x: 1180, y: 580, w: 55, h: 70 },
        highButton: { x: 1095, y: 345, w: 30, h: 15 },
        waterLever: { x: 430, y: 660, w: 15, h: 40 },
        pressurePlate: { x: 610, y: 640, w: 90, h: 10 },
        capyStart: { x: 80, y: 600 },
        tuiStart: { x: 130, y: 600 }
    },
    {
        name: "Fase 7: Portal do Vento",
        platforms: [
            { x: 0, y: 650, w: 260, h: 70, type: 'ground' },
            { x: 1080, y: 650, w: 200, h: 70, type: 'ground' },
            { x: 260, y: 530, w: 20, h: 120, type: 'ground' },
            { x: 1000, y: 530, w: 20, h: 120, type: 'ground' },
            { x: 280, y: 700, w: 720, h: 20, type: 'water-floor' },
            { x: 60, y: 250, w: 130, h: 20, type: 'platform' },
            { x: 360, y: 380, w: 130, h: 20, type: 'platform' },
            { x: 590, y: 245, w: 120, h: 20, type: 'platform' },
            { x: 850, y: 365, w: 150, h: 20, type: 'platform' },
            { x: 1110, y: 500, w: 110, h: 20, type: 'platform' }
        ],
        gates: [
            { x: 1020, y: 350, w: 20, h: 300, activeY: 350, targetY: 650 },
            { x: 235, y: 470, w: 20, h: 180, activeY: 470, targetY: 650 }
        ],
        boxes: [
            { x: 220, y: 470, w: 45, h: 180, type: 'fragile' },
            { x: 610, y: 190, w: 50, h: 50, type: 'movable' },
            { x: 900, y: 315, w: 50, h: 50, type: 'movable' }
        ],
        fans: [
            { x: 500, y: 400, w: 85, h: 250, force: 0.52, maxSpeed: 5.8 },
            { x: 740, y: 285, w: 85, h: 365, force: 0.64, maxSpeed: 6.6 }
        ],
        spikes: [
            { x: 1025, y: 632, w: 95, h: 18 },
            { x: 1125, y: 632, w: 55, h: 18 }
        ],
        waterArea: { x: 280, y: 525, w: 720, h: 175 },
        door: { x: 1180, y: 580, w: 55, h: 70 },
        highButton: { x: 100, y: 235, w: 30, h: 15 },
        waterLever: { x: 660, y: 660, w: 15, h: 40 },
        pressurePlate: { x: 880, y: 640, w: 90, h: 10 },
        capyStart: { x: 70, y: 600 },
        tuiStart: { x: 135, y: 600 }
    }
];

// Carregar Dados da Fase Atual
function loadLevel(index) {
    currentLevelIndex = index;
    const lvl = levels[index];

    // Carregar plataformas fixas
    resetArray(platforms, lvl.platforms.map(p => ({ ...p })));

    // Carregar portões
    resetArray(gates, (lvl.gates ?? []).map(g => ({ ...g, y: g.activeY })));

    // Carregar caixas
    resetArray(boxes, lvl.boxes.map(b => ({ ...b, vx: 0, vy: 0, isBeingPulled: false, pulledBy: null })));

    // Carregar novas mecânicas
    resetArray(fans, (lvl.fans ?? []).map(f => ({ force: 0.45, maxSpeed: 5, pushX: 0, ...f })));
    // Carregar sucuris (pontos de ancoragem para balançar)
    resetArray(snakes, (lvl.snakes ?? []).map(s => ({ ...s })));
    resetArray(spikes, (lvl.spikes ?? []).map(s => ({ ...s })));

    // Configurar áreas e interações
    copyRect(waterArea, lvl.waterArea);

    copyRect(door, lvl.door);
    door.color = '#ef4444';

    copyRect(highButton, lvl.highButton);
    highButton.activated = false;

    copyRect(waterLever, lvl.waterLever);
    waterLever.activated = false;

    if (lvl.pressurePlate) {
        pressurePlate = { ...lvl.pressurePlate, activated: false };
    } else {
        pressurePlate = null;
    }

    // Reiniciar estados globais
    leverActivated = false;
    buttonActivated = false;
    doorOpened = false;
    isVictorious = false;

    // Reposicionar personagens
    if (!lvl.capyStart) {
        console.warn('level', index, 'missing capyStart — using fallback');
        lvl.capyStart = { x: 80, y: 600 };
    }
    capivara.startX = lvl.capyStart.x;
    capivara.startY = lvl.capyStart.y;
    capivara.reset();

    if (!lvl.tuiStart) {
        console.warn('level', index, 'missing tuiStart — using fallback');
        lvl.tuiStart = { x: 120, y: 600 };
    }
    tuiuiu.startX = lvl.tuiStart.x;
    tuiuiu.startY = lvl.tuiStart.y;
    tuiuiu.reset();

    // Limpar comandos
    Object.keys(keys).forEach(k => keys[k] = false);
    Object.keys(touchState).forEach(t => touchState[t] = false);

    // Configurar tela de transição
    levelTransitionTimer = 90;
    levelNameToShow = lvl.name;

    updateUI();
    particles.length = 0;
}

// Inicializar Teclado
window.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    const k = e.key.toLowerCase();

    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
    }

    if (k === 'w') keys.w = true;
    if (k === 'a') keys.a = true;
    if (k === 's') keys.s = true;
    if (k === 'd') keys.d = true;
    if (k === ' ') keys[' '] = true;

    if (e.key === 'ArrowUp') keys.ArrowUp = true;
    if (e.key === 'ArrowDown') keys.ArrowDown = true;
    if (e.key === 'ArrowLeft') keys.ArrowLeft = true;
    if (e.key === 'ArrowRight') keys.ArrowRight = true;
    if (e.key === 'Enter') keys.Enter = true;
});

window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();

    if (k === 'w') keys.w = false;
    if (k === 'a') keys.a = false;
    if (k === 's') keys.s = false;
    if (k === 'd') keys.d = false;
    if (k === ' ') keys[' '] = false;

    if (e.key === 'ArrowUp') keys.ArrowUp = false;
    if (e.key === 'ArrowDown') keys.ArrowDown = false;
    if (e.key === 'ArrowLeft') keys.ArrowLeft = false;
    if (e.key === 'ArrowRight') keys.ArrowRight = false;
    if (e.key === 'Enter') keys.Enter = false;
});

// Configurar Controles de Toque para Mobile
function bindTouchButton(elementId, stateProperty) {
    const btn = document.getElementById(elementId);
    if (!btn) return;

    const startAction = (e) => {
        e.preventDefault();
        touchState[stateProperty] = true;
    };

    const endAction = (e) => {
        e.preventDefault();
        touchState[stateProperty] = false;
    };

    btn.addEventListener('touchstart', startAction, { passive: false });
    btn.addEventListener('touchend', endAction, { passive: false });
    btn.addEventListener('mousedown', startAction);
    btn.addEventListener('mouseup', endAction);
    btn.addEventListener('mouseleave', endAction);
}

bindTouchButton('btn-capy-up', 'capyUp');
bindTouchButton('btn-capy-down', 'capyDown');
bindTouchButton('btn-capy-left', 'capyLeft');
bindTouchButton('btn-capy-right', 'capyRight');

bindTouchButton('btn-tui-up', 'tuiUp');
bindTouchButton('btn-tui-down', 'tuiDown');
bindTouchButton('btn-tui-left', 'tuiLeft');
bindTouchButton('btn-tui-right', 'tuiRight');

function toggleTouchControls() {
    const container = document.getElementById('touchControlsContainer');
    container.classList.toggle('hidden');
}

function setIndicatorActive(element, isActive) {
    if (isActive) {
        element.classList.replace('bg-red-500', 'bg-green-500');
    } else {
        element.classList.replace('bg-green-500', 'bg-red-500');
    }
}

// Colisão da caixa móvel contra plataformas e portões
function resolveBoxPlatformCollisions(box, prevX, prevY, axis) {
    const allSolid = [...platforms, ...gates];
    for (let plat of allSolid) {
        if (!intersects(box, plat)) continue;

        const prevRight = prevX + box.w;
        const prevLeft = prevX;
        const prevBottom = prevY + box.h;
        const prevTop = prevY;

        const platRight = plat.x + getWidth(plat);
        const platBottom = plat.y + getHeight(plat);

        const cameFromLeft = prevRight <= plat.x;
        const cameFromRight = prevLeft >= platRight;
        const cameFromTop = prevBottom <= plat.y;
        const cameFromBottom = prevTop >= platBottom;

        if (axis === 'x') {
            if (cameFromLeft) {
                box.x = plat.x - box.w;
            } else if (cameFromRight) {
                box.x = plat.x + getWidth(plat);
            } else {
                if (box.vx > 0) box.x = plat.x - box.w;
                else if (box.vx < 0) box.x = plat.x + getWidth(plat);
            }
            box.vx = 0;
        } else {
            if (cameFromTop) {
                box.y = plat.y - box.h;
            } else if (cameFromBottom) {
                box.y = plat.y + getHeight(plat);
            } else {
                if (box.vy > 0) box.y = plat.y - box.h;
                else if (box.vy < 0) box.y = plat.y + getHeight(plat);
            }
            box.vy = 0;
        }
    }
}

// Atualizar Física das Caixas Móveis
function updateBoxes() {
    boxes.forEach(box => {
        if (box.type === 'movable') {
            if (box.isBeingPulled) {
                if (box.x < 0) box.x = 0;
                if (box.x + box.w > GAME_WIDTH) box.x = GAME_WIDTH - box.w;
                if (box.y < 0) box.y = 0;
                if (box.y + box.h > GAME_HEIGHT) box.y = GAME_HEIGHT - box.h;
                return;
            }

            box.vx = 0;
            box.vy = (box.vy || 0) + 0.35; // Gravidade da caixa

            // Mover X e resolver colisões
            const prevX = box.x;
            box.x += box.vx;
            resolveBoxPlatformCollisions(box, prevX, box.y, 'x');

            // Mover Y e resolver colisões
            const prevY = box.y;
            box.y += box.vy;
            resolveBoxPlatformCollisions(box, box.x, prevY, 'y');

            // Limites de tela
            if (box.x < 0) box.x = 0;
            if (box.x + box.w > GAME_WIDTH) box.x = GAME_WIDTH - box.w;
            if (box.y < 0) box.y = 0;
            if (box.y + box.h > GAME_HEIGHT) {
                box.y = GAME_HEIGHT - box.h;
                box.vy = 0;
            }
        }
    });
}

function startGame() {
    const overlay = document.getElementById('tutorialOverlay');
    if (overlay && !overlay.classList.contains('hidden') && currentCutsceneIndex < cutsceneFrames.length - 1) {
        nextCutscene();
        return;
    }

    if (overlay) overlay.classList.add('hidden');
    gameActive = true;
    loadLevel(0);
}

function resetGame() {
    document.getElementById('victoryOverlay').classList.add('hidden');
    loadLevel(currentLevelIndex);
    gameActive = true;
}

function triggerVictory() {
    isVictorious = true;
    gameActive = false;

    if (currentLevelIndex < levels.length - 1) {
        soundFX.playVictory();
        setTimeout(() => {
            loadLevel(currentLevelIndex + 1);
            gameActive = true;
        }, 1500);
    } else {
        soundFX.playVictory();
        document.getElementById('victoryOverlay').classList.remove('hidden');
    }
}

function restartLevelAfterHazard() {
    screenShakeTime = 18;
    soundFX.playBreak();
    loadLevel(currentLevelIndex);
    gameActive = true;
}

// Atualizar HUD
function updateUI() {
    const indLever = document.getElementById('indicator-lever');
    const indButton = document.getElementById('indicator-button');
    const indDoor = document.getElementById('indicator-door');
    const hudLevel = document.getElementById('hud-level');

    if (hudLevel) {
        hudLevel.textContent = `Fase: ${currentLevelIndex + 1}/${levels.length}`;
    }

    setIndicatorActive(indLever, leverActivated);
    setIndicatorActive(indButton, buttonActivated);

    if (doorOpened) {
        indDoor.textContent = "Aberto! Vá até lá";
        indDoor.className = HUD_CLASSES.doorOpen;
    } else {
        indDoor.textContent = "Bloqueado";
        indDoor.className = HUD_CLASSES.doorClosed;
    }
}

// Colisões do puzzle e interações dinâmicas
function checkCollisionsAndTriggers() {
    const hazardEntities = [capivara, tuiuiu];
    if (spikes.some(spike => isSpikeActive(spike) && hazardEntities.some(entity => intersects(entity, spike)))) {
        restartLevelAfterHazard();
        return;
    }

    // 1. Capivara ativa Alavanca Subaquática
    if (!leverActivated) {
        const distToLever = distanceBetweenCenters(capivara, waterLever);
        if (distToLever < 35 && capivara.inWater) {
            leverActivated = true;
            waterLever.activated = true;
            soundFX.playTrigger();
            updateUI();
        }
    }

    // 2. Tuiuiú ativa o Botão Elevado
    if (!buttonActivated) {
        const distToButton = distanceBetweenCenters(tuiuiu, highButton);
        if (distToButton < 30) {
            buttonActivated = true;
            highButton.activated = true;
            soundFX.playTrigger();
            updateUI();
        }
    }

    // 3. Sensor de Placa de Pressão (se aplicável ao nível)
    if (pressurePlate) {
        let isPressed = false;
        const entities = [capivara, tuiuiu, ...boxes];
        for (let ent of entities) {
            if (ent.x + getWidth(ent) > pressurePlate.x &&
                ent.x < pressurePlate.x + pressurePlate.w &&
                ent.y + getHeight(ent) >= pressurePlate.y - 6 &&
                ent.y <= pressurePlate.y + pressurePlate.h + 5) {
                isPressed = true;
                break;
            }
        }

        if (isPressed !== pressurePlate.activated) {
            pressurePlate.activated = isPressed;
            if (isPressed) {
                soundFX.playPlateActivate();
            } else {
                soundFX.playPlateDeactivate();
            }
        }
    }

    // Mover Portões com base na Placa de Pressão
    gates.forEach(gate => {
        const targetY = (pressurePlate && pressurePlate.activated) ? gate.targetY : gate.activeY;
        gate.y += (targetY - gate.y) * 0.1; // Deslizar portão suavemente
    });

    // 4. Checar se ambos ativaram para abrir portal de saída
    if (leverActivated && buttonActivated && !doorOpened) {
        doorOpened = true;
        door.color = '#22c55e';
        updateUI();
    }

    // 5. Checar se os dois escaparam
    if (doorOpened) {
        const capyAtDoor = intersects(capivara, door);
        const tuiuiuAtDoor = intersects(tuiuiu, door);

        if (capyAtDoor && tuiuiuAtDoor && !isVictorious) {
            triggerVictory();
        }
    }
}

// Loop Principal de Renderização e Física
function gameLoop() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Efeito de Tremor de Tela (Screen Shake)
    ctx.save();
    if (screenShakeTime > 0) {
        const dx = (Math.random() - 0.5) * 6;
        const dy = (Math.random() - 0.5) * 6;
        ctx.translate(dx, dy);
        screenShakeTime--;
    }

    // 1. Desenhar Fundo de Caverna/Templo antigo do Pantanal
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Tijolos do fundo decorativos
    ctx.fillStyle = '#141210';
    ctx.fillRect(80, 100, 140, 45);
    ctx.fillRect(380, 160, 100, 50);
    ctx.fillRect(720, 120, 120, 40);
    ctx.fillRect(1000, 200, 80, 40);

    // 2. Desenhar Plataformas Físicas (Estilo Tijolos e Musgo)
    platforms.forEach(plat => {
        if (plat.type === 'ground' || plat.type === 'platform') {
            ctx.fillStyle = '#44403c'; // Cinza base
            ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

            // Linhas divisórias de tijolos
            ctx.strokeStyle = '#292524';
            ctx.lineWidth = 1.5;
            const bWidth = 40;
            const bHeight = 20;

            // Linhas horizontais
            for (let y = plat.y + bHeight; y < plat.y + plat.h; y += bHeight) {
                ctx.beginPath();
                ctx.moveTo(plat.x, y);
                ctx.lineTo(plat.x + plat.w, y);
                ctx.stroke();
            }
            // Linhas verticais
            let rIdx = 0;
            for (let y = plat.y; y < plat.y + plat.h; y += bHeight) {
                const xOffset = (rIdx % 2) * (bWidth / 2);
                for (let x = plat.x - xOffset; x < plat.x + plat.w; x += bWidth) {
                    if (x >= plat.x) {
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.lineTo(x, y + Math.min(bHeight, plat.y + plat.h - y));
                        ctx.stroke();
                    }
                }
                rIdx++;
            }

            // Camada de grama/musgo no topo
            ctx.fillStyle = '#15803d'; // Verde vivo
            ctx.fillRect(plat.x, plat.y, plat.w, 4);

            // Arredondamento do musgo (pingos/folhinhas pendentes)
            ctx.fillStyle = '#166534';
            const tufts = plat.w / 16;
            for (let i = 0; i < tufts; i++) {
                const tx = plat.x + i * 16 + 8;
                const th = 4 + (Math.sin(i * 1.7) * 3);
                ctx.beginPath();
                ctx.ellipse(tx, plat.y + 4, 6, th, 0, 0, Math.PI);
                ctx.fill();
            }
        } else if (plat.type === 'water-floor') {
            ctx.fillStyle = '#0f172a'; // Fundo arenoso escuro sob a água
            ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
        }
    });

    // 2.1 Desenhar Correntes de Ar
    fans.forEach(fan => {
        const gradient = ctx.createLinearGradient(fan.x, fan.y + fan.h, fan.x, fan.y);
        gradient.addColorStop(0, 'rgba(14, 165, 233, 0.28)');
        gradient.addColorStop(1, 'rgba(186, 230, 253, 0.04)');
        ctx.fillStyle = gradient;
        ctx.fillRect(fan.x, fan.y, fan.w, fan.h);

        ctx.strokeStyle = 'rgba(186, 230, 253, 0.5)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            const x = fan.x + (i + 1) * (fan.w / 5);
            ctx.beginPath();
            ctx.moveTo(x, fan.y + fan.h - 8);
            ctx.quadraticCurveTo(x + Math.sin(Date.now() * 0.004 + i) * 12, fan.y + fan.h / 2, x, fan.y + 10);
            ctx.stroke();
        }

        ctx.fillStyle = '#0f766e';
        ctx.fillRect(fan.x, fan.y + fan.h - 8, fan.w, 8);
    });

    // 2.2 Desenhar Espinhos
    spikes.forEach(spike => {
        const active = isSpikeActive(spike);
        const underwater = intersects(spike, waterArea);
        ctx.globalAlpha = active ? (underwater ? 0.72 : 1) : 0.22;
        ctx.fillStyle = active ? (underwater ? '#1e3a8a' : '#7f1d1d') : '#334155';
        ctx.fillRect(spike.x, spike.y + spike.h - 5, spike.w, 5);
        ctx.fillStyle = active ? (underwater ? '#93c5fd' : '#ef4444') : '#94a3b8';
        const count = Math.max(1, Math.floor(spike.w / 18));
        for (let i = 0; i < count; i++) {
            const x = spike.x + i * (spike.w / count);
            ctx.beginPath();
            ctx.moveTo(x, spike.y + spike.h);
            ctx.lineTo(x + spike.w / count / 2, spike.y);
            ctx.lineTo(x + spike.w / count, spike.y + spike.h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    });

    // 2.3 Desenhar Portões Deslizantes
    gates.forEach(gate => {
        ctx.fillStyle = '#78716c';
        ctx.fillRect(gate.x, gate.y, gate.w, gate.h);
        
        ctx.strokeStyle = '#44403c';
        ctx.lineWidth = 3;
        ctx.strokeRect(gate.x, gate.y, gate.w, gate.h);

        // Grade metálica interna
        ctx.strokeStyle = '#292524';
        ctx.lineWidth = 1.5;
        for (let gy = gate.y + 15; gy < gate.y + gate.h; gy += 15) {
            ctx.beginPath();
            ctx.moveTo(gate.x, gy);
            ctx.lineTo(gate.x + gate.w, gy);
            ctx.stroke();
        }
    });

    // 2.5 Desenhar Placa de Pressão
    if (pressurePlate) {
        ctx.fillStyle = '#44403c';
        ctx.fillRect(pressurePlate.x - 4, pressurePlate.y + 2, pressurePlate.w + 8, 8);
        
        ctx.fillStyle = pressurePlate.activated ? '#22c55e' : '#ef4444';
        const hBtn = pressurePlate.activated ? 3 : 7;
        ctx.fillRect(pressurePlate.x, pressurePlate.y + (10 - hBtn), pressurePlate.w, hBtn);
    }

    // 2.7 Desenhar Caixas (Frágeis e Móveis)
    boxes.forEach(box => {
        if (box.type === 'fragile') {
            ctx.fillStyle = '#92400e'; // Madeira
            ctx.fillRect(box.x, box.y, box.w, box.h);
            
            // X da caixa frágil
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(box.x + 8, box.y + 8);
            ctx.lineTo(box.x + box.w - 8, box.y + box.h - 8);
            ctx.moveTo(box.x + box.w - 8, box.y + 8);
            ctx.lineTo(box.x + 8, box.y + box.h - 8);
            ctx.stroke();

            // Bordas
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.w, box.h);
        } else {
            // Caixa Móvel
            ctx.fillStyle = '#57534e';
            ctx.fillRect(box.x, box.y, box.w, box.h);
            
            ctx.strokeStyle = '#a8a29e';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(box.x + 5, box.y + 5, box.w - 10, box.h - 10);
            ctx.strokeRect(box.x, box.y, box.w, box.h);

            // Gancho para o Tuiuiú puxar
            ctx.strokeStyle = '#d6d3d1';
            ctx.beginPath();
            ctx.arc(box.x + box.w / 2, box.y + 4, 8, Math.PI, 0);
            ctx.stroke();
        }
    });

    // 2.8 Desenhar Sucuris (pontos de ancoragem e cordas)
    snakes.forEach((s, si) => {
        const pivotX = s.x;
        const pivotY = s.y;
        const L = s.length || 160;
        // se alguém está preso, desenhar até a capivara
        let endX = pivotX;
        let endY = pivotY + L;
        if (capivara && capivara.attachedSnake === si) {
            endX = capivara.x + capivara.width / 2;
            endY = capivara.y + capivara.height / 2;
        } else if (s.angle) {
            endX = pivotX + L * Math.sin(s.angle);
            endY = pivotY + L * Math.cos(s.angle);
        } else {
            endX = pivotX;
            endY = pivotY + L;
        }

        // Corpo da sucuri (linha grossa)
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Cabeça/âncora
        ctx.fillStyle = '#14532d';
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 8, 0, Math.PI * 2);
        ctx.fill();
    });

    // 3. Desenhar Elementos Interativos do Puzzle
    
    // A) Botão no teto/alto
    ctx.fillStyle = buttonActivated ? '#22c55e' : '#ef4444';
    ctx.fillRect(highButton.x, highButton.y, highButton.w, highButton.h);
    ctx.fillStyle = '#78716c';
    ctx.fillRect(highButton.x - 5, highButton.y + 10, highButton.w + 10, 5);

    // B) Alavanca no fundo da água
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#a8a29e';
    ctx.fillStyle = '#57534e';
    ctx.fillRect(waterLever.x - 8, waterLever.y + 15, 30, 15);
    ctx.beginPath();
    ctx.moveTo(waterLever.x + 8, waterLever.y + 15);
    if (leverActivated) {
        ctx.lineTo(waterLever.x + 22, waterLever.y);
        ctx.stroke();
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(waterLever.x + 22, waterLever.y, 6, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.lineTo(waterLever.x + 8, waterLever.y - 10);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(waterLever.x + 8, waterLever.y - 10, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // C) Porta de Saída
    ctx.fillStyle = door.color;
    ctx.fillRect(door.x, door.y, door.w, door.h);
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 3;
    ctx.strokeRect(door.x, door.y, door.w, door.h);

    if (doorOpened) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
        ctx.fillRect(door.x, door.y, door.w, door.h);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(door.x + door.w / 2 - 3, door.y, 6, door.h);
    } else {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(door.x + door.w / 2 - 6, door.y + door.h / 2 - 6, 12, 12);
    }

    // 4. Atualizar Física das Entidades (se ativo)
    if (gameActive && !isVictorious) {
        updateBoxes();
        capivara.update();
        tuiuiu.update();
        checkCollisionsAndTriggers();
    }

    // 5. Desenhar Personagens
    capivara.draw();
    tuiuiu.draw();

    // 6. Desenhar a ÁGUA com Bolhas e Ondulação
    // Gerar bolhas aleatórias flutuando do fundo da água
    if (waterArea.w > 0 && Math.random() < 0.08) {
        const px = waterArea.x + Math.random() * waterArea.w;
        const py = waterArea.y + waterArea.h - 5;
        particles.push(new Particle(px, py, 0, -Math.random() * 0.4 - 0.4, 'rgba(147, 197, 253, 0.5)', Math.random() * 2.5 + 1, 0.9, 0.012, 'bubble'));
    }

    // Atualizar e Desenhar Partículas
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw();
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Corpo de água translúcido
    ctx.fillStyle = 'rgba(29, 78, 216, 0.42)';
    ctx.fillRect(waterArea.x, waterArea.y, waterArea.w, waterArea.h);

    // Ondulação na superfície
    if (waterArea.w > 0) {
        ctx.fillStyle = 'rgba(96, 165, 250, 0.75)';
        const waveWidth = 8;
        const waveHeight = 3.5;
        const time = Date.now() * 0.0055;

        ctx.beginPath();
        ctx.moveTo(waterArea.x, waterArea.y);
        for (let x = waterArea.x; x <= waterArea.x + waterArea.w; x += waveWidth) {
            const y = waterArea.y + Math.sin((x / waveWidth) + time) * waveHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(waterArea.x + waterArea.w, waterArea.y + waterArea.h);
        ctx.lineTo(waterArea.x, waterArea.y + waterArea.h);
        ctx.closePath();
        ctx.fill();
    }

    // 7. Iluminação de Caverna (Vinheta de gradiente radial no centro do mapa)
    const ambientLight = ctx.createRadialGradient(
        GAME_WIDTH / 2, GAME_HEIGHT / 2, 250,
        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.72
    );
    ambientLight.addColorStop(0, 'rgba(0, 0, 0, 0)');
    ambientLight.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
    ctx.fillStyle = ambientLight;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Efeitos de brilho das luzes ativadas (Composite Mode)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    if (doorOpened) {
        const dGlow = ctx.createRadialGradient(
            door.x + door.w / 2, door.y + door.h / 2, 5,
            door.x + door.w / 2, door.y + door.h / 2, 70
        );
        dGlow.addColorStop(0, 'rgba(34, 197, 94, 0.4)');
        dGlow.addColorStop(1, 'rgba(34, 197, 94, 0)');
        ctx.fillStyle = dGlow;
        ctx.fillRect(door.x - 90, door.y - 90, door.w + 180, door.h + 180);
    }

    const drawItemGlow = (x, y, color) => {
        const glow = ctx.createRadialGradient(x, y, 3, x, y, 35);
        glow.addColorStop(0, color);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 35, 0, Math.PI * 2);
        ctx.fill();
    };

    if (highButton.w > 0) {
        drawItemGlow(highButton.x + highButton.w / 2, highButton.y + highButton.h / 2, buttonActivated ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.2)');
    }
    if (waterLever.w > 0) {
        drawItemGlow(waterLever.x + waterLever.w / 2, waterLever.y + waterLever.h / 2, leverActivated ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.2)');
    }
    ctx.restore();

    // 8. Desenhar tela de transição de fase (Fade Out de transição)
    if (levelTransitionTimer > 0) {
        const alpha = Math.min(1.0, levelTransitionTimer / 30);
        ctx.fillStyle = `rgba(12, 10, 9, ${alpha})`; // Cor de fundo bem escura
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`; // Cor âmbar
        ctx.font = "bold 42px 'Fredoka One', cursive, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(levelNameToShow, GAME_WIDTH / 2, GAME_HEIGHT / 2);

        levelTransitionTimer--;
    }

    ctx.restore(); // Restaura tremor de tela

    requestAnimationFrame(gameLoop);
}

// Iniciar Loop e carregar primeira fase
window.addEventListener('DOMContentLoaded', () => {
    initializeCutscene();
    window.startGame = startGame;
    window.skipCutscene = skipCutscene;
    gameLoop();
});
