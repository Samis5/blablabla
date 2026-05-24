/*
  Teplomer + Relay ovladanie
  ─────────────────────────────────────────────────────
  DHT senzor → Serial JSON každé 2s
  Server → príkaz  RELAY:<1-4>:<ON|OFF>

  Zapojenie:
    DHT DATA  → pin 2
    Relay 1   → pin 6   (Klimatizácia)
    Relay 2   → pin 7   (Radiátor)
    Relay 3   → pin 8   (Ventilátor)
    Relay 4   → pin 9   (Svetlo)

  Relay modul: väčšina je ACTIVE LOW
    LOW  = relay zapnutý  (kontakt ZOPNUTÝ)
    HIGH = relay vypnutý  (kontakt ROZOPNUTÝ)
  Ak tvoj modul je ACTIVE HIGH, zmeň RELAY_ON/OFF nižšie.
*/

#include <DHT.h>

// ── Konfigurácia ──────────────────────────────────────
#define DHTPIN    3
#define DHTTYPE   DHT11      // zmen na DHT22 ak pouzivas DHT22

const char* SENSOR_ID   = "sensor_1";
const char* SENSOR_NAME = "Izba";

// Relay piny
const int RELAY_PINS[4] = {6, 7, 8, 9};

// Ak modul je ACTIVE LOW: ON = LOW, OFF = HIGH
// Ak modul je ACTIVE HIGH: ON = HIGH, OFF = LOW
#define RELAY_ON  LOW
#define RELAY_OFF HIGH

// Interval odosielania dat (ms)
#define SEND_INTERVAL 2000
// ──────────────────────────────────────────────────────

DHT dht(DHTPIN, DHTTYPE);

unsigned long lastSend = 0;
String serialBuffer = "";

void setup() {
  Serial.begin(9600);
  dht.begin();

  // Nastav relay piny a všetky vypni
  for (int i = 0; i < 4; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], RELAY_OFF);
  }

  Serial.println("{\"status\":\"ready\"}");
}

void loop() {
  // ── príjem príkazov zo servera ──
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      serialBuffer.trim();
      if (serialBuffer.length() > 0) {
        processCommand(serialBuffer);
      }
      serialBuffer = "";
    } else {
      serialBuffer += c;
    }
  }

  // ── odosielanie dat každé 2s ──
  if (millis() - lastSend >= SEND_INTERVAL) {
    lastSend = millis();
    sendSensorData();
  }
}

void sendSensorData() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    Serial.println("{\"error\":\"Chyba citania senzora\"}");
    return;
  }

  Serial.print("{\"id\":\"");    Serial.print(SENSOR_ID);
  Serial.print("\",\"name\":\""); Serial.print(SENSOR_NAME);
  Serial.print("\",\"temperature\":"); Serial.print(t, 1);
  Serial.print(",\"humidity\":");      Serial.print(h, 1);
  Serial.println("}");
}

/*
  Format prikazu: RELAY:<cislo>:<ON|OFF>
  Priklad:        RELAY:1:ON
                  RELAY:3:OFF
*/
void processCommand(String cmd) {
  if (!cmd.startsWith("RELAY:")) return;

  // Parsuj RELAY:<n>:<state>
  int firstColon  = cmd.indexOf(':');
  int secondColon = cmd.indexOf(':', firstColon + 1);
  if (firstColon < 0 || secondColon < 0) return;

  int   relayNum = cmd.substring(firstColon + 1, secondColon).toInt();
  String stateStr = cmd.substring(secondColon + 1);
  stateStr.trim();

  if (relayNum < 1 || relayNum > 4) return;

  bool on = (stateStr == "ON");
  digitalWrite(RELAY_PINS[relayNum - 1], on ? RELAY_ON : RELAY_OFF);

  // Potvrdenie späť
  Serial.print("{\"ack\":\"RELAY:");
  Serial.print(relayNum);
  Serial.print(":");
  Serial.print(on ? "ON" : "OFF");
  Serial.println("\"}");
}
