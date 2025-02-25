from __future__ import annotations


import asyncio
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Generic, List, Optional, TypeVar

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

from browser_use.agent.service import Agent as BaseAgent
from supatest.agent.views import ActionResult
from supatest.browser.browser import SupatestBrowser as Browser

from supatest.browser.context import SupatestBrowserContext as BrowserContext
from supatest.browser.views import SupatestBrowserState as BrowserState
from supatest.controller.service import SupatestController as Controller
from browser_use.telemetry.views import AgentStepTelemetryEvent
from supatest.agent.views import AgentOutput, AgentStepInfo
from browser_use.agent.prompts import SystemPrompt, AgentMessagePrompt

logger = logging.getLogger(__name__)

Context = TypeVar('Context')

class Agent(BaseAgent[Context]):
    """Extended Agent class with custom implementations"""

    def __init__(
        self,
        task: str,
        llm: BaseChatModel,
        browser: Browser | None = None,
        browser_context: BrowserContext | None = None,
        controller: Controller[Context] = Controller(),
        sensitive_data: Optional[Dict[str, str]] = None,
        initial_actions: Optional[List[Dict[str, Dict[str, Any]]]] = None,
        register_new_step_callback: Callable[['BrowserState', 'AgentOutput', int], Awaitable[None]] | None = None,
        register_done_callback: Callable[['AgentHistoryList'], Awaitable[None]] | None = None,
        register_external_agent_status_raise_error_callback: Callable[[], Awaitable[bool]] | None = None,
        send_message: Optional[Callable[[dict], Awaitable[bool]]] = None,
        goal_step_id: Optional[str] = None,
        requestId: Optional[str] = None,
        testCaseId: Optional[str] = None,
        **kwargs
    ):
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

    async def get_next_action(self, input_messages: list[BaseMessage]) -> AgentOutput:
        """Get next action from LLM based on current state with custom handling"""
        converted_input_messages = self._convert_input_messages(input_messages)

        if self.model_name == 'deepseek-reasoner' or self.model_name.startswith('deepseek-r1'):
            output = self.llm.invoke(converted_input_messages)
            print(f"output: {output}")
            output.content = self._remove_think_tags(str(output.content))
            print(f"output.content: {output.content}")
            try:
                parsed_json = self._message_manager.extract_json_from_model_output(output.content)
                print(f"parsed_json: {parsed_json}")
                parsed = self.AgentOutput(**parsed_json)
                print(f"parsed: {parsed}")
            except (ValueError, ValidationError) as e:
                logger.warning(f'Failed to parse model output: {output} {str(e)}')
                raise ValueError('Could not parse response.')
        else:
            structured_llm = self.llm.with_structured_output(self.AgentOutput, include_raw=True, method=self.tool_calling_method)
            response: dict[str, Any] = await structured_llm.ainvoke(input_messages)
            parsed: AgentOutput | None = response['parsed']
            print(f"response: {response}")
            print(f"parsed: {parsed}")

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

        await self._log_response(parsed)
        return parsed

    async def _log_response(self, response: AgentOutput) -> None:
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

            try:
                model_output = await self.get_next_action(self._message_manager.get_messages())

                if self.register_new_step_callback:
                    await self.register_new_step_callback(state, model_output, self.state.n_steps)

                self._message_manager._remove_last_state_message()
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

            if state and model_output and result:
                metadata = StepMetadata(
                    step_number=self.state.n_steps,
                    step_start_time=step_start_time,
                    step_end_time=step_end_time,
                    input_tokens=tokens,
                )
                self._make_history_item(model_output, state, result, metadata)

    async def run(self, max_steps: int = 100) -> AgentHistoryList:
        """Execute the task with maximum number of steps and custom completion handling"""
        try:
            self._log_agent_run()

            if self.initial_actions:
                result = await self.multi_act(self.initial_actions, check_for_new_elements=False)
                self.state.last_result = result

            for step in range(max_steps):
                if await self._too_many_failures():
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

                    logger.info('✅ Task completed successfully')
                    if self.send_message:
                        await self._send_message("AGENT_GOAL_STOP_RES", {
                            "requestId": self.requestId,
                            "testCaseId": self.testCaseId,
                            "success": True,
                            "error": None,
                        })
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
            await self._cleanup()

    async def _cleanup(self) -> None:
        """Cleanup resources and generate final artifacts"""
        if not self.injected_browser_context:
            await self.browser_context.close()

        if not self.injected_browser and self.browser:
            await self.browser.close()

        if self.settings.generate_gif:
            output_path = 'agent_history.gif'
            if isinstance(self.settings.generate_gif, str):
                output_path = self.settings.generate_gif
            create_history_gif(task=self.task, history=self.state.history, output_path=output_path) 