// =====================================================================
// PART 1: 게임 설정 및 Matter.js 초기화
// =====================================================================
const canvas = document.getElementById('gameCanvas');
const loader = document.getElementById('loader');
const uiOverlay = document.getElementById('ui-overlay');

const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;

// Matter.js 모듈 가져오기
const { Engine, Render, Runner, Bodies, Composite, Events, Body, Vector } = Matter;

// Matter.js 엔진 생성
const engine = Engine.create();
const world = engine.world;

// Runner는 물리 시뮬레이션을 자동으로 진행해주는 역할.
const runner = Runner.create();

// Matter.js의 중력 설정 (Y축이 아래 방향이므로 양수)
engine.gravity.y = 1.5;

// 게임 상수
const COLOR_GROUND = "#228B22";
const COLOR_CANNON = "#36454F";
const COLOR_BALL = "#000000";
const COLOR_HOLE = "#696969";

const BALL_RADIUS = 8;
const GROUND_THICKNESS = 50;
const HOLE_WIDTH = 40;
const HOLE_HEIGHT = 40;
const MAX_WIND_FORCE = 200.0;

// =====================================================================
// PART 2: 게임 상태 및 객체
// =====================================================================
let ortSession = null;
let gameState = 'LOADING';

let cannon = {
    x: 100,
    y: SCREEN_HEIGHT - (GROUND_THICKNESS + 20),
    angle: Math.PI / 4,
    power: 450,
    barrelLength: 40,
    minAngle: 0,
    maxAngle: Math.PI / 2,
    minPower: 100,
    maxPower: 800,
};

let target = {
    x: 0,
    y: SCREEN_HEIGHT - GROUND_THICKNESS,
    walls: [],
    sensor: null
};

let ball = null;
let windForce = 0;

// 지면 생성
const ground = Bodies.rectangle(SCREEN_WIDTH / 2, SCREEN_HEIGHT - (GROUND_THICKNESS / 2), SCREEN_WIDTH, GROUND_THICKNESS, { isStatic: true, label: 'ground' });
Composite.add(world, ground);

function resetLevel() {
    // 이전 레벨의 객체들 제거
    if (ball) {
        Composite.remove(world, ball);
        ball = null;
    }
    if (target.walls.length > 0) {
        Composite.remove(world, target.walls);
        target.walls = [];
    }
    if (target.sensor) {
        Composite.remove(world, target.sensor);
        target.sensor = null;
    }

    // 새로운 목표 위치 및 바람 설정
    target.x = 400 + Math.random() * (SCREEN_WIDTH - 500);
    windForce = (Math.random() * 2 - 1) * MAX_WIND_FORCE;
    uiOverlay.textContent = `Wind: ${(windForce / MAX_WIND_FORCE * 10).toFixed(1)}`;
    
    // Matter.js로 목표 지점(U자형) 생성
    const hx = target.x;
    const hy = target.y;
    const wallOptions = { isStatic: true, label: 'targetWall', render: { fillStyle: COLOR_HOLE } };
    const leftWall = Bodies.rectangle(hx - HOLE_WIDTH / 2, hy - HOLE_HEIGHT / 2, 4, HOLE_HEIGHT, wallOptions);
    const rightWall = Bodies.rectangle(hx + HOLE_WIDTH / 2, hy - HOLE_HEIGHT / 2, 4, HOLE_HEIGHT, wallOptions);
    const bottomWall = Bodies.rectangle(hx, hy, HOLE_WIDTH + 4, 4, wallOptions);
    target.walls = [leftWall, rightWall, bottomWall];
    
    // 성공 감지를 위한 센서 생성
    target.sensor = Bodies.rectangle(hx, hy - HOLE_HEIGHT/2, HOLE_WIDTH - 4, HOLE_HEIGHT, {
        isStatic: true,
        isSensor: true, // 물리적 충돌은 없지만 감지만 가능
        label: 'successSensor'
    });

    Composite.add(world, [...target.walls, target.sensor]);
    gameState = 'READY';
}

// =====================================================================
// PART 3: 렌더링 함수 (직접 그리기)
// =====================================================================
const ctx = canvas.getContext('2d');

function draw() {
    // 배경
    ctx.fillStyle = '#ADD8E6';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // 지면
    ctx.fillStyle = COLOR_GROUND;
    ctx.fillRect(0, SCREEN_HEIGHT - GROUND_THICKNESS, SCREEN_WIDTH, SCREEN_HEIGHT);
    
    // 목표 지점 그리기
    ctx.fillStyle = COLOR_HOLE;
    target.walls.forEach(wall => {
        ctx.beginPath();
        wall.vertices.forEach(v => ctx.lineTo(v.x, v.y));
        ctx.closePath();
        ctx.fill();
    });

    // 포탄 그리기
    if (ball) {
        ctx.beginPath();
        ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = COLOR_BALL;
        ctx.fill();
    }

    // 대포 그리기 (물리 객체가 아니므로 직접 그림)
    ctx.save();
    ctx.translate(cannon.x, cannon.y);
    ctx.rotate(cannon.angle); // Matter.js는 Y축이 아래이므로 각도를 그대로 사용
    ctx.fillStyle = COLOR_CANNON;
    ctx.fillRect(0, -4, cannon.barrelLength, 8);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cannon.x, cannon.y, 15, 0, Math.PI * 2);
    ctx.fill();
}

// =====================================================================
// PART 4: AI 모델 통합 (ONNX.js)
// =====================================================================
function getNormalizedObservation() {
    const norm_angle = (cannon.angle - (-cannon.maxAngle)) / (cannon.maxAngle - (-cannon.maxAngle)) * 2 - 1;
    const norm_power = (cannon.power - cannon.minPower) / (cannon.maxPower - cannon.minPower) * 2 - 1;
    const norm_target_x = (target.x / SCREEN_WIDTH) * 2 - 1;
    const python_target_y = GROUND_THICKNESS;
    const norm_target_y = (python_target_y / SCREEN_HEIGHT) * 2 - 1;
    const norm_wind = windForce / MAX_WIND_FORCE;
    return new Float32Array([norm_angle, norm_power, norm_target_x, norm_target_y, norm_wind]);
}

function unnormalizeAction(normalizedAction) {
    const angle = (normalizedAction[0] + 1) / 2 * (cannon.maxAngle - cannon.minAngle) + cannon.minAngle;
    const power = (normalizedAction[1] + 1) / 2 * (cannon.maxPower - cannon.minPower) + cannon.minPower;
    return { angle, power };
}

async function runInferenceAndFire() {
    const observation = getNormalizedObservation();
    const obsTensor = new ort.Tensor('float32', observation, [1, 5]);
    const results = await ort.Session.prototype.run.call(ortSession, { 'observation': obsTensor });
    const actionTensor = results.action;
    let { angle, power } = unnormalizeAction(actionTensor.data);
    angle = Math.max(cannon.minAngle, Math.min(cannon.maxAngle, angle));

    // 각도 변환: Python(Y-up) 각도를 Matter.js(Y-down) 각도로. (sin 부호 반전)
    cannon.angle = -angle;
    cannon.power = power;
    fireCannon();
}

function fireCannon() {
    const angle = cannon.angle;
    const power = cannon.power;
    const startX = cannon.x + Math.cos(angle) * cannon.barrelLength;
    const startY = cannon.y + Math.sin(angle) * cannon.barrelLength;
    
    ball = Bodies.circle(startX, startY, BALL_RADIUS, {
        label: 'ball',
        restitution: 0.6, // 탄성
        friction: 0.05,
        frictionAir: 0.01,
        density: 0.005
    });

    Composite.add(world, ball);

    const forceMagnitude = power / 1000; // 힘의 크기 조절
    const force = Vector.create(Math.cos(angle) * forceMagnitude, Math.sin(angle) * forceMagnitude);
    Body.applyForce(ball, ball.position, force);
    
    gameState = 'FIRING';
}

// =====================================================================
// PART 5: 메인 게임 루프 및 이벤트 처리
// =====================================================================

// 물리 업데이트 루프 (Runner가 자동으로 처리)
Events.on(engine, 'beforeUpdate', () => {
    // 지속적인 바람의 힘 적용
    if (ball) {
        const wind_force_magnitude = (windForce / MAX_WIND_FORCE) * 0.002;
        Body.applyForce(ball, ball.position, { x: wind_force_magnitude, y: 0 });
    }
});

// 충돌 이벤트 감지
Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        // 포탄이 성공 센서에 닿았을 때
        if ((bodyA.label === 'ball' && bodyB.label === 'successSensor') ||
            (bodyA.label === 'successSensor' && bodyB.label === 'ball')) {
            // 속도가 충분히 느려지면 성공으로 판정
            setTimeout(() => {
                 if (ball && ball.speed < 1) {
                    console.log("Success! Resetting level.");
                    gameState = 'DONE';
                 }
            }, 500); // 0.5초 후 속도 체크
        }
    });
});

function gameLoop() {
    if(gameState === 'LOADING') {
        requestAnimationFrame(gameLoop);
        return;
    }

    if (gameState === 'READY') {
        runInferenceAndFire();
    }

    // 실패 조건: 화면 밖 또는 멈춤
    if (ball && gameState === 'FIRING') {
        const isOutOfBounds = ball.position.x < 0 || ball.position.x > SCREEN_WIDTH;
        const isStopped = ball.speed < 0.1 && ball.position.y > SCREEN_HEIGHT - GROUND_THICKNESS - BALL_RADIUS*2;

        if(isOutOfBounds || isStopped) {
            console.log(`Failed. Reason: ${isOutOfBounds ? 'Out of bounds' : 'Stopped'}. Resetting.`);
            gameState = 'DONE';
        }
    }
    
    if (gameState === 'DONE') {
        setTimeout(resetLevel, 1000);
        gameState = 'WAITING';
    }

    draw();
    requestAnimationFrame(gameLoop);
}

async function initialize() {
    try {
        console.log("ONNX Runtime 세션 생성 시도...");
        ortSession = await ort.InferenceSession.create('./model.onnx');
        console.log("AI 모델 로딩 성공!");
        
        loader.style.display = 'none';
        
        resetLevel();
        Runner.run(runner, engine); // 물리 엔진 실행 시작
        requestAnimationFrame(gameLoop); // 렌더링 루프 시작

    } catch (e) {
        console.error(`AI 모델 로딩 실패: ${e}`);
        loader.textContent = "오류: model.onnx 로드 실패. 파일이 올바른 위치에 있는지 확인하세요.";
    }
}

// 게임 시작
initialize();
