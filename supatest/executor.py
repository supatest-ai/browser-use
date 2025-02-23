import json
import logging
import os
from typing import Optional

import socketio
from langchain_openai import AzureChatOpenAI

from browser_use import Agent
from browser_use.browser.browser import Browser, BrowserConfig

logger = logging.getLogger("py_ws_server")

class Executor:
    def __init__(self, handler):
        self.handler = handler

    def _build_automation_uri(self, goal_id: str, setup_data) -> str:
        base_url = os.getenv("AUTOMATION_BASE_URL", "http://localhost:8877")
        return (
            f"{base_url}?type=agent&goalId={goal_id}"
            f"&testCaseId={setup_data.test_case_id}"
        )

    async def execute_automation(
        self,
        automation_uri: str,
        connection_url: str,
        task: str,
        goal_id: str,
        requestId: str,
        testCaseId: str,
        sensitiveData: Optional[dict] = None
    ):
        sio = socketio.AsyncClient()
        try:
            await sio.connect(automation_uri, transports=["websocket"], namespaces=['/'])
            
            async def send_message(msg: dict) -> bool:
                try:
                    await sio.emit("message", json.dumps(msg), namespace='/', callback=True)
                    return True
                except Exception as e:
                    logger.error(f"Failed to send message: {str(e)}")
                    return False

            # Initialize browser with received connection URL
            browser = Browser(
                config=BrowserConfig(
                    headless=False,
                    cdp_url=connection_url,
                )
            )
            
            # Initialize agent with modified AzureChatOpenAI settings
            model = AzureChatOpenAI(
                model='gpt-4o',
                api_version='2024-10-21',
                model_kwargs={
                    "extra_headers": {
                        "Azure-Content-Safety-Action": "warn",
                        "Azure-Content-Safety-Policy-Version": "2024-01-01"
                    }
                },
                temperature=0.7,
            )
            
            agent = Agent(
                task=task,
                llm=model,
                browser=browser,
                send_message=send_message,
                goal_step_id=goal_id,
                requestId=requestId,
                testCaseId=testCaseId,
                sensitive_data=sensitiveData
            )
            
            # Run the automation task
            await agent.run()
            logger.info("Automation completed successfully")

        except Exception as e:
            logger.error(f"Automation failed: {str(e)}", exc_info=True)
            await self.handler.emit_automation_error(sio, goal_id, str(e), requestId, testCaseId)
        finally:
            logger.info("Disconnecting from automation")
            try:
                await sio.disconnect()
            except Exception as e:
                logger.error(f"Error during disconnect: {str(e)}")

    async def run_automation(self, goal_id: str, setup_data):
        try:
            if not setup_data:
                raise ValueError("Setup data not found")

            automation_uri = self._build_automation_uri(goal_id, setup_data)
            
            await self.execute_automation(
                automation_uri,
                setup_data.connection_url,
                setup_data.task,
                goal_id,
                setup_data.request_id,
                setup_data.test_case_id,
                setup_data.sensitive_data
            )
        except Exception as e:
            logger.error(f"Automation failed: {str(e)}", exc_info=True)
            await self.handler.emit_automation_error(
                None, goal_id, str(e), setup_data.request_id, setup_data.test_case_id
            ) 