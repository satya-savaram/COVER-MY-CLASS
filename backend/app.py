# ========== Imports ==========
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from werkzeug.utils import secure_filename
import csv
import os
import json

# ========== App Initialization ==========
app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"])
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///cover_my_class.db'
app.config['JWT_SECRET_KEY'] = 'your-secret-key'  # Change this in production

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

# ========== Models ==========
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=True)  # for admins
    teacher_id = db.Column(db.String(40), unique=True, nullable=True)  # for teachers
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'admin' or 'teacher'


class Timetable(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.String(40), db.ForeignKey('user.teacher_id'), nullable=False)
    year = db.Column(db.String(10), nullable=False)
    data = db.Column(db.Text, nullable=False)  # Store as JSON string (6 days x 8 periods)


class Absence(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.String(40), nullable=False)
    class_name = db.Column(db.String(40), nullable=False)
    day = db.Column(db.String(20), nullable=False)
    period = db.Column(db.String(10), nullable=False)


class Substitution(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    absent_teacher_id = db.Column(db.String(40), nullable=False)
    sub_teacher_id = db.Column(db.String(40), nullable=True)
    class_name = db.Column(db.String(40), nullable=False)
    day = db.Column(db.String(20), nullable=False)
    period = db.Column(db.String(10), nullable=False)


# ========== DB Setup ==========
@app.before_first_request
def create_tables():
    db.create_all()
    # Add second admin if not exists
    if not User.query.filter_by(username='phani_vemula', role='admin').first():
        hashed_pw2 = bcrypt.generate_password_hash('phani@123').decode('utf-8')
        admin2 = User(username='phani_vemula', password=hashed_pw2, role='admin')
        db.session.add(admin2)
        db.session.commit()
    # Create default admin if not exists
    if not User.query.filter_by(username='satya_savaram', role='admin').first():
        hashed_pw = bcrypt.generate_password_hash('satya@123').decode('utf-8')
        admin = User(username='satya_savaram', password=hashed_pw, role='admin')
        db.session.add(admin)
        db.session.commit()


# ========== Utility Functions ==========
def load_teacher_timetables():
    """Load all timetables from DB into {teacher_id: timetable_list}"""
    tts = Timetable.query.all()
    tables = {}
    for tt in tts:
        tables[tt.teacher_id] = json.loads(tt.data)
    return tables


def find_substitute(day_index, period_index, absent_teacher_id):
    """
    Finds a substitute teacher who is free during a specific day and period.
    day_index: 0-5 (Monday-Saturday)
    period_index: 0-7 (Period 1-8)
    """
    teacher_timetables = load_teacher_timetables()

    for tid, timetable in teacher_timetables.items():
        if tid == absent_teacher_id:
            continue
        # Check if the timetable has the correct structure
        if len(timetable) > day_index and len(timetable[day_index]) > period_index:
            # Check if the period is free (empty string or case-insensitive 'free')
            period_class = timetable[day_index][period_index]
            if not period_class or period_class.lower() == 'free':
                return tid  # Return the first available teacher

    return None # No substitute found


# ========== Routes ==========
@app.route('/')
def index():
    return 'Welcome to the Cover My Class API! Backend is running.'


# --- Debug route (optional) ---
@app.route('/debug', methods=['POST'])
def debug():
    return jsonify({
        "json": request.get_json(silent=True),
        "headers": dict(request.headers)
    })


# --- Auth ---
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'msg': 'Invalid or missing JSON'}), 400

    role = data.get('role', '').lower()
    password = data.get('password')

    if role == 'admin':
        username = data.get('username')
        if not all([username, password, role]):
            return jsonify({'msg': 'Missing fields'}), 400
        if User.query.filter_by(username=username).first():
            return jsonify({'msg': 'User already exists'}), 400
        hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')
        user = User(username=username, password=hashed_pw, role=role)
        db.session.add(user)
        db.session.commit()
        return jsonify({'msg': 'Admin registered successfully'})

    elif role == 'teacher':
        teacher_id = data.get('teacher_id')
        if not all([teacher_id, password, role]):
            return jsonify({'msg': 'Missing fields'}), 400
        if User.query.filter_by(teacher_id=teacher_id).first():
            return jsonify({'msg': 'Teacher ID already exists'}), 400
        hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')
        user = User(teacher_id=teacher_id, password=hashed_pw, role=role)
        db.session.add(user)
        db.session.commit()
        return jsonify({'msg': 'Teacher registered successfully'})

    else:
        return jsonify({'msg': 'Invalid role'}), 400


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'msg': 'Invalid or missing JSON'}), 400

    role = data.get('role', '').lower()
    password = data.get('password')

    if role == 'admin':
        username = data.get('username')
        if not username or not password:
            return jsonify({'msg': 'Missing username or password'}), 400
        user = User.query.filter_by(username=username, role='admin').first()

    elif role == 'teacher':
        teacher_id = data.get('teacher_id')
        if not teacher_id or not password:
            return jsonify({'msg': 'Missing teacher_id or password'}), 400
        user = User.query.filter_by(teacher_id=teacher_id, role='teacher').first()

    else:
        return jsonify({'msg': 'Invalid role'}), 400

    if user and bcrypt.check_password_hash(user.password, password):
        access_token = create_access_token(identity={'id': user.id, 'role': user.role})
        return jsonify({'access_token': access_token, 'role': user.role})

    return jsonify({'msg': 'Invalid credentials'}), 401


@app.route('/protected', methods=['GET'])
@jwt_required()
def protected():
    current_user = get_jwt_identity()
    return jsonify({'logged_in_as': current_user}), 200


# --- Teacher Management ---
@app.route('/teachers', methods=['GET', 'POST'])
def get_teachers():
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'msg': 'Missing username or password'}), 400
        if User.query.filter_by(teacher_id=username).first():
            return jsonify({'msg': 'Teacher ID already exists'}), 400

        hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')
        new_teacher = User(teacher_id=username, password=hashed_pw, role='teacher')
        db.session.add(new_teacher)
        db.session.commit()
        return jsonify({'msg': 'Teacher added successfully'}), 201

    teachers = User.query.filter_by(role='teacher').all()
    return jsonify([{'id': t.id, 'username': t.teacher_id} for t in teachers])


@app.route('/teachers/<int:teacher_id>', methods=['DELETE'])
def delete_teacher(teacher_id):
    teacher = User.query.filter_by(id=teacher_id, role='teacher').first()
    if not teacher:
        return jsonify({'msg': 'Teacher not found'}), 404
    db.session.delete(teacher)
    db.session.commit()
    return jsonify({'msg': 'Teacher deleted'})


# --- Timetable Upload & Retrieval ---
@app.route('/teachers/<int:teacher_id>/timetable', methods=['POST'])
def upload_timetable(teacher_id):
    teacher = User.query.filter_by(id=teacher_id, role='teacher').first()
    if not teacher:
        return jsonify({'msg': 'Teacher not found'}), 404
    if 'file' not in request.files:
        return jsonify({'msg': 'No file uploaded'}), 400
    file = request.files['file']
    filename = secure_filename(file.filename)
    if not filename.endswith('.csv'):
        return jsonify({'msg': 'Only CSV files allowed'}), 400
    # Parse CSV with class info
    stream = file.stream.read().decode('utf-8').splitlines()
    reader = csv.DictReader(stream)
    timetable = [row for row in reader]
    # Save to DB (overwrite if exists for this teacher/year)
    year = '2025'
    existing = Timetable.query.filter_by(teacher_id=teacher.teacher_id, year=year).first()
    if existing:
        existing.data = json.dumps(timetable)
    else:
        new_tt = Timetable(teacher_id=teacher.teacher_id, year=year, data=json.dumps(timetable))
        db.session.add(new_tt)
    db.session.commit()
    return jsonify({'msg': 'Timetable uploaded', 'timetable': timetable})


@app.route('/teachers/<int:teacher_id>/timetable', methods=['GET'])
def get_timetable(teacher_id):
    teacher = User.query.filter_by(id=teacher_id, role='teacher').first()
    if not teacher:
        return jsonify({'msg': 'Teacher not found'}), 404
    year = '2025'
    tt = Timetable.query.filter_by(teacher_id=teacher.teacher_id, year=year).first()
    if not tt:
        return jsonify({'msg': 'No timetable found'}), 404
    timetable = json.loads(tt.data)
    return jsonify({'timetable': timetable})


# --- Teacher-specific Timetable Routes ---
@app.route('/teacher/timetable', methods=['GET'])
@jwt_required()
def get_own_timetable():
    current_user_identity = get_jwt_identity()
    if current_user_identity.get('role') != 'teacher':
        return jsonify({'msg': 'Only teachers can access this'}), 403

    user = User.query.get(current_user_identity['id'])
    if not user:
        return jsonify({'msg': 'Teacher not found'}), 404

    tt = Timetable.query.filter_by(teacher_id=user.teacher_id).first()
    if not tt:
        return jsonify({'msg': 'No timetable found for this teacher'}), 404

    return jsonify({'timetable': json.loads(tt.data)})


@app.route('/teacher/timetable', methods=['POST'])
@jwt_required()
def add_or_update_own_timetable():
    current_user_identity = get_jwt_identity()
    if current_user_identity.get('role') != 'teacher':
        return jsonify({'msg': 'Only teachers can perform this action'}), 403

    user = User.query.get(current_user_identity['id'])
    if not user:
        return jsonify({'msg': 'Teacher not found'}), 404

    data = request.get_json()
    timetable_data = data.get('timetable') # Expects a 6x8 array

    existing_tt = Timetable.query.filter_by(teacher_id=user.teacher_id).first()
    if existing_tt:
        existing_tt.data = json.dumps(timetable_data)
    else:
        new_tt = Timetable(teacher_id=user.teacher_id, year="2025", data=json.dumps(timetable_data))
        db.session.add(new_tt)

    db.session.commit()
    return jsonify({'msg': 'Timetable saved successfully'}), 200


# --- Absence and Substitution ---
@app.route('/absences', methods=['POST'])
@jwt_required()
def mark_absence():
    current_user_identity = get_jwt_identity()
    if current_user_identity.get('role') != 'teacher':
        return jsonify({'msg': 'Only teachers can mark absence'}), 403

    user = User.query.get(current_user_identity['id'])
    if not user:
        return jsonify({'msg': 'Teacher not found'}), 404

    data = request.get_json()
    day_index = data.get('day')
    period_index = data.get('period')
    class_name = data.get('class_name')

    if not all(isinstance(x, int) for x in [day_index, period_index]) or not class_name:
        return jsonify({'msg': 'Missing fields'}), 400

    # Find substitute
    sub_id = find_substitute(day_index, period_index, user.teacher_id)
    substitution = Substitution(absent_teacher_id=user.teacher_id, class_name=class_name,
                                day=str(day_index), period=str(period_index), sub_teacher_id=sub_id)
    db.session.add(substitution)
    db.session.commit()

    msg = 'Absence marked, substitute assigned' if sub_id else 'Absence marked, no substitute available'
    return jsonify({'msg': msg, 'substitute_teacher_id': sub_id}), 200


@app.route('/substitutions', methods=['GET'])
def get_substitutions():
    subs = Substitution.query.all()
    return jsonify([
        {
            'id': s.id,
            'absent_teacher_id': s.absent_teacher_id,
            'sub_teacher_id': s.sub_teacher_id,
            'class': s.class_name,
            'day': s.day,
            'period': s.period
        } for s in subs
    ])


# ========== Main ==========
if __name__ == '__main__':
    app.run(debug=True)
