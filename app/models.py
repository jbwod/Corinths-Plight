from app import db
from datetime import datetime
from flask_login import UserMixin
from sqlalchemy.orm import relationship
import secrets
from secrets import token_urlsafe

unit_upgrades = db.Table('unit_upgrades',
    db.Column('unit_template_id', db.Integer, db.ForeignKey('unit_template.id'), primary_key=True),
    db.Column('upgrade_id', db.Integer, db.ForeignKey('upgrade.id'), primary_key=True)
)
class UserLegion(db.Model):
    __tablename__ = 'user_legions'
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    legion_id = db.Column(db.Integer, db.ForeignKey('legion.id'), primary_key=True)
    role = db.Column(db.String(100), nullable=False, default='member')
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Explicitly define the relationships with clear names
    user = relationship("User", back_populates="user_legions")
    legion = relationship("Legion", back_populates="legion_members")

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    sign_up_date = db.Column(db.DateTime, default=datetime.utcnow)
    user_units = db.relationship('UserUnit', backref='owner', lazy='dynamic')

    # Adjust the back_populates to match the corrected relationship name
    user_legions = relationship("UserLegion", back_populates="user")

    def is_leader(self, legion_id):
        return UserLegion.query.filter_by(user_id=self.id, legion_id=legion_id, role='leader').first() is not None

class Legion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    coa_string = db.Column(db.String(512), nullable=True)  # New field for storing the COA string

    # Adjust the back_populates to match the corrected relationship name
    legion_members = relationship("UserLegion", back_populates="legion")

    is_public = db.Column(db.Boolean, default=True)  # Indicates if the legion is public
    invite_code = db.Column(db.String(32), nullable=True)  # Invite code for private legions
    
    # Enhanced fields
    motto = db.Column(db.String(255), nullable=True)  # Legion motto
    headquarters = db.Column(db.String(120), nullable=True)  # Legion headquarters location
    faction = db.Column(db.String(60), nullable=True)  # Legion faction alignment
    recruitment_status = db.Column(db.String(20), default='open')  # open, closed, invite_only
    max_members = db.Column(db.Integer, default=50)  # Maximum number of members
    level = db.Column(db.Integer, default=1)  # Legion level
    experience = db.Column(db.Integer, default=0)  # Legion experience points
    reputation = db.Column(db.Integer, default=0)  # Legion reputation score
    
    # Legion statistics
    total_battles = db.Column(db.Integer, default=0)
    battles_won = db.Column(db.Integer, default=0)
    total_units_created = db.Column(db.Integer, default=0)
    total_resources_earned = db.Column(db.Integer, default=0)
    
    # Legion settings
    allow_public_join = db.Column(db.Boolean, default=True)
    require_approval = db.Column(db.Boolean, default=False)
    auto_accept_invites = db.Column(db.Boolean, default=True)
    
    # Timestamps
    last_activity = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<Legion {self.name}>'
    
    def get_member_count(self):
        """Get the current number of members in the legion"""
        return len(self.legion_members)
    
    def get_leader(self):
        """Get the leader of the legion"""
        leader_link = UserLegion.query.filter_by(legion_id=self.id, role='leader').first()
        return leader_link.user if leader_link else None
    
    def get_officers(self):
        """Get all officers of the legion"""
        officer_links = UserLegion.query.filter_by(legion_id=self.id, role='officer').all()
        return [link.user for link in officer_links]
    
    def get_members(self):
        """Get all members of the legion"""
        member_links = UserLegion.query.filter_by(legion_id=self.id, role='member').all()
        return [link.user for link in member_links]
    
    def get_win_rate(self):
        """Calculate the legion's win rate"""
        if self.total_battles == 0:
            return 0
        return (self.battles_won / self.total_battles) * 100
    
    def get_legion_level(self):
        """Calculate legion level based on experience"""
        return min(self.level, 100)  # Cap at level 100
    
    def can_join(self, user):
        """Check if a user can join this legion"""
        if not self.is_public and not self.allow_public_join:
            return False
        if self.get_member_count() >= self.max_members:
            return False
        # Check if user is already a member
        existing_membership = UserLegion.query.filter_by(user_id=user.id, legion_id=self.id).first()
        return existing_membership is None
    
    def toggle_public(self):
        """Toggle the public status of the legion"""
        self.is_public = not self.is_public
        if not self.is_public and not self.invite_code:
            self.invite_code = secrets.token_urlsafe(16)
        elif self.is_public:
            self.invite_code = None
        db.session.commit()
    
    def add_experience(self, amount):
        """Add experience points to the legion"""
        self.experience += amount
        # Level up logic
        new_level = (self.experience // 1000) + 1
        if new_level > self.level:
            self.level = new_level
        db.session.commit()
    
    def update_activity(self):
        """Update the last activity timestamp"""
        self.last_activity = datetime.utcnow()
        db.session.commit()


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