#!/usr/bin/env python3
"""
Minimal raw SPI test for MAX31855.
Bit-bangs directly with RPi.GPIO — no blinka, no adafruit libraries.

Wiring (edit BCM pin numbers below if needed):
  CLK -> GPIO 17  (physical pin 11)
  DO  -> GPIO 27  (physical pin 13)
  CS  -> GPIO 22  (physical pin 15)
  VIN -> 3.3V     (physical pin 1)
  GND -> GND      (physical pin 6)
"""

import RPi.GPIO as GPIO
import time

# ── Pin config (BCM numbers) ──────────────────────────────────────────────────
CLK = 17
DO  = 27
CS  = 22
# ─────────────────────────────────────────────────────────────────────────────

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(CLK, GPIO.OUT)
GPIO.setup(DO,  GPIO.IN)
GPIO.setup(CS,  GPIO.OUT)

GPIO.output(CS,  GPIO.HIGH)
GPIO.output(CLK, GPIO.LOW)

def read_max31855():
    """Read 32 raw bits from MAX31855 and return the integer value."""
    GPIO.output(CS, GPIO.LOW)
    time.sleep(0.001)

    raw = 0
    for _ in range(32):
        GPIO.output(CLK, GPIO.HIGH)
        time.sleep(0.000001)
        raw = (raw << 1) | GPIO.input(DO)
        GPIO.output(CLK, GPIO.LOW)
        time.sleep(0.000001)

    GPIO.output(CS, GPIO.HIGH)
    return raw

def decode(raw):
    # Fault bit (bit 16)
    fault = (raw >> 16) & 0x1

    # Fault flags (bits 2:0)
    oc  = raw & 0x1        # open circuit
    scg = (raw >> 1) & 0x1 # short to GND
    scv = (raw >> 2) & 0x1 # short to VCC

    # Thermocouple temp: bits 31:18 (13-bit signed, 0.25C LSB)
    tc_raw = (raw >> 18) & 0x3FFF
    if tc_raw & 0x2000:
        tc_raw -= 0x4000
    tc_c = tc_raw * 0.25
    tc_f = tc_c * 9/5 + 32

    # Cold junction temp: bits 15:4 (12-bit signed, 0.0625C LSB)
    cj_raw = (raw >> 4) & 0xFFF
    if cj_raw & 0x800:
        cj_raw -= 0x1000
    cj_c = cj_raw * 0.0625

    return tc_c, tc_f, cj_c, fault, oc, scg, scv

print("MAX31855 raw SPI test — Ctrl+C to stop\n")
print(f"Pins: CLK=GPIO{CLK}  DO=GPIO{DO}  CS=GPIO{CS}\n")
print(f"{'Time':<12} {'TC (C)':>8} {'TC (F)':>8} {'CJ (C)':>8} {'Raw (hex)':>12}  Faults")
print("-" * 70)

try:
    while True:
        raw = read_max31855()
        tc_c, tc_f, cj_c, fault, oc, scg, scv = decode(raw)
        faults = []
        if oc:  faults.append("OPEN_CIRCUIT")
        if scg: faults.append("SHORT_TO_GND")
        if scv: faults.append("SHORT_TO_VCC")
        fault_str = ", ".join(faults) if faults else "OK"
        print(f"{time.strftime('%H:%M:%S'):<12} {tc_c:>8.2f} {tc_f:>8.2f} {cj_c:>8.2f} {raw:#012x}  {fault_str}")
        time.sleep(1)
except KeyboardInterrupt:
    pass
finally:
    GPIO.cleanup()
    print("\nDone.")
