from __future__ import annotations

from typing import Type, Optional, List

from pydantic import BaseModel, Field, create_model

from browser_use.agent.views import (
    AgentBrain as BaseAgentBrain,
    AgentHistory as BaseAgentHistory,
    AgentOutput as BaseAgentOutput,
    ActionResult,
    AgentHistoryList as BaseAgentHistoryList,
    AgentSettings,
    AgentState,
    AgentStepInfo,
    StepMetadata,
)
from supatest.controller.registry.views import ActionModel


class AgentBrain(BaseAgentBrain):
    """Extended version of AgentBrain that includes page_summary"""
    page_summary: str = Field(default="", description="Summary of the current page state")
    evaluation_previous_goal: str = Field(default="", description="Evaluation of previous goal")
    memory: str = Field(default="", description="Agent's memory/context")
    next_goal: str = Field(default="", description="Next goal to achieve")
    thought: Optional[str] = Field(default=None, description="Current thought process")


class AgentOutput(BaseAgentOutput):
    """Extended AgentOutput with custom implementation"""
    
    current_state: AgentBrain  # Use our custom AgentBrain
    action: list[ActionModel] = Field(
        ...,
        description='List of actions to execute',
        json_schema_extra={'min_items': 1},
    )

    @staticmethod
    def type_with_custom_actions(custom_actions: Type[ActionModel]) -> Type['AgentOutput']:
        """Extend actions with custom actions"""
        return create_model(
            'AgentOutput',
            __base__=AgentOutput,
            action=(list[custom_actions], Field(...)),  # Properly annotated field with no default
            __module__=AgentOutput.__module__,
        )


class AgentHistory(BaseAgentHistory):
    """Extended AgentHistory that uses our custom AgentOutput"""
    
    model_output: AgentOutput | None

    class Config:
        arbitrary_types_allowed = True

class AgentHistoryList(BaseAgentHistoryList):
    """List of agent history items"""

    history: list[AgentHistory]
    
    def model_thoughts(self) -> list[AgentBrain]:
        """Get all thoughts from history"""
        return [h.model_output.current_state for h in self.history if h.model_output]


# Re-export other classes that we're not modifying
__all__ = [
    'AgentBrain',
    'AgentOutput',
    'AgentHistory',
    'AgentHistoryList',
    'AgentSettings',
    'AgentState',
    'AgentStepInfo',
    'StepMetadata',
    'ActionResult',
] 