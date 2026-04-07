import sys
from PyQt6.QtWidgets import QApplication

from src.controllers.main_ctrl import MainController
from src.views.main_window import MainWindow

def main():
    app = QApplication(sys.argv)
    
    controller = MainController()
    
    window = MainWindow(controller)
    
    window.show()
    
    sys.exit(app.exec())
    
if __name__ == '__main__':
    main()