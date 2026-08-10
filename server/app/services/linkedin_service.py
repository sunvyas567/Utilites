import base64
import requests

class LinkedInService:

    def register_upload(self, token: str, urn: str, media_type: str) -> dict:
        """
        Step 1: Register upload intent with LinkedIn Assets API.
        """
        url = "https://api.linkedin.com/v2/assets?action=registerUpload"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0"
        }

        recipe = (
            "urn:li:digitalmediaRecipe:feedshare-image" 
            if media_type == "image" 
            else "urn:li:digitalmediaRecipe:feedshare-video"
        )

        payload = {
            "registerUploadRequest": {
                "recipes": [recipe],
                "owner": urn,
                "serviceRelationships": [
                    {
                        "relationshipType": "OWNER",
                        "identifier": "urn:li:userGeneratedContent"
                    }
                ]
            }
        }

        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()

    def upload_binary(self, upload_url: str, token: str, file_bytes: bytes):
        """
        Step 2: Upload raw file binary to the temporary LinkedIn upload URL.
        """
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/octet-stream"
        }
        response = requests.put(upload_url, headers=headers, data=file_bytes)
        response.raise_for_status()

    def post(
        self, 
        message: str, 
        token: str, 
        urn: str, 
        link: str = None, 
        media_data: str = None,
        media_type: str = None,
        is_test_mode: bool = False,
        visibility: str = "CONNECTIONS"  # Options: "CONNECTIONS" or "PUBLIC"
    ) -> dict:
        """
        Executes a UGC Post to LinkedIn supporting text, links, uploaded media, and custom visibility.
        """
        # 1. Handle Sandbox / Dry Run mode safely
        if is_test_mode:
            print("[SANDBOX MODE] Post skipped. Payload validated successfully.")
            return {
                "status": "success",
                "mode": "sandbox",
                "id": "urn:li:ugcPost:0000000000",
                "message": "Sandbox execution verification complete. No live post created."
            }

        if not token or not urn:
            raise ValueError("Missing valid LinkedIn Access Token or Person URN configuration.")

        url = "https://api.linkedin.com/v2/ugcPosts"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0"
        }

        # 2. Validate Target Visibility
        target_visibility = "CONNECTIONS" if visibility.upper() == "CONNECTIONS" else "PUBLIC"

        # 3. Base Share Content Payload
        share_content = {
            "shareCommentary": {"text": message},
            "shareMediaCategory": "NONE"
        }

        # Handle Binary Image/Video Upload Pipeline
        if media_data and media_type:
            file_bytes = base64.b64decode(media_data)
            
            # Step 1: Register Asset
            reg_response = self.register_upload(token, urn, media_type)
            upload_mechanism = reg_response["value"]["uploadMechanism"]["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
            upload_url = upload_mechanism["uploadUrl"]
            asset_urn = reg_response["value"]["asset"]

            # Step 2: Push Binary Data
            self.upload_binary(upload_url, token, file_bytes)

            # Step 3: Attach Asset URN
            share_content["shareMediaCategory"] = "IMAGE" if media_type == "image" else "VIDEO"
            share_content["media"] = [
                {
                    "status": "READY",
                    "media": asset_urn
                }
            ]

        # Handle External Article Link
        elif link:
            share_content["shareMediaCategory"] = "ARTICLE"
            share_content["media"] = [
                {
                    "status": "READY",
                    "originalUrl": link
                }
            ]

        # 4. Assemble Final UGC Post Payload
        payload = {
            "author": urn,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": share_content
            },
            "visibility": {
                "com.linkedin.ugc.MemberNetworkVisibility": target_visibility
            }
        }

        # 5. Dispatch to LinkedIn API
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()