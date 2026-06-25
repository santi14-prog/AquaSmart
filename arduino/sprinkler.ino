/*
 * Sprinkler System - Arduino Controller
 *
 * Receives commands via Serial (USB or Bluetooth) and controls relay outputs.
 *
 * Commands (sent as text, newline-terminated):
 *   ON:<pin>:<duration_seconds>   - Turn on relay pin for N seconds
 *   OFF:<pin>                      - Turn off relay pin immediately
 *   ALLOFF                         - Turn off all relay pins
 *   STATUS                         - Respond with current pin states
 *   SENSOR                         - Respond with soil moisture reading
 *
 * Hardware:
 *   - Connect relay modules to pins 2,3,4,5 (active LOW or HIGH - set below)
 *   - Soil moisture sensor: VCC->5V, GND->GND, A0->A0
 *   - For Bluetooth: connect HC-05/HC-06/HM-10 to Serial (pins 0,1) or SoftwareSerial
 *
 * Wiring for HC-05 Bluetooth:
 *   Arduino 5V  -> HC-05 VCC
 *   Arduino GND -> HC-05 GND
 *   Arduino TX  -> HC-05 RX (via voltage divider: 5V to 3.3V)
 *   Arduino RX  -> HC-05 TX
 */

// ---- Configuration ----
const int RELAY_PINS[] = {2, 3, 4, 5};
const int NUM_ZONES = 4;
const bool RELAY_ACTIVE_HIGH = true;  // Set false if relay triggers on LOW

// Soil moisture sensor
const int SOIL_SENSOR_PIN = A0;
const int SOIL_SENSOR_INTERVAL = 5000;  // Read every 5 seconds
unsigned long lastSensorRead = 0;
int lastMoisturePercent = 0;

// Timing storage (milliseconds)
unsigned long zoneEndTimes[NUM_ZONES] = {0};
bool zoneStates[NUM_ZONES] = {false};

// Serial input buffer
String inputBuffer = "";

void setup() {
  Serial.begin(9600);

  // Initialize relay pins
  for (int i = 0; i < NUM_ZONES; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], RELAY_ACTIVE_HIGH ? LOW : HIGH);
  }

  Serial.println("READY");

  // Initial sensor reading
  pinMode(SOIL_SENSOR_PIN, INPUT);
  int moisture = analogRead(SOIL_SENSOR_PIN);
  lastMoisturePercent = map(moisture, 0, 1023, 100, 0);
}

void loop() {
  // Check serial input
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        processCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      inputBuffer += c;
    }
  }

  // Check timed zones
  unsigned long now = millis();
  for (int i = 0; i < NUM_ZONES; i++) {
    if (zoneStates[i] && zoneEndTimes[i] > 0 && now >= zoneEndTimes[i]) {
      turnOffZone(i);
      Serial.print("DONE:");
      Serial.println(i + 1);
    }
  }

  // Periodic soil moisture reading
  if (now - lastSensorRead >= SOIL_SENSOR_INTERVAL) {
    lastSensorRead = now;
    int moisture = analogRead(SOIL_SENSOR_PIN);
    int moisturePercent = map(moisture, 0, 1023, 100, 0);
    if (abs(moisturePercent - lastMoisturePercent) >= 2) {
      lastMoisturePercent = moisturePercent;
      Serial.print("SENSOR:");
      Serial.println(moisturePercent);
    }
  }
}

void processCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "ALLOFF") {
    for (int i = 0; i < NUM_ZONES; i++) {
      turnOffZone(i);
    }
    Serial.println("OK:ALLOFF");

  } else if (cmd == "STATUS") {
    Serial.print("STATUS:");
    for (int i = 0; i < NUM_ZONES; i++) {
      Serial.print(zoneStates[i] ? "1" : "0");
    }
    Serial.println();

  } else if (cmd == "SENSOR") {
    int moisture = analogRead(SOIL_SENSOR_PIN);
    int moisturePercent = map(moisture, 0, 1023, 100, 0);
    Serial.print("SENSOR:");
    Serial.println(moisturePercent);

  } else if (cmd.startsWith("ON:")) {
    // Format: ON:<pin>:<seconds>
    int firstColon = cmd.indexOf(':');
    int secondColon = cmd.indexOf(':', firstColon + 1);

    if (secondColon == -1) {
      Serial.println("ERR:FORMAT");
      return;
    }

    int pin = cmd.substring(firstColon + 1, secondColon).toInt();
    long duration = cmd.substring(secondColon + 1).toInt();

    int zoneIndex = getZoneIndex(pin);
    if (zoneIndex == -1) {
      Serial.print("ERR:BADPIN:");
      Serial.println(pin);
      return;
    }

    turnOnZone(zoneIndex, duration);
    Serial.print("OK:ON:");
    Serial.println(pin);

  } else if (cmd.startsWith("OFF:")) {
    int colon = cmd.indexOf(':');
    int pin = cmd.substring(colon + 1).toInt();

    int zoneIndex = getZoneIndex(pin);
    if (zoneIndex == -1) {
      Serial.print("ERR:BADPIN:");
      Serial.println(pin);
      return;
    }

    turnOffZone(zoneIndex);
    Serial.print("OK:OFF:");
    Serial.println(pin);

  } else {
    Serial.println("ERR:UNKNOWN");
  }
}

int getZoneIndex(int pin) {
  for (int i = 0; i < NUM_ZONES; i++) {
    if (RELAY_PINS[i] == pin) return i;
  }
  return -1;
}

void turnOnZone(int index, long durationSeconds) {
  digitalWrite(RELAY_PINS[index], RELAY_ACTIVE_HIGH ? HIGH : LOW);
  zoneStates[index] = true;

  if (durationSeconds > 0) {
    zoneEndTimes[index] = millis() + (durationSeconds * 1000UL);
  } else {
    zoneEndTimes[index] = 0;  // Manual mode - no auto-off
  }
}

void turnOffZone(int index) {
  digitalWrite(RELAY_PINS[index], RELAY_ACTIVE_HIGH ? LOW : HIGH);
  zoneStates[index] = false;
  zoneEndTimes[index] = 0;
}
