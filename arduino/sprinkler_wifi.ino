/*
 * AquaSmart - ESP8266 Single Pump + Web Server
 * =============================================
 *
 * Versao com pagina incluida (sem LittleFS) — faz upload e funciona.
 *
 * --- INSTALACAO ---
 *
 * 1. Arduino IDE -> Ficheiro -> Preferencias -> URLs Adicionais:
 *    http://arduino.esp8266.com/stable/package_esp8266com_index.json
 * 2. Ferramentas -> Placa -> Gestor de Placas -> instala "esp8266"
 * 3. Seleciona: Ferramentas -> Placa -> NodeMCU 1.0 (ESP-12E)
 * 4. Abre este ficheiro, liga o ESP por USB, escolhe a porta
 * 5. Faz Upload (seta ->)
 *
 * --- LIGACOES ---
 *
 *   D5 (GPIO14) -> Relay (sinal IN) -> Bomba de agua
 *   A0          -> Sensor humidade solo
 *   VU (5V USB) -> alimenta o modulo rele
 *   GND         -> GND comum
 *
 * --- USAR ---
 *
 *   WiFi: ESPESPESPESP / 123456789
 *   Browser: http://192.168.4.1
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

const char* WIFI_SSID = "ESPESPESPESP";
const char* WIFI_PASS = "123456789";

const int RELAY_PIN = 14;   // D5
const int SOIL_PIN = A0;
const bool RELAY_ON = LOW;   // relay module triggers on LOW
const bool RELAY_OFF = HIGH;

bool bombaLigada = false;
unsigned long desligarEm = 0;

ESP8266WebServer server(80);

// ============================================================
// PAGINA HTML gerada pelo ESP (nao precisa de LittleFS)
// ============================================================
String gerarPagina(int humidade, bool estado, unsigned long timerRestante) {
  String p;
  p += "<!DOCTYPE html><html><head>";
  p += "<meta charset='utf-8'>";
  p += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  p += "<meta http-equiv='refresh' content='5'>";
  p += "<title>AquaSmart</title>";
  p += "<style>";
  p += "*{margin:0;padding:0;box-sizing:border-box}";
  p += "body{font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;text-align:center;padding:20px;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}";
  p += "h1{color:#22d3ee;font-size:1.5rem;margin-bottom:6px}";
  p += ".sub{color:#8b949e;font-size:0.85rem;margin-bottom:24px}";
  p += ".card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;margin:12px 0;width:100%;max-width:320px}";
  p += ".card h3{color:#8b949e;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px}";
  p += ".card .valor{font-size:2.2rem;font-weight:700;color:#22d3ee}";
  p += ".estado{font-size:1rem;padding:6px 16px;border-radius:50px;display:inline-block}";
  p += ".on{background:#1a3a2a;color:#3fb950;border:1px solid #3fb950}";
  p += ".off{background:#3a1a1a;color:#f85149;border:1px solid #f85149}";
  p += ".timer{color:#8b949e;font-size:0.8rem;margin-top:4px}";
  p += ".btn{display:block;width:100%;max-width:320px;padding:16px;margin:8px auto;font-size:1.1rem;font-weight:700;border:none;border-radius:10px;cursor:pointer;text-decoration:none;color:#fff;transition:transform .1s}";
  p += ".btn:active{transform:scale(0.97)}";
  p += ".btn-on{background:#238636}";
  p += ".btn-off{background:#da3633}";
  p += ".sensor-bar{width:100%;height:8px;background:#30363d;border-radius:4px;margin-top:8px;overflow:hidden}";
  p += ".sensor-fill{height:100%;border-radius:4px;transition:width .5s;background:linear-gradient(90deg,#22d3ee,#3fb950)}";
  p += ".info{color:#8b949e;font-size:0.7rem;margin-top:20px}";
  p += "@media(prefers-color-scheme:light){body{background:#f6f8fa;color:#1f2328}.card{background:#fff;border-color:#d0d7de}.card h3{color:#656d76}.info{color:#656d76}}";
  p += "</style></head><body>";
  p += "<h1>💧 AquaSmart</h1>";
  p += "<p class='sub'>Sistema de Rega Inteligente</p>";

  // Card sensor
  p += "<div class='card'>";
  p += "<h3>Humidade do Solo</h3>";
  p += "<div class='valor'>" + String(humidade) + "%</div>";
  p += "<div class='sensor-bar'><div class='sensor-fill' style='width:" + String(humidade) + "%'></div></div>";
  p += "</div>";

  // Card estado
  p += "<div class='card'>";
  p += "<h3>Estado da Bomba</h3>";
  if (estado) {
    p += "<div class='estado on'>💧 A REGAR</div>";
    if (timerRestante > 0) {
      p += "<div class='timer'>⏱ " + String(timerRestante) + "s restantes</div>";
    }
  } else {
    p += "<div class='estado off'>⏹ DESLIGADA</div>";
  }
  p += "</div>";

  // Botoes
  p += "<a href='/on?duration=300' class='btn btn-on'>💧 LIGAR BOMBA (5 min)</a>";
  p += "<a href='/on?duration=60' class='btn btn-on' style='background:#1f6feb'>💧 LIGAR (1 min)</a>";
  p += "<a href='/off' class='btn btn-off'>⏹ DESLIGAR BOMBA</a>";

  p += "<p class='info'>Rede: ESPESPESPESP<br>A pagina atualiza a cada 5s</p>";
  p += "</body></html>";
  return p;
}

// ============================================================
// HANDLERS
// ============================================================
void handleRoot() {
  int leitura = analogRead(SOIL_PIN);
  int humidade = map(leitura, 0, 1023, 100, 0);
  if (humidade > 100) humidade = 100;
  if (humidade < 0) humidade = 0;

  unsigned long restante = 0;
  if (bombaLigada && desligarEm > 0) {
    long r = (desligarEm - millis()) / 1000;
    restante = (r > 0) ? r : 0;
  }

  server.send(200, "text/html", gerarPagina(humidade, bombaLigada, restante));
}

void handleOn() {
  long duracao = server.hasArg("duration") ? server.arg("duration").toInt() : 300;
  digitalWrite(RELAY_PIN, RELAY_ON);
  bombaLigada = true;
  desligarEm = (duracao > 0) ? millis() + (duracao * 1000UL) : 0;
  Serial.printf("Bomba LIGADA (%ds)\n", duracao);
  handleRoot();
}

void handleOff() {
  digitalWrite(RELAY_PIN, RELAY_OFF);
  bombaLigada = false;
  desligarEm = 0;
  Serial.println("Bomba DESLIGADA");
  handleRoot();
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(WIFI_SSID, WIFI_PASS);
  Serial.println("WiFi: " + String(WIFI_SSID));
  Serial.println("IP: " + WiFi.softAPIP().toString());

  server.on("/", handleRoot);
  server.on("/on", handleOn);
  server.on("/off", handleOff);
  server.onNotFound(handleRoot);

  server.begin();
  Serial.println("Servidor pronto!");
  Serial.println("Abre http://192.168.4.1");
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  server.handleClient();

  if (bombaLigada && desligarEm > 0 && millis() >= desligarEm) {
    digitalWrite(RELAY_PIN, RELAY_OFF);
    bombaLigada = false;
    desligarEm = 0;
    Serial.println("Bomba DESLIGADA (fim do timer)");
  }
}
