import asyncio
import json
import logging
import os
from typing import Dict, Optional
from urllib.parse import parse_qs

import socketio
from aiohttp import web
from automation_executor import run_automation
from automation_session import AutomationSessionManager

from browser_use.logging_config import setup_logging

# Initialize logging
setup_logging()
logger = logging.getLogger("py_ws_server")

class AutomationServer:
    """
    Socket.IO server that handles automation setup and execution.
    Manages initial setup connections and subsequent Socket.IO automation.
    """

    def __init__(self):
        # Cloud Run will provide PORT as an environment variable.
        # Default to 8765 if not found.
        self.host = "0.0.0.0"
        self.port = int(os.getenv("PORT", "8765"))
        self.session_manager = AutomationSessionManager()

        # Create an AsyncServer instance
        self.sio = socketio.AsyncServer(
            async_mode='aiohttp',
            cors_allowed_origins="*"
        )
        # Attach server to an aiohttp web application
        self.app = web.Application()
        self.sio.attach(self.app)

        # Add health check route
        self.app.router.add_get('/health', self.health_check)

        # Register events
        @self.sio.on('connect', namespace='/')
        async def connect(sid, environ, auth):
            logger.info(f"Client connected: {sid}")
            await self.session_manager.store_connection_environment(sid, environ)
        
        @self.sio.on('disconnect', namespace='/')
        async def disconnect(sid):
            logger.info(f"Client disconnected: {sid}")
            await self.session_manager.remove_connection_environment(sid)

        @self.sio.on("setup_connection")
        async def handle_setup_connection(sid, data):
            """
            Receives the setup data and triggers the automation logic.
            """
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
            if not environ:
                raise ValueError("No environ data found for this connection")

            qs = environ.get('QUERY_STRING', '')
            parsed = parse_qs(qs)
            goal_id = parsed.get('goalId', [None])[0]
            if not goal_id:
                raise ValueError("Missing 'goalId' in query string")

            # 3) Store setup data
            await self.session_manager.store_automation_setup(goal_id, setup_data)

            # 4) Get requestId
            requestId = setup_data.get("requestId")
            if requestId is None:
                raise ValueError("requestId cannot be None")

            # 5) Send success response
            await self._send_success_response(sid, requestId)

            # 6) Start automation
            await self._run_automation(goal_id)

        except Exception as e:
            logger.error(f"Setup connection failed: {str(e)}", exc_info=True)
            await self.sio.emit("setup_error", {"error": str(e)}, to=sid)
            await self.sio.disconnect(sid)

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

    async def _send_success_response(self, sid, requestId: str):
        """
        Send success response to the TS client, then optionally disconnect.
        """
        await self.sio.emit(
            "setup_success",
            {
                "type": "AGENT_GOAL_START_RES",
                "requestId": requestId
            },
            to=sid
        )
        await self.sio.disconnect(sid)

    async def _run_automation(self, goal_id: str):
        """
        Initialize and run the automation process
        """
        async with self.session_manager.goal_session(goal_id) as setup_data:
            try:
                if not setup_data:
                    raise ValueError("Setup data not found")

                automation_uri = self._build_automation_uri(goal_id, setup_data)
                
                await self._execute_automation(
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
                await self._handle_automation_error(
                    None, goal_id, str(e), setup_data.request_id, setup_data.test_case_id
                )

    def _build_automation_uri(self, goal_id: str, setup_data) -> str:
        """
        Build the Socket.IO automation URI with query params
        """
        base_url = os.getenv("AUTOMATION_BASE_URL", "http://localhost:8877")  # Default to localhost if not set
        return (
            f"{base_url}?type=agent&goalId={goal_id}"
            f"&testCaseId={setup_data.test_case_id}"
        )

    async def _execute_automation(
        self,
        automation_uri: str,
        connection_url: str,
        task: str,
        goal_id: str,
        requestId: str,
        testCaseId: str,
        sensitiveData: Optional[dict] = None
    ):
        """
        Use a separate Socket.IO AsyncClient to connect to the TS server on port 8877
        for the actual automation.
        """
        sio = socketio.AsyncClient()
        try:
            # Connect with explicit namespace
            await sio.connect(automation_uri, transports=["websocket"], namespaces=['/'])
            
            async def send_message(msg: dict) -> bool:
                try:
                    # Specify namespace when emitting
                    await sio.emit("message", json.dumps(msg), namespace='/', callback=True)
                    return True
                except Exception as e:
                    logger.error(f"Failed to send message: {str(e)}")
                    return False

            # Run the actual automation
            success = await run_automation(
                connection_url, task, send_message, goal_id, requestId, testCaseId, sensitiveData
            )
            logger.info(f"Automation completed with success: {success}")

        except Exception as e:
            logger.error(f"Automation failed: {str(e)}", exc_info=True)
            await self._handle_automation_error(sio, goal_id, str(e), requestId, testCaseId)
        finally:
            logger.info("Disconnecting from automation")
            try:
                await sio.disconnect()
            except Exception as e:
                logger.error(f"Error during disconnect: {str(e)}")

    async def _handle_automation_error(self, sio, goal_id: str, error_msg: str, requestId: str, testCaseId: str):
        """
        Send an error message to the TS server if automation fails.
        """
        try:
            if sio:
                error_message = {
                    "type": "AGENT_GOAL_STOP_RES",
                    "goalId": goal_id,
                    "requestId": requestId,
                    "testCaseId": testCaseId,
                    "error": error_msg,
                    "success": False
                }
                await sio.emit("message", json.dumps(error_message), namespace='/', callback=True)
                logger.info("Error message sent successfully")
        except Exception as e:
            logger.error(f"Failed to send error message: {str(e)}", exc_info=True)

    async def health_check(self, request):
        return web.Response(text='OK', status=200)

def main():
    """Initialize and start the automation server using Socket.IO"""
    server = AutomationServer()
    asyncio.run(server.start())

if __name__ == "__main__":
    main()
