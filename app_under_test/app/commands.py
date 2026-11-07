"""`flask seed`: demo user (demo / Demo@1234, admin) + example conversations from real pipeline runs."""
import json
from datetime import timedelta
from pathlib import Path

import click

from .extensions import db
from .models import ApiKey, Conversation, User, utcnow

SEED_FILE = Path(__file__).resolve().parents[1] / "data" / "seed_conversations.json"
DEMO_USER, DEMO_PASSWORD = "demo", "Demo@1234"


def seed(reset=False):
    if reset:
        db.drop_all()
        db.create_all()
    user = User.query.filter_by(username=DEMO_USER).first()
    if user is None:
        user = User(username=DEMO_USER, is_admin=True)       # demo user is admin for the demo
        user.set_password(DEMO_PASSWORD)
        db.session.add(user)
        db.session.commit()
    if user.conversations.count() == 0 and SEED_FILE.exists():
        rows = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        now = utcnow()
        for i, r in enumerate(rows):
            db.session.add(Conversation(user_id=user.id, question=r["question"], answer=r["answer"],
                                        sources_json=json.dumps(r["sources"], ensure_ascii=False),
                                        status=r["status"], provider=r["provider"], latency_ms=r["latency_ms"],
                                        created_at=now - timedelta(hours=(len(rows) - i) * 5)))
    if ApiKey.query.filter_by(user_id=user.id).first() is None:
        ApiKey.issue(user)                                     # plain key is discarded; regenerate on the API page
    db.session.commit()
    return user


def seed_if_empty():
    if User.query.first() is None:
        seed()
        return True
    return False


def register_commands(app):
    @app.cli.command("seed")
    @click.option("--reset", is_flag=True, help="Drop and recreate all tables first.")
    def seed_cmd(reset):
        """Create the demo user and example conversations."""
        user = seed(reset)
        click.echo(f"Seeded: user '{user.username}' / {DEMO_PASSWORD} with {user.conversations.count()} conversations")
