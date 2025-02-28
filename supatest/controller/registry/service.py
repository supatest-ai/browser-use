from typing import Any, Dict, Generic, Optional, Type, TypeVar

from langchain_core.language_models.chat_models import BaseChatModel
from pydantic import BaseModel, Field, create_model

from browser_use.controller.registry.service import Registry
from browser_use.telemetry.views import (
    ControllerRegisteredFunctionsTelemetryEvent,
    RegisteredFunction,
)
from supatest.browser.context import SupatestBrowserContext

from supatest.controller.registry.views import SupatestActionModel, SupatestActionRegistry, SupatestRegisteredAction

Context = TypeVar('Context')


class SupatestRegistry(Registry[Context]):
    """Extended version of Registry that supports supatest action model format"""
    
    def __init__(self, exclude_actions: list[str] = []):
        """Initialize with our custom SupatestActionRegistry instead of the base ActionRegistry"""
        # Initialize base attributes but replace registry with our custom one
        super().__init__(exclude_actions)
        self.registry = SupatestActionRegistry()
    
    # Override the action decorator to use SupatestRegisteredAction
    def action(self, description: str, param_model: Optional[Type[BaseModel]] = None):
        """Decorator for registering actions with supatest format"""
        def decorator(func):
            if self.exclude_actions and func.__name__ in self.exclude_actions:
                return func

            if param_model is None:
                # Create param model from function signature
                created_param_model = self._create_param_model(func)
            else:
                created_param_model = param_model

            # Use SupatestRegisteredAction instead of RegisteredAction
            self.registry.actions[func.__name__] = SupatestRegisteredAction(
                name=func.__name__,
                description=description,
                function=func,
                param_model=created_param_model,
            )

            return func

        return decorator
    
    def create_action_model(self,include_actions: Optional[list[str]] = None) -> Type[SupatestActionModel]:
        """Creates a Pydantic model from registered actions with supatest format"""
        fields = {
			name: (
				Optional[action.param_model],
				Field(default=None, description=action.description),
			)
			for name, action in self.registry.actions.items()
			if include_actions is None or name in include_actions
		}

        self.telemetry.capture(
            ControllerRegisteredFunctionsTelemetryEvent(
                registered_functions=[
                    RegisteredFunction(name=name, params=action.param_model.model_json_schema())
                    for name, action in self.registry.actions.items()
                    if include_actions is None or name in include_actions
                ]
            )
        )

        model = create_model('ActionModel', __base__=SupatestActionModel, **fields)  # type: ignore
        return model

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

            # Add only required arguments based on action name
            extra_args = {}
            
            # Only add browser for actions that need it (exclude 'done' action)
            if browser and action_name != 'done':
                extra_args['browser'] = browser
            
            # Only add page_extraction_llm for extract_content action
            if action_name == 'extract_content' and page_extraction_llm:
                extra_args['page_extraction_llm'] = page_extraction_llm
            
            # Only add available_file_paths for file-related actions
            if action_name in ['upload_file', 'download_file'] and available_file_paths:
                extra_args['available_file_paths'] = available_file_paths
            
            # Add context if provided and action accepts it
            if context:
                extra_args['context'] = context

            # Add has_sensitive_data flag for input_text action
            if action_name == 'input_text' and sensitive_data:
                extra_args['has_sensitive_data'] = True

            # Execute the action with validated parameters
            return await action.function(validated_params, **extra_args)

        except Exception as e:
            raise RuntimeError(f'Error executing action {action_name}: {str(e)}') from e 
        
    def get_prompt_description(self) -> str:
        """Get a description of all actions for the prompt in supatest format"""
        return self.registry.get_prompt_description()