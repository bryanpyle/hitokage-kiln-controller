import threading
import time
import datetime
import logging
import json
from abc import ABC, abstractmethod
import config
import os
import statistics

try:
    import RPi.GPIO as GPIO
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
except (ImportError, RuntimeError) as _gpio_err:
    GPIO = None  # simulation / dev environment
    _GPIO_IMPORT_ERROR = _gpio_err
else:
    _GPIO_IMPORT_ERROR = None


def _require_gpio():
    """Call before any GPIO operation. Raises if GPIO unavailable and not simulating."""
    if GPIO is None and not config.simulate:
        raise RuntimeError(
            "RPi.GPIO is not available ({}). "
            "Ensure the container has access to /dev/gpiomem (privileged: true "
            "or correct group_add GID) and RPi.GPIO is installed.".format(_GPIO_IMPORT_ERROR)
        )

log = logging.getLogger(__name__)

# When running multiple zones, each thermocouple reader runs in its own thread.
# The SPI bus is shared, so serialize raw reads to avoid contention.
SPI_LOCK = threading.Lock()

class DupFilter(object):
    def __init__(self):
        self.msgs = set()

    def filter(self, record):
        rv = record.msg not in self.msgs
        self.msgs.add(record.msg)
        return rv

class Duplogger():
    def __init__(self):
        self.log = logging.getLogger("%s.dupfree" % (__name__))
        dup_filter = DupFilter()
        self.log.addFilter(dup_filter)
    def logref(self):
        return self.log

duplog = Duplogger().logref()


class Output(object):
    '''This represents a GPIO output that controls a solid
    state relay to turn the kiln elements on and off.
    inputs
        config.gpio_heat
        config.gpio_heat_invert
    '''
    def __init__(self, gpio_heat=None, gpio_heat_invert=None):
        self.active = False
        if gpio_heat is None:
            gpio_heat = config.gpio_heat
        if gpio_heat_invert is None:
            gpio_heat_invert = config.gpio_heat_invert

        self.pin = gpio_heat
        # gpio_heat_invert=True means the SSR fires on LOW
        self.on  = GPIO.LOW  if gpio_heat_invert else GPIO.HIGH
        self.off = GPIO.HIGH if gpio_heat_invert else GPIO.LOW
        GPIO.setup(self.pin, GPIO.OUT)
        GPIO.output(self.pin, self.off)

    def heat(self, sleepfor):
        GPIO.output(self.pin, self.on)
        time.sleep(sleepfor)

    def cool(self, sleepfor):
        '''no active cooling, so sleep'''
        GPIO.output(self.pin, self.off)
        time.sleep(sleepfor)

# wrapper for blinka board
class Board(object):
    '''This represents a blinka board where this code
    runs.
    '''
    def __init__(self):
        log.info("board: %s" % (self.name))
        self.temp_sensor.start()

class RealBoard(Board):
    '''Each board has a thermocouple board attached to it.
    Any blinka board that supports SPI can be used. The
    board is automatically detected by blinka.
    '''
    def __init__(self, spi_cs=None):
        self.name = None
        self.spi_cs = spi_cs
        self.load_libs()
        self.temp_sensor = self.choose_tempsensor()
        Board.__init__(self) 

    def load_libs(self):
        try:
            with open('/proc/device-tree/model', 'r') as f:
                self.name = f.read().strip().replace('\x00', '')
        except Exception:
            self.name = 'Raspberry Pi (unknown model)'

    def choose_tempsensor(self):
        if config.max31855:
            return Max31855(spi_cs=self.spi_cs)
        if config.max31856:
            return Max31856(spi_cs=self.spi_cs)

class SimulatedBoard(Board):
    '''Simulated board used during simulations.
    See config.simulate
    '''
    def __init__(self):
        self.name = "simulated"
        self.temp_sensor = TempSensorSimulated()
        Board.__init__(self) 

class TempSensor(threading.Thread):
    '''Used by the Board class. Each Board must have
    a TempSensor.
    '''
    def __init__(self):
        threading.Thread.__init__(self)
        self.daemon = True
        self.time_step = config.sensor_time_wait
        self.status = ThermocoupleTracker()

class TempSensorSimulated(TempSensor):
    '''Simulates a temperature sensor '''
    def __init__(self):
        TempSensor.__init__(self)
        self.simulated_temperature = config.sim_t_env
    def temperature(self):
        return self.simulated_temperature

class TempSensorReal(TempSensor):
    '''real temperature sensor that takes many measurements
       during the time_step
       inputs
           config.temperature_average_samples 
    '''
    def __init__(self, spi_cs=None):
        TempSensor.__init__(self)
        self.sleeptime = self.time_step / float(config.temperature_average_samples)
        self.temptracker = TempTracker()
        self.spi_setup()
        if spi_cs is None:
            spi_cs = config.spi_cs
        self.cs_pin = spi_cs
        GPIO.setup(self.cs_pin, GPIO.OUT)
        GPIO.output(self.cs_pin, GPIO.HIGH)

    def spi_setup(self):
        _require_gpio()
        self.clk_pin  = config.spi_sclk
        self.miso_pin = config.spi_miso
        GPIO.setup(self.clk_pin,  GPIO.OUT)
        GPIO.setup(self.miso_pin, GPIO.IN)
        GPIO.output(self.clk_pin, GPIO.LOW)
        log.info("Raw GPIO SPI: CLK=GPIO%d  MISO=GPIO%d" % (self.clk_pin, self.miso_pin))

    def get_temperature(self):
        '''read temp from tc and convert if needed'''
        try:
            with SPI_LOCK:
                temp = self.raw_temp() # raw_temp provided by subclasses
            if config.temp_scale.lower() == "f":
                temp = (temp*9/5)+32
            self.status.good()
            return temp
        except ThermocoupleError as tce:
            if tce.ignore:
                log.error("Problem reading temp (ignored) %s" % (tce.message))
                self.status.good()
            else:
                log.error("Problem reading temp %s" % (tce.message))
                self.status.bad()
        return None

    def temperature(self):
        '''average temp over a duty cycle'''
        return self.temptracker.get_avg_temp()

    def run(self):
        while True:
            temp = self.get_temperature()
            if temp:
                self.temptracker.add(temp)
            time.sleep(self.sleeptime)

class TempTracker(object):
    '''creates a sliding window of N temperatures per
       config.sensor_time_wait
    '''
    def __init__(self):
        self.size = config.temperature_average_samples
        self.temps = [0 for i in range(self.size)]
  
    def add(self,temp):
        self.temps.append(temp)
        while(len(self.temps) > self.size):
            del self.temps[0]

    def get_avg_temp(self, chop=25):
        '''
        take the median of the given values. this used to take an avg
        after getting rid of outliers. median works better.
        '''
        return statistics.median(self.temps)

class ThermocoupleTracker(object):
    '''Keeps sliding window to track successful/failed calls to get temp
       over the last two duty cycles.
    '''
    def __init__(self):
        self.size = config.temperature_average_samples * 2 
        self.status = [True for i in range(self.size)]
        self.limit = 30

    def good(self):
        '''True is good!'''
        self.status.append(True)
        del self.status[0]

    def bad(self):
        '''False is bad!'''
        self.status.append(False)
        del self.status[0]

    def error_percent(self):
        errors = sum(i == False for i in self.status) 
        return (errors/self.size)*100

    def over_error_limit(self):
        if self.error_percent() > self.limit:
            return True
        return False

class Max31855(TempSensorReal):
    '''each subclass expected to handle errors and get temperature.
    Uses raw RPi.GPIO bit-bang SPI — no adafruit/blinka libraries required.
    '''
    def __init__(self, spi_cs=None):
        TempSensorReal.__init__(self, spi_cs=spi_cs)
        log.info("thermocouple MAX31855 (raw GPIO SPI, CS=GPIO%d)" % self.cs_pin)

    def _read_raw(self):
        '''Bit-bang 32 bits from the MAX31855 and return the raw integer.'''
        GPIO.output(self.cs_pin, GPIO.LOW)
        time.sleep(0.001)
        raw = 0
        for _ in range(32):
            GPIO.output(self.clk_pin, GPIO.HIGH)
            time.sleep(0.000001)
            raw = (raw << 1) | GPIO.input(self.miso_pin)
            GPIO.output(self.clk_pin, GPIO.LOW)
            time.sleep(0.000001)
        GPIO.output(self.cs_pin, GPIO.HIGH)
        return raw

    def raw_temp(self):
        raw = self._read_raw()
        # Fault bit is bit 16
        if (raw >> 16) & 0x1:
            if raw & 0x1:
                raise Max31855_Error("thermocouple not connected")
            if (raw >> 1) & 0x1:
                raise Max31855_Error("short circuit to ground")
            if (raw >> 2) & 0x1:
                raise Max31855_Error("short circuit to power")
            raise Max31855_Error("fault reading")
        # Thermocouple temp: bits 31:18 — 13-bit signed, 0.25°C LSB
        tc_raw = (raw >> 18) & 0x3FFF
        if tc_raw & 0x2000:
            tc_raw -= 0x4000
        return tc_raw * 0.25

class ThermocoupleError(Exception):
    '''
    thermocouple exception parent class to handle mapping of error messages
    and make them consistent across adafruit libraries. Also set whether
    each exception should be ignored based on settings in config.py.
    '''
    def __init__(self, message):
        self.ignore = False
        self.message = message
        self.map_message()
        self.set_ignore()
        super().__init__(self.message)

    def set_ignore(self):
        if self.message == "not connected" and config.ignore_tc_lost_connection == True:
            self.ignore = True
        if self.message == "short circuit" and config.ignore_tc_short_errors == True:
            self.ignore = True
        if self.message == "unknown" and config.ignore_tc_unknown_error == True:
            self.ignore = True
        if self.message == "cold junction range fault" and config.ignore_tc_cold_junction_range_error == True:
            self.ignore = True
        if self.message == "thermocouple range fault" and config.ignore_tc_range_error == True:
            self.ignore = True
        if self.message == "cold junction temp too high" and config.ignore_tc_cold_junction_temp_high == True:
            self.ignore = True
        if self.message == "cold junction temp too low" and config.ignore_tc_cold_junction_temp_low == True:
            self.ignore = True
        if self.message == "thermocouple temp too high" and config.ignore_tc_temp_high == True:
            self.ignore = True
        if self.message == "thermocouple temp too low" and config.ignore_tc_temp_low == True:
            self.ignore = True
        if self.message == "voltage too high or low" and config.ignore_tc_voltage_error == True:
            self.ignore = True

    def map_message(self):
        try:
            self.message = self.map[self.orig_message]
        except KeyError:
            self.message = "unknown"

class Max31855_Error(ThermocoupleError):
    '''
    All children must set self.orig_message and self.map
    '''
    def __init__(self, message):
        self.orig_message = message
        # this purposefully makes "fault reading" and
        # "Total thermoelectric voltage out of range..." unknown errors
        self.map = {
            "thermocouple not connected" : "not connected",
            "short circuit to ground" : "short circuit",
            "short circuit to power" : "short circuit",
            }
        super().__init__(message)

class Max31856_Error(ThermocoupleError):
    def __init__(self, message):
        self.orig_message = message
        self.map = {
            "cj_range" : "cold junction range fault",
            "tc_range" : "thermocouple range fault",
            "cj_high"  : "cold junction temp too high",
            "cj_low"   : "cold junction temp too low",
            "tc_high"  : "thermocouple temp too high",
            "tc_low"   : "thermocouple temp too low",
            "voltage"  : "voltage too high or low", 
            "open_tc"  : "not connected"
            }
        super().__init__(message)

class Max31856(TempSensorReal):
    '''MAX31856 support requires adafruit-circuitpython-max31856 and blinka.
    Not used when max31856 = 0 in config.py (default).
    '''
    def __init__(self, spi_cs=None):
        TempSensorReal.__init__(self, spi_cs=spi_cs)
        log.info("thermocouple MAX31856 (requires adafruit/blinka libraries)")
        import busio
        import digitalio
        import adafruit_bitbangio as bitbangio
        import adafruit_max31856
        cs = digitalio.DigitalInOut(spi_cs or config.spi_cs)
        spi = bitbangio.SPI(config.spi_sclk, config.spi_mosi, config.spi_miso)
        self.thermocouple = adafruit_max31856.MAX31856(spi, cs,
                                        thermocouple_type=config.thermocouple_type)
        if (config.ac_freq_50hz == True):
            self.thermocouple.noise_rejection = 50
        else:
            self.thermocouple.noise_rejection = 60

    def raw_temp(self):
        # The underlying adafruit library does not throw exceptions
        # for thermocouple errors. Instead, they are stored in 
        # dict named self.thermocouple.fault. Here we check that
        # dict for errors and raise an exception.
        # and raise Max31856_Error(message)
        temp = self.thermocouple.temperature
        for k,v in self.thermocouple.fault.items():
            if v:
                raise Max31856_Error(k)
        return temp

class Oven(threading.Thread, ABC):
    '''parent oven class. this has all the common code
       for either a real or simulated oven'''
    def __init__(
        self,
        *,
        zone_id=0,
        zone_name=None,
        pid_kp=None,
        pid_ki=None,
        pid_kd=None,
        thermocouple_offset=None,
        automatic_restart_state_file=None,
    ):
        threading.Thread.__init__(self)
        self.daemon = True
        self.temperature = 0
        self.time_step = config.sensor_time_wait

        self.zone_id = zone_id
        self.zone_name = zone_name or f"Zone {zone_id + 1}"
        self.pid_kp = config.pid_kp if pid_kp is None else pid_kp
        self.pid_ki = config.pid_ki if pid_ki is None else pid_ki
        self.pid_kd = config.pid_kd if pid_kd is None else pid_kd
        self.thermocouple_offset = (
            config.thermocouple_offset if thermocouple_offset is None else thermocouple_offset
        )
        self.automatic_restart_state_file = (
            config.automatic_restart_state_file
            if automatic_restart_state_file is None
            else automatic_restart_state_file
        )

        self.reset()

    def reset(self):
        self.cost = 0
        self.wh = 0.0
        self.state = "IDLE"
        self.profile = None
        self.start_time = 0
        self.runtime = 0
        self.totaltime = 0
        self.target = 0
        self.heat = 0
        self.heat_rate = 0
        self.heat_rate_temps = []
        self.pid = PID(ki=self.pid_ki, kd=self.pid_kd, kp=self.pid_kp)
        self.catching_up = False

    @staticmethod
    def get_start_from_temperature(profile, temp):
        target_temp = profile.get_target_temperature(0)
        if temp > target_temp + 5:
            startat = profile.find_next_time_from_temperature(temp)
            log.info("seek_start is in effect, starting at: {} s, {} deg".format(round(startat), round(temp)))
        else:
            startat = 0
        return startat

    def set_heat_rate(self,runtime,temp):
        '''heat rate is the heating rate in degrees/hour
        '''
        # arbitrary number of samples
        # the time this covers changes based on a few things
        numtemps = 60
        self.heat_rate_temps.append((runtime,temp))
         
        # drop old temps off the list
        if len(self.heat_rate_temps) > numtemps:
            self.heat_rate_temps = self.heat_rate_temps[-1*numtemps:]
        time2 = self.heat_rate_temps[-1][0]
        time1 = self.heat_rate_temps[0][0]
        temp2 = self.heat_rate_temps[-1][1]
        temp1 = self.heat_rate_temps[0][1]
        if time2 > time1:
            self.heat_rate = ((temp2 - temp1) / (time2 - time1))*3600

    def run_profile(self, profile, startat=0, allow_seek=True):
        log.debug('run_profile run on thread' + threading.current_thread().name)
        runtime = startat * 60
        if allow_seek:
            if self.state == 'IDLE':
                if config.seek_start:
                    temp = self.board.temp_sensor.temperature()  # Defined in a subclass
                    runtime += self.get_start_from_temperature(profile, temp)

        self.reset()
        self.startat = startat * 60
        self.runtime = runtime
        # Anchor start_time so update_runtime() immediately returns `runtime`
        # (accounts for both user-specified startat and seek_start offset)
        self.start_time = datetime.datetime.now() - datetime.timedelta(seconds=runtime)
        self.profile = profile
        self.totaltime = profile.get_duration()
        self.state = "RUNNING"
        log.info("Running schedule %s starting at %d minutes" % (profile.name,startat))
        log.info("Starting")

    def abort_run(self):
        self.reset()
        self.save_automatic_restart_state()

    def get_start_time(self):
        return datetime.datetime.now() - datetime.timedelta(milliseconds = self.runtime * 1000)

    def kiln_must_catch_up(self):
        '''shift the whole schedule forward in time by one time_step
        to wait for the kiln to catch up'''
        if config.kiln_must_catch_up == True:
            temp = self.board.temp_sensor.temperature() + self.thermocouple_offset
            # kiln too cold, wait for it to heat up
            if self.target - temp > config.pid_control_window:
                log.info("kiln must catch up, too cold, shifting schedule")
                self.start_time = self.get_start_time()
                self.catching_up = True;
                return
            # kiln too hot, wait for it to cool down
            if temp - self.target > config.pid_control_window:
                log.info("kiln must catch up, too hot, shifting schedule")
                self.start_time = self.get_start_time()
                self.catching_up = True;
                return
            self.catching_up = False;

    def update_runtime(self):

        runtime_delta = datetime.datetime.now() - self.start_time
        if runtime_delta.total_seconds() < 0:
            runtime_delta = datetime.timedelta(0)

        self.runtime = runtime_delta.total_seconds()

    def update_target_temp(self):
        self.target = self.profile.get_target_temperature(self.runtime)

    def reset_if_emergency(self):
        '''reset if the temperature is way TOO HOT, or other critical errors detected'''
        if (self.board.temp_sensor.temperature() + self.thermocouple_offset >=
            config.emergency_shutoff_temp):
            log.info("emergency!!! temperature too high")
            if config.ignore_temp_too_high == False:
                self.abort_run()
        
        if self.board.temp_sensor.status.over_error_limit():
            log.info("emergency!!! too many errors in a short period")
            if config.ignore_tc_too_many_errors == False:
                self.abort_run()

    def reset_if_schedule_ended(self):
        if self.runtime >= self.totaltime:
            log.info("schedule ended, shutting down")
            log.info("total cost = %s%.2f" % (config.currency_type,self.cost))
            self.abort_run()

    def update_cost(self):
        if self.heat:
            cost = (config.kwh_rate * config.kw_elements) * ((self.heat)/3600)
        else:
            cost = 0
        self.cost = self.cost + cost

    def update_wh(self):
        """Accumulate watt-hours for this zone using the PID duty cycle."""
        duty = self.pid.pidstats.get('out', 0.0) if self.pid.pidstats else 0.0
        # kw_zone (kW) * 1000 = W; * duty * (time_step / 3600) = Wh
        self.wh += config.kw_zone * 1000.0 * duty * (self.time_step / 3600.0)

    def get_state(self):
        temp = 0
        try:
            temp = self.board.temp_sensor.temperature() + self.thermocouple_offset
        except AttributeError as error:
            # this happens at start-up with a simulated oven
            temp = 0
            pass

        # Update runtime to get current elapsed time
        if self.state == "RUNNING":
            self.update_runtime()

        self.set_heat_rate(self.runtime,temp)

        state = {
            'zone': self.zone_id,
            'zone_name': self.zone_name,
            'cost': self.cost,
            'wh': self.wh,
            'runtime': self.runtime,
            'temperature': temp,
            'target': self.target,
            'state': self.state,
            'heat': self.heat,
            'heat_rate': self.heat_rate,
            'totaltime': self.totaltime,
            'kwh_rate': config.kwh_rate,
            'currency_type': config.currency_type,
            'profile': self.profile.name if self.profile else None,
            'pidstats': self.pid.pidstats,
            'catching_up': self.catching_up,
        }
        return state

    def save_state(self):
        with open(self.automatic_restart_state_file, 'w', encoding='utf-8') as f:
            json.dump(self.get_state(), f, ensure_ascii=False, indent=4)

    def state_file_is_old(self):
        '''returns True is state files is older than 15 mins default
                   False if younger
                   True if state file cannot be opened or does not exist
        '''
        if os.path.isfile(self.automatic_restart_state_file):
            state_age = os.path.getmtime(self.automatic_restart_state_file)
            now = time.time()
            minutes = (now - state_age)/60
            if(minutes <= config.automatic_restart_window):
                return False
        return True

    def save_automatic_restart_state(self):
        # only save state if the feature is enabled
        if not config.automatic_restarts == True:
            return False
        try:
            self.save_state()
        except Exception as e:
            log.error("zone %d: failed to save restart state: %s" % (self.zone_id, e))

    def should_i_automatic_restart(self):
        # only automatic restart if the feature is enabled
        if not config.automatic_restarts == True:
            return False
        if self.state_file_is_old():
            duplog.info("automatic restart not possible. state file does not exist or is too old.")
            return False

        with open(self.automatic_restart_state_file) as infile:
            d = json.load(infile)
        if d["state"] != "RUNNING":
            duplog.info("automatic restart not possible. state = %s" % (d["state"]))
            return False
        return True

    def automatic_restart(self):
        with open(self.automatic_restart_state_file) as infile: d = json.load(infile)
        startat = d["runtime"]/60
        filename = "%s.json" % (d["profile"])
        profile_path = os.path.abspath(os.path.join(os.path.dirname( __file__ ), '..', 'storage','profiles',filename))

        log.info("automatically restarting profile = %s at minute = %d" % (profile_path,startat))
        with open(profile_path) as infile:
            profile_json = json.dumps(json.load(infile))
        profile = Profile(profile_json)
        self.run_profile(profile, startat=startat, allow_seek=False)  # We don't want a seek on an auto restart.
        self.cost = d["cost"]
        self.wh = d.get("wh", 0.0)
        time.sleep(1)
        self.ovenwatcher.record(profile)

    def set_ovenwatcher(self,watcher):
        log.info("ovenwatcher set in oven class")
        self.ovenwatcher = watcher

    def force_relay(self, on: bool):
        """Manually toggle the relay. Only permitted when IDLE."""
        if self.state != "IDLE":
            raise ValueError("Cannot manually toggle relay while kiln is not IDLE")
        self.heat = 1.0 if on else 0.0

    @abstractmethod
    def heat_then_cool(self):
        """Drive the heating element for one time step. Implemented by subclasses."""

    def run(self):
        while True:
            try:
                log.debug('Oven running on ' + threading.current_thread().name)
                if self.state == "IDLE":
                    if self.should_i_automatic_restart() == True:
                        self.automatic_restart()
                    time.sleep(1)
                    continue
                if self.state == "PAUSED":
                    self.start_time = self.get_start_time()
                    self.update_runtime()
                    self.update_target_temp()
                    self.heat_then_cool()
                    self.reset_if_emergency()
                    self.reset_if_schedule_ended()
                    continue
                if self.state == "RUNNING":
                    self.update_cost()
                    self.update_wh()
                    self.save_automatic_restart_state()
                    self.kiln_must_catch_up()
                    self.update_runtime()
                    self.update_target_temp()
                    self.heat_then_cool()
                    self.reset_if_emergency()
                    self.reset_if_schedule_ended()
            except Exception as e:
                log.error("zone %d: unhandled exception in run loop, continuing: %s" % (self.zone_id, e), exc_info=True)
                time.sleep(self.time_step)

class SimulatedOven(Oven):

    def __init__(
        self,
        *,
        zone_id=0,
        zone_name=None,
        pid_kp=None,
        pid_ki=None,
        pid_kd=None,
        thermocouple_offset=None,
        automatic_restart_state_file=None,
    ):
        self.board = SimulatedBoard()
        self.t_env = config.sim_t_env
        self.c_heat = config.sim_c_heat
        self.c_oven = config.sim_c_oven
        self.p_heat = config.sim_p_heat
        self.R_o_nocool = config.sim_R_o_nocool
        self.R_ho_noair = config.sim_R_ho_noair
        self.R_ho = self.R_ho_noair
        self.speedup_factor = config.sim_speedup_factor

        # set temps to the temp of the surrounding environment
        self.t = config.sim_t_env  # deg C or F temp of oven
        self.t_h = self.t_env #deg C temp of heating element

        super().__init__(
            zone_id=zone_id,
            zone_name=zone_name,
            pid_kp=pid_kp,
            pid_ki=pid_ki,
            pid_kd=pid_kd,
            thermocouple_offset=thermocouple_offset,
            automatic_restart_state_file=automatic_restart_state_file,
        )

        self.start_time = self.get_start_time();

        # start thread
        self.start()
        log.info("SimulatedOven started")

    # runtime is in sped up time, start_time is actual time of day
    def get_start_time(self):
        return datetime.datetime.now() - datetime.timedelta(milliseconds = self.runtime * 1000 / self.speedup_factor)

    def update_runtime(self):
        runtime_delta = datetime.datetime.now() - self.start_time
        if runtime_delta.total_seconds() < 0:
            runtime_delta = datetime.timedelta(0)

        self.runtime = runtime_delta.total_seconds() * self.speedup_factor

    def update_target_temp(self):
        self.target = self.profile.get_target_temperature(self.runtime)

    def heating_energy(self,pid):
        # using pid here simulates the element being on for
        # only part of the time_step
        self.Q_h = self.p_heat * self.time_step * pid

    def temp_changes(self):
        #temperature change of heat element by heating
        self.t_h += self.Q_h / self.c_heat

        #energy flux heat_el -> oven
        self.p_ho = (self.t_h - self.t) / self.R_ho

        #temperature change of oven and heating element
        self.t += self.p_ho * self.time_step / self.c_oven
        self.t_h -= self.p_ho * self.time_step / self.c_heat

        #temperature change of oven by cooling to environment
        self.p_env = (self.t - self.t_env) / self.R_o_nocool
        self.t -= self.p_env * self.time_step / self.c_oven
        self.temperature = self.t
        self.board.temp_sensor.simulated_temperature = self.t

    def heat_then_cool(self):
        now_simulator = self.start_time + datetime.timedelta(milliseconds = self.runtime * 1000)
        pid = self.pid.compute(self.target,
                               self.board.temp_sensor.temperature() +
                               self.thermocouple_offset, now_simulator)

        heat_on = float(self.time_step * pid)
        heat_off = float(self.time_step * (1 - pid))

        self.heating_energy(pid)
        self.temp_changes()

        # self.heat is for the front end to display if the heat is on
        self.heat = 0.0
        if heat_on > 0:
            self.heat = heat_on

        log.info("simulation: -> %dW heater: %.0f -> %dW oven: %.0f -> %dW env" % (int(self.p_heat * pid),
            self.t_h,
            int(self.p_ho),
            self.t,
            int(self.p_env)))

        time_left = self.totaltime - self.runtime

        try:
            log.info("temp=%.2f, target=%.2f, error=%.2f, pid=%.2f, p=%.2f, i=%.2f, d=%.2f, heat_on=%.2f, heat_off=%.2f, run_time=%d, total_time=%d, time_left=%d" %
                (self.pid.pidstats['ispoint'],
                self.pid.pidstats['setpoint'],
                self.pid.pidstats['err'],
                self.pid.pidstats['pid'],
                self.pid.pidstats['p'],
                self.pid.pidstats['i'],
                self.pid.pidstats['d'],
                heat_on,
                heat_off,
                self.runtime,
                self.totaltime,
                time_left))
        except KeyError:
            pass

        # we don't actually spend time heating & cooling during
        # a simulation, so sleep.
        time.sleep(self.time_step / self.speedup_factor)


class RealOven(Oven):

    def __init__(
        self,
        *,
        zone_id=0,
        zone_name=None,
        spi_cs=None,
        gpio_heat=None,
        gpio_heat_invert=None,
        pid_kp=None,
        pid_ki=None,
        pid_kd=None,
        thermocouple_offset=None,
        automatic_restart_state_file=None,
    ):
        self.board = RealBoard(spi_cs=spi_cs)
        self.output = Output(gpio_heat=gpio_heat, gpio_heat_invert=gpio_heat_invert)

        super().__init__(
            zone_id=zone_id,
            zone_name=zone_name,
            pid_kp=pid_kp,
            pid_ki=pid_ki,
            pid_kd=pid_kd,
            thermocouple_offset=thermocouple_offset,
            automatic_restart_state_file=automatic_restart_state_file,
        )

        # start thread
        self.start()

    def reset(self):
        super().reset()
        self.output.cool(0)

    def force_relay(self, on: bool):
        """Manually toggle the GPIO relay. Only permitted when IDLE."""
        if self.state != "IDLE":
            raise ValueError("Cannot manually toggle relay while kiln is not IDLE")
        if on:
            self.output.heat(0)
            self.heat = 1.0
        else:
            self.output.cool(0)
            self.heat = 0.0

    def heat_then_cool(self):
        pid = self.pid.compute(self.target,
                               self.board.temp_sensor.temperature() +
                               self.thermocouple_offset, datetime.datetime.now())

        heat_on = float(self.time_step * pid)
        heat_off = float(self.time_step * (1 - pid))

        # self.heat is for the front end to display if the heat is on
        self.heat = 0.0
        if heat_on > 0:
            self.heat = 1.0

        if heat_on:
            self.output.heat(heat_on)
        if heat_off:
            self.output.cool(heat_off)
        time_left = self.totaltime - self.runtime
        try:
            log.info("temp=%.2f, target=%.2f, error=%.2f, pid=%.2f, p=%.2f, i=%.2f, d=%.2f, heat_on=%.2f, heat_off=%.2f, run_time=%d, total_time=%d, time_left=%d" %
                (self.pid.pidstats['ispoint'],
                self.pid.pidstats['setpoint'],
                self.pid.pidstats['err'],
                self.pid.pidstats['pid'],
                self.pid.pidstats['p'],
                self.pid.pidstats['i'],
                self.pid.pidstats['d'],
                heat_on,
                heat_off,
                self.runtime,
                self.totaltime,
                time_left))
        except KeyError:
            pass

class Profile():
    def __init__(self, json_data):
        obj = json.loads(json_data)
        self.name = obj["name"]
        self.data = sorted(obj["data"])

    def get_duration(self):
        return max([t for (t, x) in self.data])

    #  x = (y-y1)(x2-x1)/(y2-y1) + x1
    @staticmethod
    def find_x_given_y_on_line_from_two_points(y, point1, point2):
        if point1[0] > point2[0]: return 0  # time2 before time1 makes no sense in kiln segment
        if point1[1] >= point2[1]: return 0 # Zero will crach. Negative temeporature slope, we don't want to seek a time.
        x = (y - point1[1]) * (point2[0] -point1[0] ) / (point2[1] - point1[1]) + point1[0]
        return x

    def find_next_time_from_temperature(self, temperature):
        time = 0 # The seek function will not do anything if this returns zero, no useful intersection was found
        for index, point2 in enumerate(self.data):
            if point2[1] >= temperature:
                if index > 0: #  Zero here would be before the first segment
                    if self.data[index - 1][1] <= temperature: # We have an intersection
                        time = self.find_x_given_y_on_line_from_two_points(temperature, self.data[index - 1], point2)
                        if time == 0:
                            if self.data[index - 1][1] == point2[1]: # It's a flat segment that matches the temperature
                                time = self.data[index - 1][0]
                                break

        return time

    def get_surrounding_points(self, time):
        if time > self.get_duration():
            return (None, None)

        prev_point = None
        next_point = None

        for i in range(len(self.data)):
            if time < self.data[i][0]:
                prev_point = self.data[i-1]
                next_point = self.data[i]
                break

        # time == last data point (end-of-profile hold); return last segment
        if prev_point is None and next_point is None and len(self.data) >= 2:
            prev_point = self.data[-2]
            next_point = self.data[-1]

        return (prev_point, next_point)

    def get_target_temperature(self, time):
        if time > self.get_duration():
            return 0

        (prev_point, next_point) = self.get_surrounding_points(time)

        incl = float(next_point[1] - prev_point[1]) / float(next_point[0] - prev_point[0])
        temp = prev_point[1] + (time - prev_point[0]) * incl
        return temp


class PID():

    def __init__(self, ki=1, kp=1, kd=1):
        self.ki = ki
        self.kp = kp
        self.kd = kd
        self.lastNow = datetime.datetime.now()
        self.iterm = 0
        self.lastErr = 0
        self.pidstats = {}

    # FIX - this was using a really small window where the PID control
    # takes effect from -1 to 1. I changed this to various numbers and
    # settled on -50 to 50 and then divide by 50 at the end. This results
    # in a larger PID control window and much more accurate control...
    # instead of what used to be binary on/off control.
    def compute(self, setpoint, ispoint, now):
        timeDelta = (now - self.lastNow).total_seconds()

        window_size = 100

        error = float(setpoint - ispoint)

        # this removes the need for config.stop_integral_windup
        # it turns the controller into a binary on/off switch
        # any time it's outside the window defined by
        # config.pid_control_window
        icomp = 0
        output = 0
        out4logs = 0
        dErr = 0
        if error < (-1 * config.pid_control_window):
            log.info("kiln outside pid control window, max cooling")
            output = 0
            # it is possible to set self.iterm=0 here and also below
            # but I dont think its needed
        elif error > (1 * config.pid_control_window):
            log.info("kiln outside pid control window, max heating")
            output = 1
            if config.throttle_below_temp and config.throttle_percent:
                if setpoint <= config.throttle_below_temp:
                    output = config.throttle_percent/100
                    log.info("max heating throttled at %d percent below %d degrees to prevent overshoot" % (config.throttle_percent,config.throttle_below_temp))
        else:
            icomp = (error * timeDelta * (1/self.ki))
            self.iterm += (error * timeDelta * (1/self.ki))
            dErr = (error - self.lastErr) / timeDelta
            output = self.kp * error + self.iterm + self.kd * dErr
            output = sorted([-1 * window_size, output, window_size])[1]
            out4logs = output
            output = float(output / window_size)
            
        self.lastErr = error
        self.lastNow = now

        # no active cooling
        if output < 0:
            output = 0

        self.pidstats = {
            'time': time.mktime(now.timetuple()),
            'timeDelta': timeDelta,
            'setpoint': setpoint,
            'ispoint': ispoint,
            'err': error,
            'errDelta': dErr,
            'p': self.kp * error,
            'i': self.iterm,
            'd': self.kd * dErr,
            'kp': self.kp,
            'ki': self.ki,
            'kd': self.kd,
            'pid': out4logs,
            'out': output,
        }

        return output
