import serial
import serial.tools.list_ports
import json
import threading
import os
import sqlite3
from datetime import datetime
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from cryptography.fernet import Fernet

app = Flask(__name__)
CORS(app)

DB_FILE = "security.db"
KEY_FILE = "secret.key"

# -------------------------------------------------------------------------
# KRYPTOGRAFIA (ŠIFROVANIE)
# -------------------------------------------------------------------------
def load_or_generate_key():
    """Načíta existujúci šifrovací kľúč alebo vygeneruje nový (iba tvoj master kľúč)"""
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, "rb") as kf:
            return kf.read()
    else:
        key = Fernet.generate_key()
        with open(KEY_FILE, "wb") as kf:
            kf.write(key)
        print(f"[!] Vygenerovaný NOVÝ unikátny šifrovací kľúč a uložený do {KEY_FILE}. Tento súbor nikomu nedávaj!")
        return key

cipher_suite = Fernet(load_or_generate_key())

def encrypt_data(data_string: str) -> str:
    """Zašifruje text pomocou AES-256 (Fernet)"""
    return cipher_suite.encrypt(data_string.encode('utf-8')).decode('utf-8')

def decrypt_data(encrypted_string: str) -> str:
    """Dešifruje text späť do pôvodnej podoby"""
    try:
        return cipher_suite.decrypt(encrypted_string.encode('utf-8')).decode('utf-8')
    except Exception:
        return "ERROR_DECRYPTION_FAILED"

# -------------------------------------------------------------------------
# DATABÁZA (SQLITE)
# -------------------------------------------------------------------------
def init_database():
    """Načíta main.sql a vytvorí tabuľky, ak neexistujú"""
    if not os.path.exists(DB_FILE):
        print("[*] Vytváram novú šifrovanú databázu...")
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # ZMENA: Tu sme zmenili 'init_db.sql' na 'main.sql'
    with open("main.sql", "r") as f:
        sql_script = f.read()
    
    cursor.executescript(sql_script)
    conn.commit()
    conn.close()

def save_to_database(status, raw_value, intruder, alarm):
    """Zašifruje citlivé dáta a uloží ich do SQL databázy"""
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Šifrujeme hodnotu senzora pred zápisom do SQL
        encrypted_val = encrypt_data(str(raw_value))
        
        cursor.execute("""
            INSERT INTO security_logs (system_status, sensor_value_encrypted, intruder_detected, alarm_state)
            VALUES (?, ?, ?, ?)
        """, (status, encrypted_val, 1 if intruder else 0, 1 if alarm else 0))
        
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Chyba pri zápise do SQL: {e}")

# -------------------------------------------------------------------------
# ARDUINO & LIVE DATA
# -------------------------------------------------------------------------
security_data = {
    "laser_status": "ACTIVE",
    "system_status": "ONLINE",
    "intruder_detected": False,
    "sensor_value": 0,
    "alarm": False,
    "last_detection": "None",
    "last_update": "--:--:--"
}

def find_arduino_port():
    ports = serial.tools.list_ports.comports()
    for p in ports:
        desc = p.description
        if "Arduino" in desc or "CH340" in desc or "USB Serial" in desc:
            return p.device
    return None

def read_serial():
    port = find_arduino_port()
    if not port:
        print("Arduino nenajdene")
        security_data["system_status"] = "OFFLINE"
        return

    print(f"Pripojene na {port}")
    try:
        ser = serial.Serial(port, 9600, timeout=1)
        while True:
            line = ser.readline().decode("utf-8").strip()
            if line:
                try:
                    data = json.loads(line)
                    value = data.get("distance", 0)
                    intruder = data.get("object", False)

                    security_data["sensor_value"] = value
                    security_data["intruder_detected"] = intruder
                    security_data["system_status"] = "ONLINE"
                    security_data["last_update"] = datetime.now().strftime("%H:%M:%S")

                    if intruder:
                        security_data["alarm"] = True
                        security_data["last_detection"] = datetime.now().strftime("%H:%M:%S")
                    else:
                        security_data["alarm"] = False
                    
                    # UKLADANIE DO ŠIFROVANEJ DATABÁZY
                    save_to_database(
                        security_data["system_status"],
                        security_data["sensor_value"],
                        security_data["intruder_detected"],
                        security_data["alarm"]
                    )

                except json.JSONDecodeError:
                    pass
    except Exception as e:
        print(f"Chyba komunikacie: {e}")
        security_data["system_status"] = "OFFLINE"

# -------------------------------------------------------------------------
# FLASK ENDPOINTS
# -------------------------------------------------------------------------
@app.route("/")
def home():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def send_static(path):
    return send_from_directory(".", path)

@app.route("/api/security")
def api_security():
    response = jsonify(security_data)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

# Nové analytické API, ktoré pre dashboard dešifruje historické dáta z SQL
@app.route("/api/history")
def api_history():
    """Načíta posledných 50 záznamov z SQL, dešifruje ich a pošle frontendu"""
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT timestamp, system_status, sensor_value_encrypted, intruder_detected, alarm_state 
            FROM security_logs ORDER BY id DESC LIMIT 50
        """)
        rows = cursor.fetchall()
        conn.close()

        history_list = []
        for r in reversed(rows): # Chceme chronologicky od najstarších po najnovšie
            history_list.append({
                "timestamp": r[0],
                "status": r[1],
                "sensor_value": int(decrypt_data(r[2])), # Tu prebieha DEŠIFROVANIE za behu
                "intruder": bool(r[3]),
                "alarm": bool(r[4])
            })
        return jsonify(history_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

data = {
    "sensor_value": 0,
    "intruder_detected": False,
    "system_status": "ONLINE",
    "last_update": "no arduino yet"
}


if __name__ == "__main__":
    init_database() # Inicializácia SQL pred štartom aplikácie
    
    t = threading.Thread(target=read_serial)
    t.daemon = True
    t.start()
    
    print("Dashboard beží na http://localhost:5050")
    app.run(host="0.0.0.0", port=5050, debug=False)
