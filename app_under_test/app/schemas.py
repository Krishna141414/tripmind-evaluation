"""Pydantic schemas for every input (forms, JSON bodies, query strings)."""
import re

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]+$")


class Strict(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class AskRequest(Strict):
    question: str = Field(min_length=3, max_length=500)
    simulate_llm_failure: bool = False      # admin-only demo switch (ignored for other users)

    @field_validator("question")
    @classmethod
    def not_blank(cls, v):
        if not re.search(r"[A-Za-z0-9]", v):
            raise ValueError("Question must contain letters or numbers")
        return v


class LoginRequest(Strict):
    username: str = Field(min_length=1, max_length=30)
    password: str = Field(min_length=1, max_length=128)


class RegisterRequest(Strict):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=8, max_length=64)
    confirm: str = Field(min_length=1, max_length=64)

    @field_validator("username")
    @classmethod
    def username_chars(cls, v):
        if not USERNAME_RE.match(v):
            raise ValueError("Only letters, numbers and underscore are allowed")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        rules = [(r"[a-z]", "a lowercase letter"), (r"[A-Z]", "an uppercase letter"),
                 (r"\d", "a number"), (r"[^A-Za-z0-9]", "a symbol")]
        missing = [name for pat, name in rules if not re.search(pat, v)]
        if missing:
            raise ValueError("Password needs " + ", ".join(missing))
        return v

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirm:
            raise ValueError("confirm: Passwords do not match")
        return self


class HistoryQuery(Strict):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    q: str = Field(default="", max_length=100)


def field_errors(exc: ValidationError):
    """Turn a Pydantic error into [{field, message}] with friendly wording."""
    out = []
    for e in exc.errors():
        field = ".".join(str(p) for p in e["loc"]) or "body"
        msg = e["msg"].removeprefix("Value error, ")
        if ": " in msg and not e["loc"]:                    # model-level "field: message"
            field, msg = msg.split(": ", 1)
        if e["type"] == "string_too_short":
            msg = f"Must be at least {e['ctx']['min_length']} characters"
        elif e["type"] == "string_too_long":
            msg = f"Must be at most {e['ctx']['max_length']} characters"
        elif e["type"] == "missing":
            msg = "This field is required"
        out.append({"field": field, "message": msg})
    return out
