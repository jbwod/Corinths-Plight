document.getElementById('unit_type').addEventListener('change', function() {
    const units = {
        "Infantry Unit": {
            description: "One of the strongest forces planetside, most customizable unit in the field. Add Drop Pods to become Elite Drop Troopers at the cost of unit size.",
            fs: 5,
            armor: 0,
            speed: 1,
            range: 1,
            special_rules: "Starts with 2 upgrade points on unit creation.",
            upgrades: "Primary Equipment Slots: 4, Secondary Equipment Slots: 4"
        },
        "Power Armored Infantry": {
            description: "Half Infantry half walking tank. They hold the line using Powered armored high tech suits. One thing all Power Armored units have in common is Orbital Drop Experience.",
            fs: 3,
            armor: 2,
            speed: 1,
            range: 1,
            special_rules: "Elite Trained Power Armored Unit. Has a mount for a Mech Scale Weapon on back but does not start with one. Can Orbital Drop. Can hold Line Like Infantry.",
            upgrades: "Can Take Single Mech Weapon, Primary Equipment Slot: 2"
        },
        "Combat Medical Unit": {
            description: "Your medics and doctors in the field. Combat Medics are key to keeping wounded personnel alive and hopefully get them back in the fight. They can’t hold a line like standard infantry but they can support a line through rendering First Aid & MASH Structure.",
            fs: 3,
            armor: 0,
            speed: 1,
            range: 1,
            special_rules: "First Aid, Heal infantry 2FS per turn, Action Deploy M*A*S*H. 2 Action Setup / 1 action to Pack Up. 1 AOE health around MASH.",
            upgrades: "Medical Equipment Slots: 2, Secondary Equipment Slots: 2"
        },
        "Irregular Unit": {
            description: "These units are generally a force of either poorly trained or poorly equipped (or both!) units trying to make a name for themselves or work off a debt. If this unit can distinguish itself and make enough cash working with Armco they could become a formidable force.",
            fs: 10,
            armor: 0,
            speed: 1,
            range: 1,
            special_rules: "1/4 damage output rounded up.",
            upgrades: "High Risk Arms Slots: 2, Low Tech Melee Weapons Slot: 1"
        },
        "Special Forces": {
            description: "Smaller units trained to move unnoticed. Stealth. While they don’t have the firepower of a full infantry unit they can move around the battlefield quickly at 'speed 2' without the enemy changing its behavior. One bit of tech they all have in common is Delayed Explosive Charges.",
            fs: 3,
            armor: 0,
            speed: 2,
            range: 1,
            special_rules: "Delayed Explosive Charges, Stealth operation capabilities.",
            upgrades: "Primary Equipment Slots: 2, Secondary Equipment Slots: 2"
        },
        "Combat Engineers": {
            description: "Need a structure? You call the engineers. Need to cross a river and don’t want to get wet? Call the Engineers. Remove a minefield or wreckage creating rough terrain? Engineers. Make Emergency field repairs on a friendly vehicle unit? You guessed it. Engineers can.",
            fs: 3,
            armor: 0,
            speed: 1,
            range: 1,
            special_rules: "Can Build and Repair Structures and Repair Vehicles at 2FS per Repair Action. Engineers have 9/9 Build Supply. Each Build Action makes 3 Building Progress on the project using up 3 Building Supply.",
            upgrades: "Secondary Equipment Slots: 2, Engineer Equipment Slots: 3"
        },
        "Sappers": {
            description: "A smaller group of engineers trained to move around quietly. Can do everything the Engineers do but quietly. Sappers are an elite group and very few in number.",
            fs: 2,
            armor: 0,
            speed: 1,
            range: 1,
            special_rules: "Stealth Engineers - Can Build and Repair Structures and Repair Vehicles at 2FS per Repair Action. Each Build Action makes 3 Building Progress on the project using up 3 Building Supply. Mines - Can set mines. Explodes on enemy contact.",
            upgrades: "Primary Equipment Slot: 1, Secondary Equipment Slot: 1"
        },
        "Mechanized Infantry": {
            description: "The only vehicle based unit that can hold a hex like infantry but only from one direction; mechanized infantry can hold 1 forward hex line instead of 3. Mechanized infantry are infantry deployed from armored fighting vehicles.",
            fs: 3,
            armor: 2,
            speed: 3,
            range: 2,
            special_rules: "Can Hold a Center Hex Line Like Infantry. Has the range and speed of a vehicle without the AP of a tank.",
            upgrades: "All AP, Armor and Speed upgrades must come from the vehicle list. 1 Primary, 1 Secondary, 1 Internal slot."
        },
        "Logistic Truck": {
            description: "Key to moving such a large force around the battlefield. A Logistical unit can, with permission of the other player, tow an artillery unit using the 'Hitch Action' while also hauling 2 infantry units in the back of their cargo areas.",
            fs: 1,
            armor: 0,
            speed: 3,
            range: 0,
            special_rules: "Can carry 2 infantry units or 2 Supply Crates and Tow 1 Arty. Fits Inside a Heavy Air Transport.",
            upgrades: "1 Secondary, 1 Internal"
        },
        "Light Vehicle": {
            description: "The only vehicle unit with the Stealth Tag, though limited as they are large enough for enemy aircraft to detect them from directly above 'same hex'. They come in Wheeled and Tracked varieties and a single weapon mounted on the back.",
            fs: 2,
            armor: 0,
            speed: 4,
            range: 2,
            special_rules: "Stealth - The only vehicle unit that has this tag. Fits inside and can be air-dropped out of a Heavy Air Transport.",
            upgrades: "1 Secondary, 1 Internal"
        },
        "Light Battle Tank": {
            description: "Used for scouting duty, front line combat and capable of being dropped with para-troopers forces out of the back of a Heavy Air Transport. Unlike any other type of tank, these tanks are typically faster but with less armor than a standard main battle tank.",
            fs: 3,
            armor: 2,
            speed: 3,
            range: 2,
            special_rules: "AP 2. Armor Weak Spot - Rear Hex Wall. Fits Inside and can be air dropped out of a Heavy Air Transport.",
            upgrades: "1 Secondary, 1 Internal"
        },
        "Main Battle Tank": {
            description: "Tanks of all types support the front line. Always a Tracked vehicle, they are deployed to punch holes in the enemies' hardest of targets with high AP. Can fit inside a Heavy Air transport but can't be air-dropped.",
            fs: 3,
            armor: 3,
            speed: 2,
            range: 2,
            special_rules: "AP 3. Armor Weak Spot - Rear Hex Wall. Fits Inside a Heavy Air Transport.",
            upgrades: "1 Secondary, 1 Internal"
        },
        "Heavy Battle Tank": {
            description: "Heavier and larger than a standard main battle tank. Up-armored with a longer barreled main cannon for increased range. This increase in weight limits the transportation options for the Heavy Battle tank.",
            fs: 3,
            armor: 4,
            speed: 2,
            range: 3,
            special_rules: "AP 2. Armor Weak Spot - Rear Hex Wall. Does not fit inside the Heavy Air Transport.",
            upgrades: "1 Secondary, 1 Internal"
        },
        "Super Heavy Tank": {
            description: "The king of armored combat. Dual main weapon systems bring more firepower to the field, each cannon larger than even the Heavy Battle Tank. Only specialized transports can move this Behemoth.",
            fs: 4,
            armor: 5,
            speed: 1,
            range: 3,
            special_rules: "AP 5. Fires TWICE with each action. Armor Weak Spot - Rear Hex Wall.",
            upgrades: "2 Secondary, 2 Internal"
        },
        // Add more units here following the same pattern.
        "Light Artillery": {
            description: "A set of light guns able to be deployed and rain fire on distant enemies. While it doesn't have the damage potential of heavy artillery, these field guns can be moved by the infantry manning them and transported much easier.",
            fs: 2,
            armor: 0,
            speed: 1,
            range: 5,
            special_rules: "2 Damage, Range 5. Can't Attack Unless Deployed. Action: Deploy - sets up guns to fire. Can't move while deployed. Action: Abandon Guns - flee from your equipment and turn into a 1FS 1 Speed Infantry Unit.",
            upgrades: "1 Secondary, 2 Internal. This unit can be para-dropped from Heavy Transport Aerospace Craft."
        },
        "Heavy Artillery": {
            description: "Called the 'King of the Battlefield' for a reason. Artillery lobs rounds at the longest ranges, weakening targets, supporting friendlies, and opening holes in the front lines when needed.",
            fs: 3,
            armor: 0,
            speed: 0,
            range: 8,
            special_rules: "3 Damage, Range 8. Can't Attack Unless Deployed. Action: Deploy - sets up guns to fire. Can't move while deployed. Action: Abandon Guns - flee from your equipment and turn into a 1FS 1 Speed Infantry Unit.",
            upgrades: "1 Secondary, 2 Internal. Can be loaded into a Heavy Air Transport."
        },
        "Self-Propelled Artillery": {
            description: "The most mobile of the artillery units. Guns mounted on tracks or wheels allow them to get up and move and fire without needing to set up and deploy.",
            fs: 2,
            armor: 2,
            speed: 2,
            range: 4,
            special_rules: "Minimum Range 2. Indirect Fire - Doesn't need direct LOS to fire on hostiles and hits all units in targeted HEX.",
            upgrades: "1 Secondary, 2 Internal. Comes with (5) AP Rounds, Gift from Haven. Once Used they are gone forever."
        },
        "Fighter": {
            description: "The ultimate in speed at speed 8 and anti-air interception technology. Fighters are fast, light craft capable of operating as air support for ground forces in a pinch, or flying air defense in support of other units.",
            fs: 3,
            armor: 0,
            speed: 8,
            range: 1,
            special_rules: "Anti-Air Patrol Action, Para-survival pilot on death. Rearm after every FS based Attack. Anti-Air Patrol: In an AOE Around the Aircraft fly a patrol. Will Auto-Attack up to force strength (3) targets that enter into a hex around the fighter.",
            upgrades: "2 Light Weapon Mounts, 2 Internal Upgrades"
        },
        "VTOL Heavy Troop Airlift": {
            description: "A infantry focused troop transport that can move multiple platoon of infantry to and from the battlefield as well as some Supply inside its dedicated bay. Forward mounted light weapon offers cover for ground forces.",
            fs: 3,
            armor: 1,
            speed: 5,
            range: 1,
            special_rules: "2 Infantry Unit Capacity or 1 Supply Cargo. Rearm after every FS based Attack. Comes with Repelling gear allowing infantry to drop from the VTOL and garrison a building without using an action or requiring the VTOL to land.",
            upgrades: "1 Light Weapon Mounts, 1 Internal Upgrades"
        },
        "VTOL Multi-Purpose Airlift": {
            description: "A smaller VTOL outfitted with enough space for an infantry unit and a single light vehicle unit. Some call it a pelican others with taste a warden.",
            fs: 3,
            armor: 1,
            speed: 5,
            range: 1,
            special_rules: "1 Infantry Unit Capacity or one supply cargo and 1 Light Vehicle Unit Capacity. Rearm after every FS based Attack.",
            upgrades: "1 Light Weapon Mounts, 1 Internal Upgrades"
        },
        "VTOL Heavy Lift": {
            description: "Refit for one purpose: To move the heavy equipment. Be they an objective in the field that no one else can move or a friendly Super heavy tank / Mech to bring the pain. Some argue the most powerful team is a VTOL Heavy Lift with a friend.",
            fs: 3,
            armor: 3,
            speed: 5,
            range: 0,
            special_rules: "VTOL Craft. No Weapon. Can move a single Mech or a Single SHBT, or a Heavy Tank Unit. Hollow Mid Section for Lifting Massive Equipment. Can lift 1 Supply Cargo.",
            upgrades: "1 Light Weapon Mounts, 1 Internal Upgrades"
        },
        "Heavy Aerospace Transport": {
            description: "Winged, Fast Aerospace Transport. Basically a giant cargo-aircraft. Normally filled with full company of infantry, cargo, or even tanks. If ARMCO needs to redeploy then the HAT is the tool for the job.",
            fs: 3,
            armor: 0,
            speed: 7,
            range: 0,
            special_rules: "Massive transport Aircraft. Carry 5 Infantry Capacity or 5 Supply Cargo and Carry 2 Vehicle Units up to Main Battle Tank Size or 2 Supply Cargo. Must fly over hex to drop them.",
            upgrades: "3 Internal Upgrades. All HAT's Come with Para-Drop Systems."
        },
        "Bomber": {
            description: "If a Fighter is fast but lacks firepower, the bomber is the opposite. When a bomber flies over a target it leaves craters in its wake.",
            fs: 6,
            armor: 0,
            speed: 5,
            range: "Fly Over",
            special_rules: "Must Re-Arm after every attack. Must Fly over a target to attack. Reload after every FS based Attack.",
            upgrades: "1 Bomb Bay Slot - For specialized Weapons, 1 Internal Upgrade"
        }
    };

    const unitType = this.value;
    const unitData = units[unitType];

    if (unitData) {
        document.getElementById('description').value = unitData.description;
        document.getElementById('fs').value = unitData.fs;
        document.getElementById('armor').value = unitData.armor;
        document.getElementById('speed').value = unitData.speed;
        document.getElementById('range').value = unitData.range;
        document.getElementById('special_rules').value = unitData.special_rules;
        document.getElementById('upgrades').value = unitData.upgrades;
    } else {
        document.getElementById('description').value = '';
        document.getElementById('fs').value = '';
        document.getElementById('armor').value = '';
        document.getElementById('speed').value = '';
        document.getElementById('range').value = '';
        document.getElementById('special_rules').value = '';
        document.getElementById('upgrades').value = '';
    }
});

function submitUnitForm() {
    const unitData = {
        unit_type: document.getElementById('unit_type').value,
        description: document.getElementById('description').value,
        fs: document.getElementById('fs').value,
        armor: document.getElementById('armor').value,
        speed: document.getElementById('speed').value,
        range: document.getElementById('range').value,
        special_rules: document.getElementById('special_rules').value,
        upgrades: document.getElementById('upgrades').value
    };

    fetch("{{ url_for('create_unit') }}", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(unitData)
    })
    .then(response => response.json())
    .then(data => {
        alert('Unit created successfully!');
        console.log(data);
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Failed to create unit.');
    });
}