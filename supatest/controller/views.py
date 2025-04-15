from typing import Optional
from pydantic import BaseModel, Field
import uuid

# Action Input Models
class GoToUrlAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')

class GoBackAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')

class WaitAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    seconds: int = 3
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')

class ClickElementAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    index: int
    xpath: Optional[str] = None
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')
    locator: Optional[str] = None
    allUniqueLocators: Optional[list[dict]] = None

class InputTextAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    index: int
    text: str
    xpath: Optional[str] = None
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')
    locator: Optional[str] = None
    allUniqueLocators: Optional[list[dict]] = None

class DoneAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    success: bool
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')

class SwitchTabAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    page_id: int
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')

class OpenTabAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')

class ScrollAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    amount: Optional[int] = None  # The number of pixels to scroll. If None, scroll down/up one page
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')

class SendKeysAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    keys: str
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')

class SelectDropdownOptionAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    index: int
    text: str
    xpath: Optional[str] = None
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')
    locator: Optional[str] = None
    allUniqueLocators: Optional[list[dict]] = None

class GetDropdownOptionsAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    index: int
    xpath: Optional[str] = None
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')

class NoParamsAction(BaseModel):
    """
    Accepts absolutely anything in the incoming data
    and discards it, so the final parsed model is empty.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')
    
    
class Position(BaseModel):
    x: int
    y: int

class DragDropAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: Optional[str] = Field(None, description="Human readable description of what this action does")
    isExecuted: str = Field(default='pending')
    
    # Element-based approach
    element_source: Optional[str] = Field(None, description='CSS selector or XPath of the element to drag from')
    element_target: Optional[str] = Field(None, description='CSS selector or XPath of the element to drop onto')
    element_source_offset: Optional[Position] = Field(
		None, description='Precise position within the source element to start drag (in pixels from top-left corner)'
	)
    element_target_offset: Optional[Position] = Field(
		None, description='Precise position within the target element to drop (in pixels from top-left corner)'
	)

	# Coordinate-based approach (used if selectors not provided)
    coord_source_x: Optional[int] = Field(None, description='Absolute X coordinate on page to start drag from (in pixels)')
    coord_source_y: Optional[int] = Field(None, description='Absolute Y coordinate on page to start drag from (in pixels)')
    coord_target_x: Optional[int] = Field(None, description='Absolute X coordinate on page to drop at (in pixels)')
    coord_target_y: Optional[int] = Field(None, description='Absolute Y coordinate on page to drop at (in pixels)')

	# Common options
    steps: Optional[int] = Field(10, description='Number of intermediate points for smoother movement (5-20 recommended)')
    delay_ms: Optional[int] = Field(5, description='Delay in milliseconds between steps (0 for fastest, 10-20 for more natural)')
