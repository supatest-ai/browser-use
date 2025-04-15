import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio

from dotenv import load_dotenv
from langchain_openai import AzureChatOpenAI

from supatest.agent.service import SupatestAgent

load_dotenv()

# Initialize the model
llm = AzureChatOpenAI(
	model='gpt-4o',
	temperature=0.0,
)
task = 'Go to kayak.com and find the cheapest flight from Zurich to San Francisco on 2025-05-01'

agent = SupatestAgent(task=task, llm=llm)


async def main():
	await agent.run()


if __name__ == '__main__':
	asyncio.run(main())
