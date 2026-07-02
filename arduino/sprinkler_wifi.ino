/*
 * AquaSmart - ESP8266 Single Pump + Web Server
 * =============================================
 *
 * Serve o site (HTML/CSS/JS) e a API para controlar a bomba.
 * Nao precisa de internet — o ESP cria a rede WiFi e serve tudo.
 *
 *
 * --- INSTALACAO ---
 *
 * 1. Abre o Arduino IDE
 * 2. Ficheiro -> Preferencias -> URLs Adicionais:
 *    http://arduino.esp8266.com/stable/package_esp8266com_index.json
 * 3. Ferramentas -> Placa -> Gestor de Placas -> procura "esp8266" e instala
 * 4. Seleciona: Ferramentas -> Placa -> NodeMCU 1.0 (ESP-12E)
 * 5. Abre este ficheiro (.ino) no Arduino IDE
 * 6. Liga o ESP por USB, escolhe a porta em Ferramentas -> Porto
 * 7. Faz Upload do sketch (seta ->)
 * 8. (so uma vez) Instala o plugin "ESP8266 LittleFS Upload" em:
 *    https://github.com/earlephilhower/arduino-esp8266littlefs-plugin
 * 9. Executa o copiar_para_esp.bat (cria pasta data/)
 * 10. Arduino IDE -> Ferramentas -> ESP8266 LittleFS Data Upload
 *
 *
 * --- LIGACOES ---
 *
 *   GPIO14 (D5)  -> Relay (sinal IN) -> Bomba de agua
 *   A0           -> Sensor humidade solo (FC-28 ou similar)
 *   VIN          -> 5V (fonte externa se a bomba consumir muito)
 *   GND          -> GND comum (ESP + rele + sensor)
 *
 *   Nota: a maioria dos modulos rele dispara em LOW.
 *         Se o teu rele dispara em HIGH, muda RELAY_ON para HIGH.
 *
 *
 * --- USAR ---
 *
 * 1. Liga o ESP a corrente (USB ou fonte 5V)
 * 2. No telemovel/PC, procura a rede WiFi: ESPESPESPESP
 * 3. Password: 123456789
 * 4. Abre o browser e vai a http://192.168.4.1
 * 5. Login: aquasmart2026
 * 6. Clica "BOMBA DESLIGADA" para ligar
 *
 *
 * --- ENDPOINTS API ---
 *
 *   GET /on?duration=300  -> Liga bomba durante N segundos
 *   GET /off              -> Desliga bomba
 *   GET /status           -> {"bomba":1,"timer":120}
 *   GET /sensor           -> {"humidade":65}
 *
 *
 * --- PREPARAR O CIRCUITO ---
 *
 *   ESP8266     Rele        Bomba      Sensor
 *   --------   --------   --------   --------
 *   D5 (GPIO14) -> IN
 *   VIN         -> VCC       VCC+
 *   GND         -> GND       VCC-      GND
 *   A0                                             -> A0 (sinal)
 *   3.3V                                           -> VCC (se 3.3V)
 *
 *   Se o sensor for 5V, liga o VCC ao VIN do ESP (5V).
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <LittleFS.h>

// ---- WiFi ----
const char* WIFI_SSID = "ESPESPESPESP";
const char* WIFI_PASS = "123456789";

// ---- Pinos ----
const int RELAY_PIN = 14;    // D5 (GPIO14)
const int SOIL_PIN = A0;
const bool RELAY_ON = LOW;
const bool RELAY_OFF = HIGH;

// ---- Estado ----
bool bombaLigada = false;
unsigned long desligarEm = 0;

// ---- Servidor ----
ESP8266WebServer server(80);

// ---- MIME Types ----
String getMime(String path) {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "text/plain";
}

// ---- Serve ficheiros do LittleFS ----
void handleStatic() {
  String path = server.uri();
  if (path == "/") path = "/index.html";

  // Seguranca: evitar path traversal
  if (path.indexOf("..") >= 0) {
    server.send(403, "text/plain", "Forbidden");
    return;
  }

  if (!LittleFS.exists(path)) {
    server.send(404, "text/plain", "404");
    return;
  }

  File f = LittleFS.open(path, "r");
  if (!f) {
    server.send(404, "text/plain", "404");
    return;
  }

  if (path.endsWith(".html") || path.endsWith(".js") || path.endsWith(".css")) {
    server.streamFile(f, getMime(path));
  } else {
    // Binary files (PNG, ICO) - send in chunks
    size_t sent = server.streamFile(f, getMime(path));
    if (sent != f.size()) {
      Serial.println("Erro ao enviar: " + path);
    }
  }
  f.close();
}

// ---- Liga bomba ----
void handleOn() {
  long duracao = server.hasArg("duration") ? server.arg("duration").toInt() : 0;

  digitalWrite(RELAY_PIN, RELAY_ON);
  bombaLigada = true;
  desligarEm = (duracao > 0) ? millis() + (duracao * 1000UL) : 0;

  Serial.printf("Bomba LIGADA (%ds)\n", duracao);
  server.send(200, "application/json",
    "{\"ok\":true,\"bomba\":1,\"duracao\":" + String(duracao) + "}");
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
    restante = (r > 0) ? r : 0;
  }
  server.send(200, "application/json",
    "{\"bomba\":" + String(bombaLigada ? 1 : 0) +
    ",\"timer\":" + String(restante) + "}");
}

// ---- Sensor humidade ----
void handleSensor() {
  int leitura = analogRead(SOIL_PIN);
  int humidade = map(leitura, 0, 1023, 100, 0);
  if (humidade > 100) humidade = 100;
  if (humidade < 0) humidade = 0;
  server.send(200, "application/json",
    "{\"humidade\":" + String(humidade) + "}");
}

// ---- Inicializacao ----
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);

  // Iniciar LittleFS
  if (!LittleFS.begin()) {
    Serial.println("ERRO: LittleFS nao montou!");
  } else {
    Serial.println("LittleFS OK");
  }

  // WiFi Access Point
  WiFi.mode(WIFI_AP);
  WiFi.softAP(WIFI_SSID, WIFI_PASS);
  Serial.println("WiFi: " + String(WIFI_SSID));
  Serial.println("IP: " + WiFi.softAPIP().toString());

  // API endpoints (prioridade sobre static)
  server.on("/on", handleOn);
  server.on("/off", handleOff);
  server.on("/status", handleStatus);
  server.on("/sensor", handleSensor);

  // Static files (fallback)
  server.onNotFound(handleStatic);

  server.enableCORS(true);
  server.begin();
  Serial.println("Servidor pronto!");
  Serial.println("Abre http://192.168.4.1 no browser");
}

// ---- Loop ----
void loop() {
  server.handleClient();

  if (bombaLigada && desligarEm > 0 && millis() >= desligarEm) {
    digitalWrite(RELAY_PIN, RELAY_OFF);
    bombaLigada = false;
    desligarEm = 0;
    Serial.println("Bomba DESLIGADA (fim do timer)");
  }
}
