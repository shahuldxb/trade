from fastapi import FastAPI,UploadFile, File, BackgroundTasks,Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from routes.analyze import router as analyze_router
from routes.tool_instrument import router as tool_instrument_router  
from routes.tool_billing import router as tool_billing_router
from routes.tool_subdocuments import router as tool_subdocuments_router
from routes.MTConverter import router as mt_converter_router
from routes.amendment import router as Amenment 
from routes.instrument import router as instrument
import json
import traceback
from fastapi.responses import JSONResponse
from fastapi.exception_handlers import http_exception_handler
from routes.sanction import router as sanction_router
from routes.fourtysix_A import router as FourtySixA_router
from routes.TBML import router as TBML
from routes.Goodsmatcher import router as goodsmatcher_router
from routes.OCR_routes import router as ocr_routes
from dotenv import load_dotenv
from loguru import logger
from fastapi.staticfiles import StaticFiles
from appp.services.document_processor import process_document_task
from routes.lcsample_generator import router as sample_router
from routes.qa import router as qa_router
from routes.Cure import router as cure_router
from routes.import_lc_routes import router as import_lc_router
from routes.ingest_routes import router as ingest_router
from routes.Simplyfy_result import router as simplify_router
from routes.demo_mode import router as demo_mode_router
from audit.audit_middleware import audit_middleware
from audit.audit_service import ensure_audit_route_config
from routes.email import router as email_router
from appp.crud.error_log import (
    ensure_error_log_table,
    install_global_error_hooks,
    write_application_error_log,
)
import asyncio
import os
load_dotenv()
import sys
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def _severity_from_level(level_name: str) -> str:
    normalized = str(level_name).upper()
    if normalized in {"CRITICAL", "FATAL"}:
        return "CRITICAL"
    if normalized in {"ERROR", "EXCEPTION"}:
        return "HIGH"
    if normalized == "WARNING":
        return "MEDIUM"
    return "LOW"


def _safe_json_text(value) -> str | None:
    if value is None:
        return None
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        return str(value)


def _get_request_body_text(raw_body: bytes | None) -> str | None:
    if not raw_body:
        return None
    try:
        return raw_body.decode("utf-8", errors="ignore")
    except Exception:
        return None


def _build_request_context(request: Request, body_text: str | None) -> dict:
    headers = request.headers
    audit_ctx = getattr(request.state, "audit", {}) or {}
    auth_header = headers.get("Authorization") or headers.get("authorization")

    safe_headers = {
        "x_user_id": headers.get("X-User-Id"),
        "x_session_id": headers.get("x-session-id"),
        "x_asset_id": headers.get("X-Asset-Id"),
        "x_api_key_present": bool(headers.get("X-API-Key")),
        "authorization_present": bool(auth_header),
        "content_type": headers.get("content-type"),
        "user_agent": headers.get("user-agent"),
        "referer": headers.get("referer"),
        "origin": headers.get("origin"),
    }

    return {
        "method": request.method,
        "url": str(request.url),
        "path": request.url.path,
        "query_params": dict(request.query_params),
        "path_params": dict(request.path_params),
        "client": {
            "host": request.client.host if request.client else None,
            "port": request.client.port if request.client else None,
        },
        "headers": safe_headers,
        "body": body_text,
        "audit_context": audit_ctx,
    }


def _request_user_id(request: Request) -> str | None:
    audit_ctx = getattr(request.state, "audit", {}) or {}
    return (
        request.headers.get("X-User-Id")
        or request.query_params.get("user_id")
        or audit_ctx.get("UserID")
        or audit_ctx.get("user_id")
        or "ANONYMOUS"
    )


def _request_asset_id(request: Request, body_text: str | None) -> str | None:
    if request.headers.get("X-Asset-Id"):
        return request.headers.get("X-Asset-Id")
    if request.path_params.get("doc_id") is not None:
        return str(request.path_params.get("doc_id"))
    if request.query_params.get("doc_id"):
        return request.query_params.get("doc_id")
    return None


def _loguru_error_sink(message):
    record = message.record
    exception_text = None
    if record.get("exception"):
        exception_text = str(record["exception"])

    try:
        write_application_error_log(
            module_name="python-loguru",
            function_name=record.get("function"),
            error_message=record.get("message"),
            error_type=record.get("level").name if record.get("level") else "ERROR",
            severity=_severity_from_level(record.get("level").name if record.get("level") else "ERROR"),
            request_payload={
                "file": record.get("file").path if record.get("file") else None,
                "line": record.get("line"),
                "module": record.get("module"),
            },
            remarks=exception_text,
        )
    except Exception:
        pass


logger.add(_loguru_error_sink, level="ERROR", backtrace=False, diagnose=False)

app = FastAPI(
    title="TF_genie API",
    version="1.0",
)

cors_origins_env = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
if cors_origins_env:
    cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
else:
    # Default to allow all origins to prevent local UI blocks.
    cors_origins = ["*"]

allow_credentials = True
if cors_origins == ["*"]:
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(audit_middleware)

# 👇 IMPORTANT
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "Upload_Files", "uploads")

os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ---------------------------
# GLOBAL EXCEPTION HANDLER
# (ONLY PLACE WHERE IT IS ALLOWED)
# ---------------------------

@app.on_event("startup")
def seed_audit_configs():
    ensure_error_log_table()
    install_global_error_hooks()
    ensure_audit_route_config(app)
    try:
        loop = asyncio.get_running_loop()

        def _asyncio_exception_handler(loop, context):
            exc = context.get("exception")
            message = context.get("message") or "Unhandled asyncio exception"
            write_application_error_log(
                module_name="python-asyncio",
                function_name="loop_exception_handler",
                error_code=type(exc).__name__ if exc else "AsyncioError",
                error_message=str(exc) if exc else message,
                error_type=type(exc).__name__ if exc else "AsyncioError",
                severity="CRITICAL",
                remarks="".join(
                    traceback.format_exception(type(exc), exc, exc.__traceback__)
                ) if exc else message,
            )
            loop.default_exception_handler(context)

        loop.set_exception_handler(_asyncio_exception_handler)
    except Exception:
        logger.exception("Failed to install asyncio exception handler")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    stack_trace = traceback.format_exc()
    try:
        raw_body = await request.body()
        body_text = _get_request_body_text(raw_body)
    except Exception:
        body_text = None

    request_context = _build_request_context(request, body_text)

    try:
        write_application_error_log(
            user_id=_request_user_id(request),
            module_name="python-api",
            function_name=f"{request.method} {request.url.path}",
            error_code=getattr(exc, "code", None),
            error_message=str(exc),
            error_type=exc.__class__.__name__,
            severity="CRITICAL",
            asset_id=_request_asset_id(request, body_text),
            request_payload=request_context,
            response_payload={"status_code": 500, "message": "Internal server error"},
            remarks=_safe_json_text(
                {
                    "stack_trace": stack_trace,
                    "exception_type": exc.__class__.__name__,
                }
            ),
        )
    except Exception:
        pass

    print(stack_trace)
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "Internal server error"
        }
    )


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    try:
        raw_body = await request.body()
        body_text = _get_request_body_text(raw_body)
    except Exception:
        body_text = None

    status_code = exc.status_code if exc.status_code is not None else 500
    severity = "HIGH" if status_code >= 500 else "MEDIUM"
    request_context = _build_request_context(request, body_text)

    try:
        write_application_error_log(
            user_id=_request_user_id(request),
            module_name="python-api",
            function_name=f"{request.method} {request.url.path}",
            error_code=str(status_code),
            error_message=str(exc.detail),
            error_type="HTTPException",
            severity=severity,
            asset_id=_request_asset_id(request, body_text),
            request_payload=request_context,
            response_payload={
                "status_code": status_code,
                "detail": exc.detail,
                "headers": exc.headers,
            },
            remarks=_safe_json_text(
                {
                    "message": f"Handled HTTPException with status {status_code}",
                    "exception_headers": exc.headers,
                }
            ),
        )
    except Exception:
        pass

    return await http_exception_handler(request, exc)

@app.post("/api/lc/ocr_upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    document_name: str = "uploaded.pdf"
):
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    background_tasks.add_task(process_document_task, file_path, document_name)
    logger.info(f"Document {document_name} queued for processing")
    return {"message": "Document queued", "filename": file.filename}

app.include_router(analyze_router)
app.include_router(tool_instrument_router) 
app.include_router(tool_billing_router)
app.include_router(tool_subdocuments_router)
app.include_router(mt_converter_router)
app.include_router(Amenment)
app.include_router(instrument)
app.include_router(sanction_router)
app.include_router(FourtySixA_router)  # Importing the router from fourtysix_A.py
app.include_router(TBML)  # Including the TBML router
app.include_router(goodsmatcher_router)  # Including the Goods Matcher router
app.include_router(ocr_routes)
app.include_router(sample_router)
app.include_router(qa_router)
app.include_router(cure_router)
app.include_router(import_lc_router)
app.include_router(ingest_router)
app.include_router(simplify_router)
app.include_router(demo_mode_router)
app.include_router(email_router)

@app.get("/")
def root():
    return {"message": "TF_genie FastAPI Running Successfully"}
@app.get("/health")
async def health():
    return {"status": "healthy"}

# BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# UPLOAD_DIR = os.path.join(BASE_DIR, "routes", "uploads")
# os.makedirs(UPLOAD_DIR, exist_ok=True)


# -------------------------------------------------
# UVICORN SERVER (for standalone python run)
# -------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

