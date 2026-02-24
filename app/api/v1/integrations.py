from fastapi import APIRouter, Depends, HTTPException
import requests
from pydantic import BaseModel
from typing import Optional

from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/integrations", tags=["integrations"])

class GitHubTestRequest(BaseModel):
    token: str

@router.post("/github/test")
async def test_github_token(
    payload: GitHubTestRequest,
    current_user: User = Depends(get_current_user)
):
    """Test if the provided GitHub token is valid."""
    if not payload.token or any(c in payload.token for c in "\r\n"):
        return {"valid": False, "message": "Invalid token format"}
        
    try:
        headers = {
            "Authorization": f"token {payload.token}",
            "Accept": "application/vnd.github.v3+json",
        }
        # Call GitHub API user endpoint to verify token
        response = requests.get("https://api.github.com/user", headers=headers, timeout=5)
        
        if response.status_code == 200:
            user_data = response.json()
            return {
                "valid": True, 
                "username": user_data.get("login"),
                "message": f"Connected as {user_data.get('login')}"
            }
        elif response.status_code == 401:
            return {"valid": False, "message": "Invalid token"}
        else:
            return {"valid": False, "message": f"GitHub API error: {response.status_code}"}
            
    except Exception as e:
        return {"valid": False, "message": f"Connection failed: {str(e)}"}
