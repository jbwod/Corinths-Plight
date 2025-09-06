#!/usr/bin/env python3
"""
Alternative Flask runner that avoids watchdog issues
"""

import os
from app import create_app

# Set environment variables
os.environ['FLASK_APP'] = 'run.py'
os.environ['FLASK_ENV'] = 'development'

app = create_app()

if __name__ == "__main__":
    # Use Flask's built-in development server without reloader
    app.run(debug=True, host='0.0.0.0', port=5001, use_reloader=False, threaded=True)
