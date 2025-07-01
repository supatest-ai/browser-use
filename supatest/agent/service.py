from __future__ import annotations


import asyncio
import importlib.resources
import inspect
import json
import logging
import time
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional, TypeVar

from browser_use.agent.gif import create_history_gif
from browser_use.agent.message_manager.utils import extract_json_from_model_output, save_conversation
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import (
	BaseMessage,
	HumanMessage,
)

# from lmnr.sdk.decorators import observe
from pydantic import ValidationError

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage

from browser_use.agent.service import Agent
from browser_use.exceptions import LLMException
from browser_use.telemetry.views import AgentTelemetryEvent
from browser_use.agent.views import AgentStepInfo, StepMetadata
from browser_use.agent.prompts import SystemPrompt
from browser_use.agent.message_manager.service import MessageManager, MessageManagerSettings
from browser_use.browser.views import  BrowserError, BrowserStateSummary, BrowserStateHistory

from browser_use.utils import time_execution_async
from supatest.agent.views import SupatesAgentState, SupatestAgentOutput, SupatestAgentHistory, SupatestAgentHistoryList, SupatestActionResult
from supatest.controller.registry.views import SupatestActionModel

from supatest.browser.session import SupatestBrowserSession
from supatest.browser.views import SupatestBrowserState
from supatest.controller.service import SupatestController
from importlib import resources
import os
logger = logging.getLogger(__name__)
SKIP_LLM_API_KEY_VERIFICATION = os.environ.get('SKIP_LLM_API_KEY_VERIFICATION', 'false').lower()[0] in 'ty1'

Context = TypeVar('Context')
AgentHookFunc = Callable[['Agent'], None]

class SupatestAgent(Agent[Context]):
    """Extended Agent class with custom implementations"""

    browser_session: SupatestBrowserSession
    controller: SupatestController[Context]

    def __init__(
        self,
        task: str,
        llm: BaseChatModel,
        browser_session: SupatestBrowserSession | None = None,
        controller: SupatestController[Context] = SupatestController(),
        sensitive_data: dict[str, str] | dict[str, dict[str, str]] | None = None,
        initial_actions: list[dict[str, dict[str, Any]]] | None = None,
        register_new_step_callback: Callable[['SupatestBrowserState', 'SupatestAgentOutput', int], Awaitable[None]] | None = None,
        register_done_callback: Callable[['SupatestAgentHistoryList'], Awaitable[None]] | None = None,
        register_external_agent_status_raise_error_callback: Callable[[], Awaitable[bool]] | None = None,
        send_message: Callable[[dict], Awaitable[bool]] | None = None,
        goal_step_id: str | None = None,
        requestId: str | None = None,
        testCaseId: str | None = None,
        active_page_id: str | None = None,
        injected_agent_state: SupatesAgentState | None = None,
        # Memory parameters (now constructor parameters in new browser-use)
        enable_memory: bool = True,
        memory_config: Any | None = None,  # MemoryConfig | None but avoiding import issues
        **kwargs
    ):
        # Initialize consecutive_eval_failure first
        self.consecutive_eval_failure = 0
        
        # Store memory settings
        self.enable_memory = enable_memory
        self.memory_config = memory_config
        
        # Get custom action descriptions from our registry before calling super().__init__
        controller_registry = controller.registry
        available_actions = controller_registry.get_prompt_description()
        
        # Handle browser session setup before calling super().__init__
        self.injected_browser_session = browser_session is not None
        
        # Initialize state
        self.state = injected_agent_state or SupatesAgentState()
        
        # If no browser session is provided, create one with the active page ID
        if not browser_session:
            browser_session = SupatestBrowserSession(active_page_id=active_page_id)
            # We created the browser_session, so we should close it
            self.injected_browser_session = False
        
        # Load our custom system prompt if not already overridden
        if 'override_system_message' not in kwargs:
            try:
                # Load the custom system prompt from the Supatest package
                with importlib.resources.files('supatest.agent').joinpath('system_prompt.md').open('r') as f:
                    custom_system_prompt = f.read()
                max_actions = kwargs.get('max_actions_per_step', 10)
                custom_system_prompt = custom_system_prompt.format(max_actions=max_actions)
                kwargs['override_system_message'] = custom_system_prompt
            except Exception as e:
                logger.warning(f"Failed to load custom system prompt: {e}") 
        
        super().__init__(
            task=task,
            llm=llm,
            browser_session=browser_session,
            controller=controller,
            sensitive_data=sensitive_data,
            initial_actions=initial_actions,
            register_new_step_callback=register_new_step_callback,
            register_done_callback=register_done_callback,
            register_external_agent_status_raise_error_callback=register_external_agent_status_raise_error_callback,
            enable_memory=enable_memory,
            memory_config=memory_config,
            **kwargs
        )
        self.send_message = send_message
        self.goal_step_id = goal_step_id
        self.requestId = requestId
        self.testCaseId = testCaseId
        self.active_page_id = active_page_id
        # Store our custom action descriptions
        self.available_actions = available_actions

        self._message_manager = MessageManager(
            task=task,
            system_message= SystemPrompt(
                action_description=self.available_actions,
                max_actions_per_step=self.settings.max_actions_per_step,
                override_system_message=kwargs.get('override_system_message'),
                extend_system_message=self.settings.extend_system_message,
            ).get_system_message(),
            settings=MessageManagerSettings(
                max_input_tokens=self.settings.max_input_tokens,
                include_attributes=self.settings.include_attributes,
                message_context=self.settings.message_context,
                sensitive_data=sensitive_data,
                available_file_paths=self.settings.available_file_paths,
            ),
            state=self.state.message_manager_state,
        )
        
    def _setup_action_models(self) -> None:
        """Setup dynamic action models from controller's registry using our extended SupatestAgentOutput"""
        # Initially only include actions with no filters
        self.ActionModel = self.controller.registry.create_action_model()
        # Create output model with the dynamic actions
        self.AgentOutput = SupatestAgentOutput.type_with_custom_actions(self.ActionModel)
        
        # used to force the done action when max_steps is reached
        self.DoneActionModel = self.controller.registry.create_action_model(include_actions=['done'])
        self.DoneAgentOutput = SupatestAgentOutput.type_with_custom_actions(self.DoneActionModel)
      
    @time_execution_async('--get_next_action (agent)')
    async def get_next_action(self, input_messages: list[BaseMessage]) -> SupatestAgentOutput:
        """Get next action from LLM based on current state"""
        input_messages = self._convert_input_messages(input_messages)

        if self.tool_calling_method == 'raw':
            logger.debug(f'Using {self.tool_calling_method} for {self.chat_model_library}')
            try:
                output = self.llm.invoke(input_messages)
                response = {'raw': output, 'parsed': None}
            except Exception as e:
                logger.error(f'Failed to invoke model: {str(e)}')
                raise LLMException(401, 'LLM API call failed') from e
            # TODO: currently invoke does not return reasoning_content, we should override invoke
            output.content = self._remove_think_tags(str(output.content))
            try:
                parsed_json = extract_json_from_model_output(output.content)
                parsed = self.AgentOutput(**parsed_json)
            except (ValueError, ValidationError) as e:
                logger.warning(f'Failed to parse model output: {output} {str(e)}')
                raise ValueError('Could not parse response.')

        elif self.tool_calling_method is None:
            structured_llm = self.llm.with_structured_output(self.AgentOutput, include_raw=True)
            
            try: 
                response: dict[str, Any] = await structured_llm.ainvoke(input_messages)  # type: ignore
                parsed: SupatestAgentOutput | None = response['parsed']
            except Exception as e:
                logger.error(f'Failed to invoke model: {str(e)}')
                raise LLMException(401, 'LLM API call failed') from e
        
        else:
            logger.debug(f'Using {self.tool_calling_method} for {self.chat_model_library}')
            structured_llm = self.llm.with_structured_output(self.AgentOutput, include_raw=True, method=self.tool_calling_method)
            response: dict[str, Any] = await structured_llm.ainvoke(input_messages) # type: ignore
            # parsed: SupatestAgentOutput | None = response['parsed']
            
        # Handle tool call responses
        if response.get('parsing_error') and 'raw' in response:
            raw_msg = response['raw']
            if hasattr(raw_msg, 'tool_calls') and raw_msg.tool_calls:
                # Convert tool calls to AgentOutput format
                
                tool_call = raw_msg.tool_calls[0]  # Take first tool call
                
                # Create current state
                tool_call_name = tool_call['name']
                tool_call_args = tool_call['args']
                
                current_state = {
					'page_summary': 'Processing tool call',
					'evaluation_previous_goal': 'Executing action',
					'memory': 'Using tool call',
					'next_goal': f'Execute {tool_call_name}',
				}
                
                # Create action from tool call
                action = {tool_call_name: tool_call_args}
                
                parsed = self.AgentOutput(current_state=current_state, action=[self.ActionModel(**action)])
            else:
                parsed = None
        else:
            parsed = response['parsed']
            
        if not parsed:
            try:
                parsed_json = extract_json_from_model_output(response['raw'].content)
                parsed = self.AgentOutput(**parsed_json)
            except Exception as e:
                logger.warning(f'Failed to parse model output: {response["raw"].content} {str(e)}')
                raise ValueError('Could not parse response.')

        # cut the number of actions to max_actions_per_step if needed
        if len(parsed.action) > self.settings.max_actions_per_step:
            parsed.action = parsed.action[: self.settings.max_actions_per_step]
            

        self.state.n_steps += 1
        return parsed

    async def _log_response(self, response: SupatestAgentOutput) -> None:
        """Log the model's response with custom websocket messaging"""
        if 'Success' in response.current_state.evaluation_previous_goal:
            emoji = '👍'
        elif 'Failed' in response.current_state.evaluation_previous_goal:
            emoji = '⚠'
        else:
            emoji = '🤷'

        # Log to console
        logger.debug(f'🤖 {emoji} Page summary: {response.current_state.page_summary}')
        logger.info(f'{emoji} Eval: {response.current_state.evaluation_previous_goal}')
        logger.info(f'🧠 Memory: {response.current_state.memory}')
        logger.info(f'🎯 Next goal: {response.current_state.next_goal}')
        logger.info(f'🎯 Thought: {response.current_state.thought}')

        # Create steps array with all actions
        steps = []
        for i, action in enumerate(response.action):
            step = action.model_dump(exclude_none=True)
            steps.append(step)
            logger.info(f'🛠️  Action {i + 1}/{len(response.action)}: {action.model_dump_json(exclude_unset=True)}')

    async def _handle_step_error(self, e: Exception) -> list[SupatestActionResult]:
            error_str = str(e)
            return [SupatestActionResult(
                error=error_str,
                include_in_memory=True,
                isExecuted='failure'
            )]
            
    # @observe(name='agent.step', ignore_output=True, ignore_input=True)
    @time_execution_async('--step (agent)')
    async def step(self, step_info: Optional[AgentStepInfo] = None) -> None:
        """Execute one step of the task with custom error handling and messaging"""
        state = None
        model_output = None
        result: list[SupatestActionResult] = []
        step_start_time = time.time()
        tokens = 0
        subgoal_id = uuid.uuid4()
        
        logger.info(f'\n\n --------------------------------------')
        logger.info(f'📍 Step {self.state.n_steps} | Subgoal ID: {subgoal_id}')

        try:
            state = await self.browser_session.get_state_summary(cache_clickable_elements_hashes=True)
            active_page = await self.browser_session.get_current_page()
            
            # generate procedural memory if needed
            if self.enable_memory and self.memory and self.state.n_steps % self.memory.config.memory_interval == 0:
                self.memory.create_procedural_memory(self.state.n_steps)
            
            await self._raise_if_stopped_or_paused()
            
            # Update action models with page-specific actions
            await self._update_action_models_for_page(active_page)
            
            # Get page-specific filtered actions
            page_filtered_actions = self.controller.registry.get_prompt_description(active_page)    
            
            # Add sensitive data guidance if available - CRITICAL FOR SENSITIVE DATA REPLACEMENT
            if self.sensitive_data:
                self._message_manager.add_sensitive_data(active_page.url)
            
            # If there are page-specific actions, add them as a special message for this step only
            if page_filtered_actions:
                page_action_message = f'For this page, these additional actions are available:\n{page_filtered_actions}'
                self._message_manager._add_message_with_tokens(HumanMessage(content=page_action_message))
            
            # If using raw tool calling method, we need to update the message context with new actions
            if self.tool_calling_method == 'raw':
                # For raw tool calling, get all non-filtered actions plus the page-filtered ones
                all_unfiltered_actions = self.controller.registry.get_prompt_description()
                all_actions = all_unfiltered_actions
                if page_filtered_actions:
                    all_actions += '\n' + page_filtered_actions
                    
                context_lines = self._message_manager.settings.message_context.split('\n')
                non_action_lines = [line for line in context_lines if not line.startswith('Available actions:')]
                updated_context = '\n'.join(non_action_lines)
                if updated_context:
                    updated_context += f'\n\nAvailable actions: {all_actions}'
                else:
                    updated_context = f'Available actions: {all_actions}'
                self._message_manager.settings.message_context = updated_context

            self._message_manager.add_state_message(state, self.state.last_result, step_info, self.settings.use_vision)
      

            # Custom eval failure handling
            if self.consecutive_eval_failure >= self.settings.max_failures:
                logger.info("⚠️  Max eval failures reached: Generate Done Action with success as False")
                # Add a human message about the consecutive failures
                failure_msg = (
                    f"You have failed to achieve your goals {self.consecutive_eval_failure} times in a row. You must now generate a 'done' action with success=false and provide a detailed explanation of why the task could not be completed after multiple attempts in 'text' key."
                )
                self._message_manager._add_message_with_tokens(HumanMessage(content=failure_msg))

            # Run planner at specified intervals if planner is configured
            if self.settings.planner_llm and self.state.n_steps % self.settings.planner_interval == 0:
                plan = await self._run_planner()
                self._message_manager.add_plan(plan, position=-1)

            if step_info and step_info.is_last_step():
                # Add last step warning if needed
                msg = 'Now comes your last step. Use only the "done" action now. No other actions - so here your action sequence must have length 1.'
                msg += '\nIf the task is not yet fully finished as requested by the user, set success in "done" to false! E.g. if not all steps are fully completed.'
                msg += '\nIf the task is fully finished, set success in "done" to true.'
                msg += '\nInclude everything you found out for the ultimate task in the done text.'
                logger.info('Last step finishing up')
                self._message_manager._add_message_with_tokens(HumanMessage(content=msg))
                self.AgentOutput = self.DoneAgentOutput

            input_messages = self._message_manager.get_messages()
            tokens = self._message_manager.state.history.current_tokens

            # Planning action from LLM
            try:
                model_output = await self.get_next_action(input_messages)
                await self._check_eval_failure(model_output, step_info)
                await self._log_response(model_output)
                await self._send_subgoal_update(subgoal_id, False, model_output)
                
                # Check again for paused/stopped state after getting model output
                # This is needed in case Ctrl+C was pressed during the get_next_action call
                await self._raise_if_stopped_or_paused()
                if self.register_new_step_callback:
                    if inspect.iscoroutinefunction(self.register_new_step_callback):
                        await self.register_new_step_callback(state, model_output, self.state.n_steps)
                    else:
                        self.register_new_step_callback(state, model_output, self.state.n_steps)

                if self.settings.save_conversation_path:
                    target = self.settings.save_conversation_path + f'_{self.state.n_steps}.txt'
                    save_conversation(input_messages, model_output, target, self.settings.save_conversation_path_encoding)

                self._message_manager._remove_last_state_message()  # we dont want the whole state in the chat history

                # check again if Ctrl+C was pressed before we commit the output to history
                await self._raise_if_stopped_or_paused()

                self._message_manager.add_model_output(model_output)
            except asyncio.CancelledError:
                # Task was cancelled due to Ctrl+C
                self._message_manager._remove_last_state_message()
                raise InterruptedError('Model query cancelled by user')
            except InterruptedError:
                # Agent was paused during get_next_action
                self._message_manager._remove_last_state_message()
                raise  # Re-raise to be caught by the outer try/except
            except Exception as e:
                # Create steps array with all actions
                error_str = str(e)
                self._message_manager._remove_last_state_message()
                
                self.state.last_result = [SupatestActionResult(error=error_str, include_in_memory=True, isExecuted='failure')]
                custom_error_str = 'The agent was unable to generate a valid subgoal due to technical glitches'
                error_info = {
                    "errorCount": self.state.consecutive_failures,
                    "errorType": "AGENT_PLANNER_ERROR",  # TODO: yet to decide the different error types
                    "errorMessage": custom_error_str
                }
                await self._send_subgoal_update(subgoal_id, True, error_info=error_info)
                raise e

            # Execute actions 
            result = await self.multi_act(model_output.action, subgoal_id)
            self.state.last_result = result

            if len(result) > 0 and result[-1].is_done:
                logger.info(f'📄 Result: {result[-1].extracted_content}')

            self.state.consecutive_failures = 0

        except InterruptedError:
            logger.debug('Agent paused')
            self.state.last_result = [
                SupatestActionResult(
                    error='The agent was paused - now continuing actions might need to be repeated',
                    include_in_memory=True,
                    isExecuted='failure'
                )
            ]
            return
        except asyncio.CancelledError:
            # Directly handle the case where the step is cancelled at a higher level
            # logger.debug('Task cancelled - agent was paused with Ctrl+C')
            self.state.last_result = [SupatestActionResult(error='The agent was paused with Ctrl+C', include_in_memory=False, isExecuted="failure")]
            raise InterruptedError('Step cancelled by user')
           
        except Exception as e:
            result = await self._handle_step_error(e)
            self.state.last_result = result
            error_str = str(e)
            logger.error(f'❌ Error: {error_str}')
            

        finally:
            step_end_time = time.time()
            actions = [a.model_dump(exclude_unset=True) for a in model_output.action] if model_output else []
            
            # Note: The new AgentTelemetryEvent is designed for end-of-agent events, not step events.
            # For now, we'll skip step-level telemetry since it doesn't align with the new structure.
            # The upstream browser-use appears to have moved away from step-level telemetry.

            if not result:
                return

            if state:
                metadata = StepMetadata(
                    step_number=self.state.n_steps,
                    step_start_time=step_start_time,
                    step_end_time=step_end_time,
                    input_tokens=tokens,
                )
    
                self._make_history_item(model_output, state, result, metadata)

    def _make_history_item(
        self,
        model_output: SupatestAgentOutput | None,
        state: BrowserStateSummary,
        result: list[SupatestActionResult],
        metadata: Optional[StepMetadata] = None,
    ) -> None:
        """Create and store history item"""
        
        if model_output:
            interacted_elements = SupatestAgentHistory.get_interacted_element(model_output, state.selector_map)
        else:
            interacted_elements = [None]

        state_history = BrowserStateHistory(
            url=state.url,
            title=state.title,
            tabs=state.tabs,
            interacted_element=interacted_elements,
            screenshot=state.screenshot,
        )

        history_item = SupatestAgentHistory(model_output=model_output, result=result, state=state_history, metadata=metadata)

        self.state.history.history.append(history_item)

    # Set the max steps to 20 for now
    async def run(self, max_steps: int = 20, on_step_start: AgentHookFunc | None = None, on_step_end: AgentHookFunc | None = None) -> SupatestAgentHistoryList:
        """Execute the task with maximum number of steps and custom completion handling"""
        
        loop = asyncio.get_event_loop()
        
        # Set up the Ctrl+C signal handler with callbacks specific to this agent
        from browser_use.utils import SignalHandler
        
        signal_handler = SignalHandler(
            loop=loop,
            pause_callback=self.pause,
            resume_callback=self.resume,
            custom_exit_callback=None, # No special cleanup needed on forced exit
            exit_on_second_int=True,
        )
        signal_handler.register()
        
        # Wait for verification task to complete if it exists
        if hasattr(self, '_verification_task') and not self._verification_task.done():
            try:
                await self._verification_task
            except Exception:
                # Error already logged in the task
                pass
                
        # Check that verification was successful
        assert self.llm._verified_api_keys or SKIP_LLM_API_KEY_VERIFICATION, (
			'Failed to connect to LLM API or LLM API is not responding correctly'
		)
        
     
        
        try:
            self._log_agent_run()

            # Execute initial actions if provided
            if self.initial_actions:
                result = await self.multi_act(self.initial_actions, subgoal_id=str(uuid.uuid4()), check_for_new_elements=False)
                self.state.last_result = result

            for step in range(max_steps):
                # Check if we should stop due to too many failures
                if self.state.consecutive_failures >= self.settings.max_failures:
                    logger.error(f'❌ Stopping due to {self.settings.max_failures} consecutive failures')
                    
                    error_messages = [r.error for r in self.state.last_result if r.error]
                    logger.error(f'❌ Error message: {error_messages}')
                    error_message = "The agent was unable to achieve the specified goal due to some prompt issues. Please consider modifying the prompt and trying again."
                    if error_messages:
                        # in the case of LLM we don't send it the errors in subgoal level
                        if (any("ResponsibleAIPolicyViolation" in msg for msg in error_messages) or 
                            any("content_filter" in msg for msg in error_messages) or
                            any("Could not parse response" in msg for msg in error_messages)):
                            await self._send_message("ERROR", error_message)
                            break
                        else:
                            error_message = "The agent was unable to complete the task. Please try again."
                    else:
                        # TODO: still not very sure of, need to check if this is correct 
                        error_message = "Unknown error occurred in agent execution"
                        error_info = None
                        if self.state.consecutive_failures == 3:
                            error_info = {
                                    "errorCount": self.state.consecutive_failures,
                                    "errorType": "ACTION_EXECUTION_ERROR",
                                    "errorMessage": error_message
                                }
                    
                            # Send single websocket message with all data
                            await self._send_message("AGENT_GOAL_STOP_RES", {
                                "requestId": self.requestId,
                                "testCaseId": self.testCaseId,
                                "success": False,
                                "error": json.dumps(error_info) if error_info else None,
                            })
                            break

                if self.state.stopped:
                    logger.info('Agent stopped')
                    break

                while self.state.paused:
                    await asyncio.sleep(0.2)
                    if self.state.stopped:
                        break
                    
                if on_step_start is not None:
                    await on_step_start(self)

                step_info = AgentStepInfo(step_number=step, max_steps=max_steps)
                await self.step(step_info)
                
                if on_step_end is not None:
                    await on_step_end(self)

                if self.state.history.is_done():
                    if self.settings.validate_output and step < max_steps - 1:
                        if not await self._validate_output():
                            continue                    
                    try:
                        if self.send_message:
                            await self._send_message("AGENT_GOAL_STOP_RES", {
                                "requestId": self.requestId,
                                "testCaseId": self.testCaseId,
                                "success": True,
                                "error": None,
                            })
                    except Exception as e:
                        logger.warning(f"Failed to send goal stop message: {str(e)}")
                        
                  
                    await self.log_completion()
                    break
            else:
                # unable to complete task in max steps ERROR
                logger.info('❌ Failed to complete task in maximum steps')
                if self.send_message:
                    await self._send_message("ERROR", "The agent was unable to complete the task within the allowed number of steps.")

            return self.state.history
        
        except KeyboardInterrupt:
            # Already handled by our signal handler, but catch any direct KeyboardInterrupt as well
            logger.info('Got KeyboardInterrupt during execution, returning current history')
            return self.state.history
            

        finally:
            # Unregister signal handlers before cleanup
            signal_handler.unregister()
            
            # Gather telemetry data for the final agent event
            try:
                # Extract action history and errors from the agent's history
                action_history = []
                action_errors = []
                urls_visited = []
                
                for history_item in self.state.history.history:
                    if history_item.model_output and history_item.model_output.action:
                        actions = [action.model_dump(exclude_unset=True) for action in history_item.model_output.action]
                        action_history.append(actions)
                    else:
                        action_history.append(None)
                    
                    # Collect errors from results
                    if history_item.result:
                        errors = [res.error for res in history_item.result if res.error]
                        action_errors.append(errors[0] if errors else None)
                    else:
                        action_errors.append(None)
                    
                    # Collect URLs
                    if history_item.state and history_item.state.url:
                        urls_visited.append(history_item.state.url)
                
                # Get model information
                model_name = getattr(self.llm, 'model_name', 'unknown')
                model_provider = type(self.llm).__name__
                
                # Determine final result
                final_result = None
                if self.state.history.history and self.state.history.is_done():
                    last_result = self.state.history.history[-1].result
                    if last_result and last_result[-1].extracted_content:
                        final_result = last_result[-1].extracted_content
                
                # Determine error message
                error_message = None
                if not self.state.history.is_successful():
                    errors = self.state.history.errors()
                    if errors:
                        error_message = errors[0]
                
                self.telemetry.capture(
                    AgentTelemetryEvent(
                        # Start details
                        task=self.task,
                        model=model_name,
                        model_provider=model_provider,
                        planner_llm=getattr(self.settings.planner_llm, 'model_name', None) if self.settings.planner_llm else None,
                        max_steps=max_steps,
                        max_actions_per_step=self.settings.max_actions_per_step,
                        use_vision=self.settings.use_vision,
                        use_validation=self.settings.validate_output,
                        version=self._get_version(),
                        source='supatest',
                        # Step details
                        action_errors=action_errors,
                        action_history=action_history,
                        urls_visited=urls_visited,
                        # End details
                        steps=self.state.n_steps,
                        total_input_tokens=self.state.history.total_input_tokens(),
                        total_duration_seconds=self.state.history.total_duration_seconds(),
                        success=self.state.history.is_successful(),
                        final_result_response=final_result,
                        error_message=error_message,
                    )
                )
            except Exception as e:
                logger.warning(f"Failed to capture telemetry: {str(e)}")
            
            await self._cleanup(max_steps)
            
            if self.settings.generate_gif:
                output_path: str = 'agent_history.gif'
                if isinstance(self.settings.generate_gif, str):
                    output_path = self.settings.generate_gif
                    
                create_history_gif(task=self.task, history=self.state.history, output_path=output_path)

    async def _cleanup(self, max_steps: int) -> None:
        """Cleanup resources and generate final artifacts"""
        logger.debug('🔄 Cleaning up...')
        # Remove highlights before closing the browser session
        await self.browser_session.remove_highlights()

    async def stop(self) -> None:
        """Stop the agent"""
        logger.info('⏹️ Supatest Agent stopping')
        self.state.stopped = True
        error_info = {
            "errorCount": 1,
            "errorType": "AGENT_STOPPED",
            "errorMessage": "Agent execution terminated - stopped by user or system before task completion"
        }
        if self.send_message:
            await self._send_message("AGENT_GOAL_STOP_RES", {
                "requestId": self.requestId,
                "testCaseId": self.testCaseId,
                "success": False,
                "error": json.dumps(error_info),
            })

    async def _update_action_models_for_page(self, page) -> None:
        """Update action models with page-specific actions"""
        # Create new action model with current page's filtered actions
        self.ActionModel = self.controller.registry.create_action_model(page=page)
        # Update output model with the new actions
        self.AgentOutput = SupatestAgentOutput.type_with_custom_actions(self.ActionModel)

        # Update done action model too
        self.DoneActionModel = self.controller.registry.create_action_model(include_actions=['done'], page=page)
        self.DoneAgentOutput = SupatestAgentOutput.type_with_custom_actions(self.DoneActionModel)

    def _get_version(self) -> str:
        """Get the supatest version for telemetry"""
        from supatest import __version__
        return __version__

    # @observe(name='controller.multi_act')
    @time_execution_async('--multi-act (agent)')
    async def multi_act(
        self,
        actions: list[SupatestActionModel],
        subgoal_id: str,
        check_for_new_elements: bool = True,
    ) -> list[SupatestActionResult]:
        """Execute multiple actions with SupatestActionModel type"""
        results = []

        cached_selector_map = await self.browser_session.get_selector_map()
        cached_path_hashes = set(e.hash.branch_path_hash for e in cached_selector_map.values())

        await self.browser_session.remove_highlights()

        # Create initial steps array
        steps = []
        for i, action in enumerate(actions):
            step = action.model_dump(exclude_none=True)  
            steps.append(step)

        for i, action in enumerate(actions):
            isExecuted = 'pending'
            if action.get_index() is not None and i != 0:
                new_state = await self.browser_session.get_state_summary(cache_clickable_elements_hashes=False)
                
                new_selector_map = new_state.selector_map
                # Detect index change after previous action
                orig_target = cached_selector_map.get(action.get_index())  # type: ignore
                orig_target_hash = orig_target.hash.branch_path_hash if orig_target else None
                new_target = new_selector_map.get(action.get_index())  # type: ignore
                new_target_hash = new_target.hash.branch_path_hash if new_target else None
                if orig_target_hash != new_target_hash:
                    msg = f'Element index changed after action {i} / {len(actions)}, because page changed.'
                    logger.info(msg)
                    results.append(SupatestActionResult(extracted_content=msg, include_in_memory=True, isExecuted='failure'))
                    break
                
                new_path_hashes = set(e.hash.branch_path_hash for e in new_selector_map.values())
                if check_for_new_elements and not new_path_hashes.issubset(cached_path_hashes):
                    # next action requires index but there are new elements on the page
                    isExecuted = 'failure'
                    step = action.model_dump(exclude_none=True)
                    steps = await self._send_action_update(step, isExecuted, steps)
                    msg = f'Something new appeared after step {i} / {len(actions)}'
                    logger.info(msg)
                    error_info = {
                        "errorCount": 1,
                        "errorType": "NEW_ELEMENTS_ERROR",
                        "errorMessage": msg
                    }
                    await self._send_subgoal_update(subgoal_id, True, error_info=error_info)
                    results.append(SupatestActionResult(extracted_content=msg, include_in_memory=True, isExecuted='failure'))
                    break

            await self._raise_if_stopped_or_paused()

            # For actions that have an index, we need to get the element node to extract the locators
            element_node = None
            action_index = action.get_index()
            locator: str | None = None
            locator_english_value: str | None = None
            if action_index is not None:
                if action_index not in await self.browser_session.get_selector_map():
                    message = f'Element index {action_index} does not exist - retry or use alternative actions'
                    SupatestActionResult(error=message, isExecuted='failure')
                    raise Exception(message)
                
                element_node = await self.browser_session.get_dom_element_by_index(action_index)
                if element_node is None:
                    raise Exception(f'Element index {action_index} does not exist - retry or use alternative actions')
                logger.debug(f'Element node: {element_node}')
            
                element_handle = await self.browser_session.get_locate_element(element_node)
                if element_handle is None:
                    raise BrowserError(f'Element: {repr(element_node)} not found')
                
                locator_data = await element_handle.evaluate("el => window?.__agentLocatorGenerator__?.getLocatorData(el)", element_handle)
                if locator_data is not None:
                    locator = locator_data['locator']
                    locator_english_value = locator_data['locatorEnglishValue']
                else:
                    logger.warning("agentLocatorGenerator not available - locator data will be None")
                    locator = None
                    locator_english_value = None
                logger.info(f'🌟 Locator for action {i + 1}/{len(actions)}: {locator}')
                logger.info(f'🌟 Locator English Value for action {i + 1}/{len(actions)}: {locator_english_value}')

            result = await self.controller.act(
                action,
                self.browser_session,
                self.settings.page_extraction_llm,
                self.sensitive_data,
                self.settings.available_file_paths,
                context=self.context,
            )

            isExecuted = result.isExecuted 
            if locator and locator_english_value:
                action.set_locator(locator)
                action.set_locator_english_value(locator_english_value)
                

            step = action.model_dump(exclude_none=True)
            
            if(result.error):
                error_info = {
                    "errorCount": self.state.consecutive_failures,
                    "errorType": "ACTION_EXECUTION_ERROR",
                    "errorMessage": result.error
                }
                await self._send_subgoal_update(subgoal_id, True, error_info=error_info)
            
            
            
            # TODO: send the update of execution  and if error occurs send that also
            
            # Send update that the action has been executed with the result
            # The key change: update the steps variable with the returned updated steps
            steps = await self._send_action_update(step, isExecuted or 'success', steps)
            results.append(result)

            logger.debug(f'Executed action {i + 1} / {len(actions)}')
            if results[-1].is_done or results[-1].error or i == len(actions) - 1:
                break

            await asyncio.sleep(self.browser_profile.wait_between_actions)
            # hash all elements. if it is a subset of cached_state its fine - else break (new elements on page)

        return results



    # ALL SUPATEST CUSTOM METHODS
    async def _send_action_update(self, action, is_executed: str, steps: list[dict]) -> list[dict]:
        """
        Send action execution status update via websocket

        Args:
            action: The action that was executed
            is_executed: The execution status ('pending', 'success', 'failure')
            steps: List of all steps in the current sequence

        Returns:
            The updated steps list with execution status
        """
        if not self.send_message:
            return steps  # Return original steps if no message sending

        try:
            # Get the action type and details from the current action
            action_type = next(iter(action))  # Get the action type (e.g., 'input_text', 'click_element')
            action_details = action[action_type]
            
            # Check if action_details is None (can happen due to model serialization issues)
            if action_details is None:
                logger.warning(f"Action details are None for action type: {action_type}")
                return steps

            # Find and update the matching step
            for step in steps:
                step_type = next(iter(step))
                step_details = step[step_type]
                
                # Check if step_details is None
                if step_details is None:
                    continue
                
                # Match both the action type and the action details (using ID or other unique identifiers)
                if (step_type == action_type and 
                    step_details.get('index') == action_details.get('index')):
                    step[step_type]['isExecuted'] = is_executed
                    if action_details.get('locator'):
                        step[step_type]['locator'] = action_details.get('locator')
                    if action_details.get('locatorEnglishValue'):
                        step[step_type]['locatorEnglishValue'] = action_details.get('locatorEnglishValue')
                    break


            # Create simplified steps, handling cases where step values might be None
            simplified_steps = []
            for step in steps:
                if step and len(step) > 0:
                    step_values = list(step.values())
                    if step_values and step_values[0] is not None:
                        simplified_steps.append(step_values[0])
                    else:
                        logger.warning(f"Step has no valid values: {step}")
                else:
                    logger.warning(f"Empty or None step encountered: {step}")
            
            # Send the updated steps via websocket
            await self._send_message("AGENT_STEP_EXECUTED", {
                "steps": simplified_steps
            })

            return steps

        except Exception as e:
            logger.warning(f"Failed to send action update: {str(e)}")
            return steps  # Return original steps if there was an error
        
    async def _check_eval_failure(self, model_output: SupatestAgentOutput, step_info: AgentStepInfo | None = None) -> None:
        """Check if the evaluation of the previous goal failed"""
        if step_info and step_info.step_number > 0 and ('Failed' in model_output.current_state.evaluation_previous_goal or 'Unknown' in model_output.current_state.evaluation_previous_goal):
            self.consecutive_eval_failure += 1
        else:
            self.consecutive_eval_failure = 0
        
    async def _send_message(self, message_type: str, message_data: Any) -> None:
        """Send websocket messages if send_message callback is configured"""
        if not self.send_message:
            return
            
        try:
            message = {
                "type": message_type,
                "goalId": self.goal_step_id,
                "message": message_data if isinstance(message_data, dict) else {"message": str(message_data)}
            }
            await self.send_message(message)
        except Exception as e:
            logger.warning(f"Failed to send message: {str(e)}")   
            
    async def _send_subgoal_update(self, subgoal_id: str, is_error: bool, model_output: Optional[SupatestAgentOutput] = None, error_info: Optional[dict] = None) -> None:
        """Send subgoal update via websocket
        
        Args:
            subgoal_id: Unique identifier for the subgoal
            is_error: Flag indicating if this update is for an error
            model_output: The model output containing action and state info (required if is_error=False)
            error_info: Error information dictionary (required if is_error=True)
        """
        
        if self.send_message:
            subgoal_id_str = str(subgoal_id)
            if is_error:
                logger.info(f"📤 [ERROR] sending subgoal error update for {subgoal_id_str}")
                if not error_info:
                    raise ValueError("error_info is required when is_error=True")
                    
                await self._send_message("AGENT_SUB_GOAL_UPDATE", {
                    "subgoalId": subgoal_id_str,
                    "pageSummary": None,
                    "eval": None,
                    "memory": None,
                    "nextGoal": None,
                    "thought": None,
                    "steps": [],
                    "error": [error_info]
                })
            else:
                logger.info(f"📤 [ACTION-PLAN] sending subgoal update for {subgoal_id_str}")
                if not model_output:
                    raise ValueError("model_output is required when is_error=False")
                    
                steps = []
                for i, action in enumerate(model_output.action):
                    if action is not None:
                        step = action.model_dump(exclude_none=True)
                        steps.append(step)
                    else:
                        logger.warning(f"Action at index {i} is None in model_output.action")

                await self._send_message("AGENT_SUB_GOAL_UPDATE", {
                    "subgoalId": subgoal_id_str,
                    "pageSummary": model_output.current_state.page_summary,
                    "eval": model_output.current_state.evaluation_previous_goal,
                    "memory": model_output.current_state.memory,
                    "nextGoal": model_output.current_state.next_goal,
                    "thought": model_output.current_state.thought,
                    "steps": steps,
                    "error": None
                })


