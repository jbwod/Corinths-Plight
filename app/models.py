from app import db
from datetime import datetime
from flask_login import UserMixin

unit_upgrades = db.Table('unit_upgrades',
    db.Column('unit_template_id', db.Integer, db.ForeignKey('unit_template.id'), primary_key=True),
    db.Column('upgrade_id', db.Integer, db.ForeignKey('upgrade.id'), primary_key=True)
)

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    sign_up_date = db.Column(db.DateTime, default=datetime.utcnow)
    user_units = db.relationship('UserUnit', backref='owner', lazy='dynamic')

    def __repr__(self):
        return f'<User {self.username}>'

class UnitTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    unit_type = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=False)
    fs = db.Column(db.Integer, nullable=False)
    armor = db.Column(db.Integer, nullable=False)
    speed = db.Column(db.Integer, nullable=False)
    range = db.Column(db.Integer, nullable=False)
    special_rules = db.Column(db.Text, nullable=False)
    primary_equipment_slots = db.Column(db.Integer, default=0)
    secondary_equipment_slots = db.Column(db.Integer, default=0)
    internal_slots = db.Column(db.Integer, default=0)
    structure_build_list = db.Column(db.Text, default='')
    logistic_needs = db.Column(db.String(255), nullable=True)  # New field for specific logistic or resource needs
    deployment_capabilities = db.Column(db.String(255), nullable=True)  # New field for special deployment capabilities
    upgrades = db.relationship('Upgrade', secondary=unit_upgrades, lazy='subquery',
                               backref=db.backref('units', lazy=True))

    def __repr__(self):
        return f'<UnitTemplate {self.unit_type}>'

class UserUnit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    custom_name = db.Column(db.String(120), nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    fs = db.Column(db.Integer, nullable=False)
    armor = db.Column(db.Integer, nullable=False)
    speed = db.Column(db.Integer, nullable=False)
    range = db.Column(db.Integer, nullable=False)
    primary_equipment_slots = db.Column(db.Integer, default=0)
    secondary_equipment_slots = db.Column(db.Integer, default=0)
    internal_slots = db.Column(db.Integer, default=0)
    template_id = db.Column(db.Integer, db.ForeignKey('unit_template.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    applied_upgrades = db.Column(db.Text)  # JSON or serialized list of applied upgrade names

    template = db.relationship('UnitTemplate', backref='user_units')

    def __repr__(self):
        return f'<UserUnit {self.custom_name or self.template.unit_type} owned by user {self.owner_id}>'

class Upgrade(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=False)
    compatible_unit_types = db.Column(db.Text)  # A list of unit types with which this upgrade is compatible

    def __repr__(self):
        return f'<Upgrade {self.name}>'