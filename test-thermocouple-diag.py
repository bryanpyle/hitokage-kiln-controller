#!/usr/bin/env python
########################################################################
#
# MAX31856 diagnostic script
#
# Reads the cold junction (chip) temperature and fault register to help
# diagnose thermocouple wiring issues.
#
# Usage:
#   ./test-thermocouple-diag.py            # tests zone 2 (default, CS=GPIO22)
#   ./test-thermocouple-diag.py --zone 0   # Zone 3 (Top),    CS=GPIO6
#   ./test-thermocouple-diag.py --zone 1   # Zone 2 (Middle), CS=GPIO5
#   ./test-thermocouple-diag.py --zone 2   # Zone 1 (Bottom), CS=GPIO22
#
# If reference_temperature reads room temp but temperature reads 0C,
# the chip is fine and the problem is the thermocouple wire connection.
# Try shorting T+ to T- with a jumper wire -- temperature should then
# equal reference_temperature.
#
########################################################################

import config
import argparse
import time
from digitalio import DigitalInOut
import adafruit_bitbangio as bitbangio

try:
    import board
except NotImplementedError:
    print("not running a recognized blinka board, exiting...")
    import sys
    sys.exit()

parser = argparse.ArgumentParser(description='MAX31856 diagnostic - cold junction + fault register.')
parser.add_argument('--zone', type=int, default=2, help='Zone id to test (0-based, default: 2)')
args = parser.parse_args()

# ── resolve CS pin for requested zone ────────────────────────────────────────
spi_cs = getattr(config, 'spi_cs', None)
zones = getattr(config, 'zones', None)
if zones:
    try:
        z = zones[args.zone] or {}
        spi_cs = z.get('spi_cs', spi_cs)
        zone_name = z.get('name', f'Zone {args.zone}')
    except Exception:
        zone_name = f'Zone {args.zone}'
else:
    zone_name = f'Zone {args.zone}'

# ── set up SPI + sensor ───────────────────────────────────────────────────────
spi = bitbangio.SPI(config.spi_sclk, config.spi_mosi, config.spi_miso)
cs = DigitalInOut(spi_cs)
cs.switch_to_output(value=True)

import adafruit_max31856
thermocouple_type = getattr(config, 'thermocouple_type', adafruit_max31856.ThermocoupleType.K)
sensor = adafruit_max31856.MAX31856(spi, cs, thermocouple_type=thermocouple_type)

print(f"\nboard      : {board.board_id}")
print(f"zone       : {args.zone} ({zone_name})")
print(f"spi_cs     : {spi_cs}")
print(f"TC type    : {thermocouple_type}")
print()
print("Polling every 2s. Ctrl+C to stop.\n")
print(f"{'Time':<25} {'Chip (cold junc)':>18} {'Thermocouple':>14} {'Faults'}")
print("-" * 80)

while True:
    try:
        cold_c  = sensor.reference_temperature          # chip temp (°C)
        tc_c    = sensor.temperature                    # thermocouple tip (°C)
        faults  = sensor.fault                          # dict of fault flags

        cold_f  = cold_c * 9/5 + 32
        tc_f    = tc_c   * 9/5 + 32

        active_faults = [k for k, v in faults.items() if v]
        fault_str = ", ".join(active_faults) if active_faults else "none"

        import datetime
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"{ts:<25} {cold_c:>8.2f}C / {cold_f:>6.2f}F   {tc_c:>6.2f}C / {tc_f:>6.2f}F   {fault_str}")

    except Exception as e:
        import datetime
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"{ts:<25} ERROR: {e}")

    time.sleep(2)
