from flask import render_template, request, redirect, url_for, jsonify, flash
from flask_login import login_required, current_user, logout_user
from flask_login import login_user
from functools import wraps
from app import app, db
from app.models import User, UnitTemplate, UserUnit, Upgrade, Legion, UserLegion
from sqlalchemy import inspect
import json

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
        # CONFIRM CSRF TOKEN
        unit_type_id = request.form.get('unit_type')
        custom_name = request.form.get('custom_name')
        selected_upgrades = request.form.getlist('upgrades')

        # Create the unit
        new_unit = UserUnit(
            custom_name=custom_name,
            owner_id=current_user.id,
            template_id=unit_type_id,
            applied_upgrades=json.dumps(selected_upgrades),
            fs = UnitTemplate.query.get(unit_type_id).fs,
            armor = UnitTemplate.query.get(unit_type_id).armor,
            speed = UnitTemplate.query.get(unit_type_id).speed,
            range = UnitTemplate.query.get(unit_type_id).range,
            primary_equipment_slots = UnitTemplate.query.get(unit_type_id).primary_equipment_slots,
            secondary_equipment_slots = UnitTemplate.query.get(unit_type_id).secondary_equipment_slots,
            internal_slots = UnitTemplate.query.get(unit_type_id).internal_slots
        )
        db.session.add(new_unit)
        db.session.commit()
        return redirect(url_for('my_units'))

    unit_templates = UnitTemplate.query.all()
    upgrades = Upgrade.query.all()
    return render_template('create_unit.html', unit_templates=unit_templates, upgrades=upgrades)


@app.route('/my_units')
@login_required
def my_units():
    # user units
    units = UserUnit.query.filter_by(owner_id=current_user.id).all()
    # unit template dictionary
    unit_templates = UnitTemplate.query.all()
    return render_template('my_units.html', units=units, unit_templates=unit_templates)

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

@app.route('/dossier')
@login_required
def profile():
    return render_template('profile.html', name=current_user.username)

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

@app.route('/promote_member/<int:legion_id>/<int:user_id>', methods=['POST'])
@login_required
def promote_member(legion_id, user_id):
    # Check if the current user is a leader in the legion
    user_legion_link = UserLegion.query.filter_by(legion_id=legion_id, user_id=current_user.id).first()
    if not user_legion_link or user_legion_link.role != 'leader':
        return jsonify({'success': False, 'message': 'You do not have permission to promote members.'}), 403

    # Fetch the user_legion link of the member to be promoted
    member_to_promote = UserLegion.query.filter_by(legion_id=legion_id, user_id=user_id).first()
    if member_to_promote:
        member_to_promote.role = 'leader'
        db.session.commit()
        return jsonify({'success': True, 'message': 'Member promoted successfully.'})
    else:
        return jsonify({'success': False, 'message': 'Member not found'}), 404

@app.route('/demote_member/<int:legion_id>/<int:user_id>', methods=['POST'])
@login_required
def demote_member(legion_id, user_id):
    # Check if the current user is a leader in the legion
    user_legion_link = UserLegion.query.filter_by(legion_id=legion_id, user_id=current_user.id).first()
    if not user_legion_link or user_legion_link.role != 'leader':
        return jsonify({'success': False, 'message': 'You do not have permission to demote members.'}), 403

    # Fetch the user_legion link of the member to be demoted
    member_to_demote = UserLegion.query.filter_by(legion_id=legion_id, user_id=user_id).first()
    if member_to_demote:
        member_to_demote.role = 'member'
        db.session.commit()
        return jsonify({'success': True, 'message': 'Member demoted successfully.'})
    else:
        return jsonify({'success': False, 'message': 'Member not found'}), 404

@app.route('/remove_member/<int:legion_id>/<int:user_id>', methods=['POST'])
@login_required
def remove_member(legion_id, user_id):
    # Check if the current user is a leader in the legion
    user_legion_link = UserLegion.query.filter_by(legion_id=legion_id, user_id=current_user.id).first()
    if not user_legion_link or user_legion_link.role != 'leader':
        return jsonify({'success': False, 'message': 'You do not have permission to remove members.'}), 403

    # Fetch the user_legion link of the member to be removed
    member_to_remove = UserLegion.query.filter_by(legion_id=legion_id, user_id=user_id).first()
    if member_to_remove:
        db.session.delete(member_to_remove)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Member removed successfully.'})
    else:
        return jsonify({'success': False, 'message': 'Member not found'}), 404


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

