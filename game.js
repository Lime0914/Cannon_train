window.addEventListener('load', function() {
    // =====================================================================
    // PART 1: 게임 설정
    // =====================================================================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const loader = document.getElementById('loader');
    const uiOverlay = document.getElementById('ui-overlay');

    const SCREEN_WIDTH = 800;
    const SCREEN_HEIGHT = 600;
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;

    // 게임 상수 (Python과 100% 동일)
    const FPS = 60;
    const GRAVITY_Y = -900.0;
    const GROUND_Y = 50.0;
    const CANNON_X = 100;
    const CANNON_Y = GROUND_Y + 20;
    const MAX_WIND_FORCE = 200.0;

    const COLOR_BACKGROUND = "#ADD8E6";
    const COLOR_GROUND = "#228B22";
    const COLOR_CANNON = "#36454F";
    const COLOR_BALL = "#000000";
    const COLOR_HOLE = "#696969";

    // =====================================================================
    // PART 2: 게임 상태 및 객체
    // =====================================================================
    let ortSession = null;
    let gameState = 'LOADING';
    let animationFrameId;

    let cannon = {
        angle: Math.PI / 4,
        power: 450,
        minAngle: 0,
        maxAngle: Math.PI / 2,
        minPower: 100,
        maxPower: 800,
    };

    let target = { x: 0, y: GROUND_Y };
    let ball = {
        active: false,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 }
    };
    let windForce = 0.0;
    
    function resetLevel() {
        ball.active = false;
        target.x = 400 + Math.random() * (SCREEN_WIDTH - 500);
        windForce = (Math.random() * 2 - 1) * MAX_WIND_FORCE;
        uiOverlay.textContent = `Wind: ${(windForce / MAX_WIND_FORCE * 10).toFixed(1)}`;
        gameState = 'READY';
    }

    // =====================================================================
    // PART 3: 렌더링 함수
    // =====================================================================
    function draw() {
        ctx.fillStyle = COLOR_BACKGROUND;
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        ctx.fillStyle = COLOR_GROUND;
        ctx.fillRect(0, SCREEN_HEIGHT - GROUND_Y, SCREEN_WIDTH, SCREEN_HEIGHT);

        // 목표 지점 그리기
        const targetX_screen = target.x;
        const targetY_screen = SCREEN_HEIGHT - target.y;
        ctx.fillStyle = COLOR_HOLE;
        ctx.fillRect(targetX_screen - 20, targetY_screen, 40, -40);

        // 대포 그리기
        const barrelLength = 40;
        const startY_flipped = SCREEN_HEIGHT - CANNON_Y;
        const endX = CANNON_X + barrelLength * Math.cos(cannon.angle);
        const endY = SCREEN_HEIGHT - (CANNON_Y + barrelLength * Math.sin(cannon.angle));
        ctx.strokeStyle = COLOR_CANNON;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(CANNON_X, startY_flipped);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.fillStyle = COLOR_CANNON;
        ctx.beginPath();
        ctx.arc(CANNON_X, startY_flipped, 15, 0, Math.PI * 2);
        ctx.fill();

        // 포탄 그리기
        if (ball.active) {
            const ballX_screen = ball.pos.x;
            const ballY_screen = SCREEN_HEIGHT - ball.pos.y;
            ctx.fillStyle = COLOR_BALL;
            ctx.beginPath();
            ctx.arc(ballX_screen, ballY_screen, 8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // =====================================================================
    // PART 4: AI 모델 통합
    // =====================================================================
    function getNormalizedObservation() {
        const norm_angle = (cannon.angle - cannon.minAngle) / (cannon.maxAngle - cannon.minAngle) * 2 - 1;
        const norm_power = (cannon.power - cannon.minPower) / (cannon.maxPower - cannon.minPower) * 2 - 1;
        const norm_target_x = (target.x / SCREEN_WIDTH) * 2 - 1;
        const norm_target_y = (target.y / SCREEN_HEIGHT) * 2 - 1;
        const norm_wind = windForce / MAX_WIND_FORCE;
        return new Float32Array([norm_angle, norm_power, norm_target_x, norm_target_y, norm_wind]);
    }

    function unnormalizeAction(normalizedAction) {
        const angle = (normalizedAction[0] + 1) / 2 * (cannon.maxAngle - cannon.minAngle) + cannon.minAngle;
        const power = (normalizedAction[1] + 1) / 2 * (cannon.maxPower - cannon.minPower) + cannon.minPower;
        return { angle, power };
    }

    async function runInferenceAndFire() {
        gameState = 'WAITING'; // 중복 실행 방지
        const observation = getNormalizedObservation();
        const obsTensor = new ort.Tensor('float32', observation, [1, 5]);
        const results = await ortSession.run({ 'observation': obsTensor });
        const actionTensor = results.action;
        let { angle, power } = unnormalizeAction(actionTensor.data);
        
        cannon.angle = Math.max(cannon.minAngle, Math.min(cannon.maxAngle, angle));
        cannon.power = power;
        fireCannon();
    }

    function fireCannon() {
        const barrelLength = 40;
        const startX = CANNON_X + barrelLength * Math.cos(cannon.angle);
        const startY = CANNON_Y + barrelLength * Math.sin(cannon.angle);
        
        ball.pos = { x: startX, y: startY };
        ball.vel = {
            x: cannon.power * Math.cos(cannon.angle),
            y: cannon.power * Math.sin(cannon.angle)
        };
        ball.active = true;
        gameState = 'FIRING';
    }

    // =====================================================================
    // PART 5: 메인 게임 루프
    // =====================================================================
    function update(dt) {
        if (!ball.active) return;
        
        // 물리 업데이트 (Python 코드와 100% 동일)
        ball.vel.x += windForce * dt;
        ball.vel.y += GRAVITY_Y * dt;
        ball.pos.x += ball.vel.x * dt;
        ball.pos.y += ball.vel.y * dt;
        
        // 지면 충돌
        if (ball.pos.y < GROUND_Y) {
            ball.pos.y = GROUND_Y;
            ball.vel.y *= -0.6; // 탄성
            ball.vel.x *= 0.9;  // 마찰
        }
    }
    
    function gameLoop() {
        if (gameState === 'LOADING' || gameState === 'WAITING') {
            draw();
            animationFrameId = requestAnimationFrame(gameLoop);
            return;
        }

        if (gameState === 'READY') {
            runInferenceAndFire();
        }
        
        if (gameState === 'FIRING') {
            update(1.0 / FPS);

            const distToTarget = Math.sqrt(Math.pow(ball.pos.x - target.x, 2) + Math.pow(ball.pos.y - target.y, 2));
            const velMag = Math.sqrt(ball.vel.x**2 + ball.vel.y**2);

            // 성공
            if (distToTarget < 20 && velMag < 50) {
                console.log("Success!");
                gameState = 'DONE';
            }
            // 실패: 화면 이탈
            else if (! (0 < ball.pos.x < SCREEN_WIDTH)) {
                console.log("Failed: Out of bounds");
                gameState = 'DONE';
            }
            // 실패: 멈춤
            else if (ball.pos.y <= GROUND_Y && velMag < 1.0) {
                console.log("Failed: Stopped");
                gameState = 'DONE';
            }
        }
        
        if (gameState === 'DONE') {
            setTimeout(resetLevel, 1000);
            gameState = 'WAITING';
        }

        draw();
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    async function initialize() {
        try {
            ortSession = await ort.InferenceSession.create('./model.onnx');
            console.log("AI 모델 로딩 성공!");
            loader.style.display = 'none';
            resetLevel();
            animationFrameId = requestAnimationFrame(gameLoop);
        } catch (e) {
            console.error(`AI 모델 로딩 실패: ${e}`);
            loader.textContent = "오류: model.onnx 로드 실패. 파일이 올바른 위치에 있는지 확인하세요.";
        }
    }

    initialize();
});
