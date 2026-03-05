import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
        import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
        import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
        import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'; 
        import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

        // --- Device Detection & Performance Scaling ---
        function getDeviceProfile() {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const dpr = window.devicePixelRatio || 1;
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || w < 768;
            const isTablet = w >= 768 && w <= 1024;
            const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (isMobile && dpr >= 3);

            let profile = 'high';
            if (isLowEnd || (isMobile && w < 400)) profile = 'low';
            else if (isMobile || isTablet) profile = 'medium';

            return { isMobile, isTablet, isLowEnd, profile, w, h, dpr };
        }

        const device = getDeviceProfile();

        // --- 核心配置 (Responsive) ---
        const CONFIG = {
            colors: {
                bg: 0x050d1a,
                fog: 0x050d1a,
                champagneGold: 0xffd966, 
                deepGreen: 0x03180a,     
                accentRed: 0x990000,     
            },
            particles: {
                count: device.profile === 'low' ? 500 : device.profile === 'medium' ? 900 : 1500,
                dustCount: device.profile === 'low' ? 600 : device.profile === 'medium' ? 1200 : 2000,
                snowCount: device.profile === 'low' ? 300 : device.profile === 'medium' ? 600 : 1000,
                treeHeight: device.isMobile ? 20 : 24,
                treeRadius: device.isMobile ? 6.5 : 8
            },
            camera: { 
                z: device.isMobile ? 60 : 50,
                fov: device.isMobile ? 50 : 42
            },
            renderer: {
                pixelRatio: device.profile === 'low' ? 1 : Math.min(device.dpr, 2)
            },
            
            preload: {
                autoScanLocal: true,
                scanCount: 200, 
                images: [
                    'https://images.unsplash.com/photo-1543589077-47d81606c1bf?q=80&w=600', 
                    'https://images.unsplash.com/photo-1576919228236-a097c32a5cd4?q=80&w=600',
                    'https://images.unsplash.com/photo-1512389142860-9c449e58a543?q=80&w=600', 
                    'https://images.unsplash.com/photo-1482638588057-dce9509db949?q=80&w=600'
                ]
            }
        };

        const STATE = {
            mode: 'TREE', 
            focusIndex: -1, 
            focusTarget: null,
            hand: { detected: false, x: 0, y: 0 },
            rotation: { x: 0, y: 0 },
            touch: { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, pinchDist: 0 }
        };

        let scene, camera, renderer, composer;
        let mainGroup; 
        let clock = new THREE.Clock();
        let particleSystem = []; 
        let photoMeshGroup = new THREE.Group();
        let handLandmarker, video;
        let caneTexture; 
        let snowSystem;
        let bloomPass;
        const debugInfo = document.getElementById('debug-info');

        async function init() {
            initThree();
            setupEnvironment(); 
            setupLights();
            createTextures();
            createParticles(); 
            createDust();
            createSnow();
            loadPredefinedImages();
            setupPostProcessing();
            setupEvents();
            setupTouchControls();
            await initMediaPipe();
            
            const loader = document.getElementById('loader');
            loader.style.opacity = 0;
            setTimeout(() => loader.remove(), 800);

            animate();
        }

        // --- 增强版图片加载系统 ---
        function loadPredefinedImages() {
            const loader = new THREE.TextureLoader();
            CONFIG.preload.images.forEach(url => {
                loader.load(url, 
                    (t) => { t.colorSpace = THREE.SRGBColorSpace; addPhotoToScene(t); },
                    undefined,
                    (e) => { console.log(`Skipped: ${url}`); }
                );
            });

            if (CONFIG.preload.autoScanLocal) {
                for (let i = 1; i <= CONFIG.preload.scanCount; i++) {
                    const pathJpg = `./images/(${i}).jpg`;
                    const pathPng = `./images/(${i}).png`;
                    loader.load(pathJpg, 
                        (t) => { t.colorSpace = THREE.SRGBColorSpace; addPhotoToScene(t); },
                        undefined,
                        () => {
                             loader.load(pathPng, 
                                (t) => { t.colorSpace = THREE.SRGBColorSpace; addPhotoToScene(t); },
                                undefined,
                                () => {} 
                             );
                        }
                    );
                }
            }
        }

        function initThree() {
            const container = document.getElementById('canvas-container');
            scene = new THREE.Scene();
            scene.background = new THREE.Color(CONFIG.colors.bg);
            scene.fog = new THREE.FogExp2(CONFIG.colors.fog, 0.015);

            camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 2, CONFIG.camera.z); 

            renderer = new THREE.WebGLRenderer({ 
                antialias: device.profile !== 'low', 
                alpha: true, 
                powerPreference: device.profile === 'low' ? "low-power" : "high-performance" 
            });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(CONFIG.renderer.pixelRatio);
            renderer.toneMapping = THREE.ReinhardToneMapping; 
            renderer.toneMappingExposure = 2.2; 
            container.appendChild(renderer.domElement);

            mainGroup = new THREE.Group();
            scene.add(mainGroup);
        }

        function setupEnvironment() {
            const pmremGenerator = new THREE.PMREMGenerator(renderer);
            scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        }

        function setupLights() {
            const ambient = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambient);

            const innerLight = new THREE.PointLight(0xffaa00, 2, 20);
            innerLight.position.set(0, 5, 0);
            mainGroup.add(innerLight);

            const spotGold = new THREE.SpotLight(0xffcc66, 1200);
            spotGold.position.set(30, 40, 40);
            spotGold.angle = 0.5;
            spotGold.penumbra = 0.5;
            scene.add(spotGold);

            const spotBlue = new THREE.SpotLight(0x6688ff, 800);
            spotBlue.position.set(-30, 20, -30);
            scene.add(spotBlue);
            
            const fill = new THREE.DirectionalLight(0xffeebb, 0.8);
            fill.position.set(0, 0, 50);
            scene.add(fill);
        }

        function setupPostProcessing() {
            const renderScene = new RenderPass(scene, camera);
            
            // Adjust bloom based on device performance
            const bloomStrength = device.profile === 'low' ? 0.3 : 0.5;
            const bloomRadius = device.profile === 'low' ? 0.2 : 0.4;
            
            bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight), 
                1.5, 0.4, 0.85
            );
            bloomPass.threshold = 0.65;
            bloomPass.strength = bloomStrength; 
            bloomPass.radius = bloomRadius;

            composer = new EffectComposer(renderer);
            composer.addPass(renderScene);
            composer.addPass(bloomPass);
        }

        function createTextures() {
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0,0,128,128);
            ctx.fillStyle = '#880000'; 
            ctx.beginPath();
            for(let i=-128; i<256; i+=32) {
                ctx.moveTo(i, 0); ctx.lineTo(i+32, 128); ctx.lineTo(i+16, 128); ctx.lineTo(i-16, 0);
            }
            ctx.fill();
            caneTexture = new THREE.CanvasTexture(canvas);
            caneTexture.wrapS = THREE.RepeatWrapping;
            caneTexture.wrapT = THREE.RepeatWrapping;
            caneTexture.repeat.set(3, 3);
        }

        // --- 雪花系统 ---
        function createSnow() {
            const geometry = new THREE.BufferGeometry();
            const vertices = [];
            const velocities = [];

            const canvas = document.createElement('canvas');
            canvas.width = 32; canvas.height = 32;
            const context = canvas.getContext('2d');
            context.fillStyle = 'white';
            context.beginPath();
            context.arc(16, 16, 16, 0, Math.PI * 2);
            context.fill();
            const snowTexture = new THREE.CanvasTexture(canvas);

            const snowSpread = device.isMobile ? 70 : 100;
            const snowHeight = device.isMobile ? 40 : 60;

            for (let i = 0; i < CONFIG.particles.snowCount; i++) {
                const x = THREE.MathUtils.randFloatSpread(snowSpread);
                const y = THREE.MathUtils.randFloatSpread(snowHeight);
                const z = THREE.MathUtils.randFloatSpread(snowHeight);
                vertices.push(x, y, z);
                
                velocities.push(
                    Math.random() * 0.2 + 0.1,
                    Math.random() * 0.05
                );
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('userData', new THREE.Float32BufferAttribute(velocities, 2));

            const material = new THREE.PointsMaterial({
                color: 0xffffff,
                size: device.isMobile ? 0.5 : 0.4,
                map: snowTexture,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const snow = new THREE.Points(geometry, material);
            scene.add(snow);
            snowSystem = snow;
        }

        function updateSnow() {
            if (!snowSystem) return;
            
            const positions = snowSystem.geometry.attributes.position.array;
            const userData = snowSystem.geometry.attributes.userData.array;

            for (let i = 0; i < CONFIG.particles.snowCount; i++) {
                const fallSpeed = userData[i * 2];
                positions[i * 3 + 1] -= fallSpeed;

                const swaySpeed = userData[i * 2 + 1];
                positions[i * 3] += Math.sin(clock.elapsedTime * 2 + i) * swaySpeed * 0.1;

                if (positions[i * 3 + 1] < -30) {
                    positions[i * 3 + 1] = 30;
                    positions[i * 3] = THREE.MathUtils.randFloatSpread(device.isMobile ? 70 : 100);
                    positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(device.isMobile ? 40 : 60);
                }
            }
            snowSystem.geometry.attributes.position.needsUpdate = true;
        }

        class Particle {
            constructor(mesh, type, isDust = false) {
                this.mesh = mesh;
                this.type = type;
                this.isDust = isDust;
                
                this.posTree = new THREE.Vector3();
                this.posScatter = new THREE.Vector3();
                this.baseScale = mesh.scale.x; 

                const speedMult = (type === 'PHOTO') ? 0.3 : 2.0;

                this.spinSpeed = new THREE.Vector3(
                    (Math.random() - 0.5) * speedMult,
                    (Math.random() - 0.5) * speedMult,
                    (Math.random() - 0.5) * speedMult
                );

                this.calculatePositions();
            }

            calculatePositions() {
                if (this.type === 'PHOTO') {
                    this.posTree.set(0, 0, 0); 
                    const rScatter = 8 + Math.random()*12;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    this.posScatter.set(
                        rScatter * Math.sin(phi) * Math.cos(theta),
                        rScatter * Math.sin(phi) * Math.sin(theta),
                        rScatter * Math.cos(phi)
                    );
                    return;
                }

                const h = CONFIG.particles.treeHeight;
                const halfH = h / 2;
                let t = Math.random(); 
                t = Math.pow(t, 0.8); 
                const y = (t * h) - halfH;
                
                let rMax = CONFIG.particles.treeRadius * (1.0 - t); 
                if (rMax < 0.5) rMax = 0.5;

                const angle = t * 50 * Math.PI + Math.random() * Math.PI; 
                const r = rMax * (0.8 + Math.random() * 0.4); 
                this.posTree.set(Math.cos(angle) * r, y, Math.sin(angle) * r);

                let rScatter = this.isDust ? (12 + Math.random()*20) : (8 + Math.random()*12);
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                this.posScatter.set(
                    rScatter * Math.sin(phi) * Math.cos(theta),
                    rScatter * Math.sin(phi) * Math.sin(theta),
                    rScatter * Math.cos(phi)
                );
            }

            update(dt, mode, focusTargetMesh) {
                let target = this.posTree;
                
                if (mode === 'SCATTER') target = this.posScatter;
                else if (mode === 'FOCUS') {
                    if (this.mesh === focusTargetMesh) {
                        const desiredWorldPos = new THREE.Vector3(0, 2, 35);
                        const invMatrix = new THREE.Matrix4().copy(mainGroup.matrixWorld).invert();
                        target = desiredWorldPos.applyMatrix4(invMatrix);
                    } else {
                        target = this.posScatter;
                    }
                }

                const lerpSpeed = (mode === 'FOCUS' && this.mesh === focusTargetMesh) ? 5.0 : 2.0; 
                this.mesh.position.lerp(target, lerpSpeed * dt);

                if (mode === 'SCATTER') {
                    this.mesh.rotation.x += this.spinSpeed.x * dt;
                    this.mesh.rotation.y += this.spinSpeed.y * dt;
                    this.mesh.rotation.z += this.spinSpeed.z * dt; 
                } else if (mode === 'TREE') {
                    if (this.type === 'PHOTO') {
                        this.mesh.lookAt(0, this.mesh.position.y, 0);
                        this.mesh.rotateY(Math.PI);
                    } else {
                        this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, dt);
                        this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, 0, dt);
                        this.mesh.rotation.y += 0.5 * dt; 
                    }
                }
                
                if (mode === 'FOCUS' && this.mesh === focusTargetMesh) {
                    this.mesh.lookAt(camera.position); 
                }

                let s = this.baseScale;
                if (this.isDust) {
                    s = this.baseScale * (0.8 + 0.4 * Math.sin(clock.elapsedTime * 4 + this.mesh.id));
                    if (mode === 'TREE') s = 0; 
                } else if (mode === 'SCATTER' && this.type === 'PHOTO') {
                    s = this.baseScale * 2.5; 
                } else if (mode === 'FOCUS') {
                    if (this.mesh === focusTargetMesh) s = device.isMobile ? 3.5 : 4.5; 
                    else s = this.baseScale * 0.8; 
                }
                
                this.mesh.scale.lerp(new THREE.Vector3(s,s,s), 4*dt);
            }
        }

        function updatePhotoLayout() {
            const photos = particleSystem.filter(p => p.type === 'PHOTO');
            const count = photos.length;
            if (count === 0) return;

            const h = CONFIG.particles.treeHeight * 0.9;
            const bottomY = -h/2;
            const stepY = h / count;
            const loops = 3;

            photos.forEach((p, i) => {
                const y = bottomY + stepY * i + stepY/2;
                const fullH = CONFIG.particles.treeHeight;
                const normalizedH = (y + fullH/2) / fullH; 

                let rMax = CONFIG.particles.treeRadius * (1.0 - normalizedH);
                if (rMax < 1.0) rMax = 1.0;
                
                const r = rMax + 3.0; 
                const angle = normalizedH * Math.PI * 2 * loops + (Math.PI/4); 

                p.posTree.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
            });
        }

        function createParticles() {
            const sphereSegments = device.profile === 'low' ? 16 : 32;
            const sphereGeo = new THREE.SphereGeometry(0.5, sphereSegments, sphereSegments); 
            const boxGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55); 
            const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 0.3, 0),
                new THREE.Vector3(0.1, 0.5, 0), new THREE.Vector3(0.3, 0.4, 0)
            ]);
            const candyGeo = new THREE.TubeGeometry(curve, device.profile === 'low' ? 8 : 16, 0.08, 8, false);

            const goldMat = new THREE.MeshStandardMaterial({
                color: CONFIG.colors.champagneGold,
                metalness: 1.0, roughness: 0.1,
                envMapIntensity: 2.0, 
                emissive: 0x443300,   
                emissiveIntensity: 0.3
            });

            const greenMat = new THREE.MeshStandardMaterial({
                color: CONFIG.colors.deepGreen,
                metalness: 0.2, roughness: 0.8,
                emissive: 0x002200,
                emissiveIntensity: 0.2 
            });

            const redMat = new THREE.MeshPhysicalMaterial({
                color: CONFIG.colors.accentRed,
                metalness: 0.3, roughness: 0.2, clearcoat: 1.0,
                emissive: 0x330000
            });
            
            const candyMat = new THREE.MeshStandardMaterial({ map: caneTexture, roughness: 0.4 });

            for (let i = 0; i < CONFIG.particles.count; i++) {
                const rand = Math.random();
                let mesh, type;
                
                if (rand < 0.40) {
                    mesh = new THREE.Mesh(boxGeo, greenMat);
                    type = 'BOX';
                } else if (rand < 0.70) {
                    mesh = new THREE.Mesh(boxGeo, goldMat);
                    type = 'GOLD_BOX';
                } else if (rand < 0.92) {
                    mesh = new THREE.Mesh(sphereGeo, goldMat);
                    type = 'GOLD_SPHERE';
                } else if (rand < 0.97) {
                    mesh = new THREE.Mesh(sphereGeo, redMat);
                    type = 'RED';
                } else {
                    mesh = new THREE.Mesh(candyGeo, candyMat);
                    type = 'CANE';
                }

                const s = 0.4 + Math.random() * 0.5;
                mesh.scale.set(s,s,s);
                mesh.rotation.set(Math.random()*6, Math.random()*6, Math.random()*6);
                
                mainGroup.add(mesh);
                particleSystem.push(new Particle(mesh, type, false));
            }

            // Star
            const starShape = new THREE.Shape();
            const points = 5;
            const outerRadius = device.isMobile ? 1.2 : 1.5;
            const innerRadius = device.isMobile ? 0.55 : 0.7; 
            
            for (let i = 0; i < points * 2; i++) {
                const angle = (i * Math.PI) / points + Math.PI / 2;
                const r = (i % 2 === 0) ? outerRadius : innerRadius;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                if (i === 0) starShape.moveTo(x, y);
                else starShape.lineTo(x, y);
            }
            starShape.closePath();

            const starGeo = new THREE.ExtrudeGeometry(starShape, {
                depth: 0.4,
                bevelEnabled: true,
                bevelThickness: 0.1,
                bevelSize: 0.1,
                bevelSegments: 2
            });
            starGeo.center(); 

            const starMat = new THREE.MeshStandardMaterial({
                color: 0xffdd88, emissive: 0xffaa00, emissiveIntensity: 1.0,
                metalness: 1.0, roughness: 0
            });
            const star = new THREE.Mesh(starGeo, starMat);
            star.position.set(0, CONFIG.particles.treeHeight/2 + 1.2, 0);
            mainGroup.add(star);
            
            mainGroup.add(photoMeshGroup);
        }

        function createDust() {
            const geo = new THREE.TetrahedronGeometry(0.08, 0);
            const mat = new THREE.MeshBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0.8 });
            
            for(let i=0; i<CONFIG.particles.dustCount; i++) {
                 const mesh = new THREE.Mesh(geo, mat);
                 mesh.scale.setScalar(0.5 + Math.random());
                 mainGroup.add(mesh);
                 particleSystem.push(new Particle(mesh, 'DUST', true));
            }
        }

        function addPhotoToScene(texture) {
            const frameGeo = new THREE.BoxGeometry(1.4, 1.4, 0.05);
            const frameMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.champagneGold, metalness: 1.0, roughness: 0.1 });
            const frame = new THREE.Mesh(frameGeo, frameMat);

            let width = 1.2;
            let height = 1.2;
            
            if (texture.image) {
                const aspect = texture.image.width / texture.image.height;
                if (aspect > 1) {
                    height = width / aspect;
                } else {
                    width = height * aspect;
                }
            }

            const photoGeo = new THREE.PlaneGeometry(width, height);
            const photoMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
            const photo = new THREE.Mesh(photoGeo, photoMat);
            photo.position.z = 0.04;

            const group = new THREE.Group();
            group.add(frame);
            group.add(photo);
            
            frame.scale.set(width/1.2, height/1.2, 1);

            const s = 0.8;
            group.scale.set(s,s,s);
            
            photoMeshGroup.add(group);
            particleSystem.push(new Particle(group, 'PHOTO', false));

            updatePhotoLayout();
        }
        
        function handleImageUpload(e) {
            const files = e.target.files;
            if(!files.length) return;
            
            Array.from(files).forEach(f => {
                if (!f.type.startsWith('image/')) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    new THREE.TextureLoader().load(ev.target.result, (t) => {
                        t.colorSpace = THREE.SRGBColorSpace;
                        addPhotoToScene(t);
                    });
                }
                reader.readAsDataURL(f);
            });
        }

        // --- TOUCH CONTROLS ---
        function setupTouchControls() {
            const el = renderer.domElement;

            // Prevent default to avoid scrolling/zooming
            el.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (e.touches.length === 1) {
                    STATE.touch.active = true;
                    STATE.touch.startX = e.touches[0].clientX;
                    STATE.touch.startY = e.touches[0].clientY;
                    STATE.touch.lastX = e.touches[0].clientX;
                    STATE.touch.lastY = e.touches[0].clientY;
                } else if (e.touches.length === 2) {
                    // Pinch start
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    STATE.touch.pinchDist = Math.sqrt(dx * dx + dy * dy);
                }
            }, { passive: false });

            el.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (e.touches.length === 1 && STATE.touch.active) {
                    const dx = e.touches[0].clientX - STATE.touch.lastX;
                    const dy = e.touches[0].clientY - STATE.touch.lastY;
                    
                    // Rotate the tree with touch drag
                    STATE.rotation.y += dx * 0.005;
                    STATE.rotation.x += dy * 0.002;
                    STATE.rotation.x = Math.max(-0.5, Math.min(0.5, STATE.rotation.x));

                    STATE.touch.lastX = e.touches[0].clientX;
                    STATE.touch.lastY = e.touches[0].clientY;
                } else if (e.touches.length === 2) {
                    // Pinch zoom
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const delta = dist - STATE.touch.pinchDist;
                    
                    camera.position.z = Math.max(25, Math.min(100, camera.position.z - delta * 0.1));
                    STATE.touch.pinchDist = dist;
                }
            }, { passive: false });

            el.addEventListener('touchend', (e) => {
                if (e.touches.length === 0) {
                    STATE.touch.active = false;
                }
            }, { passive: false });

            // Double tap to toggle modes
            let lastTap = 0;
            el.addEventListener('touchend', (e) => {
                const now = Date.now();
                if (now - lastTap < 300) {
                    // Double tap detected
                    if (STATE.mode === 'TREE') {
                        STATE.mode = 'SCATTER';
                        STATE.focusTarget = null;
                    } else if (STATE.mode === 'SCATTER') {
                        // Try to focus on a photo
                        const photos = particleSystem.filter(p => p.type === 'PHOTO');
                        if (photos.length) {
                            STATE.mode = 'FOCUS';
                            STATE.focusTarget = photos[Math.floor(Math.random() * photos.length)].mesh;
                        } else {
                            STATE.mode = 'TREE';
                        }
                    } else {
                        STATE.mode = 'TREE';
                        STATE.focusTarget = null;
                    }
                }
                lastTap = now;
            }, { passive: false });
        }

        // --- MEDIAPIPE (Adaptive Fix) ---
        async function initMediaPipe() {
            video = document.getElementById('webcam');
            
            const constraints = {
                video: {
                    width: { ideal: device.isMobile ? 320 : 640 },
                    height: { ideal: device.isMobile ? 240 : 480 },
                    frameRate: { ideal: device.isMobile ? 15 : 30 },
                    facingMode: 'user'
                }
            };

            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
                );
                handLandmarker = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 1
                });
            } catch(e) {
                console.warn("MediaPipe init failed:", e);
                debugInfo.innerText = "Hand tracking unavailable";
                document.getElementById('webcam-wrapper').style.opacity = '0.3';
                return;
            }
            
            if (navigator.mediaDevices?.getUserMedia) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia(constraints);
                    video.srcObject = stream;
                    video.addEventListener("loadeddata", predictWebcam);
                    debugInfo.innerText = "Webcam active. Show hand.";
                } catch(e) {
                    console.warn("Webcam access denied or not available", e);
                    debugInfo.innerText = "Camera: " + (e.message || "unavailable");
                    document.getElementById('webcam-wrapper').style.display = 'none';
                }
            } else {
                debugInfo.innerText = "No camera API";
                document.getElementById('webcam-wrapper').style.display = 'none';
            }
        }

        let lastVideoTime = -1;
        async function predictWebcam() {
            if (video.currentTime !== lastVideoTime) {
                lastVideoTime = video.currentTime;
                if (handLandmarker) {
                    try {
                        const result = handLandmarker.detectForVideo(video, performance.now());
                        processGestures(result);
                    } catch(e) {
                        // Silently handle detection errors
                    }
                }
            }
            requestAnimationFrame(predictWebcam);
        }

        function processGestures(result) {
            if (result.landmarks && result.landmarks.length > 0) {
                STATE.hand.detected = true;
                const lm = result.landmarks[0];
                STATE.hand.x = (lm[9].x - 0.5) * 2; 
                STATE.hand.y = (lm[9].y - 0.5) * 2;

                const thumb = lm[4]; 
                const index = lm[8]; 
                const wrist = lm[0];
                const middleMCP = lm[9];

                const handSize = Math.hypot(middleMCP.x - wrist.x, middleMCP.y - wrist.y);
                if (handSize < 0.02) return;

                const tips = [lm[8], lm[12], lm[16], lm[20]];
                let avgTipDist = 0;
                tips.forEach(t => avgTipDist += Math.hypot(t.x - wrist.x, t.y - wrist.y));
                avgTipDist /= 4;

                const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);

                const extensionRatio = avgTipDist / handSize;
                const pinchRatio = pinchDist / handSize;

                debugInfo.innerText = `Ext: ${extensionRatio.toFixed(2)} | Pinch: ${pinchRatio.toFixed(2)} | ${STATE.mode}`;

                if (extensionRatio < 1.5) {
                    STATE.mode = 'TREE';
                    STATE.focusTarget = null;
                } else if (pinchRatio < 0.35) {
                    if (STATE.mode !== 'FOCUS') {
                        STATE.mode = 'FOCUS';
                        const photos = particleSystem.filter(p => p.type === 'PHOTO');
                        if (photos.length) STATE.focusTarget = photos[Math.floor(Math.random()*photos.length)].mesh;
                    }
                } else if (extensionRatio > 1.7) {
                    STATE.mode = 'SCATTER';
                    STATE.focusTarget = null;
                }
            } else {
                STATE.hand.detected = false;
                debugInfo.innerText = "No hand detected";
            }
        }

        function setupEvents() {
            // Debounced resize handler
            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    const w = window.innerWidth;
                    const h = window.innerHeight;
                    
                    camera.aspect = w / h;
                    camera.updateProjectionMatrix();
                    renderer.setSize(w, h);
                    composer.setSize(w, h);
                    
                    // Update bloom pass resolution
                    if (bloomPass) {
                        bloomPass.resolution.set(w, h);
                    }
                }, 100);
            });

            // Handle orientation change specifically
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    const w = window.innerWidth;
                    const h = window.innerHeight;
                    camera.aspect = w / h;
                    
                    // Adjust camera distance based on new aspect ratio
                    if (w < h) {
                        // Portrait - pull camera back more
                        camera.position.z = Math.max(camera.position.z, CONFIG.camera.z * 1.1);
                    }
                    
                    camera.updateProjectionMatrix();
                    renderer.setSize(w, h);
                    composer.setSize(w, h);
                }, 300);
            });
            
            document.getElementById('file-input').addEventListener('change', handleImageUpload);
            document.getElementById('folder-input').addEventListener('change', handleImageUpload);
            
            window.addEventListener('keydown', (e) => {
                if (e.key.toLowerCase() === 'h') {
                    const controls = document.querySelector('.controls-wrapper');
                    if (controls) controls.classList.toggle('ui-hidden');
                    const webcam = document.getElementById('webcam-wrapper');
                    if(webcam) webcam.classList.toggle('ui-hidden');
                }
            });

            // Mouse wheel zoom (desktop)
            renderer.domElement.addEventListener('wheel', (e) => {
                e.preventDefault();
                camera.position.z = Math.max(25, Math.min(100, camera.position.z + e.deltaY * 0.05));
            }, { passive: false });
        }

        function animate() {
            requestAnimationFrame(animate);
            const dt = Math.min(clock.getDelta(), 0.05); // Cap delta time to prevent jumps

            // Rotation Logic
            if (STATE.touch.active) {
                // Touch is handling rotation directly, don't override
            } else if (STATE.mode === 'SCATTER' && STATE.hand.detected) {
                const targetRotY = STATE.hand.x * Math.PI * 0.9; 
                const targetRotX = STATE.hand.y * Math.PI * 0.25;
                STATE.rotation.y += (targetRotY - STATE.rotation.y) * 3.0 * dt;
                STATE.rotation.x += (targetRotX - STATE.rotation.x) * 3.0 * dt;
            } else {
                if(STATE.mode === 'TREE' && !STATE.touch.active) {
                    STATE.rotation.y += 0.3 * dt;
                    STATE.rotation.x += (0 - STATE.rotation.x) * 2.0 * dt;
                } else if (!STATE.touch.active) {
                    STATE.rotation.y += 0.1 * dt; 
                }
            }

            mainGroup.rotation.y = STATE.rotation.y;
            mainGroup.rotation.x = STATE.rotation.x;

            particleSystem.forEach(p => p.update(dt, STATE.mode, STATE.focusTarget));
            
            updateSnow();

            composer.render();
        }

        init();