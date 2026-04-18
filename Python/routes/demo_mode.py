from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from TBML_matching.db_utils import get_db_connection
import traceback

router = APIRouter(prefix="/api/lc", tags=["DemoMode"])



class DemoModeUpdate(BaseModel):
    demoMode: str # expects 'Y' or 'N'



@router.post("/demo-mode")
def update_demo_mode(payload: DemoModeUpdate):
    mode = (payload.demoMode or "").strip().upper()
    if mode not in {"Y", "N"}:
        raise HTTPException(status_code=400, detail="demoMode must be 'Y' or 'N'")

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("EXEC dbo.usp_UpdateDemoMode ?", mode)
            conn.commit()
        return {"status": "success", "demoMode": mode}
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to update demo mode")
