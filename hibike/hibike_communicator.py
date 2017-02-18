"""
   This library contains a set of functions that allow the user to manually send and recieve  messages to and from a device by calling functions
"""

import hibike_message as hm
import hibike_process as hp
import multiprocessing
import threading
import time

class HibikeCommunicator:
  
   def __init__(self):
      """
          Set up the pipes for communication between the device and the Beegle Bum Black, creates a thread to recieve communications from the device, starts up the process that runs the communication, and sets up a dictionary that caches all device values sent to it.
      """
      
      # This block creates the pipes
      self.pipeToChild, pipeFromChild = multiprocessing.Pipe()
      
      # This block creates the process
      badThingsQueue = multiprocessing.Queue()
      self.stateQueue = multiprocessing.Queue()
      newProcess = multiprocessing.Process(target=hp.hibike_process, name="hibike_sim", args=[badThingsQueue,self.stateQueue, pipeFromChild])
      newProcess.daemon = True
      newProcess.start()
      self.pipeToChild.send(["enumerate_all", []])
      
      # Creates the list of uids
      self.uids = set()
      
      # This block creates the thread
      outThread =  threading.Thread(target = self.process_output)
      outThread.start()
   
      # Create the device values dictionary cache
      self.device_values_cache = {}

   def process_output(self):
      """
         Prints out messages from the devices that are uploaded by newProcess to stateQueue
         If it's a subscription response from a device whose uid is not in self.uids, the uid will be added to self.uids
         If it's a device disconnection from a device whose uid in self.uids, the uid will be removed from self.uids
      """
      while True:
         output = self.stateQueue.get()
         
         #Now, get or remove the uid if it is appropriate to do so
        
         print(output)
         command = output[0]
         print(command)
         if command == "device_subscribed":
            uid = output[1][0]
            if uid not in self.uids:
               self.uids.add(uid)
         if command == "device_disconnected":
            uid = output[1]
            if uid in self.uids:
               self.uids.remove(uid)
   #Planned and incomplete caching code
   """
         #If it is a device value, cache it in the dictionary.
         if command == "device_values":
             param_and_value_timestamps = {}
                 for data_tuple in output[1]:
                     param_and_value_timestamps.update({data_tuple[0] : })
             self.device_values_cache.update({uid : {})
   """
   
   def get_uids_and_types(self):
      """
         Returns a list of tuples of all of the uids of all devices that the HibikeCommunicator talks to
         Tuple structure: (uid, device type name)
      """
      list = []
      print(self.uids)
      for uid in self.uids:
         list.append((uid, hm.uid_to_device_name(uid)))
      return list

   def write(self, uid, params_and_values):
       """
          Sends a Device Write to a device

          uid - the device's uid
          params_and_values - an iterable of param (name, value) tuples
       """
       self.pipeToChild.send(["write_params", [uid, params_and_values]])
   
   def read(self, uid, params): 
        """
           Sends a Device Read to a device
        
           uid - the device's uid
           params - an iterable of the names of the params to be read
        """
        self.pipeToChild.send(["read_params", [uid, params]])
        
   def subscribe(self, uid, delay, params):
        """
           Subscribes to the device
           
           uid - the device's uid
           delay - the delay between device datas to be sent
           params - an iterable of the names of the params to be subscribed to
        """
        self.pipeToChild.send(["subscribe_device", [uid, delay, params]])

##############
#  TESTING   #
##############
def device_comms(uid_type_tuple):
   """
        Given a subscribed-to device's UID and type, gives it several orders
        
        uid_type_tuple: a tuple that looks like this: (UID, device type)
   """
   uid = uid_type_tuple[0]
   type = uid_type_tuple[1]
   
   
   if type == "LimitSwitch":
      comms.subscribe(uid, 10, ["switch0", "switch1", "switch2", "switch3"])
      while True:
         comms.read(uid, ["switch0", "switch1", "switch2", "switch3"])
         comms.read(uid, ["switch0", "switch1", "switch2"])
         comms.read(uid, ["switch0", "switch1"])
         time.sleep(5)

   elif type == "LineFollower":
      comms.subscribe(uid, 10, ["left", "center", "right"])
      while True:
         comms.read(uid, ["left", "center", "right"])
         time.sleep(0.3)
         comms.read(uid, ["left", "center"])
         time.sleep(0.3)
         comms.read(uid, ["left"])
         time.sleep(5)

   elif type == "Potentiometer":
      comms.subscribe(uid, 10, ["pot0" , "pot1", "pot2", "pot3"])
      while True:
         comms.read(uid, ["pot0" , "pot1", "pot2", "pot3"])
         time.sleep(0.3)
         comms.read(uid, ["pot0" , "pot1", "pot2"])
         time.sleep(0.3)
         comms.read(uid, ["pot0" , "pot1"])
         time.sleep(5)

   elif type == "Encoder":
      comms.subscribe(uid, 10, ["rotation"])
      while True:
         comms.read(uid, ["rotation"])
         time.sleep(0.3)
         comms.read(uid, ["rotation"])
         time.sleep(0.3)
         comms.read(uid, ["rotation"])
         time.sleep(5)

   elif type == "BatteryBuzzer":
      comms.subscribe(uid, 10, ["cell1", "cell2", "cell3", "callibrate"])
      while True:
         comms.read(uid, ["cell2"])
         time.sleep(0.3)
         comms.write(uid, ("callibrate", True))
         time.sleep(0.3)
         comms.write(uid, ("callibrate", False))
         time.sleep(5)

   elif type == "TeamFlag":
      comms.subscribe(uid, 10, ["led1", "led2", "led3", "led4", "blue", "yellow"])
      while True:
         comms.write(uid, [("led1", 2), ("led2", 2), ("led3", 1), ("led4", 2), ("blue", 2), ("yellow", 2)])
         time.sleep(0.3)
         comms.read(uid, ["led3", "yellow"])
         time.sleep(0.3)
         comms.write(uid, [("led1", 1), ("led2", 0), ("led3", 0), ("led4", 0), ("blue", 0), ("yellow", 0)])
         time.sleep(5)

   elif type == "YogiBear":
      comms.subscribe(uid, 10, ["duty", "forward"])
      while True:
         comms.write(uid, [("duty", 100),  ("forward", False)])
         time.sleep(0.3)
         comms.read(uid, ["forward"])
         time.sleep(0.3)
         comms.write(uid, [("duty", 50),  ("forward", True)])
         time.sleep(5)

   elif type == "ServoControl":
      comms.subscribe(uid, 10, ["servo0", "enable0", "servo1", "enable1", "servo2", "enable2", "servo3", "enable3"])
      while True:
         comms.write(uid, [("servo0", 3), ("enable0", False), ("servo1", 3), ("enable1", False), ("servo2", 3), ("enable2", True), ("servo3", 3), ("enable3", False)])
         time.sleep(0.3)
         comms.read(uid, ["servo0", "enable0"])
         time.sleep(0.3)
         comms.write(uid, [("servo0", 1), ("enable0", True), ("servo1", 26), ("enable1", True), ("servo2", 30), ("enable2", False), ("servo3", 17), ("enable3", True)])
         time.sleep(5)

   elif type == "ExampleDevice":
      comms.subscribe(uid, 10, ["kumiko", "hazuki", "sapphire", "reina", "asuka", "haruka", "kaori", "natsuki", "yuko", "mizore", "nozomi", "shuichi", "takuya", "riko", "aoi", "noboru"])
      while True:
         comms.write(uid, [("kumiko", True), ("hazuki", 19), ("sapphire", 12), ("reina", 210), ("asuka", 105), ("haruka", 1005), ("kaori", 551), ("natsuki", 18002), ("yuko", 9001), ("mizore", 6.45), ("nozomi", 33.2875), ("takuya", 331), ("aoi", 7598)])
         time.sleep(0.3)
         comms.read(uid, ["kumiko", "hazuki", "mizore", "riko", "noboru"])
         time.sleep(0.3)
         comms.write(uid, [("kumiko", False), ("hazuki", 0), ("sapphire", 0), ("reina", 0), ("asuka", 0), ("haruka", 0), ("kaori", 0), ("natsuki", 0), ("yuko", 0), ("mizore", 0.0), ("nozomi", 0.0), ("takuya", 0), ("aoi", 0)])
         time.sleep(5)

if __name__ == "__main__":
    
   comms = HibikeCommunicator()
   time.sleep(3)
            
   device_info = comms.get_uids_and_types()
   print(device_info)
        
   # For each device, start a thread that calls the device_comms function
   for uid_type_tuple in device_info:
      process_thread = threading.Thread(target = device_comms, args = uid_type_tuple)
      process_thread.start()

