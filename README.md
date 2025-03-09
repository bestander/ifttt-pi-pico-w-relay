# Pico Internet Poll Relay

A MicroPython project for Raspberry Pi Pico W that polls an internet endpoint and controls a relay based on the response, with automatic timeout and cooldown functionality.

## Hardware Requirements

- Raspberry Pi Pico W
- Relay module (connected to GPIO 16 by default)
- Jumper wires

## Setup

1. Install the latest MicroPython firmware on your Pico W
2. Copy the following files to your Pico W:
   - `main.py` - Main program
   - `config.py` - Configuration settings (WiFi credentials)
   - `boot.py` - Boot configuration (optional)

## Configuration

1. Edit `config.py` with your WiFi credentials. You can configure multiple networks for failover:
   ```python
   WIFI_CONFIGS = [
       {
           'ssid': 'Primary_Network',
           'password': 'primary_password'
       },
       {
           'ssid': 'Backup_Network',
           'password': 'backup_password'
       }
   ]
   ```

2. Configure the relay settings in `config.py`:
   ```python
   PIN_CONFIG = {
       'relay': 16,  # GPIO pin number for relay
       'active_high': True,  # Set to True if relay activates on HIGH
       'on_duration': 300,  # Duration in seconds to keep relay ON
       'check_interval': 1,  # How often to check timeout (seconds)
       'cooldown_period': 900  # Minimum time between activations (15 minutes)
   }
   ```

3. Adjust WiFi connection behavior (optional):
   ```python
   API_CONFIG = {
       'wifi_max_attempts': 10,  # attempts per network before moving to next
       'wifi_attempt_delay': 1   # seconds between attempts
   }
   ```

## How it Works

The program:
1. Attempts to connect to configured WiFi networks in sequence:
   - Tries each network up to the configured maximum attempts
   - Cycles through all networks until a connection is established
   - Automatically reconnects if connection is lost
2. Continuously polls the specified endpoint every 5 seconds
3. Controls the relay based on the response, timing, and cooldown:
   - "on" activates the relay for 5 minutes (if not in cooldown)
   - Each new "on" signal extends the active time by 5 minutes
   - "off" deactivates the relay immediately
   - Relay automatically turns off after 5 minutes if no new "on" signal
4. Relay Control Logic:
   - Enforces 15-minute cooldown between activations
   - Ignores "on" signals during cooldown period
   - Stays ON for 5 minutes after activation
   - Timer extends with each new "on" signal
   - Turns OFF immediately on "off" signal
   - Turns OFF automatically after timeout

## Troubleshooting

If you experience issues:
1. Check your WiFi credentials for all configured networks
2. Ensure at least one configured network is within range
3. Ensure the relay is properly connected to the configured GPIO pin
4. Verify the `active_high` setting matches your relay module's requirements
5. Check the serial output for error messages, connection attempts, and cooldown status 