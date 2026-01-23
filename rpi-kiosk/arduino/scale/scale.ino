#include "HX711.h"

#define DOUT_PIN 10
#define SCK_PIN 9
#define FIRMWARE_VERSION "SCALE_FW_1.1"

HX711 scale;

void setup() {
  Serial.begin(9600);
  scale.begin(DOUT_PIN, SCK_PIN);
  // Startup message (optional, but good for debugging)
  Serial.println("BOOT_OK");
}

void loop() {
  if (Serial.available() > 0) {
    char command = Serial.read();

    // --- COMMAND HANDLERS ---

    // 'R' = Read Raw Data
    if (command == 'R') {
      if (scale.wait_ready_timeout(1000)) {
        long raw_reading = scale.read_average(5);
        Serial.println(raw_reading);
      } else {
        Serial.println("ERR_TIMEOUT");
      }
    }
    // 'V' = Version Check
    else if (command == 'V') {
      Serial.println(FIRMWARE_VERSION);
    }
  }
}
