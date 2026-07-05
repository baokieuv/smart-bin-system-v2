import json
import logging
import time
from urllib.parse import urlparse

import paho.mqtt.client as mqtt

from src.utils.config import APP_CONFIG
from typing import Callable
from src.repository.actuator_repository import ActuatorRepository


class ThingsboardClient:
    """MQTT-over-WebSockets client for sending telemetry to ThingsBoard.

    Connects using WSS to host `thingsboard.kvbhust.id.vn` (default) on port 443
    with path `/mqtt`. The device access token is supplied as the MQTT
    username and an empty password. TLS is enabled and `clean_session=True`.
    """

    def __init__(self,
                 host: str | None = None,
                 port: int = 443,
                 path: str = "/mqtt",
                 keepalive: int = 60,
                 tls_enabled: bool = True,
                 client_id: str = "",
                 connect_timeout: int = 5,
                 handler: Callable | None = None,
                 logger: logging.Logger | None = None):
        self.logger = logger or logging.getLogger("smart_bin.thingsboard_repository")
        # Derive host from config if not provided.
        if host:
            self.host = host
        else:
            parsed = urlparse(APP_CONFIG.api.thingsboard_base_url)
            self.host = parsed.hostname or "thingsboard.localhost"

        self.port = port
        self.path = path
        self.keepalive = keepalive
        self.tls_enabled = tls_enabled
        self.client_id = client_id
        self.connect_timeout = connect_timeout

        # Persistent MQTT client (built without username/password). The
        # access token will be applied when `connect_with_token` is called.
        self._client: mqtt.Client | None = mqtt.Client(client_id=self.client_id or "", transport="websockets")
        self._client.ws_set_options(path=self.path)
        if self.tls_enabled:
            self._client.tls_set()

        # Connection state
        self._connected = False
        self._connack_rc: int | None = None

        # RPC handler: callable(method: str, params: dict, request_id: str)
        self._rpc_handler = handler

        # Wire callbacks
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

    def _on_connect(self, client, userdata, flags, rc):
        try:
            self._connack_rc = int(rc)
            self._connected = (rc == 0)
            self.logger.info("ThingsBoard MQTT connected rc=%s", rc)
            # Subscribe to RPC requests when connected
            if self._connected:
                client.subscribe("v1/devices/me/rpc/request/+", qos=1)
        except Exception:
            self.logger.exception("Error in on_connect handler")

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False
        self.logger.info("ThingsBoard MQTT disconnected rc=%s", rc)

    def _on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload = msg.payload.decode("utf-8") if msg.payload else ""
            self.logger.info("MQTT message received topic=%s payload=%s", topic, payload)

            # RPC request: v1/devices/me/rpc/request/<id>
            if topic.startswith("v1/devices/me/rpc/request/"):
                request_id = topic.split("/")[-1]
                try:
                    body = json.loads(payload) if payload else {}
                except Exception:
                    body = payload

                method = None
                params = None
                if isinstance(body, dict):
                    method = body.get("method")
                    params = body.get("params")
                # Fallback: if body itself is params, pass through
                if method is None and params is None:
                    params = body

                if callable(self._rpc_handler):
                    try:
                        result = self._rpc_handler(method, params, request_id)
                        # If handler returned a value, send it as response
                        if request_id and result is not None:
                            resp_topic = f"v1/devices/me/rpc/response/{request_id}"
                            client.publish(resp_topic, json.dumps(result), qos=1)
                    except Exception:
                        self.logger.exception("RPC handler failed")
        except Exception:
            self.logger.exception("Error processing incoming MQTT message")

    def connect_with_token(self, access_token: str) -> tuple[bool, str, int | None]:
        """Set the device access token as username and connect the persistent client.

        Returns (ok, message, status_code). If CONNACK rc==5 (not authorized)
        returns status_code=401 so callers can trigger reactivation.
        """
        if not access_token:
            return False, "Missing access token", None

        if self._connected:
            return True, "Already connected", None
        
        try:
            # (Re)apply credentials
            self._client.loop_stop()
            self._client.disconnect()
            
            # Reset trạng thái ack
            self._connack_rc = None
            
            self._client.username_pw_set(username=access_token, password="")
            self._client.connect(self.host, port=self.port, keepalive=self.keepalive)
            self._client.loop_start()

            # Wait for CONNACK / connect
            waited = 0.0
            while self._connack_rc is None and waited < self.connect_timeout:
                time.sleep(0.1)
                waited += 0.1

            if self._connack_rc is not None and self._connack_rc != 0:
                rc = self._connack_rc
                self._connack_rc = None
                self._client.loop_stop()
                
                if rc == 5:
                    return False, "MQTT not authorized (CONNACK rc=5)", 401
                return False, f"MQTT connect rejected (CONNACK rc={rc})", None

            if not self._connected:
                self._client.loop_stop()
                return False, "MQTT connect timed out or was rejected", None

            return True, "Connected", None
        except Exception as e:
            try:
                self._client.loop_stop()
                self._client.disconnect()
            except Exception:
                pass
            self.logger.warning("MQTT connect failed: %s", e)
            return False, f"Failed to connect: {str(e)}", None

    def disconnect(self) -> None:
        try:
            if self._client:
                self._client.loop_stop()
                self._client.disconnect()
        except Exception:
            self.logger.exception("Error during MQTT disconnect")

    def register_rpc_handler(self, handler) -> None:
        """Register a callable to handle RPC requests: handler(method, params, request_id).

        The handler may return a value which will be sent back as the RPC response.
        """
        self._rpc_handler = handler

    def send_telemetry(self, access_token: str, payload: dict | None = None) -> tuple[bool, str, int | None]:
        """Publish telemetry to ThingsBoard topic `v1/devices/me/telemetry`.

        Returns (ok: bool, message: str, status_code: int|None). For MQTT the
        status_code is always None since HTTP status codes don't apply.
        """
        if not access_token:
            return False, "Missing access token for telemetry", None

        telemetry_payload = payload or {"heartbeat": int(time.time() * 1000)}
        topic = "v1/devices/me/telemetry"
        self.logger.info("Publishing telemetry to %s: %s", topic, telemetry_payload)

        # Ensure client is connected with the provided token
        if not self._client:
            return False, "MQTT client not initialized", None

        # If client is not connected or credentials mismatch, attempt to connect
        if not self._connected:
            ok, msg, status = self.connect_with_token(access_token)
            if not ok:
                return ok, msg, status

        try:
            info = self._client.publish(topic, json.dumps(telemetry_payload), qos=1)
            
            info.wait_for_publish(timeout=5.0)
            
            if info.is_published():
                return True, "OK", None
            return False, "Publish failed or timed out", None
        except Exception as e:
            self.logger.warning("Telemetry publish failed: %s", e)
            return False, f"Failed to send telemetry: {str(e)}", None