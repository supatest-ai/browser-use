import json
import os
import sys
import time
from typing import List, Optional

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio

from dotenv import load_dotenv
from langchain_openai import AzureChatOpenAI
from pydantic import BaseModel

from browser_use import ActionResult, Agent, Controller
from browser_use.browser.browser import Browser, BrowserConfig
from browser_use.browser.context import BrowserContext


async def run_automation(connection_url, task, send_message, goal_step_id, requestId, testCaseId, sensitiveData):
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
            goal_step_id=goal_step_id,
            requestId=requestId,
            testCaseId=testCaseId,
            sensitive_data=sensitiveData
        )
        
        # Run the automation task
        await agent.run() 