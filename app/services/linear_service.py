import httpx
from typing import List, Dict, Any, Optional

class LinearService:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        api_url: str = "https://api.linear.app/graphql"
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.api_url = api_url

    def get_auth_url(self, state: str) -> str:
        """
        Generate the Linear OAuth authorization URL.
        """
        query_params = [
            f"client_id={self.client_id}",
            f"redirect_uri={self.redirect_uri}",
            "response_type=code",
            f"state={state}",
            "scope=read,write"
        ]
        return f"https://linear.app/oauth/authorize?{'&'.join(query_params)}"

    async def exchange_token(self, code: str) -> str:
        """
        Exchange the authorization code for an oauth access token.
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.linear.app/oauth/token",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "authorization_code"
                }
            )
            response.raise_for_status()
            data = response.json()
            if "access_token" not in data:
                raise ValueError("Failed to obtain access token from Linear")
            return data["access_token"]

    async def create_issue(self, access_token: str, title: str, description: str, team_id: str) -> str:
        """
        Create a new issue in Linear using the GraphQL API.
        Returns the issue URL or ID.
        """
        mutation = """
        mutation IssueCreate($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                success
                issue {
                    id
                    url
                }
            }
        }
        """
        
        variables = {
            "input": {
                "title": title,
                "description": description,
                "teamId": team_id
            }
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                self.api_url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "query": mutation,
                    "variables": variables
                }
            )
            response.raise_for_status()
            data = response.json()
            
            if "errors" in data and len(data["errors"]) > 0:
                raise ValueError(f"Linear GraphQL API error: {data['errors'][0].get('message')}")
                
            issue_create = data.get("data", {}).get("issueCreate", {})
            if not issue_create.get("success"):
                raise ValueError("Linear issue creation was not successful")
                
            return issue_create.get("issue", {}).get("url")

    async def list_teams(self, access_token: str) -> list[dict]:
        """
        Fetch all teams the authenticated user has access to.
        Returns a list of dicts with id, name, and key.
        """
        query = '{ "query": "{ teams { nodes { id name key } } }" }'

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                self.api_url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={"query": "{ teams { nodes { id name key } } }"}
            )
            response.raise_for_status()
            data = response.json()

            if "errors" in data and len(data["errors"]) > 0:
                raise ValueError(f"Linear API error: {data['errors'][0].get('message')}")

            nodes = data.get("data", {}).get("teams", {}).get("nodes", [])
            return [{"id": n["id"], "name": n["name"], "key": n["key"]} for n in nodes]

