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

    # Level system fields
    level = db.Column(db.Integer, default=1)
    experience = db.Column(db.Integer, default=0)
    total_units_created = db.Column(db.Integer, default=0)
    total_battles_won = db.Column(db.Integer, default=0)
    last_activity = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Profile image fields
    profile_image_id = db.Column(db.Integer, nullable=True)  # ID of selected profile image

    # Adjust the back_populates to match the corrected relationship name
    user_legions = relationship("UserLegion", back_populates="user")

    def is_leader(self, legion_id):
        return UserLegion.query.filter_by(user_id=self.id, legion_id=legion_id, role='leader').first() is not None
    
    def add_experience(self, amount):
        """Add experience points to the user"""
        self.experience += amount
        old_level = self.level
        # Calculate new level based on experience (exponential growth)
        new_level = self.calculate_level_from_xp(self.experience)
        if new_level > self.level:
            self.level = new_level
            self.update_activity()
            return True  # Level up occurred
        return False  # No level up
    
    def calculate_level_from_xp(self, xp):
        """Calculate level based on experience points using smooth exponential growth"""
        if xp < 0:
            return 1
        
        # Smooth exponential progression: level = floor(sqrt(xp/50)) + 1
        # This gives: 0-49 XP = L1, 50-199 XP = L2, 200-449 XP = L3, etc.
        level = int((xp / 50) ** 0.5) + 1
        return min(level, 100)  # Cap at level 100
    
    def get_xp_for_next_level(self):
        """Get XP required for next level"""
        if self.level >= 100:
            return 0  # Max level reached
        next_level_xp = self.get_xp_required_for_level(self.level + 1)
        return next_level_xp - self.experience
    
    def get_xp_required_for_level(self, level):
        """Get total XP required for a specific level"""
        if level <= 1:
            return 0
        # Consistent formula: xp = (level - 1)^2 * 50
        return ((level - 1) ** 2) * 50
    
    def get_xp_progress_percentage(self):
        """Get percentage progress to next level"""
        if self.level >= 100:
            return 100
        current_level_xp = self.get_xp_required_for_level(self.level)
        next_level_xp = self.get_xp_required_for_level(self.level + 1)
        progress = self.experience - current_level_xp
        total_needed = next_level_xp - current_level_xp
        return min((progress / total_needed) * 100, 100)
    
    def get_max_units_allowed(self):
        """Get maximum number of units allowed based on level"""
        base_units = 5  # Starting units
        level_bonus = (self.level - 1) * 2  # +2 units per level
        return base_units + level_bonus
    
    def get_units_created_count(self):
        """Get current number of units created"""
        return self.user_units.count()
    
    def can_create_unit(self):
        """Check if user can create more units"""
        return self.get_units_created_count() < self.get_max_units_allowed()
    
    def get_units_remaining(self):
        """Get number of units user can still create"""
        return max(0, self.get_max_units_allowed() - self.get_units_created_count())
    
    def update_activity(self):
        """Update the last activity timestamp"""
        self.last_activity = datetime.utcnow()
        db.session.commit()
    
    def get_level_title(self):
        """Get title based on level with comprehensive tier system"""
        if self.level < 3:
            return "Cadet"
        elif self.level < 5:
            return "Recruit"
        elif self.level < 8:
            return "Private"
        elif self.level < 12:
            return "Corporal"
        elif self.level < 16:
            return "Sergeant"
        elif self.level < 20:
            return "Staff Sergeant"
        elif self.level < 25:
            return "Lieutenant"
        elif self.level < 30:
            return "Captain"
        elif self.level < 35:
            return "Major"
        elif self.level < 40:
            return "Lieutenant Colonel"
        elif self.level < 45:
            return "Colonel"
        elif self.level < 50:
            return "Brigadier General"
        elif self.level < 60:
            return "Major General"
        elif self.level < 70:
            return "Lieutenant General"
        elif self.level < 80:
            return "General"
        elif self.level < 90:
            return "Field Marshal"
        elif self.level < 95:
            return "Supreme Marshal"
        else:
            return "Supreme Commander"
    
    def get_tier_info(self):
        """Get comprehensive tier information"""
        if self.level < 3:
            return {"tier": "Tier I", "name": "Cadet", "color": "#8B8B8B", "description": "Fresh recruit learning the basics"}
        elif self.level < 5:
            return {"tier": "Tier I", "name": "Recruit", "color": "#9B9B9B", "description": "Basic training complete"}
        elif self.level < 8:
            return {"tier": "Tier II", "name": "Private", "color": "#A0A0A0", "description": "Combat ready soldier"}
        elif self.level < 12:
            return {"tier": "Tier II", "name": "Corporal", "color": "#B0B0B0", "description": "Junior NCO with leadership experience"}
        elif self.level < 16:
            return {"tier": "Tier III", "name": "Sergeant", "color": "#C0C0C0", "description": "Experienced NCO leading squads"}
        elif self.level < 20:
            return {"tier": "Tier III", "name": "Staff Sergeant", "color": "#D0D0D0", "description": "Senior NCO with specialized skills"}
        elif self.level < 25:
            return {"tier": "Tier IV", "name": "Lieutenant", "color": "#E0E0E0", "description": "Junior officer commanding platoons"}
        elif self.level < 30:
            return {"tier": "Tier IV", "name": "Captain", "color": "#F0F0F0", "description": "Company commander with tactical expertise"}
        elif self.level < 35:
            return {"tier": "Tier V", "name": "Major", "color": "#FFD700", "description": "Field grade officer with strategic knowledge"}
        elif self.level < 40:
            return {"tier": "Tier V", "name": "Lieutenant Colonel", "color": "#FFC700", "description": "Battalion commander with operational experience"}
        elif self.level < 45:
            return {"tier": "Tier VI", "name": "Colonel", "color": "#FFB700", "description": "Regiment commander with extensive battlefield experience"}
        elif self.level < 50:
            return {"tier": "Tier VI", "name": "Brigadier General", "color": "#FFA700", "description": "Brigade commander with strategic planning skills"}
        elif self.level < 60:
            return {"tier": "Tier VII", "name": "Major General", "color": "#FF9700", "description": "Division commander with theater-level expertise"}
        elif self.level < 70:
            return {"tier": "Tier VII", "name": "Lieutenant General", "color": "#FF8700", "description": "Corps commander with operational mastery"}
        elif self.level < 80:
            return {"tier": "Tier VIII", "name": "General", "color": "#FF7700", "description": "Army commander with strategic mastery"}
        elif self.level < 90:
            return {"tier": "Tier VIII", "name": "Field Marshal", "color": "#FF6700", "description": "Theater commander with legendary status"}
        elif self.level < 95:
            return {"tier": "Tier IX", "name": "Supreme Marshal", "color": "#FF5700", "description": "Supreme commander with godlike prowess"}
        else:
            return {"tier": "Tier X", "name": "Supreme Commander", "color": "#FF0000", "description": "Legendary commander of legendary status"}
    
    def can_create_unit_type(self, unit_type):
        """Check if user can create a specific unit type based on level"""
        # Define level requirements for different unit types - Balanced progression
        unit_requirements = {
            # Tier I (Levels 1-2) - Basic Units
            'Infantry Unit': 1,
            'Logistic Truck': 2,
            'Light Vehicle': 2,
            
            # Tier II (Levels 3-5) - Specialized Infantry & Light Armor
            'Combat Medical Unit': 3,
            'Combat Engineer': 3,
            'Light Battle Tank': 3,
            'Light Arty': 3,
            'Fighter': 3,
            'Light Mech': 3,
            'Irregular Unit': 4,
            'Sappers': 4,
            'Mechanized Infantry': 4,
            'VTOL Multi-Purpose Airlift': 4,
            'Power Armored Infantry': 5,
            'Medium Mech': 5,
            'Self-Propelled': 5,
            'VTOL Heavy Troop Airlift': 5,
            
            # Tier III (Levels 6-10) - Heavy Armor & Advanced Air
            'Main Battle Tank': 6,
            'Heavy Arty': 6,
            'VTOL Heavy Lift': 6,
            'Heavy Aerospace Transport': 7,
            'Bomber': 7,
            'Special Forces': 8,
            'Heavy Mech': 8,
            'Heavy Battle Tank': 10,
            
            # Tier IV (Levels 12-20) - Orbital Units
            'Corvette': 12,
            'Super Heavy Tank': 15,
            'Destroyer': 20,
            
            # Tier V (Levels 25-40) - Capital Ships
            'Cruiser': 30,
            'Battleship': 40,
            
            # Tier VI (Levels 50+) - Legendary Units (Future expansion)
            # 'Dreadnought': 50,
            # 'Titan': 60,
            # 'Leviathan': 70,
            # 'Behemoth': 80,
            # 'Colossus': 90,
            # 'Supreme': 100
        }
        
        required_level = unit_requirements.get(unit_type, 1)
        return self.level >= required_level
    
    def get_unit_level_requirement(self, unit_type):
        """Get the level requirement for a specific unit type"""
        # Use the same requirements as can_create_unit_type for consistency
        unit_requirements = {
            'Infantry Unit': 1,
            'Logistic Truck': 2,
            'Light Vehicle': 2,
            'Combat Medical Unit': 3,
            'Combat Engineer': 3,
            'Light Battle Tank': 3,
            'Light Arty': 3,
            'Fighter': 3,
            'Light Mech': 3,
            'Irregular Unit': 4,
            'Sappers': 4,
            'Mechanized Infantry': 4,
            'VTOL Multi-Purpose Airlift': 4,
            'Power Armored Infantry': 5,
            'Medium Mech': 5,
            'Self-Propelled': 5,
            'VTOL Heavy Troop Airlift': 5,
            'Main Battle Tank': 6,
            'Heavy Arty': 6,
            'VTOL Heavy Lift': 6,
            'Heavy Aerospace Transport': 7,
            'Bomber': 7,
            'Special Forces': 8,
            'Heavy Mech': 8,
            'Heavy Battle Tank': 10,
            'Corvette': 12,
            'Super Heavy Tank': 15,
            'Destroyer': 20,
            'Cruiser': 30,
            'Battleship': 40
        }
        return unit_requirements.get(unit_type, 1)
    
    def get_next_tier_units(self):
        """Get units that will be unlocked in the next tier"""
        current_tier = self.get_tier_info()["tier"]
        next_tier_levels = {
            "Tier I": 3, "Tier II": 8, "Tier III": 16, "Tier IV": 25, 
            "Tier V": 35, "Tier VI": 45, "Tier VII": 60, "Tier VIII": 80, 
            "Tier IX": 95, "Tier X": 100
        }
        
        next_tier_level = next_tier_levels.get(current_tier, 100)
        if self.level >= 100:
            return []
            
        # Get all unit types and their requirements
        unit_requirements = {
            'Infantry Unit': 1, 'Logistic Truck': 2, 'Light Vehicle': 2,
            'Combat Medical Unit': 3, 'Combat Engineer': 3, 'Light Battle Tank': 3,
            'Light Arty': 3, 'Fighter': 3, 'Light Mech': 3, 'Irregular Unit': 4,
            'Sappers': 4, 'Mechanized Infantry': 4, 'VTOL Multi-Purpose Airlift': 4,
            'Power Armored Infantry': 5, 'Medium Mech': 5, 'Self-Propelled': 5,
            'VTOL Heavy Troop Airlift': 5, 'Main Battle Tank': 6, 'Heavy Arty': 6,
            'VTOL Heavy Lift': 6, 'Heavy Aerospace Transport': 7, 'Bomber': 7,
            'Special Forces': 8, 'Heavy Mech': 8, 'Heavy Battle Tank': 10,
            'Corvette': 12, 'Super Heavy Tank': 15, 'Destroyer': 20,
            'Cruiser': 30, 'Battleship': 40
        }
        
        next_tier_units = []
        for unit_type, required_level in unit_requirements.items():
            if self.level < required_level <= next_tier_level:
                next_tier_units.append({
                    'unit_type': unit_type,
                    'required_level': required_level,
                    'tier': self.get_tier_for_level(required_level)
                })
        
        return sorted(next_tier_units, key=lambda x: x['required_level'])
    
    def get_tier_for_level(self, level):
        """Get tier name for a specific level"""
        if level < 3:
            return "Tier I"
        elif level < 8:
            return "Tier II"
        elif level < 16:
            return "Tier III"
        elif level < 25:
            return "Tier IV"
        elif level < 35:
            return "Tier V"
        elif level < 45:
            return "Tier VI"
        elif level < 60:
            return "Tier VII"
        elif level < 80:
            return "Tier VIII"
        elif level < 95:
            return "Tier IX"
        else:
            return "Tier X"
    
    def get_leveling_rewards(self):
        """Get rewards and benefits for current level"""
        rewards = {
            'max_units': self.get_max_units_allowed(),
            'units_created': self.get_units_created_count(),
            'units_remaining': self.get_units_remaining(),
            'next_level_xp': self.get_xp_for_next_level(),
            'progress_percentage': self.get_xp_progress_percentage(),
            'tier_info': self.get_tier_info(),
            'next_tier_units': self.get_next_tier_units()
        }
        return rewards
    
    def get_profile_image_url(self):
        """Get the user's profile image URL"""
        if self.profile_image_id:
            return f'/static/img/profiles/320px enlarged/Portrait Science Fantasy ({self.profile_image_id})-320px.png'
        return None

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

class EquipmentTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slot_type = db.Column(db.String(20), nullable=False)  # 'primary', 'secondary', 'internal', 'upgrade'
    rule = db.Column(db.Text, nullable=False)  # Description of what the equipment does
    cost = db.Column(db.Integer, default=0)  # Cost in points or currency
    unit_restriction = db.Column(db.String(100), nullable=True)  # Which unit types can use this equipment
    
    def __repr__(self):
        return f'<EquipmentTemplate {self.name}>'

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
    
    # Image configuration fields
    image_type = db.Column(db.String(20), default='default')  # 'default', 'colored', 'profile', 'custom'
    image_color = db.Column(db.String(7), nullable=True)  # Hex color code for colored icons
    profile_image_id = db.Column(db.Integer, nullable=True)  # ID of selected profile image
    custom_image_path = db.Column(db.String(255), nullable=True)  # Path to uploaded custom image
    recolored_image_path = db.Column(db.String(255), nullable=True)  # Path to recolored image
    image_data = db.Column(db.Text, nullable=True)  # Base64 encoded image data

    template = db.relationship('UnitTemplate', backref='user_units')

    def get_display_image(self):
        """Get the appropriate image path for this unit"""
        # Prioritize base64 data if available
        if self.image_data:
            return f"data:image/png;base64,{self.image_data}"
        elif self.image_type == 'custom' and self.custom_image_path:
            return self.custom_image_path
        elif self.image_type == 'profile' and self.profile_image_id:
            return f'/static/img/profiles/320px enlarged/{self.profile_image_id}.png'
        elif self.image_type == 'colored' and self.recolored_image_path:
            return self.recolored_image_path
        else:
            # For default and colored without recolored image, use the default icon
            return self.get_default_image_path()
    
    def get_default_image_path(self):
        """Get the default image path for this unit type"""
        unit_type = self.template.unit_type.lower()
        
        # Infantry units
        if 'infantry' in unit_type or 'unit' in unit_type:
            if 'combat engineer' in unit_type:
                return '/static/img/units/icons/infantry/combat_engineer.png'
            elif 'combat medical' in unit_type:
                return '/static/img/units/icons/infantry/combat_medic.png'
            elif 'power armored' in unit_type:
                return '/static/img/units/icons/infantry/power_infantry.png'
            elif 'irregular' in unit_type:
                return '/static/img/units/icons/infantry/irregular.png'
            elif 'special forces' in unit_type:
                return '/static/img/units/icons/infantry/special_forces.png'
            elif 'sapper' in unit_type:
                return '/static/img/units/icons/infantry/sapper.png'
            else:
                return '/static/img/units/icons/infantry/infantry.png'
        
        # Vehicle units
        elif 'vehicle' in unit_type or 'tank' in unit_type or 'truck' in unit_type or 'mechanized' in unit_type:
            if 'heavy battle tank' in unit_type:
                return '/static/img/units/icons/vehicles/heavy_tank.png'
            elif 'light battle tank' in unit_type:
                return '/static/img/units/icons/vehicles/light_tank.png'
            elif 'main battle tank' in unit_type:
                return '/static/img/units/icons/vehicles/main_tank.png'
            elif 'super heavy tank' in unit_type:
                return '/static/img/units/icons/vehicles/super_heavy.png'
            elif 'logistic truck' in unit_type:
                return '/static/img/units/icons/vehicles/logistic.png'
            elif 'light vehicle' in unit_type:
                return '/static/img/units/icons/vehicles/light_vehicle.png'
            elif 'mechanized' in unit_type:
                return '/static/img/units/icons/infantry/mechanized.png'
            else:
                return '/static/img/units/icons/vehicles/category1.png'
        
        # Mech units
        elif 'mech' in unit_type:
            if 'light mech' in unit_type:
                return '/static/img/units/icons/mechs/light_mech.png'
            elif 'medium mech' in unit_type:
                return '/static/img/units/icons/mechs/medium_mech.png'
            elif 'heavy mech' in unit_type:
                return '/static/img/units/icons/mechs/heavy_mech.png'
            else:
                return '/static/img/units/icons/mechs/light_mech.png'
        
        # Aerial units
        elif 'aircraft' in unit_type or 'vtol' in unit_type or 'aerospace' in unit_type or 'bomber' in unit_type:
            if 'fighter' in unit_type:
                return '/static/img/units/icons/aircraft/fighter.png'
            elif 'vtol' in unit_type:
                return '/static/img/units/icons/aircraft/vtol.png'
            elif 'aerospace' in unit_type:
                return '/static/img/units/icons/aircraft/heavy_transport.png'
            elif 'bomber' in unit_type:
                return '/static/img/units/icons/aircraft/bomber.png'
            else:
                return '/static/img/units/icons/aircraft/fighter.png'
        
        # Artillery units
        elif 'artillery' in unit_type or 'hover' in unit_type:
            if 'light artillery' in unit_type:
                return '/static/img/units/icons/artillery/light_artillery.png'
            elif 'heavy artillery' in unit_type:
                return '/static/img/units/icons/artillery/heavy_artillery.png'
            elif 'hover' in unit_type:
                return '/static/img/units/icons/artillery/hover_artillery.png'
            else:
                return '/static/img/units/icons/artillery/light_artillery.png'
        
        # Orbital units
        elif 'corvette' in unit_type or 'destroyer' in unit_type or 'cruiser' in unit_type or 'battleship' in unit_type:
            if 'corvette' in unit_type:
                return '/static/img/units/icons/orbital/corvette.png'
            elif 'destroyer' in unit_type:
                return '/static/img/units/icons/orbital/destroyer.png'
            elif 'cruiser' in unit_type:
                return '/static/img/units/icons/orbital/cruiser.png'
            elif 'battleship' in unit_type:
                return '/static/img/units/icons/orbital/battleship.png'
            else:
                return '/static/img/units/icons/orbital/corvette.png'
        
        # Default fallback
        return '/static/img/units/icons/infantry/infantry.png'
    
    def get_image_style(self):
        """Get CSS style for the unit image (for colored icons)"""
        # No longer using CSS filters since we're doing actual PNG recoloring
        return ''

    def get_color_filter(self, hex_color):
        """Convert hex color to CSS filter values"""
        # Convert hex to RGB
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16) / 255.0
        g = int(hex_color[2:4], 16) / 255.0
        b = int(hex_color[4:6], 16) / 255.0
        
        # Calculate hue rotation
        import math
        max_val = max(r, g, b)
        min_val = min(r, g, b)
        diff = max_val - min_val
        
        if diff == 0:
            hue = 0
        elif max_val == r:
            hue = (60 * ((g - b) / diff) + 360) % 360
        elif max_val == g:
            hue = (60 * ((b - r) / diff) + 120) % 360
        else:
            hue = (60 * ((r - g) / diff) + 240) % 360
        
        # Calculate saturation
        if max_val == 0:
            sat = 0
        else:
            sat = diff / max_val
        
        # Calculate lightness
        light = (max_val + min_val) / 2
        
        # Apply filters
        hue_rotate = f'hue-rotate({hue}deg)'
        saturate = f'saturate({max(0.5, sat * 1.5)})'
        brightness = f'brightness({max(0.8, light * 1.2)})'
        
        return f'{hue_rotate} {saturate} {brightness}'

    def __repr__(self):
        return f'<UserUnit {self.custom_name or self.template.unit_type} owned by user {self.owner_id}>'

class Upgrade(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=False)
    compatible_unit_types = db.Column(db.Text)  # A list of unit types with which this upgrade is compatible

    def __repr__(self):
        return f'<Upgrade {self.name}>'