const socket = io(); // Подключение к серверу игры

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

let ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
let sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(10, 20, 10);
scene.add(sunLight);

let solidBoxes = [], solidMeshes = [], grannies = [];
let otherPlayers = {}; // Хранилище других игроков онлайн
let coins = 0, spawnTimer = 0;

let ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x4caf50 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playMoanSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.4);
}

function createHouse(x, z) {
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
    const p = [
        new THREE.Mesh(new THREE.BoxGeometry(0.5,3,5), mat), 
        new THREE.Mesh(new THREE.BoxGeometry(0.5,3,5), mat), 
        new THREE.Mesh(new THREE.BoxGeometry(5,3,0.5), mat), 
        new THREE.Mesh(new THREE.ConeGeometry(4,2,4), new THREE.MeshStandardMaterial({ color: 0xa52a2a }))
    ];
    p[0].position.set(-2.25,1.5,0); p[1].position.set(2.25,1.5,0); p[2].position.set(0,1.5,-2.25); p[3].position.set(0,4,0); p[3].rotation.y = Math.PI / 4;
    p.forEach(m => { g.add(m); solidMeshes.push(m); });
    g.position.set(x, 0, z); scene.add(g); g.updateMatrixWorld();
    solidBoxes.push(new THREE.Box3().setFromObject(g));
}

function createTree(x, z) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2), new THREE.MeshStandardMaterial({ color: 0x5c4033 })); trunk.position.y = 1;
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2e8b57 })); leaves.position.y = 2.5;
    tree.add(trunk, leaves); tree.position.set(x, 0, z); scene.add(tree);
    solidMeshes.push(trunk); tree.updateMatrixWorld();
    solidBoxes.push(new THREE.Box3().setFromObject(tree));
}

function createRoad(x, z, w, h) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    road.rotation.x = -Math.PI / 2; road.position.set(x, 0.01, z); scene.add(road);
}

function createCar(x, z, color) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4), new THREE.MeshStandardMaterial({ color })); body.position.y = 0.6;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 2), new THREE.MeshStandardMaterial({ color: 0x333333 })); cabin.position.set(0, 1.2, -0.2);
    car.add(body, cabin); car.position.set(x, 0, z); scene.add(car);
    solidMeshes.push(body, cabin); car.updateMatrixWorld();
    solidBoxes.push(new THREE.Box3().setFromObject(car));
}

function createGranny(x, z) {
    const gGroup = new THREE.Group();
    const dressMat = new THREE.MeshStandardMaterial({ color: 0x800080 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), skinMat); head.position.y = 1.3;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), hairMat); hair.position.set(0, 1.4, -0.05);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.7), dressMat); body.position.y = 0.6;
    const titL = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), dressMat); titL.position.set(-0.25, 0.9, 0.35);
    const titR = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), dressMat); titR.position.set(0.25, 0.9, 0.35);
    const bigAss = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.7, 0.5), dressMat); bigAss.position.set(0, 0.5, -0.3);

    gGroup.add(head, hair, body, titL, titR, bigAss);
    gGroup.position.set(x, 0, z); scene.add(gGroup);
    grannies.push({ group: gGroup, hit: false, timer: 0 });
}

function setupWorld(mapType, timeType) {
    solidBoxes.length = 0; solidMeshes.length = 0;
    grannies.forEach(g => scene.remove(g.group)); grannies.length = 0;

    if (timeType === 'night') {
        scene.background = new THREE.Color(0x050515);
        ambientLight.color.setHex(0x333366);
        sunLight.color.setHex(0x5555ff);
        sunLight.position.set(0, 10, 0);
    } else {
        scene.background = new THREE.Color(0x87CEEB);
        ambientLight.color.setHex(0xffffff);
        sunLight.color.setHex(0xffffff);
        sunLight.position.set(10, 20, 10);
    }

    if (mapType === 'city') {
        ground.material.color.setHex(0x444444);
        createRoad(0, 0, 10, 200);
        createCar(5, -8, 0xff0000);
        createGranny(3, -5);
    } else {
        ground.material.color.setHex(0x4caf50);
        createRoad(0, 0, 6, 200);
        createTree(-8, -5); createTree(8, 5);
        createHouse(12, -10);
        createHouse(-15, 8);
        createGranny(0, 8);
    }
}

let currentSkin = 'default', playerGroup = new THREE.Group(), armR, dickGroup, head, body;
function buildPlayerModel() {
    while(playerGroup.children.length) playerGroup.remove(playerGroup.children[0]);
    const sMat = new THREE.MeshStandardMaterial({ color: currentSkin === 'black' ? 0x3d2314 : 0xffccaa });
    const pMat = new THREE.MeshStandardMaterial({ color: 0xff66aa });
    
    head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), sMat); head.position.y = 1.6;
    body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), sMat); body.position.y = 1.05;
    const playerAss = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.35, 0.25), sMat); playerAss.position.set(0, 0.85, -0.18);

    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), sMat); armL.position.set(-0.35, 1.1, 0);
    armR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), sMat); armR.position.set(0.35, 1.1, 0);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7), sMat); legL.position.set(-0.15, 0.35, 0);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7), sMat); legR.position.set(0.15, 0.35, 0);

    dickGroup = new THREE.Group(); 
    dickGroup.position.set(0, 0.85, 0.2);

    const m = currentSkin === 'black' ? 4 : 1;
    const bGeo = new THREE.SphereGeometry(0.12 * m, 16, 16);
    const leftBall = new THREE.Mesh(bGeo, sMat); leftBall.position.set(-0.12 * m, -0.1 * m, 0);
    const rightBall = new THREE.Mesh(bGeo, sMat); rightBall.position.set(0.12 * m, -0.1 * m, 0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * m, 0.06 * m, 0.5 * m, 16), sMat); shaft.rotation.x = Math.PI / 2; shaft.position.set(0, 0, 0.25 * m);
    const glans = new THREE.Mesh(new THREE.SphereGeometry(0.1 * m, 16, 16), pMat); glans.position.set(0, 0, 0.5 * m);

    dickGroup.add(leftBall, rightBall, shaft, glans);
    playerGroup.add(head, body, playerAss, armL, armR, legL, legR, dickGroup);
}
buildPlayerModel(); scene.add(playerGroup);

// Функция создания моделей других игроков онлайн
function createOtherPlayerModel() {
    const group = new THREE.Group();
    const sMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), sMat); h.position.y = 1.6;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), sMat); b.position.y = 1.05;
    group.add(h, b);
    scene.add(group);
    return group;
}

// Получение данных других игроков от сервера
socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id !== socket.id) {
            otherPlayers[id] = createOtherPlayerModel();
            otherPlayers[id].position.set(players[id].x, players[id].y, players[id].z);
        }
    });
});

socket.on('newPlayer', (player) => {
    otherPlayers[player.id] = createOtherPlayerModel();
    otherPlayers[player.id].position.set(player.x, player.y, player.z);
});

socket.on('playerMoved', (player) => {
    if (otherPlayers[player.id]) {
        otherPlayers[player.id].position.set(player.x, player.y, player.z);
        otherPlayers[player.id].rotation.y = player.rotation;
    }
});

socket.on('disconnectPlayer', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id]);
        delete otherPlayers[id];
    }
});

let fluidParticles = [], isShooting = false, spermaAmount = 100, dickPitch = 0;

function emitFluid() {
    if (gameState !== 'play' || spermaAmount <= 0) { isShooting = false; return; }
    spermaAmount = Math.max(0, spermaAmount - (currentSkin === 'black' ? 0.8 : 0.4));
    document.getElementById('egg-fill').style.height = spermaAmount + '%';
    document.getElementById('egg-text').textContent = Math.round(spermaAmount) + '%';
    
    let pSize = currentSkin === 'black' ? 0.12 : 0.045;
    let count = currentSkin === 'black' ? 12 : 4;
    const fluidMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    const pGeo = new THREE.SphereGeometry(pSize, 8, 8);

    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(pGeo, fluidMat);
        const pos = new THREE.Vector3(0, 0.85, 0.75).applyMatrix4(playerGroup.matrixWorld);
        mesh.position.copy(pos);
                const dir = new THREE.Vector3(0, 0.1 + dickPitch, 1).applyQuaternion(playerGroup.quaternion);
        const vel = new THREE.Vector3(dir.x + (Math.random() - 0.5) * 0.2, dir.y + Math.random() * 0.2, dir.z + (Math.random() - 0.5) * 0.2).multiplyScalar(0.5);
        fluidParticles.push({ mesh, velocity: vel, life: 150 }); scene.add(mesh);
    }
}

document.getElementById('dick-up').onclick = () => { dickPitch = Math.min(0.8, dickPitch + 0.15); dickGroup.rotation.x = -dickPitch; };
document.getElementById('dick-down').onclick = () => { dickPitch = Math.max(-0.5, dickPitch - 0.15); dickGroup.rotation.x = -dickPitch; };

document.getElementById('shop-btn').onclick = () => document.getElementById('shop-menu').style.display = 'flex';
document.getElementById('close-shop').onclick = () => document.getElementById('shop-menu').style.display = 'none';
document.getElementById('open-box-btn').onclick = () => {
    if (coins >= 50) {
        coins -= 50; document.getElementById('coins-val').textContent = coins;
        document.getElementById('box-result').textContent = "🎉 Выпало 100 монет!";
        coins += 100; document.getElementById('coins-val').textContent = coins;
    } else {
        document.getElementById('box-result').textContent = "❌ Не хватает монет!";
    }
};

document.getElementById('settings-btn').onclick = () => document.getElementById('settings-menu').style.display = 'flex';
document.getElementById('close-settings').onclick = () => document.getElementById('settings-menu').style.display = 'none';
document.getElementById('wardrobe-btn').onclick = () => document.getElementById('wardrobe-menu').style.display = 'flex';
document.getElementById('close-wardrobe').onclick = () => document.getElementById('wardrobe-menu').style.display = 'none';

document.getElementById('exit-btn').onclick = () => {
    gameState = 'menu';
    document.getElementById('hud-container').style.display = 'none';
    document.getElementById('coin-counter').style.display = 'none';
    document.getElementById('exit-btn').style.display = 'none';
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('crosshair').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
};

document.querySelectorAll('.skin-btn').forEach(b => b.onclick = (e) => { 
    currentSkin = e.target.dataset.skin; buildPlayerModel(); document.getElementById('wardrobe-menu').style.display = 'none'; 
});

const sBtn = document.getElementById('shoot-btn');
sBtn.ontouchstart = sBtn.onmousedown = (e) => { e.preventDefault(); isShooting = true; };
window.ontouchend = window.onmouseup = () => { isShooting = false; };

let currentAnim = 'idle';
document.getElementById('anim-btn').onclick = () => { const m = document.getElementById('anim-menu'); m.style.display = m.style.display === 'flex' ? 'none' : 'flex'; };
document.querySelectorAll('.anim-option').forEach(b => b.onclick = (e) => { currentAnim = e.target.dataset.anim; document.getElementById('anim-menu').style.display = 'none'; });

let gameState = 'menu', isFirstPerson = false, moveX = 0, moveY = 0;
let cameraAngleY = 0, cameraAngleX = 0;

document.getElementById('play-btn').onclick = () => { document.getElementById('main-menu').style.display = 'none'; document.getElementById('map-select-menu').style.display = 'flex'; };
document.getElementById('back-to-main').onclick = () => { document.getElementById('map-select-menu').style.display = 'none'; document.getElementById('main-menu').style.display = 'flex'; };
document.getElementById('create-map-btn').onclick = () => {
    isFirstPerson = document.getElementById('first-person-toggle').checked;
    setupWorld(document.getElementById('map-select').value, document.getElementById('time-select').value);
    gameState = 'play';
    document.getElementById('map-select-menu').style.display = 'none';
    document.getElementById('crosshair').style.display = 'block';
    document.getElementById('hud-container').style.display = 'flex';
    document.getElementById('coin-counter').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'block';
    document.getElementById('game-ui').style.display = 'block';
};

const joystick = nipplejs.create({ zone: document.getElementById('joystick-zone'), mode: 'dynamic', color: 'white', size: 80 });
joystick.on('move', (evt, data) => { if (data.angle) { moveX = Math.cos(data.angle.radian); moveY = Math.sin(data.angle.radian); } });
joystick.on('end', () => { moveX = 0; moveY = 0; });

let lastTouchX = 0, lastTouchY = 0;
const cZone = document.getElementById('camera-zone');
cZone.ontouchstart = (e) => { if(e.touches.length) { lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY; } };
cZone.ontouchmove = (e) => { 
    if(e.touches.length) {
        let dx = e.touches[0].clientX - lastTouchX;
        let dy = e.touches[0].clientY - lastTouchY;
        
        if (isFirstPerson) {
            cameraAngleY -= dx * 0.005;
            cameraAngleX += dy * 0.005;
            cameraAngleX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cameraAngleX));
        } else {
            cameraAngleY -= dx * 0.005;
            cameraAngleX -= dy * 0.005;
            cameraAngleX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cameraAngleX));
        }
        lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
    } 
};

const clock = new THREE.Clock(), raycaster = new THREE.Raycaster();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    if (gameState === 'menu') {
        playerGroup.rotation.y += 0.01; 
        camera.position.set(2, 2, -4); 
        camera.lookAt(playerGroup.position.x, 1, playerGroup.position.z);
    } else if (gameState === 'play') {
        if (!isShooting && spermaAmount < 100) {
            spermaAmount = Math.min(100, spermaAmount + 0.4);
            document.getElementById('egg-fill').style.height = spermaAmount + '%';
            document.getElementById('egg-text').textContent = Math.round(spermaAmount) + '%';
        }
        if (isShooting) emitFluid();

        spawnTimer += 1;
        if (spawnTimer >= 420) {
            spawnTimer = 0;
            createGranny(playerGroup.position.x + (Math.random()-0.5)*40, playerGroup.position.z + (Math.random()-0.5)*40);
        }

        grannies.forEach(g => {
            if (!g.hit) {
                g.group.lookAt(playerGroup.position.x, g.group.position.y, playerGroup.position.z);
                g.group.translateZ(0.025);
            } else {
                if (currentAnim === 'fuck' && playerGroup.position.distanceTo(g.group.position) < 2.0) {
                    g.timer += 1;
                    if (g.timer % 30 === 0) playMoanSound();
                }
            }
        });

        if (currentAnim === 'wank') {
            armR.position.set(0.2, 0.85, 0.35); armR.rotation.set(Math.PI / 2, 0, -Math.PI / 4);
            armR.position.z += Math.sin(time * 25) * 0.1; playerGroup.rotation.x = 0; playerGroup.position.y = 0;
        } else if (currentAnim === 'fuck') {
            playerGroup.rotation.x = Math.PI / 2; playerGroup.position.y = 0.2;
            playerGroup.position.z += Math.sin(time * 20) * 0.01;
        } else {
            armR.position.set(0.35, 1.1, 0); armR.rotation.set(0, 0, 0);
            playerGroup.rotation.x = 0; playerGroup.position.y = 0;
        }

        const oldPos = playerGroup.position.clone();
        if (moveX !== 0 || moveY !== 0) {
            let v = isFirstPerson 
                ? new THREE.Vector3(moveX, 0, moveY).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngleY)
                : new THREE.Vector3(moveX, 0, -moveY).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngleY);

            playerGroup.position.addScaledVector(v, 0.15); 
            playerGroup.rotation.y = Math.atan2(v.x, v.z);

            // Отправляем координаты движения на сервер онлайна
            socket.emit('playerMovement', { x: playerGroup.position.x, y: playerGroup.position.y, z: playerGroup.position.z, rotation: playerGroup.rotation.y });
        }

        const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(playerGroup.position.x, playerGroup.position.y + 1, playerGroup.position.z), new THREE.Vector3(1, 2, 1));
        if (solidBoxes.some(b => b.intersectsBox(box))) playerGroup.position.copy(oldPos);

        if (isFirstPerson) {
            camera.position.set(playerGroup.position.x, playerGroup.position.y + 1.6, playerGroup.position.z);
            const lookDir = new THREE.Vector3(0, 0, 1)
                .applyAxisAngle(new THREE.Vector3(1, 0, 0), cameraAngleX)
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngleY);
            camera.lookAt(camera.position.clone().add(lookDir));
            playerGroup.visible = true; head.visible = false; body.visible = false;
        } else {
            playerGroup.visible = true; head.visible = true; body.visible = true;
            camera.position.set(playerGroup.position.x + Math.sin(cameraAngleY) * 4, playerGroup.position.y + 2.5, playerGroup.position.z + Math.cos(cameraAngleY) * 4);
            camera.lookAt(playerGroup.position.x, playerGroup.position.y + 1, playerGroup.position.z);
        }

        for (let i = fluidParticles.length - 1; i >= 0; i--) {
            const p = fluidParticles[i]; p.velocity.y -= 0.015; p.mesh.position.add(p.velocity);
            
            grannies.forEach(g => {
                if (!g.hit && p.mesh.position.distanceTo(g.group.position) < 1.2) {
                    g.hit = true; g.group.rotation.x = Math.PI / 2;
                    playMoanSound(); coins += 25; document.getElementById('coins-val').textContent = coins;
                }
            });

            raycaster.set(p.mesh.position, p.velocity.clone().normalize());
            const hits = raycaster.intersectObjects(solidMeshes, false);
            if (hits.length > 0 && hits[0].distance < 0.2) {
                const decal = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
                decal.position.copy(hits[0].point); decal.lookAt(hits[0].point.clone().add(hits[0].face.normal));
                scene.add(decal); scene.remove(p.mesh); fluidParticles.splice(i, 1); continue;
            }
            if (p.mesh.position.y <= 0.02) { p.mesh.position.y = 0.02; p.velocity.set(0, 0, 0); }
            if (--p.life <= 0) { scene.remove(p.mesh); fluidParticles.splice(i, 1); }
        }
    }
    renderer.render(scene, camera);
}
animate();