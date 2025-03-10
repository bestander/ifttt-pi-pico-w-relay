# Pico Internet Poll Relay

A MicroPython project for Raspberry Pi Pico W that polls an internet endpoint and controls a relay based on the response, with automatic timeout and cooldown functionality. The system uses a Cloudflare Worker as an intermediary and can be triggered via Gmail or web interface, with automatic 1-minute timeout and time-based restrictions.

## System Architecture

```
Gmail/Web UI -> Cloudflare Worker -> Pico W -> Relay
```

### Cloudflare Worker
- Acts as a secure intermediary between triggers and the Pico W
- Maintains the relay state and handles automatic timeout
- Provides a web interface for manual control and monitoring
- Enforces time-based restrictions (11 PM - 7 AM EST only)
- Automatically turns off relay after 1 minute
- Endpoints:
  - `/` - Web interface for control and monitoring
  - `/poll` - Returns current relay state ("on" or "off")
  - `/trigger_on` - Activates the relay
  - `/trigger_off` - Deactivates the relay
  - `/status` - Returns current state and system status
  - `/history` - Returns trigger history

### Web Interface Features
- Real-time relay state monitoring
- Last poll time display
- Separate ON and OFF buttons (active only during allowed hours)
- Countdown display showing time until auto-off
- Trigger history with timestamps and sources
- Auto-updates every 5 seconds
- Mobile-friendly responsive design
- Clear indication of time restrictions

### Gmail Hook Integration
- Monitor specific Gmail labels or emails
- When a matching email arrives:
  - Sends a request to the appropriate Cloudflare Worker endpoint
  - Can be configured to trigger on specific email subjects or content
- Example triggers:
  - Email with subject "Turn On Relay" -> Calls `/trigger_on`
  - Email with subject "Turn Off Relay" -> Calls `/trigger_off`

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
       'check_interval': 1,  # How often to check state (seconds)
       'cooldown_period': 900  # Minimum time between activations (15 minutes)
   }
   ```

## Operation Rules

### Time Restrictions
- The relay can only be activated between 11 PM and 7 AM EST
- Attempts to trigger outside these hours will be rejected
- Time restrictions apply to both web interface and Gmail triggers

### Automatic Control
- Relay turns OFF automatically after 1 minute of being ON
- Timer starts when relay is turned ON
- Timer resets if relay is turned ON while already ON
- Turning relay OFF manually cancels the auto-off timer
- Auto-off events are logged in history as "Auto Off"

### System Flow
1. User triggers relay via web interface or Gmail
2. System checks if within allowed hours (11 PM - 7 AM EST)
3. If allowed:
   - Relay activates
   - 1-minute auto-off timer starts
   - Event is logged in history
   - Web interface shows countdown
4. Automatic deactivation after:
   - 1-minute timeout expires
   - "off" command received
   - Time window ends

## Troubleshooting

If you experience issues:
1. Check your WiFi credentials for all configured networks
2. Ensure at least one configured network is within range
3. Ensure the relay is properly connected to the configured GPIO pin
4. Verify the `active_high` setting matches your relay module's requirements
5. Check the serial output for error messages and connection attempts
6. Verify current time is within allowed hours (11 PM - 7 AM EST)
7. Check web interface history for trigger attempts and results
8. Monitor auto-off countdown in web interface
9. Ensure cooldown period has elapsed since last activation 