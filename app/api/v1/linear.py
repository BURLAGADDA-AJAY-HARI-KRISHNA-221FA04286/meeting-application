from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.models.user import User
from app.services.linear_service import LinearService

router = APIRouter(prefix="/linear", tags=["linear"])

# Initialize LinearService only if config is available
def get_linear_service():
    if not all([settings.linear_client_id, settings.linear_client_secret, settings.linear_redirect_uri]):
        raise HTTPException(status_code=500, detail="Linear integration is not configured")
    
    return LinearService(
        client_id=settings.linear_client_id,
        client_secret=settings.linear_client_secret,
        redirect_uri=settings.linear_redirect_uri,
        api_url=settings.linear_api_url or "https://api.linear.app/graphql"
    )

@router.get("/connect")
async def connect_linear(
    token: str = Query(..., description="JWT access token"),
    db: AsyncSession = Depends(get_db)
):
    """
    Redirects the user to the Linear OAuth authorization page.
    Pass your JWT access token as a query parameter: /linear/connect?token=YOUR_JWT
    """
    from app.core.security import decode_token

    # Manually validate the JWT from query param (browser can't send headers)
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        token_type = payload.get("type")
        if user_id is None or token_type != "access":
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(user_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    linear_service = get_linear_service()
    auth_url = linear_service.get_auth_url(state=str(user.id))
    return RedirectResponse(url=auth_url)


@router.get("/auth-url")
async def get_linear_auth_url(current_user: User = Depends(get_current_user)):
    """
    Returns the Linear OAuth URL as JSON (for frontend use).
    The frontend can then window.open() or redirect.
    """
    linear_service = get_linear_service()
    auth_url = linear_service.get_auth_url(state=str(current_user.id))
    return {"auth_url": auth_url}

@router.get("/callback")
async def linear_callback(
    code: str = Query(..., description="Authorization code from Linear"),
    state: str = Query(..., description="State passed from the authorization URL"),
    db: AsyncSession = Depends(get_db)
):
    """
    Callback endpoint for Linear OAuth.
    """
    linear_service = get_linear_service()
    
    try:
        user_id = int(state)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
        
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    try:
        access_token = await linear_service.exchange_token(code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth exchange failed: {str(e)}")
        
    user.linear_access_token = access_token
    await db.commit()
    
    # Redirect to frontend dashboard or settings page after successful auth
    frontend_url = "http://localhost:5173/settings?linear_connected=true"
    return RedirectResponse(url=frontend_url)


@router.get("/status")
async def linear_status(current_user: User = Depends(get_current_user)):
    """Check if Linear is connected for the current user."""
    return {
        "connected": bool(current_user.linear_access_token),
    }


@router.get("/teams")
async def list_linear_teams(current_user: User = Depends(get_current_user)):
    """Fetch available Linear teams. Requires connected Linear account."""
    if not current_user.linear_access_token:
        raise HTTPException(
            status_code=401,
            detail="Linear account not connected. Visit /linear/connect first."
        )

    linear_service = get_linear_service()

    try:
        teams = await linear_service.list_teams(current_user.linear_access_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch teams: {str(e)}")

    return {"teams": teams}


@router.delete("/disconnect")
async def disconnect_linear(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Disconnect Linear by removing the stored access token."""
    current_user.linear_access_token = None
    await db.commit()
    return {"message": "Linear disconnected successfully"}
