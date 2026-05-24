class SecurityDashboard {
    constructor() {
        this.isIntruderPresent = false;
        this.liveDataPoints = [];
        // 24 bodov pre mapu hustoty incidentov (začíname s nízkymi hodnotami)
        this.densityDataPoints = Array(24).fill(10); 
        this.maxLivePoints = 50;

        // Mapovanie DOM prvkov
        this.elSensorValue = document.getElementById("sensorValue");
        this.elUpdateTime = document.getElementById("updateTime");
        this.elLastDetection = document.getElementById("lastDetection");
        this.elSystemStatus = document.getElementById("systemStatus");
        this.elAlertText = document.getElementById("alertText");
        this.elThreat = document.getElementById("threat");
        this.elAlarm = document.getElementById("alarm");
        this.elRadarTarget = document.getElementById("radarTarget");
        this.elRadarPanel = document.getElementById("radarPanel");
        this.elConsoleLogs = document.getElementById("consoleLogs");
        this.elBrandDot = document.getElementById("brandDot");

        // Inicializácia grafov (Canvas)
        this.canvasRealtime = document.getElementById("realtimeChart");
        this.ctxRealtime = this.canvasRealtime.getContext("2d");
        
        this.canvasDensity = document.getElementById("densityChart");
        this.ctxDensity = this.canvasDensity.getContext("2d");

        this.responsiveCanvases();
        this.startDashboardPolling();
        
        window.addEventListener('resize', () => this.responsiveCanvases());
        this.pushLog("System Kernel Bootstrap completed successfully.");
    }

    responsiveCanvases() {
        this.canvasRealtime.width = this.canvasRealtime.parentElement?.clientWidth || 500;
        this.canvasRealtime.height = 180;
        this.canvasDensity.width = this.canvasDensity.parentElement?.clientWidth || 800;
        this.canvasDensity.height = 160;
        this.renderCharts();
    }

    pushLog(message, isWarning = false) {
        const time = new Date().toLocaleTimeString();
        const colorClass = isWarning ? 'style="color:#ef4444;"' : '';
        const symbol = isWarning ? '[!] ' : '>> ';
        
        this.elConsoleLogs.innerHTML += `
            <div class="log-row" ${colorClass}>
                <span class="log-ts">[${time}]</span>
                <span>${symbol}${message}</span>
            </div>
        `;
        this.elConsoleLogs.scrollTop = this.elConsoleLogs.scrollHeight;
    }

    renderCharts() {
        this.drawRealtimeTelemetry();
        this.drawDensityMap();
    }

    // Graf 1: Plynulá real-time línia vlnenia laseru
    drawRealtimeTelemetry() {
        const ctx = this.ctxRealtime;
        const w = this.canvasRealtime.width;
        const h = this.canvasRealtime.height;
        ctx.clearRect(0, 0, w, h);

        if (this.liveDataPoints.length === 0) return;

        const maxVal = Math.max(...this.liveDataPoints, 100);
        const stepX = w / (this.maxLivePoints - 1);

        // Neónový gradient pod čiarou grafu
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < this.liveDataPoints.length; i++) {
            ctx.lineTo(i * stepX, h - (this.liveDataPoints[i] / maxVal) * (h - 30));
        }
        ctx.lineTo((this.liveDataPoints.length - 1) * stepX, h);
        ctx.closePath();
        
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, this.isIntruderPresent ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fill();

        // Samotná vykreslená čiara
        ctx.beginPath();
        for (let i = 0; i < this.liveDataPoints.length; i++) {
            const x = i * stepX;
            const y = h - (this.liveDataPoints[i] / maxVal) * (h - 30);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = this.isIntruderPresent ? '#ef4444' : '#10b981';
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }

    // Graf 2: Stĺpcový graf (Hustota / Frekvencia incidentov)
    drawDensityMap() {
        const ctx = this.ctxDensity;
        const w = this.canvasDensity.width;
        const h = this.canvasDensity.height;
        ctx.clearRect(0, 0, w, h);

        const barCount = this.densityDataPoints.length;
        const gap = 6;
        const barWidth = (w - (barCount - 1) * gap) / barCount;
        const maxVal = Math.max(...this.densityDataPoints, 30);

        for (let i = 0; i < barCount; i++) {
            const barHeight = (this.densityDataPoints[i] / maxVal) * (h - 20);
            const x = i * (barWidth + gap);
            const y = h - barHeight;

            // Zmena farby stĺpca podľa závažnosti
            ctx.fillStyle = this.densityDataPoints[i] > 40 ? 'rgba(239,68,68,0.7)' : 'rgba(31, 41, 55, 0.5)';
            if (i === barCount - 1 && this.isIntruderPresent) ctx.fillStyle = '#ef4444';

            ctx.fillRect(x, y, barWidth, barHeight);
        }
    }

    // Sťahovanie live telemetrie z Flask API
    async fetchTelemetry() {
        try {
            const res = await fetch("/api/security");
            const data = await res.json();

            // Aktualizácia textových hodnôt na dashboarde
            this.elSensorValue.innerText = data.sensor_value.toString();
            this.elUpdateTime.innerText = data.last_update;
            this.elLastDetection.innerText = data.last_detection;

            // Pridanie bodu do live grafu
            this.liveDataPoints.push(data.sensor_value);
            if (this.liveDataPoints.length > this.maxLivePoints) this.liveDataPoints.shift();
            
            // Reakcia na narušenie (Poplachový stav)
            if (data.intruder_detected) {
                this.isIntruderPresent = true;
                document.body.classList.add("alarm-active");
                this.elRadarPanel.classList.add("alarm-triggered");
                
                this.elAlertText.innerText = "✗ SECURITY_BREACH_DETECTED";
                this.elAlertText.style.color = "var(--brand-red)";
                
                this.elThreat.innerText = "CRITICAL / HIGH";
                this.elThreat.style.color = "var(--brand-red)";
                this.elAlarm.innerText = "TRIGGERED";
                this.elAlarm.style.color = "var(--brand-red)";
                
                this.elRadarTarget.style.display = "block";
                this.elBrandDot.style.backgroundColor = "var(--brand-red)";

                // Zdvihneme posledný stĺpec v grafe 2 pri narušení
                this.densityDataPoints[this.densityDataPoints.length - 1] = 65;

                if (data.alarm && this.elRadarPanel.dataset.lastState !== "alert") {
                    this.pushLog("CRITICAL: Optical laser path obstructed. Triggering state machine.", true);
                    this.elRadarPanel.dataset.lastState = "alert";
                }
            } else {
                this.isIntruderPresent = false;
                document.body.classList.remove("alarm-active");
                this.elRadarPanel.classList.remove("alarm-triggered");

                this.elAlertText.innerText = "✓ SECURE_ZONE_LOCK";
                this.elAlertText.style.color = "var(--brand-green)";
                
                this.elThreat.innerText = "NOMINAL";
                this.elThreat.style.color = "var(--brand-green)";
                this.elAlarm.innerText = "DEACTIVATED";
                this.elAlarm.style.color = "var(--brand-green)";
                
                this.elRadarTarget.style.display = "none";
                this.elBrandDot.style.backgroundColor = "var(--brand-green)";

                if (this.elRadarPanel.dataset.lastState === "alert") {
                    this.pushLog("Notice: Laser alignment verified. Returning to nominal watch.");
                    this.elRadarPanel.dataset.lastState = "stable";
                    
                    // Pridanie náhodného historického záznamu pre bohatosť grafu po úspešnom vyriešení poplachu
                    this.densityDataPoints.push(Math.floor(Math.random() * 20) + 5);
                    this.densityDataPoints.shift();
                }
            }

            // Status jadra systému
            if (data.system_status === "ONLINE") {
                this.elSystemStatus.innerText = "CORE ONLINE";
                this.elSystemStatus.classList.remove("offline");
            } else {
                this.elSystemStatus.innerText = "CORE OFFLINE";
                this.elSystemStatus.classList.add("offline");
            }

            this.renderCharts();

        } catch (e) {
            this.elSystemStatus.innerText = "DISCONNECTED FROM API";
            this.elSystemStatus.classList.add("offline");
        }
    }

    startDashboardPolling() {
        // Obnova každých 250ms pre okamžité reakcie grafov na pohyb na laseri
        setInterval(() => this.fetchTelemetry(), 250);
        this.fetchTelemetry();
    }
}

// Inicializácia rozhrania po načítaní celej HTML stránky
document.addEventListener("DOMContentLoaded", () => new SecurityDashboard());
