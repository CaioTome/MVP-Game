
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

// Estrutura física das plataformas (X, Y, Largura, Altura)
const platforms = [
    { x: 0, y: 650, w: 820, h: 70, type: 'ground' }, // Chão esquerdo principal
    { x: 1100, y: 650, w: 180, h: 70, type: 'ground' }, // Chão direito
    { x: 820, y: 700, w: 280, h: 20, type: 'water-floor' }, // Fundo da água
    { x: 800, y: 530, w: 20, h: 120, type: 'ground' }, // Parede esquerda tanque (Altura reduzida)
    { x: 1100, y: 530, w: 20, h: 120, type: 'ground' }, // Parede direita tanque (Altura reduzida)
    { x: 0, y: 250, w: 200, h: 20, type: 'platform' }, // Plataforma Botão Tuiuiú
    { x: 250, y: 0, w: 20, h: 450, type: 'ground' }, // Divisória de puzzle
    { x: 350, y: 350, w: 150, h: 20, type: 'platform' }, // Início Caixa Móvel
    { x: 650, y: 540, w: 150, h: 20, type: 'platform' }, // Degrau para mergulho (Altura reduzida)
];

// Caixas dinâmicas (Frágeis e Móveis)
let boxes = [
    { x: 240, y: 450, w: 40, h: 200, type: 'fragile' }, // Barreira que a Capivara deve quebrar
    { x: 400, y: 300, w: 50, h: 50, type: 'movable', vy: 0 }, // Caixa que o Tuiuiú puxa
];

// Definindo a zona de Água (Mergulho da Capivara)
const waterArea = {
    x: 820, y: 530, w: 280, h: 170
};

// Entidades Interativas
const door = { x: 1180, y: 580, w: 55, h: 70, color: '#ef4444' };
const highButton = { x: 50, y: 235, w: 30, h: 15, activated: false };
const waterLever = { x: 950, y: 660, w: 15, h: 40, activated: false };

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
        this.facingRight = true;
    }

    update() {
        this.animationTimer += 0.15;

        // 1. Checar se está na água
        this.inWater = (
            this.x + this.width > waterArea.x &&
            this.x < waterArea.x + waterArea.w &&
            this.y + this.height > waterArea.y &&
            this.y < waterArea.y + waterArea.h
        );

        // 2. Aplicar Física apropriada para o local/tipo
        if (this.type === 'capivara') {
            if (this.inWater) {
                // Movimento de natação da Capivara (Fluido e 360 graus)
                const speed = 2.5;
                if (keys.a || touchState.capyLeft) { this.vx = -speed; this.facingRight = false; }
                else if (keys.d || touchState.capyRight) { this.vx = speed; this.facingRight = true; }
                else { this.vx *= 0.85; }

                if (keys.w || touchState.capyUp) { this.vy = -speed; }
                else if (keys.s || touchState.capyDown) { this.vy = speed; }
                else { this.vy *= 0.85; }

                // Gravidade na água é quase nula (empuxo)
                this.isGrounded = false;
            } else {
                // Movimento terrestre da Capivara
                const speed = 3.5;
                const gravity = 0.4;

                if (keys.a || touchState.capyLeft) { this.vx = -speed; this.facingRight = false; }
                else if (keys.d || touchState.capyRight) { this.vx = speed; this.facingRight = true; }
                else { this.vx *= 0.75; }

                this.vy += gravity; // Gravidade normal

                if ((keys.w || touchState.capyUp) && this.isGrounded) {
                    this.vy = -7.5; // Pulo
                    this.isGrounded = false;
                }

                // Ação de quebrar caixa frágil (Espaço)
                if (keys[' '] || touchState.capyUp) { // Usei o up do touch como quebra no mobile por simplicidade
                    boxes = boxes.filter(box => {
                        if (box.type !== 'fragile') return true;
                        // Verifica se a capivara está próxima de qualquer ponto da caixa (AABB expandido)
                        const isNear = (
                            this.x + this.width + 20 > box.x &&
                            this.x - 20 < box.x + box.w &&
                            this.y + this.height + 20 > box.y &&
                            this.y - 20 < box.y + box.h
                        );
                        return !isNear; // Remove se estiver perto
                    });
                }
            }
        } else if (this.type === 'tuiuiu') {
            // Tuiuiú flutua se encostar na água, mas não consegue mergulhar fundo
            if (this.inWater && this.y + this.height - 10 > waterArea.y) {
                // Mantém o tuiuiú flutuando no topo da água apenas se não estiver tentando voar para cima
                if (!(keys.ArrowUp || touchState.tuiUp)) {
                    this.y = waterArea.y - this.height + 15;
                    this.vy = 0;
                    this.isGrounded = true;
                }
            }

            // Movimento do Tuiuiú (Voo dinâmico)
            const speed = 4.0;
            const gravity = 0.22; // Gravidade mais leve para o pássaro planar

            if (keys.ArrowLeft || touchState.tuiLeft) { this.vx = -speed; this.facingRight = false; }
            else if (keys.ArrowRight || touchState.tuiRight) { this.vx = speed; this.facingRight = true; }
            else { this.vx *= 0.82; }

            // Controle de voo / flap
            if (keys.ArrowUp || touchState.tuiUp) {
                this.vy = -4.5; // Força contínua de voo
            } else if (keys.ArrowDown || touchState.tuiDown) {
                this.vy = 4.0; // Descida rápida
            } else {
                this.vy += gravity; // Gravidade puxando ele levemente para o chão
            }

            // Ação de puxar caixa móvel (Enter)
            if (keys.Enter) {
                boxes.forEach(box => {
                    if (box.type === 'movable') {
                        const dist = Math.hypot(
                            (this.x + this.width / 2) - (box.x + box.w / 2),
                            (this.y + this.height / 2) - (box.y + box.h / 2)
                        );
                        if (dist < 70) {
                            box.isBeingPulled = true;
                            box.x += (this.x - box.x - (box.w / 2 - this.width / 2)) * 0.15;
                            box.y += (this.y - box.y - (box.h / 2 - this.height / 2)) * 0.15;
                            box.vy = 0;
                        }
                    }
                });
            } else {
                boxes.forEach(box => { if (box.type === 'movable') box.isBeingPulled = false; });
            }
        }

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
        // Tuiuiú não pode afundar no tanque de água, capivara sim
        const allSolid = [...platforms, ...boxes];
        for (let plat of allSolid) {
            // Colisão básica do retângulo do personagem com a plataforma
            if (this.x + this.width > plat.x &&
                this.x < plat.x + plat.w &&
                this.y + this.height > plat.y &&
                this.y < plat.y + plat.h) {

                // Se o Tuiuiú tentar entrar no chão da água, bloquear
                if (this.type === 'tuiuiu' && plat.type === 'water-floor') {
                    // Não faz colisão convencional para permitir que ele flutue acima dela na superfície da água
                    continue;
                }

                if (axis === 'x') {
                    // Colisão horizontal
                    if (this.vx > 0) {
                        this.x = plat.x - this.width;
                    } else if (this.vx < 0) {
                        this.x = plat.x + plat.w;
                    }
                    this.vx = 0;
                } else {
                    // Colisão vertical
                    if (this.vy > 0) {
                        this.y = plat.y - this.height;
                        this.isGrounded = true;
                    } else if (this.vy < 0) {
                        this.y = plat.y + plat.h;
                    }
                    this.vy = 0;
                }
            }
        }
    }

    draw() {
        ctx.save();

        // Efeito visual quando o personagem está na água
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
        ctx.fillStyle = '#92400e'; // Tom mais claro
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

        // Patinhas (apenas se não estiver na água ou pulando)
        if (!this.inWater && this.isGrounded) {
            ctx.fillStyle = '#451a03';
            const walkCycle = Math.sin(this.animationTimer) * 4;
            // Pata 1
            ctx.fillRect(centerX - 12, centerY + 10, 4, 6 + walkCycle);
            // Pata 2
            ctx.fillRect(centerX - 4, centerY + 10, 4, 6 - walkCycle);
            // Pata 3
            ctx.fillRect(centerX + 4, centerY + 10, 4, 6 + walkCycle);
            // Pata 4
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

        // Corpo Branco
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY + 8, 12, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pescoço Preto (Esticado, característico)
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

        // Bico Longo Amarelado/Preto
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        const beakDirection = this.facingRight ? 1 : -1;
        ctx.moveTo(centerX, centerY - 22);
        ctx.lineTo(centerX + (22 * beakDirection), centerY - 18);
        ctx.lineTo(centerX, centerY - 16);
        ctx.closePath();
        ctx.fill();

        // Olho do Tuiuiú
        ctx.fillStyle = '#fff';
        const eyeX = this.facingRight ? centerX + 2 : centerX - 4;
        ctx.beginPath();
        ctx.arc(eyeX, centerY - 21, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Pernas Longas (se no chão)
        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 2.5;
        if (this.vy === 0 || this.isGrounded) {
            // Perna esquerda
            ctx.beginPath();
            ctx.moveTo(centerX - 4, centerY + 22);
            ctx.lineTo(centerX - 4, centerY + 40);
            ctx.stroke();
            // Perna direita
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

        // Asas (Grandes e expressivas)
        ctx.fillStyle = '#e5e5e5';
        ctx.strokeStyle = '#737373';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (Math.abs(this.vy) > 0.5 || keys.ArrowUp || touchState.tuiUp) {
            // Asa batendo para cima/baixo
            ctx.ellipse(centerX - (8 * beakDirection), centerY + 4, 18, Math.abs(6 + flap), Math.PI / 4 * beakDirection, 0, Math.PI * 2);
        } else {
            // Asa recolhida
            ctx.ellipse(centerX - (4 * beakDirection), centerY + 6, 8, 14, -Math.PI / 12 * beakDirection, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
    }
}

// Criar personagens nas posições iniciais ideais
const capivara = new Character(100, 600, '#78350f', 'capivara', 'Capivara');
const tuiuiu = new Character(150, 600, '#ffffff', 'tuiuiu', 'Tuiuiú');

// Inicializar Teclado
window.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    const k = e.key.toLowerCase();

    // Impede que a página role ao usar as setas ou WASD
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
    }

    // Capivara (WASD)
    if (k === 'w') keys.w = true;
    if (k === 'a') keys.a = true;
    if (k === 's') keys.s = true;
    if (k === 'd') keys.d = true;
    if (k === ' ') keys[' '] = true;

    // Tuiuiú (Setas)
    if (e.key === 'ArrowUp') keys.ArrowUp = true;
    if (e.key === 'ArrowDown') keys.ArrowDown = true;
    if (e.key === 'ArrowLeft') keys.ArrowLeft = true;
    if (e.key === 'ArrowRight') keys.ArrowRight = true;
    if (e.key === 'Enter') keys.Enter = true;
});

window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();

    // Capivara
    if (k === 'w') keys.w = false;
    if (k === 'a') keys.a = false;
    if (k === 's') keys.s = false;
    if (k === 'd') keys.d = false;
    if (k === ' ') keys[' '] = false;

    // Tuiuiú
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

// Vincular todos os botões virtuais
bindTouchButton('btn-capy-up', 'capyUp');
bindTouchButton('btn-capy-down', 'capyDown');
bindTouchButton('btn-capy-left', 'capyLeft');
bindTouchButton('btn-capy-right', 'capyRight');

bindTouchButton('btn-tui-up', 'tuiUp');
bindTouchButton('btn-tui-down', 'tuiDown');
bindTouchButton('btn-tui-left', 'tuiLeft');
bindTouchButton('btn-tui-right', 'tuiRight');

// Alternar visualização do painel de controle mobile
function toggleTouchControls() {
    const container = document.getElementById('touchControlsContainer');
    container.classList.toggle('hidden');
}

// Física das caixas móveis
function updateBoxes() {
    boxes.forEach(box => {
        if (box.type === 'movable' && !box.isBeingPulled) {
            box.vy = (box.vy || 0) + 0.3; // Gravidade
            box.y += box.vy;

            for (let plat of platforms) {
                if (box.x < plat.x + plat.w && box.x + box.w > plat.x &&
                    box.y < plat.y + plat.h && box.y + box.h > plat.y) {
                    if (box.vy > 0) {
                        box.y = plat.y - box.h;
                        box.vy = 0;
                    }
                }
            }
        }
    });
}

// Funções de Controle do Estado do Jogo
function startGame() {
    document.getElementById('tutorialOverlay').classList.add('hidden');
    gameActive = true;
    // Não chama resetGameLogic aqui para não limpar as caixas que acabaram de ser criadas
    capivara.reset();
    tuiuiu.reset();
}

function resetGame() {
    document.getElementById('victoryOverlay').classList.add('hidden');
    resetGameLogic();
    // Reposicionar caixas ao reiniciar
    boxes = [
        { x: 240, y: 450, w: 40, h: 200, type: 'fragile' },
        { x: 400, y: 300, w: 50, h: 50, type: 'movable', vy: 0 },
    ];
}

function resetGameLogic() {
    capivara.reset();
    tuiuiu.reset();
    leverActivated = false;
    buttonActivated = false;
    doorOpened = false;
    isVictorious = false;

    // Limpar teclas
    for (let k in keys) keys[k] = false;
    for (let t in touchState) touchState[t] = false;

    updateUI();
}

function triggerVictory() {
    isVictorious = true;
    gameActive = false;
    document.getElementById('victoryOverlay').classList.remove('hidden');
}

// Atualizar os painéis do cabeçalho
function updateUI() {
    const indLever = document.getElementById('indicator-lever');
    const indButton = document.getElementById('indicator-button');
    const indDoor = document.getElementById('indicator-door');

    // Alavanca da Capivara
    if (leverActivated) {
        indLever.classList.replace('bg-red-500', 'bg-green-500');
    } else {
        indLever.classList.replace('bg-green-500', 'bg-red-500');
    }

    // Botão do Tuiuiú
    if (buttonActivated) {
        indButton.classList.replace('bg-red-500', 'bg-green-500');
    } else {
        indButton.classList.replace('bg-green-500', 'bg-red-500');
    }

    // Status do Portal / Porta de Saída
    if (doorOpened) {
        indDoor.textContent = "Aberto! Vá até lá";
        indDoor.className = "text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30";
    } else {
        indDoor.textContent = "Bloqueado";
        indDoor.className = "text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30";
    }
}

// Verificação das interações do puzzle
function checkCollisionsAndTriggers() {
    // 1. Capivara ativa Alavanca Subaquática
    // Apenas ela consegue ativar (verificando tipo do personagem)
    if (!leverActivated) {
        const distToLever = Math.hypot(
            (capivara.x + capivara.width / 2) - (waterLever.x + waterLever.w / 2),
            (capivara.y + capivara.height / 2) - (waterLever.y + waterLever.h / 2)
        );
        // Distância pequena significa que tocou na alavanca subaquática
        if (distToLever < 35 && capivara.inWater) {
            leverActivated = true;
            waterLever.activated = true;
            updateUI();
        }
    }

    // 2. Tuiuiú ativa o Botão Elevado
    if (!buttonActivated) {
        const distToButton = Math.hypot(
            (tuiuiu.x + tuiuiu.width / 2) - (highButton.x + highButton.w / 2),
            (tuiuiu.y + tuiuiu.height / 2) - (highButton.y + highButton.h / 2)
        );
        // Tuiuiú voou perto o suficiente do botão na plataforma do topo esquerdo
        if (distToButton < 30) {
            buttonActivated = true;
            highButton.activated = true;
            updateUI();
        }
    }

    // 3. Checar se ambos foram ativados para abrir a porta
    if (leverActivated && buttonActivated && !doorOpened) {
        doorOpened = true;
        door.color = '#22c55e'; // Fica verde indicando sucesso
        updateUI();
    }

    // 4. Checar se AMBOS chegaram à porta aberta para escapar
    if (doorOpened) {
        const capyAtDoor = (
            capivara.x + capivara.width > door.x &&
            capivara.x < door.x + door.w &&
            capivara.y + capivara.height > door.y &&
            capivara.y < door.y + door.h
        );

        const tuiuiuAtDoor = (
            tuiuiu.x + tuiuiu.width > door.x &&
            tuiuiu.x < door.x + door.w &&
            tuiuiu.y + tuiuiu.height > door.y &&
            tuiuiu.y < door.y + door.h
        );

        if (capyAtDoor && tuiuiuAtDoor && !isVictorious) {
            triggerVictory();
        }
    }
}

// Loop de Renderização e Física Principal
function gameLoop() {
    // Limpar Tela
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 1. Desenhar Fundo de Caverna/Templo antigo do Pantanal
    ctx.fillStyle = '#292524'; // Parede de pedra escura
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Detalhes da parede (Tijolos/Ruínas de fundo)
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(100, 80, 120, 40);
    ctx.fillRect(350, 150, 80, 50);
    ctx.fillRect(600, 100, 90, 40);

    // 2. Desenhar as plataformas físicas
    platforms.forEach(plat => {
        if (plat.type === 'ground' || plat.type === 'platform') {
            ctx.fillStyle = '#44403c'; // Pedra cinza das ruínas
            ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

            // Detalhe de grama sobre as ruínas superiores
            ctx.fillStyle = '#15803d'; // Verde Pantanal
            ctx.fillRect(plat.x, plat.y, plat.w, 4);
        } else if (plat.type === 'water-floor') {
            ctx.fillStyle = '#1e293b'; // Chão escuro sob a água
            ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
        }
    });

    // 2.5 Desenhar Caixas
    boxes.forEach(box => {
        if (box.type === 'fragile') {
            ctx.fillStyle = '#92400e'; // Madeira
            ctx.fillRect(box.x, box.y, box.w, box.h);
            ctx.strokeStyle = '#f97316'; // Laranja
            ctx.lineWidth = 4;
            // Desenhar o X laranja
            ctx.beginPath();
            ctx.moveTo(box.x + 8, box.y + 8);
            ctx.lineTo(box.x + box.w - 8, box.y + box.h - 8);
            ctx.moveTo(box.x + box.w - 8, box.y + 8);
            ctx.lineTo(box.x + 8, box.y + box.h - 8);
            ctx.stroke();
        } else {
            ctx.fillStyle = '#57534e'; // Metal/Pedra móvel
            ctx.fillRect(box.x, box.y, box.w, box.h);
            ctx.strokeStyle = '#a8a29e';
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x + 5, box.y + 5, box.w - 10, box.h - 10);
            // Alça para o Tuiuiú puxar
            ctx.beginPath();
            ctx.arc(box.x + box.w/2, box.y + 5, 8, Math.PI, 0);
            ctx.stroke();
        }
        ctx.strokeRect(box.x, box.y, box.w, box.h);
    });

    // 3. Desenhar Elementos Interativos do Puzzle

    // A) Botão no teto/alto (para o Tuiuiú)
    ctx.fillStyle = buttonActivated ? '#22c55e' : '#ef4444';
    ctx.fillRect(highButton.x, highButton.y, highButton.w, highButton.h);
    // Suporte do botão
    ctx.fillStyle = '#78716c';
    ctx.fillRect(highButton.x - 5, highButton.y + 10, highButton.w + 10, 5);

    // B) Alavanca no fundo da água (para a Capivara)
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#a8a29e';
    // Base da alavanca
    ctx.fillStyle = '#57534e';
    ctx.fillRect(waterLever.x - 8, waterLever.y + 15, 30, 15);
    // Haste
    ctx.beginPath();
    ctx.moveTo(waterLever.x + 8, waterLever.y + 15);
    if (leverActivated) {
        // Alavanca inclinada para a direita (Ativada)
        ctx.lineTo(waterLever.x + 22, waterLever.y);
        ctx.stroke();
        // Bola da Alavanca
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(waterLever.x + 22, waterLever.y, 6, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Alavanca reta para cima (Desativada)
        ctx.lineTo(waterLever.x + 8, waterLever.y - 10);
        ctx.stroke();
        // Bola da Alavanca
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(waterLever.x + 8, waterLever.y - 10, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // C) Porta de Saída
    ctx.fillStyle = door.color;
    ctx.fillRect(door.x, door.y, door.w, door.h);

    // Detalhes da Porta (Bordas, Arco e Trinco)
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 3;
    ctx.strokeRect(door.x, door.y, door.w, door.h);

    // Se a porta estiver aberta, desenhar abertura luminosa
    if (doorOpened) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.fillRect(door.x, door.y, door.w, door.h);
        ctx.fillStyle = '#fef08a'; // Fresta dourada brilhante
        ctx.fillRect(door.x + door.w / 2 - 3, door.y, 6, door.h);
    } else {
        // Cadeado central desenhado
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(door.x + door.w / 2 - 6, door.y + door.h / 2 - 6, 12, 12);
    }

    // 4. Atualizar Física e Posições (se jogo ativo)
    if (gameActive && !isVictorious) {
        updateBoxes();
        capivara.update();
        tuiuiu.update();
        checkCollisionsAndTriggers();
    }

    // 5. Desenhar Personagens
    capivara.draw();
    tuiuiu.draw();

    // 6. Desenhar a ÁGUA (Transparente no topo para vermos o fundo e os personagens mergulhando)
    ctx.fillStyle = 'rgba(29, 78, 216, 0.45)'; // Azul translúcido
    ctx.fillRect(waterArea.x, waterArea.y, waterArea.w, waterArea.h);

    // Superfície da água ondulando levemente
    ctx.fillStyle = 'rgba(96, 165, 250, 0.8)';
    const waveWidth = 10;
    const waveHeight = 3;
    const time = Date.now() * 0.005;

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

    // Loop Infinito
    requestAnimationFrame(gameLoop);
}

// Iniciar loop ao carregar a página
window.onload = function () {
    gameLoop();
};
