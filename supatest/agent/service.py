from __future__ import annotations


import asyncio
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Generic, List, Optional, TypeVar, Sequence

from browser_use.agent.gif import create_history_gif
from browser_use.agent.message_manager.utils import extract_json_from_model_output, save_conversation
from dotenv import load_dotenv
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import (
	BaseMessage,
	HumanMessage,
	SystemMessage,
)

# from lmnr.sdk.decorators import observe
from pydantic import BaseModel, ValidationError

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage

from browser_use.agent.service import Agent
from browser_use.agent.views import ActionResult
from browser_use.telemetry.views import AgentEndTelemetryEvent, AgentStepTelemetryEvent
from browser_use.agent.views import AgentStepInfo, StepMetadata, AgentHistoryList
from browser_use.agent.prompts import SystemPrompt, AgentMessagePrompt
from browser_use.agent.message_manager.service import MessageManager, MessageManagerSettings

from supatest.agent.views import SupatestAgentOutput, SupatestAgentBrain, SupatestAgentHistoryList
from supatest.controller.registry.views import SupatestActionModel

from supatest.browser.browser import SupatestBrowser
from supatest.browser.context import SupatestBrowserContext
from supatest.browser.views import SupatestBrowserState
from supatest.controller.service import SupatestController

logger = logging.getLogger(__name__)

Context = TypeVar('Context')

class SupatestAgent(Agent[Context]):
    """Extended Agent class with custom implementations"""

    browser_context: SupatestBrowserContext
    controller: SupatestController[Context]

    def __init__(
        self,
        task: str,
        llm: BaseChatModel,
        browser: SupatestBrowser | None = None,
        browser_context: SupatestBrowserContext | None = None,
        controller: SupatestController[Context] = SupatestController(),
        sensitive_data: Optional[Dict[str, str]] = None,
        initial_actions: Optional[List[Dict[str, Dict[str, Any]]]] = None,
        register_new_step_callback: Callable[['SupatestBrowserState', 'SupatestAgentOutput', int], Awaitable[None]] | None = None,
        register_done_callback: Callable[['SupatestAgentHistoryList'], Awaitable[None]] | None = None,
        register_external_agent_status_raise_error_callback: Callable[[], Awaitable[bool]] | None = None,
        send_message: Optional[Callable[[dict], Awaitable[bool]]] = None,
        goal_step_id: Optional[str] = None,
        requestId: Optional[str] = None,
        testCaseId: Optional[str] = None,
        **kwargs
    ):
        # Get custom action descriptions from our registry before calling super().__init__
        # This ensures our custom actions are used throughout initialization
        controller_registry = controller.registry
        available_actions = controller_registry.get_prompt_description()
        
        super().__init__(
            task=task,
            llm=llm,
            browser=browser,
            browser_context=browser_context,
            controller=controller,
            sensitive_data=sensitive_data,
            initial_actions=initial_actions,
            register_new_step_callback=register_new_step_callback,
            register_done_callback=register_done_callback,
            register_external_agent_status_raise_error_callback=register_external_agent_status_raise_error_callback,
            **kwargs
        )
        self.send_message = send_message
        self.goal_step_id = goal_step_id
        self.requestId = requestId
        self.testCaseId = testCaseId

        # Store our custom action descriptions
        self.available_actions = available_actions
        
        # Reinitialize the message manager with our custom action descriptions
        self._message_manager = MessageManager(
            task=task,
            system_message=SystemPrompt(
                action_description=self.available_actions,
                max_actions_per_step=self.settings.max_actions_per_step,
                override_system_message=self.settings.override_system_message,
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
        """Setup dynamic action models from controller's registry using our extended AgentOutput"""
        self.ActionModel = self.controller.registry.create_action_model()
        # print("-----ActionModel-----")
        # print(self.ActionModel.schema())
        # print("-----ActionModel-----")
        self.AgentOutput = SupatestAgentOutput.type_with_custom_actions(self.ActionModel)
        # print("-----AgentOutput-----")
        # print(self.AgentOutput.schema())
        # print("-----AgentOutput-----")
        self.DoneActionModel = self.controller.registry.create_action_model(include_actions=['done'])
 
        self.DoneAgentOutput = SupatestAgentOutput.type_with_custom_actions(self.DoneActionModel)
      

    async def get_next_action(self, input_messages: list[BaseMessage]) -> SupatestAgentOutput:
        """Get next action from LLM based on current state"""
        input_messages = self._convert_input_messages(input_messages)

        if self.tool_calling_method == 'raw':
            output = self.llm.invoke(input_messages)
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
            response: dict[str, Any] = await structured_llm.ainvoke(input_messages)  # type: ignore
            parsed: SupatestAgentOutput | None = response['parsed']
        else:
            structured_llm = self.llm.with_structured_output(self.AgentOutput, include_raw=True, method=self.tool_calling_method)
            response: dict[str, Any] = await structured_llm.ainvoke(input_messages)
            parsed: SupatestAgentOutput | None = response['parsed']

        if parsed is None:
            raise ValueError('Could not parse response.')
        
        state = await self.browser_context.get_state()
        
        # Add supatest locator IDs to actions
        for action in parsed.action:
            index = action.get_index()
            if index is not None and index in state.selector_map:
                element = state.selector_map[index]
                if element.supatest_locator_id:
                    action.set_supatest_locator_id(element.supatest_locator_id)

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
            step = json.loads(action.model_dump_json(exclude_unset=True))
            steps.append(step)
            logger.info(f'🛠️  Action {i + 1}/{len(response.action)}: {action.model_dump_json(exclude_unset=True)}')

        # Create error info if there are failures
        error_info = None
        if self.state.last_result and any(r.error for r in self.state.last_result):
            error_info = {
                "errorCount": self.state.consecutive_failures,
                "errorType": "action_execution",
                "errorMessage": "; ".join([r.error for r in self.state.last_result if r.error])
            }

        # Send single websocket message with all data
        if self.send_message:
            await self._send_message("AGENT_SUB_GOAL_UPDATE", {
                "pageSummary": response.current_state.page_summary,
                "eval": response.current_state.evaluation_previous_goal,
                "memory": response.current_state.memory,
                "nextGoal": response.current_state.next_goal,
                "thought": response.current_state.thought,
                "steps": steps,
                "error": error_info
            })

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

    async def _too_many_failures(self) -> bool:
        """Check if we should stop due to too many failures"""
        if self.state.consecutive_failures >= self.settings.max_failures:
            if self.send_message:
                await self._send_message("AGENT_GOAL_STOP_RES", {
                    "requestId": self.requestId,
                    "testCaseId": self.testCaseId,
                    "success": False,
                    "error": f"Stopping due to {self.settings.max_failures} consecutive failures"
                })
            logger.error(f'❌ Stopping due to {self.settings.max_failures} consecutive failures')
            return True
        return False

    async def step(self, step_info: Optional[AgentStepInfo] = None) -> None:
        """Execute one step of the task with custom error handling and messaging"""
        logger.info(f'📍 Step {self.state.n_steps}')
        state = None
        model_output = None
        result: list[ActionResult] = []
        step_start_time = time.time()
        tokens = 0

        try:
            state = await self.browser_context.get_state()
            await self._raise_if_stopped_or_paused()

            self._message_manager.add_state_message(state, self.state.last_result, step_info, self.settings.use_vision)

            # Run planner at specified intervals if planner is configured
            if self.settings.planner_llm and self.state.n_steps % self.settings.planner_interval == 0:
                plan = await self._run_planner()
                self._message_manager.add_plan(plan, position=-1)

            if step_info and step_info.is_last_step():
                # Add last step warning if needed
                msg = 'Now comes your last step. Use only the "done" action now. No other actions - so here your action sequence musst have length 1.'
                msg += '\nIf the task is not yet fully finished as requested by the user, set success in "done" to false! E.g. if not all steps are fully completed.'
                msg += '\nIf the task is fully finished, set success in "done" to true.'
                msg += '\nInclude everything you found out for the ultimate task in the done text.'
                logger.info('Last step finishing up')
                self._message_manager._add_message_with_tokens(HumanMessage(content=msg))
                self.AgentOutput = self.DoneAgentOutput

            input_messages = self._message_manager.get_messages()
            tokens = self._message_manager.state.history.current_tokens

            try:
                model_output = await self.get_next_action(input_messages)
                await self._log_response(model_output)

                if self.register_new_step_callback:
                    await self.register_new_step_callback(state, model_output, self.state.n_steps)

                if self.settings.save_conversation_path:
                    target = self.settings.save_conversation_path + f'_{self.state.n_steps}.txt'
                    save_conversation(input_messages, model_output, target, self.settings.save_conversation_path_encoding)

                self._message_manager._remove_last_state_message()
                await self._raise_if_stopped_or_paused()
                self._message_manager.add_model_output(model_output)

            except Exception as e:
                self._message_manager._remove_last_state_message()
                error_str = str(e)
                if "ResponsibleAIPolicyViolation" in error_str or "content_filter" in error_str:
                    if self.send_message:
                        await self._send_message("error", "The AI has encountered a policy violation. Please ensure that the request complies with the content guidelines.")
                self.state.last_result = [ActionResult(error=error_str, include_in_memory=True)]
                raise e

            result = await self.multi_act(model_output.action)
            self.state.last_result = result

            if len(result) > 0 and result[-1].is_done:
                logger.info(f'📄 Result: {result[-1].extracted_content}')

            self.state.consecutive_failures = 0

        except InterruptedError:
            logger.debug('Agent paused')
            self.state.last_result = [
                ActionResult(error='The agent was paused - now continuing actions might need to be repeated', include_in_memory=True)
            ]
            return
        except Exception as e:
            result = await self._handle_step_error(e)
            self.state.last_result = result
            error_str = str(e)
            
            if "ResponsibleAIPolicyViolation" in error_str or "content_filter" in error_str:
                if self.send_message:
                    await self._send_message("error", "The AI has encountered a policy violation.")
                    await self._send_message("AGENT_GOAL_STOP_RES", {
                        "requestId": self.requestId,
                        "testCaseId": self.testCaseId,
                        "success": False,
                        "error": "AI policy violation"
                    })

        finally:
            step_end_time = time.time()
            actions = [a.model_dump(exclude_unset=True) for a in model_output.action] if model_output else []
            self.telemetry.capture(
                AgentStepTelemetryEvent(
                    agent_id=self.state.agent_id,
                    step=self.state.n_steps,
                    actions=actions,
                    consecutive_failures=self.state.consecutive_failures,
                    step_error=[r.error for r in result if r.error] if result else ['No result'],
                )
            )

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

    async def run(self, max_steps: int = 100) -> SupatestAgentHistoryList:
        """Execute the task with maximum number of steps and custom completion handling"""
        try:
            self._log_agent_run()

            if self.initial_actions:
                result = await self.multi_act(self.initial_actions, check_for_new_elements=False)
                self.state.last_result = result

            for step in range(max_steps):
                if self.state.consecutive_failures >= self.settings.max_failures:
                    logger.error(f'❌ Stopping due to {self.settings.max_failures} consecutive failures')
                    break

                if self.state.stopped:
                    logger.info('Agent stopped')
                    break

                while self.state.paused:
                    await asyncio.sleep(0.2)
                    if self.state.stopped:
                        break

                step_info = AgentStepInfo(step_number=step, max_steps=max_steps)
                await self.step(step_info)

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
                logger.info('❌ Failed to complete task in maximum steps')
                if self.send_message:
                    await self._send_message("AGENT_GOAL_STOP_RES", {
                        "requestId": self.requestId,
                        "testCaseId": self.testCaseId,
                        "success": False,
                        "error": "Failed to complete task in maximum steps"
                    })

            return self.state.history

        finally:
            await self._cleanup(max_steps)

    async def _cleanup(self, max_steps: int) -> None:
        """Cleanup resources and generate final artifacts"""
        logger.info('🔄 Cleaning up...')
        self.telemetry.capture(
				AgentEndTelemetryEvent(
					agent_id=self.state.agent_id,
					is_done=self.state.history.is_done(),
					success=self.state.history.is_successful(),
					steps=self.state.n_steps,
					max_steps_reached=self.state.n_steps >= max_steps,
					errors=self.state.history.errors(),
					total_input_tokens=self.state.history.total_input_tokens(),
					total_duration_seconds=self.state.history.total_duration_seconds(),
				)
			)
        
        if not self.injected_browser_context:
            await self.browser_context.close()

        if not self.injected_browser and self.browser:
            await self.browser.close()

        if self.settings.generate_gif:
            output_path = 'agent_history.gif'
            if isinstance(self.settings.generate_gif, str):
                output_path = self.settings.generate_gif
            create_history_gif(task=self.task, history=self.state.history, output_path=output_path) 

    async def multi_act(
        self,
        actions: Sequence[SupatestActionModel],
        check_for_new_elements: bool = True,
    ) -> list[ActionResult]:
        """Execute multiple actions with SupatestActionModel type"""
        results = []

        cached_selector_map = await self.browser_context.get_selector_map()
        cached_path_hashes = set(e.hash.branch_path_hash for e in cached_selector_map.values())

        await self.browser_context.remove_highlights()

        for i, action in enumerate(actions):
            if action.get_index() is not None and i != 0:
                new_state = await self.browser_context.get_state()
                new_path_hashes = set(e.hash.branch_path_hash for e in new_state.selector_map.values())
                if check_for_new_elements and not new_path_hashes.issubset(cached_path_hashes):
                    # next action requires index but there are new elements on the page
                    msg = f'Something new appeared after action {i} / {len(actions)}'
                    logger.info(msg)
                    results.append(ActionResult(extracted_content=msg, include_in_memory=True))
                    break

            await self._raise_if_stopped_or_paused()

            result = await self.controller.act(
                action,
                self.browser_context,
                self.settings.page_extraction_llm,
                self.sensitive_data,
                self.settings.available_file_paths,
                context=self.context,
            )

            results.append(result)

            logger.debug(f'Executed action {i + 1} / {len(actions)}')
            if results[-1].is_done or results[-1].error or i == len(actions) - 1:
                break

            await asyncio.sleep(self.browser_context.config.wait_between_actions)
            # hash all elements. if it is a subset of cached_state its fine - else break (new elements on page)

        return results 