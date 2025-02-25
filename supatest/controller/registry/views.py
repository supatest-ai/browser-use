from typing import Callable, Dict, Type
from pydantic import BaseModel, ConfigDict, Field

from browser_use.controller.registry.views import (
    RegisteredAction as BaseRegisteredAction,
    ActionRegistry as BaseActionRegistry,
)


class RegisteredAction(BaseRegisteredAction):
    """Extended version of RegisteredAction that maintains compatibility with browser_use"""
    pass


class ActionModel(BaseModel):
    """Base model for dynamically created action models"""

    title: str = Field(description="Human readable description of what this action does")
    action: dict = Field(description="The actual action to be executed")

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def get_index(self) -> int | None:
        """Get the index of the action"""
        # {'action': {'clicked_element': {'index':5}}}
        params = self.action
        if not params:
            return None
        for param in params.values():
            if param is not None and 'index' in param:
                return param['index']
        return None

    def set_index(self, index: int):
        """Overwrite the index of the action"""
        # Get the action name and params
        action_data = self.action
        action_name = next(iter(action_data.keys()))
        action_params = action_data[action_name]

        # Update the index directly in the dictionary
        if 'index' in action_params:
            action_params['index'] = index

    def set_supatest_locator_id(self, supatest_locator_id: str):
        """Set the supatest_locator_id for the action"""
        action_data = self.action
        action_name = next(iter(action_data.keys()))
        action_params = action_data[action_name]
        action_params['supatest_locator_id'] = supatest_locator_id


class ActionRegistry(BaseActionRegistry):
    """Extended version of ActionRegistry that maintains compatibility with browser_use"""
    pass 