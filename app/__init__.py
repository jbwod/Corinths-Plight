from flask import Flask
import json
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from config import Config
from flask_login import LoginManager
from flask_wtf import CSRFProtect

app = Flask(__name__)
app.config.from_object(Config)
app.config['SECRET_KEY'] = 'banana'
csrf = CSRFProtect(app)
db = SQLAlchemy(app)
migrate = Migrate(app, db)

login_manager = LoginManager()
login_manager.login_view = 'login'
login_manager.init_app(app)


from app import routes, models

@login_manager.user_loader
def load_user(id):
    return models.User.query.get(int(id))

# Jinja filters
@app.template_filter('from_json')
def from_json_filter(value):
    try:
        if not value:
            return []
        if isinstance(value, (list, dict)):
            return value
        return json.loads(value)
    except Exception:
        return []
