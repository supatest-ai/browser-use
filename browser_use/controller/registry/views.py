from typing import Callable, Dict, Type

from pydantic import BaseModel, ConfigDict, Field


class RegisteredAction(BaseModel):
	"""Model for a registered action"""

	name: str
	description: str
	function: Callable
	param_model: Type[BaseModel]

	model_config = ConfigDict(arbitrary_types_allowed=True)

	def prompt_description(self) -> str:
		"""Get a description of the action for the prompt"""
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
		action_data = self.action
		action_name = next(iter(action_data.keys()))
		action_params = action_data[action_name]
		action_params['supatest_locator_id'] = supatest_locator_id


class ActionRegistry(BaseModel):
	"""Model representing the action registry"""

	actions: Dict[str, RegisteredAction] = {}

	def get_prompt_description(self) -> str:
		"""Get a description of all actions for the prompt"""
		return '\n'.join([action.prompt_description() for action in self.actions.values()])
