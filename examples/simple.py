import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from langchain_openai import AzureChatOpenAI

from supatest.agent.service import SupatestAgent

# Initialize the model
llm = AzureChatOpenAI(
	model='gpt-4o',
	temperature=0.0,
)
task = 'Go to kayak.com and find the cheapest one-way flight from Zurich to San Francisco in 3 weeks.'
agent = Agent(task=task, llm=llm)


async def main():
	await agent.run()


if __name__ == '__main__':
	asyncio.run(main())
