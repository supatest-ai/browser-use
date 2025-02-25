from __future__ import annotations

from typing import Type

from pydantic import BaseModel, Field, create_model

from browser_use.agent.views import (
    AgentBrain as BaseAgentBrain,
    AgentHistory as BaseAgentHistory,
    AgentOutput as BaseAgentOutput,
    ActionResult,
    AgentHistoryList,
    AgentSettings,
    AgentState,
    AgentStepInfo,
    StepMetadata,
)
from supatest.controller.registry.views import ActionModel


class AgentBrain(BaseAgentBrain):
    """Extended AgentBrain with additional thought field"""
    
    evaluation_previous_goal: str
    memory: str
    next_goal: str
    thought: str  # Added custom field


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