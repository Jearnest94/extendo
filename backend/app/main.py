# Backend: /api/health returns {"status":"ok"}.
# FLASK api

from flask import Flask, jsonify
from flask_cors import CORS

# Just a simple health check
def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

    @app.route('/')
    def index():
        return jsonify({"message": "Welcome to the API!"})
    
    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({"status": "ok"})

    return app
