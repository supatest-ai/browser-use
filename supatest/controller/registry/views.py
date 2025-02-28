from typing import Callable, Dict, Type
from pydantic import BaseModel, ConfigDict, Field

from browser_use.controller.registry.views import RegisteredAction, ActionRegistry

class SupatestActionModel(BaseModel):
    """Base model for dynamically created action models"""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    def get_index(self) -> int | None:
        """Get the index of the action"""
        # {'action': {'clicked_element': {'index':5}}}
        params = self.model_dump(exclude_unset=True).values()
        if not params:
            return None
        for param in params:
            if param is not None and 'index' in param:
                return param['index']
        return None

    def set_index(self, index: int):
        """Overwrite the index of the action"""
        # Get the action name and params
        action_data = self.model_dump(exclude_unset=True)
        action_name = next(iter(action_data.keys()))
        action_params = getattr(self, action_name)

        # Update the index directly in the dictionary
        if hasattr(action_params, 'index'):
            action_params.index = index

    def set_supatest_locator_id(self, supatest_locator_id: str):
        """Set the supatest_locator_id for the action"""
        # Get the action name and params
        action_data = self.model_dump(exclude_unset=True)
        if not action_data:
            return
            
        action_name = next(iter(action_data.keys()))
        action_params = getattr(self, action_name)
        
        # Set the supatest_locator_id directly on the model
        if hasattr(action_params, 'supatest_locator_id'):
            action_params.supatest_locator_id = supatest_locator_id


class SupatestRegisteredAction(RegisteredAction):
    """Extended version of RegisteredAction that formats actions in the supatest nested format"""
    
    def prompt_description(self) -> str:
        """Get a description of the action for the prompt in supatest format"""
        skip_keys = ['title']
        s = f'{self.description}: \n'
        s += '{' + str(self.name) + ': '
        s += str(
            {
                k: {sub_k: sub_v for sub_k, sub_v in v.items() if sub_k not in skip_keys}
                for k, v in self.param_model.schema()['properties'].items()
			}
		)
        s += '}'
        return s


class SupatestActionRegistry(ActionRegistry):
    """Extended version of ActionRegistry that provides context about the nested format"""
    
    actions: Dict[str, SupatestRegisteredAction] = {}
    
    def get_prompt_description(self) -> str:
        """Get a description of all actions for the prompt in supatest format"""
        return '\n'.join([action.prompt_description() for action in self.actions.values()])


__all__ = [
    'SupatestActionModel',
    'SupatestRegisteredAction',
    'SupatestActionRegistry'
]
