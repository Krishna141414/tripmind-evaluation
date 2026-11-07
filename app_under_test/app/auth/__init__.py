"""Register / login / logout with Flask-Login. Inputs validated with Pydantic, forms CSRF-protected."""
from flask import Blueprint, current_app, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user
from pydantic import ValidationError

from ..extensions import db, limiter
from ..logging_setup import event
from ..models import User
from ..schemas import LoginRequest, RegisterRequest, field_errors

bp = Blueprint("auth", __name__, url_prefix="/auth")


def _errors(e):
    return {d["field"]: d["message"] for d in field_errors(e)}


@bp.route("/login", methods=["GET", "POST"])
@limiter.limit(lambda: current_app.config["LOGIN_RATE_LIMIT"], methods=["POST"],
               key_func=lambda: "login:" + (request.remote_addr or "?"))
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))
    errors, form = {}, {}
    if request.method == "POST":
        form = {"username": request.form.get("username", "")}
        try:
            data = LoginRequest.model_validate(request.form.to_dict())
        except ValidationError as e:
            errors = _errors(e)
        else:
            user = User.query.filter_by(username=data.username).first()
            if user and user.check_password(data.password):
                login_user(user)
                event("info", "login success", event="login", username=user.username)
                flash(f"Welcome back, {user.username}!", "success")
                return redirect(url_for("main.dashboard"))
            event("warning", "login failed", event="login_failed", username=data.username)
            errors = {"form": "Invalid username or password."}
    return render_template("auth/login.html", errors=errors, form=form), (400 if errors else 200)


@bp.route("/register", methods=["GET", "POST"])
@limiter.limit("10 per hour", methods=["POST"], key_func=lambda: "register:" + (request.remote_addr or "?"))
def register():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))
    errors, form = {}, {}
    if request.method == "POST":
        form = {"username": request.form.get("username", "")}
        try:
            data = RegisterRequest.model_validate(request.form.to_dict())
        except ValidationError as e:
            errors = _errors(e)
        else:
            if User.query.filter(db.func.lower(User.username) == data.username.lower()).first():
                errors = {"username": "That username is already taken"}
            else:
                user = User(username=data.username)
                user.set_password(data.password)
                db.session.add(user)
                db.session.commit()
                event("info", "user registered", event="register", username=user.username)
                login_user(user)
                flash("Account created. Welcome to TripMind!", "success")
                return redirect(url_for("main.dashboard"))
    return render_template("auth/register.html", errors=errors, form=form), (400 if errors else 200)


@bp.post("/logout")
@login_required
def logout():
    event("info", "logout", event="logout")
    logout_user()
    flash("You have been signed out.", "success")
    return redirect(url_for("auth.login"))
