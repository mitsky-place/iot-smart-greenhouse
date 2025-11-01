/*
ESP8266/ESP32 sketch for the Smart Greenhouse prototype.

How it works:
- Reads DHT22 (temp + humidity) and soil analog sensor
- POSTs readings to server at /api/readings as JSON
- Polls /api/commands to receive desired actuator states { "pump": 0/1, "fan": 0/1 }
- Sets relay pins accordingly

Configure:
- WIFI_SSID, WIFI_PASSWORD
- SERVER_URL: e.g., "http://192.168.1.50:3000"
- Pin mapping: DHT_PIN, SOIL_PIN, PUMP_PIN, FAN_PIN

Libraries required:
- DHT sensor library (Adafruit or equivalent)
- ArduinoJson
*/

#include <Arduino.h>
#ifdef ESP8266
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
#else
  #include <WiFi.h>
  #include <HTTPClient.h>
#endif
#include <ArduinoJson.h>
#include "DHT.h"

// CONFIG - update these values
const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";
const char* SERVER_URL = "http://192.168.1.100:3000"; // e.g. http://<server-ip>:3000

// Hardware pins
#define DHT_PIN D2       // data pin for DHT22 (change to your pin)
#define DHT_TYPE DHT22
DHT dht(DHT_PIN, DHT_TYPE);

#ifdef ESP8266
  const int SOIL_PIN = A0; // ESP8266 single ADC
#else
  const int SOIL_PIN = 34; // ESP32 ADC pin
#endif

const int PUMP_PIN = D5; // digital output for pump relay (active HIGH or LOW depending on relay)
const int FAN_PIN  = D6; // digital output for fan relay

const unsigned long SENSOR_SEND_INTERVAL_MS = 15 * 1000; // send every 15 seconds
const unsigned long COMMAND_POLL_INTERVAL_MS = 5 * 1000; // poll for commands every 5 seconds

unsigned long lastSend = 0;
unsigned long lastPoll = 0;

void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(PUMP_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  // initialize relays to OFF (assuming LOW = off; change if your relay is inverted)
  digitalWrite(PUMP_PIN, LOW);
  digitalWrite(FAN_PIN, LOW);

  dht.begin();

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected. IP: ");
  Serial.println(WiFi.localIP());
}

float readSoil() {
  int raw = analogRead(SOIL_PIN);
  // return raw for now; calibration may be needed. On ESP8266 raw is 0-1023, ESP32 0-4095.
  return raw;
}

bool postReadings(float temp, float humidity, int soil) {
  #ifdef ESP8266
    HTTPClient http;
  #else
    HTTPClient http;
  #endif
  String url = String(SERVER_URL) + "/api/readings";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["temp"] = temp;
  doc["humidity"] = humidity;
  doc["soil"] = soil;
  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    String resp = http.getString();
    Serial.printf("POST %d %s\n", httpCode, resp.c_str());
  } else {
    Serial.printf("POST failed: %d\n", httpCode);
  }
  http.end();
  return (httpCode >= 200 && httpCode < 300);
}

bool pollCommands() {
  #ifdef ESP8266
    HTTPClient http;
  #else
    HTTPClient http;
  #endif
  String url = String(SERVER_URL) + "/api/commands";
  http.begin(url);
  int httpCode = http.GET();
  if (httpCode == 200) {
    String resp = http.getString();
    Serial.println("Commands: " + resp);
    StaticJsonDocument<200> doc;
    DeserializationError err = deserializeJson(doc, resp);
    if (!err) {
      int pump = doc["pump"] | 0;
      int fan  = doc["fan"] | 0;
      digitalWrite(PUMP_PIN, pump ? HIGH : LOW);
      digitalWrite(FAN_PIN, fan ? HIGH : LOW);
      Serial.printf("Set pump=%d fan=%d\n", pump, fan);
    } else {
      Serial.println("Failed to parse JSON");
    }
  } else {
    Serial.printf("GET commands failed: %d\n", httpCode);
  }
  http.end();
  return (httpCode == 200);
}

void loop() {
  unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    // try reconnect
    WiFi.reconnect();
    delay(100);
    return;
  }

  if (now - lastSend >= SENSOR_SEND_INTERVAL_MS) {
    float hum = dht.readHumidity();
    float temp = dht.readTemperature();
    if (isnan(hum) || isnan(temp)) {
      Serial.println("Failed to read DHT sensor");
    } else {
      int soil = (int)readSoil();
      Serial.printf("Readings: T=%.2f H=%.2f Soil=%d\n", temp, hum, soil);
      postReadings(temp, hum, soil);
    }
    lastSend = now;
  }

  if (now - lastPoll >= COMMAND_POLL_INTERVAL_MS) {
    pollCommands();
    lastPoll = now;
  }

  delay(10);
}
