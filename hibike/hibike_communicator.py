"""
   This library contains a set of functions that allow the user to manually send and recieve  messages to and from a device by calling functions
"""

import hibike_message as hm
import hibike_process as hp
import multiprocessing
import threading
from queue import Empty

class HibikeCommunicator:
  
   def __init__(self):
      """
          Set up the pipes for communication between the device and the Beegle Bum Black, creates a thread to recieve communications from the device, and starts up the process that runs the communication
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

   def process_output(self):
      """
         Prints out messages from the devices that are uploaded by newProcess to stateQueue
         If it's a subscription response from a device whose uid is not in self.uids, the uid will be added to self.uids
         If it's a device disconnection from a device whose uid in self.uids, the uid will be removed from self.uids
      """
      while True:
         try:
            output = self.stateQueue.get_nowait()
         except Empty:
            continue
         print(output)
      
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
