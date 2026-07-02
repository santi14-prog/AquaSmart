/*
 * AquaSmart - ESP8266 com Google Sheets + Modo Automatico
 * ========================================================
 *
 * Liga-se ao router WiFi (nao cria rede propria)
 * Regista regas no Google Sheets via Apps Script
 * Modo automatico liga/desliga bomba conforme humidade
 *
 * --- LIGACOES ---
 *   D5 (GPIO14) -> Relay -> Bomba
 *   A0          -> Sensor humidade solo
 *   VU (5V USB) -> alimenta rele
 *   GND         -> GND comum
 *
 * --- ANTES DE USAR ---
 * 1. Cria um Google Apps Script (ver google-apps-script.gs)
 * 2. Faz deploy como "Aplicacao Web"
 * 3. Copia o URL para URL_GOOGLE_SCRIPT abaixo
 * 4. Altera o WiFi para o teu router
 * 5. Faz Upload ao ESP
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <EEPROM.h>
#include <time.h>

// ===== CONFIGURACAO =====
const char* ssid_WIFI     = "4GMiFi_998876";
const char* password_WIFI = "bighoppa";
const String URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbxCIdQU0A3FNuT0lXe1unLkXpIWM72z5c8s8lm2bA8ahiXDGajVt_TSrxPvpnE4Bn74xQ/exec";

const int pinoRele = 14;    // D5
const int pinoSensor = A0;

// ===== VARIAVEIS =====
String tempAtual = "--";
String nomeLocalizacao = "Leiria";
float latGuardada = 0.0;
float lonGuardada = 0.0;
String logMensagem = "A ligar ao WiFi...";

int humidadeMinima = 30;
int humidadeMaxima = 70;
bool modoAutomatico = false;

float configCaudal = 6.0;
float configPrecoM3 = 1.50;

unsigned long tempoInicioRega = 0;
int humidadeInicio = 0;
String tempInicioRega = "--";
float litrosGastos = 0.0;
bool flagRegaEmCurso = false;

bool subsistemaEnvioPendente = false;
int env_duracao = 0;
int env_humiIni = 0;
int env_humiFim = 0;
String env_tempIni = "--";
String env_tempFim = "--";
float env_litros = 0.0;

int totalRegasHistorico = 0;
float totalAguaHistorico = 0.0;
String tabelaHistoricoInternet = "<tr><td colspan='4'>Nenhum registo carregado.</td></tr>";

WiFiServer server(80);

// ===== EEPROM =====
void guardarDefinicoesEEPROM() {
  EEPROM.write(0, humidadeMinima);
  EEPROM.write(1, humidadeMaxima);
  EEPROM.write(2, modoAutomatico ? 1 : 0);
  EEPROM.put(10, configCaudal);
  EEPROM.put(15, configPrecoM3);
  EEPROM.put(20, latGuardada);
  EEPROM.put(25, lonGuardada);
  for (int i = 0; i < 20; i++) {
    EEPROM.write(30 + i, (i < nomeLocalizacao.length()) ? nomeLocalizacao[i] : '\0');
  }
  EEPROM.commit();
}

void lerDefinicoesEEPROM() {
  int hMin = EEPROM.read(0);
  int hMax = EEPROM.read(1);
  int mAuto = EEPROM.read(2);
  if (hMin >= 0 && hMin <= 100) humidadeMinima = hMin;
  if (hMax >= 0 && hMax <= 100) humidadeMaxima = hMax;
  if (mAuto == 0 || mAuto == 1) modoAutomatico = (mAuto == 1);

  float fCaudal, fPreco, fLat, fLon;
  EEPROM.get(10, fCaudal);
  EEPROM.get(15, fPreco);
  EEPROM.get(20, fLat);
  EEPROM.get(25, fLon);
  if (!isnan(fCaudal) && fCaudal > 0) configCaudal = fCaudal;
  if (!isnan(fPreco) && fPreco > 0) configPrecoM3 = fPreco;
  if (!isnan(fLat) && fLat != 0.0) latGuardada = fLat;
  if (!isnan(fLon) && fLon != 0.0) lonGuardada = fLon;

  String locLida = "";
  for (int i = 0; i < 20; i++) {
    char c = EEPROM.read(30 + i);
    if (c == '\0') break;
    locLida += c;
  }
  if (locLida.length() > 0) nomeLocalizacao = locLida;
}

// ===== GEOCODING =====
bool buscarCoordenadasPorCidade(String cidade) {
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClient clientAPI;
  HTTPClient http;
  cidade.replace(" ", "%20");
  String url = "http://geocoding-api.open-meteo.com/v1/search?name=" + cidade + "&count=1&language=pt&format=json";
  if (http.begin(clientAPI, url)) {
    int httpCode = http.GET();
    if (httpCode > 0) {
      String payload = http.getString();
      int idxLat = payload.indexOf("\"latitude\":");
      int idxLon = payload.indexOf("\"longitude\":");
      if (idxLat != -1 && idxLon != -1) {
        int startLat = idxLat + 11;
        latGuardada = payload.substring(startLat, payload.indexOf(",", startLat)).toFloat();
        int startLon = idxLon + 12;
        lonGuardada = payload.substring(startLon, payload.indexOf(",", startLon)).toFloat();
        http.end();
        return true;
      }
    }
    http.end();
  }
  return false;
}

void atualizarMeteorologia() {
  if (WiFi.status() == WL_CONNECTED && latGuardada != 0.0 && lonGuardada != 0.0) {
    WiFiClient clientAPI;
    HTTPClient http;
    String url = "http://api.open-meteo.com/v1/forecast?latitude=" + String(latGuardada, 4) +
                 "&longitude=" + String(lonGuardada, 4) + "&current=temperature_2m&timezone=auto";
    if (http.begin(clientAPI, url)) {
      int httpCode = http.GET();
      if (httpCode > 0) {
        String payload = http.getString();
        int indexTemp = payload.indexOf("\"temperature_2m\":");
        if (indexTemp != -1) {
          int start = indexTemp + 17;
          tempAtual = payload.substring(start, payload.indexOf(",", start));
        }
      }
      http.end();
    }
  }
}

// ===== GOOGLE SHEETS =====
void carregarHistoricoDoSheets() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure clientGoogle;
    clientGoogle.setInsecure();
    HTTPClient http;
    String urlFull = URL_GOOGLE_SCRIPT + "?obterHistorico=1";
    if (http.begin(clientGoogle, urlFull)) {
      http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
      int httpCode = http.GET();
      if (httpCode > 0) {
        String payload = http.getString();
        tabelaHistoricoInternet = "";
        totalRegasHistorico = 0;
        totalAguaHistorico = 0.0;
        int doIndex = 0;
        while (doIndex < payload.length()) {
          int nextIndex = payload.indexOf('\n', doIndex);
          if (nextIndex == -1) nextIndex = payload.length();
          String linhaPai = payload.substring(doIndex, nextIndex);
          doIndex = nextIndex + 1;
          if (linhaPai.length() > 5) {
            totalRegasHistorico++;
            int c1 = linhaPai.indexOf(',');
            int c2 = linhaPai.indexOf(',', c1 + 1);
            int c3 = linhaPai.indexOf(',', c2 + 1);
            String dataStr = linhaPai.substring(0, c1);
            String duraStr = linhaPai.substring(c1 + 1, c2);
            String humiStr = linhaPai.substring(c2 + 1, c3);
            String litrStr = linhaPai.substring(c3 + 1);
            totalAguaHistorico += litrStr.toFloat();
            tabelaHistoricoInternet += "<tr><td>" + dataStr + "</td><td>" + duraStr + "</td><td>" + humiStr + "</td><td style='color:#22c55e;'>" + litrStr + "</td></tr>";
          }
        }
        logMensagem = "Sincronizado com a Google!";
      }
      http.end();
    }
  }
}

void enviarDadosSegundoPlano() {
  if (!subsistemaEnvioPendente) return;
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure clientGoogle;
    clientGoogle.setInsecure();
    HTTPClient http;
    String urlFull = URL_GOOGLE_SCRIPT + "?duracao=" + String(env_duracao) +
                     "&humidade_inicio=" + String(env_humiIni) +
                     "&humidade_fim=" + String(env_humiFim) +
                     "&temp_inicio=" + env_tempIni +
                     "&temp_fim=" + env_tempFim +
                     "&litros=" + String(env_litros, 2);
    if (http.begin(clientGoogle, urlFull)) {
      http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
      int httpCode = http.GET();
      if (httpCode > 0) {
        logMensagem = "Dados gravados.";
        carregarHistoricoDoSheets();
      }
      http.end();
    }
    subsistemaEnvioPendente = false;
  }
}

// ===== CONTROLO BOMBA =====
void ligarBombaLocal(int humidadeAtual) {
  digitalWrite(pinoRele, HIGH);
  tempoInicioRega = millis();
  humidadeInicio = humidadeAtual;
  tempInicioRega = tempAtual;
  flagRegaEmCurso = true;
  logMensagem = "Bomba ligada.";
}

void desligarBombaLocal(int humidadeAtual) {
  digitalWrite(pinoRele, LOW);
  unsigned long duracaoSegundos = (millis() - tempoInicioRega) / 1000;
  litrosGastos = (duracaoSegundos / 60.0) * configCaudal;
  env_duracao = duracaoSegundos;
  env_humiIni = humidadeInicio;
  env_humiFim = humidadeAtual;
  env_tempIni = tempInicioRega;
  env_tempFim = tempAtual;
  env_litros = litrosGastos;
  subsistemaEnvioPendente = true;
  flagRegaEmCurso = false;
  logMensagem = "Bomba desligada. A enviar dados...";
}

// ===== SETUP =====
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n[SISTEMA] A iniciar...");

  EEPROM.begin(64);
  lerDefinicoesEEPROM();

  pinMode(pinoRele, OUTPUT);
  digitalWrite(pinoRele, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid_WIFI, password_WIFI);
  Serial.print("A ligar ao WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WIFI] Conectado!");
  Serial.print("[WIFI] IP: ");
  Serial.println(WiFi.localIP());

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  setenv("TZ", "WET0WEST,M3.5.0/1,M10.5.0", 1);
  tzset();

  server.begin();

  if (latGuardada == 0.0 || lonGuardada == 0.0) {
    Serial.println("[METEO] A obter coordenadas...");
    if (buscarCoordenadasPorCidade(nomeLocalizacao)) {
      guardarDefinicoesEEPROM();
    }
  }

  atualizarMeteorologia();
  carregarHistoricoDoSheets();
}

// ===== LOOP =====
void loop() {
  enviarDadosSegundoPlano();

  static unsigned long ultimoTempoMeteorologia = 0;
  if (millis() - ultimoTempoMeteorologia > 1800000 || ultimoTempoMeteorologia == 0) {
    ultimoTempoMeteorologia = millis();
    atualizarMeteorologia();
  }

  int valorLido = analogRead(pinoSensor);
  int percentagemHumidade = map(valorLido, 1023, 0, 0, 100);
  percentagemHumidade = constrain(percentagemHumidade, 0, 100);

  // Modo automatico
  if (modoAutomatico) {
    if (!flagRegaEmCurso && percentagemHumidade <= humidadeMinima) {
      ligarBombaLocal(percentagemHumidade);
    } else if (flagRegaEmCurso && percentagemHumidade >= humidadeMaxima) {
      desligarBombaLocal(percentagemHumidade);
    }
  }

  // Cliente HTTP
  WiFiClient client = server.available();
  if (!client) return;
  while (!client.available()) { delay(1); }

  String request = client.readStringUntil('\r');
  client.flush();

  String abaAtiva = "inicio";
  if (request.indexOf("GET /historico") != -1) abaAtiva = "historico";
  if (request.indexOf("GET /definicoes") != -1) abaAtiva = "definicoes";

  if (request.indexOf("GET /toggleModo") != -1) {
    modoAutomatico = !modoAutomatico;
    guardarDefinicoesEEPROM();
  }

  if (request.indexOf("GET /setLimites?") != -1) {
    int idxMin = request.indexOf("hMin=");
    int idxMax = request.indexOf("hMax=");
    if (idxMin != -1 && idxMax != -1) {
      humidadeMinima = request.substring(idxMin + 5, request.indexOf("&", idxMin)).toInt();
      humidadeMaxima = request.substring(idxMax + 5, request.indexOf(" ", idxMax)).toInt();
      guardarDefinicoesEEPROM();
    }
  }

  if (request.indexOf("GET /salvarDefinicoes?") != -1) {
    int idxCaudal = request.indexOf("caudal=");
    int idxPreco = request.indexOf("preco=");
    int idxLoc = request.indexOf("loc=");
    if (idxCaudal != -1 && idxPreco != -1 && idxLoc != -1) {
      String valCaudal = request.substring(idxCaudal + 7, request.indexOf("&", idxCaudal));
      String valPreco = request.substring(idxPreco + 6, request.indexOf("&", idxPreco));
      String novaLoc = request.substring(idxLoc + 4, request.indexOf(" ", idxLoc));
      valCaudal.replace(",", ".");
      valPreco.replace(",", ".");
      novaLoc.replace("+", " ");
      configCaudal = valCaudal.toFloat();
      configPrecoM3 = valPreco.toFloat();
      nomeLocalizacao = novaLoc;
      if (buscarCoordenadasPorCidade(nomeLocalizacao)) {
        logMensagem = "Cidade localizada! A carregar clima...";
        atualizarMeteorologia();
      } else {
        logMensagem = "Erro ao localizar cidade online.";
      }
      guardarDefinicoesEEPROM();
    }
  }

  if (request.indexOf("/LIGAR") != -1 && !flagRegaEmCurso) ligarBombaLocal(percentagemHumidade);
  if (request.indexOf("/DESLIGAR") != -1 && flagRegaEmCurso) desligarBombaLocal(percentagemHumidade);

  // ===== PAGINA HTML =====
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html");
  client.println("");
  client.println("<!DOCTYPE HTML><html><head>");
  client.println("<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'><meta charset='utf-8'>");
  client.println("<title>AquaSmart Online</title>");
  client.println("<style>");
  client.println("body{background:#060b13;color:#fff;font-family:-apple-system,sans-serif;margin:0;padding:0;padding-bottom:70px}");
  client.println(".top-header{display:flex;justify-content:space-between;align-items:center;padding:15px 20px;background:#09111c;border-bottom:1px solid #111a2e}");
  client.println(".top-header h2{margin:0;font-size:18px}");
  client.println(".btn-mode{padding:6px 14px;border-radius:20px;text-decoration:none;font-size:11px;font-weight:800;text-transform:uppercase;color:#fff}");
  client.println(".mode-auto{background:#10b981;box-shadow:0 0 10px rgba(16,185,129,.4)}");
  client.println(".mode-man{background:#ef4444;box-shadow:0 0 10px rgba(239,68,68,.4)}");
  client.println(".content{padding:20px}");
  client.println(".box-config{background:#0d1622;border:1px solid #162235;border-radius:10px;padding:15px;margin-bottom:20px}");
  client.println(".box-config h3{margin:0 0 12px 0;font-size:13px;text-transform:uppercase;color:#4b5563}");
  client.println(".inputs-inline{display:flex;gap:10px;align-items:flex-end}");
  client.println(".input-group{flex:1;display:flex;flex-direction:column;gap:5px}");
  client.println(".input-group label{font-size:11px;color:#cbd5e1}");
  client.println(".input-group input{background:#060b13;border:1px solid #223147;border-radius:6px;padding:10px;color:#fff;font-weight:bold;font-size:14px;text-align:center}");
  client.println(".btn-save{background:#38bdf8;color:#060b13;border:none;padding:11px 16px;border-radius:6px;font-weight:bold;height:38px}");
  client.println(".grid-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px}");
  client.println(".card{background:#0d1622;padding:18px 10px;border-radius:8px;border:1px solid #162235;text-align:center}");
  client.println(".card h4{margin:0 0 8px 0;color:#4b5563;font-size:10px;text-transform:uppercase}");
  client.println(".card p{margin:0;font-size:22px;font-weight:700;color:#38bdf8}");
  client.println(".btn-action{display:block;padding:16px;border-radius:8px;color:#fff;text-decoration:none;font-weight:bold;text-transform:uppercase;font-size:14px;margin-top:20px;text-align:center}");
  client.println(".btn-on{background:#10b981}.btn-off{background:#f97316}");
  client.println(".tabla-hist{width:100%;border-collapse:collapse;margin-top:15px;font-size:13px;text-align:left}");
  client.println(".tabla-hist th{padding:10px;color:#4b5563;border-bottom:1px solid #162235;font-size:11px;text-transform:uppercase}");
  client.println(".tabla-hist td{padding:12px 10px;border-bottom:1px solid #0d1622;color:#cbd5e1}");
  client.println(".nav-bar{position:fixed;bottom:0;left:0;right:0;height:60px;background:#09111c;border-top:1px solid #111a2e;display:flex;justify-content:space-around;align-items:center;z-index:1000}");
  client.println(".nav-item{text-decoration:none;color:#4b5563;font-size:11px;text-align:center;display:flex;flex-direction:column;align-items:center;width:25%}");
  client.println(".nav-item span{font-size:18px}");
  client.println(".nav-item.active{color:#38bdf8;font-weight:bold}");
  client.println("</style></head><body>");

  client.println("<div class='top-header'><h2>AquaSmart</h2>");
  if (modoAutomatico) {
    client.println("<a href='/toggleModo' class='btn-mode mode-auto'>Aut</a>");
  } else {
    client.println("<a href='/toggleModo' class='btn-mode mode-man'>Man</a>");
  }
  client.println("</div>");

  if (abaAtiva == "inicio") {
    client.println("<div class='content'>");
    client.println("<div class='box-config'><h3>Alvos de Humidade</h3><form action='/setLimites' method='get' class='inputs-inline'>");
    client.println("<div class='input-group'><label>Minima (Liga)</label>");
    client.print("<input type='number' name='hMin' value='"); client.print(humidadeMinima); client.println("'></div>");
    client.println("<div class='input-group'><label>Maxima (Desliga)</label>");
    client.print("<input type='number' name='hMax' value='"); client.print(humidadeMaxima); client.println("'></div>");
    client.println("<button type='submit' class='btn-save'>OK</button></form></div>");
    client.println("<div class='grid-stats'>");
    client.print("<div class='card'><h4>Humidade Solo</h4><p>"); client.print(percentagemHumidade); client.println("%</p></div>");
    client.print("<div class='card'><h4>Clima: "); client.print(nomeLocalizacao); client.print("</h4><p style='color:#f97316;'>"); client.print(tempAtual); client.println("°C</p></div>");
    client.println("</div>");
    if (digitalRead(pinoRele) == HIGH) {
      client.println("<a href='/DESLIGAR' class='btn-action btn-off'>STOP PARAR REGA</a>");
    } else {
      client.println("<a href='/LIGAR' class='btn-action btn-on'>INICIAR REGA</a>");
    }
    client.println("<p style='font-family:monospace;color:#4ade80;font-size:11px;margin-top:30px;text-align:center'>" + logMensagem + "</p></div>");
  } else if (abaAtiva == "historico") {
    client.println("<div class='content'>");
    client.println("<div class='grid-stats' style='grid-template-columns:repeat(3,1fr)'>");
    client.print("<div class='card'><h4>Total Regas</h4><p>"); client.print(totalRegasHistorico); client.println("</p></div>");
    client.print("<div class='card'><h4>Agua Total</h4><p style='color:#38bdf8;'>"); client.print(totalAguaHistorico, 1); client.println(" L</p></div>");
    float custoEst = totalAguaHistorico * (configPrecoM3 / 1000.0);
    client.print("<div class='card'><h4>Custo Est.</h4><p style='color:#10b981;'>"); client.print(custoEst, 2); client.println(" EUR</p></div>");
    client.println("</div><table class='tabla-hist'><tr><th>Data/Hora</th><th>Tempo</th><th>Humid.</th><th>Consumo</th></tr>");
    client.println(tabelaHistoricoInternet);
    client.println("</table></div>");
  } else if (abaAtiva == "definicoes") {
    client.println("<div class='content'>");
    client.println("<form action='/salvarDefinicoes' method='get'>");
    client.println("<div style='margin-bottom:20px'><label style='color:#cbd5e1;font-size:13px'>Caudal (L/min)</label>");
    client.print("<input type='text' name='caudal' style='background:#0d1622;border:1px solid #162235;border-radius:6px;padding:10px;color:#fff;width:100%;margin-top:6px' value='"); client.print(configCaudal, 1); client.println("'></div>");
    client.println("<div style='margin-bottom:20px'><label style='color:#cbd5e1;font-size:13px'>Preco Agua (EUR/m3)</label>");
    client.print("<input type='text' name='preco' style='background:#0d1622;border:1px solid #162235;border-radius:6px;padding:10px;color:#fff;width:100%;margin-top:6px' value='"); client.print(configPrecoM3, 2); client.println("'></div>");
    client.println("<div style='margin-bottom:20px'><label style='color:#cbd5e1;font-size:13px'>Localizacao</label>");
    client.print("<input type='text' name='loc' style='background:#0d1622;border:1px solid #162235;border-radius:6px;padding:10px;color:#fff;width:100%;margin-top:6px' value='"); client.print(nomeLocalizacao); client.println("'></div>");
    client.println("<button type='submit' style='background:#10b981;color:#fff;border:none;padding:16px;border-radius:8px;width:100%;font-weight:bold;font-size:14px;cursor:pointer'>Guardar</button>");
    client.println("</form></div>");
  }

  client.print("<div class='nav-bar'>");
  client.print("<a href='/' class='nav-item " + String(abaAtiva == "inicio" ? "active" : "") + "'><span>&#127968;</span>Inicio</a>");
  client.print("<a href='#' class='nav-item' style='opacity:.2'><span>&#9200;</span>Horarios</a>");
  client.print("<a href='/historico' class='nav-item " + String(abaAtiva == "historico" ? "active" : "") + "'><span>&#128203;</span>Historico</a>");
  client.print("<a href='/definicoes' class='nav-item " + String(abaAtiva == "definicoes" ? "active" : "") + "'><span>&#9881;</span>Definicoes</a>");
  client.print("</div>");
  client.println("</body></html>");
  delay(1);
}
