import can

print("Detecting GS_USB configs...")
configs = can.detect_available_configs(["gs_usb"])
print(configs)

print("Opening bus...")
bus = can.Bus(interface="gs_usb", channel=0, bitrate=500000)

print("Bus opened successfully")
print(bus)

bus.shutdown()
print("Closed successfully")