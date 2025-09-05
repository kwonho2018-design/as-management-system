const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({extended: true, limit: '50mb'}));
app.use(express.static('public'));

// 데이터베이스 초기화
const db = new sqlite3.Database('as_management.db');

// 테이블 생성
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

// 메인 페이지 제공
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 카테고리별 데이터 조회
app.get('/api/data/:category', (req, res) => {
    const { category } = req.params;
    const config = CATEGORIES[category];
    
    if (!config) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    db.all(`SELECT * FROM ${config.table} ORDER BY no ASC`, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const data = rows.map(row => dbToFrontend(row, category));
        res.json(data);
    });
});

// 단일 항목 조회
app.get('/api/data/:category/:id', (req, res) => {
    const { category, id } = req.params;
    const config = CATEGORIES[category];
    
    if (!config) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    db.get(`SELECT * FROM ${config.table} WHERE id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!row) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        const data = dbToFrontend(row, category);
        res.json(data);
    });
});

// 데이터 추가
app.post('/api/data/:category', (req, res) => {
    const { category } = req.params;
    const config = CATEGORIES[category];
    
    if (!config) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    const data = frontendToDb(req.body, category);
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(field => data[field]);
    
    const sql = `INSERT INTO ${config.table} (${fields.join(', ')}) VALUES (${placeholders})`;
    
    db.run(sql, values, function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({ id: this.lastID, ...req.body });
    });
});

// 데이터 수정
app.put('/api/data/:category/:id', (req, res) => {
    const { category, id } = req.params;
    const config = CATEGORIES[category];
    
    if (!config) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    const data = frontendToDb(req.body, category);
    const fields = Object.keys(data);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...fields.map(field => data[field]), id];
    
    const sql = `UPDATE ${config.table} SET ${setClause} WHERE id = ?`;
    
    db.run(sql, values, function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        res.json({ id: parseInt(id), ...req.body });
    });
});

// 단일 데이터 삭제
app.delete('/api/data/:category/:id', (req, res) => {
    const { category, id } = req.params;
    const config = CATEGORIES[category];
    
    if (!config) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    db.run(`DELETE FROM ${config.table} WHERE id = ?`, [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        res.json({ message: 'Item deleted successfully' });
    });
});

// 카테고리 전체 데이터 삭제
app.delete('/api/data/:category', (req, res) => {
    const { category } = req.params;
    const config = CATEGORIES[category];
    
    if (!config) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    db.run(`DELETE FROM ${config.table}`, (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({ message: 'All data deleted successfully' });
    });
});

// 벌크 데이터 처리
app.post('/api/bulk/:category', (req, res) => {
    const { category } = req.params;
    const { items, clearFirst } = req.body;
    const config = CATEGORIES[category];
    
    if (!config) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    db.serialize(() => {
        if (clearFirst) {
            db.run(`DELETE FROM ${config.table}`);
        }
        
        const stmt = db.prepare(`INSERT OR REPLACE INTO ${config.table} (id, ${Object.values(config.fields).join(', ')}, status) VALUES (?, ${Object.values(config.fields).map(() => '?').join(', ')}, ?)`);
        
        items.forEach(item => {
            const values = [
                item.id,
                ...Object.values(config.fields).map(field => item[field] || ''),
                item.status || 'incomplete'
            ];
            stmt.run(values);
        });
        
        stmt.finalize((err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Bulk operation completed', count: items.length });
        });
    });
});

// 대시보드 통계
app.get('/api/dashboard', (req, res) => {
    const stats = {};
    let completed = 0;
    
    const promises = Object.keys(CATEGORIES).map(category => {
        return new Promise((resolve, reject) => {
            const config = CATEGORIES[category];
            db.all(`SELECT status, COUNT(*) as count FROM ${config.table} GROUP BY status`, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                stats[category] = {
                    total: 0,
                    completed: 0,
                    incomplete: 0
                };
                
                rows.forEach(row => {
                    stats[category].total += row.count;
                    if (row.status === 'completed') {
                        stats[category].completed = row.count;
                        completed++;
                    } else {
                        stats[category].incomplete += row.count;
                    }
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
            
            res.json({
                total,
                completed: totalCompleted,
                incomplete: totalIncomplete,
                completionRate,
                categories: stats
            });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

// 최근 활동 조회
app.get('/api/activities', (req, res) => {
    db.all('SELECT * FROM recent_activities ORDER BY id DESC LIMIT 50', (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 최근 활동 추가
app.post('/api/activities', (req, res) => {
    const { type, message, itemName, icon } = req.body;
    const timestamp = new Date().toISOString();
    const id = Date.now();
    
    db.run(
        'INSERT INTO recent_activities (id, type, message, item_name, timestamp, icon) VALUES (?, ?, ?, ?, ?, ?)',
        [id, type, message, itemName, timestamp, icon],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                id: this.lastID,
                type,
                message,
                itemName,
                timestamp,
                icon
            });
        }
    );
});

// 번호 재정렬
app.post('/api/reindex/:category', (req, res) => {
    const { category } = req.params;
    const config = CATEGORIES[category];
    
    if (!config) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    db.all(`SELECT id FROM ${config.table} ORDER BY no ASC`, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        db.serialize(() => {
            const stmt = db.prepare(`UPDATE ${config.table} SET no = ? WHERE id = ?`);
            
            rows.forEach((row, index) => {
                stmt.run([index + 1, row.id]);
            });
            
            stmt.finalize((err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: 'Reindexing completed' });
            });
        });
    });
});

// 다음 번호 조회
app.get('/api/next-no/:category', (req, res) => {
    const { category } = req.params;
    const config = CATEGORIES[category];
    
    if (!config) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    
    db.get(`SELECT MAX(no) as maxNo FROM ${config.table}`, (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
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
    db.close((err) => {
        if (err) {
            console.error('데이터베이스 닫기 오류:', err.message);
        } else {
            console.log('데이터베이스 연결이 닫혔습니다.');
        }
        process.exit(0);
    });
});