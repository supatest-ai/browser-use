import asyncio
import json
import logging
import os
from typing import Dict, Optional
from urllib.parse import parse_qs

from aiohttp import web
from executor import Executor
from handler import Handler
from session_manager import SessionManager

from browser_use.logging_config import setup_logging

# Initialize logging
setup_logging()
logger = logging.getLogger("py_ws_server")

class Server:
    """
    Socket.IO server that handles automation setup and execution.
    Manages initial setup connections and subsequent Socket.IO automation.
    """

    def __init__(self):
        # Cloud Run will provide PORT as an environment variable.
        # Default to 8765 if not found.
        self.host = "0.0.0.0"
        self.port = int(os.getenv("PORT", "8765"))
        
        self.session_manager = SessionManager()
        self.handler = Handler(self.session_manager)
        self.executor = Executor(self.handler)
        
        self.app = self.handler.app
        self.app.router.add_get('/health', self.health_check)
        
        self.sio = self.handler.sio
        self._setup_setup_connection_handler()

    def _setup_setup_connection_handler(self):
        @self.sio.on("setup_connection")
        async def handle_setup_connection(sid, data):
            environ = await self.session_manager.get_connection_environment(sid)
            await self._handle_setup_connection(sid, data, environ)

    async def start(self):
        """
        Start the Socket.IO server
        """
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, host=self.host, port=self.port)
        await site.start()
        logger.info(f"Setup server running on http://{self.host}:{self.port}")
        # Keep the server running forever
        await asyncio.Event().wait()

    async def _handle_setup_connection(self, sid, data, environ):
        """
        Parse the setup data from the Socket.IO event, identify goalId from query,
        and proceed with storing and automation logic.
        """
        try:
            # 1) Parse setup message
            setup_data = self._parse_setup_message(data)

            # 2) Extract goalId from query string
            goal_id = self._extract_goal_id(environ)

            # 3) Store setup data
            await self.session_manager.store_automation_setup(goal_id, setup_data)

            # 4) Get requestId
            requestId = setup_data.get("requestId")
            if requestId is None:
                raise ValueError("requestId cannot be None")

            # 5) Send success response
            await self.handler.emit_setup_success(sid, requestId)

            # 6) Start automation
            await self.executor.run_automation(goal_id, await self.session_manager.get_automation_setup(goal_id))

        except Exception as e:
            logger.error(f"Setup connection failed: {str(e)}", exc_info=True)
            await self.handler.emit_setup_error(sid, str(e))

    def _parse_setup_message(self, data) -> dict:
        """
        In Socket.IO, 'data' is usually already parsed JSON.
        Handle nested 'data' if needed.
        """
        if isinstance(data, dict) and 'data' in data:
            try:
                return json.loads(data['data'])
            except json.JSONDecodeError:
                return data['data']
        return data

    def _extract_goal_id(self, environ) -> str:
        if not environ:
            raise ValueError("No environ data found for this connection")

        qs = environ.get('QUERY_STRING', '')
        parsed = parse_qs(qs)
        goal_id = parsed.get('goalId', [None])[0]
        if not goal_id:
            raise ValueError("Missing 'goalId' in query string")
        return goal_id

    async def health_check(self, request):
        return web.Response(text='OK', status=200)

def main():
    """Initialize and start the automation server using Socket.IO"""
    server = Server()
    asyncio.run(server.start())

if __name__ == "__main__":
    main()
