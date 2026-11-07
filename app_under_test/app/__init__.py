"""Application factory: config -> logging -> extensions -> blueprints -> error handlers -> seed."""
import os

from flask import Flask
from sqlalchemy import inspect

from config import CONFIGS


def create_app(config_name=None):
    config_name = config_name or os.getenv("APP_CONFIG", "development")
    cfg = CONFIGS[config_name]
    cfg.validate()                                   # ProdConfig refuses to start without a real SECRET_KEY

    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(cfg)
    os.makedirs(app.instance_path, exist_ok=True)

    from .logging_setup import setup_logging, event
    setup_logging(app)

    from .extensions import csrf, db, limiter, login_manager
    db.init_app(app)
    csrf.init_app(app)
    limiter.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message = "Please sign in to continue."
    login_manager.session_protection = "strong"

    from .models import User

    @login_manager.user_loader
    def load_user(uid):
        return db.session.get(User, int(uid))

    from . import admin, api, auth, main
    for bp in (auth.bp, main.bp, api.bp, admin.bp):
        app.register_blueprint(bp)

    from .errors import register_error_handlers
    from .security import add_security_headers
    register_error_handlers(app)
    app.after_request(add_security_headers)

    from .commands import register_commands, seed_if_empty
    register_commands(app)
    with app.app_context():
        db.create_all()
        if not app.testing and seed_if_empty():
            event("info", "empty database auto-seeded with demo user", event="seed")

    from .services.rag_service import rag_service
    rag_service.init_app(app)

    @app.context_processor
    def inject_globals():
        return {"llm_provider": app.config["LLM_PROVIDER"]}

    event("info", f"TripMind started ({cfg.__name__}, provider={app.config['LLM_PROVIDER']})", event="startup")
    return app
