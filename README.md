# AquaSmart - Sistema Inteligente de Rega

Projeto Final de Curso - Sistema IoT para controlo automatizado de rega via Arduino/ESP.

---

## Arquitetura

```
+-------------+     HTTP/Serial/BLE     +------------------+     GPIO     +----------+
|             | <---------------------> |                  | ----------> |          |
|  AquaSmart  |     Comandos texto       | Arduino/ESP8266  |   Rele 1..4 | Aspersor |
|   (PWA Web) |                         |                  |             |          |
|             | <---------------------- |                  | <---------- |          |
+-------------+     DONE/SENSOR          +------------------+   Sensor    +----------+
                                                    |
                                                    | A0
                                                    v
                                            +----------------+
                                            | Humidade Solo  |
                                            +----------------+

+----------------+       +------------------+
|   Open-Meteo   | <---- |  Previsao Chuva  |
|   (API Gratis)  |       |  (salta regas)   |
+----------------+       +------------------+
```

## Stack Tecnologico

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Vanilla JS (ES6+), CSS3, HTML5 |
| Graficos | Chart.js 4.4 |
| PWA | Service Worker, Web App Manifest |
| Conexao HW | Web Bluetooth, Web Serial, HTTP REST, Demo |
| Microcontrolador | Arduino Uno/Mega ou ESP8266/ESP32 |
| Armazenamento | localStorage (navegador) |
| API Externa | Open-Meteo (meteorologia gratuita) |

## Funcionalidades

### Dashboard
- **Proxima Rega** - proximo horario agendado
- **Zonas Ativas** - contagem de zonas em funcionamento
- **Agua Hoje** - estimativa de litros gastos hoje
- **Custo Mes** - estimativa de custo em euros
- **Tempo Hoje** - previsao meteorologica (Open-Meteo)
- **Grafico de Consumo** - barras de litros por dia/semana/mes
- **Calendario Semanal** - vista dos horarios da semana
- **Historico Recente** - ultimos 15 eventos com opcao de limpar

### Zonas
- CRUD de zonas (nome + pino do rele)
- Controlo manual LIGAR/DESLIGAR com timer
- Drag-and-drop para reordenar
- Indicador visual de estado (running pulse animation)

### Horarios
- Agendamento por zona, hora, duracao e dias da semana
- Suporte a multiplos perfis (Verao/Inverno/etc)
- Edicao e remocao inline

### Inteligencia
- **Salto automatico em dias de chuva** (precipitacao > 1mm)
- **Sensor de humidade do solo** (leitura periodica, exibida no UI)
- **Perfis de rega** - guarda e alterna entre conjuntos de horarios

### Sistemas
- **Debug/Logs** - visualizacao de logs em tempo real
- **Export/Import** - backup e restauro completo (JSON)
- **PWA** - instala no telemovel, funciona offline
- **Notificacoes** - alertas quando a rega termina

## Protocolo de Comunicacao

Comandos enviados como texto (newline-terminated):

| Comando | Descricao |
|---------|-----------|
| `ON:<pin>:<segundos>` | Liga o rele no pino X durante N segundos |
| `OFF:<pin>` | Desliga o rele no pino X |
| `ALLOFF` | Desliga todos os reles |
| `STATUS` | Responde com estado dos pinos (ex: `STATUS:1010`) |

Respostas do Arduino:

| Resposta | Significado |
|----------|-------------|
| `READY` | Arduino inicializado |
| `OK:ON:<pin>` | Comando ON aceite |
| `OK:OFF:<pin>` | Comando OFF aceite |
| `OK:ALLOFF` | Todos desligados |
| `DONE:<pin>` | Timer expirou, rele desligado |
| `SENSOR:<percent>` | Leitura do sensor de humidade (0-100%) |
| `ERR:BADPIN:<pin>` | Pino invalido |
| `ERR:FORMAT` | Formato de comando invalido |

### WiFi (ESP)
Endpoints HTTP: `GET /on?pin=X&duration=N`, `GET /off?pin=X`, `GET /alloff`, `GET /status`, `GET /sensor`

## Hardware

### Arduino Uno/Mega + Bluetooth (HC-05)
```
Pinos: 2,3,4,5 -> Modulo de 4 reles
A0 -> Sensor humidade solo (FC-28 ou similar)
HC-05 -> Serial (TX/RX com divisor de tensao)
```

### ESP8266/ESP32 (WiFi)
```
GPIO 5,4,0,2 -> Modulo de 4 reles
A0 -> Sensor humidade solo
WiFi AP: SSID=Sprinkler_System, Pass=12345678
IP: 192.168.4.1
```

## Instalacao

1. Abre `index.html` num servidor local ou usa `node server.js`
2. Carrega o sketch Arduino correspondente (`sprinkler.ino` ou `sprinkler_wifi.ino`)
3. Abre a app no navegador (Chrome/Edge para Serial/BT, qualquer um para WiFi)
4. Conecta via WiFi, Bluetooth, USB Serial ou Modo Demo
5. Configura zonas, horarios e localizacao nas Definicoes

## Estrutura de Ficheiros

```
sprinkler-app/
├── index.html              # SPA entry point
├── manifest.json           # PWA manifest
├── service-worker.js        # PWA offline cache + push
├── server.js               # Dev server (Node.js)
├── css/
│   ├── style.css           # Design system completo
│   └── splash.css          # Animacao de arranque
├── js/
│   ├── app.js              # Controlador principal
│   ├── logger.js           # Sistema de logs
│   ├── bluetooth.js        # Web Bluetooth API
│   ├── serial.js           # Web Serial API
│   ├── wifi.js             # HTTP REST handler
│   └── demo.js             # Simulador sem HW
├── arduino/
│   ├── sprinkler.ino       # Arduino Uno/Mega (Serial/BT)
│   └── sprinkler_wifi.ino  # ESP8266/ESP32 (WiFi)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## LocalStorage Keys

| Chave | Conteudo |
|-------|----------|
| `aquasmart_zones` | Array de zonas [{id, name, pin}] |
| `aquasmart_schedules` | Array de horarios [{zoneId, time, duration, days}] |
| `aquasmart_history` | Array de eventos (max 200) |
| `aquasmart_flow` | Caudal em L/min |
| `aquasmart_price` | Preco da agua em EUR/m3 |
| `aquasmart_location` | {lat, lon} para meteorologia |
| `aquasmart_profiles` | Array de perfis [{name, schedules}] |
| `aquasmart_active_profile` | Nome do perfil ativo |
| `aquasmart_theme` | "dark" ou "light" |

## Licenca

Projeto academico - Projeto Final de Curso
