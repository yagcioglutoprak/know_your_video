import sqlite3
from datetime import datetime
import json

def init_db():
    conn = sqlite3.connect('video_analysis.db')
    c = conn.cursor()
    
    # Create table for video analysis results
    c.execute('''
        CREATE TABLE IF NOT EXISTS video_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT NOT NULL,
            video_url TEXT NOT NULL,
            video_info TEXT,
            summary TEXT,
            key_points TEXT,
            fact_check TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

def save_analysis(video_id, video_url, video_info, summary, key_points, fact_check):
    conn = sqlite3.connect('video_analysis.db')
    c = conn.cursor()
    
    # Convert dictionaries to JSON strings for storage
    video_info_json = json.dumps(video_info) if video_info else None
    fact_check_json = json.dumps(fact_check) if fact_check else None
    key_points_json = json.dumps(key_points) if key_points else None
    
    c.execute('''
        INSERT INTO video_analysis 
        (video_id, video_url, video_info, summary, key_points, fact_check)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (video_id, video_url, video_info_json, summary, key_points_json, fact_check_json))
    
    conn.commit()
    conn.close()

def get_analysis(video_id):
    conn = sqlite3.connect('video_analysis.db')
    c = conn.cursor()
    
    c.execute('SELECT * FROM video_analysis WHERE video_id = ?', (video_id,))
    result = c.fetchone()
    
    if result:
        # Convert row to dictionary
        columns = ['id', 'video_id', 'video_url', 'video_info', 'summary', 'key_points', 'fact_check', 'timestamp']
        analysis = dict(zip(columns, result))
        
        # Parse JSON strings back to dictionaries
        if analysis['video_info']:
            analysis['video_info'] = json.loads(analysis['video_info'])
        if analysis['fact_check']:
            analysis['fact_check'] = json.loads(analysis['fact_check'])
        if analysis['key_points']:
            analysis['key_points'] = json.loads(analysis['key_points'])
            
        return analysis
    
    return None
