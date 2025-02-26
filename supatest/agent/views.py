from __future__ import annotations

from typing import Type, Optional, List

from pydantic import BaseModel, Field, create_model

from browser_use.agent.views import (
    AgentBrain,
    AgentHistory,
    AgentOutput,
    AgentHistoryList,
)
from supatest.controller.registry.views import SupatestActionModel


class SupatestAgentBrain(AgentBrain):
    """Extended version of AgentBrain that includes page_summary"""
    page_summary: str = Field(default="", description="Summary of the current page state")
    evaluation_previous_goal: str = Field(default="", description="Evaluation of previous goal")
    memory: str = Field(default="", description="Agent's memory/context")
    next_goal: str = Field(default="", description="Next goal to achieve")
    thought: Optional[str] = Field(default=None, description="Current thought process")


class SupatestAgentOutput(AgentOutput):
    """Extended AgentOutput with custom implementation"""
    
    current_state: SupatestAgentBrain  # Use our custom AgentBrain
    action: list[SupatestActionModel] = Field(
        ...,
        description='List of actions to execute',
        json_schema_extra={'min_items': 1},
    )

    @staticmethod
    def type_with_custom_actions(custom_actions: Type[SupatestActionModel]) -> Type['SupatestAgentOutput']:
        """Extend actions with custom actions"""
        return create_model(
            'SupatestAgentOutput',
            __base__=SupatestAgentOutput,
            action=(list[custom_actions], Field(...)),  # Properly annotated field with no default
            __module__=SupatestAgentOutput.__module__,
        )
    
    def __str__(self) -> str:
        return f"SupatestAgentOutput(current_state={self.current_state}, action={self.action})"


class SupatestAgentHistory(AgentHistory):
    """Extended AgentHistory that uses our custom AgentOutput"""
    
    model_output: SupatestAgentOutput | None

    class Config:
        arbitrary_types_allowed = True

class SupatestAgentHistoryList(AgentHistoryList):
    """List of agent history items"""

    history: list[SupatestAgentHistory]
    
    def model_thoughts(self) -> list[SupatestAgentBrain]:
        """Get all thoughts from history"""
        return [h.model_output.current_state for h in self.history if h.model_output]


# Re-export other classes that we're not modifying
__all__ = [
    'SupatestAgentBrain',
    'SupatestAgentOutput',
    'SupatestAgentHistory',
    'SupatestAgentHistoryList',
] 