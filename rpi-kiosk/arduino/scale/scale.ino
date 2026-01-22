/*
 * Scale Firmware for Pantry Kiosk
 * 
 * Hardware:
 * - Arduino Nano/Uno or compatible
 * - HX711 Load Cell Amplifier
 * 
 * Pin Connections:
 * - HX711 DOUT -> Pin 2
 * - HX711 SCK  -> Pin 3
 * - VCC        -> 5V
 * - GND        -> GND
 * 
 * Protocol (Serial 9600 baud, newline terminated):
 * - Command: "IDENTIFY" -> Response: "SCALE_V1"
 * - Command: "WEIGHT"   -> Response: "<float_weight>" (e.g., "123.45")
 * - Command: "TARE"     -> Response: "OK"
 * 
 * Dependencies:
 * - HX711 library by Bogdan Necula (install via Arduino Library Manager)
 */

#include "HX711.h"

// Pin Definitions
#define LOADCELL_DOUT_PIN  2
#define LOADCELL_SCK_PIN   3

HX711 scale;

// Calibration factor - value obtained by calibrating the scale with known weights
// Start with 1.0, measure known weight, then new_factor = current_reading / known_weight
// For now we use a default placeholder.
float calibration_factor = 420.0; 

void setup() {
  Serial.begin(9600);
  
  // Initialize Scale
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(calibration_factor);
  scale.tare(); // Assume empty on boot
}

void loop() {
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim(); // Remove whitespace/newlines

    if (command == "IDENTIFY") {
      Serial.println("SCALE_V1");
    } 
    else if (command == "WEIGHT") {
      // Get units (average of 5 readings)
      if (scale.wait_ready_timeout(1000)) {
        float weight = scale.get_units(5);
        Serial.println(weight);
      } else {
        Serial.println("ERROR_NOT_READY");
      }
    } 
    else if (command == "TARE") {
      scale.tare();
      Serial.println("OK");
    }
  }
}
