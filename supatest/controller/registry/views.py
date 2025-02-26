from typing import Callable, Dict, Type
from pydantic import BaseModel, ConfigDict, Field

from browser_use.controller.registry.views import RegisteredAction, ActionRegistry

class SupatestActionModel(BaseModel):
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


class SupatestRegisteredAction(RegisteredAction):
    """Extended version of RegisteredAction that formats actions in the supatest nested format"""
    
    def prompt_description(self) -> str:
        """Get a description of the action for the prompt in supatest format"""
        skip_keys = ['title']
        s = f'{self.description}: \n'
        s += '{"title": "Description of what this action does", "action": {'
        s += f'"{self.name}": {str({k: {sub_k: sub_v for sub_k, sub_v in v.items() if sub_k not in skip_keys} for k, v in self.param_model.model_json_schema()["properties"].items()})}'
        s += '}}'
        return s


class SupatestActionRegistry(ActionRegistry):
    """Extended version of ActionRegistry that provides context about the nested format"""
    
    actions: Dict[str, SupatestRegisteredAction] = {}
    
    def get_prompt_description(self) -> str:
        """Get a description of all actions for the prompt in supatest format"""
        intro = "Actions must be in the following format: {\"title\": \"...\", \"action\": {\"action_name\": {\"param\": value}}}\n\n"
        actions = '\n'.join([action.prompt_description() for action in self.actions.values()])
        return intro + actions


__all__ = [
    'SupatestActionModel',
    'SupatestRegisteredAction',
    'SupatestActionRegistry'
]
