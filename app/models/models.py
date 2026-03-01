from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class EmailRecord(BaseModel):
    id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    subject: str
    to_email: str
    opened_count: int = 0
    first_opened_at: Optional[datetime] = None
    last_opened_at: Optional[datetime] = None

class RegisterEmail(BaseModel): 
    uuid: str 
    subject: str 
    to: str