/*
 * Sprinkler System - ESP8266/ESP32 WiFi Controller
 *
 * Creates a WiFi access point + web server. The app connects to it via HTTP.
 *
 * Endpoints:
 *   GET /on?pin=2&duration=300   -> Turn on relay for N seconds
 *   GET /off?pin=2                -> Turn off relay
 *   GET /alloff                   -> Turn off all relays
 *   GET /status                   -> JSON: {"pins":[0,1,0,0],"timers":[0,300,0,0]}
 *   GET /sensor                   -> JSON: {"moisture":65}
 *
 * WiFi AP defaults:
 *   SSID: Sprinkler_System
 *   Password: 12345678
 *   IP: 192.168.4.1
 *
 * Hardware:
 *   - ESP8266 (NodeMCU/Wemos D1) or ESP32
 *   - 4-channel relay module connected to pins D1,D2,D3,D4 (GPIO 5,4,0,2)
 *
 * Wiring (ESP8266 NodeMCU):
 *   GPIO5 (D1) -> Relay 1 (Front Lawn)
 *   GPIO4 (D2) -> Relay 2 (Backyard)
 *   GPIO0 (D3) -> Relay 3 (Garden)
 *   GPIO2 (D4) -> Relay 4 (Side Strip)
 *   VIN/GND    -> 5V power supply (shared with relay module)
 */

#include <ESP8266WiFi.h>     // Use <WiFi.h> for ESP32
#include <ESP8266WebServer.h> // Use <WebServer.h> for ESP32
#include <ArduinoJson.h>

// ---- WiFi Configuration ----
const char* WIFI_SSID = "Sprinkler_System";
const char* WIFI_PASS = "12345678";

// ---- Relay Pins ----
const int RELAY_PINS[] = {5, 4, 0, 2};  // D1,D2,D3,D4 on NodeMCU
const int NUM_ZONES = 4;
const bool RELAY_ACTIVE_LOW = true;  // Most relay modules trigger on LOW

// Soil moisture sensor
const int SOIL_SENSOR_PIN = A0;
unsigned long lastSensorRead = 0;
const int SENSOR_INTERVAL = 5000;

// ---- Timing ----
unsigned long zoneEndTimes[4] = {0};
bool zoneStates[4] = {false};

// ---- Web Server ----
ESP8266WebServer server(80);  // WebServer server(80); for ESP32

void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialize relay pins
  for (int i = 0; i < NUM_ZONES; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], RELAY_ACTIVE_LOW ? HIGH : LOW);
  }

  // Start WiFi Access Point
  WiFi.mode(WIFI_AP);
  WiFi.softAP(WIFI_SSID, WIFI_PASS);
  Serial.println("WiFi AP started");
  Serial.print("SSID: ");
  Serial.println(WIFI_SSID);
  Serial.print("IP: ");
  Serial.println(WiFi.softAPIP());

  // CORS headers for all responses
  server.enableCORS(true);

  // Routes
  server.on("/on", handleOn);
  server.on("/off", handleOff);
  server.on("/alloff", handleAllOff);
  server.on("/status", handleStatus);
  server.on("/sensor", handleSensor);

  server.begin();
  Serial.println("HTTP server ready");
}

void loop() {
  server.handleClient();

  unsigned long now = millis();

  // Periodic soil moisture reading
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;
    int moisture = analogRead(SOIL_SENSOR_PIN);
    int moisturePercent = map(moisture, 0, 1023, 100, 0);
    Serial.print("SENSOR:");
    Serial.println(moisturePercent);
  }

  // Check timed zones
  for (int i = 0; i < NUM_ZONES; i++) {
    if (zoneStates[i] && zoneEndTimes[i] > 0 && now >= zoneEndTimes[i]) {
      turnOffZone(i);
    }
  }
}

// ---- Handlers ----

void handleOn() {
  if (!server.hasArg("pin")) {
    server.send(400, "text/plain", "Missing pin");
    return;
  }

  int pin = server.arg("pin").toInt();
  long duration = server.hasArg("duration") ? server.arg("duration").toInt() : 0;

  int idx = getZoneIndex(pin);
  if (idx == -1) {
    server.send(400, "text/plain", "Invalid pin");
    return;
  }

  turnOnZone(idx, duration);

  String resp = "OK";
  resp += " pin=" + String(pin);
  resp += " duration=" + String(duration);
  server.send(200, "text/plain", resp);
}

void handleOff() {
  if (!server.hasArg("pin")) {
    server.send(400, "text/plain", "Missing pin");
    return;
  }

  int pin = server.arg("pin").toInt();
  int idx = getZoneIndex(pin);
  if (idx == -1) {
    server.send(400, "text/plain", "Invalid pin");
    return;
  }

  turnOffZone(idx);
  server.send(200, "text/plain", "OK pin=" + String(pin));
}

void handleAllOff() {
  for (int i = 0; i < NUM_ZONES; i++) {
    turnOffZone(i);
  }
  server.send(200, "text/plain", "OK ALLOFF");
}

void handleStatus() {
  StaticJsonDocument<256> doc;
  JsonArray pins = doc.createNestedArray("pins");
  JsonArray timers = doc.createNestedArray("timers");

  for (int i = 0; i < NUM_ZONES; i++) {
    pins.add(zoneStates[i] ? 1 : 0);
    unsigned long remaining = 0;
    if (zoneStates[i] && zoneEndTimes[i] > 0) {
      long r = (zoneEndTimes[i] - millis()) / 1000;
      remaining = r > 0 ? r : 0;
    }
    timers.add(remaining);
  }

  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

void handleSensor() {
  int moisture = analogRead(SOIL_SENSOR_PIN);
  int moisturePercent = map(moisture, 0, 1023, 100, 0);
  StaticJsonDocument<64> doc;
  doc["moisture"] = moisturePercent;
  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}

// ---- Helpers ----

int getZoneIndex(int pin) {
  for (int i = 0; i < NUM_ZONES; i++) {
    if (RELAY_PINS[i] == pin) return i;
  }
  return -1;
}

void turnOnZone(int idx, long durationSeconds) {
  digitalWrite(RELAY_PINS[idx], RELAY_ACTIVE_LOW ? LOW : HIGH);
  zoneStates[idx] = true;

  if (durationSeconds > 0) {
    zoneEndTimes[idx] = millis() + (durationSeconds * 1000UL);
  } else {
    zoneEndTimes[idx] = 0;
  }
}

void turnOffZone(int idx) {
  digitalWrite(RELAY_PINS[idx], RELAY_ACTIVE_LOW ? HIGH : LOW);
  zoneStates[idx] = false;
  zoneEndTimes[idx] = 0;
}
