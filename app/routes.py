from flask import render_template, request, redirect, url_for, jsonify, flash
from flask_login import login_required, current_user, logout_user
from flask_login import login_user
from flask_paginate import get_page_parameter, Pagination
from functools import wraps
from app import app, db
from app.models import User, UnitTemplate, UserUnit, Upgrade, Legion, UserLegion
from sqlalchemy import inspect
from secrets import token_urlsafe
import json
import os
import io
import base64
from werkzeug.utils import secure_filename
from PIL import Image

# Image upload configuration
UPLOAD_FOLDER = 'app/static/uploads/unit_images'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB
MAX_IMAGE_SIZE = (256, 256)  # Maximum image dimensions

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def resize_image(image_path, max_size=MAX_IMAGE_SIZE):
    """Resize image to fit within max_size while maintaining aspect ratio"""
    with Image.open(image_path) as img:
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        img.save(image_path, optimize=True, quality=85)

@app.route('/')
def index():
    return render_template('home.html')


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            flash('You need to be logged in to view this page.')
            return redirect(url_for('login_signup', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/create_unit', methods=['GET', 'POST'])
@login_required
def create_unit():
    if request.method == 'POST':
        # Extract data from form
        unit_type_id = request.form.get('unit_type')
        custom_name = request.form.get('custom_name')
        
        # Handle equipment selection (only for infantry units for now)
        selected_equipment = []
        if 'selected_equipment' in request.form:
            try:
                selected_equipment = json.loads(request.form['selected_equipment'])
            except (json.JSONDecodeError, TypeError):
                selected_equipment = []
        
        # Get the unit template
        unit_template = UnitTemplate.query.get(unit_type_id)
        
        # Check if user can create more units
        if not current_user.can_create_unit():
            flash(f'You have reached your unit limit! You can create {current_user.get_max_units_allowed()} units at level {current_user.level}.', 'error')
            return redirect(url_for('create_unit'))
        
        # Check if user can create this unit type
        if not current_user.can_create_unit_type(unit_template.unit_type):
            required_level = current_user.get_unit_level_requirement(unit_template.unit_type)
            flash(f'You need to be level {required_level} to create {unit_template.unit_type}. You are currently level {current_user.level}.', 'error')
            return redirect(url_for('create_unit'))

        # Validate equipment selection against slot limits
        try:
            # Count by slot type
            primary_count = sum(1 for e in selected_equipment if e.get('slot_type') == 'primary')
            secondary_count = sum(1 for e in selected_equipment if e.get('slot_type') == 'secondary')
            internal_count = sum(1 for e in selected_equipment if e.get('slot_type') == 'internal')
            # upgrades are unlimited
            if primary_count > (unit_template.primary_equipment_slots or 0):
                flash(f'Too many primary items selected ({primary_count}/{unit_template.primary_equipment_slots}).', 'error')
                return redirect(url_for('create_unit'))
            if secondary_count > (unit_template.secondary_equipment_slots or 0):
                flash(f'Too many secondary items selected ({secondary_count}/{unit_template.secondary_equipment_slots}).', 'error')
                return redirect(url_for('create_unit'))
            if internal_count > (unit_template.internal_slots or 0):
                flash(f'Too many internal items selected ({internal_count}/{unit_template.internal_slots}).', 'error')
                return redirect(url_for('create_unit'))
        except Exception:
            # If anything goes wrong, be safe and block
            flash('Invalid equipment selection data.', 'error')
            return redirect(url_for('create_unit'))

        # Handle image configuration
        image_type = request.form.get('image_type', 'default')
        image_color = request.form.get('image_color')
        profile_image_id = request.form.get('profile_image_id')
        custom_image_path = None
        recolored_image_path = None
        image_data = None  # Base64 encoded image data
        
        # Debug: Check what form data we're receiving
        print(f"Form data received:")
        print(f"  image_type: {image_type}")
        print(f"  image_color: {image_color}")
        print(f"  profile_image_id: {profile_image_id}")
        print(f"  recolored_image_data present: {'recolored_image_data' in request.form}")
        if 'recolored_image_data' in request.form:
            recolored_data = request.form['recolored_image_data']
            print(f"  recolored_image_data length: {len(recolored_data) if recolored_data else 'None'}")
            print(f"  recolored_image_data starts with data:image: {recolored_data.startswith('data:image') if recolored_data else 'N/A'}")
        
        # Handle custom image upload
        if image_type == 'custom' and 'custom_image' in request.files:
            file = request.files['custom_image']
            if file and file.filename and allowed_file(file.filename):
                if file.content_length and file.content_length > MAX_FILE_SIZE:
                    flash('File too large. Maximum size is 2MB.', 'error')
                    return redirect(url_for('create_unit'))
                
                try:
                    # Read image data
                    image_bytes = file.read()
                    
                    # Resize image if needed
                    with Image.open(io.BytesIO(image_bytes)) as img:
                        if img.size[0] > MAX_IMAGE_SIZE[0] or img.size[1] > MAX_IMAGE_SIZE[1]:
                            img.thumbnail(MAX_IMAGE_SIZE, Image.Resampling.LANCZOS)
                            # Convert to RGB if necessary
                            if img.mode in ('RGBA', 'LA', 'P'):
                                img = img.convert('RGB')
                            
                            # Save to bytes
                            output = io.BytesIO()
                            img.save(output, format='PNG', optimize=True, quality=85)
                            image_bytes = output.getvalue()
                    
                    # Convert to base64
                    image_data = base64.b64encode(image_bytes).decode('utf-8')
                except Exception as e:
                    print(f"Error processing custom image: {e}")
                    flash('Error processing custom image', 'error')
                    return redirect(url_for('create_unit'))
            else:
                flash('Invalid file type. Please upload PNG, JPG, JPEG, or GIF.', 'error')
                return redirect(url_for('create_unit'))
        
        # Handle recolored image data
        if image_type == 'colored' and 'recolored_image_data' in request.form:
            try:
                recolored_data = request.form['recolored_image_data']
                if recolored_data.startswith('data:image'):
                    # Remove data URL prefix
                    image_data = recolored_data.split(',')[1]
                else:
                    image_data = recolored_data
                
                # Validate that it's valid base64
                base64.b64decode(image_data)
                print(f"Successfully processed recolored image data, length: {len(image_data)}")
            except Exception as e:
                print(f"Error processing recolored image: {e}")
                image_data = None
                # Continue without recolored image
        
        # Handle profile image (only if we don't already have image_data from colored)
        elif image_type == 'profile' and profile_image_id and not image_data:
            try:
                profile_image_path = f'app/static/img/profiles/320px enlarged/Portrait Science Fantasy ({profile_image_id})-320px.png'
                if os.path.exists(profile_image_path):
                    with open(profile_image_path, 'rb') as f:
                        image_bytes = f.read()
                    image_data = base64.b64encode(image_bytes).decode('utf-8')
            except Exception as e:
                print(f"Error processing profile image: {e}")
                # Fall back to path-based approach

        # If we received base64 image data for colored selection, treat it as custom for display logic
        image_type_final = 'custom' if (image_type == 'colored' and image_data) else image_type
        
        print(f"Creating unit: image_type={image_type}, image_type_final={image_type_final}, image_data={'present' if image_data else 'None'}")

        # Create the unit
        new_unit = UserUnit(
            custom_name=custom_name,
            owner_id=current_user.id,
            template_id=unit_type_id,
            applied_upgrades=json.dumps(selected_equipment),  # Selected equipment as upgrades
            fs = unit_template.fs,
            armor = unit_template.armor,
            speed = unit_template.speed,
            range = unit_template.range,
            primary_equipment_slots = unit_template.primary_equipment_slots,
            secondary_equipment_slots = unit_template.secondary_equipment_slots,
            internal_slots = unit_template.internal_slots,
            image_type = image_type_final,
            image_color = image_color if image_type == 'colored' else None,
            profile_image_id = int(profile_image_id) if image_type == 'profile' and profile_image_id else None,
            custom_image_path = custom_image_path,
            recolored_image_path = recolored_image_path,
            image_data = image_data
        )
        db.session.add(new_unit)
        
        # Add XP for creating a unit - Balanced based on unit tier
        unit_tier = current_user.get_tier_for_level(current_user.get_unit_level_requirement(unit_template.unit_type))
        xp_multipliers = {
            "Tier I": 25, "Tier II": 50, "Tier III": 75, "Tier IV": 100,
            "Tier V": 150, "Tier VI": 200, "Tier VII": 300, "Tier VIII": 400,
            "Tier IX": 500, "Tier X": 750
        }
        xp_gained = xp_multipliers.get(unit_tier, 50)
        level_up = current_user.add_experience(xp_gained)
        current_user.total_units_created += 1
        
        if level_up:
            flash(f'Unit created successfully! +{xp_gained} XP! Level up! You are now level {current_user.level}!', 'success')
        else:
            flash(f'Unit created successfully! +{xp_gained} XP!', 'success')
        
        db.session.commit()
        return redirect(url_for('my_units'))

    unit_templates = UnitTemplate.query.all()
    # Show all unit templates but access is controlled by level restrictions
    return render_template('create_unit.html', unit_templates=unit_templates)


@app.route('/my_units')
@login_required
def my_units():
    # user units
    units = UserUnit.query.filter_by(owner_id=current_user.id).all()
    # unit template dictionary
    unit_templates = UnitTemplate.query.all()
    
    # Calculate category counts
    infantry_count = len([u for u in units if 'Infantry' in u.template.unit_type or 'Unit' in u.template.unit_type])
    vehicle_count = len([u for u in units if any(x in u.template.unit_type for x in ['Vehicle', 'Tank', 'Truck'])])
    mech_count = len([u for u in units if 'Mech' in u.template.unit_type])
    aircraft_count = len([u for u in units if any(x in u.template.unit_type for x in ['Aircraft', 'Fighter', 'Bomber', 'VTOL', 'Transport'])])
    artillery_count = len([u for u in units if 'Artillery' in u.template.unit_type])
    orbital_count = len([u for u in units if any(x in u.template.unit_type for x in ['Corvette', 'Destroyer', 'Cruiser', 'Battleship'])])
    
    return render_template('my_units.html', 
                         units=units, 
                         unit_templates=unit_templates,
                         infantry_count=infantry_count,
                         vehicle_count=vehicle_count,
                         mech_count=mech_count,
                         aircraft_count=aircraft_count,
                         artillery_count=artillery_count,
                         orbital_count=orbital_count)

# @app.route('/create_unit')
# @login_required
# def create_unit_page():
#     return render_template('create_unit.html')

@app.route('/unit_template/<int:unit_type_id>')
def get_unit_template(unit_type_id):
    unit_template = UnitTemplate.query.get(unit_type_id)
    if unit_template:
        return jsonify({
            'description': unit_template.description,
            'fs': unit_template.fs,
            'armor': unit_template.armor,
            'speed': unit_template.speed,
            'range': unit_template.range,
            'special_rules': unit_template.special_rules,
            'primary_equipment_slots': unit_template.primary_equipment_slots,
            'secondary_equipment_slots': unit_template.secondary_equipment_slots,
            'internal_slots': unit_template.internal_slots,
            'structure_build_list': unit_template.structure_build_list,
            'logistic_needs': unit_template.logistic_needs,
            'deployment_capabilities': unit_template.deployment_capabilities,
            'unit_type': unit_template.unit_type
        })
    return jsonify({'error': 'Unit template not found'}), 404

@app.route('/api/unit-templates')
def api_unit_templates():
    unit_templates = UnitTemplate.query.all()
    
    return jsonify({
        'unit_templates': [{
            'id': unit.id,
            'unit_type': unit.unit_type,
            'description': unit.description,
            'fs': unit.fs,
            'armor': unit.armor,
            'speed': unit.speed,
            'range': unit.range,
            'special_rules': unit.special_rules,
            'primary_equipment_slots': unit.primary_equipment_slots,
            'secondary_equipment_slots': unit.secondary_equipment_slots,
            'internal_slots': unit.internal_slots,
            'structure_build_list': unit.structure_build_list,
            'logistic_needs': unit.logistic_needs,
            'deployment_capabilities': unit.deployment_capabilities
        } for unit in unit_templates]
    })

@app.route('/dossier')
@login_required
def profile():
    unit_templates = UnitTemplate.query.all()
    
    # Get next level units
    next_level_units = []
    for unit in unit_templates:
        if current_user.get_unit_level_requirement(unit.unit_type) == current_user.level + 1:
            next_level_units.append(unit)
    
    # Convert unit templates to dictionaries for JSON serialization
    unit_templates_dict = [{
        'id': unit.id,
        'unit_type': unit.unit_type,
        'description': unit.description,
        'fs': unit.fs,
        'armor': unit.armor,
        'speed': unit.speed,
        'range': unit.range,
        'special_rules': unit.special_rules,
        'primary_equipment_slots': unit.primary_equipment_slots,
        'secondary_equipment_slots': unit.secondary_equipment_slots,
        'structure_build_list': unit.structure_build_list,
        'logistic_needs': unit.logistic_needs,
        'deployment_capabilities': unit.deployment_capabilities
    } for unit in unit_templates]
    
    # Convert next level units to dictionaries
    next_level_units_dict = [{
        'id': unit.id,
        'unit_type': unit.unit_type,
        'description': unit.description,
        'fs': unit.fs,
        'armor': unit.armor,
        'speed': unit.speed,
        'range': unit.range,
        'special_rules': unit.special_rules,
        'primary_equipment_slots': unit.primary_equipment_slots,
        'secondary_equipment_slots': unit.secondary_equipment_slots,
        'structure_build_list': unit.structure_build_list,
        'logistic_needs': unit.logistic_needs,
        'deployment_capabilities': unit.deployment_capabilities
    } for unit in next_level_units]
    
    return render_template('profile.html', 
                         name=current_user.username, 
                         unit_templates=unit_templates,
                         next_level_units=next_level_units_dict)

@app.route('/login', methods=['GET'])
def login_signup():
    return render_template('login_signup.html')

@app.route('/login', methods=['POST'])
def handle_login():
    # super simple login for now - will use flask-login for a more secure login
    username = request.form['username']
    password = request.form['password']

   # https://docs.sqlalchemy.org/en/14/orm/query.html
    user = User.query.filter_by(username=username).first()
    if user is None or user.password != password:
        #return 'Invalid username or password', 400
        flash('Invalid username or password, please try again')
        return redirect(url_for('login_signup'))
    login_user(user)
    return redirect(url_for('profile'))

@app.route('/signup', methods=['POST'])
def signup_user():
    username = request.form['setusername']
    email = request.form['setemail']
    password = request.form['createpassword']
    confirm_password = request.form['confirmpassword']

    if password != confirm_password:
        #return 'Passwords do not match', 400
        flash ('Passwords do not match')
        return redirect(url_for('login_signup'))

    user_exists = User.query.filter_by(username=username).first() is not None
    email_exists = User.query.filter_by(email=email).first() is not None

    if user_exists:
        #return 'Username already exists', 400
        flash ('Username already exists')
        return redirect(url_for('login_signup'))
    if email_exists:
        #return 'Email already exists', 400
        flash ('Email already exists')
        return redirect(url_for('login_signup'))

    # Some kind of password store/hash thing should go here for now will just use the password as is
    new_user = User(username=username, email=email, password=password)
    db.session.add(new_user)
    db.session.commit()
    # Successful signup
    return redirect(url_for('login_signup'))

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out')
    return redirect(url_for('login_signup'))

@app.route('/legion_directory')
def legion_directory():
    search_query = request.args.get('search', '', type=str)
    page = request.args.get(get_page_parameter(), type=int, default=1)

    # Query for preset legions to display at the top
    preset_legions = Legion.query.filter(Legion.id.in_([1, 2, 3])).all()  # Adjust IDs based on your presets

    # Query for public legions considering the search query
    legions_query = Legion.query.filter(Legion.is_public == True)
    if search_query:
        legions_query = legions_query.filter(Legion.name.ilike(f'%{search_query}%'))

    legions = legions_query.paginate(page=page, per_page=10, error_out=False)
    
    # Calculate total members for all legions
    total_members = sum(legion.get_member_count() for legion in legions.items)
    public_legions_count = len([l for l in legions.items if l.is_public])

    return render_template('legion_directory.html', legions=legions, preset_legions=preset_legions, search_query=search_query, total_members=total_members, public_legions_count=public_legions_count)

@app.route('/legion_dashboard/<int:legion_id>')
@login_required
def legion_dashboard(legion_id):
    legion = Legion.query.get(legion_id)
    if not legion:
        flash('Legion not found', 'error')
        return redirect(url_for('index'))

    # Check if current user is part of this legion
    current_user_legion = UserLegion.query.filter_by(user_id=current_user.id, legion_id=legion_id).first()
    if not current_user_legion:
        flash('You are not a member of this legion.', 'error')
        return redirect(url_for('index'))

    total_units = sum(len(member_link.user.user_units.all()) for member_link in legion.legion_members)

    return render_template('legion_dashboard.html', legion=legion, total_units=total_units, current_user_legion=current_user_legion)


@app.route('/update_legion_coa/<int:legion_id>', methods=['POST'])
@login_required
def update_legion_coa(legion_id):
    if not current_user.is_leader(legion_id):  # Implement this method or check based on your user's role.
        return jsonify({'success': False, 'message': 'You do not have permission to update the legion COA.'}), 403
    legion = Legion.query.get_or_404(legion_id)
    legion.coa_string = request.form['coa_string']
    db.session.commit()
    flash('Legion COA updated successfully!', 'success')
    return redirect(url_for('legion_dashboard', legion_id=legion_id))

@app.route('/update_legion_name/<int:legion_id>', methods=['POST'])
@login_required
def update_legion_name(legion_id):
    if not current_user.is_leader(legion_id):
        return jsonify({'success': False, 'message': 'You do not have permission to update the legion name.'}), 403
    legion = Legion.query.get_or_404(legion_id)
    legion.name = request.form['name']
    db.session.commit()
    flash('Legion name updated successfully!', 'success')
    return redirect(url_for('legion_dashboard', legion_id=legion_id))

@app.route('/update_legion_description/<int:legion_id>', methods=['POST'])
@login_required
def update_legion_description(legion_id):
    if not current_user.is_leader(legion_id):
        return jsonify({'success': False, 'message': 'You do not have permission to update the legion description.'}), 403
    legion = Legion.query.get_or_404(legion_id)
    legion.description = request.form['description']
    db.session.commit()
    flash('Legion description updated successfully!', 'success')
    return redirect(url_for('legion_dashboard', legion_id=legion_id))

@app.route('/toggle_public_status/<int:legion_id>', methods=['POST'])
@login_required
def toggle_public_status(legion_id):
    legion = Legion.query.get_or_404(legion_id)
    if current_user.is_leader(legion_id):
        legion.toggle_public()
        return jsonify(success=True, message="Legion status updated.")
    return jsonify(success=False, message="Not authorized."), 403

@app.route('/regenerate_invite_code/<int:legion_id>', methods=['POST'])
@login_required
def regenerate_invite_code(legion_id):
    legion = Legion.query.get_or_404(legion_id)
    if current_user.is_leader(legion_id) and not legion.is_public:
        legion.invite_code = token_urlsafe(16)
        db.session.commit()
        return jsonify(success=True, new_code=legion.invite_code)

@app.route('/create_legion', methods=['GET', 'POST'])
@login_required
def create_legion():
    if request.method == 'POST':
        # Extract form data
        name = request.form.get('name')
        description = request.form.get('description')
        motto = request.form.get('motto')
        headquarters = request.form.get('headquarters')
        faction = request.form.get('faction')
        coa_string = request.form.get('coa_string')
        max_members = int(request.form.get('max_members', 50))
        recruitment_status = request.form.get('recruitment_status', 'open')
        is_public = request.form.get('is_public') == 'true'
        allow_public_join = request.form.get('allow_public_join') == 'true'
        require_approval = request.form.get('require_approval') == 'true'
        auto_accept_invites = request.form.get('auto_accept_invites') == 'true'
        
        # Create new legion
        legion = Legion(
            name=name,
            description=description,
            motto=motto,
            headquarters=headquarters,
            faction=faction,
            coa_string=coa_string,
            max_members=max_members,
            recruitment_status=recruitment_status,
            is_public=is_public,
            allow_public_join=allow_public_join,
            require_approval=require_approval,
            auto_accept_invites=auto_accept_invites
        )
        
        db.session.add(legion)
        db.session.commit()
        
        # Add creator as leader
        user_legion = UserLegion(
            user_id=current_user.id,
            legion_id=legion.id,
            role='leader'
        )
        db.session.add(user_legion)
        
        # Add XP for creating a legion
        xp_gained = 100
        level_up = current_user.add_experience(xp_gained)
        
        if level_up:
            db.session.commit()
            flash(f'Legion created successfully! +{xp_gained} XP! Level up! You are now level {current_user.level}!', 'success')
        else:
            db.session.commit()
            flash(f'Legion created successfully! +{xp_gained} XP!', 'success')
        
        return redirect(url_for('legion_dashboard', legion_id=legion.id))
    
    return render_template('create_legion.html')

@app.route('/join_legion/<int:legion_id>', methods=['POST'])
@login_required
def join_legion(legion_id):
    legion = Legion.query.get_or_404(legion_id)
    
    # Check if user can join
    if not legion.can_join(current_user):
        return jsonify(success=False, message='Cannot join this legion')
    
    # Add user to legion
    user_legion = UserLegion(
        user_id=current_user.id,
        legion_id=legion_id,
        role='member'
    )
    db.session.add(user_legion)
    
    # Add XP for joining a legion
    xp_gained = 25
    level_up = current_user.add_experience(xp_gained)
    
    if level_up:
        db.session.commit()
        return jsonify(success=True, message=f'Successfully joined the legion! +{xp_gained} XP! Level up! You are now level {current_user.level}!')
    else:
        db.session.commit()
        return jsonify(success=True, message=f'Successfully joined the legion! +{xp_gained} XP!')

@app.route('/api/profile-images')
@login_required
def get_profile_images():
    """Get list of available profile images"""
    profile_images = []
    profile_dir = 'app/static/img/profiles/320px enlarged'
    
    if os.path.exists(profile_dir):
        for filename in os.listdir(profile_dir):
            if filename.endswith('.png'):
                # Extract ID from filename like "Portrait Science Fantasy (92)-320px.png"
                # Look for number in parentheses
                import re
                match = re.search(r'\((\d+)\)', filename)
                if match:
                    image_id = match.group(1)
                else:
                    # Fallback: use filename without extension
                    image_id = filename.split('.')[0]
                
                profile_images.append({
                    'id': image_id,
                    'filename': filename,
                    'url': f'/static/img/profiles/320px enlarged/{filename}'
                })
    
    return jsonify({'profile_images': profile_images})

@app.route('/update-profile-image', methods=['POST'])
@login_required
def update_profile_image():
    """Update user's profile image"""
    try:
        data = request.get_json()
        if not data:
            return jsonify(success=False, message='No JSON data received'), 400
            
        profile_image_id = data.get('profile_image_id')
        
        if profile_image_id:
            current_user.profile_image_id = int(profile_image_id)
        else:
            current_user.profile_image_id = None
            
        db.session.commit()
        
        return jsonify(success=True, message='Profile image updated successfully!')
    except Exception as e:
        db.session.rollback()
        return jsonify(success=False, message=f'Error updating profile image: {str(e)}'), 500

@app.route('/api/equipment-templates')
@login_required
def get_equipment_templates():
    """Get available equipment templates"""
    try:
        from app.models import EquipmentTemplate
        
        # Get equipment templates for infantry units
        equipment = EquipmentTemplate.query.filter(
            (EquipmentTemplate.unit_restriction == 'infantry') | 
            (EquipmentTemplate.unit_restriction.is_(None))
        ).all()
        
        equipment_list = []
        for eq in equipment:
            equipment_list.append({
                'id': eq.id,
                'name': eq.name,
                'slot_type': eq.slot_type,
                'rule': eq.rule,
                'cost': eq.cost,
                'unit_restriction': eq.unit_restriction
            })
        
        return jsonify(equipment_list)
    except Exception as e:
        return jsonify({'error': str(e)}), 500