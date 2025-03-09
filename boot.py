# This file is executed on every boot (including wake-boot from deepsleep)
import machine
import time

# Initialize onboard LED for status indication
onboard_led = machine.Pin("LED", machine.Pin.OUT)

# Blink the onboard LED to indicate boot
for _ in range(3):
    onboard_led.on()
    time.sleep(0.1)
    onboard_led.off()
    time.sleep(0.1)

# You can add more boot configuration here if needed 