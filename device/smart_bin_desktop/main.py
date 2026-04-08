import sys
from PyQt6.QtWidgets import QApplication

from src.services.detection_worker import DetectionWorker
from src.viewmodels.main_viewmodel import MainViewModel
from src.views.main_window import MainWindow

def main():
    app = QApplication(sys.argv)
    
    # 1. Khởi tạo Service (Luồng ngầm chạy Camera & AI)
    worker = DetectionWorker()
    
    # 2. Khởi tạo ViewModel (Truyền Worker vào)
    viewmodel = MainViewModel(worker)
    
    # 3. Khởi tạo View (Truyền ViewModel vào)
    window = MainWindow(viewmodel)
    window.show()
    
    # 4. Bắt đầu hệ thống
    viewmodel.start_system()
    
    sys.exit(app.exec())
    
if __name__ == '__main__':
    main()