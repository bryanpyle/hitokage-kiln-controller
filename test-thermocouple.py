#!/usr/bin/env python
import config
import time
import datetime
import argparse
import RPi.GPIO as GPIO

########################################################################
#
# To test your thermocouple (MAX31855, raw RPi.GPIO bit-bang SPI)...
#
# Edit config.py and verify spi_sclk, spi_miso, and the zone spi_cs
# match your wiring.
#
# ./test-thermocouple.py           # zone 0 (default)
# ./test-thermocouple.py --zone 2  # zone 2 (Bottom, CS=GPIO22)
#
########################################################################

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

parser = argparse.ArgumentParser(description='Test thermocouple input.')
parser.add_argument('--zone', type=int, default=0, help='Zone id to test (0-based)')
args = parser.parse_args()

spi_cs = getattr(config, 'spi_cs', 22)
zones = getattr(config, 'zones', None)
zone_name = "default"
if zones:
    try:
        z = zones[args.zone] or {}
        spi_cs = z.get('spi_cs', spi_cs)
        zone_name = z.get('name', 'Zone %d' % args.zone)
    except Exception:
        pass

clk_pin  = config.spi_sclk
miso_pin = config.spi_miso
cs_pin   = spi_cs

GPIO.setup(clk_pin,  GPIO.OUT)
GPIO.setup(miso_pin, GPIO.IN)
GPIO.setup(cs_pin,   GPIO.OUT)
GPIO.output(clk_pin, GPIO.LOW)
GPIO.output(cs_pin,  GPIO.HIGH)

print("Raw GPIO SPI thermocouple test")
print("SPI configured as:")
print("    spi_sclk = GPIO%d" % clk_pin)
print("    spi_miso = GPIO%d" % miso_pin)
print("    spi_cs   = GPIO%d" % cs_pin)
print("\nzone: %d (%s)" % (args.zone, zone_name))
print("Degrees displayed in %s\n" % config.temp_scale)

def read_raw():
    GPIO.output(cs_pin, GPIO.LOW)
    time.sleep(0.001)
    raw = 0
    for _ in range(32):
        GPIO.output(clk_pin, GPIO.HIGH)
        time.sleep(0.000001)
        raw = (raw << 1) | GPIO.input(miso_pin)
        GPIO.output(clk_pin, GPIO.LOW)
        time.sleep(0.000001)
    GPIO.output(cs_pin, GPIO.HIGH)
    return raw

try:
    while True:
        time.sleep(1)
        try:
            raw = read_raw()
            if (raw >> 16) & 0x1:
                if raw & 0x1:
                    print("error: thermocouple not connected")
                elif (raw >> 1) & 0x1:
                    print("error: short circuit to ground")
                elif (raw >> 2) & 0x1:
                    print("error: short circuit to power")
                else:
                    print("error: fault reading")
                continue
            tc_raw = (raw >> 18) & 0x3FFF
            if tc_raw & 0x2000:
                tc_raw -= 0x4000
            temp = tc_raw * 0.25
            scale = "C"
            if config.temp_scale == "f":
                temp = temp * (9/5) + 32
                scale = "F"
            print("%s %0.2f%s" % (datetime.datetime.now(), temp, scale))
        except Exception as error:
            print("error:", error)
finally:
    GPIO.cleanup()

