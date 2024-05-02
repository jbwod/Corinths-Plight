from app import db
from datetime import datetime
from flask_login import UserMixin


# This table is for storing user information - username, email, password, sign up date, and points
class users(UserMixin, db.Model):
    user_id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, unique=True, nullable=False)
    email = db.Column(db.String, unique=True, nullable=False)
    password = db.Column(db.String, nullable=False)
    sign_up_date = db.Column(db.DateTime, default=datetime.utcnow)
    units = db.relationship('unit', backref='owner', lazy='dynamic')

    def get_id(self):
        return str(self.user_id)
class unit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    unit_type = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=False)
    fs = db.Column(db.Integer, nullable=False)  # Fire Support
    armor = db.Column(db.Integer, nullable=False)
    speed = db.Column(db.Integer, nullable=False)
    range = db.Column(db.Integer, nullable=False)
    special_rules = db.Column(db.Text, nullable=False)
    upgrades = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.user_id'))

    def __repr__(self):
        return f'<Unit {self.unit_type}>'

    def __repr__(self):
        return f'<Unit {self.unit_type}>'