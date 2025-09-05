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

const { Engine, Runner, Bodies, Composite, Events, Body, Vector } = Matter;

const engine = Engine.create();
const world = engine.world;
const runner = Runner.create();

engine.gravity.y = 2.0;

const collisionCategories = {
    ball: 0x0001,
    wall: 0x0002,
};

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
    angle: 0, // 초기 각도
    power: 450,
    barrelLength: 40,
    minAngle: 0,
    maxAngle: Math.PI / 2,
    minPower: 100,
    maxPower: 800,
};

let target = { x: 0, y: SCREEN_HEIGHT - GROUND_THICKNESS, walls: [], sensor: null };
let ball = null;
let windForce = 0;

const ground = Bodies.rectangle(
    SCREEN_WIDTH / 2, 
    SCREEN_HEIGHT - (GROUND_THICKNESS / 2), 
    SCREEN_WIDTH, 
    GROUND_THICKNESS, 
    { 
        isStatic: true, 
        label: 'ground',
        collisionFilter: {
            category: collisionCategories.wall,
            mask: collisionCategories.ball
        }
    }
);
Composite.add(world, ground);

function resetLevel() {
    if (ball) { Composite.remove(world, ball); ball = null; }
    if (target.walls.length > 0) { Composite.remove(world, target.walls); }
    if (target.sensor) { Composite.remove(world, target.sensor); }

    target.x = 400 + Math.random() * (SCREEN_WIDTH - 500);
    windForce = (Math.random() * 2 - 1) * MAX_WIND_FORCE;
    uiOverlay.textContent = `Wind: ${(windForce / MAX_WIND_FORCE * 10).toFixed(1)}`;
    
    const hx = target.x;
    const hy = target.y;

    const wallOptions = { 
        isStatic: true, 
        label: 'targetWall',
        render: { fillStyle: COLOR_HOLE },
        collisionFilter: {
            category: collisionCategories.wall,
            mask: collisionCategories.ball
        }
    };
    const leftWall = Bodies.rectangle(hx - HOLE_WIDTH / 2, hy - HOLE_HEIGHT / 2, 4, HOLE_HEIGHT, wallOptions);
    const rightWall = Bodies.rectangle(hx + HOLE_WIDTH / 2, hy - HOLE_HEIGHT / 2, 4, HOLE_HEIGHT, wallOptions);
    const bottomWall = Bodies.rectangle(hx, hy, HOLE_WIDTH + 4, 4, wallOptions);
    target.walls = [leftWall, rightWall, bottomWall];
    
    target.sensor = Bodies.rectangle(hx, hy - HOLE_HEIGHT/2, HOLE_WIDTH - 4, HOLE_HEIGHT, {
        isStatic: true,
        isSensor: true,
        label: 'successSensor'
    });

    Composite.add(world, [...target.walls, target.sensor]);
    gameState = 'READY';
}

// =====================================================================
// PART 3: 렌더링 함수 (Canvas 그리기)
// =====================================================================
const ctx = canvas.getContext('2d');

function draw() {
    ctx.fillStyle = '#ADD8E6';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.fillStyle = COLOR_GROUND;
    ctx.fillRect(0, SCREEN_HEIGHT - GROUND_THICKNESS, SCREEN_WIDTH, SCREEN_HEIGHT);
    
    ctx.fillStyle = COLOR_HOLE;
    target.walls.forEach(wall => {
        ctx.beginPath();
        wall.vertices.forEach(v => ctx.lineTo(v.x, v.y));
        ctx.closePath();
        ctx.fill();
    });

    if (ball) {
        ctx.beginPath();
        ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = COLOR_BALL;
        ctx.fill();
    }

    ctx.save();
    ctx.translate(cannon.x, cannon.y);
    ctx.rotate(cannon.angle);
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
    const python_angle = -cannon.angle; 
    const norm_angle = (python_angle - cannon.minAngle) / (cannon.maxAngle - cannon.minAngle) * 2 - 1;
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
    const results = await ortSession.run({ 'observation': obsTensor });
    const actionTensor = results.action;
    let { angle, power } = unnormalizeAction(actionTensor.data);
    
    angle = Math.max(cannon.minAngle, Math.min(cannon.maxAngle, angle));

    // [핵심 수정] 디버깅을 위해 AI가 예측한 각도 값을 콘솔에 출력합니다.
    console.log("AI Predicted Angle (JS):", -angle, "(Python Style):", angle);

    cannon.angle = -angle;
    cannon.power = power;
    
    fireCannon(cannon.angle, cannon.power);
}

function fireCannon(angle, power) {
    const startX = cannon.x + Math.cos(angle) * cannon.barrelLength;
    const startY = cannon.y + Math.sin(angle) * cannon.barrelLength;
    
    ball = Bodies.circle(startX, startY, BALL_RADIUS, {
        label: 'ball',
        restitution: 0.6,
        friction: 0.05,
        frictionAir: 0.01,
        density: 0.005,
        collisionFilter: {
            category: collisionCategories.ball,
            mask: collisionCategories.wall
        }
    });

    Composite.add(world, ball);

    const forceMagnitude = power / 15000;
    const force = Vector.create(Math.cos(angle) * forceMagnitude, Math.sin(angle) * forceMagnitude);
    Body.applyForce(ball, ball.position, force);
    
    gameState = 'FIRING';
}

// =====================================================================
// PART 5: 메인 게임 루프 및 이벤트 처리
// =====================================================================
Events.on(engine, 'beforeUpdate', () => {
    if (ball) {
        const wind_force_magnitude = (windForce / MAX_WIND_FORCE) * 0.0005;
        Body.applyForce(ball, ball.position, { x: wind_force_magnitude, y: 0 });
    }
});

Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        if ((bodyA.label === 'ball' && bodyB.label === 'successSensor') ||
            (bodyA.label === 'successSensor' && bodyB.label === 'ball')) {
            setTimeout(() => {
                 if (ball && ball.speed < 1) {
                    console.log("Success! Resetting level.");
                    gameState = 'DONE';
                 }
            }, 500);
        }
    });
});

function gameLoop() {
    if (gameState === 'LOADING') {
        requestAnimationFrame(gameLoop);
        return;
    }

    if (gameState === 'READY') {
        runInferenceAndFire();
    }

    if (ball && gameState === 'FIRING') {
        const isOutOfBounds = ball.position.x < 0 || ball.position.x > SCREEN_WIDTH;
        const isStopped = ball.speed < 0.1 && ball.position.y > SCREEN_HEIGHT - GROUND_THICKNESS - BALL_RADIUS * 2;

        if (isOutOfBounds || isStopped) {
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
        ortSession = await ort.InferenceSession.create('./model.onnx');
        console.log("AI 모델 로딩 성공!");
        loader.style.display = 'none';
        
        resetLevel();
        Runner.run(runner, engine);
        requestAnimationFrame(gameLoop);
    } catch (e) {
        console.error(`AI 모델 로딩 실패: ${e}`);
        loader.textContent = "오류: model.onnx 로드 실패. 파일이 올바른 위치에 있는지 확인하세요.";
    }
}

// 게임 시작
initialize();
