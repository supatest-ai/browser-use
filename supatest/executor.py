import json
import logging
import os
from typing import Optional
import asyncio

import socketio
from langchain_openai import AzureChatOpenAI
from browser_use.browser.browser import BrowserConfig

from supatest.agent.service import SupatestAgent
from supatest.browser.browser import SupatestBrowser
from supatest.browser.context import SupatestBrowserContext

logger = logging.getLogger("py_ws_server")


class Executor:
    def __init__(self, handler):
        self.handler = handler
        # We'll hold references to the agent and its background task
        self.agent = None
        self.agent_task = None
        # We'll store the Socket.IO client so we can disconnect later
        self.sio = None

    def _build_automation_uri(self, goal_id: str, setup_data) -> str:
        base_url = os.getenv("AUTOMATION_BASE_URL", "http://localhost:8877")
        return (
            f"{base_url}?type=agent&goalId={goal_id}"
            f"&testCaseId={setup_data.test_case_id}"
        )

    async def stop_agent(self):
        """
        Stop the agent by calling `agent.stop()` and canceling the task if it exists.
        """
        if self.agent:
            await self.agent.stop()
        if self.agent_task:
            self.agent_task.cancel()

    async def execute_automation(
        self,
        automation_uri: str,
        connection_url: str,
        task: str,
        goal_id: str,
        requestId: str,
        testCaseId: str,
        sensitiveData: Optional[dict] = None,
    ):
        """
        Connects to the automation server, sets up the agent, and starts the agent in the background.
        The agent will run until completion, or until we receive a stop message via Socket.IO.
        """
        self.sio = socketio.AsyncClient()

        try:
            # Connect to the server
            await self.sio.connect(
                automation_uri, transports=["websocket"], namespaces=["/"]
            )

            async def send_message(msg: dict) -> bool:
                """
                Helper for sending messages via Socket.IO.
                """
                try:
                    await self.sio.emit("message", json.dumps(msg), namespace="/", callback=True)
                    return True
                except Exception as e:
                    logger.error(f"Failed to send message: {str(e)}")
                    return False

            @self.sio.on("message", namespace="/")
            async def handle_incoming_message(msg_str):
                """
                If we receive a stop request from the server, stop the agent.
                """
                try:
                    msg = json.loads(msg_str)
                except Exception as ex:
                    logger.error(f"Error parsing incoming message: {str(ex)}")
                    return

                msg_type = msg.get("type")
                if msg_type == "AGENT_GOAL_STOP_REQ":
                    logger.info(
                        f"Received stop request from server for goal {goal_id}, "
                        f"requestId {requestId}, testCaseId {testCaseId}"
                    )
                    await self.stop_agent()

            # Prepare the browser
            browser = SupatestBrowser(
                config=BrowserConfig(
                    headless=False,
                    cdp_url=connection_url,
                )
            )
            browser_context = SupatestBrowserContext(browser=browser)

            # Configure the language model
            model = AzureChatOpenAI(
                model="gpt-4o",
                api_version="2024-10-21",
                model_kwargs={
                    "extra_headers": {
                        "Azure-Content-Safety-Action": "warn",
                        "Azure-Content-Safety-Policy-Version": "2024-01-01",
                    }
                },
                temperature=0.7,
            )

            # Build the agent
            self.agent = SupatestAgent(
                task=task,
                llm=model,
                browser=browser,
                browser_context=browser_context,
                send_message=send_message,
                goal_step_id=goal_id,
                requestId=requestId,
                testCaseId=testCaseId,
                sensitive_data=sensitiveData,
            )

            # Start the agent in the background
            logger.info("🤖 Starting the Supatest Agent task...")
            self.agent_task = asyncio.create_task(self.agent.run())

            # Wait for the agent to finish (either completes its task or is stopped)
            await self.agent_task

            logger.info("Agent run completed or was stopped.")

            # Small delay for final messages
            await asyncio.sleep(1)

        except Exception as e:
            logger.error(f"Automation failed: {str(e)}", exc_info=True)
            # Notify the handler about the error
            await self.handler.emit_automation_error(self.sio, goal_id, str(e), requestId, testCaseId)
            await asyncio.sleep(1)
        finally:
            logger.info("Disconnecting from automation")
            if self.sio.connected:
                try:
                    await self.sio.disconnect()
                except Exception as e:
                    logger.error(f"Error during disconnect: {str(e)}")

    async def run_automation(self, goal_id: str, setup_data):
        """
        Called externally to start the entire flow.
        """
        try:
            if not setup_data:
                raise ValueError("Setup data not found")

            automation_uri = self._build_automation_uri(goal_id, setup_data)

            await self.execute_automation(
                automation_uri=automation_uri,
                connection_url=setup_data.connection_url,
                task=setup_data.task,
                goal_id=goal_id,
                requestId=setup_data.request_id,
                testCaseId=setup_data.test_case_id,
                sensitiveData=setup_data.sensitive_data,
            )
        except Exception as e:
            logger.error(f"Automation failed: {str(e)}", exc_info=True)
            await self.handler.emit_automation_error(
                None, goal_id, str(e), setup_data.request_id, setup_data.test_case_id
            )
