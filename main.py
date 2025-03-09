import network
import urequests
import time
from machine import Pin, Timer
import gc
from config import WIFI_CONFIGS, API_CONFIG, PIN_CONFIG

def try_wifi_connect(wlan, ssid, password):
    """
    Attempt to connect to a specific WiFi network
    Returns True if connected, False otherwise
    """
    try:
        print(f"Attempting to connect to {ssid}...")
        wlan.connect(ssid, password)
        
        # Wait for connection with timeout
        max_wait = 10
        while max_wait > 0:
            if wlan.status() < 0 or wlan.status() >= 3:
                break
            max_wait -= 1
            print("Waiting for connection...")
            time.sleep(API_CONFIG['wifi_attempt_delay'])
        
        if wlan.status() == 3:  # Status 3 means connected
            status = wlan.ifconfig()
            print(f"Connected to {ssid}. IP: {status[0]}")
            return True
            
    except Exception as e:
        print(f"Failed to connect to {ssid}: {e}")
    
    return False

def connect_wifi():
    """
    Attempt to connect to WiFi networks in a cycle until successful
    Returns connected WLAN interface or raises RuntimeError
    """
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    
    while True:  # Keep trying networks until connected
        for wifi_config in WIFI_CONFIGS:
            ssid = wifi_config['ssid']
            password = wifi_config['password']
            
            # Try each network up to max_attempts times
            for attempt in range(API_CONFIG['wifi_max_attempts']):
                print(f"\nTrying {ssid} (Attempt {attempt + 1}/{API_CONFIG['wifi_max_attempts']})")
                
                if try_wifi_connect(wlan, ssid, password):
                    return wlan
                
                # If not connected, disconnect before next attempt
                if wlan.isconnected():
                    wlan.disconnect()
                time.sleep(API_CONFIG['wifi_attempt_delay'])
        
        print("\nFailed to connect to any network, starting cycle again...")
        time.sleep(2)  # Wait a bit before starting the cycle again

class RelayController:
    def __init__(self, pin_number):
        self.relay = Pin(pin_number, Pin.OUT)
        self.turn_off_time = None
        self.is_on = False
    
    def turn_on(self):
        """Turn on the relay and start the timeout timer"""
        output_state = True if PIN_CONFIG['active_high'] else False
        self.relay.value(output_state)
        self.turn_off_time = time.time() + PIN_CONFIG['on_duration']
        self.is_on = True
        print(f"Relay ON (will turn off in {PIN_CONFIG['on_duration']} seconds)")
    
    def turn_off(self):
        """Turn off the relay and clear the timeout"""
        output_state = False if PIN_CONFIG['active_high'] else True
        self.relay.value(output_state)
        self.turn_off_time = None
        self.is_on = False
        print("Relay OFF")
    
    def check_timeout(self):
        """Check if it's time to turn off the relay"""
        if self.is_on and self.turn_off_time and time.time() >= self.turn_off_time:
            self.turn_off()
            return True
        return False

def main():
    # Initialize relay controller
    relay = RelayController(PIN_CONFIG['relay'])
    # Ensure relay starts in OFF state
    relay.turn_off()
    
    # Connect to WiFi
    try:
        wlan = connect_wifi()
    except Exception as e:
        print(f"Critical WiFi error: {e}")
        return
    
    print("Starting main loop...")
    last_check_time = 0
    
    while True:
        try:
            current_time = time.time()
            
            # Check if relay needs to be turned off
            if relay.is_on:
                relay.check_timeout()
                # When relay is on, just wait for timeout
                time.sleep(PIN_CONFIG['check_interval'])
                continue
            
            # Only poll the URL if the relay is off and it's time to check
            if current_time - last_check_time >= API_CONFIG['poll_interval']:
                # Free up memory before making request
                gc.collect()
                
                # Make request
                response = urequests.get(API_CONFIG['poll_url'])
                state = response.text
                print(f"State: {state}")
                
                # Control relay based on response
                if state == "on" and not relay.is_on:
                    relay.turn_on()
                elif state == "off" and relay.is_on:
                    relay.turn_off()
                
                # Clean up
                response.close()
                last_check_time = current_time
            
            time.sleep(PIN_CONFIG['check_interval'])
            
        except OSError as e:
            print(f"Network error: {e}")
            # Try to reconnect to WiFi if connection is lost
            if not wlan.isconnected():
                try:
                    wlan = connect_wifi()  # Try to reconnect using the cycling strategy
                except Exception as e:
                    print(f"Failed to reconnect: {e}")
        except Exception as e:
            print(f"Error: {e}")
            
        # Always maintain the check interval
        time.sleep(PIN_CONFIG['check_interval'])

if __name__ == "__main__":
    main() 