#!/usr/bin/env python3
"""
Database initialization script for Corinth's Plight
This script initializes the database and populates it with unit templates and test data.
"""

from app import app, db
from app.unit_templates import updateTemplates, legionTemplates
from app.models import User, UnitTemplate, Upgrade

def init_database():
    """Initialize the database with all required data."""
    print("🚀 Initializing Corinth's Plight Database...")
    
    with app.app_context():
        # Create all tables
        print("📋 Creating database tables...")
        db.create_all()
        
        # Check if unit templates already exist
        if UnitTemplate.query.first() is None:
            print("⚔️ Loading unit templates...")
            updateTemplates()
            print("✅ Unit templates loaded successfully!")
        else:
            print("ℹ️ Unit templates already exist, skipping...")
        
        # Check if test users already exist
        if User.query.first() is None:
            print("👥 Creating test users and legions...")
            legionTemplates()
            print("✅ Test users and legions created successfully!")
        else:
            print("ℹ️ Test users already exist, skipping...")
        
        # Create some basic upgrades if they don't exist
        if Upgrade.query.first() is None:
            print("🔧 Creating basic upgrades...")
            upgrades = [
                Upgrade(
                    name="Advanced Targeting System",
                    description="Increases accuracy and range by 1",
                    compatible_unit_types="Infantry Unit,Power Armored Infantry,Special Forces"
                ),
                Upgrade(
                    name="Reinforced Armor",
                    description="Increases armor by 1",
                    compatible_unit_types="Power Armored Infantry,Light Battle Tank,Main Battle Tank,Heavy Battle Tank"
                ),
                Upgrade(
                    name="High-Speed Engine",
                    description="Increases speed by 1",
                    compatible_unit_types="Light Vehicle,Light Battle Tank,Fighter Aircraft"
                ),
                Upgrade(
                    name="Extended Range Optics",
                    description="Increases range by 1",
                    compatible_unit_types="Infantry Unit,Special Forces,Light Artillery,Heavy Artillery"
                ),
                Upgrade(
                    name="Stealth Coating",
                    description="Adds stealth capability",
                    compatible_unit_types="Special Forces,Light Vehicle,Light Mech,Medium Mech"
                )
            ]
            
            for upgrade in upgrades:
                db.session.add(upgrade)
            
            db.session.commit()
            print("✅ Basic upgrades created successfully!")
        else:
            print("ℹ️ Upgrades already exist, skipping...")
        
        # Print summary
        unit_count = UnitTemplate.query.count()
        user_count = User.query.count()
        upgrade_count = Upgrade.query.count()
        
        print("\n🎉 Database initialization complete!")
        print(f"📊 Summary:")
        print(f"   • Unit Templates: {unit_count}")
        print(f"   • Users: {user_count}")
        print(f"   • Upgrades: {upgrade_count}")
        print("\n🚀 You can now run the application with: python run.py")

if __name__ == "__main__":
    init_database()
