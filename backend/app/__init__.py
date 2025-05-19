# backend/app/__init__.py

# This file can be kept empty or used for package-level imports/configurations
# if needed in the future. For now, all Flask app logic is in main.py.

# Example: If you had models or services you wanted to easily import:
# from .models import User
# from .services import user_service

# For now, we will keep it minimal as the app creation is handled in main.py
# to avoid circular dependencies and to have a clear entry point.

# You could potentially import the create_app function here if you wanted
# `from .main import create_app`
# but it's not strictly necessary if your WSGI server points directly to `app.main:create_app`

# Logging setup could also be initialized here if it's meant for the whole package,
# but main.py currently handles its own logger instance.

# print("backend.app package initialized") # Optional: for debugging initialization
