# MAX31855 Raw GPIO SPI Setup (Raspberry Pi Zero 2 W)

This document covers wiring and configuration for a 3-zone kiln controller using MAX31855
thermocouple breakout boards with raw `RPi.GPIO` bit-bang SPI — no blinka or adafruit
libraries required for thermocouple reading.

---

## All Pins at a Glance

**10 Pi pins total.** CLK and DO fan out to all 3 boards — run one wire from each to all three MAX31855 CLK/DO terminals. Everything else is point-to-point.

| Physical Pin | BCM GPIO | Signal | Connects to |
|---|---|---|---|
| Pin 1 | 3.3V | Power | VIN on **all 3** MAX31855 boards |
| Pin 6 | GND | Ground | GND on **all 3** MAX31855 boards + SSR ground ref |
| Pin 11 | GPIO 17 | CLK (shared) | CLK on **all 3** MAX31855 boards |
| Pin 13 | GPIO 27 | DO/MISO (shared) | DO on **all 3** MAX31855 boards |
| Pin 15 | GPIO 22 | Zone 3 CS | CS on Zone 3 (Bottom) MAX31855 |
| Pin 16 | GPIO 23 | Zone 3 SSR | Signal on Zone 3 SSR |
| Pin 18 | GPIO 24 | Zone 2 SSR | Signal on Zone 2 SSR |
| Pin 22 | GPIO 25 | Zone 1 SSR | Signal on Zone 1 SSR |
| Pin 29 | GPIO 5 | Zone 2 CS | CS on Zone 2 (Middle) MAX31855 |
| Pin 31 | GPIO 6 | Zone 1 CS | CS on Zone 1 (Top) MAX31855 |

**Per MAX31855 board:**

| Board | VIN | GND | CLK | DO | CS |
|---|---|---|---|---|---|
| Zone 1 (Top) | Pin 1 | Pin 6 | Pin 11 | Pin 13 | Pin 31 |
| Zone 2 (Middle) | Pin 1 | Pin 6 | Pin 11 | Pin 13 | Pin 29 |
| Zone 3 (Bottom) | Pin 1 | Pin 6 | Pin 11 | Pin 13 | Pin 15 |

---

## Why raw GPIO instead of adafruit/blinka?

The adafruit-circuitpython-bitbangio library had intermittent timing issues on the Pi Zero 2 W
that caused frequent "thermocouple not connected" errors and false 0°C readings. The raw
`RPi.GPIO` bit-bang approach proved stable and is used throughout the kiln controller code.

---

## Shared SPI Bus (all zones)

The CLK and DO (MISO) lines are **shared** across all three MAX31855 boards.
Wire every board's CLK and DO to the same Pi GPIO pins.

| Signal | BCM GPIO | Physical Pin |
|--------|----------|-------------|
| CLK    | GPIO 17  | Pin 11      |
| DO     | GPIO 27  | Pin 13      |
| VIN    | 3.3V     | Pin 1       |
| GND    | GND      | Pin 6       |

> **MOSI is not connected.** The MAX31855 is read-only.

---

## Per-Zone Wiring

Each zone has its own MAX31855 CS pin and SSR relay pin.

| Zone              | CS (BCM) | CS Physical | SSR Relay (BCM) | SSR Physical |
|-------------------|----------|-------------|-----------------|--------------|
| Zone 1 (Top)      | GPIO 6   | Pin 31      | GPIO 25         | Pin 22       |
| Zone 2 (Middle)   | GPIO 5   | Pin 29      | GPIO 24         | Pin 18       |
| Zone 3 (Bottom)   | GPIO 22  | Pin 15      | GPIO 23         | Pin 16       |

> Zone 3 (Bottom) CS=GPIO22 matches the current test wiring.

### Wiring diagram (one zone)

```
MAX31855          Raspberry Pi Zero 2 W
--------          ---------------------
VIN    ---------> 3.3V  (Pin 1)
GND    ---------> GND   (Pin 6)
CLK    ---------> GPIO17 (Pin 11)   ← shared with all zones
DO     ---------> GPIO27 (Pin 13)   ← shared with all zones
CS     ---------> zone-specific CS pin (see table above)

T+  ┐
    ├── thermocouple wires
T-  ┘
```

---

## Software Setup

### 1. Install dependencies

```bash
pip install RPi.GPIO
```

All adafruit/blinka libraries are **no longer required** for the kiln controller.
You can leave them installed if needed for other scripts.

### 2. Verify config.py

Open `config.py` and confirm:

```python
# Shared SPI bus pins (BCM integers)
spi_sclk = 17
spi_miso = 27

# Chip type
max31855 = 1
max31856 = 0

# Simulation off
simulate = False
```

And the zones list matches your wiring:

```python
zones = [
    {
        "name": "Zone 1 (Top)",
        "gpio_heat": 25,
        "gpio_heat_invert": False,
        "spi_cs": 6,
    },
    {
        "name": "Zone 2 (Middle)",
        "gpio_heat": 24,
        "gpio_heat_invert": False,
        "spi_cs": 5,
    },
    {
        "name": "Zone 3 (Bottom)",
        "gpio_heat": 23,
        "gpio_heat_invert": False,
        "spi_cs": 22,
    },
]
```

---

## Testing

### Quick raw SPI test (no config dependency)

```bash
./test-raw-spi.py
```

Prints raw hex, decoded TC temperature, cold junction temperature, and fault flags.
Use this first to confirm the board and wiring are working before running the full controller.

Expected healthy output:
```
Time         TC (C)   TC (F)   CJ (C)    Raw (hex)  Faults
----------------------------------------------------------------------
20:01:05      22.50    72.50    22.25  0x0001681640  OK
```

| Raw hex value  | Meaning                                      |
|----------------|----------------------------------------------|
| `0x00000000`   | DO line stuck LOW — check MISO wiring        |
| `0xFFFFFFFF`   | DO line stuck HIGH — check MISO wiring       |
| `0x00000001`   | Open circuit fault — chip alive, TC not connected |
| Stable ~room temp | Working correctly                         |

### Per-zone thermocouple test

```bash
./test-thermocouple.py --zone 0   # Zone 1 (Top)
./test-thermocouple.py --zone 1   # Zone 2 (Middle)
./test-thermocouple.py --zone 2   # Zone 3 (Bottom)
```

### Short-circuit test (to isolate TC vs SPI issues)

Bridge T+ and T- on the MAX31855 board with any wire or paperclip.
The reading should stabilize to approximately room temperature (~65–75°F / 18–24°C).

- **Reads room temp** → chip and SPI are fine; problem is thermocouple wires
- **Reads 32°F / 0°C** → DO/MISO line is not being read (wiring or damaged GPIO pin)
- **Still errors** → try a different set of GPIO pins or replace the breakout board

---

## Adding a second or third zone

1. Wire the new MAX31855's CLK → GPIO17, DO → GPIO27 (same as existing board)
2. Connect its CS to the zone's assigned GPIO (GPIO5 or GPIO6)
3. Connect the SSR signal wire to the zone's assigned relay GPIO (GPIO24 or GPIO25)
4. Test with `./test-thermocouple.py --zone N` before running the full controller

---

## Pi Zero 2 W GPIO pinout reference

```
         3V3  (1) (2)  5V
       GPIO2  (3) (4)  5V
       GPIO3  (5) (6)  GND
       GPIO4  (7) (8)  GPIO14
         GND  (9) (10) GPIO15
      GPIO17 (11) (12) GPIO18    ← CLK (shared)
      GPIO27 (13) (14) GND       ← DO/MISO (shared)
      GPIO22 (15) (16) GPIO23    ← Zone 3 CS | Zone 3 SSR
         3V3 (17) (18) GPIO24    ← Zone 2 SSR
      GPIO10 (19) (20) GND
       GPIO9 (21) (22) GPIO25    ← Zone 1 SSR
      GPIO11 (23) (24) GPIO8
         GND (25) (26) GPIO7
       GPIO0 (27) (28) GPIO1
       GPIO5 (29) (30) GND       ← Zone 2 CS
       GPIO6 (31) (32) GPIO12    ← Zone 1 CS
      GPIO13 (33) (34) GND
      GPIO19 (35) (36) GPIO16
      GPIO26 (37) (38) GPIO20
         GND (39) (40) GPIO21
```
