document.addEventListener('DOMContentLoaded', () => {
    // --- Matter.js Modules ---
    const { Engine, Render, Runner, World, Bodies, Body, Events, Vector, Composite } = Matter;

    // --- Constants from Python ---
    const SCREEN_WIDTH = 800;
    const SCREEN_HEIGHT = 600;
    const GROUND_THICKNESS = 50;
    const BALL_RADIUS = 8;
    const BALL_MASS = 1.05;
    const CANNON_POS = { x: 100, y: SCREEN_HEIGHT - GROUND_THICKNESS - 20 };
    const HOLE_WIDTH = 40;
    const HOLE_HEIGHT = 40;
    const MIN_POWER = 100;
    const MAX_POWER = 800;

    // --- Physics Scaling ---
    // Matter.js works best with smaller values, so we scale power down
    const POWER_SCALE = 0.005; 
    
    // --- DOM Elements ---
    const canvas = document.getElementById('game-canvas');
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    const ctx = canvas.getContext('2d');
    const statusMessage = document.getElementById('status-message');

    // Sliders and Value Displays
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
    
    // --- Game State ---
    let engine, world;
    let ground, ball, targetHole;
    let cannonAngle = 45 * (Math.PI / 180);
    let cannonPower = 450;
    let isFiring = false;

    // --- Game Initialization ---
    function init() {
        engine = Engine.create();
        world = engine.world;
        engine.gravity.y = 1; // Standard gravity, adjust force via wind
        engine.gravity.scale = 0.0018; // Corresponds to ~900 in pymunk

        // Create ground
        ground = Bodies.rectangle(SCREEN_WIDTH / 2, SCREEN_HEIGHT - GROUND_THICKNESS / 2, SCREEN_WIDTH, GROUND_THICKNESS, { 
            isStatic: true,
            friction: 1.2,
            restitution: 0.6,
            render: { fillStyle: '#228B22' }
        });

        World.add(world, ground);
        createLevel();
        setupEventListeners();
        
        // Start the rendering loop
        requestAnimationFrame(gameLoop);
    }
    
    // --- Level Creation ---
    function createLevel() {
        // Clear previous ball and target
        if (ball) Composite.remove(world, ball);
        if (targetHole) Composite.remove(world, targetHole);

        const targetX = parseFloat(sliders.target.value);
        
        // Create the target hole
        const wallThickness = 4;
        const holeY = SCREEN_HEIGHT - GROUND_THICKNESS - (HOLE_HEIGHT / 2);
        
        const holeParts = [
            Bodies.rectangle(targetX - HOLE_WIDTH / 2, holeY, wallThickness, HOLE_HEIGHT, { isStatic: true }),
            Bodies.rectangle(targetX + HOLE_WIDTH / 2, holeY, wallThickness, HOLE_HEIGHT, { isStatic: true }),
            Bodies.rectangle(targetX, holeY + HOLE_HEIGHT/2 - wallThickness/2, HOLE_WIDTH, wallThickness, { isStatic: true }),
        ];
        
        const sensor = Bodies.rectangle(targetX, holeY, HOLE_WIDTH - wallThickness, 1, {
            isStatic: true,
            isSensor: true, // Doesn't collide physically, just detects
            label: 'hole_sensor'
        });

        targetHole = Body.create({ parts: [...holeParts, sensor], isStatic: true });
        
        World.add(world, targetHole);
        isFiring = false;
        
        // Update wind force
        const windForce = parseFloat(sliders.wind.value) / 100000; // Scale for Matter.js
        world.gravity.x = windForce;
    }
    
    // --- Event Listeners ---
    function setupEventListeners() {
        // Slider listeners
        for (const key in sliders) {
            sliders[key].addEventListener('input', handleSliderChange);
        }

        // Button Listeners
        buttons.fire.addEventListener('click', fireCannon);
        buttons.reset.addEventListener('click', () => {
             // Randomize and reset
             sliders.target.value = 400 + Math.random() * 300;
             sliders.wind.value = -200 + Math.random() * 400;
             handleSliderChange({ target: sliders.target });
             handleSliderChange({ target: sliders.wind });
             createLevel();
             showMessage("");
        });
        buttons.aiSolve.addEventListener('click', aiSolve);

        // Physics collision listener
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
            world.gravity.x = parseFloat(slider.value) / 100000;
        }
    }

    // --- Game Actions ---
    function fireCannon() {
        if (isFiring) return;

        isFiring = true;
        if (ball) Composite.remove(world, ball);

        const barrelLength = 40;
        const startPos = {
            x: CANNON_POS.x + barrelLength * Math.cos(cannonAngle),
            y: CANNON_POS.y - barrelLength * Math.sin(cannonAngle) // Canvas Y is inverted
        };

        ball = Bodies.circle(startPos.x, startPos.y, BALL_RADIUS, {
            mass: BALL_MASS,
            restitution: 0.6,
            friction: 0.9,
            label: 'ball'
        });

        const force = Vector.create(
            Math.cos(cannonAngle) * cannonPower * POWER_SCALE,
            -Math.sin(cannonAngle) * cannonPower * POWER_SCALE // Y is up
        );
        
        Body.applyForce(ball, ball.position, force);
        World.add(world, ball);
        
        // Timeout for miss
        setTimeout(() => {
            if (isFiring) { // If still firing after 10s, it's a miss
                isFiring = false;
                showMessage("Missed!", "#e27d60");
            }
        }, 10000);
    }
    
    function winCondition() {
        if (!isFiring) return;
        isFiring = false;
        showMessage("Success!", "#50e3c2");
        Composite.remove(world, ball); // Remove ball
    }
    
    function showMessage(msg, color = '#fff') {
        statusMessage.textContent = msg;
        statusMessage.style.backgroundColor = msg === "" ? "transparent" : (color === '#fff' ? 'rgba(0,0,0,0.6)' : color);
        statusMessage.style.opacity = msg === "" ? 0 : 1;
    }

    // --- AI Solver ---
    function aiSolve() {
        showMessage("AI is thinking...");
        // Use a timeout to allow the message to render before blocking the thread
        setTimeout(() => {
            const solution = findOptimalShot();
            if (solution) {
                sliders.angle.value = solution.angleDeg;
                sliders.power.value = solution.power;
                handleSliderChange({ target: sliders.angle });
                handleSliderChange({ target: sliders.power });
                showMessage("");
                fireCannon();
            } else {
                showMessage("AI couldn't find a solution.", "#e27d60");
            }
        }, 50);
    }

    function findOptimalShot() {
        const targetX = parseFloat(sliders.target.value);
        const windX = world.gravity.x;
        const gravityY = engine.gravity.y * engine.gravity.scale;
        
        let bestShot = { minDistance: Infinity };

        // Iteratively test different angles to find the best one
        for (let angleDeg = 10; angleDeg <= 85; angleDeg += 1) {
            const angleRad = angleDeg * Math.PI / 180;
            
            // This is a simplified physics calculation to estimate the required power
            // A more robust method would simulate steps, but this is faster for a demo
            const cosA = Math.cos(angleRad);
            const sinA = Math.sin(angleRad);
            
            // Simplified ballistic trajectory calculation to get close
            let bestPowerForAngle = null;
            let minPowerDist = Infinity;

            for (let power = MIN_POWER; power <= MAX_POWER; power += 10) {
                 const velocity = power * POWER_SCALE;
                 const vx = cosA * velocity;
                 const vy = -sinA * velocity;

                 // Estimate time to reach target X
                 // Simplified: t = dx / (vx + 0.5 * ax * t)  => this is complex.
                 // Let's do a quick simulation instead.
                 let simPos = { ...CANNON_POS };
                 let simVel = { x: vx, y: vy };
                 let landedPos = null;
                 
                 for (let t = 0; t < 800; t++) { // Max 800 steps
                     simPos.x += simVel.x;
                     simPos.y += simVel.y;
                     simVel.x += windX;
                     simVel.y += gravityY;
                     
                     if (simPos.y > SCREEN_HEIGHT - GROUND_THICKNESS) {
                        landedPos = simPos;
                        break;
                     }
                 }
                 if(landedPos) {
                    const dist = Math.abs(landedPos.x - targetX);
                    if (dist < minPowerDist) {
                        minPowerDist = dist;
                        bestPowerForAngle = power;
                    }
                 }
            }
            
            if (minPowerDist < bestShot.minDistance) {
                bestShot = { 
                    minDistance: minPowerDist, 
                    angleDeg: angleDeg, 
                    power: bestPowerForAngle 
                };
            }
        }
        
        if (bestShot.minDistance < 50) { // Only accept if it's a reasonably close shot
            return bestShot;
        }
        return null;
    }

    // --- Main Game Loop (Drawing) ---
    function gameLoop() {
        // Step the engine
        Engine.update(engine);
        
        // Clear canvas
        ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        
        // Draw Ground
        ctx.fillStyle = '#228B22';
        ctx.fillRect(0, SCREEN_HEIGHT - GROUND_THICKNESS, SCREEN_WIDTH, GROUND_THICKNESS);

        // Draw Cannon
        ctx.save();
        ctx.translate(CANNON_POS.x, CANNON_POS.y);
        ctx.fillStyle = '#36454F';
        // Base
        ctx.beginPath();
        ctx.arc(0, 0, 15, Math.PI, 2 * Math.PI);
        ctx.fill();
        // Barrel
        ctx.rotate(-cannonAngle); // Negative because canvas Y is inverted
        ctx.fillRect(0, -4, 40, 8);
        ctx.restore();

        // Draw Target
        ctx.fillStyle = '#696969';
        const targetX = targetHole.position.x;
        const targetY = SCREEN_HEIGHT - GROUND_THICKNESS;
        ctx.fillRect(targetX - HOLE_WIDTH / 2 - 4, targetY - HOLE_HEIGHT, 8, HOLE_HEIGHT);
        ctx.fillRect(targetX + HOLE_WIDTH / 2 - 4, targetY - HOLE_HEIGHT, 8, HOLE_HEIGHT);
        ctx.fillRect(targetX - HOLE_WIDTH/2 -4, targetY, HOLE_WIDTH+8, 8);

        // Draw Ball
        if (ball) {
            ctx.beginPath();
            ctx.arc(ball.position.x, ball.position.y, BALL_RADIUS, 0, 2 * Math.PI);
            ctx.fillStyle = '#000000';
            ctx.fill();

            // Check if ball is out of bounds
            if (isFiring && (ball.position.x < 0 || ball.position.x > SCREEN_WIDTH || ball.position.y > SCREEN_HEIGHT)) {
                isFiring = false;
                showMessage("Out of bounds!", "#e27d60");
            }
        }

        requestAnimationFrame(gameLoop);
    }

    // --- Start the game ---
    init();
});
