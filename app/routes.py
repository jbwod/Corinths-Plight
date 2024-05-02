from flask import render_template, request, redirect, url_for, jsonify, flash
from flask_login import login_required, current_user, logout_user
from flask_login import login_user
from functools import wraps
from app import app, db
from app.models import User, UnitTemplate, UserUnit, Upgrade
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

@app.route('/create_unit')
@login_required
def create_unit_page():
    return render_template('create_unit.html')

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
            'special_rules': unit_template.special_rules
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

@app.route('/list_tables')
def list_tables():
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()
    return jsonify(tables)

@app.route('/list_columns/<table_name>')
def list_columns(table_name):
    inspector = inspect(db.engine)
    columns = inspector.get_columns(table_name)
    column_info = [{ 'name': col['name'], 'type': str(col['type']) } for col in columns]
    return jsonify(column_info)

@app.route('/list_users')
def list_users():
    user_array = []
    users_list = User.query.all()
    for user in users_list:
        user_array.append({
            'user_id': user.user_id,
            'username': user.username,
            'email': user.email,
            'password': user.password,
            'sign_up_date': user.sign_up_date,
            'points': user.points
        })
    return jsonify(user_array)

