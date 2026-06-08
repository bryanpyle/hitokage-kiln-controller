Kiln Controller
==========

Turns a Raspberry Pi into an inexpensive, web-enabled kiln controller.

## Features

  * supports Raspberry Pi (tested on Pi Zero 2 W, Pi 3, Pi 4)
  * supports MAX31855 (K-type) and MAX31856 thermocouple boards via raw RPi.GPIO bit-bang SPI — no adafruit/blinka libraries required for MAX31855
  * support for K type thermocouples (MAX31855); K, J, N, R, S, T, E, B type with MAX31856
  * easy to create new kiln schedules and edit / modify existing schedules
  * no limit to runtime - fire for days if you want
  * view status from multiple devices at once - computer, tablet etc
  * real-time firing cost estimate
  * real-time heating rate displayed in degrees per hour
  * supports PID parameters you tune to your kiln
  * monitors temperature in kiln after schedule has ended
  * api for starting and stopping at any point in a schedule
  * accurate simulation
  * support for shifting schedule when kiln cannot heat quickly enough
  * support for skipping first part of profile to match current kiln temperature
  * prevents integral wind-up when temperatures not near the set point
  * automatic restarts if there is a power outage or other event
  * support for a watcher to page you via slack if you kiln is out of whack
  * easy scheduling of future kiln runs


**Run Kiln Schedule**

![Image](https://github.com/jbruce12000/kiln-controller/blob/main/public/assets/images/kiln-running.png)

**Edit Kiln Schedule**

![Image](https://github.com/jbruce12000/kiln-controller/blob/main/public/assets/images/kiln-schedule.png)

## Hardware

### Parts

| Image | Hardware | Description |
| ------| -------- | ----------- |
| ![Image](https://github.com/jbruce12000/kiln-controller/blob/main/public/assets/images/rpi.png) | [Raspberry Pi](https://www.adafruit.com/category/105) | Any Raspberry Pi with GPIO and WiFi will work. Tested on Pi Zero 2 W (64-bit Pi OS). Uses raw `RPi.GPIO` bit-bang SPI — no kernel SPI module or blinka required. |
| ![Image](https://github.com/jbruce12000/kiln-controller/blob/main/public/assets/images/max31855.png) | [Adafruit MAX31855](https://www.adafruit.com/product/269) or [Adafruit MAX31856](https://www.adafruit.com/product/3263) | Thermocouple breakout board. MAX31855 is read via raw GPIO (no adafruit libs needed). MAX31856 still requires adafruit-circuitpython-max31856. |
| ![Image](https://github.com/jbruce12000/kiln-controller/blob/main/public/assets/images/k-type-thermocouple.png) | [Thermocouple](https://www.auberins.com/index.php?main_page=product_info&cPath=20_3&products_id=39) | Invest in a heavy duty, ceramic thermocouple designed for kilns. Make sure the type will work with your thermocouple board. Adafruit-MAX31855 works only with K-type. Adafruit-MAX31856 is flexible and works with many types, but folks usually pick S-type. |
| ![Image](https://github.com/jbruce12000/kiln-controller/blob/main/public/assets/images/breadboard.png) | Breadboard | breadboard, ribbon cable, connector for pi's gpio pins & connecting wires |
| ![Image](https://github.com/jbruce12000/kiln-controller/blob/main/public/assets/images/ssr.png) | Solid State Relay | Zero crossing, make sure it can handle the max current of your kiln. Even if the kiln is 220V you can buy a single [3 Phase SSR](https://www.auberins.com/index.php?main_page=product_info&cPath=2_30&products_id=331). It's like having 3 SSRs in one.  Relays this big always require a heat sink. |
| ![Image](https://github.com/jbruce12000/kiln-controller/blob/main/public/assets/images/ks-1018.png) | Electric Kiln | There are many old electric kilns on the market that don't have digital controls. You can pick one up on the used market cheaply.  This controller will work with 110V or 220V (pick a proper SSR). My kiln is a Skutt KS-1018. |

### Schematic

The pi has three gpio pins connected to the MAX31855 chip. D0 is configured as an input and CS and CLK are outputs. The signal that controls the solid state relay starts as a gpio output which drives a transistor acting as a switch in front of it. This transistor provides 5V and plenty of current to control the ssr. Since only four gpio pins are in use, any pi can be used for this project. See the [config](https://github.com/jbruce12000/kiln-controller/blob/main/config.py) file for gpio pin configuration.

My controller plugs into the wall, and the kiln plugs into the controller. 

**WARNING** This project involves high voltages and high currents. Please make sure that anything you build conforms to local electrical codes and aligns with industry best practices.

**Note:** The GPIO configuration in this schematic does not match the defaults, check [config](https://github.com/jbruce12000/kiln-controller/blob/main/config.py) and make sure the gpio pin configuration aligns with your actual connections.

![Image](https://github.com/jbruce12000/kiln-controller/blob/main/public/assets/images/schematic.png)

*Note: I tried to power my ssr directly using a gpio pin, but it did not work. My ssr required 25ma to switch and rpi's gpio could only provide 16ma. YMMV.*

## Software 

### Raspberry Pi OS

Download [Raspberry Pi OS](https://www.raspberrypi.org/software/) (64-bit). Use the Raspberry Pi Imager to install the OS on an SD card. Boot, open a terminal and...

    $ sudo apt-get update
    $ sudo apt-get dist-upgrade
    $ git clone https://github.com/jbruce12000/kiln-controller
    $ cd kiln-controller
    $ python3 -m venv .venv
    $ source .venv/bin/activate
    $ pip install -r requirements.txt

> **Note:** Hardware SPI does **not** need to be enabled in `raspi-config`. The controller uses raw `RPi.GPIO` bit-bang SPI which works on any GPIO pins without kernel SPI support.

### macOS / desktop development install

For local development on macOS (or other non-Raspberry Pi machines), use the dev requirements file:

    $ python3 -m venv venv
    $ source venv/bin/activate
    $ pip install -r requirements-dev.txt

This avoids the Raspberry Pi-only `RPi.GPIO` dependency while still installing the libraries needed to run/simulate the app.

### Makefile shortcuts

If you have `make` installed, you can use one-command shortcuts from the repo root:

    $ make dev-install     # desktop/macOS dependencies
    $ make pi-install      # Raspberry Pi dependencies
    $ make verify-imports  # quick import smoke test
    $ make backend-pi      # start FastAPI backend on Pi (real hardware)
    $ make backend         # start FastAPI backend in sim mode (macOS/desktop)

*Note: The above steps work on Ubuntu if you prefer*

### Raspberry Pi deployment

When you're ready to deploy on a Raspberry Pi with real hardware:

1. Set `simulate = False` in `config.py`
2. Wire your MAX31855 board(s) — see [docs/max31855-raw-gpio-setup.md](docs/max31855-raw-gpio-setup.md)
3. Build the frontend (first time only):

        $ curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
        $ sudo apt install -y nodejs
        $ make frontend-build

4. Start the backend:

        $ make backend-pi

> **No `raspi-config` SPI step needed.** Raw `RPi.GPIO` bit-bang SPI is used and does not require the kernel SPI module.

## Configuration

All parameters are defined in config.py. You need to read through config.py carefully to understand each setting. Here are some of the most important settings:

Multi-zone: This fork supports controlling multiple independent zones (e.g. 3 SSRs + 3 K-type thermocouples) by defining a `zones` list in `config.py`. If `zones` is not set, the controller runs in legacy single-zone mode.

| Variable | Default | Description |
| -------- | ------- | ----------- |
| sensor_time_wait | 2 seconds | It's the duty cycle for the entire system.  It's set to two seconds by default which means that a decision is made every 2s about whether to turn on relay[s] and for how long. If you use mechanical relays, you may want to increase this. At 2s, my SSR switches 11,000 times in 13 hours. |
| temp_scale | f | f for farenheit, c for celcius |
| pid parameters | | Used to tune your kiln. See PID Tuning. |
| simulate | False | Simulate a kiln. Set to `True` to test the software without hardware. Can be overridden with the `KILN_SIMULATE=true` environment variable. |
 

## Testing

After connecting all the hardware, use the test scripts to verify each component. First, activate the virtual environment:

     $ source .venv/bin/activate

Test the thermocouple with a minimal raw GPIO script (recommended first step):

     $ ./test-raw-spi.py

This reads the MAX31855 directly using `RPi.GPIO` with no adafruit/blinka dependencies and prints raw hex, decoded temperature, cold junction temp, and fault flags.

Test a specific zone (reads config.py for pin assignments):

     $ ./test-thermocouple.py --zone 0   # Zone 1 (Top)
     $ ./test-thermocouple.py --zone 1   # Zone 2 (Middle)
     $ ./test-thermocouple.py --zone 2   # Zone 3 (Bottom)

See [docs/max31855-raw-gpio-setup.md](docs/max31855-raw-gpio-setup.md) for wiring, pin assignments, and diagnostic tips.

Test the SSR relay output:

     $ ./test-output.py

Examine GPIO pin states:

     $ ./gpioreadall.py

## PID Tuning

Run the [autotuner](https://github.com/jbruce12000/kiln-controller/blob/main/docs/ziegler_tuning.md). It will heat your kiln to 400F, pass that, and then once it cools back down to 400F, it will calculate PID values which you must copy into config.py. No tuning is perfect across a wide temperature range. Here is a [PID Tuning Guide](https://github.com/jbruce12000/kiln-controller/blob/main/docs/pid_tuning.md) if you end up having to manually tune.

There is a state view that can help with tuning. It shows the P,I, and D parameters over time plus allows for a csv dump of data collected. It also shows lots of other details that might help with troubleshooting issues. Go to /state.

## Usage

### Server Startup

    $ source .venv/bin/activate
    $ make backend-pi        # real hardware (Pi)
    $ make backend           # simulation (macOS/desktop)

The legacy bottle/gevent server is still available but not recommended:

    $ make run-pi

### Autostart Server on Boot
If you want the server to autostart on boot, run the following command:

    $ /home/pi/kiln-controller/start-on-boot

### Client Access

Open `http://<pi-ip>:8081` from any browser on the same network.
For local development: http://127.0.0.1:8081

The frontend must be built before the UI will load — see the Raspberry Pi deployment section above.

### Simulation

In config.py, set **simulate=True**. Start the server and select a profile and click Start. Simulations run at near real time.

### Scheduling a Kiln run

If you want to schedule a kiln run to start in the future. Here are [examples](https://github.com/jbruce12000/kiln-controller/blob/main/docs/scheduling.md).

### Watcher

If you're busy and do not want to sit around watching the web interface for problems, there is a watcher.py script which you can run on any machine in your local network or even on the raspberry pi which will watch the kiln-controller process to make sure it is running a schedule, and staying within a pre-defined temperature range. When things go bad, it sends messages to a slack channel you define. I have alerts set on my android phone for that specific slack channel. Here are detailed [instructions](https://github.com/jbruce12000/kiln-controller/blob/main/docs/watcher.md).

## License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

## Support & Contact

Please use the issue tracker for project related issues.
If you're having trouble with hardware, I did too.  Here is a [troubleshooting guide](https://github.com/jbruce12000/kiln-controller/blob/main/docs/troubleshooting.md) I created for testing RPi gpio pins.

## Origin
This project was originally forked from https://github.com/apollo-ng/picoReflow but has diverged a large amount.
