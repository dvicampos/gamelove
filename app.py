from datetime import datetime, timedelta
from bson.objectid import ObjectId
from bson.errors import InvalidId
from flask import (
    Flask, render_template, request, redirect,
    url_for, session, jsonify, send_from_directory
)
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.routing import BuildError
import os

app = Flask(__name__)
app.config["SECRET_KEY"] = "cambia-esto-por-uno-seguro"
app.config["TEMPLATES_AUTO_RELOAD"] = True

# =========================================================
# MONGO (tolerante)
# =========================================================
USE_DB = True
users_col = None
scores_col = None
resets_col = None

try:
    from flask_pymongo import PyMongo
    app.config["MONGO_URI"] = "mongodb+srv://david:ARno0192@cluster0.runro.mongodb.net/amorgame?retryWrites=true&w=majority&appName=Cluster0"
    mongo = PyMongo(app)
    users_col = mongo.db.users
    scores_col = mongo.db.scores
    resets_col = mongo.db.password_resets
except Exception as e:
    print("❌ No se pudo conectar a Mongo al iniciar:", e)
    USE_DB = False

# =========================================================
# PING
# =========================================================
@app.route("/ping")
def ping():
    return {"ok": True, "db": USE_DB}

# =========================================================
# LEADERBOARD
# =========================================================
@app.route("/leaderboard")
def leaderboard():
    rows = []
    if USE_DB and scores_col is not None and users_col is not None:
        try:
            pipeline = [
                {"$group": {"_id": "$user_id", "best_score": {"$max": "$points"}}},
                {"$sort": {"best_score": -1}},
                {"$limit": 20},
            ]
            agg = list(scores_col.aggregate(pipeline))
            for row in agg:
                user = users_col.find_one({"_id": row["_id"]})
                rows.append({
                    "username": user["username"] if user else "???",
                    "best_score": row["best_score"],
                })
        except Exception as e:
            print("❌ error leaderboard:", e)

    return render_template("leaderboard.html", rows=rows)

# =========================================================
# HOME / JUEGO
# =========================================================
@app.route("/")
def index():
    if "user_id" not in session:
        return redirect(url_for("login"))

    # intentar pasar la url del ranking
    try:
        leaderboard_url = url_for("leaderboard")
    except BuildError:
        leaderboard_url = None

    username = session.get("username", "Jugador")
    current_score = 0
    current_level = 1
    best_score = 0

    if USE_DB and users_col is not None:
        try:
            uid = ObjectId(session["user_id"])
            user = users_col.find_one({"_id": uid})
            if user:
                username = user.get("username", username)
                current_score = user.get("current_score", 0)
                current_level = user.get("current_level", 1)
                best = scores_col.find_one({"user_id": uid}, sort=[("points", -1)])
                best_score = best["points"] if best else 0
        except Exception as e:
            print("⚠️ leyendo usuario:", e)

    return render_template(
        "index.html",
        username=username,
        current_score=current_score,
        current_level=current_level,
        best_score=best_score,
        leaderboard_url=leaderboard_url,
    )

# =========================================================
# LOGIN / REGISTER / LOGOUT
# =========================================================
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username","").strip()
        password = request.form.get("password","")

        if not USE_DB or users_col is None:
            session["user_id"] = "FAKE"
            session["username"] = username or "Jugador"
            return redirect(url_for("index"))

        user = users_col.find_one({"username": username})
        if user and user.get("password_hash") and check_password_hash(user["password_hash"], password):
            session["user_id"] = str(user["_id"])
            session["username"] = user["username"]
            return redirect(url_for("index"))

        return render_template("login.html", error="Usuario o contraseña inválidos")

    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username","").strip()
        password = request.form.get("password","")
        email = request.form.get("email","").strip().lower()

        if not username or not password:
            return render_template("register.html", error="Faltan datos")

        if not USE_DB or users_col is None:
            session["user_id"] = "FAKE"
            session["username"] = username
            return redirect(url_for("index"))

        if users_col.find_one({"username": username}):
            return render_template("register.html", error="Ese usuario ya existe")

        users_col.insert_one({
            "username": username,
            "email": email,
            "password_hash": generate_password_hash(password),
            "created_at": datetime.utcnow(),
            "current_score": 0,
            "current_level": 1
        })
        return redirect(url_for("login"))

    return render_template("register.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# =========================================================
# API SCORE (mejor puntaje)
# =========================================================
@app.route("/api/score", methods=["POST"])
def api_score():
    if "user_id" not in session:
        return jsonify({"ok": False, "error": "not_authenticated"}), 401

    data = request.get_json() or {}
    points = int(data.get("points", 0))

    if not USE_DB or scores_col is None:
        return jsonify({"ok": True, "saved": False, "points": points})

    try:
        uid = ObjectId(session["user_id"])
    except Exception:
        return jsonify({"ok": False, "error": "invalid_user"}), 400

    best = scores_col.find_one({"user_id": uid}, sort=[("points", -1)])
    if best and best["points"] >= points:
        return jsonify({"ok": True, "saved": False, "points": points})

    scores_col.insert_one({
        "user_id": uid,
        "points": points,
        "created_at": datetime.utcnow()
    })
    return jsonify({"ok": True, "saved": True, "points": points})

# =========================================================
# API PROGRESS (esto es lo que TU game.js llama)
# guarda score y level actuales del usuario
# =========================================================
@app.route("/api/progress", methods=["POST"])
def api_progress():
    if "user_id" not in session:
        return jsonify({"ok": False, "error": "not_authenticated"}), 401

    data = request.get_json() or {}
    score = int(data.get("score", 0))
    level = int(data.get("level", 1))

    if not USE_DB or users_col is None:
        return jsonify({"ok": True, "saved": False})

    try:
        uid = ObjectId(session["user_id"])
    except Exception:
        return jsonify({"ok": False, "error": "invalid_user"}), 400

    users_col.update_one(
        {"_id": uid},
        {"$set": {
            "current_score": score,
            "current_level": level,
            "updated_at": datetime.utcnow()
        }}
    )

    return jsonify({"ok": True, "saved": True})

# =========================================================
# PWA static
# =========================================================
@app.route("/manifest.json")
def manifest():
    return send_from_directory("static", "manifest.json")

@app.route("/service-worker.js")
def sw():
    return send_from_directory("static", "service-worker.js", mimetype="application/javascript")

# =========================================================
# ERROR BuildError (por si un template viejo se cuela)
# =========================================================
@app.errorhandler(BuildError)
def handle_build(e):
    return "BuildError: " + str(e), 500

# =========================================================
# MAIN
# =========================================================
if __name__ == "__main__":
    print("📍 Rutas registradas:")
    for rule in app.url_map.iter_rules():
        print(rule, "→", rule.endpoint)
    app.run(debug=True, port=5000)
