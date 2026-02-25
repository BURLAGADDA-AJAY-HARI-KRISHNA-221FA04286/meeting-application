import asyncio
from sqlalchemy import text
from app.db.session import engine

async def test_sql():
    async with engine.connect() as conn:
        q = text("""
        WITH user_meetings AS (SELECT id FROM meetings WHERE user_id = 2)
        SELECT
            (SELECT COUNT(id) FROM user_meetings) AS total_meetings,
            COUNT(t.id) AS total_tasks,
            COUNT(t.id) FILTER (WHERE t.status = 'todo') AS tasks_todo,
            COUNT(t.id) FILTER (WHERE t.status = 'in-progress') AS tasks_in_progress,
            COUNT(t.id) FILTER (WHERE t.status = 'done') AS tasks_done,
            COUNT(t.id) FILTER (WHERE t.priority = 'high') AS high_priority,
            (SELECT COUNT(id) FROM ai_results WHERE meeting_id IN (SELECT id FROM user_meetings)) AS analyzed_meetings
        FROM tasks t
        WHERE t.meeting_id IN (SELECT id FROM user_meetings)
        """)
        res = await conn.execute(q)
        print("Result:")
        try:
            print(dict(res.mappings().one()))
        except Exception as e:
            print("Error parsing:", e)

asyncio.run(test_sql())
