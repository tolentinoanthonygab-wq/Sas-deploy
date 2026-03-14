# app/seeder.py
from sqlalchemy.orm import Session
from datetime import date
from app.database import SessionLocal, engine
from app.models.base import Base
from app.models.role import Role
from app.models.user import User, UserRole
from app.models.school import School, SchoolSetting
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_tables():
    """Create all tables and required types"""
    from sqlalchemy import text
    
    with engine.connect() as conn:
        # Create attendancestatus if it doesn't exist
        conn.execute(text("""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendancestatus') THEN
                    CREATE TYPE attendancestatus AS ENUM ('present', 'late', 'absent', 'excused');
                END IF;
            END $$;
        """))
        
        # Create eventstatus if it doesn't exist
        conn.execute(text("""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eventstatus') THEN
                    CREATE TYPE eventstatus AS ENUM ('UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED');
                END IF;
            END $$;
        """))
        conn.commit()

    Base.metadata.create_all(bind=engine)
    print("✅ Database tables and types ensured")

def seed_roles(db: Session):
    """Seed roles table with required roles"""
    roles_data = [
        {"name": "student"},
        {"name": "ssg"},
        {"name": "event-organizer"},
        {"name": "school_IT"},
        {"name": "admin"}
    ]
    
    existing_roles = db.query(Role).all()
    existing_role_names = {role.name for role in existing_roles}
    
    for role_data in roles_data:
        if role_data["name"] not in existing_role_names:
            role = Role(**role_data)
            db.add(role)
    
    db.commit()
    print("✅ Roles seeded")


def seed_default_school(db: Session) -> School:
    """Create a default school/settings record if none exists."""
    school = db.query(School).order_by(School.id.asc()).first()
    if school:
        if not getattr(school, "school_name", None):
            school.school_name = school.name
            db.commit()
        if not db.query(SchoolSetting).filter(SchoolSetting.school_id == school.id).first():
            db.add(SchoolSetting(school_id=school.id))
            db.commit()
        print(f"ℹ️  School already exists: {school.name}")
        return school

    school = School(
        name=os.getenv("DEFAULT_SCHOOL_NAME", "Default School"),
        school_name=os.getenv("DEFAULT_SCHOOL_NAME", "Default School"),
        address=os.getenv("DEFAULT_SCHOOL_ADDRESS", "Default Address"),
        logo_url=os.getenv("DEFAULT_SCHOOL_LOGO_URL"),
        primary_color=os.getenv("DEFAULT_SCHOOL_PRIMARY_COLOR", "#162F65"),
        secondary_color=os.getenv("DEFAULT_SCHOOL_SECONDARY_COLOR", "#2C5F9E"),
        school_code=os.getenv("DEFAULT_SCHOOL_CODE"),
        subscription_status=os.getenv("DEFAULT_SUBSCRIPTION_STATUS", "trial"),
        active_status=True,
        subscription_plan=os.getenv("DEFAULT_SUBSCRIPTION_PLAN", "free"),
        subscription_start=date.today(),
    )

    db.add(school)
    db.flush()  # Get school.id before creating settings

    db.add(SchoolSetting(school_id=school.id))
    db.commit()
    db.refresh(school)

    print(f"✅ Default school created: {school.name}")
    return school

def seed_admin_user(db: Session, school: School):
    """Create initial admin user"""
    # Check if admin user already exists
    admin_email = os.getenv("ADMIN_EMAIL", "admin@university.edu")
    admin_password = os.getenv("ADMIN_PASSWORD", "AdminPass123!")
    
    existing_admin = db.query(User).filter(User.email == admin_email).first()
    
    if not existing_admin:
        # Create admin user
        admin_user = User(
            email=admin_email,
            school_id=None,
            first_name="System",
            middle_name=None,
            last_name="Administrator",
            is_active=True,
            must_change_password=False,
        )
        admin_user.set_password(admin_password)
        db.add(admin_user)
        db.flush()  # Get the user ID
        
        # Get admin role
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if admin_role:
            user_role = UserRole(user_id=admin_user.id, role_id=admin_role.id)
            db.add(user_role)
        
        db.commit()
        print(f"✅ Admin user created: {admin_email}")
        print(f"🔑 Admin password: {admin_password}")
        
    else:
        updated = False
        if getattr(existing_admin, "school_id", None) is not None:
            existing_admin.school_id = None
            updated = True
        if getattr(existing_admin, "must_change_password", False):
            existing_admin.must_change_password = False
            updated = True
        if updated:
            db.commit()
        print("ℹ️  Admin user already exists")

def run_seeder():
    """Main seeder function"""
    print("🌱 Starting database seeding...")
    
    # Create database session
    db = SessionLocal()
    
    try:
        # Create tables first
        create_tables()
        
        # Seed roles
        seed_roles(db)

        # Ensure at least one school exists for tenant configuration
        school = seed_default_school(db)
        
        # Seed admin user
        seed_admin_user(db, school)
        
        print("🎉 Database seeding completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_seeder()
