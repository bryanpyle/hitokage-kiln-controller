#!/usr/bin/env python3
"""
Multi-zone raw SPI test for MAX31855.
Bit-bangs directly with RPi.GPIO — no blinka, no adafruit libraries.

Reads all zones defined in config.py (zones list), or falls back to the
single CS pin below if config is not available.

Shared wiring (all zones):
  CLK -> GPIO 17  (physical pin 11)
  DO  -> GPIO 27  (physical pin 13)
  VIN -> 3.3V     (physical pin 1)
  GND -> GND      (physical pin 6)

Per-zone wiring:
  Zone 1 (Top)    CS -> GPIO 6   (physical pin 31)
  Zone 2 (Middle) CS -> GPIO 5   (physical pin 29)
  Zone 3 (Bottom) CS -> GPIO 22  (physical pin 15)  ← default test board
"""

import RPi.GPIO as GPIO
import time
import sys
import os

# ── Load zones from config if available ──────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import config
    CLK = config.spi_sclk
    DO  = config.spi_miso
    zones_cfg = getattr(config, 'zones', None)
    if zones_cfg:
        ZONES = [(z.get('name', f'Zone {i+1}'), z['spi_cs']) for i, z in enumerate(zones_cfg)]
    else:
        ZONES = [('Zone 1', config.spi_cs)]
except Exception:
    # Fallback: single board on default pins
    CLK   = 17
    DO    = 27
    ZONES = [('Zone 1', 22)]
# ─────────────────────────────────────────────────────────────────────────────

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(CLK, GPIO.OUT)
GPIO.setup(DO,  GPIO.IN)
for _, cs in ZONES:
    GPIO.setup(cs, GPIO.OUT)
    GPIO.output(cs, GPIO.HIGH)
GPIO.output(CLK, GPIO.LOW)

def read_max31855(cs_pin):
    """Read 32 raw bits from a MAX31855 on the given CS pin."""
    GPIO.output(cs_pin, GPIO.LOW)
    time.sleep(0.001)
    raw = 0
    for _ in range(32):
        GPIO.output(CLK, GPIO.HIGH)
        time.sleep(0.000001)
        raw = (raw << 1) | GPIO.input(DO)
        GPIO.output(CLK, GPIO.LOW)
        time.sleep(0.000001)
    GPIO.output(cs_pin, GPIO.HIGH)
    return raw

def decode(raw):
    fault = (raw >> 16) & 0x1
    oc  = raw & 0x1
    scg = (raw >> 1) & 0x1
    scv = (raw >> 2) & 0x1
    tc_raw = (raw >> 18) & 0x3FFF
    if tc_raw & 0x2000:
        tc_raw -= 0x4000
    tc_c = tc_raw * 0.25
    tc_f = tc_c * 9/5 + 32
    cj_raw = (raw >> 4) & 0xFFF
    if cj_raw & 0x800:
        cj_raw -= 0x1000
    cj_c = cj_raw * 0.0625
    return tc_c, tc_f, cj_c, fault, oc, scg, scv

print("MAX31855 multi-zone raw SPI test — Ctrl+C to stop\n")
print(f"Shared pins: CLK=GPIO{CLK}  DO=GPIO{DO}")
for name, cs in ZONES:
    print(f"  {name}: CS=GPIO{cs}")
print()

col_w = 38
header = f"{'Time':<10}" + "".join(f"  {name:<{col_w}}" for name, _ in ZONES)
print(header)
print("-" * len(header))

try:
    while True:
        ts = time.strftime('%H:%M:%S')
        row = f"{ts:<10}"
        for name, cs in ZONES:
            raw = read_max31855(cs)
            tc_c, tc_f, cj_c, fault, oc, scg, scv = decode(raw)
            faults = []
            if oc:  faults.append("OC")
            if scg: faults.append("SCG")
            if scv: faults.append("SCV")
            fault_str = ",".join(faults) if faults else "OK"
            cell = f"{tc_f:>7.2f}F  CJ:{cj_c:>5.2f}C  {fault_str}"
            row += f"  {cell:<{col_w}}"
        print(row)
        time.sleep(1)
except KeyboardInterrupt:
    pass
finally:
    GPIO.cleanup()
    print("\nDone.")
