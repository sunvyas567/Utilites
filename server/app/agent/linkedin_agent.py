from app.services.linkedin_service import LinkedInService

class LinkedInAgent:

    def __init__(self):
        self.service = LinkedInService()

    async def send(self, message: str, token: str, urn: str, link: str = None, is_test_mode: bool = False) -> dict:
        """
        Asynchronously handles sending messages by routing contextual tokens down to the core service.
        """
        try:
            self.service.post(message=message, token=token, urn=urn, link=link, is_test_mode=is_test_mode)
            return {"status": "sent"}
            
        except Exception as e:
            return {
                "status": "failed",
                "error": str(e)
            }
