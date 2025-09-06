// =====================================================================
// PART 1: 게임 설정 및 Chipmunk.js 초기화
// =====================================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const loader = document.getElementById('loader');
const uiOverlay = document.getElementById('ui-overlay');

const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;

// [핵심 수정] const cp = this.cp; 라인을 삭제합니다.
// chipmunk.js를 로드하면 'cp' 객체는 전역으로 사용할 수 있습니다.
const space = new cp.Space(); 
space.gravity = cp.v(0, -900); 

// 게임 상수
const BALL_COLLISION_TYPE = 1;
const SENSOR_COLLISION_TYPE = 2;
const GROUND_COLLISION_TYPE = 3;

const GROUND_THICKNESS = 50;
const MAX_WIND_FORCE = 200.0;

// =====================================================================
// PART 2: 게임 상태 및 객체
// =====================================================================
let ortSession = null;
let gameState = 'LOADING';

let cannon = {
    pos: cp.v(100, GROUND_THICKNESS + 20),
    angle: Math.PI / 4,
    power: 450,
    barrelLength: 40,
    minAngle: 0,
    maxAngle: Math.PI / 2,
    minPower: 100,
    maxPower: 800,
};

let target = { pos: cp.v(0, 0), shapes: [] };
let ball = { body: null, shape: null };
let windForce = 0.0;
let ballInHole = false;

const groundBody = space.staticBody;
const groundShape = new cp.SegmentShape(groundBody, cp.v(0, GROUND_THICKNESS), cp.v(SCREEN_WIDTH, GROUND_THICKNESS), 5);
groundShape.setElasticity(0.6);
groundShape.setFriction(1.2);
groundShape.collision_type = GROUND_COLLISION_TYPE;
space.addShape(groundShape);

space.addCollisionHandler(BALL_COLLISION_TYPE, SENSOR_COLLISION_TYPE, () => {
    ballInHole = true;
    return true;
}, null, null, null);


function resetLevel() {
    if (ball.body) {
        space.removeBody(ball.body);
        space.removeShape(ball.shape);
        ball = { body: null, shape: null };
    }
    target.shapes.forEach(shape => space.removeShape(shape));
    target.shapes = [];

    const targetX = 400 + Math.random() * (SCREEN_WIDTH - 500);
    target.pos = cp.v(targetX, GROUND_THICKNESS);
    windForce = (Math.random() * 2 - 1) * MAX_WIND_FORCE;
    uiOverlay.textContent = `Wind: ${(windForce / MAX_WIND_FORCE * 10).toFixed(1)}`;
    
    const holeWidth = 40, holeHeight = 40, thickness = 4;
    const hw = holeWidth / 2;
    const targetBody = space.staticBody;

    const leftWall = new cp.SegmentShape(targetBody, cp.v(targetX - hw, GROUND_THICKNESS), cp.v(targetX - hw, GROUND_THICKNESS + holeHeight), thickness);
    const rightWall = new cp.SegmentShape(targetBody, cp.v(targetX + hw, GROUND_THICKNESS), cp.v(targetX + hw, GROUND_THICKNESS + holeHeight), thickness);
    const bottomWall = new cp.SegmentShape(targetBody, cp.v(targetX - hw, GROUND_THICKNESS), cp.v(targetX + hw, GROUND_THICKNESS), thickness);
    
    const sensor = new cp.SegmentShape(targetBody, cp.v(targetX - hw, GROUND_THICKNESS + thickness), cp.v(targetX + hw, GROUND_THICKNESS + thickness), 1);
    sensor.sensor = true;
    sensor.collision_type = SENSOR_COLLISION_TYPE;

    target.shapes = [leftWall, rightWall, bottomWall, sensor];
    space.addShapes(target.shapes);

    gameState = 'READY';
}

// =====================================================================
// PART 3: 렌더링 함수
// =====================================================================
function flipY(v) { return cp.v(v.x, SCREEN_HEIGHT - v.y); }

function draw() {
    ctx.fillStyle = '#ADD8E6';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.fillStyle = '#228B22';
    ctx.fillRect(0, SCREEN_HEIGHT - GROUND_THICKNESS, SCREEN_WIDTH, GROUND_THICKNESS);

    // 목표 지점 그리기
    ctx.strokeStyle = '#696969';
    ctx.lineWidth = 8;
    const tPos = target.pos;
    const hw = 40/2, hh = 40;
    ctx.beginPath();
    let p1 = flipY(cp.v(tPos.x - hw, tPos.y + hh));
    let p2 = flipY(cp.v(tPos.x - hw, tPos.y));
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    p1 = flipY(cp.v(tPos.x + hw, tPos.y));
    ctx.lineTo(p1.x, p1.y);
    p2 = flipY(cp.v(tPos.x + hw, tPos.y + hh));
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // 대포 그리기
    const barrelEnd = cp.v.add(cannon.pos, cp.v.mult(cp.v.forangle(cannon.angle), cannon.barrelLength));
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#36454F';
    ctx.beginPath();
    let startP = flipY(cannon.pos);
    let endP = flipY(barrelEnd);
    ctx.moveTo(startP.x, startP.y);
    ctx.lineTo(endP.x, endP.y);
    ctx.stroke();
    ctx.fillStyle = '#36454F';
    ctx.beginPath();
    ctx.arc(startP.x, startP.y, 15, 0, 2 * Math.PI);
    ctx.fill();

    // 포탄 그리기
    if (ball.body) {
        ctx.fillStyle = '#000000';
        const pos = flipY(ball.body.p);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, 2*Math.PI);
        ctx.fill();
    }
}


// =====================================================================
// PART 4: AI 모델 통합 (ONNX.js)
// =====================================================================
function getNormalizedObservation() {
    const norm_angle = (cannon.angle - cannon.minAngle) / (cannon.maxAngle - cannon.minAngle) * 2 - 1;
    const norm_power = (cannon.power - cannon.minPower) / (cannon.maxPower - cannon.minPower) * 2 - 1;
    const norm_target_x = (target.pos.x / SCREEN_WIDTH) * 2 - 1;
    const norm_target_y = (target.pos.y / SCREEN_HEIGHT) * 2 - 1;
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

    cannon.angle = angle;
    cannon.power = power;
    fireCannon();
}

function fireCannon() {
    const angle = cannon.angle;
    const power = cannon.power;

    const mass = 1.05;
    const radius = 8;
    const moment = cp.momentForCircle(mass, 0, radius, cp.v(0,0));
    const body = new cp.Body(mass, moment);
    
    const startPos = cp.v.add(cannon.pos, cp.v.mult(cp.v.forangle(angle), cannon.barrelLength));
    body.setP(startPos);
    
    const shape = new cp.CircleShape(body, radius, cp.v(0,0));
    shape.setElasticity(0.6);
    shape.setFriction(0.9);
    shape.collision_type = BALL_COLLISION_TYPE;

    space.addBody(body);
    space.addShape(shape);
    ball.body = body;
    ball.shape = shape;

    const impulse = cp.v.mult(cp.v.forangle(angle), power);
    body.applyImpulse(impulse, cp.v(0,0));
    
    ballInHole = false;
    gameState = 'FIRING';
}

// =====================================================================
// PART 5: 메인 게임 루프
// =====================================================================
let lastTime = 0;
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (gameState === 'LOADING') {
        requestAnimationFrame(gameLoop);
        return;
    }

    if (gameState === 'READY') {
        runInferenceAndFire();
    }
    
    if (gameState === 'FIRING') {
        space.gravity = cp.v(windForce, -900);
        space.step(1/60); 

        if (ball.body) {
            const pos = ball.body.p;
            const velMag = cp.v.len(ball.body.v);
            
            const isOutOfBounds = ! (0 < pos.x < SCREEN_WIDTH && pos.y > 0);
            const isStopped = pos.y.toFixed(2) <= GROUND_THICKNESS.toFixed(2) && velMag < 1.0;

            if (isOutOfBounds || isStopped || ballInHole) {
                console.log(`Episode ended. Success: ${ballInHole}, Stopped: ${isStopped}, Out: ${isOutOfBounds}`);
                gameState = 'DONE';
            }
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
        requestAnimationFrame(gameLoop);
    } catch (e) {
        console.error(`AI 모델 로딩 실패: ${e}`);
        loader.textContent = "오류: model.onnx 로드 실패. 파일이 올바른 위치에 있는지 확인하세요.";
    }
}

initialize();
