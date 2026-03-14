
import os
import psycopg2
from dotenv import load_dotenv

def fix_sequences():
    env_path = os.path.join("Backend", ".env")
    if not os.path.exists(env_path):
        env_path = ".env"
    
    if os.path.exists(env_path):
        load_dotenv(env_path, override=True)
    
    url = os.getenv("DATABASE_URL")
    print(f"Connecting to: {url.split('@')[-1]}")
    conn = psycopg2.connect(url)
    conn.autocommit = True
    cur = conn.cursor()
    
    try:
        print("🔍 Scanning tables for sequences...")
        # Correctly using c.attname for pg_attribute
        cur.execute("""
            SELECT 'SELECT setval(' || quote_literal(s.relname) || ', (SELECT MAX(' || quote_ident(c.attname) || ') FROM ' || quote_ident(t.relname) || ')+1) '
            FROM pg_class s
            JOIN pg_depend d ON d.objid = s.oid
            JOIN pg_class t ON d.refobjid = t.oid
            JOIN pg_attribute c ON c.attrelid = t.oid AND c.attnum = d.refobjsubid
            WHERE s.relkind = 'S' AND d.deptype = 'a';
        """)
        
        commands = [r[0] for r in cur.fetchall()]
        if not commands:
            print("ℹ️  No sequences found to reset.")
            return

        print(f"🚀 Resetting {len(commands)} sequences...")
        for cmd in commands:
            try:
                cur.execute(cmd)
                new_val = cur.fetchone()[0]
                # Log which table was reset
                table_name = cmd.split('FROM ')[1].strip()
                print(f"  ✅ {table_name}: Sequence reset to {new_val}")
            except Exception as inner_e:
                if "is null" in str(inner_e).lower():
                     seq_name = cmd.split('setval(')[1].split(',')[0].strip("'")
                     cur.execute(f"SELECT setval('{seq_name}', 1);")
                     print(f"  ℹ️  {seq_name}: Set to 1 (table empty)")
                else:
                    print(f"  ⚠️  Skipping: {inner_e}")
            
        print("🎉 All sequences synchronized!")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    fix_sequences()
