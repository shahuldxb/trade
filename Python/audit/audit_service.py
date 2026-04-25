"""
Audit service - manages route-level audit configuration for FastAPI apps.
"""
from fastapi import FastAPI
from loguru import logger


# Routes that should be excluded from detailed audit logging
EXCLUDED_ROUTES = {"/health", "/", "/docs", "/openapi.json", "/redoc"}

# Route-specific audit config registry
_audit_route_config: dict = {}


def ensure_audit_route_config(app: FastAPI) -> None:
    """
    Scans all registered routes in the FastAPI app and sets up
    audit configuration entries for each route that requires auditing.
    """
    try:
        registered_routes = []
        for route in app.routes:
            path = getattr(route, "path", None)
            methods = getattr(route, "methods", None)
            if path and path not in EXCLUDED_ROUTES:
                route_key = path
                if route_key not in _audit_route_config:
                    _audit_route_config[route_key] = {
                        "path": path,
                        "methods": list(methods) if methods else [],
                        "audit_enabled": True,
                        "log_request_body": False,
                        "log_response_body": False,
                    }
                    registered_routes.append(path)

        logger.info(
            f"Audit route config initialized for {len(registered_routes)} routes."
        )
    except Exception as exc:
        logger.warning(f"Failed to initialize audit route config: {exc}")


def get_audit_config(path: str) -> dict:
    """
    Returns the audit configuration for a given route path.
    Falls back to a default config if the route is not explicitly registered.
    """
    return _audit_route_config.get(
        path,
        {
            "path": path,
            "methods": [],
            "audit_enabled": path not in EXCLUDED_ROUTES,
            "log_request_body": False,
            "log_response_body": False,
        },
    )


def disable_audit_for_route(path: str) -> None:
    """Disables audit logging for a specific route."""
    if path in _audit_route_config:
        _audit_route_config[path]["audit_enabled"] = False
    else:
        _audit_route_config[path] = {
            "path": path,
            "methods": [],
            "audit_enabled": False,
            "log_request_body": False,
            "log_response_body": False,
        }
