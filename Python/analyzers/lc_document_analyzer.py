
# """
# LC Document Analyzer (Mode 1)
# ===============================
# Analyze LC document for internal issues and compliance.
# """

# import logging
# from typing import Optional
# from analyzers.base_analyzer import BaseAnalyzer
# from core.azure_client import create_chat_completion

# logger = logging.getLogger(__name__)

# MAX_LC_DETAILS_LEN = 50_000
# MAX_VECTOR_CONTEXT_LEN = 20_000


# class LCDocumentAnalyzer(BaseAnalyzer):
#     """Mode 1: LC Document Analysis - Internal validation"""

#     def __init__(
#         self,
#         lc_type: str = "Import Letter of Credit",
#         lc_code: str = "ILC",
#         lifecycle_code: str = "ISSUANCE",
#         custom_prompt: str | None = None   # ⭐ NEW
#     ):
#         super().__init__(lc_type)
#         self.lc_code = lc_code
#         self.lifecycle_code = lifecycle_code
#         self.custom_prompt = custom_prompt  # ⭐ STORE PROMPT FROM APP.PY

#     def analyze(
#         self,
#         lc_details: str,
#         vector_context: Optional[str] = None
#     ) -> dict:

#         # Validate inputs
#         self.validate_inputs(lc_details)

#         # Input length validation (prevents cost abuse / DoS)
#         if len(lc_details) > MAX_LC_DETAILS_LEN:
#             raise ValueError("LC details input exceeds maximum allowed length")
#         if vector_context and len(vector_context) > MAX_VECTOR_CONTEXT_LEN:
#             raise ValueError("Vector context input exceeds maximum allowed length")

#         # ⭐ USE CUSTOM PROMPT ALWAYS (FROM app.py)
#         if self.custom_prompt:
#             system_prompt = self.custom_prompt
#         else:
#             raise Exception("No prompt provided to LCDocumentAnalyzer")

#         # Build user message
#         user_message = self._build_user_message(lc_details, vector_context)

#         messages = [
#             {"role": "system", "content": system_prompt},
#             {"role": "user", "content": user_message}
#         ]

#         try:
#             response_text, tokens = create_chat_completion(messages)

#             return {
#                 "response": response_text,
#                 "analysis": response_text,
#                 "tokens": tokens,
#             }

#         except Exception as e:
#             logger.exception("LC document analysis failed")
#             raise Exception("Error during LC document analysis") from None

#     def _build_user_message(self, lc_details: str, vector_context: Optional[str]) -> str:
#         message = ""

#         if vector_context:
#             sanitized_context = vector_context.replace("<", "&lt;").replace(">", "&gt;")
#             message += f"""**RELEVANT KNOWLEDGE BASE CONTEXT**:
# <context>
# {sanitized_context}
# </context>

# ---

# """

#         sanitized_lc = lc_details.replace("<", "&lt;").replace(">", "&gt;")
#         message += f"""**{self.lc_type.upper()} DOCUMENT TO EXAMINE**:
# <lc_document>
# {sanitized_lc}
# </lc_document>

# ---

# Please examine the above {self.lc_type} document for issues, ambiguities, missing clauses, or non-compliance.
# """

#         return message



import json
import logging
import re
from typing import Optional
from analyzers.base_analyzer import BaseAnalyzer
from core.azure_client import create_chat_completion

logger = logging.getLogger(__name__)

MAX_LC_DETAILS_LEN = 50_000
MAX_VECTOR_CONTEXT_LEN = 20_000


class LCDocumentAnalyzer(BaseAnalyzer):
    """Mode 1: LC Document Analysis - Internal validation"""

    def __init__(
        self,
        lc_type: str = "Import Letter of Credit",
        lc_code: str = "ILC",
        lifecycle_code: str = "ISSUANCE",
        custom_prompt: str | None = None
    ):
        print("custom prompt",custom_prompt)
        super().__init__(lc_type)
        self.lc_code = lc_code
        self.lifecycle_code = lifecycle_code
        self.custom_prompt = custom_prompt

    def analyze(
        self,
        lc_details: str,
        vector_context: Optional[str] = None
    ) -> dict:

        # Validate inputs
        self.validate_inputs(lc_details)

        # Length validation
        if len(lc_details) > MAX_LC_DETAILS_LEN:
            raise ValueError("LC details input exceeds maximum allowed length")
        if vector_context and len(vector_context) > MAX_VECTOR_CONTEXT_LEN:
            raise ValueError("Vector context input exceeds maximum allowed length")

        # 🔒 Additional sanitization (Prompt Injection protection)
        lc_details = self._sanitize_input(lc_details)
        if vector_context:
            vector_context = self._sanitize_input(vector_context)

        # Require system prompt
        if self.custom_prompt:
            system_prompt = self.custom_prompt
        else:
            raise Exception("No prompt provided to LCDocumentAnalyzer")

        user_message = self._build_user_message(lc_details, vector_context)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]

        try:
            response_text, tokens = create_chat_completion(messages)

            # 🔒 Output validation (prevent XSS / unsafe content)
            safe_response = self._sanitize_output(response_text)

            return {
                "request": json.dumps(messages, ensure_ascii=False, indent=2),
                "response": safe_response,
                "analysis": safe_response,
                "tokens": tokens,
            }

        except Exception as e:
            logger.exception("LC document analysis failed")
            raise Exception(f"Error during LC document analysis: {str(e)}")

    def _build_user_message(self, lc_details: str, vector_context: Optional[str]) -> str:
        message = ""

        if vector_context:
            sanitized_context = vector_context.replace("<", "&lt;").replace(">", "&gt;")
            message += f"""**RELEVANT KNOWLEDGE BASE CONTEXT**:
<context>
{sanitized_context}
</context>

---

"""

        sanitized_lc = lc_details.replace("<", "&lt;").replace(">", "&gt;")
        message += f"""**{self.lc_type.upper()} DOCUMENT TO EXAMINE**:
<lc_document>
{sanitized_lc}
</lc_document>

---

Please examine the above {self.lc_type} document for issues, ambiguities, missing clauses, or non-compliance.
"""

        return message

    # 🔒 NEW: Input Sanitization
    def _sanitize_input(self, text: str) -> str:
        # Remove common prompt injection patterns
        text = re.sub(r"(?i)ignore previous instructions", "", text)
        text = re.sub(r"(?i)system prompt", "", text)
        text = re.sub(r"(?i)you are chatgpt", "", text)
        return text.strip()

    # 🔒 NEW: Output Sanitization
    def _sanitize_output(self, text: str) -> str:
        # Prevent script injection
        text = text.replace("<script>", "").replace("</script>", "")
        return text.strip()
