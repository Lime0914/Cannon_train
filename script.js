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
    // 목표물을 여러 객체의 묶음으로 관리
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
    
    // --- 레벨 생성 (충돌 로직 수정) ---
    function createLevel() {
        if (ball) Composite.remove(world, ball);
        // 이전 레벨의 목표물 객체들을 모두 제거
        if (targetHoleGroup.length > 0) {
            Composite.remove(world, targetHoleGroup);
            targetHoleGroup = [];
        }

        const targetX = parseFloat(sliders.target.value);
        const wallThickness = 8; // 벽 두께를 늘려 안정성 확보
        const holeY = SCREEN_HEIGHT - GROUND_THICKNESS - (HOLE_HEIGHT / 2);
        
        // 목표물을 구성하는 벽과 센서를 개별 객체로 생성
        const leftWall = Bodies.rectangle(targetX - HOLE_WIDTH / 2, holeY, wallThickness, HOLE_HEIGHT, { isStatic: true });
        const rightWall = Bodies.rectangle(targetX + HOLE_WIDTH / 2, holeY, wallThickness, HOLE_HEIGHT, { isStatic: true });
        const bottomWall = Bodies.rectangle(targetX, holeY + HOLE_HEIGHT/2 - wallThickness/2, HOLE_WIDTH + wallThickness, wallThickness, { isStatic: true });
        const sensor = Bodies.rectangle(targetX, holeY, HOLE_WIDTH - wallThickness, 1, {
            isStatic: true,
            isSensor: true,
            label: 'hole_sensor'
        });

        // 생성된 객체들을 그룹에 추가하고 월드에 추가
        targetHoleGroup = [leftWall, rightWall, bottomWall, sensor];
        Composite.add(world, targetHoleGroup);
        
        isFiring = false;
        
        // 바람 값 적용 로직 수정
        const windValue = parseFloat(sliders.wind.value);
        world.gravity.x = windValue / 20000; // 스케일링 팩터 조정
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
             // createLevel()은 handleSliderChange에서 호출되므로 중복 호출 필요 없음
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
            createLevel(); // 목표 위치가 바뀌면 레벨 재생성
        } else if (slider === sliders.wind) {
            values.wind.textContent = slider.value;
            const windValue = parseFloat(sliders.wind.value);
            world.gravity.x = windValue / 20000; // 스케일링 팩터 조정
        }
    }

    // --- 게임 액션 (파워 적용 방식 수정) ---
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
            frictionAir: 0, // 공기 저항은 바람(중력)으로만 제어
            label: 'ball'
        });

        // 파이썬의 impulse와 유사하게 초기 속도를 직접 설정
        const velocityMagnitude = cannonPower / (60 * BALL_MASS); // 60은 프레임레이트 기반 보정계수
        const velocity = Vector.create(
            Math.cos(cannonAngle) * velocityMagnitude,
            -Math.sin(cannonAngle) * velocityMagnitude
        );
        
        World.add(world, ball);
        Body.setVelocity(ball, velocity); // applyForce 대신 setVelocity 사용
        
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

    // --- ONNX AI 로더 및 솔버 (오류 수정 및 디버깅 추가) ---
    async function loadOnnxModel() {
        try {
            showMessage("AI 모델을 로딩 중입니다...");
            ortSession = await ort.InferenceSession.create('./model.onnx');
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

        const cannon = { min_angle: 0, max_angle: Math.PI / 2, min_power: 100, max_power: 800 };
        const MAX_WIND_FORCE = 10.0; // 변경된 바람 최대치 적용
        
        const norm_angle = (cannonAngle - cannon.min_angle) / (cannon.max_angle - cannon.min_angle) * 2 - 1;
        const norm_power = (cannonPower - cannon.min_power) / (cannon.max_power - cannon.min_power) * 2 - 1;
        const norm_target_x = (parseFloat(sliders.target.value) / SCREEN_WIDTH) * 2 - 1;
        const norm_target_y = ((SCREEN_HEIGHT - GROUND_THICKNESS) / SCREEN_HEIGHT) * 2 - 1;
        const norm_wind = parseFloat(sliders.wind.value) / MAX_WIND_FORCE;
        
        const input = new ort.Tensor('float32', [norm_angle, norm_power, norm_target_x, norm_target_y, norm_wind], [1, 5]);
        
        // ONNX 모델의 입력 이름을 'observation'으로 명확히 지정
        const feeds = { 'observation': input };

        const results = await ortSession.run(feeds);
        
        // 디버깅을 위해 모델 출력 결과를 콘솔에 출력
        console.log("ONNX Model Output:", results);
        
        // 모델의 출력 텐서 이름이 'actions'가 아닐 수 있으므로 확인 필요
        // 만약 콘솔에서 다른 이름(예: 'output')으로 나온다면 아래 코드를 수정해야 함
        const action = results.actions.data;
        
        const predicted_norm_angle = action[0];
        const predicted_norm_power = action[1];
        
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

        // 목표물 그룹 렌더링
        if (targetHoleGroup.length > 0) {
            ctx.fillStyle = '#696969';
            // 벽들만 렌더링 (센서는 제외)
            targetHoleGroup.slice(0, 3).forEach(part => {
                ctx.beginPath();
                part.vertices.forEach((vertex, index) => {
                    if (index === 0) {
                        ctx.moveTo(vertex.x, vertex.y);
                    } else {
                        ctx.lineTo(vertex.x, vertex.y);
                    }
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
