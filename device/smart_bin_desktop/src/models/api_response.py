from dataclasses import dataclass
from typing import Generic, TypeVar, Optional, Type, Any

T = TypeVar('T') 

@dataclass
class ApiResponseFormat(Generic[T]):
    timestamp: int
    success: bool
    code: str
    message: str
    trace_id: Optional[str] = None
    data: Optional[T] = None

    @classmethod
    def from_dict(cls, data: dict, details_class: Type[T] = None) -> 'ApiResponseFormat[T]':
    
        details_data = data.get("data")
        
        parsed_details = None
        if details_class and details_data:
            parsed_details = details_class.from_dict(details_data) 
        else:
            parsed_details = details_data 

        return cls(
            trace_id=data.get("traceId"),
            timestamp=data.get("timestamp", 0),
            success=data.get("success", False),
            code=str(data.get("code", "")),
            message=data.get("message", ""),
            data=parsed_details
        )