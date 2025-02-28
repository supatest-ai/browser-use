from typing import Optional, Union, Literal

from pydantic import BaseModel, model_validator, Field

# Action Input Models
class GoToUrlAction(BaseModel):
    url: str
    title: Optional[str] = Field(None, description="Human readable description of what this action does")

class GoBackAction(BaseModel):
    title: Optional[str] = Field(None, description="Human readable description of what this action does")


class ClickElementAction(BaseModel):
    index: int
    xpath: Optional[str] = None
    supatest_locator_id: Optional[str] = None
    title: Optional[str] = Field(None, description="Human readable description of what this action does")


class InputTextAction(BaseModel):
    index: int
    text: str
    xpath: Optional[str] = None
    supatest_locator_id: Optional[str] = None
    title: Optional[str] = Field(None, description="Human readable description of what this action does")


class DoneAction(BaseModel):
    text: str
    success: bool
    title: Optional[str] = Field(None, description="Human readable description of what this action does")


class SwitchTabAction(BaseModel):
    page_id: int
    title: Optional[str] = Field(None, description="Human readable description of what this action does")


class OpenTabAction(BaseModel):
    url: str
    title: Optional[str] = Field(None, description="Human readable description of what this action does")


class ScrollAction(BaseModel):
    amount: Optional[int] = None  # The number of pixels to scroll. If None, scroll down/up one page
    title: Optional[str] = Field(None, description="Human readable description of what this action does")


class SendKeysAction(BaseModel):
    keys: str
    title: Optional[str] = Field(None, description="Human readable description of what this action does")


class SelectDropdownOptionAction(BaseModel):
    index: int
    text: str
    xpath: Optional[str] = None
    supatest_locator_id: Optional[str] = None
    title: Optional[str] = Field(None, description="Human readable description of what this action does")


class GetDropdownOptionsAction(BaseModel):
    index: int
    xpath: Optional[str] = None
    supatest_locator_id: Optional[str] = None
    title: Optional[str] = Field(None, description="Human readable description of what this action does")


class NoParamsAction(BaseModel):
    """
    Accepts absolutely anything in the incoming data
    and discards it, so the final parsed model is empty.
    """
    title: Optional[str] = Field(None, description="Human readable description of what this action does")

    @model_validator(mode='before')
    def ignore_all_inputs(cls, values):
        # No matter what the user sends, discard it and return empty.
        return {}

    class Config:
        # If you want to silently allow unknown fields at top-level,
        # set extra = 'allow' as well:
        extra = 'allow'



