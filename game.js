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
