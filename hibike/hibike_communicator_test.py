"""
   This program tests hibike_communicator.py
"""

import hibike_communicator as hc
import hibike_message as hm
import time

comms = hc.HibikeCommunicator()
time.sleep(1)

device_info = comms.get_uids_and_types()
print(device_info)
uid = device_info[0][0]
type = device_info[0][1]

if type == "LimitSwitch":
   comms.subscribe(uid, 10, ["switch0", "switch1", "switch2", "switch3"])
   comms.read(uid, ["switch0", "switch1", "switch2", "switch3"])

elif type == "LineFollower":
   comms.subscribe(uid, 10, ["left", "center", "right"])
   comms.read(uid, ["left", "center", "right"])

elif type == "Potentiometer":
   comms.subscribe(uid, 10, ["pot0" , "pot1", "pot2", "pot3"])
   comms.read(uid, ["pot0" , "pot1", "pot2", "pot3"])

elif type == "Encoder":
   comms.subscribe(uid, 10, ["rotation"])
   comms.read(uid, ["rotation"])

elif type == "BatteryBuzzer":
   comms.subscribe(uid, 10, ["cell1", "cell2", "cell3", "callibrate"])
   comms.read(uid, ["cell1", "cell2", "cell3"])
   comms.write(uid, ("callibrate", True)) #Recommended: swap True with False after testing once

elif type == "TeamFlag":
   comms.subscribe(uid, 10, ["led1", "led2", "led3", "led4", "blue", "yellow"])
   comms.read(uid, ["led1", "led2", "led3", "led4", "blue", "yellow"])
   comms.write(uid, [("led1", 1), ("led2", 0), ("led3", 0), ("led4", 0), ("blue", 0), ("yellow", 0)])
               #Recommended: try changing the write values after each test
   comms.read(uid, ["led1", "led2", "led3", "led4", "blue", "yellow"])
               
elif type == "YogiBear":
   comms.subscribe(uid, 10, ["duty", "forward"])
   comms.read(uid, ["duty", "forward"])
   comms.write(uid, [("duty", 50),  ("forward", True)]) #Recommended: try changing the values after each test
   comms.read(uid, ["duty", "forward"])
               
elif type == "ServoControl":
   comms.subscribe(uid, 10, ["servo0", "enable0", "servo1", "enable1", "servo2", "enable2", "servo3", "enable3"])
   comms.read(uid, ["servo0", "enable0", "servo1", "enable1", "servo2", "enable2", "servo3", "enable3"])
   comms.write(uid, [("servo0", 1), ("enable0", True), ("servo1", 26), ("enable1", True), ("servo2", 30), ("enable2", False), ("servo3", 17), ("enable3", True)])
   comms.read(uid, ["servo0", "enable0", "servo1", "enable1", "servo2", "enable2", "servo3", "enable3"])

               
elif type == "ExampleDevice":
   comms.subscribe(uid, 10, ["kumiko", "hazuki", "sapphire", "reina", "asuka", "haruka", "kaori", "natsuki", "yuko", "mizore", "nozomi", "shuichi", "takuya", "riko", "aoi", "noboru"])
   comms.read(uid, ["kumiko", "hazuki", "sapphire", "reina", "asuka", "haruka", "kaori", "natsuki", "yuko", "mizore", "nozomi", "shuichi", "riko", "noboru"])
   comms.write(uid, [("kumiko", True), ("hazuki", 19), ("sapphire", 12), ("reina", 210), ("asuka", 105), ("haruka", 1005), ("kaori", 551), ("natsuki", 18002), ("yuko", 9001), ("mizore", 6.45), ("nozomi", 33.2875), ("takuya", 331), ("aoi", 7598)]) # Recommended: try switching around the values
   comms.read(uid, ["kumiko", "hazuki", "sapphire", "reina", "asuka", "haruka", "kaori", "natsuki", "yuko", "mizore", "nozomi", "shuichi", "riko", "noboru"])

time.sleep(10)
