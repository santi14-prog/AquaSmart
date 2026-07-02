/*
 * AquaSmart - ESP8266 Single Pump Controller
 *
 * Hardware:
 *   - ESP8266 (NodeMCU/Wemos D1)
 *   - 1 relay module -> water pump
 *   - Soil moisture sensor on A0
 *
 * Wiring:
 *   GPIO5 (D1) -> Relay (pump)
 *   A0        -> Soil moisture sensor
 *   VIN/GND   -> 5V power supply
 *
 * WiFi AP: SSID=Sprinkler_System, Pass=12345678, IP=192.168.4.1
 *
 * Endpoints:
 *   GET /on?duration=300  -> Liga bomba durante N segundos
 *   GET /off              -> Desliga bomba
 *   GET /status           -> JSON: {"bomba":1,"timer":120}
 *   GET /sensor           -> JSON: {"humidade":65}
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

// ---- WiFi ----
const char* WIFI_SSID = "Sprinkler_System";
const char* WIFI_PASS = "12345678";

// ---- Pinos ----
const int RELAY_PIN = 5;     // D1 (GPIO5)
const int SOIL_PIN = A0;
const bool RELAY_ON = LOW;   // relay modules trigger on LOW
const bool RELAY_OFF = HIGH;

// ---- Estado ----
bool bombaLigada = false;
unsigned long desligarEm = 0;

// ---- Servidor ----
ESP8266WebServer server(80);

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(WIFI_SSID, WIFI_PASS);
  Serial.println("WiFi AP iniciado: " + String(WIFI_SSID));
  Serial.println("IP: " + WiFi.softAPIP().toString());

  server.enableCORS(true);
  server.on("/on", handleOn);
  server.on("/off", handleOff);
  server.on("/status", handleStatus);
  server.on("/sensor", handleSensor);
  server.begin();
  Serial.println("Servidor HTTP pronto");
}

void loop() {
  server.handleClient();

  if (bombaLigada && desligarEm > 0 && millis() >= desligarEm) {
    digitalWrite(RELAY_PIN, RELAY_OFF);
    bombaLigada = false;
    desligarEm = 0;
    Serial.println("Bomba DESLIGADA (fim do timer)");
  }
}

// ---- Liga bomba ----
void handleOn() {
  long duracao = server.hasArg("duration") ? server.arg("duration").toInt() : 0;

  digitalWrite(RELAY_PIN, RELAY_ON);
  bombaLigada = true;
  if (duracao > 0) {
    desligarEm = millis() + (duracao * 1000UL);
  } else {
    desligarEm = 0;
  }

  Serial.println("Bomba LIGADA (" + String(duracao) + "s)");
  server.send(200, "application/json", "{\"ok\":true,\"bomba\":1,\"duracao\":" + String(duracao) + "}");
}

// ---- Desliga bomba ----
void handleOff() {
  digitalWrite(RELAY_PIN, RELAY_OFF);
  bombaLigada = false;
  desligarEm = 0;
  Serial.println("Bomba DESLIGADA");
  server.send(200, "application/json", "{\"ok\":true,\"bomba\":0}");
}

// ---- Estado ----
void handleStatus() {
  unsigned long restante = 0;
  if (bombaLigada && desligarEm > 0) {
    long r = (desligarEm - millis()) / 1000;
    restante = r > 0 ? r : 0;
  }
  String json = "{\"bomba\":" + String(bombaLigada ? 1 : 0) + ",\"timer\":" + String(restante) + "}";
  server.send(200, "application/json", json);
}

// ---- Sensor humidade ----
void handleSensor() {
  int leitura = analogRead(SOIL_PIN);
  int humidade = map(leitura, 0, 1023, 100, 0);
  String json = "{\"humidade\":" + String(humidade) + "}";
  server.send(200, "application/json", json);
}
