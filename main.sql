-- Inicializácia bezpečnostnej databázy

-- Tabuľka pre ukladanie histórie meraní a poplachov
CREATE TABLE IF NOT EXISTS security_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    system_status TEXT NOT NULL,         -- Online / Offline
    sensor_value_encrypted TEXT NOT NULL, -- Zašifrovaná hodnota z Arduina (AES-256)
    intruder_detected INTEGER NOT NULL,  -- 0 = False, 1 = True (netreba šifrovať, slúži na rýchle indexovanie)
    alarm_state INTEGER NOT NULL         -- 0 = Off, 1 = On
);

-- Tabuľka pre audit logy (záznamy o zapnutí systému, rearmovaní atď.)
CREATE TABLE IF NOT EXISTS audit_trail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    event_encrypted TEXT NOT NULL         -- Zašifrovaný popis aktivity
);

-- Index pre rýchlejšie vyhľadávanie kritických incidentov
CREATE INDEX IF NOT EXISTS idx_intruder ON security_logs(intruder_detected);
