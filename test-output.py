#!/usr/bin/env python
import config
import adafruit_max31855
import digitalio
import time
import datetime
import argparse

try:
    import board
except NotImplementedError:
    print("not running a recognized blinka board, exiting...")
    import sys
    sys.exit()

########################################################################
#
# To test your gpio output to control a relay...
#
# Edit config.py and set the following in that file to match your
# hardware setup: gpio_heat, gpio_heat_invert
#
# then run this script...
# 
# ./test-output.py
#
# This will switch the output on for five seconds and then off for five 
# seconds. Measure the voltage between the output and any ground pin.
# You can also run ./gpioreadall.py in another window to see the voltage
# on your configured pin change.
########################################################################

parser = argparse.ArgumentParser(description='Test SSR output pin.')
parser.add_argument('--zone', type=int, default=0, help='Zone id to test (0-based)')
args = parser.parse_args()

gpio_heat = getattr(config, 'gpio_heat', None)
gpio_heat_invert = getattr(config, 'gpio_heat_invert', False)

zones = getattr(config, 'zones', None)
if zones:
    try:
        z = zones[args.zone] or {}
        gpio_heat = z.get('gpio_heat', gpio_heat)
        gpio_heat_invert = z.get('gpio_heat_invert', gpio_heat_invert)
    except Exception:
        pass

heater = digitalio.DigitalInOut(gpio_heat)
heater.direction = digitalio.Direction.OUTPUT
off = gpio_heat_invert
on = not off

print("\nboard: %s" % (board.board_id))
print("zone: %d" % args.zone)
print("heater configured as gpio_heat = %s BCM pin\n" % (gpio_heat))
print("heater output pin configured as invert = %r\n" % (gpio_heat_invert))

while True:
    heater.value = on
    print("%s heater on" % datetime.datetime.now())
    time.sleep(5)
    heater.value = off
    print("%s heater off" % datetime.datetime.now())
    time.sleep(5)
