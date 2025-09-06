const express = require('express');
let sqlite3 = null;
let USE_MEMORY = false;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.warn('sqlite3 모듈을 불러올 수 없어 메모리 저장소로 동작합니다.', e?.message || e);
  USE_MEMORY = true;
}
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({extended: true, limit: '50mb'}));
app.use(express.static(path.join(__dirname, 'public')));

// 데이터베이스 초기화
let db = null;
if (!USE_MEMORY) {
  db = new sqlite3.Database('as_management.db');
}

// 메모리 저장소 (sqlite3 미가용시)
const memory = {
  as_general: [],
  as_converter: [],
  as_floodlight: [],
  recent_activities: []
};

// 테이블 생성
if (!USE_MEMORY) {
  db.serialize(() => {
    // 기타제품 테이블
    db.run(`CREATE TABLE IF NOT EXISTS as_general (
      id INTEGER PRIMARY KEY,
      no INTEGER,
      division TEXT,
      claim_no TEXT,
      hull_number TEXT,
      defective_material_code TEXT,
      alternative_material_code TEXT,
      product_name TEXT,
      quantity INTEGER DEFAULT 0,
      receipt_date TEXT,
      completion_date TEXT,
      notes TEXT,
      status TEXT DEFAULT 'incomplete'
    )`);

    // 컨버터 테이블
    db.run(`CREATE TABLE IF NOT EXISTS as_converter (
      id INTEGER PRIMARY KEY,
      no INTEGER,
      division TEXT,
      claim_no TEXT,
      hull_number TEXT,
      converter_number TEXT,
      converter_code TEXT,
      installation_location TEXT,
      product_name TEXT,
      quantity INTEGER DEFAULT 0,
      receipt_date TEXT,
      completion_date TEXT,
      notes TEXT,
      status TEXT DEFAULT 'incomplete'
    )`);

    // 투광등 테이블
    db.run(`CREATE TABLE IF NOT EXISTS as_floodlight (
      id INTEGER PRIMARY KEY,
      no INTEGER,
      division TEXT,
      claim_no TEXT,
      hull_number TEXT,
      defective_material_code TEXT,
      alternative_material_code TEXT,
      product_name TEXT,
      quantity INTEGER DEFAULT 0,
      receipt_date TEXT,
      completion_date TEXT,
      notes TEXT,
      status TEXT DEFAULT 'incomplete'
    )`);

    // 최근 활동 테이블
    db.run(`CREATE TABLE IF NOT EXISTS recent_activities (
      id INTEGER PRIMARY KEY,
      type TEXT,
      message TEXT,
      item_name TEXT,
      timestamp TEXT,
      icon TEXT
    )`);
  });
}

// 카테고리 설정
const CATEGORIES = {
    general: {
        table: 'as_general',
        fields: {
            'NO.': 'no',
            '구분': 'division',
            '클레임 NO.': 'claim_no',
            '호선번호': 'hull_number',
            '불량 자재코드': 'defective_material_code',
            '대체 자재 코드': 'alternative_material_code',
            '제품명': 'product_name',
            '수량': 'quantity',
            '접수일': 'receipt_date',
            '완료일': 'completion_date',
            '비고': 'notes'
        }
    },
    converter: {
        table: 'as_converter',
        fields: {
            'NO.': 'no',
            '구분': 'division',
            '클레임 NO.': 'claim_no',
            '호선번호': 'hull_number',
            '컨버터 번호': 'converter_number',
            '컨버터 코드': 'converter_code',
            '설치 위치': 'installation_location',
            '제품명': 'product_name',
            '수량': 'quantity',
            '접수일': 'receipt_date',
            '완료일': 'completion_date',
            '비고': 'notes'
        }
    },
    floodlight: {
        table: 'as_floodlight',
        fields: {
            'NO.': 'no',
            '구분': 'division',
            '클레임 NO.': 'claim_no',
            '호선번호': 'hull_number',
            '불량 자재코드': 'defective_material_code',
            '대체 자재 코드': 'alternative_material_code',
            '제품명': 'product_name',
            '수량': 'quantity',
            '접수일': 'receipt_date',
            '완료일': 'completion_date',
            '비고': 'notes'
        }
    }
};

// 유틸리티 함수
function dbToFrontend(row, category) {
    const config = CATEGORIES[category];
    const result = { id: row.id, status: row.status };
    
    for (const [koreanKey, englishKey] of Object.entries(config.fields)) {
        result[englishKey] = row[englishKey.toLowerCase()] || '';
    }
    
    return result;
}

function frontendToDb(data, category) {
    const config = CATEGORIES[category];
    const result = { status: data.status || 'incomplete' };
    
    for (const [koreanKey, englishKey] of Object.entries(config.fields)) {
        if (data[englishKey] !== undefined) {
            result[englishKey.toLowerCase()] = data[englishKey];
        }
    }
    
    return result;
}

// API 라우트

// 헬스체크 및 루트 응답
app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.type('text/plain').send('AS Management API running');
    }
});

// 카테고리별 데이터 조회
app.get('/api/data/:category', (req, res) => {
    const { category } = req.params;
    const config = CATEGORIES[category];
    if (!config) return res.status(400).json({ error: 'Invalid category' });
    if (USE_MEMORY) {
      const list = (memory[config.table] || []).slice().sort((a,b)=> (a.no||0)-(b.no||0));
      return res.json(list);
    }
    db.all(`SELECT * FROM ${config.table} ORDER BY no ASC`, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const data = rows.map(row => dbToFrontend(row, category));
      res.json(data);
    });
});

// 단일 항목 조회
app.get('/api/data/:category/:id', (req, res) => {
    const { category, id } = req.params;
    const config = CATEGORIES[category];
    if (!config) return res.status(400).json({ error: 'Invalid category' });
    if (USE_MEMORY) {
      const row = (memory[config.table] || []).find(r => String(r.id) === String(id));
      if (!row) return res.status(404).json({ error: 'Item not found' });
      return res.json(row);
    }
    db.get(`SELECT * FROM ${config.table} WHERE id = ?`, [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Item not found' });
      const data = dbToFrontend(row, category);
      res.json(data);
    });
});

// 데이터 추가
app.post('/api/data/:category', (req, res) => {
    const { category } = req.params;
    const config = CATEGORIES[category];
    if (!config) return res.status(400).json({ error: 'Invalid category' });
    if (USE_MEMORY) {
      const body = req.body || {};
      const id = body.id || Date.now();
      const item = { id, ...body };
      memory[config.table] = memory[config.table] || [];
      memory[config.table].push(item);
      return res.json(item);
    }
    const data = frontendToDb(req.body, category);
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(field => data[field]);
    const sql = `INSERT INTO ${config.table} (${fields.join(', ')}) VALUES (${placeholders})`;
    db.run(sql, values, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, ...req.body });
    });
});

// 데이터 수정
app.put('/api/data/:category/:id', (req, res) => {
    const { category, id } = req.params;
    const config = CATEGORIES[category];
    if (!config) return res.status(400).json({ error: 'Invalid category' });
    if (USE_MEMORY) {
      const arr = memory[config.table] || [];
      const idx = arr.findIndex(r => String(r.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'Item not found' });
      arr[idx] = { ...arr[idx], ...req.body, id: arr[idx].id };
      return res.json(arr[idx]);
    }
    const data = frontendToDb(req.body, category);
    const fields = Object.keys(data);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...fields.map(field => data[field]), id];
    const sql = `UPDATE ${config.table} SET ${setClause} WHERE id = ?`;
    db.run(sql, values, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
      res.json({ id: parseInt(id), ...req.body });
    });
});

// 단일 데이터 삭제
app.delete('/api/data/:category/:id', (req, res) => {
    const { category, id } = req.params;
    const config = CATEGORIES[category];
    if (!config) return res.status(400).json({ error: 'Invalid category' });
    if (USE_MEMORY) {
      const arr = memory[config.table] || [];
      const before = arr.length;
      memory[config.table] = arr.filter(r => String(r.id) !== String(id));
      if (memory[config.table].length === before) return res.status(404).json({ error: 'Item not found' });
      return res.json({ message: 'Item deleted successfully' });
    }
    db.run(`DELETE FROM ${config.table} WHERE id = ?`, [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
      res.json({ message: 'Item deleted successfully' });
    });
});

// 카테고리 전체 데이터 삭제
app.delete('/api/data/:category', (req, res) => {
    const { category } = req.params;
    const config = CATEGORIES[category];
    if (!config) return res.status(400).json({ error: 'Invalid category' });
    if (USE_MEMORY) {
      memory[config.table] = [];
      return res.json({ message: 'All data deleted successfully' });
    }
    db.run(`DELETE FROM ${config.table}`, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'All data deleted successfully' });
    });
});

// 벌크 데이터 처리
app.post('/api/bulk/:category', (req, res) => {
    const { category } = req.params;
    const { items = [], clearFirst } = req.body || {};
    const config = CATEGORIES[category];
    if (!config) return res.status(400).json({ error: 'Invalid category' });
    if (USE_MEMORY) {
      if (clearFirst) memory[config.table] = [];
      const arr = memory[config.table] || [];
      items.forEach(it => {
        const idx = arr.findIndex(r => String(r.id) === String(it.id));
        const row = { id: it.id, status: it.status || 'incomplete' };
        Object.values(config.fields).forEach(field => { row[field] = it[field] || ''; });
        if (idx === -1) arr.push(row); else arr[idx] = row;
      });
      memory[config.table] = arr;
      return res.json({ message: 'Bulk operation completed', count: items.length });
    }
    db.serialize(() => {
      if (clearFirst) db.run(`DELETE FROM ${config.table}`);
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${config.table} (id, ${Object.values(config.fields).join(', ')}, status) VALUES (?, ${Object.values(config.fields).map(() => '?').join(', ')}, ?)`);
      items.forEach(item => {
        const values = [ item.id, ...Object.values(config.fields).map(field => item[field] || ''), item.status || 'incomplete' ];
        stmt.run(values);
      });
      stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Bulk operation completed', count: items.length });
      });
    });
});

// 대시보드 통계
app.get('/api/dashboard', (req, res) => {
  const stats = {};
  if (USE_MEMORY) {
    Object.keys(CATEGORIES).forEach(category => {
      const table = CATEGORIES[category].table;
      const arr = memory[table] || [];
      const total = arr.length;
      const completed = arr.filter(r => r.status === 'completed').length;
      stats[category] = {
        total,
        completed,
        incomplete: total - completed
      };
    });
    const total = Object.values(stats).reduce((s, c) => s + c.total, 0);
    const totalCompleted = Object.values(stats).reduce((s, c) => s + c.completed, 0);
    const totalIncomplete = total - totalCompleted;
    const completionRate = total > 0 ? ((totalCompleted / total) * 100).toFixed(1) : '0.0';
    return res.json({ total, completed: totalCompleted, incomplete: totalIncomplete, completionRate, categories: stats });
  }
  const promises = Object.keys(CATEGORIES).map(category => {
    return new Promise((resolve, reject) => {
      const config = CATEGORIES[category];
      db.all(`SELECT status, COUNT(*) as count FROM ${config.table} GROUP BY status`, (err, rows) => {
        if (err) { reject(err); return; }
        stats[category] = { total: 0, completed: 0, incomplete: 0 };
        rows.forEach(row => {
          stats[category].total += row.count;
          if (row.status === 'completed') stats[category].completed = row.count; else stats[category].incomplete += row.count;
        });
        resolve();
      });
    });
  });
  Promise.all(promises)
    .then(() => {
      const total = Object.values(stats).reduce((sum, cat) => sum + cat.total, 0);
      const totalCompleted = Object.values(stats).reduce((sum, cat) => sum + cat.completed, 0);
      const totalIncomplete = total - totalCompleted;
      const completionRate = total > 0 ? ((totalCompleted / total) * 100).toFixed(1) : '0.0';
      res.json({ total, completed: totalCompleted, incomplete: totalIncomplete, completionRate, categories: stats });
    })
    .catch(err => res.status(500).json({ error: err.message }));
});

// 최근 활동 조회
app.get('/api/activities', (req, res) => {
    if (USE_MEMORY) {
      const rows = (memory.recent_activities || []).slice().sort((a,b)=> (b.id||0) - (a.id||0)).slice(0,50);
      return res.json(rows);
    }
    db.all('SELECT * FROM recent_activities ORDER BY id DESC LIMIT 50', (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
});

// 최근 활동 추가
app.post('/api/activities', (req, res) => {
    const { type, message, itemName, icon } = req.body;
    const timestamp = new Date().toISOString();
    const id = Date.now();
    if (USE_MEMORY) {
      memory.recent_activities.unshift({ id, type, message, itemName, timestamp, icon });
      return res.json({ id, type, message, itemName, timestamp, icon });
    }
    db.run(
      'INSERT INTO recent_activities (id, type, message, item_name, timestamp, icon) VALUES (?, ?, ?, ?, ?, ?)',
      [id, type, message, itemName, timestamp, icon],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, type, message, itemName, timestamp, icon });
      }
    );
});

// 번호 재정렬
app.post('/api/reindex/:category', (req, res) => {
    const { category } = req.params;
    const config = CATEGORIES[category];
    if (!config) return res.status(400).json({ error: 'Invalid category' });
    if (USE_MEMORY) {
      const arr = (memory[config.table] || []).slice().sort((a,b)=> (a.no||0)-(b.no||0));
      arr.forEach((row, idx) => { row.no = idx + 1; });
      memory[config.table] = arr;
      return res.json({ message: 'Reindexing completed' });
    }
    db.all(`SELECT id FROM ${config.table} ORDER BY no ASC`, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      db.serialize(() => {
        const stmt = db.prepare(`UPDATE ${config.table} SET no = ? WHERE id = ?`);
        rows.forEach((row, index) => stmt.run([index + 1, row.id]));
        stmt.finalize((err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: 'Reindexing completed' });
        });
      });
    });
});

// 다음 번호 조회
app.get('/api/next-no/:category', (req, res) => {
    const { category } = req.params;
    const config = CATEGORIES[category];
    if (!config) return res.status(400).json({ error: 'Invalid category' });
    if (USE_MEMORY) {
      const maxNo = Math.max(0, ...(memory[config.table] || []).map(r => r.no || 0));
      return res.json({ nextNo: maxNo + 1 });
    }
    db.get(`SELECT MAX(no) as maxNo FROM ${config.table}`, (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const nextNo = (row.maxNo || 0) + 1;
      res.json({ nextNo });
    });
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`브라우저에서 http://localhost:${PORT} 에 접속하세요.`);
});

// 우아한 종료
process.on('SIGINT', () => {
  console.log('\n서버 종료 중...');
  if (!USE_MEMORY && db) {
    db.close((err) => {
      if (err) console.error('데이터베이스 닫기 오류:', err.message);
      else console.log('데이터베이스 연결이 닫혔습니다.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});
