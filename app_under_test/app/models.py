"""Database tables: User, Conversation, ApiKey (SQLite via Flask-SQLAlchemy)."""
import hashlib
import json
import secrets
from datetime import datetime, timezone

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(30), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    conversations = db.relationship("Conversation", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    api_keys = db.relationship("ApiKey", backref="user", lazy="dynamic", cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)   # werkzeug scrypt + salt

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Conversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    question = db.Column(db.String(500), nullable=False)
    answer = db.Column(db.Text, nullable=False)
    sources_json = db.Column(db.Text, nullable=False, default="[]")
    status = db.Column(db.String(20), nullable=False)          # answered | not_found | blocked
    provider = db.Column(db.String(20), nullable=False, default="local")
    fallback = db.Column(db.Boolean, nullable=False, default=False)
    latency_ms = db.Column(db.Integer, nullable=False, default=0)
    channel = db.Column(db.String(10), nullable=False, default="web")   # web | api
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)

    @property
    def sources(self):
        return json.loads(self.sources_json or "[]")

    def to_dict(self):
        return {"id": self.id, "question": self.question, "answer": self.answer, "sources": self.sources,
                "status": self.status, "provider": self.provider, "fallback": self.fallback,
                "latency_ms": self.latency_ms, "channel": self.channel,
                "created_at": self.created_at.isoformat(timespec="seconds") + "Z"}


class ApiKey(db.Model):
    """Only the SHA-256 hash of the key is stored; the plain key is shown to the user once."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    key_hash = db.Column(db.String(64), unique=True, nullable=False, index=True)
    prefix = db.Column(db.String(12), nullable=False)          # first chars, for display ("tm_ab12...")
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    last_used_at = db.Column(db.DateTime)

    @staticmethod
    def hash(raw):
        return hashlib.sha256(raw.encode()).hexdigest()

    @classmethod
    def issue(cls, user):
        """Revoke the user's old keys and create a new one. Returns (row, plain_key)."""
        cls.query.filter_by(user_id=user.id).delete()
        raw = "tm_" + secrets.token_urlsafe(24)
        row = cls(user_id=user.id, key_hash=cls.hash(raw), prefix=raw[:8])
        db.session.add(row)
        db.session.commit()
        return row, raw

    @classmethod
    def lookup(cls, raw):
        return cls.query.filter_by(key_hash=cls.hash(raw)).first() if raw else None
