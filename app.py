from datetime import datetime
from bson.objectid import ObjectId
from flask import (
    Flask, render_template, request, redirect,
    url_for, session, jsonify, send_from_directory
)
from flask_pymongo import PyMongo
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config["SECRET_KEY"] = "cambia-esto-por-uno-seguro"

# 🔵 Mongo
app.config["MONGO_URI"] = "mongodb+srv://david:ARno0192@cluster0.runro.mongodb.net/app_pymes?retryWrites=true&w=majority&appName=Cluster0"
mongo = PyMongo(app)
users_col = mongo.db.users
scores_col = mongo.db.scores


@app.route("/")
def index():
    if "user_id" not in session:
        return redirect(url_for("login"))

    uid = ObjectId(session["user_id"])
    user = users_col.find_one({"_id": uid})

    # mejor puntaje (por si lo quieres mostrar)
    best = scores_col.find_one({"user_id": uid}, sort=[("points", -1)])
    best_score = best["points"] if best else 0

    # progreso actual (lo que queremos)
    current_score = user.get("current_score", 0) if user else 0
    current_level = user.get("current_level", 1) if user else 1

    return render_template(
        "index.html",
        username=user["username"],
        best_score=best_score,
        current_score=current_score,
        current_level=current_level,
    )

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        user = users_col.find_one({"username": username})
        if user and check_password_hash(user["password_hash"], password):
            session["user_id"] = str(user["_id"])
            session["username"] = user["username"]
            return redirect(url_for("index"))
        return render_template("login.html", error="Usuario o contraseña inválidos")

    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        if not username or not password:
            return render_template("register.html", error="Faltan datos")

        exists = users_col.find_one({"username": username})
        if exists:
            return render_template("register.html", error="Ese usuario ya existe")

        users_col.insert_one({
            "username": username,
            "password_hash": generate_password_hash(password),
            "created_at": datetime.utcnow()
        })
        return redirect(url_for("login"))

    return render_template("register.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ====== API SCORE ======
@app.route("/api/score", methods=["POST"])
def api_score():
    if "user_id" not in session:
        return jsonify({"ok": False, "error": "not_authenticated"}), 401

    data = request.get_json() or {}
    points = int(data.get("points", 0))
    uid = ObjectId(session["user_id"])

    # ver el mejor que ya tiene
    best = scores_col.find_one({"user_id": uid}, sort=[("points", -1)])

    if best and best["points"] >= points:
        # no es mejor, no lo guardo
        return jsonify({"ok": True, "saved": False, "points": points})

    # sí es mejor, lo guardo
    scores_col.insert_one({
        "user_id": uid,
        "points": points,
        "created_at": datetime.utcnow()
    })

    return jsonify({"ok": True, "saved": True, "points": points})

# ====== LEADERBOARD ======
@app.route("/leaderboard")
def leaderboard():
    pipeline = [
        {"$group": {
            "_id": "$user_id",
            "best_score": {"$max": "$points"}
        }},
        {"$sort": {"best_score": -1}},
        {"$limit": 20}
    ]
    agg = list(scores_col.aggregate(pipeline))

    rows = []
    for row in agg:
        user = users_col.find_one({"_id": row["_id"]})
        rows.append({
            "username": user["username"] if user else "???",
            "best_score": row["best_score"]
        })

    return render_template("leaderboard.html", rows=rows)

@app.route("/api/progress", methods=["POST"])
def api_progress():
    if "user_id" not in session:
        return jsonify({"ok": False, "error": "not_authenticated"}), 401

    data = request.get_json() or {}
    current_score = int(data.get("score", 0))
    current_level = int(data.get("level", 1))

    uid = ObjectId(session["user_id"])

    # actualizamos el user con su progreso actual
    mongo.db.users.update_one(
        {"_id": uid},
        {
            "$set": {
                "current_score": current_score,
                "current_level": current_level,
                "progress_updated_at": datetime.utcnow(),
            }
        },
        upsert=False,
    )

    return jsonify({"ok": True})

# ====== PWA ======
@app.route("/manifest.json")
def manifest():
    return send_from_directory("static", "manifest.json")

@app.route("/service-worker.js")
def sw():
    return send_from_directory("static", "service-worker.js", mimetype="application/javascript")


if __name__ == "__main__":
    # 👇 esto ya no va a tronar aunque haya nulls en username
    try:
        users_col.delete_many({"username": {"$in": [None, ""]}})
        users_col.create_index("username", unique=True, sparse=True)
        scores_col.create_index([("user_id", 1), ("points", -1)])
    except Exception as e:
        print("⚠️ índice:", e)

    app.run(debug=True, port=5000)
