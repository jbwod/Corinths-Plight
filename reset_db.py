#!/usr/bin/env python3
"""
Database reset script for Corinth's Plight
This script completely resets the database and reinitializes it.
"""

from app import app, db
from app.unit_templates import updateTemplates, legionTemplates
from app.models import User, UnitTemplate, Upgrade, Legion, UserLegion, UserUnit

def reset_database():
    """Reset the database and reinitialize with fresh data."""
    print("⚠️  WARNING: This will completely reset the database!")
    print("All existing data will be lost.")
    
    confirm = input("Are you sure you want to continue? (yes/no): ")
    if confirm.lower() != 'yes':
        print("❌ Database reset cancelled.")
        return
    
    print("🔄 Resetting Corinth's Plight Database...")
    
    with app.app_context():
        # Drop all tables
        print("🗑️ Dropping all tables...")
        db.drop_all()
        
        # Create all tables
        print("📋 Creating fresh database tables...")
        db.create_all()
        
        # Load unit templates
        print("⚔️ Loading unit templates...")
        updateTemplates()
        print("✅ Unit templates loaded successfully!")
        
        # Create test users and legions
        print("👥 Creating test users and legions...")
        legionTemplates()
        print("✅ Test users and legions created successfully!")
        
        # Create basic upgrades
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
        
        # Print summary
        unit_count = UnitTemplate.query.count()
        user_count = User.query.count()
        upgrade_count = Upgrade.query.count()
        
        print("\n🎉 Database reset complete!")
        print(f"📊 Summary:")
        print(f"   • Unit Templates: {unit_count}")
        print(f"   • Users: {user_count}")
        print(f"   • Upgrades: {upgrade_count}")
        print("\n🚀 You can now run the application with: python run.py")

if __name__ == "__main__":
    reset_database()
