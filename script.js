document.addEventListener('DOMContentLoaded', () => {
    // --- Matter.js 모듈 ---
    const { Engine, World, Bodies, Body, Events, Vector, Composite } = Matter;

    // --- 상수 ---
    const SCREEN_WIDTH = 800;
    const SCREEN_HEIGHT = 600;
    const GROUND_THICKNESS = 50;
    const BALL_RADIUS = 8;
    const BALL_MASS = 1.05;
    const CANNON_POS = { x: 100, y: SCREEN_HEIGHT - GROUND_THICKNESS - 20 };
    const HOLE_WIDTH = 40;
    const HOLE_HEIGHT = 40;

    // --- DOM 요소 ---
    const canvas = document.getElementById('game-canvas');
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    const ctx = canvas.getContext('2d');
    const statusMessage = document.getElementById('status-message');

    const sliders = {
        target: document.getElementById('target-slider'),
        wind: document.getElementById('wind-slider'),
        angle: document.getElementById('angle-slider'),
        power: document.getElementById('power-slider'),
    };
    const values = {
        target: document.getElementById('target-value'),
        wind: document.getElementById('wind-value'),
        angle: document.getElementById('angle-value'),
        power: document.getElementById('power-value'),
    };
    const buttons = {
        fire: document.getElementById('fire-button'),
        aiSolve: document.getElementById('ai-solve-button'),
        reset: document.getElementById('reset-button'),
    };
    
    // --- 게임 상태 변수 ---
    let engine, world;
    let ground, ball;
    let targetHoleGroup = []; 
    let cannonAngle = 45 * (Math.PI / 180);
    let cannonPower = 450;
    let isFiring = false;
    let ortSession = null;

    // --- 게임 초기화 ---
    function init() {
        engine = Engine.create();
        world = engine.world;
        engine.gravity.y = 1;
        engine.gravity.scale = 0.0018;

        ground = Bodies.rectangle(SCREEN_WIDTH / 2, SCREEN_HEIGHT - GROUND_THICKNESS / 2, SCREEN_WIDTH, GROUND_THICKNESS, { 
            isStatic: true,
            friction: 1.2,
            restitution: 0.6,
        });

        World.add(world, ground);
        createLevel();
        setupEventListeners();
        
        requestAnimationFrame(gameLoop);
        loadOnnxModel(); 
    }
    
    // --- 레벨 생성 ---
    function createLevel() {
        if (ball) Composite.remove(world, ball);
        if (targetHoleGroup.length > 0) {
            Composite.remove(world, targetHoleGroup);
            targetHoleGroup = [];
        }

        const targetX = parseFloat(sliders.target.value);
        const wallThickness = 8;
        const holeY = SCREEN_HEIGHT - GROUND_THICKNESS - (HOLE_HEIGHT / 2);
        
        const leftWall = Bodies.rectangle(targetX - HOLE_WIDTH / 2, holeY, wallThickness, HOLE_HEIGHT, { isStatic: true });
        const rightWall = Bodies.rectangle(targetX + HOLE_WIDTH / 2, holeY, wallThickness, HOLE_HEIGHT, { isStatic: true });
        const bottomWall = Bodies.rectangle(targetX, holeY + HOLE_HEIGHT/2 - wallThickness/2, HOLE_WIDTH + wallThickness, wallThickness, { isStatic: true });
        const sensor = Bodies.rectangle(targetX, holeY, HOLE_WIDTH - wallThickness, 1, {
            isStatic: true,
            isSensor: true,
            label: 'hole_sensor'
        });

        targetHoleGroup = [leftWall, rightWall, bottomWall, sensor];
        Composite.add(world, targetHoleGroup);
        
        isFiring = false;
        
        const windValue = parseFloat(sliders.wind.value);
        world.gravity.x = windValue / 20000;
    }
    
    // --- 이벤트 리스너 설정 ---
    function setupEventListeners() {
        for (const key in sliders) {
            sliders[key].addEventListener('input', handleSliderChange);
        }

        buttons.fire.addEventListener('click', fireCannon);
        buttons.reset.addEventListener('click', () => {
             sliders.target.value = 400 + Math.random() * 300;
             sliders.wind.value = -10 + Math.random() * 20;
             handleSliderChange({ target: sliders.target });
             handleSliderChange({ target: sliders.wind });
             showMessage("");
        });
        buttons.aiSolve.addEventListener('click', aiSolve);

        Events.on(engine, 'collisionStart', (event) => {
            if (!isFiring) return;
            const pairs = event.pairs;
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                if ((pair.bodyA.label === 'ball' && pair.bodyB.label === 'hole_sensor') ||
                    (pair.bodyB.label === 'ball' && pair.bodyA.label === 'hole_sensor')) {
                    winCondition();
                }
            }
        });
    }

    // --- 슬라이더 변경 핸들러 ---
    function handleSliderChange(e) {
        const slider = e.target;
        if (slider === sliders.angle) {
            cannonAngle = parseFloat(slider.value) * (Math.PI / 180);
            values.angle.textContent = `${slider.value}°`;
        } else if (slider === sliders.power) {
            cannonPower = parseFloat(slider.value);
            values.power.textContent = slider.value;
        } else if (slider === sliders.target) {
            values.target.textContent = slider.value;
            createLevel();
        } else if (slider === sliders.wind) {
            values.wind.textContent = slider.value;
            const windValue = parseFloat(sliders.wind.value);
            world.gravity.x = windValue / 20000;
        }
    }

    // --- 게임 액션 ---
    function fireCannon() {
        if (isFiring) return;
        isFiring = true;
        if (ball) Composite.remove(world, ball);

        const barrelLength = 40;
        const startPos = {
            x: CANNON_POS.x + barrelLength * Math.cos(cannonAngle),
            y: CANNON_POS.y - barrelLength * Math.sin(cannonAngle)
        };

        ball = Bodies.circle(startPos.x, startPos.y, BALL_RADIUS, {
            mass: BALL_MASS,
            restitution: 0.6,
            friction: 0.9,
            frictionAir: 0,
            label: 'ball'
        });

        const velocityMagnitude = cannonPower / (60 * BALL_MASS);
        const velocity = Vector.create(
            Math.cos(cannonAngle) * velocityMagnitude,
            -Math.sin(cannonAngle) * velocityMagnitude
        );
        
        World.add(world, ball);
        Body.setVelocity(ball, velocity);
        
        setTimeout(() => {
            if (isFiring) {
                isFiring = false;
                showMessage("실패!", "#e27d60");
            }
        }, 10000);
    }
    
    function winCondition() {
        if (!isFiring) return;
        isFiring = false;
        showMessage("성공!", "#50e3c2");
        Composite.remove(world, ball);
    }
    
    function showMessage(msg, color = '#fff') {
        statusMessage.textContent = msg;
        statusMessage.style.backgroundColor = msg === "" ? "transparent" : (color === '#fff' ? 'rgba(0,0,0,0.6)' : color);
        statusMessage.style.opacity = msg === "" ? 0 : 1;
    }

    // --- ONNX AI 로더 및 솔버 ---
    async function loadOnnxModel() {
        try {
            showMessage("AI 모델을 로딩 중입니다...");
            ortSession = await ort.InferenceSession.create('./model.onnx');
            console.log("ONNX Model Loaded. Input Names:", ortSession.inputNames, "Output Names:", ortSession.outputNames);
            showMessage("AI 모델 로딩 완료!", "#50e3c2");
            setTimeout(() => showMessage(""), 2000);
        } catch (e) {
            console.error(`ONNX 모델 로딩 실패: ${e}`);
            showMessage("AI 모델 로딩 실패!", "#e27d60");
        }
    }

    async function aiSolve() {
        if (!ortSession) {
            showMessage("AI 모델이 아직 로딩되지 않았습니다.", "#e27d60");
            return;
        }
        if (isFiring) return;

        showMessage("AI가 계산 중입니다...");

        try {
            const cannon = { min_angle: 0, max_angle: Math.PI / 2, min_power: 100, max_power: 800 };
            const MAX_WIND_FORCE = 10.0;
            
            const norm_angle = (cannonAngle - cannon.min_angle) / (cannon.max_angle - cannon.min_angle) * 2 - 1;
            const norm_power = (cannonPower - cannon.min_power) / (cannon.max_power - cannon.min_power) * 2 - 1;
            const norm_target_x = (parseFloat(sliders.target.value) / SCREEN_WIDTH) * 2 - 1;
            const norm_target_y = ((SCREEN_HEIGHT - GROUND_THICKNESS) / SCREEN_HEIGHT) * 2 - 1;
            const norm_wind = parseFloat(sliders.wind.value) / MAX_WIND_FORCE;
            
            const inputTensor = new ort.Tensor('float32', [norm_angle, norm_power, norm_target_x, norm_target_y, norm_wind], [1, 5]);
            
            const feeds = { 'observation': inputTensor };

            const results = await ortSession.run(feeds);
            
            // <<< 여기가 수정된 부분입니다 (actions -> action) >>>
            // Python 스크립트에서 지정한 출력 이름 'action'을 사용합니다.
            const actionTensor = results.action.data;
            
            const predicted_norm_angle = actionTensor[0];
            const predicted_norm_power = actionTensor[1];
            
            let finalAngle = (predicted_norm_angle + 1) / 2 * (cannon.max_angle - cannon.min_angle) + cannon.min_angle;
            let finalPower = (predicted_norm_power + 1) / 2 * (cannon.max_power - cannon.min_power) + cannon.min_power;

            finalAngle = Math.max(cannon.min_angle, Math.min(finalAngle, cannon.max_angle));
            finalPower = Math.max(cannon.min_power, Math.min(finalPower, cannon.max_power));
            
            sliders.angle.value = finalAngle * (180 / Math.PI);
            sliders.power.value = finalPower;
            handleSliderChange({ target: sliders.angle });
            handleSliderChange({ target: sliders.power });

            showMessage("");
            fireCannon();
        } catch(e) {
            console.error("AI 추론 중 오류 발생:", e);
            showMessage("AI 실행 오류!", "#e27d60");
        }
    }

    // --- 메인 게임 루프 (렌더링) ---
    function gameLoop() {
        Engine.update(engine);
        ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        ctx.fillStyle = '#228B22'; // Ground
        ctx.fillRect(0, SCREEN_HEIGHT - GROUND_THICKNESS, SCREEN_WIDTH, GROUND_THICKNESS);

        ctx.save();
        ctx.translate(CANNON_POS.x, CANNON_POS.y);
        ctx.fillStyle = '#36454F'; // Cannon
        ctx.beginPath();
        ctx.arc(0, 0, 15, Math.PI, 2 * Math.PI);
        ctx.fill();
        ctx.rotate(-cannonAngle);
        ctx.fillRect(0, -4, 40, 8);
        ctx.restore();

        if (targetHoleGroup.length > 0) {
            ctx.fillStyle = '#696969';
            targetHoleGroup.slice(0, 3).forEach(part => {
                ctx.beginPath();
                part.vertices.forEach((vertex, index) => {
                    if (index === 0) ctx.moveTo(vertex.x, vertex.y);
                    else ctx.lineTo(vertex.x, vertex.y);
                });
                ctx.closePath();
                ctx.fill();
            });
        }

        if (ball) { // Ball
            ctx.beginPath();
            ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, 2 * Math.PI);
            ctx.fillStyle = '#000000';
            ctx.fill();
            if (isFiring && (ball.position.x < -BALL_RADIUS || ball.position.x > SCREEN_WIDTH + BALL_RADIUS || ball.position.y > SCREEN_HEIGHT + BALL_RADIUS)) {
                isFiring = false;
                showMessage("장외!", "#e27d60");
            }
        }
        requestAnimationFrame(gameLoop);
    }

    // --- 게임 시작 ---
    init();
});
