// ========== PARTICLES ==========
        function createParticles() {
            const container = document.getElementById('particles');
            for (let i = 0; i < 40; i++) {
                const p = document.createElement('div');
                p.className = 'particle';
                p.style.left = Math.random() * 100 + '%';
                p.style.animationDuration = (4 + Math.random() * 6) + 's';
                p.style.animationDelay = Math.random() * 5 + 's';
                p.style.width = p.style.height = (2 + Math.random() * 4) + 'px';
                container.appendChild(p);
            }
        }
        createParticles();

        // ========== SECTION TRANSITION ==========
        function transitionTo(currentId, nextId, callback) {
            const current = document.getElementById(currentId);
            const next = document.getElementById(nextId);

            current.classList.add('exit');
            current.classList.remove('active');

            setTimeout(() => {
                current.classList.remove('exit');
                next.classList.add('active');
                if (callback) callback();
            }, 800);
        }

        // ========== PROGRESS BAR UTILITY ==========
        function animateProgress(barId, durationMs, onComplete) {
            const bar = document.getElementById(barId);
            const start = Date.now();
            function update() {
                const elapsed = Date.now() - start;
                const pct = Math.min((elapsed / durationMs) * 100, 100);
                bar.style.width = pct + '%';
                if (pct < 100) {
                    requestAnimationFrame(update);
                } else if (onComplete) {
                    onComplete();
                }
            }
            requestAnimationFrame(update);
        }

        // ========== WELCOME SECTION ==========
        const welcomeMessage = "Chào mừng bạn đã tới! Trước khi vào, hãy xem qua phần hướng dẫn sử dụng sau đây.";

        function typeWriter(text, elementId, speed, callback) {
            const el = document.getElementById(elementId);
            let i = 0;
            function type() {
                if (i < text.length) {
                    el.textContent += text.charAt(i);
                    i++;
                    setTimeout(type, speed);
                } else {
                    if (callback) callback();
                }
            }
            type();
        }

        // Start the experience
        setTimeout(() => {
            typeWriter(welcomeMessage, 'welcome-text', 50, () => {
                document.getElementById('welcome-cursor').style.display = 'none';
                document.getElementById('welcome-progress-container').style.opacity = '1';
                document.getElementById('welcome-progress-container').style.transition = 'opacity 0.5s';

                animateProgress('welcome-progress', 2500, () => {
                    transitionTo('section-welcome', 'section-step1', startStep1);
                });
            });
        }, 500);

        // ========== STEP 1: ✊ → 🖐️ (2 loops in 5s) ==========
        function startStep1() {
            const fist = document.getElementById('s1-fist');
            const open = document.getElementById('s1-open');
            const text = document.getElementById('s1-text');

            setTimeout(() => {
                text.style.opacity = '1';
                text.style.transform = 'translateY(0)';
            }, 300);

            // Each loop: 2.5s → show fist 1s, transition, show open 1s
            let loopCount = 0;
            const totalLoops = 2;
            const loopDuration = 2500; // 2.5s per loop

            function doLoop() {
                // Start with fist
                fist.className = 'hand-emoji visible';
                open.className = 'hand-emoji hidden';

                setTimeout(() => {
                    // Transition to open
                    fist.className = 'hand-emoji hidden';
                    open.className = 'hand-emoji visible';
                }, loopDuration * 0.4);

                loopCount++;
                if (loopCount < totalLoops) {
                    setTimeout(doLoop, loopDuration);
                }
            }

            doLoop();
            animateProgress('s1-progress', 5000, () => {
                transitionTo('section-step1', 'section-step2', startStep2);
            });
        }

        // ========== STEP 2: 🖐️ → 👌 (2 loops in 5s) ==========
        function startStep2() {
            const open = document.getElementById('s2-open');
            const ok = document.getElementById('s2-ok');
            const text = document.getElementById('s2-text');

            setTimeout(() => {
                text.style.opacity = '1';
                text.style.transform = 'translateY(0)';
            }, 300);

            let loopCount = 0;
            const totalLoops = 2;
            const loopDuration = 2500;

            function doLoop() {
                open.className = 'hand-emoji visible';
                ok.className = 'hand-emoji hidden';

                setTimeout(() => {
                    open.className = 'hand-emoji hidden';
                    ok.className = 'hand-emoji visible';
                }, loopDuration * 0.4);

                loopCount++;
                if (loopCount < totalLoops) {
                    setTimeout(doLoop, loopDuration);
                }
            }

            doLoop();
            animateProgress('s2-progress', 5000, () => {
                transitionTo('section-step2', 'section-step3', startStep3);
            });
        }

        // ========== STEP 3: Two cases, each 2.5s ==========
        function startStep3() {
            const text = document.getElementById('s3-text');
            const caseA = document.getElementById('s3-caseA');
            const caseB = document.getElementById('s3-caseB');
            const orDiv = document.getElementById('s3-or');

            setTimeout(() => {
                text.style.opacity = '1';
                text.style.transform = 'translateY(0)';
            }, 300);

            // Case A: OK → Open hand (first 2.5s)
            setTimeout(() => {
                caseA.classList.add('visible');
                // Animate: ok -> open
                const okA = document.getElementById('s3a-ok');
                const openA = document.getElementById('s3a-open');
                setTimeout(() => {
                    okA.className = 'hand-emoji hidden';
                    openA.className = 'hand-emoji visible';
                }, 1000);
            }, 300);

            // Show divider
            setTimeout(() => {
                orDiv.classList.add('visible');
            }, 2500);

            // Case B: OK → Fist (next 2.5s)
            setTimeout(() => {
                caseB.classList.add('visible');
                const okB = document.getElementById('s3b-ok');
                const fistB = document.getElementById('s3b-fist');
                setTimeout(() => {
                    okB.className = 'hand-emoji hidden';
                    fistB.className = 'hand-emoji visible';
                }, 1000);
            }, 2800);

            animateProgress('s3-progress', 5000, () => {
                transitionTo('section-step3', 'section-ending', startEnding);
            });
        }

        // ========== ENDING ==========
        function startEnding() {
            launchConfetti();
        }

        function launchConfetti() {
            const container = document.getElementById('confetti-container');
            const colors = ['#a78bfa', '#818cf8', '#f472b6', '#fb923c', '#34d399', '#fbbf24', '#f87171', '#60a5fa'];

            for (let i = 0; i < 60; i++) {
                setTimeout(() => {
                    const piece = document.createElement('div');
                    piece.className = 'confetti-piece';
                    piece.style.left = Math.random() * 100 + '%';
                    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                    piece.style.animationDuration = (2 + Math.random() * 3) + 's';
                    piece.style.width = (6 + Math.random() * 8) + 'px';
                    piece.style.height = (6 + Math.random() * 8) + 'px';
                    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
                    container.appendChild(piece);

                    setTimeout(() => piece.remove(), 5000);
                }, i * 50);
            }
        }

        function goToMainPage() {
            const btn = document.getElementById('main-btn');
            btn.textContent = 'Đang chuyển...';
            btn.style.opacity = '0.7';

            // Fade out everything
            document.body.style.transition = 'opacity 0.8s ease';
            document.body.style.opacity = '0';

            setTimeout(() => {
                // Replace with your actual main page URL
                alert('Chuyển đến trang web chính! (Thay đổi URL trong code)');
                document.body.style.opacity = '1';
                btn.textContent = 'Chuyển qua trang web chính →';
                btn.style.opacity = '1';
                window.location.href = '../html/xmastree.html';
            }, 800);
        }