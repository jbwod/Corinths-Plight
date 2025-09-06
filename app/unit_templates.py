from app import app, db
from app.models import UnitTemplate, Legion, User, UserLegion


def updateTemplates():
    infantry_units = [
        UnitTemplate(
            unit_type="Infantry Unit",
            description="One of the strongest forces planetside, most customizable unit in the field. Add Drop Pods to become Elite Drop Troopers at the cost of unit size.",
            fs=5, armor=0, speed=1, range=1,
            special_rules="Starts with 2 upgrade points on unit creation.",
            primary_equipment_slots=4, secondary_equipment_slots=4,
            logistic_needs=None, deployment_capabilities="Drop Pod capable"
        ),
        UnitTemplate(
            unit_type="Power Armored Infantry",
            description="Half Infantry, half walking tank. They hold the line using powered armored high-tech suits.",
            fs=3, armor=2, speed=1, range=1,
            special_rules="Elite Trained Power Armored Unit. Can Orbital Drop. Can hold Line Like Infantry. Can mount Mech Scale Weapons.",
            primary_equipment_slots=2, secondary_equipment_slots=0,
            logistic_needs=None, deployment_capabilities="Orbital Drop"
        ),
        UnitTemplate(
            unit_type="Combat Medical Unit",
            description="Medics and doctors in the field, key to keeping wounded personnel alive and hopefully getting them back in the fight.",
            fs=3, armor=0, speed=1, range=1,
            special_rules="First Aid, Heal infantry 2FS per turn, Action Deploy M*A*S*H. 2 Action Setup / 1 action to Pack Up. 1 AOE health around MASH.",
            primary_equipment_slots=2, secondary_equipment_slots=2,
            logistic_needs=None, deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="Irregular Unit",
            description="A force of either poorly trained or poorly equipped units trying to make a name for themselves or work off a debt.",
            fs=10, armor=0, speed=1, range=1,
            special_rules="1/4 damage output rounded up. Can only equip High Risk Arms or Low Tech Melee",
            primary_equipment_slots=0, secondary_equipment_slots=3,
            logistic_needs=None, deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="Special Forces",
            description="Smaller units trained to move unnoticed. They don’t have the firepower of a full infantry unit but can move quickly.",
            fs=3, armor=0, speed=2, range=1,
            special_rules="Stealth. Delayed Explosive Charges.",
            primary_equipment_slots=2, secondary_equipment_slots=2,
            logistic_needs=None, deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="Combat Engineer",
            description="Engineers are the backbone of any military force, building and repairing equipment and fortifications.",
            fs=3, armor=0, speed=1, range=1,
            special_rules="Can build fortifications. Can repair vehicles and mechs @ 2FS per Repair.",
            primary_equipment_slots=2, secondary_equipment_slots=3,structure_build_list="Dig Trenches, Build Bunkers",
            logistic_needs="Requires Building Supply 9/9 - resupplied GSM", deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="Sapper Unit",
            description="A smaller group of engineers trained to move quietly and destroy enemy fortifications. Can do everything an engineer can do.",
            fs=2, armor=0, speed=1, range=1,
            special_rules="Stealth Engineers - Can Build and Repair Structures and Repair Vehicles at 2FS per Repair Action. Comes with Mines. ",
            primary_equipment_slots=1, secondary_equipment_slots=1, structure_build_list="Sensor Tower, Mine Field",
            logistic_needs="Requires Building Supply 6/6 - respupplied GSM", deployment_capabilities=None
        )

    ]

    vehicle_units = [
        UnitTemplate(
            unit_type="Mechanized Infantry",
            description="Vehicle based unit that can hold a hex like infantry from one direction.",
            fs=3, armor=2, speed=3, range=2,
            special_rules="Can hold a Center Hex Line Like Infantry. Has the range and speed of a vehicle without the AP of a tank. Can be upgraded from Infantry and Vehicle lists. All AP, Armor and Speed upgrades must come from the vehicle list.",
            primary_equipment_slots=1, secondary_equipment_slots=1, internal_slots=1,
            logistic_needs=None, deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="Logistic Truck",
            description="Essential for transporting large forces and critical supplies across the battlefield.",
            fs=1, armor=0, speed=3, range=0,
            special_rules="Can carry 2 infantry units or 2 Supply Crates and Tow 1 Artillery.",
            primary_equipment_slots=0, secondary_equipment_slots=1, internal_slots=1,
            logistic_needs=None, deployment_capabilities="Fits Inside a Heavy Air Transport"
        ),
        UnitTemplate(
            unit_type="Light Vehicle",
            description="Quick and quiet, suited for reconnaissance and light skirmishes.",
            fs=2, armor=0, speed=4, range=2,
            special_rules="Stealth. Fits inside and can be air-dropped out of a Heavy Air Transport.",
            primary_equipment_slots=0, secondary_equipment_slots=1, internal_slots=1,
            logistic_needs=None, deployment_capabilities="Fits Inside a Heavy Air Transport. Air-drop capable"
        ),
        UnitTemplate(
            unit_type="Light Battle Tank",
            description="Used for scouting duty and front-line combat, capable of being dropped with paratroopers.",
            fs=3, armor=2, speed=3, range=2,
            special_rules="AP 2. Armor Weak Spot - Rear Hex Wall.",
            primary_equipment_slots=0, secondary_equipment_slots=1, internal_slots=1,
            logistic_needs=None, deployment_capabilities="Fits Inside a Heavy Air Transport. Air-drop capable"
        ),
        UnitTemplate(
            unit_type="Main Battle Tank",
            description="Supports the front line, deployed to punch holes in the enemies' hardest targets.",
            fs=3, armor=3, speed=2, range=2,
            special_rules="AP 3. Armor Weak Spot - Rear Hex Wall.",
            primary_equipment_slots=0, secondary_equipment_slots=1, internal_slots=1,
            logistic_needs=None, deployment_capabilities="Fits Inside a Heavy Air Transport."
        ),
        UnitTemplate(
            unit_type="Heavy Battle Tank",
            description="Heavier and more powerful than standard battle tanks, with increased range and firepower.",
            fs=3, armor=4, speed=2, range=3,
            special_rules="AP 2. Armor Weak Spot - Rear Hex Wall.",
            primary_equipment_slots=0, secondary_equipment_slots=1, internal_slots=1,
            logistic_needs=None, deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="Super Heavy Tank",
            description="The king of armored combat, brings more firepower to the field, each cannon larger than even the Heavy Battle Tank.",
            fs=4, armor=5, speed=1, range=3,
            special_rules="AP 5. Fires TWICE with each action. Armor Weak Spot - Rear Hex Wall.",
            primary_equipment_slots=0, secondary_equipment_slots=2, internal_slots=2,
            logistic_needs=None, deployment_capabilities=None
        )
    ]

    mech_units = [
        UnitTemplate(
            unit_type="Light Mech",
            description="Fast, perfect for scouting missions. Light Mechs rush across the battlefield.",
            fs=3, armor=1, speed=4, range=0,
            special_rules="Can crouch to use level 1 terrain as cover from direct weapons if blocking LOS.",
            internal_slots=1,
            logistic_needs=None, deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="Medium Mech",
            description="Still decently fast for a mech, the medium mech has more space for weapons and equipment.",
            fs=4, armor=2, speed=3, range=0,
            special_rules="Legged - Can see over Terrain at level 1 higher. Can crouch to use level 1 terrain as cover from direct weapons.",
            internal_slots=2,
            logistic_needs=None, deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="Heavy Mech",
            description="Slow but incredibly well armored, the heavy mech towers over the battlefield.",
            fs=5, armor=3, speed=2, range=0,
            special_rules="Can fire all weapons at once or one at a time. Legged - Can see over Terrain at level 1 higher.",
            internal_slots=3,
            logistic_needs=None, deployment_capabilities=None
        )
    ]

    aerial_units = [
        UnitTemplate(
            unit_type="Fighter Aircraft",
            description="Fast and agile, designed for air superiority and rapid response.",
            fs=3, armor=0, speed=8, range=1,
            special_rules="Anti-Air Patrol. Auto-Attack up to force strength (3) targets that enter into a hex around the fighter.",
            primary_equipment_slots=2, internal_slots=2,
            logistic_needs="Rearm after every FS based attack", deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="VTOL Heavy Troop Airlift",
            description="Capable of transporting multiple platoons and providing close air support.",
            fs=3, armor=1, speed=5, range=1,
            special_rules="Carry 2 Infantry Units or 1 Supply Cargo. Comes with Repelling gear allowing infantry to drop from the VTOL.",
            primary_equipment_slots=1, internal_slots=1,
            logistic_needs="Rearm after every FS based attack", deployment_capabilities="Drop capability without needing to land"
        ),
        UnitTemplate(
            unit_type="Heavy Aerospace Transport",
            description="A large aircraft designed to transport infantry, cargo, and up to medium-sized vehicles.",
            fs=3, armor=0, speed=7, range=0,
            special_rules="Carry 5 Infantry Capacity or 5 Supply Cargo and 2 Vehicle Units up to Main Battle Tank size.",
            internal_slots=3,
            logistic_needs=None, deployment_capabilities="Air drop capable"
        ),
        UnitTemplate(
            unit_type="Bomber Aircraft",
            description="Designed to deliver massive payloads over long distances, causing extensive damage.",
            fs=6, armor=0, speed=5, range='Fly Over',
            special_rules="Must rearm after every attack. Must fly over a target to attack.",
            primary_equipment_slots=1, internal_slots=1,
            logistic_needs="Reload after every FS based attack", deployment_capabilities="Bombing capabilities"
        )
    ]

    artillery_units = [
        UnitTemplate(
            unit_type="Light Artillery",
            description="Mobile artillery capable of firing over long distances without direct line-of-sight.",
            fs=2, armor=0, speed=1, range=5,
            special_rules="Indirect Fire, no LOS. Can't attack unless deployed. Can be para-dropped from a heavy air transport. Deploy. Abandon Guns. 2 Attacks per turn.",
            primary_equipment_slots=0, secondary_equipment_slots=1, internal_slots=2,
            logistic_needs=None, deployment_capabilities="Parachute deployment capable"
        ),
        UnitTemplate(
            unit_type="Heavy Artillery",
            description="Delivers devastating barrages at extreme range, supporting friendlies and opening holes in front lines. ",
            fs=3, armor=0, speed=0, range=8,
            special_rules="Indirect Fire, no LOS. Can't attack unless deployed. Deploy. Abandon Guns. 3 Attacks per turn. Unable to move without support.",
            primary_equipment_slots=0, secondary_equipment_slots=1, internal_slots=2,
            logistic_needs=None, deployment_capabilities="Heavy transport loadable. Requires a vehicle to move."
        ),
        UnitTemplate(
            unit_type="Hover Artillery",
            description="Artillery that can move over terrain and fire from unexpected angles.",
            fs=2, armor=2, speed=2, range=4,
            special_rules="Indirect Fire, no LOS. Can move over terrain. No deployment needed but limited to 1 attack.",
        )
    ]


    orbital_units = [
        UnitTemplate(
            unit_type="Corvette",
            description="Smallest and fastest of the warship classifications, ranging from supporting science ships to light orbital support for special operations.",
            fs=10, armor=2, speed=4, range=6,
            special_rules="The only size orbital that can land with the right equipment. Weak against anti-orbital weapon systems.",
            internal_slots=4,
            logistic_needs=None, deployment_capabilities="Planetary landing capable"
        ),
        UnitTemplate(
            unit_type="Destroyer",
            description="More equipped than a corvette, used for longer missions with more customization, cannot land on planets but can act as a fleet tender.",
            fs=10, armor=3, speed=3, range=6,
            special_rules="Can have hangars and cargo. Weak against anti-orbital weapon systems.",
            internal_slots=4,
            logistic_needs=None, deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="Cruiser",
            description="Larger, slower ships designed for major combat operations, with extensive space for equipment and personnel.",
            fs=10, armor=4, speed=2, range=6,
            special_rules="Slower than smaller orbitals but more capable in space.",
            internal_slots=4,
            logistic_needs=None, deployment_capabilities=None
        ),
        UnitTemplate(
            unit_type="Battleship",
            description="The largest and most heavily armored of the orbital classes, designed to take and deliver massive damage.",
            fs=10, armor=5, speed=1, range=6,
            special_rules="The largest and slowest orbital class, can endure extreme damage.",
            internal_slots=4,
            logistic_needs=None, deployment_capabilities=None
        )
    ]

    #remove all units first
    UnitTemplate.query.delete()


    db.session.add_all(infantry_units)
    db.session.add_all(vehicle_units)
    db.session.add_all(mech_units)
    db.session.add_all(aerial_units)
    db.session.add_all(artillery_units)
    db.session.add_all(orbital_units)
    db.session.commit()


def legionTemplates():
    user = User(username='test', password='test', email='test@test.com')
    user1 = User(username='test1', password='test1', email='test1@test.com')
    db.session.add_all([user, user1])
    db.session.commit()

    legion = Legion(name='Test Legion', description='A test legion for debugging.')
    db.session.add(legion)
    db.session.commit()

    user_legion_link = UserLegion(user_id=user.id, legion_id=legion.id, role='leader')
    user_legion_link1 = UserLegion(user_id=user1.id, legion_id=legion.id, role='member')
    db.session.add_all([user_legion_link, user_legion_link1])
    db.session.commit()

    print("Test Legion and user setup complete.")