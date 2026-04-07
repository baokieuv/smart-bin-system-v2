import random

class MainController:
    def __init__(self):
        pass
    
    def read_sensor_data(self):
        temp = random.uniform(20.0, 60.0)
        return f"{temp:.1f} °C"