interface SecurityData {
    laser_status: string;
    system_status: string;
    intruder_detected: boolean;
    sensor_value: number;
    alarm: boolean;
    last_detection: string;
    last_update: string;
}

class SecurityDashboard {
    private isIntruderPresent: boolean = false;
    private liveDataPoints: number[] = [];
    private densityDataPoints: number[] = Array(24).fill(10); // 24 bodov pre mapu hustoty dňa
    
    private readonly maxLivePoints = 50;

    // DOM Prvky
    private elSensorValue = document.getElementById("sensorValue") as HTMLSpanElement;
    private elUpdateTime = document.getElementById("updateTime") as HTMLSpanElement;
    private elLastDetection = document.getElementById("lastDetection") as HTMLSpanElement;
    private elSystemStatus = document.getElementById("systemStatus") as HTMLDivElement;
    private elAlertText = document.getElementById("alertText") as HTMLDivElement;
    private elThreat = document.getElementById("threat") as HTMLSpanElement;
    private elAlarm = document.getElementById("alarm") as HTMLSpanElement;
    private elRadarTarget = document.getElementById("radarTarget") as HTMLDivElement;
    private elRadarPanel = document.getElementById("radarPanel") as HTMLDivElement;
    private elConsoleLogs = document.getElementById("consoleLogs") as HTMLDivElement;
    private elBrandDot = document.getElementById("brandDot") as HTMLDivElement;

    // Canvases
    private canvasRealtime = document.getElementById("realtimeChart") as HTMLCanvasElement;
    private ctxRealtime = this.canvasRealtime.getContext("2d") as CanvasRenderingContext2D;
    
    private canvasDensity = document.getElementById("densityChart") as HTMLCanvasElement;
    private ctxDensity = this.canvasDensity.getContext("2d") as CanvasRenderingContext2D;

    constructor() {
        this.responsiveCanvases();
        this.startDashboardPolling();
        window.addEventListener('resize', () => this.responsiveCanvases());
        this.pushLog("System Kernel Bootstrap completed successfully.");
    }

    private responsiveCanvases(): void {
        this.canvasRealtime.width = this.canvasRealtime.parentElement?.clientWidth || 500;
        this.canvasRealtime.height = 180;
        this.canvasDensity.width = this.canvasDensity.parentElement?.clientWidth || 800;
        this.canvasDensity.height = 160;
        this.renderCharts();
    }

    private pushLog(message: string, isWarning: boolean = false): void {
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

    private renderCharts(): void {
        this.drawRealtimeTelemetry();
        this.drawDensityMap();
    }

    // Graf 1: Klasická live línia
    private drawRealtimeTelemetry(): void {
        const ctx = this.ctxRealtime;
        const w = this.canvasRealtime.width;
        const h = this.canvasRealtime.height;
        ctx.clearRect(0, 0, w, h);

        if(this.liveDataPoints.length === 0) return;

        const maxVal = Math.max(...this.liveDataPoints, 100);
        const stepX = w / (this.maxLivePoints - 1);

        // Gradient pod krivkou
        ctx.beginPath();
        ctx.moveTo(0, h);
        for(let i = 0; i < this.liveDataPoints.length; i++) {
            ctx.lineTo(i * stepX, h - (this.liveDataPoints[i] / maxVal) * (h - 30));
        }
        ctx.lineTo((this.liveDataPoints.length - 1) * stepX, h);
        ctx.closePath();
        
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, this.isIntruderPresent ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fill();

        // Samotná línia
        ctx.beginPath();
        for(let i = 0; i < this.liveDataPoints.length; i++) {
            const x = i * stepX;
            const y = h - (this.liveDataPoints[i] / maxVal) * (h - 30);
            if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = this.isIntruderPresent ? '#ef4444' : '#10b981';
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }

    // Graf 2: Profesionálny stĺpcový graf (Hustota incidentov)
    private drawDensityMap(): void {
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

            // Vyfarbenie na základe vyťaženia
            ctx.fillStyle = this.densityDataPoints[i] > 40 ? 'rgba(239,68,68,0.7)' : 'rgba(31, 41, 55, 0.5)';
            if(i === barCount - 1 && this.isIntruderPresent) ctx.fillStyle = '#ef4444';

            // Kreslenie zaobleného obdĺžnika ručne
            ctx.beginPath();
            ctx.fillRect(x, y, barWidth, barHeight);
        }
    }

    private async fetchTelemetry(): Promise<void> {
        try {
            const res = await fetch("/api/security");
            const data: SecurityData = await res.json();

            // Priradenie hodnôt
            this.elSensorValue.innerText = data.sensor_value.toString();
            this.elUpdateTime.innerText = data.last_update;
            this.elLastDetection.innerText = data.last_detection;

            // Správa histórie dát
            this.liveDataPoints.push(data.sensor_value);
            if(this.liveDataPoints.length > this.maxLivePoints) this.liveDataPoints.shift();
            
            // Reakcia na stav poplachu
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

                // Zvýšime stĺpec v grafe 2 pri útoku
                this.densityDataPoints[this.densityDataPoints.length - 1] = 65;

                if(data.alarm && this.elRadarPanel.dataset.lastState !== "alert") {
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

                if(this.elRadarPanel.dataset.lastState === "alert") {
                    this.pushLog("Notice: Laser alignment verified. Returning to nominal watch.");
                    this.elRadarPanel.dataset.lastState = "stable";
                    // Pridáme náhodný historický bod do mapy hustoty pre vizuálnu bohatosť po útoku
                    this.densityDataPoints.push(Math.floor(Math.random() * 20) + 5);
                    this.densityDataPoints.shift();
                }
            }

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

    private startDashboardPolling(): void {
        setInterval(() => this.fetchTelemetry(), 250); // Zvýšená frekvencia pre presnejšie vykresľovanie
        this.fetchTelemetry();
    }
}

