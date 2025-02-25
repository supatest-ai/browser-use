from typing import Any, Dict, Generic, Optional, Type, TypeVar

from langchain_core.language_models.chat_models import BaseChatModel
from pydantic import BaseModel, Field, create_model

from browser_use.controller.registry.service import Registry as BaseRegistry
from browser_use.telemetry.views import (
    ControllerRegisteredFunctionsTelemetryEvent,
    RegisteredFunction,
)
from supatest.browser.context import SupatestBrowserContext

from supatest.controller.registry.views import ActionModel

Context = TypeVar('Context')


class Registry(BaseRegistry[Context]):
    """Extended version of Registry that supports supatest action model format"""
	# def create_action_model(self, include_actions: Optional[list[str]] = None) -> Type[ActionModel]:
    def create_action_model(self,include_actions: Optional[list[str]] = None) -> Type[ActionModel]:
        """Creates a Pydantic model from registered actions with supatest format"""
        fields = {
            'title': (str, Field(description="Human readable description of what this action does")),
            'action': (
                dict,
                Field(
                    description="The actual action to be executed",
                    default_factory=dict
                )
            )
        }

        self.telemetry.capture(
            ControllerRegisteredFunctionsTelemetryEvent(
                registered_functions=[
                    RegisteredFunction(name=name, params=action.param_model.model_json_schema())
                    for name, action in self.registry.actions.items()
                ]
            )
        )

        return create_model('ActionModel', __base__=ActionModel, **fields)  # type: ignore

    async def execute_action(
        self,
        action_name: str,
        params: dict,
        browser: Optional[SupatestBrowserContext] = None,
        page_extraction_llm: Optional[BaseChatModel] = None,
        sensitive_data: Optional[Dict[str, str]] = None,
        available_file_paths: Optional[list[str]] = None,
        context: Context | None = None,
    ) -> Any:
        """Execute a registered action with supatest format"""
        if action_name not in self.registry.actions:
            raise ValueError(f'Action {action_name} not found')

        action = self.registry.actions[action_name]
        try:
            # Create the validated Pydantic model
            validated_params = action.param_model(**params)

            # Add any extra arguments needed for the action
            extra_args = {}
            if browser:
                extra_args['browser'] = browser
            if page_extraction_llm:
                extra_args['page_extraction_llm'] = page_extraction_llm
            if available_file_paths:
                extra_args['available_file_paths'] = available_file_paths
            if context:
                extra_args['context'] = context
            # if action_name == 'input_text' and sensitive_data:
            #     extra_args['has_sensitive_data'] = True

            # Execute the action with validated parameters
            return await action.function(validated_params, **extra_args)

        except Exception as e:
            raise RuntimeError(f'Error executing action {action_name}: {str(e)}') from e 