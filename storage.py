"""Versioned SQLite storage shared by the web UI and future mobile clients."""
from pathlib import Path
import base64
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from analysis_engine import analyze

ROOT=Path(__file__).parent
DATA=Path(os.environ.get('SLEEP_ATLAS_DATA',ROOT/'data'))
DB=DATA/'sleep-atlas.sqlite3'

def connect():
    DATA.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(DB,timeout=15)
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db

def initialize():
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS pokemon(id TEXT PRIMARY KEY, species TEXT NOT NULL, nickname TEXT NOT NULL, build_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS analyses(id TEXT PRIMARY KEY, pokemon_id TEXT NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE, model_version TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_analyses_pokemon_created ON analyses(pokemon_id,created_at DESC);
        CREATE TABLE IF NOT EXISTS daily_metrics(analysis_id TEXT PRIMARY KEY REFERENCES analyses(id) ON DELETE CASCADE, skill_count REAL NOT NULL, skill_rating INTEGER NOT NULL, total_strength REAL NOT NULL, strength_rating INTEGER NOT NULL, ingredient_count REAL NOT NULL, ingredient_rating INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS ingredient_metrics(analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE, ingredient TEXT NOT NULL, daily_count REAL NOT NULL, strength REAL NOT NULL, rating INTEGER, PRIMARY KEY(analysis_id,ingredient));
        CREATE TABLE IF NOT EXISTS screenshots(id TEXT PRIMARY KEY, pokemon_id TEXT REFERENCES pokemon(id) ON DELETE CASCADE, filename TEXT NOT NULL, mime TEXT NOT NULL, image BLOB NOT NULL, ocr_json TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_screenshots_pokemon ON screenshots(pokemon_id);
        PRAGMA user_version=1;
        PRAGMA optimize;
        ''')
        db.execute("DELETE FROM screenshots WHERE pokemon_id IS NULL AND created_at < datetime('now','-1 day')")

def now():return datetime.now(timezone.utc).isoformat(timespec='microseconds')

def save(build,image_ids=None,pokemon_id=None,db=None,analysis=None):
    result=analysis or analyze(build)
    own=db is None
    db=db or connect()
    try:
        image_ids=image_ids or []
        if not isinstance(image_ids,list) or len(image_ids)>8 or any(not isinstance(x,str) for x in image_ids):raise ValueError('Invalid screenshot references.')
        record_id=pokemon_id or str(uuid.uuid4())
        if pokemon_id and not db.execute('SELECT id FROM pokemon WHERE id=?',(pokemon_id,)).fetchone():raise ValueError('This Pokémon no longer exists.')
        for iid in image_ids:
            row=db.execute('SELECT pokemon_id FROM screenshots WHERE id=?',(iid,)).fetchone()
            if not row or (row['pokemon_id'] and row['pokemon_id']!=record_id):raise ValueError('A screenshot is missing or belongs to another Pokémon.')
        timestamp=now();b=result['build']
        db.execute('INSERT INTO pokemon VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET species=excluded.species,nickname=excluded.nickname,build_json=excluded.build_json,updated_at=excluded.updated_at',(record_id,b['species'],b['nickname'],json.dumps(b),timestamp,timestamp))
        aid=str(uuid.uuid4());c=result['current'];r=c['ratings']
        db.execute('INSERT INTO analyses VALUES(?,?,?,?,?)',(aid,record_id,result['modelVersion'],json.dumps(result),timestamp))
        db.execute('INSERT INTO daily_metrics VALUES(?,?,?,?,?,?,?)',(aid,c['skillTriggers'],r['skillTriggers'],c['strength'],r['strength'],c['ingredientCount'],r['ingredientCount']))
        db.executemany('INSERT INTO ingredient_metrics VALUES(?,?,?,?,?)',[(aid,i['name'],i['count'],i['strength'],i['rating']) for i in c['ingredients']])
        for iid in image_ids:db.execute('UPDATE screenshots SET pokemon_id=? WHERE id=?',(record_id,iid))
        if own:db.commit()
        return record_id
    except Exception:
        if own:db.rollback()
        raise
    finally:
        if own:db.close()

def list_pokemon():
    with connect() as db:
        rows=db.execute('''SELECT p.*,a.result_json FROM pokemon p JOIN analyses a ON a.id=(SELECT id FROM analyses WHERE pokemon_id=p.id ORDER BY created_at DESC LIMIT 1) ORDER BY p.updated_at DESC''').fetchall()
        return [{'id':r['id'],'createdAt':r['created_at'],'updatedAt':r['updated_at'],'analysis':json.loads(r['result_json'])} for r in rows]

def get_pokemon(pid):
    item=next((p for p in list_pokemon() if p['id']==pid),None)
    if item:
        with connect() as db:
            item['screenshots']=[{'id':r['id'],'filename':r['filename'],'text':json.loads(r['ocr_json']).get('lines',[])} for r in db.execute('SELECT id,filename,ocr_json FROM screenshots WHERE pokemon_id=?',(pid,))]
            item['historyCount']=db.execute('SELECT count(*) FROM analyses WHERE pokemon_id=?',(pid,)).fetchone()[0]
    return item

def backup():
    with connect() as db:
        db.execute('BEGIN')
        # Keep exports small; screenshots and OCR remain in the local database.
        records=[{'id':row['id'],'build':json.loads(row['build_json'])}
                 for row in db.execute('SELECT id,build_json FROM pokemon ORDER BY created_at')]
        return {'format':'sleep-atlas','version':1,'exportedAt':now(),'pokemon':records}

def restore(payload):
    if not isinstance(payload,dict) or payload.get('format')!='sleep-atlas' or payload.get('version')!=1 or not isinstance(payload.get('pokemon'),list):raise ValueError('Not a Sleep Atlas version 1 backup.')
    if len(payload['pokemon'])>1000:raise ValueError('A backup can contain at most 1,000 Pokémon.')
    prepared=[];seen=set()
    for row in payload['pokemon']:
        if not isinstance(row,dict):raise ValueError('Invalid backup record.')
        pid=str(uuid.UUID(row.get('id','')))
        if pid in seen:raise ValueError('Duplicate IDs in backup.')
        seen.add(pid);result=analyze(row.get('build'))
        pictures=row.get('screenshots',[])
        if not isinstance(pictures,list) or len(pictures)>8:raise ValueError('Invalid screenshots in backup.')
        decoded=[]
        for pic in pictures:
            if not isinstance(pic,dict) or pic.get('mime') not in ['image/png','image/jpeg','image/webp','image/heic','image/heif']:raise ValueError('Invalid screenshot type.')
            data=base64.b64decode(pic.get('data',''),validate=True)
            if len(data)>12*1024*1024:raise ValueError('Screenshot is too large.')
            decoded.append((str(pic.get('filename','screenshot'))[:200],pic['mime'],data,json.dumps(pic.get('ocr',{}))))
        prepared.append((pid,result,decoded))
    added=skipped=0
    with connect() as db:
        for pid,result,pictures in prepared:
            if db.execute('SELECT 1 FROM pokemon WHERE id=?',(pid,)).fetchone():skipped+=1;continue
            timestamp=now();b=result['build']
            db.execute('INSERT INTO pokemon VALUES(?,?,?,?,?,?)',(pid,b['species'],b['nickname'],json.dumps(b),timestamp,timestamp))
            save(b,pokemon_id=pid,db=db,analysis=result)
            for filename,mime,data,ocr in pictures:db.execute('INSERT INTO screenshots VALUES(?,?,?,?,?,?,?)',(str(uuid.uuid4()),pid,filename,mime,data,ocr,timestamp))
            added+=1
    return {'added':added,'skipped':skipped}
