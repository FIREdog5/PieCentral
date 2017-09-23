
import sys
import Goal


class Shepherd:

    def __init__(self, matchNumber):
        '''
        Initializes all of the state needed to maintain the current status of elements on the field
        '''

        #The following are elements that are expected to exist in every iteration of the game
        self.UI = UI()
        self.schedule = Schedule()
        self.matchTimer = Timer()
        teams = self.schedule.getTeams(matchNumber)
        self.alliances= {'blue': Alliance(teams[0], teams[1]), 'gold': Alliance(teams[2], teams[3])}
        self.currentStage = 0

        #The follwing are elements that are configured
        specifically for the 2018 year game - Solar Scramble
        self.goals = {'a': Goal(),'b': Goal(),'c': Goal(),'d': Goal(),'e': Goal()}

        self.goalTimers = {'a': Timer(),'b': Timer(),'c': Timer(),'d': Timer(),'e': Timer()}
        self.decodeTimers = {'steal': Timer(), 'double': Timer(), 'zero': Timer()}
        self.bidTimers = {'a': Timer(),'b': Timer(),'c': Timer(),'d': Timer(),'e': Timer()}
        self.sensors = Sensors()

    Things to receive:
        UI_Commands from field control:
            Start_Match
            Start_Auto
            Start_Telop
            Reset_Match
            Reset_Stage
            reset_lcm (optional)
        Button_Commands from bidding station:
            Bid on [Goal X] from [Alliance A]
        FromSensors:
            Ball scored in [Goal X] on [Alliance A]
            Code received from [Goal X] on [Alliance A]
        FromTimers:
            WhatTimerItIs, CurrentTimeReamining
            ChangeMatchState (for MatchTimers)
            ChangeGoalState (for GoalTimers)
            ChangeMultiplierState (for GoalMultipliers)
        FromDriverStation:
            Robot State (connected, disconnected, teleop, auto)

def read_from_bidding(self, alliance_name, goal_name):

    lookup current bid on goal 
    lookup next value to bid on goal
    find the previous bidder 
    if alliance_name is the same as revious bidder or alliance_name money less than bid cost 
        can not bid 
    are they allowed to bid
        check they werent the last team to bid
        check do they have enough money
    store current bid to old bid field 
    store new bid into current bid field
    give back the number that is the current bid 

    self.alliances[alliance_name] 


def main():
    while True:
        msg = read()
        msg - > fn()
    shepherd = Shepherd(sys.argv[0])
    shepherd.waitGameStart()
    shepherd.autoLoop()
    shepherd.teleopLoop()
    shepherd.gameEnd()
    shepherd.exportScore(sys.argv[0])

if __name__ == '__main__':
    main()
